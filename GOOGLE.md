# Sambungkan ke Google Spreadsheet

Foto dan ukuran dikirim otomatis ke Google Spreadsheet dan Google Drive milik
Anda sendiri. Data di perangkat bisa hilang bila data Chrome/Safari terhapus
(atau diusir browser saat ruang penuh); salinan di Google tidak, dan bisa
dipulihkan lagi ke perangkat.

Tidak ada server lain: skrip [google/Kode.gs](google/Kode.gs) berjalan di akun
Google Anda sebagai aplikasi web.

## Pasang skrip (sekali, sebaiknya di laptop)

1. Buka <https://sheets.new> dan beri nama, mis. *Ukur Tangga*.
2. **Ekstensi › Apps Script**. Hapus isi `Code.gs`, lalu tempel seluruh isi
   [google/Kode.gs](google/Kode.gs).
3. Di baris `const KUNCI = 'GANTI-DENGAN-KATA-RAHASIA';` ganti isinya dengan
   kata rahasia Anda sendiri (mis. 20 huruf acak). Simpan (Ctrl+S).
4. Di bilah atas pilih fungsi **izinkan** › **Jalankan** › **Tinjau izin** ›
   pilih akun › **Lanjutan** › **Buka Ukur Tangga (tidak aman)** › **Izinkan**.
   Peringatan itu muncul karena skripnya buatan sendiri, bukan diverifikasi
   Google. Skrip butuh izin Spreadsheet dan Drive.
5. **Terapkan › Deployment baru** › ikon roda › **Aplikasi web**.
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja**

   **Terapkan**, lalu salin **URL aplikasi web** (berakhiran `/exec`). Ini
   **alamat penghubung**, bukan link spreadsheet: bila dibuka di browser ia
   hanya menampilkan halaman *Penghubung Ukur Tangga* berisi tautan ke
   spreadsheet dan folder Drive.

## Sambungkan aplikasi

1. Di beranda Ukur Tangga ketuk **Google**, tempel **alamat penghubung**
   (URL `/exec`, bukan link spreadsheet/folder) dan kunci, lalu **Sambungkan**.
   Sesudah tersambung ada tombol **Buka spreadsheet** dan **Buka folder Drive**.
2. Ketuk **Google › Bagikan tautan sambung** dan simpan tautannya (Catatan,
   atau kirim ke diri sendiri). Bila data Chrome terhapus, buka tautan itu:
   aplikasi tersambung lagi dan menawarkan **Pulihkan dari Google** (lokasi,
   ukuran, dan gambar foto).

Sesudah itu semuanya otomatis: foto diunggah begitu diambil, ukuran dikirim
beberapa detik sesudah diketik. Tanpa internet, kiriman menunggu dan
dilanjutkan saat aplikasi dibuka lagi dengan internet. Tombol di beranda
menunjukkan keadaannya: **Google: aman**, **n antre** (foto belum terunggah,
bergaris kuning di deret foto), **menunggu**, atau **tertunda** (ketuk untuk
melihat sebabnya).

## Isi di Google

| Tempat | Isi |
| --- | --- |
| Lembar **Data** | satu baris per anak tangga dan bordes; ditulis ulang setiap kiriman |
| Lembar **Ringkasan** | per tangga: jumlah, terisi, rata-rata/min/maks riser dan tread, jumlah foto |
| Lembar **Foto** | satu baris per foto: lokasi, tangga, anak tangga, keterangan, gambar kecil, tautan Drive |
| Drive `<akar>/<Lokasi>/Tangga <n>/ukuran.csv` | ukuran anak tangga tangga itu (dan bordes sesudahnya); ditulis ulang bila berubah |
| Drive `<akar>/<Lokasi>/Tangga <n>/Foto` | gambar JPEG 2048 px |
| Drive `<akar>/<Lokasi>/Tangga <n>/Video` | video kegiatan tangga itu, per bagian (nama berkas berisi tanggal dan jam) |
| Drive `<akar>/dokumen.json` | seluruh data aplikasi, dipakai **Pulihkan dari Google** |
| Drive `<akar>/Cadangan` | salinan `dokumen.json` per hari, dan sebelum ada lokasi yang dihapus |

`<akar>` = folder yang tautannya ditempel di aplikasi (lihat *Satu folder untuk
semua*), atau folder `Ukur Tangga` yang dibuat sendiri bila belum ada. Folder
lokasi/tangga ikut berganti nama bila lokasinya diganti nama atau nomor
tangganya bergeser (bordes ditambah/dihapus).

