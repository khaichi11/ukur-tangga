// Ukur Tangga -> Google Spreadsheet + Google Drive.
//
// Tempel berkas ini di Ekstensi > Apps Script pada spreadsheet tujuan, isi KUNCI, lalu terapkan sebagai
// aplikasi web (Jalankan sebagai: Saya; Yang memiliki akses: Siapa saja). Langkah lengkap: GOOGLE.md.
//
// Yang ditulis:
//   lembar Data      : satu baris per anak tangga/bordes (ditulis ulang setiap sinkron)
//   lembar Ringkasan : per tangga (ditulis ulang setiap sinkron)
//   lembar Foto      : satu baris per foto, dengan gambar kecil dan tautan ke berkasnya di Drive
//   Folder akar: folder yang tautannya ditempel di aplikasi (sekali), atau "Ukur Tangga" bila belum ada.
//     <akar>/dokumen.json                 : seluruh data aplikasi, untuk Pulihkan dari Google
//     <akar>/Cadangan/                    : salinan dokumen.json per hari, dan sebelum ada lokasi yang dihapus
//     <akar>/<Lokasi>/Tangga <n>/ukuran.csv : ukuran anak tangga (dan bordes sesudahnya), ditulis ulang bila berubah
//     <akar>/<Lokasi>/Tangga <n>/Foto/      : gambar JPEG 2048 px
//     <akar>/<Lokasi>/Tangga <n>/Video/     : video kegiatan per bagian, lewat sesi unggah Drive (resumable),
//                                             langsung dari HP atau lewat skrip ini
//   Spreadsheet ini ikut dipindah ke <akar>. Folder lokasi/tangga diberi nama ulang bila lokasinya diganti
//   nama atau nomor tangganya bergeser (bordes ditambah/dihapus).

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
    if (p.aksi === 'video_potong' || p.aksi === 'video_periksa' || p.aksi === 'video_buang') {   // tanpa kunci skrip
      hasil = p.aksi === 'video_potong' ? videoPotong_(p) : p.aksi === 'video_periksa' ? videoPeriksa_(p) : videoBuang_(p);
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
           folder_url: folder_().getUrl(), versi: 5,
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
  const f = anakFolder_(folderTangga_(p.lokasi_id, p.lokasi, p.tangga_id, p.tangga), 'Foto').createFile(blob);
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
  tulisTabel_('Data', p.data || []);
  tulisTabel_('Ringkasan', p.ringkasan || []);
  perbaruiFoto_(p.foto || []);
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

function tulisBerkas_(folder, nama, teks) {
  const it = folder.getFilesByName(nama);
  if (it.hasNext()) it.next().setContent(teks);
  else folder.createFile(nama, teks, 'application/json');
}

function folder_() {
  const prop = PropertiesService.getScriptProperties();
  const id = prop.getProperty('FOLDER');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) { /* dibuat lagi */ }
  }
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

function rapikan_(lama, baru) {
  let n = 0;
  const pindah = function (x, ke) { try { x.moveTo(ke); n++; } catch (err) { /* lewati */ } };
  try { pindah(DriveApp.getFileById(SpreadsheetApp.getActive().getId()), baru); } catch (err) { /* lewati */ }
  let it = lama.getFilesByName(NAMA_DOKUMEN);
  while (it.hasNext()) pindah(it.next(), baru);
  it = lama.getFoldersByName('Cadangan');
  while (it.hasNext()) {
    const c = it.next(), tujuan = anakFolder_(baru, 'Cadangan'), isi = c.getFiles();
    while (isi.hasNext()) pindah(isi.next(), tujuan);
  }
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
  return n;
}

// Sesi unggah Drive (resumable) untuk satu bagian video di <folder>/<tanggal>/<lokasi>. HP lalu mengirim
// isinya langsung ke URL sesi; bila browser menolak (CORS), lewat videoPotong_.
function videoSesi_(p) {
  if (p.folder) pastikanAkar_(p.folder);
  const tujuan = anakFolder_(p.tangga ? folderTangga_(p.lokasi_id, p.lokasi, p.tangga_id, p.tangga) : folderLokasi_(p.lokasi_id, p.lokasi), 'Video');
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
  const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(p.id)
    + '?fields=id,name,size,sha256Checksum,trashed,webViewLink&supportsAllDrives=true',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  const kode = res.getResponseCode();
  if (kode === 404) return { ada: false };
  if (kode >= 300) throw galat_('Drive tidak bisa diperiksa (HTTP ' + kode + ')', 'drive');
  const j = JSON.parse(res.getContentText());
  return { ada: !j.trashed, ukuran: Number(j.size || 0), sha256: j.sha256Checksum || '', link: j.webViewLink || '', nama: j.name };
}

// Salinan rusak (ukuran/sidik beda) dibuang ke Sampah Drive (bisa dipulihkan 30 hari), lalu diunggah ulang.
function videoBuang_(p) {
  const f = DriveApp.getFileById(p.id);
  if (!/^video_/.test(f.getName())) throw galat_('Hanya berkas video Ukur Tangga yang boleh dibuang', 'data');
  f.setTrashed(true);
  return {};
}

// Jalankan sekali dari editor (pilih fungsi ini > Jalankan) untuk memberi izin Drive dan Spreadsheet.
function izinkan() {
  folderCadangan_(); lembarFoto_();
  UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest', { muteHttpExceptions: true });   // izin unggah video
  Logger.log('Siap: folder ' + folder_().getUrl());
}
