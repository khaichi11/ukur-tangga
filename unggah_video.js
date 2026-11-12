// Unggah otomatis video kegiatan (rekam.js) ke Google Drive lewat skrip google/Kode.gs (URL + kunci di
// tombol Google). Inti unggahnya di inti_unggah.js, dipakai bersama service worker: selama aplikasi
// terlihat, halaman ini yang mengunggah (dengan kemajuan, kecepatan, dan sisa waktu); saat layar dimatikan
// atau pindah aplikasi, unggah diserahkan ke service worker (Background Sync) yang melanjutkannya beberapa
// menit dan memberi notifikasi; sisanya dilanjutkan dari posisi terakhir saat aplikasi dibuka lagi.
//
// Tautan folder Drive tidak wajib: tanpa tautan, semua masuk folder tempat spreadsheet berada. Bila
// ditempel (sekali; disimpan di perangkat, di skrip, dan ikut tautan sambung), folder itu menjadi akar
// semua data: <akar>/<Lokasi>/Tangga <n>/(ukuran.csv, Foto/, Video/).
//
// Bagian video menunggu `tunda` menit sesudah selesai sebelum diunggah (bawaan 10; 0 = langsung, -1 =
// hanya bila ditekan Unggah sekarang), supaya rekaman yang salah bisa diputar dan dihapus lebih dulu.

import * as S from './sinkron.js';

const I = self.IntiUnggah;
const KUNCI_LS = 'ukur-tangga:video-drive';

export function atur() {
  try { return { hapusLokal: true, hanyaWifi: false, tunda: 10, ...(JSON.parse(localStorage.getItem(KUNCI_LS) || '{}')) }; } catch (_) {
    return { hapusLokal: true, hanyaWifi: false, tunda: 10 };
  }
}
export function simpanAtur(a) {
  try { localStorage.setItem(KUNCI_LS, JSON.stringify(a)); } catch (_) { /* diblokir */ }
  salinUntukLatar();
}
// Service worker tidak bisa membaca localStorage: salin pengaturan + sambungan Google ke IndexedDB.
export function salinUntukLatar() {
  const g = S.atur();
  I.simpanAturLatar({ a: atur(), g: g ? { url: g.url, kunci: g.kunci || '' } : null }).catch(() => {});
}

// https://drive.google.com/drive/folders/<id>?usp=sharing, .../drive/u/0/folders/<id>, open?id=<id>, atau id saja.
export function idFolder(teks) {
  const t = String(teks || '').trim();
  const m = t.match(/folders\/([\w-]{10,})/) || t.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(t) ? t : null;
}

// proses: id segmen -> { terkirim, total, mulai (ms), awal (byte saat mulai dihitung), nama }
const keadaan = { jalan: false, ulang: null, galat: '', proses: new Map(), kontrol: null, kunciLayar: null, terakhir: null };
let pendengar = () => {};
export function saatBerubah(f) { pendengar = f; }
const beritahu = () => { try { pendengar(); } catch (_) { /* UI */ } };
export const status = () => ({ galat: keadaan.galat, proses: keadaan.proses, jalan: keadaan.jalan,
  terakhir: keadaan.terakhir && Date.now() - keadaan.terakhir.waktu < 6000 ? keadaan.terakhir : null });

// Kemajuan unggah yang sedang berjalan: persen, MB, kecepatan, perkiraan sisa waktu.
export function kemajuan() {
  for (const [id, p] of keadaan.proses) {
    const detik = (Date.now() - p.mulai) / 1000, laju = detik > 2 ? (p.terkirim - p.awal) / detik : 0;
    return { id, nama: p.nama, persen: Math.floor(100 * p.terkirim / p.total), terkirim: p.terkirim, total: p.total,
      laju, sisaDetik: laju > 0 ? (p.total - p.terkirim) / laju : null, lama: detik };
  }
  return null;
}

// Cukup tersambung ke Google: tanpa tautan folder, skrip memakai akarnya sendiri (folder spreadsheet).
export const siap = () => !!S.atur();

