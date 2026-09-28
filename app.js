const state = {
  auth: JSON.parse(localStorage.getItem("booking_auth") || "null"),
  user: JSON.parse(localStorage.getItem("booking_user") || "null"),
  rooms: [],
  bookings: [],
  monthBookings: []
};

const WEEKDAYS = ["Ahd","Isn","Sel","Rab","Kha","Jum","Sab"];

const $ = (id) => document.getElementById(id);
const fmtDate = (d) => new Intl.DateTimeFormat("ms-MY",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(d+"T00:00:00"));
function fmtTime12(t){
  if(!t) return "";
  const [h,m] = t.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  let h12 = h % 12;
  if(h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2,"0")} ${period}`;
}
const today = new Date();
$("todayText").textContent = new Intl.DateTimeFormat("ms-MY",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(today);
$("datePicker").value = today.toISOString().slice(0,10);

let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault(); deferredPrompt=e; $("installBtn").classList.remove("hidden");
});
$("installBtn").onclick=async()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null; $("installBtn").classList.add("hidden");
};

async function api(action, payload={}) {
  const res = await fetch("/api/booking", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action, email: state.auth?.email, pin: state.auth?.pin, ...payload})
  });
  const data = await res.json();
  if(!res.ok || data.ok===false) throw new Error(data.message || "Ralat sistem");
  return data;
}

function setMsg(el, text="", type="") {
  el.textContent=text;
  el.className="msg"+(type?` ${type}`:"");
}

function showOnly(viewId){
  ["loginView","registerView","forgotPinView","appView"].forEach(id=>$(id).classList.toggle("hidden", id!==viewId));
}

$("loginForm").addEventListener("submit", async(e)=>{
  e.preventDefault();
  const email = $("loginEmail").value.trim().toLowerCase();
  const pin = $("loginPin").value.trim();
  if(!email || !/^\d{4,6}$/.test(pin)){
    setMsg($("loginMsg"),"Masukkan email & PIN (4-6 digit) yang sah.","error");
    return;
  }

  try{
    setMsg($("loginMsg"),"Log masuk...");
    state.auth = {email,pin};
    const data = await api("login");
    state.user = data.user;
    localStorage.setItem("booking_auth", JSON.stringify(state.auth));
    localStorage.setItem("booking_user", JSON.stringify(state.user));
    await enterApp();
  }catch(err){
    state.auth = null;
    setMsg($("loginMsg"),err.message,"error");
  }
});

$("showRegisterBtn").onclick=()=>{
  setMsg($("registerMsg"));
  showOnly("registerView");
};

$("backToLoginBtn").onclick=()=>{
  setMsg($("loginMsg"));
  showOnly("loginView");
};

$("showForgotBtn").onclick=()=>{
  setMsg($("forgotMsg"));
  $("forgotEmail").value = $("loginEmail").value.trim();
  showOnly("forgotPinView");
};

$("forgotBackBtn").onclick=()=>{
  setMsg($("loginMsg"));
  showOnly("loginView");
};

$("forgotPinForm").addEventListener("submit", async(e)=>{
  e.preventDefault();
  const email = $("forgotEmail").value.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    setMsg($("forgotMsg"),"Sila masukkan email yang sah.","error");
    return;
  }
  try{
    setMsg($("forgotMsg"),"Menghantar...");
    const data = await api("forgotPin", {email});
    setMsg($("forgotMsg"), data.message || "Jika email berdaftar, PIN baharu telah dihantar.", "ok");
  }catch(err){
    setMsg($("forgotMsg"), err.message, "error");
  }
});

$("registerForm").addEventListener("submit", async(e)=>{
  e.preventDefault();
  const email = $("registerEmail").value.trim().toLowerCase();
  const name = $("registerName").value.trim();
  const pin = $("registerPin").value.trim();
  const pinConfirm = $("registerPinConfirm").value.trim();

  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    setMsg($("registerMsg"),"Sila masukkan email yang sah.","error");
    return;
  }
  if(name.length < 3){
    setMsg($("registerMsg"),"Sila masukkan nama penuh guru.","error");
    return;
  }
  if(!/^\d{4,6}$/.test(pin)){
    setMsg($("registerMsg"),"PIN mesti 4-6 digit nombor.","error");
    return;
  }
  if(pin !== pinConfirm){
    setMsg($("registerMsg"),"PIN pengesahan tidak sepadan.","error");
    return;
  }

  try{
    setMsg($("registerMsg"),"Mendaftarkan guru...");
    state.auth = {email,pin};
    const data = await api("register", {name});
    state.user = data.user;
    localStorage.setItem("booking_auth", JSON.stringify(state.auth));
    localStorage.setItem("booking_user", JSON.stringify(state.user));
    setMsg($("registerMsg"),"Pendaftaran berjaya.","ok");
    await enterApp();
  }catch(err){
    state.auth = null;
    setMsg($("registerMsg"),err.message,"error");
  }
});

async function enterApp(){
  if(!state.user) throw new Error("Profil guru tidak dijumpai.");
  showOnly("appView");
  $("teacherName").textContent=state.user?.name || "-";
  $("teacherEmail").textContent=state.user?.email || "";
  await refreshAll();
}

async function restoreSession(){
  if(!state.auth){
    showOnly("loginView");
    return;
  }

  try{
    const data = await api("login");
    state.user=data.user;
    localStorage.setItem("booking_user", JSON.stringify(state.user));
    await enterApp();
  }catch(err){
    clearLocalSession();
    showOnly("loginView");
    setMsg($("loginMsg"),"Sesi tamat. Sila log masuk semula.","error");
  }
}

async function refreshAll(){
  try{
    const date=$("datePicker").value;
    const month=date.slice(0,7);
    const [roomsRes,myRes,monthRes]=await Promise.all([
      api("getRooms"),
      api("myBookings"),
      api("getMonthBookings",{month})
    ]);
    state.rooms=roomsRes.rooms||[];
    state.monthBookings=monthRes.bookings||[];
    state.bookings=state.monthBookings.filter(b=>b.booking_date===date);
    renderCalendar();
    renderMonthAgenda();
    renderRooms();
    renderMyBookings(myRes.bookings||[]);
  }catch(err){
    alert(err.message);
    if(/login|sesi|akaun|pin|daftar/i.test(err.message)) logout();
  }
}

function renderCalendar(){
  const date = $("datePicker").value;
  const [y,m] = date.split("-").map(Number);
  const first = new Date(y, m-1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startWeekday = first.getDay();
  const todayStr = new Date().toISOString().slice(0,10);

  $("calendarLabel").textContent = new Intl.DateTimeFormat("ms-MY",{month:"long",year:"numeric"}).format(first);

  const countByDay = {};
  state.monthBookings.forEach(b=>{ countByDay[b.booking_date] = (countByDay[b.booking_date]||0)+1; });

  const wrap = $("calendarGrid");
  wrap.innerHTML = "";

  WEEKDAYS.forEach(w=>{
    const el = document.createElement("div");
    el.className = "cal-weekday";
    el.textContent = w;
    wrap.appendChild(el);
  });

  for(let i=0;i<startWeekday;i++){
    const el = document.createElement("div");
    el.className = "cal-cell empty";
    wrap.appendChild(el);
  }

  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const count = countByDay[dateStr] || 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-cell " + (count>0?"busy":"free") + (dateStr===date?" selected":"") + (dateStr===todayStr?" today":"");
    btn.setAttribute("aria-label", `${d} — ${count>0?count+" tempahan":"Tiada tempahan"}`);
    btn.innerHTML = `<span class="cal-day">${d}</span><span class="cal-dot"></span>`;
    btn.onclick = ()=>{
      $("datePicker").value = dateStr;
      refreshAll();
    };
    wrap.appendChild(btn);
  }
}

function renderMonthAgenda(){
  const wrap = $("monthAgenda");
  wrap.innerHTML = "";

  if(!state.monthBookings.length){
    wrap.innerHTML = '<div class="empty">Tiada tempahan bulan ini.</div>';
    return;
  }

  const sorted = [...state.monthBookings].sort((a,b)=>
    (a.booking_date+a.start_time).localeCompare(b.booking_date+b.start_time)
  );

  const groups = {};
  sorted.forEach(b=>{
    if(!groups[b.booking_date]) groups[b.booking_date] = [];
    groups[b.booking_date].push(b);
  });

  Object.keys(groups).sort().forEach(date=>{
    const group = document.createElement("div");
    group.className = "agenda-group";

    const head = document.createElement("div");
    head.className = "agenda-date";
    head.textContent = fmtDate(date);
    group.appendChild(head);

    groups[date].forEach(b=>{
      const item = document.createElement("div");
      item.className = "agenda-item";
      item.innerHTML = `
        <div>
          <div class="agenda-room">${escapeHtml(b.room_name)}</div>
          <div class="agenda-meta">${escapeHtml(b.teacher_name||"")}${b.class_name?" • "+escapeHtml(b.class_name):""}</div>
        </div>
        <div class="agenda-time">${fmtTime12(b.start_time)}–${fmtTime12(b.end_time)}</div>`;
      group.appendChild(item);
    });

    wrap.appendChild(group);
  });
}

$("calPrevBtn").onclick=()=>{
  const [y,m] = $("datePicker").value.split("-").map(Number);
  $("datePicker").value = new Date(y, m-2, 1).toISOString().slice(0,10);
  refreshAll();
};

$("calNextBtn").onclick=()=>{
  const [y,m] = $("datePicker").value.split("-").map(Number);
  $("datePicker").value = new Date(y, m, 1).toISOString().slice(0,10);
  refreshAll();
};

function roomStatus(roomId){
  const now = new Date();
  const selected = $("datePicker").value;
  const todays = state.bookings.filter(b=>String(b.room_id)===String(roomId) && b.status==="ACTIVE");

  if(selected !== now.toISOString().slice(0,10)){
    if(!todays.length) return {busy:false,text:"Tiada tempahan — Tersedia"};
    return {busy:true,text:`${todays.length} tempahan pada tarikh ini`};
  }

  const hm = now.toTimeString().slice(0,5);
  const active = todays.find(b=>b.start_time<=hm && b.end_time>hm);
  return active ? {busy:true,text:`Digunakan hingga ${fmtTime12(active.end_time)}`} : {busy:false,text:"Kosong sekarang"};
}

function renderRooms(){
  const wrap=$("roomList"); wrap.innerHTML="";
  if(!state.rooms.length){wrap.innerHTML='<div class="empty">Tiada bilik aktif.</div>';return;}
  state.rooms.forEach(r=>{
    const st=roomStatus(r.id);
    const meta=[r.location, r.capacity?`Kapasiti ${r.capacity}`:""] .filter(Boolean).join(" • ");
    const el=document.createElement("div"); el.className="room-card";
    el.innerHTML=`
      <div class="room-main">
        <div class="room-name">${escapeHtml(r.name)}</div>
        ${meta?`<div class="room-meta">${escapeHtml(meta)}</div>`:""}
        <span class="status ${st.busy?"busy":"free"}">${st.busy?"🔴":"🟢"} ${escapeHtml(st.text)}</span>
      </div>
      <button class="book-btn">Tempah</button>`;
    el.querySelector(".book-btn").onclick=()=>openBooking(r);
    wrap.appendChild(el);
  });
}

function renderMyBookings(rows){
  const wrap=$("myBookings"); wrap.innerHTML="";
  const upcoming=rows.filter(x=>x.status==="ACTIVE");
  if(!upcoming.length){wrap.innerHTML='<div class="empty">Belum ada tempahan akan datang.</div>';return;}
  upcoming.forEach(b=>{
    const el=document.createElement("div"); el.className="booking-item";
    el.innerHTML=`
      <div class="booking-top">
        <div>
          <div class="booking-title">${escapeHtml(b.room_name)}</div>
          <div class="booking-detail">${fmtDate(b.booking_date)} • ${fmtTime12(b.start_time)}–${fmtTime12(b.end_time)}</div>
          <div class="booking-detail">${escapeHtml(b.class_name||"")} ${b.purpose?`• ${escapeHtml(b.purpose)}`:""}</div>
        </div>
      </div>
      <button class="cancel-btn">Batalkan</button>`;
    el.querySelector(".cancel-btn").onclick=async()=>{
      if(!confirm("Batalkan tempahan ini?")) return;
      try{ await api("cancelBooking",{bookingId:b.id}); await refreshAll(); }
      catch(err){ alert(err.message); }
    };
    wrap.appendChild(el);
  });
}

function openBooking(room){
  $("roomId").value=room.id;
  $("modalRoomName").textContent=room.name;
  $("bookingDate").value=$("datePicker").value;
  $("startTime").value="08:00"; $("endTime").value="09:00";
  $("className").value=""; $("purpose").value="";
  $("slotInfo").textContent="Sistem akan menyemak pertindihan sebelum menyimpan tempahan.";
  setMsg($("bookingMsg"));
  $("bookingModal").classList.remove("hidden");
}
$("closeModal").onclick=()=> $("bookingModal").classList.add("hidden");
$("bookingModal").addEventListener("click",(e)=>{if(e.target===$("bookingModal"))$("bookingModal").classList.add("hidden")});

$("bookingForm").addEventListener("submit",async(e)=>{
  e.preventDefault();
  const payload={
    roomId:$("roomId").value,
    bookingDate:$("bookingDate").value,
    startTime:$("startTime").value,
    endTime:$("endTime").value,
    className:$("className").value.trim(),
    purpose:$("purpose").value.trim()
  };
  if(payload.startTime>=payload.endTime){setMsg($("bookingMsg"),"Masa tamat mesti selepas masa mula.","error");return;}
  try{
    setMsg($("bookingMsg"),"Menyemak slot...");
    await api("createBooking",payload);
    setMsg($("bookingMsg"),"Tempahan berjaya disimpan.","ok");
    setTimeout(async()=>{$("bookingModal").classList.add("hidden");await refreshAll();},500);
  }catch(err){setMsg($("bookingMsg"),err.message,"error");}
});

$("datePicker").addEventListener("change",refreshAll);
$("refreshBtn").onclick=refreshAll;
$("logoutBtn").onclick=logout;

function clearLocalSession(){
  localStorage.removeItem("booking_auth");
  localStorage.removeItem("booking_user");
  state.auth=null;
  state.user=null;
}

function logout(){
  clearLocalSession();
  showOnly("loginView");
  $("loginForm").reset();
  setMsg($("loginMsg"));
}

function escapeHtml(v=""){
  return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

window.addEventListener("load",()=>{
  if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
  restoreSession();
});
