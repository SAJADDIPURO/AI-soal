# Generator Soal — siap deploy ke Netlify (pakai Gemini API, GRATIS)

Web ini mengubah materi pelajaran (upload .txt/.pdf/.docx atau paste teks) jadi
soal pilihan ganda + essay otomatis, pakai **Google Gemini API** yang gratis
(tanpa kartu kredit). Ada mekanisme **self-healing**: kalau AI menghasilkan
format yang salah (JSON rusak, jumlah soal tidak sesuai, dsb), server otomatis
meminta AI memperbaikinya sendiri (maks. 3 percobaan) sebelum melapor error ke
pengguna.

## Struktur project

```
index.html                         -> tampilan web (statis)
netlify.toml                       -> konfigurasi Netlify
netlify/functions/generate-quiz.js -> serverless function yang memanggil Gemini API
                                       (API key disimpan aman di server, bukan di browser)
```

## Cara deploy

### 1. Ambil API key Gemini (gratis, tanpa kartu kredit)
1. Buka https://aistudio.google.com/apikey
2. Login dengan akun Google
3. Klik **Create API key** → pilih atau buat project Google Cloud (gratis,
   tidak perlu isi data kartu untuk tier gratis ini)
4. Salin API key yang muncul

**Catatan privasi:** di tier gratis, Google boleh memakai prompt & hasil
generate untuk meningkatkan produk mereka. Jangan upload materi yang sifatnya
rahasia/berbayar. Untuk data yang lebih privat, Google menyediakan tier
berbayar dengan kebijakan data berbeda — lihat https://ai.google.dev/gemini-api/terms

### 2. Upload project ke GitHub (disarankan)
Push folder ini ke repo GitHub baru. Cara paling gampang kalau belum familiar
git: buat repo baru di github.com, lalu upload semua file lewat tombol
"Add file → Upload files" di web GitHub.

### 3. Hubungkan ke Netlify
1. Login ke https://app.netlify.com
2. **Add new site → Import an existing project**
3. Pilih repo GitHub yang tadi dibuat
4. Build settings dibiarkan default (tidak perlu build command, publish
   directory `.`) — Netlify otomatis mendeteksi `netlify.toml`
5. Klik **Deploy**

### 4. Set environment variable (WAJIB)
Tanpa langkah ini, tombol "Buat soal" akan selalu error.

1. Di dashboard site Netlify → **Site configuration → Environment variables**
2. Klik **Add a variable**
   - Key: `GEMINI_API_KEY`
   - Value: API key dari langkah 1
3. Simpan, lalu **trigger deploy ulang** (Deploys → Trigger deploy → Deploy site)
   supaya function membaca env var yang baru.

### 5. Selesai
Buka URL Netlify yang diberikan (contoh: `nama-acak.netlify.app`). Upload
materi, atur jumlah soal, klik "Buat soal".

## Alternatif: deploy lewat Netlify CLI (tanpa GitHub)

```bash
npm install -g netlify-cli
cd generator-soal-netlify
netlify deploy --prod
```

Ikuti prompt untuk login & membuat site baru, lalu tetap wajib set
`GEMINI_API_KEY` lewat dashboard atau `netlify env:set GEMINI_API_KEY xxxx`.

## Soal batas gratis (rate limit)
Tier gratis Gemini API dibatasi jumlah request per menit dan per hari (bukan
soal biaya, tapi soal kuota). Batas ini berubah-ubah dari waktu ke waktu, jadi
cek angka terbaru di https://ai.google.dev/gemini-api/docs/rate-limits.
Kalau kena limit, tombol "Buat soal" akan menampilkan pesan error dari Gemini
— tinggal coba lagi beberapa saat kemudian. Kalau nanti butuh kuota lebih
besar atau kebijakan data yang lebih ketat, tinggal upgrade ke tier berbayar
Gemini tanpa perlu ubah kode, cukup aktifkan billing di Google Cloud project
yang sama.

## Kenapa perlu Netlify Function (bukan langsung fetch dari browser)?
API key Gemini tidak boleh ditaruh di kode frontend yang bisa dilihat siapa
saja (view source / devtools) — nanti key kamu bisa dipakai orang lain sampai
kuota gratismu habis. Netlify Function menjalankan kode di server, jadi key
aman dan tidak pernah dikirim ke browser pengguna.