// Periksa folder lewat skrip lalu simpan: { folder, folderNama, folderUrl }.
export async function pasangFolder(tautan) {
  const id = idFolder(tautan);
  if (!id) throw new Error('itu bukan tautan folder Google Drive');
  const g = S.atur();
  if (!g) throw new Error('sambungkan Google dulu (tombol Google di beranda)');
  let j;
  try { j = await S.panggil(g, { aksi: 'pasang_folder', folder: id }, 300000); } catch (e) {
    if (/Aksi tidak dikenal/.test(e.message)) throw new Error('skrip Google masih versi lama: perbarui Kode.gs (GOOGLE.md › Video)');
    throw e;
  }
  simpanAtur({ ...atur(), folder: id, folderNama: j.nama, folderUrl: j.url });
  jadwal(500);
  return j;
}

export function jadwal(ms = 3000) {
  clearTimeout(keadaan.ulang);
  keadaan.ulang = setTimeout(() => jalankan().catch(() => {}), ms);
}

async function kunciLayar(nyala) {
  try {
    if (nyala && !keadaan.kunciLayar && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      keadaan.kunciLayar = await navigator.wakeLock.request('screen');
      keadaan.kunciLayar.addEventListener('release', () => { keadaan.kunciLayar = null; });
    } else if (!nyala && keadaan.kunciLayar) { await keadaan.kunciLayar.release(); keadaan.kunciLayar = null; }
  } catch (_) { /* tidak didukung */ }
}

async function jalankan() {
  if (keadaan.jalan || !siap() || document.visibilityState === 'hidden') return;
  keadaan.jalan = true; keadaan.galat = '';
  keadaan.kontrol = new AbortController();
  const cb = {
    kemajuan: (s, terkirim, total) => {
      const p = keadaan.proses.get(s.id) || { mulai: Date.now(), awal: terkirim, nama: I.namaVideo(s) };
      keadaan.proses.set(s.id, { ...p, terkirim, total });
      kunciLayar(true);                        // layar tetap menyala selama mengunggah
      beritahu();
    },
    selesai: (s) => { keadaan.proses.delete(s.id); keadaan.terakhir = { nama: I.namaVideo(s), waktu: Date.now() }; beritahu(); },
    jalur: (j) => simpanAtur({ ...atur(), jalur: j }),
  };
  try {
    const h = await I.jalankan(atur(), S.atur(), cb, keadaan.kontrol.signal);
    if (h.status === 'jaringan') { keadaan.galat = h.galat; jadwal(15000); }
    else if (h.status === 'sibuk') jadwal(5000);                // service worker masih mengunggah
    else if (h.berikutMs) jadwal(h.berikutMs + 1000);
  } catch (e) {
    keadaan.galat = e.message;
    jadwal(navigator.onLine === false ? 15000 : 60000);
  } finally {
    keadaan.jalan = false; keadaan.kontrol = null;
    keadaan.proses.clear();
    kunciLayar(false);
    beritahu();
  }
}

export const sisaTunda = (s) => I.sisaTunda(s, atur());

export async function unggahSekarang(s) {
  s.unggah_sekarang = true;
  await I.simpanSegmen(s);
  jadwal(300);
}

// Masih ada video yang perlu diunggah/diperiksa (sekarang atau sesudah waktu tunggu)?
export async function adaAntre() {
  return (await I.daftar()).some((s) => I.perluDiurus(s) && Number.isFinite(I.sisaTunda(s, atur())));
}

// Layar mati / pindah aplikasi: hentikan unggah halaman lalu serahkan ke service worker.
async function serahkanKeLatar() {
  keadaan.kontrol?.abort();
  if (!siap() || !('serviceWorker' in navigator)) return;
  salinUntukLatar();
  try {
    if (!await adaAntre()) return;
    const r = await navigator.serviceWorker.ready;
    if (r.sync) await r.sync.register('unggah-video');
  } catch (_) { /* Background Sync tidak didukung: dilanjutkan saat aplikasi dibuka lagi */ }
}

export async function izinNotifikasi() {
  if (!('Notification' in window)) return 'tidak didukung';
  return Notification.permission === 'default' ? Notification.requestPermission() : Notification.permission;
}

window.addEventListener('online', () => jadwal(2000));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') jadwal(1500); else serahkanKeLatar();
});
window.addEventListener('pagehide', () => serahkanKeLatar());
salinUntukLatar();
