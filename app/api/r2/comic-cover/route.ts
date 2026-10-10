import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

async function authorize(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return { response: NextResponse.json({ error: "Supabase environment variables are missing" }, { status: 500 }) };
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const token = authorization.slice("Bearer ".length);
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) {
    return { response: NextResponse.json({ error: "Could not read creator profile" }, { status: 500 }) };
  }
  if (profile?.role !== "creator" && profile?.role !== "admin") {
    return { response: NextResponse.json({ error: "Creator access required" }, { status: 403 }) };
  }

  return { supabase, userId: userData.user.id };
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

export async function POST() {
  return NextResponse.json(
    { error: "Direct uploads are no longer supported. Use the validated image upload endpoint." },
    { status: 410 },
  );
}

export async function DELETE(request: NextRequest) {
  try {
    const requiredEnv = ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
    const missing = requiredEnv.filter((name) => !process.env[name]);
    if (missing.length) {
      return NextResponse.json({ error: "R2 environment variables are missing", missing }, { status: 500 });
    }

    const auth = await authorize(request);
    if ("response" in auth) return auth.response;

    const body = await request.json() as { comicId?: string; objectKey?: string };
    if (!body.comicId || !body.objectKey) {
      return NextResponse.json({ error: "Comic and cover key are required" }, { status: 400 });
    }

    const { data: comic } = await auth.supabase
      .from("comics")
      .select("id, cover_key")
      .eq("id", body.comicId)
      .eq("creator_id", auth.userId)
      .maybeSingle();
    if (!comic) {
      return NextResponse.json({ error: "Comic not found" }, { status: 404 });
    }

    if (!body.objectKey.startsWith(`comics/${comic.id}/cover/`) || body.objectKey === comic.cover_key) {
      return NextResponse.json({ error: "Invalid or active cover key" }, { status: 400 });
    }

    await createStorageClient().send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: body.objectKey,
    }));
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("R2 comic cover cleanup error", error);
    return NextResponse.json({ error: "Could not delete old comic cover" }, { status: 500 });
  }
}
