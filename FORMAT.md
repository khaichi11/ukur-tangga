# Format cadangan `ukur-tangga` versi 2

JSON UTF-8. Panjang dalam **cm** (satu desimal); belum diukur = `null`.

```text
{
  "format": "ukur-tangga",
  "versi": 2,
  "diekspor": "2026-10-04T09:30:00.000Z",     // ISO 8601 UTC
  "satuan": "cm",
  "keterangan": "...",
  "lokasi": [
    {
      "nama": "Gedung F",
      "id_studio": "T01",                      // ID tangga fisik di Studio RGB-D, atau null
      "dibuat": "ISO", "diubah": "ISO",
      "tangga": [                              // dipisah bordes, urut dari bawah
        {
          "ke": 1,
          "anak_tangga": [                     // nomor mulai dari 1 di setiap tangga, 1 = paling bawah
            {"nomor": 1, "tinggi_riser_cm": 17.5, "panjang_tread_cm": 30.0},
            {"nomor": 2, "tinggi_riser_cm": 17.0, "panjang_tread_cm": 30.5}
          ],
          "bordes_sesudah": {"panjang_cm": 120.0}   // null untuk tangga terakhir / tanpa bordes
        },
        {"ke": 2, "anak_tangga": [ ... ], "bordes_sesudah": null}
      ]
    }
  ]
}
```

- `tinggi_riser_cm`: jarak tegak dari permukaan injakan di bawahnya (atau
  lantai) ke permukaan injakan anak tangga ini.
- `panjang_tread_cm`: kedalaman injakan, dari muka riser ke tepi depan anak
  tangga berikutnya. Anak tangga teratas sebelum bordes/lantai biasanya hanya
  punya riser.
- Nomor sama dengan nomor pelacak sistem RGB-D, yang juga mulai dari 1 lagi
  untuk setiap tangga baru.

Versi 1 (gedung → tangga → bagian) masih bisa dipulihkan; aplikasi
mengubahnya ke versi 2 (setiap bordes memulai tangga baru).

## Excel

Lembar **Data**: Lokasi, Tangga, No., Tinggi riser (cm), Panjang tread (cm),
Panjang bordes (cm); baris bordes berlatar kuning dengan No. = "bordes".
Lembar **Ringkasan**: per lokasi dan tangga, jumlah anak tangga serta
rata-rata, min, dan maks riser dan tread.
