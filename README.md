# Ukur Tangga

Aplikasi web untuk mendata ukuran anak tangga di lapangan dengan iPad dan
meteran: per gedung, per tangga, per anak tangga (tinggi riser, panjang tread,
lebar, bordes, catatan, foto). Berjalan **offline**, data tersimpan **hanya di
perangkat**, dan bisa diekspor ke JSON/CSV atau dicetak.

Dipakai untuk memvalidasi ukuran tangga yang dihitung sistem RGB-D
(Train-RGB-D-Model) terhadap meteran.

## Memasang di iPad

1. Buka alamat GitHub Pages repo ini di **Safari**.
2. Tombol **Bagikan** → **Tambahkan ke Layar Utama**.
3. Buka dari ikon "Ukur Tangga". Setelah dibuka sekali, aplikasi jalan tanpa
   internet.

Penting: Safari dapat menghapus data situs yang tidak dibuka 7 hari, KECUALI
situs yang dipasang di Layar Utama. Tetap ekspor JSON secara berkala
(**⇅ Data → Bagikan JSON**, simpan ke Files/iCloud/AirDrop).

## Cara mendata

- **＋ Gedung / lokasi** (mis. Gedung F, GKM) → **＋ Tangga baru** (nama, lantai
  dari/ke; jumlah anak tangga boleh langsung dibuat).
- **＋ Anak tangga** lalu ketik tinggi riser → Enter → panjang tread → Enter:
  anak tangga berikutnya dibuat otomatis, jadi cukup terus mengetik sambil
  mengukur. Koma atau titik desimal sama saja (17,5 = 17.5).
- **Satu per satu**: satu anak tangga per layar dengan angka besar, ilustrasi
  riser/tread yang sedang diisi, tombol ‹ › atau geser kiri/kanan, dan deret
  nomor untuk melompat (hijau = lengkap).
- **＋ Bordes** untuk bidang datar antar-lengan tangga (panjang dan lebar).
- ✎ catatan per anak tangga, ⤒ sisipkan anak tangga yang terlewat, 🗑 hapus
  (bisa dibatalkan).
- **Info tangga**: lantai, arah ukur (naik: #1 paling bawah), lebar, pegangan,
  permukaan, lux, tanggal, pengukur, **ID tangga di Studio** (mis. T01), foto.
- Ringkasan otomatis: rerata ± simpangan, min–maks riser dan tread, 2R + T,
  kemiringan, tinggi total. Angka di luar rentang wajar ditandai kuning
  (cek salah ketik), tidak ditolak.

Definisi ukur (cm):
- **tinggi riser** = jarak tegak dari permukaan tread di bawahnya ke permukaan
  tread anak tangga ini;
- **panjang tread** = kedalaman injakan, dari muka riser sampai tepi depan anak
  tangga berikutnya (tanpa tonjolan nosing; catat nosing di catatan bila ada).

## Ekspor, impor, cetak

- **⇅ Data**: JSON (cadangan lengkap, opsional dengan foto) dan CSV (Excel/Numbers),
  lewat lembar Bagikan iPad atau unduh; **Impor JSON** menggabungkan data
  (tangga ber-ID sama diganti, sisanya ditambah) — juga untuk memindahkan data
  antar-perangkat.
- **🖨 Cetak**: laporan ukuran (tangga ini / gedung ini / semua) atau formulir
  kosong untuk diisi tangan; di iPad pilih printer AirPrint atau simpan PDF.
- Format JSON dijelaskan di [FORMAT.md](FORMAT.md); contoh di
  [contoh/contoh_ekspor.json](contoh/contoh_ekspor.json).
- Ke dataset Studio: `python -m studio_rgbd.ukuran_meteran --impor <berkas.json>`
  memasukkan ukuran setiap tangga yang ber-ID Studio ke `tangga.json`, lalu
  `python -m studio_rgbd.ukuran_meteran` membandingkannya dengan ukuran sistem.

## Menjalankan lokal

Tanpa build, tanpa dependensi:

```bash
python3 -m http.server 8000      # lalu buka http://localhost:8000
```

Berkas: `index.html`, `style.css`, `app.js` (tampilan), `model.js` (data,
statistik, ekspor/impor), `db.js` (IndexedDB di perangkat), `sw.js` (offline).
Setiap mengubah berkas aplikasi, naikkan `VERSI` di `sw.js` agar perangkat
mengambil versi baru.

## Privasi

Tidak ada server, akun, analitik, atau pelacak. Data hanya keluar dari perangkat
saat Anda mengekspornya sendiri. Repo ini hanya berisi kode aplikasi.
