# Ukur Tangga

Catat tinggi riser dan panjang tread anak tangga di lapangan dengan iPad dan
meteran. Jalan **offline**, data di perangkat (bisa dikirim otomatis ke
**Google Spreadsheet** milik sendiri), hasilnya **Excel**.

Buka: https://khaichi11.github.io/ukur-tangga/

## Pasang di iPad

Safari → **Bagikan** → **Tambahkan ke Layar Utama**, lalu buka dari ikonnya.
Setelah dibuka sekali, aplikasi bisa dipakai tanpa internet, dan datanya tidak
dihapus Safari.

## Cara pakai

1. **Tambah lokasi** → isi nama, mis. *Gedung F*.
2. Isi **tinggi riser** → Enter → **panjang tread** → Enter. Anak tangga
   berikutnya muncul sendiri. **+ Anak tangga** dan **− Hapus terakhir**
   menambah atau mengurangi baris (yang terhapus bisa dibatalkan).
3. Ada bordes? Tekan **Tambah bordes**: muncul *Tangga 2* yang nomornya mulai
   dari 1 lagi. Panjang bordes boleh diisi atau dikosongkan. **Hapus** pada
   bordes menggabungkan kembali kedua tangga.
4. **Ekspor** → **Excel (.xlsx)**: lembar *Data* (lokasi, tangga, nomor, riser,
   tread, bordes) dan *Ringkasan* (rata-rata, min, maks per tangga). Juga ada
   **Cetak / PDF**, **Simpan cadangan** (JSON semua lokasi), dan **Pulihkan dari
   cadangan**.

5. **Foto**: tombol **+ Foto** di bawah tabel setiap tangga menawarkan
   **Ambil Foto** (kamera) atau **Pustaka Foto** (pilih banyak foto sekaligus).
   Tekan lagi untuk menambah foto berikutnya. Foto dari Pustaka tetap ada di
   aplikasi Foto iPad, jadi itu cadangan kedua; foto yang diambil langsung dari
   kamera hanya ada di aplikasi ini (pakai **Bagikan** › Simpan Gambar atau
   Google bila perlu cadangan). Foto disimpan di iPad (dikecilkan ke 2048 px)
   dan muncul sebagai deret gambar kecil di bawah tangganya. Ketuk gambar untuk memilih **Foto
   untuk** (seluruh tangga atau anak tangga ke-n), mengisi keterangan,
   **Bagikan** (simpan ke Foto/Files/AirDrop), atau **Hapus** (bisa
   dibatalkan). **Ekspor** → **Foto (.zip)** mengumpulkan semua foto beserta
   `foto.csv` (berkas, lokasi, tangga, anak tangga, keterangan, waktu).
   Cadangan JSON hanya berisi keterangan fotonya, bukan gambarnya, jadi simpan
   juga ZIP fotonya.
6. **Google** (beranda): sambungkan ke Google Spreadsheet + Drive milik sendiri
   agar foto dan ukuran terkirim otomatis dan bisa dipulihkan bila data Chrome
   terhapus. Cara memasang: [GOOGLE.md](GOOGLE.md).
7. **Foto yang hilang** (gambar terhapus, catatannya masih ada; ditandai
   *gambar hilang*): **Ekspor › Pulihkan foto yang hilang** dari Google Drive,
   dari ZIP ekspor, atau berkas foto hasil **Bagikan**; satu foto lewat
   **Pilih gambar**.
8. **Rekam video kegiatan** per tangga (tombol **● Rekam** di kartu tangga,
   **Rekam di sini** untuk pindah tangga; atau **● Rekam video** di pojok kanan bawah):
   kamera belakang, ditambah kamera depan kecil di pojok bila HP mengizinkan dua
   kamera sekaligus (banyak HP tidak; otomatis jadi kamera belakang + suara),
   dengan cap waktu dan nama lokasi tergambar di video. Ukuran tetap bisa diisi
   selama merekam. Mutu **Hemat** ±170 MB/jam, **Sedang** ±330 MB/jam (bawaan),
   **Jelas** ±690 MB/jam. Video disimpan ke penyimpanan aplikasi setiap 3 detik
   dan dipotong per 10 menit (dan setiap pindah lokasi), jadi bila HP mati atau
   browser tertutup paksa yang hilang paling banyak 3 detik. Layar dijaga tetap
   menyala; **Gelap** menghitamkan layar untuk menghemat baterai (ketuk dua kali
   untuk kembali). Browser selalu mematikan kamera bila layar dimatikan atau
   pindah aplikasi: rekaman dijeda lalu otomatis lanjut (bagian baru) saat
   aplikasi dibuka lagi. Rekaman berhenti sendiri bila penyimpanan hampir
   penuh. **Ekspor › Video kegiatan**: **Simpan** tiap bagian ke galeri/berkas
   (.webm; iPhone/iPad .mp4), lalu **Hapus** agar memori lega. Bila Google
   tersambung dan folder Drive dipasang (tempel tautan folder sekali), setiap
   bagian diunggah ke `<folder>/<Lokasi>/Tangga <n>/Video` sesudah waktu tunggu
   (bawaan 10 menit, untuk **Putar**/**Hapus** video yang salah), lalu dihapus
   dari HP hanya bila berkas Drive terbukti sama persis (ukuran + SHA-256).
   Ukuran (`ukuran.csv`) dan foto tangga itu masuk folder tangga yang sama
   ([GOOGLE.md](GOOGLE.md) › *Satu folder untuk semua*).

Angka di luar rentang wajar (riser < 8 atau > 25 cm, tread < 18 atau > 50 cm)
ditandai kuning sebagai pengingat salah ketik, tetapi tetap disimpan. Koma dan
titik desimal sama saja.

## Ke dataset RGB-D

Di menu **Atur** lokasi isi **ID tangga di Studio** (mis. T01). Cadangan JSON lalu
dimasukkan ke dataset dengan
`python -m studio_rgbd.ukuran_meteran --impor <cadangan.json>`, dan
`python -m studio_rgbd.ukuran_meteran` membandingkannya dengan ukuran sistem.
Format cadangan: [FORMAT.md](FORMAT.md), contoh: [contoh/contoh_ekspor.json](contoh/contoh_ekspor.json).

## Pengembangan

Tanpa build dan tanpa pustaka luar: `python3 -m http.server 8000` lalu buka
http://localhost:8000. Berkas: `app.js` (tampilan), `model.js` (data, ringkasan,
impor), `xlsx.js` (penulis Excel, penulis/pembaca ZIP), `db.js` (penyimpanan di
perangkat), `sinkron.js` (kiriman ke Google), `google/Kode.gs` (skrip Apps Script
di akun Google pengguna), `sw.js` (offline). Naikkan `VERSI` di `sw.js` setiap
mengubah berkas aplikasi.

Tidak ada server, akun, atau pelacak; data hanya keluar saat Anda mengekspornya
atau ke Google Anda sendiri bila disambungkan.
