"use client";

import { useRef, useState } from "react";
import { Copy, ExternalLink, Share2, X } from "lucide-react";

export default function ShareProfileButton({ creatorName }: { creatorName: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [message, setMessage] = useState("");
  const shareUrlRef = useRef<HTMLTextAreaElement>(null);
  const shareText = `Lihat profil kreator ${creatorName} di MU Komik`;

  const shareProfile = async () => {
    setMessage("");
    const url = window.location.href;
    setShareUrl(url);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Profil ${creatorName} — MU Komik`,
          text: shareText,
          url,
        });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Unable to open the native profile share dialog:", error);
      }
    }
    setDialogOpen(true);
  };

  const copyProfileUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setMessage("Tautan profil berhasil disalin.");
        setDialogOpen(false);
        return;
      }
    } catch (error) {
      console.error("Clipboard API could not copy the creator profile URL:", error);
    }
    shareUrlRef.current?.focus();
    shareUrlRef.current?.select();
    setMessage("Tautan dipilih. Salin dengan menekan Ctrl+C atau tahan lalu pilih Salin.");
  };

  const whatsappText = `${shareText}: ${shareUrl}`;

  return (
    <>
      <div className="creator-profile-share">
        <button className="reader-detail-action creator-profile-share-button" type="button" onClick={() => void shareProfile()}>
          <Share2 size={17} /> Bagikan
        </button>
        {message && <span className="creator-profile-share-status" role="status">{message}</span>}
      </div>
      {dialogOpen && (
        <div className="reader-share-backdrop" role="presentation" onClick={() => setDialogOpen(false)}>
          <section
            className="reader-share-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="creator-share-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="reader-share-close" type="button" aria-label="Tutup pilihan berbagi" onClick={() => setDialogOpen(false)}>
              <X size={19} />
            </button>
            <p className="reader-section-kicker">BAGIKAN PROFIL</p>
            <h2 id="creator-share-title">Bagikan profil kreator</h2>
            <p className="reader-share-description">{creatorName} · MU Komik</p>
            <textarea
              ref={shareUrlRef}
              className="reader-share-url"
              aria-label="Tautan profil"
              readOnly
              value={shareUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="reader-share-actions">
              <button className="reader-primary-button" type="button" onClick={() => void copyProfileUrl()}>
                <Copy size={17} /> Salin tautan
              </button>
              <a
                className="reader-detail-action"
                href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={17} /> Bagikan via WhatsApp
              </a>
            </div>
            {message && <p className="reader-detail-action-message" role="status">{message}</p>}
          </section>
        </div>
      )}
    </>
  );
}
