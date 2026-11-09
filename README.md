# DOIT

DOIT (productivity + personal finance) adalah app catatan keuangan pribadi untuk iPhone, pengganti Money Lover. Master datanya ada di Google Sheets, jadi raw data selalu bisa lu ambil sendiri.

- **App**: web app (PWA) yang di-install ke home screen iPhone. Data disimpan di HP (IndexedDB), jadi app kebuka instan dan tetap jalan offline.
- **Master data**: Google Sheets. Tiap perubahan dikirim ke Sheets di belakang lewat Google Apps Script.
- **Fitur**: multi-dompet, transfer, budget, transaksi berulang, hutang & piutang, event/trip, laporan bulanan/tahunan, import Money Lover, dan kalkulator di numpad.
- **Rencana** (logic dari Financial Tracker): grup kategori, kelas kantong (Cash / Piutang / Kartu kredit), talangan, budget ideal per grup, health check, proyeksi kas 24 bulan, P&L tahunan, dan target tabungan. Semua pengaturannya tersimpan di sheet `Settings`.

---

## Setup (sekali aja, ±10 menit)

### 1. Pasang backend di Google Sheets

1. Buka spreadsheet **Duit - Master Data Keuangan** di Google Drive lu (sudah dibuatin). Kalau belum ada, bikin baru di [sheets.new](https://sheets.new).
2. Menu **Extensions → Apps Script**.
3. Hapus semua isi `Code.gs`, lalu paste seluruh isi file [`backend/Code.gs`](backend/Code.gs). Klik 💾 **Save**.
4. Di toolbar, pastikan fungsi yang kepilih `setup`, lalu klik **Run**.
   - Google bakal minta izin. Pilih akun lu → **Advanced** → **Go to … (unsafe)** → **Allow**. Ini normal untuk script buatan sendiri.
5. Buka **Execution log** di bawah, lalu copy **TOKEN** yang muncul. (Bisa dilihat lagi kapan aja lewat menu **Duit → Tampilkan token** di spreadsheet.)
6. Klik **Deploy → New deployment** → ikon ⚙️ → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Klik **Deploy**, lalu copy **Web app URL** (yang berakhiran `/exec`).

> "Anyone" artinya URL-nya bisa dipanggil dari app tanpa login Google. Datanya tetap aman karena setiap request wajib bawa token. Jangan share token ke siapa pun.

### 2. Nyalakan GitHub Pages

Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → **Save**.
Tunggu 1–2 menit, nanti app-nya bisa dibuka di `https://christoffercgadvisory.github.io/Chrispersonalfinance/`.

### 3. Install di iPhone

1. Buka URL di atas pakai **Safari** (harus Safari, bukan Chrome).
2. Tap tombol **Share** → **Add to Home Screen** → **Add**.
3. Buka **Duit** dari home screen → tap **Hubungkan ke Google Sheets** → paste Web app URL + token → **Simpan & tes koneksi**.

### 4. Import data Money Lover

1. Di [web.moneylover.me](https://web.moneylover.me), pilih dompet **Total** → menu ⋯ → **Export** → rentang dari awal sampai hari ini → **CSV**.
2. Simpan file-nya ke Files di iPhone (atau AirDrop dari laptop).
3. Di app: **Lainnya → Import dari Money Lover** → pilih file → cek preview → **Import**.
4. Cek saldo tiap dompet. Kalau ada yang beda dari saldo aslinya (Money Lover nggak selalu ikut meng-export saldo awal), buka dompetnya lalu tap **Sesuaikan saldo**.

Import ulang itu aman: transaksi yang sama nggak bakal dobel. Jadi selama masa transisi lu boleh export ulang dari Money Lover kapan aja.

---

## Struktur spreadsheet

| Sheet | Isi |
|---|---|
| Transactions | Semua transaksi. Nominal minus = uang keluar, plus = uang masuk. Kolom `category_name`, `wallet_name`, `event_name` diisi otomatis supaya enak di-pivot. |
| Wallets | Dompet + saldo awal |
| Categories | Kategori. `kind`: expense, income, debt, loan, repayment, collection, transfer, adjust. `group` = grup laporan (Food, Dating, Rent & Home, …) |
| Budgets | Limit per bulan. `category_ids` kosong = semua pengeluaran |
| Recurring | Aturan transaksi berulang |
| Events | Event/trip |
| Settings | Pengaturan rencana (gaji, lantai kas, rencana belanja per grup, biaya tahunan, agenda, target tabungan) dalam format JSON |

Aturan kalau edit langsung di sheet:
- **Boleh** edit nilai sel. Perubahannya ketarik ke app di sync berikutnya.
- **Boleh** tambah kolom baru di paling kanan (buat rumus atau catatan lu sendiri).
- **Boleh** geser urutan kolom; app baca kolom berdasarkan nama header.
- **Jangan** ganti nama header bawaan.
- **Jangan** hapus baris. Buat menghapus, isi kolom `deleted` dengan `TRUE`.

Buat analisis, bikin sheet baru (misalnya `Analisis`) dan pakai pivot atau `QUERY` ke sheet `Transactions`. Jangan ubah sheet master-nya.

---

## Update backend

Kalau `Code.gs` berubah: paste versi baru → Save → **Deploy → Manage deployments** → ✏️ → Version: **New version** → **Deploy**. URL-nya tetap sama, jadi nggak perlu setting ulang di HP.

## Update app

Push ke branch `main`, GitHub Pages otomatis update. Di iPhone, versi baru kepakai setelah app dibuka 2x (pembukaan pertama download di belakang, yang kedua langsung pakai).

## Struktur kode

```
index.html            shell + tab bar
css/app.css           tampilan (gaya iOS, light/dark)
js/app.js             bootstrap, navigasi tab
js/store.js           state, perhitungan saldo/laporan, sync ke Sheets, transaksi berulang
js/db.js              IndexedDB (penyimpanan lokal + antrean upload)
js/ui.js              helper: format Rupiah, halaman, sheet, picker
js/add.js             form tambah/edit transaksi (numpad)
js/views.js           semua layar: beranda, transaksi, laporan, dompet, budget, dll
js/importer.js        parser CSV Money Lover
js/plan.js            logic rencana: grup, kantong, budget ideal, proyeksi, health check, P&L, target
js/rencana.js         layar Laporan & Rencana
sw.js                 service worker (offline + cache)
backend/Code.gs       Google Apps Script
```

Nggak ada build step dan nggak ada dependency. Edit file, push, selesai.
