"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronUp, CircleDot, Copy, Download, ExternalLink, Eye, Heart, LoaderCircle, Share2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePlatformSettings } from "../../platform-runtime";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import PlatformLinks from "@/components/platform-links";
import { getComicGenreLabel } from "@/lib/comic-genres";
import SponsoredAd from "@/components/sponsored-ad";
import { ORIGIN_TYPES, PRODUCTION_TECHNIQUES, STORY_STATUSES, TARGET_AUDIENCES, getMetadataLabel } from "@/lib/comic-metadata";
import DeviceUnavailableNotice from "@/components/device-unavailable-notice";
import { useCurrentDevice } from "@/components/use-current-device";
import { COMIC_TARGET_DEVICES, isComicAvailableOnDevice, type ComicTargetDevice } from "@/lib/comic-target-device";
import { useReaderMembership } from "@/app/membership-runtime";
import {
  formatOfflineSize,
  getOfflineTimestamp,
  getOfflineEpisodes,
  isOfflineLicenseValid,
  OFFLINE_EPISODE_LIMIT,
  removeOfflineEpisode,
  saveOfflineEpisode,
  type OfflineEpisode,
} from "@/lib/offline-episodes";

const supabase = createClient();

export type Comic = {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  contributor: string;
  genre: string;
  target_device: ComicTargetDevice;
  contributors: { role: string; name: string }[] | null;
  production_technique: string;
  story_status: string;
  target_audience: string;
  language: string;
  origin_type: string;
  source_info: string;
  cover_key: string | null;
  profiles: { id?: string; public_handle?: string | null; display_name: string; public_profile?: boolean } | { id?: string; public_handle?: string | null; display_name: string; public_profile?: boolean }[] | null;
};

export type Chapter = { id: string; title: string; chapter_number: number; published_at: string | null };
export type ComicDetailPageProps = { initialComic: Comic; initialChapters: Chapter[] };
type ChapterReadStatus = "accessed" | "read";
type ComicEngagement = { views: number; likes: number; shares: number };

function parseComicEngagement(data: unknown): ComicEngagement | null {
  if (!Array.isArray(data) || !data[0] || typeof data[0] !== "object") return null;
  const row = data[0];
  const views = Number(row.views);
  const likes = Number(row.likes);
  const shares = Number(row.shares);
  if (![views, likes, shares].every((count) => Number.isSafeInteger(count) && count >= 0)) return null;
  return { views, likes, shares };
}

function formatEngagementCount(count: number) {
  return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(count);
}

function getErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  return undefined;
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error && error.name === "TimeoutError") return true;
  if (!error || typeof error !== "object") return false;
  const details = error as { message?: unknown; details?: unknown; name?: unknown };
  const message = [details.message, details.details, details.name]
    .map((value) => `${value instanceof Error ? `${value.name} ${value.message}` : String(value ?? "")}`.toLowerCase())
    .join(" ");
  return message.includes("timeout") || message.includes("timed out");
}

function describeLoadError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause: getErrorMessage(error.cause),
    };
  }
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; details?: unknown; hint?: unknown; message?: unknown; name?: unknown; status?: unknown };
    return {
      name: typeof value.name === "string" ? value.name : undefined,
      message: getErrorMessage(value.message) ?? String(value.message ?? ""),
      code: typeof value.code === "string" ? value.code : undefined,
      details: getErrorMessage(value.details) ?? String(value.details ?? ""),
      hint: typeof value.hint === "string" ? value.hint : undefined,
      status: typeof value.status === "number" ? value.status : undefined,
    };
  }
  return { message: String(error) };
}

