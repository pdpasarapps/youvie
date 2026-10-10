"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Image as ImageIcon, LoaderCircle, Share2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import AdminSidebar from "../admin-sidebar";
import { createDramaSharePreview } from "@/lib/drama-share-preview";
import { createClient } from "@/lib/supabase/client";

type EpisodeSource = {
  episode_number: number;
  status: "draft" | "published" | "archived";
  thumbnail_path: string | null;
};

type SeasonSource = {
  season_number: number;
  drama_episodes: EpisodeSource[] | null;
};

type DramaSeries = {
  id: string;
  title: string;
  slug: string;
  genre: string;
  status: "published";
  cover_image_path: string | null;
  drama_seasons: SeasonSource[] | null;
};

type SavedPreview = {
  series_id: string;
  source_path: string;
  object_key: string;
  updated_at: string;
};

type ShareSeries = DramaSeries & {
  sourcePath: string | null;
  sourceUrl: string | null;
};

const MEDIA_BUCKET = "drama-media";
const supabase = createClient();
const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

function sourcePaths(series: DramaSeries) {
  const episodePaths = (series.drama_seasons ?? [])
    .slice()
    .sort((left, right) => left.season_number - right.season_number)
    .flatMap((season) =>
      (season.drama_episodes ?? [])
        .filter((episode) => episode.status === "published" && episode.thumbnail_path)
        .sort((left, right) => left.episode_number - right.episode_number)
        .map((episode) => episode.thumbnail_path!),
    );
  return [...new Set([...(series.cover_image_path ? [series.cover_image_path] : []), ...episodePaths])];
}

function previewUrl(objectKey: string) {
  return publicUrl
    ? `${publicUrl.replace(/\/$/, "")}/${objectKey.split("/").map(encodeURIComponent).join("/")}`
    : "";
}

