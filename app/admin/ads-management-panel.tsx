"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Check, LoaderCircle, Megaphone, Pencil, Plus, ToggleLeft, ToggleRight, X } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { COMIC_GENRES, getComicGenreLabel } from "@/lib/comic-genres";

type AdFormat = "banner" | "native" | "sponsor";
type CampaignStatus = "draft" | "active" | "paused" | "completed";
type TargetPlacement = "all" | "comic_detail" | "reader" | "episode_transition" | "both";
type AdSlot = {
  id: string;
  name: string;
  slot_key: string;
  format: AdFormat;
  description: string;
  is_active: boolean;
  created_at: string;
};
type PublishedComic = { id: string; title: string; slug: string };
type SponsorCampaign = {
  id: string;
  sponsor_name: string;
  title: string;
  description: string;
  destination_url: string;
  image_url: string | null;
  image_url_tablet: string | null;
  image_url_mobile: string | null;
  slot_id: string | null;
  target_comic_id: string | null;
  target_placement: TargetPlacement;
  target_genres: string[];
  source_ad_request_id: string | null;
  starts_on: string;
  ends_on: string;
  status: CampaignStatus;
  created_at: string;
};

const supabase = createClient();
const campaignStatusLabels: Record<CampaignStatus, string> = {
  draft: "Draf",
  active: "Aktif",
  paused: "Dijeda",
  completed: "Selesai",
};
const formatLabels: Record<AdFormat, string> = {
  banner: "Banner",
  native: "Terintegrasi",
  sponsor: "Sponsor",
};
const emptySlot = { id: "", name: "", slot_key: "", format: "banner" as AdFormat, description: "" };
const emptyCampaign = {
  id: "",
  sponsor_name: "",
  title: "",
  description: "",
  destination_url: "",
  image_url: "",
  image_url_tablet: "",
  image_url_mobile: "",
  slot_id: "",
  target_comic_id: "",
  target_placement: "all" as TargetPlacement,
  target_genres: [] as string[],
  starts_on: "",
  ends_on: "",
  status: "draft" as CampaignStatus,
};

type CampaignUrlField = "destination_url" | "image_url";
type CampaignImageField = "image_url" | "image_url_tablet" | "image_url_mobile";

function normalizeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const malformedHttpPrefix = trimmed.match(/^(https?):\/*(.+)$/i);
  if (malformedHttpPrefix) return `${malformedHttpPrefix[1]}://${malformedHttpPrefix[2]}`;
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isHttpUrl(value: string) {
  if (!/^https?:\/\/\S+$/i.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

type DatabaseError = { code?: string; message: string; details?: string | null; hint?: string | null };

function databaseErrorMessage(error: DatabaseError) {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Tabel iklan belum tersedia. Jalankan supabase/ads-management.sql di Supabase SQL Editor.";
  }
  if (error.code === "42703" && /source_ad_request_id/i.test(error.message)) {
    return "Kolom penghubung kampanye dari pengajuan belum tersedia. Jalankan ulang supabase/ad-requests.sql di Supabase SQL Editor.";
  }
  if (error.code === "42703" && /image_url_(tablet|mobile)/i.test(error.message)) {
    return "Kolom gambar responsif belum tersedia di database. Jalankan ulang supabase/ads-management.sql di Supabase SQL Editor, lalu muat ulang halaman.";
  }
  if (error.code === "42703" || error.code === "PGRST202") {
    return "Skema penargetan minat belum diterapkan. Jalankan supabase/reader-profiling.sql setelah supabase/ads-management.sql di Supabase SQL Editor, lalu muat ulang halaman.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Akses ditolak. Pastikan akun memiliki peran admin dan kebijakan database sudah diterapkan.";
  }
  return "Operasi iklan gagal. Periksa koneksi dan pengaturan database, lalu coba lagi.";
}

function logDatabaseError(action: string, error: DatabaseError) {
  console.error(action, {
    code: error.code ?? "unknown",
    message: error.message,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

function normalizeTargetGenres(genres: unknown): string[] {
  return Array.isArray(genres)
    ? genres.filter((genre): genre is string => typeof genre === "string")
    : [];
}

export default function AdsManagementPanel({ mode }: { mode: "slots" | "campaigns" }) {
  const [slots, setSlots] = useState<AdSlot[]>([]);
  const [publishedComics, setPublishedComics] = useState<PublishedComic[]>([]);
  const [campaigns, setCampaigns] = useState<SponsorCampaign[]>([]);
  const [campaignSourceLinkReady, setCampaignSourceLinkReady] = useState(true);
  const [slotForm, setSlotForm] = useState(emptySlot);
  const [campaignForm, setCampaignForm] = useState(emptyCampaign);
  const [formVisible, setFormVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCampaignImage, setUploadingCampaignImage] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");
  const [campaignUrlErrors, setCampaignUrlErrors] = useState<Record<CampaignUrlField, string>>({
    destination_url: "",
    image_url: "",
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [slotResult, campaignResult, comicsResult] = await Promise.all([
        supabase.from("ad_slots").select("id, name, slot_key, format, description, is_active, created_at").order("created_at", { ascending: false }),
        supabase.from("sponsor_campaigns").select("id, sponsor_name, title, description, destination_url, image_url, image_url_tablet, image_url_mobile, slot_id, target_comic_id, target_placement, target_genres, source_ad_request_id, starts_on, ends_on, status, created_at").order("created_at", { ascending: false }),
        supabase.from("comics").select("id, title, slug").eq("status", "published").order("title"),
      ]);
      if (cancelled) return;
      let campaignRows = campaignResult.data;
      let campaignError = campaignResult.error;
      let sourceRequestLinkNeedsMigration = false;
      if (campaignError?.code === "42703" && /source_ad_request_id/i.test(campaignError.message)) {
        console.warn("Sponsor campaign source links are unavailable until supabase/ad-requests.sql is applied.", {
          code: campaignError.code,
          message: campaignError.message,
        });
        const fallbackResult = await supabase
          .from("sponsor_campaigns")
          .select("id, sponsor_name, title, description, destination_url, image_url, image_url_tablet, image_url_mobile, slot_id, target_comic_id, target_placement, target_genres, starts_on, ends_on, status, created_at")
          .order("created_at", { ascending: false });
        campaignRows = fallbackResult.data?.map((campaign) => ({ ...campaign, source_ad_request_id: null })) ?? null;
        campaignError = fallbackResult.error;
        sourceRequestLinkNeedsMigration = !fallbackResult.error;
      }
      const error = slotResult.error || campaignError || comicsResult.error;
      if (error) {
        if (error.code === "42703" && /source_ad_request_id/i.test(error.message)) {
          console.warn("Sponsor campaign source links are unavailable until supabase/ad-requests.sql is applied.", {
            code: error.code,
            message: error.message,
          });
        } else {
          logDatabaseError("Unable to load ads management data:", error);
        }
        setMessage(databaseErrorMessage(error));
      } else {
        setSlots((slotResult.data ?? []) as AdSlot[]);
        setCampaignSourceLinkReady(!sourceRequestLinkNeedsMigration);
        setCampaigns((campaignRows ?? []).map((campaign) => ({
          ...campaign,
          target_genres: normalizeTargetGenres(campaign.target_genres),
        })) as SponsorCampaign[]);
        setPublishedComics((comicsResult.data ?? []) as PublishedComic[]);
        if (sourceRequestLinkNeedsMigration) {
          setMessage("Kampanye sponsor dimuat. Jalankan ulang supabase/ad-requests.sql untuk menghubungkan dan menandai kampanye dari pengajuan iklan.");
        }
      }
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const saveSlot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const slotKey = slotForm.slot_key.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(slotKey)) {
      setMessage("Kode slot hanya boleh berisi huruf kecil, angka, dan garis bawah.");
      return;
    }
    setSaving(true);
    setMessage("");
    const values = {
      name: slotForm.name.trim(),
      slot_key: slotKey,
      format: slotForm.format,
      description: slotForm.description.trim(),
      updated_at: new Date().toISOString(),
    };
    const result = slotForm.id
      ? await supabase.from("ad_slots").update(values).eq("id", slotForm.id).select("id, name, slot_key, format, description, is_active, created_at").single()
      : await supabase.from("ad_slots").insert(values).select("id, name, slot_key, format, description, is_active, created_at").single();
    if (result.error) {
      logDatabaseError("Unable to save ad slot:", result.error);
      setMessage(databaseErrorMessage(result.error));
    } else {
      const saved = result.data as AdSlot;
      setSlots((current) => slotForm.id
        ? current.map((slot) => slot.id === saved.id ? saved : slot)
        : [saved, ...current]);
      setSlotForm(emptySlot);
      setFormVisible(false);
      setMessage("Slot iklan berhasil disimpan.");
    }
    setSaving(false);
  };

  const saveCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const destinationUrl = normalizeHttpUrl(campaignForm.destination_url);
    const imageUrl = normalizeHttpUrl(campaignForm.image_url);
    setCampaignForm((current) => ({ ...current, destination_url: destinationUrl, image_url: imageUrl }));
    const urlErrors = {
      destination_url: !destinationUrl
        ? "URL tujuan wajib diisi."
        : !isHttpUrl(destinationUrl)
          ? "Masukkan alamat web yang valid, misalnya https://contoh.id."
          : "",
      image_url: imageUrl && !isHttpUrl(imageUrl)
        ? "Masukkan URL gambar yang valid atau kosongkan kolom ini."
        : "",
    };
    setCampaignUrlErrors(urlErrors);
    if (urlErrors.destination_url || urlErrors.image_url) {
      setMessage("Periksa kembali URL yang ditandai sebelum menyimpan.");
      return;
    }
    if (campaignForm.ends_on < campaignForm.starts_on) {
      setMessage("Tanggal selesai tidak boleh lebih awal dari tanggal mulai.");
      return;
    }
    if (!campaignForm.starts_on || !campaignForm.ends_on) {
      setMessage("Isi tanggal mulai dan tanggal selesai kampanye.");
      return;
    }
    if (campaignForm.target_comic_id && campaignForm.target_placement === "all") {
      setMessage("Pilih penempatan iklan untuk komik ini.");
      return;
    }
    if (campaignForm.status === "active" && campaignForm.target_comic_id && !publishedComics.some((comic) => comic.id === campaignForm.target_comic_id)) {
      setMessage("Komik target tidak ditemukan atau belum diterbitkan.");
      return;
    }
    if (campaignForm.status === "active" && !campaignForm.target_comic_id && !slots.some((slot) => slot.id === campaignForm.slot_id && slot.is_active)) {
      setMessage("Pilih slot iklan yang aktif sebelum mengaktifkan kampanye umum.");
      return;
    }
    setSaving(true);
    setMessage("");
    const values = {
      sponsor_name: campaignForm.sponsor_name.trim(),
      title: campaignForm.title.trim(),
      description: campaignForm.description.trim(),
      destination_url: destinationUrl,
      image_url: imageUrl || null,
      image_url_tablet: campaignForm.image_url_tablet || null,
      image_url_mobile: campaignForm.image_url_mobile || null,
      slot_id: campaignForm.target_comic_id ? null : campaignForm.slot_id || null,
      target_comic_id: campaignForm.target_comic_id || null,
      target_placement: campaignForm.target_placement,
      target_genres: normalizeTargetGenres(campaignForm.target_genres),
      starts_on: campaignForm.starts_on,
      ends_on: campaignForm.ends_on,
      status: campaignForm.status,
      updated_at: new Date().toISOString(),
    };
    const result = campaignForm.id
      ? await supabase.from("sponsor_campaigns").update(values).eq("id", campaignForm.id).select("id, sponsor_name, title, description, destination_url, image_url, image_url_tablet, image_url_mobile, slot_id, target_comic_id, target_placement, target_genres, starts_on, ends_on, status, created_at").single()
      : await supabase.from("sponsor_campaigns").insert(values).select("id, sponsor_name, title, description, destination_url, image_url, image_url_tablet, image_url_mobile, slot_id, target_comic_id, target_placement, target_genres, starts_on, ends_on, status, created_at").single();
    if (result.error) {
      logDatabaseError("Unable to save sponsor campaign:", result.error);
      setMessage(databaseErrorMessage(result.error));
    } else {
      const saved = {
        ...result.data,
        source_ad_request_id: campaignSourceLinkReady
          ? campaigns.find((campaign) => campaign.id === result.data.id)?.source_ad_request_id ?? null
          : null,
      } as SponsorCampaign;
      setCampaigns((current) => campaignForm.id
        ? current.map((campaign) => campaign.id === saved.id ? saved : campaign)
        : [saved, ...current]);
      setCampaignForm(emptyCampaign);
      setCampaignUrlErrors({ destination_url: "", image_url: "" });
      setFormVisible(false);
      setMessage("Kampanye sponsor berhasil disimpan.");
    }
    setSaving(false);
  };

  const toggleSlot = async (slot: AdSlot) => {
    setWorkingId(slot.id);
    setMessage("");
    if (slot.is_active) {
      const { data: activeCampaign, error: campaignError } = await supabase
        .from("sponsor_campaigns")
        .select("id")
        .eq("slot_id", slot.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (campaignError) {
        console.error("Unable to check sponsor campaigns before disabling ad slot:", campaignError);
        setMessage(databaseErrorMessage(campaignError));
        setWorkingId("");
        return;
      }
      if (activeCampaign) {
        setMessage("Slot masih digunakan kampanye aktif. Jeda atau pindahkan kampanye sebelum menonaktifkan slot.");
        setWorkingId("");
        return;
      }
    }
    const { data, error } = await supabase.from("ad_slots").update({ is_active: !slot.is_active, updated_at: new Date().toISOString() }).eq("id", slot.id).select("id").maybeSingle();
    if (error || !data) {
      const failure = error || { message: "Slot tidak ditemukan atau tidak dapat diubah." };
      console.error("Unable to update ad slot status:", failure);
      setMessage(databaseErrorMessage(failure));
    } else {
      setSlots((current) => current.map((item) => item.id === slot.id ? { ...item, is_active: !slot.is_active } : item));
    }
    setWorkingId("");
  };

  const updateCampaignStatus = async (campaign: SponsorCampaign, status: CampaignStatus) => {
    setWorkingId(campaign.id);
    setMessage("");
    const { data, error } = await supabase.from("sponsor_campaigns").update({ status, updated_at: new Date().toISOString() }).eq("id", campaign.id).select("id").maybeSingle();
    if (error || !data) {
      const failure = error || { message: "Kampanye tidak ditemukan atau tidak dapat diubah." };
      console.error("Unable to update sponsor campaign status:", failure);
      setMessage(databaseErrorMessage(failure));
    } else {
      setCampaigns((current) => current.map((item) => item.id === campaign.id ? { ...item, status } : item));
    }
    setWorkingId("");
  };

  const editCampaign = (campaign: SponsorCampaign) => {
    setCampaignForm({
      ...campaign,
      target_genres: normalizeTargetGenres(campaign.target_genres),
      image_url: campaign.image_url || "",
      image_url_tablet: campaign.image_url_tablet || "",
      image_url_mobile: campaign.image_url_mobile || "",
      slot_id: campaign.slot_id || "",
      target_comic_id: campaign.target_comic_id || "",
      target_placement: campaign.target_placement || "all",
    });
    setCampaignUrlErrors({ destination_url: "", image_url: "" });
    setFormVisible(true);
    setMessage("");
  };

  const startNewForm = () => {
    if (mode === "slots") setSlotForm(emptySlot);
    else {
      setCampaignForm(emptyCampaign);
      setCampaignUrlErrors({ destination_url: "", image_url: "" });
    }
    setFormVisible(true);
    setMessage("");
  };

  const cancelForm = () => {
    setSlotForm(emptySlot);
    setCampaignForm(emptyCampaign);
    setCampaignUrlErrors({ destination_url: "", image_url: "" });
    setFormVisible(false);
  };

  const normalizeCampaignUrlField = (field: CampaignUrlField) => {
    const normalized = normalizeHttpUrl(campaignForm[field]);
    const error = field === "destination_url" && !normalized
      ? "URL tujuan wajib diisi."
      : normalized && !isHttpUrl(normalized)
        ? "Masukkan alamat web yang valid, misalnya https://contoh.id."
        : "";
    setCampaignForm((current) => ({ ...current, [field]: normalized }));
    setCampaignUrlErrors((current) => ({ ...current, [field]: error }));
  };

  const uploadCampaignImage = async (event: ChangeEvent<HTMLInputElement>, imageField: CampaignImageField) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Format gambar harus JPG, PNG, atau WebP.");
      event.target.value = "";
      return;
    }

    setUploadingCampaignImage(true);
    setMessage("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("Unable to check admin session before campaign image upload:", sessionError);
        throw new Error("Sesi admin tidak dapat diperiksa. Silakan masuk kembali.");
      }
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sesi admin berakhir. Silakan masuk kembali.");

      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/r2/campaign-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      const result = await response.json() as { imageUrl?: string; error?: string };
      if (!response.ok || !result.imageUrl) {
        throw new Error(result.error || `Upload gagal (HTTP ${response.status}).`);
      }
      setCampaignForm((current) => ({ ...current, [imageField]: result.imageUrl! }));
      if (imageField === "image_url") setCampaignUrlErrors((current) => ({ ...current, image_url: "" }));
      setMessage(`Gambar ${imageField === "image_url" ? "desktop" : imageField === "image_url_tablet" ? "tablet" : "mobile"} berhasil diunggah.`);
    } catch (error) {
      console.error("Campaign image upload failed:", error);
      setMessage("Gambar kampanye gagal diunggah. Periksa format berkas dan koneksi internet, lalu coba lagi.");
    } finally {
      setUploadingCampaignImage(false);
      event.target.value = "";
    }
  };

  const isHomeBanner = !campaignForm.target_comic_id
    && slots.find((slot) => slot.id === campaignForm.slot_id)?.slot_key === "home_banner";
  const imageRecommendations = isHomeBanner
    ? { desktop: "1200 × 400 px", tablet: "768 × 360 px", mobile: "720 × 480 px" }
    : { desktop: "1200 × 600 px", tablet: "900 × 600 px", mobile: "720 × 900 px" };

  if (loading) {
    return <div className="ads-panel-loading"><LoaderCircle className="spin" size={20} /> Memuat data iklan...</div>;
  }

  return (
    <div className="ads-management-panel">
      {message && <p className="admin-message" role={message.startsWith("Slot iklan berhasil") || message.startsWith("Kampanye sponsor berhasil") ? "status" : "alert"}>{message}</p>}
      <div className="ads-management-grid ads-management-grid-single">
        {mode === "slots" && <>
        <section className="ads-management-card" aria-labelledby="ad-slots-title">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Inventaris</p><h2 id="ad-slots-title">Slot iklan</h2></div>
            <div className="ads-heading-actions">
              <span className="ads-count">{slots.length} slot</span>
              {!formVisible && <button className="approve-button" type="button" onClick={startNewForm}><Plus size={15} /> Tambah slot</button>}
            </div>
          </div>
          {formVisible && <form className="ads-form" id="ad-slot-form" onSubmit={saveSlot}>
            <h3>{slotForm.id ? "Ubah slot" : "Tambah slot"}</h3>
            <label>Nama slot<input required maxLength={80} value={slotForm.name} onChange={(event) => setSlotForm((current) => ({ ...current, name: event.target.value }))} placeholder="Contoh: Header halaman utama" /></label>
            <label>Kode slot<input required maxLength={60} pattern="[a-z0-9]+(?:_[a-z0-9]+)*" value={slotForm.slot_key} onChange={(event) => setSlotForm((current) => ({ ...current, slot_key: event.target.value }))} placeholder="home_header" /></label>
            <label>Format<select value={slotForm.format} onChange={(event) => setSlotForm((current) => ({ ...current, format: event.target.value as AdFormat }))}><option value="banner">Banner</option><option value="native">Terintegrasi</option><option value="sponsor">Sponsor</option></select></label>
            <label>Catatan<textarea maxLength={300} rows={2} value={slotForm.description} onChange={(event) => setSlotForm((current) => ({ ...current, description: event.target.value }))} placeholder="Lokasi atau panduan ukuran materi." /></label>
            <div className="ads-form-actions">
              <button className="approve-button" type="submit" disabled={saving}><Check size={15} /> {saving ? "Menyimpan..." : slotForm.id ? "Simpan slot" : "Tambah slot"}</button>
              <button className="admin-action-link" type="button" onClick={cancelForm}>Batal</button>
            </div>
          </form>}
          <p className="ads-list-summary">Daftar slot iklan ({slots.length})</p>
          {slots.length ? <div className="request-table-wrap ads-list-table-wrap">
            <table className="request-table ads-slots-table">
              <thead><tr><th>Nama slot</th><th>Kode</th><th>Format</th><th>Kampanye</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>{slots.map((slot) => {
                const linkedCampaigns = campaigns.filter((campaign) => campaign.slot_id === slot.id);
                return <tr key={slot.id}>
                  <td><strong>{slot.name}</strong>{slot.description && <small>{slot.description}</small>}</td>
                  <td><code>{slot.slot_key}</code></td>
                  <td>{formatLabels[slot.format]}</td>
                  <td>{linkedCampaigns.length ? linkedCampaigns.map((campaign) => campaign.title).join(", ") : <span className="ads-list-muted">Belum digunakan</span>}</td>
                  <td><span className={`request-status request-${slot.is_active ? "approved" : "rejected"}`}>{slot.is_active ? "Aktif" : "Nonaktif"}</span></td>
                  <td><div className="ads-item-actions">
                    <button type="button" className="admin-action-link" onClick={() => { setSlotForm({ ...slot }); setFormVisible(true); setMessage(""); }} aria-label={`Ubah ${slot.name}`}><Pencil size={14} /> Ubah</button>
                    <button type="button" className="admin-action-link" onClick={() => void toggleSlot(slot)} disabled={workingId === slot.id} aria-label={`${slot.is_active ? "Nonaktifkan" : "Aktifkan"} ${slot.name}`}>
                      {slot.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}{slot.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div> : <p className="ads-empty-note">Belum ada slot. Tambahkan slot untuk menyiapkan inventaris iklan.</p>}
        </section>
        </>}
        {mode === "campaigns" && <>
        <section className="ads-management-card" aria-labelledby="sponsor-campaigns-title">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Kerja sama komersial</p><h2 id="sponsor-campaigns-title">Kampanye sponsor</h2></div>
            <div className="ads-heading-actions">
              <span className="ads-count">{campaigns.length} kampanye</span>
              {!formVisible && <button className="approve-button" type="button" onClick={startNewForm}><Plus size={15} /> Tambah kampanye</button>}
            </div>
          </div>
          {formVisible && <form className="ads-form" id="sponsor-campaign-form" onSubmit={saveCampaign}>
            <h3>{campaignForm.id ? "Ubah kampanye" : "Buat kampanye"}</h3>
            <div className="ads-form-two-columns">
              <label>Nama sponsor<input required maxLength={120} value={campaignForm.sponsor_name} onChange={(event) => setCampaignForm((current) => ({ ...current, sponsor_name: event.target.value }))} /></label>
              <label>Nama kampanye<input required maxLength={120} value={campaignForm.title} onChange={(event) => setCampaignForm((current) => ({ ...current, title: event.target.value }))} /></label>
            </div>
            <label>Deskripsi<textarea maxLength={500} rows={2} value={campaignForm.description} onChange={(event) => setCampaignForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <label>URL tujuan<input required type="text" inputMode="url" aria-invalid={Boolean(campaignUrlErrors.destination_url)} aria-describedby="campaign-destination-help" value={campaignForm.destination_url} onChange={(event) => { setCampaignForm((current) => ({ ...current, destination_url: event.target.value })); setCampaignUrlErrors((current) => ({ ...current, destination_url: "" })); }} onBlur={() => normalizeCampaignUrlField("destination_url")} placeholder="https://contoh.id" />{campaignUrlErrors.destination_url ? <small className="ads-field-error" id="campaign-destination-help" role="alert">{campaignUrlErrors.destination_url}</small> : <small id="campaign-destination-help">Jika tidak mencantumkan https://, HTTPS akan ditambahkan otomatis.</small>}</label>
            <div className="ads-responsive-images">
              <p>Unggah materi terpisah untuk menyesuaikan tampilan di tiap perangkat. Jika salah satu ukuran tidak diisi, gambar untuk komputer akan digunakan sebagai pengganti.</p>
              {([
                { field: "image_url_mobile", label: "Ponsel", recommendation: imageRecommendations.mobile },
                { field: "image_url_tablet", label: "Tablet", recommendation: imageRecommendations.tablet },
                { field: "image_url", label: "Komputer", recommendation: imageRecommendations.desktop },
              ] as const).map(({ field, label, recommendation }) => (
                <div className="ads-campaign-image-field" key={field}>
                  <label htmlFor={`campaign-image-${label.toLowerCase()}`}>{label} · rekomendasi {recommendation}</label>
                  <input
                    id={`campaign-image-${label.toLowerCase()}`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void uploadCampaignImage(event, field)}
                    disabled={uploadingCampaignImage}
                  />
                  {field === "image_url" && campaignUrlErrors.image_url
                    ? <small className="ads-field-error" role="alert">{campaignUrlErrors.image_url}</small>
                    : <small>JPG, PNG, atau WebP. Maksimum mengikuti pengaturan unggahan platform.</small>}
                  {uploadingCampaignImage && <span className="ads-upload-progress"><LoaderCircle className="spin" size={15} /> Mengunggah gambar...</span>}
                  {campaignForm[field] && <div className="ads-image-preview-row">
                    <Image className="ads-campaign-image-preview" src={campaignForm[field]} alt={`Pratinjau materi ${label}`} width={600} height={300} unoptimized />
                    <button className="admin-action-link" type="button" onClick={() => {
                      setCampaignForm((current) => ({ ...current, [field]: "" }));
                      if (field === "image_url") setCampaignUrlErrors((current) => ({ ...current, image_url: "" }));
                    }}><X size={15} /> Hapus {label.toLowerCase()}</button>
                  </div>}
                </div>
              ))}
            </div>
            <label>URL gambar komputer (opsional)<input type="text" inputMode="url" aria-invalid={Boolean(campaignUrlErrors.image_url)} aria-describedby="campaign-image-help" value={campaignForm.image_url} onChange={(event) => { setCampaignForm((current) => ({ ...current, image_url: event.target.value })); setCampaignUrlErrors((current) => ({ ...current, image_url: "" })); }} onBlur={() => normalizeCampaignUrlField("image_url")} placeholder="https://contoh.id/banner.jpg" />{campaignUrlErrors.image_url ? <small className="ads-field-error" id="campaign-image-help" role="alert">{campaignUrlErrors.image_url}</small> : <small id="campaign-image-help">Opsional. URL ini menjadi gambar untuk komputer dan gambar pengganti untuk perangkat lain.</small>}</label>
            <label>Target komik<select value={campaignForm.target_comic_id} onChange={(event) => setCampaignForm((current) => ({ ...current, target_comic_id: event.target.value, slot_id: event.target.value ? "" : current.slot_id, target_placement: event.target.value ? current.target_placement === "all" ? "comic_detail" : current.target_placement : "all" }))}><option value="">Semua komik / penempatan slot</option>{publishedComics.map((comic) => <option value={comic.id} key={comic.id}>{comic.title}</option>)}</select><small>Kosongkan untuk memakai slot umum. Pilih komik untuk menargetkan kampanye hanya ke judul tersebut.</small></label>
            <fieldset className="campaign-genre-targeting">
              <legend>Target minat genre <span>(opsional)</span></legend>
              <p>Tanpa pilihan genre, kampanye dapat ditayangkan untuk semua pembaca. Jika dipilih, iklan dapat dicocokkan dengan komik yang sedang dibaca atau minat pembaca yang menyetujui personalisasi.</p>
              <div className="reader-interest-options">
                {COMIC_GENRES.map((genre) => (
                  <label className="reader-interest-option" key={genre}>
                    <input
                      type="checkbox"
                      checked={normalizeTargetGenres(campaignForm.target_genres).includes(genre)}
                      onChange={() => setCampaignForm((current) => {
                        const targetGenres = normalizeTargetGenres(current.target_genres);
                        return {
                        ...current,
                        target_genres: targetGenres.includes(genre)
                          ? targetGenres.filter((item) => item !== genre)
                          : [...targetGenres, genre],
                        };
                      })}
                    />
                    <span>{getComicGenreLabel(genre)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {campaignForm.target_comic_id ? <label>Penempatan untuk komik ini<select value={campaignForm.target_placement} onChange={(event) => setCampaignForm((current) => ({ ...current, target_placement: event.target.value as TargetPlacement }))}><option value="comic_detail">Halaman detail komik</option><option value="reader">Halaman baca (tengah bab)</option><option value="episode_transition">Antar episode</option><option value="both">Detail dan halaman baca</option></select></label> : <label>Slot<select value={campaignForm.slot_id} onChange={(event) => setCampaignForm((current) => ({ ...current, slot_id: event.target.value }))}><option value="">Pilih slot aktif</option>{slots.filter((slot) => slot.is_active || slot.id === campaignForm.slot_id).map((slot) => <option value={slot.id} key={slot.id}>{slot.name}{slot.is_active ? "" : " (nonaktif)"}</option>)}</select></label>}
            <div className="ads-form-two-columns">
              <label>Status<select value={campaignForm.status} onChange={(event) => setCampaignForm((current) => ({ ...current, status: event.target.value as CampaignStatus }))}>{Object.entries(campaignStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            </div>
            <div className="ads-form-two-columns">
              <label>Tanggal mulai<input required type="date" value={campaignForm.starts_on} onChange={(event) => setCampaignForm((current) => ({ ...current, starts_on: event.target.value }))} /></label>
              <label>Tanggal selesai<input required type="date" value={campaignForm.ends_on} onChange={(event) => setCampaignForm((current) => ({ ...current, ends_on: event.target.value }))} /></label>
            </div>
            <div className="ads-form-actions">
              <button className="approve-button" type="submit" disabled={saving || uploadingCampaignImage}><Check size={15} /> {saving ? "Menyimpan..." : campaignForm.id ? "Simpan kampanye" : "Tambah kampanye"}</button>
              <button className="admin-action-link" type="button" onClick={cancelForm}>Batal</button>
            </div>
          </form>}
          <p className="ads-list-summary">Daftar kampanye sponsor ({campaigns.length})</p>
          {campaigns.length ? <div className="request-table-wrap ads-list-table-wrap">
            <table className="request-table ads-list-table">
              <thead><tr><th>Kampanye</th><th>Sponsor</th><th>Penempatan</th><th>Periode</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>{campaigns.map((campaign) => {
                const slot = slots.find((item) => item.id === campaign.slot_id);
                const targetComic = publishedComics.find((item) => item.id === campaign.target_comic_id);
                const placementLabel = campaign.target_placement === "comic_detail"
                  ? "Detail komik"
                  : campaign.target_placement === "reader"
                    ? "Halaman baca"
                    : campaign.target_placement === "episode_transition"
                      ? "Antar episode"
                    : campaign.target_placement === "both"
                      ? "Detail & baca"
                      : "Semua komik";
                const statusClass = campaign.status === "active" ? "approved" : campaign.status === "draft" ? "pending" : "rejected";
                return <tr key={campaign.id}>
                  <td><strong>{campaign.title}</strong>{campaign.source_ad_request_id && <small>Dari pengajuan iklan</small>}{campaign.description && <small>{campaign.description}</small>}</td>
                  <td>{campaign.sponsor_name}</td>
                  <td>{targetComic ? <><strong>{targetComic.title}</strong><small>{placementLabel}</small></> : slot ? <><strong>{slot.name}</strong><small>{formatLabels[slot.format]}{slot.is_active ? "" : " · Nonaktif"}</small></> : <span className="ads-list-muted">Belum ditentukan</span>}</td>
                  <td>{new Date(`${campaign.starts_on}T00:00:00`).toLocaleDateString("id-ID")}<small>s.d. {new Date(`${campaign.ends_on}T00:00:00`).toLocaleDateString("id-ID")}</small></td>
                  <td><span className={`request-status request-${statusClass}`}>{campaignStatusLabels[campaign.status]}</span></td>
                  <td><div className="ads-item-actions">
                    <button type="button" className="admin-action-link" onClick={() => editCampaign(campaign)}><Pencil size={14} /> Ubah</button>
                    {campaign.status !== "completed" && <button type="button" className="admin-action-link" onClick={() => void updateCampaignStatus(campaign, campaign.status === "active" ? "paused" : "active")} disabled={workingId === campaign.id}>
                      <Megaphone size={14} /> {campaign.status === "active" ? "Jeda" : "Aktifkan"}
                    </button>}
                    {campaign.status !== "completed" && <button type="button" className="admin-action-link admin-action-danger" onClick={() => void updateCampaignStatus(campaign, "completed")} disabled={workingId === campaign.id}>Tandai selesai</button>}
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div> : <p className="ads-empty-note">Belum ada kampanye sponsor.</p>}
        </section>
        </>}
      </div>
    </div>
  );
}
