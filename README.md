# Panduan Setup & Cara Menjalankan Project

Dokumentasi ini berisi langkah-langkah untuk melakukan clone dan menjalankan project **Gateway Dantotsuline** di lingkungan lokal (*local environment*).

---

## 🛠️ Prasyarat (Prerequisites)

1. **.NET SDK 10.0** (project memakai `net10.0`)
   - Cek instalasi via terminal: `dotnet --version`
2. **Git**
   - Cek instalasi via terminal: `git --version`
3. **IDE / Code Editor** (opsional)
   - [Visual Studio Code](https://code.visualstudio.com/) atau [Visual Studio 2022](https://visualstudio.microsoft.com/)

> Tidak perlu koneksi internet saat aplikasi berjalan. Three.js, Draco decoder, Bootstrap, dan jQuery sudah disimpan lokal di `wwwroot/lib/`.

---

## 🚀 Langkah-Langkah Clone & Setup

### 1. Clone Repository

```bash
git clone https://github.com/aditkerjayuk/Gateway-Dantotsuline.git
cd Gateway-Dantotsuline
```

---

### 2. Konfigurasi API Gateway (`appsettings.json`)

File `appsettings.json` **ikut disimpan di Git** karena hanya berisi konfigurasi non-rahasia:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "GatewayApi": {
    "BaseUrl": "http://10.146.124.150:5000",
    "GatewaysPath": "/api/gateways",
    "TimeoutSeconds": 8,
    "Token": ""
  }
}
```

- `BaseUrl` — alamat host API gateway.
- `GatewaysPath` — path endpoint daftar gateway.
- `TimeoutSeconds` — batas waktu request ke API (default 8 detik).
- `Token` — **biarkan kosong di file ini**. Isi lewat salah satu cara di bawah.

#### Mengisi token (pilih salah satu)

**a. `appsettings.Development.json` (paling mudah untuk lokal)**

Buat file `appsettings.Development.json` di root project (file ini di-ignore Git):

```json
{
  "GatewayApi": {
    "Token": "token-rahasia-anda"
  }
}
```

**b. Environment variable**

```powershell
$env:GatewayApi__Token = "token-rahasia-anda"
dotnet run
```

Atau lewat Command Prompt:

```bat
set GatewayApi__Token=token-rahasia-anda
dotnet run
```

**c. User Secrets (disarankan untuk development)**

```bash
dotnet user-secrets init
dotnet user-secrets set "GatewayApi:Token" "token-rahasia-anda"
```

> Key lama `TOKEN` (mis. environment variable `TOKEN`) masih didukung sebagai fallback jika `GatewayApi:Token` kosong.

---

### 3. Siapkan Model 3D

Model 3D **tidak disimpan di Git** karena ukurannya sangat besar (`wwwroot/models/*` di-ignore). Minta file berikut ke tim/pemilik project, lalu letakkan di folder `wwwroot/models/`:

| File | Ukuran kurang lebih |
|------|---------------------|
| `wwwroot/models/3d-fabrication-base.glb` | 14 MB |
| `wwwroot/models/3d-fabrication-machinery.glb` | 168 MB |

Tanpa kedua file ini, halaman `/Gateway` tetap terbuka tetapi scene 3D akan gagal memuat model.

> File konfigurasi tata letak box gateway ada di `wwwroot/config/assembly.json` dan **ikut disimpan di Git**. Posisi box bisa diubah lewat UI lalu diekspor dengan tombol **Ekspor konfigurasi**.

---

### 4. Restore Dependensi

```bash
dotnet restore
```

---

### 5. Build Project

```bash
dotnet build
```

---

### 6. Jalankan Application

```bash
dotnet run
```

Buka salah satu URL berikut di browser:

- `http://localhost:5141` — halaman utama
- `http://localhost:5141/Gateway` — halaman daftar gateway + scene 3D (editor)
- `http://localhost:5141/Gateway/Preview` — halaman **Monitoring** read-only

> Gunakan `http://localhost:...`, jangan membuka file `.cshtml` langsung lewat `file://`, karena ES module dan fetch membutuhkan web server.

---

## 🖥️ Halaman Monitoring (`/Gateway/Preview`)

Halaman ini hanya untuk memantau, tanpa toolbar editor, gizmo, sidebar konfigurasi, atau autosave.

- Card **Daftar Gateway** berwarna putih mengapung di kiri atas viewport 3D (tinggi terbatas, daftar bisa di-scroll), bukan sidebar full-height.
- Semua callout langsung tampil selama box gateway berada di depan kamera.
- Klik kartu callout untuk membuka `/Gateway` pada baris gateway tersebut (baris tersorot kuning).
- Klik box atau item di card daftar gateway untuk menerbangkan kamera ke lokasi; `Esc` atau klik area kosong melepas pilihan.
- Warna box mengikuti status API: hijau `ONLINE`, merah `OFFLINE`, abu-abu tidak diketahui/API tidak terhubung.
- Status diperbarui setiap 5 detik dari `/Gateway/GetGatewayJson`.

### Mengisi info manual gateway

Edit `wwwroot/config/gateway-info.json`. Data ini dipakai untuk nama, line, lokasi, dan field tambahan pada callout serta sidebar.

```json
{
  "gateways": {
    "GW-001": {
      "name": "Gateway Press Line A",
      "line": "Line A - Press",
      "location": "Area Press, sisi utara",
      "extra": [
        { "label": "PIC", "value": "Tim Maintenance" },
        { "label": "Catatan", "value": "Contoh field tambahan" }
      ]
    }
  }
}
```

Field yang kosong akan memakai fallback: nama dari API atau `Gateway <ID>`, sedangkan line/lokasi/extra tidak ditampilkan jika kosong. Key harus sama dengan `id` di `assembly.json` (mis. `GW-001`).

---

## 🧭 Sidebar Navigasi

Sidebar kiri bersifat global dan dimuat sebagai component (`Views/Shared/_Sidebar.cshtml`) dari `_Layout` maupun `_PreviewLayout`.

- Full-height, latar biru, teks menu putih, menu aktif berwarna kuning.
- Tombol collapse bulat mengapung tepat di tengah tepi kanan sidebar (menjadi semi-bulat saat collapsed).
- Status collapse disimpan di `localStorage` (`sidebar-collapsed`) sehingga bertahan saat pindah halaman.

---

## 📌 Endpoint Penting

| Endpoint | Keterangan |
|----------|------------|
| `/Gateway` | Halaman tabel gateway + visualisasi 3D (editor, server-side render) |
| `/Gateway/Preview` | Halaman monitoring read-only dengan callout zoom-dependent |
| `/Gateway/GetGatewayJson` | JSON daftar gateway untuk sinkronisasi box 3D (dipanggil tiap 5 detik) |

---

## 💡 Troubleshooting

- **Tabel gateway kosong / tidak ada data**
  - Pastikan `GatewayApi:Token` sudah terisi dan `BaseUrl` bisa diakses dari mesin Anda.
  - Cek log di terminal; pesan `Gagal memanggil API` atau `Terjadi kesalahan` menunjukkan API tidak terjangkau/menolak token.

- **Scene 3D kosong atau muncul pesan gagal memuat model**
  - Pastikan kedua file `.glb` ada di `wwwroot/models/` dengan nama yang persis sama.
  - Pastikan halaman dibuka lewat `http://localhost`, bukan `file://`.
  - Buka Developer Tools → tab Network untuk melihat apakah file model mengembalikan 404.

- **Box 3D berwarna abu-abu semua**
  - Status box mengikuti API, bukan file konfigurasi: **abu-abu = status belum diketahui / API tidak terhubung**, **hijau = ONLINE**, **merah = OFFLINE**. Cek `GatewayApi:Token` dan koneksi ke `BaseUrl`.

- **Halaman 3D berat / lambat**
  - File machinery berukuran ~168 MB, jadi pemuatan pertama memang lama. Setelah itu browser akan memakai cache.

- **Clean solution jika ada masalah cache build**
  ```bash
  dotnet clean
  ```
