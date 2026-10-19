// Ukur Tangga -> Google Spreadsheet + Google Drive.
//
// Tempel berkas ini di Ekstensi > Apps Script pada spreadsheet tujuan, isi KUNCI, lalu terapkan sebagai
// aplikasi web (Jalankan sebagai: Saya; Yang memiliki akses: Siapa saja). Langkah lengkap: GOOGLE.md.
//
// Yang ditulis:
//   lembar Data      : satu baris per anak tangga/bordes (ditulis ulang setiap sinkron)
//   lembar Ringkasan : per tangga (ditulis ulang setiap sinkron)
//   lembar Foto      : satu baris per foto, dengan gambar kecil dan tautan ke berkasnya di Drive
//   Drive "Ukur Tangga"          : dokumen.json (seluruh data aplikasi, untuk Pulihkan dari Google)
//   Drive "Ukur Tangga/Foto"     : gambar JPEG 2048 px
//   Drive "Ukur Tangga/Cadangan" : salinan dokumen.json per hari, dan sebelum ada lokasi yang dihapus

const KUNCI = 'GANTI-DENGAN-KATA-RAHASIA';   // sama dengan isian Kunci di aplikasi
const NAMA_FOLDER = 'Ukur Tangga';
const NAMA_DOKUMEN = 'dokumen.json';
const KOLOM_FOTO = ['Lokasi', 'Tangga', 'Anak tangga', 'Keterangan', 'Status', 'Diambil', 'Gambar', 'Tautan', 'Berkas', 'id', 'drive_id'];
const K = { gambar: 7, tautan: 8, id: 10, drive: 11 };   // nomor kolom (mulai 1); kolom 1-5 ditulis ulang setiap sinkron

function doGet() {
  return ContentService.createTextOutput('Aplikasi web Ukur Tangga aktif. Tempel URL ini di aplikasi (tombol Google).');
}

function doPost(e) {
  let hasil;
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!KUNCI || KUNCI === 'GANTI-DENGAN-KATA-RAHASIA') throw galat_('Isi KUNCI di Kode.gs lalu terapkan versi baru', 'kunci');
    if (p.kunci !== KUNCI) throw galat_('Kunci salah', 'kunci');
    const kunci = LockService.getScriptLock();
    kunci.waitLock(60000);
    try {
      if (p.aksi === 'uji') hasil = uji_();
      else if (p.aksi === 'foto') hasil = unggahFoto_(p);
      else if (p.aksi === 'data') hasil = tulisData_(p);
      else if (p.aksi === 'pulihkan') hasil = { dokumen: bacaDokumen_(), folder: folder_().getId() };
      else if (p.aksi === 'ambil_foto') hasil = ambilFoto_(p);
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
  return { nama: SpreadsheetApp.getActive().getName(), folder: folder_().getId(),
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
  const f = folderFoto_().createFile(blob);
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
  if (f.isTrashed() || !dalamFolder_(f, folderFoto_())) throw galat_('Foto tidak ada di folder Ukur Tangga/Foto', 'hilang');
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
  return { waktu: new Date().toISOString() };
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
function folderFoto_() { return subfolder_('Foto'); }
function folderCadangan_() { return subfolder_('Cadangan'); }

function dalamFolder_(f, folder) {
  const it = f.getParents();
  while (it.hasNext()) if (it.next().getId() === folder.getId()) return true;
  return false;
}

function stempel_(pola) {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), pola);
}

// Jalankan sekali dari editor (pilih fungsi ini > Jalankan) untuk memberi izin Drive dan Spreadsheet.
function izinkan() {
  folderFoto_(); folderCadangan_(); lembarFoto_();
  Logger.log('Siap: folder ' + folder_().getUrl());
}
