import * as DB from './db.js';
import * as M from './model.js';

// ======================================================================= keadaan
let dok = null;
let rute = { hal: 'beranda' };
let fokusIdx = 0;
const pref = bacaPref();
const $ = (s, el = document) => el.querySelector(s);
const isi = $('#isi');
const bilah = $('#bilah-bawah');

function bacaPref() {
  try { return Object.assign({ mode: 'daftar', lanjut: true, lebarPerAnak: false }, JSON.parse(localStorage.getItem('ukur-tangga:pref') || '{}')); }
  catch (_) { return { mode: 'daftar', lanjut: true, lebarPerAnak: false }; }
}
function simpanPref() { try { localStorage.setItem('ukur-tangga:pref', JSON.stringify(pref)); } catch (_) { /* abaikan */ } }

// ======================================================================= simpan
let tundaSimpan = null;
function ubah() {
  clearTimeout(tundaSimpan);
  tundaSimpan = setTimeout(simpanSekarang, 250);
}
async function simpanSekarang() {
  clearTimeout(tundaSimpan);
  tundaSimpan = null;
  try { await DB.simpanDokumen(dok); }
  catch (e) { toast('Gagal menyimpan di perangkat: ' + e.message); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && tundaSimpan) simpanSekarang(); });
window.addEventListener('pagehide', () => { if (tundaSimpan) simpanSekarang(); });

