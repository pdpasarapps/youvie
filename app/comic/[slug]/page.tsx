import { notFound } from "next/navigation";
import ComicDetailPage, { type Chapter, type Comic, type ComicDetailPageProps } from "./comic-detail-client";
import { getComicGenreLabel } from "@/lib/comic-genres";
import { createPublicSupabaseClient, siteUrl } from "@/lib/seo";

export default async function ComicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    throw new Error("Unable to verify published comic: Supabase public environment variables are missing.");
  }

  let { data, error } = await supabase
    .from("comics")
    .select("id, title, slug, synopsis, contributor, genre, cover_key, target_device, profiles!comics_creator_id_fkey(id, public_handle, display_name, public_profile)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error?.code === "42703") {
    console.warn("Creator public profiles are not configured. Loading comic profile fields without public-profile links.");
    let legacy = await supabase
      .from("comics")
      .select("id, title, slug, synopsis, contributor, genre, cover_key, target_device, profiles!comics_creator_id_fkey(display_name)")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    data = legacy.data as typeof data;
    error = legacy.error;
    if (error?.code === "42703") {
      legacy = await supabase
        .from("comics")
        .select("id, title, slug, synopsis, contributor, genre, cover_key, profiles!comics_creator_id_fkey(display_name)")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      data = legacy.data as typeof data;
      error = legacy.error;
    }
  }
  if (error) {
    console.error("Unable to verify published comic:", { slug, error });
    throw error;
  }
  if (!data) notFound();

  const comic = data as Omit<Comic, "profiles"> & { profiles: Comic["profiles"] };
  const { data: chapterData, error: chapterError } = await supabase
    .from("chapters")
    .select("id, title, chapter_number, published_at")
    .eq("comic_id", comic.id)
    .not("published_at", "is", null)
    .order("chapter_number", { ascending: true });
  if (chapterError) {
    console.error("Unable to load published episodes for comic page:", { slug, error: chapterError });
  }

  const initialComic: Comic = {
    ...comic,
    target_device: comic.target_device ?? "all",
    synopsis: comic.synopsis ?? "",
    contributor: comic.contributor ?? "",
    contributors: comic.contributors ?? null,
    production_technique: comic.production_technique ?? "traditional_drawing",
    story_status: comic.story_status ?? "ongoing",
    target_audience: comic.target_audience ?? "all_ages",
    language: comic.language ?? "id",
    origin_type: comic.origin_type ?? "original",
    source_info: comic.source_info ?? "",
  };
  const initialChapters = (chapterData ?? []) as Chapter[];
  const props: ComicDetailPageProps = { initialComic, initialChapters };
  const canonicalUrl = new URL(`/comic/${encodeURIComponent(slug)}`, siteUrl).toString();
  const profile = Array.isArray(initialComic.profiles) ? initialComic.profiles[0] : initialComic.profiles;
  const creatorName = initialComic.contributor.trim() || profile?.display_name;
  const description = initialComic.synopsis.replace(/\*\*/g, "").replace(/👉/g, "").replace(/\s+/g, " ").trim();
  const imageBaseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL;
  let coverUrl: string | undefined;
  if (initialComic.cover_key && imageBaseUrl) {
    const url = new URL(imageBaseUrl);
    const coverKey = initialComic.cover_key;
    url.pathname = `${url.pathname.replace(/\/?$/, "/")}${coverKey.split("/").map(encodeURIComponent).join("/")}`;
    coverUrl = url.toString();
  }
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CreativeWorkSeries",
        "@id": `${canonicalUrl}#comic`,
        name: initialComic.title,
        url: canonicalUrl,
        inLanguage: "id-ID",
        genre: getComicGenreLabel(initialComic.genre),
        ...(description ? { description } : {}),
        ...(creatorName ? { author: { "@type": "Person", name: creatorName } } : {}),
        ...(coverUrl ? { image: coverUrl } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Beranda", item: siteUrl.toString() },
          { "@type": "ListItem", position: 2, name: initialComic.title, item: canonicalUrl },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <ComicDetailPage key={slug} {...props} />
    </>
  );
}
