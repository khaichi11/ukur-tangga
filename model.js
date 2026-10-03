// Model data, ringkasan statistik, serta format ekspor/impor (lihat FORMAT.md).

export const FORMAT = 'ukur-tangga';
export const VERSI = 1;

export function idBaru(awalan) {
  const acak = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 10);
  return `${awalan}_${acak}`;
}

export function sekarang() {
  return new Date().toISOString();
}

export function dokumenKosong() {
  return { format: FORMAT, versi: VERSI, lokasi: [], diekspor_terakhir: null, dibuat: sekarang() };
}

export function lokasiBaru(nama) {
  return { id: idBaru('lok'), nama: nama || 'Gedung baru', alamat: '', catatan: '', tangga: [],
           dibuat: sekarang(), diubah: sekarang() };
}

export function tanggaBaru(nama) {
  const hari = new Date();
  const tgl = `${hari.getFullYear()}-${String(hari.getMonth() + 1).padStart(2, '0')}-${String(hari.getDate()).padStart(2, '0')}`;
  return {
    id: idBaru('tng'), nama: nama || 'Tangga baru', id_studio: '', lantai_dari: '', lantai_ke: '', arah: 'naik',
    lebar_cm: null, pegangan: '', permukaan: '', lux: null, tanggal_ukur: tgl, pengukur: '', catatan: '',
    foto: [], bagian: [], dibuat: sekarang(), diubah: sekarang(),
  };
}

export function anakTanggaBaru() {
  return { id: idBaru('at'), jenis: 'anak_tangga', tinggi_riser_cm: null, panjang_tread_cm: null,
           lebar_cm: null, catatan: '' };
}

export function bordesBaru() {
  return { id: idBaru('bd'), jenis: 'bordes', panjang_cm: null, lebar_cm: null, catatan: '' };
}

// "17,5" atau "17.5" -> 17.5; kosong -> null; tidak terbaca -> NaN
export function bacaAngka(teks) {
  if (teks === null || teks === undefined) return null;
  const t = String(teks).trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : NaN;
}

export function nomorAnakTangga(tangga) {
  // Nomor 1, 2, 3 ... hanya untuk anak tangga (bordes tidak dihitung), dari bawah.
  const peta = new Map();
  let n = 0;
  for (const b of tangga.bagian) if (b.jenis === 'anak_tangga') peta.set(b.id, ++n);
  return peta;
}

function statistik(nilai) {
  const v = nilai.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return null;
  const rerata = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - rerata) ** 2, 0) / (v.length - 1)) : 0;
  const urut = [...v].sort((a, b) => a - b);
  const median = urut.length % 2 ? urut[(urut.length - 1) / 2] : (urut[urut.length / 2 - 1] + urut[urut.length / 2]) / 2;
  return { n: v.length, rerata: bulat(rerata), sd: bulat(sd), median: bulat(median),
           min: urut[0], maks: urut[urut.length - 1] };
}

export function bulat(x, d = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const k = 10 ** d;
  return Math.round(x * k) / k;
}

export function ringkasan(tangga) {
  const anak = tangga.bagian.filter((b) => b.jenis === 'anak_tangga');
  const riser = statistik(anak.map((a) => a.tinggi_riser_cm));
  const tread = statistik(anak.map((a) => a.panjang_tread_cm));
  const blondel = statistik(anak.filter((a) => Number.isFinite(a.tinggi_riser_cm) && Number.isFinite(a.panjang_tread_cm))
    .map((a) => 2 * a.tinggi_riser_cm + a.panjang_tread_cm));
  const sudut = riser && tread ? bulat(Math.atan2(riser.rerata, tread.rerata) * 180 / Math.PI) : null;
  const tinggiTotal = anak.reduce((a, b) => a + (Number.isFinite(b.tinggi_riser_cm) ? b.tinggi_riser_cm : 0), 0);
  return {
    n_anak_tangga: anak.length,
    n_bordes: tangga.bagian.length - anak.length,
    riser, tread, blondel,
    kemiringan_derajat: sudut,
    tinggi_total_cm: riser ? bulat(tinggiTotal) : null,
  };
}

