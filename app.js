import * as DB from './db.js';
import * as M from './model.js';
import { buatXlsx } from './xlsx.js';

let dok = M.dokumenKosong();
const $ = (s) => document.querySelector(s);
const isi = $('#isi'), atas = $('#atas'), bawah = $('#bawah');

// ================================================================ simpan otomatis
let tunda = null;
function ubah() { clearTimeout(tunda); tunda = setTimeout(simpan, 250); }
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

function dialog(judul, isiDialog, tombol) {
  const d = $('#dialog'), f = $('#dialog-form');
  f.replaceChildren(el('h2', {}, judul), ...[].concat(isiDialog).filter(Boolean));
  return new Promise((selesai) => {
    if (tombol.length) {
      f.append(el('div', { class: 'aksi' }, tombol.map(([teks, nilai, kelas]) =>
        el('button', { type: 'button', class: kelas, onclick: () => { d.close(); selesai(nilai); } }, teks))));
    }
    d.onclose = () => selesai(null);
    d.showModal();
    const masuk = f.querySelector('input');
    if (masuk) setTimeout(() => { masuk.focus(); masuk.select(); }, 60);
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
    el('button', { class: 'garis', type: 'button', onclick: () => dialogEkspor(null) }, 'Ekspor'));
  const daftar = [];
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
      el('button', { class: 'tambah', type: 'button', onclick: () => tambahAnak(l, t) }, '+ Anak tangga')));
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
  if (berikut) { t.anak.push(...berikut.anak); t.bordes_sesudah = berikut.bordes_sesudah; l.tangga.splice(i + 1, 1); }
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
      const k = dok.lokasi.indexOf(l);
      dok.lokasi.splice(k, 1); ubah();
      pergi('#/');
      toast(`"${l.nama}" dihapus`, () => { dok.lokasi.splice(k, 0, l); ubah(); tampilkan(); });
    }
  }
  return pilih;
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
    el('button', { type: 'button', onclick: () => keluar(async () => {
      const blob = new Blob([JSON.stringify(M.eksporJson(dok), null, 1)], { type: 'application/json' });
      if (await kirim(blob, namaBerkas('cadangan_ukur_tangga', 'json'))) { dok.diekspor_terakhir = M.sekarang(); ubah(); toast('Cadangan disimpan'); }
    }) }, 'Simpan cadangan JSON (semua lokasi)'),
    el('button', { type: 'button', onclick: () => keluar(pulihkan) }, 'Pulihkan dari cadangan'),
  ];
  await dialog(l ? `Ekspor · ${l.nama}` : 'Ekspor semua lokasi', [el('div', { class: 'pilihan' }, tombol),
    el('p', { class: 'catatan' }, `Data hanya ada di iPad ini. ${dok.diekspor_terakhir ? `Cadangan terakhir ${tgl(dok.diekspor_terakhir)}.` : 'Belum ada cadangan.'}`)],
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
      if (!await yakin('Pulihkan cadangan?', `${lokasi.length} lokasi dari "${f.name}" ditambahkan ke iPad ini.`, 'Pulihkan')) return;
      for (const l of lokasi) { if (nama.has(l.nama)) l.nama = `${l.nama} (cadangan)`; dok.lokasi.push(l); }
      await simpan(); tampilkan();
      toast(`${lokasi.length} lokasi dipulihkan`);
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
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  tampilkan();
}
mulai();
