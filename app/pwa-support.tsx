"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Download, Share, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function PwaSupport() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIosInstallable, setIsIosInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [isAndroidInstallable, setIsAndroidInstallable] = useState(false);
  const [installInstructions, setInstallInstructions] = useState<"ios" | "android" | "android-manual" | "android-pending" | null>(null);
  const didInstallRef = useRef(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
        console.error("Unable to register the mu-komik service worker:", error);
      });
    }

    const userAgent = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(userAgent);
    const detectionFrame = window.requestAnimationFrame(() => {
      setIsStandalone(standalone);
      if (isIos && !standalone) setIsIosInstallable(true);
      if (isAndroid && !standalone) setIsAndroidInstallable(true);
    });

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      didInstallRef.current = true;
      setInstallPrompt(null);
      setIsIosInstallable(false);
      setIsAndroidInstallable(false);
      if (isAndroid) setInstallInstructions("android");
      setIsStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.cancelAnimationFrame(detectionFrame);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) {
      setInstallInstructions(/Android/i.test(navigator.userAgent) ? "android-manual" : "ios");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
      if (!didInstallRef.current) setInstallInstructions("android-pending");
    } else {
      setInstallPrompt(null);
    }
  };

  if ((isStandalone && !installInstructions) || (!installPrompt && !isIosInstallable && !isAndroidInstallable && !installInstructions)) return null;

  return (
    <>
      {!installInstructions ? (
        <aside className="pwa-install-card" aria-label="Pasang aplikasi mu-komik">
          <Image className="pwa-install-logo" src="/logo_mukomik.jpg" alt="" width={42} height={42} />
          <div className="pwa-install-copy"><strong>Baca lebih nyaman</strong><span>Pasang mu-komik di perangkatmu.</span></div>
          <button onClick={install}><Download size={16} /> Pasang</button>
          <button className="pwa-install-dismiss" aria-label="Tutup ajakan pemasangan" onClick={() => { setInstallPrompt(null); setIsIosInstallable(false); setIsAndroidInstallable(false); }}><X size={17} /></button>
        </aside>
      ) : (
        <div className="pwa-install-backdrop" role="presentation" onClick={() => setInstallInstructions(null)}>
          <section className="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title" onClick={(event) => event.stopPropagation()}>
            <button className="pwa-install-dialog-close" onClick={() => setInstallInstructions(null)} aria-label="Tutup petunjuk"><X size={19} /></button>
            <Image className="pwa-install-dialog-logo" src="/logo_mukomik.jpg" alt="Logo mu-komik" width={72} height={72} />
            <h2 id="pwa-install-title">{installInstructions === "ios" ? "Pasang mu-komik" : installInstructions === "android-manual" ? "Pasang lewat menu Chrome" : installInstructions === "android-pending" ? "Permintaan instalasi diterima" : "Chrome melaporkan instalasi selesai"}</h2>
            {installInstructions === "android" ? (
              <>
                <p>Pesan ini berasal dari Chrome; situs tidak dapat memastikan ikon sudah ditambahkan ke launcher.</p>
                <ol><li>Cari <strong>mu-komik</strong> di daftar aplikasi atau Setelan &gt; Aplikasi &gt; Kelola aplikasi.</li><li>Jika aplikasinya ada, tekan lama ikonnya untuk menambahkannya ke layar utama. Periksa juga pengaturan launcher atau aplikasi tersembunyi.</li><li>Jika tidak terdaftar, pastikan Chrome diperbarui lalu coba instal ulang dari menu Chrome <strong>⋮</strong>.</li></ol>
              </>
            ) : installInstructions === "android-pending" ? (
              <>
                <p>Chrome menerima permintaan pemasangan, tetapi belum mengonfirmasi bahwa aplikasi selesai dipasang.</p>
                <ol><li>Tunggu beberapa saat, lalu cari <strong>mu-komik</strong> di daftar aplikasi.</li><li>Jika tidak ditemukan, tutup Chrome dan coba lagi melalui menu <strong>⋮ &gt; Instal aplikasi</strong>.</li></ol>
              </>
            ) : installInstructions === "android-manual" ? (
              <>
                <p>Tombol pemasangan cepat Chrome tidak tersedia saat ini. Pastikan halaman dibuka langsung di Chrome, bukan peramban di dalam aplikasi lain.</p>
                <ol><li>Buka menu Chrome <strong>⋮</strong> lalu pilih <strong>Instal aplikasi</strong> jika tersedia.</li><li>Jika pilihan itu tidak muncul, perbarui Chrome, muat ulang situs, lalu periksa lagi menu tersebut.</li></ol>
              </>
            ) : installInstructions === "ios" ? (
              <>
                <p>Untuk membaca seperti aplikasi, tambahkan mu-komik ke Layar Utama:</p>
                <ol><li>Ketuk tombol <Share size={15} aria-label="Bagikan" /> <strong>Bagikan</strong> di Safari.</li><li>Pilih <strong>Tambahkan ke Layar Utama</strong>, lalu ketuk <strong>Tambah</strong>.</li></ol>
              </>
            ) : null}
            <button className="pwa-install-dialog-done" onClick={() => setInstallInstructions(null)}>Mengerti</button>
          </section>
        </div>
      )}
    </>
  );
}
