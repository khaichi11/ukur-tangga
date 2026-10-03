// Penulis .xlsx kecil tanpa pustaka luar (aplikasi harus jalan offline).
// Berkas xlsx = ZIP berisi XML OpenXML; di sini ZIP disimpan tanpa kompresi.

const enc = new TextEncoder();

// ---------------------------------------------------------------- ZIP (metode simpan)
const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = TABEL_CRC[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(berkas) {
  const bagian = [], pusat = [];
  let offset = 0;
  const d = new Date();
  const waktu = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const tanggal = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const [nama, isi] of berkas) {
    const n = enc.encode(nama), data = typeof isi === 'string' ? enc.encode(isi) : isi, crc = crc32(data);
    const lokal = new DataView(new ArrayBuffer(30));
    lokal.setUint32(0, 0x04034B50, true); lokal.setUint16(4, 20, true); lokal.setUint16(6, 0x0800, true);
    lokal.setUint16(8, 0, true); lokal.setUint16(10, waktu, true); lokal.setUint16(12, tanggal, true);
    lokal.setUint32(14, crc, true); lokal.setUint32(18, data.length, true); lokal.setUint32(22, data.length, true);
    lokal.setUint16(26, n.length, true); lokal.setUint16(28, 0, true);
    bagian.push(new Uint8Array(lokal.buffer), n, data);
    const p = new DataView(new ArrayBuffer(46));
    p.setUint32(0, 0x02014B50, true); p.setUint16(4, 20, true); p.setUint16(6, 20, true); p.setUint16(8, 0x0800, true);
    p.setUint16(10, 0, true); p.setUint16(12, waktu, true); p.setUint16(14, tanggal, true); p.setUint32(16, crc, true);
    p.setUint32(20, data.length, true); p.setUint32(24, data.length, true); p.setUint16(28, n.length, true);
    p.setUint32(42, offset, true);
    pusat.push(new Uint8Array(p.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const ukuranPusat = pusat.reduce((a, b) => a + b.length, 0);
  const akhir = new DataView(new ArrayBuffer(22));
  akhir.setUint32(0, 0x06054B50, true); akhir.setUint16(8, berkas.length, true); akhir.setUint16(10, berkas.length, true);
  akhir.setUint32(12, ukuranPusat, true); akhir.setUint32(16, offset, true);
  return new Blob([...bagian, ...pusat, new Uint8Array(akhir.buffer)],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------------------------------------------------------------- XML lembar kerja
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function kolom(i) {
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

// Gaya: 0 biasa, 1 judul kolom (tebal, latar biru muda), 2 angka 0,0, 3 tebal, 4 baris bordes (latar kuning muda)
const GAYA = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// lembar: { nama, lebar: [..], baris: [[sel, ...], ...] }; sel = nilai atau { v, gaya }
function xmlLembar(lembar) {
  const baris = lembar.baris.map((b, r) => {
    const sel = b.map((s, c) => {
      const isi = s !== null && typeof s === 'object' ? s : { v: s };
      const ref = `${kolom(c)}${r + 1}`;
      if (isi.v === null || isi.v === undefined || isi.v === '') return isi.gaya ? `<c r="${ref}" s="${isi.gaya}"/>` : '';
      if (typeof isi.v === 'number' && Number.isFinite(isi.v)) return `<c r="${ref}" s="${isi.gaya ?? 0}"><v>${isi.v}</v></c>`;
      return `<c r="${ref}" s="${isi.gaya ?? 0}" t="inlineStr"><is><t xml:space="preserve">${esc(isi.v)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${sel}</row>`;
  }).join('');
  const cols = lembar.lebar.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${baris}</sheetData></worksheet>`;
}

export function buatXlsx(lembarDaftar) {
  const nama = lembarDaftar.map((l) => esc(l.nama.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ')));
  const berkas = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${lembarDaftar.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nama.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${lembarDaftar.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${lembarDaftar.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
    ['xl/styles.xml', GAYA],
    ...lembarDaftar.map((l, i) => [`xl/worksheets/sheet${i + 1}.xml`, xmlLembar(l)]),
  ];
  return zip(berkas);
}