// ======================================================================= bantu
function el(tag, atribut = {}, ...anak) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atribut)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const a of anak.flat()) if (a !== null && a !== undefined && a !== false) e.append(a.nodeType ? a : document.createTextNode(String(a)));
  return e;
}
function fmt(x, d = 1) {
  return x === null || x === undefined || !Number.isFinite(x) ? '–' : x.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function tanggalId(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  return Number.isNaN(+t) ? iso : t.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
let toastTimer = null;
function toast(pesan, aksi = null) {
  const t = $('#toast');
  t.replaceChildren(pesan);
  t.style.pointerEvents = aksi ? 'auto' : 'none';
  if (aksi) {
    t.append(' ', el('button', { class: 'tombol teks', type: 'button', style: 'color:inherit;text-decoration:underline',
      onclick: () => { aksi.jalan(); t.classList.remove('tampil'); } }, aksi.teks));
  }
  t.classList.add('tampil');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('tampil'), aksi ? 6000 : 2600);
}
function cariLokasi(id) { return dok.lokasi.find((l) => l.id === id); }
function cariTangga(l, id) { return l && l.tangga.find((t) => t.id === id); }

// ======================================================================= dialog
function dialog({ judul, isiDialog, tombol }) {
  const d = $('#dialog');
  $('#dialog-judul').textContent = judul;
  $('#dialog-isi').replaceChildren(...(Array.isArray(isiDialog) ? isiDialog : [isiDialog]).filter(Boolean));
  const aksi = $('#dialog-aksi');
  aksi.replaceChildren();
  return new Promise((resolve) => {
    for (const t of tombol) {
      aksi.append(el('button', { class: `tombol ${t.kelas || ''}`, value: t.nilai, type: 'button',
        onclick: () => { d.close(); resolve(t.nilai); } }, t.teks));
    }
    d.onclose = () => resolve(null);
    d.showModal();
    const pertama = $('#dialog-isi input, #dialog-isi textarea, #dialog-isi select');
    if (pertama) setTimeout(() => pertama.focus(), 50);
  });
}
async function konfirmasi(judul, teks, ya = 'Hapus', kelas = 'bahaya') {
  const r = await dialog({ judul, isiDialog: el('p', {}, teks), tombol: [{ teks: 'Batal', nilai: 'batal', kelas: 'halus' }, { teks: ya, nilai: 'ya', kelas }] });
  return r === 'ya';
}
function medan(label, input) { return el('label', { class: 'medan' }, label, input); }
function masukan(nilai, atribut = {}) { return el('input', Object.assign({ value: nilai ?? '' }, atribut)); }

// ======================================================================= rute
function keHash(r) {
  if (r.hal === 'lokasi') return `#/l/${r.idL}`;
  if (r.hal === 'tangga') return `#/l/${r.idL}/t/${r.idT}`;
  return '#/';
}
function bacaHash() {
  const m = location.hash.match(/^#\/l\/([^/]+)(?:\/t\/([^/]+))?/);
  if (!m) return { hal: 'beranda' };
  return m[2] ? { hal: 'tangga', idL: m[1], idT: m[2] } : { hal: 'lokasi', idL: m[1] };
}
function pergi(r) {
  const h = keHash(r);
  if (location.hash !== h) location.hash = h; else tampilkan();
}
window.addEventListener('hashchange', () => { fokusIdx = 0; tampilkan(); });
$('#tombol-kembali').addEventListener('click', () => {
  if (rute.hal === 'tangga') pergi({ hal: 'lokasi', idL: rute.idL });
  else pergi({ hal: 'beranda' });
});
$('#tombol-data').addEventListener('click', () => dialogData());
$('#tombol-cetak').addEventListener('click', () => dialogCetak());

function tampilkan() {
  rute = bacaHash();
  const l = rute.idL ? cariLokasi(rute.idL) : null;
  const t = rute.hal === 'tangga' ? cariTangga(l, rute.idT) : null;
  if ((rute.hal !== 'beranda' && !l) || (rute.hal === 'tangga' && !t)) { pergi({ hal: 'beranda' }); return; }
  $('#tombol-kembali').hidden = rute.hal === 'beranda';
  const jejak = $('#jejak');
  jejak.replaceChildren();
  if (rute.hal === 'lokasi') jejak.append(el('a', { href: '#/' }, 'Semua gedung'));
  if (rute.hal === 'tangga') jejak.append(el('a', { href: '#/' }, 'Semua gedung'), ' › ', el('a', { href: keHash({ hal: 'lokasi', idL: l.id }) }, l.nama));
  if (rute.hal === 'beranda') halBeranda();
  else if (rute.hal === 'lokasi') halLokasi(l);
  else halTangga(l, t);
  isi.focus({ preventScroll: true });
}

// ======================================================================= beranda
function halBeranda() {
  $('#judul').textContent = 'Ukur Tangga';
  document.title = 'Ukur Tangga';
  const kepala = [];
  const terpasang = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!terpasang) {
    kepala.push(el('div', { class: 'pita info' }, '📲',
      el('div', {}, el('b', {}, 'Pasang di iPad: '), 'buka di Safari → tombol Bagikan → "Tambahkan ke Layar Utama". ',
        'Setelah itu aplikasi bisa dibuka tanpa internet dan datanya tidak dihapus Safari.')));
  }
  const jumlah = dok.lokasi.reduce((a, l) => a + l.tangga.length, 0);
  const lama = !dok.diekspor_terakhir || (Date.now() - new Date(dok.diekspor_terakhir)) > 3 * 864e5;
  if (jumlah && lama) {
    kepala.push(el('div', { class: 'pita waspada' }, '💾',
      el('div', {}, el('b', {}, dok.diekspor_terakhir ? `Cadangan terakhir ${tanggalId(dok.diekspor_terakhir)}. ` : 'Belum ada cadangan. '),
        'Data hanya tersimpan di perangkat ini; ekspor JSON secara berkala (⇅ Data).')));
  }
  let konten;
  if (!dok.lokasi.length) {
    konten = el('div', { class: 'kosong' }, el('div', { class: 'besar' }, '🏢'),
      el('p', {}, 'Belum ada gedung. Mulai dengan menambah gedung atau lokasi, misalnya "Gedung F" atau "GKM".'));
  } else {
    konten = el('div', { class: 'kisi' }, dok.lokasi.map((l) => {
      const n = l.tangga.reduce((a, t) => { const x = M.terisi(t); return { anak: a.anak + x.anak, lengkap: a.lengkap + x.lengkap }; }, { anak: 0, lengkap: 0 });
      return el('button', { class: 'kartu-pilih', type: 'button', onclick: () => pergi({ hal: 'lokasi', idL: l.id }) },
        el('div', { class: 'nama' }, '🏢 ', l.nama),
        el('div', { class: 'sub' }, l.alamat || ' '),
        el('div', { class: 'baris-tombol' },
          el('span', { class: 'lencana' }, `${l.tangga.length} tangga`),
          el('span', { class: 'lencana riser' }, `${n.lengkap}/${n.anak} anak tangga terukur`)),
        el('div', { class: 'sub kecil' }, `diubah ${tanggalId(l.diubah)}`));
    }));
  }
  isi.replaceChildren(...kepala, konten);
  aturBilah([{ teks: '＋ Gedung / lokasi', kelas: 'besar', aksi: tambahLokasi }]);
}

async function tambahLokasi() {
  const nama = masukan('', { placeholder: 'mis. Gedung F, GKM', autocomplete: 'off' });
  const alamat = masukan('', { placeholder: 'kampus / lantai / keterangan (opsional)' });
  const r = await dialog({ judul: 'Gedung / lokasi baru', isiDialog: [medan('Nama', nama), medan('Keterangan', alamat)],
    tombol: [{ teks: 'Batal', nilai: 'batal', kelas: 'halus' }, { teks: 'Tambah', nilai: 'ok' }] });
  if (r !== 'ok') return;
  const l = M.lokasiBaru(nama.value.trim() || `Gedung ${dok.lokasi.length + 1}`);
  l.alamat = alamat.value.trim();
  dok.lokasi.push(l);
  ubah();
  pergi({ hal: 'lokasi', idL: l.id });
}

// ======================================================================= lokasi
function halLokasi(l) {
  $('#judul').textContent = l.nama;
  document.title = `${l.nama} · Ukur Tangga`;
  const info = el('div', { class: 'kartu' },
    el('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:flex-start' },
      el('div', {}, el('h2', {}, l.nama), el('div', { class: 'redup' }, l.alamat || 'tanpa keterangan'),
        l.catatan ? el('p', { class: 'kecil' }, l.catatan) : null),
      el('div', { class: 'baris-tombol' },
        el('button', { class: 'tombol halus', type: 'button', onclick: () => ubahLokasi(l) }, '✎ Ubah'),
        el('button', { class: 'tombol halus', type: 'button', onclick: () => hapusLokasi(l) }, '🗑'))));
  let daftar;
  if (!l.tangga.length) {
    daftar = el('div', { class: 'kosong' }, el('div', { class: 'besar' }, '🪜'), el('p', {}, 'Belum ada tangga di lokasi ini.'));
  } else {
    daftar = el('div', { class: 'kisi' }, l.tangga.map((t) => {
      const r = M.ringkasan(t);
      const x = M.terisi(t);
      const lantai = t.lantai_dari || t.lantai_ke ? `lantai ${t.lantai_dari || '?'} → ${t.lantai_ke || '?'}` : '';
      return el('button', { class: 'kartu-pilih', type: 'button', onclick: () => pergi({ hal: 'tangga', idL: l.id, idT: t.id }) },
        el('div', { class: 'nama' }, '🪜 ', t.nama),
        el('div', { class: 'sub' }, [lantai, t.tanggal_ukur ? tanggalId(t.tanggal_ukur) : ''].filter(Boolean).join(' · ') || ' '),
        el('div', { class: 'baris-tombol' },
          el('span', { class: 'lencana' }, `${x.lengkap}/${x.anak} anak tangga`),
          r.riser ? el('span', { class: 'lencana riser' }, `R ${fmt(r.riser.rerata)} cm`) : null,
          r.tread ? el('span', { class: 'lencana tread' }, `T ${fmt(r.tread.rerata)} cm`) : null,
          t.id_studio ? el('span', { class: 'lencana bordes' }, t.id_studio) : null));
    }));
  }
  isi.replaceChildren(info, daftar);
  aturBilah([{ teks: '＋ Tangga baru', kelas: 'besar', aksi: () => tambahTangga(l) }]);
}

async function ubahLokasi(l) {
  const nama = masukan(l.nama), alamat = masukan(l.alamat), catatan = el('textarea', {}, l.catatan || '');
  const r = await dialog({ judul: 'Ubah gedung / lokasi', isiDialog: [medan('Nama', nama), medan('Keterangan', alamat), medan('Catatan', catatan)],
    tombol: [{ teks: 'Batal', nilai: 'batal', kelas: 'halus' }, { teks: 'Simpan', nilai: 'ok' }] });
  if (r !== 'ok') return;
  Object.assign(l, { nama: nama.value.trim() || l.nama, alamat: alamat.value.trim(), catatan: catatan.value.trim(), diubah: M.sekarang() });
  ubah(); tampilkan();
}

async function hapusLokasi(l) {
  if (!await konfirmasi('Hapus gedung?', `"${l.nama}" beserta ${l.tangga.length} tangganya akan dihapus dari perangkat ini.`)) return;
  const i = dok.lokasi.indexOf(l);
  dok.lokasi.splice(i, 1);
  ubah();
  pergi({ hal: 'beranda' });
  toast(`"${l.nama}" dihapus.`, { teks: 'Batalkan', jalan: () => { dok.lokasi.splice(i, 0, l); ubah(); tampilkan(); } });
}

