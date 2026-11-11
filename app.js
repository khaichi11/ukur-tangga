import * as DB from './db.js';
import * as M from './model.js';
import * as S from './sinkron.js';
import { buatXlsx, buatZip, bacaZip } from './xlsx.js';

let dok = M.dokumenKosong();
const $ = (s) => document.querySelector(s);
const isi = $('#isi'), atas = $('#atas'), bawah = $('#bawah');

// ================================================================ simpan otomatis
let tunda = null;
function ubah() {
  clearTimeout(tunda); tunda = setTimeout(simpan, 250);
  sk.nUbah++; dok.perlu_sinkron = true; jadwalSinkron();
}
async function simpan() {
  clearTimeout(tunda); tunda = null;
  try { await DB.simpanDokumen(dok); } catch (e) { toast('Gagal menyimpan: ' + e.message); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && tunda) simpan(); });
window.addEventListener('pagehide', () => { if (tunda) simpan(); });

// ================================================================ bantu
function el(tag, at = {}, ...anak) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(at)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const a of anak.flat()) if (a !== null && a !== undefined && a !== false) e.append(a.nodeType ? a : document.createTextNode(String(a)));
  return e;
}
const fmt = (x) => (M.ada(x) ? x.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–');
const tgl = (iso) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const jam = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

let timerToast = null;
function toast(pesan, batal = null) {
  const t = $('#toast');
  t.replaceChildren(el('span', {}, pesan));
  if (batal) t.append(el('button', { type: 'button', onclick: () => { batal(); t.classList.remove('tampil'); } }, 'Batalkan'));
  t.style.pointerEvents = batal ? 'auto' : 'none';
  t.classList.add('tampil');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('tampil'), batal ? 5000 : 2200);
}

function dialog(judul, isiDialog, tombol, opsi = {}) {
  const d = $('#dialog'), f = $('#dialog-form');
  f.replaceChildren(el('h2', {}, judul), ...[].concat(isiDialog).filter(Boolean));
  return new Promise((selesai) => {
    if (tombol.length) {
      f.append(el('div', { class: 'aksi' }, tombol.map(([teks, nilai, kelas]) =>
        el('button', { type: 'button', class: kelas, onclick: () => { d.close(); selesai(nilai); } }, teks))));
    }
    // Peristiwa close dialog sebelumnya bisa tiba sesudah dialog ini dibuka (dialog berantai): abaikan.
    d.onclose = () => { if (!d.open) selesai(null); };
    d.showModal();
    const masuk = f.querySelector('input');
    if (masuk && opsi.fokus !== false) setTimeout(() => { masuk.focus(); masuk.select(); }, 60);
  });
}
async function tanyaTeks(judul, nilai, placeholder, tombolOk = 'Simpan') {
  const inp = el('input', { class: 'masuk', value: nilai || '', placeholder, autocomplete: 'off', enterkeyhint: 'done' });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#dialog-form .aksi .biru').click(); } });
  const r = await dialog(judul, inp, [['Batal', null, 'abu'], [tombolOk, 'ok', 'biru']]);
  return r === 'ok' ? inp.value.trim() : null;
}
async function yakin(judul, teks, ya = 'Hapus') {
  return (await dialog(judul, el('p', { class: 'catatan' }, teks), [['Batal', null, 'abu'], [ya, 'ya', 'bahaya']])) === 'ya';
}

// ================================================================ rute
const lokasiAktif = () => {
  const m = location.hash.match(/^#\/l\/(.+)$/);
  return m ? dok.lokasi.find((l) => l.id === m[1]) || null : null;
};
// pushState: pindah halaman tanpa event hashchange yang merender ulang (fokus isian tidak hilang).
function pergi(hash) { if (location.hash !== hash) history.pushState(null, '', hash); tampilkan(); }
window.addEventListener('popstate', () => tampilkan());
window.addEventListener('hashchange', () => tampilkan());
function tampilkan() {
  const l = lokasiAktif();
  if (location.hash.startsWith('#/l/') && !l) { history.replaceState(null, '', '#/'); halBeranda(); return; }
  if (l) halLokasi(l); else halBeranda();
}

// ================================================================ beranda
function halBeranda() {
  document.title = 'Ukur Tangga';
  atas.replaceChildren(el('h1', {}, 'Ukur Tangga'),
    el('button', { id: 'tombol-google', type: 'button', onclick: dialogGoogle }, teksStatus()),
    el('button', { class: 'garis', type: 'button', onclick: () => dialogEkspor(null) }, 'Ekspor'));
  const daftar = [];
  if (sk.hilang) {
    daftar.push(el('div', { class: 'tip peringatan' }, el('span', {}, `${sk.hilang} foto tidak ada di perangkat ini (data browser terhapus).`),
      el('button', { type: 'button', onclick: dialogPulihFoto }, 'Pulihkan')));
  }
  const terpasang = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!terpasang && !localStorage.getItem('ukur-tangga:tip')) {
    daftar.push(el('div', { class: 'tip' }, el('span', {}, 'Agar bisa dipakai tanpa internet: Safari › Bagikan › Tambahkan ke Layar Utama.'),
      el('button', { type: 'button', onclick: (e) => { localStorage.setItem('ukur-tangga:tip', '1'); e.target.closest('.tip').remove(); } }, 'Tutup')));
  }
  if (!dok.lokasi.length) {
    daftar.push(el('p', { class: 'kosong' }, 'Belum ada lokasi. Mulai dengan Tambah lokasi.'));
  }
  const kotakLokasi = el('div', { class: 'daftar-lokasi' });
  for (const l of dok.lokasi) {
    const r = M.ringkasLokasi(l);
    kotakLokasi.append(el('button', { class: 'lokasi', type: 'button', onclick: () => pergi(`#/l/${l.id}`) },
      el('div', {}, el('div', { class: 'nama' }, l.nama),
        el('div', { class: 'sub' }, `${r.n_tangga} tangga · ${r.n_anak} anak tangga${r.n_anak ? ` · ${r.lengkap} terisi` : ''}`)),
      el('span', { class: 'panah' }, '›')));
  }
  if (dok.lokasi.length) daftar.push(kotakLokasi);
  isi.replaceChildren(...daftar);
  bawah.replaceChildren(el('button', { class: 'tombol-utama', type: 'button', onclick: tambahLokasi }, 'Tambah lokasi'));
  bawah.hidden = false;
}

