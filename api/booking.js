// Vercel Serverless Function — backend tempahan menggunakan Supabase (PostgREST).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_EMAIL_DOMAIN (pilihan)

const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ALLOWED_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "").toLowerCase();
const TZ = "Asia/Kuala_Lumpur";
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

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

const enc = encodeURIComponent;
const hm = (t) => String(t || "").slice(0, 5);
const todayMY = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const publicUser = (t) => ({ email: t.email, name: t.name, role: t.role });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE = /^\d{4,6}$/;

// ---- PIN ----
// Format baharu: "scrypt$<salt hex>$<hash hex>". Hash lama dari Google Sheet: SHA-256(pin) hex.
async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pin, salt, 32);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function checkPin(pin, stored) {
  if (!stored) return false;
  let expected, actual;
  if (stored.startsWith("scrypt$")) {
    const [, salt, hash] = stored.split("$");
    expected = Buffer.from(hash, "hex");
    actual = await scrypt(pin, Buffer.from(salt, "hex"), expected.length);
  } else {
    expected = Buffer.from(stored, "hex");
    actual = crypto.createHash("sha256").update(pin).digest();
  }
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function findTeacher(email) {
  const rows = await db(`teachers?email=eq.${enc(email)}&select=*`);
  return rows[0] || null;
}

async function updateTeacher(email, patch) {
  await db(`teachers?email=eq.${enc(email)}`, { method: "PATCH", body: patch });
}

async function authenticate(body) {
  const email = String(body.email || "").trim().toLowerCase();
  const pin = String(body.pin || "").trim();
  if (!email || !PIN_RE.test(pin)) throw new ApiError("Sila log masuk dengan email & PIN.", 401);

  const t = await findTeacher(email);
  if (!t) throw new ApiError("Email atau PIN salah.", 401);
  if (t.locked_until && new Date(t.locked_until) > new Date()) {
    throw new ApiError(`Terlalu banyak cubaan PIN salah. Cuba lagi selepas ${LOCK_MINUTES} minit.`, 429);
  }
  if (!(await checkPin(pin, t.pin_hash))) {
    const attempts = (t.failed_attempts || 0) + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    await updateTeacher(email, locked
      ? { failed_attempts: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() }
      : { failed_attempts: attempts });
    throw new ApiError(locked
      ? `Terlalu banyak cubaan PIN salah. Cuba lagi selepas ${LOCK_MINUTES} minit.`
      : "Email atau PIN salah.", locked ? 429 : 401);
  }
  if (!t.active) throw new ApiError("Akaun guru telah dinyahaktifkan. Hubungi admin.", 403);

  const patch = {};
  if (t.failed_attempts || t.locked_until) Object.assign(patch, { failed_attempts: 0, locked_until: null });
  if (!t.pin_hash.startsWith("scrypt$")) patch.pin_hash = await hashPin(pin); // naik taraf hash lama
  if (Object.keys(patch).length) await updateTeacher(email, patch);
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

// Tindakan yang tidak memerlukan log masuk.
const publicActions = {
  async register(body) {
    const email = String(body.email || "").trim().toLowerCase();
    const pin = String(body.pin || "").trim();
    const name = String(body.name || "").trim();
    if (!EMAIL_RE.test(email)) throw new ApiError("Sila masukkan email yang sah.");
    if (ALLOWED_EMAIL_DOMAIN && !email.endsWith("@" + ALLOWED_EMAIL_DOMAIN)) {
      throw new ApiError(`Hanya email @${ALLOWED_EMAIL_DOMAIN} dibenarkan.`, 403);
    }
    if (name.length < 3) throw new ApiError("Sila masukkan nama penuh guru.");
    if (!PIN_RE.test(pin)) throw new ApiError("PIN mesti 4-6 digit nombor.");
    if (await findTeacher(email)) throw new ApiError("Email ini sudah didaftarkan. Sila log masuk.", 409);

    // Pendaftaran sendiri sentiasa role 'guru'.
    try {
      const [t] = await db("teachers", {
        method: "POST",
        body: { email, name: name.slice(0, 120), role: "guru", active: true, pin_hash: await hashPin(pin) },
        prefer: "return=representation"
      });
      return { user: publicUser(t) };
    } catch (err) {
      if (err.code === "23505") throw new ApiError("Email ini sudah didaftarkan. Sila log masuk.", 409);
      throw err;
    }
  },

  async forgotPin() {
    return { message: "Sila hubungi admin sistem untuk menetapkan semula PIN anda." };
  }
};

// Tindakan untuk guru yang telah log masuk.
const actions = {
  async login(t) {
    return { user: publicUser(t) };
  },

  async getRooms() {
    const rooms = await db("rooms?active=eq.true&select=id,name,location,capacity&order=sort_order,name");
    return { rooms };
  },

  async getBookings(t, { date }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new ApiError("Tarikh tidak sah.");
    const rows = await db(
      `bookings?booking_date=eq.${date}&status=eq.ACTIVE` +
      `&select=*,rooms(name),teachers(name)&order=start_time`
    );
    return { bookings: rows.map(mapBooking) };
  },

  async getMonthBookings(t, { month }) {
    if (!/^\d{4}-\d{2}$/.test(month || "")) throw new ApiError("Bulan tidak sah.");
    const [y, m] = month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const rows = await db(
      `bookings?booking_date=gte.${month}-01&booking_date=lt.${next}-01&status=eq.ACTIVE` +
      `&select=*,rooms(name),teachers(name)&order=booking_date,start_time`
    );
    return { bookings: rows.map(mapBooking) };
  },

  async myBookings(t) {
    const rows = await db(
      `bookings?teacher_email=eq.${enc(t.email)}&status=eq.ACTIVE&booking_date=gte.${todayMY()}` +
      `&select=*,rooms(name)&order=booking_date,start_time`
    );
    return { bookings: rows.map(mapBooking) };
  },

  async createBooking(t, p) {
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

  async cancelBooking(t, { bookingId }) {
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

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) throw new ApiError("Pelayan belum dikonfigurasi (Supabase).", 500);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    let result;
    if (has(publicActions, body.action)) {
      result = await publicActions[body.action](body);
    } else if (has(actions, body.action)) {
      const teacher = await authenticate(body);
      result = await actions[body.action](teacher, body);
    } else {
      throw new ApiError("Tindakan tidak dikenali.");
    }
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ ok: false, message: err instanceof ApiError ? err.message : "Ralat sistem. Cuba lagi." });
  }
};
