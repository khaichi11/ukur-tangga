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
export const simpanSegmen = (s) => tx(['segmen'], 'readwrite', (t) => { t.objectStore('segmen').put({ ...s }); });

export const namaVideo = (s) => self.IntiUnggah.namaVideo(s);

// Sesudah Drive menerima berkas: catat tautannya. Salinan di HP TIDAK dihapus di sini.
export async function tandaiTerunggah(s, info) {
  s.drive_id = info.id; s.drive_link = info.link || ''; s.drive_folder = info.folder || s.drive_folder || '';
  s.terunggah = new Date().toISOString(); s.sesi_url = null;
  await simpanSegmen(s);
}

// Sesudah ukuran dan SHA-256 berkas di Drive terbukti sama dengan di HP: baru boleh hapus potongan di HP.
export async function tandaiTerverifikasi(s, hapusLokal) {
  s.terverifikasi = new Date().toISOString();
  if (hapusLokal) {
    s.lokal = false;
    await tx(['segmen', 'potongan'], 'readwrite', (t) => {
      t.objectStore('potongan').delete(rentang(s.id));
      t.objectStore('segmen').put({ ...s });
    });
  } else await simpanSegmen(s);
}

// Rekaman berawalan "__" (pengaturan untuk service worker) bukan video.
export const daftar = () => self.IntiUnggah.daftar();
// Sama persis dengan yang diunggah (inti_unggah.js): potongan + durasi WebM.
export const blobSegmen = (s) => self.IntiUnggah.blobSegmen(s);

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
let bagianSelesai = () => {};
export function saatBagianSelesai(f) { bagianSelesai = f; }
export function saatBerubah(f) { pendengar = f; }
export function saatPesan(f) { pesan = f; }
const beritahu = () => { try { pendengar(keadaan()); } catch (_) { /* UI tidak boleh mengganggu perekam */ } };
const modeNyata = () => (st.video.length > 1 ? 'dua' : st.arah === 'user' ? 'depan' : 'belakang');
export const kanvas = () => st.kanvas;
export function keadaan() {
  return {
    aktif: st.aktif, jeda: st.jeda, mulai: st.mulaiTotal, ukuran: st.ukuranTotal, sisa: st.sisa,
    mode: modeNyata(), lokasi: st.seg?.lokasi?.nama || '', tangga: st.seg?.tangga?.nomor || null, catatan: st.catatan,
    mutu: st.opsi?.mutu,
  };
}

// WebM VP8: di Chrome, MP4 menahan seluruh video di memori sampai rekaman dihentikan (potongan 3 detik
// kosong), jadi bila halaman mati videonya hilang; WebM menyerahkan potongan tiap 3 detik. VP8 diputar di
// semua HP (galeri, Chrome, Drive); H.264 di dalam WebM tidak selalu bisa diputar, jadi tidak dipakai.
// MP4 hanya untuk Safari (iPhone/iPad), yang tidak punya WebM.
const CALON_MIME = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm',
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4'];
export async function pilihMime() {
  if (!window.MediaRecorder) return null;
  return CALON_MIME.find((m) => MediaRecorder.isTypeSupported(m)) || '';
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
function syarat(arah, w, h, perangkat = '') {
  const m = MUTU[st.opsi.mutu];
  const dasar = { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: m.fps, max: 30 } };
  return perangkat ? { ...dasar, deviceId: { exact: perangkat } } : { ...dasar, facingMode: { ideal: arah } };
}

