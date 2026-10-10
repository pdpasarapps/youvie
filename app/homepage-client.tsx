"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Compass, Flame, Film, Heart, Play, Search, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { DramaCatalog, DramaEpisodeCard, DramaHomepagePromo } from "@/lib/homepage-data";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

function DramaPromoCard({ promo }: { promo: DramaHomepagePromo }) {
  return (
    <article className="drama-promo">
      <Link href={promo.destination_url} className="drama-promo-link">
        <picture className="drama-promo-picture">
          {promo.image_url_mobile && <source media="(max-width: 680px)" srcSet={promo.image_url_mobile} />}
          {promo.image_url_tablet && <source media="(max-width: 1024px)" srcSet={promo.image_url_tablet} />}
          <Image src={promo.image_url} alt="" fill unoptimized sizes="(max-width: 1024px) 100vw, 1180px" />
        </picture>
        <div className="drama-promo-copy">
          {promo.eyebrow && <p>{promo.eyebrow}</p>}
          <h2>{promo.title}</h2>
          {promo.description && <span>{promo.description}</span>}
          {promo.cta_label && <strong>{promo.cta_label}<span aria-hidden="true"> →</span></strong>}
        </div>
      </Link>
    </article>
  );
}

function FeaturedDrama({ episodes }: { episodes: DramaEpisodeCard[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const currentIndex = episodes.length ? activeIndex % episodes.length : 0;
  const activeEpisode = episodes[currentIndex];
  const multipleEpisodes = episodes.length > 1;

  useEffect(() => {
    if (!multipleEpisodes || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % episodes.length);
    }, 6000);
    return () => window.clearInterval(interval);
  }, [episodes.length, multipleEpisodes, paused]);

  const showEpisode = (index: number) => {
    setActiveIndex((index + episodes.length) % episodes.length);
  };

  return (
    <section
      className={`drama-featured${activeEpisode?.heroUrl || activeEpisode?.coverUrl || activeEpisode?.thumbnailUrl ? " has-artwork" : ""}`}
      aria-roledescription="carousel"
      aria-label="Drama unggulan"
      aria-labelledby="drama-featured-title"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      {activeEpisode?.heroUrl || activeEpisode?.coverUrl || activeEpisode?.thumbnailUrl
        ? <Image
          className="drama-featured-artwork"
          key={`${activeEpisode.id}-${activeEpisode.heroUrl ?? activeEpisode.coverUrl ?? activeEpisode.thumbnailUrl}`}
          src={activeEpisode.heroUrl || activeEpisode.coverUrl || activeEpisode.thumbnailUrl || ""}
          alt={`Sampul drama ${activeEpisode.seriesTitle}`}
          fill
          priority
          unoptimized
          sizes="100vw"
        />
        : <div className="drama-featured-artwork drama-featured-artwork-placeholder" aria-hidden="true" />}
      <div className="drama-featured-shade" />
      <div className="drama-featured-content">
        <p className="drama-eyebrow"><Sparkles size={14} /> DRAMA PENDEK PILIHAN</p>
        <h1 id="drama-featured-title" aria-live="polite">{activeEpisode?.seriesTitle ?? "Drama unggulan segera hadir."}</h1>
        {activeEpisode ? (
          <>
            <p className="drama-featured-episode">Season {activeEpisode.seasonNumber} · Episode {activeEpisode.episodeNumber} · {activeEpisode.genre || "Drama pendek"}</p>
            <p className="drama-featured-description">{activeEpisode.synopsis || `Ikuti ${activeEpisode.seriesTitle}, tayang eksklusif di YouVie.`}</p>
            <Link className="drama-primary-action" href={`/watch/${activeEpisode.id}`}><Play size={16} fill="currentColor" /> Lihat detail</Link>
          </>
        ) : (
          <>
            <p className="drama-featured-description">Drama pilihan akan muncul di sini. Tandai serial sebagai unggulan dari Manajemen Drama.</p>
            <a className="drama-primary-action" href="#drama-catalog"><Film size={16} /> Jelajahi drama</a>
          </>
        )}
      </div>
      {multipleEpisodes && (
        <div className="drama-featured-carousel-controls" role="group" aria-label="Kontrol drama unggulan">
          <button type="button" aria-label="Drama unggulan sebelumnya" onClick={() => showEpisode(activeIndex - 1)}><ArrowLeft size={17} /></button>
          <div className="drama-featured-dots" role="group" aria-label="Pilih drama unggulan">
            {episodes.map((episode, index) => (
              <button
                key={episode.id}
                type="button"
                className={index === currentIndex ? "is-active" : ""}
                aria-label={`Tampilkan ${episode.seriesTitle}`}
                aria-current={index === currentIndex ? "true" : undefined}
                onClick={() => showEpisode(index)}
              />
            ))}
          </div>
          <button type="button" aria-label="Drama unggulan berikutnya" onClick={() => showEpisode(activeIndex + 1)}><ArrowRight size={17} /></button>
        </div>
      )}
      <a className="drama-featured-scroll" href="#drama-catalog"><span>Lihat semua drama</span><ArrowDown size={15} /></a>
      <span className="drama-featured-mark" aria-hidden="true">Y.</span>
    </section>
  );
}

