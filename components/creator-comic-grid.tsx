"use client";

import Image from "next/image";
import Link from "next/link";
import { useCurrentDevice } from "@/components/use-current-device";
import { isComicAvailableOnDevice, type ComicTargetDevice } from "@/lib/comic-target-device";
import { getComicGenreLabel } from "@/lib/comic-genres";

type CreatorComic = {
  id: string;
  title: string;
  slug: string;
  genre: string;
  cover_key: string | null;
  target_device: ComicTargetDevice;
};

export default function CreatorComicGrid({
  comics,
  publicUrl,
}: {
  comics: CreatorComic[];
  publicUrl: string | undefined;
}) {
  const currentDevice = useCurrentDevice();
  const visibleComics = comics.filter((comic) => isComicAvailableOnDevice(comic.target_device, currentDevice));

  return (
    <>
      <div className="reader-section-heading">
        <div><p className="reader-section-kicker">KARYA PILIHAN</p><h2 id="creator-public-comics">Komik</h2></div>
        <p className="creator-public-comic-count">{currentDevice === null ? "Memuat..." : `${visibleComics.length} komik terbit`}</p>
      </div>
      {currentDevice === null
        ? <p className="creator-public-empty" aria-busy="true">Memuat komik...</p>
        : visibleComics.length ? (
          <div className="creator-public-grid">
            {visibleComics.map((comic) => {
              const coverUrl = comic.cover_key && publicUrl ? `${publicUrl.replace(/\/$/, "")}/${comic.cover_key}` : null;
              return (
                <Link className="creator-public-comic" href={`/comic/${encodeURIComponent(comic.slug)}`} key={comic.id}>
                  <div className="creator-public-cover">
                    {coverUrl
                      ? <Image src={coverUrl} alt={`Sampul ${comic.title}`} fill sizes="(max-width: 760px) 46vw, 220px" unoptimized />
                      : <span>{comic.title.slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <h3>{comic.title}</h3>
                  <p>{getComicGenreLabel(comic.genre)}</p>
                </Link>
              );
            })}
          </div>
        ) : <p className="creator-public-empty">Belum ada komik yang tersedia di perangkat ini.</p>}
    </>
  );
}
