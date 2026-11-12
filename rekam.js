// Rekam video kegiatan selama mengukur: kamera belakang, ditambah kamera depan kecil di pojok bila HP
// mengizinkan dua kamera sekaligus, plus suara. Hemat memori: resolusi dan bitrate tetap rendah
// (lihat MUTU), cap waktu dan nama lokasi ikut tergambar.
//
// Tidak boleh hilang: potongan video ditulis ke IndexedDB setiap 3 detik, dan setiap 10 menit dimulai
// bagian (berkas) baru. Bila layar mati, pindah aplikasi, atau browser ditutup paksa, yang hilang paling
// banyak 3 detik terakhir; bagian yang terputus tetap bisa disimpan. Browser menghentikan kamera saat
// halaman tidak terlihat, jadi rekaman dijeda lalu otomatis dilanjutkan (bagian baru) saat aplikasi
// dibuka lagi. Layar dijaga tetap menyala (Wake Lock) dan ada mode layar gelap untuk menghemat baterai.
//
// Basis data terpisah (ukur-tangga-video) agar video besar tidak mengganggu data ukur.

const NAMA_DB = 'ukur-tangga-video';
export const MUTU = {
  hemat: { label: 'Hemat', lebar: 640, fps: 15, bps: 350_000 },
  sedang: { label: 'Sedang', lebar: 960, fps: 15, bps: 700_000 },
  jelas: { label: 'Jelas', lebar: 1280, fps: 24, bps: 1_500_000 },
};
const BPS_SUARA = 32_000;
const POTONG_MS = 3000;
const BAGIAN_MS = 10 * 60_000;
const SISA_MIN = 150e6;            // berhenti sendiri bila sisa kuota penyimpanan di bawah ini

export const mbPerJam = (mutu, suara) => Math.round((MUTU[mutu].bps + (suara ? BPS_SUARA : 0)) * 3600 / 8 / 1e6);

// ---------------------------------------------------------------- penyimpanan
let dbJanji = null;
function db() {
  if (!dbJanji) {
    dbJanji = new Promise((ok, gagal) => {
      const r = indexedDB.open(NAMA_DB, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('segmen', { keyPath: 'id' });
        r.result.createObjectStore('potongan');
      };
      r.onsuccess = () => {
        const d = r.result;
        d.onclose = () => { dbJanji = null; };
        d.onversionchange = () => { d.close(); dbJanji = null; };
        ok(d);
      };
      r.onerror = () => gagal(r.error);
    }).catch((e) => { dbJanji = null; throw e; });
  }
  return dbJanji;
}
function txSekali(stores, mode, kerja) {
  return db().then((d) => new Promise((ok, gagal) => {
    const t = d.transaction(stores, mode);
    const h = kerja(t);
    t.oncomplete = () => ok(h && typeof h === 'object' && 'result' in h ? h.result : h);
    t.onerror = () => gagal(t.error);
    t.onabort = () => gagal(t.error);
  }));
}
async function tx(stores, mode, kerja) {
  try { return await txSekali(stores, mode, kerja); } catch (_) {
    dbJanji = null;                                       // koneksi putus (iPad/Android sesudah latar belakang): ulang sekali
    return txSekali(stores, mode, kerja);
  }
}
const kunci = (id, i) => `${id}:${String(i).padStart(6, '0')}`;
const rentang = (id) => IDBKeyRange.bound(`${id}:`, `${id}:￿`);
const simpanSegmen = (s) => tx(['segmen'], 'readwrite', (t) => { t.objectStore('segmen').put({ ...s }); });

export async function daftar() {
  const semua = await tx(['segmen'], 'readonly', (t) => t.objectStore('segmen').getAll());
  return (semua || []).sort((a, b) => (a.mulai < b.mulai ? 1 : -1));
}
export async function blobSegmen(s) {
  const bagian = (await tx(['potongan'], 'readonly', (t) => t.objectStore('potongan').getAll(rentang(s.id)))) || [];
  const lama = Date.parse(s.selesai || s.diperbarui) - Date.parse(s.mulai);
  if (bagian.length && s.mime.includes('webm') && lama > 0) {
    try { bagian[0] = await isiDurasiWebm(bagian[0], lama); } catch (_) { /* tetap bisa diputar tanpa durasi */ }
  }
  return new Blob(bagian, { type: s.mime.split(';')[0] });
}

