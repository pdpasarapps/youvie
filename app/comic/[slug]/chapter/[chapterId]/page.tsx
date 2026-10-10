import { notFound } from "next/navigation";
import ChapterReaderPage, { type ChapterReaderSeed } from "./reader-client";
import { createPublicSupabaseClient } from "@/lib/seo";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ slug: string; chapterId: string }>;
}) {
  const { slug, chapterId } = await params;
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    throw new Error("Unable to verify published episode: Supabase public environment variables are missing.");
  }

  let { data, error } = await supabase
    .from("chapters")
    .select("id, title, chapter_number, comic_id, comics!inner(title, slug, status, target_device)")
    .eq("id", chapterId)
    .eq("comics.slug", slug)
    .eq("comics.status", "published")
    .not("published_at", "is", null)
    .maybeSingle();
  if (error?.code === "42703") {
    const legacy = await supabase
      .from("chapters")
      .select("id, title, chapter_number, comic_id, comics!inner(title, slug, status)")
      .eq("id", chapterId)
      .eq("comics.slug", slug)
      .eq("comics.status", "published")
      .not("published_at", "is", null)
      .maybeSingle();
    data = legacy.data as typeof data;
    error = legacy.error;
  }
  if (error) {
    console.error("Unable to verify published episode:", { slug, chapterId, error });
    throw error;
  }
  if (!data) notFound();

  const linkedComic = Array.isArray(data.comics) ? data.comics[0] : data.comics;
  if (!linkedComic) notFound();

  const seed: ChapterReaderSeed = {
    chapter: {
      id: data.id,
      title: data.title,
      chapter_number: data.chapter_number,
      comic_id: data.comic_id,
    },
    comic: {
      id: data.comic_id,
      title: linkedComic.title,
      slug: linkedComic.slug,
      target_device: linkedComic.target_device || "all",
    },
  };
  return <ChapterReaderPage key={chapterId} seed={seed} />;
}