async function tambahTangga(l, sumber = null) {
  const nama = masukan(sumber ? `${sumber.nama} (salinan)` : '', { placeholder: 'mis. Tangga utama, Tangga darurat timur' });
  const dari = masukan(sumber?.lantai_dari || '', { placeholder: '1' }), ke = masukan(sumber?.lantai_ke || '', { placeholder: '2' });
  const jumlah = masukan(sumber ? M.terisi(sumber).anak : '', { type: 'number', inputmode: 'numeric', min: 0, max: 99, placeholder: 'boleh kosong' });
  const r = await dialog({ judul: sumber ? 'Salin tangga (tanpa ukuran)' : 'Tangga baru',
    isiDialog: [medan('Nama tangga', nama), el('div', { class: 'kisi-medan' }, medan('Lantai dari', dari), medan('Lantai ke', ke)),
      medan('Jumlah anak tangga yang langsung dibuat', jumlah)],
    tombol: [{ teks: 'Batal', nilai: 'batal', kelas: 'halus' }, { teks: 'Buat', nilai: 'ok' }] });
  if (r !== 'ok') return;
  const t = M.tanggaBaru(nama.value.trim() || `Tangga ${l.tangga.length + 1}`);
  t.lantai_dari = dari.value.trim(); t.lantai_ke = ke.value.trim();
  if (sumber) Object.assign(t, { arah: sumber.arah, lebar_cm: sumber.lebar_cm, pegangan: sumber.pegangan, permukaan: sumber.permukaan });
  const n = Math.max(0, Math.min(99, parseInt(jumlah.value, 10) || 0));
  for (let i = 0; i < n; i++) t.bagian.push(M.anakTanggaBaru());
  l.tangga.push(t);
  l.diubah = M.sekarang();
  ubah();
  pergi({ hal: 'tangga', idL: l.id, idT: t.id });
}

// ======================================================================= tangga
function halTangga(l, t) {
  $('#judul').textContent = t.nama;
  document.title = `${t.nama} · ${l.nama}`;
  if (fokusIdx >= t.bagian.length) fokusIdx = Math.max(0, t.bagian.length - 1);
  isi.replaceChildren(kartuInfo(l, t), kartuRingkasan(t), pilihMode(l, t), pref.mode === 'fokus' ? tampilFokus(l, t) : tampilDaftar(l, t));
  const tombol = [
    { teks: '＋ Anak tangga', kelas: 'besar', aksi: () => tambahBagian(l, t, 'anak') },
    { teks: '＋ Bordes', kelas: 'besar bordes', aksi: () => tambahBagian(l, t, 'bordes') },
  ];
  aturBilah(tombol);
}

function sentuh(l, t) {
  t.diubah = M.sekarang();
  l.diubah = t.diubah;
  ubah();
}

function kartuInfo(l, t) {
  const f = (kunci, label, atribut = {}) => {
    const inp = masukan(t[kunci], atribut);
    inp.addEventListener('change', () => {
      if (atribut.inputmode === 'decimal') {
        const v = M.bacaAngka(inp.value);
        if (Number.isNaN(v)) { toast(`${label}: angka tidak terbaca`); inp.value = t[kunci] ?? ''; return; }
        t[kunci] = v;
      } else t[kunci] = inp.value.trim();
      sentuh(l, t);
      if (kunci === 'nama') { $('#judul').textContent = t.nama; }
    });
    return medan(label, inp);
  };
  const pilihan = (kunci, label, opsi) => {
    const s = el('select', { onchange: (e) => { t[kunci] = e.target.value; sentuh(l, t); } },
      opsi.map(([v, teks]) => el('option', { value: v, selected: t[kunci] === v }, teks)));
    return medan(label, s);
  };
  const catatan = el('textarea', { placeholder: 'kondisi, nosing, retak, licin, penghalang, dsb.', onchange: (e) => { t.catatan = e.target.value.trim(); sentuh(l, t); } }, t.catatan || '');
  const foto = el('div', { class: 'foto-kisi' });
  muatFoto(t, foto, l);
  const x = M.terisi(t);
  return el('details', { class: 'kartu info', open: !t.bagian.length ? true : null },
    el('summary', {}, el('div', {},
      el('h2', { style: 'margin:0' }, 'Info tangga'),
      el('div', { class: 'redup kecil' }, [t.lantai_dari || t.lantai_ke ? `lantai ${t.lantai_dari || '?'} → ${t.lantai_ke || '?'}` : null,
        t.lebar_cm ? `lebar ${fmt(t.lebar_cm)} cm` : null, t.id_studio ? `ID Studio ${t.id_studio}` : null,
        `${x.lengkap}/${x.anak} anak tangga terukur`].filter(Boolean).join(' · '))),
    el('span', { class: 'panah' }, '›')),
    el('div', { class: 'kisi-medan', style: 'margin-top:12px' },
      f('nama', 'Nama tangga'),
      f('lantai_dari', 'Lantai dari'), f('lantai_ke', 'Lantai ke'),
      pilihan('arah', 'Arah ukur', [['naik', 'naik (nomor 1 = paling bawah)'], ['turun', 'turun (nomor 1 = paling atas)']]),
      f('lebar_cm', 'Lebar tangga (cm)', { inputmode: 'decimal' }),
      pilihan('pegangan', 'Pegangan tangan', [['', '–'], ['kiri', 'kiri'], ['kanan', 'kanan'], ['keduanya', 'kiri dan kanan'], ['tidak ada', 'tidak ada']]),
      f('permukaan', 'Permukaan / material', { placeholder: 'keramik, beton, granit…' }),
      f('lux', 'Cahaya (lux)', { inputmode: 'decimal' }),
      f('tanggal_ukur', 'Tanggal ukur', { type: 'date' }),
      f('pengukur', 'Pengukur'),
      f('id_studio', 'ID tangga di Studio', { placeholder: 'T01 (opsional)', autocapitalize: 'characters' })),
    el('div', { style: 'margin-top:12px' }, medan('Catatan', catatan)),
    el('div', { style: 'margin-top:12px' }, el('div', { class: 'medan', style: 'margin-bottom:6px' }, 'Foto tangga'), foto),
    el('div', { class: 'baris-tombol', style: 'margin-top:14px' },
      el('button', { class: 'tombol halus', type: 'button', onclick: () => tambahTangga(l, t) }, '⧉ Salin struktur ke tangga baru'),
      el('button', { class: 'tombol halus', type: 'button', onclick: () => hapusTangga(l, t) }, '🗑 Hapus tangga')));
}