// ---------------------------------------------------------------- daftar kamera
// Chrome di Android menampilkan tiap lensa sebagai perangkat sendiri bila HP mengizinkan, mis.
// "camera2 0, facing back", "camera2 2, facing back". Nama lensa (utama/lebar/makro) tidak diberikan, jadi
// ditebak dari resolusi maksimum (makro biasanya <= 2 MP, utama terbesar) dan dipastikan lewat pratinjau.
// Di Android, kamera Camera2 dengan id 0 hampir selalu kamera belakang utama ("camera2 0, facing back").
const idKamera = (label) => { const m = /camera\s*2?\s*(\d+)/i.exec(label || ''); return m ? Number(m[1]) : null; };
export async function kameraUtamaBelakang() {
  try {
    const d = (await navigator.mediaDevices.enumerateDevices()).filter((x) => x.kind === 'videoinput' && x.label);
    const b = d.filter((x) => arahDari(x.label) === 'belakang');
    return (b.find((x) => idKamera(x.label) === 0) || b.sort((x, y) => (idKamera(x.label) ?? 99) - (idKamera(y.label) ?? 99))[0])?.deviceId || '';
  } catch (_) { return ''; }
}
const arahDari = (label) => (/front|depan|user|selfie/i.test(label) ? 'depan' : /back|belakang|rear|environment/i.test(label) ? 'belakang' : '');
export async function daftarKamera(rinci = false) {
  let d = (await navigator.mediaDevices.enumerateDevices()).filter((x) => x.kind === 'videoinput');
  if (d.length && !d[0].label) {                      // nama baru terlihat sesudah izin kamera
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    hentikanAliran(s);
    d = (await navigator.mediaDevices.enumerateDevices()).filter((x) => x.kind === 'videoinput');
  }
  const hasil = d.map((x, i) => ({ id: x.deviceId, label: x.label || `Kamera ${i + 1}`, arah: arahDari(x.label) }));
  if (rinci && !st.aktif) {
    for (const k of hasil) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: k.id } } });
        const c = s.getVideoTracks()[0].getCapabilities ? s.getVideoTracks()[0].getCapabilities() : {};
        k.lebarMaks = c.width?.max || 0; k.zoom = c.zoom || null;
        if (!k.arah && c.facingMode?.length) k.arah = c.facingMode[0] === 'user' ? 'depan' : 'belakang';
        hentikanAliran(s);
      } catch (_) { k.gagal = true; }
    }
    // Utama: id Camera2 0 bila ada (patokan Android); kalau tidak, resolusi terbesar. Makro: resolusi terkecil
    // (<= 2,6 MP lebar). Sisanya kemungkinan wide. Chrome sering membatasi resolusi yang dilaporkan, jadi ini
    // hanya tebakan: pastikan dengan pratinjau.
    const belakang = hasil.filter((k) => k.arah !== 'depan' && !k.gagal).sort((a, b) => (b.lebarMaks || 0) - (a.lebarMaks || 0));
    if (belakang.length > 1) {
      const utama = belakang.find((k) => idKamera(k.label) === 0) || (belakang[0].lebarMaks > (belakang[belakang.length - 1].lebarMaks || 0) ? belakang[0] : null);
      if (utama) utama.tebakan = 'utama';
      const kecil = belakang[belakang.length - 1];
      if (kecil !== utama && kecil.lebarMaks && kecil.lebarMaks <= 2600) kecil.tebakan = 'makro';
      if (utama) belakang.filter((k) => !k.tebakan).forEach((k) => { k.tebakan = 'wide'; });
    }
  }
  let nb = 0, nd = 0;
  for (const k of hasil) k.nama = k.arah === 'depan' ? `Depan ${++nd}` : `Belakang ${++nb}`;
  return hasil;
}

