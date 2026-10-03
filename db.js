// Penyimpanan di perangkat: IndexedDB (dokumen data + foto), cadangan localStorage.
// Tidak ada data yang dikirim ke server mana pun.

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
  if (!dbJanji) dbJanji = bukaDb().catch((e) => { dbJanji = null; throw e; });
  return dbJanji;
}

function transaksi(store, mode, kerja) {
  return db().then((d) => new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const hasil = kerja(tx.objectStore(store));
    tx.oncomplete = () => resolve(hasil && 'result' in hasil ? hasil.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export async function bacaDokumen() {
  try {
    const d = await transaksi('dokumen', 'readonly', (s) => s.get('utama'));
    if (d) return d;
  } catch (_) { /* jatuh ke localStorage */ }
  try {
    const teks = localStorage.getItem(KUNCI_LS);
    return teks ? JSON.parse(teks) : null;
  } catch (_) {
    return null;
  }
}

export async function simpanDokumen(dok) {
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

export async function perkiraanRuang() {
  try {
    if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
  } catch (_) { /* tidak didukung */ }
  return null;
}
