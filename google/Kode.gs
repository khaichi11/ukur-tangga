// Ukur Tangga -> Google Spreadsheet + Google Drive.
//
// Tempel berkas ini di Ekstensi > Apps Script pada spreadsheet tujuan, isi KUNCI, lalu terapkan sebagai
// aplikasi web (Jalankan sebagai: Saya; Yang memiliki akses: Siapa saja). Langkah lengkap: GOOGLE.md.
//
// Yang ditulis:
//   lembar Ringkasan : satu baris per tangga, dengan tautan ke lembar lokasinya
//   lembar <Lokasi>  : satu lembar per lokasi; per tangga satu tabel (No., riser, tread, nilai sebelum ukur
//                      ulang, kapan diubah, jumlah foto), rata-rata/min/maks, lalu bordes sesudahnya
//   lembar Riwayat   : setiap ukuran yang diubah (sebelum, sesudah, selisih)
//   lembar Foto      : satu baris per foto, dengan gambar kecil dan tautan ke berkasnya di Drive
//   lembar Data      : semua anak tangga dalam satu tabel (disembunyikan; untuk filter/olah data)
//   Folder akar: folder yang tautannya ditempel di aplikasi (sekali), atau "Ukur Tangga" bila belum ada.
//     <akar>/dokumen.json                 : seluruh data aplikasi, untuk Pulihkan dari Google
//     <akar>/Cadangan/                    : salinan dokumen.json per hari, dan sebelum ada lokasi yang dihapus
//     <akar>/<Lokasi>/Tangga <n>/ukuran.csv : ukuran anak tangga (dan bordes sesudahnya), ditulis ulang bila berubah
//     <akar>/<Lokasi>/Tangga <n>/Foto/      : gambar JPEG 2048 px
//     <akar>/<Lokasi>/Tangga <n>/Video/     : video kegiatan per bagian, lewat sesi unggah Drive (resumable),
//                                             langsung dari HP atau lewat skrip ini
//   Spreadsheet ini ikut dipindah ke <akar>. Folder lokasi/tangga diberi nama ulang bila lokasinya diganti
//   nama atau nomor tangganya bergeser (bordes ditambah/dihapus).
//
// Skrip ini TIDAK PERNAH menghapus atau membuang berkas di Drive; menghapus adalah wewenang pemilik, manual.
// Berkas yang sama persis tidak dikirim ulang. Bila nama sama tetapi isinya beda (duplikat), berkas baru
// masuk folder baru di sebelahnya: "Foto (2)", "Video (2)", ...

const KUNCI = 'GANTI-DENGAN-KATA-RAHASIA';   // sama dengan isian Kunci di aplikasi
const NAMA_FOLDER = 'Ukur Tangga';
const NAMA_DOKUMEN = 'dokumen.json';
const KOLOM_FOTO = ['Lokasi', 'Tangga', 'Anak tangga', 'Keterangan', 'Status', 'Diambil', 'Gambar', 'Tautan', 'Berkas', 'id', 'drive_id'];
const K = { gambar: 7, tautan: 8, id: 10, drive: 11 };   // nomor kolom (mulai 1); kolom 1-5 ditulis ulang setiap sinkron

// Dibuka di browser: halaman ini hanya penghubung, bukan spreadsheet. Tunjukkan ke mana data sebenarnya.
function doGet() {
  let sheet = '', folder = '';
  try { sheet = SpreadsheetApp.getActive().getUrl(); folder = folder_().getUrl(); } catch (err) { /* belum diizinkan */ }
  const html = '<div style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:24px auto;padding:0 16px">'
    + '<h2>Penghubung Ukur Tangga</h2>'
    + '<p>Alamat ini <b>bukan spreadsheet</b>: ini penghubung antara aplikasi Ukur Tangga dan Google milik Anda. '
    + 'Salin alamat ini (berakhiran <code>/exec</code>) ke aplikasi: tombol <b>Google</b> › <b>Alamat penghubung</b>, bersama kuncinya.</p>'
    + (sheet ? '<p><a target="_blank" href="' + sheet + '">Buka spreadsheet data</a></p>' : '')
    + (folder ? '<p><a target="_blank" href="' + folder + '">Buka folder Drive (ukuran, foto, video)</a></p>' : '')
    + '</div>';
  return HtmlService.createHtmlOutput(html).setTitle('Penghubung Ukur Tangga');
}

