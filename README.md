# Tempahan Bilik Khas — Versi 1.1 (Daftar Guru)

Stack:
- Frontend: HTML/CSS/JS PWA
- Hosting: Vercel
- Database: Google Sheets
- Backend: Google Apps Script
- Login: Google Identity Services
- API bridge: Vercel Serverless Function

## Aliran pengguna
1. Guru tekan Login Google.
2. Jika email belum ada dalam tab `Guru`, borang **Daftar Guru** dipaparkan.
3. Email diambil automatik daripada akaun Google.
4. Guru semak/isi nama penuh dan tekan **Daftar & Teruskan**.
5. Sistem menambah rekod `email | nama | guru | TRUE` dalam tab `Guru`.
6. Guru terus masuk ke halaman tempahan.
7. Login seterusnya tidak perlu daftar lagi.

## Google Sheet projek
Spreadsheet ID telah dimasukkan dalam `apps-script/Code.gs`:
`1D-xG8ddkFNYWsqgASJvJyHiqAR3yN4XDgGSPpkoUw48`

Tab:
- Guru
- Bilik
- Tempahan
- Sekatan

Bilik aktif:
1. Aula Perdana
2. Dewan Lestari Jauhar
3. Bidari Corner
4. PSS
5. Bilik PAK21
6. Surau

## 1. Apps Script
Buka Google Sheet > Extensions > Apps Script.

Salin:
- `apps-script/Code.gs`
- `apps-script/appsscript.json`

Dalam `Code.gs`, isi `GOOGLE_CLIENT_ID`.

`SPREADSHEET_ID` sudah diisi.

Pilihan keselamatan: isi `ALLOWED_EMAIL_DOMAIN` jika pendaftaran hanya mahu dibenarkan untuk domain sekolah.

Deploy:
- Deploy > New deployment > Web app
- Execute as: Me
- Who has access: Anyone

Salin URL `/exec`.

## 2. OAuth Client ID
Google Cloud Console:
1. APIs & Services > OAuth consent screen.
2. Configure aplikasi.
3. Credentials > Create Credentials > OAuth client ID.
4. Application type: Web application.
5. Tambah Authorized JavaScript origins untuk domain Vercel aplikasi.
6. Salin Client ID.

Masukkan Client ID yang sama di:
- `config.js`
- `apps-script/Code.gs`

## 3. Vercel
Dalam Vercel Project Settings > Environment Variables:

`APPS_SCRIPT_URL` = URL Apps Script `/exec`

Kemudian deploy semula.

## Ujian pendaftaran
1. Guna akaun Google yang belum ada dalam tab `Guru`.
2. Login.
3. Borang Daftar Guru mesti muncul.
4. Tekan Daftar & Teruskan.
5. Semak tab `Guru`: email, nama, role `guru`, aktif `TRUE` mesti direkod.
6. Logout dan login semula: borang pendaftaran tidak patut muncul lagi.

## Ujian pertindihan
1. Guru A tempah satu bilik 09:00–10:00.
2. Guru B cuba tempah bilik sama 09:30–10:30.
3. Sistem mesti menolak tempahan Guru B.

## Nota admin
- Pendaftaran sendiri sentiasa mencipta role `guru`.
- Admin boleh tukar `role` kepada `admin` dalam tab `Guru`.
- Admin boleh nyahaktif akaun dengan menukar `aktif` kepada `FALSE`.
