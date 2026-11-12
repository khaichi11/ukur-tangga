// Unggah otomatis video kegiatan (rekam.js) ke folder Google Drive pilihan pengguna, lewat skrip
// google/Kode.gs yang sama dengan sinkron foto (URL + kunci di tombol Google).
//
// Tautan folder ditempel sekali (disimpan di perangkat, di skrip, dan ikut tautan sambung) dan menjadi
// akar SEMUA data: skrip membuat <akar>/<Lokasi>/Tangga <n>/ (ukuran.csv, Foto/, Video/) dan memindah isi
// akar lama ke sana.
//
// Bagian video menunggu `tunda` menit sesudah selesai sebelum diunggah (bawaan 10; 0 = langsung, -1 =
// hanya bila ditekan Unggah sekarang), supaya rekaman yang salah bisa diputar dan dihapus lebih dulu. Setiap bagian video yang selesai diunggah dengan sesi unggah Drive
// (resumable) per 4 MiB: langsung dari HP ke Drive, atau lewat skrip bila browser menolak (CORS).
// Posisi unggah disimpan, jadi internet putus atau aplikasi tertutup tidak mengulang dari awal.
//
// Salinan di HP baru dihapus (bisa dimatikan) sesudah skrip memeriksa berkas di Drive: masih ada (bukan
// di Sampah), ukurannya sama, dan SHA-256-nya sama persis dengan yang dihitung dari salinan di HP. Bila
// berbeda, video diunggah ulang (paling banyak 3 kali) ke folder baru "Video (2)" di sebelahnya; salinan
// lama di Drive dibiarkan (aplikasi tidak pernah menghapus apa pun di Drive). Video yang sama persis sudah
// ada di Drive tidak dikirim ulang. Bila Drive belum memberi sidik, diperiksa lagi nanti; selama belum
// lolos, video tetap di HP.

import * as R from './rekam.js';
import * as S from './sinkron.js';

const KUNCI_LS = 'ukur-tangga:video-drive';
const POTONG = 4 * 1024 * 1024;              // kelipatan 256 KiB (syarat sesi unggah Drive)

export function atur() {
  try { return { hapusLokal: true, hanyaWifi: false, tunda: 10, ...(JSON.parse(localStorage.getItem(KUNCI_LS) || '{}')) }; } catch (_) {
    return { hapusLokal: true, hanyaWifi: false, tunda: 10 };
  }
}
export function simpanAtur(a) {
  try { localStorage.setItem(KUNCI_LS, JSON.stringify(a)); } catch (_) { /* diblokir */ }
}

// https://drive.google.com/drive/folders/<id>?usp=sharing, .../drive/u/0/folders/<id>, open?id=<id>, atau id saja.
export function idFolder(teks) {
  const t = String(teks || '').trim();
  const m = t.match(/folders\/([\w-]{10,})/) || t.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(t) ? t : null;
}

const keadaan = { jalan: false, ulang: null, galat: '', proses: new Map() };   // proses: id segmen -> persen
let pendengar = () => {};
export function saatBerubah(f) { pendengar = f; }
const beritahu = () => { try { pendengar(); } catch (_) { /* UI */ } };
export const status = () => ({ galat: keadaan.galat, proses: keadaan.proses, jalan: keadaan.jalan });

export const siap = () => !!(S.atur() && atur().folder);
const bolehJaringan = () => {
  if (navigator.onLine === false) return false;
  const c = navigator.connection;
  return !(atur().hanyaWifi && c && c.type && c.type !== 'wifi' && c.type !== 'ethernet');
};

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

async function jalankan() {
  if (keadaan.jalan || !siap()) return;
  if (!bolehJaringan()) { keadaan.galat = navigator.onLine === false ? 'menunggu internet' : 'menunggu Wi-Fi'; beritahu(); return; }
  keadaan.jalan = true; keadaan.galat = '';
  try {
    for (;;) {
      const calon = (await R.daftar()).filter((s) => (s.status === 'selesai' || s.status === 'terputus')
        && s.lokal !== false && s.ukuran > 0 && !s.terverifikasi && !(s.unggah_ulang > 3)).reverse();   // terlama dulu
      const antre = calon.filter((s) => sisaTunda(s) <= 0);
      const berikut = Math.min(...calon.map(sisaTunda).filter((ms) => ms > 0 && Number.isFinite(ms)));
      if (Number.isFinite(berikut)) jadwal(berikut + 1000);
      if (!antre.length || !siap()) break;
      const s = antre[0];
      if (!s.drive_id && !await unggah(s)) throw new Error('Drive belum mengonfirmasi video; dicoba lagi nanti');
      if (s.drive_id) await periksa(s);
    }
  } catch (e) {
    keadaan.galat = e.message;
    jadwal(navigator.onLine === false ? 15000 : 60000);
  } finally {
    keadaan.jalan = false; beritahu();
  }
}

