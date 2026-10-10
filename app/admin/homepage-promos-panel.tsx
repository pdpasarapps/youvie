"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Image as ImageIcon, LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type PromoStatus = "draft" | "active" | "paused";
type PromoImageField = "image_url" | "image_url_tablet" | "image_url_mobile";
type HomepagePromo = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  image_url: string;
  image_url_tablet: string | null;
  image_url_mobile: string | null;
  cta_label: string;
  destination_url: string;
  sort_order: number;
  starts_on: string;
  ends_on: string;
  status: PromoStatus;
};

type PromoForm = Omit<HomepagePromo, "id" | "image_url_tablet" | "image_url_mobile"> & {
  id: string;
  image_url_tablet: string;
  image_url_mobile: string;
};

const supabase = createClient();
const imageFields: { field: PromoImageField; label: string; recommendation: string }[] = [
  { field: "image_url", label: "Gambar desktop", recommendation: "1920 × 720 px" },
  { field: "image_url_tablet", label: "Gambar tablet (opsional)", recommendation: "1440 × 800 px" },
  { field: "image_url_mobile", label: "Gambar mobile (opsional)", recommendation: "900 × 1200 px" },
];

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function emptyPromo(): PromoForm {
  return {
    id: "",
    eyebrow: "",
    title: "",
    description: "",
    image_url: "",
    image_url_tablet: "",
    image_url_mobile: "",
    cta_label: "Selengkapnya",
    destination_url: "",
    sort_order: 0,
    starts_on: localDate(),
    ends_on: localDate(30),
    status: "draft",
  };
}

function errorMessage(code?: string) {
  if (code === "42P01" || code === "PGRST205") {
    return "Tabel promo beranda belum tersedia. Jalankan supabase/homepage-promos.sql di Supabase SQL Editor.";
  }
  if (code === "42501" || code === "PGRST301") {
    return "Akses ditolak. Pastikan akun memiliki peran admin dan kebijakan database sudah diterapkan.";
  }
  return "Promo beranda gagal dimuat atau disimpan. Periksa koneksi dan pengaturan database, lalu coba lagi.";
}

