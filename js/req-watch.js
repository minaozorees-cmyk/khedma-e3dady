// (v9.2) مراقبة الطلبات المعلّقة للمالك: polling كل ٦٠ ثانية وقت فتح التطبيق (بلا websocket ولا مكتبات، فيعمل مع الـPWA/الأوفلاين).
// يحدّث الـbadge عبر callback، ويطلّع إشعاراً صغيراً + صوتاً خفيفاً (اختياري: localStorage.reqSound==='1') عند زيادة العدد.
import * as SY from './sync.js';
import {esc} from './consts.js';
const EVERY=60000; let timer=null, last=null, cb=null, busy=false;

async function fetchPending(){
  if(!SY.enabled()||navigator.onLine===false||document.hidden) return null;
  try{
    const r=await SY.staffApi('/rest/v1/requests?select=id,requester_name,requester_contact&status=eq.pending&order=created_at.desc&limit=100');
    return r.ok?await r.json():null;
  }catch(e){ return null; }
}
function beep(){
  try{ if(localStorage.getItem('reqSound')!=='1') return;
    const c=new (window.AudioContext||window.webkitAudioContext)(), o=c.createOscillator(), g=c.createGain();
    o.frequency.value=880; g.gain.value=.05; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime+.18); setTimeout(()=>c.close(),400);
  }catch(e){}
}
function toast(n,who){
  document.getElementById('reqToast')?.remove();
  const t=document.createElement('div'); t.id='reqToast';
  t.style.cssText='position:fixed;z-index:1200;left:12px;right:12px;top:calc(8px + env(safe-area-inset-top));max-width:420px;margin:0 auto;padding:11px 14px;border-radius:14px;cursor:pointer;'+
    'background:linear-gradient(160deg,var(--bg-2),var(--bg-3));border:1px solid var(--gold);color:var(--gold-2);font-weight:700;font-size:.9rem;box-shadow:var(--shadow-md)';
  t.innerHTML=`🔔 طلب جديد${who?': '+esc(who):''} <small style="color:var(--ink-2)">(${n} معلّق)</small>`;
  t.onclick=()=>{ t.remove(); try{ sessionStorage.setItem('ownerTab','r'); }catch(e){}
    if(location.hash==='#/members') dispatchEvent(new Event('lawha:ownertab')); else location.hash='#/members'; };
  document.body.appendChild(t); setTimeout(()=>t.remove(),7000); beep();
}
export async function tick(){
  if(busy) return; busy=true;
  try{
    const rows=await fetchPending(); if(!rows) return;
    const n=rows.length;
    if(last!==null&&n>last) toast(n,rows[0].requester_name||rows[0].requester_contact);
    last=n; if(cb) cb(n);
  } finally{ busy=false; }
}
export function seen(n){ last=n; }   // لما اللوحة نفسها تحمّل العدد، لا نعيد إشعاره
export function start(onCount){ stop(); cb=onCount; tick(); timer=setInterval(tick,EVERY); document.addEventListener('visibilitychange',vis); }
export function stop(){ clearInterval(timer); timer=null; last=null; cb=null; document.removeEventListener('visibilitychange',vis); }
function vis(){ if(!document.hidden) tick(); }
