"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import { ArrowUpRight, BookOpen, Eye, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { COMIC_GENRES, getComicGenreLabel } from "@/lib/comic-genres";
import { COMIC_LANGUAGES, ORIGIN_TYPES, PRODUCTION_TECHNIQUES, STORY_STATUSES, TARGET_AUDIENCES } from "@/lib/comic-metadata";
import { COMIC_TARGET_DEVICES, type ComicTargetDevice } from "@/lib/comic-target-device";
import { usePlatformSettings } from "../platform-runtime";

export type CreatorArea = "creator" | "komiku" | "terbitkan-komik";

type ComicStatus = "draft" | "pending_review" | "published" | "archived";
type Comic = { id: string; title: string; slug: string; genre: string; synopsis: string; contributor: string; cover_key: string | null; coverUrl: string | null; status: ComicStatus; created_at: string };
type ComicContributor = { role: string; name: string };

const supabase = createClient();
const comicStatusLabel: Record<ComicStatus, string> = {
  draft: "Draf",
  pending_review: "Menunggu kurasi",
  published: "Terbit",
  archived: "Diarsipkan",
};

export default function CreatorContent({ area }: { area: CreatorArea }) {
  const router = useRouter();
  const { settings } = usePlatformSettings();
  const [comics, setComics] = useState<Comic[]>([]);
  const [displayName, setDisplayName] = useState("Kreator");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingComicId, setSubmittingComicId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    title: "",
    genre: "Fantasy",
    synopsis: "",
    technique: "traditional_drawing",
    storyStatus: "ongoing",
    targetAudience: "all_ages",
    targetDevice: "all" as ComicTargetDevice,
    language: "id",
    otherLanguage: "",
    originType: "original",
    sourceInfo: "",
    contributors: [{ role: "Penulis", name: "" }] as ComicContributor[],
  });

  const loadCreator = useEffectEvent(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.replace("/login");
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("display_name, role").eq("id", userData.user.id).single();
    if (profile?.role !== "creator" && profile?.role !== "admin") {
      router.replace("/account");
      return;
    }
    setDisplayName(profile.display_name || "Kreator");
    setIsAdmin(profile.role === "admin");
    const query = supabase.from("comics").select("id, title, slug, genre, synopsis, contributor, cover_key, status, created_at").order("created_at", { ascending: false });
    const { data } = profile.role === "admin" ? await query : await query.eq("creator_id", userData.user.id);
    const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL;
    setComics((data ?? []).map((comic) => ({
      ...comic,
      coverUrl: comic.cover_key && publicUrl ? `${publicUrl.replace(/\/$/, "")}/${comic.cover_key}` : null,
    })));
    setLoading(false);
  });

  useEffect(() => {
    const timer = window.setTimeout(() => loadCreator(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const createComic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin && comics.length >= settings.max_comics_per_creator) {
      setMessage(`Batas ${settings.max_comics_per_creator} komik per kreator sudah tercapai.`);
      return;
    }
    const language = form.language === "other" ? form.otherLanguage.trim() : form.language;
    if (!language) {
      setMessage("Masukkan bahasa komik.");
      return;
    }
    if (form.originType === "adaptation" && !form.sourceInfo.trim()) {
      setMessage("Cantumkan sumber karya yang diadaptasi.");
      return;
    }
    const contributors = form.contributors.map((item) => ({ role: item.role.trim(), name: item.name.trim() }));
    if (!contributors.length || contributors.some((item) => !item.role || !item.name)) {
      setMessage("Isi peran dan nama untuk minimal satu kredit kreator.");
      return;
    }
    setSaving(true);
    setMessage("");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setMessage("Sesi berakhir. Silakan masuk kembali.");
      setSaving(false);
      return;
    }
    const slug = form.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slug) {
      setMessage("Judul harus memuat huruf atau angka agar dapat dibuat menjadi tautan komik.");
      setSaving(false);
      return;
    }
    const contributor = contributors.map((item) => `${item.role}: ${item.name}`).join(" · ");
    const { data, error } = await supabase.from("comics").insert({
      creator_id: userData.user.id,
      title: form.title.trim(),
      slug,
      genre: form.genre,
      synopsis: form.synopsis.trim(),
      contributor,
      contributors,
      production_technique: form.technique,
      story_status: form.storyStatus,
      target_audience: form.targetAudience,
      language,
      origin_type: form.originType,
      source_info: form.originType === "adaptation" ? form.sourceInfo.trim() : "",
      status: "draft",
      target_device: form.targetDevice,
    }).select("id, title, slug, genre, synopsis, contributor, cover_key, status, created_at").single();
    if (error) {
      setMessage(error.code === "23505"
        ? "Komik dengan judul ini sudah ada."
        : error.code === "42703"
          ? "Database belum mendukung target perangkat. Jalankan supabase/comic-target-device.sql terlebih dahulu."
          : error.message);
    } else {
      setComics((current) => [{ ...data, coverUrl: null }, ...current]);
      setForm({
        title: "",
        genre: "Fantasy",
        synopsis: "",
        technique: "traditional_drawing",
        storyStatus: "ongoing",
        targetAudience: "all_ages",
        targetDevice: "all",
        language: "id",
        otherLanguage: "",
        originType: "original",
        sourceInfo: "",
        contributors: [{ role: "Penulis", name: "" }],
      });
      setMessage("Komik berhasil dibuat.");
    }
    setSaving(false);
  };

  const updateContributor = (index: number, field: keyof ComicContributor, value: string) => {
    setForm((current) => ({
      ...current,
      contributors: current.contributors.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  };

  const addContributor = () => {
    setForm((current) => ({ ...current, contributors: [...current.contributors, { role: "", name: "" }] }));
  };

  const removeContributor = (index: number) => {
    setForm((current) => current.contributors.length <= 1
      ? current
      : { ...current, contributors: current.contributors.filter((_, itemIndex) => itemIndex !== index) });
  };

  const submitForReview = async (comic: Comic) => {
    setSubmittingComicId(comic.id);
    setMessage("");
    const nextStatus = settings.require_comic_review ? "pending_review" : "published";
    const { data, error } = await supabase
      .from("comics")
      .update({ status: nextStatus })
      .eq("id", comic.id)
      .eq("status", "draft")
      .select("id, status")
      .single();
    if (error) {
      console.error("Unable to submit comic for review:", error);
      setMessage("Komik gagal diajukan. Periksa koneksi dan coba lagi.");
    } else {
      setComics((current) => current.map((item) => item.id === data.id ? { ...item, status: nextStatus } : item));
      setMessage(settings.require_comic_review ? "Komik diajukan dan menunggu kurasi admin." : "Komik berhasil diterbitkan.");
    }
    setSubmittingComicId(null);
  };

  if (loading) return <div className="creator-content-loading"><LoaderCircle className="spin" size={24} /></div>;

  return (
    <div className="creator-content">
      <header className="creator-header">
        <div>
          <p className="eyebrow"><span /> {area === "komiku" ? "Koleksi kreator" : area === "terbitkan-komik" ? "Karya baru" : "Ruang Kreator"}</p>
          <h1>{area === "komiku" ? <>Komikku</> : area === "terbitkan-komik" ? <>Terbitkan<br /><em>komik baru.</em></> : <>Ciptakan kisah<br /><em>yang layak dibaca.</em></>}</h1>
          <p>{area === "komiku" ? "Kelola komik, bab, dan status kurasi karyamu." : area === "terbitkan-komik" ? "Mulai cerita baru dan lengkapi detail komik sebelum menambahkan bab." : `Selamat datang kembali, ${displayName}. Bangun duniamu dan terbitkan cerita untuk para pembaca.`}</p>
        </div>
        {area === "creator" && <Link className="button button-dark" href="/account/terbitkan-komik"><Plus size={17} /> Terbitkan komik</Link>}
        {area === "komiku" && <Link className="button button-dark" href="/account/terbitkan-komik"><Plus size={17} /> Komik baru</Link>}
      </header>
      {message && <p className="creator-message">{message}</p>}
      {area === "terbitkan-komik" && !isAdmin && comics.length >= settings.max_comics_per_creator && <p className="creator-message">Batas {settings.max_comics_per_creator} komik per kreator sudah tercapai. Kamu tetap bisa mengelola komik yang sudah ada.</p>}
      {area === "creator" && (
        <section className="creator-overview-cards">
          <Link href="/account/komiku"><BookOpen size={20} /><span><strong>{comics.length} komik</strong><small>Lihat dan kelola semua karyamu</small></span><ArrowUpRight size={17} /></Link>
          <Link href="/account/terbitkan-komik"><Plus size={20} /><span><strong>Mulai cerita baru</strong><small>Lengkapi detail dan buat komik</small></span><ArrowUpRight size={17} /></Link>
        </section>
      )}
      {area === "terbitkan-komik" && (
        <form className="comic-form" onSubmit={createComic}>
          <div className="form-heading">
            <div><p className="eyebrow">Mulai cerita baru</p><h2>Detail komik</h2></div>
            <Link className="form-close" href="/account/komiku" aria-label="Kembali ke Komikku">×</Link>
          </div>
          <label>Judul<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Judul komik" /></label>
          <label>Genre<select value={form.genre} onChange={(event) => setForm({ ...form, genre: event.target.value })}>{COMIC_GENRES.map((genre) => <option key={genre} value={genre}>{getComicGenreLabel(genre)}</option>)}</select></label>
          <label>Target perangkat<select value={form.targetDevice} onChange={(event) => setForm({ ...form, targetDevice: COMIC_TARGET_DEVICES.find((device) => device.value === event.target.value)?.value || "all" })}>{COMIC_TARGET_DEVICES.map((device) => <option key={device.value} value={device.value}>{device.label}</option>)}</select><small>{form.targetDevice === "all" ? "Komik akan tampil di semua perangkat." : `Komik hanya akan tampil dan dapat dibaca di ${COMIC_TARGET_DEVICES.find((device) => device.value === form.targetDevice)?.label.toLowerCase()}; komik tidak akan tampil di perangkat lain.`}</small></label>
          <label>Sinopsis<textarea required value={form.synopsis} onChange={(event) => setForm({ ...form, synopsis: event.target.value })} placeholder="Ceritakan tentang komik ini" rows={4} /></label>
          <fieldset className="comic-contributors-fieldset">
            <legend>Kredit kreator (minimal satu)</legend>
            <datalist id="new-comic-contributor-roles">
              <option value="Penulis" />
              <option value="Ilustrator" />
              <option value="Pewarna" />
              <option value="Penerjemah" />
              <option value="Inker" />
              <option value="Outline" />
              <option value="Coloring" />
              <option value="Editor" />
              <option value="Letterer" />
            </datalist>
            {form.contributors.map((item, index) => (
              <div className="comic-contributor-row" key={index}>
                <input
                  required
                  maxLength={60}
                  list="new-comic-contributor-roles"
                  aria-label={`Peran contributor ${index + 1}`}
                  placeholder="Peran, mis. Ilustrator"
                  value={item.role}
                  onChange={(event) => updateContributor(index, "role", event.target.value)}
                />
                <input
                  required
                  maxLength={120}
                  aria-label={`Nama contributor ${index + 1}`}
                  placeholder="Nama"
                  value={item.name}
                  onChange={(event) => updateContributor(index, "name", event.target.value)}
                />
                <button
                  type="button"
                  className="chapter-action chapter-action-danger"
                  aria-label={`Hapus contributor ${index + 1}`}
                  onClick={() => removeContributor(index)}
                  disabled={form.contributors.length === 1 || saving}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button type="button" className="button button-light contributor-add-button" onClick={addContributor} disabled={saving}>
              <Plus size={15} /> Tambah contributor
            </button>
          </fieldset>
          <label>Teknik produksi<select value={form.technique} onChange={(event) => setForm({ ...form, technique: event.target.value })}>{PRODUCTION_TECHNIQUES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Status cerita<select value={form.storyStatus} onChange={(event) => setForm({ ...form, storyStatus: event.target.value })}>{STORY_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Target pembaca<select value={form.targetAudience} onChange={(event) => setForm({ ...form, targetAudience: event.target.value })}>{TARGET_AUDIENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Bahasa<select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}>{COMIC_LANGUAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}<option value="other">Bahasa lainnya</option></select></label>
          {form.language === "other" && <label>Nama bahasa<input required maxLength={80} value={form.otherLanguage} onChange={(event) => setForm({ ...form, otherLanguage: event.target.value })} placeholder="Contoh: Bahasa Jawa" /></label>}
          <label>Asal karya<select value={form.originType} onChange={(event) => setForm({ ...form, originType: event.target.value })}>{ORIGIN_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          {form.originType === "adaptation" && <label>Sumber adaptasi<input required maxLength={500} value={form.sourceInfo} onChange={(event) => setForm({ ...form, sourceInfo: event.target.value })} placeholder="Judul dan pencipta karya sumber" /></label>}
          <p className="comic-form-note">Semua komik di mu-komik gratis untuk dibaca.</p>
          <button className="button button-dark" type="submit" disabled={saving || (!isAdmin && comics.length >= settings.max_comics_per_creator)}>{saving ? <><LoaderCircle className="spin" size={16} /> Menyimpan...</> : <>Buat komik <ArrowUpRight size={16} /></>}</button>
        </form>
      )}
      {area === "komiku" && <section className="creator-library">
        <div className="creator-section-heading">
          <div><p className="eyebrow">Koleksi komikmu</p><h2>{comics.length} komik</h2></div>
          <span>Kelola karyamu</span>
        </div>
        {comics.length === 0 ? (
          <div className="creator-empty"><BookOpen size={26} /><h3>Mulai buat cerita pertamamu.</h3><p>Buat komik untuk mulai menambahkan bab dan halaman.</p><Link className="text-link" href="/account/terbitkan-komik">Buat komik <ArrowUpRight size={15} /></Link></div>
        ) : (
          <div className="creator-comic-grid">
            {comics.map((comic) => (
              <article className="creator-comic-card" key={comic.id}>
                <div
                  className={`creator-comic-art status-${comic.status} ${comic.coverUrl ? "has-cover" : ""}`}
                >
                  {comic.coverUrl
                    ? <img className="creator-comic-cover" src={comic.coverUrl} alt={`Sampul ${comic.title}`} />
                    : <div role="img" aria-label={`Sampul ${comic.title}`}><span>{getComicGenreLabel(comic.genre)}</span><strong>{comic.title.slice(0, 2).toUpperCase()}</strong></div>}
                </div>
                <span className={`creator-comic-status status-${comic.status}`}>
                  {comicStatusLabel[comic.status]}
                </span>
                <div className="creator-comic-info">
                  <div><h3>{comic.title}</h3></div>
                </div>
                <div className="creator-comic-actions">
                  <Link className="creator-comic-action" href={`/comic/${comic.slug}`} aria-label={`Lihat komik: ${comic.title}`} title="Lihat komik"><Eye size={16} /></Link>
                  <Link className="creator-comic-action" href={`/account/komik/${comic.id}?edit=comic`} aria-label={`Edit detail: ${comic.title}`} title="Edit detail"><Pencil size={16} /></Link>
                  <Link className="creator-comic-action" href={`/account/komik/${comic.id}`} aria-label={`Kelola bab: ${comic.title}`} title="Kelola bab"><BookOpen size={16} /></Link>
                  {comic.status === "draft" && <button type="button" className="button button-dark comic-submit-button" onClick={() => submitForReview(comic)} disabled={submittingComicId === comic.id}>{submittingComicId === comic.id && <LoaderCircle className="spin" size={14} />} {settings.require_comic_review ? "Ajukan kurasi" : "Terbitkan komik"}</button>}
                  {comic.status === "pending_review" && <span className="comic-review-waiting">Menunggu kurasi</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>}
    </div>
  );
}
