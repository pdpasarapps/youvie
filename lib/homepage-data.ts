import { createPublicSupabaseClient } from "@/lib/seo";
import { getDramaCoverUrl } from "@/lib/drama-cover-url";

type CatalogEpisodeRow = {
  id: string;
  episode_number: number;
  title: string;
  synopsis: string;
  video_path: string | null;
  thumbnail_path: string | null;
  created_at: string;
};

type CatalogSeasonRow = {
  season_number: number;
  drama_episodes: CatalogEpisodeRow[];
};

type CatalogSeriesRow = {
  id: string;
  title: string;
  synopsis: string;
  genre: string;
  is_featured: boolean;
  cover_image_path: string | null;
  hero_image_path: string | null;
  card_image_path: string | null;
  drama_seasons: CatalogSeasonRow[];
};

export type DramaEpisodeCard = {
  id: string;
  seriesId: string;
  seriesTitle: string;
  isFeatured: boolean;
  heroUrl: string | null;
  cardUrl: string | null;
  genre: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  synopsis: string;
  coverUrl: string | null;
  thumbnailUrl: string | null;
};

export type DramaCatalog = {
  episodes: DramaEpisodeCard[];
  genres: string[];
  promos: DramaHomepagePromo[];
  popularEpisodeIds: string[] | null;
  catalogState: "ready" | "empty" | "error";
};

export type DramaHomepagePromo = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  image_url: string;
  image_url_tablet: string | null;
  image_url_mobile: string | null;
  cta_label: string;
  destination_url: string;
};