async function tambahLokasi() {
  const nama = await tanyaTeks('Lokasi baru', '', 'mis. Gedung F', 'Tambah');
  if (nama === null) return;
  const l = M.lokasiBaru(nama || `Lokasi ${dok.lokasi.length + 1}`);
  dok.lokasi.push(l);
  ubah();
  pergi(`#/l/${l.id}`);
  fokusKe(l.tangga[0].anak[0].id, 'tinggi_riser_cm');
}

// ================================================================ lokasi
function halLokasi(l) {
  document.title = `${l.nama} · Ukur Tangga`;
  atas.replaceChildren(
    el('button', { class: 'kembali', type: 'button', onclick: () => pergi('#/') }, '‹ Lokasi'),
    el('h1', {}, l.nama),
    el('button', { type: 'button', onclick: () => menuLokasi(l) }, 'Atur'),
    el('button', { class: 'garis', type: 'button', onclick: () => dialogEkspor(l) }, 'Ekspor'));
  const bagian = [];
  l.tangga.forEach((t, i) => {
    bagian.push(kartuTangga(l, t, i));
    if (t.bordes_sesudah) bagian.push(barisBordes(l, t, i));
  });
  bagian.push(el('button', { class: 'tambah-bordes', type: 'button', onclick: () => tambahBordes(l) }, 'Tambah bordes (nomor mulai dari 1 lagi)'));
  isi.replaceChildren(...bagian);
  bawah.hidden = true;
}

function sentuh(l) { l.diubah = M.sekarang(); ubah(); }

function teksRerata(t) {
  const r = M.ringkasTangga(t);
  return [r.riser ? `riser ${fmt(r.riser.rerata)}` : null, r.tread ? `tread ${fmt(r.tread.rerata)}` : null].filter(Boolean).join(' · ');
}

function kartuTangga(l, t, i) {
  const rerata = el('div', { class: 'rerata' }, teksRerata(t) ? `rata-rata ${teksRerata(t)}` : '');
  const judul = `${l.tangga.length > 1 ? `Tangga ${i + 1}` : 'Tangga'} · ${t.anak.length} anak tangga`;
  const tabel = el('table', { class: 'tabel' },
    el('thead', {}, el('tr', {}, el('th', {}, 'No'), el('th', {}, 'Tinggi riser'), el('th', {}, 'Panjang tread'))),
    el('tbody', {}, t.anak.map((a, j) => barisAnak(l, t, a, j, rerata))));
  return el('section', { class: 'tangga', 'data-t': t.id },
    el('div', { class: 'kepala-tangga' }, el('div', { class: 'label-tangga' }, judul), rerata),
    t.anak.length ? tabel : null,
    el('div', { class: 'aksi-tangga', style: t.anak.length ? null : 'border-top: 1px solid var(--garis)' },
      el('button', { class: 'kurang', type: 'button', disabled: !t.anak.length, onclick: () => kurangiAnak(l, t) }, '− Hapus terakhir'),
      el('button', { class: 'foto', type: 'button', onclick: () => tambahFoto(l, t) }, t.foto.length ? `+ Foto (${t.foto.length})` : '+ Foto'),
      el('button', { class: 'tambah', type: 'button', onclick: () => tambahAnak(l, t) }, '+ Anak tangga')),
    stripFoto(l, t, i));
}

function barisAnak(l, t, a, j, rerata) {
  const lengkap = () => M.ada(a.tinggi_riser_cm) && M.ada(a.panjang_tread_cm);
  const baris = el('tr', { class: lengkap() ? 'lengkap' : null });
  const segarkan = () => { baris.classList.toggle('lengkap', lengkap()); const r = teksRerata(t); rerata.textContent = r ? `rata-rata ${r}` : ''; };
  baris.append(el('td', { class: 'no' }, String(j + 1)),
    el('td', {}, kotak(l, t, a, 'tinggi_riser_cm', 'riser', segarkan)), el('td', {}, kotak(l, t, a, 'panjang_tread_cm', 'tread', segarkan)));
  return baris;
}

function kotak(l, t, objek, kunci, jenis, segarkan) {
  const inp = el('input', { inputmode: 'decimal', enterkeyhint: 'next', autocomplete: 'off', placeholder: '0',
    value: M.ada(objek[kunci]) ? String(objek[kunci]).replace('.', ',') : '', 'data-id': `${objek.id}:${kunci}`,
    'aria-label': jenis === 'riser' ? 'tinggi riser cm' : jenis === 'tread' ? 'panjang tread cm' : 'panjang bordes cm' });
  const bungkus = el('label', { class: `sel${M.curiga(jenis, objek[kunci]) ? ' curiga' : ''}` }, inp, el('span', {}, 'cm'));
  const tulis = () => {
    const v = M.bacaAngka(inp.value);
    if (Number.isNaN(v)) { bungkus.classList.add('curiga'); return; }
    if (v !== objek[kunci]) { objek[kunci] = v; sentuh(l); }
    bungkus.classList.toggle('curiga', M.curiga(jenis, v));
    if (segarkan) segarkan();
  };
  inp.addEventListener('input', tulis);
  inp.addEventListener('blur', () => { tulis(); if (M.ada(objek[kunci])) inp.value = String(objek[kunci]).replace('.', ','); });
  inp.addEventListener('focus', () => inp.select());
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    tulis();
    const semua = [...isi.querySelectorAll(`[data-t="${t.id}"] input`)];
    const k = semua.indexOf(inp);
    if (k >= 0 && k + 1 < semua.length) semua[k + 1].focus();
    else if (jenis !== 'bordes') tambahAnak(l, t);     // isian terakhir tangga ini: anak tangga baru
    else inp.blur();
  });
  return bungkus;
}

