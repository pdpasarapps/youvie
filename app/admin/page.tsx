"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { ArrowLeft, Archive, BookOpen, ChartNoAxesColumn, Check, ClipboardList, Eye, Image as ImageIcon, LayoutDashboard, LoaderCircle, List, Megaphone, Search, Settings2, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import AdminAnalyticsPanel from "./analytics-panel";
import AdsManagementPanel from "./ads-management-panel";
import HomepagePromosPanel from "./homepage-promos-panel";
import AdRequestsPanel from "./ad-requests-panel";
import { createComicSharePreview } from "@/lib/comic-share-preview";
import { defaultPlatformSettings, type PlatformSettings } from "@/lib/platform-settings";
import { usePlatformSettings } from "../platform-runtime";
import { READER_MEMBERSHIP_TIERS, type ReaderMembershipTier } from "@/lib/reader-membership";

type RequestStatus = "pending" | "approved" | "rejected";
type CreatorRequest = { id: string; user_id: string; note: string; portfolio_url: string | null; instagram_url: string | null; other_url: string | null; status: RequestStatus; created_at: string; applicant: string; role: string };
type ComicReview = { id: string; title: string; slug: string; synopsis: string; contributor: string; created_at: string; creator_id: string; creator: string };
type AdminUser = { id: string; display_name: string; role: "reader" | "creator" | "admin"; membershipTier: ReaderMembershipTier; created_at: string };
type AdminComic = { id: string; title: string; slug: string; synopsis: string; contributor: string; genre: string; cover_key: string | null; share_preview_key: string | null; status: "draft" | "pending_review" | "published" | "archived"; created_at: string; creator_id: string; creator: string };
type SettingsAuditEntry = { id: number; changed_by: string | null; changed_at: string; previous_values: Record<string, unknown>; new_values: Record<string, unknown> };
type AdminSection = "overview" | "analytics" | "comic-review" | "creator-requests" | "users" | "comics" | "share-previews" | "ad-requests" | "ads-management" | "ads-list" | "sponsor-campaigns" | "ad-slots" | "homepage-promos" | "platform-settings";

const supabase = createClient();
const adminSections: Record<AdminSection, { label: string; description: string }> = {
  overview: { label: "Dasbor admin", description: "Kelola akun, komik, kurasi, dan pengajuan kreator mu-komik." },
  analytics: { label: "Analitik", description: "Pantau aktivitas membaca dan komik yang paling banyak dibaca." },
  "comic-review": { label: "Kurasi komik", description: "Tinjau komik yang menunggu persetujuan untuk diterbitkan." },
  "creator-requests": { label: "Pengajuan kreator", description: "Tinjau permohonan akses kreator." },
  users: { label: "Manajemen pengguna", description: "Kelola akun dan peran pengguna." },
  comics: { label: "Katalog komik", description: "Cari komik dan kelola status publikasinya." },
  "share-previews": { label: "Pratinjau berbagi komik", description: "Buat gambar pratinjau statis di R2 agar dapat ditampilkan di WhatsApp dan platform sosial." },
  "ad-requests": { label: "Pengajuan iklan", description: "Tinjau kebutuhan kampanye iklan dari calon pengiklan." },
  "ads-management": { label: "Kampanye sponsor", description: "Kelola kampanye, materi, target, dan periode tayang sponsor." },
  "ads-list": { label: "Slot iklan", description: "Kelola inventaris penempatan iklan di MU-Komik." },
  "sponsor-campaigns": { label: "Kampanye sponsor", description: "Kelola kampanye, materi, target, dan periode tayang sponsor." },
  "ad-slots": { label: "Slot iklan", description: "Kelola inventaris penempatan iklan di MU-Komik." },
  "homepage-promos": { label: "Hero & promo beranda", description: "Kelola slide hero, gambar responsif, tautan, urutan, dan jadwal promo beranda." },
  "platform-settings": { label: "Pengaturan platform", description: "Atur status operasional dan fitur yang tersedia di MU-Komik." },
};
const roleLabels = { reader: "Pembaca", creator: "Kreator", admin: "Admin" };
const comicStatusLabels = { draft: "Draf", pending_review: "Menunggu kurasi", published: "Terbit", archived: "Diarsipkan" };
const requestStatusLabels = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak" };
const platformSettingLabels: Record<string, string> = {
  maintenance_enabled: "Mode pemeliharaan",
  maintenance_message: "Pesan pemeliharaan",
  announcement_enabled: "Banner pengumuman",
  announcement_message: "Isi pengumuman",
  require_comic_review: "Wajib kurasi sebelum terbit",
  creator_applications_enabled: "Pengajuan kreator",
  max_comics_per_creator: "Batas komik per kreator",
  max_upload_size_mb: "Ukuran file maksimum",
  max_pages_per_chapter: "Batas halaman per bab",
  allowed_image_types: "Format gambar",
  feature_flags: "Status fitur",
};

