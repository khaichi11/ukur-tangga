// Penyimpanan di perangkat: IndexedDB (dokumen data + foto), cadangan localStorage.
// Data hanya keluar dari perangkat lewat ekspor, atau ke Google milik pengguna bila disambungkan (sinkron.js).

const NAMA_DB = 'ukur-tangga';
const VERSI_DB = 1;
const KUNCI_LS = 'ukur-tangga:dokumen';

function bukaDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB tidak tersedia')); return; }
    const req = indexedDB.open(NAMA_DB, VERSI_DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('dokumen')) db.createObjectStore('dokumen');
      if (!db.objectStoreNames.contains('foto')) db.createObjectStore('foto');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbJanji = null;
function db() {
  if (!dbJanji) {
    dbJanji = bukaDb().then((d) => {
      // iPad menutup koneksi bila aplikasi lama di latar belakang (mis. saat kamera terbuka).
      d.onclose = () => { dbJanji = null; };
      d.onversionchange = () => { d.close(); dbJanji = null; };
      return d;
    }).catch((e) => { dbJanji = null; throw e; });
  }
  return dbJanji;
}

// Gagal sekali (biasanya "Connection to Indexed Database server lost" sesudah kamera/aplikasi lain dibuka):
// buka koneksi baru lalu ulangi, supaya foto dan data tidak gagal tersimpan diam-diam.
async function transaksi(store, mode, kerja) {
  try {
    return await transaksiSekali(store, mode, kerja);
  } catch (_) {
    const lama = dbJanji;
    dbJanji = null;
    try { (await lama)?.close(); } catch (_e) { /* koneksi memang sudah putus */ }
    return transaksiSekali(store, mode, kerja);
  }
}

function transaksiSekali(store, mode, kerja) {
  return db().then((d) => new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const hasil = kerja(tx.objectStore(store));
    tx.oncomplete = () => resolve(hasil && 'result' in hasil ? hasil.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

// Ada dua salinan (IndexedDB dan localStorage); yang terbaru dipakai. Bila IndexedDB sempat gagal ditulis,
// salinan lamanya tidak boleh menang: foto yang hanya tercatat di salinan baru akan dianggap tidak dipakai.
// Dokumen dari versi sebelum ada `disimpan`: pakai perubahan lokasi terakhir.
const waktuSimpan = (d) => d.disimpan || Math.max(0, ...(d.lokasi || []).map((l) => Date.parse(l.diubah) || 0));

export async function bacaDokumen() {
  let idb = null, ls = null;
  try { idb = (await transaksi('dokumen', 'readonly', (s) => s.get('utama'))) || null; } catch (_) { /* pakai localStorage */ }
  try { const teks = localStorage.getItem(KUNCI_LS); ls = teks ? JSON.parse(teks) : null; } catch (_) { /* rusak/diblokir */ }
  if (ls && (!idb || waktuSimpan(ls) > waktuSimpan(idb))) {
    try { await transaksi('dokumen', 'readwrite', (s) => s.put(ls, 'utama')); } catch (_) { /* dicoba lagi saat menyimpan */ }
    return ls;
  }
  return idb;
}

export async function simpanDokumen(dok) {
  dok.disimpan = Date.now();
  let ok = false;
  try {
    await transaksi('dokumen', 'readwrite', (s) => s.put(dok, 'utama'));
    ok = true;
  } catch (_) { /* coba localStorage */ }
  try {
    localStorage.setItem(KUNCI_LS, JSON.stringify(dok));   // salinan kedua; kecil (tanpa foto)
    ok = true;
  } catch (_) { /* penuh / diblokir */ }
  if (!ok) throw new Error('Penyimpanan perangkat tidak dapat ditulis');
}

export async function simpanFoto(id, blob) {
  await transaksi('foto', 'readwrite', (s) => s.put(blob, id));
}

export async function bacaFoto(id) {
  try {
    return await transaksi('foto', 'readonly', (s) => s.get(id));
  } catch (_) {
    return null;
  }
}

export async function daftarKunciFoto() {
  try {
    return await transaksi('foto', 'readonly', (s) => s.getAllKeys());
  } catch (_) {
    return [];
  }
}

export async function hapusFoto(id) {
  try { await transaksi('foto', 'readwrite', (s) => s.delete(id)); } catch (_) { /* abaikan */ }
}

export async function mintaPersisten() {
  // Safari menghapus data situs yang tidak dibuka 7 hari, kecuali situs dipasang di Layar Utama.
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (_) { /* tidak didukung */ }
  return false;
}

export async function sudahPersisten() {
  try { return navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (_) { return false; }
}

export async function perkiraanRuang() {
  try {
    if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
  } catch (_) { /* tidak didukung */ }
  return null;
}
