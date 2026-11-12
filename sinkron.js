// Sinkron opsional ke Google Spreadsheet + Google Drive milik pengguna, lewat skrip google/Kode.gs yang
// dipasang sebagai aplikasi web (lihat GOOGLE.md). Skrip berjalan sebagai pemilik spreadsheet; setiap
// permintaan membawa kunci rahasia yang sama dengan KUNCI di skrip. Tanpa pustaka, tanpa login di aplikasi.

const KUNCI_LS = 'ukur-tangga:google';

export function atur() {
  try {
    const a = JSON.parse(localStorage.getItem(KUNCI_LS) || 'null');
    return a && a.url ? a : null;
  } catch (_) {
    return null;
  }
}

export function simpanAtur(a) {
  try {
    if (a) localStorage.setItem(KUNCI_LS, JSON.stringify(a));
    else localStorage.removeItem(KUNCI_LS);
  } catch (_) { /* diblokir */ }
}

export const urlSah = (u) => /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+\/|macros\/)s\/[\w-]+\/exec$/.test(u);

// Badan teks biasa (bukan application/json) agar tidak ada preflight CORS; balasan Apps Script
// dialihkan ke script.googleusercontent.com yang mengizinkan semua asal.
export async function panggil(a, isi, batasMs = 120000) {
  let r;
  try {
    r = await fetch(a.url, { method: 'POST', body: JSON.stringify({ ...isi, kunci: a.kunci || '' }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(batasMs) : undefined });
  } catch (e) {
    if (navigator.onLine === false) throw new Error('tidak ada internet');
    throw new Error(e.name === 'TimeoutError' ? 'Google tidak menjawab' : 'tidak tersambung ke Google (periksa internet, URL, dan akses "Siapa saja")');
  }
  let j;
  try { j = JSON.parse(await r.text()); } catch (_) {
    throw new Error(`balasan bukan dari skrip Ukur Tangga (HTTP ${r.status}); periksa URL /exec dan akses "Siapa saja"`);
  }
  if (!j.ok) { const e = new Error(j.galat || 'ditolak skrip'); e.kode = j.kode || ''; throw e; }
  return j;
}

export function keBase64(blob) {
  return new Promise((ok, gagal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => gagal(r.error);
    r.readAsDataURL(blob);
  });
}

export function dariBase64(b64, mime) {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Blob([u], { type: mime });
}

// Tautan yang memasang URL + kunci sekali ketuk, mis. sesudah data Chrome dihapus. Simpan di Catatan.
export function tautanSambung(a, folderVideo = '') {
  const u = new URL(location.href);
  u.hash = ''; u.search = '';
  u.searchParams.set('google', a.url);
  if (a.kunci) u.searchParams.set('kunci', a.kunci);
  if (folderVideo) u.searchParams.set('folder', folderVideo);
  return u.toString();
}

export function dariTautan() {
  const q = new URLSearchParams(location.search);
  const url = q.get('google');
  return url ? { url: url.trim(), kunci: (q.get('kunci') || '').trim(), folder: (q.get('folder') || '').trim() } : null;
}
