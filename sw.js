// Service worker: simpan kerangka aplikasi agar Ukur Tangga terbuka tanpa internet.
// Naikkan VERSI setiap kali berkas aplikasi berubah agar perangkat mengambil versi baru.
const VERSI = 'ukur-tangga-v12';
const BERKAS = ['./', 'index.html', 'style.css', 'app.js', 'db.js', 'model.js', 'sinkron.js', 'rekam.js', 'unggah_video.js', 'inti_unggah.js', 'manifest.webmanifest',
  'xlsx.js', 'ikon/ikon-192.png', 'ikon/ikon-512.png', 'ikon/apple-touch-icon.png'];

// Unggah video yang dilanjutkan di latar sesudah layar mati / pindah aplikasi (Background Sync).
importScripts('inti_unggah.js');

const mb = (b) => `${(b / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;
const menit = (d) => (d >= 90 ? `±${Math.round(d / 60)} menit` : `±${Math.max(1, Math.round(d))} detik`);
async function notif(judul, isi, selesai = false) {
  if (!self.Notification || Notification.permission !== 'granted') return;
  try {
    await self.registration.showNotification(judul, { body: isi, tag: 'unggah-video', icon: 'ikon/ikon-192.png',
      silent: !selesai, renotify: selesai, data: { url: './#/' } });
  } catch (_) { /* tanpa notifikasi */ }
}

async function unggahLatar() {
  const atur = await self.IntiUnggah.bacaAturLatar();
  if (!atur || !atur.g) return;
  const mulai = Date.now(), awal = new Map();
  let akhirNotif = 0, n = 0;
  const h = await self.IntiUnggah.jalankan(atur.a || {}, atur.g, {
    kemajuan: (s, terkirim, total) => {
      if (!awal.has(s.id)) awal.set(s.id, { t: Date.now(), b: terkirim });
      if (Date.now() - akhirNotif < 4000 && terkirim < total) return;
      akhirNotif = Date.now();
      const a = awal.get(s.id), laju = (terkirim - a.b) / Math.max(1, (Date.now() - a.t) / 1000);
      notif(`Mengunggah video ${Math.floor(100 * terkirim / total)}%`,
        `${self.IntiUnggah.namaVideo(s)}\n${mb(terkirim)} dari ${mb(total)}${laju > 0 ? ` · sisa ${menit((total - terkirim) / laju)}` : ''}`
        + ` · berjalan ${menit((Date.now() - mulai) / 1000)}`);
    },
    selesai: () => { n++; notif('Video terunggah ke Drive ✓', `${n} bagian diperiksa utuh di Drive.`, true); },
  });
  // Halaman sedang mengunggah, atau tanpa internet: minta dicoba lagi nanti oleh browser.
  if (h.status === 'sibuk' || h.status === 'jaringan') throw new Error(h.status);
}

self.addEventListener('sync', (e) => {
  if (e.tag === 'unggah-video') e.waitUntil(unggahLatar());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((daftar) => {
    const ada = daftar[0];
    return ada ? ada.focus() : self.clients.openWindow('./#/');
  }));
});

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSI).then((c) => c.addAll(BERKAS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((kunci) => Promise.all(kunci.filter((k) => k !== VERSI).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Jaringan dulu (versi terbaru bila online), cache bila offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request)
    .then((r) => { const salin = r.clone(); caches.open(VERSI).then((c) => c.put(e.request, salin)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
