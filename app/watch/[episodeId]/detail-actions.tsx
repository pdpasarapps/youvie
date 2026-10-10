"use client";

import { useEffect, useState } from "react";
import { Bookmark, Check, Share2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export default function DramaDetailActions({ seriesId, title }: { seriesId: string; title: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [favoriteAvailable, setFavoriteAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const loadFavorite = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("Unable to check viewer session before loading drama favorite:", sessionError);
        if (active) setMessage("Status favorit belum dapat dimuat.");
        return;
      }
      const viewer = sessionData.session?.user;
      if (!viewer || !active) return;
      setUserId(viewer.id);

      const { data, error } = await supabase
        .from("drama_favorites")
        .select("series_id")
        .eq("user_id", viewer.id)
        .eq("series_id", seriesId)
        .maybeSingle();
      if (error) {
        console.error("Unable to load drama favorite:", error);
        if (active) setMessage("Favorit belum tersedia. Periksa konfigurasi library drama.");
        return;
      }
      if (active) {
        setSaved(Boolean(data));
        setFavoriteAvailable(true);
      }
    };
    void loadFavorite();
    return () => {
      active = false;
    };
  }, [seriesId]);

  const toggleFavorite = async () => {
    if (!userId || !favoriteAvailable || busy) return;
    setBusy(true);
    setMessage("");
    const query = saved
      ? supabase.from("drama_favorites").delete().eq("user_id", userId).eq("series_id", seriesId)
      : supabase.from("drama_favorites").insert({ user_id: userId, series_id: seriesId });
    const { error } = await query;
    if (error) {
      console.error("Unable to update drama favorite:", { error, seriesId });
      setMessage("Favorit gagal disimpan. Coba lagi.");
    } else {
      setSaved(!saved);
    }
    setBusy(false);
  };

  const shareDrama = async () => {
    setMessage("");
    try {
      const shareData = { title, text: `Tonton ${title} di Youvie`, url: window.location.href };
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setMessage("Tautan drama disalin.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("Unable to share drama:", error);
      setMessage("Tautan drama tidak dapat dibagikan.");
    }
  };

  return (
    <div className="drama-detail-actions">
      {userId ? (
        <button
          className={`drama-detail-secondary-action${saved ? " is-saved" : ""}`}
          type="button"
          disabled={!favoriteAvailable || busy}
          aria-pressed={saved}
          onClick={() => void toggleFavorite()}
        >
          {saved ? <Check size={18} /> : <Bookmark size={18} />}
          <span>{saved ? "Tersimpan" : "Simpan"}</span>
        </button>
      ) : (
        <Link className="drama-detail-secondary-action" href="/login">
          <Bookmark size={18} /><span>Simpan</span>
        </Link>
      )}
      <button className="drama-detail-secondary-action" type="button" onClick={() => void shareDrama()}>
        <Share2 size={18} /><span>Bagikan</span>
      </button>
      {message && <span className="drama-detail-action-message" role="status">{message}</span>}
    </div>
  );
}