export default function AdminPage() {
  const router = useRouter();
  const { updateSettings } = usePlatformSettings();
  const params = useParams<{ section?: string }>();
  const requestedSection = params.section;
  const section = requestedSection && requestedSection in adminSections
    ? requestedSection as AdminSection
    : "overview";
  const [requests, setRequests] = useState<CreatorRequest[]>([]);
  const [comicReviews, setComicReviews] = useState<ComicReview[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [comics, setComics] = useState<AdminComic[]>([]);
  const [adminUserId, setAdminUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [comicActionId, setComicActionId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [comicSearch, setComicSearch] = useState("");
  const [comicStatusFilter, setComicStatusFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<CreatorRequest | null>(null);
  const [generatingSharePreviews, setGeneratingSharePreviews] = useState(false);
  const [sharePreviewProgress, setSharePreviewProgress] = useState("");
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(defaultPlatformSettings);
  const [platformSettingsError, setPlatformSettingsError] = useState("");
  const [savingPlatformSettings, setSavingPlatformSettings] = useState(false);
  const [platformSettingsMessage, setPlatformSettingsMessage] = useState("");
  const [settingsAudit, setSettingsAudit] = useState<SettingsAuditEntry[]>([]);
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

  const loadRequests = useEffectEvent(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.replace("/login");
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
    if (profile?.role !== "admin") {
      router.replace("/account");
      return;
    }
    setAdminUserId(userData.user.id);
    const [requestResult, profileResult, membershipResult, comicResult] = await Promise.all([
      supabase.from("creator_requests").select("id, user_id, note, portfolio_url, instagram_url, other_url, status, created_at").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, display_name, role, created_at").order("created_at", { ascending: false }),
      supabase.from("reader_memberships").select("user_id, tier"),
      supabase.from("comics").select("id, title, slug, synopsis, contributor, genre, cover_key, share_preview_key, status, created_at, creator_id").order("created_at", { ascending: false }),
    ]);
    const loadErrors = [requestResult.error, profileResult.error, membershipResult.error, comicResult.error].filter(Boolean);
    if (loadErrors.length) {
      const missingMembershipTable = membershipResult.error?.code === "42P01" || membershipResult.error?.code === "PGRST205";
      setMessage(missingMembershipTable
        ? "Jalankan supabase/reader-memberships.sql setelah supabase/creator-request.sql untuk mengaktifkan paket reader."
        : loadErrors.map((error) => error?.message).join(" · "));
      setLoading(false);
      return;
    }
    const membershipByUser = new Map((membershipResult.data ?? []).map((membership) => [
      membership.user_id,
      membership.tier === "premium" || membership.tier === "vip" ? membership.tier : "free",
    ]));
    const profiles = (profileResult.data ?? []).map((profile) => ({
      ...profile,
      membershipTier: membershipByUser.get(profile.id) || "free",
    })) as AdminUser[];
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    setUsers(profiles);
    setRequests((requestResult.data ?? []).map((request) => ({
      ...request,
      applicant: profileMap.get(request.user_id)?.display_name || "Pengguna tanpa nama",
      role: profileMap.get(request.user_id)?.role || "reader",
    })));
    const comicData = (comicResult.data ?? []) as Omit<AdminComic, "creator">[];
    setComics(comicData.map((comic) => ({
      ...comic,
      creator: profileMap.get(comic.creator_id)?.display_name || `Akun ${comic.creator_id.slice(0, 8)}`,
    })));
    const { data: pendingComics, error: comicError } = await supabase
      .from("comics")
      .select("id, title, slug, synopsis, contributor, created_at, creator_id")
      .eq("status", "pending_review")
      .order("created_at", { ascending: true });
    if (comicError) {
      console.error("Unable to load comics pending review:", comicError);
      setMessage("Daftar komik yang menunggu kurasi gagal dimuat. Coba muat ulang halaman.");
    } else {
      setComicReviews((pendingComics ?? []).map((comic) => ({
        ...comic,
        creator: profileMap.get(comic.creator_id)?.display_name || `Akun ${comic.creator_id.slice(0, 8)}`,
      })));
    }
    setLoading(false);
  });

  const loadPlatformSettings = useEffectEvent(async () => {
    const { data: settingsData, error: settingsError } = await supabase
      .from("platform_settings")
      .select("maintenance_enabled, maintenance_message, announcement_enabled, announcement_message, feature_flags, require_comic_review, creator_applications_enabled, max_comics_per_creator, max_upload_size_mb, max_pages_per_chapter, allowed_image_types")
      .eq("id", true)
      .maybeSingle();
    const { data: auditData, error: auditError } = await supabase
      .from("platform_settings_audit")
      .select("id, changed_by, changed_at, previous_values, new_values")
      .order("changed_at", { ascending: false })
      .limit(10);
    if (auditError && auditError.code !== "42P01" && auditError.code !== "PGRST205") {
      console.error("Unable to load platform settings audit:", auditError);
    } else {
      setSettingsAudit((auditData ?? []) as SettingsAuditEntry[]);
    }
    if (settingsError) {
      console.error("Unable to load platform settings:", settingsError);
      setPlatformSettingsError("Pengaturan belum dapat dimuat. Jalankan supabase/platform-settings.sql di Supabase SQL Editor, lalu muat ulang halaman.");
    } else if (settingsData) {
      setPlatformSettings({
        ...defaultPlatformSettings,
        ...settingsData,
        feature_flags: { ...defaultPlatformSettings.feature_flags, ...settingsData.feature_flags },
        allowed_image_types: Array.isArray(settingsData.allowed_image_types) ? settingsData.allowed_image_types : defaultPlatformSettings.allowed_image_types,
      });
      setPlatformSettingsError("");
    } else {
      setPlatformSettings(defaultPlatformSettings);
      setPlatformSettingsError("");
    }
  });

  useEffect(() => {
    const timer = window.setTimeout(() => loadRequests(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (section !== "platform-settings") return;
    const timer = window.setTimeout(() => loadPlatformSettings(), 0);
    return () => window.clearTimeout(timer);
  }, [section]);

  const generateSharePreviews = async () => {
    if (generatingSharePreviews) return;
    if (!publicUrl) {
      setMessage("NEXT_PUBLIC_R2_PUBLIC_URL belum dikonfigurasi.");
      return;
    }
    const comicsToProcess = comics.filter((comic) => comic.status === "published" && comic.cover_key && !comic.share_preview_key);
    if (!comicsToProcess.length) {
      setMessage("Tidak ada komik terbit dengan cover untuk diproses.");
      return;
    }

    setGeneratingSharePreviews(true);
    setMessage("");
    setSharePreviewProgress(`0 dari ${comicsToProcess.length} komik`);
    let generated = 0;
    const failures: string[] = [];
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sesi admin berakhir. Silakan masuk kembali.");

      for (const [index, comic] of comicsToProcess.entries()) {
        try {
          const coverResponse = await fetch(`/api/share-cover?key=${encodeURIComponent(comic.cover_key!)}`);
          if (!coverResponse.ok) throw new Error(`Cover gagal diunduh (${coverResponse.status}).`);
          const preview = await createComicSharePreview(await coverResponse.blob(), comic.title);
          const previewForm = new FormData();
          previewForm.set("comicId", comic.id);
          previewForm.set("coverKey", comic.cover_key!);
          previewForm.set("file", preview, "share-preview.jpg");
          const signResponse = await fetch("/api/r2/share-preview", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: previewForm,
          });
          const signResult = await signResponse.json() as { objectKey?: string; error?: string };
          if (!signResponse.ok || !signResult.objectKey) {
            throw new Error(signResult.error || "Pratinjau berbagi gagal diunggah.");
          }
          const { error: savePreviewError } = await supabase
            .from("comics")
            .update({ share_preview_key: signResult.objectKey })
            .eq("id", comic.id)
            .eq("status", "published");
          if (savePreviewError) throw new Error("Pratinjau berhasil diunggah, tetapi belum tertaut ke komik.");
          setComics((current) => current.map((item) => item.id === comic.id
            ? { ...item, share_preview_key: signResult.objectKey! }
            : item));
          generated += 1;
        } catch (error) {
          const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          console.error("Unable to generate comic share preview:", { comicId: comic.id, error: errorMessage });
          failures.push(`${comic.title}: Pratinjau berbagi gagal dibuat.`);
        }
        setSharePreviewProgress(`${index + 1} dari ${comicsToProcess.length} komik`);
      }
      setMessage(failures.length
        ? `${generated} pratinjau berhasil dibuat; ${failures.length} gagal. ${failures.slice(0, 3).join(" · ")}`
        : `${generated} pratinjau berbagi komik berhasil dibuat dan disimpan di R2.`);
    } catch (error) {
      console.error("Comic share preview generation failed:", error);
      setMessage("Pratinjau berbagi komik gagal dibuat. Periksa koneksi dan coba lagi.");
    } finally {
      setGeneratingSharePreviews(false);
    }
  };

  const savePlatformSettings = async () => {
    if (savingPlatformSettings) return;
    if (!Number.isInteger(platformSettings.max_comics_per_creator) || platformSettings.max_comics_per_creator < 1 || platformSettings.max_comics_per_creator > 100) {
      setPlatformSettingsMessage("Batas komik harus berupa bilangan bulat antara 1 dan 100.");
      return;
    }
    if (!Number.isInteger(platformSettings.max_upload_size_mb) || platformSettings.max_upload_size_mb < 1 || platformSettings.max_upload_size_mb > 50) {
      setPlatformSettingsMessage("Ukuran file harus berupa bilangan bulat antara 1 dan 50 MB.");
      return;
    }
    if (!Number.isInteger(platformSettings.max_pages_per_chapter) || platformSettings.max_pages_per_chapter < 1 || platformSettings.max_pages_per_chapter > 500) {
      setPlatformSettingsMessage("Batas halaman harus berupa bilangan bulat antara 1 dan 500.");
      return;
    }
    if (platformSettings.announcement_enabled && !platformSettings.announcement_message.trim()) {
      setPlatformSettingsMessage("Isi banner pengumuman sebelum mengaktifkannya.");
      return;
    }
    if (platformSettings.maintenance_enabled && !platformSettings.maintenance_message.trim()) {
      setPlatformSettingsMessage("Isi pesan pemeliharaan sebelum mengaktifkannya.");
      return;
    }
    if (!platformSettings.allowed_image_types.length) {
      setPlatformSettingsMessage("Pilih minimal satu format gambar yang diizinkan.");
      return;
    }
    setSavingPlatformSettings(true);
    setPlatformSettingsMessage("");
    const { error } = await supabase.from("platform_settings").upsert({
      id: true,
      ...platformSettings,
      updated_by: adminUserId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) {
      console.error("Unable to save platform settings:", error);
      setPlatformSettingsMessage(error.code === "42P01" || error.code === "PGRST205"
        ? "Tabel pengaturan belum tersedia. Jalankan supabase/platform-settings.sql di Supabase SQL Editor."
        : "Pengaturan gagal disimpan. Periksa koneksi dan coba lagi.");
    } else {
      updateSettings(platformSettings);
      setPlatformSettingsMessage("Pengaturan platform berhasil disimpan.");
      const { data: auditData } = await supabase.from("platform_settings_audit").select("id, changed_by, changed_at, previous_values, new_values").order("changed_at", { ascending: false }).limit(10);
      setSettingsAudit((auditData ?? []) as SettingsAuditEntry[]);
    }
    setSavingPlatformSettings(false);
  };

  const reviewRequest = async (request: CreatorRequest, status: "approved" | "rejected") => {
    setActionId(request.id);
    setMessage("");
    const { error } = await supabase.rpc("review_creator_request", { p_request_id: request.id, p_decision: status });
    if (error) {
      console.error("Unable to review creator request:", error);
      setMessage("Pengajuan kreator gagal diperbarui. Periksa koneksi dan coba lagi.");
      setActionId(null);
      return;
    }
    setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status, role: status === "approved" ? "creator" : item.role } : item));
    if (status === "approved") {
      setUsers((current) => current.map((user) => user.id === request.user_id ? { ...user, role: "creator" } : user));
    }
    setMessage(status === "approved" ? "Akses kreator disetujui." : "Pengajuan akses kreator ditolak.");
    setActionId(null);
  };

  const updateUserRole = async (user: AdminUser, role: "reader" | "creator") => {
    if (user.id === adminUserId) {
      setMessage("Peran akun admin yang sedang digunakan tidak dapat diubah dari sini.");
      return;
    }
    setActionId(user.id);
    setMessage("");
    const { error } = await supabase.from("profiles").update({ role }).eq("id", user.id);
    if (error) {
      console.error("Unable to update user role:", error);
      setMessage("Peran pengguna gagal diperbarui. Periksa koneksi dan coba lagi.");
    } else {
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, role } : item));
      setMessage(`Peran ${user.display_name} diubah menjadi ${roleLabels[role]}.`);
    }
    setActionId(null);
  };

  const updateReaderMembership = async (user: AdminUser, tier: ReaderMembershipTier) => {
    setActionId(user.id);
    setMessage("");
    const { error } = await supabase.from("reader_memberships").upsert({
      user_id: user.id,
      tier,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error("Unable to update reader membership:", error);
      setMessage("Paket keanggotaan tidak dapat diperbarui. Periksa koneksi dan coba lagi.");
    } else {
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, membershipTier: tier } : item));
      setMessage(`Paket ${user.display_name} diubah menjadi ${tier.toUpperCase()}.`);
    }
    setActionId(null);
  };

  const updateComicStatus = async (comic: AdminComic, status: "pending_review" | "archived" | "draft") => {
    setComicActionId(comic.id);
    setMessage("");
    const { data, error } = await supabase
      .from("comics")
      .update({ status })
      .eq("id", comic.id)
      .eq("status", comic.status)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("Unable to update comic status:", error);
      setMessage(error
        ? "Status komik gagal diperbarui. Periksa koneksi dan coba lagi."
        : "Status komik sudah berubah. Muat ulang halaman.");
    } else {
      setComics((current) => current.map((item) => item.id === comic.id ? { ...item, status } : item));
      if (status === "pending_review") {
        const reviewItem: ComicReview = { ...comic };
        setComicReviews((current) => [reviewItem, ...current]);
      } else {
        setComicReviews((current) => current.filter((item) => item.id !== comic.id));
      }
      setMessage(`${comic.title}: status diubah menjadi ${comicStatusLabels[status]}.`);
    }
    setComicActionId(null);
  };

  const reviewComic = async (comic: ComicReview, decision: "published" | "draft") => {
    setComicActionId(comic.id);
    setMessage("");
    const { data, error } = await supabase
      .from("comics")
      .update({ status: decision })
      .eq("id", comic.id)
      .eq("status", "pending_review")
      .select("id")
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("Unable to review comic:", error);
      setMessage(error
        ? "Kurasi komik gagal diperbarui. Periksa koneksi dan coba lagi."
        : "Komik ini sudah dikurasi admin lain. Muat ulang halaman.");
      setComicActionId(null);
      return;
    }
    setComicReviews((current) => current.filter((item) => item.id !== comic.id));
    setComics((current) => current.map((item) => item.id === comic.id ? { ...item, status: decision } : item));
    setMessage(decision === "published" ? `${comic.title} berhasil diterbitkan.` : `${comic.title} ditolak dan dikembalikan ke draft.`);
    setComicActionId(null);
  };

  const filteredUsers = users.filter((user) => `${user.display_name} ${user.id}`.toLowerCase().includes(userSearch.toLowerCase()));
  const filteredComics = comics.filter((comic) => {
    const matchesSearch = `${comic.title} ${comic.creator} ${comic.genre}`.toLowerCase().includes(comicSearch.toLowerCase());
    return matchesSearch && (comicStatusFilter === "all" || comic.status === comicStatusFilter);
  });
  const pendingRequests = requests.filter((request) => request.status === "pending").length;
  const publishedComics = comics.filter((comic) => comic.status === "published").length;
  const generatedSharePreviews = comics.filter((comic) => comic.status === "published" && comic.share_preview_key);

  if (loading) return <main className="admin-shell"><LoaderCircle className="spin" size={24} /></main>;

  return (
    <main className="admin-shell">
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <BrandLogo className="admin-brand" showName />
          <nav className="admin-sidebar-links" aria-label="Navigasi dashboard admin">
            <p className="admin-sidebar-label">Administrasi</p>
            <div className="admin-sidebar-group" aria-label="Dasbor">
              <p className="admin-sidebar-group-label">Dasbor</p>
              <Link href="/admin/overview" aria-current={section === "overview" ? "page" : undefined}><LayoutDashboard size={18} /><span>Ringkasan</span></Link>
              <Link href="/admin/analytics" aria-current={section === "analytics" ? "page" : undefined}><ChartNoAxesColumn size={18} /><span>Analitik</span></Link>
            </div>
            <div className="admin-sidebar-group" aria-label="Moderasi">
              <p className="admin-sidebar-group-label">Moderasi</p>
              <Link href="/admin/comic-review" aria-current={section === "comic-review" ? "page" : undefined}><BookOpen size={18} /><span>Kurasi komik</span>{comicReviews.length > 0 && <small>{comicReviews.length}</small>}</Link>
              <Link href="/admin/creator-requests" aria-current={section === "creator-requests" ? "page" : undefined}><ClipboardList size={18} /><span>Pengajuan kreator</span>{requests.length > 0 && <small>{requests.length}</small>}</Link>
            </div>
            <div className="admin-sidebar-group" aria-label="Kelola konten">
              <p className="admin-sidebar-group-label">Kelola konten</p>
              <Link href="/admin/users" aria-current={section === "users" ? "page" : undefined}><Users size={18} /><span>Pengguna</span></Link>
              <Link href="/admin/comics" aria-current={section === "comics" ? "page" : undefined}><BookOpen size={18} /><span>Katalog komik</span></Link>
              <Link href="/admin/share-previews" aria-current={section === "share-previews" ? "page" : undefined}><ImageIcon size={18} /><span>Pratinjau berbagi</span></Link>
              <Link href="/admin/homepage-promos" aria-current={section === "homepage-promos" ? "page" : undefined}><ImageIcon size={18} /><span>Hero & promo beranda</span></Link>
            </div>
            <div className="admin-sidebar-group" aria-label="Manajemen iklan">
              <p className="admin-sidebar-group-label">Manajemen iklan</p>
              <Link href="/admin/sponsor-campaigns" aria-current={section === "sponsor-campaigns" || section === "ads-management" ? "page" : undefined}><Megaphone size={18} /><span>Kampanye sponsor</span></Link>
              <Link href="/admin/ad-requests" aria-current={section === "ad-requests" ? "page" : undefined}><ClipboardList size={18} /><span>Pengajuan iklan</span></Link>
              <Link href="/admin/ad-slots" aria-current={section === "ad-slots" || section === "ads-list" ? "page" : undefined}><List size={18} /><span>Slot iklan</span></Link>
            </div>
            <div className="admin-sidebar-group" aria-label="Pengaturan">
              <p className="admin-sidebar-group-label">Pengaturan</p>
              <Link href="/admin/platform-settings" aria-current={section === "platform-settings" ? "page" : undefined}><Settings2 size={18} /><span>Pengaturan platform</span></Link>
            </div>
          </nav>
          <div className="admin-sidebar-user">
            <span className="admin-user-avatar"><ShieldCheck size={18} /></span>
            <span><strong>Administrator</strong><small>Akses penuh</small></span>
            <Link href="/account" aria-label="Kembali ke Akun"><ArrowLeft size={17} /></Link>
          </div>
        </aside>
        <div className="admin-main">
          <div className="admin-mobile-header"><BrandLogo showName /><Link className="admin-account-link" href="/account"><ArrowLeft size={16} /> Akun</Link></div>
          <header className="admin-header">
            <p className="eyebrow">Panel administrasi</p>
            <div className="admin-title">
              <div><h1>{adminSections[section].label}</h1><p>{adminSections[section].description}</p></div>
            </div>
          </header>
          <section className="admin-content">
        {message && <p className="admin-message" role="status">{message}</p>}
        {section === "overview" && <section className="admin-dashboard" id="overview" aria-label="Ringkasan">
          <article className="admin-stat"><span>Total pengguna</span><strong>{users.length}</strong><UserRound size={20} /></article>
          <article className="admin-stat"><span>Total komik</span><strong>{comics.length}</strong><BookOpen size={20} /></article>
          <article className="admin-stat"><span>Komik terbit</span><strong>{publishedComics}</strong><Eye size={20} /></article>
          <article className="admin-stat"><span>Perlu ditinjau</span><strong>{comicReviews.length + pendingRequests}</strong><ShieldCheck size={20} /></article>
        </section>}
        {(section === "ads-management" || section === "sponsor-campaigns") && <section className="admin-management-section">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Monetisasi platform</p><h2>Kampanye sponsor</h2><p>Kelola kampanye, materi, target komik, dan periode tayang. Kampanye aktif ditayangkan pada slot selama periode kampanye.</p></div>
          </div>
          <AdsManagementPanel key="campaigns" mode="campaigns" />
        </section>}
        {(section === "ads-list" || section === "ad-slots") && <section className="admin-management-section">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Monetisasi platform</p><h2>Slot iklan</h2><p>Kelola lokasi penayangan, format, kode, serta status aktif setiap slot.</p></div>
          </div>
          <AdsManagementPanel key="slots" mode="slots" />
        </section>}
        {section === "homepage-promos" && <section className="admin-management-section">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Konten beranda</p><h2>Hero & promo beranda</h2><p>Buat carousel promo dengan gambar dan konten bebas, tanpa mengambil data dari katalog komik.</p></div>
          </div>
          <HomepagePromosPanel />
        </section>}
        {section === "ad-requests" && <section className="admin-management-section">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Monetisasi platform</p><h2>Pengajuan iklan</h2><p>Persetujuan mengaktifkan kampanye di sistem iklan publik untuk setiap slot yang dipilih. Pastikan materi, jadwal, dan ketersediaan slot sudah dikonfirmasi.</p></div>
          </div>
          <AdRequestsPanel />
        </section>}
        {section === "platform-settings" && <section className="admin-management-section admin-platform-settings">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Operasional</p><h2>Situs web dan platform</h2></div>
          </div>
          {platformSettingsError ? <p className="admin-settings-error" role="alert">{platformSettingsError}</p> : <>
            <article className="admin-setting-card">
              <div className="admin-setting-heading"><div><h3>Mode pemeliharaan</h3><p>Pengunjung akan melihat halaman pemeliharaan. Panel admin dan halaman masuk tetap bisa digunakan.</p></div><label className="admin-switch"><input type="checkbox" checked={platformSettings.maintenance_enabled} onChange={(event) => setPlatformSettings((current) => ({ ...current, maintenance_enabled: event.target.checked }))} /><span /></label></div>
              <label className="admin-setting-field">Pesan pemeliharaan<textarea value={platformSettings.maintenance_message} onChange={(event) => setPlatformSettings((current) => ({ ...current, maintenance_message: event.target.value }))} maxLength={500} rows={3} /></label>
            </article>
            <article className="admin-setting-card">
              <div className="admin-setting-heading"><div><h3>Banner pengumuman</h3><p>Tampilkan pengumuman di bagian atas halaman untuk semua pengunjung.</p></div><label className="admin-switch"><input type="checkbox" checked={platformSettings.announcement_enabled} onChange={(event) => setPlatformSettings((current) => ({ ...current, announcement_enabled: event.target.checked }))} /><span /></label></div>
              <label className="admin-setting-field">Isi pengumuman<textarea value={platformSettings.announcement_message} onChange={(event) => setPlatformSettings((current) => ({ ...current, announcement_message: event.target.value }))} maxLength={300} rows={3} placeholder="Tulis pengumuman untuk pembaca dan kreator..." /></label>
            </article>
            <article className="admin-setting-card">
              <div className="admin-setting-heading"><div><h3>Status fitur</h3><p>Fitur yang dimatikan akan menampilkan pemberitahuan dan tidak bisa dibuka pengunjung. Komentar belum tersedia; statusnya disimpan untuk aktivasi di masa mendatang.</p></div></div>
              <div className="admin-feature-toggles">
                {([
                  ["reading", "Membaca komik"],
                  ["search", "Pencarian komik"],
                  ["creators", "Area kreator"],
                  ["comments", "Komentar (siap untuk fitur mendatang)"],
                  ["favorites", "Favorit komik"],
                ] as const).map(([feature, label]) => (
                  <label className="admin-feature-toggle" key={feature}><span>{label}</span><input type="checkbox" checked={platformSettings.feature_flags[feature]} onChange={(event) => setPlatformSettings((current) => ({ ...current, feature_flags: { ...current.feature_flags, [feature]: event.target.checked } }))} /></label>
                ))}
              </div>
            </article>
            <article className="admin-setting-card">
              <div className="admin-setting-heading"><div><h3>Moderasi & publikasi</h3><p>Atur proses peninjauan komik dan penerimaan kreator baru.</p></div></div>
              <div className="admin-setting-checks">
                <label className="admin-feature-toggle"><span>Wajib kurasi admin sebelum komik tayang</span><input type="checkbox" checked={platformSettings.require_comic_review} onChange={(event) => setPlatformSettings((current) => ({ ...current, require_comic_review: event.target.checked }))} /></label>
                <label className="admin-feature-toggle"><span>Terima pengajuan kreator baru</span><input type="checkbox" checked={platformSettings.creator_applications_enabled} onChange={(event) => setPlatformSettings((current) => ({ ...current, creator_applications_enabled: event.target.checked }))} /></label>
              </div>
              <p className="admin-setting-note">{platformSettings.require_comic_review ? "Kreator mengajukan komik untuk ditinjau admin sebelum tayang." : "Kreator dapat menerbitkan komik secara langsung."}</p>
            </article>
            <article className="admin-setting-card">
              <div className="admin-setting-heading"><div><h3>Batas unggahan</h3><p>Batasi jumlah karya dan ukuran konten untuk mengendalikan kapasitas serta biaya penyimpanan.</p></div></div>
              <div className="admin-setting-number-grid">
                <label>Komik maksimum per kreator<input type="number" min={1} max={100} value={platformSettings.max_comics_per_creator} onChange={(event) => setPlatformSettings((current) => ({ ...current, max_comics_per_creator: Number(event.target.value) }))} /></label>
                <label>Ukuran maksimum per gambar (MB)<input type="number" min={1} max={50} value={platformSettings.max_upload_size_mb} onChange={(event) => setPlatformSettings((current) => ({ ...current, max_upload_size_mb: Number(event.target.value) }))} /></label>
                <label>Halaman maksimum per bab<input type="number" min={1} max={500} value={platformSettings.max_pages_per_chapter} onChange={(event) => setPlatformSettings((current) => ({ ...current, max_pages_per_chapter: Number(event.target.value) }))} /></label>
              </div>
              <fieldset className="admin-image-types"><legend>Format gambar yang diizinkan</legend>
                {([["image/jpeg", "JPG / JPEG"], ["image/png", "PNG"], ["image/webp", "WebP"]] as const).map(([type, label]) => (
                  <label key={type}><input type="checkbox" checked={platformSettings.allowed_image_types.includes(type)} onChange={(event) => setPlatformSettings((current) => ({ ...current, allowed_image_types: event.target.checked ? [...current.allowed_image_types, type] : current.allowed_image_types.filter((item) => item !== type) }))} /> {label}</label>
                ))}
              </fieldset>
              <p className="admin-setting-note">Batas yang sudah tercapai tidak menghapus konten lama, tetapi mencegah penambahan komik atau halaman baru.</p>
            </article>
            <div className="admin-settings-actions">
              <button className="approve-button" type="button" onClick={() => void savePlatformSettings()} disabled={savingPlatformSettings}>{savingPlatformSettings ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{savingPlatformSettings ? "Menyimpan..." : "Simpan pengaturan"}</button>
              {platformSettingsMessage && <p role={platformSettingsMessage.startsWith("Pengaturan platform berhasil") ? "status" : "alert"}>{platformSettingsMessage}</p>}
            </div>
            <article className="admin-setting-card admin-settings-audit">
              <div className="admin-setting-heading"><div><h3>Riwayat perubahan</h3><p>Perubahan pengaturan platform terbaru.</p></div></div>
              {settingsAudit.length ? <ol>{settingsAudit.map((entry) => {
                const changed = Object.keys(platformSettingLabels).filter((key) =>
                  JSON.stringify(entry.previous_values[key]) !== JSON.stringify(entry.new_values[key]));
                const actor = users.find((user) => user.id === entry.changed_by)?.display_name || "Admin";
                return <li key={entry.id}><span><strong>{changed.map((key) => platformSettingLabels[key]).join(", ") || "Pengaturan platform"}</strong><small>Oleh {actor}</small></span><time dateTime={entry.changed_at}>{new Date(entry.changed_at).toLocaleString("id-ID")}</time></li>;
              })}</ol> : <p className="admin-setting-note">Belum ada perubahan yang tercatat.</p>}
            </article>
          </>}
        </section>}
        {section === "analytics" && <AdminAnalyticsPanel />}
        {section === "share-previews" && <section className="admin-management-section">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Gambar sosial</p><h2>Pratinjau berbagi komik</h2></div>
            <span>{comics.filter((comic) => comic.status === "published" && comic.cover_key && !comic.share_preview_key).length} komik belum memiliki pratinjau</span>
          </div>
          <p>Sampul diolah di peramban menjadi JPG lanskap, lalu disimpan sebagai berkas statis di R2. Layanan penyimpanan hanya menyediakan alamat unggah dan tidak mengolah gambar. Tombol ini membuat pratinjau untuk komik terbit yang belum memilikinya.</p>
          {sharePreviewProgress && <p role="status">{sharePreviewProgress}</p>}
          <button className="approve-button" type="button" onClick={() => void generateSharePreviews()} disabled={generatingSharePreviews}>
            {generatingSharePreviews ? <LoaderCircle className="spin" size={16} /> : <ImageIcon size={16} />}
            {generatingSharePreviews ? "Membuat pratinjau..." : "Buat pratinjau untuk semua komik terbit"}
          </button>
          <div className="admin-section-heading">
            <div><p className="eyebrow">Tersimpan di R2</p><h2>Pratinjau yang sudah dibuat</h2></div>
            <span>{generatedSharePreviews.length} komik</span>
          </div>
          {generatedSharePreviews.length ? (
            <div className="request-table-wrap">
              <table className="request-table">
                <thead>
                  <tr><th>Pratinjau</th><th>Komik</th><th>Status</th><th>Berkas R2</th></tr>
                </thead>
                <tbody>
                  {generatedSharePreviews.map((comic) => {
                    const previewUrl = publicUrl
                      ? `${publicUrl.replace(/\/$/, "")}/${comic.share_preview_key!.split("/").map(encodeURIComponent).join("/")}`
                      : "";
                    return (
                      <tr key={comic.id}>
                        <td>
                          {previewUrl && (
                            <a href={previewUrl} target="_blank" rel="noreferrer" aria-label={`Buka pratinjau berbagi ${comic.title}`}>
                              <Image
                                src={previewUrl}
                                alt={`Pratinjau berbagi ${comic.title}`}
                                width={120}
                                height={63}
                                unoptimized
                                style={{ width: 120, height: 63, objectFit: "cover", borderRadius: 6 }}
                              />
                            </a>
                          )}
                        </td>
                        <td><strong>{comic.title}</strong><code>{comic.slug}</code></td>
                        <td><span className="request-status request-approved">Sudah dibuat</span></td>
                        <td>{previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer">Lihat berkas JPG</a>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty"><ImageIcon size={26} /><h2>Belum ada pratinjau yang dibuat.</h2><p>Pratinjau komik akan tercatat di tabel ini setelah proses berhasil.</p></div>
          )}
        </section>}
        {section === "comic-review" && <section className="comic-review-section" id="comic-review">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Antrean publikasi</p><h2>Kurasi komik</h2></div>
            <span>{comicReviews.length} menunggu kurasi</span>
          </div>
          {comicReviews.length === 0 ? (
            <div className="admin-empty comic-review-empty"><ShieldCheck size={26} /><h2>Tidak ada komik untuk ditinjau.</h2><p>Pengajuan komik dari kreator akan tampil di sini.</p></div>
          ) : (
            <div className="comic-review-list">
              {comicReviews.map((comic) => (
                <article className="comic-review-card" key={comic.id}>
                  <div className="comic-review-copy">
                    <span className="request-status request-pending">Menunggu kurasi</span>
                    <h3>{comic.title}</h3>
                    <p className="comic-review-creator">Oleh {comic.creator} · {new Date(comic.created_at).toLocaleDateString("id-ID")}</p>
                    <p className="comic-review-synopsis">{comic.synopsis}</p>
                    {comic.contributor && <p className="comic-review-contributor">Kontributor: {comic.contributor}</p>}
                  </div>
                  <div className="comic-review-actions">
                    <Link className="button button-light" href={`/account/komik/${comic.id}`}><Eye size={15} /> Tinjau komik</Link>
                    <button className="approve-button" onClick={() => reviewComic(comic, "published")} disabled={comicActionId === comic.id}><Check size={16} /> Terbitkan</button>
                    <button className="reject-button" onClick={() => reviewComic(comic, "draft")} disabled={comicActionId === comic.id}><X size={16} /> Kembalikan ke draf</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>}
        {section === "creator-requests" && <section className="creator-requests-section" id="creator-requests">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Akses kreator</p><h2>Pengajuan kreator</h2></div>
            <span>{requests.length} menunggu</span>
          </div>
          {requests.length === 0 ? (
            <div className="admin-empty"><ShieldCheck size={28} /><h2>Tidak ada pengajuan yang menunggu.</h2><p>Pengajuan lama yang sudah disetujui atau ditolak tidak ditampilkan di antrean ini.</p></div>
          ) : (
            <div className="request-table-wrap">
              <table className="request-table">
                <thead><tr><th>Pengaju</th><th>Catatan</th><th>Portofolio & media sosial</th><th>Tanggal</th><th>Status</th><th>Tindakan</th></tr></thead>
                <tbody>{requests.map((request) => (
                  <tr key={request.id}>
                    <td><strong>{request.applicant}</strong><code>{request.user_id.slice(0, 8)}...</code></td>
                    <td><p className="request-preview">{request.note || "Tidak ada catatan."}</p><button className="view-button" onClick={() => setSelectedRequest(request)}>Lihat</button></td>
                    <td><div className="request-links compact-links">{request.portfolio_url && <a href={request.portfolio_url} target="_blank" rel="noreferrer">Portofolio</a>}{request.instagram_url && <a href={request.instagram_url} target="_blank" rel="noreferrer">Instagram</a>}{request.other_url && <a href={request.other_url} target="_blank" rel="noreferrer">Lainnya</a>}{!request.portfolio_url && !request.instagram_url && !request.other_url && <span>Tidak ada</span>}</div></td>
                    <td>{new Date(request.created_at).toLocaleDateString("id-ID")}</td>
                    <td><span className={`request-status request-${request.status}`}>{request.status === "pending" ? "Menunggu" : request.status === "approved" ? "Disetujui" : "Ditolak"}</span>{request.status === "approved" && <small>Peran: {roleLabels[request.role as keyof typeof roleLabels] || "Pembaca"}</small>}</td>
                    <td>{request.status === "pending" ? <div className="request-actions"><button className="approve-button" onClick={() => reviewRequest(request, "approved")} disabled={actionId === request.id}><Check size={16} /> Setujui</button><button className="reject-button" onClick={() => reviewRequest(request, "rejected")} disabled={actionId === request.id}><X size={16} /> Tolak</button></div> : <span className="reviewed-label">Sudah ditinjau</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>}
        {section === "users" && <section className="admin-management-section" id="user-management">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Akun dan akses</p><h2>Manajemen pengguna</h2></div>
            <span>{users.length} pengguna</span>
          </div>
          <label className="admin-search"><Search size={17} /><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Cari nama atau ID pengguna" /></label>
          {filteredUsers.length === 0 ? (
            <div className="admin-empty"><Users size={26} /><h2>Pengguna tidak ditemukan.</h2><p>Coba kata kunci lain.</p></div>
          ) : (
            <div className="request-table-wrap">
              <table className="request-table admin-user-table">
                <thead><tr><th>Pengguna</th><th>Bergabung</th><th>Peran</th><th>Kelola peran</th><th>Paket reader</th></tr></thead>
                <tbody>{filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.display_name || "Tanpa nama"}</strong><code>{user.id.slice(0, 12)}...</code></td>
                    <td>{new Date(user.created_at).toLocaleDateString("id-ID")}</td>
                    <td><span className={`request-status request-${user.role === "admin" ? "approved" : user.role === "creator" ? "pending" : "draft"}`}>{roleLabels[user.role]}</span></td>
                    <td>{user.role === "admin"
                      ? <span className="reviewed-label">Akses admin dilindungi</span>
                      : user.id === adminUserId
                        ? <span className="reviewed-label">Akun yang sedang digunakan</span>
                        : <select className="admin-role-select" aria-label={`Ubah peran ${user.display_name}`} value={user.role} onChange={(event) => updateUserRole(user, event.target.value as "reader" | "creator")} disabled={actionId === user.id}><option value="reader">Pembaca</option><option value="creator">Kreator</option></select>}
                    </td>
                    <td><select className="admin-role-select" aria-label={`Ubah paket reader ${user.display_name}`} value={user.membershipTier} onChange={(event) => {
                      const selectedTier = READER_MEMBERSHIP_TIERS.find((tier) => tier.value === event.target.value)?.value;
                      if (selectedTier) void updateReaderMembership(user, selectedTier);
                    }} disabled={actionId === user.id}>
                      {READER_MEMBERSHIP_TIERS.map((tier) => <option key={tier.value} value={tier.value}>{tier.label}</option>)}
                    </select></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>}
        {section === "comics" && <section className="admin-management-section" id="comic-management">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Katalog</p><h2>Manajemen komik</h2></div>
            <span>{comics.length} komik</span>
          </div>
          <div className="admin-comic-filters">
            <label className="admin-search"><Search size={17} /><input value={comicSearch} onChange={(event) => setComicSearch(event.target.value)} placeholder="Cari judul, kreator, atau genre" /></label>
            <select aria-label="Saring berdasarkan status" value={comicStatusFilter} onChange={(event) => setComicStatusFilter(event.target.value)}>
              <option value="all">Semua status</option>
              <option value="draft">Draf</option>
              <option value="pending_review">Menunggu kurasi</option>
              <option value="published">Terbit</option>
              <option value="archived">Diarsipkan</option>
            </select>
          </div>
          {filteredComics.length === 0 ? (
            <div className="admin-empty"><BookOpen size={26} /><h2>Komik tidak ditemukan.</h2><p>Coba kata kunci atau status lain.</p></div>
          ) : (
            <div className="request-table-wrap">
              <table className="request-table admin-comic-table">
                <thead><tr><th>Komik</th><th>Kreator</th><th>Genre</th><th>Status</th><th>Tindakan</th></tr></thead>
                <tbody>{filteredComics.map((comic) => (
                  <tr key={comic.id}>
                    <td><strong>{comic.title}</strong><code>{comic.slug}</code></td>
                    <td>{comic.creator}</td>
                    <td>{comic.genre}</td>
                    <td><span className={`request-status request-${comic.status === "published" ? "approved" : comic.status === "pending_review" ? "pending" : comic.status}`}>{comicStatusLabels[comic.status]}</span></td>
                    <td className="admin-comic-actions">
                      <Link className="admin-manage-link" href={`/account/komik/${comic.id}`}>Kelola</Link>
                      {comic.status === "draft" && <button className="admin-action-link" onClick={() => updateComicStatus(comic, "pending_review")} disabled={comicActionId === comic.id}>Ajukan kurasi</button>}
                      {comic.status === "published" && <button className="admin-action-link admin-action-danger" onClick={() => updateComicStatus(comic, "archived")} disabled={comicActionId === comic.id}><Archive size={14} /> Arsipkan</button>}
                      {comic.status === "archived" && <button className="admin-action-link" onClick={() => updateComicStatus(comic, "draft")} disabled={comicActionId === comic.id}>Pulihkan ke draf</button>}
                      {comic.status === "pending_review" && <a className="admin-action-link" href="#comic-review">Lihat antrean</a>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>}
          </section>
        </div>
      </div>
      {selectedRequest && (
        <div className="request-modal-backdrop" role="presentation" onClick={() => setSelectedRequest(null)}>
          <section className="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="request-modal-header">
              <div><p className="eyebrow">Pengajuan kreator</p><h2 id="request-modal-title">{selectedRequest.applicant}</h2></div>
              <button className="modal-close" onClick={() => setSelectedRequest(null)} aria-label="Tutup pengajuan">×</button>
            </div>
            <div className="modal-meta"><span>{requestStatusLabels[selectedRequest.status]}</span><span>{new Date(selectedRequest.created_at).toLocaleDateString("id-ID")}</span></div>
            <p className="modal-note">{selectedRequest.note || "Tidak ada catatan."}</p>
            <div className="modal-links">{selectedRequest.portfolio_url && <a href={selectedRequest.portfolio_url} target="_blank" rel="noreferrer">Portofolio ↗</a>}{selectedRequest.instagram_url && <a href={selectedRequest.instagram_url} target="_blank" rel="noreferrer">Instagram ↗</a>}{selectedRequest.other_url && <a href={selectedRequest.other_url} target="_blank" rel="noreferrer">Tautan lain ↗</a>}</div>
            {selectedRequest.status === "pending" && <div className="request-actions modal-actions"><button className="approve-button" onClick={() => { reviewRequest(selectedRequest, "approved"); setSelectedRequest(null); }} disabled={actionId === selectedRequest.id}><Check size={16} /> Setujui</button><button className="reject-button" onClick={() => { reviewRequest(selectedRequest, "rejected"); setSelectedRequest(null); }} disabled={actionId === selectedRequest.id}><X size={16} /> Tolak</button></div>}
          </section>
        </div>
      )}
    </main>
  );
}
