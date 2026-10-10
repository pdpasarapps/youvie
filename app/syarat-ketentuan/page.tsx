import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import BrandLogo from "@/components/brand-logo";
import { siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Syarat dan Ketentuan Layanan | Youvie",
  description: "Syarat dan ketentuan penggunaan Youvie untuk pembaca dan kreator.",
  alternates: { canonical: new URL("/syarat-ketentuan", siteUrl).toString() },
  openGraph: {
    title: "Syarat dan Ketentuan Layanan | Youvie",
    description: "Syarat dan ketentuan penggunaan Youvie untuk pembaca dan kreator.",
    url: new URL("/syarat-ketentuan", siteUrl).toString(),
  },
};

const termsSections: { title: string; content: ReactNode }[] = [
  {
    title: "Tentang Youvie",
    content: <>
      <p>Youvie adalah platform komik digital yang menyediakan ruang untuk menikmati cerita visual, komik serial, ilustrasi, dan karya kreatif lainnya.</p>
      <p>Kami berupaya menghadirkan pengalaman membaca yang menarik, nyaman, dan mudah diakses. Jenis konten, fitur, dan layanan yang tersedia dapat berubah, berkembang, atau diperbarui dari waktu ke waktu.</p>
    </>,
  },
  {
    title: "Ketentuan Penggunaan",
    content: <>
      <p>Dalam menggunakan Youvie, Anda setuju untuk:</p>
      <ul>
        <li>Menggunakan Platform sesuai dengan hukum dan peraturan yang berlaku.</li>
        <li>Tidak melakukan tindakan yang dapat merusak, mengganggu, atau menghambat operasional Platform.</li>
        <li>Tidak mencoba mengakses sistem, akun, atau data yang bukan menjadi hak Anda.</li>
        <li>Tidak menyebarkan malware, spam, atau materi yang dapat membahayakan pengguna maupun sistem kami.</li>
        <li>Tidak menggunakan Platform untuk penipuan, pelanggaran hak pihak lain, atau aktivitas ilegal.</li>
        <li>Tidak melakukan pengambilan, penyalinan, atau penggunaan konten secara massal tanpa izin yang sesuai.</li>
      </ul>
      <p>Kami berhak membatasi atau menghentikan akses pengguna yang melanggar ketentuan ini.</p>
    </>,
  },
  {
    title: "Hak Kekayaan Intelektual",
    content: <>
      <p>Seluruh konten yang tersedia di Youvie, termasuk tetapi tidak terbatas pada komik, ilustrasi, karakter, cerita, desain, logo, elemen visual, dan materi lainnya, dilindungi oleh ketentuan hukum mengenai hak kekayaan intelektual yang berlaku.</p>
      <p>Kecuali dinyatakan lain, konten tersebut tidak boleh disalin, diterbitkan ulang, didistribusikan, dijual, dimodifikasi, atau digunakan untuk kepentingan komersial tanpa izin dari pemegang hak yang sah.</p>
      <p>Akses ke suatu karya di Youvie tidak berarti bahwa hak kepemilikan atau hak cipta atas karya tersebut berpindah kepada pengguna.</p>
    </>,
  },
  {
    title: "Konten dan Karya Pihak Ketiga",
    content: <>
      <p>Youvie dapat memuat konten yang dibuat, dimiliki, atau disediakan oleh pihak ketiga. Hak atas konten tersebut tetap berada pada pencipta atau pemegang hak yang sah.</p>
      <p>Kami menghormati hak cipta dan hak kekayaan intelektual. Apabila Anda menemukan konten yang diduga melanggar hak Anda atau hak pihak lain, silakan hubungi pengelola Youvie melalui kanal kontak resmi yang tersedia di situs ini.</p>
      <p>Kami akan meninjau laporan tersebut dan mengambil tindakan yang sesuai berdasarkan hasil peninjauan serta ketentuan hukum yang berlaku.</p>
    </>,
  },
  {
    title: "Konten Buatan Pengguna",
    content: <>
      <p>Apabila Youvie menyediakan fitur untuk mengunggah, mengirimkan, atau menerbitkan karya maupun komentar, pengguna bertanggung jawab atas konten yang mereka kirimkan.</p>
      <p>Pengguna wajib memastikan bahwa mereka memiliki hak atau izin yang diperlukan untuk mengirimkan dan memublikasikan konten tersebut.</p>
      <p>Dengan mengirimkan konten kepada Platform, pengguna memberikan izin kepada Youvie untuk menyimpan, menampilkan, dan memproses konten tersebut sejauh diperlukan untuk menyediakan, mengoperasikan, serta mempromosikan layanan, sesuai dengan pengaturan fitur dan ketentuan yang berlaku.</p>
      <p>Pemberian izin tersebut tidak dengan sendirinya memindahkan kepemilikan hak cipta kepada Youvie.</p>
      <p>Pengguna dilarang mengirimkan konten yang melanggar hukum, melanggar hak cipta, mengandung penipuan, melecehkan pihak lain, atau bertentangan dengan kebijakan Platform.</p>
      <p>Youvie berhak meninjau, membatasi, atau menghapus konten yang melanggar ketentuan ini.</p>
    </>,
  },
  {
    title: "Penggunaan Teknologi AI",
    content: <>
      <p>Jika Platform menyediakan fitur pembuatan atau pengolahan komik menggunakan kecerdasan buatan (AI), hasil yang dihasilkan dapat memiliki keterbatasan, ketidakakuratan, atau kemiripan dengan materi yang sudah ada.</p>
      <p>Pengguna bertanggung jawab untuk meninjau hasil yang dibuat sebelum menerbitkan atau menggunakannya, termasuk memastikan bahwa penggunaannya tidak melanggar hukum, hak cipta, hak pihak ketiga, atau ketentuan lain yang berlaku.</p>
      <p>Kepemilikan dan hak penggunaan atas hasil yang dibuat menggunakan fitur AI mengikuti ketentuan fitur terkait, perjanjian yang berlaku, serta hukum yang relevan.</p>
    </>,
  },
  {
    title: "Ketersediaan Layanan",
    content: <>
      <p>Kami berusaha menjaga Youvie agar dapat diakses dengan baik. Namun, kami tidak menjamin bahwa Platform akan selalu tersedia tanpa gangguan, kesalahan teknis, keterlambatan, atau penghentian sementara.</p>
      <p>Kami dapat melakukan pemeliharaan, pembaruan, perubahan fitur, atau penghentian sebagian maupun seluruh layanan apabila diperlukan.</p>
      <p>Kami akan berupaya melakukan tindakan yang wajar untuk menjaga kualitas dan keamanan layanan.</p>
    </>,
  },
  {
    title: "Tautan dan Layanan Eksternal",
    content: <>
      <p>Youvie dapat menyediakan tautan menuju situs atau layanan pihak ketiga. Tautan tersebut disediakan untuk kemudahan pengguna.</p>
      <p>Kami tidak memiliki kendali penuh atas konten, kebijakan privasi, keamanan, atau operasional situs pihak ketiga. Penggunaan layanan eksternal tunduk pada syarat dan kebijakan masing-masing penyedia.</p>
    </>,
  },
  {
    title: "Iklan dan Monetisasi",
    content: <>
      <p>Youvie dapat menampilkan iklan, tautan promosi, atau bentuk monetisasi lainnya untuk mendukung operasional dan pengembangan Platform.</p>
      <p>Iklan atau promosi dari pihak ketiga tidak selalu berarti bahwa Youvie mendukung, menjamin, atau bertanggung jawab atas produk dan layanan yang ditawarkan oleh pengiklan.</p>
      <p>Interaksi, transaksi, atau perjanjian antara pengguna dan pihak pengiklan merupakan tanggung jawab para pihak terkait, sesuai dengan ketentuan yang berlaku.</p>
    </>,
  },
  {
    title: "Pembatasan Tanggung Jawab",
    content: <>
      <p>Sejauh diizinkan oleh hukum yang berlaku, Youvie tidak bertanggung jawab atas kerugian yang timbul akibat gangguan layanan, kehilangan data, kesalahan konten, tindakan pihak ketiga, atau penggunaan Platform yang tidak sesuai dengan ketentuan ini.</p>
      <p>Ketentuan ini tidak menghapus tanggung jawab yang berdasarkan hukum tidak dapat dikecualikan atau dibatasi.</p>
    </>,
  },
  {
    title: "Penangguhan dan Penghentian Akses",
    content: <>
      <p>Kami dapat menangguhkan atau menghentikan akses pengguna apabila terdapat dugaan pelanggaran terhadap Syarat dan Ketentuan ini, penyalahgunaan layanan, risiko keamanan, atau kewajiban berdasarkan hukum.</p>
      <p>Jika memungkinkan dan sesuai dengan kondisi yang ada, kami akan melakukan pemberitahuan atau memberikan kesempatan kepada pengguna untuk menyelesaikan masalah tersebut.</p>
    </>,
  },
  {
    title: "Perubahan Syarat dan Ketentuan",
    content: <>
      <p>Kami dapat memperbarui Syarat dan Ketentuan ini untuk menyesuaikan perubahan layanan, fitur, kebutuhan operasional, atau peraturan yang berlaku.</p>
      <p>Versi terbaru akan dipublikasikan di halaman ini beserta tanggal pembaruannya. Dengan terus menggunakan Platform setelah perubahan berlaku, Anda dianggap menerima ketentuan yang telah diperbarui, sepanjang diperbolehkan oleh hukum yang berlaku.</p>
    </>,
  },
  {
    title: "Hukum yang Berlaku",
    content: <>
      <p>Syarat dan Ketentuan ini ditafsirkan berdasarkan hukum Republik Indonesia, dengan tetap memperhatikan ketentuan hukum yang bersifat wajib dan berlaku bagi pengguna terkait.</p>
      <p>Setiap perselisihan akan diupayakan untuk diselesaikan terlebih dahulu melalui musyawarah. Apabila tidak tercapai kesepakatan, penyelesaian dilakukan melalui mekanisme yang tersedia berdasarkan hukum yang berlaku.</p>
    </>,
  },
  {
    title: "Hubungi Kami",
    content: <p>Apabila Anda memiliki pertanyaan, masukan, atau laporan terkait Syarat dan Ketentuan ini, hak cipta, maupun penggunaan Youvie, silakan hubungi pengelola melalui kanal kontak resmi yang tercantum pada situs kami.</p>,
  },
];