export function terisi(tangga) {
  const anak = tangga.bagian.filter((b) => b.jenis === 'anak_tangga');
  const lengkap = anak.filter((a) => Number.isFinite(a.tinggi_riser_cm) && Number.isFinite(a.panjang_tread_cm)).length;
  return { anak: anak.length, lengkap };
}

// Peringatan salah ketik (bukan aturan baku): nilai di luar rentang yang wajar untuk tangga gedung.
export function curiga(jenis, nilai) {
  if (!Number.isFinite(nilai)) return false;
  if (jenis === 'riser') return nilai < 8 || nilai > 25;
  if (jenis === 'tread') return nilai < 18 || nilai > 50;
  if (jenis === 'lebar') return nilai < 50 || nilai > 500;
  return false;
}

// ------------------------------------------------------------ ekspor
export function eksporJson(dok, { fotoData = null } = {}) {
  const lokasi = dok.lokasi.map((l) => ({
    id: l.id, nama: l.nama, alamat: l.alamat, catatan: l.catatan, dibuat: l.dibuat, diubah: l.diubah,
    tangga: l.tangga.map((t) => {
      const nomor = nomorAnakTangga(t);
      const r = ringkasan(t);
      return {
        id: t.id, nama: t.nama, id_studio: t.id_studio || null,
        lantai_dari: t.lantai_dari, lantai_ke: t.lantai_ke, arah: t.arah,
        lebar_cm: t.lebar_cm, pegangan: t.pegangan, permukaan: t.permukaan, lux: t.lux,
        tanggal_ukur: t.tanggal_ukur, pengukur: t.pengukur, catatan: t.catatan,
        bagian: t.bagian.map((b) => (b.jenis === 'anak_tangga'
          ? { jenis: 'anak_tangga', nomor: nomor.get(b.id), tinggi_riser_cm: b.tinggi_riser_cm,
              panjang_tread_cm: b.panjang_tread_cm, lebar_cm: b.lebar_cm, catatan: b.catatan }
          : { jenis: 'bordes', panjang_cm: b.panjang_cm, lebar_cm: b.lebar_cm, catatan: b.catatan })),
        ringkasan: {
          n_anak_tangga: r.n_anak_tangga, n_bordes: r.n_bordes,
          riser_cm: r.riser, tread_cm: r.tread, dua_riser_tambah_tread_cm: r.blondel,
          kemiringan_derajat: r.kemiringan_derajat, tinggi_total_cm: r.tinggi_total_cm,
        },
        foto: fotoData ? (fotoData[t.id] || []) : t.foto.length,
        dibuat: t.dibuat, diubah: t.diubah,
      };
    }),
  }));
  return {
    format: FORMAT, versi: VERSI, aplikasi: 'Ukur Tangga', diekspor: sekarang(),
    zona_waktu: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    satuan: { panjang: 'cm', cahaya: 'lux', sudut: 'derajat' },
    keterangan: 'nomor anak tangga dihitung dari bawah (anak tangga pertama yang dinaiki = 1); tinggi_riser_cm = '
      + 'jarak tegak dari permukaan tread di bawahnya ke tread anak tangga ini; panjang_tread_cm = kedalaman '
      + 'injakan dari muka riser ke tepi depan anak tangga berikutnya; bordes = bidang datar antar-lengan tangga',
    lokasi,
  };
}

