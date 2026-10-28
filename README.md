# Panduan Setup & Cara Menjalankan Project

Dokumentasi ini berisi langkah-langkah lengkap untuk melakukan clone dan menjalankan project **Gateway Dantotsuline** di lingkungan lokal (*local environment*).

---

## 🛠️ Prasyarat (Prerequisites)

Sebelum memulai, pastikan perangkat Anda sudah terinstall dependensi berikut:

1. **.NET SDK** (versi 6.0 / 7.0 / 8.0 sesuai versi project Anda)
   - Cek instalasi via terminal: `dotnet --version`
2. **Git**
   - Cek instalasi via terminal: `git --version`
3. **IDE / Code Editor**
   - [Visual Studio Code](https://code.visualstudio.com/) atau [Visual Studio 2022](https://visualstudio.microsoft.com/)

---

## 🚀 Langkah-Langkah Clone & Setup

### 1. Clone Repository

Buka **Terminal** atau **Command Prompt**, navigasi ke folder direktori tempat Anda ingin menyimpan project, lalu jalankan perintah:

```bash
git clone https://github.com/aditkerjayuk/Gateway-Dantotsuline.git
```

Setelah proses selesai, masuk ke direktori project:

```bash
cd Gateway-Dantotsuline
```

---

### 2. Setup Configuration (appsettings.json)

Karena beberapa file konfigurasi bersifat sensitif dan di-ignore oleh Git, Anda perlu membuat file konfigurasi lokal secara manual.

1. Buka folder project utama: `Gateway Dantotsuline/`
2. Buat file baru bernama `appsettings.Development.json` (atau `appsettings.json` jika belum ada).
3. Isi konfigurasi dasar seperti *Connection String* database atau settingan environment pendukung lainnya:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=NamaDbAnda;Trusted_Connection=True;TrustServerCertificate=True;"
  }
}
```

---

### 3. Restore Dependensi & Packages

Jalankan perintah berikut di terminal untuk mengunduh semua NuGet Package yang dibutuhkan oleh project:

```bash
dotnet restore
```

---

### 4. Build Project

Pastikan tidak ada *error* pada *source code* dengan melakukan kompilasi/build project:

```bash
dotnet build
```

---

### 5. Jalankan Application (Run Project)

Untuk menjalankan project di local server, gunakan perintah:

```bash
dotnet run
```

Setelah dijalankan, terminal akan menampilkan URL server lokal Anda, contohnya:
- `http://localhost:5141`
- `https://localhost:7141`

Buka URL tersebut di browser Anda untuk melihat aplikasi berjalan.

---

## 💡 Troubleshooting / Perintah Berguna

* **Clean Solution:** Jika terjadi masalah cache build, bersihkan hasil build sebelumnya dengan:
  ```bash
  dotnet clean
  ```
* **Update Database (Entity Framework Core):** Jika project ini menggunakan EF Core migrations, perbarui database lokal Anda dengan perintah:
  ```bash
  dotnet ef database update
  ```