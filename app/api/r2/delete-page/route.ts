import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(request: NextRequest) {
  try {
    const requiredEnv = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "R2_ACCOUNT_ID",
      "R2_BUCKET_NAME",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
    ] as const;
    const missing = requiredEnv.filter((name) => !process.env[name]);
    if (missing.length) {
      return NextResponse.json({ error: "Required environment variables are missing", missing }, { status: 500 });
    }

    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authorization.slice("Bearer ".length);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileError) {
      return NextResponse.json({ error: "Could not read creator profile" }, { status: 500 });
    }
    if (profile?.role !== "creator" && profile?.role !== "admin") {
      return NextResponse.json({ error: "Creator access required" }, { status: 403 });
    }

    const body = await request.json() as { comicId?: string; chapterId?: string; pageId?: string };
    if (!body.comicId || !body.chapterId || !body.pageId) {
      return NextResponse.json({ error: "Comic, chapter, and page are required" }, { status: 400 });
    }

    const { data: comic } = await supabase
      .from("comics")
      .select("id")
      .eq("id", body.comicId)
      .eq("creator_id", userData.user.id)
      .maybeSingle();
    if (!comic) {
      return NextResponse.json({ error: "Comic not found" }, { status: 404 });
    }

    const { data: chapter } = await supabase
      .from("chapters")
      .select("id")
      .eq("id", body.chapterId)
      .eq("comic_id", comic.id)
      .maybeSingle();
    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }

    const { data: page } = await supabase
      .from("pages")
      .select("id, object_key")
      .eq("id", body.pageId)
      .eq("chapter_id", chapter.id)
      .maybeSingle();
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const objectPrefix = `comics/${comic.id}/chapters/${chapter.id}/`;
    if (!page.object_key.startsWith(objectPrefix)) {
      return NextResponse.json({ error: "Page contains an invalid storage key" }, { status: 500 });
    }

    const { data: deletedPage, error: deleteError } = await supabase
      .from("pages")
      .delete()
      .eq("id", page.id)
      .eq("chapter_id", chapter.id)
      .select("id")
      .maybeSingle();
    if (deleteError || !deletedPage) {
      return NextResponse.json({ error: deleteError?.message || "Page could not be deleted" }, { status: 500 });
    }

    try {
      const storage = new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });
      await storage.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: page.object_key }));
      return NextResponse.json({ deleted: true, storageCleanupPending: false });
    } catch (error) {
      console.error("R2 page cleanup error", error);
      return NextResponse.json({ deleted: true, storageCleanupPending: true });
    }
  } catch (error) {
    console.error("Page delete error", error);
    return NextResponse.json({ error: "Could not delete page" }, { status: 500 });
  }
}