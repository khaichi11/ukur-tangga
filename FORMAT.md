# Format ekspor `ukur-tangga` versi 1

Satu berkas JSON UTF-8. Semua panjang dalam **cm** (satu desimal), cahaya
dalam **lux**, sudut dalam **derajat**. Nilai yang belum diukur = `null`.

```text
{
  "format": "ukur-tangga",          // penanda format, selalu ini
  "versi": 1,
  "aplikasi": "Ukur Tangga",
  "diekspor": "2026-10-04T09:30:00.000Z",   // ISO 8601 UTC
  "zona_waktu": "Asia/Jakarta",
  "satuan": {"panjang": "cm", "cahaya": "lux", "sudut": "derajat"},
  "keterangan": "...definisi ukur...",
  "lokasi": [                        // gedung / lokasi
    {
      "id": "lok_…", "nama": "Gedung F", "alamat": "…", "catatan": "…",
      "dibuat": "ISO", "diubah": "ISO",
      "tangga": [
        {
          "id": "tng_…", "nama": "Tangga utama",
          "id_studio": "T01",        // ID tangga fisik di Studio RGB-D (tangga.json), atau null
          "lantai_dari": "1", "lantai_ke": "2",
          "arah": "naik",            // "naik": nomor 1 = anak tangga paling bawah; "turun": paling atas
          "lebar_cm": 120,           // lebar tangga (berlaku bila anak tangga tidak punya lebar sendiri)
          "pegangan": "kanan",       // "", "kiri", "kanan", "keduanya", "tidak ada"
          "permukaan": "keramik", "lux": 180,
          "tanggal_ukur": "2026-10-04", "pengukur": "…", "catatan": "…",
          "bagian": [                // urutan sesuai arah ukur
            {"jenis": "anak_tangga", "nomor": 1,
             "tinggi_riser_cm": 17.5, "panjang_tread_cm": 30.0, "lebar_cm": null, "catatan": ""},
            {"jenis": "bordes", "panjang_cm": 120.0, "lebar_cm": 120.0, "catatan": ""}
          ],
          "ringkasan": {             // dihitung aplikasi saat ekspor; dapat dihitung ulang dari "bagian"
            "n_anak_tangga": 4, "n_bordes": 1,
            "riser_cm": {"n": 4, "rerata": 17.3, "sd": 0.5, "median": 17.3, "min": 16.8, "maks": 18.0},
            "tread_cm": {"n": 3, "rerata": 30.0, "sd": 0.5, "median": 30.0, "min": 29.5, "maks": 30.5},
            "dua_riser_tambah_tread_cm": {"n": 3, "rerata": 65.0, …},
            "kemiringan_derajat": 30.0,          // atan(rerata riser / rerata tread)
            "tinggi_total_cm": 69.3              // jumlah riser yang terisi
          },
          "foto": 2,                 // jumlah foto; atau daftar data URL bila diekspor "dengan foto"
          "dibuat": "ISO", "diubah": "ISO"
        }
      ]
    }
  ]
}
```

## Definisi ukur

- `tinggi_riser_cm`: jarak tegak dari permukaan tread di bawahnya (atau
  lantai, untuk anak tangga 1) ke permukaan tread anak tangga ini.
- `panjang_tread_cm`: kedalaman injakan dari muka riser ke tepi depan anak
  tangga berikutnya. Anak tangga teratas biasanya hanya punya riser (di atasnya
  bordes/lantai), jadi `panjang_tread_cm` = `null`.
- `nomor` dihitung dari urutan `bagian` dan hanya untuk `anak_tangga`.
  Dengan `arah` = `naik`, nomor sama dengan nomor pelacak sistem RGB-D
  (#1 = anak tangga sah pertama yang terlihat saat naik).

## CSV

Satu baris per bagian: `lokasi, tangga, id_studio, lantai_dari, lantai_ke,
urutan, jenis, nomor, tinggi_riser_cm, panjang_tread_cm, panjang_bordes_cm,
lebar_cm, catatan` (UTF-8 dengan BOM, desimal titik).

## Kompatibilitas

Versi baru boleh menambah kolom; pembaca sebaiknya mengabaikan kolom yang tidak
dikenal. Kolom yang dihapus atau berubah arti menaikkan `versi`.
