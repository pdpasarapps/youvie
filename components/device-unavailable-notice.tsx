import Link from "next/link";

export default function DeviceUnavailableNotice({ deviceName }: { deviceName: string }) {
  return (
    <main className="reader-detail-page">
      <div className="reader-detail-not-found">
        <h1>Komik ini tidak tersedia di perangkat ini.</h1>
        <p>Kreator mengatur komik ini untuk dibaca di {deviceName}. Buka tautan ini dari perangkat yang sesuai untuk melanjutkan.</p>
        <Link className="reader-detail-secondary-link" href="/">Jelajahi komik</Link>
      </div>
    </main>
  );
}
