import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSettings, matchesImageContentType } from "@/lib/platform-settings";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const requiredEnv = ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
    const missing = requiredEnv.filter((name) => !process.env[name]);
    if (missing.length) return NextResponse.json({ error: "Server storage is not configured", missing }, { status: 500 });
    const storage = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });

    const { settings, error: settingsError } = await getPlatformSettings();
    if (settingsError) return NextResponse.json({ error: "Platform limits are unavailable. Try again later." }, { status: 503 });
    const maximumBytes = settings.max_upload_size_mb * 1024 * 1024;
    const contentLength = request.headers.get("content-length");
    if (!contentLength) return NextResponse.json({ error: "Content-Length is required for image uploads." }, { status: 411 });
    const declaredLength = Number(contentLength);
    if (!Number.isFinite(declaredLength) || declaredLength <= 0) return NextResponse.json({ error: "Invalid image upload size." }, { status: 400 });
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes + 64 * 1024) {
      return NextResponse.json({ error: `Each image must be ${settings.max_upload_size_mb} MB or smaller.` }, { status: 413 });
    }

    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (profileError) return NextResponse.json({ error: "Could not read user profile" }, { status: 500 });
    if (profile?.role !== "creator" && profile?.role !== "admin") return NextResponse.json({ error: "Creator access required" }, { status: 403 });
    if (profile.role !== "admin" && !settings.feature_flags.creators) {
      return NextResponse.json({ error: "Creator uploads are temporarily disabled." }, { status: 403 });
    }

    const form = await request.formData();
    const comicId = form.get("comicId");
    const chapterId = form.get("chapterId");
    const kind = form.get("kind");
    const file = form.get("file");
    if (typeof comicId !== "string" || (kind !== "cover" && kind !== "page") || !(file instanceof File)) {
      return NextResponse.json({ error: "Invalid image upload details" }, { status: 400 });
    }
    if (kind === "page" && typeof chapterId !== "string") return NextResponse.json({ error: "Chapter is required for page uploads" }, { status: 400 });
    if (!settings.allowed_image_types.includes(file.type)) {
      return NextResponse.json({ error: `Image format is not allowed. Allowed: ${settings.allowed_image_types.map((type) => type.replace("image/", "").toUpperCase()).join(", ")}.` }, { status: 415 });
    }
    if (file.size === 0 || file.size > maximumBytes) {
      return NextResponse.json({ error: `Each image must be between 1 byte and ${settings.max_upload_size_mb} MB.` }, { status: 413 });
    }
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesImageContentType(file.type, fileBytes)) {
      return NextResponse.json({ error: "Image content does not match its declared format." }, { status: 415 });
    }

    let comicQuery = supabase.from("comics").select("id").eq("id", comicId);
    if (profile.role !== "admin") comicQuery = comicQuery.eq("creator_id", userData.user.id);
    const { data: comic, error: comicError } = await comicQuery.maybeSingle();
    if (comicError) return NextResponse.json({ error: "Could not verify comic ownership" }, { status: 500 });
    if (!comic) return NextResponse.json({ error: "Comic not found" }, { status: 404 });

    let objectPrefix = `comics/${comicId}/cover/`;
    let pageNumber: number | null = null;
    if (kind === "page") {
      const { data: chapter, error: chapterError } = await supabase.from("chapters").select("id").eq("id", chapterId).eq("comic_id", comicId).maybeSingle();
      if (chapterError) return NextResponse.json({ error: "Could not verify chapter" }, { status: 500 });
      if (!chapter) return NextResponse.json({ error: "Chapter not found for this comic" }, { status: 404 });
      const [{ count, error: countError }, { data: lastPage, error: lastPageError }] = await Promise.all([
        supabase.from("pages").select("id", { count: "exact", head: true }).eq("chapter_id", chapter.id),
        supabase.from("pages").select("page_number").eq("chapter_id", chapter.id).order("page_number", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (countError || lastPageError) return NextResponse.json({ error: "Could not check chapter page limits" }, { status: 500 });
      if ((count ?? 0) >= settings.max_pages_per_chapter) {
        return NextResponse.json({ error: `This chapter reached the ${settings.max_pages_per_chapter}-page limit.` }, { status: 409 });
      }
      pageNumber = (lastPage?.page_number ?? 0) + 1;
      objectPrefix = `comics/${comicId}/chapters/${chapter.id}/`;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-140) || "image";
    const objectKey = `${objectPrefix}${crypto.randomUUID()}-${safeName}`;
    await storage.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: objectKey,
      Body: fileBytes,
      ContentType: file.type,
      ContentLength: file.size,
    }));

    if (kind === "cover") return NextResponse.json({ objectKey });

    const { data: page, error: insertError } = await supabase
      .from("pages")
      .insert({ chapter_id: chapterId, page_number: pageNumber, object_key: objectKey })
      .select("id, chapter_id, page_number, object_key")
      .single();
    if (insertError) {
      console.error("Uploaded comic page could not be registered:", insertError);
      try {
        await storage.send(new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: objectKey,
        }));
      } catch (cleanupError) {
        console.error("Could not remove unregistered comic page from R2:", cleanupError);
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    return NextResponse.json({ objectKey, page });
  } catch (error) {
    console.error("Comic image upload failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Comic image upload failed." }, { status: 500 });
  }
}
