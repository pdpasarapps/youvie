import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import BrandLogo from "@/components/brand-logo";
import { siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Manifesto AI MU-KOMIK",
  description: "AI untuk bercerita. Manusia untuk menciptakan makna. Manifesto MU-KOMIK tentang kreativitas, teknologi, dan masa depan komik.",
  alternates: { canonical: new URL("/manifesto", siteUrl).toString() },
  openGraph: {
    title: "Manifesto AI MU-KOMIK",
    description: "AI untuk bercerita. Manusia untuk menciptakan makna.",
    url: new URL("/manifesto", siteUrl).toString(),
  },
};

const principles = [
  {
    title: "Kreativitas tetap milik manusia",
    paragraphs: [
      <>Ide, sudut pandang, karakter, emosi, humor, dan pesan sebuah cerita berasal dari kreator.</>,
      <>AI adalah alat.</>,
      <>Kreator tetap menjadi pengarah, pengambil keputusan, dan pemilik visi kreatif.</>,
    ],
  },
  {
    title: "AI mempercepat, bukan menggantikan",
    paragraphs: [
      <>Kami menggunakan AI untuk membantu proses yang melelahkan dan memakan waktu:</>,
      <strong key="workflow">ide → naskah → storyboard → visual → produksi → publikasi</strong>,
      <>Dengan AI, kreator dapat bereksperimen lebih cepat, mencoba lebih banyak kemungkinan, dan memiliki lebih banyak waktu untuk fokus pada hal yang paling penting: <strong>bercerita.</strong></>,
    ],
  },
  {
    title: "Cerita harus tetap manusiawi",
    paragraphs: [
      <>Teknologi boleh semakin canggih. Tetapi cerita tidak boleh kehilangan jiwa.</>,
      <>Kami percaya komik yang baik bukan hanya tentang gambar yang indah. Ia tentang karakter yang terasa hidup. Tentang dialog yang terasa dekat. Tentang humor yang mengena. Tentang cerita yang membuat pembaca berkata:</>,
      <strong key="quote">“Ini gue banget.”</strong>,
    ],
  },
  {
    title: "AI bukan alasan untuk meniru",
    paragraphs: [
      <>Kami mendorong kreator untuk membangun identitas visual dan cerita mereka sendiri.</>,
      <>AI seharusnya membuka ruang eksplorasi, bukan menjadi jalan pintas untuk menyalin karya orang lain.</>,
      <strong key="originality">Terinspirasi boleh. Meniru bukan tujuan. Menjadi orisinal adalah perjalanan.</strong>,
    ],
  },
  {
    title: "Transparansi adalah bagian dari karya",
    paragraphs: [
      <>Kami percaya pembaca berhak mengetahui bagaimana sebuah karya dibuat. Penggunaan AI tidak perlu disembunyikan.</>,
      <>AI adalah bagian dari proses kreatif modern, sebagaimana kamera, komputer, software gambar, dan alat produksi lainnya.</>,
      <>Yang penting adalah: <strong>siapa yang memiliki visi, siapa yang bertanggung jawab, dan apa yang ingin disampaikan.</strong></>,
    ],
  },
  {
    title: "Kreator tetap memegang kendali",
    paragraphs: [
      <>AI boleh memberikan pilihan. AI boleh memberikan saran. AI boleh membantu membuat sesuatu.</>,
      <>Tetapi keputusan terakhir tetap berada di tangan kreator.</>,
      <strong key="control">Kreator menentukan cerita. Kreator menentukan karakter. Kreator menentukan arah. Kreator menentukan kapan sebuah karya selesai.</strong>,
    ],
  },
  {
    title: "Teknologi harus membuka kesempatan",
    paragraphs: [
      <>Kami ingin teknologi membuat dunia komik menjadi lebih terbuka.</>,
      <>Seseorang yang tidak memiliki studio besar tetap bisa membuat serial. Seseorang yang bekerja sendirian tetap bisa membangun dunia. Seseorang dengan ide sederhana tetap memiliki kesempatan untuk menemukan pembacanya.</>,
      <strong key="opportunity">Bukan hanya mereka yang memiliki modal besar. Tetapi siapa pun yang memiliki cerita.</strong>,
    ],
  },
];

export default function ManifestoPage() {
  return (
    <main className="manifesto-page">
      <nav className="manifesto-nav" aria-label="Navigasi halaman">
        <BrandLogo linked showName />
        <Link href="/" className="manifesto-back"><ArrowLeft size={16} /> Beranda</Link>
      </nav>

      <header className="manifesto-hero">
        <p className="manifesto-eyebrow">PANDANGAN KAMI TENTANG MASA DEPAN KOMIK</p>
        <h1>Manifesto AI<br /><em>MU-KOMIK</em></h1>
        <p className="manifesto-lead">AI untuk bercerita.<br /><strong>Manusia untuk menciptakan makna.</strong></p>
        <div className="manifesto-origin">
          <p>Kami percaya setiap komik lahir dari sebuah gagasan.</p>
          <p>Dari pengalaman. Dari imajinasi. Dari kegelisahan. Dari tawa. Dari kehidupan sehari-hari.</p>
          <p>AI hadir bukan untuk mengambil alih cerita itu.</p>
          <strong>AI hadir untuk membantu kreator mewujudkannya.</strong>
        </div>
      </header>

      <section className="manifesto-principles" aria-label="Prinsip manifesto">
        {principles.map((principle, index) => (
          <article className="manifesto-principle" key={principle.title}>
            <span className="manifesto-number">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{principle.title}</h2>
              {principle.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={`${principle.title}-${paragraphIndex}`}>{paragraph}</p>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="manifesto-human-ai">
        <p className="manifesto-eyebrow">AI + MANUSIA</p>
        <h2>Kami tidak percaya masa depan komik adalah<br /><span>AI menggantikan manusia.</span></h2>
        <h2>Kami percaya masa depan komik adalah<br /><strong>manusia yang menjadi lebih kuat karena AI.</strong></h2>
        <div className="manifesto-contrast">
          <p>AI memberikan kecepatan.<br /><strong>Manusia memberikan arah.</strong></p>
          <p>AI membantu menghasilkan kemungkinan.<br /><strong>Manusia memilih mana yang bermakna.</strong></p>
          <p>AI membantu membuat.<br /><strong>Manusia menentukan apa yang layak diceritakan.</strong></p>
        </div>
      </section>

      <section className="manifesto-home">
        <p className="manifesto-eyebrow">MU-KOMIK</p>
        <h2>Tempat cerita menemukan rumahnya.</h2>
        <p>Kami membangun MU-KOMIK untuk para pencipta dunia.</p>
        <p>Dunia yang lucu. Dunia yang absurd. Dunia yang dekat dengan kehidupan. Dunia yang belum pernah diceritakan.</p>
        <p>Dengan teknologi AI, kami ingin membuat proses menciptakan komik menjadi lebih mudah, lebih cepat, dan lebih terbuka.</p>
        <blockquote>
          Di balik setiap cerita yang berarti, selalu ada manusia yang ingin mengatakan sesuatu.
          <strong>MU-KOMIK percaya pada manusia itu.</strong>
        </blockquote>
      </section>

      <footer className="manifesto-footer">
        <BrandLogo linked />
        <Link href="/" className="manifesto-back">Kembali ke MU-KOMIK <ArrowUpRight size={16} /></Link>
      </footer>
    </main>
  );
}