async function muatFoto(t, wadah, l) {
  wadah.replaceChildren();
  for (const id of t.foto) {
    const blob = await DB.bacaFoto(id);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    wadah.append(el('figure', {}, el('img', { src: url, alt: 'foto tangga', onclick: () => window.open(url, '_blank') }),
      el('button', { type: 'button', 'aria-label': 'hapus foto', onclick: async () => {
        if (!await konfirmasi('Hapus foto?', 'Foto ini dihapus dari perangkat.')) return;
        t.foto = t.foto.filter((x) => x !== id); await DB.hapusFoto(id); sentuh(l, t); muatFoto(t, wadah, l);
      } }, '×')));
  }
  wadah.append(el('button', { class: 'tombol halus', type: 'button', onclick: () => ambilFoto(l, t, wadah) }, '📷 Tambah foto'));
}

function ambilFoto(l, t, wadah) {
  const inp = $('#pilih-foto');
  inp.value = '';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try {
      const blob = await perkecil(f, 1600, 0.82);
      const id = M.idBaru('foto');
      await DB.simpanFoto(id, blob);
      t.foto.push(id); sentuh(l, t); muatFoto(t, wadah, l);
    } catch (e) { toast('Foto gagal disimpan: ' + e.message); }
  };
  inp.click();
}

function perkecil(berkas, maks, mutu) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maks / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('tidak dapat mengubah foto'))), 'image/jpeg', mutu);
    };
    img.onerror = () => reject(new Error('berkas bukan gambar'));
    img.src = URL.createObjectURL(berkas);
  });
}

async function hapusTangga(l, t) {
  if (!await konfirmasi('Hapus tangga?', `"${t.nama}" dan ${t.bagian.length} isiannya dihapus dari perangkat ini.`)) return;
  const i = l.tangga.indexOf(t);
  l.tangga.splice(i, 1);
  l.diubah = M.sekarang();
  ubah();
  pergi({ hal: 'lokasi', idL: l.id });
  toast(`"${t.nama}" dihapus.`, { teks: 'Batalkan', jalan: () => { l.tangga.splice(i, 0, t); ubah(); tampilkan(); } });
}

function kartuRingkasan(t) {
  const r = M.ringkasan(t);
  const stat = (label, nilai, sub, kelas = '') => el('div', { class: `stat ${kelas}` }, el('div', { class: 'label' }, label),
    el('div', { class: 'nilai' }, nilai), el('div', { class: 'sub' }, sub || ' '));
  return el('div', { class: 'kartu' }, el('div', { class: 'statistik' },
    stat('Anak tangga', String(r.n_anak_tangga), r.n_bordes ? `${r.n_bordes} bordes` : ''),
    stat('Tinggi riser', r.riser ? `${fmt(r.riser.rerata)} cm` : '–', r.riser ? `± ${fmt(r.riser.sd)} · ${fmt(r.riser.min)}–${fmt(r.riser.maks)}` : '', 'riser'),
    stat('Panjang tread', r.tread ? `${fmt(r.tread.rerata)} cm` : '–', r.tread ? `± ${fmt(r.tread.sd)} · ${fmt(r.tread.min)}–${fmt(r.tread.maks)}` : '', 'tread'),
    stat('2R + T', r.blondel ? `${fmt(r.blondel.rerata)} cm` : '–', 'rumus Blondel, umum 60–65'),
    stat('Kemiringan', r.kemiringan_derajat !== null ? `${fmt(r.kemiringan_derajat)}°` : '–', 'dari rerata R/T'),
    stat('Tinggi total', r.tinggi_total_cm !== null ? `${fmt(r.tinggi_total_cm)} cm` : '–', 'jumlah riser terisi')));
}

function pilihMode(l, t) {
  const tombol = (mode, teks) => el('button', { type: 'button', 'aria-pressed': pref.mode === mode ? 'true' : 'false',
    onclick: () => { pref.mode = mode; simpanPref(); halTangga(l, t); } }, teks);
  const lanjut = el('label', { class: 'kecil redup', style: 'display:flex;gap:6px;align-items:center' },
    el('input', { type: 'checkbox', checked: pref.lanjut, onchange: (e) => { pref.lanjut = e.target.checked; simpanPref(); } }),
    'Enter lanjut ke isian berikutnya');
  const lebar = el('label', { class: 'kecil redup', style: 'display:flex;gap:6px;align-items:center' },
    el('input', { type: 'checkbox', checked: pref.lebarPerAnak, onchange: (e) => { pref.lebarPerAnak = e.target.checked; simpanPref(); halTangga(l, t); } }),
    'Lebar per anak tangga');
  return el('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin:4px 0 12px' },
    el('div', { class: 'mode-pilih', role: 'group', 'aria-label': 'Tampilan' }, tombol('daftar', '☰ Daftar'), tombol('fokus', '◻︎ Satu per satu')),
    el('div', { style: 'display:flex;gap:14px;flex-wrap:wrap' }, lanjut, lebar));
}

// ---------- isian angka
function kotakAngka(jenis, label, objek, kunci, l, t, opsi = {}) {
  const inp = el('input', { inputmode: 'decimal', enterkeyhint: 'next', autocomplete: 'off', placeholder: '0,0',
    value: objek[kunci] === null || objek[kunci] === undefined ? '' : String(objek[kunci]).replace('.', ','),
    'data-kunci': `${objek.id}:${kunci}`, 'aria-label': `${label} ${opsi.nomor ? '#' + opsi.nomor : ''}` });
  const bungkus = el('label', { class: `angka ${jenis} ${M.curiga(jenis, objek[kunci]) ? 'curiga' : ''}` },
    el('span', {}, label), el('div', { class: 'kotak' }, inp, el('span', { class: 'satuan' }, 'cm')));
  const tulis = () => {
    const v = M.bacaAngka(inp.value);
    if (Number.isNaN(v)) { bungkus.classList.add('curiga'); return false; }
    if (v !== objek[kunci]) { objek[kunci] = v; sentuh(l, t); perbaruiRingkasan(t); }
    bungkus.classList.toggle('curiga', M.curiga(jenis, v));
    return true;
  };
  inp.addEventListener('input', () => { const v = M.bacaAngka(inp.value); if (!Number.isNaN(v)) { objek[kunci] = v; sentuh(l, t); } });
  inp.addEventListener('change', tulis);
  inp.addEventListener('blur', () => { tulis(); perbaruiRingkasan(t); if (opsi.onblur) opsi.onblur(); });
  inp.addEventListener('focus', () => { inp.select(); if (opsi.onfokus) opsi.onfokus(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && pref.lanjut) { e.preventDefault(); tulis(); lanjutIsian(inp, l, t); }
  });
  return bungkus;
}

function perbaruiRingkasan(t) {
  const lama = isi.querySelector('.kartu .statistik');
  if (lama) lama.closest('.kartu').replaceWith(kartuRingkasan(t));
}

