import { createPublicSupabaseClient } from "@/lib/seo";
import { getDramaCoverUrl } from "@/lib/drama-cover-url";

const MEDIA_BUCKET = "drama-media";

type EpisodeRow = {
  id: string;
  episode_number: number;
  title: string;
  synopsis: string;
  duration_seconds: number | null;
  video_path: string | null;
  thumbnail_path: string | null;
  drama_seasons: {
    id: string;
    season_number: number;
    series_id: string;
  } | Array<{
    id: string;
    season_number: number;
    series_id: string;
  }>;
};

type SeriesRow = {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  genre: string;
  cover_image_path: string | null;
  detail_image_path: string | null;
  drama_seasons: {
    season_number: number;
    drama_episodes: {
      id: string;
      episode_number: number;
      title: string;
      synopsis: string;
      duration_seconds: number | null;
      video_path: string | null;
      thumbnail_path: string | null;
      status: "draft" | "published" | "archived";
    }[] | null;
  }[] | null;
};

type RecommendationSeriesRow = {
  id: string;
  title: string;
  genre: string;
  cover_image_path: string | null;
  card_image_path: string | null;
  drama_seasons: {
    season_number: number;
    drama_episodes: {
      id: string;
      episode_number: number;
      video_path: string | null;
      status: "draft" | "published" | "archived";
    }[] | null;
  }[] | null;
};

export type DramaReaderEpisode = {
  id: string;
  episodeNumber: number;
  title: string;
  synopsis: string;
  durationSeconds: number | null;
  seasonNumber: number;
  videoUrl: string;
  videoType: string;
  thumbnailUrl: string | null;
};

export type DramaReaderRecommendation = {
  id: string;
  title: string;
  genre: string;
  coverUrl: string | null;
  episodeId: string;
};

export type DramaReaderSeed = {
  seriesId: string;
  seriesSlug: string;
  seriesTitle: string;
  genre: string;
  synopsis: string;
  coverUrl: string | null;
  detailUrl: string | null;
  episodes: DramaReaderEpisode[];
  recommendations: DramaReaderRecommendation[];
  currentEpisodeId: string;
};

function firstRelation<T>(relation: T | T[]): T {
  return Array.isArray(relation) ? relation[0] : relation;
}

function videoMimeType(path: string) {
  return path.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4";
}

