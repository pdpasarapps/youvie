import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSettings, matchesImageContentType } from "@/lib/platform-settings";

export const runtime = "nodejs";

type DramaImageSources = {
  id: string;
  status: string;
  cover_image_path: string | null;
  drama_seasons: { drama_episodes: { thumbnail_path: string | null }[] | null }[] | null;
};

export async function POST(request: NextRequest) {
  try {
    const requiredEnv = [
      "R2_ACCOUNT_ID",
      "R2_BUCKET_NAME",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ];
    const missing = requiredEnv.filter((name) => !process.env[name]);
    if (missing.length) {
      return NextResponse.json({ error: "Drama share preview storage is not configured.", missing }, { status: 500 });
    }

    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: canManage, error: accessError } = await supabase.rpc("can_manage_video_catalog");
    if (accessError) {
      console.error("Could not verify drama catalog access for share preview:", accessError);
      return NextResponse.json({ error: "Could not verify drama manager access." }, { status: 500 });
    }
    if (!canManage) {
      return NextResponse.json({ error: "Drama manager access required." }, { status: 403 });
    }

    const { settings, error: settingsError } = await getPlatformSettings();
    if (settingsError) {
      return NextResponse.json({ error: "Platform image upload limits are unavailable. Try again later." }, { status: 503 });
    }
    const contentLength = request.headers.get("content-length");
    if (!contentLength) {
      return NextResponse.json({ error: "Content-Length is required for image uploads." }, { status: 411 });
    }
    const declaredLength = Number(contentLength);
    if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
      return NextResponse.json({ error: "Invalid preview upload size." }, { status: 400 });
    }
    const maximumBytes = settings.max_upload_size_mb * 1024 * 1024;
    if (declaredLength > maximumBytes + 64 * 1024) {
      return NextResponse.json({ error: `Generated preview exceeds the ${settings.max_upload_size_mb} MB image limit.` }, { status: 413 });
    }

    const form = await request.formData();
    const seriesId = form.get("seriesId");
    const sourcePath = form.get("sourcePath");
    const file = form.get("file");
    if (typeof seriesId !== "string" || !/^[0-9a-f-]{36}$/i.test(seriesId)
      || typeof sourcePath !== "string" || sourcePath.length > 1024
      || !(file instanceof File)) {
      return NextResponse.json({ error: "Invalid drama share preview details." }, { status: 400 });
    }
    if (file.type !== "image/jpeg" || file.size === 0 || file.size > maximumBytes) {
      return NextResponse.json({ error: `Generated preview must be a JPG no larger than ${settings.max_upload_size_mb} MB.` }, { status: 413 });
    }
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesImageContentType(file.type, fileBytes)) {
      return NextResponse.json({ error: "Preview contents are not a valid JPEG image." }, { status: 415 });
    }

    const { data: series, error: seriesError } = await supabase
      .from("drama_series")
      .select("id, status, cover_image_path, drama_seasons(drama_episodes(thumbnail_path))")
      .eq("id", seriesId)
      .maybeSingle()
      .returns<DramaImageSources | null>();
    if (seriesError) {
      console.error("Could not verify drama share preview source:", seriesError);
      return NextResponse.json({ error: "Could not verify the drama series." }, { status: 500 });
    }
    const validSource = series && (
      series.cover_image_path === sourcePath
      || (series.drama_seasons ?? []).some((season) =>
        (season.drama_episodes ?? []).some((episode) => episode.thumbnail_path === sourcePath),
      )
    );
    if (!series || series.status !== "published" || !validSource) {
      return NextResponse.json({ error: "The image is not an available image for this published drama." }, { status: 404 });
    }

    const objectKey = `dramas/${seriesId}/share-preview.jpg`;
    const storage = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
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
      CacheControl: "public, max-age=3600",
    }));
    return NextResponse.json({ objectKey });
  } catch (error) {
    console.error("Drama share preview upload failed:", error);
    return NextResponse.json({ error: "Could not save the drama share preview." }, { status: 500 });
  }
}
