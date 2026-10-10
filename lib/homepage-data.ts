import { createPublicSupabaseClient } from "@/lib/seo";
import type { ComicTargetDevice } from "@/lib/comic-target-device";

export type HomepageComic = {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  contributor: string;
  genre: string;
  target_device: ComicTargetDevice;
  coverUrl: string | null;
  creator: string;
  creatorHandle: string | null;
  creatorProfilePublic: boolean;
  latestChapter: { id: string; title: string; chapter_number: number; published_at: string | null } | null;
  chapterCount: number;
  engagement: { views: number; likes: number; shares: number } | null;
};

export type ContinueReading = {
  comic: HomepageComic;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  lastPage: number;
  pageCount: number;
};

export type HomepageCatalog = {
  comics: HomepageComic[];
  catalogState: "ready" | "empty" | "error";
  episodeLoadError: boolean;
};

function parseComicEngagementRows(data: unknown) {
  if (!Array.isArray(data)) return null;
  const counts = new Map<string, NonNullable<HomepageComic["engagement"]>>();
  for (const row of data) {
    if (!row || typeof row !== "object" || !("comic_id" in row)) continue;
    const comicId = row.comic_id;
    const views = Number(row.views);
    const likes = Number(row.likes);
    const shares = Number(row.shares);
    if (typeof comicId !== "string" || ![views, likes, shares].every((count) => Number.isSafeInteger(count) && count >= 0)) {
      return null;
    }
    counts.set(comicId, { views, likes, shares });
  }
  return counts;
}

export async function getHomepageCatalog(): Promise<HomepageCatalog> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    console.error("Unable to load published comics: Supabase public environment variables are missing.");
    return { comics: [], catalogState: "error", episodeLoadError: false };
  }

  let { data, error } = await supabase
    .from("comics")
    .select("id, title, slug, synopsis, genre, contributor, cover_key, target_device, profiles!comics_creator_id_fkey(id, public_handle, display_name, public_profile)")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error?.code === "42703") {
    const fallbackQuery = await supabase
      .from("comics")
      .select("id, title, slug, synopsis, genre, contributor, cover_key, target_device, profiles!comics_creator_id_fkey(display_name)")
      .eq("status", "published")
      .order("created_at", { ascending: false });
    data = fallbackQuery.data as typeof data;
    error = fallbackQuery.error;
    if (error?.code === "42703") {
      const legacyQuery = await supabase
        .from("comics")
        .select("id, title, slug, synopsis, genre, contributor, cover_key, profiles!comics_creator_id_fkey(display_name)")
        .eq("status", "published")
        .order("created_at", { ascending: false });
      data = legacyQuery.data as typeof data;
      error = legacyQuery.error;
    }
  }

  if (error) {
    console.error("Unable to load published comics:", error);
    return { comics: [], catalogState: "error", episodeLoadError: false };
  }

  const rows = data ?? [];
  const comicIds = rows.map((comic) => comic.id);
  const { data: chapterRows, error: chapterError } = comicIds.length
    ? await supabase
      .from("chapters")
      .select("id, comic_id, title, chapter_number, published_at")
      .in("comic_id", comicIds)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
    : { data: [], error: null };
  if (chapterError) console.error("Unable to load published comic episodes:", chapterError);

  const chaptersByComic = new Map<string, NonNullable<HomepageComic["latestChapter"]>[]>();
  for (const chapter of chapterRows ?? []) {
    const comicChapters = chaptersByComic.get(chapter.comic_id) ?? [];
    comicChapters.push({
      id: chapter.id,
      title: chapter.title,
      chapter_number: chapter.chapter_number,
      published_at: chapter.published_at,
    });
    chaptersByComic.set(chapter.comic_id, comicChapters);
  }

  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  const comics: HomepageComic[] = rows.map((comic) => {
    const profiles = comic.profiles as { id?: string; public_handle?: string | null; display_name?: string; public_profile?: boolean } | { id?: string; public_handle?: string | null; display_name?: string; public_profile?: boolean }[] | null;
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    const chapters = chaptersByComic.get(comic.id) ?? [];
    return {
      id: comic.id,
      title: comic.title,
      slug: comic.slug,
      synopsis: comic.synopsis || "",
      contributor: comic.contributor?.trim() || "",
      genre: comic.genre,
      target_device: comic.target_device || "all",
      creator: profile?.display_name || "Kreator independen",
      creatorHandle: profile?.public_profile ? profile.public_handle || null : null,
      creatorProfilePublic: Boolean(profile?.public_profile),
      coverUrl: comic.cover_key && publicUrl ? `${publicUrl.replace(/\/$/, "")}/${comic.cover_key}` : null,
      latestChapter: chapters[0] ?? null,
      chapterCount: chapters.length,
      engagement: null,
    };
  });

  if (comicIds.length) {
    const { data: engagementRows, error: engagementError } = await supabase.rpc("public_comics_engagement", {
      p_comic_ids: comicIds,
    });
    if (engagementError) {
      if (engagementError.code === "PGRST202") {
        console.warn("Comic card engagement counts are unavailable. Run supabase/comic-engagement-counts.sql and refresh the Supabase API schema cache.");
      } else {
        console.error("Unable to load comic card engagement counts:", {
          message: engagementError.message,
          code: engagementError.code,
          details: engagementError.details,
          hint: engagementError.hint,
        });
      }
    } else {
      const engagementByComic = parseComicEngagementRows(engagementRows);
      if (!engagementByComic) {
        console.error("Comic card engagement counts returned an invalid response.", engagementRows);
      } else {
        for (const comic of comics) {
          comic.engagement = engagementByComic.get(comic.id) ?? { views: 0, likes: 0, shares: 0 };
        }
      }
    }
  }

  return {
    comics,
    catalogState: comics.length ? "ready" : "empty",
    episodeLoadError: Boolean(chapterError),
  };
}