export async function getHomepageCatalog(): Promise<DramaCatalog> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    console.error("Unable to load published drama: Supabase public environment variables are missing.");
    return { episodes: [], genres: [], promos: [], popularEpisodeIds: null, catalogState: "error" };
  }

  const [promoResult, catalogResult, popularResult] = await Promise.all([
    supabase
      .from("drama_homepage_promos")
      .select("id, eyebrow, title, description, image_url, image_url_tablet, image_url_mobile, cta_label, destination_url")
      .order("sort_order")
      .order("created_at", { ascending: false })
      .returns<DramaHomepagePromo[]>(),
    supabase
      .from("drama_series")
      .select("id, title, synopsis, genre, is_featured, cover_image_path, hero_image_path, card_image_path, drama_seasons(season_number, drama_episodes(id, episode_number, title, synopsis, video_path, thumbnail_path, created_at))")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .returns<CatalogSeriesRow[]>(),
    supabase
      .rpc("public_drama_popular_episodes", {})
      .returns<{ episode_id: string }[]>(),
  ]);

  const promos = promoResult.error ? [] : promoResult.data ?? [];
  if (promoResult.error) {
    console.error("Unable to load active drama homepage promos:", promoResult.error);
  }
  const popularEpisodeIds = popularResult.error
    ? null
    : Array.isArray(popularResult.data)
      ? popularResult.data.map((row: { episode_id: string }) => row.episode_id)
      : [];
  if (popularResult.error) {
    const { code, message, details, hint } = popularResult.error;
    if (code === "PGRST202") {
      console.warn("Popular drama is not enabled. Run supabase/drama-analytics.sql after supabase/video-catalog.sql.", {
        code,
        message,
        details,
        hint,
      });
    } else {
      console.error("Unable to load popular published drama episodes:", { code, message, details, hint });
    }
  }
  let rows: CatalogSeriesRow[] | null = catalogResult.data;
  let catalogError = catalogResult.error;

  if (catalogError?.code === "42703") {
    console.warn("Optional drama artwork is not enabled. Run supabase/drama-artwork.sql to use custom hero and card images.");
    const compatibleCatalogResult = await supabase
      .from("drama_series")
      .select("id, title, synopsis, genre, is_featured, cover_image_path, drama_seasons(season_number, drama_episodes(id, episode_number, title, synopsis, video_path, thumbnail_path, created_at))")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .returns<Omit<CatalogSeriesRow, "hero_image_path" | "card_image_path">[]>();
    if (compatibleCatalogResult.error?.code === "42703") {
      console.warn("Featured drama is not enabled. Run supabase/drama-featured.sql to configure homepage hero selections.");
      const legacyCatalogResult = await supabase
        .from("drama_series")
        .select("id, title, synopsis, genre, cover_image_path, drama_seasons(season_number, drama_episodes(id, episode_number, title, synopsis, video_path, thumbnail_path, created_at))")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .returns<Omit<CatalogSeriesRow, "is_featured" | "hero_image_path" | "card_image_path">[]>();
      rows = legacyCatalogResult.data?.map((series) => ({
        ...series,
        is_featured: false,
        hero_image_path: null,
        card_image_path: null,
      })) ?? null;
      catalogError = legacyCatalogResult.error;
    } else {
      rows = compatibleCatalogResult.data?.map((series) => ({
        ...series,
        hero_image_path: null,
        card_image_path: null,
      })) ?? null;
      catalogError = compatibleCatalogResult.error;
    }
  }

  if (catalogError) {
    console.error("Unable to load published drama catalog:", catalogError);
    return { episodes: [], genres: [], promos, popularEpisodeIds, catalogState: "error" };
  }

  const catalogRows = rows ?? [];
  const genres = [...new Set(catalogRows.map((series) => series.genre.trim()).filter(Boolean))];
  const candidateEpisodes = catalogRows.flatMap((series) =>
    (series.drama_seasons ?? []).flatMap((season) =>
      season.drama_episodes
        .filter((episode): episode is CatalogEpisodeRow & { video_path: string } => episode.video_path !== null)
        .map((episode) => ({
          series,
          seasonNumber: season.season_number,
          episode,
        })),
    ),
  );

  if (!candidateEpisodes.length) {
    return { episodes: [], genres, promos, popularEpisodeIds, catalogState: "empty" };
  }
  candidateEpisodes.sort((left, right) => right.episode.created_at.localeCompare(left.episode.created_at));

  const mediaPaths = [...new Set(candidateEpisodes.flatMap(({ series, episode }) => [
    ...(episode.thumbnail_path ? [episode.thumbnail_path] : []),
    ...(series.hero_image_path ? [series.hero_image_path] : []),
    ...(series.card_image_path ? [series.card_image_path] : []),
  ]))];
  const urlByPath = new Map<string, string>();
  if (mediaPaths.length > 0) {
    const { data: signedUrls, error: signingError } = await supabase.storage
      .from("drama-media")
      .createSignedUrls(mediaPaths, 3600);

    if (signingError) {
      console.error("Unable to create published drama artwork URLs:", {
        message: signingError.message,
        name: signingError.name,
      });
      return { episodes: [], genres, promos, popularEpisodeIds, catalogState: "error" };
    }
    for (const item of signedUrls ?? []) {
      if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
    }
  }

  const episodes: DramaEpisodeCard[] = candidateEpisodes.map(({ series, seasonNumber, episode }) => ({
    id: episode.id,
    seriesId: series.id,
    seriesTitle: series.title,
    isFeatured: series.is_featured,
    heroUrl: series.hero_image_path ? urlByPath.get(series.hero_image_path) ?? null : null,
    cardUrl: series.card_image_path ? urlByPath.get(series.card_image_path) ?? null : null,
    genre: series.genre || "",
    seasonNumber,
    episodeNumber: episode.episode_number,
    title: episode.title,
    synopsis: episode.synopsis || "",
    coverUrl: getDramaCoverUrl(series.cover_image_path),
    thumbnailUrl: episode.thumbnail_path ? urlByPath.get(episode.thumbnail_path) ?? null : null,
  }));

  return { episodes, genres, promos, popularEpisodeIds, catalogState: episodes.length ? "ready" : "empty" };
}
