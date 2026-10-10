"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getComicGenreLabel, isReaderInterestGenre, MAX_READER_INTEREST_GENRES, READER_INTEREST_GENRES } from "@/lib/reader-interests";

const supabase = createClient();

export default function ReaderPreferencesPanel() {
  const [preferredGenres, setPreferredGenres] = useState<string[]>([]);
  const [personalizedAdsConsent, setPersonalizedAdsConsent] = useState(false);
  const [initialConsent, setInitialConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const loadPreferences = async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          if (active) {
            console.error("Unable to identify reader while loading preferences:", userError);
            setMessage("Preferensi tidak dapat dimuat. Silakan masuk kembali.");
          }
          return;
        }

        const { data, error } = await supabase
          .from("reader_preferences")
          .select("preferred_genres, personalized_ads_consent")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (!active) return;
        if (error) {
          console.error("Unable to load reader preferences:", {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          });
          setMessage(error.code === "42P01" || error.code === "PGRST205"
            ? "Preferensi minat belum tersedia. Jalankan supabase/reader-profiling.sql di Supabase SQL Editor."
            : "Preferensi minat belum dapat dimuat. Coba muat ulang halaman.");
        } else {
          const genres = Array.isArray(data?.preferred_genres)
            ? data.preferred_genres.filter((genre: unknown): genre is string => typeof genre === "string" && isReaderInterestGenre(genre))
            : [];
          const consent = data?.personalized_ads_consent === true;
          setPreferredGenres(genres);
          setPersonalizedAdsConsent(consent);
          setInitialConsent(consent);
        }
      } catch (error) {
        if (active) {
          console.error("Unable to load reader preferences:", error);
          setMessage("Preferensi minat belum dapat dimuat. Coba muat ulang halaman.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadPreferences();
    return () => { active = false; };
  }, []);

  const toggleGenre = (genre: string) => {
    setPreferredGenres((current) => current.includes(genre)
      ? current.filter((item) => item !== genre)
      : current.length < MAX_READER_INTEREST_GENRES ? [...current, genre] : current);
  };

  const savePreferences = async (
    genresToSave = preferredGenres,
    consentToSave = personalizedAdsConsent,
  ) => {
    setSaving(true);
    setMessage("");
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        console.error("Unable to identify reader while saving preferences:", userError);
        setMessage("Sesi kamu berakhir. Silakan masuk kembali.");
        return;
      }
      const { error } = await supabase.from("reader_preferences").upsert({
        user_id: userData.user.id,
        preferred_genres: genresToSave,
        personalized_ads_consent: consentToSave,
        consent_updated_at: initialConsent === consentToSave ? undefined : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) {
        console.error("Unable to save reader preferences:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        setMessage(error.code === "42P01" || error.code === "PGRST205"
          ? "Preferensi minat belum tersedia. Jalankan supabase/reader-profiling.sql di Supabase SQL Editor."
          : "Preferensi minat gagal disimpan. Coba lagi.");
      } else {
        setPreferredGenres(genresToSave);
        setPersonalizedAdsConsent(consentToSave);
        setInitialConsent(consentToSave);
        setMessage("Preferensi minat berhasil disimpan.");
      }
    } catch (error) {
      console.error("Unable to save reader preferences:", error);
      setMessage("Preferensi minat gagal disimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="reader-preferences-panel" aria-labelledby="reader-preferences-title">
      <div className="reader-preferences-heading">
        <div>
          <p className="eyebrow">Personalisasi bacaan</p>
          <h3 id="reader-preferences-title">Minat membaca</h3>
          <p>Pilih hingga {MAX_READER_INTEREST_GENRES} genre. Pilihan ini bersifat pribadi dan dapat diubah kapan saja.</p>
        </div>
      </div>
      {loading ? <p role="status">Memuat preferensi...</p> : <>
        <fieldset className="reader-interest-options">
          <legend className="sr-only">Genre yang diminati</legend>
          {READER_INTEREST_GENRES.map((genre) => (
            <label className="reader-interest-option" key={genre}>
              <input
                type="checkbox"
                checked={preferredGenres.includes(genre)}
                onChange={() => toggleGenre(genre)}
                disabled={saving || (!preferredGenres.includes(genre) && preferredGenres.length >= MAX_READER_INTEREST_GENRES)}
              />
              <span>{getComicGenreLabel(genre)}</span>
            </label>
          ))}
        </fieldset>
        <label className="reader-interest-consent">
          <input
            type="checkbox"
            checked={personalizedAdsConsent}
            onChange={(event) => setPersonalizedAdsConsent(event.target.checked)}
            disabled={saving}
          />
          <span><strong>Izinkan iklan yang dipersonalisasi</strong><small>Jika dinonaktifkan, iklan tetap dapat disesuaikan dengan genre komik yang sedang kamu baca, tanpa menggunakan pilihan minat profilmu. Perubahan berlaku untuk tayangan berikutnya.</small></span>
        </label>
        {message && <p className="creator-profile-message" role={message.includes("gagal") || message.includes("tidak") ? "alert" : "status"}>{message}</p>}
        <div className="reader-preferences-actions">
          <button type="button" className="button button-dark" onClick={() => void savePreferences()} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan preferensi"}
          </button>
          <button type="button" className="button button-light" onClick={() => void savePreferences([], false)} disabled={saving || (!preferredGenres.length && !personalizedAdsConsent)}>
            Hapus minat dan nonaktifkan personalisasi
          </button>
        </div>
      </>}
    </section>
  );
}