export default function DramaSharePreviewsPage() {
  const router = useRouter();
  const [series, setSeries] = useState<ShareSeries[]>([]);
  const [previews, setPreviews] = useState<Map<string, SavedPreview>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [progress, setProgress] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error("Unable to verify drama share preview access:", userError);
        if (active) {
          setError("Akun belum dapat diverifikasi. Muat ulang halaman dan coba lagi.");
          setLoading(false);
        }
        return;
      }
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      const { data: canManage, error: accessError } = await supabase.rpc("can_manage_video_catalog");
      if (accessError) {
        console.error("Unable to verify drama share preview access:", accessError);
        if (active) {
          setError("Jalankan supabase/video-catalog.sql untuk mengaktifkan akses katalog drama.");
          setLoading(false);
        }
        return;
      }
      if (!canManage) {
        router.replace("/account");
        return;
      }

      const [{ data: seriesData, error: seriesError }, { data: previewData, error: previewError }] = await Promise.all([
        supabase
          .from("drama_series")
          .select("id, title, slug, genre, status, cover_image_path, drama_seasons(season_number, drama_episodes(episode_number, status, thumbnail_path))")
          .eq("status", "published")
          .order("title")
          .returns<DramaSeries[]>(),
        supabase
          .from("drama_share_previews")
          .select("series_id, source_path, object_key, updated_at")
          .returns<SavedPreview[]>(),
      ]);

      if (seriesError || previewError) {
        console.error("Unable to load drama share previews:", { seriesError, previewError });
        if (active) {
          setError(seriesError
            ? "Katalog drama gagal dimuat. Pastikan supabase/video-catalog.sql sudah dijalankan."
            : "Tabel pratinjau belum tersedia. Jalankan supabase/drama-share-previews.sql di Supabase SQL Editor.");
          setLoading(false);
        }
        return;
      }

      const loadedSeries = seriesData ?? [];
      const mediaPaths = [...new Set(loadedSeries.flatMap(sourcePaths))];
      let signedUrlByPath = new Map<string, string>();
      if (mediaPaths.length) {
        const { data: signedUrlData, error: signingError } = await supabase.storage
          .from(MEDIA_BUCKET)
          .createSignedUrls(mediaPaths, 3600);
        if (signingError) {
          console.error("Unable to sign drama cover and thumbnail URLs:", signingError);
          if (active) {
            setError("Gambar drama tidak dapat dibuka. Pastikan bucket drama-media dan kebijakannya sudah disiapkan.");
            setLoading(false);
          }
          return;
        }
        signedUrlByPath = new Map(
          (signedUrlData ?? []).flatMap((item) =>
            item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
          ),
        );
      }

      const shareSeries = loadedSeries.map((item) => {
        const sourcePath = sourcePaths(item).find((path) => signedUrlByPath.has(path)) ?? null;
        return { ...item, sourcePath, sourceUrl: sourcePath ? signedUrlByPath.get(sourcePath) ?? null : null };
      });
      if (active) {
        setSeries(shareSeries);
        setPreviews(new Map((previewData ?? []).map((item) => [item.series_id, item])));
        setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [router]);

  const needingPreview = useMemo(
    () => series.filter((item) => item.sourcePath && item.sourceUrl && previews.get(item.id)?.source_path !== item.sourcePath),
    [previews, series],
  );

  const generatePreviews = async (targets: ShareSeries[]) => {
    if (workingId || targets.length === 0) return;
    if (!publicUrl) {
      setMessage("NEXT_PUBLIC_R2_PUBLIC_URL belum dikonfigurasi.");
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("Unable to check drama share preview session:", sessionError);
      setMessage("Sesi admin tidak dapat diperiksa. Silakan masuk kembali.");
      return;
    }
    const token = sessionData.session?.access_token;
    if (!token) {
      setMessage("Sesi admin berakhir. Silakan masuk kembali.");
      return;
    }

    setWorkingId(targets.length === 1 ? targets[0].id : "all");
    setMessage("");
    setProgress(`0 dari ${targets.length} serial`);
    let generated = 0;
    const failures: string[] = [];

    for (const [index, item] of targets.entries()) {
      try {
        if (!item.sourcePath || !item.sourceUrl) throw new Error("Cover atau thumbnail episode tidak tersedia.");
        const sourceResponse = await fetch(item.sourceUrl);
        if (!sourceResponse.ok) throw new Error(`Gambar drama gagal diunduh (${sourceResponse.status}).`);
        const preview = await createDramaSharePreview(await sourceResponse.blob(), item.title, item.genre);
        const body = new FormData();
        body.set("seriesId", item.id);
        body.set("sourcePath", item.sourcePath);
        body.set("file", preview, "share-preview.jpg");
        const response = await fetch("/api/r2/drama-share-preview", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body,
        });
        const result = await response.json() as { objectKey?: string; error?: string };
        if (!response.ok || !result.objectKey) {
          throw new Error(result.error || `Unggah pratinjau gagal (HTTP ${response.status}).`);
        }
        const { error: saveError } = await supabase.from("drama_share_previews").upsert({
          series_id: item.id,
          source_path: item.sourcePath,
          object_key: result.objectKey,
        }, { onConflict: "series_id" });
        if (saveError) {
          console.error("Unable to save generated drama share preview record:", { seriesId: item.id, saveError });
          throw new Error("Gambar terunggah, tetapi catatan pratinjau gagal disimpan.");
        }
        const saved = {
          series_id: item.id,
          source_path: item.sourcePath,
          object_key: result.objectKey,
          updated_at: new Date().toISOString(),
        };
        setPreviews((current) => new Map(current).set(item.id, saved));
        generated += 1;
      } catch (generationError) {
        console.error("Unable to generate drama share preview:", { seriesId: item.id, error: generationError });
        failures.push(item.title);
      }
      setProgress(`${index + 1} dari ${targets.length} serial`);
    }

    setMessage(failures.length
      ? `${generated} pratinjau berhasil dibuat; ${failures.length} gagal: ${failures.slice(0, 3).join(", ")}.`
      : `${generated} pratinjau drama berhasil dibuat dan disimpan di R2.`);
    setWorkingId("");
  };

  if (loading) return <main className="admin-shell"><LoaderCircle className="spin" size={24} /></main>;

  return (
    <main className="admin-shell"><div className="admin-layout">
      <AdminSidebar activeSection="share-previews" />
      <div className="admin-main">
        <header className="admin-header">
          <p className="eyebrow">Panel administrasi</p>
          <div className="admin-title">
            <div><h1>Pratinjau berbagi drama</h1><p>Buat gambar berbagi untuk serial drama yang sudah tayang.</p></div>
          </div>
        </header>

        {error && <p className="admin-message" role="alert"><AlertCircle size={16} /> {error}</p>}
        {message && <p className="admin-message" role={message.includes("berhasil") ? "status" : "alert"}>{message}</p>}

        <section className="admin-management-section" aria-labelledby="drama-share-previews-title">
          <div className="admin-section-heading">
            <div><p className="eyebrow">GAMBAR SOSIAL</p><h2 id="drama-share-previews-title">Serial drama terbit</h2></div>
            <span>{series.length} serial · {needingPreview.length} perlu dibuat</span>
          </div>
          <p>Pratinjau lanskap dibuat dari cover serial atau thumbnail episode, lalu disimpan di R2. Tabel dan berkas pratinjau drama terpisah dari pratinjau komik.</p>
          {progress && <p role="status">{progress}</p>}
          {needingPreview.length > 0 && (
            <button className="approve-button" type="button" onClick={() => void generatePreviews(needingPreview)} disabled={Boolean(workingId)}>
              {workingId ? <LoaderCircle className="spin" size={16} /> : <ImageIcon size={16} />}
              {workingId ? "Membuat pratinjau..." : "Buat semua pratinjau"}
            </button>
          )}

          {series.length ? (
            <div className="admin-share-preview-grid">
              {series.map((item) => {
                const saved = previews.get(item.id);
                const fresh = Boolean(saved && saved.source_path === item.sourcePath);
                const imageUrl = saved ? previewUrl(saved.object_key) : "";
                return (
                  <article className="admin-share-preview-card" key={item.id}>
                    {imageUrl
                      ? <a className="admin-share-preview-image" href={imageUrl} target="_blank" rel="noreferrer" aria-label={`Buka pratinjau berbagi ${item.title}`}><Image src={imageUrl} alt={`Pratinjau ${item.title}`} fill unoptimized sizes="(max-width: 680px) 100vw, 50vw" /></a>
                      : <div className="admin-share-preview-image admin-share-preview-placeholder"><Share2 size={24} /></div>}
                    <div className="admin-share-preview-copy">
                      <span className={`request-status ${fresh ? "request-approved" : "request-pending"}`}>{fresh ? "Sudah dibuat" : saved ? "Cover berubah" : "Belum dibuat"}</span>
                      <h3>{item.title}</h3>
                      <p>{item.genre || "Drama pendek"} · {item.sourcePath ? "Gambar sumber tersedia" : "Tidak ada cover atau thumbnail episode"}</p>
                      {item.sourcePath && (
                        <button className="admin-action-link" type="button" onClick={() => void generatePreviews([item])} disabled={Boolean(workingId)}>
                          {workingId === item.id ? <LoaderCircle className="spin" size={14} /> : <ImageIcon size={14} />}
                          {fresh ? "Buat ulang" : "Buat pratinjau"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : !error ? (
            <div className="admin-empty"><ImageIcon size={26} /><h2>Belum ada serial terbit.</h2><p>Terbitkan serial drama terlebih dahulu untuk membuat pratinjau berbagi.</p></div>
          ) : null}
        </section>
      </div>
    </div></main>
  );
}