// WebM dari MediaRecorder tidak memuat durasi, sehingga galeri HP tidak bisa menggeser (seek). Tambahkan
// elemen Duration (milidetik, skala waktu bawaan 1 ms) ke Segment > Info pada potongan pertama.
async function isiDurasiWebm(blob, ms) {
  const u = new Uint8Array(await blob.arrayBuffer());
  const panjangVint = (b) => { for (let i = 0; i < 8; i++) if (b & (0x80 >> i)) return i + 1; return 0; };
  const bacaVint = (i) => {
    const n = panjangVint(u[i]); let v = u[i] & (0xff >> n);
    for (let k = 1; k < n; k++) v = v * 256 + u[i + k];
    return { n, v };
  };
  let info = -1;
  for (let i = 0; i < Math.min(u.length - 4, 4096); i++) {
    if (u[i] === 0x15 && u[i + 1] === 0x49 && u[i + 2] === 0xA9 && u[i + 3] === 0x66) { info = i; break; }
  }
  if (info < 0) return blob;
  const ukuran = bacaVint(info + 4), awalIsi = info + 4 + ukuran.n, akhirIsi = awalIsi + ukuran.v;
  const isi = u.subarray(awalIsi, akhirIsi);
  for (let i = 0; i + 1 < isi.length; i++) if (isi[i] === 0x44 && isi[i + 1] === 0x89) return blob;   // sudah ada
  const dur = new Uint8Array(11);
  dur.set([0x44, 0x89, 0x88]);
  new DataView(dur.buffer).setFloat64(3, ms);
  const isiBaru = isi.length + dur.length, ukuranBaru = new Uint8Array(8);
  ukuranBaru[0] = 0x01;
  for (let k = 7, v = isiBaru; k >= 1; k--, v = Math.floor(v / 256)) ukuranBaru[k] = v % 256;
  return new Blob([u.subarray(0, info + 4), ukuranBaru, isi, dur, u.subarray(akhirIsi)], { type: blob.type });
}
export async function tandaiDisimpan(s) { s.disimpan = new Date().toISOString(); await simpanSegmen(s); }
export async function hapusSegmen(id) {
  await tx(['segmen', 'potongan'], 'readwrite', (t) => {
    t.objectStore('potongan').delete(rentang(id));
    t.objectStore('segmen').delete(id);
  });
}
// Bagian berstatus 'merekam' sesudah aplikasi dibuka lagi = terputus paksa (browser ditutup/HP mati).
export async function pulihkanTerputus() {
  let n = 0;
  for (const s of await daftar()) {
    if (s.status === 'merekam' && !(st.seg && st.seg.id === s.id)) {
      s.status = 'terputus'; s.selesai = s.diperbarui || s.mulai; n++;
      await simpanSegmen(s);
    }
  }
  return n;
}

// ---------------------------------------------------------------- keadaan
const st = {
  aktif: false, jeda: false, opsi: null, aliran: [], video: [], kanvas: null, ctx: null, keluar: null,
  rekamer: null, seg: null, idx: 0, rantai: Promise.resolve(), timerGambar: null, timerBagian: null,
  timerRuang: null, kunciLayar: null, catatan: '', mulaiTotal: 0, ukuranTotal: 0, sisa: null, ulang: [],
};
let pendengar = () => {};
let pesan = () => {};
export function saatBerubah(f) { pendengar = f; }
export function saatPesan(f) { pesan = f; }
const beritahu = () => { try { pendengar(keadaan()); } catch (_) { /* UI tidak boleh mengganggu perekam */ } };
const modeNyata = () => (st.aliran.length > 1 ? 'dua' : st.opsi?.mode === 'depan' ? 'depan' : 'belakang');
export function keadaan() {
  return {
    aktif: st.aktif, jeda: st.jeda, mulai: st.mulaiTotal, ukuran: st.ukuranTotal, sisa: st.sisa,
    mode: modeNyata(), lokasi: st.seg?.lokasi?.nama || '', catatan: st.catatan,
    mutu: st.opsi?.mutu,
  };
}