export async function getDramaReaderSeed(
  episodeId: string,
  options: { includePlayerMedia?: boolean } = {},
): Promise<DramaReaderSeed | null> {
  const includePlayerMedia = options.includePlayerMedia ?? true;
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase public environment variables are required to load the drama reader.");
  }

  const { data: currentEpisode, error: episodeError } = await supabase
    .from("drama_episodes")
    .select("id, episode_number, title, synopsis, duration_seconds, video_path, thumbnail_path, drama_seasons!inner(id, season_number, series_id)")
    .eq("id", episodeId)
    .eq("status", "published")
    .maybeSingle()
    .returns<EpisodeRow | null>();

  if (episodeError) {
    console.error("Unable to load published drama reader episode:", {
      code: episodeError.code,
      message: episodeError.message,
      details: episodeError.details,
      hint: episodeError.hint,
    });
    throw new Error("Unable to load published drama episode.");
  }
  if (!currentEpisode) return null;

  const season = firstRelation(currentEpisode.drama_seasons);
  let { data: series, error: seriesError } = await supabase
    .from("drama_series")
    .select("id, slug, title, synopsis, genre, cover_image_path, detail_image_path, drama_seasons(season_number, drama_episodes(id, episode_number, title, synopsis, duration_seconds, video_path, thumbnail_path, status))")
    .eq("id", season.series_id)
    .eq("status", "published")
    .maybeSingle()
    .returns<SeriesRow | null>();

  if (seriesError?.code === "42703") {
    console.warn("Optional drama detail artwork is not enabled. Run supabase/drama-artwork.sql to configure it.");
    const legacySeriesResult = await supabase
      .from("drama_series")
      .select("id, slug, title, synopsis, genre, cover_image_path, drama_seasons(season_number, drama_episodes(id, episode_number, title, synopsis, duration_seconds, video_path, thumbnail_path, status))")
      .eq("id", season.series_id)
      .eq("status", "published")
      .maybeSingle()
      .returns<Omit<SeriesRow, "detail_image_path"> | null>();
    series = legacySeriesResult.data
      ? { ...legacySeriesResult.data, detail_image_path: null }
      : null;
    seriesError = legacySeriesResult.error;
  }

  if (seriesError) {
    console.error("Unable to load published drama reader series:", {
      code: seriesError.code,
      message: seriesError.message,
      details: seriesError.details,
      hint: seriesError.hint,
    });
    throw new Error("Unable to load published drama series.");
  }
  if (!series || !currentEpisode.video_path) return null;

  const episodes = (series.drama_seasons ?? [])
    .flatMap((item) => (item.drama_episodes ?? [])
      .filter((episode): episode is typeof episode & { video_path: string } =>
        episode.status === "published" && episode.video_path !== null,
      )
      .map((episode) => ({ ...episode, seasonNumber: item.season_number })))
    .sort((left, right) => left.seasonNumber - right.seasonNumber || left.episode_number - right.episode_number);
  if (!episodes.some((episode) => episode.id === currentEpisode.id)) return null;

  let recommendations: DramaReaderRecommendation[] = [];
  let relatedWithEpisodes: { related: RecommendationSeriesRow; episodeId: string }[] = [];
  if (!includePlayerMedia) {
    let { data: relatedSeries, error: relatedSeriesError } = await supabase
      .from("drama_series")
      .select("id, title, genre, cover_image_path, card_image_path, drama_seasons(season_number, drama_episodes(id, episode_number, video_path, status))")
      .eq("status", "published")
      .neq("id", series.id)
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<RecommendationSeriesRow[]>();
    if (relatedSeriesError?.code === "42703") {
      const legacyRelatedResult = await supabase
        .from("drama_series")
        .select("id, title, genre, cover_image_path, drama_seasons(season_number, drama_episodes(id, episode_number, video_path, status))")
        .eq("status", "published")
        .neq("id", series.id)
        .order("created_at", { ascending: false })
        .limit(8)
        .returns<Omit<RecommendationSeriesRow, "card_image_path">[]>();
      relatedSeries = legacyRelatedResult.data?.map((related) => ({ ...related, card_image_path: null })) ?? null;
      relatedSeriesError = legacyRelatedResult.error;
    }
    if (relatedSeriesError) {
      console.error("Unable to load recommended published drama:", {
        code: relatedSeriesError.code,
        message: relatedSeriesError.message,
        details: relatedSeriesError.details,
        hint: relatedSeriesError.hint,
      });
      throw new Error("Unable to load recommended drama.");
    }

    relatedWithEpisodes = (relatedSeries ?? []).flatMap((related) => {
      const firstEpisode = (related.drama_seasons ?? [])
        .flatMap((relatedSeason) => (relatedSeason.drama_episodes ?? [])
          .filter((episode) => episode.status === "published" && episode.video_path !== null)
          .map((episode) => ({
            ...episode,
            seasonNumber: relatedSeason.season_number,
          })))
        .sort((left, right) =>
          left.seasonNumber - right.seasonNumber || left.episode_number - right.episode_number,
        )[0];
      return firstEpisode ? [{ related, episodeId: firstEpisode.id }] : [];
    });
  }

  const paths = [...new Set([
    ...episodes.flatMap((episode) => episode.thumbnail_path ? [episode.thumbnail_path] : []),
    ...(series.detail_image_path ? [series.detail_image_path] : []),
    ...relatedWithEpisodes.flatMap(({ related }) => related.card_image_path ? [related.card_image_path] : []),
    ...(includePlayerMedia ? [currentEpisode.video_path] : []),
  ])];
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    const { data, error: signingError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(paths, 3600);
    if (signingError) {
      console.error("Unable to sign drama reader media:", {
        message: signingError.message,
        name: signingError.name,
      });
      throw new Error("Unable to load drama reader media.");
    }
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
    }
  }
  const videoUrl = urlByPath.get(currentEpisode.video_path);
  if (includePlayerMedia && !videoUrl) {
    console.error("Published drama reader episode is missing a signed video URL.", { episodeId });
    throw new Error("Published drama video could not be loaded.");
  }

  recommendations = relatedWithEpisodes.map(({ related, episodeId: relatedEpisodeId }) => ({
    id: related.id,
    title: related.title,
    genre: related.genre || "",
    coverUrl: (related.card_image_path ? urlByPath.get(related.card_image_path) : null)
      || getDramaCoverUrl(related.cover_image_path),
    episodeId: relatedEpisodeId,
  }));

  return {
    seriesId: series.id,
    seriesSlug: series.slug,
    seriesTitle: series.title,
    genre: series.genre || "",
    synopsis: series.synopsis || "",
    coverUrl: getDramaCoverUrl(series.cover_image_path),
    detailUrl: series.detail_image_path ? urlByPath.get(series.detail_image_path) ?? null : null,
    recommendations,
    episodes: episodes.map((episode) => ({
      id: episode.id,
      episodeNumber: episode.episode_number,
      title: episode.title,
      synopsis: episode.synopsis || "",
      durationSeconds: episode.duration_seconds,
      seasonNumber: episode.seasonNumber,
      videoUrl: includePlayerMedia && episode.id === currentEpisode.id ? videoUrl! : "",
      videoType: includePlayerMedia && episode.id === currentEpisode.id ? videoMimeType(episode.video_path) : "",
      thumbnailUrl: episode.thumbnail_path ? urlByPath.get(episode.thumbnail_path) ?? null : null,
    })),
    currentEpisodeId: currentEpisode.id,
  };
}