function doPost(e) {
  let hasil;
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!KUNCI || KUNCI === 'GANTI-DENGAN-KATA-RAHASIA') throw galat_('Isi KUNCI di Kode.gs lalu terapkan versi baru', 'kunci');
    if (p.kunci !== KUNCI) throw galat_('Kunci salah', 'kunci');
    if (p.aksi === 'video_potong' || p.aksi === 'video_periksa') {   // tanpa kunci skrip: tidak mengubah lembar/berkas lain
      hasil = p.aksi === 'video_potong' ? videoPotong_(p) : videoPeriksa_(p);
      hasil.ok = true;
      return ContentService.createTextOutput(JSON.stringify(hasil)).setMimeType(ContentService.MimeType.JSON);
    }
    const kunci = LockService.getScriptLock();
    kunci.waitLock(60000);
    try {
      if (p.aksi === 'uji') hasil = uji_();
      else if (p.aksi === 'foto') hasil = unggahFoto_(p);
      else if (p.aksi === 'data') hasil = tulisData_(p);
      else if (p.aksi === 'pulihkan') hasil = { dokumen: bacaDokumen_(), folder: folder_().getId() };
      else if (p.aksi === 'ambil_foto') hasil = ambilFoto_(p);
      else if (p.aksi === 'pasang_folder' || p.aksi === 'video_folder') hasil = pasangFolder_(p);
      else if (p.aksi === 'video_sesi') hasil = videoSesi_(p);
      else throw galat_('Aksi tidak dikenal: ' + p.aksi, 'aksi');
    } finally {
      kunci.releaseLock();
    }
    hasil.ok = true;
  } catch (err) {
    hasil = { ok: false, galat: String((err && err.message) || err), kode: (err && err.kode) || '' };
  }
  return ContentService.createTextOutput(JSON.stringify(hasil)).setMimeType(ContentService.MimeType.JSON);
}

function galat_(pesan, kode) {
  const e = new Error(pesan);
  e.kode = kode;
  return e;
}

function uji_() {
  const d = bacaDokumen_();
  return { nama: SpreadsheetApp.getActive().getName(), url: SpreadsheetApp.getActive().getUrl(), folder: folder_().getId(),
           folder_url: folder_().getUrl(), versi: 9,
           lokasi: d && Array.isArray(d.lokasi) ? d.lokasi.map(function (l) { return { id: l.id, nama: l.nama }; }) : [] };
}

// ---------------------------------------------------------------- foto
function unggahFoto_(p) {
  if (!p.id || !p.data) throw galat_('Foto kosong', 'data');
  const sh = lembarFoto_();
  const r0 = barisFoto_(sh, p.id);
  if (r0 && !p.baru) {                         // sudah pernah diunggah (balasan sebelumnya tidak sampai)
    const ada = sh.getRange(r0, K.drive).getValue();
    if (ada) return { drive_id: String(ada) };
  }
  const blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.mime || 'image/jpeg', p.berkas || p.id + '.jpg');
  const tujuan = tempatBerkas_(folderTangga_(p.lokasi_id, p.lokasi, p.tangga_id, p.tangga), 'Foto', blob.getName(), function (lama) {
    return lama.getSize() === blob.getBytes().length && md5_(lama.getBlob().getBytes()) === md5_(blob.getBytes());
  });
  const f = tujuan.sama || tujuan.folder.createFile(blob);
  f.setDescription([p.lokasi, 'tangga ' + p.tangga, p.anak_tangga ? 'anak tangga ' + p.anak_tangga : '', p.keterangan]
    .filter(function (x) { return x; }).join(' · '));
  const r = r0 || sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, KOLOM_FOTO.length).setValues([[aman_(p.lokasi), p.tangga, p.anak_tangga, aman_(p.keterangan), 'ada',
    p.dibuat ? new Date(p.dibuat) : '', '', f.getUrl(), f.getName(), p.id, f.getId()]]);
  if (p.kecil) {
    try {
      const gambar = SpreadsheetApp.newCellImage().setSourceUrl('data:image/jpeg;base64,' + p.kecil)
        .setAltTextTitle(f.getName()).build();
      sh.getRange(r, K.gambar).setValue(gambar);
      sh.setRowHeight(r, 90);
    } catch (err) {
      sh.getRange(r, K.gambar).setValue('(lihat tautan)');
    }
  }
  return { drive_id: f.getId() };
}

function ambilFoto_(p) {
  let f;
  try { f = DriveApp.getFileById(p.drive_id); } catch (err) { throw galat_('Foto tidak ada di Drive', 'hilang'); }
  if (f.isTrashed() || !fotoTercatat_(p.drive_id)) throw galat_('Foto tidak ada di Drive Ukur Tangga', 'hilang');
  const b = f.getBlob();
  return { data: Utilities.base64Encode(b.getBytes()), mime: b.getContentType() };
}

function lembarFoto_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('Foto');
  if (!sh) {
    sh = ss.insertSheet('Foto');
    sh.getRange(1, 1, 1, KOLOM_FOTO.length).setValues([KOLOM_FOTO]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(K.gambar, 120);
  }
  return sh;
}

function fotoTercatat_(driveId) {
  const sh = lembarFoto_(), n = sh.getLastRow() - 1;
  if (n < 1) return false;
  return sh.getRange(2, K.drive, n, 1).getValues().some(function (r) { return String(r[0]) === String(driveId); });
}

function barisFoto_(sh, id) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  const ids = sh.getRange(2, K.id, n, 1).getValues();
  for (let i = 0; i < n; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}