function fokusKe(id, kunci) {
  requestAnimationFrame(() => {
    const inp = isi.querySelector(`input[data-id="${id}:${kunci}"]`);
    if (inp) { inp.focus({ preventScroll: true }); inp.closest('tr, .bordes')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  });
}

function tambahAnak(l, t) {
  const a = M.anakBaru();
  t.anak.push(a);
  sentuh(l); halLokasi(l);
  fokusKe(a.id, 'tinggi_riser_cm');
}

function kurangiAnak(l, t) {
  if (!t.anak.length) return;
  const a = t.anak.pop();
  sentuh(l); halLokasi(l);
  if (M.ada(a.tinggi_riser_cm) || M.ada(a.panjang_tread_cm)) {
    toast(`Anak tangga ${t.anak.length + 1} dihapus`, () => { t.anak.push(a); sentuh(l); halLokasi(l); });
  }
}

function barisBordes(l, t, i) {
  return el('div', { class: 'bordes', 'data-t': `b-${t.id}` },
    el('div', { class: 'label' }, 'Bordes'),
    kotak(l, { id: `b-${t.id}` }, t.bordes_sesudah, 'panjang_cm', 'bordes'),
    el('button', { class: 'hapus', type: 'button', onclick: () => hapusBordes(l, i) }, 'Hapus'));
}

function tambahBordes(l) {
  const akhir = l.tangga[l.tangga.length - 1];
  akhir.bordes_sesudah = { panjang_cm: null };
  const baru = M.tanggaBaru(1);
  l.tangga.push(baru);
  sentuh(l); halLokasi(l);
  fokusKe(baru.anak[0].id, 'tinggi_riser_cm');
  toast(`Tangga ${l.tangga.length}: nomor mulai dari 1`);
}

async function hapusBordes(l, i) {
  const t = l.tangga[i], berikut = l.tangga[i + 1];
  const isiBerikut = berikut && berikut.anak.some((a) => M.ada(a.tinggi_riser_cm) || M.ada(a.panjang_tread_cm));
  if (isiBerikut && !await yakin('Hapus bordes?', `Tangga ${i + 2} digabung ke tangga ${i + 1}; nomornya disambung.`, 'Gabungkan')) return;
  const cadangan = JSON.parse(JSON.stringify(l.tangga));
  if (berikut) {
    const geser = t.anak.length;               // nomor anak tangga berikutnya disambung
    for (const f of berikut.foto || []) { if (f.nomor) f.nomor += geser; t.foto.push(f); }
    t.anak.push(...berikut.anak); t.bordes_sesudah = berikut.bordes_sesudah; l.tangga.splice(i + 1, 1);
  }
  else t.bordes_sesudah = null;
  sentuh(l); halLokasi(l);
  toast('Bordes dihapus', () => { l.tangga = cadangan; sentuh(l); halLokasi(l); });
}

async function menuLokasi(l) {
  const pilih = await dialog(l.nama, el('div', { class: 'pilihan' },
    el('button', { type: 'button', onclick: () => tutup('nama') }, 'Ganti nama'),
    el('button', { type: 'button', onclick: () => tutup('studio') }, `ID tangga di Studio${l.id_studio ? `: ${l.id_studio}` : ''}`),
    el('button', { type: 'button', class: 'bahaya', onclick: () => tutup('hapus') }, 'Hapus lokasi')), [['Tutup', null, 'abu']]);
  function tutup(n) { $('#dialog').close(); setTimeout(() => lanjut(n), 0); }
  async function lanjut(n) {
    if (n === 'nama') {
      const v = await tanyaTeks('Ganti nama', l.nama, 'mis. Gedung F');
      if (v) { l.nama = v; sentuh(l); halLokasi(l); }
    } else if (n === 'studio') {
      const v = await tanyaTeks('ID tangga di Studio', l.id_studio, 'mis. T01 (boleh kosong)');
      if (v !== null) { l.id_studio = v.toUpperCase(); sentuh(l); }
    } else if (n === 'hapus') {
      if (!await yakin('Hapus lokasi?', `"${l.nama}" dan semua ukurannya dihapus dari iPad ini.`)) return;
      const k = dok.lokasi.indexOf(l), idFoto = [...M.semuaFoto([l])].map(({ f }) => f.id);
      dok.lokasi.splice(k, 1);
      dok.foto_dibuang = [...(dok.foto_dibuang || []), ...idFoto];     // gambarnya dibuang saat aplikasi dibuka lagi
      ubah();
      pergi('#/');
      toast(`"${l.nama}" dihapus`, () => {
        dok.lokasi.splice(k, 0, l);
        dok.foto_dibuang = (dok.foto_dibuang || []).filter((id) => !idFoto.includes(id));
        ubah(); tampilkan();
      });
    }
  }
  return pilih;
}

// ================================================================ foto
// Dari kamera atau galeri iPad (boleh banyak sekaligus), dikecilkan ke 2048 px (JPEG) plus gambar kecil
// 360 px untuk deret, lalu disimpan di IndexedDB iPad ini. Dokumen hanya menyimpan metadatanya (t.foto).
const urlKecil = new Map();                    // id foto -> object URL gambar kecil, dipakai ulang antar-render

async function kecilkan(berkas, maks, mutu) {
  const url = URL.createObjectURL(berkas);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();                        // orientasi EXIF sudah diterapkan browser
    const s = Math.min(1, maks / Math.max(img.naturalWidth, img.naturalHeight));
    const c = el('canvas', { width: Math.max(1, Math.round(img.naturalWidth * s)), height: Math.max(1, Math.round(img.naturalHeight * s)) });
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const hasil = await new Promise((ok, gagal) => c.toBlob((b) => (b ? ok(b) : gagal(new Error('foto tidak dapat diproses'))), 'image/jpeg', mutu));
    c.width = c.height = 0;                    // lepas memori kanvas segera; iPad membatasi total memori kanvas
    return hasil;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// iPad menawarkan Ambil Foto (kamera) atau Pustaka Foto (pilih banyak). Foto dari galeri tetap ada di
// aplikasi Foto iPad, jadi itu cadangan kedua.
function tambahFoto(l, t) {
  const inp = $('#ambil-foto');
  inp.value = '';
  inp.onchange = async () => {
    const berkas = [...(inp.files || [])];
    inp.value = '';
    if (!berkas.length) return;
    const baru = [], gagal = [];
    for (const [n, f] of berkas.entries()) {
      toast(berkas.length > 1 ? `Memproses foto ${n + 1} dari ${berkas.length}…` : 'Memproses foto…');
      try {
        const besar = await kecilkan(f, 2048, 0.85), kecil = await kecilkan(besar, 360, 0.7);
        const foto = M.fotoBaru();
        await DB.simpanFoto(foto.id, besar);
        await DB.simpanFoto(`${foto.id}:kecil`, kecil);
        t.foto.push(foto); baru.push(foto);
        l.diubah = M.sekarang();
        await simpan();                        // tiap foto langsung dicatat: yang sudah masuk aman bila aplikasi tertutup
      } catch (e) {
        gagal.push(`${f.name || `foto ${n + 1}`}: ${e.message}`);
      }
    }
    if (baru.length) { jadwalSinkron(1000); halLokasi(l); }
    if (gagal.length) {
      await dialog('Ada foto yang gagal disimpan', [
        el('p', {}, `${baru.length} foto tersimpan, ${gagal.length} gagal. Tambahkan lagi foto yang gagal lewat + Foto.`),
        el('p', { class: 'catatan' }, gagal.join(' · ')),
      ], [['OK', null, 'biru']]);
    } else if (baru.length === 1) {
      await bukaFoto(l, t, baru[0], true);
    } else {
      toast(`${baru.length} foto ditambahkan. Ketuk foto untuk memberi nomor anak tangga atau keterangan.`);
    }
  };
  inp.click();
}

function stripFoto(l, t, i) {
  if (!t.foto.length) return null;
  return el('div', { class: 'strip-foto' }, t.foto.map((f, k) => {
    const img = el('img', { alt: `Foto ${k + 1} tangga ${i + 1}` });
    pasangKecil(img, f.id);
    return el('button', { type: 'button', class: `kecil${!f.drive_id && S.atur() ? ' antre' : ''}`, 'data-f': f.id, onclick: () => bukaFoto(l, t, f, false) },
      img, f.nomor ? el('span', {}, `No ${f.nomor}`) : null);
  }));
}

async function pasangKecil(img, id) {
  let url = urlKecil.get(id);
  if (!url) {
    const b = (await DB.bacaFoto(`${id}:kecil`)) || (await DB.bacaFoto(id));
    img.parentElement?.classList.toggle('tiada', !b);
    if (!b) { img.hidden = true; return; }
    url = URL.createObjectURL(b);
    urlKecil.set(id, url);
  }
  img.hidden = false;
  img.src = url;
}

// Gambar kecil di halaman yang sedang tampil diperbarui di tempat (isian yang sedang diketik tidak terganggu).
function segarkanKecil(f) {
  const b = isi.querySelector(`.kecil[data-f="${f.id}"]`);
  if (!b) return;
  b.classList.toggle('antre', !f.drive_id && !!S.atur());
  pasangKecil(b.querySelector('img'), f.id);
}

// Gambar foto disimpan ulang (dari Drive, ZIP, atau dipilih manual) beserta gambar kecilnya.
async function simpanGambar(f, blob, sudahKecil) {
  const besar = sudahKecil ? blob : await kecilkan(blob, 2048, 0.85);
  await DB.simpanFoto(f.id, besar);
  await DB.simpanFoto(`${f.id}:kecil`, await kecilkan(besar, 360, 0.7));
  if (urlKecil.has(f.id)) { URL.revokeObjectURL(urlKecil.get(f.id)); urlKecil.delete(f.id); }
  segarkanKecil(f);
}

function pilihBerkas(banyak) {
  const inp = $('#pilih-foto');
  inp.value = '';
  inp.multiple = banyak;
  return new Promise((ok) => {
    inp.onchange = () => ok([...(inp.files || [])]);
    inp.oncancel = () => ok([]);
    inp.click();
  });
}

async function gantiGambar(l, t, f) {
  const [b] = await pilihBerkas(false);
  if (!b) return;
  try {
    await simpanGambar(f, b, false);
    f.drive_id = null; f.ganti_gambar = true; sentuh(l);    // gambar lain: unggah sebagai berkas baru
    await periksaFoto(); halLokasi(l);
    toast('Gambar dipasang');
  } catch (e) { toast('Gagal: ' + e.message); }
}

async function bukaFoto(l, t, f, baru) {
  const i = l.tangga.indexOf(t), k = t.foto.indexOf(f);
  const blob = await DB.bacaFoto(f.id);
  const url = blob ? URL.createObjectURL(blob) : null;
  const pilih = el('select', { class: 'masuk' }, el('option', { value: '' }, 'Seluruh tangga'),
    t.anak.map((_, j) => el('option', { value: String(j + 1) }, `Anak tangga ${j + 1}`)));
  pilih.value = f.nomor ? String(f.nomor) : '';
  const ket = el('input', { class: 'masuk', value: f.keterangan || '', placeholder: 'mis. meteran di riser 3', autocomplete: 'off', enterkeyhint: 'done' });
  ket.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#dialog-form .aksi .biru').click(); } });
  const d = $('#dialog');
  d.classList.add('lebar');
  const r = await dialog(baru ? 'Foto disimpan' : `Foto ${k + 1} · ${l.tangga.length > 1 ? `Tangga ${i + 1}` : 'Tangga'}`, [
    url ? el('img', { class: 'pratinjau', src: url, alt: '' })
      : el('p', { class: 'catatan' }, 'Gambar foto ini tidak ada di perangkat ini. '
        + (f.drive_id && S.atur() ? 'Salinannya di Google Drive diunduh otomatis saat tersambung internet, atau pilih gambarnya sendiri.'
          : 'Pulihkan dari ZIP ekspor (Ekspor › Pulihkan foto yang hilang) atau pilih gambarnya sendiri.')),
    el('label', { class: 'kolom' }, 'Foto untuk', pilih),
    el('label', { class: 'kolom' }, 'Keterangan', ket),
  ], [['Hapus', 'hapus', 'bahaya'], blob ? ['Bagikan', 'bagikan', 'abu'] : ['Pilih gambar', 'ganti', 'abu'], ['Simpan', 'ok', 'biru']], { fokus: false });
  d.classList.remove('lebar');
  if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (r === 'ok' || r === 'bagikan' || r === 'ganti') {
    const nomor = pilih.value ? Number(pilih.value) : null, keterangan = ket.value.trim();
    if (nomor !== f.nomor || keterangan !== (f.keterangan || '')) { f.nomor = nomor; f.keterangan = keterangan; sentuh(l); halLokasi(l); }
  }
  if (r === 'bagikan' && blob) await kirim(blob, M.namaBerkasFoto(l, i, k, f));
  if (r === 'ganti') await gantiGambar(l, t, f);
  if (r === 'hapus') await hapusFotoDari(l, t, f);
}

async function hapusFotoDari(l, t, f) {
  if (!await yakin('Hapus foto?', `Foto ini dihapus dari perangkat ini.${f.drive_id ? ' Salinannya di Google Drive tetap ada.' : ''}`)) return;
  const k = t.foto.indexOf(f);
  const besar = await DB.bacaFoto(f.id), kecil = await DB.bacaFoto(`${f.id}:kecil`);
  t.foto.splice(k, 1);
  await DB.hapusFoto(f.id); await DB.hapusFoto(`${f.id}:kecil`);
  if (urlKecil.has(f.id)) { URL.revokeObjectURL(urlKecil.get(f.id)); urlKecil.delete(f.id); }
  sentuh(l); halLokasi(l);
  toast('Foto dihapus', async () => {
    if (besar) await DB.simpanFoto(f.id, besar);
    if (kecil) await DB.simpanFoto(`${f.id}:kecil`, kecil);
    t.foto.splice(k, 0, f); sentuh(l); halLokasi(l);
  });
}

const jumlahFoto = (daftar) => daftar.reduce((n, l) => n + l.tangga.reduce((m, t) => m + (t.foto || []).length, 0), 0);

// ZIP berisi semua foto lokasi terpilih + foto.csv (berkas, lokasi, tangga, anak tangga, keterangan, waktu).
async function zipFoto(daftar) {
  const berkas = [], baris = [['berkas', 'lokasi', 'tangga', 'anak_tangga', 'keterangan', 'dibuat']], dipakai = new Set();
  for (const l of daftar) {
    for (const [i, t] of l.tangga.entries()) {
      for (const [k, f] of (t.foto || []).entries()) {
        const b = await DB.bacaFoto(f.id);
        if (!b) continue;
        let nama = M.namaBerkasFoto(l, i, k, f);
        for (let n = 2; dipakai.has(nama); n++) nama = M.namaBerkasFoto(l, i, k, f).replace(/\.jpg$/, `_${n}.jpg`);
        dipakai.add(nama);
        berkas.push([nama, new Uint8Array(await b.arrayBuffer())]);
        baris.push([nama, l.nama, i + 1, f.nomor ?? '', f.keterangan || '', f.dibuat]);
      }
    }
  }
  const csv = baris.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  berkas.push(['foto.csv', '\ufeff' + csv]);
  return { blob: buatZip(berkas), n: berkas.length - 1 };
}

// Gambar dari lokasi yang dihapus pada sesi sebelumnya dibuang saat aplikasi dibuka. Hanya yang memang
// dibuang (dok.foto_dibuang): gambar lain yang kebetulan tidak tercatat di dokumen dibiarkan, karena dulu
// cara "buang semua yang tidak dirujuk" ikut menghapus foto bila dokumen yang terbaca bukan yang terbaru.
async function bersihkanFoto() {
  const dibuang = dok.foto_dibuang || [];
  if (!dibuang.length) return;
  const dipakai = new Set([...M.semuaFoto(dok.lokasi)].map(({ f }) => f.id));
  for (const id of dibuang) if (!dipakai.has(id)) { await DB.hapusFoto(id); await DB.hapusFoto(`${id}:kecil`); }
  dok.foto_dibuang = [];
  await simpan();
}

// ================================================================ Google Spreadsheet + Drive (sinkron.js, google/Kode.gs)
// Foto tanpa drive_id diunggah satu per satu ke Drive; sesudahnya ukuran ditulis ulang ke spreadsheet dan
// seluruh dokumen (termasuk drive_id) disimpan sebagai JSON di Drive. Gambar yang hilang dari perangkat
// (data browser terhapus) diunduh kembali dari Drive. Semua kerja jaringan berurutan, satu per satu.
const sk = { nUbah: 0, timer: null, menunggu: false, jalan: false, galat: '', antre: 0, hilang: 0, hilangDrive: 0 };
let rantai = Promise.resolve();
const berurutan = (kerja) => (rantai = rantai.catch(() => {}).then(kerja));

function jadwalSinkron(jeda = 8000) {
  if (!S.atur()) return;
  clearTimeout(sk.timer);
  sk.timer = setTimeout(sinkron, jeda);
}

function sinkron() {
  clearTimeout(sk.timer);
  if (!S.atur() || sk.menunggu) return rantai;
  sk.menunggu = true;
  return berurutan(async () => {
    sk.menunggu = false;
    const a = S.atur();
    if (!a) return;
    sk.jalan = true; tampilStatus();
    try {
      await unggahFoto(a);
      if (dok.perlu_sinkron && dok.lokasi.length) await kirimData(a);
      await unduhFotoHilang(a, false);
      sk.galat = '';
    } catch (e) {
      sk.galat = e.message;
      sk.timer = setTimeout(sinkron, 60000);   // coba lagi tiap menit selama aplikasi terbuka
    } finally {
      sk.jalan = false;
      await periksaFoto(); tampilStatus();
    }
  });
}

async function unggahFoto(a) {
  const ada = new Set(await DB.daftarKunciFoto());
  for (const { l, i, k, f } of M.semuaFoto(dok.lokasi)) {
    if (f.drive_id || !ada.has(f.id)) continue;
    const besar = await DB.bacaFoto(f.id);
    if (!besar) continue;
    const kecil = await DB.bacaFoto(`${f.id}:kecil`);
    const j = await S.panggil(a, { aksi: 'foto', id: f.id, baru: !!f.ganti_gambar, berkas: M.namaBerkasFoto(l, i, k, f),
      mime: besar.type || 'image/jpeg', lokasi: l.nama, tangga: i + 1, anak_tangga: f.nomor ?? '', keterangan: f.keterangan || '',
      dibuat: f.dibuat, data: await S.keBase64(besar), kecil: kecil ? await S.keBase64(kecil) : '' });
    f.drive_id = j.drive_id; delete f.ganti_gambar;
    dok.perlu_sinkron = true;                  // drive_id ikut JSON di Drive agar gambarnya bisa dipulihkan
    await simpan();
    sk.antre = Math.max(0, sk.antre - 1); tampilStatus(); segarkanKecil(f);
  }
}

async function kirimData(a) {
  const n = sk.nUbah;
  const { data, ringkasan, foto } = M.tabelSheet(dok);
  await S.panggil(a, { aksi: 'data', dokumen: dok, data, ringkasan, foto });
  dok.sinkron_terakhir = M.sekarang();
  if (n === sk.nUbah) dok.perlu_sinkron = false;
  else jadwalSinkron();                        // ada perubahan selama mengirim
  await simpan();
}

// semua = true: coba juga foto yang sebelumnya gagal diunduh (dipanggil dari tombol Pulihkan).
async function unduhFotoHilang(a, semua, beri = null) {
  const ada = new Set(await DB.daftarKunciFoto());
  let n = 0, gagal = 0;
  for (const { f } of M.semuaFoto(dok.lokasi)) {
    if (!f.drive_id || ada.has(f.id) || (f.drive_gagal && !semua)) continue;
    try {
      const g = await S.panggil(a, { aksi: 'ambil_foto', drive_id: f.drive_id, id: f.id });
      await simpanGambar(f, S.dariBase64(g.data, g.mime || 'image/jpeg'), true);
      if (f.drive_gagal) { delete f.drive_gagal; ubah(); }
      n++;
      if (beri) beri(n);
    } catch (e) {
      if (e.kode !== 'hilang') throw e;        // jaringan putus dll.: hentikan, coba lagi nanti
      f.drive_gagal = true; gagal++; ubah();
    }
  }
  return { n, gagal };
}

async function periksaFoto() {
  const ada = new Set(await DB.daftarKunciFoto());
  let antre = 0, hilang = 0, hilangDrive = 0;
  for (const { f } of M.semuaFoto(dok.lokasi)) {
    if (!ada.has(f.id)) { hilang++; if (f.drive_id) hilangDrive++; } else if (!f.drive_id) antre++;
  }
  const berubah = hilang !== sk.hilang;
  Object.assign(sk, { antre, hilang, hilangDrive });
  if (berubah && !lokasiAktif() && !$('#dialog').open) halBeranda();
}

function teksStatus() {
  if (!S.atur()) return 'Google';
  if (sk.jalan) return 'Google: kirim…';
  if (sk.galat) return 'Google: tertunda';
  if (sk.antre) return `Google: ${sk.antre} antre`;
  return dok.perlu_sinkron && dok.lokasi.length ? 'Google: menunggu' : 'Google: aman';
}
function tampilStatus() {
  const b = document.getElementById('tombol-google');
  if (b) b.textContent = teksStatus();
}

async function dialogGoogle() {
  await periksaFoto();
  const a = S.atur();
  const url = el('input', { class: 'masuk', value: a?.url || '', placeholder: 'https://script.google.com/macros/s/…/exec',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: 'url' });
  const kunci = el('input', { class: 'masuk', value: a?.kunci || '', placeholder: 'sama dengan KUNCI di Kode.gs', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const tetap = await DB.sudahPersisten();
  const keluar = (aksi) => { $('#dialog').close(); setTimeout(aksi, 0); };
  const status = a ? [
    sk.galat ? `Tertunda: ${sk.galat}.` : null,
    sk.antre ? `${sk.antre} foto belum terunggah.` : 'Semua foto sudah ada di Drive.',
    dok.sinkron_terakhir ? `Spreadsheet terakhir diperbarui ${jam(dok.sinkron_terakhir)}.` : 'Spreadsheet belum pernah diperbarui.',
  ] : ['Foto diunggah ke Google Drive dan ukuran ditulis ke Google Spreadsheet milik Anda, jadi tidak hilang walau data Chrome terhapus.',
    'Cara memasang skripnya: GOOGLE.md di repo ukur-tangga.'];
  status.push(sk.hilang ? `${sk.hilang} foto tidak ada di perangkat ini.` : null,
    tetap ? null : 'Browser belum menjamin penyimpanan tetap: data perangkat bisa dihapus saat ruang penuh.');
  const r = await dialog('Google Spreadsheet', [
    el('label', { class: 'kolom' }, 'URL aplikasi web', url),
    el('label', { class: 'kolom' }, 'Kunci', kunci),
    a ? el('div', { class: 'pilihan' },
      el('button', { type: 'button', onclick: () => keluar(() => sinkron().then(() => toast(sk.galat ? `Tertunda: ${sk.galat}` : 'Terkirim ke Google'))) }, 'Kirim sekarang'),
      el('button', { type: 'button', onclick: () => keluar(() => pulihkanGoogle(a)) }, 'Pulihkan dari Google'),
      el('button', { type: 'button', onclick: () => keluar(() => bagikanTautan(a)) }, 'Bagikan tautan sambung'),
      el('button', { type: 'button', class: 'bahaya', onclick: () => keluar(putuskan) }, 'Putuskan')) : null,
    el('p', { class: 'catatan' }, status.filter(Boolean).join(' ')),
  ], [['Tutup', null, 'abu'], [a ? 'Simpan' : 'Sambungkan', 'ok', 'biru']], { fokus: !a });
  if (r === 'ok') await sambungkan(url.value.trim(), kunci.value.trim());
}

async function sambungkan(url, kunci) {
  if (!S.urlSah(url)) { toast('URL harus URL aplikasi web Apps Script yang berakhiran /exec'); return; }
  const a = { url, kunci };
  toast('Menghubungi Google…');
  let j;
  try { j = await S.panggil(a, { aksi: 'uji' }, 30000); } catch (e) { toast('Gagal tersambung: ' + e.message); return; }
  if (dok.google_folder && dok.google_folder !== j.folder) {
    for (const { f } of M.semuaFoto(dok.lokasi)) { f.drive_id = null; delete f.drive_gagal; }   // Drive lain: unggah ulang
  }
  dok.google_folder = j.folder;
  S.simpanAtur(a);
  sk.nUbah++; dok.perlu_sinkron = true; sk.galat = '';
  await simpan(); await periksaFoto(); tampilkan();
  toast(`Tersambung ke "${j.nama}"`);
  const lokal = new Set(dok.lokasi.map((l) => l.id));
  const lain = (j.lokasi || []).filter((l) => !lokal.has(l.id));
  if (lain.length && await yakin('Pulihkan dari Google?', `Google menyimpan ${lain.length} lokasi yang tidak ada di perangkat ini `
    + `(${lain.slice(0, 3).map((l) => l.nama).join(', ')}${lain.length > 3 ? ', …' : ''}). Tambahkan beserta fotonya?`, 'Pulihkan')) {
    await pulihkanGoogle(a);
  } else sinkron();
}

function pulihkanGoogle(a) {
  return berurutan(async () => {
    toast('Mengambil data dari Google…');
    try {
      const j = await S.panggil(a, { aksi: 'pulihkan' });
      const awan = M.migrasi(j.dokumen);
      const lokal = new Map(dok.lokasi.map((l) => [l.id, l]));
      let nL = 0;
      for (const l of awan.lokasi) {
        const ini = lokal.get(l.id);
        if (!ini) { dok.lokasi.push(l); nL++; continue; }
        const diDrive = new Map([...M.semuaFoto([l])].map(({ f }) => [f.id, f.drive_id]));   // lokasi sama: lengkapi drive_id
        for (const { f } of M.semuaFoto([ini])) if (!f.drive_id && diDrive.get(f.id)) f.drive_id = diDrive.get(f.id);
      }
      if (j.folder) dok.google_folder = j.folder;
      sk.nUbah++; dok.perlu_sinkron = true;
      await simpan(); tampilkan();
      const { n, gagal } = await unduhFotoHilang(a, true, (x) => toast(`Mengunduh foto ${x}…`));
      await periksaFoto(); tampilkan();
      toast(`${nL} lokasi dan ${n} foto dipulihkan${gagal ? `; ${gagal} foto tidak ada lagi di Drive` : ''}`);
    } catch (e) { toast('Gagal memulihkan: ' + e.message); }
    jadwalSinkron(1000);
  });
}

async function bagikanTautan(a) {
  const t = S.tautanSambung(a);
  try {
    if (navigator.share) { await navigator.share({ title: 'Sambung Ukur Tangga ke Google', text: t }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(t); toast('Tautan disalin. Simpan di Catatan.'); } catch (_) {
    await dialog('Tautan sambung', el('input', { class: 'masuk', value: t, readonly: true }), [['Tutup', null, 'abu']]);
  }
}

async function putuskan() {
  if (!await yakin('Putuskan Google?', 'Perangkat ini berhenti mengirim ke Google. Data di Spreadsheet dan Drive tidak dihapus.', 'Putuskan')) return;
  S.simpanAtur(null); clearTimeout(sk.timer); sk.galat = '';
  tampilkan();
}

async function dialogPulihFoto() {
  await periksaFoto();
  const a = S.atur();
  const keluar = (aksi) => { $('#dialog').close(); setTimeout(aksi, 0); };
  await dialog('Pulihkan foto', [
    el('p', { class: 'catatan' }, sk.hilang
      ? `${sk.hilang} foto tercatat tetapi gambarnya tidak ada di perangkat ini${sk.hilangDrive ? `; ${sk.hilangDrive} di antaranya ada di Google Drive` : ''}.`
      : 'Semua gambar foto ada di perangkat ini.'),
    el('div', { class: 'pilihan' },
      a ? el('button', { type: 'button', onclick: () => keluar(() => pulihkanGoogle(a)) }, 'Dari Google Drive') : null,
      el('button', { type: 'button', onclick: () => keluar(pulihkanFotoBerkas) }, 'Dari ZIP ekspor atau berkas foto')),
    el('p', { class: 'catatan' }, 'Pilih ZIP dari Ekspor › Foto (.zip), atau foto yang dulu disimpan lewat Bagikan (nama berkasnya '
      + 'seperti Gedung_F_tangga1_foto01_a3f9.jpg). Gambar yang belum pernah diunggah atau diekspor tidak bisa dipulihkan: '
      + 'foto dari kamera aplikasi ini biasanya tidak masuk galeri. Untuk satu foto, ketuk fotonya lalu Pilih gambar.'),
  ], [['Tutup', null, 'abu']]);
}

async function pulihkanFotoBerkas() {
  const berkas = await pilihBerkas(true);
  if (!berkas.length) return;
  toast('Membaca berkas…');
  const masuk = [];                              // [nama, Blob, sudah JPEG 2048 px dari aplikasi ini]
  const gambar = /\.(jpe?g|png|heic|heif|webp)$/i;
  try {
    for (const b of berkas) {
      if (/\.zip$/i.test(b.name) || /zip/.test(b.type)) {
        for (const [nama, data] of await bacaZip(await b.arrayBuffer())) {
          const dasar = nama.split('/').pop();
          if (gambar.test(dasar) && !dasar.startsWith('._')) {
            const jpg = /\.jpe?g$/i.test(dasar);
            masuk.push([dasar, new Blob([data], { type: jpg ? 'image/jpeg' : `image/${dasar.split('.').pop().toLowerCase()}` }), jpg]);
          }
        }
      } else if (gambar.test(b.name) || b.type.startsWith('image/')) masuk.push([b.name, b, false]);
    }
  } catch (e) { toast('Gagal membaca: ' + e.message); return; }
  const ada = new Set(await DB.daftarKunciFoto());
  const calon = [...M.semuaFoto(dok.lokasi)].filter(({ f }) => !ada.has(f.id));
  let n = 0, salah = 0;
  for (const [nama, blob, jpg] of masuk) {
    const c = M.cocokkanFoto(nama, calon);
    if (!c) { salah++; continue; }
    try { await simpanGambar(c.f, blob, jpg); } catch (_) { salah++; continue; }
    calon.splice(calon.indexOf(c), 1);
    n++;
  }
  await periksaFoto(); tampilkan();
  if (n) jadwalSinkron(1000);
  toast(n ? `${n} foto dipulihkan${salah ? `; ${salah} berkas tidak cocok` : ''}${sk.hilang ? `; ${sk.hilang} masih hilang` : ''}`
    : `Tidak ada berkas yang cocok dengan ${sk.hilang} foto yang hilang`);
}

// ================================================================ ekspor / impor / cetak
function namaBerkas(dasar, akhiran) {
  const d = new Date(), p = (x) => String(x).padStart(2, '0');
  const bersih = dasar.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'ukur_tangga';
  return `${bersih}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.${akhiran}`;
}

async function kirim(blob, nama) {
  const berkas = new File([blob], nama, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [berkas] })) {
    try { await navigator.share({ files: [berkas] }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nama });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

function xlsxUntuk(daftarLokasi) {
  const H = (v) => ({ v, gaya: 1 }), A = (v) => ({ v, gaya: 2 }), Y = (v) => ({ v, gaya: 4 }), YA = (v) => ({ v, gaya: 5 });
  const data = [['Lokasi', 'Tangga', 'No.', 'Tinggi riser (cm)', 'Panjang tread (cm)', 'Panjang bordes (cm)'].map(H)];
  const ringkas = [['Lokasi', 'Tangga', 'Jumlah anak tangga', 'Riser rata-rata (cm)', 'Riser min', 'Riser maks',
    'Tread rata-rata (cm)', 'Tread min', 'Tread maks'].map(H)];
  for (const l of daftarLokasi) {
    l.tangga.forEach((t, i) => {
      t.anak.forEach((a, j) => data.push([l.nama, i + 1, j + 1, A(a.tinggi_riser_cm), A(a.panjang_tread_cm), null]));
      if (t.bordes_sesudah) data.push([Y(l.nama), Y(i + 1), Y('bordes'), Y(null), Y(null), YA(t.bordes_sesudah.panjang_cm)]);
      const r = M.ringkasTangga(t);
      ringkas.push([l.nama, i + 1, t.anak.length, A(r.riser?.rerata ?? null), A(r.riser?.min ?? null), A(r.riser?.maks ?? null),
        A(r.tread?.rerata ?? null), A(r.tread?.min ?? null), A(r.tread?.maks ?? null)]);
    });
  }
  return buatXlsx([
    { nama: 'Data', lebar: [22, 9, 7, 18, 19, 20], baris: data },
    { nama: 'Ringkasan', lebar: [22, 9, 19, 20, 11, 11, 20, 11, 11], baris: ringkas },
  ]);
}

async function dialogEkspor(l) {
  const daftar = l ? [l] : dok.lokasi;
  const judulBerkas = l ? l.nama : 'ukur_tangga';
  const keluar = (aksi) => { $('#dialog').close(); setTimeout(aksi, 0); };
  const tombol = [
    el('button', { type: 'button', disabled: !daftar.length, onclick: () => keluar(async () => {
      if (await kirim(xlsxUntuk(daftar), namaBerkas(judulBerkas, 'xlsx'))) toast('Excel dibuat');
    }) }, 'Excel (.xlsx)'),
    el('button', { type: 'button', disabled: !daftar.length, onclick: () => keluar(() => cetak(daftar)) }, 'Cetak / PDF'),
    el('button', { type: 'button', disabled: !jumlahFoto(daftar), onclick: () => keluar(async () => {
      toast('Menyiapkan foto…');
      const { blob, n } = await zipFoto(daftar);
      if (await kirim(blob, namaBerkas(`foto_${judulBerkas}`, 'zip'))) toast(`${n} foto dibuat (.zip)`);
    }) }, `Foto (.zip)${jumlahFoto(daftar) ? ` · ${jumlahFoto(daftar)} foto` : ''}`),
    el('button', { type: 'button', onclick: () => keluar(async () => {
      const blob = new Blob([JSON.stringify(M.eksporJson(dok), null, 1)], { type: 'application/json' });
      if (await kirim(blob, namaBerkas('cadangan_ukur_tangga', 'json'))) { dok.diekspor_terakhir = M.sekarang(); ubah(); toast('Cadangan disimpan'); }
    }) }, 'Simpan cadangan JSON (semua lokasi)'),
    el('button', { type: 'button', onclick: () => keluar(pulihkan) }, 'Pulihkan dari cadangan'),
    el('button', { type: 'button', onclick: () => keluar(dialogPulihFoto) }, `Pulihkan foto yang hilang${sk.hilang ? ` · ${sk.hilang} foto` : ''}`),
  ];
  const awan = S.atur() ? `Data dan foto juga dikirim ke Google Spreadsheet${dok.sinkron_terakhir ? ` (terakhir ${jam(dok.sinkron_terakhir)})` : ''}.`
    : 'Data hanya ada di perangkat ini; sambungkan Google agar tidak hilang bila data browser terhapus.';
  await dialog(l ? `Ekspor · ${l.nama}` : 'Ekspor semua lokasi', [el('div', { class: 'pilihan' }, tombol),
    el('p', { class: 'catatan' }, `${awan} ${dok.diekspor_terakhir ? `Cadangan terakhir ${tgl(dok.diekspor_terakhir)}.` : 'Belum ada cadangan.'}`
      + (jumlahFoto(dok.lokasi) ? ' Cadangan JSON tidak berisi gambar; simpan juga Foto (.zip).' : ''))],
  [['Tutup', null, 'abu']]);
}

function pulihkan() {
  const inp = $('#pilih-berkas');
  inp.value = '';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try {
      const lokasi = M.bacaImpor(JSON.parse(await f.text()));
      const nama = new Set(dok.lokasi.map((l) => l.nama));
      if (!await yakin('Pulihkan cadangan?', `${lokasi.length} lokasi dari "${f.name}" ditambahkan ke perangkat ini.`, 'Pulihkan')) return;
      const idFoto = new Set([...M.semuaFoto(dok.lokasi)].map(({ f: x }) => x.id));
      for (const { f: x } of M.semuaFoto(lokasi)) if (idFoto.has(x.id)) x.id = M.idBaru('f');   // jangan berbagi gambar
      for (const l of lokasi) { if (nama.has(l.nama)) l.nama = `${l.nama} (cadangan)`; dok.lokasi.push(l); }
      sk.nUbah++; dok.perlu_sinkron = true;
      await simpan(); await periksaFoto(); tampilkan();
      toast(`${lokasi.length} lokasi dipulihkan${sk.hilang ? `; ${sk.hilang} foto perlu dipulihkan gambarnya` : ''}`);
      jadwalSinkron(1000);
    } catch (e) { toast('Gagal: ' + e.message); }
  };
  inp.click();
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function cetak(daftar) {
  let h = `<h1>Ukuran anak tangga</h1><div class="meta">Dicetak ${esc(new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }))} · satuan cm</div>`;
  daftar.forEach((l, k) => {
    h += `<h2${k ? ' class="putus"' : ''}>${esc(l.nama)}</h2><table><thead><tr><th>Tangga</th><th>No.</th><th>Tinggi riser</th><th>Panjang tread</th></tr></thead><tbody>`;
    l.tangga.forEach((t, i) => {
      t.anak.forEach((a, j) => { h += `<tr><td>${i + 1}</td><td>${j + 1}</td><td class="n">${fmt(a.tinggi_riser_cm)}</td><td class="n">${fmt(a.panjang_tread_cm)}</td></tr>`; });
      const r = M.ringkasTangga(t);
      h += `<tr><td colspan="2"><i>rata-rata</i></td><td class="n"><i>${fmt(r.riser?.rerata)}</i></td><td class="n"><i>${fmt(r.tread?.rerata)}</i></td></tr>`;
      if (t.bordes_sesudah) h += `<tr class="bordes"><td colspan="2">Bordes</td><td colspan="2">${M.ada(t.bordes_sesudah.panjang_cm) ? `panjang ${fmt(t.bordes_sesudah.panjang_cm)} cm` : ''}</td></tr>`;
    });
    h += '</tbody></table>';
  });
  $('#cetak').innerHTML = h;
  setTimeout(() => window.print(), 120);
}

// ================================================================ mulai
async function mulai() {
  const tersimpan = await DB.bacaDokumen();
  dok = M.migrasi(tersimpan);
  if (tersimpan && tersimpan.versi !== M.VERSI) await simpan();      // data versi lama dipindah ke format baru
  DB.mintaPersisten();
  if (tersimpan) setTimeout(() => bersihkanFoto().catch(() => {}), 3000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  const tautan = S.dariTautan();                 // ?google=<url>&kunci=<kunci> dari "Bagikan tautan sambung"
  if (tautan) history.replaceState(null, '', location.pathname + location.hash);
  await periksaFoto();
  tampilkan();
  if (tautan) await sambungkan(tautan.url, tautan.kunci);
  else jadwalSinkron(1500);
  window.addEventListener('online', () => jadwalSinkron(1000));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') jadwalSinkron(2000); });
}
mulai();