async function nyalakan() {
  const m = MUTU[st.opsi.mutu];
  const utama = st.opsi.utama || (st.opsi.mode === 'depan' ? 'user' : 'environment');
  st.arah = utama;
  // deviceId kamera pilihan pengguna (mis. lensa wide); Otomatis = kamera belakang utama (Camera2 id 0), bukan
  // sembarang kamera belakang yang dipilih Chrome lewat facingMode.
  const pilihan = st.opsi.kamera || (utama === 'environment' ? await kameraUtamaBelakang() : '');
  const suara = st.opsi.suara ? { echoCancellation: true, noiseSuppression: true } : false;
  let a;
  try {
    a = await navigator.mediaDevices.getUserMedia({ video: syarat(utama, m.lebar, Math.round(m.lebar * 9 / 16), pilihan), audio: suara });
  } catch (e) {
    if (!pilihan) throw e;                            // kamera pilihan tidak ada lagi: pakai bawaan
    st.opsi.kamera = '';
    a = await navigator.mediaDevices.getUserMedia({ video: syarat(utama, m.lebar, Math.round(m.lebar * 9 / 16)), audio: suara });
  }
  st.aliran = [a]; st.catatan = '';
  if (st.opsi.mode === 'dua') {
    let b = null;
    const lawan = utama === 'user' ? 'environment' : 'user';
    try {
      // Beberapa HP hanya mengizinkan dua kamera sekaligus pada resolusi kecil: coba 480x360 lalu 320x240.
      for (const [w, h] of [[480, 360], [320, 240]]) {
        try { b = await navigator.mediaDevices.getUserMedia({ video: syarat(lawan, w, h) }); break; } catch (e) { b = null; if (w === 320) throw e; }
      }
      const idA = a.getVideoTracks()[0].getSettings().deviceId;
      if (idA && b.getVideoTracks()[0].getSettings().deviceId === idA) {
        hentikanAliran(b); b = null;
        const lain = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.deviceId && d.deviceId !== idA);
        const depan = lain.find((d) => /front|depan|user|facing front/i.test(d.label)) || lain[0];
        if (!depan) throw new Error('hanya satu kamera');
        b = await navigator.mediaDevices.getUserMedia({ video: { ...syarat(lawan, 320, 240), facingMode: undefined, deviceId: { exact: depan.deviceId } } });
      }
      await tunggu(700);
      const ta = a.getVideoTracks()[0], tb = b.getVideoTracks()[0];
      const sama = ta.getSettings().deviceId && ta.getSettings().deviceId === tb.getSettings().deviceId;
      if (sama || ta.readyState !== 'live' || tb.readyState !== 'live') throw new Error('tidak bersamaan');
      st.aliran.push(b);
    } catch (_) {
      hentikanAliran(b);
      st.catatan = 'HP ini tidak mengizinkan kamera depan dan belakang menyala bersamaan di browser (batasan HP/Chrome). '
        + 'Direkam satu kamera + suara; tekan ⇄ untuk berganti kamera depan/belakang kapan saja tanpa menghentikan rekaman.';
      if (a.getVideoTracks()[0].readyState !== 'live') {          // kamera kedua merebut kamera utama
        hentikanAliran(a);
        a = await navigator.mediaDevices.getUserMedia({ video: syarat(utama, m.lebar, Math.round(m.lebar * 9 / 16), st.opsi.kamera), audio: suara });
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
  const teks = `${st.seg?.lokasi?.nama ? st.seg.lokasi.nama + ' · ' : ''}${st.seg?.tangga ? `Tangga ${st.seg.tangga.nomor} · ` : ''}${new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' })}`;
  c.font = `600 ${huruf}px system-ui, sans-serif`;
  const lebarTeks = c.measureText(teks).width;
  c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(6, H - huruf - 14, lebarTeks + 12, huruf + 10);
  c.fillStyle = '#fff'; c.fillText(teks, 12, H - 11);
}

// ---------------------------------------------------------------- bagian (berkas) video
async function segmenBaru() {
  const m = MUTU[st.opsi.mutu];
  if (st.mime === undefined) st.mime = await pilihMime();
  const mime = st.mime;
  const r = new MediaRecorder(st.keluar, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: m.bps, audioBitsPerSecond: BPS_SUARA });
  const lok = st.opsi.lokasi ? st.opsi.lokasi() : null, tgg = lok && st.opsi.tangga ? st.opsi.tangga() : null;
  const sekarang = new Date().toISOString();
  const seg = {
    id: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), mulai: sekarang, diperbarui: sekarang,
    selesai: null, lokasi: lok ? { id: lok.id, nama: lok.nama } : null, tangga: tgg ? { id: tgg.id, nomor: tgg.nomor } : null, mode: modeNyata(),
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
      try { bagianSelesai(seg); } catch (_) { /* pengunggah tidak boleh mengganggu perekam */ }
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

// Ganti kamera depan/belakang saat merekam tanpa menghentikan rekaman (kanvas tetap, sumbernya berganti).
// Dua kamera menyala: tukar mana yang besar dan mana yang kecil di pojok.
// perangkat: deviceId kamera tujuan (mis. lensa wide/makro); kosong = depan <-> belakang.
export async function gantiKamera(perangkat = '', arahBaru = '') {
  if (!st.aktif || st.jeda || !st.video.length) return keadaan();
  const arah = arahBaru ? (arahBaru === 'depan' ? 'user' : 'environment') : st.arah === 'user' ? 'environment' : 'user';
  if (st.video.length > 1 && !perangkat) {
    st.video.reverse();
  } else {
    const m = MUTU[st.opsi.mutu];
    if (st.video.length > 1) {                        // dua kamera: kamera kecil dimatikan dulu agar lensa lain bisa dibuka
      st.video.slice(1).forEach((v) => { for (const t of v.srcObject?.getVideoTracks() || []) t.stop(); v.srcObject = null; });
      st.video = st.video.slice(0, 1);
    }
    const baru = await navigator.mediaDevices.getUserMedia({ video: syarat(arah, m.lebar, Math.round(m.lebar * 9 / 16), perangkat) });
    for (const a of st.aliran) for (const t of a.getVideoTracks()) t.stop();       // suara tetap jalan
    const v = await siapkanVideo(baru);
    st.video[0].srcObject = null;
    st.video[0] = v;
    st.aliran.push(baru);
    for (const t of baru.getTracks()) {
      t.addEventListener('ended', () => { if (st.aktif && !st.jeda && document.visibilityState === 'visible') mulaiUlang(); });
    }
  }
  st.arah = arah;
  st.opsi.utama = arah;                       // dipakai lagi bila rekaman dilanjutkan sesudah layar mati
  st.opsi.kamera = perangkat;
  if (perangkat && st.opsi.mode === 'dua') st.opsi.mode = arah === 'user' ? 'depan' : 'belakang';
  beritahu();
  return keadaan();
}

// Zoom kamera utama bila didukung (pada sebagian HP zoom < 1 = lensa wide).
export function infoZoom() {
  const t = st.video[0]?.srcObject?.getVideoTracks()[0];
  const c = t?.getCapabilities ? t.getCapabilities() : {};
  if (!c.zoom) return null;
  return { min: c.zoom.min, max: c.zoom.max, step: c.zoom.step || 0.1, kini: t.getSettings().zoom ?? c.zoom.min };
}
export async function aturZoom(z) {
  const t = st.video[0]?.srcObject?.getVideoTracks()[0];
  if (t) await t.applyConstraints({ advanced: [{ zoom: z }] });
}
export const kameraKini = () => st.video[0]?.srcObject?.getVideoTracks()[0]?.getSettings().deviceId || '';

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
  st.opsi = { ...opsi }; st.aktif = true; st.jeda = false; st.mulaiTotal = Date.now(); st.ukuranTotal = 0; st.ulang = []; st.mime = undefined;
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

// Pindah lokasi atau tangga saat merekam: mulai bagian baru agar setiap berkas berlabel satu lokasi + tangga.
export function lokasiBerubah() {
  if (!st.aktif || st.jeda || !st.seg) return;
  const l = st.opsi.lokasi ? st.opsi.lokasi() : null, t = l && st.opsi.tangga ? st.opsi.tangga() : null;
  if ((l?.id || null) !== (st.seg.lokasi?.id || null) || (t?.id || null) !== (st.seg.tangga?.id || null)
      || (t?.nomor || null) !== (st.seg.tangga?.nomor || null)) gantiBagian().catch(() => {});
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