function lanjutIsian(inp, l, t) {
  const semua = [...isi.querySelectorAll('input[data-kunci]')];
  const i = semua.indexOf(inp);
  if (i >= 0 && i + 1 < semua.length) { semua[i + 1].focus(); return; }
  // Isian terakhir: buat anak tangga berikutnya lalu lanjut mengisi riser-nya.
  if (pref.mode === 'fokus') { if (fokusIdx + 1 < t.bagian.length) { fokusIdx++; halTangga(l, t); fokusKeIsian(); return; } }
  tambahBagian(l, t, 'anak');
}

function fokusKeIsian(idx = 0) {
  requestAnimationFrame(() => { const s = isi.querySelectorAll('.fokus input[data-kunci], .bagian.aktif input[data-kunci]'); if (s[idx]) s[idx].focus(); });
}

// ---------- daftar
function tampilDaftar(l, t) {
  if (!t.bagian.length) {
    return el('div', { class: 'kosong' }, el('div', { class: 'besar' }, '📏'),
      el('p', {}, 'Tekan "＋ Anak tangga" lalu isi tinggi riser dan panjang tread. Enter berpindah ke isian berikutnya; ',
        'setelah tread terakhir, anak tangga baru dibuat otomatis.'));
  }
  const nomor = M.nomorAnakTangga(t);
  return el('div', { class: 'daftar' }, t.bagian.map((b, i) => barisBagian(l, t, b, i, nomor)));
}

function barisBagian(l, t, b, i, nomor) {
  const n = nomor.get(b.id);
  const isian = b.jenis === 'anak_tangga'
    ? [kotakAngka('riser', 'Tinggi riser', b, 'tinggi_riser_cm', l, t, { nomor: n, onfokus: () => tandaiAktif(i) }),
       kotakAngka('tread', 'Panjang tread', b, 'panjang_tread_cm', l, t, { nomor: n, onfokus: () => tandaiAktif(i) }),
       pref.lebarPerAnak ? kotakAngka('lain', 'Lebar', b, 'lebar_cm', l, t, { nomor: n, onfokus: () => tandaiAktif(i) }) : null]
    : [kotakAngka('bordes', 'Panjang bordes', b, 'panjang_cm', l, t, { onfokus: () => tandaiAktif(i) }),
       kotakAngka('lain', 'Lebar bordes', b, 'lebar_cm', l, t, { onfokus: () => tandaiAktif(i) })];
  return el('div', { class: `bagian ${b.jenis === 'bordes' ? 'bordes' : ''}`, 'data-i': i },
    el('div', { class: 'nomor', title: b.jenis === 'bordes' ? 'bordes' : `anak tangga ${n}` }, b.jenis === 'bordes' ? 'BORDES' : `#${n}`),
    el('div', { class: 'isian' }, isian),
    el('div', { class: 'aksi-bagian' },
      el('button', { type: 'button', title: 'catatan', 'aria-label': 'catatan', onclick: () => catatanBagian(l, t, b) }, '✎'),
      el('button', { type: 'button', title: 'sisipkan anak tangga di atasnya', 'aria-label': 'sisipkan', onclick: () => sisipkan(l, t, i) }, '⤒'),
      el('button', { type: 'button', title: 'hapus', 'aria-label': 'hapus', onclick: () => hapusBagian(l, t, b) }, '🗑')),
    b.catatan ? el('div', { class: 'catatan-bagian' }, '📝 ', b.catatan) : null);
}

function tandaiAktif(i) {
  isi.querySelectorAll('.bagian.aktif').forEach((x) => x.classList.remove('aktif'));
  const b = isi.querySelector(`.bagian[data-i="${i}"]`);
  if (b) b.classList.add('aktif');
  fokusIdx = i;
}

async function catatanBagian(l, t, b) {
  const teks = el('textarea', { placeholder: 'mis. nosing pecah, tinggi beda kiri-kanan, diukur di tengah' }, b.catatan || '');
  const r = await dialog({ judul: 'Catatan', isiDialog: medan('Catatan untuk bagian ini', teks),
    tombol: [{ teks: 'Batal', nilai: 'batal', kelas: 'halus' }, { teks: 'Simpan', nilai: 'ok' }] });
  if (r !== 'ok') return;
  b.catatan = teks.value.trim(); sentuh(l, t); halTangga(l, t);
}

function sisipkan(l, t, i) {
  t.bagian.splice(i, 0, M.anakTanggaBaru());
  fokusIdx = i; sentuh(l, t); halTangga(l, t);
  requestAnimationFrame(() => { const x = isi.querySelector(`.bagian[data-i="${i}"] input`); if (x) x.focus(); });
}

function hapusBagian(l, t, b) {
  const i = t.bagian.indexOf(b);
  t.bagian.splice(i, 1);
  if (fokusIdx >= t.bagian.length) fokusIdx = Math.max(0, t.bagian.length - 1);
  sentuh(l, t); halTangga(l, t);
  toast(b.jenis === 'bordes' ? 'Bordes dihapus.' : 'Anak tangga dihapus; nomor sesudahnya bergeser.',
    { teks: 'Batalkan', jalan: () => { t.bagian.splice(i, 0, b); sentuh(l, t); halTangga(l, t); } });
}

function tambahBagian(l, t, jenis) {
  const b = jenis === 'bordes' ? M.bordesBaru() : M.anakTanggaBaru();
  t.bagian.push(b);
  fokusIdx = t.bagian.length - 1;
  sentuh(l, t);
  halTangga(l, t);
  requestAnimationFrame(() => {
    if (pref.mode === 'fokus') { fokusKeIsian(); return; }
    const baris = isi.querySelector(`.bagian[data-i="${t.bagian.length - 1}"]`);
    if (baris) { baris.scrollIntoView({ block: 'center', behavior: 'smooth' }); const x = baris.querySelector('input'); if (x) x.focus({ preventScroll: true }); }
  });
}