// WebM dulu: di Chrome, MP4 menahan seluruh video di memori sampai rekaman dihentikan (potongan 3 detik
// kosong), jadi bila halaman mati videonya hilang; WebM menyerahkan potongan tiap 3 detik. Di antara
// WebM dipilih penyandi yang menurut browser hemat daya (perangkat keras) agar HP tidak panas berjam-jam:
// VP8 (diputar di semua HP), H.264, lalu VP9. MP4 hanya untuk Safari (iPhone/iPad), yang tidak punya WebM.
const CALON_MIME = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm',
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4'];
export async function pilihMime(mutu = 'sedang') {
  if (!window.MediaRecorder) return null;
  const ada = CALON_MIME.filter((m) => MediaRecorder.isTypeSupported(m));
  const m = MUTU[mutu];
  for (const mime of ada) {
    if (!mime.includes('codecs=')) continue;
    try {
      const info = await navigator.mediaCapabilities.encodingInfo({ type: 'record', video: {
        contentType: mime.replace(/,opus$/, '').replace(',mp4a.40.2', ''), width: m.lebar, height: Math.round(m.lebar * 9 / 16),
        bitrate: m.bps, framerate: m.fps } });
      if (info.supported && info.powerEfficient) return mime;
    } catch (_) { break; }                                   // mediaCapabilities tidak ada: pakai urutan saja
  }
  return ada[0] || '';
}
export const bisaRekam = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder
  && HTMLCanvasElement.prototype.captureStream);

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
function hentikanAliran(a) { for (const t of a?.getTracks() || []) t.stop(); }

async function siapkanVideo(aliran) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = aliran;
  await v.play().catch(() => {});
  for (let i = 0; i < 50 && !v.videoWidth; i++) await tunggu(60);
  return v;
}

// ---------------------------------------------------------------- kamera
async function nyalakan() {
  const m = MUTU[st.opsi.mutu];
  const syarat = (arah, w, h) => ({ facingMode: { ideal: arah }, width: { ideal: w }, height: { ideal: h },
    frameRate: { ideal: m.fps, max: 30 } });
  const utama = st.opsi.mode === 'depan' ? 'user' : 'environment';
  const suara = st.opsi.suara ? { echoCancellation: true, noiseSuppression: true } : false;
  let a = await navigator.mediaDevices.getUserMedia({ video: syarat(utama, m.lebar, Math.round(m.lebar * 9 / 16)), audio: suara });
  st.aliran = [a]; st.catatan = '';
  if (st.opsi.mode === 'dua') {
    let b = null;
    try {
      b = await navigator.mediaDevices.getUserMedia({ video: syarat('user', 480, 360) });
      const idA = a.getVideoTracks()[0].getSettings().deviceId;
      if (idA && b.getVideoTracks()[0].getSettings().deviceId === idA) {
        hentikanAliran(b); b = null;
        const lain = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.deviceId && d.deviceId !== idA);
        const depan = lain.find((d) => /front|depan|user|facing front/i.test(d.label)) || lain[0];
        if (!depan) throw new Error('hanya satu kamera');
        b = await navigator.mediaDevices.getUserMedia({ video: { ...syarat('user', 480, 360), facingMode: undefined, deviceId: { exact: depan.deviceId } } });
      }
      await tunggu(700);
      const ta = a.getVideoTracks()[0], tb = b.getVideoTracks()[0];
      const sama = ta.getSettings().deviceId && ta.getSettings().deviceId === tb.getSettings().deviceId;
      if (sama || ta.readyState !== 'live' || tb.readyState !== 'live') throw new Error('tidak bersamaan');
      st.aliran.push(b);
    } catch (_) {
      hentikanAliran(b);
      st.catatan = 'HP ini tidak bisa memakai kamera depan dan belakang bersamaan; direkam kamera belakang + suara.';
      if (a.getVideoTracks()[0].readyState !== 'live') {          // kamera depan merebut kamera belakang
        hentikanAliran(a);
        a = await navigator.mediaDevices.getUserMedia({ video: syarat('environment', m.lebar, Math.round(m.lebar * 9 / 16)), audio: suara });
        st.aliran = [a];
      }
    }
  }
  st.video = await Promise.all(st.aliran.map(siapkanVideo));
  const v0 = st.video[0], rasio = (v0.videoWidth && v0.videoHeight) ? v0.videoWidth / v0.videoHeight : 16 / 9;
  let W = rasio >= 1 ? m.lebar : Math.round(m.lebar * rasio), H = rasio >= 1 ? Math.round(m.lebar / rasio) : m.lebar;
  W -= W % 2; H -= H % 2;
  st.kanvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  st.ctx = st.kanvas.getContext('2d', { alpha: false });
  gambar();
  st.timerGambar = setInterval(gambar, Math.round(1000 / m.fps));
  st.keluar = st.kanvas.captureStream(m.fps);
  for (const t of a.getAudioTracks()) st.keluar.addTrack(t);
  for (const s of st.aliran) for (const t of s.getTracks()) {
    t.addEventListener('ended', () => { if (st.aktif && !st.jeda && document.visibilityState === 'visible') mulaiUlang(); });
  }
  await segmenBaru();
}

