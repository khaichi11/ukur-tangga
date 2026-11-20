# Rekam Ukur Tangga (Android)

Perekam video untuk HP Android: kamera **belakang + depan kecil di pojok** dalam **satu berkas MP4 utuh**
(tidak dipotong) sampai tombol Berhenti ditekan. Berjalan di latar depan (notifikasi), jadi tetap
merekam saat layar mati atau saat Anda kembali ke Ukur Tangga di Chrome untuk mengisi ukuran.

Kenapa aplikasi terpisah: Chrome/WebView di kebanyakan HP Android hanya membuka satu kamera sekaligus.
Dua kamera bersamaan hanya bisa lewat API kamera native (CameraX *concurrent camera*), dan hanya di HP
yang mendukungnya (Android 11+, umumnya HP kelas menengah ke atas). Di HP yang tidak mendukung, aplikasi
merekam kamera belakang saja dan memberitahukannya.

## Pasang dari browser

1. Di HP, buka
   `https://github.com/khaichi11/ukur-tangga/releases/latest/download/rekam-ukur-tangga.apk`
   (atau tekan **Buka perekam dua kamera** di dialog Rekam video Ukur Tangga).
2. Buka berkas yang terunduh. Bila diminta, izinkan Chrome **memasang aplikasi tidak dikenal**.
3. Buka **Rekam Ukur Tangga** → **● Mulai rekam** → izinkan kamera, mikrofon, notifikasi.

Versi baru dipasang dengan cara yang sama, langsung di atas versi lama.

## Hasil

Galeri › **Movies/UkurTangga/ukur_tangga_YYYYMMDD_HHMMSS.mp4**. Belum ikut unggah otomatis ke Drive
seperti video dari aplikasi web; unggah dari Galeri/Drive bila perlu.

Catatan: MP4 baru ditutup rapi saat Berhenti. Bila HP mati mendadak di tengah rekaman, berkasnya bisa
rusak, jadi untuk rekaman berjam-jam pastikan baterai cukup.

## Build

APK dibuat otomatis oleh GitHub Actions (`.github/workflows/android.yml`) setiap ada perubahan di
`android/`, lalu ditaruh di Releases. Build lokal: buka folder `android/` di Android Studio.