// Milidetik sampai bagian ini boleh diunggah (<= 0 = sekarang; Infinity = menunggu Unggah sekarang).
export function sisaTunda(s) {
  if (s.drive_id || s.unggah_sekarang) return 0;
  const t = Number(atur().tunda);
  if (t < 0) return Infinity;
  return Date.parse(s.selesai || s.diperbarui || s.mulai) + t * 60000 - Date.now();
}

export async function unggahSekarang(s) {
  s.unggah_sekarang = true;
  await R.simpanSegmen(s);
  jadwal(300);
}

async function unggah(s) {
  const g = S.atur(), a = atur();
  const blob = await R.blobSegmen(s);
  const total = blob.size, mime = blob.type || 'video/webm';
  if (!s.sesi_url || s.sesi_total !== total || s.sesi_folder !== a.folder) {
    const d = new Date(s.mulai), p = (x) => String(x).padStart(2, '0');
    if (!s.sha256 || s.sha_total !== total) { s.sha256 = await sha256(blob); s.sha_total = total; }
    const j = await S.panggil(g, { aksi: 'video_sesi', folder: a.folder, nama: R.namaVideo(s), mime, ukuran: total, sha256: s.sha256,
      tanggal: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, lokasi: s.lokasi?.nama || 'Tanpa lokasi', lokasi_id: s.lokasi?.id || '',
      tangga: s.tangga?.nomor || '', tangga_id: s.tangga?.id || '',
      asal: location.origin, keterangan: `Ukur Tangga · ${s.lokasi?.nama || 'tanpa lokasi'}${s.tangga ? ` · tangga ${s.tangga.nomor}` : ''} · ${d.toLocaleString('id-ID')}` });
    if (j.sudah_ada) {                                           // sama persis sudah di Drive: tidak dikirim ulang
      s.drive_folder = j.folder; s.sesi_total = total;
      await selesai(s, { id: j.id, link: j.link });
      return true;
    }
    Object.assign(s, { sesi_url: j.url, sesi_total: total, sesi_folder: a.folder, drive_folder: j.folder, terkirim: 0 });
    await R.simpanSegmen(s);
  }
  let jalur = a.jalur || 'langsung';
  while (s.terkirim < total) {
    if (!bolehJaringan()) throw new Error(navigator.onLine === false ? 'menunggu internet' : 'menunggu Wi-Fi');
    const akhir = Math.min(total, s.terkirim + POTONG);
    const potong = blob.slice(s.terkirim, akhir);
    let h;
    if (jalur === 'langsung') {
      try { h = await kirimLangsung(s.sesi_url, potong, s.terkirim, akhir, total); } catch (e) {
        if (navigator.onLine === false) throw new Error('menunggu internet');
        jalur = 'skrip'; simpanAtur({ ...atur(), jalur });             // browser menolak: lewat skrip seterusnya
        h = await tanyaPosisi(g, s, total);
        if (h.selesai) { await selesai(s, h); return true; }
        if (h.kadaluarsa) { s.sesi_url = null; await R.simpanSegmen(s); return unggah(s); }
        continue;
      }
    } else {
      h = await kirimSkrip(g, s.sesi_url, potong, s.terkirim, total, mime);
    }
    if (h.kadaluarsa) { s.sesi_url = null; await R.simpanSegmen(s); return unggah(s); }
    if (h.selesai) { await selesai(s, h); return true; }
    s.terkirim = h.posisi;
    await R.simpanSegmen(s);
    keadaan.proses.set(s.id, Math.floor(100 * s.terkirim / total)); beritahu();
  }
  const h = await tanyaPosisi(g, s, total);                     // semua terkirim tetapi balasan akhir hilang
  if (h.selesai) { await selesai(s, h); return true; }
  return false;
}

async function selesai(s, h) {
  keadaan.proses.delete(s.id);
  if (!h.id) throw new Error('Drive tidak mengembalikan id berkas; diperiksa lagi nanti');
  await R.tandaiTerunggah(s, { id: h.id, link: h.link, folder: s.drive_folder });
  beritahu();
}

