"use client";

import { ChangeEvent, ClipboardEvent as ReactClipboardEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, Clapperboard, ImagePlus, LoaderCircle, Pencil, Play, Plus, Search, Trash2, Video, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import AdminSidebar from "../admin-sidebar";
import { createClient } from "@/lib/supabase/client";
import { inspectPortraitVideo, uploadDramaVideo } from "@/lib/drama-video-upload";
import { getDramaCoverUrl } from "@/lib/drama-cover-url";

type Episode = {
  id: string;
  episode_number: number;
  title: string;
  duration_seconds: number | null;
  status: "draft" | "published" | "archived";
  video_path: string | null;
  thumbnail_path: string | null;
  created_at: string;
};

type Season = {
  id: string;
  season_number: number;
  drama_episodes: Episode[] | null;
};

type Series = {
  id: string;
  title: string;
  slug: string;
  synopsis: string;
  genre: string;
  is_featured: boolean;
  status: "draft" | "published" | "archived";
  cover_image_path: string | null;
  hero_image_path: string | null;
  detail_image_path: string | null;
  card_image_path: string | null;
  created_at: string;
  drama_seasons: Season[] | null;
};

type MediaUrls = {
  coverUrl: string | null;
  heroUrl: string | null;
  detailUrl: string | null;
  cardUrl: string | null;
  episodes: Map<string, { videoUrl: string | null; thumbnailUrl: string | null }>;
};

type OptionalArtworkSlot = "hero" | "detail" | "card";

type DramaFormValues = {
  title: string;
  synopsis: string;
  genre: string;
  is_featured: boolean;
  status: "draft" | "published" | "archived";
};

const MEDIA_BUCKET = "drama-media";
const supabase = createClient();
const statusLabels = { draft: "Draft", published: "Tayang", archived: "Arsip" };
const emptyForm: DramaFormValues = { title: "", synopsis: "", genre: "", is_featured: false, status: "draft" };

function titleToSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function imageExtension(file: File) {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return null;
}

function OptionalArtworkPicker({
  title,
  ratio,
  recommendation,
  currentUrl,
  file,
  clear,
  disabled,
  onFile,
  onClear,
  onInvalid,
}: {
  title: string;
  ratio: string;
  recommendation: string;
  currentUrl: string | null;
  file: File | null;
  clear: boolean;
  disabled: boolean;
  onFile: (file: File | null) => void;
  onClear: (clear: boolean) => void;
  onInvalid: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const handleFile = (selected: File | null) => {
    if (selected && !imageExtension(selected)) {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
      onFile(null);
      onInvalid();
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = selected ? URL.createObjectURL(selected) : null;
    setPreviewUrl(previewUrlRef.current);
    onFile(selected);
    if (selected) onClear(false);
  };

  const displayUrl = clear ? null : previewUrl || currentUrl;
  return (
    <div className="admin-video-field admin-drama-artwork-field">
      <span>{title} · opsional</span>
      <small>{ratio} · disarankan {recommendation} (panduan, tidak membatasi upload).</small>
      <div className="admin-drama-artwork-preview" style={{ aspectRatio: ratio.replace(":", " / ") }}>
        {displayUrl
          ? <Image src={displayUrl} alt={`Pratinjau ${title.toLocaleLowerCase("id")}`} fill unoptimized sizes="(max-width: 600px) 65vw, 280px" />
          : <span>Belum ada gambar</span>}
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) => {
          handleFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      <small>{file?.name || (currentUrl && !clear ? "Pilih file untuk mengganti gambar yang tersimpan." : "JPEG, PNG, atau WebP.")}</small>
      {currentUrl && (
        <label className="admin-drama-clear-cover">
          <input
            type="checkbox"
            checked={clear}
            disabled={disabled}
            onChange={(event) => {
              onClear(event.target.checked);
              if (event.target.checked) {
                if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
                previewUrlRef.current = null;
                setPreviewUrl(null);
                onFile(null);
              }
            }}
          />
          Hapus gambar ini
        </label>
      )}
    </div>
  );
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "Durasi belum tersedia";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")} menit`;
}

export default function AdminDramaPage() {
  const router = useRouter();
  const [series, setSeries] = useState<Series[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Map<string, MediaUrls>>(new Map());
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<DramaFormValues>(emptyForm);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [artworkFiles, setArtworkFiles] = useState<Record<OptionalArtworkSlot, File | null>>({ hero: null, detail: null, card: null });
  const [clearArtwork, setClearArtwork] = useState<Record<OptionalArtworkSlot, boolean>>({ hero: false, detail: false, card: false });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [episodeUploadProgress, setEpisodeUploadProgress] = useState("");
  const [uploadingEpisode, setUploadingEpisode] = useState(false);
  const [uploadingThumbnailEpisodeId, setUploadingThumbnailEpisodeId] = useState<string | null>(null);
  const [refreshList, setRefreshList] = useState(0);
  const [coverDropActive, setCoverDropActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Series | null>(null);
  const [deleteBlockedReason, setDeleteBlockedReason] = useState("");
  const [toastPortalReady, setToastPortalReady] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const episodeVideoInputRef = useRef<HTMLInputElement>(null);
  const episodeThumbnailInputRef = useRef<HTMLInputElement>(null);
  const thumbnailTargetEpisodeId = useRef<string | null>(null);
  const coverPreviewObjectUrl = useRef<string | null>(null);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => setToastPortalReady(true));
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (coverPreviewObjectUrl.current) URL.revokeObjectURL(coverPreviewObjectUrl.current);
    };
  }, []);

  useEffect(() => {
    const syncSelectedSeries = () => {
      setSelectedSeriesId(new URLSearchParams(window.location.search).get("seriesId"));
    };
    const animationFrame = window.requestAnimationFrame(syncSelectedSeries);
    window.addEventListener("popstate", syncSelectedSeries);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("popstate", syncSelectedSeries);
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const animationFrame = window.requestAnimationFrame(() => setToastVisible(true));
    const timeout = window.setTimeout(() => setToastVisible(false), 4200);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [toastMessage]);

  useEffect(() => {
    let active = true;

    const loadSeries = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error("Unable to verify admin drama catalog access:", userError);
        if (active) {
          setError("Akun belum dapat diverifikasi. Silakan muat ulang halaman.");
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
        console.error("Unable to verify access to the drama catalog:", accessError);
        if (active) {
          setError("Jalankan supabase/video-catalog.sql dan supabase/drama-video-storage.sql di Supabase SQL Editor.");
          setLoading(false);
        }
        return;
      }
      if (!canManage) {
        router.replace("/account");
        return;
      }

      const { data, error: queryError } = await supabase
        .from("drama_series")
        .select("id, title, slug, synopsis, genre, is_featured, status, cover_image_path, hero_image_path, detail_image_path, card_image_path, created_at, drama_seasons(id, season_number, drama_episodes(id, episode_number, title, duration_seconds, status, video_path, thumbnail_path, created_at))")
        .order("created_at", { ascending: false })
        .returns<Series[]>();
      if (queryError) {
        console.error("Unable to load drama series:", queryError);
        if (active) {
          setError(queryError.code === "42703"
            ? "Jalankan supabase/drama-featured.sql dan supabase/drama-artwork.sql di Supabase SQL Editor."
            : "Daftar drama gagal dimuat. Pastikan tabel katalog tersedia di Supabase.");
          setLoading(false);
        }
        return;
      }

      const loadedSeries = data ?? [];
      const mediaPaths = [...new Set(loadedSeries.flatMap((item) => [
        ...(item.status !== "published" && item.cover_image_path ? [item.cover_image_path] : []),
        ...(item.hero_image_path ? [item.hero_image_path] : []),
        ...(item.detail_image_path ? [item.detail_image_path] : []),
        ...(item.card_image_path ? [item.card_image_path] : []),
        ...(item.drama_seasons ?? []).flatMap((season) =>
          (season.drama_episodes ?? []).flatMap((episode) => [
            ...(episode.video_path ? [episode.video_path] : []),
            ...(episode.thumbnail_path ? [episode.thumbnail_path] : []),
          ]),
        ),
      ]))];

      let signedUrlByPath = new Map<string, string>();
      if (mediaPaths.length) {
        const { data: signedUrlData, error: signingError } = await supabase.storage
          .from(MEDIA_BUCKET)
          .createSignedUrls(mediaPaths, 3600);
        if (signingError) {
          console.error("Unable to create signed URLs for drama catalog:", signingError);
          if (active) {
            setError("Drama berhasil dimuat, tetapi video atau cover tidak dapat dibuka.");
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
      const mediaBySeries = new Map<string, MediaUrls>();
      for (const item of loadedSeries) {
        const episodes = new Map<string, { videoUrl: string | null; thumbnailUrl: string | null }>();
        for (const season of item.drama_seasons ?? []) {
          for (const episode of season.drama_episodes ?? []) {
            episodes.set(episode.id, {
              videoUrl: episode.video_path ? signedUrlByPath.get(episode.video_path) ?? null : null,
              thumbnailUrl: episode.thumbnail_path ? signedUrlByPath.get(episode.thumbnail_path) ?? null : null,
            });
          }
        }
        mediaBySeries.set(item.id, {
          coverUrl: item.status === "published"
            ? getDramaCoverUrl(item.cover_image_path)
            : item.cover_image_path ? signedUrlByPath.get(item.cover_image_path) ?? null : null,
          heroUrl: item.hero_image_path ? signedUrlByPath.get(item.hero_image_path) ?? null : null,
          detailUrl: item.detail_image_path ? signedUrlByPath.get(item.detail_image_path) ?? null : null,
          cardUrl: item.card_image_path ? signedUrlByPath.get(item.card_image_path) ?? null : null,
          episodes,
        });
      }

      if (active) {
        setSeries(loadedSeries);
        setMediaUrls(mediaBySeries);
        setLoading(false);
      }
    };

    void loadSeries();
    return () => {
      active = false;
    };
  }, [router, refreshList]);

  const openCreateForm = () => {
    setEditingId(null);
    setFormValues(emptyForm);
    clearSelectedCoverFile();
    setArtworkFiles({ hero: null, detail: null, card: null });
    setClearArtwork({ hero: false, detail: false, card: false });
    setCoverDropActive(false);
    setFormError("");
    setFormMessage("");
    setFormOpen(true);
  };

  const openEditForm = (item: Series) => {
    setEditingId(item.id);
    setFormValues({
      title: item.title,
      synopsis: item.synopsis,
      genre: item.genre,
      is_featured: item.is_featured,
      status: item.status,
    });
    clearSelectedCoverFile();
    setArtworkFiles({ hero: null, detail: null, card: null });
    setClearArtwork({ hero: false, detail: false, card: false });
    setCoverDropActive(false);
    setFormError("");
    setFormMessage("");
    setFormOpen(true);
  };

  const openSeriesDetails = (item: Series) => {
    setSelectedSeriesId(item.id);
    router.push(`/admin/drama?seriesId=${encodeURIComponent(item.id)}`);
  };

  const closeSeriesDetails = () => {
    setSelectedSeriesId(null);
    router.push("/admin/drama");
  };

  const acceptCoverFile = (file: File | null) => {
    setFormError("");
    if (!file) return;
    if (!imageExtension(file)) {
      setFormError("Format sampul yang didukung hanya JPEG, PNG, dan WebP.");
      return;
    }
    if (coverPreviewObjectUrl.current) URL.revokeObjectURL(coverPreviewObjectUrl.current);
    const previewUrl = URL.createObjectURL(file);
    coverPreviewObjectUrl.current = previewUrl;
    setCoverPreviewUrl(previewUrl);
    setCoverFile(file);
  };

  const clearSelectedCoverFile = () => {
    if (coverPreviewObjectUrl.current) URL.revokeObjectURL(coverPreviewObjectUrl.current);
    coverPreviewObjectUrl.current = null;
    setCoverPreviewUrl(null);
    setCoverFile(null);
  };

  const setArtworkFile = (slot: OptionalArtworkSlot, file: File | null) => {
    setArtworkFiles((current) => ({ ...current, [slot]: file }));
    if (file) setClearArtwork((current) => ({ ...current, [slot]: false }));
  };

  useEffect(() => {
    if (!formOpen) return;
    const handleDocumentPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!event.clipboardData) return;
      const image = Array.from(event.clipboardData.items)
        .find((item) => item.kind === "file" && item.type.startsWith("image/"))
        ?.getAsFile();
      if (!image) return;
      event.preventDefault();
      acceptCoverFile(image);
    };
    document.addEventListener("paste", handleDocumentPaste);
    return () => document.removeEventListener("paste", handleDocumentPaste);
  }, [formOpen]);

  const handleCoverSelect = (event: ChangeEvent<HTMLInputElement>) => {
    acceptCoverFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const handleCoverPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const file = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile();
    if (file) {
      event.preventDefault();
      acceptCoverFile(file);
    }
  };

  const handleEpisodeVideoSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedSeries) return;
    if (!["video/mp4", "video/webm"].includes(file.type) || !/\.(mp4|webm)$/i.test(file.name)) {
      setError("Format video yang didukung hanya MP4 dan WebM.");
      return;
    }
    setError("");
    void uploadEpisode(selectedSeries, file);
  };

  const handleEpisodeThumbnailSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const episodeId = thumbnailTargetEpisodeId.current;
    thumbnailTargetEpisodeId.current = null;
    if (!file || !selectedSeries || !episodeId) return;
    if (!imageExtension(file)) {
      setError("Format thumbnail yang didukung hanya JPEG, PNG, dan WebP.");
      return;
    }
    const episode = selectedEpisodes.find((item) => item.id === episodeId);
    if (episode) void uploadEpisodeThumbnail(episode, file);
  };

  const uploadEpisodeThumbnail = async (episode: Episode, file: File) => {
    if (saving || uploadingEpisode || uploadingThumbnailEpisodeId) return;
    setUploadingThumbnailEpisodeId(episode.id);
    setError("");
    const extension = imageExtension(file);
    if (!extension) {
      setError("Format thumbnail yang didukung hanya JPEG, PNG, dan WebP.");
      setUploadingThumbnailEpisodeId(null);
      return;
    }

    const path = `episodes/${episode.id}/thumbnail-${crypto.randomUUID()}.${extension}`;
    let uploaded = false;
    try {
      const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) {
        console.error("Unable to upload drama episode thumbnail:", uploadError);
        throw new Error("Thumbnail episode gagal diunggah. Periksa batas ukuran dan format file.");
      }
      uploaded = true;
      const { error: updateError } = await supabase
        .from("drama_episodes")
        .update({ thumbnail_path: path })
        .eq("id", episode.id);
      if (updateError) {
        console.error("Unable to save drama episode thumbnail:", updateError);
        throw new Error("Thumbnail terunggah, tetapi gagal dipasang ke episode.");
      }
      if (episode.thumbnail_path) {
        const { error: removeError } = await supabase.storage.from(MEDIA_BUCKET).remove([episode.thumbnail_path]);
        if (removeError) {
          console.error("Unable to remove replaced drama episode thumbnail:", removeError);
          setToastMessage("Thumbnail diperbarui, tetapi file thumbnail lama belum terhapus dari Storage.");
        } else {
          setToastMessage(`Thumbnail Episode ${episode.episode_number} berhasil diperbarui.`);
        }
      } else {
        setToastMessage(`Thumbnail Episode ${episode.episode_number} berhasil diunggah.`);
      }
      setRefreshList((current) => current + 1);
    } catch (uploadError) {
      console.error("Drama episode thumbnail upload failed:", uploadError);
      setError(uploadError instanceof Error ? uploadError.message : "Thumbnail episode gagal diunggah.");
      if (uploaded) {
        const { error: cleanupError } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
        if (cleanupError) console.error("Unable to clean up failed drama thumbnail upload:", cleanupError);
      }
    } finally {
      setUploadingThumbnailEpisodeId(null);
    }
  };

  const uploadEpisode = async (item: Series, file: File) => {
    if (uploadingEpisode || saving) return;
    setUploadingEpisode(true);
    setEpisodeUploadProgress("Memeriksa video...");
    setError("");

    let seasonId: string | null = null;
    let episodeId: string | null = null;
    let createdSeason = false;
    let uploadedVideoPath: string | null = null;
    let failureMessage = "Episode gagal diunggah.";

    try {
      const durationSeconds = await inspectPortraitVideo(file);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        console.error("Unable to verify user before uploading a drama episode:", userError);
        failureMessage = "Sesi akun tidak valid. Masuk kembali sebelum mengunggah.";
        throw new Error(failureMessage);
      }
      const { data: canManage, error: permissionError } = await supabase.rpc("can_manage_video_catalog");
      if (permissionError || canManage !== true) {
        console.error("Video catalog permission check failed:", permissionError);
        failureMessage = "Akun ini tidak memiliki izin mengelola katalog video.";
        throw new Error(failureMessage);
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) {
        console.error("Unable to prepare resumable Supabase video upload:", sessionError);
        failureMessage = "Sesi Supabase tidak valid. Masuk kembali sebelum mengunggah.";
        throw new Error(failureMessage);
      }

      const season = (item.drama_seasons ?? []).find((entry) => entry.season_number === 1);
      let episodeNumber = 1;
      if (season) {
        seasonId = season.id;
        episodeNumber = Math.max(0, ...(season.drama_episodes ?? []).map((episode) => episode.episode_number)) + 1;
      } else {
        setEpisodeUploadProgress("Menyiapkan season pertama...");
        const { data: newSeason, error: seasonError } = await supabase
          .from("drama_seasons")
          .insert({ series_id: item.id, season_number: 1, title: "Season 1" })
          .select("id")
          .single();
        if (seasonError || !newSeason) {
          console.error("Unable to create drama season:", seasonError);
          failureMessage = "Season drama tidak berhasil disiapkan.";
          throw new Error(failureMessage);
        }
        seasonId = newSeason.id;
        createdSeason = true;
      }

      setEpisodeUploadProgress("Menyiapkan episode...");
      const { data: episode, error: episodeError } = await supabase
        .from("drama_episodes")
        .insert({
          season_id: seasonId,
          episode_number: episodeNumber,
          title: `Episode ${episodeNumber}`,
          synopsis: "",
          status: "draft",
        })
        .select("id")
        .single();
      if (episodeError || !episode) {
        console.error("Unable to create drama episode:", episodeError);
        failureMessage = "Episode tidak berhasil disiapkan.";
        throw new Error(failureMessage);
      }
      episodeId = episode.id;

      const extension = file.type === "video/mp4" ? "mp4" : "webm";
      const videoPath = `episodes/${episode.id}/video.${extension}`;
      await uploadDramaVideo(file, videoPath, accessToken, setEpisodeUploadProgress);
      uploadedVideoPath = videoPath;

      setEpisodeUploadProgress("Menerbitkan episode...");
      const { error: updateEpisodeError } = await supabase
        .from("drama_episodes")
        .update({
          video_path: uploadedVideoPath,
          duration_seconds: durationSeconds,
          status: "published",
        })
        .eq("id", episode.id);
      if (updateEpisodeError) {
        console.error("Unable to publish drama episode:", updateEpisodeError);
        failureMessage = "Video terunggah, tetapi episode gagal diterbitkan.";
        throw new Error(failureMessage);
      }

      const { error: updateSeriesError } = await supabase
        .from("drama_series")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("id", item.id);
      if (updateSeriesError) {
        console.error("Unable to publish drama series after episode upload:", updateSeriesError);
        failureMessage = "Episode terunggah, tetapi status drama gagal diperbarui.";
        throw new Error(failureMessage);
      }

      setToastMessage(`Episode ${episodeNumber} berhasil diterbitkan.`);
      setRefreshList((current) => current + 1);
    } catch (uploadError) {
      console.error("Drama episode upload failed:", uploadError);
      if (uploadError instanceof Error) failureMessage = uploadError.message;
      setError(failureMessage);
      if (uploadedVideoPath) {
        const { error: cleanupError } = await supabase.storage.from(MEDIA_BUCKET).remove([uploadedVideoPath]);
        if (cleanupError) {
          console.error("Unable to clean up failed drama video upload:", cleanupError);
          setError(`${failureMessage} File video sementara perlu dibersihkan dari Supabase Storage.`);
        }
      }
      if (episodeId) {
        const { error: cleanupError } = await supabase.from("drama_episodes").delete().eq("id", episodeId);
        if (cleanupError) console.error("Unable to clean up failed drama episode:", cleanupError);
      }
      if (createdSeason && seasonId) {
        const { error: cleanupError } = await supabase.from("drama_seasons").delete().eq("id", seasonId);
        if (cleanupError) console.error("Unable to clean up failed drama season:", cleanupError);
      }
    } finally {
      setEpisodeUploadProgress("");
      setUploadingEpisode(false);
    }
  };

  const currentCoverUrl = editingId ? mediaUrls.get(editingId)?.coverUrl ?? null : null;
  const selectedCoverUrl = coverFile ? coverPreviewUrl : currentCoverUrl;

  const saveDrama = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const title = formValues.title.trim();
    const slug = titleToSlug(title);
    if (!title || !slug) {
      setFormError("Judul drama wajib diisi.");
      return;
    }

    const existing = editingId ? series.find((item) => item.id === editingId) : null;
    if (!coverFile && !existing?.cover_image_path) {
      setFormError("Sampul utama drama wajib diunggah sebelum disimpan.");
      return;
    }
    const publishedEpisodes = existing?.drama_seasons
      ?.flatMap((season) => season.drama_episodes ?? [])
      .filter((episode) => episode.status === "published" && episode.video_path).length ?? 0;
    const nextStatus = editingId ? formValues.status : "draft";
    if (existing && existing.status !== "published" && nextStatus === "published" && publishedEpisodes === 0) {
      setFormError("Serial perlu memiliki setidaknya satu episode terbit sebelum statusnya dapat diubah menjadi Tayang. Simpan sebagai Draft, lalu unggah episode terlebih dahulu.");
      return;
    }

    setSaving(true);
    setFormError("");
    setFormMessage("");
    let createdId: string | null = null;
    let uploadedCoverPath: string | null = null;
    const uploadedArtworkPaths: string[] = [];
    let coverCleanupWarning = false;
    try {
      let seriesId = editingId;
      if (!seriesId) {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error("Sesi tidak valid. Masuk kembali sebelum membuat drama.");
        const { data, error: insertError } = await supabase
          .from("drama_series")
          .insert({
            title,
            slug,
            synopsis: formValues.synopsis.trim(),
            genre: formValues.genre.trim(),
            is_featured: formValues.is_featured,
            status: nextStatus,
            created_by: userData.user.id,
          })
          .select("id")
          .single();
        if (insertError || !data) {
          console.error("Unable to create drama series:", insertError);
          throw new Error("Drama gagal dibuat. Periksa judul dan coba lagi.");
        }
        seriesId = data.id;
        createdId = data.id;
      }
      if (!seriesId) throw new Error("ID serial drama tidak tersedia.");

      let coverImagePath = existing?.cover_image_path ?? null;
      if (coverFile) {
        const extension = imageExtension(coverFile);
        if (!extension) throw new Error("Format sampul tidak didukung.");
        uploadedCoverPath = `series/${seriesId}/cover-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(uploadedCoverPath, coverFile, {
          contentType: coverFile.type,
          cacheControl: "3600",
          upsert: false,
        });
        if (uploadError) {
          console.error("Unable to upload drama series cover:", uploadError);
          throw new Error("Sampul drama gagal diunggah. Periksa batas ukuran dan format file.");
        }
        coverImagePath = uploadedCoverPath;
      }

      const artworkPaths: Record<OptionalArtworkSlot, string | null> = {
        hero: clearArtwork.hero ? null : existing?.hero_image_path ?? null,
        detail: clearArtwork.detail ? null : existing?.detail_image_path ?? null,
        card: clearArtwork.card ? null : existing?.card_image_path ?? null,
      };
      const existingArtworkPaths: Record<OptionalArtworkSlot, string | null> = {
        hero: existing?.hero_image_path ?? null,
        detail: existing?.detail_image_path ?? null,
        card: existing?.card_image_path ?? null,
      };
      for (const slot of ["hero", "detail", "card"] as const) {
        const file = artworkFiles[slot];
        if (!file) continue;
        const extension = imageExtension(file);
        if (!extension) throw new Error("Format gambar yang didukung hanya JPEG, PNG, dan WebP.");
        const path = `series/${seriesId}/${slot}-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false,
        });
        if (uploadError) {
          console.error(`Unable to upload drama ${slot} artwork:`, uploadError);
          throw new Error(`Gambar ${slot} drama gagal diunggah. Periksa batas ukuran dan format file.`);
        }
        uploadedArtworkPaths.push(path);
        artworkPaths[slot] = path;
      }

      const { error: updateError } = await supabase
        .from("drama_series")
        .update({
          title,
          slug,
          synopsis: formValues.synopsis.trim(),
          genre: formValues.genre.trim(),
          is_featured: formValues.is_featured,
          status: nextStatus,
          cover_image_path: coverImagePath,
          hero_image_path: artworkPaths.hero,
          detail_image_path: artworkPaths.detail,
          card_image_path: artworkPaths.card,
          updated_at: new Date().toISOString(),
        })
        .eq("id", seriesId);
      if (updateError) {
        console.error("Unable to save drama series changes:", updateError);
        throw new Error("Perubahan drama gagal disimpan. Periksa apakah slug judul sudah digunakan.");
      }

      if (existing?.cover_image_path && existing.cover_image_path !== coverImagePath) {
        const { error: removeError } = await supabase.storage.from(MEDIA_BUCKET).remove([existing.cover_image_path]);
        if (removeError) {
          console.error("Unable to remove replaced drama cover:", removeError);
          coverCleanupWarning = true;
        }
      }
      for (const slot of ["hero", "detail", "card"] as const) {
        const previousPath = existingArtworkPaths[slot];
        if (!previousPath || previousPath === artworkPaths[slot]) continue;
        const { error: removeError } = await supabase.storage.from(MEDIA_BUCKET).remove([previousPath]);
        if (removeError) {
          console.error(`Unable to remove replaced drama ${slot} artwork:`, removeError);
          coverCleanupWarning = true;
        }
      }
      setToastMessage(
        `${editingId ? "Perubahan drama berhasil disimpan." : "Drama berhasil dibuat. Tambahkan episode dari kartu + pada daftar episode."}` +
        (coverCleanupWarning ? " Sampul lama belum terhapus dari Storage." : ""),
      );
      setFormMessage("");
      setFormOpen(false);
      setRefreshList((current) => current + 1);
    } catch (saveError) {
      console.error("Unable to save drama:", saveError);
      const message = saveError instanceof Error ? saveError.message : "Drama gagal disimpan.";
      setFormError(message);
      if (uploadedCoverPath) {
        const { error: removeError } = await supabase.storage.from(MEDIA_BUCKET).remove([uploadedCoverPath]);
        if (removeError) console.error("Unable to clean up failed drama cover upload:", removeError);
      }
      if (uploadedArtworkPaths.length) {
        const { error: removeError } = await supabase.storage.from(MEDIA_BUCKET).remove(uploadedArtworkPaths);
        if (removeError) console.error("Unable to clean up failed drama artwork uploads:", removeError);
      }
      if (createdId) {
        const { error: removeError } = await supabase.from("drama_series").delete().eq("id", createdId);
        if (removeError) console.error("Unable to clean up failed drama creation:", removeError);
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteDrama = async (item: Series) => {
    if (saving) return;
    setSaving(true);
    setError("");
    const mediaPaths = [
      ...(item.cover_image_path ? [item.cover_image_path] : []),
      ...(item.hero_image_path ? [item.hero_image_path] : []),
      ...(item.detail_image_path ? [item.detail_image_path] : []),
      ...(item.card_image_path ? [item.card_image_path] : []),
      ...(item.drama_seasons ?? []).flatMap((season) =>
        (season.drama_episodes ?? []).flatMap((episode) => [
          ...(episode.video_path ? [episode.video_path] : []),
          ...(episode.thumbnail_path ? [episode.thumbnail_path] : []),
        ]),
      ),
    ];
    const { error: deleteError } = await supabase.from("drama_series").delete().eq("id", item.id);
    if (deleteError) {
      console.error("Unable to delete drama series:", deleteError);
      const blocked = /foreign key|violates.*constraint/i.test(deleteError.message);
      setDeleteBlockedReason(blocked
        ? "Drama ini masih terhubung ke data tontonan, favorit, atau kampanye. Arsipkan serial agar tidak muncul lagi untuk penonton."
        : "Penghapusan gagal. Periksa izin pengelolaan katalog lalu coba lagi.");
      setConfirmDelete(item);
      setSaving(false);
      return;
    }
    if (mediaPaths.length) {
      const { error: storageError } = await supabase.storage.from(MEDIA_BUCKET).remove(mediaPaths);
      if (storageError) {
        console.error("Unable to remove deleted drama media:", storageError);
        setToastMessage(`Drama "${item.title}" terhapus, tetapi sebagian file media perlu dihapus manual di Supabase Storage.`);
      } else {
        setToastMessage(`Drama "${item.title}" berhasil dihapus.`);
      }
    } else {
      setToastMessage(`Drama "${item.title}" berhasil dihapus.`);
    }
    setSeries((current) => current.filter((seriesItem) => seriesItem.id !== item.id));
    if (selectedSeriesId === item.id) closeSeriesDetails();
    setMediaUrls((current) => {
      const next = new Map(current);
      next.delete(item.id);
      return next;
    });
    setSaving(false);
    setConfirmDelete(null);
    setDeleteBlockedReason("");
  };

  const filteredSeries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("id");
    return series.filter((item) => {
      const matchesQuery = !normalizedQuery
        || `${item.title} ${item.slug} ${item.genre}`.toLocaleLowerCase("id").includes(normalizedQuery);
      return matchesQuery && (statusFilter === "all" || item.status === statusFilter);
    });
  }, [query, series, statusFilter]);
  const selectedSeries = series.find((item) => item.id === selectedSeriesId) ?? null;
  const selectedEpisodes = (selectedSeries?.drama_seasons ?? [])
    .flatMap((season) => (season.drama_episodes ?? []).map((episode) => ({ ...episode, seasonNumber: season.season_number })))
    .sort((left, right) => left.seasonNumber - right.seasonNumber || left.episode_number - right.episode_number);
  const nextEpisodeNumber = Math.max(0, ...selectedEpisodes
    .filter((episode) => episode.seasonNumber === 1)
    .map((episode) => episode.episode_number)) + 1;
  const selectedMedia = selectedSeries ? mediaUrls.get(selectedSeries.id) : null;

  return (
    <>
    <main className="admin-shell"><div className="admin-layout">
      <AdminSidebar activeSection="drama" />
      <div className="admin-main">
        <header className="admin-header">
          <p className="eyebrow">Panel administrasi</p>
          <div className="admin-title">
            <div>
              {selectedSeries && <button className="admin-drama-back" type="button" onClick={closeSeriesDetails}><ArrowLeft size={16} /> Semua drama</button>}
              <h1>{selectedSeries ? selectedSeries.title : "Daftar drama"}</h1>
              <p>{selectedSeries ? "Detail serial dan kelola episode video." : "Pilih sampul drama untuk melihat detail dan mengelola episode."}</p>
            </div>
            {!selectedSeries && (
              <button className="button button-dark" type="button" onClick={openCreateForm} disabled={saving}>
                <Plus size={16} /> Tambah drama
              </button>
            )}
          </div>
        </header>

        {error && <p className="admin-message" role="alert"><AlertCircle size={16} /> {error}</p>}
        {formMessage && <p className="admin-message" role="status">{formMessage}</p>}

        {formOpen && (
          <section className="admin-drama-editor" aria-labelledby="admin-drama-editor-title">
            <div className="admin-drama-editor-heading">
              <div>
                <p className="eyebrow">{editingId ? "UBAH DETAIL SERIAL" : "SERIAL BARU"}</p>
                <h2 id="admin-drama-editor-title">{editingId ? "Edit drama" : "Tambah drama"}</h2>
              </div>
              <button className="admin-drama-editor-close" type="button" onClick={() => setFormOpen(false)} disabled={saving} aria-label="Tutup formulir">
                <X size={19} />
              </button>
            </div>
            {formError && <p className="admin-message" role="alert"><AlertCircle size={16} /> {formError}</p>}
            <form className="admin-drama-editor-form" onSubmit={(event) => void saveDrama(event)}>
              <label className="admin-video-field">
                <span>Judul drama</span>
                <input
                  required
                  maxLength={160}
                  value={formValues.title}
                  onChange={(event) => setFormValues((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Contoh: Takdir di Ujung Senja"
                />
                <small>Slug: {titleToSlug(formValues.title) || "akan-dibuat-dari-judul"}</small>
              </label>
              <label className="admin-video-field">
                <span>Genre</span>
                <input
                  maxLength={80}
                  value={formValues.genre}
                  onChange={(event) => setFormValues((current) => ({ ...current, genre: event.target.value }))}
                  placeholder="Romantis, komedi, misteri..."
                />
              </label>
              <label className="admin-video-field admin-video-field-full">
                <span>Sinopsis</span>
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={formValues.synopsis}
                  onChange={(event) => setFormValues((current) => ({ ...current, synopsis: event.target.value }))}
                  placeholder="Ceritakan ringkasan serial drama."
                />
              </label>
              <div className="admin-video-field">
                <span>Sampul utama drama · wajib · rasio 2:3</span>
                <input ref={coverInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverSelect} />
                <div
                  className={`admin-drama-cover-drop${coverDropActive ? " is-dragging" : ""}${selectedCoverUrl ? " has-preview" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Pilih atau tempel sampul utama drama rasio 2 banding 3"
                  onClick={() => coverInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      coverInputRef.current?.click();
                    }
                  }}
                  onPaste={handleCoverPaste}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setCoverDropActive(true);
                  }}
                  onDragLeave={() => setCoverDropActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setCoverDropActive(false);
                    acceptCoverFile(event.dataTransfer.files[0] ?? null);
                  }}
                >
                  {selectedCoverUrl
                    ? <Image src={selectedCoverUrl} alt="Pratinjau sampul drama" fill unoptimized sizes="(max-width: 600px) 55vw, 220px" />
                    : <span className="admin-drama-cover-drop-empty"><Clapperboard size={27} /><strong>Tempel gambar di sini</strong><small>atau klik untuk memilih file</small></span>}
                  {selectedCoverUrl && <span className="admin-drama-cover-drop-change">Ganti sampul</span>}
                </div>
                <small>{coverFile?.name || "Saran 1000 × 1500 px · tempel (Ctrl+V), seret, atau pilih JPEG/PNG/WebP."}</small>
              </div>
              <OptionalArtworkPicker
                title="Gambar hero beranda"
                ratio="16:9"
                recommendation="1920 × 1080 px"
                currentUrl={editingId ? mediaUrls.get(editingId)?.heroUrl ?? null : null}
                file={artworkFiles.hero}
                clear={clearArtwork.hero}
                disabled={saving}
                onFile={(file) => setArtworkFile("hero", file)}
                onClear={(clear) => setClearArtwork((current) => ({ ...current, hero: clear }))}
                onInvalid={() => setFormError("Format gambar yang didukung hanya JPEG, PNG, dan WebP.")}
              />
              <OptionalArtworkPicker
                title="Gambar detail drama"
                ratio="16:9"
                recommendation="1600 × 900 px"
                currentUrl={editingId ? mediaUrls.get(editingId)?.detailUrl ?? null : null}
                file={artworkFiles.detail}
                clear={clearArtwork.detail}
                disabled={saving}
                onFile={(file) => setArtworkFile("detail", file)}
                onClear={(clear) => setClearArtwork((current) => ({ ...current, detail: clear }))}
                onInvalid={() => setFormError("Format gambar yang didukung hanya JPEG, PNG, dan WebP.")}
              />
              <OptionalArtworkPicker
                title="Gambar kartu/list drama"
                ratio="3:4"
                recommendation="900 × 1200 px"
                currentUrl={editingId ? mediaUrls.get(editingId)?.cardUrl ?? null : null}
                file={artworkFiles.card}
                clear={clearArtwork.card}
                disabled={saving}
                onFile={(file) => setArtworkFile("card", file)}
                onClear={(clear) => setClearArtwork((current) => ({ ...current, card: clear }))}
                onInvalid={() => setFormError("Format gambar yang didukung hanya JPEG, PNG, dan WebP.")}
              />
              <label className="admin-video-field">
                <span>Status serial</span>
                <select
                  value={formValues.status}
                  onChange={(event) => setFormValues((current) => ({ ...current, status: event.target.value as DramaFormValues["status"] }))}
                >
                  <option value="draft">Draft</option>
                  <option value="published" disabled={!editingId}>Tayang{editingId ? "" : " (setelah episode pertama)"}</option>
                  <option value="archived">Arsip</option>
                </select>
                <small>
                  {editingId
                    ? "Serial belum dapat diubah menjadi Tayang sebelum memiliki episode terbit."
                    : "Drama baru disimpan sebagai Draft. Setelah episode pertama diunggah, statusnya otomatis menjadi Tayang."}
                </small>
              </label>
              <label className="admin-drama-featured-toggle">
                <input
                  type="checkbox"
                  checked={formValues.is_featured}
                  onChange={(event) => setFormValues((current) => ({ ...current, is_featured: event.target.checked }))}
                />
                <span><strong>Tampilkan di hero sebagai drama unggulan</strong><small>Hanya serial Tayang dengan episode terbit yang muncul di carousel beranda.</small></span>
              </label>
              <div className="admin-drama-editor-actions">
                <button className="button button-light" type="button" onClick={() => setFormOpen(false)} disabled={saving}>Batal</button>
                <button className="button button-dark" type="submit" disabled={saving}>
                  {saving ? <LoaderCircle className="spin" size={16} /> : <Pencil size={16} />}
                  {saving ? "Menyimpan..." : editingId ? "Simpan perubahan" : "Buat drama"}
                </button>
              </div>
            </form>
          </section>
        )}

        {!selectedSeries && <section className="admin-management-section" aria-labelledby="drama-list-title">
          <div className="admin-section-heading">
            <div><p className="eyebrow">KATALOG VIDEO</p><h2 id="drama-list-title">Serial drama</h2></div>
            <span>{loading ? "Memuat..." : `${filteredSeries.length} serial`}</span>
          </div>

          <div className="admin-drama-filters">
            <label className="admin-drama-search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari judul drama..." aria-label="Cari judul drama" />
            </label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter status drama">
              <option value="all">Semua status</option>
              <option value="published">Tayang</option>
              <option value="draft">Draft</option>
              <option value="archived">Arsip</option>
            </select>
          </div>

          {loading ? (
            <div className="admin-drama-state"><LoaderCircle className="spin" size={24} aria-label="Memuat daftar drama" /></div>
          ) : !filteredSeries.length ? (
            <div className="admin-empty admin-drama-state">
              <Clapperboard size={26} />
              <h2>{series.length ? "Drama tidak ditemukan" : "Belum ada serial drama"}</h2>
              <p>{series.length ? "Ubah kata pencarian atau filter status." : "Buat drama terlebih dahulu dengan mengisi sampul, judul, sinopsis, dan genre."}</p>
            </div>
          ) : (
            <div className="admin-drama-catalog">
              {filteredSeries.map((item) => {
                const episodes = (item.drama_seasons ?? [])
                  .flatMap((season) => (season.drama_episodes ?? []).map((episode) => ({ ...episode, seasonNumber: season.season_number })))
                  .sort((left, right) => left.seasonNumber - right.seasonNumber || left.episode_number - right.episode_number);
                const media = mediaUrls.get(item.id);
                return (
                  <button className="admin-drama-catalog-card" key={item.id} type="button" onClick={() => openSeriesDetails(item)}>
                    <span className="admin-drama-catalog-poster">
                      {media?.cardUrl || media?.coverUrl
                        ? <Image src={media.cardUrl || media.coverUrl || ""} alt="" fill unoptimized sizes="(max-width: 600px) 44vw, 220px" />
                        : <Clapperboard size={30} aria-hidden="true" />}
                      <span className={`admin-drama-status admin-drama-status-${item.status}`}>{statusLabels[item.status]}</span>
                      {item.is_featured && <span className="admin-drama-featured-badge">Unggulan</span>}
                    </span>
                    <span className="admin-drama-catalog-copy">
                      <strong>{item.title}</strong>
                      <small>{item.genre || "Drama"} · {episodes.length} episode</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>}

        {selectedSeries && <section className="admin-management-section" aria-label={`Detail drama ${selectedSeries.title}`}>
            <article className="admin-drama-card">
              <div className="admin-drama-card-heading">
                <div className="admin-drama-cover">
                  {selectedMedia?.coverUrl
                    ? <Image src={selectedMedia.coverUrl} alt={`Cover ${selectedSeries.title}`} fill unoptimized sizes="72px" />
                    : <Clapperboard size={25} aria-hidden="true" />}
                </div>
                <div className="admin-drama-card-title">
                  <p className="admin-drama-meta">{selectedSeries.genre || "DRAMA PENDEK"} · {selectedSeries.slug}</p>
                  <h3>{selectedSeries.title}</h3>
                  {selectedSeries.synopsis && <p className="admin-drama-synopsis">{selectedSeries.synopsis}</p>}
                </div>
                <div className="admin-drama-card-stats">
                  <span className={`admin-drama-status admin-drama-status-${selectedSeries.status}`}>{statusLabels[selectedSeries.status]}</span>
                  {selectedSeries.is_featured && <span className="admin-drama-featured-badge">Unggulan</span>}
                  <strong>{selectedEpisodes.length} video</strong>
                  <small>{selectedSeries.drama_seasons?.length ?? 0} season</small>
                  <div className="admin-drama-actions">
                    <button type="button" className="button button-light" onClick={() => openEditForm(selectedSeries)} disabled={saving || uploadingEpisode}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button type="button" className="admin-drama-delete" onClick={() => {
                      setDeleteBlockedReason("");
                      setConfirmDelete(selectedSeries);
                    }} disabled={saving || uploadingEpisode} aria-label={`Hapus drama ${selectedSeries.title}`}>
                      <Trash2 size={15} /> Hapus
                    </button>
                  </div>
                </div>
              </div>

              <div className="admin-drama-episodes" aria-label={`Daftar episode ${selectedSeries.title}`}>
                {selectedEpisodes.map((episode) => {
                  const episodeMedia = selectedMedia?.episodes.get(episode.id);
                  return (
                    <article className="admin-drama-episode-card" key={episode.id}>
                      <div className="admin-drama-episode-poster">
                        {episodeMedia?.thumbnailUrl || selectedMedia?.cardUrl || selectedMedia?.coverUrl
                          ? <Image src={episodeMedia?.thumbnailUrl || selectedMedia?.cardUrl || selectedMedia?.coverUrl || ""} alt={`Thumbnail ${episode.title}`} fill unoptimized sizes="(max-width: 600px) 42vw, 160px" />
                          : <Video size={25} aria-hidden="true" />}
                        {episodeMedia?.videoUrl ? (
                          <details className="admin-drama-preview">
                            <summary aria-label={`Putar episode ${episode.episode_number}`}><Play size={17} fill="currentColor" /></summary>
                            <video controls playsInline preload="none" poster={episodeMedia.thumbnailUrl ?? undefined}>
                              <source src={episodeMedia.videoUrl} type={episode.video_path?.endsWith(".webm") ? "video/webm" : "video/mp4"} />
                            </video>
                          </details>
                        ) : (
                          <span className={`admin-drama-status admin-drama-status-${episode.status}`}>{statusLabels[episode.status]}</span>
                        )}
                        <span className="admin-drama-episode-number">EP {episode.episode_number}</span>
                      </div>
                      <div className="admin-drama-episode-copy">
                        <strong>{episode.title}</strong>
                        <small>Season {episode.seasonNumber} · {formatDuration(episode.duration_seconds)}</small>
                        <button
                          className="admin-drama-thumbnail-upload"
                          type="button"
                          disabled={saving || uploadingEpisode || uploadingThumbnailEpisodeId !== null}
                          onClick={() => {
                            thumbnailTargetEpisodeId.current = episode.id;
                            episodeThumbnailInputRef.current?.click();
                          }}
                        >
                          {uploadingThumbnailEpisodeId === episode.id
                            ? <LoaderCircle className="spin" size={14} />
                            : <ImagePlus size={14} />}
                          {uploadingThumbnailEpisodeId === episode.id ? "Mengunggah..." : episode.thumbnail_path ? "Ganti thumbnail" : "Tambah thumbnail"}
                        </button>
                        <small>Saran thumbnail: 720 × 1280 px · 9:16</small>
                      </div>
                    </article>
                  );
                })}
                <button
                  className="admin-drama-add-episode"
                  type="button"
                  onClick={() => episodeVideoInputRef.current?.click()}
                  disabled={saving || uploadingEpisode}
                  aria-label={`Upload episode ${nextEpisodeNumber} untuk ${selectedSeries.title}`}
                >
                  <span className="admin-drama-add-episode-icon">
                    {uploadingEpisode ? <LoaderCircle className="spin" size={25} /> : <Plus size={25} />}
                  </span>
                  <strong>{uploadingEpisode ? "Mengunggah..." : "Upload episode"}</strong>
                  <small>Episode {nextEpisodeNumber}</small>
                </button>
                <input
                  ref={episodeVideoInputRef}
                  className="sr-only"
                  type="file"
                  accept="video/mp4,video/webm"
                  disabled={uploadingEpisode}
                  onChange={handleEpisodeVideoSelect}
                  aria-label={`Pilih file video episode ${nextEpisodeNumber}`}
                />
                <input
                  ref={episodeThumbnailInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadingThumbnailEpisodeId !== null}
                  onChange={handleEpisodeThumbnailSelect}
                  aria-label="Pilih gambar thumbnail episode"
                />
              </div>
              {episodeUploadProgress && (
                <p className="admin-drama-upload-progress" role="status" aria-live="polite">
                  <LoaderCircle className="spin" size={16} /> {episodeUploadProgress}
                </p>
              )}
            </article>
          </section>}
      </div>
    </div></main>
    {toastPortalReady && toastMessage && createPortal(
      <div className={`admin-drama-toast${toastVisible ? " is-visible" : ""}`} role="status" aria-live="polite">
        <Check size={17} />
        <span>{toastMessage}</span>
        <button type="button" aria-label="Tutup notifikasi" onClick={() => setToastVisible(false)}><X size={17} /></button>
      </div>,
      document.body,
    )}
    {toastPortalReady && confirmDelete && createPortal(
      <div
        className="admin-drama-modal-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) {
            setConfirmDelete(null);
            setDeleteBlockedReason("");
          }
        }}
      >
        <section
          className="admin-drama-delete-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="admin-drama-delete-title"
          aria-describedby="admin-drama-delete-description"
        >
          <span className="admin-drama-delete-icon"><Trash2 size={22} /></span>
          <h2 id="admin-drama-delete-title">{deleteBlockedReason ? "Drama tidak dapat dihapus" : "Hapus serial drama?"}</h2>
          <p id="admin-drama-delete-description">{deleteBlockedReason || `Serial "${confirmDelete.title}" beserta seluruh episode dan file medianya akan dihapus permanen.`}</p>
          {deleteBlockedReason ? (
            <div className="admin-drama-delete-modal-actions">
              <button className="button button-light" type="button" onClick={() => {
                setConfirmDelete(null);
                setDeleteBlockedReason("");
              }}>Tutup</button>
              {deleteBlockedReason.startsWith("Drama ini masih") && <button className="button button-dark" type="button" onClick={() => {
                const item = confirmDelete;
                setConfirmDelete(null);
                setDeleteBlockedReason("");
                openEditForm(item);
                setFormValues((current) => ({ ...current, status: "archived" }));
              }}>Arsipkan drama</button>}
            </div>
          ) : (
            <div className="admin-drama-delete-modal-actions">
              <button className="button button-light" type="button" onClick={() => setConfirmDelete(null)} disabled={saving}>Batal</button>
              <button className="admin-drama-delete-confirm" type="button" onClick={() => void deleteDrama(confirmDelete)} disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
                {saving ? "Menghapus..." : "Hapus permanen"}
              </button>
            </div>
          )}
        </section>
      </div>,
      document.body,
    )}
    </>
  );
}