export default function TermsPage() {
  return (
    <main className="manifesto-page terms-page">
      <nav className="manifesto-nav" aria-label="Navigasi halaman">
        <BrandLogo linked showName />
        <Link href="/" className="manifesto-back"><ArrowLeft size={16} /> Beranda</Link>
      </nav>

      <header className="terms-hero">
        <p className="manifesto-eyebrow">Youvie</p>
        <h1>Syarat dan<br /><em>Ketentuan Layanan</em></h1>
        <p className="terms-lead">Selamat datang di <strong>Youvie</strong> (“Youvie”, “kami”, atau “Platform”). Syarat dan Ketentuan Layanan ini mengatur penggunaan situs web, konten, fitur, dan layanan yang tersedia di Youvie.</p>
        <p className="terms-lead">Dengan mengakses atau menggunakan Youvie, Anda menyatakan telah membaca, memahami, dan menyetujui Syarat dan Ketentuan ini. Jika Anda tidak menyetujuinya, harap berhenti menggunakan layanan kami.</p>
        <p className="terms-updated">Terakhir diperbarui: 9 Oktober 2026</p>
      </header>

      <div className="terms-content">
        {termsSections.map((section, index) => (
          <section className="terms-section" key={section.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><h2>{section.title}</h2>{section.content}</div>
          </section>
        ))}
        <div className="terms-closing">
          <strong>Youvie</strong>
          <p>Tempat cerita dan imajinasi bertemu dalam dunia komik digital.</p>
          <p>Terima kasih telah menggunakan Youvie.</p>
        </div>
      </div>

      <footer className="manifesto-footer">
        <BrandLogo linked />
        <Link href="/" className="manifesto-back">Kembali ke Youvie <ArrowUpRight size={16} /></Link>
      </footer>
    </main>
  );
}
