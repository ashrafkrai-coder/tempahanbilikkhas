# Tempahan Bilik Khas — Versi 2.0 (Supabase)

Stack:
- Frontend: HTML/CSS/JS PWA
- Hosting: Vercel
- Database: Supabase (Postgres)
- Login: Google Identity Services
- Backend: Vercel Serverless Function `api/booking.js`

## Aliran pengguna
1. Guru tekan Login Google.
2. Jika email belum ada dalam jadual `teachers`, borang **Daftar Guru** dipaparkan.
3. Email diambil automatik daripada akaun Google.
4. Guru semak/isi nama penuh dan tekan **Daftar & Teruskan**.
5. Sistem menambah rekod `email | name | role=guru | active=true`.
6. Guru terus masuk ke halaman tempahan.
7. Login seterusnya tidak perlu daftar lagi.

## Supabase
Projek: `driutbpqenpqqqqfxptr` (https://driutbpqenpqqqqfxptr.supabase.co)

Skema: `supabase/schema.sql` (selamat dijalankan semula).

Jadual: `teachers` (guru), `rooms` (bilik), `bookings` (tempahan), `blocks` (sekatan).

- Pertindihan tempahan ditolak oleh pangkalan data sendiri (exclusion constraint),
  jadi dua guru yang menempah serentak tidak boleh mendapat slot yang sama.
- `blocks`: `room_id` kosong = semua bilik; `start_time`/`end_time` kosong = sepanjang hari.
- RLS dihidupkan tanpa polisi: hanya `api/booking.js` (service role) boleh membaca/menulis.

## Vercel — Environment Variables
- `SUPABASE_URL` = `https://driutbpqenpqqqqfxptr.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase > Project Settings > API Keys > `service_role` (rahsia)
- `GOOGLE_CLIENT_ID` (pilihan; lalai = Client ID dalam `config.js`)
- `ALLOWED_EMAIL_DOMAIN` (pilihan; contoh `moe-dl.edu.my` untuk hadkan pendaftaran)

## Nota admin (Supabase > Table Editor)
- Pendaftaran sendiri sentiasa mencipta role `guru`.
- Tukar `teachers.role` kepada `admin` untuk admin (admin boleh batalkan tempahan sesiapa).
- Nyahaktif akaun: `teachers.active = false`.
- Tambah/nyahaktif bilik: jadual `rooms` (`active`, `sort_order`).
- Sekat slot/hari: tambah baris dalam `blocks`.

## Ujian
- Pendaftaran: akaun baharu > borang Daftar Guru > semak jadual `teachers`.
- Pertindihan: Guru A 09:00–10:00, Guru B 09:30–10:30 pada bilik sama mesti ditolak.
