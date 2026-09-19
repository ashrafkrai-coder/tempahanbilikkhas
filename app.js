const state = {
  credential: localStorage.getItem("booking_google_credential") || "",
  user: JSON.parse(localStorage.getItem("booking_user") || "null"),
  pendingProfile: null,
  rooms: [],
  bookings: []
};

const $ = (id) => document.getElementById(id);
const fmtDate = (d) => new Intl.DateTimeFormat("ms-MY",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(d+"T00:00:00"));
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
    body:JSON.stringify({action, credential: state.credential, ...payload})
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
  ["loginView","registerView","appView"].forEach(id=>$(id).classList.toggle("hidden", id!==viewId));
}

function initGoogleLogin(){
  const cid = window.APP_CONFIG?.GOOGLE_CLIENT_ID;
  if(!cid || cid.includes("PASTE_")) {
    setMsg($("loginMsg"),"Tetapkan GOOGLE_CLIENT_ID dalam config.js dahulu.","error");
    return;
  }
  google.accounts.id.initialize({
    client_id: cid,
    callback: handleCredentialResponse,
    auto_select: false
  });
  $("googleBtn").innerHTML="";
  google.accounts.id.renderButton($("googleBtn"), {theme:"outline",size:"large",shape:"pill",text:"signin_with"});
}

async function handleCredentialResponse(resp){
  try{
    state.credential = resp.credential;
    localStorage.setItem("booking_google_credential", state.credential);
    const data = await api("login");

    if(data.needsRegistration){
      showRegistration(data.profile || {});
      return;
    }

    state.user = data.user;
    localStorage.setItem("booking_user", JSON.stringify(state.user));
    await enterApp();
  }catch(err){
    clearLocalSession(false);
    setMsg($("loginMsg"),err.message,"error");
  }
}

function showRegistration(profile){
  state.pendingProfile = profile || {};
  $("registerEmail").value = state.pendingProfile.email || "";
  $("registerName").value = state.pendingProfile.name || "";
  setMsg($("registerMsg"));
  showOnly("registerView");
}

$("registerForm").addEventListener("submit", async(e)=>{
  e.preventDefault();
  const name = $("registerName").value.trim();
  if(name.length < 3){
    setMsg($("registerMsg"),"Sila masukkan nama penuh guru.","error");
    return;
  }

  try{
    setMsg($("registerMsg"),"Mendaftarkan guru...");
    const data = await api("register", {name});
    state.user = data.user;
    state.pendingProfile = null;
    localStorage.setItem("booking_user", JSON.stringify(state.user));
    setMsg($("registerMsg"),"Pendaftaran berjaya.","ok");
    await enterApp();
  }catch(err){
    setMsg($("registerMsg"),err.message,"error");
  }
});

$("changeAccountBtn").onclick=()=>logout();

async function enterApp(){
  if(!state.user) throw new Error("Profil guru tidak dijumpai.");
  showOnly("appView");
  $("teacherName").textContent=state.user?.name || "-";
  $("teacherEmail").textContent=state.user?.email || "";
  await refreshAll();
}

async function restoreSession(){
  if(!state.credential) {
    showOnly("loginView");
    initGoogleLogin();
    return;
  }

  try{
    const data = await api("login");
    if(data.needsRegistration){
      state.user=null;
      localStorage.removeItem("booking_user");
      showRegistration(data.profile || {});
      return;
    }
    state.user=data.user;
    localStorage.setItem("booking_user", JSON.stringify(state.user));
    await enterApp();
  }catch(err){
    clearLocalSession(false);
    showOnly("loginView");
    initGoogleLogin();
    setMsg($("loginMsg"),"Sesi tamat. Sila log masuk semula.","error");
  }
}

async function refreshAll(){
  try{
    const date=$("datePicker").value;
    const [roomsRes,myRes,schedRes]=await Promise.all([
      api("getRooms"),
      api("myBookings"),
      api("getBookings",{date})
    ]);
    state.rooms=roomsRes.rooms||[];
    state.bookings=schedRes.bookings||[];
    renderRooms();
    renderMyBookings(myRes.bookings||[]);
  }catch(err){
    alert(err.message);
    if(/login|token|akaun|credential|daftar/i.test(err.message)) logout();
  }
}

function roomStatus(roomId){
  const now = new Date();
  const selected = $("datePicker").value;
  const todays = state.bookings.filter(b=>String(b.room_id)===String(roomId) && b.status==="ACTIVE");
  if(selected !== now.toISOString().slice(0,10)) return {busy:false,text:`${todays.length} tempahan`};
  const hm = now.toTimeString().slice(0,5);
  const active = todays.find(b=>b.start_time<=hm && b.end_time>hm);
  return active ? {busy:true,text:`Digunakan hingga ${active.end_time}`} : {busy:false,text:"Kosong sekarang"};
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
          <div class="booking-detail">${fmtDate(b.booking_date)} • ${b.start_time}–${b.end_time}</div>
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

function clearLocalSession(clearCredential=true){
  if(clearCredential) localStorage.removeItem("booking_google_credential");
  localStorage.removeItem("booking_user");
  if(clearCredential) state.credential="";
  state.user=null;
  state.pendingProfile=null;
}

function logout(){
  clearLocalSession(true);
  google?.accounts?.id?.disableAutoSelect?.();
  showOnly("loginView");
  $("googleBtn").innerHTML="";
  setMsg($("loginMsg"));
  initGoogleLogin();
}

function escapeHtml(v=""){
  return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

window.addEventListener("load",()=>{
  if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
  const wait=()=>{
    if(window.google?.accounts?.id) restoreSession();
    else setTimeout(wait,150);
  };
  wait();
});
