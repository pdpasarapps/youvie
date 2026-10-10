import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSettings, matchesImageContentType } from "@/lib/platform-settings";

export const runtime = "nodejs";

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
      return NextResponse.json({ error: "Campaign image storage is not configured.", missing }, { status: 500 });
    }
    const publicBaseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL;
    if (!publicBaseUrl) {
      return NextResponse.json({ error: "R2 public URL is not configured." }, { status: 500 });
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
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileError) {
      console.error("Could not verify campaign image uploader role:", profileError);
      return NextResponse.json({ error: "Could not verify admin access." }, { status: 500 });
    }
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
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
      return NextResponse.json({ error: "Invalid image upload size." }, { status: 400 });
    }
    const maximumBytes = settings.max_upload_size_mb * 1024 * 1024;
    if (declaredLength > maximumBytes + 64 * 1024) {
      return NextResponse.json({ error: `Image must be ${settings.max_upload_size_mb} MB or smaller.` }, { status: 413 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
    }
    if (!settings.allowed_image_types.includes(file.type)) {
      return NextResponse.json({
        error: `Image format is not allowed. Allowed: ${settings.allowed_image_types.map((type) => type.replace("image/", "").toUpperCase()).join(", ")}.`,
      }, { status: 415 });
    }
    if (file.size <= 0 || file.size > maximumBytes) {
      return NextResponse.json({ error: `Campaign image must be between 1 byte and ${settings.max_upload_size_mb} MB.` }, { status: 413 });
    }

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesImageContentType(file.type, fileBytes)) {
      return NextResponse.json({ error: "Image content does not match its declared format." }, { status: 415 });
    }

    const extensionByType: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const objectKey = `ads/campaigns/${crypto.randomUUID()}.${extensionByType[file.type]}`;
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
    }));

    return NextResponse.json({
      objectKey,
      imageUrl: `${publicBaseUrl.replace(/\/$/, "")}/${objectKey}`,
    });
  } catch (error) {
    console.error("Sponsor campaign image upload failed:", error);
    return NextResponse.json({
      error: "Campaign image upload failed. Check storage configuration and try again.",
    }, { status: 500 });
  }
}