function cleanSynopsis(synopsis: string) {
  return synopsis
    .replace(/\*\*/g, "")
    .replace(/👉/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function ComicDetailPage({ initialComic, initialChapters }: ComicDetailPageProps) {
  const { settings } = usePlatformSettings();
  const currentDevice = useCurrentDevice();
  const membership = useReaderMembership();
  const { slug } = useParams<{ slug: string }>();
  const [comic, setComic] = useState<Comic | null>(initialComic);
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [chapterReadStatuses, setChapterReadStatuses] = useState<Record<string, ChapterReadStatus>>({});
  const [chapterProgressReady, setChapterProgressReady] = useState(false);
  const [chapterProgressError, setChapterProgressError] = useState(false);
  const [episodeSnackbar, setEpisodeSnackbar] = useState("");
  const [lastReadChapterId, setLastReadChapterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [chapterLoadError, setChapterLoadError] = useState(false);
  const [chapterListLoading, setChapterListLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [offlineEpisodes, setOfflineEpisodes] = useState<OfflineEpisode[]>([]);
  const [offlineDownloadId, setOfflineDownloadId] = useState<string | null>(null);
  const [offlineDownloadProgress, setOfflineDownloadProgress] = useState("");
  const [offlineDownloadError, setOfflineDownloadError] = useState("");
  const [offlineReplacementChapter, setOfflineReplacementChapter] = useState<Chapter | null>(null);
  const [offlineStorageMessage, setOfflineStorageMessage] = useState("");
  const [allowMobileData, setAllowMobileData] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [engagement, setEngagement] = useState<ComicEngagement | null>(null);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [bookmarkMessage, setBookmarkMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [stickyReadVisible, setStickyReadVisible] = useState(false);
  const [stickyReadDismissed, setStickyReadDismissed] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const shareUrlRef = useRef<HTMLTextAreaElement>(null);
  const primaryReadRef = useRef<HTMLAnchorElement>(null);
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAllowMobileData(localStorage.getItem("mu-komik:offline-allow-mobile-data") === "true");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;
    const syncOfflineData = async () => {
      try {
        const savedEpisodes = await getOfflineEpisodes();
        if (active) setOfflineEpisodes(savedEpisodes);
        if ("storage" in navigator && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          if (active) {
            const used = estimate.usage ?? savedEpisodes.reduce((total, episode) => total + episode.sizeBytes, 0);
            const quota = estimate.quota;
            setOfflineStorageMessage(quota
              ? `Penyimpanan browser: ${formatOfflineSize(used)} dari ${formatOfflineSize(quota)}`
              : `Unduhan di perangkat ini: ${savedEpisodes.length}/${OFFLINE_EPISODE_LIMIT} episode · ${formatOfflineSize(used)}`);
          }
        } else if (active) {
          const used = savedEpisodes.reduce((total, episode) => total + episode.sizeBytes, 0);
          setOfflineStorageMessage(`Unduhan di perangkat ini: ${savedEpisodes.length}/${OFFLINE_EPISODE_LIMIT} episode · ${formatOfflineSize(used)}`);
        }
      } catch (error) {
        console.error("Unable to synchronize offline episode storage:", error);
        if (active) setOfflineDownloadError(error instanceof Error ? error.message : "Unduhan offline belum dapat diperiksa.");
      }
    };
    void syncOfflineData();
    return () => { active = false; };
  }, [membership.ready, membership.tier, membership.verified, userId]);

  useEffect(() => {
    if (!episodeSnackbar) return;
    const timeout = window.setTimeout(() => setEpisodeSnackbar(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [episodeSnackbar]);

  useEffect(() => {
    const primaryAction = primaryReadRef.current;
    if (!primaryAction) {
      setStickyReadVisible(false);
      return;
    }
    const mobileQuery = window.matchMedia("(max-width: 640px)");
    let observer: IntersectionObserver | null = null;
    const observePrimaryAction = () => {
      observer?.disconnect();
      observer = null;
      if (!mobileQuery.matches) {
        setStickyReadVisible(false);
        return;
      }
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          setStickyReadVisible(false);
          setStickyReadDismissed(false);
        } else if (!stickyReadDismissed) {
          setStickyReadVisible(true);
        }
      }, { threshold: 0.15 });
      observer.observe(primaryAction);
    };
    observePrimaryAction();
    mobileQuery.addEventListener("change", observePrimaryAction);
    return () => {
      observer?.disconnect();
      mobileQuery.removeEventListener("change", observePrimaryAction);
    };
  }, [comic, chapters, lastReadChapterId, stickyReadDismissed]);

  useEffect(() => {
    let active = true;
    const loadComic = async () => {
      if (currentDevice === null) return;
      if (!isComicAvailableOnDevice(initialComic?.target_device, currentDevice)) {
        setLoading(false);
        return;
      }
      if (!initialComic) setLoading(true);
      setLoadError("");
      setEngagement(null);
      const comicSelect = "id, title, slug, synopsis, contributor, contributors, genre, target_device, production_technique, story_status, target_audience, language, origin_type, source_info, cover_key, profiles!comics_creator_id_fkey(id, public_handle, display_name, public_profile)";
      const fallbackComicSelect = "id, title, slug, synopsis, contributor, contributors, genre, target_device, cover_key, profiles!comics_creator_id_fkey(id, public_handle, display_name, public_profile)";
      const legacyComicSelect = "id, title, slug, synopsis, contributor, genre, target_device, cover_key, profiles!comics_creator_id_fkey(display_name)";
      let { data, error } = await supabase
        .from("comics")
        .select(comicSelect)
        .eq("slug", slug)
        .abortSignal(AbortSignal.timeout(8000))
        .single();
      if (error?.code === "42703") {
        console.warn("Comic metadata columns are unavailable; retrying with existing comic fields.");
        const fallback = await supabase
          .from("comics")
          .select(fallbackComicSelect)
          .eq("slug", slug)
          .abortSignal(AbortSignal.timeout(8000))
          .single();
        data = fallback.data as typeof data;
        error = fallback.error;
        if (error?.code === "42703") {
          const legacy = await supabase
            .from("comics")
            .select(legacyComicSelect)
            .eq("slug", slug)
            .abortSignal(AbortSignal.timeout(8000))
            .single();
          data = legacy.data as typeof data;
          error = legacy.error;
          if (error?.code === "42703") {
            const oldest = await supabase
              .from("comics")
              .select("id, title, slug, synopsis, contributor, genre, cover_key, profiles!comics_creator_id_fkey(display_name)")
              .eq("slug", slug)
              .abortSignal(AbortSignal.timeout(8000))
              .single();
            data = oldest.data as typeof data;
            error = oldest.error;
          }
        }
      }
      if (error || !data) {
        if (error) {
          const details = describeLoadError(error);
          if (isTimeoutError(error)) {
            console.warn("Comic detail request timed out.", { slug, timeoutMs: 8000, error: details });
          } else {
            console.error("Unable to load comic details.", { slug, error: details });
          }
        }
        if (active) {
          setLoadError(isTimeoutError(error)
            ? "Koneksi ke server terlalu lama. Periksa koneksi lalu coba lagi."
            : error ? "Komik belum dapat dimuat. Periksa koneksi lalu coba lagi." : "");
          if (!initialComic) setComic(null);
          setLoading(false);
        }
        return;
      }

      const targetDevice = "target_device" in data ? data.target_device as ComicTargetDevice : initialComic?.target_device;
      if (!isComicAvailableOnDevice(targetDevice, currentDevice)) {
        if (active) setLoading(false);
        return;
      }

      const comic = {
        ...data,
        target_device: targetDevice || "all",
        contributors: "contributors" in data ? data.contributors : null,
        production_technique: "production_technique" in data ? data.production_technique : "traditional_drawing",
        story_status: "story_status" in data ? data.story_status : "ongoing",
        target_audience: "target_audience" in data ? data.target_audience : "all_ages",
        language: "language" in data ? data.language : "id",
        origin_type: "origin_type" in data ? data.origin_type : "original",
        source_info: "source_info" in data ? data.source_info : "",
      };
      if (active) {
        setComic(comic as Comic);
        if (!initialChapters.length) setChapters([]);
        setChapterLoadError(false);
        setChapterListLoading(!initialChapters.length);
        setChapterProgressReady(false);
        setChapterProgressError(false);
        setLoading(false);
      }

      const engagementRequest = supabase.rpc("public_comic_engagement", { p_comic_id: data.id });
      const { data: chapterData, error: chapterError } = await supabase
        .from("chapters")
        .select("id, title, chapter_number, published_at")
        .eq("comic_id", data.id)
        .not("published_at", "is", null)
        .order("chapter_number", { ascending: true })
        .abortSignal(AbortSignal.timeout(8000));
      const { data: engagementData, error: engagementError } = await engagementRequest;
      if (engagementError) {
        const details = describeLoadError(engagementError);
        if ("code" in engagementError && engagementError.code === "PGRST202") {
          console.warn(
            "Comic engagement counts are unavailable because public_comic_engagement is missing. "
              + "Run supabase/comic-engagement-counts.sql after supabase/comic-analytics.sql, "
              + "then refresh the Supabase API schema cache.",
            { slug, error: details },
          );
        } else {
          console.error("Unable to load comic engagement counts.", { slug, error: details });
        }
      } else {
        const counts = parseComicEngagement(engagementData);
        if (counts) {
          if (active) setEngagement(counts);
        } else {
          console.error("Comic engagement counts returned an invalid response.", engagementData);
        }
      }
      if (chapterError) console.error("Unable to load comic episodes:", chapterError);
      if (active) {
        setChapterLoadError(Boolean(chapterError));
        setChapterListLoading(false);
        setChapters(chapterData ?? initialChapters);
        setChapterReadStatuses({});
        setChapterProgressReady(false);
        setChapterProgressError(false);
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) console.error("Unable to check the current auth session:", sessionError);
      const currentUserId = sessionData.session?.user.id ?? null;
      if (active) setUserId(currentUserId);
      if (active && sessionError) setChapterProgressError(true);
      if (currentUserId) {
        const { data: bookmark, error: bookmarkError } = await supabase
          .from("bookmarks")
          .select("comic_id")
          .eq("user_id", currentUserId)
          .eq("comic_id", data.id)
          .maybeSingle();
        if (bookmarkError) {
          console.error("Unable to load comic bookmark:", bookmarkError);
          if (active) setBookmarkMessage("Favorit belum dapat dimuat. Coba lagi sebentar.");
        } else if (active) {
          setIsBookmarked(Boolean(bookmark));
        }
      } else if (active) {
        setIsBookmarked(false);
      }

      if (chapterData?.length) {
        const chapterIds = chapterData.map((chapter) => chapter.id);
        const { data: pageData, error: pageError } = await supabase
          .from("pages")
          .select("id, chapter_id")
          .in("chapter_id", chapterIds);
        if (pageError) console.error("Unable to load episode page counts:", pageError);

        const pageIdsByChapter = new Map<string, string[]>();
        for (const page of pageData ?? []) {
          const pageIds = pageIdsByChapter.get(page.chapter_id) ?? [];
          pageIds.push(page.id);
          pageIdsByChapter.set(page.chapter_id, pageIds);
        }

        const historyByChapter = new Map<string, number>();
        if (currentUserId) {
          const { data: history, error: historyError } = await supabase
            .from("reading_history")
            .select("chapter_id, last_page, updated_at")
            .eq("user_id", currentUserId)
            .in("chapter_id", chapterIds);
          if (historyError) console.error("Unable to load comic reading progress:", historyError);
          else {
            for (const entry of history ?? []) historyByChapter.set(entry.chapter_id, entry.last_page);
            if (active) {
              const latest = [...(history ?? [])].sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];
              setLastReadChapterId(latest?.chapter_id ?? null);
            }
          }
          if (active && (historyError || pageError)) setChapterProgressError(true);
        } else if (active) {
          setLastReadChapterId(null);
          if (pageError) setChapterProgressError(true);
        }

        const statuses: Record<string, ChapterReadStatus> = {};
        for (const chapter of chapterData) {
          const pageIds = pageIdsByChapter.get(chapter.id) ?? [];
          const pageIdSet = new Set(pageIds);
          const readPageIds = new Set<string>();
          try {
            const storedPages = localStorage.getItem(`mu-komik:read-pages:${chapter.id}`);
            const parsedPages: unknown = storedPages ? JSON.parse(storedPages) : [];
            if (Array.isArray(parsedPages)) {
              parsedPages.forEach((pageId) => {
                if (typeof pageId === "string" && pageIdSet.has(pageId)) readPageIds.add(pageId);
              });
            }
          } catch (storageError) {
            console.error("Unable to load saved episode page markers:", storageError);
          }

          const lastPage = historyByChapter.get(chapter.id) ?? 0;
          pageIds.slice(0, lastPage).forEach((pageId) => readPageIds.add(pageId));
          if (readPageIds.size > 0 || lastPage > 0) {
            statuses[chapter.id] = pageIds.length > 0 && readPageIds.size >= pageIds.length ? "read" : "accessed";
          }
        }
        if (active) {
          setChapterReadStatuses(statuses);
          setChapterProgressReady(true);
        }
      } else if (active) {
        setChapterProgressReady(true);
      }
    };
    void loadComic().catch((error: unknown) => {
      if (isTimeoutError(error)) {
        console.warn("Comic detail loading timed out.", { slug, error: describeLoadError(error) });
      } else {
        console.error("Unable to finish loading comic details.", { slug, error: describeLoadError(error) });
      }
      if (active) {
        setLoadError(error instanceof Error && isTimeoutError(error)
          ? "Koneksi ke server terlalu lama. Periksa koneksi lalu coba lagi."
          : "Komik belum dapat dimuat. Periksa koneksi lalu coba lagi.");
        setComic(null);
        setLoading(false);
        setChapterListLoading(false);
      }
    });
    return () => { active = false; };
  }, [currentDevice, initialChapters, initialComic, slug]);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (active) setUserId(session?.user.id ?? null);
      }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const toggleBookmark = async () => {
    if (!comic || !userId || bookmarkBusy) return;
    setBookmarkBusy(true);
    setBookmarkMessage("");
    const result = isBookmarked
      ? await supabase.from("bookmarks").delete().eq("user_id", userId).eq("comic_id", comic.id)
      : await supabase.from("bookmarks").insert({ user_id: userId, comic_id: comic.id });
    if (result.error) {
      console.error("Unable to update comic bookmark:", result.error);
      setBookmarkMessage(result.error.code === "23502" || result.error.code === "23505"
        ? "Favorit belum tersedia. Admin perlu menjalankan supabase/comic-bookmarks.sql."
        : "Favorit belum dapat diperbarui. Coba lagi sebentar.");
    } else {
      setIsBookmarked(!isBookmarked);
      setEngagement((current) => current
        ? { ...current, likes: Math.max(0, current.likes + (isBookmarked ? -1 : 1)) }
        : current);
      setEpisodeSnackbar(isBookmarked ? "Komik dihapus dari favorit." : "Komik disimpan ke favorit.");
    }
    setBookmarkBusy(false);
  };

  const shareComic = async () => {
    setShareMessage("");
    const url = window.location.href;
    setShareUrl(url);
    if (comic) {
      void fetch("/api/analytics/comic-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comicId: comic.id }),
      }).then((response) => {
        if (!response.ok) throw new Error(`Share analytics request failed with status ${response.status}`);
        setEngagement((current) => current ? { ...current, shares: current.shares + 1 } : current);
      }).catch((error: unknown) => {
        console.error("Unable to record comic share:", error);
        setShareMessage("Bagikan dimulai, tetapi statistik belum dapat dicatat.");
      });
    }
    if (navigator.share) {
      try {
        const shareText = comic ? `Yuk baca ${comic.title} di MU Komik!` : "Yuk baca komik di MU Komik!";
        const shareData: ShareData = { title: comic?.title, text: shareText, url };
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Unable to open the native share dialog:", error);
      }
    }
    setShareDialogOpen(true);
  };

  const copyShareUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareMessage("Tautan komik berhasil disalin.");
        setShareDialogOpen(false);
        return;
      }
    } catch (error) {
      console.error("Clipboard API could not copy the comic link:", error);
    }
    shareUrlRef.current?.focus();
    shareUrlRef.current?.select();
    setShareMessage("Tautan dipilih. Salin dengan menekan Ctrl+C atau tahan lalu pilih Salin.");
  };

  const runOfflineDownload = async (chapter: Chapter, replacementChapterId?: string) => {
    if (!comic || !userId || !membership.ready || !membership.verified
      || (membership.tier !== "premium" && membership.tier !== "vip")) {
      setOfflineDownloadError("Unduhan offline hanya tersedia untuk akun Premium yang statusnya berhasil diverifikasi.");
      return;
    }
    if (!navigator.onLine) {
      setOfflineDownloadError("Koneksi internet diperlukan untuk mengunduh episode.");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      setOfflineDownloadError("Browser ini tidak mendukung layanan offline. Gunakan browser yang mendukung PWA.");
      return;
    }
    if (!publicUrl) {
      setOfflineDownloadError("Alamat penyimpanan gambar belum dikonfigurasi. Hubungi admin.");
      return;
    }
    const connection = (navigator as Navigator & { connection?: { type?: string; effectiveType?: string } }).connection;
    const likelyMobileNetwork = connection?.type === "cellular";
    const networkUnverified = connection?.type !== "wifi" && connection?.type !== "ethernet" && !likelyMobileNetwork;
    if (likelyMobileNetwork || (!allowMobileData && networkUnverified)) {
      const warning = likelyMobileNetwork
        ? "Browser mendeteksi koneksi seluler. Unduhan dapat memakai kuota data. Tetap lanjutkan?"
        : "Browser tidak dapat mengenali jenis koneksi (misalnya kabel LAN atau Wi-Fi). Jika saat ini menggunakan data seluler, unduhan dapat memakai kuota. Tetap lanjutkan?";
      if (!window.confirm(warning)) return;
    }
    const existingEpisode = offlineEpisodes.find((episode) => episode.chapterId === chapter.id);
    if (!replacementChapterId && !existingEpisode && offlineEpisodes.length >= OFFLINE_EPISODE_LIMIT) {
      setOfflineReplacementChapter(chapter);
      setOfflineDownloadError("");
      return;
    }
    setOfflineReplacementChapter(null);
    setOfflineDownloadId(chapter.id);
    setOfflineDownloadError("");
    setOfflineDownloadProgress("Memeriksa halaman episode…");
    try {
      let serviceWorkerTimeout = 0;
      const serviceWorker = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_resolve, reject) => {
          serviceWorkerTimeout = window.setTimeout(() => reject(new Error("Layanan offline belum siap. Muat ulang halaman lalu coba lagi.")), 10000);
        }),
      ]).finally(() => window.clearTimeout(serviceWorkerTimeout));
      if (!serviceWorker.active) throw new Error("Layanan offline belum aktif. Muat ulang halaman lalu coba lagi.");
      const { data: publishedChapter, error: publishedChapterError } = await supabase
        .from("chapters")
        .select("id")
        .eq("id", chapter.id)
        .eq("comic_id", comic.id)
        .not("published_at", "is", null)
        .maybeSingle();
      if (publishedChapterError) throw new Error(`Status terbit episode tidak dapat diverifikasi: ${publishedChapterError.message}`);
      if (!publishedChapter) throw new Error("Episode ini sudah tidak diterbitkan dan tidak dapat diunduh.");
      const { data: pageRows, error: pagesError } = await supabase
        .from("pages")
        .select("id, page_number, object_key")
        .eq("chapter_id", chapter.id)
        .order("page_number", { ascending: true });
      if (pagesError) throw new Error(`Daftar halaman tidak dapat dimuat: ${pagesError.message}`);
      if (!pageRows?.length) throw new Error("Episode ini belum memiliki halaman untuk diunduh.");
      const storageEstimate = "storage" in navigator && navigator.storage.estimate
        ? await navigator.storage.estimate()
        : null;
      const replacedEpisode = replacementChapterId
        ? offlineEpisodes.find((episode) => episode.chapterId === replacementChapterId)
        : existingEpisode;
      const pages: OfflineEpisode["pages"] = [];
      let downloadedBytes = 0;
      for (let index = 0; index < pageRows.length; index += 1) {
        const page = pageRows[index];
        setOfflineDownloadProgress(`Mengunduh halaman ${index + 1} dari ${pageRows.length}…`);
        let response: Response;
        try {
          response = await fetch(`${publicUrl.replace(/\/$/, "")}/${page.object_key}`, { cache: "no-store" });
        } catch (error) {
          console.error(`Unable to fetch image for offline episode page ${index + 1}:`, error);
          throw new Error(`Koneksi ke gambar halaman ${index + 1} gagal. Periksa koneksi dan pengaturan penyimpanan gambar.`);
        }
        if (!response.ok) throw new Error(`Gagal mengunduh halaman ${index + 1} (HTTP ${response.status}).`);
        const image = await response.blob();
        if (!image.size || !image.type.startsWith("image/")) {
          throw new Error(`File halaman ${index + 1} bukan gambar yang valid.`);
        }
        downloadedBytes += image.size;
        const projectedUsage = Math.max(0, (storageEstimate?.usage ?? 0) - (replacedEpisode?.sizeBytes ?? 0)) + downloadedBytes;
        if (storageEstimate?.quota && projectedUsage > storageEstimate.quota) {
          throw new Error("Ruang penyimpanan browser tidak cukup. Hapus unduhan lama lalu coba lagi.");
        }
        pages.push({ id: page.id, pageNumber: page.page_number, image });
      }
      const [{ data: sessionData, error: sessionError }, { data: currentMembership, error: membershipError }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from("reader_memberships").select("tier").eq("user_id", userId).maybeSingle(),
      ]);
      if (sessionError) throw new Error(`Sesi akun tidak dapat diverifikasi: ${sessionError.message}`);
      if (sessionData.session?.user.id !== userId) throw new Error("Akun berubah selama pengunduhan. Silakan mulai lagi.");
      if (membershipError) throw new Error(`Status Premium tidak dapat diverifikasi: ${membershipError.message}`);
      if (currentMembership?.tier !== "premium" && currentMembership?.tier !== "vip") {
        throw new Error("Keanggotaan Premium tidak aktif. Episode tidak disimpan.");
      }
      localStorage.removeItem(`mu-komik:offline-revoked:${userId}`);
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) console.error("Unable to load the reader name for offline watermark:", profileError);
      const watermarkName = profile?.display_name?.trim().slice(0, 32) || "Pembaca";
      localStorage.setItem("mu-komik:offline-watermark-name", watermarkName);
      setOfflineDownloadProgress("Menyimpan episode di perangkat…");
      const downloadTimestamp = getOfflineTimestamp();
      await saveOfflineEpisode({
        chapterId: chapter.id,
        comicSlug: comic.slug,
        comicTitle: comic.title,
        chapterTitle: chapter.title || `Episode ${chapter.chapter_number}`,
        chapterNumber: chapter.chapter_number,
        ownerId: userId,
        downloadedAt: downloadTimestamp,
        verifiedAt: downloadTimestamp,
        sizeBytes: downloadedBytes,
        pages,
      }, replacementChapterId);
      const savedEpisodes = await getOfflineEpisodes();
      setOfflineEpisodes(savedEpisodes);
      setOfflineStorageMessage(`Unduhan di perangkat ini: ${savedEpisodes.length}/${OFFLINE_EPISODE_LIMIT} episode · ${formatOfflineSize(downloadedBytes)} diunduh`);
      setOfflineDownloadProgress("Episode tersedia untuk dibaca offline.");
    } catch (error) {
      console.error("Unable to download an offline episode:", error);
      setOfflineDownloadError(error instanceof Error ? error.message : "Episode tidak dapat disimpan offline.");
      setOfflineDownloadProgress("");
    } finally {
      setOfflineDownloadId(null);
    }
  };

  if (loading) return (
    <main className="reader-detail-page" aria-busy="true">
      <nav className="reader-subnav"><BrandLogo className="wordmark reader-wordmark" showName /><span className="reader-detail-skeleton reader-detail-skeleton-nav" /></nav>
      <div className="reader-comic-detail reader-detail-loading">
        <span className="reader-detail-skeleton reader-detail-cover-skeleton" />
        <div className="reader-detail-skeleton-copy">
          <span className="reader-detail-skeleton reader-detail-skeleton-meta" />
          <span className="reader-detail-skeleton reader-detail-skeleton-title" />
          <span className="reader-detail-skeleton reader-detail-skeleton-copyline" />
          <span className="reader-detail-skeleton reader-detail-skeleton-copyline" />
          <span className="reader-detail-skeleton reader-detail-skeleton-button" />
        </div>
      </div>
      <section className="reader-episodes" aria-label="Memuat episode">
        <div className="reader-section-heading"><h2>Episode</h2></div>
        <div className="reader-detail-episode-skeletons">{[0, 1, 2].map((item) => <span className="reader-detail-skeleton" key={item} />)}</div>
      </section>
      <p className="reader-detail-loading-label"><LoaderCircle className="spin" size={17} /> Menyiapkan ceritamu...</p>
    </main>
  );
  if (!comic) {
    return (
      <main className="reader-detail-page">
        <nav className="reader-subnav"><BrandLogo className="wordmark reader-wordmark" showName /><Link className="reader-back-link" href="/"><ArrowLeft size={17} /> Jelajahi komik</Link></nav>
        <div className="reader-detail-not-found"><h1>{loadError ? "Komik belum bisa dibuka." : "Komik tidak ditemukan."}</h1><p>{loadError || "Cerita ini mungkin telah dipindahkan atau belum diterbitkan."}</p>{loadError && <button className="reader-primary-button" type="button" onClick={() => window.location.reload()}>Coba lagi <ArrowRight size={17} /></button>}<Link className="reader-detail-secondary-link" href="/">Jelajahi komik</Link></div>
      </main>
    );
  }
  if (currentDevice === null) {
    return <main className="reader-detail-page" aria-busy="true"><div className="reader-detail-not-found">Memeriksa ketersediaan komik...</div></main>;
  }
  if (!isComicAvailableOnDevice(comic.target_device, currentDevice)) {
    const targetLabel = COMIC_TARGET_DEVICES.find((device) => device.value === comic.target_device)?.label.toLowerCase() || "perangkat tertentu";
    return <DeviceUnavailableNotice deviceName={targetLabel} />;
  }

  const creator = Array.isArray(comic.profiles) ? comic.profiles[0]?.display_name : comic.profiles?.display_name;
  const creatorProfile = Array.isArray(comic.profiles) ? comic.profiles[0] : comic.profiles;
  const contributor = comic.contributor.trim() || creator || "Kreator independen";
  const credits = Array.isArray(comic.contributors) ? comic.contributors.filter((item) => item.name?.trim()) : [];
  const writerCredit = credits.find((credit) => /^(penulis|writer)$/i.test(credit.role.trim()));
  const byline = writerCredit?.name || contributor.replace(/^penulis(?:\s+atau\s+kontributor)?\s*:\s*/i, "") || "Kreator independen";
  const coverUrl = comic.cover_key && publicUrl ? `${publicUrl.replace(/\/$/, "")}/${comic.cover_key}` : null;
  const firstIncompleteIndex = chapters.findIndex((chapter) => chapterReadStatuses[chapter.id] !== "read");
  const allChaptersRead = chapters.length > 0 && firstIncompleteIndex === -1;
  const isChapterUnlocked = (chapterIndex: number) => {
    if (chapterIndex < 0) return false;
    if (membership.tier === "vip") return true;
    if (!chapterProgressReady) return chapterIndex === 0;
    if (chapterProgressError) return chapterIndex === 0;
    return allChaptersRead || chapterIndex <= firstIncompleteIndex;
  };
  const resumeChapter = chapters.find((chapter, index) => chapter.id === lastReadChapterId && isChapterUnlocked(index));
  const firstChapter = resumeChapter || chapters[firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0] || chapters[0];
  const synopsis = cleanSynopsis(comic.synopsis);
  const synopsisCanExpand = synopsis.length > 220;
  const latestChapterNumber = Math.max(0, ...chapters.map((chapter) => chapter.chapter_number));

  return (
    <main className="reader-detail-page">
      <nav className="reader-subnav">
        <BrandLogo className="wordmark reader-wordmark" showName />
        <Link className="reader-back-link" href="/"><ArrowLeft size={17} /> Jelajahi</Link>
      </nav>
      <section className="reader-comic-detail">
        <div className="reader-detail-cover-wrap">
          <div className="reader-detail-cover">
          {coverUrl ? <img src={coverUrl} alt={`Sampul ${comic.title}`} fetchPriority="high" /> : <span>{comic.title.slice(0, 2).toUpperCase()}</span>}
          </div>
          <span className="reader-detail-access"><Check size={15} strokeWidth={2.5} /> Gratis dibaca</span>
        </div>
        <div className="reader-detail-copy">
          <p className="reader-detail-genre-count">{getComicGenreLabel(comic.genre)}<span aria-hidden="true">·</span>{chapters.length} episode</p>
          <h1>{comic.title}</h1>
          <p className="reader-detail-creator">Karya <strong>{byline}</strong></p>
          {creatorProfile?.public_handle && creatorProfile.public_profile && (
            <Link className="reader-creator-profile-link reader-detail-creator-profile" href={`/kreator/${encodeURIComponent(creatorProfile.public_handle)}`}>
              Lihat profil kreator {creator}
              <ArrowRight size={14} />
            </Link>
          )}
          {engagement && (
            <div className="reader-detail-engagement" aria-label="Statistik komik">
              <span title={`${engagement.views.toLocaleString("id-ID")} kali dilihat`}><Eye size={15} /><strong>{formatEngagementCount(engagement.views)}</strong><small>Dilihat</small></span>
              <span title={`${engagement.likes.toLocaleString("id-ID")} favorit`}><Heart size={15} /><strong>{formatEngagementCount(engagement.likes)}</strong><small>Favorit</small></span>
              <span title={`${engagement.shares.toLocaleString("id-ID")} kali dibagikan`}><Share2 size={15} /><strong>{formatEngagementCount(engagement.shares)}</strong><small>Dibagikan</small></span>
            </div>
          )}
          <div className={`reader-detail-synopsis-wrap${synopsisExpanded ? " reader-detail-synopsis-expanded" : ""}`}>
            <p className="reader-detail-synopsis">{synopsis || "Mulai membaca dan masuk ke dunia cerita ini."}</p>
            {synopsisCanExpand && <button className="reader-detail-synopsis-toggle" type="button" aria-expanded={synopsisExpanded} onClick={() => setSynopsisExpanded((expanded) => !expanded)}>{synopsisExpanded ? <>Lebih sedikit <ChevronUp size={15} /></> : <>Baca selengkapnya <ArrowRight size={15} /></>}</button>}
          </div>
          <div className="reader-detail-reading-action">
            {firstChapter
              ? <Link ref={primaryReadRef} className="reader-primary-button reader-detail-primary-button" href={`/comic/${comic.slug}/chapter/${firstChapter.id}`}><BookOpen size={19} /> {resumeChapter ? "Lanjutkan baca" : "Mulai baca"} <ArrowRight size={18} /></Link>
              : <span className="reader-detail-unavailable">Episode akan segera hadir</span>}
            {resumeChapter && <p className="reader-detail-resume">Terakhir dibaca · Episode {resumeChapter.chapter_number}</p>}
          </div>
          <div className="reader-detail-actions">
            {settings.feature_flags.favorites && (userId
              ? <button className={`reader-detail-action${isBookmarked ? " reader-detail-action-saved" : ""}`} onClick={() => void toggleBookmark()} disabled={bookmarkBusy} aria-pressed={isBookmarked} aria-label={isBookmarked ? "Hapus dari favorit" : "Simpan ke favorit"}>
                  {bookmarkBusy ? <LoaderCircle className="spin" size={17} /> : <Heart size={17} fill={isBookmarked ? "currentColor" : "none"} />}
                  Favorit
                </button>
              : <Link className="reader-detail-action" href="/login" aria-label="Masuk untuk menyimpan komik ke favorit"><Heart size={17} /> Favorit</Link>)}
            <button className="reader-detail-action" onClick={() => void shareComic()}><Share2 size={17} /> Bagikan</button>
          </div>
          {bookmarkMessage && <p className="reader-detail-action-message" role="status">{bookmarkMessage}</p>}
          {shareMessage && <p className="reader-detail-action-message" role="status">{shareMessage}</p>}
        </div>
      </section>
      {shareDialogOpen && (
        <div className="reader-share-backdrop" role="presentation" onClick={() => setShareDialogOpen(false)}>
          <section className="reader-share-dialog" role="dialog" aria-modal="true" aria-labelledby="reader-share-title" onClick={(event) => event.stopPropagation()}>
            <button className="reader-share-close" type="button" aria-label="Tutup pilihan berbagi" onClick={() => setShareDialogOpen(false)}><X size={19} /></button>
            <p className="reader-section-kicker">BAGIKAN CERITA</p>
            <h2 id="reader-share-title">Ajak teman membaca</h2>
            <p className="reader-share-description">{comic.title}</p>
            {cleanSynopsis(comic.synopsis) && <p className="reader-share-synopsis">{cleanSynopsis(comic.synopsis)}</p>}
            {coverUrl && <img className="reader-share-cover" src={coverUrl} alt={`Cover ${comic.title} yang akan tampil saat membagikan tautan`} />}
            <textarea ref={shareUrlRef} className="reader-share-url" aria-label="Tautan komik" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} />
            <div className="reader-share-actions">
              <button className="reader-primary-button" type="button" onClick={() => void copyShareUrl()}><Copy size={17} /> Salin tautan</button>
              <a className="reader-detail-action" href={`https://wa.me/?text=${encodeURIComponent(`Yuk baca ${comic.title} di MU Komik! ${shareUrl}`)}`} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Bagikan via WhatsApp</a>
            </div>
            {shareMessage && <p className="reader-detail-action-message" role="status">{shareMessage}</p>}
          </section>
        </div>
      )}
      <SponsoredAd slotKey="comic_detail_sponsor" placement="comic" comicId={comic.id} />
      <section className="reader-episodes">
        <div className="reader-section-heading"><div><p className="reader-section-kicker">LANJUTKAN CERITA</p><h2>Episode</h2></div><span className="reader-result-count">{chapters.length} episode</span></div>
        {membership.ready && membership.verified && (membership.tier === "premium" || membership.tier === "vip") && (
          <div className="reader-offline-settings">
            <p>Unduhan Premium tersimpan di perangkat ini, maksimal {OFFLINE_EPISODE_LIMIT} episode. Lisensi dibarui saat status Premium berhasil diverifikasi online dan berlaku 7 hari sejak verifikasi terakhir.</p>
            {offlineStorageMessage && <small>{offlineStorageMessage}</small>}
            <label><input type="checkbox" checked={allowMobileData} onChange={(event) => {
              const allowed = event.currentTarget.checked;
              setAllowMobileData(allowed);
              localStorage.setItem("mu-komik:offline-allow-mobile-data", String(allowed));
            }} /> Ingat bahwa saya memakai Wi-Fi/LAN saat browser tidak dapat mengenali jenis koneksi</label>
          </div>
        )}
        {chapterProgressError && <p className="reader-episode-progress-error" role="status">Progres episode belum dapat diverifikasi. Muat ulang halaman untuk mencoba lagi; episode berikutnya dikunci sementara.</p>}
        {chapterListLoading ? (
          <div className="reader-detail-episode-skeletons" aria-label="Memuat episode">{[0, 1, 2].map((item) => <span className="reader-detail-skeleton" key={item} />)}</div>
        ) : chapters.length ? (
          <div className="reader-episode-list">
            {chapters.map((chapter) => {
              const index = chapters.findIndex((item) => item.id === chapter.id);
              const unlocked = isChapterUnlocked(index);
              const savedOfflineEpisode = offlineEpisodes.find((episode) => episode.chapterId === chapter.id);
              const savedForCurrentAccount = Boolean(userId && savedOfflineEpisode?.ownerId === userId);
              const validOfflineLicense = Boolean(savedOfflineEpisode && userId && isOfflineLicenseValid(savedOfflineEpisode, userId));
              const rowClass = `reader-episode-row${chapter.id === lastReadChapterId ? " reader-episode-last-read" : ""}${unlocked ? "" : " reader-episode-row-locked"}`;
              const content = (
                <>
                  <span className="reader-episode-number">EPISODE {String(chapter.chapter_number).padStart(2, "0")}</span>
                  <span className="reader-episode-title">
                    <strong>{chapter.title || `Episode ${chapter.chapter_number}`}</strong>
                    {chapter.id === lastReadChapterId && <small>Terakhir dibaca</small>}
                    {chapterReadStatuses[chapter.id] && (
                      <small className={`reader-episode-read-status reader-episode-read-status-${chapterReadStatuses[chapter.id]}`}>
                        {chapterReadStatuses[chapter.id] === "read"
                          ? <><CheckCircle2 size={13} /> Sudah dibaca</>
                          : <><CircleDot size={13} /> Sudah diakses</>}
                      </small>
                    )}
                    {chapter.published_at && <small className="reader-episode-date"><CalendarDays size={13} />{new Date(chapter.published_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</small>}
                  </span>
                  <span className="reader-episode-end-meta">
                    {chapter.chapter_number === latestChapterNumber && <span className="reader-episode-latest-badge">Terbaru</span>}
                    <ArrowRight className="reader-episode-arrow" size={17} />
                  </span>
                </>
              );
              return (
                <div className="reader-episode-entry" key={chapter.id}>
                  {unlocked
                    ? savedForCurrentAccount
                      ? <a className={rowClass} href={`/comic/${comic.slug}/chapter/${chapter.id}`}>{content}</a>
                      : <Link className={rowClass} href={`/comic/${comic.slug}/chapter/${chapter.id}`}>{content}</Link>
                    : <button className={rowClass} type="button" aria-label={`Episode ${chapter.chapter_number} terkunci`} onClick={() => setEpisodeSnackbar("Selesaikan episode sebelumnya")}>{content}</button>}
                  <div className="reader-episode-offline-actions">
                    {savedOfflineEpisode && (
                      <small className={validOfflineLicense ? "reader-offline-saved" : "reader-offline-locked"}>
                        {savedForCurrentAccount
                          ? validOfflineLicense ? "Tersimpan offline" : "Unduhan terkunci"
                          : "Unduhan akun lain"}
                      </small>
                    )}
                    {membership.ready && membership.verified && userId
                      && (membership.tier === "premium" || membership.tier === "vip") && (
                        <button
                          className="reader-offline-download"
                          type="button"
                          disabled={offlineDownloadId !== null}
                          onClick={() => void runOfflineDownload(chapter)}
                          aria-label={`${savedForCurrentAccount ? "Perbarui unduhan" : "Unduh"} episode ${chapter.chapter_number} untuk offline`}
                        >
                          {offlineDownloadId === chapter.id
                            ? <><LoaderCircle className="spin" size={15} /> Mengunduh…</>
                            : <><Download size={15} /> {savedForCurrentAccount ? "Perbarui" : "Unduh"}</>}
                        </button>
                      )}
                    {savedOfflineEpisode && (
                      <button className="reader-offline-remove" type="button" onClick={async () => {
                        if (!window.confirm(`Hapus unduhan Episode ${chapter.chapter_number} dari perangkat ini?`)) return;
                        try {
                        await removeOfflineEpisode(chapter.id);
                        setOfflineEpisodes(await getOfflineEpisodes());
                        setOfflineDownloadProgress("");
                        } catch (error) {
                        console.error("Unable to remove an offline episode:", error);
                        setOfflineDownloadError(error instanceof Error ? error.message : "Unduhan offline tidak dapat dihapus.");
                        }
                      }} aria-label={`Hapus unduhan episode ${chapter.chapter_number}`}>
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : chapterLoadError
          ? <div className="reader-empty-state"><p>Tidak dapat memuat episode.</p><button type="button" onClick={() => window.location.reload()}>Coba lagi</button></div>
          : <div className="reader-empty-state"><p>Belum ada episode yang diterbitkan.</p></div>}
        {offlineDownloadProgress && <p className="reader-offline-progress" role="status">{offlineDownloadProgress}</p>}
        {offlineDownloadError && <p className="reader-episode-progress-error" role="alert">{offlineDownloadError}</p>}
        {offlineReplacementChapter && (
          <div className="reader-share-backdrop" role="presentation" onClick={() => setOfflineReplacementChapter(null)}>
            <section className="reader-offline-replace-dialog" role="dialog" aria-modal="true" aria-labelledby="reader-offline-replace-title" onClick={(event) => event.stopPropagation()}>
              <button className="reader-share-close" type="button" aria-label="Tutup pilihan penggantian" onClick={() => setOfflineReplacementChapter(null)}><X size={19} /></button>
              <p className="reader-section-kicker">BATAS {OFFLINE_EPISODE_LIMIT} EPISODE</p>
              <h2 id="reader-offline-replace-title">Pilih unduhan yang akan diganti</h2>
              <p>Episode baru baru akan menggantikan pilihanmu setelah seluruh halamannya berhasil diunduh dan disimpan.</p>
              <div className="reader-offline-replacement-list">
                {offlineEpisodes.map((episode) => (
                  <button key={episode.chapterId} type="button" disabled={offlineDownloadId !== null} onClick={() => void runOfflineDownload(offlineReplacementChapter, episode.chapterId)}>
                    <span><strong>{episode.comicTitle}</strong><small>Episode {episode.chapterNumber}: {episode.chapterTitle} · {formatOfflineSize(episode.sizeBytes)}{episode.ownerId === userId ? "" : " · akun lain"}</small></span>
                    <span>Ganti</span>
                  </button>
                ))}
              </div>
              <button className="reader-offline-cancel" type="button" onClick={() => setOfflineReplacementChapter(null)}>Batal</button>
            </section>
          </div>
        )}
      </section>
      <section className="reader-about-comic" aria-labelledby="reader-about-title">
        <div className="reader-section-heading"><div><p className="reader-section-kicker">INFORMASI CERITA</p><h2 id="reader-about-title">Tentang komik</h2></div></div>
        <dl className="reader-comic-metadata">
          <div><dt>Teknik produksi</dt><dd>{getMetadataLabel(PRODUCTION_TECHNIQUES, comic.production_technique || "traditional_drawing", "Gambar tradisional")}</dd></div>
          <div><dt>Status</dt><dd>{getMetadataLabel(STORY_STATUSES, comic.story_status || "ongoing", "Berjalan")}</dd></div>
          <div><dt>Target pembaca</dt><dd>{getMetadataLabel(TARGET_AUDIENCES, comic.target_audience || "all_ages", "Semua umur")}</dd></div>
          <div><dt>Bahasa</dt><dd>{comic.language === "id" ? "Bahasa Indonesia" : comic.language === "en" ? "Bahasa Inggris" : comic.language || "Bahasa Indonesia"}</dd></div>
          <div><dt>Asal karya</dt><dd>{getMetadataLabel(ORIGIN_TYPES, comic.origin_type || "original", "Karya orisinal")}{comic.origin_type === "adaptation" && comic.source_info ? ` · Sumber: ${comic.source_info}` : ""}</dd></div>
          <div className="reader-comic-metadata-access"><dt>Akses</dt><dd>Gratis</dd></div>
          {credits.map((credit, index) => <div key={`${credit.role}-${index}`}><dt>{credit.role}</dt><dd>{credit.name}</dd></div>)}
        </dl>
      </section>
      <footer className="reader-footer">
        <BrandLogo className="wordmark reader-wordmark" />
        <p>Tempat cerita Indonesia menemukan pembacanya.</p>
        <PlatformLinks />
        <Link href="/">Jelajahi komik <ArrowRight size={15} /></Link>
        <Link href="/syarat-ketentuan">Syarat layanan</Link>
      </footer>
      {stickyReadVisible && firstChapter && (
        <aside className="reader-sticky-read" aria-label="Lanjutkan membaca">
          <span className="reader-sticky-read-episode">Episode {String(firstChapter.chapter_number).padStart(2, "0")}</span>
          <Link className="reader-sticky-read-action" href={`/comic/${comic.slug}/chapter/${firstChapter.id}`}><BookOpen size={17} />{resumeChapter ? "Lanjutkan" : "Mulai baca"}<ArrowRight size={16} /></Link>
          <button type="button" className="reader-sticky-read-dismiss" aria-label="Tutup tombol baca" onClick={() => { setStickyReadDismissed(true); setStickyReadVisible(false); }}><X size={17} /></button>
        </aside>
      )}
      {episodeSnackbar && <div className="reader-episode-snackbar" role="status" aria-live="polite">{episodeSnackbar}</div>}
    </main>
  );
}