async function matikanKamera() {
  clearInterval(st.timerGambar); st.timerGambar = null;
  for (const a of st.aliran) hentikanAliran(a);
  for (const v of st.video) v.srcObject = null;
  st.aliran = []; st.video = []; st.keluar = null;
}

function pas(ctx, v, x, y, w, h) {                 // gambar video utuh di dalam kotak (tanpa terpotong)
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) return;
  const s = Math.min(w / vw, h / vh), dw = vw * s, dh = vh * s;
  ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function gambar() {
  const c = st.ctx, W = st.kanvas.width, H = st.kanvas.height;
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  if (st.video[0]) pas(c, st.video[0], 0, 0, W, H);
  const v1 = st.video[1];
  if (v1 && v1.videoWidth) {
    const w = Math.round(Math.min(W, H) * 0.34), h = Math.round(w * v1.videoHeight / v1.videoWidth), x = W - w - 10, y = 10;
    c.fillStyle = '#fff'; c.fillRect(x - 2, y - 2, w + 4, h + 4);
    c.drawImage(v1, x, y, w, h);
  }
  const huruf = Math.max(13, Math.round(Math.min(W, H) / 26));
  const teks = `${st.seg?.lokasi?.nama ? st.seg.lokasi.nama + ' · ' : ''}${new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' })}`;
  c.font = `600 ${huruf}px system-ui, sans-serif`;
  const lebarTeks = c.measureText(teks).width;
  c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(6, H - huruf - 14, lebarTeks + 12, huruf + 10);
  c.fillStyle = '#fff'; c.fillText(teks, 12, H - 11);
}

// ---------------------------------------------------------------- bagian (berkas) video
async function segmenBaru() {
  const m = MUTU[st.opsi.mutu];
  if (st.mime === undefined) st.mime = await pilihMime(st.opsi.mutu);
  const mime = st.mime;
  const r = new MediaRecorder(st.keluar, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: m.bps, audioBitsPerSecond: BPS_SUARA });
  const lok = st.opsi.lokasi ? st.opsi.lokasi() : null;
  const sekarang = new Date().toISOString();
  const seg = {
    id: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), mulai: sekarang, diperbarui: sekarang,
    selesai: null, lokasi: lok ? { id: lok.id, nama: lok.nama } : null, mode: modeNyata(),
    mutu: st.opsi.mutu, mime: r.mimeType || mime || 'video/webm', ukuran: 0, n: 0, status: 'merekam', catatan: st.catatan,
  };
  await simpanSegmen(seg);
  st.seg = seg; st.idx = 0; st.rekamer = r;
  r.ondataavailable = (e) => {
    if (!e.data || !e.data.size) return;
    const i = st.idx++, blob = e.data;
    st.rantai = st.rantai.then(() => tx(['potongan', 'segmen'], 'readwrite', (t) => {
      t.objectStore('potongan').put(blob, kunci(seg.id, i));
      seg.ukuran += blob.size; seg.n = i + 1; seg.diperbarui = new Date().toISOString();
      t.objectStore('segmen').put({ ...seg });
    })).then(() => { st.ukuranTotal += blob.size; beritahu(); })
      .catch((err) => {
        if (err && err.name === 'QuotaExceededError') {
          pesan('Penyimpanan HP penuh: rekaman dihentikan. Simpan lalu hapus video lama.');
          berhenti();
        } else pesan('Gagal menyimpan potongan video: ' + (err && err.message));
      });
  };
  r.onstop = () => {
    st.rantai = st.rantai.then(async () => {
      seg.status = 'selesai'; seg.selesai = new Date().toISOString();
      await simpanSegmen(seg);
    }).catch(() => {});
  };
  r.onerror = () => { if (st.aktif) mulaiUlang(); };
  r.start(POTONG_MS);
  clearTimeout(st.timerBagian);
  st.timerBagian = setTimeout(() => gantiBagian().catch(() => {}), BAGIAN_MS);
  beritahu();
}

function hentikanRekamer(r) {
  return new Promise((ok) => {
    if (!r || r.state === 'inactive') { ok(); return; }
    r.addEventListener('stop', () => ok(), { once: true });
    try { r.stop(); } catch (_) { ok(); }
  });
}

async function gantiBagian() {
  if (!st.aktif || st.jeda || !st.keluar) return;
  const lama = st.rekamer;
  await hentikanRekamer(lama);
  await st.rantai;
  if (st.aktif && !st.jeda && st.keluar) await segmenBaru();
}