// ---------- satu per satu
function tampilFokus(l, t) {
  if (!t.bagian.length) return tampilDaftar(l, t);
  const nomor = M.nomorAnakTangga(t);
  const b = t.bagian[fokusIdx];
  const n = nomor.get(b.id);
  const pindah = (d) => { const j = fokusIdx + d; if (j >= 0 && j < t.bagian.length) { fokusIdx = j; halTangga(l, t); } };
  const isian = b.jenis === 'anak_tangga'
    ? [kotakAngka('riser', 'Tinggi riser', b, 'tinggi_riser_cm', l, t, { nomor: n, onblur: () => gambarUlang() }),
       kotakAngka('tread', 'Panjang tread', b, 'panjang_tread_cm', l, t, { nomor: n, onblur: () => gambarUlang() }),
       pref.lebarPerAnak ? kotakAngka('lain', 'Lebar', b, 'lebar_cm', l, t, { nomor: n }) : null]
    : [kotakAngka('bordes', 'Panjang bordes', b, 'panjang_cm', l, t), kotakAngka('lain', 'Lebar bordes', b, 'lebar_cm', l, t)];
  const svg = el('div', { html: gambarTangga(t, fokusIdx) });
  function gambarUlang() { svg.innerHTML = gambarTangga(t, fokusIdx); }
  const kartu = el('div', { class: 'fokus' },
    el('div', { class: 'atas-fokus' },
      el('div', {}, el('div', { class: 'redup kecil' }, b.jenis === 'bordes' ? 'bidang datar antar-lengan tangga' : `anak tangga ke- (dihitung dari ${t.arah === 'turun' ? 'atas' : 'bawah'})`),
        el('div', { class: 'nomor-besar' }, b.jenis === 'bordes' ? 'Bordes' : `#${n}`)),
      el('div', { class: 'navigasi' },
        el('button', { type: 'button', 'aria-label': 'sebelumnya', disabled: fokusIdx === 0, onclick: () => pindah(-1) }, '‹'),
        el('button', { type: 'button', 'aria-label': 'berikutnya', onclick: () => (fokusIdx + 1 < t.bagian.length ? pindah(1) : tambahBagian(l, t, 'anak')) }, '›'))),
    svg,
    el('div', { class: 'isian' }, isian),
    el('div', { class: 'baris-tombol', style: 'margin-top:12px;justify-content:space-between' },
      el('button', { class: 'tombol halus', type: 'button', onclick: () => catatanBagian(l, t, b) }, b.catatan ? `📝 ${b.catatan.slice(0, 40)}` : '✎ Catatan'),
      el('button', { class: 'tombol halus', type: 'button', onclick: () => hapusBagian(l, t, b) }, '🗑 Hapus')),
    el('div', { class: 'titik-langkah' }, t.bagian.map((x, j) => {
      const lengkap = x.jenis === 'anak_tangga' ? Number.isFinite(x.tinggi_riser_cm) && Number.isFinite(x.panjang_tread_cm) : Number.isFinite(x.panjang_cm);
      return el('button', { type: 'button', class: [lengkap ? 'lengkap' : '', j === fokusIdx ? 'sekarang' : '', x.jenis === 'bordes' ? 'bordes' : ''].join(' '),
        onclick: () => { fokusIdx = j; halTangga(l, t); } }, x.jenis === 'bordes' ? 'B' : String(nomor.get(x.id)));
    })));
  // Geser kiri/kanan di kartu untuk pindah anak tangga.
  let awalX = null;
  kartu.addEventListener('touchstart', (e) => { if (e.target.tagName !== 'INPUT') awalX = e.touches[0].clientX; }, { passive: true });
  kartu.addEventListener('touchend', (e) => {
    if (awalX === null) return;
    const dx = e.changedTouches[0].clientX - awalX; awalX = null;
    if (Math.abs(dx) > 70) pindah(dx < 0 ? 1 : -1);
  });
  return kartu;
}

// Ilustrasi beberapa anak tangga di sekitar yang sedang diisi; riser/tread aktif diberi warna dan ukuran.
// Titik dihitung dulu, lalu viewBox dipaskan ke kotak pembungkusnya agar gambar selalu memenuhi tempat.
function gambarTangga(t, idx) {
  const bagian = t.bagian;
  const nomor = M.nomorAnakTangga(t);
  const awal = Math.max(0, idx - 2), akhir = Math.min(bagian.length, awal + 5);
  const R = 34, D = 62, BORDES = 100;
  const css = getComputedStyle(document.documentElement);
  const warna = (v) => css.getPropertyValue(v).trim();
  let x = 0, y = 0;
  const jalur = [[-14, 0], [0, 0]];
  let sorot = '', teks = '';
  for (let j = awal; j < akhir; j++) {
    const b = bagian[j];
    if (b.jenis === 'bordes') {
      if (j === idx) {
        sorot += `<line x1="${x}" y1="${y}" x2="${x + BORDES}" y2="${y}" stroke="${warna('--bordes')}" stroke-width="7" stroke-linecap="round"/>`;
        teks += `<text x="${x + BORDES / 2}" y="${y + 20}" text-anchor="middle" fill="${warna('--bordes')}" font-size="14" font-weight="700">${b.panjang_cm != null ? fmt(b.panjang_cm) + ' cm' : 'bordes'}</text>`;
      } else {
        teks += `<text x="${x + BORDES / 2}" y="${y + 16}" text-anchor="middle" fill="${warna('--redup')}" font-size="11">bordes</text>`;
      }
      x += BORDES; jalur.push([x, y]);
      continue;
    }
    const ny = y - R, nx = x + D;
    if (j === idx) {
      sorot += `<line x1="${x}" y1="${y}" x2="${x}" y2="${ny}" stroke="${warna('--riser')}" stroke-width="7" stroke-linecap="round"/>`;
      sorot += `<line x1="${x}" y1="${ny}" x2="${nx}" y2="${ny}" stroke="${warna('--tread')}" stroke-width="7" stroke-linecap="round"/>`;
      teks += `<text x="${x - 9}" y="${(y + ny) / 2 + 5}" text-anchor="end" fill="${warna('--riser')}" font-size="14" font-weight="700">${b.tinggi_riser_cm != null ? fmt(b.tinggi_riser_cm) : 'riser'}</text>`;
      teks += `<text x="${(x + nx) / 2}" y="${ny - 10}" text-anchor="middle" fill="${warna('--tread')}" font-size="14" font-weight="700">${b.panjang_tread_cm != null ? fmt(b.panjang_tread_cm) : 'tread'}</text>`;
    }
    teks += `<text x="${x + D / 2}" y="${y - 10}" text-anchor="middle" fill="${warna('--redup')}" font-size="11">#${nomor.get(b.id)}</text>`;
    jalur.push([x, ny], [nx, ny]);
    x = nx; y = ny;
  }
  jalur.push([x + 14, y]);
  const xs = jalur.map((p) => p[0]), ys = jalur.map((p) => p[1]);
  const kiri = Math.min(...xs) - 56, kanan = Math.max(...xs) + 24, atas = Math.min(...ys) - 34, bawah = Math.max(...ys) + 26;
  const d = jalur.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ');
  return `<svg class="gambar-tangga" viewBox="${kiri} ${atas} ${kanan - kiri} ${bawah - atas}" role="img" aria-label="ilustrasi anak tangga">
    <path d="${d}" fill="none" stroke="${warna('--redup')}" stroke-width="3" stroke-linejoin="round"/>${sorot}${teks}</svg>`;
}