async function sha256(blob) {
  const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Bukti berkas di Drive utuh sebelum salinan HP dihapus. Blob dibuat ulang dengan cara yang sama persis
// dengan saat diunggah (potongan + durasi WebM), jadi sidiknya harus sama.
async function periksa(s) {
  const g = S.atur();
  const blob = await R.blobSegmen(s);
  if (s.sesi_total && blob.size !== s.sesi_total) throw new Error('salinan di HP berubah sejak diunggah; tidak dihapus');
  if (!s.sha256 || s.sha_total !== blob.size) { s.sha256 = await sha256(blob); s.sha_total = blob.size; await R.simpanSegmen(s); }
  let j;
  try { j = await S.panggil(g, { aksi: 'video_periksa', id: s.drive_id }); } catch (e) {
    if (/Aksi tidak dikenal/.test(e.message)) throw new Error('skrip Google versi lama tidak bisa memeriksa video: perbarui Kode.gs; video tetap di HP');
    throw e;
  }
  if (j.ada && j.ukuran === blob.size && j.sha256 && j.sha256.toLowerCase() === s.sha256) {
    if (j.link) s.drive_link = j.link;
    s.verif_galat = '';
    await R.tandaiTerverifikasi(s, atur().hapusLokal);
    beritahu();
    return true;
  }
  if (j.ada && j.ukuran === blob.size && !j.sha256) {
    s.verif_galat = 'Drive belum memberi sidik berkas'; await R.simpanSegmen(s);
    throw new Error('Drive belum memberi sidik berkas; diperiksa lagi nanti (video tetap di HP)');
  }
  // Hilang atau berbeda: unggah ulang dari HP. Salinan Drive yang berbeda TIDAK dihapus; yang baru masuk
  // "Video (2)" karena namanya sudah dipakai (lihat tempatBerkas_ di Kode.gs).
  Object.assign(s, { verif_galat: j.ada ? `isi di Drive berbeda (${j.ukuran} vs ${blob.size} byte)` : 'berkas tidak ada di Drive',
    drive_id: null, drive_link: '', sesi_url: null, terkirim: 0, unggah_ulang: (s.unggah_ulang || 0) + 1 });
  await R.simpanSegmen(s);
  beritahu();
  return false;
}

const posisiDari = (range) => { const m = /bytes=0-(\d+)/.exec(range || ''); return m ? Number(m[1]) + 1 : 0; };

async function kirimLangsung(url, potong, mulai, akhir, total) {
  const r = await fetch(url, { method: 'PUT', headers: { 'Content-Range': `bytes ${mulai}-${akhir - 1}/${total}` }, body: potong });
  if (r.status === 308) return { posisi: r.headers.get('Range') ? posisiDari(r.headers.get('Range')) : akhir };
  if (r.status === 200 || r.status === 201) { const j = await r.json().catch(() => ({})); return { selesai: true, id: j.id, link: j.webViewLink }; }
  if (r.status === 404 || r.status === 410) return { kadaluarsa: true };
  throw new Error(`Drive menolak potongan video (HTTP ${r.status})`);
}

async function kirimSkrip(g, url, potong, mulai, total, mime) {
  const j = await S.panggil(g, { aksi: 'video_potong', url, mulai, total, mime, data: await S.keBase64(potong) }, 300000);
  return bacaBalasan(j);
}
async function tanyaPosisi(g, s, total) {
  const j = await S.panggil(g, { aksi: 'video_potong', url: s.sesi_url, total });
  const h = bacaBalasan(j);
  if (!h.selesai && !h.kadaluarsa) { s.terkirim = h.posisi; await R.simpanSegmen(s); }
  return h;
}
// Lewat skrip, kepala Range selalu terbaca: tanpa Range berarti belum ada byte yang diterima Drive.
function bacaBalasan(j) {
  if (j.kode === 308) return { posisi: posisiDari(j.range) };
  if (j.kode === 200 || j.kode === 201) return { selesai: true, id: j.id, link: j.link };
  if (j.kode === 404 || j.kode === 410) return { kadaluarsa: true };
  throw new Error(`Drive menolak potongan video (HTTP ${j.kode}${j.teks ? ': ' + j.teks : ''})`);
}

window.addEventListener('online', () => jadwal(2000));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') jadwal(3000); });