Menghapus foto atau lokasi di aplikasi tidak menghapus berkasnya di Drive;
barisnya di lembar Foto ditandai *dihapus di aplikasi*.

## Foto yang terlanjur hilang

Beranda menampilkan *n foto tidak ada di perangkat ini* bila gambar foto
hilang tetapi catatannya masih ada. Ketuk **Pulihkan**:

- **Dari Google Drive**: untuk foto yang sudah pernah terunggah. Saat
  tersambung, ini juga berjalan sendiri.
- **Dari ZIP ekspor atau berkas foto**: pilih ZIP dari **Ekspor › Foto (.zip)**
  atau foto yang dulu disimpan lewat **Bagikan** (namanya seperti
  `Gedung_F_tangga1_foto01_a3f9.jpg`). Aplikasi mencocokkan nama berkas dengan
  fotonya.
- Satu foto: ketuk kotak *gambar hilang* › **Pilih gambar**.

Gambar yang belum pernah diunggah atau diekspor tidak bisa dipulihkan: foto
dari kamera aplikasi ini biasanya tidak masuk galeri.

## Satu folder untuk semua (ukuran, foto, video)

Perlu skrip versi 5 (Kode.gs terbaru). Bila skrip sudah terpasang dari versi
sebelumnya: tempel ulang seluruh isi [google/Kode.gs](google/Kode.gs) (KUNCI
diisi lagi), jalankan **izinkan** sekali lagi (ada izin baru: *menghubungkan
ke layanan eksternal*, untuk unggah video besar ke Drive), lalu terapkan versi
baru (bagian *Mengubah skrip*).

1. Di Google Drive (akun yang sama dengan skrip) buat folder, mis.
   *Dokumentasi Ukur Tangga*. Buka foldernya, salin tautannya dari kolom
   alamat atau **Bagikan › Salin link**.
2. Di aplikasi: **Google › Pasang folder Drive** (atau **Ekspor › Video
   kegiatan**), tempel tautannya, **Pasang folder**. Cukup sekali; **Ganti**
   bila mau pindah folder. Tautan folder ikut **Bagikan tautan sambung**.
3. Isi folder Ukur Tangga lama (spreadsheet, `dokumen.json`, Cadangan, foto)
   dipindah sendiri ke folder baru; foto masuk ke folder lokasinya.

Video direkam per tangga: tombol **● Rekam** di kartu tangga (atau **Rekam di
sini** untuk pindah tangga saat merekam). Setiap bagian menunggu dulu (bawaan
10 menit; bisa langsung, 30 menit, 1 jam, atau hanya bila ditekan **Unggah
sekarang**) supaya video yang salah bisa **Putar** lalu **Hapus** sebelum
terunggah. Sesudah itu diunggah dengan sesi unggah Drive, per 4 MB, langsung
dari HP (atau lewat skrip bila browser menolak); internet putus atau aplikasi
tertutup melanjutkan dari posisi terakhir.

Salinan di HP baru dihapus sesudah skrip memeriksa berkas di Drive: masih ada,
ukurannya sama, dan sidik SHA-256-nya sama persis dengan salinan di HP. Bila
berbeda, salinan Drive dibuang ke Sampah dan video diunggah ulang (sampai 3
kali); bila Drive belum memberi sidik, diperiksa lagi nanti. Selama belum
lolos, video tetap di HP. Penghapusan otomatis bisa dimatikan, dan ada pilihan
*hanya lewat Wi-Fi*. Unggah memakai kuota internet sebesar videonya (±330 MB
per jam pada mutu Sedang). Menghapus video yang sudah di Drive memindahkan
berkas Drive-nya ke Sampah (bisa dipulihkan 30 hari).

## Mengubah skrip

Sesudah mengubah `Kode.gs`: **Terapkan › Kelola deployment** › ikon pensil ›
Versi: **Versi baru** › **Terapkan**. URL tetap sama. (Deployment baru
menghasilkan URL baru; sambungkan ulang aplikasi dengan URL itu.)

## Keamanan

*Siapa saja* berarti siapa pun yang tahu URL bisa memanggil skrip, tetapi
skrip menolak semua permintaan tanpa kunci yang benar. Tautan sambung memuat
kuncinya, jadi jangan dibagikan ke orang lain. Foto di Drive tidak dibagikan
publik; gambar kecil di lembar Foto disisipkan langsung ke sel.
