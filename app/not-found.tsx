import Image from "next/image";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";

export default function NotFound() {
  return (
    <main className="reader-detail-page reader-not-found-page">
      <nav className="reader-subnav">
        <BrandLogo className="wordmark reader-wordmark" showName />
        <Link className="reader-back-link" href="/">Jelajahi komik</Link>
      </nav>
      <section className="reader-detail-not-found">
        <Image
          className="reader-not-found-illustration"
          src="/notfound.png"
          alt="Pembaca komik kebingungan mencari halaman yang hilang"
          width={1536}
          height={1024}
          priority
          unoptimized
        />
        <h1>Halaman tidak ditemukan.</h1>
        <p>Tautan mungkin sudah berubah atau halaman yang kamu cari tidak tersedia.</p>
        <Link className="reader-primary-button" href="/">Kembali ke beranda</Link>
      </section>
    </main>
  );
}
