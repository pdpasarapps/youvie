"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, ShieldCheck, Trash2, Upload, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailedError, Upload as TusUpload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import AdminSidebar from "../admin-sidebar";

type Profile = {
  id: string;
  display_name: string;
  role: "reader" | "creator" | "admin";
};

type VideoUploader = {
  user_id: string;
  created_at: string;
};

type VideoSeries = {
  id: string;
  title: string;
  slug: string;
  genre: string;
  status: "draft" | "published" | "archived";
  drama_seasons: {
    id: string;
    season_number: number;
    drama_episodes: { episode_number: number }[];
  }[];
};

const MEDIA_BUCKET = "drama-media";
const supabase = createClient();

function titleToSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function mediaExtension(file: File) {
  if (file.type === "video/mp4") return "mp4";
  if (file.type === "video/webm") return "webm";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return null;
}

function inspectPortraitVideo(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      if (!video.videoWidth || !video.videoHeight || video.videoHeight <= video.videoWidth) {
        reject(new Error("Video harus berorientasi vertikal (portrait)."));
        return;
      }
      if (!Number.isFinite(video.duration) || video.duration < 60 || video.duration > 120) {
        reject(new Error("Durasi video harus antara 1 dan 2 menit."));
        return;
      }
      resolve(Math.round(video.duration));
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Metadata video tidak dapat dibaca. Gunakan berkas MP4 atau WebM yang valid."));
    };
    video.src = objectUrl;
  });
}

function uploadVideo(file: File, path: string, onProgress: (progress: string) => void) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return new Promise<void>((resolve, reject) => {
    void supabase.auth.getSession().then(({ data, error }) => {
      const token = data.session?.access_token;
      if (error || !supabaseUrl || !supabaseAnonKey || !token) {
        console.error("Unable to prepare resumable Supabase video upload:", error);
        reject(new Error("Sesi Supabase tidak valid. Masuk kembali sebelum mengunggah."));
        return;
      }

      const upload = new TusUpload(file, {
        endpoint: `${supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`,
        headers: {
          authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
        metadata: {
          bucketName: MEDIA_BUCKET,
          objectName: path,
          contentType: file.type,
          cacheControl: "3600",
        },
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        onProgress: (bytesSent, bytesTotal) => {
          onProgress(`Mengunggah video... ${Math.floor((bytesSent / bytesTotal) * 100)}%`);
        },
        onError: (uploadError) => {
          if (uploadError instanceof DetailedError && uploadError.originalResponse?.getStatus() === 413) {
            reject(new Error(
              `Ukuran video ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas Supabase Storage. ` +
              "Kompres video hingga di bawah 50 MB untuk project Free, atau naikkan Global file size limit di Storage Settings " +
              "dan pastikan batas bucket drama-media juga mencukupi.",
            ));
            return;
          }
          reject(uploadError);
        },
        onSuccess: () => resolve(),
      });

      void upload.findPreviousUploads().then((previousUploads) => {
        const previousUpload = previousUploads.find((item) =>
          item.metadata.bucketName === MEDIA_BUCKET && item.metadata.objectName === path,
        );
        if (previousUpload) upload.resumeFromPreviousUpload(previousUpload);
        upload.start();
      }).catch(reject);
    }).catch(reject);
  });
}

