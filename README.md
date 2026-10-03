# Ukur Tangga

Catat tinggi riser dan panjang tread anak tangga di lapangan dengan iPad dan
meteran. Jalan **offline**, data **hanya di iPad**, hasilnya **Excel**.

Buka: https://khaichi11.github.io/ukur-tangga/

## Pasang di iPad

Safari → **Bagikan** → **Tambahkan ke Layar Utama**, lalu buka dari ikonnya.
Setelah dibuka sekali, aplikasi bisa dipakai tanpa internet, dan datanya tidak
dihapus Safari.

## Cara pakai

1. **＋ Tambah lokasi** → isi nama, mis. *Gedung F*.
2. Isi **tinggi riser** → Enter → **panjang tread** → Enter. Anak tangga
   berikutnya muncul sendiri. Tombol **＋ / −** menambah atau mengurangi anak
   tangga (yang terhapus bisa dibatalkan).
3. Ada bordes? Tekan **＋ Bordes**: muncul *Tangga 2* yang nomornya mulai dari
   1 lagi. Panjang bordes boleh diisi atau dikosongkan. ✕ pada bordes
   menggabungkan kembali kedua tangga.
4. **Ekspor** → **Excel (.xlsx)**: lembar *Data* (lokasi, tangga, nomor, riser,
   tread, bordes) dan *Ringkasan* (rata-rata, min, maks per tangga). Juga ada
   **Cetak / PDF**, **Simpan cadangan** (JSON semua lokasi), dan **Pulihkan dari
   cadangan**.

Angka di luar rentang wajar (riser < 8 atau > 25 cm, tread < 18 atau > 50 cm)
ditandai kuning sebagai pengingat salah ketik, tetapi tetap disimpan. Koma dan
titik desimal sama saja.

## Ke dataset RGB-D

Di menu **⋯** lokasi isi **ID tangga di Studio** (mis. T01). Cadangan JSON lalu
dimasukkan ke dataset dengan
`python -m studio_rgbd.ukuran_meteran --impor <cadangan.json>`, dan
`python -m studio_rgbd.ukuran_meteran` membandingkannya dengan ukuran sistem.
Format cadangan: [FORMAT.md](FORMAT.md), contoh: [contoh/contoh_ekspor.json](contoh/contoh_ekspor.json).

## Pengembangan

Tanpa build dan tanpa pustaka luar: `python3 -m http.server 8000` lalu buka
http://localhost:8000. Berkas: `app.js` (tampilan), `model.js` (data, ringkasan,
impor), `xlsx.js` (penulis Excel), `db.js` (penyimpanan di perangkat), `sw.js`
(offline). Naikkan `VERSI` di `sw.js` setiap mengubah berkas aplikasi.

Tidak ada server, akun, atau pelacak; data hanya keluar saat Anda mengekspornya.
