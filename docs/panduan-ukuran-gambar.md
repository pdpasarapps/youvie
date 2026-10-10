# Panduan Ukuran Gambar Komik dan Iklan

Panduan ini membantu kreator dan admin menyiapkan gambar agar tetap jelas dan nyaman dibaca di ponsel, tablet, dan desktop. Ukuran di bawah adalah rekomendasi kerja, bukan batas minimum atau rasio yang dipaksakan oleh uploader.

## Halaman Komik

Unggah **satu gambar untuk setiap halaman**, bukan satu gambar gabungan untuk satu spread.

| Penggunaan | Ukuran yang disarankan | Rasio | Catatan tampilan |
| --- | ---: | ---: | --- |
| Halaman komik ponsel | 720 × 1280 px per halaman | 9:16 (potret) | Rekomendasi komposisi jika komik ditargetkan khusus untuk ponsel. |
| Halaman komik tablet | 900 × 1200 px per halaman | 3:4 (potret) | Rekomendasi komposisi jika komik ditargetkan khusus untuk tablet. |
| Halaman komik desktop | 1200 × 1800 px per halaman | 2:3 (potret) | Dua halaman terpisah membentuk spread desktop 4:3. |
| Satu berkas untuk semua perangkat | 1200 × 1800 px per halaman | 2:3 (potret) | Opsi master lintas perangkat: unggah berkas yang sama untuk ponsel, tablet, dan desktop. |
| Sampul komik | 1200 × 1600 px | 3:4 | Rasio kartu sampul adalah 3:4. Gambar ditampilkan utuh, jadi ruang kosong di sekitar gambar dapat terlihat. |

### Cara menyiapkan halaman

- Gunakan komposisi potret yang sesuai target: 9:16 untuk ponsel, 3:4 untuk tablet, atau 2:3 untuk desktop.
- Reader menggunakan `contain` untuk halaman komik: gambar utuh terlihat dan tidak dipotong. Rasio perangkat adalah rekomendasi komposisi, bukan crop wajib; rasio berbeda dapat menyisakan ruang kosong.
- Halaman komik tidak melalui crop otomatis. Pertahankan seluruh panel dan teks; uploader bab tetap menerima halaman asli.
- Target perangkat komik menentukan perangkat yang boleh membuka komik, bukan varian berkas gambar. Saat ini sistem menyimpan satu gambar untuk setiap halaman, tanpa varian gambar terpisah per perangkat.
- Jika targetnya ponsel, tablet, atau desktop tertentu, komik hanya akan ditampilkan dan dapat dibaca pada target tersebut; komik tidak akan tampil di perangkat lain. Pilih “Semua perangkat” agar komik tersedia di seluruh target.
- Jika komik tersedia di semua perangkat, gunakan master 1200 × 1800 px (2:3) per halaman. Ini seimbang untuk reader vertikal dan membentuk spread desktop 4:3 dari dua halaman; unggah satu gambar per halaman, bukan beberapa versi untuk satu halaman.
- Jaga balon dialog, teks, wajah, dan detail penting tetap masuk ke area aman; sisakan margin sekitar 3–5% dari tiap tepi.
- Hindari menggabungkan halaman kiri dan kanan menjadi satu berkas.
- Di editor komik, memilih sampul membuka alat crop rasio 3:4. Geser atau zoom gambar, lalu gunakan hasilnya; pemrosesan dilakukan di browser dan hasil diunggah saat perubahan komik disimpan. Gambar sumber maksimal 25 MB, sedangkan hasil mengikuti batas unggah platform.

## Iklan Kampanye

Formulir kampanye menyediakan materi terpisah untuk komputer, tablet, dan ponsel. Nilai berikut adalah rekomendasi yang ditampilkan di formulir admin:

| Penempatan kampanye | Komputer | Tablet | Ponsel |
| --- | ---: | ---: | ---: |
| Slot banner beranda | 1200 × 400 px (3:1) | 768 × 360 px (32:15) | 720 × 480 px (3:2) |
| Penempatan lain, termasuk jeda episode | 1200 × 600 px (2:1) | 900 × 600 px (3:2) | 720 × 900 px (4:5) |
| Promo utama beranda | 1920 × 720 px (8:3) | 1440 × 800 px (9:5) | 900 × 1200 px (3:4) |

Promo utama beranda dikelola terpisah dari kampanye sponsor.

### Iklan jeda antar-episode di desktop

- Dialog menampilkan gambar di kiri dan copy di kanan. Kolom gambar mengambil sekitar 56% lebar materi iklan.
- Tinggi materi dibatasi mengikuti layar (sekitar 40% tinggi viewport, minimum 220 px dan maksimum 340 px).
- Gambar memakai `cover` dengan posisi `top center`: gambar memenuhi kolom, dan pemotongan diprioritaskan dari bawah. Untuk hasil paling pas, siapkan gambar mendekati rasio **6:5**, misalnya 1200 × 1000 px.
- Jika memakai gambar potret, bagian bawahnya dapat terpotong cukup banyak. Tempatkan logo, judul, dan informasi utama di area atas gambar.
- Rekomendasi 1200 × 600 px yang ditampilkan formulir kampanye merupakan ukuran umum untuk penempatan non-banner; untuk dialog jeda desktop, 1200 × 1000 px lebih dekat dengan bidang gambar aktual.

### Iklan di perangkat lain dan fallback

- Iklan native pada halaman reader biasa menggunakan gambar utuh (`contain`) dan copy berada di bagian bawah.
- Jika materi tablet atau ponsel tidak diunggah, aplikasi menggunakan gambar komputer sebagai pengganti.
- Karena rasio dan cara tampil berbeda antarpenempatan, unggah varian perangkat jika tersedia. Periksa pratinjau khususnya untuk teks/logo dekat tepi; materi yang memakai `cover` bisa terpotong.
- Memilih materi di formulir `/push-ads` membuka crop untuk perangkat tersebut. Atur posisi dan zoom, lalu gunakan hasil crop; pemrosesan berlangsung di browser. Berkas sumber maksimal 25 MB dan hasil maksimal 5 MB per perangkat. Materi baru diunggah ke penyimpanan dan pengajuan disimpan setelah formulir dikirim.
- Bila satu kampanye memilih banner beranda dan antar-episode sekaligus, crop mengikuti rasio banner beranda. Ajukan kampanye terpisah jika membutuhkan komposisi gambar khusus antar-episode.

## Format dan kualitas berkas

- Formulir kampanye menerima JPG, PNG, atau WebP. Untuk gambar komik dan sampul, ikuti format serta batas ukuran file yang ditampilkan uploader/platform.
- Gunakan kualitas ekspor yang cukup untuk teks komik tetap terbaca; hindari memperbesar gambar kecil karena hasilnya akan buram.
- Optimalkan ukuran berkas sebelum unggah agar halaman cepat dimuat, terutama di jaringan seluler.
- Setelah unggah, periksa tampilan di ukuran perangkat sasaran dan pastikan crop tidak mengenai teks atau informasi penting.