// ======================================================================= bilah bawah
function aturBilah(tombol) {
  bilah.replaceChildren(...tombol.map((t) => el('button', { class: `tombol ${t.kelas || ''}`, type: 'button', onclick: t.aksi }, t.teks)));
  bilah.hidden = !tombol.length;
}

// ======================================================================= data: ekspor / impor
function namaBerkas(akhiran) {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `ukur-tangga_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.${akhiran}`;
}

async function siapkanJson(denganFoto) {
  let fotoData = null;
  if (denganFoto) {
    fotoData = {};
    for (const l of dok.lokasi) for (const t of l.tangga) {
      fotoData[t.id] = [];
      for (const id of t.foto) {
        const b = await DB.bacaFoto(id);
        if (b) fotoData[t.id].push(await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); }));
      }
    }
  }
  return JSON.stringify(M.eksporJson(dok, { fotoData }), null, 1);
}

async function kirimBerkas(teks, nama, jenis, bagikan) {
  const blob = new Blob([teks], { type: jenis });
  const berkas = new File([blob], nama, { type: jenis });
  if (bagikan && navigator.canShare && navigator.canShare({ files: [berkas] })) {
    try { await navigator.share({ files: [berkas], title: nama }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nama });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

async function dialogData() {
  const denganFoto = el('input', { type: 'checkbox' });
  const ruang = await DB.perkiraanRuang();
  const persisten = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  const n = dok.lokasi.reduce((a, l) => a + l.tangga.length, 0);
  const isiDialog = [
    el('p', { class: 'redup kecil' }, `${dok.lokasi.length} gedung, ${n} tangga di perangkat ini. `,
      dok.diekspor_terakhir ? `Ekspor terakhir ${tanggalId(dok.diekspor_terakhir)}. ` : 'Belum pernah diekspor. ',
      persisten ? 'Penyimpanan persisten aktif.' : 'Penyimpanan belum persisten (pasang di Layar Utama).',
      ruang && ruang.usage ? ` Terpakai ${(ruang.usage / 1048576).toFixed(1)} MB.` : ''),
    el('div', { class: 'baris-tombol' },
      el('button', { class: 'tombol', type: 'button', onclick: () => ekspor('json', true, denganFoto.checked) }, '⇪ Bagikan JSON'),
      el('button', { class: 'tombol halus', type: 'button', onclick: () => ekspor('json', false, denganFoto.checked) }, '⤓ Unduh JSON')),
    el('label', { class: 'kecil', style: 'display:flex;gap:8px;align-items:center' }, denganFoto, 'Sertakan foto (berkas jauh lebih besar)'),
    el('div', { class: 'baris-tombol' },
      el('button', { class: 'tombol halus', type: 'button', onclick: () => ekspor('csv', true) }, '⇪ Bagikan CSV'),
      el('button', { class: 'tombol halus', type: 'button', onclick: () => ekspor('csv', false) }, '⤓ Unduh CSV')),
    el('p', { class: 'redup kecil' }, 'JSON = cadangan lengkap dan format untuk analisis (lihat FORMAT.md di repo). CSV = tabel untuk Excel/Numbers.'),
    el('hr', { style: 'border:0;border-top:1px solid var(--garis);width:100%' }),
    el('div', { class: 'baris-tombol' },
      el('button', { class: 'tombol halus', type: 'button', onclick: impor }, '⤒ Impor JSON (gabung)'),
      el('button', { class: 'tombol halus', type: 'button', onclick: hapusSemua }, '🗑 Hapus semua data')),
  ];
  await dialog({ judul: 'Data', isiDialog, tombol: [{ teks: 'Tutup', nilai: 'tutup', kelas: 'halus' }] });
}

async function ekspor(jenis, bagikan, denganFoto = false) {
  try {
    const teks = jenis === 'json' ? await siapkanJson(denganFoto) : M.eksporCsv(dok);
    const ok = await kirimBerkas(teks, namaBerkas(jenis), jenis === 'json' ? 'application/json' : 'text/csv', bagikan);
    if (ok && jenis === 'json') { dok.diekspor_terakhir = M.sekarang(); ubah(); }
    if (ok) toast(jenis === 'json' ? 'JSON diekspor.' : 'CSV diekspor.');
  } catch (e) { toast('Ekspor gagal: ' + e.message); }
}

function impor() {
  const inp = $('#pilih-berkas');
  inp.value = '';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const { lokasi, fotoBaru } = M.normalisasiImpor(data);
      const n = lokasi.reduce((a, l) => a + l.tangga.length, 0);
      if (!await konfirmasi('Impor data?', `${lokasi.length} gedung, ${n} tangga dari "${f.name}". Tangga dengan ID yang sama diganti versi berkas; yang lain ditambahkan.`, 'Impor', '')) return;
      const { tambah, ganti } = M.gabung(dok, lokasi);
      for (const [idT, url] of fotoBaru) {
        const blob = await (await fetch(url)).blob();
        const id = M.idBaru('foto');
        await DB.simpanFoto(id, blob);
        for (const l of dok.lokasi) { const t = cariTangga(l, idT); if (t && !t.foto.includes(id)) t.foto.push(id); }
      }
      await simpanSekarang();
      $('#dialog').close();
      tampilkan();
      toast(`Impor selesai: ${tambah} tangga ditambah, ${ganti} diganti.`);
    } catch (e) { toast('Impor gagal: ' + e.message); }
  };
  inp.click();
}

async function hapusSemua() {
  if (!await konfirmasi('Hapus SEMUA data?', 'Semua gedung, tangga, ukuran, dan foto di perangkat ini dihapus. Ekspor JSON dulu bila masih diperlukan.')) return;
  if (!await konfirmasi('Yakin?', 'Tindakan ini tidak dapat dibatalkan.', 'Ya, hapus semua')) return;
  for (const l of dok.lokasi) for (const t of l.tangga) for (const id of t.foto) await DB.hapusFoto(id);
  dok = M.dokumenKosong();
  await simpanSekarang();
  pergi({ hal: 'beranda' });
  toast('Semua data dihapus.');
}