// Kamera terputus (direbut aplikasi lain, perekam galat): tutup bagian ini lalu mulai lagi. Paling banyak
// 3 kali per menit agar tidak berputar terus bila kamera memang tidak tersedia.
async function mulaiUlang() {
  const kini = Date.now();
  st.ulang = st.ulang.filter((t) => kini - t < 60_000);
  if (st.ulang.length >= 3) { pesan('Kamera terus terputus; rekaman dihentikan.'); await berhenti(); return; }
  st.ulang.push(kini);
  clearTimeout(st.timerBagian);
  await hentikanRekamer(st.rekamer); st.rekamer = null;
  await st.rantai; await matikanKamera();
  try { await nyalakan(); pesan('Kamera tersambung lagi; rekaman berlanjut.'); } catch (e) { pesan('Gagal menyambung kamera: ' + e.message); await berhenti(); }
}

// ---------------------------------------------------------------- layar dan ruang
async function kunciLayar() {
  try {
    if ('wakeLock' in navigator && !st.kunciLayar && document.visibilityState === 'visible') {
      st.kunciLayar = await navigator.wakeLock.request('screen');
      st.kunciLayar.addEventListener('release', () => { st.kunciLayar = null; });
    }
  } catch (_) { /* tidak didukung atau ditolak: layar mengikuti setelan HP */ }
}
async function periksaRuang() {
  try {
    const e = await navigator.storage.estimate();
    st.sisa = e.quota - e.usage;
    if (st.aktif && st.sisa < SISA_MIN) { pesan('Penyimpanan hampir penuh: rekaman dihentikan. Simpan lalu hapus video lama.'); await berhenti(); }
    beritahu();
  } catch (_) { /* estimate tidak tersedia */ }
}
export async function sisaRuang() {
  try { const e = await navigator.storage.estimate(); return e.quota - e.usage; } catch (_) { return null; }
}

// ---------------------------------------------------------------- mulai / berhenti / lokasi
// opsi: { mode: 'dua'|'belakang'|'depan', mutu: 'hemat'|'sedang'|'jelas', suara: bool, lokasi: () => {id, nama}|null }
export async function mulai(opsi) {
  if (st.aktif) return keadaan();
  st.opsi = opsi; st.aktif = true; st.jeda = false; st.mulaiTotal = Date.now(); st.ukuranTotal = 0; st.ulang = []; st.mime = undefined;
  try { await navigator.storage?.persist?.(); } catch (_) { /* opsional */ }
  try { await nyalakan(); } catch (e) { st.aktif = false; await matikanKamera(); beritahu(); throw e; }
  await kunciLayar();
  st.timerRuang = setInterval(periksaRuang, 30_000); periksaRuang();
  return keadaan();
}

export async function berhenti() {
  if (!st.aktif) return;
  st.aktif = false; st.jeda = false;
  clearTimeout(st.timerBagian); clearInterval(st.timerRuang);
  await hentikanRekamer(st.rekamer); st.rekamer = null;
  await st.rantai;
  await matikanKamera();
  st.seg = null;
  try { await st.kunciLayar?.release(); } catch (_) { /* sudah lepas */ }
  st.kunciLayar = null;
  beritahu();
}

// Pindah ke lokasi lain saat merekam: mulai bagian baru agar setiap berkas berlabel satu lokasi.
export function lokasiBerubah() {
  if (!st.aktif || st.jeda || !st.seg) return;
  const l = st.opsi.lokasi ? st.opsi.lokasi() : null;
  if ((l?.id || null) !== (st.seg.lokasi?.id || null)) gantiBagian().catch(() => {});
}

// Diurutkan: sembunyi lalu tampil lagi dengan cepat tidak boleh menyalakan kamera sebelum yang lama mati.
let urutLayar = Promise.resolve();
document.addEventListener('visibilitychange', () => { urutLayar = urutLayar.then(gantiLayar, gantiLayar); });
async function gantiLayar() {
  if (!st.aktif) return;
  if (document.visibilityState === 'hidden') {
    if (st.jeda) return;
    st.jeda = true;
    clearTimeout(st.timerBagian);
    try { st.rekamer?.requestData(); } catch (_) { /* tidak aktif */ }
    await hentikanRekamer(st.rekamer); st.rekamer = null;
    await st.rantai; await matikanKamera();
    beritahu();
  } else if (st.jeda) {
    st.jeda = false;
    try {
      await nyalakan(); await kunciLayar();
      pesan('Rekaman dilanjutkan (bagian baru).');
    } catch (e) { pesan('Gagal melanjutkan rekaman: ' + e.message); await berhenti(); }
    beritahu();
  }
}
window.addEventListener('pagehide', () => { try { st.rekamer?.requestData(); } catch (_) { /* tidak aktif */ } });