// Kolom 1-5 lembar Foto mengikuti aplikasi; foto yang dihapus di aplikasi tetap ada barisnya dan berkasnya.
function perbaruiFoto_(daftar) {
  const sh = lembarFoto_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return;
  const peta = {};
  daftar.forEach(function (f) { peta[f.id] = f; });
  const ids = sh.getRange(2, K.id, n, 1).getValues();
  const meta = sh.getRange(2, 1, n, 5).getValues().map(function (lama, i) {
    const f = peta[ids[i][0]];
    return f ? [aman_(f.lokasi), f.tangga, f.anak_tangga, aman_(f.keterangan), 'ada']
             : [aman_(lama[0]), lama[1], lama[2], aman_(lama[3]), 'dihapus di aplikasi'];
  });
  sh.getRange(2, 1, n, 5).setValues(meta);
}

// ---------------------------------------------------------------- data
function tulisData_(p) {
  const dok = p.dokumen;
  if (!dok || !Array.isArray(dok.lokasi)) throw galat_('Dokumen kosong', 'data');
  const lama = bacaDokumen_();
  const teks = JSON.stringify(dok);
  if (lama && Array.isArray(lama.lokasi)) {
    const kini = {};
    dok.lokasi.forEach(function (l) { kini[l.id] = true; });
    if (lama.lokasi.some(function (l) { return !kini[l.id]; })) {
      tulisBerkas_(folderCadangan_(), 'sebelum_hapus_' + stempel_('yyyyMMdd_HHmmss') + '.json', JSON.stringify(lama));
    }
  }
  tulisBerkas_(folder_(), NAMA_DOKUMEN, teks);
  tulisBerkas_(folderCadangan_(), 'dokumen_' + stempel_('yyyyMMdd') + '.json', teks);
  catatRiwayat_(lama, dok);
  const sebelum = petaSebelumnya_();
  tulisTabel_('Data', tambahSebelumnya_(p.data || [], dok, sebelum));
  const lembar = tulisLembarLokasi_(dok, sebelum);
  tulisTabel_('Ringkasan', p.ringkasan || []);
  tautanRingkasan_(lembar);
  perbaruiFoto_(p.foto || []);
  lembarFoto_();
  urutkanLembar_(dok, lembar);
  try { SpreadsheetApp.getActive().getSheetByName('Data').hideSheet(); } catch (err) { /* sudah tersembunyi */ }
  dok.lokasi.forEach(function (l) { (l.tangga || []).forEach(function (t, i) { tulisUkuranTangga_(l, t, i + 1); }); });
  return { waktu: new Date().toISOString() };
}

// <akar>/<Lokasi>/Tangga <n>/ukuran.csv, hanya bila isinya berubah (sidik disimpan di properti skrip).
function tulisUkuranTangga_(l, t, nomor) {
  const sel = function (v) { return v === null || v === undefined ? '' : '"' + String(v).replace(/"/g, '""') + '"'; };
  const baris = [['Lokasi', 'Tangga', 'No.', 'Tinggi riser (cm)', 'Panjang tread (cm)', 'Panjang bordes (cm)'].map(sel).join(',')];
  (t.anak || []).forEach(function (a, j) { baris.push([l.nama, nomor, j + 1, a.tinggi_riser_cm, a.panjang_tread_cm, ''].map(sel).join(',')); });
  if (t.bordes_sesudah) baris.push([l.nama, nomor, 'bordes sesudahnya', '', '', t.bordes_sesudah.panjang_cm].map(sel).join(','));
  const teks = '\ufeff' + baris.join('\r\n') + '\r\n';
  const sidik = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, teks));
  const prop = PropertiesService.getScriptProperties(), kunci = 'CSV_' + t.id + '_' + folder_().getId();
  if (prop.getProperty(kunci) === sidik) return;
  const folder = folderTangga_(l.id, l.nama, t.id, nomor), it = folder.getFilesByName('ukuran.csv');
  if (it.hasNext()) it.next().setContent(teks); else folder.createFile('ukuran.csv', teks, 'text/csv');
  prop.setProperty(kunci, sidik);
}