function DramaCard({
  episode,
  viewerId,
  favoriteAvailable,
  isFavorite,
  favoriteBusy,
  onToggleFavorite,
}: {
  episode: DramaEpisodeCard;
  viewerId: string | null;
  favoriteAvailable: boolean;
  isFavorite: boolean;
  favoriteBusy: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <article className="drama-card" id={`episode-${episode.id}`}>
      <Link
        className="drama-video-frame"
        href={`/watch/${episode.id}`}
        aria-label={`Tonton drama ${episode.seriesTitle}`}
      >
        {(episode.cardUrl || episode.coverUrl || episode.thumbnailUrl) && <Image
          className="drama-card-artwork"
          src={episode.cardUrl || episode.coverUrl || episode.thumbnailUrl || ""}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 680px) 46vw, (max-width: 1000px) 30vw, 24vw"
        />}
        <span className="drama-card-play" aria-hidden="true"><Play size={24} fill="currentColor" /></span>
      </Link>
      <div className="drama-card-copy">
        <div className="drama-card-title-row">
          <h3>{episode.seriesTitle}</h3>
          {viewerId
            ? <button
              type="button"
              className={`drama-favorite-action${isFavorite ? " is-favorite" : ""}`}
              aria-label={`${isFavorite ? "Hapus" : "Simpan"} ${episode.seriesTitle} ${isFavorite ? "dari" : "ke"} favorit`}
              aria-pressed={isFavorite}
              title={!favoriteAvailable ? "Jalankan supabase/drama-viewer-library.sql" : undefined}
              disabled={!favoriteAvailable || favoriteBusy}
              onClick={onToggleFavorite}
            >
              <Heart size={16} fill={isFavorite ? "currentColor" : "none"} />
            </button>
            : <Link className="drama-favorite-action" href="/login" aria-label={`Masuk untuk menyimpan ${episode.seriesTitle} ke favorit`} title="Masuk untuk menyimpan ke favorit">
              <Heart size={16} />
            </Link>}
        </div>
      </div>
    </article>
  );
}

