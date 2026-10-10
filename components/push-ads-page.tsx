"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Image as ImageIcon, Megaphone, Monitor, Plus, Send, Smartphone, Tablet, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/client";
import ImageCropDialog from "@/components/image-crop-dialog";

type AdStatus = "pending" | "contacted" | "approved" | "rejected";
type CreativeDevice = "desktop" | "tablet" | "mobile";
type CreativeAsset = { file: File; previewUrl: string };
type CreativeFiles = Record<CreativeDevice, CreativeAsset | null>;
type CreativeCrop = { device: CreativeDevice; file: File; width: number; height: number };
type AdRequest = {
  id: string;
  advertiser_name: string;
  campaign_title: string;
  description: string;
  destination_url: string;
  image_url: string | null;
  image_url_tablet: string | null;
  image_url_mobile: string | null;
  placements: string[];
  requested_start: string | null;
  requested_end: string | null;
  status: AdStatus;
  admin_note: string;
  created_at: string;
};

const supabase = createClient();
const creativeDevices: { value: CreativeDevice; label: string; icon: typeof Monitor }[] = [
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "tablet", label: "Tablet", icon: Tablet },
  { value: "mobile", label: "Mobile", icon: Smartphone },
];
const maxCreativeSize = 5 * 1024 * 1024;
const maxCreativeSourceSize = 25 * 1024 * 1024;
const creativeMimeTypes = ["image/jpeg", "image/png", "image/webp"];
const isAdRequestSchemaError = (code: string) => ["42P01", "42703", "PGRST204", "PGRST205"].includes(code);
const placementOptions = [
  { value: "home_banner", label: "Banner beranda" },
  { value: "catalog_grid_native", label: "Di antara katalog komik" },
  { value: "comic_detail_sponsor", label: "Halaman detail komik" },
  { value: "reader_mid_chapter", label: "Di sela halaman baca" },
  { value: "reader_episode_transition", label: "Antar episode" },
];
const statusLabels: Record<AdStatus, string> = {
  pending: "Menunggu tinjauan",
  contacted: "Tim akan menghubungi",
  approved: "Pengajuan disetujui",
  rejected: "Belum dapat disetujui",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function PushAdsPreview({
  advertiserName,
  campaignTitle,
  description,
  creativeFiles,
  placements,
}: {
  advertiserName: string;
  campaignTitle: string;
  description: string;
  creativeFiles: CreativeFiles;
  placements: string[];
}) {
  const [placement, setPlacement] = useState("");
  const [previewDevice, setPreviewDevice] = useState<CreativeDevice>("desktop");
  const previewUrl = creativeFiles[previewDevice]?.previewUrl ?? "";
  const activePlacement = placements.includes(placement) ? placement : placements[0] ?? "";
  const displayPlacement = activePlacement || "home_banner";
  const readerPlacement = displayPlacement === "reader_mid_chapter" || displayPlacement === "reader_episode_transition";
  const placementLabel = placementOptions.find((item) => item.value === displayPlacement)?.label ?? "Banner beranda";

  return (
    <section className="push-ads-preview" aria-labelledby="push-ads-preview-title">
      <div className="push-ads-preview-heading">
        <div>
          <p className="eyebrow">PRATINJAU LANGSUNG</p>
          <h3 id="push-ads-preview-title">Tampilan iklanmu</h3>
        </div>
        <label>
          <span>Lihat lokasi pilihan</span>
          <select value={activePlacement} disabled={!placements.length} onChange={(event) => setPlacement(event.target.value)}>
            {!placements.length && <option value="">Pilih lokasi di formulir</option>}
            {placementOptions.filter((item) => placements.includes(item.value)).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div className="push-ads-preview-devices" aria-label="Pilih pratinjau perangkat">
        {creativeDevices.map(({ value, label, icon: DeviceIcon }) => (
          <button key={value} type="button" aria-pressed={previewDevice === value} onClick={() => setPreviewDevice(value)}>
            <DeviceIcon size={14} /> {label}
          </button>
        ))}
      </div>
      <div className={`push-ads-preview-stage${readerPlacement ? " push-ads-preview-stage-reader" : ""}${!activePlacement ? " is-unselected" : ""}`}>
        <p className="push-ads-preview-context">Contoh penempatan · {placementLabel}</p>
        <article className={`push-ads-preview-ad${readerPlacement ? " push-ads-preview-ad-reader" : ""}`} aria-label={`Pratinjau iklan ${campaignTitle || "baru"}`}>
          <span className="push-ads-preview-label"><Megaphone size={12} /> Pratinjau iklan</span>
          <div className="push-ads-preview-content">
            <div className={`push-ads-preview-media${previewUrl ? " has-image" : ""}`}>
              {previewUrl
                ? <Image src={previewUrl} alt="" fill sizes="(max-width: 850px) 90vw, 350px" unoptimized />
                : <span><ImageIcon size={22} /> Gambar {creativeDevices.find((item) => item.value === previewDevice)?.label} belum diunggah</span>}
            </div>
            <div className="push-ads-preview-copy">
              <small>{advertiserName.trim() || "Nama pengiklan"}</small>
              <strong>{campaignTitle.trim() || "Nama kampanye atau produk"}</strong>
              <p>{description.trim() || "Deskripsi iklan dan informasi yang ingin disampaikan kepada pembaca akan tampil di sini."}</p>
              <span className="push-ads-preview-cta">Kunjungi <ExternalLink size={13} /></span>
            </div>
          </div>
        </article>
        {!activePlacement && <p className="push-ads-preview-prompt">Pilih lokasi di formulir untuk menyesuaikan contoh tampilan iklan.</p>}
      </div>
      <p className="push-ads-preview-note">Pratinjau ini hanya simulasi. Tampilan akhir dapat menyesuaikan format dan perangkat.</p>
    </section>
  );
}

function CreativeUploadField({
  device,
  asset,
  size,
  onSelect,
  onRemove,
}: {
  device: CreativeDevice;
  asset: CreativeAsset | null;
  size: string;
  onSelect: (device: CreativeDevice, file: File | null) => void;
  onRemove: (device: CreativeDevice) => void;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSelect(device, event.target.files?.[0] ?? null);
    event.currentTarget.value = "";
  };
  const deviceLabel = creativeDevices.find((item) => item.value === device)?.label ?? device;

  const file = asset?.file ?? null;
  const previewUrl = asset?.previewUrl ?? "";
  return (
    <div className="push-ads-upload-card">
      <div className="push-ads-upload-card-heading">
        <strong>{deviceLabel}</strong>
        <span>{size}</span>
      </div>
      <label className="push-ads-upload-input">
        <Upload size={16} />
        <span>{file ? "Ganti gambar" : "Pilih gambar"}</span>
        <input type="file" accept={creativeMimeTypes.join(",")} onChange={handleChange} aria-label={`Unggah gambar iklan untuk ${deviceLabel}`} />
      </label>
      {file ? (
        <div className="push-ads-upload-file">
          {previewUrl && <div className="push-ads-upload-thumbnail"><Image src={previewUrl} alt="" fill sizes="64px" unoptimized /></div>}
          <span title={file.name}>{file.name}<small>{(file.size / (1024 * 1024)).toFixed(2)} MB</small></span>
          <button type="button" aria-label={`Hapus gambar ${deviceLabel}`} onClick={() => onRemove(device)}><Trash2 size={15} /></button>
        </div>
      ) : <p className="push-ads-upload-empty">Belum ada gambar · opsional</p>}
    </div>
  );
}

function ImageSizeGuide({
  includesHomeBanner,
  includesOtherPlacements,
  includesEpisodeTransition,
}: {
  includesHomeBanner: boolean;
  includesOtherPlacements: boolean;
  includesEpisodeTransition: boolean;
}) {
  const recommendations = [
    { device: "Desktop", size: includesHomeBanner ? "1200 × 400 px · 3:1" : "1200 × 600 px · 2:1", icon: Monitor },
    { device: "Tablet", size: includesHomeBanner ? "768 × 360 px · 32:15" : "900 × 600 px · 3:2", icon: Tablet },
    { device: "Mobile", size: includesHomeBanner ? "720 × 480 px · 3:2" : "720 × 900 px · 4:5", icon: Smartphone },
  ];
  return (
    <div className="push-ads-image-guide" aria-label="Rekomendasi ukuran gambar">
      <strong>Rekomendasi ukuran gambar</strong>
      <div className="push-ads-image-guide-grid">
        {recommendations.map(({ device, size, icon: DeviceIcon }) => (
          <div className="push-ads-image-guide-item" key={device}>
            <span><DeviceIcon size={15} /> {device}</span>
            <b>{size}</b>
          </div>
        ))}
      </div>
      {includesHomeBanner && includesOtherPlacements
        ? <small>Untuk penempatan selain banner beranda, gunakan desktop 1200 × 600 px, tablet 900 × 600 px, dan mobile 720 × 900 px.</small>
        : !includesHomeBanner && <small>Jika memilih banner beranda, rekomendasinya desktop 1200 × 400 px, tablet 768 × 360 px, dan mobile 720 × 480 px.</small>}
      {includesEpisodeTransition && <small>Untuk iklan antar episode desktop, gambar berada di kolom kiri (sekitar 56% lebar) dan ditampilkan dengan cover dari atas. Siapkan gambar sekitar 1200 × 1000 px (6:5) bila fokus pada penempatan ini; gambar potret dapat terpotong di bagian bawah. Jaga logo dan teks penting di area atas.</small>}
      {includesEpisodeTransition && includesHomeBanner && <small>Banner beranda dan antar episode memiliki rasio berbeda. Karena satu berkas dipakai untuk penempatan yang dipilih, crop mengikuti rasio banner beranda; ajukan kampanye terpisah jika membutuhkan materi antar episode yang disusun khusus.</small>}
      <small>JPG, PNG, atau WebP. Iklan di halaman baca biasa menampilkan gambar utuh; jika materi tablet atau mobile kosong, gambar desktop menjadi pengganti.</small>
    </div>
  );
}

export default function PushAdsPage() {
  const [userId, setUserId] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [requests, setRequests] = useState<AdRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestTableReady, setRequestTableReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [advertiserName, setAdvertiserName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [description, setDescription] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [creativeFiles, setCreativeFiles] = useState<CreativeFiles>({ desktop: null, tablet: null, mobile: null });
  const [creativeCrop, setCreativeCrop] = useState<CreativeCrop | null>(null);
  const creativeObjectUrls = useRef<Partial<Record<CreativeDevice, string>>>({});
  const [placements, setPlacements] = useState<string[]>([]);
  const [requestedStart, setRequestedStart] = useState("");
  const [requestedEnd, setRequestedEnd] = useState("");

  useEffect(() => () => {
    Object.values(creativeObjectUrls.current).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError) {
        console.error("Unable to check advertiser sign-in:", sessionError);
        setErrorMessage("Status masuk belum dapat diperiksa. Muat ulang halaman atau masuk kembali.");
        setLoading(false);
        return;
      }
      if (!sessionData.session) {
        setLoading(false);
        return;
      }
      const { data, error: userError } = await supabase.auth.getUser();
      if (!active) return;
      if (userError || !data.user) {
        if (userError) console.error("Unable to verify advertiser account:", userError);
        setErrorMessage("Akun belum dapat diverifikasi. Silakan masuk kembali.");
        setLoading(false);
        return;
      }
      setUserId(data.user.id);
      setAccountEmail(data.user.email ?? "");
      setContactEmail(data.user.email ?? "");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profileError) {
        console.error("Unable to load advertiser profile:", profileError);
      } else if (profile?.display_name) {
        setAdvertiserName(profile.display_name);
      }

      const { data: rows, error: requestError } = await supabase
        .from("ad_requests")
        .select("id, advertiser_name, campaign_title, description, destination_url, image_url, image_url_tablet, image_url_mobile, placements, requested_start, requested_end, status, admin_note, created_at")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (requestError) {
        if (isAdRequestSchemaError(requestError.code)) {
          console.warn("Advertiser submissions are unavailable because public.ad_requests is not installed:", {
            code: requestError.code,
            message: requestError.message,
          });
          setErrorMessage("Skema pengajuan iklan belum lengkap. Admin perlu menjalankan ulang supabase/ad-requests.sql di Supabase SQL Editor, lalu muat ulang halaman.");
        } else {
          console.error("Unable to load advertiser submissions:", {
            code: requestError.code,
            message: requestError.message,
            details: requestError.details,
            hint: requestError.hint,
          });
          setErrorMessage("Riwayat pengajuan iklan gagal dimuat. Coba muat ulang halaman.");
        }
      } else {
        setRequests((rows ?? []) as AdRequest[]);
        setRequestTableReady(true);
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, []);

  const togglePlacement = (value: string) => {
    setPlacements((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  };

  const updateCreativeFile = (device: CreativeDevice, file: File | null) => {
    if (file && !creativeMimeTypes.includes(file.type)) {
      setErrorMessage("Format gambar harus JPG, PNG, atau WebP.");
      return;
    }
    if (file && file.size > maxCreativeSize) {
      setErrorMessage("Ukuran setiap gambar maksimal 5 MB.");
      return;
    }
    setErrorMessage("");
    const previousUrl = creativeObjectUrls.current[device];
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const asset = file ? { file, previewUrl: URL.createObjectURL(file) } : null;
    if (asset) creativeObjectUrls.current[device] = asset.previewUrl;
    else delete creativeObjectUrls.current[device];
    setCreativeFiles((current) => ({ ...current, [device]: asset }));
  };

  const startCreativeCrop = (device: CreativeDevice, file: File | null) => {
    if (!file) return;
    if (!creativeMimeTypes.includes(file.type)) {
      setErrorMessage("Format gambar harus JPG, PNG, atau WebP.");
      return;
    }
    if (file.size > maxCreativeSourceSize) {
      setErrorMessage("Gambar sumber maksimal 25 MB agar dapat diproses dengan lancar di perangkat.");
      return;
    }
    const hasHomeBanner = placements.includes("home_banner");
    const isEpisodeTransition = placements.includes("reader_episode_transition");
    const width = device === "desktop" ? 1200 : device === "tablet" ? hasHomeBanner ? 768 : 900 : 720;
    const height = device === "desktop"
      ? isEpisodeTransition && !hasHomeBanner ? 1000 : hasHomeBanner ? 400 : 600
      : device === "tablet"
        ? hasHomeBanner ? 360 : 600
        : hasHomeBanner ? 480 : 900;
    setErrorMessage("");
    setCreativeCrop({ device, file, width, height });
  };

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    if (!userId) return;
    if (!placements.length) {
      setErrorMessage("Pilih setidaknya satu lokasi penayangan.");
      return;
    }
    if (!isHttpUrl(destinationUrl.trim())) {
      setErrorMessage("Masukkan URL tujuan yang valid dan diawali http:// atau https://.");
      return;
    }
    if (requestedStart && requestedEnd && requestedEnd < requestedStart) {
      setErrorMessage("Tanggal akhir tidak boleh lebih awal dari tanggal mulai.");
      return;
    }

    setSaving(true);
    const imageUrls: Record<CreativeDevice, string | null> = { desktop: null, tablet: null, mobile: null };
    const uploadedPaths: string[] = [];
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    for (const { value: device } of creativeDevices) {
      const asset = creativeFiles[device];
      if (!asset) continue;
      const { file } = asset;
      const path = `${userId}/${crypto.randomUUID()}-${device}.${extensions[file.type]}`;
      const { error: uploadError } = await supabase.storage
        .from("ad-creatives")
        .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
      if (uploadError) {
        console.error(`Unable to upload ${device} advertiser creative:`, uploadError);
        if (uploadedPaths.length) {
          const { error: cleanupError } = await supabase.storage.from("ad-creatives").remove(uploadedPaths);
          if (cleanupError) console.error("Unable to clean up advertiser creatives after upload failure:", cleanupError);
        }
        setSaving(false);
        setErrorMessage("Gambar gagal diunggah. Pastikan admin sudah menyiapkan penyimpanan iklan, lalu coba lagi.");
        return;
      }
      uploadedPaths.push(path);
      imageUrls[device] = supabase.storage.from("ad-creatives").getPublicUrl(path).data.publicUrl;
    }
    const { data, error } = await supabase
      .from("ad_requests")
      .insert({
        user_id: userId,
        advertiser_name: advertiserName.trim(),
        contact_email: contactEmail.trim(),
        contact_whatsapp: contactWhatsapp.trim() || null,
        campaign_title: campaignTitle.trim(),
        description: description.trim(),
        destination_url: destinationUrl.trim(),
        image_url: imageUrls.desktop,
        image_url_tablet: imageUrls.tablet,
        image_url_mobile: imageUrls.mobile,
        placements,
        requested_start: requestedStart || null,
        requested_end: requestedEnd || null,
        status: "pending",
      })
      .select("id, advertiser_name, campaign_title, description, destination_url, image_url, image_url_tablet, image_url_mobile, placements, requested_start, requested_end, status, admin_note, created_at")
      .single();
    setSaving(false);
    if (error) {
      if (isAdRequestSchemaError(error.code)) {
        console.warn("Advertiser request schema is outdated:", { code: error.code, message: error.message });
      } else {
        console.error("Unable to submit advertiser request:", error);
      }
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from("ad-creatives").remove(uploadedPaths);
        if (cleanupError) console.error("Unable to clean up advertiser creatives after request failure:", cleanupError);
      }
      setErrorMessage(isAdRequestSchemaError(error.code)
        ? "Skema pengajuan iklan belum lengkap. Admin MU Komik perlu menjalankan ulang supabase/ad-requests.sql di Supabase SQL Editor."
        : "Pengajuan belum berhasil dikirim. Periksa data dan coba lagi.");
      return;
    }
    setRequests((current) => [data as AdRequest, ...current]);
    setSuccessMessage("Pengajuan terkirim. Tim MU Komik akan meninjau dan menghubungimu melalui email.");
    setCampaignTitle("");
    setDescription("");
    setDestinationUrl("");
    Object.values(creativeObjectUrls.current).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    creativeObjectUrls.current = {};
    setCreativeFiles({ desktop: null, tablet: null, mobile: null });
    setCreativeCrop(null);
    setPlacements([]);
    setRequestedStart("");
    setRequestedEnd("");
    setContactWhatsapp("");
  };

  return (
    <main className="push-ads-page">
      <header className="push-ads-header">
        <Link href="/" aria-label="MU Komik beranda"><BrandLogo linked={false} showName /></Link>
        <Link className="push-ads-back" href="/"><ArrowLeft size={16} /> Beranda</Link>
      </header>

      <section className="push-ads-hero">
        <p className="eyebrow"><Megaphone size={15} /> IKLAN DI MU KOMIK</p>
        <h1>Jangkau pembaca<br /><em>cerita Indonesia.</em></h1>
        <p>Ajukan kebutuhan iklan untuk komunitas pembaca MU Komik. Tim kami akan meninjau materi, lalu menghubungimu untuk membahas harga dan jadwal.</p>
        <div className="push-ads-process">
          <span><b>01</b> Kirim kebutuhan iklan</span>
          <span><b>02</b> Ditinjau tim MU Komik</span>
          <span><b>03</b> Diskusikan penayangan</span>
        </div>
        <a className="push-ads-hero-action" href="#ad-request">Mulai pengajuan <ArrowRight size={16} /></a>
      </section>

      <section className="push-ads-content">
        <div className="push-ads-form-column">
          <div className="push-ads-section-heading" id="ad-request">
            <p className="eyebrow">MULAI PENGAJUAN</p>
            <h2>Ceritakan kampanyemu</h2>
            <p>Pengajuan ini belum menjadi iklan aktif. Tidak ada biaya yang dikenakan saat mengirim formulir.</p>
          </div>
          {loading ? <p className="push-ads-message" role="status">Memeriksa akun...</p>
            : !userId ? <div className="push-ads-login-card">
                <h3>Masuk untuk mengajukan iklan</h3>
                <p>Pengajuan dan status tinjauan akan tersimpan di akun MU Komik-mu.</p>
                <Link className="button button-dark" href="/login">Masuk atau buat akun <ArrowRight size={16} /></Link>
              </div>
              : !requestTableReady ? <div className="push-ads-login-card" role={errorMessage.includes("belum aktif") ? "status" : "alert"}>
                <h3>Formulir belum tersedia</h3>
                <p>{errorMessage || "Riwayat pengajuan belum dapat dimuat. Muat ulang halaman untuk mencoba kembali."}</p>
              </div>
              : <form className="push-ads-form" onSubmit={(event) => void submitRequest(event)}>
                {errorMessage && <p className="push-ads-alert" role="alert">{errorMessage}</p>}
                {successMessage && <p className="push-ads-success" role="status">{successMessage}</p>}
                <section className="push-ads-form-section" aria-labelledby="push-ads-campaign-heading">
                  <div className="push-ads-form-section-heading"><span>01</span><div><h3 id="push-ads-campaign-heading">Tentang kampanye</h3><p>Jelaskan produk atau layanan yang ingin kamu promosikan.</p></div></div>
                  <label className="push-ads-field">
                    <span>Nama kampanye atau produk</span>
                    <input value={campaignTitle} onChange={(event) => setCampaignTitle(event.target.value)} maxLength={120} autoComplete="off" placeholder="Contoh: Koleksi terbaru Kopi Senja" required />
                  </label>
                  <label className="push-ads-field">
                    <span>Deskripsi dan audiens yang ingin dijangkau</span>
                    <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={4} placeholder="Ceritakan pesan iklan dan siapa yang ingin kamu jangkau." required />
                    <small className="push-ads-character-count">{description.length}/500</small>
                  </label>
                  <label className="push-ads-field">
                    <span>URL tujuan iklan</span>
                    <input type="url" value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} maxLength={2000} placeholder="https://contoh.id" required />
                    <small>Halaman yang dibuka pembaca saat memilih iklan.</small>
                  </label>
                </section>

                <section className="push-ads-form-section" aria-labelledby="push-ads-placement-heading">
                  <div className="push-ads-form-section-heading"><span>02</span><div><h3 id="push-ads-placement-heading">Penempatan dan jadwal</h3><p>Pilih lokasi yang diminati. Tim akan mengonfirmasi ketersediaannya.</p></div></div>
                  <fieldset className="push-ads-placement-fieldset">
                    <legend>Lokasi iklan <small>Pilih satu atau lebih</small></legend>
                    <div className="push-ads-placement-options">
                      {placementOptions.map((placement) => (
                        <label key={placement.value}>
                          <input type="checkbox" checked={placements.includes(placement.value)} onChange={() => togglePlacement(placement.value)} />
                          <span>{placement.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="push-ads-field-grid">
                    <label className="push-ads-field">
                      <span>Perkiraan mulai <small>Opsional</small></span>
                      <input type="date" value={requestedStart} onChange={(event) => setRequestedStart(event.target.value)} />
                    </label>
                    <label className="push-ads-field">
                      <span>Perkiraan selesai <small>Opsional</small></span>
                      <input type="date" value={requestedEnd} onChange={(event) => setRequestedEnd(event.target.value)} min={requestedStart || undefined} />
                    </label>
                  </div>
                </section>

                <section className="push-ads-form-section" aria-labelledby="push-ads-creative-heading">
                  <div className="push-ads-form-section-heading"><span>03</span><div><h3 id="push-ads-creative-heading">Materi iklan</h3><p>Unggah gambar terpisah agar materi tampil pas di desktop, tablet, dan mobile.</p></div></div>
                  <ImageSizeGuide
                    includesHomeBanner={placements.includes("home_banner")}
                    includesOtherPlacements={placements.some((placement) => placement !== "home_banner")}
                    includesEpisodeTransition={placements.includes("reader_episode_transition")}
                  />
                  <div className="push-ads-upload-grid">
                    {creativeDevices.map(({ value }) => {
                      const includesHomeBanner = placements.includes("home_banner");
                      const size = value === "desktop"
                        ? placements.includes("reader_episode_transition") && !includesHomeBanner ? "1200 × 1000 px" : includesHomeBanner ? "1200 × 400 px" : "1200 × 600 px"
                        : value === "tablet"
                          ? includesHomeBanner ? "768 × 360 px" : "900 × 600 px"
                          : includesHomeBanner ? "720 × 480 px" : "720 × 900 px";
                      return <CreativeUploadField key={value} device={value} asset={creativeFiles[value]} size={`${size} · crop sebelum unggah`} onSelect={startCreativeCrop} onRemove={(device) => updateCreativeFile(device, null)} />;
                    })}
                  </div>
                  <small className="push-ads-upload-help">Pilih gambar untuk mengatur crop dan pratinjau. Hasil diproses di perangkat, maksimal 5 MB per gambar. Gambar sumber maksimal 25 MB.</small>
                </section>

                <section className="push-ads-form-section" aria-labelledby="push-ads-contact-heading">
                  <div className="push-ads-form-section-heading"><span>04</span><div><h3 id="push-ads-contact-heading">Kontak pengiklan</h3><p>Gunakan kontak aktif agar tim MU Komik dapat menindaklanjuti pengajuan.</p></div></div>
                  <div className="push-ads-field-grid">
                    <label className="push-ads-field">
                      <span>Nama bisnis atau pengiklan</span>
                      <input value={advertiserName} onChange={(event) => setAdvertiserName(event.target.value)} maxLength={120} autoComplete="organization" required />
                    </label>
                    <label className="push-ads-field">
                      <span>Email kontak</span>
                      <input type="email" autoComplete="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={254} required />
                    </label>
                  </div>
                  <label className="push-ads-field">
                    <span>WhatsApp <small>Opsional</small></span>
                    <input type="tel" autoComplete="tel" value={contactWhatsapp} onChange={(event) => setContactWhatsapp(event.target.value)} maxLength={40} placeholder="+62..." />
                  </label>
                </section>

                <div className="push-ads-form-footer">
                  <p className="push-ads-privacy-note">Pengajuan belum aktif dan belum dikenakan biaya. Tim kami akan menghubungi melalui email untuk membahas materi, harga, dan jadwal sebelum iklan tayang.</p>
                  <button className="button button-dark push-ads-submit" type="submit" disabled={saving}>
                    {saving ? "Mengirim pengajuan..." : "Kirim pengajuan"} <Send size={16} />
                  </button>
                </div>
              </form>}
        </div>

        <aside className="push-ads-side">
          <PushAdsPreview
            advertiserName={advertiserName}
            campaignTitle={campaignTitle}
            description={description}
            creativeFiles={creativeFiles}
            placements={placements}
          />
          <article className="push-ads-guidance">
            <span className="push-ads-guidance-icon"><Plus size={19} /></span>
            <h3>Belum ada biaya di tahap pengajuan</h3>
            <p>Tim kami akan menghubungi untuk membicarakan format yang tersedia, harga, materi, dan jadwal. Iklan hanya tayang setelah disetujui dan kampanyenya disiapkan.</p>
          </article>
          {userId && <section className="push-ads-request-history" aria-labelledby="push-ads-history-title">
            <div className="push-ads-section-heading">
              <p className="eyebrow">AKUN PENGIKLAN</p>
              <h2 id="push-ads-history-title">Pengajuan saya</h2>
              {accountEmail && <p>{accountEmail}</p>}
            </div>
            {requests.length ? requests.map((request) => (
              <article className="push-ads-request-card" key={request.id}>
                <div className="push-ads-request-card-heading">
                  <strong>{request.campaign_title}</strong>
                  <span className={`push-ads-status push-ads-status-${request.status}`}>{statusLabels[request.status]}</span>
                </div>
                <small>Dikirim {formatDate(request.created_at)}</small>
                {request.requested_start && <small>Perkiraan tayang: {formatDate(request.requested_start)}{request.requested_end ? ` – ${formatDate(request.requested_end)}` : ""}</small>}
                {request.admin_note && <p><b>Catatan tim:</b> {request.admin_note}</p>}
              </article>
            )) : !loading && <p className="push-ads-empty">Belum ada pengajuan. Isi formulir untuk memulai.</p>}
          </section>}
        </aside>
      </section>

      <footer className="push-ads-footer"><BrandLogo linked={false} /><span>© 2026 MU Komik</span></footer>
      {creativeCrop && <ImageCropDialog
        file={creativeCrop.file}
        title={`Crop materi iklan · ${creativeDevices.find((item) => item.value === creativeCrop.device)?.label ?? creativeCrop.device}`}
        aspectRatio={creativeCrop.width / creativeCrop.height}
        outputWidth={creativeCrop.width}
        outputHeight={creativeCrop.height}
        maxSourceBytes={maxCreativeSourceSize}
        maxOutputBytes={maxCreativeSize}
        onCancel={() => setCreativeCrop(null)}
        onComplete={(file) => {
          updateCreativeFile(creativeCrop.device, file);
          setCreativeCrop(null);
        }}
      />}
    </main>
  );
}
