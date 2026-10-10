"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, Clock3, List, LoaderCircle, LockKeyhole, Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SponsoredAd from "@/components/sponsored-ad";
import DeviceUnavailableNotice from "@/components/device-unavailable-notice";
import { useCurrentDevice } from "@/components/use-current-device";
import { COMIC_TARGET_DEVICES, isComicAvailableOnDevice, type ComicTargetDevice } from "@/lib/comic-target-device";
import { useReaderMembership } from "@/app/membership-runtime";

const supabase = createClient();
const TRANSITION_AD_LOAD_TIMEOUT_MS = 2000;
const BOOK_TURN_SPREAD_COMMIT_DELAY_MS = 340;

type Page = { id: string; page_number: number; object_key: string };
type Chapter = { id: string; title: string; chapter_number: number; comic_id: string };
type Comic = { id: string; title: string; slug: string; target_device: ComicTargetDevice };
type BookLeaf = { kind: "page"; page: Page; pageIndex: number } | { kind: "ad"; afterPageIndex: number } | { kind: "blank" } | { kind: "end" };
type BookTurn = { from: number; to: number; direction: "next" | "previous" };
export type ChapterReaderSeed = { chapter: Chapter; comic: Comic };

function getDesktopBookLeaves(pages: Page[], includeAds: boolean): BookLeaf[] {
  const leaves: BookLeaf[] = pages.flatMap((page, pageIndex) => [
    { kind: "page" as const, page, pageIndex },
    ...(includeAds && (pageIndex + 1) % 5 === 0 && pageIndex < pages.length - 1
      ? [{ kind: "ad" as const, afterPageIndex: pageIndex }]
      : []),
  ]);
  if (leaves.length % 2 !== 0) leaves.push({ kind: "blank" });
  if (pages.length) leaves.push({ kind: "end" });
  return leaves;
}

