// Inti unggah video ke Google Drive, dipakai halaman (unggah_video.js) dan service worker (sw.js), jadi
// unggah tetap berjalan sesudah layar dimatikan atau aplikasi ditinggal (Background Sync, beberapa menit
// per kesempatan; sisanya dilanjutkan saat aplikasi dibuka lagi). Skrip biasa (bukan modul) agar bisa
// dimuat dengan importScripts di service worker; semuanya di self.IntiUnggah.
//
// Hanya satu pengunggah berjalan pada satu waktu (Web Locks 'unggah-video'). Halaman mengunggah selama
// terlihat dan menyerahkan ke service worker saat disembunyikan.
//
// Salinan di HP baru dihapus (bisa dimatikan) sesudah skrip Google memeriksa berkas di Drive: masih ada,
// ukurannya sama, dan SHA-256-nya sama persis dengan salinan di HP. Bila berbeda, video diunggah ulang
// (paling banyak 3 kali) ke folder "Video (2)"; aplikasi tidak pernah menghapus apa pun di Drive.
(function () {
  'use strict';
  const NAMA_DB = 'ukur-tangga-video';
  const POTONG = 4 * 1024 * 1024;            // kelipatan 256 KiB (syarat sesi unggah Drive)
  const ATUR = '__atur';                      // rekaman pengaturan untuk service worker (bukan video)

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
      dbJanji = null;
      return txSekali(stores, mode, kerja);
    }
  }
  const rentang = (id) => IDBKeyRange.bound(`${id}:`, `${id}:￿`);
  const simpanSegmen = (s) => tx(['segmen'], 'readwrite', (t) => { t.objectStore('segmen').put({ ...s }); });
  async function daftar() {
    const semua = await tx(['segmen'], 'readonly', (t) => t.objectStore('segmen').getAll());
    return (semua || []).filter((s) => !String(s.id).startsWith('__')).sort((a, b) => (a.mulai < b.mulai ? 1 : -1));
  }
  async function bacaAturLatar() { return (await tx(['segmen'], 'readonly', (t) => t.objectStore('segmen').get(ATUR))) || null; }
  const simpanAturLatar = (isi) => tx(['segmen'], 'readwrite', (t) => { t.objectStore('segmen').put({ id: ATUR, ...isi }); });

  // ---------------------------------------------------------------- berkas video
  function namaVideo(s) {
    const d = new Date(s.mulai), p = (x) => String(x).padStart(2, '0');
    const ext = s.mime.includes('mp4') ? 'mp4' : 'webm';
    const dasar = (s.lokasi?.nama || 'kegiatan').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'kegiatan';
    return `video_${dasar}${s.tangga ? `_tangga${s.tangga.nomor}` : ''}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
  }

  // WebM dari MediaRecorder tidak memuat durasi, sehingga galeri HP tidak bisa menggeser (seek). Tambahkan
  // elemen Duration (milidetik) ke Segment > Info pada potongan pertama.
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
    for (let i = 0; i + 1 < isi.length; i++) if (isi[i] === 0x44 && isi[i + 1] === 0x89) return blob;
    const dur = new Uint8Array(11);
    dur.set([0x44, 0x89, 0x88]);
    new DataView(dur.buffer).setFloat64(3, ms);
    const isiBaru = isi.length + dur.length, ukuranBaru = new Uint8Array(8);
    ukuranBaru[0] = 0x01;
    for (let k = 7, v = isiBaru; k >= 1; k--, v = Math.floor(v / 256)) ukuranBaru[k] = v % 256;
    return new Blob([u.subarray(0, info + 4), ukuranBaru, isi, dur, u.subarray(akhirIsi)], { type: blob.type });
  }

  // Blob satu bagian, sama persis setiap kali dibuat (untuk unggah dan pemeriksaan SHA-256).
  async function blobSegmen(s) {
    const bagian = (await tx(['potongan'], 'readonly', (t) => t.objectStore('potongan').getAll(rentang(s.id)))) || [];
    const lama = Date.parse(s.selesai || s.diperbarui) - Date.parse(s.mulai);
    if (bagian.length && s.mime.includes('webm') && lama > 0) {
      try { bagian[0] = await isiDurasiWebm(bagian[0], lama); } catch (_) { /* tetap bisa diputar tanpa durasi */ }
    }
    return new Blob(bagian, { type: s.mime.split(';')[0] });
  }

  async function sha256(blob) {
    const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function keBase64(blob) {
    const u = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // Panggil skrip Google (sama dengan sinkron.panggil, tanpa window).
  async function panggil(g, isi, batasMs = 120000) {
    let r;
    try {
      r = await fetch(g.url, { method: 'POST', body: JSON.stringify({ ...isi, kunci: g.kunci || '' }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(batasMs) : undefined });
    } catch (e) {
      if (navigator.onLine === false) throw new Error('menunggu internet');
      throw new Error(e.name === 'TimeoutError' ? 'Google tidak menjawab' : 'tidak tersambung ke Google');
    }
    let j;
    try { j = JSON.parse(await r.text()); } catch (_) { throw new Error(`balasan bukan dari skrip Ukur Tangga (HTTP ${r.status})`); }
    if (!j.ok) { const e = new Error(j.galat || 'ditolak skrip'); e.kode = j.kode || ''; throw e; }
    return j;
  }

  // ---------------------------------------------------------------- aturan antre
  // Milidetik sampai bagian ini boleh diunggah (<= 0 = sekarang; Infinity = menunggu Unggah sekarang).
  function sisaTunda(s, a) {
    if (s.drive_id || s.unggah_sekarang) return 0;
    const t = Number(a.tunda ?? 10);
    if (t < 0) return Infinity;
    return Date.parse(s.selesai || s.diperbarui || s.mulai) + t * 60000 - Date.now();
  }
  const perluDiurus = (s) => (s.status === 'selesai' || s.status === 'terputus') && s.lokal !== false && s.ukuran > 0
    && !s.terverifikasi && !(s.unggah_ulang > 3);
  function bolehJaringan(a) {
    if (navigator.onLine === false) return false;
    const c = navigator.connection;
    return !(a.hanyaWifi && c && c.type && c.type !== 'wifi' && c.type !== 'ethernet');
  }

  // ---------------------------------------------------------------- jalankan
  // a: pengaturan (folder, tunda, hanyaWifi, hapusLokal, jalur), g: { url, kunci } skrip Google.
  // cb: { kemajuan(s, terkirim, total), selesai(s), jalur(j) }, signal: AbortSignal (halaman disembunyikan).
  // Hasil: { status: 'beres'|'sibuk'|'jeda'|'jaringan', berikutMs, galat }.
  async function jalankan(a, g, cb = {}, signal = null) {
    if (!g || !g.url) return { status: 'beres' };
    const kerja = async () => {
      for (;;) {
        if (signal?.aborted) return { status: 'jeda' };
        if (!bolehJaringan(a)) return { status: 'jaringan', galat: navigator.onLine === false ? 'menunggu internet' : 'menunggu Wi-Fi' };
        const calon = (await daftar()).filter(perluDiurus).reverse();
        const antre = calon.filter((s) => sisaTunda(s, a) <= 0);
        const tunggu = calon.map((s) => sisaTunda(s, a)).filter((ms) => ms > 0 && Number.isFinite(ms));
        if (!antre.length) return { status: 'beres', berikutMs: tunggu.length ? Math.min(...tunggu) : null };
        const s = antre[0];
        if (!s.drive_id && !await unggah(s, a, g, cb, signal)) {
          if (signal?.aborted) return { status: 'jeda' };
          throw new Error('Drive belum mengonfirmasi video; dicoba lagi nanti');
        }
        if (s.drive_id) await periksa(s, a, g, cb);
      }
    };
    if (self.navigator?.locks) {
      return navigator.locks.request('unggah-video', { ifAvailable: true }, (kunci) => (kunci ? kerja() : { status: 'sibuk' }));
    }
    return kerja();
  }

  async function unggah(s, a, g, cb, signal) {
    cb.kemajuan?.(s, s.terkirim || 0, s.sesi_total || s.ukuran || 1);   // tampilkan sejak menyiapkan
    const blob = await blobSegmen(s);
    const total = blob.size, mime = blob.type || 'video/webm';
    const folder = a.folder || '';
    if (!s.sesi_url || s.sesi_total !== total || (s.sesi_folder || '') !== folder) {
      const d = new Date(s.mulai), p = (x) => String(x).padStart(2, '0');
      if (!s.sha256 || s.sha_total !== total) { s.sha256 = await sha256(blob); s.sha_total = total; }
      const j = await panggil(g, { aksi: 'video_sesi', ...(folder ? { folder } : {}), nama: namaVideo(s), mime, ukuran: total, sha256: s.sha256,
        tanggal: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, lokasi: s.lokasi?.nama || 'Tanpa lokasi', lokasi_id: s.lokasi?.id || '',
        tangga: s.tangga?.nomor || '', tangga_id: s.tangga?.id || '', asal: self.location.origin,
        keterangan: `Ukur Tangga · ${s.lokasi?.nama || 'tanpa lokasi'}${s.tangga ? ` · tangga ${s.tangga.nomor}` : ''} · ${d.toLocaleString('id-ID')}` });
      if (j.sudah_ada) {                                         // sama persis sudah di Drive: tidak dikirim ulang
        s.drive_folder = j.folder; s.sesi_total = total;
        await terunggah(s, { id: j.id, link: j.link }, cb);
        return true;
      }
      Object.assign(s, { sesi_url: j.url, sesi_total: total, sesi_folder: folder, drive_folder: j.folder, terkirim: 0 });
      await simpanSegmen(s);
    }
    let jalur = a.jalur || 'langsung';
    cb.kemajuan?.(s, s.terkirim || 0, total);                     // tampilkan sejak awal, bukan sesudah potongan pertama
    while (s.terkirim < total) {
      if (signal?.aborted) return false;
      if (!bolehJaringan(a)) throw new Error(navigator.onLine === false ? 'menunggu internet' : 'menunggu Wi-Fi');
      const akhir = Math.min(total, s.terkirim + POTONG);
      const potong = blob.slice(s.terkirim, akhir);
      let h;
      if (jalur === 'langsung') {
        try { h = await kirimLangsung(s.sesi_url, potong, s.terkirim, akhir, total, signal); } catch (e) {
          if (signal?.aborted) return false;
          if (navigator.onLine === false) throw new Error('menunggu internet');
          jalur = 'skrip'; a.jalur = 'skrip'; cb.jalur?.('skrip');      // browser menolak: lewat skrip seterusnya
          h = await tanyaPosisi(g, s, total);
          if (h.selesai) { await terunggah(s, h, cb); return true; }
          if (h.kadaluarsa) { s.sesi_url = null; await simpanSegmen(s); return unggah(s, a, g, cb, signal); }
          continue;
        }
      } else {
        h = await kirimSkrip(g, s.sesi_url, potong, s.terkirim, total, mime);
      }
      if (h.kadaluarsa) { s.sesi_url = null; await simpanSegmen(s); return unggah(s, a, g, cb, signal); }
      if (h.selesai) { await terunggah(s, h, cb); return true; }
      s.terkirim = h.posisi;
      await simpanSegmen(s);
      cb.kemajuan?.(s, s.terkirim, total);
    }
    const h = await tanyaPosisi(g, s, total);                   // semua terkirim tetapi balasan akhir hilang
    if (h.selesai) { await terunggah(s, h, cb); return true; }
    return false;
  }

  async function terunggah(s, h, cb) {
    if (!h.id) throw new Error('Drive tidak mengembalikan id berkas; diperiksa lagi nanti');
    Object.assign(s, { drive_id: h.id, drive_link: h.link || '', terunggah: new Date().toISOString(), sesi_url: null });
    await simpanSegmen(s);
    cb.kemajuan?.(s, s.sesi_total || 0, s.sesi_total || 0);
  }

  // Bukti berkas di Drive utuh sebelum salinan HP dihapus.
  async function periksa(s, a, g, cb) {
    const blob = await blobSegmen(s);
    if (s.sesi_total && blob.size !== s.sesi_total) throw new Error('salinan di HP berubah sejak diunggah; tidak dihapus');
    if (!s.sha256 || s.sha_total !== blob.size) { s.sha256 = await sha256(blob); s.sha_total = blob.size; await simpanSegmen(s); }
    let j;
    try { j = await panggil(g, { aksi: 'video_periksa', id: s.drive_id }); } catch (e) {
      if (/Aksi tidak dikenal/.test(e.message)) throw new Error('skrip Google versi lama tidak bisa memeriksa video: perbarui Kode.gs; video tetap di HP');
      throw e;
    }
    if (j.ada && j.ukuran === blob.size && j.sha256 && j.sha256.toLowerCase() === s.sha256) {
      if (j.link) s.drive_link = j.link;
      s.verif_galat = ''; s.terverifikasi = new Date().toISOString();
      if (a.hapusLokal !== false) {
        s.lokal = false;
        await tx(['segmen', 'potongan'], 'readwrite', (t) => {
          t.objectStore('potongan').delete(rentang(s.id));
          t.objectStore('segmen').put({ ...s });
        });
      } else await simpanSegmen(s);
      cb.selesai?.(s);
      return true;
    }
    if (j.ada && j.ukuran === blob.size && !j.sha256) {
      s.verif_galat = 'Drive belum memberi sidik berkas'; await simpanSegmen(s);
      throw new Error('Drive belum memberi sidik berkas; diperiksa lagi nanti (video tetap di HP)');
    }
    // Hilang atau berbeda: unggah ulang dari HP. Salinan Drive yang berbeda TIDAK dihapus; yang baru masuk
    // "Video (2)" karena namanya sudah dipakai (lihat tempatBerkas_ di Kode.gs).
    Object.assign(s, { verif_galat: j.ada ? `isi di Drive berbeda (${j.ukuran} vs ${blob.size} byte)` : 'berkas tidak ada di Drive',
      drive_id: null, drive_link: '', sesi_url: null, terkirim: 0, unggah_ulang: (s.unggah_ulang || 0) + 1 });
    await simpanSegmen(s);
    return false;
  }

  const posisiDari = (range) => { const m = /bytes=0-(\d+)/.exec(range || ''); return m ? Number(m[1]) + 1 : 0; };
  async function kirimLangsung(url, potong, mulai, akhir, total, signal) {
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Range': `bytes ${mulai}-${akhir - 1}/${total}` }, body: potong, signal });
    if (r.status === 308) return { posisi: r.headers.get('Range') ? posisiDari(r.headers.get('Range')) : akhir };
    if (r.status === 200 || r.status === 201) { const j = await r.json().catch(() => ({})); return { selesai: true, id: j.id, link: j.webViewLink }; }
    if (r.status === 404 || r.status === 410) return { kadaluarsa: true };
    throw new Error(`Drive menolak potongan video (HTTP ${r.status})`);
  }
  async function kirimSkrip(g, url, potong, mulai, total, mime) {
    const j = await panggil(g, { aksi: 'video_potong', url, mulai, total, mime, data: await keBase64(potong) }, 300000);
    return bacaBalasan(j);
  }
  async function tanyaPosisi(g, s, total) {
    const h = bacaBalasan(await panggil(g, { aksi: 'video_potong', url: s.sesi_url, total }));
    if (!h.selesai && !h.kadaluarsa) { s.terkirim = h.posisi; await simpanSegmen(s); }
    return h;
  }
  // Lewat skrip, kepala Range selalu terbaca: tanpa Range berarti belum ada byte yang diterima Drive.
  function bacaBalasan(j) {
    if (j.kode === 308) return { posisi: posisiDari(j.range) };
    if (j.kode === 200 || j.kode === 201) return { selesai: true, id: j.id, link: j.link };
    if (j.kode === 404 || j.kode === 410) return { kadaluarsa: true };
    throw new Error(`Drive menolak potongan video (HTTP ${j.kode}${j.teks ? ': ' + j.teks : ''})`);
  }

  self.IntiUnggah = { db, tx, rentang, daftar, simpanSegmen, blobSegmen, namaVideo, sha256, keBase64, panggil, sisaTunda,
    perluDiurus, jalankan, bacaAturLatar, simpanAturLatar };
})();
