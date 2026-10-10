"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, BarChart3, Bookmark, CircleHelp, Home, LayoutDashboard, Library, LogOut, Play, Plus, Search, Settings2, Sparkles, Trash2, UserRound, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import CreatorContent, { type CreatorArea } from "./creator-content";
import CreatorAnalytics from "./creator-analytics";
import ReaderPreferencesPanel from "@/components/reader-preferences-panel";
import AccountSecuritySettings from "@/components/account-security-settings";
import { createCreatorHandle, isValidCreatorHandle } from "@/lib/creator-handle";
import { getCreatorSocialPlaceholder, isValidCreatorSocialUrl, normalizeCreatorSocialUrl, parseCreatorSocialLinks, type CreatorSocialLink } from "@/lib/creator-social-links";
import { usePlatformSettings } from "../platform-runtime";
import { useReaderMembership } from "../membership-runtime";
import { READER_MEMBERSHIP_TIERS } from "@/lib/reader-membership";
import { getDramaCoverUrl } from "@/lib/drama-cover-url";

export type AccountSection = "overview" | "watching" | "favorites" | "account-settings" | "creator-application" | "creator-profile" | "creator-guide" | "comic-editor" | "analitik-komik" | CreatorArea;
const isCreatorArea = (section: AccountSection): section is CreatorArea =>
  section === "creator" || section === "komiku" || section === "terbitkan-komik";

type Profile = { id: string; display_name: string; public_handle: string | null; role: "reader" | "creator" | "admin"; public_profile: boolean; bio: string; avatar_key: string | null; banner_key: string | null; social_links: CreatorSocialLink[] };
type CreatorRequest = { status: "pending" | "approved" | "rejected" };
type Relation<T> = T | T[] | null;
type DramaEpisodeRelation = {
  id: string;
  episode_number: number;
  title: string;
  thumbnail_path: string | null;
};
type DramaSeasonRelation = {
  season_number: number;
  drama_episodes: DramaEpisodeRelation[] | null;
};
type DramaSeriesRelation = {
  id: string;
  title: string;
  genre: string;
  cover_image_path: string | null;
  drama_seasons: DramaSeasonRelation[] | null;
};
type DramaFavoriteRow = {
  series_id: string;
  created_at: string;
  drama_series: Relation<DramaSeriesRelation>;
};
type DramaWatchSeries = Omit<DramaSeriesRelation, "drama_seasons">;
type DramaWatchSeason = {
  season_number: number;
  drama_series: Relation<DramaWatchSeries>;
};
type DramaWatchEpisode = DramaEpisodeRelation & {
  drama_seasons: Relation<DramaWatchSeason>;
};
type DramaWatchRow = {
  episode_id: string;
  position_seconds: number;
  duration_seconds: number;
  updated_at: string;
  drama_episodes: Relation<DramaWatchEpisode>;
};
type FavoriteDrama = { id: string; title: string; genre: string; coverUrl: string | null; episodeId: string | null };
type ContinueWatching = {
  episodeId: string;
  episodeTitle: string;
  seriesTitle: string;
  genre: string;
  coverUrl: string | null;
  thumbnailUrl: string | null;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: string;
};

const supabase = createClient();
const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
const socialPlatforms = ["Instagram", "TikTok", "X", "YouTube", "Facebook", "Threads", "Twitch", "Discord", "Website", "Lainnya"];
const isMissingProfileColumnError = (error: { code?: string }) => error.code === "42703" || error.code === "PGRST204";
const roleLabels: Record<Profile["role"], string> = {
  reader: "Penonton",
  creator: "Kreator",
  admin: "Admin",
};
const requestStatusLabels: Record<CreatorRequest["status"], string> = {
  pending: "Menunggu peninjauan",
  approved: "Disetujui",
  rejected: "Ditolak",
};
const firstRelation = <T,>(relation: Relation<T>): T | null =>
  Array.isArray(relation) ? relation[0] ?? null : relation;