// Lembar Riwayat: satu baris setiap ukuran yang sudah berisi lalu berubah (ukur ulang, salah ketik, dihapus).
const KOLOM_RIWAYAT = ['Waktu', 'Lokasi', 'Tangga', 'No.', 'Ukuran', 'Sebelum (cm)', 'Sesudah (cm)', 'Selisih (cm)', 'id anak'];
function catatRiwayat_(lama, dok) {
  if (!lama || !Array.isArray(lama.lokasi)) return;
  const nilai = {};                                      // id anak -> {r, t}; 'b_' + id tangga -> {b}
  lama.lokasi.forEach(function (l) { (l.tangga || []).forEach(function (t) {
    (t.anak || []).forEach(function (a) { nilai[a.id] = { r: a.tinggi_riser_cm, t: a.panjang_tread_cm }; });
    if (t.bordes_sesudah) nilai['b_' + t.id] = { b: t.bordes_sesudah.panjang_cm };
  }); });
  const kosong = function (v) { return v === null || v === undefined || v === ''; };
  const baris = [], kini = new Date();
  const banding = function (l, i, no, jenis, sebelum, sesudah, id) {
    if (kosong(sebelum) || sebelum === sesudah) return;
    baris.push([kini, aman_(l.nama), i + 1, no, jenis, sebelum, kosong(sesudah) ? '' : sesudah,
      kosong(sesudah) ? '' : Math.round((sesudah - sebelum) * 10) / 10, id]);
  };
  dok.lokasi.forEach(function (l) { (l.tangga || []).forEach(function (t, i) {
    (t.anak || []).forEach(function (a, j) {
      const v = nilai[a.id];
      if (!v) return;
      banding(l, i, j + 1, 'Tinggi riser', v.r, a.tinggi_riser_cm, a.id);
      banding(l, i, j + 1, 'Panjang tread', v.t, a.panjang_tread_cm, a.id);
    });
    const vb = nilai['b_' + t.id];
    if (vb) banding(l, i, 'bordes', 'Panjang bordes', vb.b, t.bordes_sesudah ? t.bordes_sesudah.panjang_cm : null, 'b_' + t.id);
  }); });
  if (!baris.length) return;
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('Riwayat');
  if (!sh) {
    sh = ss.insertSheet('Riwayat');
    sh.getRange(1, 1, 1, KOLOM_RIWAYAT.length).setValues([KOLOM_RIWAYAT]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  sh.getRange(sh.getLastRow() + 1, 1, baris.length, KOLOM_RIWAYAT.length).setValues(baris);
}

// Dari lembar Riwayat: '<id anak>|<ukuran>' -> { sebelum, waktu } perubahan terakhir.
function petaSebelumnya_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Riwayat');
  const akhir = {};
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, KOLOM_RIWAYAT.length).getValues().forEach(function (r) {
      akhir[r[8] + '|' + r[4]] = { sebelum: r[5], waktu: r[0] };
    });
  }
  return akhir;
}

// Kolom tambahan lembar Data dari Riwayat: nilai sebelum perubahan terakhir, dan kapan diubah.
function tambahSebelumnya_(data, dok, akhir) {
  if (!data.length) return data;
  const id = [];                                          // urutan baris sama dengan M.tabelSheet di aplikasi
  dok.lokasi.forEach(function (l) { (l.tangga || []).forEach(function (t) {
    (t.anak || []).forEach(function (a) { id.push(a.id); });
    if (t.bordes_sesudah) id.push('b_' + t.id);
  }); });
  return data.map(function (r, k) {
    if (k === 0) return r.concat(['Riser sebelumnya', 'Tread sebelumnya', 'Bordes sebelumnya', 'Terakhir diubah']);
    const a = id[k - 1] || '', ri = akhir[a + '|Tinggi riser'], tr = akhir[a + '|Panjang tread'], bo = akhir[a + '|Panjang bordes'];
    const waktu = [ri, tr, bo].filter(function (x) { return x; }).map(function (x) { return x.waktu; })
      .sort(function (x, y) { return new Date(x) - new Date(y); }).pop() || '';
    return r.concat([ri ? ri.sebelum : '', tr ? tr.sebelum : '', bo ? bo.sebelum : '', waktu]);
  });
}

const LEMBAR_TETAP = ['Ringkasan', 'Riwayat', 'Foto', 'Data'];
function namaLembar_(nama, terpakai) {
  let n = String(nama || 'Lokasi').replace(/[\[\]:*?\/\\]+/g, ' ').trim().slice(0, 90) || 'Lokasi';
  if (LEMBAR_TETAP.indexOf(n) >= 0) n += ' (lokasi)';
  let hasil = n, k = 2;
  while (terpakai[hasil]) hasil = n + ' (' + (k++) + ')';
  terpakai[hasil] = true;
  return hasil;
}

const rata_ = function (x) { return x.length ? Math.round(x.reduce(function (a, b) { return a + b; }, 0) / x.length * 10) / 10 : ''; };
const angka_ = function (x) { return x.filter(function (v) { return typeof v === 'number' && isFinite(v); }); };

