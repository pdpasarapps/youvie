import { NextRequest, NextResponse } from "next/server";
import { AwsClient } from "aws4fetch";
import { createClient } from "@supabase/supabase-js";

const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSizes = { avatar: 5 * 1024 * 1024, banner: 10 * 1024 * 1024 } as const;

export async function POST(request: NextRequest) {
  try {
    const accountId = process.env.R2_ACCOUNT_ID;
    const bucketName = process.env.R2_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) {
      return NextResponse.json({ error: "R2 environment variables are missing" }, { status: 500 });
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Supabase environment variables are missing" }, { status: 500 });
    }

    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: userData, error: userError } = await supabase.auth.getUser(authorization.slice("Bearer ".length));
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileError) {
      console.error("Unable to verify profile avatar upload access:", profileError);
      return NextResponse.json({ error: "Could not verify creator profile" }, { status: 500 });
    }
    if (profile?.role !== "creator" && profile?.role !== "admin") {
      return NextResponse.json({ error: "Creator access required" }, { status: 403 });
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxImageSizes.banner + 64 * 1024) {
      return NextResponse.json({ error: "Profile image upload exceeds the size limit" }, { status: 413 });
    }
    const formData = await request.formData();
    const imageType = formData.get("imageType");
    if (imageType !== "avatar" && imageType !== "banner") {
      return NextResponse.json({ error: "Choose an avatar or banner image" }, { status: 400 });
    }
    const maxImageSize = maxImageSizes[imageType];
    const image = formData.get(imageType);
    if (!(image instanceof File) || !allowedContentTypes.has(image.type) || image.size === 0 || image.size > maxImageSize) {
      return NextResponse.json({ error: `Choose a JPG, PNG, or WebP image up to ${imageType === "banner" ? "10" : "5"} MB` }, { status: 400 });
    }

    const objectKey = `profiles/${userData.user.id}/${imageType}/${crypto.randomUUID()}`;
    const objectUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${objectKey}`;
    const signer = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
    const signedRequest = await signer.sign(objectUrl, {
      method: "PUT",
      headers: { "Content-Type": image.type },
      aws: { signQuery: true },
    });
    const uploadResponse = await fetch(signedRequest.url, {
      method: "PUT",
      headers: signedRequest.headers,
      body: await image.arrayBuffer(),
    });
    if (!uploadResponse.ok) {
      console.error(`R2 rejected profile ${imageType} upload:`, uploadResponse.status, uploadResponse.statusText);
      return NextResponse.json({ error: `Gambar ${imageType} gagal diunggah ke penyimpanan` }, { status: 502 });
    }

    return NextResponse.json({ objectKey });
  } catch (error) {
    console.error("Profile avatar upload failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not upload profile avatar" }, { status: 500 });
  }
}