function selCsv(x) {
  if (x === null || x === undefined) return '';
  const t = String(x);
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function eksporCsv(dok) {
  const kolom = ['lokasi', 'tangga', 'id_studio', 'lantai_dari', 'lantai_ke', 'urutan', 'jenis', 'nomor',
                 'tinggi_riser_cm', 'panjang_tread_cm', 'panjang_bordes_cm', 'lebar_cm', 'catatan'];
  const baris = [kolom.join(',')];
  for (const l of dok.lokasi) {
    for (const t of l.tangga) {
      const nomor = nomorAnakTangga(t);
      t.bagian.forEach((b, i) => {
        baris.push([l.nama, t.nama, t.id_studio, t.lantai_dari, t.lantai_ke, i + 1, b.jenis,
          b.jenis === 'anak_tangga' ? nomor.get(b.id) : '',
          b.jenis === 'anak_tangga' ? b.tinggi_riser_cm : '', b.jenis === 'anak_tangga' ? b.panjang_tread_cm : '',
          b.jenis === 'bordes' ? b.panjang_cm : '', b.lebar_cm ?? t.lebar_cm ?? '', b.catatan].map(selCsv).join(','));
      });
    }
  }
  return '﻿' + baris.join('\r\n') + '\r\n';      // BOM: Excel/Numbers membaca UTF-8 dengan benar
}

// ------------------------------------------------------------ impor
function angkaAtauNull(x) {
  return typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10) / 10 : null;
}

function teks(x) {
  return typeof x === 'string' ? x : (x === null || x === undefined ? '' : String(x));
}

export function normalisasiImpor(data) {
  if (!data || data.format !== FORMAT || !Array.isArray(data.lokasi)) {
    throw new Error('Bukan berkas ekspor Ukur Tangga (format "ukur-tangga").');
  }
  const fotoBaru = [];      // [idTangga, dataUrl]
  const lokasi = data.lokasi.map((l) => ({
    id: teks(l.id) || idBaru('lok'), nama: teks(l.nama) || 'Gedung', alamat: teks(l.alamat), catatan: teks(l.catatan),
    dibuat: teks(l.dibuat) || sekarang(), diubah: teks(l.diubah) || sekarang(),
    tangga: (Array.isArray(l.tangga) ? l.tangga : []).map((t) => {
      const id = teks(t.id) || idBaru('tng');
      if (Array.isArray(t.foto)) for (const f of t.foto) if (typeof f === 'string' && f.startsWith('data:image/')) fotoBaru.push([id, f]);
      return {
        id, nama: teks(t.nama) || 'Tangga', id_studio: teks(t.id_studio),
        lantai_dari: teks(t.lantai_dari), lantai_ke: teks(t.lantai_ke), arah: teks(t.arah) || 'naik',
        lebar_cm: angkaAtauNull(t.lebar_cm), pegangan: teks(t.pegangan), permukaan: teks(t.permukaan),
        lux: angkaAtauNull(t.lux), tanggal_ukur: teks(t.tanggal_ukur), pengukur: teks(t.pengukur), catatan: teks(t.catatan),
        foto: [],
        bagian: (Array.isArray(t.bagian) ? t.bagian : []).map((b) => (b.jenis === 'bordes'
          ? { id: idBaru('bd'), jenis: 'bordes', panjang_cm: angkaAtauNull(b.panjang_cm), lebar_cm: angkaAtauNull(b.lebar_cm), catatan: teks(b.catatan) }
          : { id: idBaru('at'), jenis: 'anak_tangga', tinggi_riser_cm: angkaAtauNull(b.tinggi_riser_cm),
              panjang_tread_cm: angkaAtauNull(b.panjang_tread_cm), lebar_cm: angkaAtauNull(b.lebar_cm), catatan: teks(b.catatan) })),
        dibuat: teks(t.dibuat) || sekarang(), diubah: teks(t.diubah) || sekarang(),
      };
    }),
  }));
  return { lokasi, fotoBaru };
}

// Gabung: lokasi/tangga ber-id sama diganti versi impor; yang baru ditambahkan.
export function gabung(dok, lokasiImpor) {
  let tambah = 0, ganti = 0;
  for (const li of lokasiImpor) {
    const ada = dok.lokasi.find((l) => l.id === li.id);
    if (!ada) { dok.lokasi.push(li); tambah += li.tangga.length; continue; }
    Object.assign(ada, { nama: li.nama, alamat: li.alamat, catatan: li.catatan, diubah: li.diubah });
    for (const ti of li.tangga) {
      const i = ada.tangga.findIndex((t) => t.id === ti.id);
      if (i >= 0) { ti.foto = ada.tangga[i].foto; ada.tangga[i] = ti; ganti++; } else { ada.tangga.push(ti); tambah++; }
    }
  }
  return { tambah, ganti };
}
