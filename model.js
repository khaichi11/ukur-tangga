// Model data Ukur Tangga versi 2.
//
// Lokasi (mis. Gedung F) berisi deret "tangga": tangga 1, bordes, tangga 2, bordes, ...
// Nomor anak tangga dimulai dari 1 lagi setelah setiap bordes.

export const FORMAT = 'ukur-tangga';
export const VERSI = 2;

export function idBaru(awalan) {
  const acak = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random()}`).replace(/[-.]/g, '').slice(0, 10);
  return `${awalan}_${acak}`;
}

export const sekarang = () => new Date().toISOString();

export function dokumenKosong() {
  return { format: FORMAT, versi: VERSI, lokasi: [], diekspor_terakhir: null };
}

export function anakBaru() {
  return { id: idBaru('a'), tinggi_riser_cm: null, panjang_tread_cm: null };
}

export function tanggaBaru(nAnak = 1) {
  return { id: idBaru('t'), anak: Array.from({ length: nAnak }, anakBaru), bordes_sesudah: null, foto: [] };
}

// Foto: metadata di dokumen, gambarnya (JPEG) di IndexedDB dengan kunci id dan id + ':kecil'.
// drive_id: id berkas salinannya di Google Drive (null = belum terunggah).
export function fotoBaru() {
  return { id: idBaru('f'), dibuat: sekarang(), nomor: null, keterangan: '', drive_id: null };
}

export function* semuaFoto(daftarLokasi) {
  for (const l of daftarLokasi) for (const [i, t] of l.tangga.entries()) for (const [k, f] of (t.foto || []).entries()) yield { l, i, t, k, f };
}

const slug = (s) => String(s || '').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'lokasi';

// Nama berkas foto ke-k (0-based) tangga ke-i (0-based) di ZIP ekspor; sama dengan "berkas" di JSON.
// Akhiran id foto membuatnya unik walau dua lokasi bernama sama.
export function namaBerkasFoto(l, i, k, f) {
  return `${slug(l.nama)}_tangga${i + 1}_foto${String(k + 1).padStart(2, '0')}_${String(f.id).slice(-4)}.jpg`;
}

// Berkas dari ZIP ekspor (atau yang dulu dibagikan) -> foto yang gambarnya hilang. Nama persis dulu, lalu
// 4 huruf akhir id foto: tetap sama walau nomor fotoNN bergeser karena ada foto lain yang dihapus.
export function cocokkanFoto(nama, calon) {
  const persis = calon.find(({ l, i, k, f }) => namaBerkasFoto(l, i, k, f) === nama || f.berkas_asal === nama);
  if (persis) return persis;
  const m = nama.match(/_tangga\d+_foto\d+_([A-Za-z0-9]{4})(?:_\d+)?\.jpe?g$/i);
  if (!m) return null;
  const sama = calon.filter(({ f }) => String(f.id).slice(-4) === m[1]);
  return sama.length === 1 ? sama[0] : sama.find(({ l }) => nama.startsWith(`${slug(l.nama)}_`)) || null;
}

export function lokasiBaru(nama) {
  return { id: idBaru('l'), nama, id_studio: '', tangga: [tanggaBaru(1)], dibuat: sekarang(), diubah: sekarang() };
}

// "17,5" / "17.5" -> 17.5; kosong -> null; tidak terbaca -> NaN
export function bacaAngka(teks) {
  const t = String(teks ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : NaN;
}

export const ada = (x) => typeof x === 'number' && Number.isFinite(x);

export function statistik(nilai) {
  const v = nilai.filter(ada);
  if (!v.length) return null;
  const rerata = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - rerata) ** 2, 0) / (v.length - 1)) : 0;
  return { n: v.length, rerata: bulat(rerata), sd: bulat(sd), min: Math.min(...v), maks: Math.max(...v) };
}

export function bulat(x, d = 1) {
  if (!ada(x)) return null;
  const k = 10 ** d;
  return Math.round(x * k) / k;
}

export function ringkasTangga(t) {
  return {
    n: t.anak.length,
    lengkap: t.anak.filter((a) => ada(a.tinggi_riser_cm) && ada(a.panjang_tread_cm)).length,
    riser: statistik(t.anak.map((a) => a.tinggi_riser_cm)),
    tread: statistik(t.anak.map((a) => a.panjang_tread_cm)),
  };
}

export function ringkasLokasi(l) {
  const semua = l.tangga.flatMap((t) => t.anak);
  return {
    n_tangga: l.tangga.length,
    n_anak: semua.length,
    lengkap: semua.filter((a) => ada(a.tinggi_riser_cm) && ada(a.panjang_tread_cm)).length,
    riser: statistik(semua.map((a) => a.tinggi_riser_cm)),
    tread: statistik(semua.map((a) => a.panjang_tread_cm)),
  };
}

// Bantu salah ketik: nilai di luar rentang wajar tangga gedung (tidak ditolak).
export function curiga(jenis, v) {
  if (!ada(v)) return false;
  return jenis === 'riser' ? v < 8 || v > 25 : jenis === 'tread' ? v < 18 || v > 50 : false;
}

// ---------------------------------------------------------------- ekspor
export function eksporJson(dok) {
  return {
    format: FORMAT, versi: VERSI, diekspor: sekarang(),
    satuan: 'cm',
    keterangan: 'tangga ke-1, ke-2, ... dipisah bordes; nomor anak tangga mulai dari 1 lagi di setiap tangga '
      + '(1 = paling bawah). tinggi_riser_cm = tegak antar-permukaan injakan; panjang_tread_cm = kedalaman injakan.',
    lokasi: dok.lokasi.map((l) => ({
      nama: l.nama, id_studio: l.id_studio || null, dibuat: l.dibuat, diubah: l.diubah,
      tangga: l.tangga.map((t, i) => ({
        ke: i + 1,
        anak_tangga: t.anak.map((a, j) => ({ nomor: j + 1, tinggi_riser_cm: a.tinggi_riser_cm, panjang_tread_cm: a.panjang_tread_cm })),
        bordes_sesudah: t.bordes_sesudah ? { panjang_cm: t.bordes_sesudah.panjang_cm ?? null } : null,
        foto: (t.foto || []).map((f, k) => ({ berkas: namaBerkasFoto(l, i, k, f), anak_tangga: f.nomor ?? null,
          keterangan: f.keterangan || '', dibuat: f.dibuat, id: f.id, drive_id: f.drive_id || null })),
      })),
    })),
  };
}

// Isi lembar Google Spreadsheet (ditulis ulang setiap sinkron) + keterangan foto untuk lembar Foto.
export function tabelSheet(dok) {
  const data = [['Lokasi', 'ID Studio', 'Tangga', 'No.', 'Tinggi riser (cm)', 'Panjang tread (cm)', 'Panjang bordes (cm)']];
  const ringkasan = [['Lokasi', 'ID Studio', 'Tangga', 'Jumlah anak tangga', 'Terisi lengkap', 'Riser rata-rata (cm)', 'Riser min',
    'Riser maks', 'Tread rata-rata (cm)', 'Tread min', 'Tread maks', 'Foto']];
  const foto = [];
  for (const l of dok.lokasi) {
    const ids = l.id_studio || '';
    l.tangga.forEach((t, i) => {
      t.anak.forEach((a, j) => data.push([l.nama, ids, i + 1, j + 1, a.tinggi_riser_cm, a.panjang_tread_cm, null]));
      if (t.bordes_sesudah) data.push([l.nama, ids, i + 1, 'bordes', null, null, t.bordes_sesudah.panjang_cm ?? null]);
      const r = ringkasTangga(t);
      ringkasan.push([l.nama, ids, i + 1, r.n, r.lengkap, r.riser?.rerata ?? null, r.riser?.min ?? null, r.riser?.maks ?? null,
        r.tread?.rerata ?? null, r.tread?.min ?? null, r.tread?.maks ?? null, (t.foto || []).length]);
      (t.foto || []).forEach((f, k) => foto.push({ id: f.id, lokasi: l.nama, tangga: i + 1, anak_tangga: f.nomor ?? '',
        keterangan: f.keterangan || '', berkas: namaBerkasFoto(l, i, k, f) }));
    });
  }
  return { data, ringkasan, foto };
}

// Baris tabel datar (dipakai Excel dan cetak).
export function barisTabel(dok) {
  const baris = [];
  for (const l of dok.lokasi) {
    l.tangga.forEach((t, i) => {
      t.anak.forEach((a, j) => baris.push({ lokasi: l.nama, tangga: i + 1, nomor: j + 1, jenis: 'anak tangga',
        riser: a.tinggi_riser_cm, tread: a.panjang_tread_cm, bordes: null }));
      if (t.bordes_sesudah) baris.push({ lokasi: l.nama, tangga: i + 1, nomor: null, jenis: 'bordes',
        riser: null, tread: null, bordes: t.bordes_sesudah.panjang_cm ?? null });
    });
  }
  return baris;
}

// ---------------------------------------------------------------- impor / migrasi
const angka = (x) => (ada(x) ? Math.round(x * 10) / 10 : null);
const teks = (x) => (typeof x === 'string' ? x : '');

// Berkas ekspor versi 2 -> lokasi internal.
function dariV2(data) {
  return data.lokasi.map((l) => ({
    id: idBaru('l'), nama: teks(l.nama) || 'Lokasi', id_studio: teks(l.id_studio),
    dibuat: teks(l.dibuat) || sekarang(), diubah: teks(l.diubah) || sekarang(),
    tangga: (l.tangga || []).map((t) => ({
      id: idBaru('t'),
      anak: (t.anak_tangga || []).map((a) => ({ id: idBaru('a'), tinggi_riser_cm: angka(a.tinggi_riser_cm), panjang_tread_cm: angka(a.panjang_tread_cm) })),
      bordes_sesudah: t.bordes_sesudah ? { panjang_cm: angka(t.bordes_sesudah.panjang_cm) } : null,
      // Gambar tidak ada di JSON: dipulihkan dari Google Drive (drive_id) atau dari ZIP foto (berkas_asal).
      foto: (t.foto || []).map((f) => ({ id: teks(f.id) || idBaru('f'), dibuat: teks(f.dibuat) || sekarang(),
        nomor: Number.isInteger(f.anak_tangga) ? f.anak_tangga : null, keterangan: teks(f.keterangan),
        drive_id: teks(f.drive_id) || null, berkas_asal: teks(f.berkas) })),
    })),
  }));
}

// Versi 1 (gedung -> tangga -> bagian berisi anak_tangga/bordes) -> versi 2: setiap bordes memulai tangga baru.
function dariV1(lokasiV1) {
  return (lokasiV1 || []).map((l) => {
    const tangga = [];
    for (const t of l.tangga || []) {
      let kini = { id: idBaru('t'), anak: [], bordes_sesudah: null, foto: [] };
      for (const b of t.bagian || []) {
        if (b.jenis === 'bordes') {
          kini.bordes_sesudah = { panjang_cm: angka(b.panjang_cm) };
          tangga.push(kini);
          kini = { id: idBaru('t'), anak: [], bordes_sesudah: null, foto: [] };
        } else {
          kini.anak.push({ id: idBaru('a'), tinggi_riser_cm: angka(b.tinggi_riser_cm), panjang_tread_cm: angka(b.panjang_tread_cm) });
        }
      }
      if (kini.anak.length || !tangga.length) tangga.push(kini);
    }
    return { id: idBaru('l'), nama: teks(l.nama) || 'Lokasi', id_studio: teks((l.tangga || [])[0]?.id_studio),
             dibuat: teks(l.dibuat) || sekarang(), diubah: teks(l.diubah) || sekarang(),
             tangga: tangga.length ? tangga : [tanggaBaru(1)] };
  });
}

export function bacaImpor(data) {
  if (!data || data.format !== FORMAT || !Array.isArray(data.lokasi)) throw new Error('Bukan berkas cadangan Ukur Tangga.');
  return data.versi === 1 ? dariV1(data.lokasi) : dariV2(data);
}

// Dokumen tersimpan di perangkat dari versi lama -> versi 2.
export function migrasi(dok) {
  if (!dok || dok.format !== FORMAT) return dokumenKosong();
  if (dok.versi === VERSI) {
    for (const l of dok.lokasi) for (const t of l.tangga) if (!Array.isArray(t.foto)) t.foto = [];   // sebelum ada foto
    return dok;
  }
  if (dok.versi === 1) return { format: FORMAT, versi: VERSI, lokasi: dariV1(dok.lokasi), diekspor_terakhir: dok.diekspor_terakhir || null };
  return dokumenKosong();
}