export default function AccountContent({ section, children }: { section: AccountSection; children?: ReactNode }) {
  const { settings } = usePlatformSettings();
  const membership = useReaderMembership();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [canManageVideos, setCanManageVideos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [creatorRequest, setCreatorRequest] = useState<CreatorRequest | null>(null);
  const [requestingCreator, setRequestingCreator] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [applicationNote, setApplicationNote] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [otherUrl, setOtherUrl] = useState("");
  const [favoriteDramas, setFavoriteDramas] = useState<FavoriteDrama[]>([]);
  const [bookmarkError, setBookmarkError] = useState("");
  const [continueWatching, setContinueWatching] = useState<ContinueWatching[]>([]);
  const [readingProgressError, setReadingProgressError] = useState("");
  const [activeCreatorGuideTab, setActiveCreatorGuideTab] = useState<"publishing" | "rules" | "images">("publishing");
  const [savingProfileVisibility, setSavingProfileVisibility] = useState(false);
  const [profileVisibilityMessage, setProfileVisibilityMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [publicHandle, setPublicHandle] = useState("");
  const [bio, setBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [socialLinks, setSocialLinks] = useState<CreatorSocialLink[]>([]);
  const [savingCreatorProfile, setSavingCreatorProfile] = useState(false);
  const [creatorProfileMessage, setCreatorProfileMessage] = useState("");

  useEffect(() => {
    const loadAccount = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? "");
      let profileData: {
        display_name: string;
        role: Profile["role"];
        public_profile: boolean;
        bio: string;
        avatar_key: string | null;
        banner_key: string | null;
        social_links: unknown;
        public_handle: string | null;
      } | null = null;
      let profileError = null;
      const profileResult = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (profileResult.error) {
        profileError = profileResult.error;
      } else {
        const row = profileResult.data;
        profileData = {
          display_name: row.display_name,
          role: row.role,
          public_profile: "public_profile" in row ? row.public_profile : false,
          bio: "bio" in row ? row.bio : "",
          avatar_key: "avatar_key" in row ? row.avatar_key : null,
          banner_key: "banner_key" in row ? row.banner_key : null,
          social_links: "social_links" in row ? row.social_links : [],
          public_handle: "public_handle" in row ? row.public_handle : null,
        };
        if (!("public_profile" in row)) {
          setProfileVisibilityMessage("Jalankan supabase/creator-public-profile.sql untuk mengaktifkan profil publik.");
        }
        if (!("public_handle" in row)) {
          setCreatorProfileMessage("Jalankan supabase/creator-profile-handle.sql untuk mengaktifkan URL profil kreator.");
        } else if (!("social_links" in row) || !("bio" in row) || !("banner_key" in row)) {
          setCreatorProfileMessage("Jalankan ulang supabase/creator-profile-bio.sql untuk mengaktifkan semua field profil kreator.");
        }
      }
      if (profileError && !profileData) {
        console.error("Unable to load account profile:", profileError);
      } else if (profileData) {
        const loadedProfile = {
          ...profileData,
          id: user.id,
          role: profileData.role === "creator" ? "reader" : profileData.role,
          social_links: parseCreatorSocialLinks(profileData.social_links),
        };
        if (profileData.role === "admin") {
          setCanManageVideos(true);
        } else {
          const { data: canManage, error: accessError } = await supabase.rpc("can_manage_video_catalog");
          if (accessError) {
            console.error("Unable to check account video upload access:", accessError);
          } else if (canManage === true) {
            setCanManageVideos(true);
          }
        }
        setProfile(loadedProfile);
        setDisplayName(loadedProfile.display_name);
        setPublicHandle(loadedProfile.public_handle || createCreatorHandle(loadedProfile.display_name));
        setBio(loadedProfile.bio);
        setSocialLinks(loadedProfile.social_links);
      }
      let favoriteRows: DramaFavoriteRow[] = [];
      let watchRows: DramaWatchRow[] = [];
      if (section === "overview" || section === "favorites") {
        const { data, error } = await supabase
          .from("drama_favorites")
          .select("series_id, created_at, drama_series!inner(id, title, genre, cover_image_path, drama_seasons(season_number, drama_episodes(id, episode_number, title, thumbnail_path)))")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .returns<DramaFavoriteRow[]>();
        if (error) {
          console.error("Unable to load account drama favorites:", {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          });
          setBookmarkError(error.code === "PGRST205"
            ? "Fitur favorit drama belum tersedia. Jalankan supabase/drama-viewer-library.sql."
            : "Favorit drama gagal dimuat. Coba muat ulang halaman.");
        } else {
          favoriteRows = data ?? [];
        }
      }
      if (section === "overview" || section === "watching") {
        const { data, error } = await supabase
          .from("drama_episode_watch_progress")
          .select("episode_id, position_seconds, duration_seconds, updated_at, drama_episodes!inner(id, episode_number, title, thumbnail_path, drama_seasons!inner(season_number, drama_series!inner(id, title, genre, cover_image_path)))")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(12)
          .returns<DramaWatchRow[]>();
        if (error) {
          console.error("Unable to load account drama watch progress:", {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          });
          setReadingProgressError(error.code === "PGRST205"
            ? "Riwayat tontonan belum tersedia. Jalankan supabase/drama-viewer-library.sql."
            : "Riwayat tontonan gagal dimuat. Coba muat ulang halaman.");
        } else {
          watchRows = data ?? [];
        }
      }

      const mediaPaths = [...new Set([
        ...watchRows.flatMap((row) => {
          const episode = firstRelation(row.drama_episodes);
          return episode?.thumbnail_path ? [episode.thumbnail_path] : [];
        }),
      ])];
      const urlByPath = new Map<string, string>();
      if (mediaPaths.length > 0) {
        const { data, error } = await supabase.storage.from("drama-media").createSignedUrls(mediaPaths, 3600);
        if (error) {
          console.error("Unable to sign account drama artwork URLs:", error);
          setBookmarkError((current) => current || "Sampul drama belum dapat dimuat.");
          setReadingProgressError((current) => current || "Gambar riwayat tontonan belum dapat dimuat.");
        } else {
          for (const item of data ?? []) {
            if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
          }
        }
      }
      setFavoriteDramas(favoriteRows.flatMap((row) => {
        const series = firstRelation(row.drama_series);
        if (!series) return [];
        const firstEpisode = (series.drama_seasons ?? [])
          .flatMap((season) => (season.drama_episodes ?? []).map((episode) => ({ seasonNumber: season.season_number, episode })))
          .sort((left, right) => left.seasonNumber - right.seasonNumber || left.episode.episode_number - right.episode.episode_number)[0]?.episode;
        return [{
          id: series.id,
          title: series.title,
          genre: series.genre,
          coverUrl: getDramaCoverUrl(series.cover_image_path),
          episodeId: firstEpisode?.id ?? null,
        }];
      }));
      setContinueWatching(watchRows.flatMap((row) => {
        const episode = firstRelation(row.drama_episodes);
        const season = episode ? firstRelation(episode.drama_seasons) : null;
        const series = season ? firstRelation(season.drama_series) : null;
        if (!episode || !season || !series) return [];
        return [{
          episodeId: episode.id,
          episodeTitle: episode.title,
          seriesTitle: series.title,
          genre: series.genre,
          coverUrl: getDramaCoverUrl(series.cover_image_path),
          thumbnailUrl: episode.thumbnail_path ? urlByPath.get(episode.thumbnail_path) ?? null : null,
          seasonNumber: season.season_number,
          episodeNumber: episode.episode_number,
          positionSeconds: Math.max(0, row.position_seconds),
          durationSeconds: Math.max(0, row.duration_seconds),
          updatedAt: row.updated_at,
        }];
      }));
      setLoading(false);
    };
    loadAccount();
  }, [router, section]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/");
  };

  const updateProfileVisibility = async (publicProfile: boolean) => {
    if (!profile || profile.role !== "creator") return;
    setSavingProfileVisibility(true);
    setProfileVisibilityMessage("");
    const { data, error } = await supabase
      .from("profiles")
      .update({ public_profile: publicProfile })
      .eq("id", profile.id)
      .select("public_profile")
      .single();
    if (error) {
      console.error("Unable to update creator profile visibility:", error);
      setProfileVisibilityMessage(
        error.code === "42703"
          ? "Pengaturan ini belum tersedia. Jalankan supabase/creator-public-profile.sql pada database."
          : "Pengaturan profil publik gagal disimpan. Coba lagi.",
      );
    } else {
      setProfile({ ...profile, public_profile: data.public_profile });
      setProfileVisibilityMessage(data.public_profile ? "Profil kreator sekarang dapat dilihat publik." : "Profil kreator sekarang privat.");
    }
    setSavingProfileVisibility(false);
  };

  const saveCreatorProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || profile.role !== "creator") return;
    const name = displayName.trim();
    const handle = publicHandle.trim().toLowerCase();
    const creatorBio = bio.trim();
    if (!name || name.length > 80 || creatorBio.length > 500) {
      setCreatorProfileMessage("Nama wajib diisi (maksimal 80 karakter) dan bio maksimal 500 karakter.");
      return;
    }
    if (!isValidCreatorHandle(handle)) {
      setCreatorProfileMessage("URL profil harus 3–40 karakter, hanya huruf kecil, angka, dan tanda hubung.");
      return;
    }
    if (avatarFile && (!["image/jpeg", "image/png", "image/webp"].includes(avatarFile.type) || avatarFile.size > 5 * 1024 * 1024)) {
      setCreatorProfileMessage("Foto harus berformat JPG, PNG, atau WebP dan berukuran maksimal 5 MB.");
      return;
    }
    if (bannerFile && (!["image/jpeg", "image/png", "image/webp"].includes(bannerFile.type) || bannerFile.size > 10 * 1024 * 1024)) {
      setCreatorProfileMessage("Banner harus berformat JPG, PNG, atau WebP dan berukuran maksimal 10 MB.");
      return;
    }
    const enteredSocialLinks = socialLinks.map((link) => ({
      platform: link.platform.trim(),
      url: normalizeCreatorSocialUrl(link.platform.trim(), link.url),
    }));
    if (enteredSocialLinks.some((link) => Boolean(link.platform) !== Boolean(link.url))) {
      setCreatorProfileMessage("Lengkapi nama platform dan tautannya, atau hapus baris yang kosong.");
      return;
    }
    if (enteredSocialLinks.some((link) => link.platform.length > 32 || link.url.length > 500 || (link.url && !isValidCreatorSocialUrl(link.url)))) {
      setCreatorProfileMessage("Tautan sosial harus menggunakan URL HTTPS yang valid; nama platform maksimal 32 karakter.");
      return;
    }
    const savedSocialLinks = enteredSocialLinks.filter((link) => link.platform && link.url);

    setSavingCreatorProfile(true);
    setCreatorProfileMessage("");
    try {
      let avatarKey = profile.avatar_key;
      let bannerKey = profile.banner_key;
      if (avatarFile || bannerFile) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session?.access_token) {
          throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");
        }
        for (const [imageType, imageFile] of [["avatar", avatarFile], ["banner", bannerFile]] as const) {
          if (!imageFile) continue;
          const formData = new FormData();
          formData.append("imageType", imageType);
          formData.append(imageType, imageFile);
          const uploadResponse = await fetch("/api/r2/profile-avatar", {
            method: "POST",
            headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
            body: formData,
          });
          const uploadResult = await uploadResponse.json() as { error?: string; objectKey?: string };
          if (!uploadResponse.ok || !uploadResult.objectKey) {
            throw new Error(uploadResult.error || `${imageType === "banner" ? "Banner" : "Foto profil"} gagal diunggah.`);
          }
          if (imageType === "avatar") avatarKey = uploadResult.objectKey;
          else bannerKey = uploadResult.objectKey;
        }
      }

      const { data, error } = await supabase
        .from("profiles")
        .update({ display_name: name, public_handle: handle, bio: creatorBio, avatar_key: avatarKey, banner_key: bannerKey, social_links: savedSocialLinks })
        .eq("id", profile.id)
        .select("display_name, public_handle, bio, avatar_key, banner_key, social_links")
        .single();
      if (error) {
        console.error("Unable to save creator profile:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        if (isMissingProfileColumnError(error)) {
          const missingColumn = error.message.match(/'([^']+)' column|'([^']+)' of 'profiles'/i)?.slice(1).find(Boolean);
          if (missingColumn === "public_handle") {
            throw new Error("Kolom URL profil belum tersedia. Jalankan supabase/creator-profile-handle.sql pada database terlebih dahulu.");
          }
          if (missingColumn === "social_links") {
            const { data: profileWithoutSocialLinks, error: retryError } = await supabase
              .from("profiles")
              .update({ display_name: name, public_handle: handle, bio: creatorBio, avatar_key: avatarKey, banner_key: bannerKey })
              .eq("id", profile.id)
              .select("display_name, public_handle, bio, avatar_key, banner_key")
              .single();
            if (!retryError && profileWithoutSocialLinks) {
              setProfile({ ...profile, ...profileWithoutSocialLinks });
              setDisplayName(profileWithoutSocialLinks.display_name);
              setPublicHandle(profileWithoutSocialLinks.public_handle);
              setBio(profileWithoutSocialLinks.bio);
              setAvatarFile(null);
              setBannerFile(null);
              setCreatorProfileMessage("Profil tersimpan, tetapi tautan sosial belum. Jalankan ulang supabase/creator-profile-bio.sql, lalu simpan lagi.");
              return;
            }
            if (retryError) {
              console.error("Unable to save creator profile without social links:", {
                code: retryError.code,
                message: retryError.message,
                details: retryError.details,
                hint: retryError.hint,
              });
            }
          }
          throw new Error(`Kolom ${missingColumn ? `"${missingColumn}"` : "profil"} belum tersedia di Supabase. Jalankan ulang supabase/creator-profile-bio.sql, lalu muat ulang skema API Supabase.`);
        }
        if (error.code === "23505") {
          throw new Error("URL profil tersebut sudah dipakai kreator lain. Silakan pilih URL yang berbeda.");
        }
        console.error("Unable to save creator profile:", error);
        throw new Error("Profil gagal disimpan. Periksa koneksi dan coba lagi.");
      }
      setProfile({ ...profile, ...data });
      setDisplayName(data.display_name);
      setPublicHandle(data.public_handle);
      setBio(data.bio);
      setAvatarFile(null);
      setBannerFile(null);
      setSocialLinks(parseCreatorSocialLinks(data.social_links));
      setCreatorProfileMessage("Profil kreator berhasil disimpan.");
    } catch (error) {
      console.error("Creator profile save failed:", error);
      setCreatorProfileMessage(error instanceof Error ? error.message : "Profil gagal disimpan. Coba lagi.");
    } finally {
      setSavingCreatorProfile(false);
    }
  };

  const handleCreatorRequest = async () => {
    if (!settings.feature_flags.creators || !settings.creator_applications_enabled) {
      setRequestMessage("Pengajuan kreator sedang ditutup sementara.");
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    setRequestingCreator(true);
    setRequestMessage("");
    const requestPayload = { note: applicationNote.trim(), portfolio_url: portfolioUrl.trim() || null, instagram_url: instagramUrl.trim() || null, other_url: otherUrl.trim() || null, status: "pending" };
    const query = creatorRequest?.status === "rejected"
      ? supabase.from("creator_requests").update(requestPayload).eq("user_id", userData.user.id).select("status").single()
      : supabase.from("creator_requests").insert({ user_id: userData.user.id, ...requestPayload }).select("status").single();
    const { data, error } = await query;
    if (error) {
      setRequestMessage(error.code === "23505" ? "Pengajuan akses kreatormu sedang ditinjau." : "Pengajuan tidak dapat dikirim. Jalankan creator-request.sql terlebih dahulu.");
    } else {
      setCreatorRequest(data);
      setRequestMessage("Pengajuan terkirim. Admin akan meninjau permintaan akses kreatormu.");
    }
    setRequestingCreator(false);
  };

  if (loading) return <main className="account-shell"><p className="account-loading">Memuat halaman akun...</p></main>;

  const roleLabel = profile?.role ? roleLabels[profile.role] : "Penonton";
  const accountAvatar = profile?.avatar_key && publicUrl
    ? <Image src={`${publicUrl.replace(/\/$/, "")}/${profile.avatar_key}`} alt="" width={42} height={42} unoptimized />
    : <UserRound size={20} />;

  return (
    <main className="account-shell">
      <aside className="account-sidebar">
        <BrandLogo className="account-brand" showName />
        <nav className="account-sidebar-nav" aria-label="Navigasi akun">
          <Link className={`account-nav-link${section === "overview" ? " active" : ""}`} href="/account" aria-current={section === "overview" ? "page" : undefined}><LayoutDashboard size={18} /><span>Ringkasan</span></Link>
          <Link className="account-nav-link" href="/"><Home size={18} /><span>Beranda</span></Link>
          <p className="account-nav-label">Penonton</p>
          <Link className={`account-nav-link${section === "watching" ? " active" : ""}`} href="/account/watching" aria-current={section === "watching" ? "page" : undefined}><Video size={18} /><span>Lanjut menonton</span></Link>
          <Link className={`account-nav-link${section === "favorites" ? " active" : ""}`} href="/account/favorites" aria-current={section === "favorites" ? "page" : undefined}><Bookmark size={18} /><span>Favorit</span></Link>
          <p className="account-nav-label">Akun</p>
          <Link className={`account-nav-link${section === "account-settings" ? " active" : ""}`} href="/account/account-settings" aria-current={section === "account-settings" ? "page" : undefined}><Settings2 size={18} /><span>Pengaturan</span></Link>
          {canManageVideos && <Link className="account-nav-link" href="/admin/video-upload"><Video size={18} /><span>Upload video drama</span></Link>}
          {profile?.role === "admin" && <Link className="account-nav-link" href="/admin"><Settings2 size={18} /><span>Buka panel admin</span><ArrowUpRight size={15} /></Link>}
        </nav>
        <div className="account-sidebar-user">
          <span className="account-user-avatar">{accountAvatar}</span>
          <span className="account-user-copy"><strong>{profile?.display_name || "Penonton"}</strong><small>{roleLabel}</small></span>
          <button className="account-logout" onClick={handleLogout} disabled={loggingOut}><LogOut size={17} /><span>{loggingOut ? "Keluar..." : "Keluar"}</span></button>
        </div>
      </aside>
      <div className={`account-main${profile?.role === "creator" ? " account-main-creator" : ""}${section === "creator-profile" ? " account-profile-focus" : ""}${section === "creator-guide" ? " account-guide-focus" : ""}${section !== "overview" ? " account-subpage" : ""}${isCreatorArea(section) ? " account-creator-area" : ""}${section === "comic-editor" ? " account-comic-editor-area" : ""}`}>
      <div className="account-mobile-header"><BrandLogo showName /><button className="account-logout" onClick={handleLogout} disabled={loggingOut}><LogOut size={16} /> {loggingOut ? "Keluar..." : "Keluar"}</button></div>
      {!isCreatorArea(section) && section !== "comic-editor" && section !== "analitik-komik" && <header className="account-header"><p className="eyebrow">{section === "overview" ? "Ruang Dramamu" : "Akun"}</p><h1>{section === "overview" ? `Hai, ${profile?.display_name || "Penonton"}.` : section === "watching" ? "Lanjut menonton" : section === "favorites" ? "Favorit drama" : section === "account-settings" ? "Pengaturan" : section === "creator-application" ? "Jadi kreator" : section === "creator-profile" ? "Profil kreator" : "Panduan Youvie"}</h1>{section === "overview" && <><p className="account-email">{email}</p><p className="account-email">{membership.ready ? `Paket ${READER_MEMBERSHIP_TIERS.find((item) => item.value === membership.tier)?.label || "Free"}` : "Memuat paket..."}</p></>}</header>}
      {section === "comic-editor" ? children : section === "analitik-komik" ? (
        profile?.role === "creator"
          ? <CreatorAnalytics />
          : <section className="account-panel account-route-unavailable" role="status"><h2>Bagian ini khusus kreator.</h2><p>Untuk melihat analitik, gunakan akun kreator.</p><Link className="button button-dark" href="/account">Kembali ke akun</Link></section>
      ) : isCreatorArea(section)
        ? <CreatorContent area={section} />
        : <>
      {section !== "creator-guide" && <section className={`account-grid ${section === "overview" ? "account-dashboard-grid" : "account-subpage-content"}`}>
        {(section === "overview" || section === "watching") && <article className="account-panel account-panel-wide account-reading-panel" id="watching">
          <div className="panel-heading"><div><p className="eyebrow">Terakhir diputar</p><h2>Lanjutkan menonton</h2></div><Video size={22} /></div>
          {readingProgressError
            ? <p className="account-reading-message" role="alert">{readingProgressError}</p>
            : continueWatching.length
              ? <div className="account-drama-progress-list">{continueWatching.slice(0, section === "overview" ? 3 : 12).map((episode) => {
                const completed = episode.durationSeconds > 0 && episode.positionSeconds >= episode.durationSeconds - 5;
                const resumeAt = completed ? 0 : Math.floor(episode.positionSeconds);
                const href = `/watch/${encodeURIComponent(episode.episodeId)}/player?time=${resumeAt}`;
                const progress = episode.durationSeconds > 0 ? Math.min(100, (episode.positionSeconds / episode.durationSeconds) * 100) : 0;
                return <Link className="account-reading-card" href={href} key={episode.episodeId}>
                  <span className="account-reading-cover">
                    {episode.thumbnailUrl || episode.coverUrl
                      ? <Image src={episode.thumbnailUrl || episode.coverUrl || ""} alt={`Sampul ${episode.seriesTitle}`} fill sizes="(max-width: 760px) 72px, 90px" unoptimized />
                      : <Video size={22} />}
                  </span>
                  <span className="account-reading-info">
                    <small>{episode.genre || "Drama pendek"} · S{episode.seasonNumber} E{episode.episodeNumber}</small>
                    <strong>{episode.seriesTitle}</strong>
                    <span>{episode.episodeTitle}</span>
                    <small className="account-reading-progress">{completed ? "Selesai ditonton" : `${Math.floor(episode.positionSeconds / 60)}:${String(Math.floor(episode.positionSeconds % 60)).padStart(2, "0")}${episode.durationSeconds ? ` dari ${Math.floor(episode.durationSeconds / 60)}:${String(Math.floor(episode.durationSeconds % 60)).padStart(2, "0")}` : ""}`}</small>
                    {episode.durationSeconds > 0 && <span className="account-reading-progressbar" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>}
                  </span>
                  <span className="account-reading-action">{completed ? "Tonton lagi" : "Lanjutkan menonton"} <Play size={15} fill="currentColor" /></span>
                </Link>;
              })}</div>
              : <div className="account-reading-empty">
                  <span className="empty-icon"><Video size={23} /></span>
                  <h3>Belum ada tontonan terakhir.</h3>
                  <p>Progres episode drama yang kamu tonton akan tersimpan di sini.</p>
                  <Link className="button button-dark" href="/#drama-catalog">Jelajahi drama</Link>
                </div>}
        </article>}
        {(section === "overview" || section === "favorites") && <article className="account-panel account-bookmark-panel" id="favorites">
          <div className="panel-heading"><div><p className="eyebrow">Simpan untuk nanti</p><h2>Favorit drama</h2></div><Bookmark size={22} /></div>
          {bookmarkError ? <p className="account-bookmark-message" role="alert">{bookmarkError}</p>
            : favoriteDramas.length ? <div className="account-bookmark-list">{favoriteDramas.slice(0, section === "overview" ? 4 : 50).map((drama) => {
              const href = drama.episodeId
                ? `/watch/${encodeURIComponent(drama.episodeId)}`
                : "/#drama-catalog";
              return <Link className="account-bookmark-item" href={href} key={drama.id}>
                <span className="account-bookmark-cover">{drama.coverUrl ? <Image src={drama.coverUrl} alt="" fill sizes="48px" unoptimized /> : <Video size={19} />}</span>
                <span className="account-bookmark-copy"><strong>{drama.title}</strong><small>{drama.genre || "Drama pendek"}</small></span>
                <ArrowRight size={16} />
              </Link>;
            })}</div>
            : <div className="account-empty compact"><div className="empty-icon"><Bookmark size={23} /></div><p>Belum ada drama favorit.</p><small>Simpan serial drama dari halaman beranda untuk ditonton nanti.</small><Link className="text-link" href="/#drama-catalog">Jelajahi drama <span>↗</span></Link></div>}
        </article>}
        {(section === "account-settings" || (section === "creator-profile" && profile?.role === "creator")) && <article className="account-panel account-settings-panel" id="account-settings">
          <div className="panel-heading"><div><p className="eyebrow">Akun dan tontonan</p><h2>Profil dan preferensi</h2></div><Settings2 size={22} /></div>
          <div className="settings-row"><span>Jenis akun</span><strong>{roleLabel}</strong></div>
          <div className="settings-row"><span>Alamat email</span><strong>{email}</strong></div>
          <ReaderPreferencesPanel />
          <AccountSecuritySettings />
          {profile?.role === "creator" && <Link className="account-creator-link" href="/account/creator"><Sparkles size={16} /> Buka Ruang Kreator <ArrowUpRight size={15} /></Link>}
          {profile?.role === "creator" && (
            <div className="creator-profile-setting">
              <label className="creator-profile-visibility">
                <span><strong>Bagikan profil publik</strong><small>{profile.public_profile ? "Nama dan komik terbit dapat dilihat semua orang." : "Profil dan daftar komik disembunyikan dari publik."}</small></span>
                <input
                  type="checkbox"
                  checked={profile.public_profile}
                  disabled={savingProfileVisibility}
                  onChange={(event) => void updateProfileVisibility(event.target.checked)}
                />
              </label>
              {profileVisibilityMessage && <p className="creator-profile-message" role="status">{profileVisibilityMessage}</p>}
            </div>
          )}
          {profile?.role === "creator" && (
            <form className="creator-profile-editor" id="creator-profile" onSubmit={saveCreatorProfile}>
              <div className="creator-profile-editor-heading">
                <strong>Profil kreator</strong>
                <small>Atur bagaimana pembaca melihat profil dan cerita yang kamu buat.</small>
                {profile.public_profile && profile.public_handle && (
                  <Link className="creator-profile-public-link" href={`/kreator/${encodeURIComponent(profile.public_handle)}`}>
                    Lihat profil <ArrowUpRight size={15} />
                  </Link>
                )}
              </div>
              <div className="creator-avatar-row">
                <span className="creator-avatar-preview">
                  {profile.avatar_key && publicUrl
                    ? <Image src={`${publicUrl.replace(/\/$/, "")}/${profile.avatar_key}`} alt="Foto profil kreator" width={54} height={54} unoptimized />
                    : <UserRound size={22} />}
                </span>
                <label className="creator-avatar-upload">
                  <strong>Foto profil</strong>
                  <span>{avatarFile ? avatarFile.name : "Pilih foto profil"}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
                    disabled={savingCreatorProfile}
                  />
                  <small>JPG, PNG, atau WebP · Maks. 5 MB</small>
                </label>
              </div>
              <label className="creator-profile-field creator-banner-field">
                <span>Banner profil</span>
                <span className="creator-banner-preview">
                  {bannerFile
                    ? <span className="creator-banner-selected">{bannerFile.name} · Siap diunggah</span>
                    : profile.banner_key && publicUrl
                      ? <Image src={`${publicUrl.replace(/\/$/, "")}/${profile.banner_key}`} alt="Banner profil saat ini" fill sizes="(max-width: 760px) 85vw, 380px" unoptimized />
                      : <span>Tambahkan ilustrasi banner untuk bagian atas profilmu</span>}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setBannerFile(event.target.files?.[0] ?? null)}
                  disabled={savingCreatorProfile}
                />
                <small>JPG, PNG, atau WebP · Maks. 10 MB · Disarankan rasio lebar 3:1</small>
              </label>
              <label className="creator-profile-field">
                <span>Nama tampilan</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} required disabled={savingCreatorProfile} />
                <small>Nama yang akan dilihat pembaca.</small>
              </label>
              <label className="creator-profile-field">
                <span>URL profil</span>
                <input
                  value={publicHandle}
                  onChange={(event) => setPublicHandle(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40))}
                  maxLength={40}
                  autoCapitalize="none"
                  autoComplete="off"
                  disabled={savingCreatorProfile}
                  required
                  aria-describedby="creator-public-handle-help"
                />
                <small id="creator-public-handle-help">
                  Tautan publik profilmu: /kreator/{publicHandle || "nama-kreator"}. 3–40 karakter, huruf kecil, angka, dan tanda hubung.
                </small>
              </label>
              <label className="creator-profile-field">
                <span>Tentang kreator</span>
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} rows={4} placeholder="Ceritakan singkat tentang dirimu dan cerita yang kamu buat." disabled={savingCreatorProfile} />
                <small>Ceritakan singkat tentang dirimu dan cerita yang kamu buat. {bio.length}/500 karakter</small>
              </label>
              <div className="creator-social-editor">
                <div className="creator-social-heading">
                  <span><strong>Media sosial</strong><small>Tambahkan tautan untuk membantu pembaca mengenalmu.</small></span>
                  <button
                    className="creator-social-add"
                    type="button"
                    onClick={() => setSocialLinks((current) => [...current, { platform: socialPlatforms[0], url: "" }])}
                    disabled={savingCreatorProfile}
                  ><Plus size={15} /> Tambah</button>
                </div>
                {socialLinks.length === 0
                  ? <p className="creator-social-empty">Belum ada tautan sosial.</p>
                  : <div className="creator-social-rows">
                      {socialLinks.map((link, index) => (
                        <div className="creator-social-row" key={`social-${index}`}>
                          <label>
                            <span className="sr-only">Nama platform sosial {index + 1}</span>
                            <select
                              value={link.platform}
                              onChange={(event) => setSocialLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, platform: event.target.value } : item))}
                              disabled={savingCreatorProfile}
                              required
                            >
                              <option value="" disabled>Pilih platform</option>
                              {socialPlatforms.map((platform) => <option value={platform} key={platform}>{platform}</option>)}
                            </select>
                          </label>
                          <label>
                            <span className="sr-only">URL platform sosial {index + 1}</span>
                            <input
                              type="text"
                              inputMode="url"
                              value={link.url}
                              onChange={(event) => setSocialLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))}
                              placeholder={getCreatorSocialPlaceholder(link.platform, displayName)}
                              maxLength={500}
                              disabled={savingCreatorProfile}
                            />
                          </label>
                          <button
                            className="creator-social-remove"
                            type="button"
                            aria-label={`Hapus tautan sosial ${link.platform || index + 1}`}
                            onClick={() => setSocialLinks((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                            disabled={savingCreatorProfile}
                          ><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>}
              </div>
              <button className="button button-dark creator-profile-save" type="submit" disabled={savingCreatorProfile}>
                {savingCreatorProfile ? "Menyimpan..." : "Simpan profil"}
              </button>
              {creatorProfileMessage && <p className="creator-profile-message" role="status">{creatorProfileMessage}</p>}
            </form>
          )}
          {profile?.role === "admin" && <Link className="account-creator-link" href="/admin"><Settings2 size={16} /> Buka panel admin <ArrowUpRight size={15} /></Link>}
        </article>}
      </section>}
      {(section === "creator-profile" || section === "creator-guide") && profile?.role !== "creator" && (
        <section className="account-panel account-route-unavailable" role="status">
          <h2>Bagian ini khusus kreator.</h2>
          <p>Jelajahi bacaan dan pengaturan akunmu dari halaman akun.</p>
          <Link className="button button-dark" href="/account">Kembali ke akun</Link>
        </section>
      )}
      {profile?.role === "creator" && (section === "overview" || section === "creator-guide") && (
        <section className="account-panel account-creator-faq" id="creator-guide" aria-labelledby="creator-faq-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Panduan Kreator</p>
              <h2 id="creator-faq-title">Panduan Youvie</h2>
            </div>
            <Sparkles size={22} />
          </div>
          <div className="account-creator-tabs" role="tablist" aria-label="Panduan kreator">
            <button
              id="creator-publishing-tab"
              type="button"
              role="tab"
              aria-selected={activeCreatorGuideTab === "publishing"}
              aria-controls="creator-publishing-panel"
              tabIndex={activeCreatorGuideTab === "publishing" ? 0 : -1}
              onClick={() => setActiveCreatorGuideTab("publishing")}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const tabs = ["publishing", "rules", "images"] as const;
                const currentIndex = tabs.indexOf(activeCreatorGuideTab);
                const direction = event.key === "ArrowRight" ? 1 : -1;
                const nextTab = tabs[(currentIndex + direction + tabs.length) % tabs.length];
                setActiveCreatorGuideTab(nextTab);
                document.getElementById(`creator-${nextTab}-tab`)?.focus();
              }}
            >
              Publikasi
            </button>
            <button
              id="creator-rules-tab"
              type="button"
              role="tab"
              aria-selected={activeCreatorGuideTab === "rules"}
              aria-controls="creator-rules-panel"
              tabIndex={activeCreatorGuideTab === "rules" ? 0 : -1}
              onClick={() => setActiveCreatorGuideTab("rules")}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const tabs = ["publishing", "rules", "images"] as const;
                const currentIndex = tabs.indexOf(activeCreatorGuideTab);
                const direction = event.key === "ArrowRight" ? 1 : -1;
                const nextTab = tabs[(currentIndex + direction + tabs.length) % tabs.length];
                setActiveCreatorGuideTab(nextTab);
                document.getElementById(`creator-${nextTab}-tab`)?.focus();
              }}
            >
              Pedoman
            </button>
            <button
              id="creator-images-tab"
              type="button"
              role="tab"
              aria-selected={activeCreatorGuideTab === "images"}
              aria-controls="creator-images-panel"
              tabIndex={activeCreatorGuideTab === "images" ? 0 : -1}
              onClick={() => setActiveCreatorGuideTab("images")}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const tabs = ["publishing", "rules", "images"] as const;
                const currentIndex = tabs.indexOf(activeCreatorGuideTab);
                const direction = event.key === "ArrowRight" ? 1 : -1;
                const nextTab = tabs[(currentIndex + direction + tabs.length) % tabs.length];
                setActiveCreatorGuideTab(nextTab);
                document.getElementById(`creator-${nextTab}-tab`)?.focus();
              }}
            >
              Ukuran gambar
            </button>
          </div>
          {activeCreatorGuideTab === "publishing" ? (
            <div id="creator-publishing-panel" className="account-creator-tab-panel" role="tabpanel" aria-labelledby="creator-publishing-tab" tabIndex={0}>
              <details>
                <summary>Bagaimana cara mulai menerbitkan komik?</summary>
                <p>Buka Ruang Kreator, pilih <strong>Komik baru</strong>, lalu lengkapi judul, genre, sinopsis, kredit kreator, bahasa, target pembaca, dan detail lainnya. Komik yang dibuat akan tersimpan sebagai draf.</p>
              </details>
              <details>
                <summary>Bagaimana cara menerbitkan bab?</summary>
                <p>Pilih komik di Ruang Kreator, buat bab dengan judul dan nomor bab, lalu unggah halaman-halamannya. Aktifkan opsi <strong>Publish chapter</strong> saat membuat atau mengedit bab agar bab dapat dibaca.</p>
              </details>
              <details>
                <summary>Bagaimana komik bisa tampil untuk pembaca?</summary>
                <p>Dari daftar komik, pilih <strong>Ajukan kurasi</strong>. Komik akan berstatus menunggu kurasi sampai admin meninjaunya. Setelah disetujui dan berstatus terbit, komik dapat ditemukan pembaca.</p>
              </details>
            </div>
          ) : activeCreatorGuideTab === "rules" ? (
            <div id="creator-rules-panel" className="account-creator-tab-panel" role="tabpanel" aria-labelledby="creator-rules-tab" tabIndex={0}>
              <details>
                <summary>Apa aturan publikasi komik di Youvie?</summary>
                <p>Komik di Youvie gratis untuk dibaca. Cantumkan kredit kreator yang terlibat. Jika komik merupakan adaptasi, isi judul dan pencipta karya sumbernya.</p>
              </details>
              <details>
                <summary>Informasi apa yang perlu diisi dengan benar?</summary>
                <p>Pilih target pembaca dan teknik produksi yang sesuai dengan karyamu, termasuk jika karya dibantu atau dibuat dengan AI.</p>
              </details>
              <Link className="account-manifesto-link" href="/manifesto">Baca Manifesto AI Youvie <ArrowUpRight size={15} /></Link>
            </div>
          ) : (
            <div id="creator-images-panel" className="account-creator-tab-panel account-creator-image-guide" role="tabpanel" aria-labelledby="creator-images-tab" tabIndex={0}>
              <p className="account-creator-image-intro">Gunakan ukuran berikut sebagai rekomendasi agar halaman dan sampul komik tetap tajam di berbagai perangkat. Ini bukan batas minimum atau rasio wajib.</p>
              <div className="account-creator-image-table-wrap" role="region" aria-label="Rekomendasi ukuran gambar komik" tabIndex={0}>
                <table className="account-creator-image-table">
                  <thead>
                    <tr><th scope="col">Gambar</th><th scope="col">Ukuran rekomendasi</th><th scope="col">Rasio</th><th scope="col">Panduan tampilan</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Halaman komik · ponsel</th><td>720 × 1280 px</td><td>9:16 (potret)</td><td>Rekomendasi jika komik ditargetkan khusus untuk ponsel; unggah satu gambar per halaman.</td>
                    </tr>
                    <tr>
                      <th scope="row">Halaman komik · tablet</th><td>900 × 1200 px</td><td>3:4 (potret)</td><td>Rekomendasi jika komik ditargetkan khusus untuk tablet; unggah satu gambar per halaman.</td>
                    </tr>
                    <tr>
                      <th scope="row">Halaman komik · desktop</th><td>1200 × 1800 px per halaman</td><td>2:3 (potret)</td><td>Dua halaman terpisah membentuk spread desktop 4:3; jangan gabungkan halaman kiri dan kanan.</td>
                    </tr>
                    <tr>
                      <th scope="row">Satu berkas untuk semua perangkat</th><td>1200 × 1800 px per halaman</td><td>2:3 (potret)</td><td>Gunakan satu berkas yang sama di ponsel, tablet, dan desktop jika komik tersedia untuk semua perangkat.</td>
                    </tr>
                    <tr>
                      <th scope="row">Sampul komik</th><td>1200 × 1600 px</td><td>3:4 (potret)</td><td>Sampul ditampilkan utuh. Sisakan ruang tepi untuk teks dan elemen penting.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ul>
                <li>Rasio perangkat di atas adalah rekomendasi komposisi, bukan crop wajib. Reader menampilkan gambar utuh tanpa memotongnya; rasio yang berbeda dapat menyisakan ruang kosong.</li>
                <li>Uploader menyimpan satu gambar untuk setiap halaman, bukan varian terpisah per perangkat. Jika komik tersedia di semua perangkat, gunakan master 1200 × 1800 px (2:3) agar dua halaman cocok menjadi spread desktop 4:3; jangan membuat versi ponsel/tablet terpisah karena belum ada slot varian halaman.</li>
                <li>Target perangkat mengatur ketersediaan komik: jika memilih ponsel, tablet, atau desktop, komik hanya tampil dan bisa dibaca pada target tersebut, serta tidak tampil di perangkat lain. Pilih “Semua perangkat” agar tersedia di semuanya.</li>
                <li>Letakkan balon dialog, teks, wajah, dan detail penting setidaknya 3–5% dari tepi gambar.</li>
                <li>Ukuran file, format yang diizinkan, dan jumlah halaman mengikuti batas yang tampil di uploader saat mengunggah.</li>
              </ul>
            </div>
          )}
        </section>
      )}
      </>}
      </div>
    </main>
  );
}
