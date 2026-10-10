"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Bookmark, Compass, Eye, Heart, Palette, Pause, Play, Search, Share2, UserRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COMIC_GENRES, getComicGenreLabel } from "@/lib/comic-genres";
import BrandLogo from "@/components/brand-logo";
import PlatformLinks from "@/components/platform-links";
import SponsoredAd from "@/components/sponsored-ad";
import { usePlatformSettings } from "./platform-runtime";
import { useCurrentDevice } from "@/components/use-current-device";
import { isComicAvailableOnDevice } from "@/lib/comic-target-device";
import type { ContinueReading, HomepageCatalog, HomepageComic } from "@/lib/homepage-data";

const supabase = createClient();

type HomepagePromo = {
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

function comicGenre(genre: string) {
  return getComicGenreLabel(genre);
}

function formatEngagementCount(count: number) {
  return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(count);
}

function HomepagePromoCarousel({ promos }: { promos: HomepagePromo[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const currentIndex = promos.length ? activeIndex % promos.length : 0;
  const promo = promos[currentIndex];

  useEffect(() => {
    if (promos.length < 2 || paused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % promos.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [paused, promos.length]);

  if (!promo) {
    return (
      <section className="reader-welcome">
        <p className="reader-kicker">CERITA INDONESIA, DI SINI</p>
        <h2>Temukan kisah yang membuatmu betah membaca.</h2>
        <p>Jelajahi komik independen dan temukan cerita favorit berikutnya.</p>
        <Link className="reader-primary-button" href="#jelajah">Jelajahi komik <ArrowRight size={17} /></Link>
      </section>
    );
  }

  const promoLink = promo.destination_url.startsWith("/") && !promo.destination_url.startsWith("//")
    ? <Link className="reader-primary-button" href={promo.destination_url}>{promo.cta_label || "Selengkapnya"} <ArrowRight size={17} /></Link>
    : <a className="reader-primary-button" href={promo.destination_url} target="_blank" rel="noreferrer noopener">{promo.cta_label || "Selengkapnya"} <ArrowRight size={17} /></a>;

  return (
    <section className="reader-featured reader-promo-hero" aria-roledescription="carousel" aria-label="Promo pilihan">
      <picture className="reader-promo-background">
        {promo.image_url_mobile && <source media="(max-width: 640px)" srcSet={promo.image_url_mobile} />}
        {promo.image_url_tablet && <source media="(min-width: 641px) and (max-width: 1023px)" srcSet={promo.image_url_tablet} />}
        <Image src={promo.image_url} alt="" width={1920} height={720} unoptimized loading="eager" fetchPriority="high" />
      </picture>
      <div className="reader-promo-scrim" />
      <div className="reader-featured-copy reader-promo-copy" key={promo.id}>
        {promo.eyebrow && <span className="reader-kicker">{promo.eyebrow}</span>}
        <h2>{promo.title}</h2>
        {promo.description && <p className="reader-featured-synopsis">{promo.description}</p>}
        {promoLink}
      </div>
      {promos.length > 1 && <>
        <div className="reader-promo-controls" aria-label="Navigasi promo">
          <button type="button" aria-label={paused ? "Putar otomatis promo" : "Jeda otomatis promo"} aria-pressed={paused} onClick={() => setPaused((current) => !current)}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
          <button type="button" aria-label="Promo sebelumnya" onClick={() => setActiveIndex((currentIndex - 1 + promos.length) % promos.length)}><ArrowLeft size={18} /></button>
          <div className="reader-promo-dots">
            {promos.map((item, index) => <button key={item.id} type="button" aria-label={`Tampilkan promo ${index + 1}: ${item.title}`} aria-current={index === currentIndex} onClick={() => setActiveIndex(index)} />)}
          </div>
          <button type="button" aria-label="Promo berikutnya" onClick={() => setActiveIndex((currentIndex + 1) % promos.length)}><ArrowRight size={18} /></button>
        </div>
        <span className="reader-promo-count" aria-live="polite">{currentIndex + 1} / {promos.length}</span>
      </>}
    </section>
  );
}

function ComicCard({ comic, compact = false, overlayDetails = false, landscapeCard = false }: { comic: HomepageComic; compact?: boolean; overlayDetails?: boolean; landscapeCard?: boolean }) {
  const chapter = comic.latestChapter;
  const creatorProfile = comic.creatorHandle && comic.creatorProfilePublic
    ? `/kreator/${encodeURIComponent(comic.creatorHandle)}`
    : null;
  const comicInfo = (
    <div className="reader-comic-info">
      {!overlayDetails && <><span className="reader-card-genre">{comicGenre(comic.genre)}</span><h3>{comic.title}</h3></>}
      <div className={overlayDetails ? "reader-card-author" : undefined}>
        <p>{comic.contributor || comic.creator}</p>
        {overlayDetails && creatorProfile && <Link className="reader-card-creator-shortcut" href={creatorProfile} aria-label={`Lihat profil kreator ${comic.contributor || comic.creator}`} title="Profil kreator"><ArrowUpRight size={13} /></Link>}
      </div>
      {comic.engagement && (
        <div className="reader-card-engagement" aria-label={`Statistik ${comic.title}`}>
          <span aria-label={`${comic.engagement.views.toLocaleString("id-ID")} dilihat`} title="Dilihat"><Eye size={13} /><b>{formatEngagementCount(comic.engagement.views)}</b></span>
          <span aria-label={`${comic.engagement.likes.toLocaleString("id-ID")} favorit`} title="Favorit"><Heart size={13} /><b>{formatEngagementCount(comic.engagement.likes)}</b></span>
          <span aria-label={`${comic.engagement.shares.toLocaleString("id-ID")} dibagikan`} title="Dibagikan"><Share2 size={13} /><b>{formatEngagementCount(comic.engagement.shares)}</b></span>
        </div>
      )}
      {chapter && <span className="reader-card-latest">Terbaru · Episode {chapter.chapter_number}</span>}
    </div>
  );
  return (
    <article className={`reader-comic-card${compact ? " reader-comic-card-compact" : ""}${landscapeCard ? " reader-comic-card-landscape" : ""}`}>
      <Link href={`/comic/${comic.slug}`} className="reader-card-link" aria-label={`Buka ${comic.title}`}>
        <div className="reader-comic-cover">
          {comic.coverUrl
            ? <img src={comic.coverUrl} alt={`Sampul ${comic.title}`} loading="lazy" />
            : <span aria-hidden="true">{comic.title.slice(0, 2).toUpperCase()}</span>}
          {overlayDetails && <div className="reader-latest-cover-copy"><span>{comicGenre(comic.genre)}</span><h3>{comic.title}</h3></div>}
          {chapter && <span className="reader-cover-episode">Ep. {chapter.chapter_number}</span>}
        </div>
        {!overlayDetails && comicInfo}
      </Link>
      {overlayDetails && comicInfo}
      {!overlayDetails && creatorProfile && (
        <Link className="reader-creator-profile-link" href={creatorProfile}>Profil kreator <ArrowUpRight size={13} /></Link>
      )}
      {chapter && <Link className="reader-card-read" href={`/comic/${comic.slug}/chapter/${chapter.id}`}><BookOpen size={14} /> Baca <ArrowRight size={14} /></Link>}
    </article>
  );
}

export default function HomePageClient({
  comics: initialComics,
  catalogState: initialCatalogState,
  episodeLoadError: initialEpisodeLoadError,
}: HomepageCatalog) {
  const { settings } = usePlatformSettings();
  const currentDevice = useCurrentDevice();
  const router = useRouter();
  const comics = initialComics;
  const catalogState = initialCatalogState;
  const episodeLoadError = initialEpisodeLoadError;
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("all");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [continueReading, setContinueReading] = useState<ContinueReading | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [authRetry, setAuthRetry] = useState(0);
  const [homepagePromos, setHomepagePromos] = useState<HomepagePromo[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

  useEffect(() => {
    let cancelled = false;
    const loadPromos = async () => {
      const { data, error } = await supabase
        .from("homepage_promos")
        .select("id, eyebrow, title, description, image_url, image_url_tablet, image_url_mobile, cta_label, destination_url")
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Unable to load homepage promos. Run supabase/homepage-promos.sql if the table is missing:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        return;
      }
      if (!cancelled) setHomepagePromos((data ?? []) as HomepagePromo[]);
    };
    void loadPromos();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadHome = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("Unable to check the current auth session:", sessionError);
        if (active) setAuthMessage("Status masuk belum dapat diperiksa. Periksa koneksi lalu coba lagi.");
      }
      const session = sessionData.session;
      if (active) setSignedIn(Boolean(session?.user));

      if (session?.user) {
        const { data: history, error: historyError } = await supabase
          .from("reading_history")
          .select("last_page, chapter_id")
          .eq("user_id", session.user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (historyError) {
          console.error("Unable to load reading history:", {
            message: historyError.message,
            code: historyError.code,
            details: historyError.details,
            hint: historyError.hint,
          });
        } else if (history) {
          const { data: chapter, error: chapterError } = await supabase
            .from("chapters")
            .select("id, title, chapter_number, comic_id")
            .eq("id", history.chapter_id)
            .maybeSingle();
          if (chapterError) {
            console.error("Unable to load the chapter from reading history:", {
              message: chapterError.message,
              code: chapterError.code,
              details: chapterError.details,
              hint: chapterError.hint,
            });
          } else if (chapter) {
            let { data: historyComic, error: comicError } = await supabase
              .from("comics")
              .select("id, title, slug, synopsis, contributor, genre, cover_key, target_device, profiles!comics_creator_id_fkey(display_name)")
              .eq("id", chapter.comic_id)
              .maybeSingle();
            if (comicError?.code === "42703") {
              const legacyHistoryComic = await supabase
                .from("comics")
                .select("id, title, slug, synopsis, contributor, genre, cover_key, profiles!comics_creator_id_fkey(display_name)")
                .eq("id", chapter.comic_id)
                .maybeSingle();
              historyComic = legacyHistoryComic.data as typeof historyComic;
              comicError = legacyHistoryComic.error;
            }
            if (comicError) {
              console.error("Unable to load the comic from reading history:", {
                message: comicError.message,
                code: comicError.code,
                details: comicError.details,
                hint: comicError.hint,
              });
            } else if (historyComic) {
                const { count: pageCount, error: countError } = await supabase
                  .from("pages")
                  .select("id", { count: "exact", head: true })
                  .eq("chapter_id", history.chapter_id);
                if (countError) {
                  console.error("Unable to load reading progress total:", {
                    message: countError.message,
                    code: countError.code,
                    details: countError.details,
                    hint: countError.hint,
                  });
                }
                const profile = Array.isArray(historyComic.profiles) ? historyComic.profiles[0] : historyComic.profiles;
                const historyRecord: ContinueReading = {
                  comic: {
                    id: historyComic.id,
                    title: historyComic.title,
                    slug: historyComic.slug,
                    synopsis: historyComic.synopsis || "",
                    contributor: historyComic.contributor?.trim() || "",
                    genre: historyComic.genre,
                    target_device: historyComic.target_device || "all",
                    creator: profile?.display_name || "Kreator independen",
                    creatorHandle: null,
                    creatorProfilePublic: false,
                    coverUrl: historyComic.cover_key && publicUrl ? `${publicUrl.replace(/\/$/, "")}/${historyComic.cover_key}` : null,
                    latestChapter: null,
                    chapterCount: 0,
                    engagement: null,
                  },
                  chapterId: history.chapter_id,
                  chapterTitle: chapter.title,
                  chapterNumber: chapter.chapter_number,
                  lastPage: history.last_page,
                  pageCount: pageCount || 0,
                };
                if (active) setContinueReading(historyRecord);
            }
          }
        }
      } else if (active) {
        setContinueReading(null);
      }

    };

    void loadHome();
    return () => { active = false; };
  }, [authRetry, publicUrl]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user));
      if (!session?.user) setContinueReading(null);
      setAuthMessage("");
    });
    return () => subscription.unsubscribe();
  }, []);

  const visibleComics = useMemo(
    () => comics.filter((comic) => isComicAvailableOnDevice(comic.target_device, currentDevice)),
    [comics, currentDevice],
  );
  const genres = useMemo(() => ["all", ...new Set([
    ...COMIC_GENRES,
    ...visibleComics.map((comic) => comic.genre).filter(Boolean),
  ])], [visibleComics]);
  const searchedComics = useMemo(() => {
    const normalizedQuery = settings.feature_flags.search ? query.trim().toLocaleLowerCase("id-ID") : "";
    return visibleComics.filter((comic) => {
      const matchesGenre = genre === "all" || comic.genre === genre;
      const searchable = `${comic.title} ${comic.creator} ${comic.contributor} ${comic.genre}`.toLocaleLowerCase("id-ID");
      return matchesGenre && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [visibleComics, genre, query, settings.feature_flags.search]);
  const latestComics = [...visibleComics].filter((comic) => comic.latestChapter).sort((a, b) =>
    new Date(b.latestChapter?.published_at || 0).getTime() - new Date(a.latestChapter?.published_at || 0).getTime(),
  );
  const ongoingComics = [...visibleComics].sort((a, b) => b.chapterCount - a.chapterCount).filter((comic) => comic.chapterCount > 1);

  const focusSearch = () => {
    setMobileSearchOpen(true);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  return (
    <main className="reader-home">
    <h1 className="reader-sr-only">Baca komik Indonesia dari kreator lokal</h1>
    <header className="reader-header">
      <BrandLogo className="wordmark reader-wordmark" showName />
      <nav className="reader-nav-links" aria-label="Navigasi utama">
        <a className="reader-primary-nav-link" href="#jelajah">Jelajah</a>
        <a className="reader-primary-nav-link" href="#genre">Genre</a>
        {signedIn && settings.feature_flags.creators && <a href="#creator">Kreator</a>}
        {signedIn && <Link href="/account">Koleksi saya</Link>}
        {!signedIn && <Link href="/login">Masuk</Link>}
        </nav>
        {settings.feature_flags.search && <form className={`reader-header-search${mobileSearchOpen ? " reader-header-search-open" : ""}`} onSubmit={(event) => { event.preventDefault(); document.querySelector("#jelajah")?.scrollIntoView({ behavior: "smooth" }); }}>
          <Search size={17} aria-hidden="true" />
          <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari komik, kreator, genre..." aria-label="Cari komik, kreator, atau genre" />
          {mobileSearchOpen && <button type="button" className="reader-search-close" onClick={() => setMobileSearchOpen(false)} aria-label="Tutup pencarian"><X size={17} /></button>}
        </form>}
        <div className="reader-header-actions">
          {settings.feature_flags.search && <button className="reader-search-mobile" aria-label="Cari komik" onClick={focusSearch}><Search size={20} /></button>}
          {signedIn
            ? <Link className="reader-login-button" href="/account"><UserRound size={17} /><span>Profil</span></Link>
            : <Link className="reader-login-button" href="/login"><UserRound size={17} /><span>Masuk</span></Link>}
        </div>
      </header>
      <nav className="reader-bottom-nav" aria-label="Navigasi bawah">
        <a href="#jelajah"><Compass size={19} /><span>Jelajah</span></a>
        <Link href="/account" aria-label="Koleksi saya"><Bookmark size={19} /><span>Koleksi saya</span></Link>
        {settings.feature_flags.creators && <a href="#creator"><Palette size={19} /><span>Kreator</span></a>}
        {signedIn
          ? <Link href="/account" aria-label="Profil"><UserRound size={19} /><span>Profil</span></Link>
          : <Link href="/login" aria-label="Masuk"><UserRound size={19} /><span>Masuk</span></Link>}
      </nav>

      {authMessage && <div className="reader-inline-message" role="alert">{authMessage}<button onClick={() => setAuthRetry((attempt) => attempt + 1)}>Coba lagi</button></div>}

      <HomepagePromoCarousel promos={homepagePromos} />

      <section className="reader-home-section" id="terbaru">
        <div className="reader-home-content">
          <div className="reader-section-heading"><div><p className="reader-section-kicker">UPDATE TERKINI</p><h2>Episode terbaru</h2></div><a href="#jelajah">Jelajahi semua <ArrowUpRight size={16} /></a></div>
          {catalogState === "error" && <div className="reader-empty-state"><p>Komik belum dapat dimuat. Periksa koneksi lalu coba lagi.</p><button onClick={() => router.refresh()}>Coba lagi</button></div>}
          {catalogState === "empty" && <div className="reader-empty-state"><p>Belum ada cerita terbit. Kunjungi lagi nanti untuk menemukan komik baru.</p></div>}
          {catalogState === "ready" && episodeLoadError && <div className="reader-empty-state"><p>Episode terbaru belum dapat dimuat. Komik tetap bisa dijelajahi di bawah.</p><button onClick={() => router.refresh()}>Coba lagi</button></div>}
          {catalogState === "ready" && !episodeLoadError && latestComics.length > 0 && <div className="reader-comic-grid reader-latest-comic-grid">{latestComics.slice(0, 8).map((comic) => <ComicCard key={comic.id} comic={comic} compact overlayDetails />)}</div>}
          {catalogState === "ready" && !episodeLoadError && latestComics.length === 0 && <div className="reader-empty-state"><p>Belum ada episode terbit. Jelajahi komik dan nantikan update berikutnya.</p><a href="#jelajah">Lihat semua komik <ArrowRight size={16} /></a></div>}
        </div>
      </section>

      <div className="reader-home-content">
        {signedIn && continueReading && isComicAvailableOnDevice(continueReading.comic.target_device, currentDevice) && (
          <section className="reader-home-section reader-continue-section">
            <div className="reader-section-heading"><div><p className="reader-section-kicker">KEMBALI KE CERITAMU</p><h2>Lanjutkan membaca</h2></div></div>
            <Link className="reader-continue-card" href={`/comic/${continueReading.comic.slug}/chapter/${continueReading.chapterId}`}>
              <div className="reader-continue-cover">{continueReading.comic.coverUrl && <img src={continueReading.comic.coverUrl} alt="" loading="lazy" />}</div>
              <div className="reader-continue-info"><span>{comicGenre(continueReading.comic.genre)}</span><h3>{continueReading.comic.title}</h3><p>Episode {continueReading.chapterNumber} · {continueReading.chapterTitle}</p><span className="reader-continue-progress">Terakhir dibaca di halaman {continueReading.lastPage}{continueReading.pageCount ? ` dari ${continueReading.pageCount}` : ""}</span>{continueReading.pageCount > 0 && <span className="reader-continue-progressbar" role="progressbar" aria-label="Progres membaca" aria-valuemin={0} aria-valuemax={continueReading.pageCount} aria-valuenow={Math.min(continueReading.pageCount, continueReading.lastPage)}><i style={{ width: `${Math.min(100, (continueReading.lastPage / continueReading.pageCount) * 100)}%` }} /></span>}</div>
              <span className="reader-continue-action">Lanjutkan <ArrowRight size={17} /></span>
            </Link>
          </section>
        )}

        <SponsoredAd slotKey="home_banner" placement="home" />

        {ongoingComics.length > 0 && (
          <section className="reader-home-section">
            <div className="reader-section-heading"><div><p className="reader-section-kicker">SERIAL YANG TERUS BERLANJUT</p><h2>Ikuti ceritanya</h2></div><a href="#jelajah">Semua komik <ArrowUpRight size={16} /></a></div>
            <div className={`reader-comic-rail${ongoingComics.length === 1 ? " reader-ongoing-single" : ""}`}>{ongoingComics.slice(0, 6).map((comic) => <ComicCard key={comic.id} comic={comic} landscapeCard={ongoingComics.length === 1} />)}</div>
          </section>
        )}

        {latestComics.length > 1 && (
          <section className="reader-editorial-callout">
            <div><p className="reader-section-kicker">CERITA MENUNGGU UNTUK DITEMUKAN</p><h2>Setiap komik punya dunia yang berbeda.</h2><p>Mulai dari fantasi hingga drama, pilih cerita yang paling dekat denganmu.</p></div>
            <a className="reader-primary-button" href="#genre">Pilih genre <ArrowRight size={17} /></a>
          </section>
        )}

        <section className="reader-home-section" id="jelajah">
          <div className="reader-section-heading"><div><p className="reader-section-kicker">JELAJAHI DUNIA CERITA</p><h2>Semua komik</h2></div><span className="reader-result-count">{searchedComics.length} cerita</span></div>
          <div className="reader-discovery-tools" id="genre">
            <div className="reader-genre-chips" aria-label="Saring berdasarkan genre">
              {genres.map((item) => (
                <button key={item} className={genre === item ? "reader-genre-chip reader-genre-chip-active" : "reader-genre-chip"} onClick={() => setGenre(item)}>
                  {item === "all" ? "Semua" : comicGenre(item)}
                </button>
              ))}
            </div>
            {settings.feature_flags.search && <div className="reader-mobile-search-inline"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari komik, kreator, atau genre..." aria-label="Cari komik, kreator, atau genre" /></div>}
          </div>
          {catalogState === "ready" && searchedComics.length > 0 && <div className="reader-comic-grid">{searchedComics.map((comic, index) => (
            <Fragment key={comic.id}>
              <ComicCard comic={comic} />
              {index === 7 && searchedComics.length > 8 && <SponsoredAd slotKey="catalog_grid_native" placement="catalog" />}
            </Fragment>
          ))}</div>}
          {catalogState === "ready" && searchedComics.length === 0 && <div className="reader-empty-state"><p>{query ? "Komik yang kamu cari belum ditemukan." : genre !== "all" ? "Belum ada komik dalam kategori ini." : visibleComics.length === 0 ? "Belum ada komik yang tersedia di perangkat ini." : "Belum ada komik terbit."}</p><button onClick={() => { setGenre("all"); setQuery(""); }}>Jelajahi semua komik</button></div>}
        </section>
      </div>

      <section className="reader-seo-about" aria-labelledby="reader-seo-about-title">
        <header className="reader-seo-about-header">
          <p className="reader-section-kicker">TENTANG MU KOMIK</p>
          <h2 id="reader-seo-about-title">Cerita komik Indonesia dari kreator lokal</h2>
          <p>MU Komik adalah platform untuk membaca komik Indonesia dan menjelajahi cerita karya kreator lokal. Temukan komik berdasarkan genre, ikuti episode yang terbit, atau mulai berkarya sebagai kreator.</p>
        </header>
        <div className="reader-seo-about-grid">
          <article>
            <div className="reader-seo-about-image"><Image src="/genre.png" alt="" fill sizes="(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 33vw" /></div>
            <h3>Jelajahi beragam genre</h3>
            <p>Katalog MU Komik menyediakan penelusuran berdasarkan genre, seperti fantasi, fiksi ilmiah, drama, komedi, aksi, romansa, horor, misteri, dan petualangan. Ketersediaan judul bergantung pada komik yang telah diterbitkan.</p>
            <a href="#genre">Jelajahi genre komik</a>
          </article>
          <article>
            <div className="reader-seo-about-image"><Image src="/reading.png" alt="" fill sizes="(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 33vw" /></div>
            <h3>Baca cerita dan episode</h3>
            <p>Buka halaman komik untuk membaca sinopsis, melihat informasi cerita, dan menemukan episode yang tersedia. Komik dapat dibaca pada perangkat yang didukung oleh kreatornya.</p>
            <a href="#jelajah">Lihat katalog komik</a>
          </article>
          <article>
            <div className="reader-seo-about-image"><Image src="/ruang_kreator.png" alt="" fill sizes="(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 33vw" /></div>
            <h3>Ruang untuk kreator lokal</h3>
            <p>Kreator dapat mengajukan akses kreator, menerbitkan komik, dan mengelola episode karyanya. MU Komik juga menjelaskan pandangannya tentang penggunaan AI dalam proses kreatif.</p>
            <Link href="/manifesto">Baca manifesto AI MU Komik</Link>
          </article>
        </div>
      </section>

      {settings.feature_flags.creators && <section className="reader-creator-cta" id="creator">
        <div><p className="reader-section-kicker">PUNYA CERITA?</p><h2>Terbitkan komikmu dan temukan pembaca baru.</h2></div>
        <Link className="reader-primary-button" href={signedIn ? "/account" : "/login"}>Jadi kreator <ArrowRight size={17} /></Link>
      </section>}
      <footer className="reader-footer">
        <div className="reader-footer-main-row">
          <BrandLogo className="wordmark reader-wordmark" />
          <PlatformLinks />
          <div className="reader-footer-utility-links">
            <nav className="reader-footer-links" aria-label="Tautan footer"><a href="#jelajah">Jelajah</a><a href="#genre">Genre</a><a href="#creator">Kreator</a><Link href="/push-ads">Pasang iklan</Link><Link href="/manifesto">Manifesto AI</Link><Link href="/syarat-ketentuan">Syarat layanan</Link></nav>
          </div>
        </div>
        <p>Tempat cerita Indonesia menemukan pembacanya.</p>
        <span>© 2026 mu-komik</span>
      </footer>
    </main>
  );
}