// Satu lembar per lokasi (diingat per id lokasi; ganti nama lokasi = ganti nama lembar). Ditulis ulang hanya
// bila isinya berubah. Lembar lokasi yang sudah dihapus di aplikasi tidak dihapus, hanya diberi tanda.
function tulisLembarLokasi_(dok, sebelum) {
  const ss = SpreadsheetApp.getActive(), prop = PropertiesService.getScriptProperties();
  const cari = function (id) { return ss.getSheets().filter(function (x) { return String(x.getSheetId()) === String(id); })[0] || null; };
  const terpakai = {}, hasil = {}, aktif = {};
  LEMBAR_TETAP.forEach(function (n) { terpakai[n] = true; });
  dok.lokasi.forEach(function (l, urut) {
    aktif[l.id] = true;
    const nama = namaLembar_(l.nama, terpakai), kunci = 'SH_' + l.id;
    let sh = prop.getProperty(kunci) ? cari(prop.getProperty(kunci)) : null;
    if (!sh) {
      sh = ss.getSheetByName(nama) || ss.insertSheet(nama, Math.min(ss.getSheets().length, 1 + urut));
      prop.setProperty(kunci, String(sh.getSheetId()));
    } else if (sh.getName() !== nama) {
      try { sh.setName(nama); } catch (err) { /* nama dipakai lembar lain */ }
    }
    hasil[l.nama] = sh.getSheetId();
    const b = isiLembarLokasi_(l, sebelum);
    const sidik = md5_(JSON.stringify(b.isi.map(function (r) { return r.map(function (v) { return v instanceof Date ? v.getTime() : v; }); })));
    if (prop.getProperty('SHS_' + l.id) === sidik) return;
    sh.clear();
    sh.getRange(1, 1, b.isi.length, 7).setValues(b.isi);
    sh.getRange(1, 1, 1, 7).setFontWeight('bold').setFontSize(13);
    b.format.forEach(function (f) {
      const r = sh.getRange(f.baris, 1, 1, 7);
      if (f.jenis === 'tangga') r.setFontWeight('bold').setBackground('#DBEAFE');
      else if (f.jenis === 'kepala') r.setFontWeight('bold').setBackground('#F3F4F6');
      else if (f.jenis === 'ringkas') r.setFontStyle('italic').setBackground('#F9FAFB');
      else if (f.jenis === 'bordes') r.setFontWeight('bold').setBackground('#FEF9C3');
      else if (f.jenis === 'ubah') sh.getRange(f.baris, 4, 1, 3).setBackground('#FFEDD5');
    });
    if (b.isi.length > 1) sh.getRange(2, 2, b.isi.length - 1, 4).setNumberFormat('0.0');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 150);
    prop.setProperty('SHS_' + l.id, sidik);
  });
  const semua = prop.getProperties();
  Object.keys(semua).forEach(function (k) {
    if (k.indexOf('SH_') !== 0 || aktif[k.slice(3)]) return;
    const sh = cari(semua[k]);
    if (sh && sh.getName().indexOf('(dihapus di aplikasi)') < 0) {
      try { sh.setName(sh.getName().slice(0, 70) + ' (dihapus di aplikasi)'); } catch (err) { /* lewati */ }
    }
  });
  return hasil;
}

function isiLembarLokasi_(l, sebelum) {
  const isi = [], format = [];
  const baris = function (r, jenis) { while (r.length < 7) r.push(''); isi.push(r); if (jenis) format.push({ baris: isi.length, jenis: jenis }); };
  baris(['Lokasi: ' + l.nama, '', '', l.id_studio ? 'ID Studio: ' + l.id_studio : '', '', '', '']);
  (l.tangga || []).forEach(function (t, i) {
    baris([]);
    const anak = t.anak || [];
    baris(['Tangga ' + (i + 1) + ' · ' + anak.length + ' anak tangga'], 'tangga');
    baris(['No.', 'Tinggi riser (cm)', 'Panjang tread (cm)', 'Riser sebelumnya', 'Tread sebelumnya', 'Terakhir diubah', 'Foto'], 'kepala');
    anak.forEach(function (a, j) {
      const ri = sebelum[a.id + '|Tinggi riser'], tr = sebelum[a.id + '|Panjang tread'];
      const waktu = [ri, tr].filter(function (x) { return x; }).map(function (x) { return x.waktu; })
        .sort(function (x, y) { return new Date(x) - new Date(y); }).pop() || '';
      const nFoto = (t.foto || []).filter(function (f) { return Number(f.nomor) === j + 1; }).length;
      baris([j + 1, a.tinggi_riser_cm ?? '', a.panjang_tread_cm ?? '', ri ? ri.sebelum : '', tr ? tr.sebelum : '', waktu, nFoto || ''],
        ri || tr ? 'ubah' : '');
    });
    const r = angka_(anak.map(function (a) { return a.tinggi_riser_cm; })), d = angka_(anak.map(function (a) { return a.panjang_tread_cm; }));
    baris(['Rata-rata', rata_(r), rata_(d)], 'ringkas');
    baris(['Min', r.length ? Math.min.apply(null, r) : '', d.length ? Math.min.apply(null, d) : ''], 'ringkas');
    baris(['Maks', r.length ? Math.max.apply(null, r) : '', d.length ? Math.max.apply(null, d) : ''], 'ringkas');
    const fotoTangga = (t.foto || []).filter(function (f) { return !f.nomor; }).length;
    if (fotoTangga) baris(['Foto seluruh tangga', '', '', '', '', '', fotoTangga], 'ringkas');
    if (t.bordes_sesudah) {
      const bo = sebelum['b_' + t.id + '|Panjang bordes'];
      baris(['Bordes sesudah tangga ' + (i + 1), t.bordes_sesudah.panjang_cm ?? '', '', bo ? bo.sebelum : '', '', bo ? bo.waktu : ''], 'bordes');
    }
  });
  return { isi: isi, format: format };
}

// Urutan tab: Ringkasan, lembar lokasi (urut aplikasi), Riwayat, Foto, Data; lembar lain sesudahnya.
function urutkanLembar_(dok, lembar) {
  const ss = SpreadsheetApp.getActive();
  const ingin = ['Ringkasan'].map(function (n) { return ss.getSheetByName(n); })
    .concat(dok.lokasi.map(function (l) { const id = lembar[l.nama]; return ss.getSheets().filter(function (x) { return x.getSheetId() === id; })[0]; }))
    .concat(['Riwayat', 'Foto', 'Data'].map(function (n) { return ss.getSheetByName(n); }))
    .filter(function (x) { return x; });
  const kini = ss.getSheets();
  if (ingin.every(function (x, i) { return kini[i] && kini[i].getSheetId() === x.getSheetId(); })) return;
  ingin.forEach(function (x, i) { ss.setActiveSheet(x); ss.moveActiveSheet(i + 1); });
  ss.setActiveSheet(ingin[0]);
}

