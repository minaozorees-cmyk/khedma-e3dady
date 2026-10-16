// يبني القائمة من modules/registry.json حسب الدور، ويفتح الوحدة عبر hash (#/id)
// (v9.2) الدور يُقرأ من JWT (kv.staff) فقط؛ شاشة الدخول موحّدة بلا اختيار دور؛ التوجيه بعد الدخول حسب الدور.
import {getRole,activeProfile} from './auth.js';
import * as db from './db.js';
import {showGate} from './register.js';
import {collect,notifyLocal} from './reminders.js';
import * as SY from './sync.js';
import {showLogin,showForgot} from './login.js';
import {setSection,setNavVisible} from './ui.js';
import {showVotd} from './votd.js';
import * as RW from './req-watch.js';
import * as IB from './inbox.js';
const $=(s)=>document.querySelector(s);
let mods=[], role='student', dismissed=new Set(), notified=false, pending=0, unread=0, curId='';
const LAND={servant:'board',priest:'board',owner:'members'};   // الصفحة الأولى بعد الدخول (لو غير موجودة نرجع لأول تبويب متاح)
const ar=(n)=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
async function refreshReminders(){
  const box=$('#remind'); if(!box) return;
  if(role!=='student'||!(await activeProfile())){ box.innerHTML=''; return; }
  const list=(await collect()).filter(r=>!dismissed.has(r.id));
  box.innerHTML=list.map(r=>`<div class="rm" data-go="${r.module}"><span>🔔 ${r.text}</span><button data-x="${r.id}" aria-label="إغلاق">✕</button></div>`).join('');
  if(!notified&&list.length){ notified=true; notifyLocal(list); }
}

async function loadRegistry(){
  try{ return (await (await fetch('modules/registry.json')).json()).modules||[]; }
  catch(e){ return []; }
}
function visible(){ return mods.filter(m=>m.enabled && m.roles.includes(role)); }
function land(){ const v=visible(), t=v.find(x=>x.id===LAND[role]); return (t||v[0]||{}).id||''; }
function markActive(){ document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.dataset.id===curId)); }

function buildNav(){
  const v=visible();
  $('nav').innerHTML=v.map(m=>`<a href="#/${m.id}" data-id="${m.id}"><span class="i">${m.icon}</span>${m.title}${(()=>{ const n=m.id==='members'?pending:(m.id==='messages'&&role==='student'?unread:0); return n>0?` (${ar(n)})`:''; })()}</a>`).join('');
  markActive();
  return v;
}
// شاشة الدخول الموحّدة. hasProfile=true: الجهاز عليه ملف مخدوم، فنخفي أزرار "حساب جديد/عندي كود".
function renderLogin(hasProfile){
  const main=$('main'); main.onclick=main.onchange=main.oninput=null;
  setNavVisible(false); showVotd(false); setSection('دخول');
  showLogin(main,{
    students:!hasProfile,
    onForgot:()=>{ setSection('نسيت كلمة السر'); showForgot(main,{onBack:()=>renderLogin(hasProfile)}); },
    onNew:()=>openGate('n'), onCode:()=>openGate('r'),
    onCancel:hasProfile?()=>{ setNavVisible(true); route(); }:null
  });
}
function openGate(initial){
  showVotd(false); setSection('حساب جديد');
  showGate($('main'),()=>{ buildNav(); const v=visible(); history.replaceState(null,'','#/'+(v[0]?v[0].id:'')); route(); },{initial,onBack:()=>renderLogin(false)});
}
async function forcePw(){
  const main=$('main'); main.onclick=main.onchange=main.oninput=null;
  setNavVisible(false); showVotd(false); setSection('تغيير كلمة السر'); main.innerHTML='';
  try{ const mod=await import('../modules/account/index.js'); await mod.mount(main,{forced:true,onDone:()=>route()}); }
  catch(e){ main.innerHTML='<div class="ph">تعذّر تحميل الصفحة.</div>'; }
}
async function route(){
  refreshReminders();
  if(role==='student' && !(await activeProfile())){ renderLogin(false); return; }
  if(role!=='student'){ const st=await db.get('staff'); if(st&&st.mustChange){ forcePw(); return; } }   // كلمة سر مؤقتة ⇒ تغيير إجباري
  setNavVisible(true); showVotd(true);
  const v=visible(), id=location.hash.replace('#/','')||land();
  const m=v.find(x=>x.id===id)||v[0], main=$('main');
  main.onclick=main.onchange=main.oninput=null; // لا تبقى معالجات وحدة سابقة
  curId=m?m.id:''; markActive();
  if(!m){ setSection(''); main.innerHTML='<div class="ph">لا توجد تبويبات متاحة.</div>'; return; }
  setSection(m.icon+' '+m.title);
  if(m.type==='page'){ main.innerHTML=''; const f=document.createElement('iframe'); f.src=m.entry; main.appendChild(f); return; }
  main.innerHTML='';
  try{ const mod=await import('../'+m.entry); await mod.mount(main,{role}); }
  catch(e){ main.innerHTML='<div class="ph">تعذّر تحميل الوحدة.</div>'; }
}
// الزر العلوي: "دخول" أو "خروج" فقط (بلا ذكر الدور). الدور يُشتق من جلسة موثّقة (kv.staff) لا من اختيار يدوي.
function paintRoleBtn(){ const b=$('#roleBtn'); if(!b) return; b.textContent=role==='student'?'دخول':'خروج'; b.style.display=SY.enabled()||role!=='student'?'':'none'; }
function setPending(n){ n=Number(n)||0; if(n===pending) return; pending=n; buildNav(); }
function setUnread(n){ n=Number(n)||0; if(n===unread) return; unread=n; buildNav(); }
function watch(){
  if(role==='owner'){ RW.start(setPending); } else { RW.stop(); if(pending){ pending=0; } }
  if(role==='student'){ IB.start(setUnread); } else { IB.stop(); unread=0; }   // v9.5: رسائل المخدوم
}
async function applyRole(){ role=await getRole(); paintRoleBtn(); watch(); buildNav(); history.replaceState(null,'','#/'+land()); route(); }
export async function start(){
  role=await getRole(); mods=await loadRegistry(); db_cleanup();
  const btn=$('#roleBtn'); paintRoleBtn();
  btn.onclick=async()=>{
    if(role!=='student'){ await SY.staffLogout(); return; }  // staffLogout يطلق lawha:role فيُعاد بناء الواجهة
    renderLogin(!!(await activeProfile()));
  };
  addEventListener('lawha:role',applyRole); // بعد دخول/خروج أو سحب الدور من الحساب
  addEventListener('lawha:unread',(e)=>setUnread(e.detail));
  addEventListener('lawha:reqcount',(e)=>{ RW.seen(e.detail); setPending(e.detail); }); // اللوحة نفسها حمّلت العدد
  watch(); buildNav(); addEventListener('hashchange',route); addEventListener('lawha:data',refreshReminders);
  $('#remind').onclick=(e)=>{ const x=e.target.closest('[data-x]'); if(x){ dismissed.add(x.dataset.x); refreshReminders(); return; } const g=e.target.closest('[data-go]'); if(g) location.hash='#/'+g.dataset.go; };
  route();
  SY.init(); if(role==='student') SY.logSession(); // المزامنة (تتوقف تلقائياً لو config.js فاضي)
  if(navigator.onLine) setTimeout(()=>import('./books.js').then(m=>m.prefetch()),1500);
}
// مفتاح role القديم (منتقي v5 التجريبي) لم يعد له أثر
function db_cleanup(){ db.del('role').catch(()=>{}); }