// ======================================================================= cetak
async function dialogCetak() {
  const l = rute.idL ? cariLokasi(rute.idL) : null;
  const t = rute.hal === 'tangga' ? cariTangga(l, rute.idT) : null;
  const cakupan = el('select', {},
    t ? el('option', { value: 'tangga' }, `Tangga ini: ${t.nama}`) : null,
    l ? el('option', { value: 'lokasi' }, `Gedung ini: ${l.nama}`) : null,
    el('option', { value: 'semua' }, 'Semua gedung'));
  const jenis = el('select', {}, el('option', { value: 'laporan' }, 'Laporan ukuran'), el('option', { value: 'formulir' }, 'Formulir kosong untuk diisi tangan'));
  const baris = masukan('15', { type: 'number', inputmode: 'numeric', min: 1, max: 60 });
  const r = await dialog({ judul: 'Cetak / simpan PDF', isiDialog: [medan('Cakupan', cakupan), medan('Jenis', jenis), medan('Baris formulir kosong per tangga', baris),
    el('p', { class: 'redup kecil' }, 'Di iPad: setelah dialog cetak terbuka, pilih printer AirPrint, atau cubit-perbesar pratinjau lalu Bagikan untuk menyimpan PDF.')],
    tombol: [{ teks: 'Batal', nilai: 'batal', kelas: 'halus' }, { teks: '🖨 Cetak', nilai: 'ok' }] });
  if (r !== 'ok') return;
  const daftar = cakupan.value === 'tangga' ? [[l, [t]]] : cakupan.value === 'lokasi' ? [[l, l.tangga]] : dok.lokasi.map((x) => [x, x.tangga]);
  const halaman = jenis.value === 'formulir' ? htmlFormulir(daftar, Math.max(1, Math.min(60, parseInt(baris.value, 10) || 15))) : htmlLaporan(daftar);
  const wadah = $('#cetak');
  wadah.innerHTML = halaman;
  setTimeout(() => window.print(), 100);
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function htmlLaporan(daftar) {
  const tgl = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
  let h = `<h1>Laporan ukuran anak tangga</h1><div class="meta">Dicetak ${esc(tgl)} · Ukur Tangga · satuan cm</div>`;
  daftar.forEach(([l, semuaT], i) => {
    h += `<h2${i ? ' class="putus"' : ''}>${esc(l.nama)}</h2>${l.alamat ? `<div class="meta">${esc(l.alamat)}</div>` : ''}`;
    for (const t of semuaT) {
      const r = M.ringkasan(t), nomor = M.nomorAnakTangga(t);
      const info = [t.lantai_dari || t.lantai_ke ? `Lantai ${t.lantai_dari || '?'} → ${t.lantai_ke || '?'}` : '', `arah ${t.arah}`,
        t.lebar_cm ? `lebar ${fmt(t.lebar_cm)} cm` : '', t.pegangan ? `pegangan ${t.pegangan}` : '', t.permukaan ? `permukaan ${t.permukaan}` : '',
        t.lux ? `${fmt(t.lux, 0)} lux` : '', t.tanggal_ukur ? `diukur ${tanggalId(t.tanggal_ukur)}` : '', t.pengukur ? `oleh ${t.pengukur}` : '',
        t.id_studio ? `ID Studio ${t.id_studio}` : ''].filter(Boolean).join(' · ');
      h += `<div class="tangga-cetak"><h3>${esc(t.nama)}</h3><div class="meta">${esc(info)}</div>`;
      if (t.catatan) h += `<div class="meta">Catatan: ${esc(t.catatan)}</div>`;
      h += '<table><thead><tr><th>No.</th><th>Tinggi riser</th><th>Panjang tread</th><th>2R + T</th><th>Lebar</th><th>Catatan</th></tr></thead><tbody>';
      for (const b of t.bagian) {
        if (b.jenis === 'bordes') {
          h += `<tr><td>Bordes</td><td colspan="2">panjang ${fmt(b.panjang_cm)}</td><td></td><td class="n">${fmt(b.lebar_cm)}</td><td>${esc(b.catatan)}</td></tr>`;
        } else {
          const bl = Number.isFinite(b.tinggi_riser_cm) && Number.isFinite(b.panjang_tread_cm) ? 2 * b.tinggi_riser_cm + b.panjang_tread_cm : null;
          h += `<tr><td>${nomor.get(b.id)}</td><td class="n">${fmt(b.tinggi_riser_cm)}</td><td class="n">${fmt(b.panjang_tread_cm)}</td><td class="n">${fmt(bl)}</td><td class="n">${fmt(b.lebar_cm ?? t.lebar_cm)}</td><td>${esc(b.catatan)}</td></tr>`;
        }
      }
      const s = (x) => (x ? `${fmt(x.rerata)} ± ${fmt(x.sd)} (${fmt(x.min)}–${fmt(x.maks)})` : '–');
      h += `</tbody><tfoot><tr><th>Rerata</th><th>${s(r.riser)}</th><th>${s(r.tread)}</th><th>${r.blondel ? fmt(r.blondel.rerata) : '–'}</th><th colspan="2">${r.n_anak_tangga} anak tangga · kemiringan ${r.kemiringan_derajat !== null ? fmt(r.kemiringan_derajat) + '°' : '–'} · tinggi total ${fmt(r.tinggi_total_cm)}</th></tr></tfoot></table></div>`;
    }
  });
  return h;
}

function htmlFormulir(daftar, nBaris) {
  let h = '<h1>Formulir ukur anak tangga</h1><div class="meta">Satuan cm · tinggi riser = tegak antar-tread · panjang tread = muka riser ke tepi depan anak tangga berikutnya</div>';
  daftar.forEach(([l, semuaT], i) => {
    const target = semuaT.length ? semuaT : [{ nama: '', bagian: [] }];
    target.forEach((t, j) => {
      h += `<div class="tangga-cetak${i || j ? ' putus' : ''}"><h2>${esc(l.nama)} — ${esc(t.nama) || '................................'}</h2>`;
      h += '<div class="meta">Lantai ........ → ........ · Lebar tangga ........ cm · Pegangan ........ · Permukaan ................ · Lux ........ · Tanggal ............ · Pengukur ................</div>';
      h += '<table><thead><tr><th style="width:10%">No.</th><th style="width:20%">Tinggi riser</th><th style="width:20%">Panjang tread</th><th style="width:15%">Lebar</th><th>Catatan</th></tr></thead><tbody>';
      const n = Math.max(nBaris, t.bagian ? t.bagian.length : 0);
      for (let k = 1; k <= n; k++) h += `<tr><td class="isi-tangan">${k}</td><td></td><td></td><td></td><td></td></tr>`;
      h += '</tbody></table></div>';
    });
  });
  return h;
}

// ======================================================================= mulai
async function mulai() {
  dok = (await DB.bacaDokumen()) || M.dokumenKosong();
  if (dok.format !== M.FORMAT) dok = M.dokumenKosong();
  DB.mintaPersisten();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline tidak tersedia, aplikasi tetap jalan */ });
  }
  tampilkan();
}
mulai();