export default function ChapterReaderPage({ seed }: { seed: ChapterReaderSeed }) {
  const { slug, chapterId } = useParams<{ slug: string; chapterId: string }>();
  const router = useRouter();
  const currentDevice = useCurrentDevice();
  const membership = useReaderMembership();
  const [chapter, setChapter] = useState<Chapter | null>(seed.chapter);
  const [comic, setComic] = useState<Comic | null>(seed.comic);
  const [chapterList, setChapterList] = useState<Chapter[]>([]);
  const [firstIncompleteChapterIndex, setFirstIncompleteChapterIndex] = useState(-1);
  const [allChaptersRead, setAllChaptersRead] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [readPageIds, setReadPageIds] = useState<Set<string>>(() => new Set());
  const [currentPage, setCurrentPage] = useState(0);
  const [bookSpreadIndex, setBookSpreadIndex] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [watermarkName, setWatermarkName] = useState("Pembaca");
  const [historyReady, setHistoryReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [pageLoadError, setPageLoadError] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [bookTurn, setBookTurn] = useState<BookTurn | null>(null);
  const [bookTurnSpreadChanging, setBookTurnSpreadChanging] = useState(false);
  const [pendingChapterHref, setPendingChapterHref] = useState<string | null>(null);
  const [transitionAdAvailable, setTransitionAdAvailable] = useState<boolean | null>(null);
  const [transitionCountdown, setTransitionCountdown] = useState<number | null>(null);
  const [transitionDeadline, setTransitionDeadline] = useState<number | null>(null);
  const lastScrollY = useRef(0);
  const bookTurnInProgressRef = useRef(false);
  const bookTurnSpreadCommitTimeoutRef = useRef<number | null>(null);
  const pagesContainerRef = useRef<HTMLElement>(null);
  const watermarkLabel = `MU-KOMIK.COM · ${watermarkName}`;
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  const desktopBookMode = currentDevice === "desktop"
    && (comic?.target_device ?? seed.comic.target_device) === "desktop";
  const bookLeaves = useMemo(
    () => getDesktopBookLeaves(pages, membership.ready && membership.tier === "free"),
    [membership.ready, membership.tier, pages],
  );

  useEffect(() => {
    const blockReaderShortcuts = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === "s" || key === "p") || event.key === "PrintScreen") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", blockReaderShortcuts, true);
    return () => window.removeEventListener("keydown", blockReaderShortcuts, true);
  }, []);

  useEffect(() => {
    let active = true;
    const loadChapter = async () => {
      if (currentDevice === null || !membership.ready) return;
      if (!isComicAvailableOnDevice(seed.comic.target_device, currentDevice)) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMessage("");
      if (bookTurnSpreadCommitTimeoutRef.current !== null) {
        window.clearTimeout(bookTurnSpreadCommitTimeoutRef.current);
        bookTurnSpreadCommitTimeoutRef.current = null;
      }
      setBookTurn(null);
      setBookTurnSpreadChanging(false);
      bookTurnInProgressRef.current = false;
      setHistoryReady(false);
      setReadPageIds(new Set());
      const { data: chapterData, error: chapterError } = await supabase
        .from("chapters")
        .select("id, title, chapter_number, comic_id")
        .eq("id", chapterId)
        .maybeSingle();
      if (chapterError || !chapterData) {
        if (chapterError) console.error("Unable to load reader episode:", chapterError);
        if (active) {
          setErrorMessage(chapterError ? "Episode belum dapat dimuat. Periksa koneksi lalu coba lagi." : "Episode tidak ditemukan.");
          setLoading(false);
        }
        return;
      }
      let { data: comicData, error: comicError } = await supabase
        .from("comics")
        .select("id, title, slug, target_device")
        .eq("id", chapterData.comic_id)
        .eq("slug", slug)
        .maybeSingle();
      if (comicError?.code === "42703") {
        const legacyComic = await supabase
          .from("comics")
          .select("id, title, slug")
          .eq("id", chapterData.comic_id)
          .eq("slug", slug)
          .maybeSingle();
        comicData = legacyComic.data as typeof comicData;
        comicError = legacyComic.error;
      }
      if (comicError || !comicData) {
        if (comicError) console.error("Unable to load the reader comic:", comicError);
        if (active) {
          setErrorMessage(comicError ? "Komik belum dapat dimuat. Periksa koneksi lalu coba lagi." : "Episode ini bukan bagian dari komik tersebut.");
          setLoading(false);
        }
        return;
      }
      comicData = { ...comicData, target_device: comicData.target_device || seed.comic.target_device || "all" };
      if (!isComicAvailableOnDevice(comicData.target_device, currentDevice)) {
        if (active) {
          setComic(comicData);
          setLoading(false);
        }
        return;
      }

      const [{ data: chapters, error: chaptersError }, { data: sessionData, error: sessionError }] = await Promise.all([
        supabase.from("chapters").select("id, title, chapter_number, comic_id").eq("comic_id", chapterData.comic_id).not("published_at", "is", null).order("chapter_number"),
        supabase.auth.getSession(),
      ]);
      if (chaptersError) console.error("Unable to load comic episode navigation:", chaptersError);
      if (sessionError) console.error("Unable to check the current auth session:", sessionError);
      if (!active) return;
      if (sessionError) {
        setComic(comicData);
        setErrorMessage("Urutan episode belum dapat diverifikasi. Periksa koneksi lalu coba lagi.");
        setLoading(false);
        return;
      }

      if (chaptersError || !chapters?.length) {
        if (active) {
          setComic(comicData);
          setErrorMessage("Urutan episode belum dapat diverifikasi. Periksa koneksi lalu coba lagi.");
          setLoading(false);
        }
        return;
      }

      const targetChapterIndex = chapters.findIndex((item) => item.id === chapterId);
      if (targetChapterIndex < 0) {
        if (active) {
          setComic(comicData);
          setErrorMessage("Episode ini belum diterbitkan atau bukan bagian dari daftar episode.");
          setLoading(false);
        }
        return;
      }

      const chapterIds = chapters.map((item) => item.id);
      const currentUserId = sessionData.session?.user.id ?? null;
      const [{ data: allPageData, error: allPagesError }, { data: history, error: historyError }, { data: profile, error: profileError }] = await Promise.all([
        supabase.from("pages").select("id, chapter_id, page_number, object_key").in("chapter_id", chapterIds).order("page_number"),
        currentUserId
          ? supabase.from("reading_history").select("chapter_id, last_page").eq("user_id", currentUserId).in("chapter_id", chapterIds)
          : Promise.resolve({ data: [], error: null }),
        currentUserId
          ? supabase.from("profiles").select("display_name").eq("id", currentUserId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (allPagesError) console.error("Unable to verify episode reading order:", allPagesError);
      if (historyError) console.error("Unable to load episode reading progress:", historyError);
      if (profileError) console.error("Unable to load reader watermark name:", profileError);
      if (!active) return;
      setWatermarkName(profile?.display_name?.trim().slice(0, 32) || "Pembaca");
      if (allPagesError || historyError) {
        setComic(comicData);
        setErrorMessage("Urutan episode belum dapat diverifikasi. Periksa koneksi lalu coba lagi.");
        setLoading(false);
        return;
      }

      const pagesByChapter = new Map<string, Page[]>();
      for (const page of allPageData ?? []) {
        const chapterPages = pagesByChapter.get(page.chapter_id) ?? [];
        chapterPages.push({ id: page.id, page_number: page.page_number, object_key: page.object_key });
        pagesByChapter.set(page.chapter_id, chapterPages);
      }
      const historyByChapter = new Map<string, number>();
      for (const entry of history ?? []) historyByChapter.set(entry.chapter_id, entry.last_page);

      const savedPagesByChapter = new Map<string, Set<string>>();
      for (const item of chapters) {
        const chapterPages = pagesByChapter.get(item.id) ?? [];
        const pageIds = new Set(chapterPages.map((page) => page.id));
        const savedPages = new Set<string>();
        try {
          const storedPages = localStorage.getItem(`mu-komik:read-pages:${item.id}`);
          const parsedPages: unknown = storedPages ? JSON.parse(storedPages) : [];
          if (Array.isArray(parsedPages)) {
            parsedPages.forEach((pageId) => {
              if (typeof pageId === "string" && pageIds.has(pageId)) savedPages.add(pageId);
            });
          }
        } catch (error) {
          console.error("Unable to restore read page markers:", error);
        }
        chapterPages.slice(0, historyByChapter.get(item.id) ?? 0).forEach((page) => savedPages.add(page.id));
        savedPagesByChapter.set(item.id, savedPages);
      }

      const firstIncompleteIndex = chapters.findIndex((item) => {
        const chapterPages = pagesByChapter.get(item.id) ?? [];
        return chapterPages.length === 0 || (savedPagesByChapter.get(item.id)?.size ?? 0) < chapterPages.length;
      });
      const completedEveryChapter = firstIncompleteIndex < 0;
      if (membership.tier !== "vip" && !completedEveryChapter && targetChapterIndex > firstIncompleteIndex) {
        const firstIncompleteChapter = chapters[firstIncompleteIndex];
        router.replace(`/comic/${comicData.slug}/chapter/${firstIncompleteChapter.id}`);
        return;
      }

      const pageData = pagesByChapter.get(chapterId) ?? [];
      const savedReadPages = savedPagesByChapter.get(chapterId) ?? new Set<string>();
      const savedLastPage = historyByChapter.get(chapterId);
      const resumePage = savedLastPage
        ? Math.max(0, Math.min(pageData.length - 1, savedLastPage - 1))
        : -1;
      const useDesktopBook = currentDevice === "desktop" && comicData.target_device === "desktop";
      const readerResumePage = useDesktopBook ? Math.max(0, resumePage) : resumePage;
      const initialBookLeaves = useDesktopBook
        ? getDesktopBookLeaves(pageData, membership.tier === "free")
        : [];
      const resumeLeafIndex = useDesktopBook
        ? Math.max(0, initialBookLeaves.findIndex((leaf) => leaf.kind === "page" && leaf.pageIndex === readerResumePage))
        : 0;
      const initialSpreadIndex = Math.floor(resumeLeafIndex / 2);
      if (useDesktopBook) {
        initialBookLeaves.slice(initialSpreadIndex * 2, initialSpreadIndex * 2 + 2)
          .forEach((leaf) => {
            if (leaf.kind === "page") savedReadPages.add(leaf.page.id);
          });
      }
      const initialCurrentPage = useDesktopBook
        ? initialBookLeaves.slice(initialSpreadIndex * 2, initialSpreadIndex * 2 + 2)
          .find((leaf): leaf is Extract<BookLeaf, { kind: "page" }> => leaf.kind === "page")?.pageIndex ?? readerResumePage
        : readerResumePage;

      setChapter(chapterData);
      setComic(comicData);
      setPages(pageData);
      setPageLoadError(false);
      setChapterList(chapters);
      setFirstIncompleteChapterIndex(firstIncompleteIndex);
      setAllChaptersRead(completedEveryChapter);
      setUserId(currentUserId);
      setBookSpreadIndex(initialSpreadIndex);
      if (initialCurrentPage >= 0) {
        setCurrentPage(initialCurrentPage);
        if (!(currentDevice === "desktop" && comicData.target_device === "desktop")) {
          window.requestAnimationFrame(() => {
            document.querySelector(`[data-reader-page="${initialCurrentPage}"]`)?.scrollIntoView({ block: "start" });
          });
        }
      } else {
        setCurrentPage(0);
      }
      setReadPageIds(savedReadPages);
      setHistoryReady(true);
      setLoading(false);
    };
    void loadChapter();
    return () => {
      active = false;
      if (bookTurnSpreadCommitTimeoutRef.current !== null) {
        window.clearTimeout(bookTurnSpreadCommitTimeoutRef.current);
        bookTurnSpreadCommitTimeoutRef.current = null;
      }
    };
  }, [chapterId, currentDevice, membership.ready, membership.tier, router, seed.comic.target_device, slug]);

  useEffect(() => {
    if (loading || !chapter || !pages.length) return;
    let active = true;
    const recordChapterView = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) console.error("Unable to check auth before recording a chapter view:", sessionError);
        if (!active) return;
        const response = await fetch("/api/analytics/chapter-view", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(sessionData.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
          },
          body: JSON.stringify({ chapterId: chapter.id }),
          cache: "no-store",
        });
        if (!response.ok) {
          const responseBody = await response.json().catch(() => null) as { error?: unknown } | null;
          console.warn("Unable to record chapter view:", {
            status: response.status,
            reason: typeof responseBody?.error === "string" ? responseBody.error : "Analytics endpoint returned an empty error",
          });
        }
      } catch (error) {
        console.error("Unable to record chapter view:", error);
      }
    };
    void recordChapterView();
    return () => { active = false; };
  }, [chapter, loading, pages.length]);

  useEffect(() => {
    if (loading || !pages.length) return;
    if (desktopBookMode) return;
    const visibleRatios = new Map<Element, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleRatios.set(entry.target, entry.intersectionRatio);
        else visibleRatios.delete(entry.target);
      }
      const visiblePage = [...visibleRatios.entries()]
        .sort((left, right) => right[1] - left[1])[0]?.[0];
      const index = Number(visiblePage?.getAttribute("data-reader-page"));
      if (Number.isInteger(index)) {
        setCurrentPage(index);
        const pageId = pages[index]?.id;
        if (pageId) {
          setReadPageIds((current) => {
            if (current.has(pageId)) return current;
            return new Set(current).add(pageId);
          });
        }
      }
    }, { threshold: [0.05, 0.1, 0.25, 0.5, 0.75] });
    document.querySelectorAll("[data-reader-page]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [currentPage, desktopBookMode, loading, pages]);

  useEffect(() => {
    if (!chapter || readPageIds.size === 0) return;
    try {
      localStorage.setItem(`mu-komik:read-pages:${chapter.id}`, JSON.stringify([...readPageIds]));
    } catch (error) {
      console.error("Unable to save read page markers:", error);
    }
  }, [chapter, readPageIds]);

  const scrollToPage = useCallback((index: number) => {
    const requestedIndex = Math.max(0, Math.min(pages.length - 1, index));
    if (desktopBookMode) {
      const spreadCount = Math.ceil(bookLeaves.length / 2);
      const direction = index >= pages.length ? 1 : index < currentPage ? -1 : 1;
      const targetSpread = Math.max(0, Math.min(
        spreadCount - 1,
        bookSpreadIndex + direction,
      ));
      if (targetSpread === bookSpreadIndex || bookTurnInProgressRef.current) return;
      bookTurnInProgressRef.current = true;
      setControlsVisible(true);
      setBookTurnSpreadChanging(false);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setBookSpreadIndex(targetSpread);
        setBookTurnSpreadChanging(true);
      } else {
        bookTurnSpreadCommitTimeoutRef.current = window.setTimeout(() => {
          setBookSpreadIndex(targetSpread);
          setBookTurnSpreadChanging(true);
          bookTurnSpreadCommitTimeoutRef.current = null;
        }, BOOK_TURN_SPREAD_COMMIT_DELAY_MS);
      }
      setBookTurn({
        from: bookSpreadIndex,
        to: targetSpread,
        direction: targetSpread > bookSpreadIndex ? "next" : "previous",
      });
      return;
    }
    const targetIndex = requestedIndex;
    setCurrentPage(targetIndex);
    document.querySelector(`[data-reader-page="${targetIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [bookLeaves.length, bookSpreadIndex, currentPage, desktopBookMode, pages.length]);

  const finishBookTurn = useCallback(() => {
    if (!bookTurn) return;
    if (bookTurnSpreadCommitTimeoutRef.current !== null) {
      window.clearTimeout(bookTurnSpreadCommitTimeoutRef.current);
      bookTurnSpreadCommitTimeoutRef.current = null;
    }
    setBookSpreadIndex(bookTurn.to);
    setBookTurnSpreadChanging(false);
    const visibleLeaves = bookLeaves.slice(bookTurn.to * 2, bookTurn.to * 2 + 2);
    const visiblePages = visibleLeaves.flatMap((leaf) => leaf.kind === "page" ? [leaf] : []);
    const firstVisiblePage = visiblePages[0]?.pageIndex;
    if (firstVisiblePage !== undefined) setCurrentPage(firstVisiblePage);
    setReadPageIds((current) => {
      const next = new Set(current);
      visiblePages.forEach((leaf) => next.add(leaf.page.id));
      return next.size === current.size ? current : next;
    });
    setBookTurn(null);
    bookTurnInProgressRef.current = false;
  }, [bookLeaves, bookTurn]);

  useEffect(() => {
    if (loading || !pages.length) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setControlsVisible(false);
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      event.preventDefault();
      setControlsVisible(true);
      const direction = event.key === "ArrowRight" ? 1 : -1;
      scrollToPage(currentPage + direction);
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [currentPage, loading, pages.length, scrollToPage]);

  useEffect(() => {
    if (loading || !pages.length) return;
    lastScrollY.current = window.scrollY;
    let animationFrame = 0;
    const handleScroll = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        const scrollDelta = currentScrollY - lastScrollY.current;
        if (currentScrollY < 90 || scrollDelta < -8) {
          setControlsVisible(true);
        } else if (scrollDelta > 8) {
          setControlsVisible(false);
        }
        lastScrollY.current = currentScrollY;
        animationFrame = 0;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [loading, pages.length]);

  useEffect(() => {
    if (!userId || !historyReady || !chapter || !pages.length) return;
    const timer = window.setTimeout(async () => {
      const spreadPages = desktopBookMode
        ? bookLeaves.slice(bookSpreadIndex * 2, bookSpreadIndex * 2 + 2)
          .flatMap((leaf) => leaf.kind === "page" ? [leaf.pageIndex] : [])
        : [currentPage];
      const lastReadPage = spreadPages.length ? Math.max(...spreadPages) + 1 : currentPage + 1;
      const { error } = await supabase.from("reading_history").upsert({
        user_id: userId,
        chapter_id: chapter.id,
        last_page: Math.min(pages.length, lastReadPage),
        updated_at: new Date().toISOString(),
      });
      if (error) console.error("Unable to save reading progress:", error);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [bookLeaves, bookSpreadIndex, chapter, currentPage, desktopBookMode, historyReady, pages.length, userId]);

  const reportTransitionAdAvailability = useCallback((available: boolean) => {
    setTransitionAdAvailable(available);
    if (available) {
      setTransitionCountdown(5);
      setTransitionDeadline(Date.now() + 5000);
    } else {
      setTransitionDeadline(null);
    }
  }, []);

  const requestChapterTransition = (href: string) => {
    setPendingChapterHref(href);
    setTransitionAdAvailable(null);
    setTransitionCountdown(null);
    setTransitionDeadline(null);
  };

  useEffect(() => {
    if (!pendingChapterHref) return;
    if (transitionAdAvailable === false) {
      router.push(pendingChapterHref);
      return;
    }
    if (transitionAdAvailable === null) {
      const target = pendingChapterHref;
      const timer = window.setTimeout(() => {
        console.warn("Episode transition ad did not load in time; continuing without the ad.");
        setPendingChapterHref(null);
        router.push(target);
      }, TRANSITION_AD_LOAD_TIMEOUT_MS);
      return () => window.clearTimeout(timer);
    }
    if (transitionDeadline === null) return;

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((transitionDeadline - Date.now()) / 1000));
      setTransitionCountdown(remaining);
      if (remaining === 0) window.clearInterval(timer);
    };
    const timer = window.setInterval(updateCountdown, 100);
    return () => window.clearInterval(timer);
  }, [pendingChapterHref, router, transitionAdAvailable, transitionDeadline]);

  useEffect(() => {
    if (loading || !pages.length) return;
    const pagesContainer = pagesContainerRef.current;
    if (!pagesContainer) return;
    let start: { x: number; y: number; stopId: string } | null = null;
    const handleTouchStart = (event: globalThis.TouchEvent) => {
      if (event.touches.length !== 1 || !(event.target instanceof Element)) {
        start = null;
        return;
      }
      const stop = event.target.closest<HTMLElement>("[data-reader-stop]");
      const stopId = stop?.dataset.readerStop;
      if (!stopId) {
        start = null;
        return;
      }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY, stopId };
    };
    const handleTouchMove = (event: globalThis.TouchEvent) => {
      if (!start || event.touches.length !== 1) return;
      const deltaX = event.touches[0].clientX - start.x;
      const deltaY = start.y - event.touches[0].clientY;
      if (Math.abs(deltaY) >= 55 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2 && event.cancelable) {
        event.preventDefault();
      }
    };
    const handleTouchEnd = (event: globalThis.TouchEvent) => {
      const touchStart = start;
      start = null;
      if (!touchStart || event.changedTouches.length !== 1) return;
      const deltaX = event.changedTouches[0].clientX - touchStart.x;
      const deltaY = touchStart.y - event.changedTouches[0].clientY;
      if (Math.abs(deltaY) < 55 || Math.abs(deltaY) <= Math.abs(deltaX) * 1.2) return;
      const stops = Array.from(pagesContainer.querySelectorAll<HTMLElement>("[data-reader-stop]"));
      const startIndex = stops.findIndex((stop) => stop.dataset.readerStop === touchStart.stopId);
      const targetStop = stops[startIndex + (deltaY > 0 ? 1 : -1)];
      targetStop?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const handleTouchCancel = () => { start = null; };
    pagesContainer.addEventListener("touchstart", handleTouchStart, { passive: true });
    pagesContainer.addEventListener("touchmove", handleTouchMove, { passive: false });
    pagesContainer.addEventListener("touchend", handleTouchEnd);
    pagesContainer.addEventListener("touchcancel", handleTouchCancel);
    return () => {
      pagesContainer.removeEventListener("touchstart", handleTouchStart);
      pagesContainer.removeEventListener("touchmove", handleTouchMove);
      pagesContainer.removeEventListener("touchend", handleTouchEnd);
      pagesContainer.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [loading, pages.length]);

  if (currentDevice !== null && !isComicAvailableOnDevice(comic?.target_device ?? seed.comic.target_device, currentDevice)) {
    const targetLabel = COMIC_TARGET_DEVICES.find((device) => device.value === (comic?.target_device ?? seed.comic.target_device))?.label.toLowerCase() || "perangkat tertentu";
    return <DeviceUnavailableNotice deviceName={targetLabel} />;
  }
  if (currentDevice === null || loading) return (
    <main className="reader-loading">
      <h1>{comic?.title} Episode {chapter?.chapter_number}: {chapter?.title}</h1>
      <LoaderCircle className="spin" size={25} />
      <span>Menyiapkan halaman komik...</span>
    </main>
  );
  if (!chapter || !comic) {
    return <main className="reader-loading reader-error"><p>{errorMessage || "Episode tidak dapat dibuka."}</p><Link href={comic ? `/comic/${comic.slug}` : "/"}><ArrowLeft size={16} /> {comic ? "Kembali ke komik" : "Ke beranda"}</Link></main>;
  }

  const chapterIndex = chapterList.findIndex((item) => item.id === chapter.id);
  const previousChapter = chapterIndex > 0 ? chapterList[chapterIndex - 1] : null;
  const nextChapterCandidate = chapterIndex >= 0 && chapterIndex < chapterList.length - 1 ? chapterList[chapterIndex + 1] : null;
  const currentChapterRead = pages.length > 0 && readPageIds.size >= pages.length;
  const nextChapterUnlocked = Boolean(
    nextChapterCandidate &&
    (membership.tier === "vip" ||
      allChaptersRead ||
      chapterIndex + 1 <= firstIncompleteChapterIndex ||
      (chapterIndex === firstIncompleteChapterIndex && currentChapterRead)),
  );
  const nextChapter = nextChapterUnlocked ? nextChapterCandidate : null;
  const pageUrl = (page: Page) => publicUrl ? `${publicUrl.replace(/\/$/, "")}/${page.object_key}` : null;
  const activeBookLeaves = bookLeaves.slice(bookSpreadIndex * 2, bookSpreadIndex * 2 + 2);
  const turningFromLeaf = bookTurn
    ? bookLeaves[bookTurn.direction === "next" ? bookTurn.from * 2 + 1 : bookTurn.from * 2]
    : null;
  const turningToLeaf = bookTurn
    ? bookLeaves[bookTurn.direction === "next" ? bookTurn.to * 2 : bookTurn.to * 2 + 1]
    : null;
  const turningFromPageUrl = turningFromLeaf?.kind === "page" ? pageUrl(turningFromLeaf.page) : null;
  const turningToPageUrl = turningToLeaf?.kind === "page" ? pageUrl(turningToLeaf.page) : null;
  const displayedBookPageIndexes = activeBookLeaves.flatMap((leaf) => leaf.kind === "page" ? [leaf.pageIndex] : []);
  const displayedPageStart = desktopBookMode && displayedBookPageIndexes.length
    ? Math.min(...displayedBookPageIndexes) + 1
    : currentPage + 1;
  const displayedPageEnd = desktopBookMode && displayedBookPageIndexes.length
    ? Math.max(...displayedBookPageIndexes) + 1
    : currentPage + 1;
  const isEpisodeEndSpread = desktopBookMode && activeBookLeaves.some((leaf) => leaf.kind === "end");
  const chapterEndReached = desktopBookMode
    ? isEpisodeEndSpread
    : currentPage === pages.length - 1;
  const progressPage = Math.min(pages.length, displayedPageEnd);
  const canAdvancePage = desktopBookMode
    ? bookSpreadIndex + 1 < Math.ceil(bookLeaves.length / 2)
    : currentPage < pages.length - 1;
  const episodeEndContent = (
    <section className="reader-episode-end" aria-labelledby="reader-episode-end-title">
      <span className="reader-episode-end-kicker">EPISODE SELESAI</span>
      <h2 id="reader-episode-end-title">Sampai di sini untuk episode ini.</h2>
      <p>{nextChapter ? "Lanjutkan petualangannya di episode berikutnya." : nextChapterCandidate ? "Selesaikan semua halaman untuk membuka episode berikutnya." : "Kamu sudah membaca episode terbaru dari komik ini."}</p>
      <div className="reader-episode-end-actions">
        {previousChapter && <Link className="reader-episode-secondary-action" href={`/comic/${comic.slug}/chapter/${previousChapter.id}`} onClick={(event) => { event.preventDefault(); requestChapterTransition(`/comic/${comic.slug}/chapter/${previousChapter.id}`); }}><ChevronLeft size={17} /> Episode sebelumnya</Link>}
        {nextChapter
          ? <Link className="reader-episode-next-action" href={`/comic/${comic.slug}/chapter/${nextChapter.id}`} onClick={(event) => { event.preventDefault(); requestChapterTransition(`/comic/${comic.slug}/chapter/${nextChapter.id}`); }}>Baca episode berikutnya <ArrowRight size={18} /></Link>
          : nextChapterCandidate
            ? <span className="reader-episode-latest-label"><LockKeyhole size={15} /> Selesaikan episode ini untuk lanjut</span>
            : <span className="reader-episode-latest-label">Ini adalah episode terbaru</span>}
        <Link className="reader-episode-secondary-action" href={`/comic/${comic.slug}`}><BookOpen size={17} /> Kembali ke komik</Link>
      </div>
    </section>
  );

  return (
    <main
      className={`reader-experience${controlsVisible ? "" : " reader-controls-hidden"}`}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (!controlsVisible && !(event.target instanceof Element && event.target.closest("a, button, summary"))) {
          setControlsVisible(true);
        }
      }}
    >
      <header className="reader-experience-header">
        <Link className="reader-experience-back" href={`/comic/${comic.slug}`} aria-label="Kembali ke detail komik"><ArrowLeft size={19} /><span>{comic.title}</span></Link>
        <div className="reader-experience-chapter"><span>Episode {chapter.chapter_number}</span><strong>{chapter.title}</strong></div>
        <details className="reader-episode-menu">
          <summary aria-label="Daftar episode"><List size={19} /><ChevronDown size={14} /></summary>
          <div className="reader-episode-menu-popover">
            <p>Daftar episode</p>
            {chapterList.map((item, index) => {
              const unlocked = membership.tier === "vip" || allChaptersRead || index <= firstIncompleteChapterIndex || (index === firstIncompleteChapterIndex + 1 && chapterIndex === firstIncompleteChapterIndex && currentChapterRead);
              return unlocked
                ? <Link className={item.id === chapter.id ? "reader-menu-current" : ""} key={item.id} href={`/comic/${comic.slug}/chapter/${item.id}`} onClick={(event) => {
                    if (item.id !== chapter.id) {
                      event.preventDefault();
                      requestChapterTransition(`/comic/${comic.slug}/chapter/${item.id}`);
                    }
                  }}>Episode {item.chapter_number} · {item.title}</Link>
                : <span className="reader-menu-locked" key={item.id}><LockKeyhole size={13} /> Episode {item.chapter_number} · {item.title}</span>;
            })}
          </div>
        </details>
      </header>
      <h1 className="reader-sr-only">{comic.title} Episode {chapter.chapter_number}: {chapter.title}</h1>

      <div className="reader-progress-track" role="progressbar" aria-label="Progres membaca" aria-valuemin={0} aria-valuemax={pages.length} aria-valuenow={pages.length ? displayedPageEnd : 0}>
        <span style={{ width: pages.length ? `${(progressPage / pages.length) * 100}%` : "0%" }} />
      </div>

      {pages.length ? (
        <section
          ref={pagesContainerRef}
          className={`reader-vertical-pages${desktopBookMode ? " reader-book-mode" : ""}`}
          aria-label={`${chapter.title}, ${pages.length} halaman`}
        >
          {desktopBookMode ? (
            <>
              <div
                className="reader-book-stage"
                aria-label={isEpisodeEndSpread ? `Penutup episode ${chapter.chapter_number}` : `Buku komik, halaman ${displayedPageStart} sampai ${displayedPageEnd} dari ${pages.length}`}
                onClick={(event) => {
                  if (bookTurn || event.target instanceof Element && event.target.closest("a, button")) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  scrollToPage(currentPage + (event.clientX < bounds.left + bounds.width / 2 ? -1 : 1));
                }}
              >
                {bookTurnSpreadChanging && bookTurn && (
                  <div className="reader-book-spread reader-book-spread-fade-out" aria-hidden="true">
                    {bookLeaves.slice(bookTurn.from * 2, bookTurn.from * 2 + 2).map((leaf, offset) => {
                      const page = leaf.kind === "page" ? leaf.page : null;
                      const src = page ? pageUrl(page) : null;
                      const leafKey = leaf.kind === "page" ? leaf.page.id : leaf.kind === "ad" ? `ad-after-${leaf.afterPageIndex}` : leaf.kind;
                      return (
                        <div className={`reader-book-paper${offset === 0 ? " reader-book-paper-left" : " reader-book-paper-right"}${leaf.kind === "ad" ? " reader-book-paper-ad" : ""}${leaf.kind === "end" ? " reader-book-paper-end" : ""}`} key={leafKey}>
                          {page && src && <img src={src} alt="" draggable={false} />}
                          {leaf.kind === "page" && <span className="reader-book-page-number">{leaf.page.page_number}</span>}
                          {leaf.kind === "end" && currentChapterRead && episodeEndContent}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className={`reader-book-spread${bookTurnSpreadChanging ? " reader-book-spread-fade-in" : ""}`}>
                  {activeBookLeaves.map((leaf, offset) => {
                    const page = leaf.kind === "page" ? leaf.page : null;
                    const src = page ? pageUrl(page) : null;
                    const leafKey = leaf.kind === "page" ? leaf.page.id : leaf.kind === "ad" ? `ad-after-${leaf.afterPageIndex}` : leaf.kind;
                    return (
                      <div className={`reader-book-paper${offset === 0 ? " reader-book-paper-left" : " reader-book-paper-right"}${leaf.kind === "ad" ? " reader-book-paper-ad" : ""}${leaf.kind === "end" ? " reader-book-paper-end" : ""}`} key={leafKey} data-reader-page={leaf.kind === "page" ? leaf.pageIndex : undefined}>
                        {leaf.kind === "ad" ? (
                          <SponsoredAd
                            slotKey="reader_mid_chapter"
                            placement="reader"
                            comicId={comic.id}
                            matchPageIndex={leaf.afterPageIndex}
                            readerStopId={`mid-chapter-ad-${pages[leaf.afterPageIndex]?.page_number ?? leaf.afterPageIndex + 1}`}
                            ctaOnly
                            fallback={
                              <div className="reader-book-house-ad">
                                <span className="reader-book-house-ad-icon"><BookOpen size={29} /></span>
                                <span className="reader-book-house-ad-kicker">RUANG IKLAN MU-KOMIK</span>
                                <strong>Bagikan ceritamu kepada pembaca.</strong>
                                <span className="reader-book-house-ad-description">Punya komik untuk diterbitkan? Bergabunglah sebagai kreator di MU-Komik.</span>
                                <Link className="reader-book-house-ad-link" href="/account/creator-application">Mulai berkarya <ArrowRight size={15} /></Link>
                              </div>
                            }
                          />
                        ) : leaf.kind === "end" ? (
                          currentChapterRead && <div data-reader-stop="episode-end">{episodeEndContent}</div>
                        ) : page && src ? (
                          <img
                            src={src}
                            alt={`${comic.title}, episode ${chapter.chapter_number}, halaman ${page.page_number}`}
                            draggable={false}
                          />
                        ) : page ? <div className="reader-image-error">Alamat media komik belum dikonfigurasi.</div> : null}
                        {leaf.kind === "page" && <span className="reader-book-page-number">{leaf.page.page_number}</span>}
                      </div>
                    );
                  })}
                </div>
                {bookTurn && (
                  <div
                    key={`${bookTurn.from}-${bookTurn.to}`}
                    className={`reader-book-turn reader-book-turn-${bookTurn.direction}`}
                    onAnimationEnd={(event) => {
                      if (event.target === event.currentTarget) finishBookTurn();
                    }}
                    aria-hidden="true"
                  >
                    <div className="reader-book-turn-face reader-book-turn-front">
                      {turningFromPageUrl && <img src={turningFromPageUrl} alt="" draggable={false} />}
                    </div>
                    <div className="reader-book-turn-face reader-book-turn-back">
                      {turningToPageUrl && <img src={turningToPageUrl} alt="" draggable={false} />}
                    </div>
                  </div>
                )}
                <div className="reader-watermark-overlay" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, index) => <span key={index}>{watermarkLabel}</span>)}
                </div>
                <span className="reader-book-spine" aria-hidden="true" />
              </div>
            </>
          ) : (
            <>
              {pages.map((page, index) => {
                const src = pageUrl(page);
                const pageIsRead = readPageIds.has(page.id);
                return (
                  <Fragment key={page.id}>
                    <div
                      className="reader-page-frame"
                      data-reader-page={index}
                      data-reader-stop={`page-${index}`}
                      aria-label={`Halaman ${page.page_number}, ${pageIsRead ? "sudah dibaca" : "belum dibaca"}`}
                    >
                      <span className={`reader-page-read-status${pageIsRead ? " reader-page-read-status-read" : ""}`} role="img" aria-label={pageIsRead ? "Sudah dibaca" : "Belum dibaca"}>
                        {pageIsRead ? <Check size={14} strokeWidth={3} /> : <Circle size={12} />}
                        <span>{pageIsRead ? "Dibaca" : "Belum dibaca"}</span>
                      </span>
                      {src
                        ? <img src={src} alt={`${comic.title}, episode ${chapter.chapter_number}, halaman ${page.page_number}`} loading={index < 2 ? "eager" : "lazy"} draggable={false} onClick={() => setControlsVisible(true)} />
                        : <div className="reader-image-error">Alamat media komik belum dikonfigurasi.</div>}
                      {src && <div className="reader-watermark-overlay reader-page-watermark" aria-hidden="true">{Array.from({ length: 6 }, (_, watermarkIndex) => <span key={watermarkIndex}>{watermarkLabel}</span>)}</div>}
                    </div>
                    {(index + 1) % 5 === 0 && index < pages.length - 1 && (
                      <SponsoredAd
                        key={`mid-chapter-ad-${page.page_number}`}
                        slotKey="reader_mid_chapter"
                        placement="reader"
                        comicId={comic.id}
                        matchPageIndex={index}
                        readerStopId={`mid-chapter-ad-${page.page_number}`}
                      />
                    )}
                  </Fragment>
                );
              })}
              {currentChapterRead && chapterEndReached && (
                <div className="reader-episode-end-page" data-reader-stop="episode-end">
                  {episodeEndContent}
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="reader-no-pages"><BookOpen size={28} /><h2>{pageLoadError ? "Halaman komik belum dapat dimuat." : "Episode ini belum memiliki halaman."}</h2><p>{pageLoadError ? "Periksa koneksi lalu muat ulang episode ini." : "Kembali lagi nanti untuk membaca cerita ini."}</p>{pageLoadError ? <button onClick={() => window.location.reload()}>Coba lagi</button> : <Link href={`/comic/${comic.slug}`}>Kembali ke komik</Link>}</section>
      )}

      <button className="reader-controls-toggle" onClick={() => setControlsVisible((visible) => !visible)} aria-label={controlsVisible ? "Sembunyikan kontrol" : "Tampilkan kontrol"}>
        {controlsVisible ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>

      {controlsVisible && pages.length > 0 && (
        <footer className="reader-experience-controls">
          <button onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 0} aria-label="Halaman sebelumnya"><ChevronLeft size={20} /><span>Sebelumnya</span></button>
          <span className="reader-page-count">{isEpisodeEndSpread ? "Penutup episode" : desktopBookMode && displayedPageEnd > displayedPageStart ? `${displayedPageStart}–${displayedPageEnd}` : displayedPageStart} {!isEpisodeEndSpread && <><i>/</i> {pages.length}</>}</span>
          {canAdvancePage
            ? <button onClick={() => scrollToPage(currentPage + 1)} aria-label="Halaman berikutnya"><span>Berikutnya</span><ChevronRight size={20} /></button>
            : nextChapter
              ? <Link href={`/comic/${comic.slug}/chapter/${nextChapter.id}`} onClick={(event) => { event.preventDefault(); requestChapterTransition(`/comic/${comic.slug}/chapter/${nextChapter.id}`); }}><span>Episode selanjutnya</span><ArrowRight size={19} /></Link>
              : <Link href={`/comic/${comic.slug}`}><span>Daftar episode</span><BookOpen size={18} /></Link>}
        </footer>
      )}

      {(previousChapter || nextChapter) && <nav className="reader-chapter-navigation" aria-label="Navigasi episode">
        {previousChapter
          ? <Link href={`/comic/${comic.slug}/chapter/${previousChapter.id}`} onClick={(event) => { event.preventDefault(); requestChapterTransition(`/comic/${comic.slug}/chapter/${previousChapter.id}`); }}><ChevronLeft size={17} /> Episode sebelumnya</Link>
          : <span />}
        {nextChapter && <Link href={`/comic/${comic.slug}/chapter/${nextChapter.id}`} onClick={(event) => { event.preventDefault(); requestChapterTransition(`/comic/${comic.slug}/chapter/${nextChapter.id}`); }}>Episode selanjutnya <ChevronRight size={17} /></Link>}
      </nav>}

      {pendingChapterHref && <div className="reader-transition-ad-backdrop">
        <section className="reader-transition-ad-dialog" role="dialog" aria-modal="true" aria-labelledby="reader-transition-ad-title">
          <h2 id="reader-transition-ad-title">Sebelum lanjut membaca</h2>
          {transitionAdAvailable === null && <div className="reader-transition-ad-loading"><LoaderCircle className="spin" size={20} /> Memuat iklan...</div>}
          <SponsoredAd
            slotKey="reader_episode_transition"
            placement="transition"
            comicId={comic.id}
            onCampaignAvailability={reportTransitionAdAvailability}
          />
          {transitionAdAvailable && transitionCountdown !== null && (
            transitionCountdown > 0
              ? <p className="reader-transition-ad-countdown"><Clock3 size={16} /> Bisa dilewati dalam {transitionCountdown} detik</p>
              : <button className="reader-episode-next-action" type="button" onClick={() => {
                  const target = pendingChapterHref;
                  setPendingChapterHref(null);
                  if (target) router.push(target);
                }}>Lanjut ke episode <ArrowRight size={18} /></button>
          )}
        </section>
      </div>}
    </main>
  );
}