// Kolom "Lembar" di Ringkasan: tautan ke lembar lokasinya.
// Teks bertautan (bukan rumus HYPERLINK): rumus memakai pemisah argumen sesuai lokal spreadsheet ("," atau
// ";"), jadi pada lokal Indonesia rumus dengan "," menjadi #ERROR!.
function tautanRingkasan_(lembar) {
  const ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName('Ringkasan');
  if (!sh || sh.getLastRow() < 2) return;
  const n = sh.getLastRow(), kolom = sh.getLastColumn() + 1, lokasi = sh.getRange(2, 1, n - 1, 1).getValues();
  sh.getRange(1, kolom).setValue('Lembar').setFontWeight('bold');
  const isi = lokasi.map(function (r) {
    const id = lembar[String(r[0]).replace(/^'/, '')];
    const t = SpreadsheetApp.newRichTextValue().setText(id !== undefined ? 'Buka' : '');
    return [id !== undefined ? t.setLinkUrl(ss.getUrl() + '#gid=' + id).build() : t.build()];
  });
  sh.getRange(2, kolom, n - 1, 1).setRichTextValues(isi);
}

function tulisTabel_(nama, baris) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(nama) || ss.insertSheet(nama, nama === 'Data' ? 0 : ss.getSheets().length);
  sh.clearContents();
  if (!baris.length) return;
  const lebar = Math.max.apply(null, baris.map(function (r) { return r.length; }));
  const isi = baris.map(function (r) {
    const s = r.map(function (v) { return v === null || v === undefined ? '' : aman_(v); });
    while (s.length < lebar) s.push('');
    return s;
  });
  sh.getRange(1, 1, isi.length, lebar).setValues(isi);
  sh.getRange(1, 1, 1, lebar).setFontWeight('bold');
  sh.setFrozenRows(1);
}

// Teks yang diawali = atau + jangan sampai dibaca sebagai rumus.
function aman_(v) {
  return typeof v === 'string' && /^[=+]/.test(v) ? "'" + v : v;
}

// ---------------------------------------------------------------- Drive
function bacaDokumen_() {
  const it = folder_().getFilesByName(NAMA_DOKUMEN);
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString('UTF-8')) : null;
}

// Berkas data milik aplikasi (dokumen.json, cadangan harian): diperbarui hanya bila isinya berubah.
function tulisBerkas_(folder, nama, teks) {
  const it = folder.getFilesByName(nama);
  if (it.hasNext()) {
    const f = it.next();
    if (f.getBlob().getDataAsString('UTF-8') !== teks) f.setContent(teks);
  } else folder.createFile(nama, teks, 'application/json');
}

function md5_(bytes) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes));
}

// Folder tujuan untuk berkas bernama `nama` di <induk>/<dasar>: { folder, sama }. Bila di sana sudah ada
// berkas bernama sama yang isinya sama (`samaFn`), `sama` = berkas itu (tidak perlu dikirim lagi). Bila
// nama sama tetapi isi beda, dipakai "<dasar> (2)", "(3)", ... yang belum punya nama itu. Tidak ada yang dihapus.
function tempatBerkas_(induk, dasar, nama, samaFn) {
  for (let k = 1; k < 50; k++) {
    const folder = anakFolder_(induk, k === 1 ? dasar : dasar + ' (' + k + ')');
    const it = folder.getFilesByName(nama);
    if (!it.hasNext()) return { folder: folder, sama: null };
    while (it.hasNext()) {
      const f = it.next();
      if (!f.isTrashed() && samaFn(f)) return { folder: folder, sama: f };
    }
  }
  throw galat_('Terlalu banyak duplikat bernama ' + nama, 'data');
}

function infoDrive_(id) {
  const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id)
    + '?fields=id,name,size,sha256Checksum,trashed,webViewLink&supportsAllDrives=true',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  const kode = res.getResponseCode();
  if (kode === 404) return null;
  if (kode >= 300) throw galat_('Drive tidak bisa diperiksa (HTTP ' + kode + ')', 'drive');
  return JSON.parse(res.getContentText());
}

// Akar: folder dari tautan (Pasang folder), atau folder tempat spreadsheet ini berada, atau "Ukur Tangga" baru
// bila spreadsheet ada langsung di My Drive.
function folder_() {
  const prop = PropertiesService.getScriptProperties();
  const id = prop.getProperty('FOLDER');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) { /* dibuat lagi */ }
  }
  try {
    const it = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents();
    if (it.hasNext()) {
      const induk = it.next();
      if (induk.getId() !== DriveApp.getRootFolder().getId()) { prop.setProperty('FOLDER', induk.getId()); return induk; }
    }
  } catch (err) { /* buat folder sendiri */ }
  const f = DriveApp.createFolder(NAMA_FOLDER);
  prop.setProperty('FOLDER', f.getId());
  return f;
}

