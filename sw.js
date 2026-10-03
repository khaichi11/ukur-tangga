// Service worker: simpan kerangka aplikasi agar Ukur Tangga terbuka tanpa internet.
// Naikkan VERSI setiap kali berkas aplikasi berubah agar perangkat mengambil versi baru.
const VERSI = 'ukur-tangga-v1';
const BERKAS = ['./', 'index.html', 'style.css', 'app.js', 'db.js', 'model.js', 'manifest.webmanifest',
  'ikon/ikon-192.png', 'ikon/ikon-512.png', 'ikon/apple-touch-icon.png'];

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