function isValidDestination(value: string) {
  if (value.startsWith("/") && !value.startsWith("//") && !/\s/.test(value)) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export default function HomepagePromosPanel() {
  const [promos, setPromos] = useState<HomepagePromo[]>([]);
  const [form, setForm] = useState<PromoForm>(emptyPromo);
  const [formVisible, setFormVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<PromoImageField | null>(null);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");

  const loadPromos = useCallback(async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from("homepage_promos")
      .select("id, eyebrow, title, description, image_url, image_url_tablet, image_url_mobile, cta_label, destination_url, sort_order, starts_on, ends_on, status")
      .order("sort_order")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Unable to load homepage promos:", { code: error.code, message: error.message, details: error.details, hint: error.hint });
      setMessage(errorMessage(error.code));
      return false;
    }
    setPromos((data ?? []) as HomepagePromo[]);
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await loadPromos();
      if (!cancelled) setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [loadPromos]);

  const startEdit = (promo: HomepagePromo) => {
    setForm({ ...promo, image_url_tablet: promo.image_url_tablet ?? "", image_url_mobile: promo.image_url_mobile ?? "" });
    setFormVisible(true);
    setMessage("");
  };

  const resetForm = () => {
    setForm(emptyPromo());
    setFormVisible(false);
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>, field: PromoImageField) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Format gambar harus JPG, PNG, atau WebP.");
      event.target.value = "";
      return;
    }

    setUploading(field);
    setMessage("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("Unable to check admin session before homepage promo image upload:", sessionError);
        throw new Error("Sesi admin tidak dapat diperiksa. Silakan masuk kembali.");
      }
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sesi admin berakhir. Silakan masuk kembali.");

      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/r2/campaign-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const result = await response.json() as { imageUrl?: string; error?: string };
      if (!response.ok || !result.imageUrl) throw new Error(result.error || `Upload gagal (HTTP ${response.status}).`);
      setForm((current) => ({ ...current, [field]: result.imageUrl! }));
      setMessage(`${imageFields.find((item) => item.field === field)?.label} berhasil diunggah.`);
    } catch (error) {
      console.error("Homepage promo image upload failed:", error);
      setMessage(error instanceof Error ? error.message : "Gambar promo gagal diunggah.");
    } finally {
      setUploading(null);
      event.target.value = "";
    }
  };

  const savePromo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const destination = form.destination_url.trim();
    if (!form.image_url.trim()) {
      setMessage("Unggah gambar desktop sebelum menyimpan promo.");
      return;
    }
    if (!isValidDestination(destination)) {
      setMessage("Tautan tujuan harus URL http(s) atau path internal seperti /promo.");
      return;
    }
    if (form.ends_on < form.starts_on) {
      setMessage("Tanggal selesai harus sama dengan atau setelah tanggal mulai.");
      return;
    }

    setSaving(true);
    setMessage("");
    const values = {
      eyebrow: form.eyebrow.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      image_url: form.image_url.trim(),
      image_url_tablet: form.image_url_tablet.trim() || null,
      image_url_mobile: form.image_url_mobile.trim() || null,
      cta_label: form.cta_label.trim(),
      destination_url: destination,
      sort_order: Number(form.sort_order),
      starts_on: form.starts_on,
      ends_on: form.ends_on,
      status: form.status,
    };
    const result = form.id
      ? await supabase.from("homepage_promos").update(values).eq("id", form.id)
      : await supabase.from("homepage_promos").insert(values);
    if (result.error) {
      console.error("Unable to save homepage promo:", { code: result.error.code, message: result.error.message, details: result.error.details, hint: result.error.hint });
      setMessage(errorMessage(result.error.code));
    } else {
      const reloaded = await loadPromos();
      if (reloaded) setMessage("Promo beranda berhasil disimpan.");
      resetForm();
    }
    setSaving(false);
  };

  const deletePromo = async (promo: HomepagePromo) => {
    if (!window.confirm(`Hapus promo "${promo.title}"?`)) return;
    setWorkingId(promo.id);
    const { error } = await supabase.from("homepage_promos").delete().eq("id", promo.id);
    if (error) {
      console.error("Unable to delete homepage promo:", { code: error.code, message: error.message, details: error.details, hint: error.hint });
      setMessage(errorMessage(error.code));
    } else {
      setPromos((current) => current.filter((item) => item.id !== promo.id));
      setMessage("Promo berhasil dihapus.");
      if (form.id === promo.id) resetForm();
    }
    setWorkingId("");
  };

  if (loading) return <div className="ads-panel-loading"><LoaderCircle className="spin" size={20} /> Memuat promo beranda...</div>;

  return (
    <div className="ads-management-panel">
      {message && <p className="admin-message" role={message.includes("berhasil") ? "status" : "alert"}>{message}</p>}
      <section className="ads-management-card" aria-labelledby="homepage-promos-title">
        <div className="admin-section-heading">
          <div><p className="eyebrow">Konten beranda</p><h2 id="homepage-promos-title">Hero & promo</h2><p>Atur slide promosi independen dari katalog komik. Urutan terkecil tampil lebih dahulu.</p></div>
          {!formVisible && <button className="approve-button" type="button" onClick={() => { setForm(emptyPromo()); setFormVisible(true); setMessage(""); }}><Plus size={15} /> Tambah promo</button>}
        </div>

        {formVisible && <form className="ads-form homepage-promo-form" onSubmit={savePromo}>
          <h3>{form.id ? "Ubah promo beranda" : "Promo baru"}</h3>
          <div className="ads-form-two-columns">
            <label>Label kecil (opsional)<input value={form.eyebrow} maxLength={80} onChange={(event) => setForm((current) => ({ ...current, eyebrow: event.target.value }))} placeholder="PROMO SPESIAL" /></label>
            <label>Judul<input required value={form.title} maxLength={120} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
          </div>
          <label>Deskripsi<textarea value={form.description} maxLength={500} rows={3} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
          <div className="ads-form-two-columns">
            <label>Teks tombol<input value={form.cta_label} maxLength={40} onChange={(event) => setForm((current) => ({ ...current, cta_label: event.target.value }))} placeholder="Selengkapnya" /></label>
            <label>Tautan tujuan<input required value={form.destination_url} onChange={(event) => setForm((current) => ({ ...current, destination_url: event.target.value }))} placeholder="/promo atau https://contoh.id" /></label>
          </div>
          <div className="ads-form-two-columns">
            {imageFields.map(({ field, label, recommendation }) => (
              <div className="ads-campaign-image-field" key={field}>
                <label htmlFor={`homepage-promo-${field}`}>{label}</label>
                <small>Ukuran yang disarankan: {recommendation}. JPG, PNG, atau WebP.</small>
                <input id={`homepage-promo-${field}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadImage(event, field)} disabled={uploading !== null} />
                {form[field] && <Image className="ads-campaign-image-preview" src={form[field]} alt={`Pratinjau ${label.toLocaleLowerCase("id-ID")}`} width={600} height={300} unoptimized />}
                {form[field] && <button className="admin-action-link" type="button" onClick={() => setForm((current) => ({ ...current, [field]: "" }))}><X size={14} /> Hapus gambar</button>}
                {uploading === field && <small><LoaderCircle className="spin" size={14} /> Mengunggah...</small>}
              </div>
            ))}
          </div>
          <div className="ads-form-two-columns">
            <label>Urutan tampil<input type="number" min={0} max={10000} value={form.sort_order} onChange={(event) => setForm((current) => ({ ...current, sort_order: Number(event.target.value) }))} /></label>
            <label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PromoStatus }))}><option value="draft">Draf</option><option value="active">Aktif</option><option value="paused">Dijeda</option></select></label>
            <label>Tanggal mulai<input required type="date" value={form.starts_on} onChange={(event) => setForm((current) => ({ ...current, starts_on: event.target.value }))} /></label>
            <label>Tanggal selesai<input required type="date" value={form.ends_on} onChange={(event) => setForm((current) => ({ ...current, ends_on: event.target.value }))} /></label>
          </div>
          <div className="ads-form-actions">
            <button className="approve-button" type="submit" disabled={saving || uploading !== null}><Save size={15} /> {saving ? "Menyimpan..." : "Simpan promo"}</button>
            <button className="admin-action-link" type="button" onClick={resetForm}><X size={14} /> Batal</button>
          </div>
        </form>}

        {promos.length ? <ul className="homepage-promo-list">
          {promos.map((promo) => (
            <li key={promo.id}>
              <Image src={promo.image_url} alt="" width={600} height={225} unoptimized />
              <div className="homepage-promo-item-copy">
                <strong>{promo.title}</strong>
                <small>{promo.eyebrow || "Tanpa label"} · Urutan {promo.sort_order} · {promo.starts_on} s.d. {promo.ends_on}</small>
                <span className={`request-status request-status-${promo.status}`}>{promo.status === "active" ? "Aktif" : promo.status === "paused" ? "Dijeda" : "Draf"}</span>
              </div>
              <div className="ads-item-actions">
                <button className="admin-action-link" type="button" onClick={() => startEdit(promo)}><Pencil size={14} /> Ubah</button>
                <button className="admin-action-link admin-action-danger" type="button" onClick={() => void deletePromo(promo)} disabled={workingId === promo.id}><Trash2 size={14} /> Hapus</button>
              </div>
            </li>
          ))}
        </ul> : <div className="ads-empty-state"><ImageIcon size={22} /><p>Belum ada promo. Tambahkan slide untuk menggantikan hero komik di beranda.</p></div>}
      </section>
    </div>
  );
}
