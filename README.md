# Tempahan Bilik Khas — Versi 2.0 (Supabase)

Stack:
- Frontend: HTML/CSS/JS PWA
- Hosting: Vercel
- Database: Supabase (Postgres)
- Login: email + PIN (4-6 digit)
- Backend: Vercel Serverless Function `api/booking.js`

## Aliran pengguna
1. Guru baharu tekan **Daftar**, isi email, nama penuh dan PIN (4-6 digit).
2. Guru terus masuk ke halaman tempahan; login seterusnya guna email + PIN.
3. 5 cubaan PIN salah berturut-turut mengunci akaun selama 15 minit.
4. **Lupa PIN**: guru diminta menghubungi admin (lihat Nota admin).

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
- `ALLOWED_EMAIL_DOMAIN` (pilihan; contoh `moe-dl.edu.my` untuk hadkan pendaftaran)

PIN disimpan sebagai scrypt + salt. Hash lama dari Google Sheet (SHA-256) diterima dan dinaik taraf automatik semasa guru log masuk.

## Nota admin (Supabase > Table Editor)
- Pendaftaran sendiri sentiasa mencipta role `guru`.
- Tukar `teachers.role` kepada `admin` untuk admin (admin boleh batalkan tempahan sesiapa).
- Nyahaktif akaun: `teachers.active = false`.
- Set semula PIN guru (SQL Editor), beri PIN sementara kepada guru:
  `update teachers set pin_hash = encode(sha256('482913'::bytea), 'hex'), locked_until = null where email = 'guru@contoh.my';`
- Buka kunci akaun: `teachers.locked_until = null`.
- Tambah/nyahaktif bilik: jadual `rooms` (`active`, `sort_order`).
- Sekat slot/hari: tambah baris dalam `blocks`.

## Ujian
- Pendaftaran: akaun baharu > borang Daftar Guru > semak jadual `teachers`.
- Pertindihan: Guru A 09:00–10:00, Guru B 09:30–10:30 pada bilik sama mesti ditolak.