export default function HomePageClient({
  episodes,
  genres,
  promos,
  popularEpisodeIds,
  catalogState,
}: DramaCatalog) {
  const [search, setSearch] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("Semua");
  const [episodeSort, setEpisodeSort] = useState<"latest" | "popular">("latest");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [favoriteSeriesIds, setFavoriteSeriesIds] = useState<string[]>([]);
  const [favoriteAvailable, setFavoriteAvailable] = useState(false);
  const [favoriteBusySeriesId, setFavoriteBusySeriesId] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState("");
  useEffect(() => {
    let active = true;
    const loadFavorites = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("Unable to check viewer session before loading drama favorites:", sessionError);
        return;
      }
      const viewer = sessionData.session?.user;
      if (!viewer || !active) return;
      setViewerId(viewer.id);

      const { data, error } = await supabase
        .from("drama_favorites")
        .select("series_id")
        .eq("user_id", viewer.id);
      if (error) {
        console.error("Unable to load drama favorites:", error);
        if (active) setFavoriteError("Favorit drama belum aktif. Jalankan supabase/drama-viewer-library.sql.");
        return;
      }
      if (active) {
        setFavoriteSeriesIds((data ?? []).map((row) => row.series_id));
        setFavoriteAvailable(true);
      }
    };
    void loadFavorites();
    return () => {
      active = false;
    };
  }, []);

  const toggleFavorite = async (seriesId: string) => {
    if (!viewerId || !favoriteAvailable || favoriteBusySeriesId) return;
    const isFavorite = favoriteSeriesIds.includes(seriesId);
    setFavoriteBusySeriesId(seriesId);
    setFavoriteError("");
    const query = isFavorite
      ? supabase.from("drama_favorites").delete().eq("user_id", viewerId).eq("series_id", seriesId)
      : supabase.from("drama_favorites").insert({ user_id: viewerId, series_id: seriesId });
    const { error } = await query;
    if (error) {
      console.error("Unable to update drama favorite:", { error, seriesId });
      setFavoriteError("Perubahan favorit gagal disimpan. Coba lagi.");
    } else {
      setFavoriteSeriesIds((current) => isFavorite
        ? current.filter((id) => id !== seriesId)
        : [...current, seriesId]);
    }
    setFavoriteBusySeriesId(null);
  };
  const popularEpisodes = useMemo(() => {
    const rankById = new Map((popularEpisodeIds ?? []).map((id, index) => [id, index]));
    return episodes
      .filter((episode) => rankById.has(episode.id))
      .sort((left, right) => (rankById.get(left.id) ?? 0) - (rankById.get(right.id) ?? 0));
  }, [episodes, popularEpisodeIds]);
  const episodesForSort = episodeSort === "popular" ? popularEpisodes : episodes;
  const filteredEpisodes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id");
    const seenSeriesIds = new Set<string>();
    return episodesForSort.filter((episode) => {
      if (seenSeriesIds.has(episode.seriesId)) return false;
      seenSeriesIds.add(episode.seriesId);
      const matchesGenre = selectedGenre === "Semua" || episode.genre === selectedGenre;
      const matchesSearch = !query
        || `${episode.seriesTitle} ${episode.synopsis} ${episode.genre}`.toLocaleLowerCase("id").includes(query);
      return matchesGenre && matchesSearch;
    });
  }, [episodesForSort, search, selectedGenre]);
  const featuredSeriesIds = new Set<string>();
  const featuredEpisodes = episodes.filter((episode) => {
    if (!episode.isFeatured || featuredSeriesIds.has(episode.seriesId)) return false;
    featuredSeriesIds.add(episode.seriesId);
    return true;
  });

  return (
    <main className="drama-home" id="top">
      <header className="drama-topbar">
        <Link href="/" className="drama-brand drama-wordmark" aria-label="Youvie beranda">You<span>Vie.</span></Link>
        <nav className="drama-main-nav" aria-label="Navigasi utama">
          <a className="drama-catalog-icon" href="#drama-catalog" aria-label="Jelajahi drama" title="Jelajahi drama"><Compass size={20} /></a>
          {promos.length > 0 && <a href="#drama-promos">Pilihan Youvie</a>}
        </nav>
      </header>

      <FeaturedDrama episodes={featuredEpisodes} />

      {promos.length > 0 && (
        <section className="drama-promos" id="drama-promos" aria-label="Pilihan drama dan promo">
          {promos.map((promo) => <DramaPromoCard key={promo.id} promo={promo} />)}
        </section>
      )}

      <section className="drama-browse-section" aria-labelledby="drama-browse-title">
        <div className="drama-browse-heading">
          <div>
            <p className="drama-eyebrow"><Sparkles size={14} /> JELAJAHI CERITA</p>
            <h2 id="drama-browse-title">Pilih genre <em>favoritmu.</em></h2>
            <p>Temukan serial berdasarkan suasana cerita yang kamu suka.</p>
          </div>
        </div>
        {favoriteError && viewerId && <p className="drama-favorite-library-error" role="alert">{favoriteError}</p>}
        <div className="drama-category-list" aria-label="Kategori genre drama">
          <button
            type="button"
            className={selectedGenre === "Semua" ? "is-selected" : ""}
            aria-pressed={selectedGenre === "Semua"}
            onClick={() => {
              setSelectedGenre("Semua");
              setEpisodeSort("latest");
              document.getElementById("drama-catalog")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Semua cerita <ArrowRight size={14} />
          </button>
          {genres.map((genre) => (
            <button
              key={genre}
              type="button"
              className={selectedGenre === genre ? "is-selected" : ""}
              aria-pressed={selectedGenre === genre}
              onClick={() => {
                setSelectedGenre(genre);
                setEpisodeSort("latest");
                document.getElementById("drama-catalog")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {genre} <ArrowRight size={14} />
            </button>
          ))}
        </div>
      </section>

      <section className="drama-catalog-section" id="drama-catalog" aria-labelledby="drama-catalog-title">
        <div className="drama-catalog-heading">
          <div>
            <p className="drama-eyebrow"><Film size={14} /> PILIHAN CERITA UNTUKMU</p>
            <h2 id="drama-catalog-title">Temukan drama <em>favoritmu.</em></h2>
            <p>Episode pendek, cerita yang bikin lanjut terus.</p>
          </div>
          <label className="drama-search">
            <Search size={17} />
            <span className="sr-only">Cari drama</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari judul atau genre" />
          </label>
        </div>

        <div className="drama-feed-switch" aria-label="Urutkan drama">
          <button
            type="button"
            className={episodeSort === "latest" ? "is-selected" : ""}
            aria-pressed={episodeSort === "latest"}
            onClick={() => setEpisodeSort("latest")}
          >
            <Film size={15} /> Terbaru
          </button>
          <button
            type="button"
            className={episodeSort === "popular" ? "is-selected" : ""}
            aria-pressed={episodeSort === "popular"}
            onClick={() => setEpisodeSort("popular")}
          >
            <Flame size={15} /> Populer 30 hari
          </button>
        </div>

        {catalogState === "error" ? (
          <section className="drama-empty" role="alert">
            <ShieldCheck size={25} />
            <h3>Katalog belum tersedia</h3>
            <p>Periksa konfigurasi Supabase dan jalankan SQL katalog serta storage drama.</p>
          </section>
        ) : filteredEpisodes.length ? (
          <>
            <div className="drama-results-line">
              <span>{search || selectedGenre !== "Semua"
                ? `${filteredEpisodes.length} drama ditemukan`
                : episodeSort === "popular" ? "Drama paling banyak ditonton" : "Drama terbaru"}</span>
              <span>{filteredEpisodes.length} serial</span>
            </div>
            <div className="drama-feed">
              {filteredEpisodes.map((episode) => <DramaCard
                key={episode.id}
                episode={episode}
                viewerId={viewerId}
                favoriteAvailable={favoriteAvailable}
                isFavorite={favoriteSeriesIds.includes(episode.seriesId)}
                favoriteBusy={favoriteBusySeriesId === episode.seriesId}
                onToggleFavorite={() => void toggleFavorite(episode.seriesId)}
              />)}
            </div>
          </>
        ) : (
          <section className="drama-empty" role="status">
            {episodeSort === "popular" ? <Flame size={25} /> : <Film size={25} />}
            <h3>{episodeSort === "popular"
              ? "Drama populer segera hadir"
              : episodes.length ? "Drama tidak ditemukan" : "Drama baru segera hadir"}</h3>
            <p>{episodeSort === "popular"
              ? popularEpisodeIds === null
                ? "Daftar populer akan tersedia setelah analytics drama diaktifkan."
                : "Peringkat populer akan muncul setelah episode mulai ditonton."
              : episodes.length ? "Coba kata kunci atau genre yang berbeda." : "Drama terbaru akan tampil di sini setelah diterbitkan."}</p>
            {episodes.length > 0 && <button type="button" onClick={() => { setSearch(""); setSelectedGenre("Semua"); }}>Hapus filter</button>}
          </section>
        )}
      </section>

      <footer className="drama-footer">
        <Link href="/" className="drama-brand drama-wordmark" aria-label="Youvie beranda">You<span>Vie.</span></Link>
        <span>Cerita seru, selalu menemani.</span>
        <a href="#top">Kembali ke atas <ArrowRight size={14} /></a>
      </footer>
    </main>
  );
}
