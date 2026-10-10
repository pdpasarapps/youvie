import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getComicSharePreviewKey } from "@/lib/comic-share-preview";
import { getPlatformSettings, matchesImageContentType } from "@/lib/platform-settings";

const coverKeyPattern = /^comics\/[0-9a-f-]{36}\/cover\/[a-zA-Z0-9._-]+$/i;

async function authorize(request: NextRequest, comicId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return { response: NextResponse.json({ error: "Supabase environment variables are missing" }, { status: 500 }) };
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(authorization.slice("Bearer ".length));
  if (userError || !userData.user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) {
    return { response: NextResponse.json({ error: "Could not read user profile" }, { status: 500 }) };
  }
  if (profile?.role !== "creator" && profile?.role !== "admin") {
    return { response: NextResponse.json({ error: "Creator access required" }, { status: 403 }) };
  }

  const { data: comic, error: comicError } = await supabase
    .from("comics")
    .select("id, creator_id")
    .eq("id", comicId)
    .maybeSingle();
  if (comicError) {
    return { response: NextResponse.json({ error: "Could not verify comic ownership" }, { status: 500 }) };
  }
  if (!comic || (profile.role !== "admin" && comic.creator_id !== userData.user.id)) {
    return { response: NextResponse.json({ error: "Comic not found" }, { status: 404 }) };
  }

  return { comic };
}

function createStorageClient() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const missing = ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
      .filter((name) => !process.env[name]);
    if (missing.length) {
      return NextResponse.json({ error: "R2 environment variables are missing", missing }, { status: 500 });
    }

    const { settings, error: settingsError } = await getPlatformSettings();
    if (settingsError) return NextResponse.json({ error: "Platform upload limits are unavailable." }, { status: 503 });
    const contentLength = request.headers.get("content-length");
    if (!contentLength) return NextResponse.json({ error: "Content-Length is required for image uploads." }, { status: 411 });
    const declaredLength = Number(contentLength);
    if (!Number.isFinite(declaredLength) || declaredLength <= 0) return NextResponse.json({ error: "Invalid preview upload size." }, { status: 400 });
    const maximumBytes = settings.max_upload_size_mb * 1024 * 1024;
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes + 64 * 1024) {
      return NextResponse.json({ error: `Generated preview exceeds the ${settings.max_upload_size_mb} MB image limit.` }, { status: 413 });
    }
    const form = await request.formData();
    const comicId = form.get("comicId");
    const coverKey = form.get("coverKey");
    const file = form.get("file");
    if (typeof comicId !== "string" || !/^[0-9a-f-]{36}$/i.test(comicId)
      || typeof coverKey !== "string" || !coverKeyPattern.test(coverKey)
      || !coverKey.startsWith(`comics/${comicId}/cover/`) || !(file instanceof File)) {
      return NextResponse.json({ error: "Invalid comic share preview details" }, { status: 400 });
    }
    if (file.type !== "image/jpeg" || file.size === 0 || file.size > maximumBytes) {
      return NextResponse.json({ error: `Generated preview must be a JPG no larger than ${settings.max_upload_size_mb} MB.` }, { status: 413 });
    }
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesImageContentType(file.type, fileBytes)) {
      return NextResponse.json({ error: "Preview contents are not a valid JPEG image." }, { status: 415 });
    }

    const auth = await authorize(request, comicId);
    if ("response" in auth) return auth.response;

    const objectKey = getComicSharePreviewKey(comicId, coverKey);
    const storage = new S3Client({
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: "auto",
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
    await storage.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: objectKey,
      Body: fileBytes,
      ContentType: file.type,
      ContentLength: file.size,
      CacheControl: "public, max-age=31536000, immutable",
    }));
    return NextResponse.json({ objectKey });
  } catch (error) {
    console.error("Comic share preview upload URL error:", error);
    return NextResponse.json({ error: "Could not prepare comic share preview upload" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const missing = ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
      .filter((name) => !process.env[name]);
    if (missing.length) {
      return NextResponse.json({ error: "R2 environment variables are missing", missing }, { status: 500 });
    }
    const body = await request.json() as { comicId?: string; coverKey?: string; previewKey?: string };
    if (!body.comicId || !/^[0-9a-f-]{36}$/i.test(body.comicId)
      || !body.coverKey || !coverKeyPattern.test(body.coverKey)
      || !body.coverKey.startsWith(`comics/${body.comicId}/cover/`)
      || !body.previewKey
      || body.previewKey !== getComicSharePreviewKey(body.comicId, body.coverKey)) {
      return NextResponse.json({ error: "Invalid comic share preview details" }, { status: 400 });
    }

    const auth = await authorize(request, body.comicId);
    if ("response" in auth) return auth.response;

    await createStorageClient().send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: body.previewKey,
    }));
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Comic share preview cleanup error:", error);
    return NextResponse.json({ error: "Could not delete comic share preview" }, { status: 500 });
  }
}
