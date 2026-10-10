"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Heart,
  ListVideo,
  LockKeyhole,
  Maximize,
  Pause,
  Play,
  Rewind,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DramaReaderSeed } from "@/lib/drama-reader-data";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
const EPISODES_PER_PAGE = 24;

async function recordDramaEpisodeView(episodeId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) console.error("Unable to check viewer session before recording drama play:", error.message);
  const response = await fetch("/api/analytics/drama-episode-view", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(data.session?.access_token ? { Authorization: "Bearer " + data.session.access_token } : {}),
    },
    body: JSON.stringify({ episodeId }),
  });
  if (!response.ok) console.error("Unable to record drama episode play:", { status: response.status, episodeId });
}
function logSupabaseError(label: string, error: { code?: string; message?: string; details?: string | null; hint?: string | null }) {
  const details = { code: error.code, message: error.message, details: error.details, hint: error.hint };
  if (error.code === "PGRST205") console.warn(label, details);
  else console.error(label, details);
}

export default function DramaVideoReader({
  seed,
  resumeAtSeconds,
}: {
  seed: DramaReaderSeed;
  resumeAtSeconds: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const savedAtRef = useRef(0);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteAvailable, setFavoriteAvailable] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [watchedEpisodeIds, setWatchedEpisodeIds] = useState<Set<string>>(() => new Set());
  const [episodePage, setEpisodePage] = useState(() => {
    const index = seed.episodes.findIndex((episode) => episode.id === seed.currentEpisodeId);
    return Math.floor(Math.max(0, index) / EPISODES_PER_PAGE);
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const currentIndex = seed.episodes.findIndex((episode) => episode.id === seed.currentEpisodeId);
  const currentEpisode = seed.episodes[currentIndex];
  const currentEpisodeId = currentEpisode?.id;
  const previousEpisode = seed.episodes[currentIndex - 1];
  const nextEpisode = seed.episodes[currentIndex + 1];
  const episodePageCount = Math.ceil(seed.episodes.length / EPISODES_PER_PAGE);
  const visibleEpisodes = seed.episodes.slice(
    episodePage * EPISODES_PER_PAGE,
    (episodePage + 1) * EPISODES_PER_PAGE,
  );
  const formatTime = (time: number) => {
    const safeTime = Math.max(0, Math.floor(time));
    return `${Math.floor(safeTime / 60)}:${String(safeTime % 60).padStart(2, "0")}`;
  };

  useEffect(() => {
    let active = true;
    const loadViewer = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Unable to check drama viewer session:", error.message);
        return;
      }
      const user = data.session?.user;
      if (!user || !active) return;
      setUserId(user.id);
      const [favoriteResult, progressResult] = await Promise.all([
        supabase
          .from("drama_favorites")
          .select("series_id")
          .eq("user_id", user.id)
          .eq("series_id", seed.seriesId)
          .maybeSingle(),
        supabase
          .from("drama_episode_watch_progress")
          .select("episode_id, position_seconds, duration_seconds")
          .eq("user_id", user.id)
          .in("episode_id", seed.episodes.map((episode) => episode.id)),
      ]);
      const { data: favorite, error: favoriteError } = favoriteResult;
      if (favoriteError) {
        logSupabaseError("Unable to load drama favorite:", favoriteError);
        if (active) setMessage("Status favorit belum dapat dimuat.");
      } else if (active) {
        setIsFavorite(Boolean(favorite));
        setFavoriteAvailable(true);
      }
      if (progressResult.error) {
        logSupabaseError("Unable to load drama watch progress:", progressResult.error);
        if (active) setMessage("Status tontonan belum dapat dimuat.");
      } else if (active) {
        const episodeDurations = new Map(seed.episodes.map((episode) => [episode.id, episode.durationSeconds ?? 0]));
        setWatchedEpisodeIds(new Set(
          progressResult.data
            .filter((progress) => {
              const duration = progress.duration_seconds || episodeDurations.get(progress.episode_id) || 0;
              return duration > 0 && progress.position_seconds >= duration * 0.9;
            })
            .map((progress) => progress.episode_id),
        ));
      }
    };
    void loadViewer();
    return () => {
      active = false;
    };
  }, [seed.seriesId, seed.episodes]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentEpisodeId || resumeAtSeconds <= 0) return;
    const seekToSavedPosition = () => {
      video.currentTime = video.duration > 0
        ? Math.min(resumeAtSeconds, Math.max(0, video.duration - 1))
        : resumeAtSeconds;
    };
    if (video.readyState >= 1) {
      seekToSavedPosition();
      return;
    }
    video.addEventListener("loadedmetadata", seekToSavedPosition, { once: true });
    return () => video.removeEventListener("loadedmetadata", seekToSavedPosition);
  }, [currentEpisodeId, resumeAtSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  const saveProgress = (video: HTMLVideoElement, force = false) => {
    if (!userId || !currentEpisode || video.currentTime < 5) return;
    if (!force && Date.now() - savedAtRef.current < 15000) return;
    savedAtRef.current = Date.now();
    void supabase
      .from("drama_episode_watch_progress")
      .upsert({
        user_id: userId,
        episode_id: currentEpisode.id,
        position_seconds: Math.floor(video.currentTime),
        duration_seconds: Math.floor(Number.isFinite(video.duration) ? video.duration : 0),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,episode_id" })
      .then(({ error }) => {
        if (error) logSupabaseError("Unable to save drama watch progress:", error);
      });
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch((error: unknown) => {
        console.error("Unable to play drama episode:", error);
        setMessage("Video tidak dapat diputar. Coba tekan tombol putar di video.");
      });
    } else {
      video.pause();
    }
  };

  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || duration, video.currentTime + seconds));
  };

  const toggleFavorite = async () => {
    if (!userId || !favoriteAvailable || favoriteBusy) return;
    setFavoriteBusy(true);
    setMessage("");
    const request = isFavorite
      ? supabase.from("drama_favorites").delete().eq("user_id", userId).eq("series_id", seed.seriesId)
      : supabase.from("drama_favorites").insert({ user_id: userId, series_id: seed.seriesId });
    const { error } = await request;
    if (error) {
      logSupabaseError("Unable to update drama favorite:", error);
      setMessage("Favorit gagal disimpan. Coba lagi.");
    } else {
      setIsFavorite(!isFavorite);
    }
    setFavoriteBusy(false);
  };

  const shareDrama = async () => {
    setMessage("");
    try {
      const shareData = { title: seed.seriesTitle, text: `Tonton ${seed.seriesTitle} di Youvie`, url: window.location.href };
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        setMessage("Tautan drama disalin.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("Unable to share drama from player:", error);
      setMessage("Tautan drama tidak dapat dibagikan.");
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    setPlaybackRate((current) => rates[(rates.indexOf(current) + 1) % rates.length]);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const stage = videoRef.current?.parentElement;
    if (stage?.requestFullscreen) void stage.requestFullscreen();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const onSeek = (value: number) => {
    setCurrentTime(value);
    if (videoRef.current) videoRef.current.currentTime = value;
  };

  const navigateEpisode = (episodeId: string | undefined) => {
    if (!episodeId) return;
    videoRef.current?.pause();
    router.push(`/watch/${episodeId}/player`);
  };

  const handleSwipeStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button, a, input")) {
      swipeStartRef.current = null;
      return;
    }
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleSwipeEnd = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || (event.target instanceof Element && event.target.closest("button, a, input"))) return;
    const deltaY = event.clientY - start.y;
    const deltaX = event.clientX - start.x;
    if (Math.abs(deltaY) < 60 || Math.abs(deltaY) < Math.abs(deltaX) * 1.25) return;
    navigateEpisode(deltaY < 0 ? nextEpisode?.id : previousEpisode?.id);
  };

  if (!currentEpisode) return null;

  return (
    <main className={`drama-reader-page drama-player-page${detailsExpanded ? " has-details-expanded" : ""}`}>
      <section className="drama-player-stage" aria-label="Pemutar video">
        <div className="drama-player-video-frame">
          <video
            ref={videoRef}
            playsInline
            preload="auto"
            poster={currentEpisode.thumbnailUrl || seed.coverUrl || undefined}
            aria-label={`${seed.seriesTitle} — Episode ${currentEpisode.episodeNumber}: ${currentEpisode.title}`}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || currentEpisode.durationSeconds || 0)}
            onPlay={() => {
              setIsPlaying(true);
              void recordDramaEpisodeView(currentEpisode.id).catch((error: unknown) => {
                console.error("Unable to record drama episode play:", error);
              });
            }}
            onTimeUpdate={(event) => {
              setCurrentTime(event.currentTarget.currentTime);
              setDuration(event.currentTarget.duration || currentEpisode.durationSeconds || 0);
              const videoDuration = event.currentTarget.duration || currentEpisode.durationSeconds || 0;
              if (videoDuration > 0 && event.currentTarget.currentTime >= videoDuration * 0.9) {
                setWatchedEpisodeIds((watched) => {
                  if (watched.has(currentEpisode.id)) return watched;
                  return new Set(watched).add(currentEpisode.id);
                });
              }
              saveProgress(event.currentTarget);
            }}
            onPause={(event) => {
              setIsPlaying(false);
              saveProgress(event.currentTarget, true);
            }}
            onEnded={(event) => {
              setIsPlaying(false);
              setWatchedEpisodeIds((watched) => new Set(watched).add(currentEpisode.id));
              saveProgress(event.currentTarget, true);
            }}
          >
            <source src={currentEpisode.videoUrl} type={currentEpisode.videoType} />
            Browser Anda tidak mendukung pemutaran video.
          </video>
          <div
            className="drama-player-overlay"
            onPointerDown={handleSwipeStart}
            onPointerUp={handleSwipeEnd}
            onPointerCancel={() => {
              swipeStartRef.current = null;
            }}
          >
            <div className="drama-player-overlay-top">
              <Link
                className="drama-player-overlay-button"
                href={`/watch/${seed.currentEpisodeId}`}
                aria-label="Kembali ke detail drama"
                title="Detail drama"
              >
                <ArrowLeft size={19} />
              </Link>
              <Link className="drama-player-brand drama-wordmark" href="/" aria-label="Youvie beranda">You<span>Vie.</span></Link>
              <div className="drama-player-top-actions">
                <button className="drama-player-pill" type="button" onClick={cyclePlaybackRate}>{playbackRate}x</button>
                <button className="drama-player-icon-button" type="button" onClick={toggleMute} aria-label={isMuted ? "Aktifkan suara" : "Bisukan video"}>
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <button className="drama-player-icon-button" type="button" onClick={toggleFullscreen} aria-label="Layar penuh"><Maximize size={20} /></button>
              </div>
            </div>

            <div className="drama-player-overlay-controls">
              <button className="drama-player-skip" type="button" onClick={() => seekBy(-10)} aria-label="Mundur 10 detik"><Rewind size={22} /><small>10</small></button>
              <button
                className="drama-player-toggle"
                type="button"
                onClick={togglePlayback}
                aria-label={isPlaying ? "Jeda video" : "Putar video"}
              >
                {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
              </button>
              <button className="drama-player-skip is-forward" type="button" onClick={() => seekBy(10)} aria-label="Maju 10 detik"><Rewind size={22} /><small>10</small></button>
            </div>

            <nav className="drama-player-episode-navigation" aria-label="Navigasi episode">
              <button
                type="button"
                onClick={() => navigateEpisode(previousEpisode?.id)}
                disabled={!previousEpisode}
                aria-label={previousEpisode ? `Episode sebelumnya, ${previousEpisode.episodeNumber}` : "Tidak ada episode sebelumnya"}
              >
                <ChevronDown size={22} /><span>Prev</span>
              </button>
              <button
                type="button"
                onClick={() => navigateEpisode(nextEpisode?.id)}
                disabled={!nextEpisode}
                aria-label={nextEpisode ? `Episode berikutnya, ${nextEpisode.episodeNumber}` : "Tidak ada episode berikutnya"}
              >
                <ChevronUp size={22} /><span>Next</span>
              </button>
            </nav>

            <div className="drama-player-side-actions">
              {userId ? (
                <button
                  type="button"
                  className={`drama-player-side-action${isFavorite ? " is-active" : ""}`}
                  aria-label={isFavorite ? "Hapus dari favorit" : "Simpan ke favorit"}
                  aria-pressed={isFavorite}
                  disabled={!favoriteAvailable || favoriteBusy}
                  onClick={() => void toggleFavorite()}
                >
                  {isFavorite ? <Heart size={27} fill="currentColor" /> : <Bookmark size={27} />}
                  <span>{isFavorite ? "Tersimpan" : "Simpan"}</span>
                </button>
              ) : (
                <Link className="drama-player-side-action" href="/login">
                  <Bookmark size={27} /><span>Simpan</span>
                </Link>
              )}
              <button className="drama-player-side-action" type="button" onClick={() => void shareDrama()}>
                <Share2 size={27} /><span>Bagikan</span>
              </button>
              <button
                className={`drama-player-side-action${detailsExpanded ? " is-active" : ""}`}
                type="button"
                onClick={() => setDetailsExpanded((expanded) => !expanded)}
                aria-expanded={detailsExpanded}
                aria-label={detailsExpanded ? "Ciutkan daftar episode" : "Buka daftar episode"}
              >
                <ListVideo size={27} /><span>Episode</span>
              </button>
            </div>

            <div className="drama-player-timeline">
              <span>{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={duration || currentEpisode.durationSeconds || 1}
                step="1"
                value={Math.min(currentTime, duration || currentEpisode.durationSeconds || 1)}
                onChange={(event) => onSeek(Number(event.target.value))}
                aria-label="Posisi video"
                style={{ "--progress": `${duration ? (currentTime / duration) * 100 : 0}%` } as CSSProperties}
              />
              <span>{formatTime(duration || currentEpisode.durationSeconds || 0)}</span>
            </div>
          </div>
        </div>
      </section>
      <section className={`drama-player-details${detailsExpanded ? " is-expanded" : ""}`} aria-label={`Detail ${seed.seriesTitle}`}>
        <div className="drama-player-drama-info">
          <span className="drama-player-cover">
            {seed.coverUrl
              ? <Image src={seed.coverUrl} alt={`Sampul ${seed.seriesTitle}`} fill sizes="90px" unoptimized />
              : <Play size={22} />}
          </span>
          <div className="drama-player-drama-copy">
            <h1>{seed.seriesTitle}</h1>
            <p className="drama-player-tags"><span>{seed.genre || "Drama pendek"}</span><span>HD</span></p>
            <p className="drama-player-episode-count">{seed.episodes.length} episode · Season {currentEpisode.seasonNumber}</p>
            {seed.synopsis && <p className="drama-player-synopsis">{seed.synopsis}</p>}
          </div>
        </div>
        <div className="drama-player-episodes-heading">
          <h2>Episode</h2>
          <nav className="drama-player-episode-pagination" aria-label="Rentang episode">
            {Array.from({ length: episodePageCount }, (_, index) => {
              const rangeStart = index * EPISODES_PER_PAGE + 1;
              const rangeEnd = Math.min((index + 1) * EPISODES_PER_PAGE, seed.episodes.length);
              return (
                <button
                  type="button"
                  className={episodePage === index ? "is-current" : ""}
                  onClick={() => setEpisodePage(index)}
                  aria-label={`Episode ${rangeStart} sampai ${rangeEnd}`}
                  aria-current={episodePage === index ? "page" : undefined}
                  key={index}
                >
                  {rangeStart}–{rangeEnd}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="drama-player-episode-list">
          {visibleEpisodes.map((episode) => {
            const watched = watchedEpisodeIds.has(episode.id);
            return (
              <Link
                className={`drama-player-episode-card${episode.id === currentEpisode.id ? " is-current" : ""}${watched ? " is-watched" : ""}`}
                href={`/watch/${episode.id}/player`}
                aria-current={episode.id === currentEpisode.id ? "page" : undefined}
                aria-label={`Episode ${episode.episodeNumber}: ${episode.title}, ${watched ? "sudah ditonton" : "belum ditonton"}`}
                key={episode.id}
              >
                <span className="drama-player-episode-number">
                  <b>{episode.episodeNumber}</b>
                  {watched ? <Check size={19} aria-hidden="true" /> : <LockKeyhole size={18} aria-hidden="true" />}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
      {message && <p className="drama-player-message" role="status">{message}</p>}
    </main>
  );
}