function subfolder_(nama) {
  const induk = folder_();
  const it = induk.getFoldersByName(nama);
  return it.hasNext() ? it.next() : induk.createFolder(nama);
}
function folderCadangan_() { return subfolder_('Cadangan'); }

function stempel_(pola) {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), pola);
}

// ---------------------------------------------------------------- video kegiatan
function folderVideo_(id) {
  if (!id) throw galat_('Folder Drive untuk video belum diatur', 'folder');
  let f;
  try { f = DriveApp.getFolderById(id); } catch (err) {
    throw galat_('Folder Drive tidak bisa dibuka: periksa tautannya dan pastikan folder itu milik akun pemasang skrip', 'folder');
  }
  if (f.isTrashed()) throw galat_('Folder Drive itu ada di Sampah', 'folder');
  return f;
}

function anakFolder_(induk, nama) {
  const bersih = String(nama || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Tanpa lokasi';
  const it = induk.getFoldersByName(bersih);
  return it.hasNext() ? it.next() : induk.createFolder(bersih);
}

// Folder lokasi di bawah akar, diingat per id lokasi (properti LOK_<id>) agar ganti nama lokasi = ganti nama folder.
function folderLokasi_(id, nama) {
  const akar = folder_(), prop = PropertiesService.getScriptProperties();
  const bersih = String(nama || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Tanpa lokasi';
  const kunci = id ? 'LOK_' + id + '_' + akar.getId() : '';
  const ada = kunci && prop.getProperty(kunci);
  if (ada) {
    try {
      const f = DriveApp.getFolderById(ada);
      if (!f.isTrashed()) { if (f.getName() !== bersih) f.setName(bersih); return f; }
    } catch (err) { /* dibuat lagi */ }
  }
  const f = anakFolder_(akar, bersih);
  if (kunci) prop.setProperty(kunci, f.getId());
  return f;
}

// <akar>/<Lokasi>/Tangga <n>, diingat per id tangga (properti TGG_<id>) agar nomor yang bergeser = ganti nama.
function folderTangga_(lokasiId, lokasiNama, id, nomor) {
  const induk = folderLokasi_(lokasiId, lokasiNama), prop = PropertiesService.getScriptProperties();
  const nama = 'Tangga ' + (nomor || 1), kunci = id ? 'TGG_' + id + '_' + folder_().getId() : '';
  const ada = kunci && prop.getProperty(kunci);
  if (ada) {
    try {
      const f = DriveApp.getFolderById(ada);
      if (!f.isTrashed()) { if (f.getName() !== nama) f.setName(nama); return f; }
    } catch (err) { /* dibuat lagi */ }
  }
  const f = anakFolder_(induk, nama);
  if (kunci) prop.setProperty(kunci, f.getId());
  return f;
}

// Folder dari tautan menjadi akar semua data; isi akar lama (dokumen, cadangan, foto, spreadsheet) dipindah.
function pasangFolder_(p) {
  const f = folderVideo_(p.folder), pindah = pastikanAkar_(p.folder);
  return { nama: f.getName(), url: f.getUrl(), dipindah: pindah };
}

function pastikanAkar_(id) {
  const prop = PropertiesService.getScriptProperties(), lamaId = prop.getProperty('FOLDER');
  if (lamaId === id) return 0;
  const baru = folderVideo_(id);
  let lama = null;
  try { if (lamaId) lama = DriveApp.getFolderById(lamaId); } catch (err) { lama = null; }
  prop.setProperty('FOLDER', id);
  return lama ? rapikan_(lama, baru) : 0;
}

// Pindahkan seluruh isi akar lama ke akar baru (folder bernama sama digabung). Tidak ada yang dihapus;
// berkas yang sama persis sudah ada di tujuan dibiarkan di tempat lama.
function rapikan_(lama, baru) {
  let n = 0;
  const pindah = function (x, ke) { try { x.moveTo(ke); n++; } catch (err) { /* lewati */ } };
  try { pindah(DriveApp.getFileById(SpreadsheetApp.getActive().getId()), baru); } catch (err) { /* lewati */ }
  let it;
  // Foto lama "Foto/" -> <Lokasi>/Tangga <n>/Foto menurut lembar Foto (lokasi, tangga per drive_id); id lokasi dari dokumen.json.
  const dok = bacaDokumen_(), idNama = {};
  if (dok && dok.lokasi) dok.lokasi.forEach(function (l) { idNama[l.nama] = l.id; });
  const sh = lembarFoto_(), m = sh.getLastRow() - 1, lokasiFoto = {};
  if (m > 0) sh.getRange(2, 1, m, K.drive).getValues().forEach(function (r) {
    lokasiFoto[String(r[K.drive - 1])] = { nama: String(r[0]).replace(/^'/, ''), tangga: Number(r[1]) || 1 };
  });
  it = lama.getFoldersByName('Foto');
  while (it.hasNext()) {
    const isi = it.next().getFiles();
    while (isi.hasNext()) {
      const x = isi.next(), info = lokasiFoto[x.getId()] || { nama: 'Tanpa lokasi', tangga: 1 };
      pindah(x, anakFolder_(folderTangga_(idNama[info.nama], info.nama, null, info.tangga), 'Foto'));
    }
  }
  const gabung = function (dari, ke) {
    const berkas = dari.getFiles();
    while (berkas.hasNext()) {
      const x = berkas.next(), ada = ke.getFilesByName(x.getName());
      let kembar = false, bentrok = false;
      while (ada.hasNext()) {
        const y = ada.next();
        if (y.getSize() === x.getSize() && md5_(y.getBlob().getBytes()) === md5_(x.getBlob().getBytes())) kembar = true; else bentrok = true;
      }
      if (kembar) continue;                                      // sama persis sudah ada: biarkan di tempat lama
      pindah(x, bentrok ? anakFolder_(ke, 'Duplikat dari ' + lama.getName()) : ke);   // nama sama isi beda: folder baru
    }
    const folder = dari.getFolders();
    while (folder.hasNext()) {
      const f = folder.next();
      if (f.getId() === baru.getId()) continue;                  // akar baru di dalam akar lama
      if (!f.getFiles().hasNext() && !f.getFolders().hasNext()) continue;   // folder kosong: biarkan
      const sama = ke.getFoldersByName(f.getName());
      if (sama.hasNext()) gabung(f, sama.next()); else pindah(f, ke);
    }
  };
  gabung(lama, baru);
  return n;
}

// Sesi unggah Drive (resumable) untuk satu bagian video di <folder>/<tanggal>/<lokasi>. HP lalu mengirim
// isinya langsung ke URL sesi; bila browser menolak (CORS), lewat videoPotong_.
function videoSesi_(p) {
  if (p.folder) pastikanAkar_(p.folder);
  const induk = p.tangga ? folderTangga_(p.lokasi_id, p.lokasi, p.tangga_id, p.tangga) : folderLokasi_(p.lokasi_id, p.lokasi);
  const t = tempatBerkas_(induk, 'Video', p.nama, function (lama) {
    if (Number(lama.getSize()) !== Number(p.ukuran)) return false;
    const info = p.sha256 ? infoDrive_(lama.getId()) : null;
    return !!(info && info.sha256Checksum && info.sha256Checksum.toLowerCase() === p.sha256);
  });
  if (t.sama) return { sudah_ada: true, id: t.sama.getId(), link: t.sama.getUrl(), folder: t.folder.getUrl() };
  const tujuan = t.folder;
  const kepala = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': p.mime || 'video/webm',
                   'X-Upload-Content-Length': String(p.ukuran) };
  if (p.asal) kepala.Origin = p.asal;
  const res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink', {
    method: 'post', contentType: 'application/json; charset=UTF-8', headers: kepala, muteHttpExceptions: true,
    payload: JSON.stringify({ name: p.nama, parents: [tujuan.getId()], description: p.keterangan || '' }) });
  if (res.getResponseCode() >= 300) throw galat_('Drive menolak sesi unggah: ' + res.getContentText().slice(0, 200), 'drive');
  const h = res.getAllHeaders();
  return { url: h.Location || h.location, folder: tujuan.getUrl() };
}

// Satu potongan (atau tanya posisi bila data kosong) ke sesi unggah, dari sisi server.
function videoPotong_(p) {
  if (!/^https:\/\/www\.googleapis\.com\/upload\/drive\//.test(p.url || '')) throw galat_('URL sesi unggah tidak sah', 'data');
  const data = p.data ? Utilities.base64Decode(p.data) : null;
  const rentang = data ? 'bytes ' + p.mulai + '-' + (p.mulai + data.length - 1) + '/' + p.total : 'bytes */' + p.total;
  const opsi = { method: 'put', headers: { 'Content-Range': rentang }, muteHttpExceptions: true, followRedirects: false };
  if (data) { opsi.payload = data; opsi.contentType = p.mime || 'application/octet-stream'; }
  const res = UrlFetchApp.fetch(p.url, opsi);
  const kode = res.getResponseCode(), h = res.getAllHeaders();
  const hasil = { kode: kode, range: h.Range || h.range || '' };
  if (kode === 200 || kode === 201) {
    try { const j = JSON.parse(res.getContentText()); hasil.id = j.id; hasil.link = j.webViewLink; } catch (err) { /* tanpa isi */ }
  } else if (kode !== 308) {
    hasil.teks = res.getContentText().slice(0, 200);
  }
  return hasil;
}

// Pemeriksaan sesudah unggah: aplikasi baru menghapus salinan di HP bila ukuran dan SHA-256 berkas di
// Drive sama persis dengan yang dihitung di HP.
function videoPeriksa_(p) {
  const j = infoDrive_(p.id);
  if (!j) return { ada: false };
  return { ada: !j.trashed, ukuran: Number(j.size || 0), sha256: j.sha256Checksum || '', link: j.webViewLink || '', nama: j.name };
}

// Jalankan sekali dari editor (pilih fungsi ini > Jalankan) untuk memberi izin Drive dan Spreadsheet.
function izinkan() {
  folderCadangan_(); lembarFoto_();
  UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest', { muteHttpExceptions: true });   // izin unggah video
  Logger.log('Siap: folder ' + folder_().getUrl());
}
