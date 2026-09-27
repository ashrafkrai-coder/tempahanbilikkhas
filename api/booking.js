// Vercel Serverless Function — backend tempahan menggunakan Supabase (PostgREST).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_ID, ALLOWED_EMAIL_DOMAIN (pilihan)

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ||
  "417566039468-7sjjsdm1pvv280uas469fdultcr29mqd.apps.googleusercontent.com";
const ALLOWED_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "").toLowerCase();
const TZ = "Asia/Kuala_Lumpur";

class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

async function db(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.message || `Supabase ${res.status}`);
    err.code = data?.code;
    err.details = data?.details;
    throw err;
  }
  return data;
}

async function verifyGoogle(credential) {
  if (!credential) throw new ApiError("Sila log masuk dengan Google.", 401);
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  const info = await res.json().catch(() => ({}));
  if (!res.ok || info.aud !== GOOGLE_CLIENT_ID) throw new ApiError("Token login tidak sah atau tamat. Sila log masuk semula.", 401);
  if (info.email_verified !== "true" && info.email_verified !== true) throw new ApiError("Email Google belum disahkan.", 401);
  const email = String(info.email || "").toLowerCase();
  if (ALLOWED_EMAIL_DOMAIN && !email.endsWith("@" + ALLOWED_EMAIL_DOMAIN)) {
    throw new ApiError(`Hanya akaun @${ALLOWED_EMAIL_DOMAIN} dibenarkan.`, 403);
  }
  return { email, name: info.name || "" };
}

const enc = encodeURIComponent;
const hm = (t) => String(t || "").slice(0, 5);
const todayMY = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const publicUser = (t) => ({ email: t.email, name: t.name, role: t.role });

async function findTeacher(email) {
  const rows = await db(`teachers?email=eq.${enc(email)}&select=*`);
  return rows[0] || null;
}

async function requireTeacher(profile) {
  const t = await findTeacher(profile.email);
  if (!t) throw new ApiError("Akaun belum didaftarkan. Sila daftar dahulu.", 403);
  if (!t.active) throw new ApiError("Akaun guru telah dinyahaktifkan. Hubungi admin.", 403);
  return t;
}

function mapBooking(b) {
  return {
    id: b.id,
    room_id: b.room_id,
    room_name: b.rooms?.name || "",
    teacher_email: b.teacher_email,
    teacher_name: b.teachers?.name || "",
    booking_date: b.booking_date,
    start_time: hm(b.start_time),
    end_time: hm(b.end_time),
    class_name: b.class_name || "",
    purpose: b.purpose || "",
    status: b.status
  };
}

const actions = {
  async login(profile) {
    const t = await findTeacher(profile.email);
    if (!t) return { needsRegistration: true, profile };
    if (!t.active) throw new ApiError("Akaun guru telah dinyahaktifkan. Hubungi admin.", 403);
    return { user: publicUser(t) };
  },

  async register(profile, { name }) {
    name = String(name || "").trim();
    if (name.length < 3) throw new ApiError("Sila masukkan nama penuh guru.");
    const existing = await findTeacher(profile.email);
    if (existing) {
      if (!existing.active) throw new ApiError("Akaun guru telah dinyahaktifkan. Hubungi admin.", 403);
      return { user: publicUser(existing) };
    }
    // Pendaftaran sendiri sentiasa role 'guru'.
    const [t] = await db("teachers", {
      method: "POST",
      body: { email: profile.email, name: name.slice(0, 120), role: "guru", active: true },
      prefer: "return=representation"
    });
    return { user: publicUser(t) };
  },

  async getRooms(profile) {
    await requireTeacher(profile);
    const rooms = await db("rooms?active=eq.true&select=id,name,location,capacity&order=sort_order,name");
    return { rooms };
  },

  async getBookings(profile, { date }) {
    await requireTeacher(profile);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new ApiError("Tarikh tidak sah.");
    const rows = await db(
      `bookings?booking_date=eq.${date}&status=eq.ACTIVE` +
      `&select=*,rooms(name),teachers(name)&order=start_time`
    );
    return { bookings: rows.map(mapBooking) };
  },

  async myBookings(profile) {
    const t = await requireTeacher(profile);
    const rows = await db(
      `bookings?teacher_email=eq.${enc(t.email)}&status=eq.ACTIVE&booking_date=gte.${todayMY()}` +
      `&select=*,rooms(name)&order=booking_date,start_time`
    );
    return { bookings: rows.map(mapBooking) };
  },

  async createBooking(profile, p) {
    const t = await requireTeacher(profile);
    const roomId = Number(p.roomId);
    const date = String(p.bookingDate || "");
    const start = hm(p.startTime), end = hm(p.endTime);
    if (!roomId) throw new ApiError("Bilik tidak sah.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError("Tarikh tidak sah.");
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new ApiError("Masa tidak sah.");
    if (start >= end) throw new ApiError("Masa tamat mesti selepas masa mula.");
    if (date < todayMY()) throw new ApiError("Tidak boleh menempah tarikh yang telah lepas.");
    if (!String(p.purpose || "").trim()) throw new ApiError("Sila isi tujuan tempahan.");

    const room = (await db(`rooms?id=eq.${roomId}&active=eq.true&select=id`))[0];
    if (!room) throw new ApiError("Bilik tidak dijumpai atau tidak aktif.");

    try {
      const [b] = await db("bookings", {
        method: "POST",
        body: {
          room_id: roomId,
          teacher_email: t.email,
          booking_date: date,
          start_time: start,
          end_time: end,
          class_name: String(p.className || "").trim().slice(0, 100),
          purpose: String(p.purpose || "").trim().slice(0, 500)
        },
        prefer: "return=representation"
      });
      return { booking: mapBooking(b) };
    } catch (err) {
      if (err.code === "23P01") throw new ApiError("Slot ini telah ditempah. Sila pilih masa lain.", 409);
      if (err.message === "BLOCKED") throw new ApiError(`Slot disekat: ${err.details || "oleh pentadbir"}.`, 409);
      throw err;
    }
  },

  async cancelBooking(profile, { bookingId }) {
    const t = await requireTeacher(profile);
    if (!/^[0-9a-f-]{36}$/i.test(String(bookingId || ""))) throw new ApiError("Tempahan tidak sah.");
    const b = (await db(`bookings?id=eq.${bookingId}&select=id,teacher_email,status`))[0];
    if (!b) throw new ApiError("Tempahan tidak dijumpai.", 404);
    if (b.teacher_email !== t.email && t.role !== "admin") throw new ApiError("Anda hanya boleh membatalkan tempahan sendiri.", 403);
    if (b.status !== "ACTIVE") return { ok: true };
    await db(`bookings?id=eq.${bookingId}`, {
      method: "PATCH",
      body: { status: "CANCELLED", cancelled_at: new Date().toISOString() }
    });
    return { ok: true };
  }
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) throw new ApiError("Pelayan belum dikonfigurasi (Supabase).", 500);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const handler = Object.prototype.hasOwnProperty.call(actions, body.action) && actions[body.action];
    if (!handler) throw new ApiError("Tindakan tidak dikenali.");
    const profile = await verifyGoogle(body.credential);
    const result = await handler(profile, body);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ ok: false, message: err instanceof ApiError ? err.message : "Ralat sistem. Cuba lagi." });
  }
};