export default function VideoUploadPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const prefilledSeriesId = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [uploaders, setUploaders] = useState<VideoUploader[]>([]);
  const [series, setSeries] = useState<VideoSeries[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [dramaTitle, setDramaTitle] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [episodeSaved, setEpisodeSaved] = useState(false);

  useEffect(() => {
    let active = true;

    const loadAccess = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error("Unable to verify video upload access:", userError);
        if (active) {
          setError("Akses akun belum dapat diverifikasi. Muat ulang halaman atau masuk kembali.");
          setLoading(false);
        }
        return;
      }
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (profileError) {
        console.error("Unable to load video uploader profile:", profileError);
        if (active) {
          setError("Profil akun belum dapat dimuat.");
          setLoading(false);
        }
        return;
      }

      const admin = profile?.role === "admin";
      const { data: canManage, error: accessError } = await supabase.rpc("can_manage_video_catalog");
      if (accessError) {
        console.error("Unable to check video catalog access:", accessError);
        if (active) {
          setError("Jalankan SQL katalog dan storage drama di Supabase SQL Editor sebelum menggunakan halaman ini.");
          setLoading(false);
        }
        return;
      }

      if (!active) return;
      setIsAdmin(admin);
      setAuthorized(canManage === true);
      setLoading(false);

      if (canManage) {
        const [profileResult, uploaderResult, seriesResult] = await Promise.all([
          admin
            ? supabase.from("profiles").select("id, display_name, role").order("display_name")
            : Promise.resolve({ data: [], error: null }),
          admin
            ? supabase.from("video_uploaders").select("user_id, created_at").order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("drama_series")
            .select("id, title, slug, genre, status, drama_seasons(id, season_number, drama_episodes(episode_number))")
            .order("created_at", { ascending: false })
            .returns<VideoSeries[]>(),
        ]);
        const loadError = profileResult.error || uploaderResult.error || seriesResult.error;
        if (loadError) {
          console.error("Unable to load video upload management data:", loadError);
          if (active) setError("Daftar serial atau izin upload tidak dapat dimuat.");
          return;
        }
        if (active) {
          setProfiles((profileResult.data ?? []) as Profile[]);
          setUploaders((uploaderResult.data ?? []) as VideoUploader[]);
          setSeries(seriesResult.data ?? []);
          const requestedSeriesId = new URLSearchParams(window.location.search).get("seriesId");
          if (requestedSeriesId) {
            prefilledSeriesId.current = requestedSeriesId;
            const requestedSeries = (seriesResult.data ?? []).find((item) => item.id === requestedSeriesId);
            if (requestedSeries) {
              setDramaTitle(requestedSeries.title);
            } else {
              console.error("Requested drama series for episode upload was not found:", requestedSeriesId);
              setError("Serial yang dipilih tidak ditemukan. Pilih atau masukkan judul drama secara manual.");
            }
          }
        }
      }
    };

    void loadAccess();
    return () => {
      active = false;
    };
  }, [router]);

  const grantAccess = async () => {
    if (!selectedUserId || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      console.error("Unable to verify admin before granting video access:", userError);
      setError("Sesi akun tidak valid. Masuk kembali sebelum mengubah akses.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("video_uploaders").insert({
      user_id: selectedUserId,
      granted_by: userData.user.id,
    });
    if (insertError) {
      console.error("Unable to grant video upload access:", insertError);
      setError("Izin upload tidak berhasil diberikan.");
      setSaving(false);
      return;
    }

    setUploaders((current) => [{ user_id: selectedUserId, created_at: new Date().toISOString() }, ...current]);
    setSelectedUserId("");
    setMessage("Izin upload video berhasil diberikan.");
    setSaving(false);
  };

  const revokeAccess = async (userId: string) => {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    const { error: deleteError } = await supabase.from("video_uploaders").delete().eq("user_id", userId);
    if (deleteError) {
      console.error("Unable to revoke video upload access:", deleteError);
      setError("Izin upload tidak berhasil dicabut.");
      setSaving(false);
      return;
    }
    setUploaders((current) => current.filter((uploader) => uploader.user_id !== userId));
    setMessage("Izin upload video berhasil dicabut.");
    setSaving(false);
  };

  const handleVideoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setVideoFile(null);
    setError("");
    if (!file) return;
    if (!mediaExtension(file) || !["video/mp4", "video/webm"].includes(file.type)) {
      setError("Format video yang didukung hanya MP4 dan WebM.");
      event.target.value = "";
      return;
    }
    try {
      await inspectPortraitVideo(file);
      setVideoFile(file);
    } catch (inspectionError) {
      setError(inspectionError instanceof Error ? inspectionError.message : "Video tidak dapat diperiksa.");
      event.target.value = "";
    }
  };

  const handleImageSelect = (
    event: ChangeEvent<HTMLInputElement>,
    setFile: (file: File | null) => void,
    fieldName: "cover" | "thumbnail",
  ) => {
    const file = event.target.files?.[0] ?? null;
    setFile(null);
    if (!file) return;
    if (file.type.startsWith("video/") || /\.(mp4|webm)$/i.test(file.name)) {
      setError(`File MP4/WebM adalah video. Pilih file tersebut di kolom "Video pendek"; kolom ${fieldName} hanya untuk gambar.`);
      event.target.value = "";
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(`Format ${fieldName} yang didukung hanya JPEG, PNG, dan WebP.`);
      event.target.value = "";
      return;
    }
    setError("");
    setFile(file);
  };

  const saveEpisode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !videoFile) return;

    const title = dramaTitle.trim();
    const slug = titleToSlug(title);
    if (!title || !slug) {
      setError("Judul drama wajib diisi.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    setEpisodeSaved(false);
    setProgress("Memeriksa akses...");

    let seriesId: string | null = null;
    let seasonId: string | null = null;
    let episodeId: string | null = null;
    let episodeNumber = 1;
    let createdSeries = false;
    let createdSeason = false;
    let coverPath: string | null = null;
    let thumbnailPath: string | null = null;
    let videoPath: string | null = null;
    const uploadedPaths: string[] = [];
    let failureMessage = "Video drama tidak berhasil disimpan.";

    try {
      const durationSeconds = await inspectPortraitVideo(videoFile);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        console.error("Unable to verify user before saving a drama episode:", userError);
        failureMessage = "Sesi akun tidak valid. Masuk kembali sebelum mengunggah.";
        throw new Error(failureMessage);
      }
      const { data: canManage, error: permissionError } = await supabase.rpc("can_manage_video_catalog");
      if (permissionError || canManage !== true) {
        console.error("Video catalog permission check failed:", permissionError);
        failureMessage = "Akun ini tidak memiliki izin mengelola video.";
        throw new Error(failureMessage);
      }

      let targetSeries = prefilledSeriesId.current
        ? series.find((item) => item.id === prefilledSeriesId.current)
        : series.find((item) => item.slug === slug);
      if (prefilledSeriesId.current && !targetSeries) {
        failureMessage = "Serial yang dipilih tidak lagi tersedia. Muat ulang halaman lalu pilih serial kembali.";
        throw new Error(failureMessage);
      }
      if (!targetSeries) {
        setProgress("Membuat serial...");
        const { data: insertedSeries, error: seriesError } = await supabase
          .from("drama_series")
          .insert({
            title,
            slug,
            synopsis: "",
            genre: "",
            status: "draft",
            created_by: userData.user.id,
          })
          .select("id")
          .single();
        if (seriesError || !insertedSeries) {
          console.error("Unable to create drama series:", seriesError);
          failureMessage = "Serial tidak berhasil dibuat. Periksa judul atau slug yang sama.";
          throw new Error(failureMessage);
        }
        seriesId = insertedSeries.id;
        targetSeries = {
          id: insertedSeries.id,
          title,
          slug,
          genre: "",
          status: "draft",
          drama_seasons: [],
        };
        createdSeries = true;
      } else {
        seriesId = targetSeries.id;
      }

      if (!seriesId || !targetSeries) {
        failureMessage = "Serial drama tidak dapat ditentukan.";
        throw new Error(failureMessage);
      }

      const season = targetSeries.drama_seasons.find((item) => item.season_number === 1);
      if (season) {
        seasonId = season.id;
        episodeNumber = Math.max(0, ...season.drama_episodes.map((item) => item.episode_number)) + 1;
      } else {
        setProgress("Menyiapkan episode pertama...");
        const { data: newSeason, error: seasonError } = await supabase
          .from("drama_seasons")
          .insert({ series_id: seriesId, season_number: 1, title: "Season 1" })
          .select("id")
          .single();
        if (seasonError || !newSeason) {
          console.error("Unable to create drama season:", seasonError);
          failureMessage = "Season drama tidak berhasil dibuat.";
          throw new Error(failureMessage);
        }
        seasonId = newSeason.id;
        createdSeason = true;
      }

      setProgress("Menyiapkan episode...");
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
        failureMessage = "Episode tidak berhasil disiapkan. Coba upload kembali.";
        throw new Error(failureMessage);
      }
      episodeId = episode.id;

      const videoExtension = mediaExtension(videoFile);
      if (!videoExtension) {
        failureMessage = "Format video tidak didukung.";
        throw new Error(failureMessage);
      }
      videoPath = `episodes/${episode.id}/video.${videoExtension}`;
      await uploadVideo(videoFile, videoPath, setProgress);
      uploadedPaths.push(videoPath);

      if (coverFile) {
        const extension = mediaExtension(coverFile);
        if (!extension) {
          failureMessage = "Format cover tidak didukung.";
          throw new Error(failureMessage);
        }
        coverPath = `series/${seriesId}/cover-${crypto.randomUUID()}.${extension}`;
        setProgress("Mengunggah cover drama...");
        const { error: coverUploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(coverPath, coverFile, {
          contentType: coverFile.type,
          cacheControl: "3600",
          upsert: false,
        });
        if (coverUploadError) {
          console.error("Unable to upload drama cover:", coverUploadError);
          failureMessage = "Cover drama gagal diunggah.";
          throw new Error(failureMessage);
        }
        uploadedPaths.push(coverPath);
      }

      if (thumbnailFile) {
        const extension = mediaExtension(thumbnailFile);
        if (!extension) {
          failureMessage = "Format thumbnail tidak didukung.";
          throw new Error(failureMessage);
        }
        thumbnailPath = `episodes/${episode.id}/thumbnail.${extension}`;
        setProgress("Mengunggah thumbnail...");
        const { error: thumbnailUploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(thumbnailPath, thumbnailFile, {
          contentType: thumbnailFile.type,
          cacheControl: "3600",
          upsert: false,
        });
        if (thumbnailUploadError) {
          console.error("Unable to upload drama thumbnail:", thumbnailUploadError);
          failureMessage = "Thumbnail gagal diunggah.";
          throw new Error(failureMessage);
        }
        uploadedPaths.push(thumbnailPath);
      }

      setProgress("Menerbitkan episode...");
      const { error: updateEpisodeError } = await supabase
        .from("drama_episodes")
        .update({
          video_path: videoPath,
          thumbnail_path: thumbnailPath,
          duration_seconds: durationSeconds,
          status: "published",
        })
        .eq("id", episode.id);
      if (updateEpisodeError) {
        console.error("Unable to finalize drama episode:", updateEpisodeError);
        failureMessage = "Episode gagal diterbitkan setelah upload.";
        throw new Error(failureMessage);
      }

      const seriesUpdates: {
        status: "published";
        cover_image_path?: string;
        updated_at: string;
      } = { status: "published", updated_at: new Date().toISOString() };
      if (coverPath) seriesUpdates.cover_image_path = coverPath;
      const { error: updateSeriesError } = await supabase
        .from("drama_series")
        .update(seriesUpdates)
        .eq("id", seriesId);
      if (updateSeriesError) {
        console.error("Unable to finalize drama series:", updateSeriesError);
        failureMessage = "Status serial gagal diperbarui.";
        throw new Error(failureMessage);
      }

      const updatedSeries: VideoSeries = {
        ...targetSeries,
        status: "published",
        drama_seasons: targetSeries.drama_seasons.map((item) =>
          item.id === seasonId
            ? { ...item, drama_episodes: [...item.drama_episodes, { episode_number: episodeNumber }] }
            : item,
        ),
      };
      if (createdSeason && seasonId) {
        updatedSeries.drama_seasons.push({
          id: seasonId,
          season_number: 1,
          drama_episodes: [{ episode_number: episodeNumber }],
        });
      }
      setSeries((current) => createdSeries
        ? [updatedSeries, ...current]
        : current.map((item) => item.id === updatedSeries.id ? updatedSeries : item));

      setMessage(`Episode ${episodeNumber} berhasil diterbitkan. Unggah video berikutnya untuk menambahkan episode ${episodeNumber + 1} ke serial ${targetSeries.title}.`);
      setEpisodeSaved(true);
      setDramaTitle(title);
      setVideoFile(null);
      setCoverFile(null);
      setThumbnailFile(null);
      formRef.current?.reset();
      router.refresh();
    } catch (saveError) {
      console.error("Drama episode upload failed:", saveError);
      if (saveError instanceof Error && saveError.message !== failureMessage) {
        failureMessage = saveError.message;
      }
      setError(failureMessage);
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from(MEDIA_BUCKET).remove(uploadedPaths);
        if (cleanupError) {
          console.error("Unable to clean up uploaded drama files:", cleanupError);
          setError(`${failureMessage} Sebagian berkas sementara perlu dibersihkan dari Supabase Storage.`);
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
      if (createdSeries && seriesId) {
        const { error: cleanupError } = await supabase.from("drama_series").delete().eq("id", seriesId);
        if (cleanupError) console.error("Unable to clean up failed drama series:", cleanupError);
      }
    } finally {
      setSaving(false);
      setProgress("");
    }
  };

  if (loading) {
    return <main className="admin-shell"><div className="admin-main"><LoaderCircle className="spin" size={24} aria-label="Memeriksa akses upload" /></div></main>;
  }

  if (!authorized) {
    return (
      <main className="admin-shell"><div className="admin-layout">
        <AdminSidebar activeSection="video-upload" />
        <div className="admin-main">
          <section className="admin-empty" role={error ? "alert" : "status"}>
            <ShieldCheck size={28} />
            <h1>{error ? "Akses belum tersedia" : "Akses upload dibatasi"}</h1>
            <p>{error || "Halaman upload video hanya dapat digunakan admin dan pengguna yang diberi izin."}</p>
            <Link className="button button-light" href="/account"><ArrowLeft size={16} /> Kembali ke akun</Link>
          </section>
        </div>
      </div></main>
    );
  }

  const availableProfiles = profiles.filter((profile) =>
    profile.role !== "admin" && !uploaders.some((uploader) => uploader.user_id === profile.id),
  );
  const matchingSeries = series.find((item) => item.slug === titleToSlug(dramaTitle));
  const nextEpisodeNumber = matchingSeries
    ? Math.max(0, ...matchingSeries.drama_seasons
      .find((item) => item.season_number === 1)?.drama_episodes.map((item) => item.episode_number) ?? []) + 1
    : 1;

  return (
    <main className="admin-shell"><div className="admin-layout">
      <AdminSidebar activeSection="video-upload" />
      <div className="admin-main">
        <header className="admin-header">
          <Link className="button button-light" href={isAdmin ? "/admin" : "/account"}><ArrowLeft size={16} /> Kembali</Link>
          <div><p className="eyebrow">Youvie · Studio</p><h1>Upload drama vertikal</h1></div>
        </header>

      {error && <p className="admin-video-message admin-video-message-error" role="alert">{error}</p>}
      {message && <p className="admin-video-message" role="status"><Check size={16} /> {message}</p>}
      {episodeSaved && <Link className="button button-light" href="/admin/drama">Lihat kartu episode di daftar drama</Link>}

      <section className="admin-video-form-section" aria-labelledby="video-form-title">
        <div className="admin-section-heading">
          <div><p className="eyebrow">DRAMA PENDEK · PORTRAIT 9:16</p><h2 id="video-form-title">Tambah video drama</h2></div>
          <Video size={24} />
        </div>
        <p className="admin-video-form-note">Isi judul drama, lalu unggah video vertikal berdurasi 1–2 menit. Episode akan diterbitkan otomatis setelah upload selesai.</p>

        <form className="admin-video-form" ref={formRef} onSubmit={(event) => void saveEpisode(event)}>
          <label className="admin-video-field admin-video-field-full">
            <span>Judul drama / video</span>
            <input
              required
              value={dramaTitle}
              onChange={(event) => setDramaTitle(event.target.value)}
              placeholder="Contoh: Takdir di Ujung Senja"
            />
            {matchingSeries && <small>Serial ini sudah ada — video akan disimpan sebagai episode {nextEpisodeNumber}.</small>}
          </label>
          <label className="admin-video-field admin-video-field-full">
            <span>Video pendek (MP4/WebM, portrait, 1–2 menit)</span>
            <input required={!videoFile} type="file" accept="video/mp4,video/webm" onChange={(event) => void handleVideoSelect(event)} />
            {videoFile && <small>{videoFile.name} · {(videoFile.size / 1024 / 1024).toFixed(1)} MB · siap diunggah</small>}
          </label>
          <label className="admin-video-field">
            <span>Cover drama (opsional)</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handleImageSelect(event, setCoverFile, "cover")} />
          </label>
          <label className="admin-video-field">
            <span>Thumbnail (opsional)</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handleImageSelect(event, setThumbnailFile, "thumbnail")} />
          </label>
          <div className="admin-video-submit">
            {progress && <span role="status"><LoaderCircle className="animate-spin" size={15} /> {progress}</span>}
            <button className="button button-dark" type="submit" disabled={!videoFile || !dramaTitle.trim() || saving}>
              {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />} Upload video
            </button>
          </div>
        </form>
      </section>

      {isAdmin && (
        <section className="admin-management-section" aria-labelledby="video-uploaders-title">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Akses terbatas</p><h2 id="video-uploaders-title">Admin dan pengunggah video</h2></div>
            <span>{uploaders.length} izin khusus</span>
          </div>
          <div className="admin-video-access-controls">
            <select aria-label="Pilih akun untuk diberi izin upload" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
              <option value="">Pilih akun…</option>
              {availableProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.display_name || "Tanpa nama"} · {profile.id.slice(0, 8)}</option>
              ))}
            </select>
            <button className="button button-dark" type="button" onClick={() => void grantAccess()} disabled={!selectedUserId || saving}>
              {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />} Beri izin upload
            </button>
          </div>
          {!uploaders.length ? (
            <p className="admin-empty">Belum ada pengguna dengan izin khusus. Semua admin tetap dapat mengelola katalog.</p>
          ) : (
            <div className="request-table-wrap">
              <table className="request-table">
                <thead><tr><th>Pengguna</th><th>Izin diberikan</th><th>Tindakan</th></tr></thead>
                <tbody>{uploaders.map((uploader) => {
                  const profile = profiles.find((item) => item.id === uploader.user_id);
                  return (
                    <tr key={uploader.user_id}>
                      <td><strong>{profile?.display_name || "Akun"}</strong><code>{uploader.user_id}</code></td>
                      <td>{new Date(uploader.created_at).toLocaleDateString("id-ID")}</td>
                      <td><button className="reject-button" type="button" onClick={() => void revokeAccess(uploader.user_id)} disabled={saving}><Trash2 size={15} /> Cabut izin</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </section>
      )}
      </div>
    </div></main>
  );
}
