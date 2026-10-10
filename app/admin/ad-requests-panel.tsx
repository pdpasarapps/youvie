"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronRight, ExternalLink, Image as ImageIcon, LoaderCircle, Monitor, Save, Smartphone, Tablet } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type AdStatus = "pending" | "contacted" | "approved" | "rejected";
type CreativeDevice = "desktop" | "tablet" | "mobile";
type AdRequest = {
  id: string;
  advertiser_name: string;
  contact_email: string;
  contact_whatsapp: string | null;
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
const isAdRequestSchemaError = (code: string) => ["42P01", "42703", "PGRST204", "PGRST205"].includes(code);
const statusLabels: Record<AdStatus, string> = {
  pending: "Menunggu tinjauan",
  contacted: "Sudah dihubungi",
  approved: "Disetujui",
  rejected: "Ditolak",
};
const placementLabels: Record<string, string> = {
  home_banner: "Banner beranda",
  catalog_grid_native: "Katalog komik",
  comic_detail_sponsor: "Detail komik",
  reader_mid_chapter: "Di sela halaman baca",
  reader_episode_transition: "Antar episode",
};
const creativeDevices: { value: CreativeDevice; label: string; icon: typeof Monitor }[] = [
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "tablet", label: "Tablet", icon: Tablet },
  { value: "mobile", label: "Mobile", icon: Smartphone },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function publishCampaignsFromRequest(request: AdRequest) {
  const { data: slots, error: slotsError } = await supabase
    .from("ad_slots")
    .select("id, slot_key, is_active")
    .in("slot_key", request.placements);
  if (slotsError) throw slotsError;

  const availableSlots = slots ?? [];
  const missingPlacements = request.placements.filter(
    (placement) => !availableSlots.some((slot) => slot.slot_key === placement),
  );
  if (missingPlacements.length) {
    throw new Error(`Slot iklan belum tersedia: ${missingPlacements.map((key) => placementLabels[key] ?? key).join(", ")}.`);
  }
  const inactiveSlots = availableSlots.filter((slot) => !slot.is_active);
  if (inactiveSlots.length) {
    throw new Error(`Aktifkan slot iklan berikut sebelum menyetujui: ${inactiveSlots.map((slot) => placementLabels[slot.slot_key] ?? slot.slot_key).join(", ")}.`);
  }

  const { data: existingCampaigns, error: existingError } = await supabase
    .from("sponsor_campaigns")
    .select("id, sponsor_name, title, description, destination_url, image_url, image_url_tablet, image_url_mobile, slot_id")
    .in("slot_id", availableSlots.map((slot) => slot.id));
  if (existingError) throw existingError;

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const startsOn = request.requested_start && request.requested_start > today ? request.requested_start : today;
  const endsOn = request.requested_end && request.requested_end >= startsOn
    ? request.requested_end
    : addDays(startsOn, 30);
  let publishedCount = 0;

  for (const slot of availableSlots) {
    const existingCampaign = (existingCampaigns ?? []).find((campaign) =>
      campaign.slot_id === slot.id
      && campaign.sponsor_name === request.advertiser_name
      && campaign.title === request.campaign_title
      && campaign.description === request.description
      && campaign.destination_url === request.destination_url
      && campaign.image_url === request.image_url
      && campaign.image_url_tablet === request.image_url_tablet
      && campaign.image_url_mobile === request.image_url_mobile,
    );

    const values = {
        sponsor_name: request.advertiser_name,
        title: request.campaign_title,
        description: request.description,
        destination_url: request.destination_url,
        image_url: request.image_url,
        image_url_tablet: request.image_url_tablet,
        image_url_mobile: request.image_url_mobile,
        slot_id: slot.id,
        starts_on: startsOn,
        ends_on: endsOn,
        status: "active",
        updated_at: new Date().toISOString(),
      };
    const result = existingCampaign
      ? await supabase.from("sponsor_campaigns").update(values).eq("id", existingCampaign.id)
      : await supabase.from("sponsor_campaigns").insert(values);
    if (result.error) throw result.error;
    publishedCount += 1;
  }
  return publishedCount;
}

function AdCreativePreview({ request }: { request: AdRequest }) {
  const [device, setDevice] = useState<CreativeDevice>("desktop");
  const images: Record<CreativeDevice, string | null> = {
    desktop: request.image_url,
    tablet: request.image_url_tablet,
    mobile: request.image_url_mobile,
  };
  const imageUrl = images[device];

  return (
    <section className="admin-ad-preview" aria-label="Pratinjau materi iklan">
      <div className="admin-ad-preview-heading">
        <div><p className="eyebrow">PRATINJAU MATERI</p><h4>Tampilan iklan</h4></div>
        <div className="admin-ad-preview-devices" aria-label="Pilih pratinjau perangkat">
          {creativeDevices.map(({ value, label, icon: DeviceIcon }) => (
            <button key={value} type="button" aria-pressed={device === value} onClick={() => setDevice(value)}>
              <DeviceIcon size={14} /><span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={`admin-ad-preview-frame admin-ad-preview-frame-${device}`}>
        {imageUrl ? (
          <a className="admin-ad-preview-image-link" href={imageUrl} target="_blank" rel="noreferrer" aria-label={`Buka materi iklan ${device} di tab baru`}>
            <Image src={imageUrl} alt={`Materi iklan ${device} untuk ${request.campaign_title}`} fill sizes="(max-width: 760px) 90vw, 720px" unoptimized />
            <span className="admin-ad-preview-open"><ExternalLink size={14} /> Buka gambar</span>
          </a>
        ) : (
          <div className="admin-ad-preview-missing" role="status">
            <ImageIcon size={22} />
            <strong>Materi {device} belum diunggah</strong>
            <span>Pengiklan dapat mengirim gambar terpisah untuk tiap perangkat.</span>
          </div>
        )}
      </div>
      <div className="admin-ad-preview-copy">
        <span>{request.advertiser_name}</span>
        <strong>{request.campaign_title}</strong>
        <p>{request.description}</p>
        <a href={request.destination_url} target="_blank" rel="noreferrer">Lihat tautan tujuan <ExternalLink size={13} /></a>
      </div>
      <div className="admin-ad-preview-placements">
        <span>Lokasi diminati</span>
        {request.placements.map((placement) => <b key={placement}>{placementLabels[placement] ?? placement}</b>)}
      </div>
    </section>
  );
}

function ReviewCard({ request, onUpdated }: { request: AdRequest; onUpdated: (request: AdRequest) => void }) {
  const [status, setStatus] = useState(request.status);
  const [adminNote, setAdminNote] = useState(request.admin_note);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const saveReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    if (status === "approved") {
      try {
        const publishedCount = await publishCampaignsFromRequest(request);
        const { error: updateError } = await supabase
          .from("ad_requests")
          .update({ status: "approved", admin_note: adminNote.trim(), updated_at: new Date().toISOString() })
          .eq("id", request.id);
        if (updateError) throw updateError;
        onUpdated({ ...request, status: "approved", admin_note: adminNote.trim() });
        setMessage(publishedCount
          ? `Pengajuan disetujui. ${publishedCount} kampanye diaktifkan untuk sistem iklan publik.`
          : "Pengajuan disetujui. Kampanyenya sudah aktif di sistem iklan publik.");
      } catch (publishError) {
        console.error("Unable to approve advertiser request and publish sponsor campaigns:", publishError);
        setMessage(publishError instanceof Error && (publishError.message.startsWith("Slot iklan belum tersedia:") || publishError.message.startsWith("Aktifkan slot iklan berikut"))
          ? publishError.message
          : "Kampanye gagal diaktifkan. Pastikan slot dan tabel sponsor_campaigns tersedia, lalu coba lagi.");
      }
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("ad_requests")
      .update({ status, admin_note: adminNote.trim(), updated_at: new Date().toISOString() })
      .eq("id", request.id)
      .select("id, advertiser_name, contact_email, contact_whatsapp, campaign_title, description, destination_url, image_url, image_url_tablet, image_url_mobile, placements, requested_start, requested_end, status, admin_note, created_at")
      .single();
    setSaving(false);
    if (error) {
      console.error("Unable to save advertiser request review:", error);
      setMessage("Perubahan gagal disimpan. Periksa koneksi dan izin database.");
      return;
    }
    onUpdated(data as AdRequest);
    setMessage("Tinjauan tersimpan.");
  };

  return (
    <article className="admin-ad-request-card">
      <header className="admin-ad-request-heading">
        <div><p className="eyebrow">{request.advertiser_name}</p><h3>{request.campaign_title}</h3></div>
        <span className={`request-status request-${status === "contacted" ? "pending" : status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending"}`}>{statusLabels[status]}</span>
      </header>
      <p className="admin-ad-request-description">{request.description}</p>
      <dl className="admin-ad-request-meta">
        <div><dt>Kontak</dt><dd><a href={`mailto:${request.contact_email}`}>{request.contact_email}</a>{request.contact_whatsapp && <a href={`https://wa.me/${request.contact_whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp · {request.contact_whatsapp}</a>}</dd></div>
        <div><dt>Lokasi diminati</dt><dd>{request.placements.map((placement) => placementLabels[placement] ?? placement).join(", ")}</dd></div>
        <div><dt>Tautan tujuan</dt><dd><a href={request.destination_url} target="_blank" rel="noreferrer">{request.destination_url} <ExternalLink size={13} /></a></dd></div>
        {(request.image_url || request.image_url_tablet || request.image_url_mobile) && <div><dt>Materi tersedia</dt><dd>{[
          ["Desktop", request.image_url],
          ["Tablet", request.image_url_tablet],
          ["Mobile", request.image_url_mobile],
        ].filter(([, imageUrl]) => imageUrl).map(([device]) => device).join(", ")}</dd></div>}
        <div><dt>Perkiraan jadwal</dt><dd>{request.requested_start ? `${formatDate(request.requested_start)}${request.requested_end ? ` – ${formatDate(request.requested_end)}` : ""}` : "Belum ditentukan"}</dd></div>
        <div><dt>Dikirim</dt><dd>{formatDate(request.created_at)}</dd></div>
      </dl>
      <AdCreativePreview request={request} />
      <form className="admin-ad-request-review" onSubmit={(event) => void saveReview(event)}>
        <label>Status pengajuan
          <select value={status} onChange={(event) => setStatus(event.target.value as AdStatus)}>
            {(Object.keys(statusLabels) as AdStatus[]).map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
          </select>
        </label>
        <label>Catatan untuk pengiklan
          <textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} maxLength={1000} rows={3} placeholder="Tulis tindak lanjut atau alasan keputusan..." />
        </label>
        <div className="admin-ad-request-actions">
          <button className="button button-dark" type="submit" disabled={saving}>
            {saving ? <><LoaderCircle className="spin" size={15} /> Menyimpan...</> : <><Save size={15} /> Simpan tinjauan</>}
          </button>
          {message && <small role={message.includes("gagal") ? "alert" : "status"}>{message}</small>}
        </div>
      </form>
    </article>
  );
}

export default function AdRequestsPanel() {
  const [requests, setRequests] = useState<AdRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const selectedRequest = requests.find((request) => request.id === selectedRequestId) ?? null;

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("ad_requests")
        .select("id, advertiser_name, contact_email, contact_whatsapp, campaign_title, description, destination_url, image_url, image_url_tablet, image_url_mobile, placements, requested_start, requested_end, status, admin_note, created_at")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) {
        if (isAdRequestSchemaError(error.code)) {
          console.warn("Advertiser request schema is outdated:", { code: error.code, message: error.message });
        } else {
          console.error("Unable to load advertiser requests for review:", error);
        }
        setErrorMessage(isAdRequestSchemaError(error.code)
          ? "Skema pengajuan iklan belum lengkap. Jalankan ulang supabase/ad-requests.sql di Supabase SQL Editor."
          : "Pengajuan iklan gagal dimuat. Periksa koneksi dan izin database.");
      } else {
        setRequests((data ?? []) as AdRequest[]);
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, []);

  if (loading) return <p className="admin-loading"><LoaderCircle className="spin" size={18} /> Memuat pengajuan iklan...</p>;
  if (errorMessage) return <p className="admin-settings-error" role="alert">{errorMessage}</p>;
  if (!requests.length) return <div className="admin-empty"><p>Belum ada pengajuan iklan.</p></div>;

  return (
    <div className="admin-ad-requests-list">
      <div className="admin-ad-requests-toolbar">
        <p className="admin-ad-requests-count">{requests.filter((request) => request.status === "pending").length} pengajuan menunggu tinjauan · {requests.length} total</p>
        {selectedRequest && <button className="admin-ad-requests-back" type="button" onClick={() => setSelectedRequestId(null)}><ArrowLeft size={15} /> Kembali ke daftar</button>}
      </div>
      {selectedRequest ? (
        <ReviewCard
          key={selectedRequest.id}
          request={selectedRequest}
          onUpdated={(updated) => setRequests((current) => current.map((item) => item.id === updated.id ? updated : item))}
        />
      ) : (
        <div className="admin-ad-request-list-cards" aria-label="Daftar pengajuan iklan">
          {requests.map((request) => (
            <button
              className="admin-ad-request-list-card"
              key={request.id}
              type="button"
              onClick={() => setSelectedRequestId(request.id)}
              aria-label={`Buka detail pengajuan ${request.campaign_title} dari ${request.advertiser_name}`}
            >
              <span className="admin-ad-request-list-card-main">
                <span className="admin-ad-request-list-card-copy">
                  <strong>{request.campaign_title}</strong>
                  <span>{request.advertiser_name} · {formatDate(request.created_at)}</span>
                </span>
                <span className={`request-status request-${request.status === "approved" ? "approved" : request.status === "rejected" ? "rejected" : "pending"}`}>{statusLabels[request.status]}</span>
              </span>
              <span className="admin-ad-request-list-card-bottom">
                <span>{request.placements.map((placement) => placementLabels[placement] ?? placement).join(" · ")}</span>
                <span className="admin-ad-request-list-card-action">Lihat detail <ChevronRight size={15} /></span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
