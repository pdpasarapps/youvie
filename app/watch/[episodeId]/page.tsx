import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Play, Video } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getDramaReaderSeed } from "@/lib/drama-reader-data";
import DramaDetailActions from "./detail-actions";

export default async function DramaDetailPage({
  params,
  searchParams,
}: PageProps<"/watch/[episodeId]">) {
  const [{ episodeId }, query] = await Promise.all([params, searchParams]);
  if (typeof query.time === "string") {
    const requestedPosition = Number(query.time);
    const resumeAtSeconds = Number.isFinite(requestedPosition) ? Math.max(0, requestedPosition) : 0;
    redirect(`/watch/${encodeURIComponent(episodeId)}/player?time=${resumeAtSeconds}`);
  }

  const seed = await getDramaReaderSeed(episodeId, { includePlayerMedia: false });
  if (!seed) notFound();
  const currentEpisode = seed.episodes.find((episode) => episode.id === seed.currentEpisodeId);

  return (
    <main className="drama-detail-page">
      <header className="drama-reader-topbar">
        <Link className="drama-reader-back" href="/#drama-catalog" aria-label="Kembali ke daftar drama">
          <ArrowLeft size={19} />
        </Link>
        <Link className="drama-reader-brand drama-wordmark" href="/" aria-label="Youvie beranda">You<span>Vie.</span></Link>
      </header>

      <section className="drama-detail-hero" aria-labelledby="drama-detail-title">
        {seed.detailUrl || seed.coverUrl
          ? <Image className="drama-detail-backdrop" src={seed.detailUrl || seed.coverUrl || ""} alt="" fill priority sizes="100vw" unoptimized />
          : <div className="drama-detail-backdrop drama-detail-backdrop-placeholder"><Video size={42} aria-hidden="true" /></div>}
        <div className="drama-detail-shade" />
        <div className="drama-detail-copy">
          <p className="drama-detail-eyebrow">{seed.genre || "DRAMA PENDEK"}</p>
          <h1 id="drama-detail-title">{seed.seriesTitle}</h1>
          <p className="drama-detail-meta">{seed.episodes.length} episode <span>·</span> {seed.episodes[0]?.seasonNumber ?? 1} season</p>
          {seed.synopsis && <p className="drama-detail-synopsis">{seed.synopsis}</p>}
          <div className="drama-detail-action-row">
            {currentEpisode && (
              <Link className="drama-detail-primary-action" href={`/watch/${currentEpisode.id}/player`}>
                <Play size={17} fill="currentColor" /> Tonton
              </Link>
            )}
            <DramaDetailActions seriesId={seed.seriesId} title={seed.seriesTitle} />
          </div>
        </div>
      </section>

      <nav className="drama-detail-tabs" aria-label="Bagian detail drama">
        <a href="#episode-list">Episode</a>
        <a href="#about-drama">Tentang</a>
        {seed.recommendations.length > 0 && <a href="#recommended-dramas">Rekomendasi</a>}
      </nav>

      <section className="drama-detail-episodes" id="episode-list" aria-labelledby="drama-detail-episodes-title">
        <div className="drama-detail-section-heading">
          <h2 id="drama-detail-episodes-title">Episode</h2>
          <a href="#episode-list">Lihat semua <ArrowRight size={16} /></a>
        </div>
        <div className="drama-detail-episode-list">
          {seed.episodes.map((episode) => (
            <Link
              className={`drama-detail-episode${episode.id === seed.currentEpisodeId ? " is-current" : ""}`}
              href={`/watch/${episode.id}/player`}
              key={episode.id}
            >
              <span className="drama-detail-episode-poster">
                {episode.thumbnailUrl || seed.coverUrl
                  ? <Image src={episode.thumbnailUrl || seed.coverUrl || ""} alt="" fill sizes="70px" unoptimized />
                  : <Video size={20} />}
                <span className="drama-detail-episode-play"><Play size={17} fill="currentColor" /></span>
                {episode.durationSeconds && (
                  <small className="drama-detail-episode-duration">
                    {Math.floor(episode.durationSeconds / 60)}:{String(episode.durationSeconds % 60).padStart(2, "0")}
                  </small>
                )}
              </span>
              <span className="drama-detail-episode-copy">
                <small>EPISODE {episode.episodeNumber}</small>
                <strong>{episode.title}</strong>
                <span>Season {episode.seasonNumber}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="drama-detail-about" id="about-drama" aria-labelledby="drama-detail-about-title">
        <p>TENTANG DRAMA</p>
        <h2 id="drama-detail-about-title">{seed.seriesTitle}</h2>
        {seed.synopsis && <p>{seed.synopsis}</p>}
      </section>

      {seed.recommendations.length > 0 && (
        <section className="drama-detail-recommendations" id="recommended-dramas" aria-labelledby="drama-detail-recommendations-title">
          <div className="drama-detail-section-heading">
            <h2 id="drama-detail-recommendations-title">Pilihan untuk Anda</h2>
            <Link href="/#drama-catalog">Lihat semua <ArrowRight size={16} /></Link>
          </div>
          <div className="drama-detail-recommendation-list">
            {seed.recommendations.map((drama) => (
              <Link className="drama-detail-recommendation" href={`/watch/${drama.episodeId}`} key={drama.id}>
                <span className="drama-detail-recommendation-poster">
                  {drama.coverUrl
                    ? <Image src={drama.coverUrl} alt="" fill sizes="(max-width: 680px) 40vw, 180px" unoptimized />
                    : <Video size={28} />}
                </span>
                <strong>{drama.title}</strong>
                <small>{drama.genre || "Drama pendek"}</small>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
