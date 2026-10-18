// آية اليوم — كارت يظهر ٥ ثواني بعد الدخول ثم يتطوي لشريط رفيع (وفيه ✕). لكل الأدوار. أوفلاين (الآيات المضافة تُخزَّن على الجهاز).
import {VERSES} from './votd-data.js';
import * as db from './db.js';
import * as SY from './sync.js';
const MS=5000, CACHE='votd:extra';
const esc=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayOfYear=()=>{ const d=new Date(), s=new Date(d.getFullYear(),0,0); return Math.floor((d-s)/864e5); };
let started=false, open=false, timer=null, guard=null, openedAt=0, extra=[];
const list=()=>VERSES.concat(extra);
export const verseOfToday=()=>{ const l=list(); return l.length?l[(dayOfYear()-1)%l.length]:null; };

function render(){
  const box=document.getElementById('votd'); if(!box) return;
  const v=verseOfToday(); if(!v){ box.innerHTML=''; box.hidden=true; return; }
  box.hidden=false;
  box.innerHTML=open
    ?`<div class="vt-card"><div class="vt-head"><b>📖 آية اليوم</b><button type="button" data-v="close" aria-label="طي">✕</button></div><p class="vt-t">«${esc(v.t||v.text)}»</p><p class="vt-r">${esc(v.r||v.ref)}</p>${(v.m||v.note)?`<p class="vt-m">${esc(v.m||v.note)}</p>`:''}</div>`
    :`<button type="button" class="vt-bar" data-v="open" aria-expanded="false">📖 آية اليوم <span>▾</span></button>`;
  box.onclick=(e)=>{ const b=e.target.closest('[data-v]'); if(!b) return; if(b.dataset.v==='open') openCard(); else closeCard(); };
}
function stopGuard(){ clearInterval(guard); guard=null; }
function closeCard(){ clearTimeout(timer); stopGuard(); open=false; render(); }
function openCard(){
  clearTimeout(timer); stopGuard(); open=true; openedAt=Date.now(); render(); timer=setTimeout(closeCard,MS);
  guard=setInterval(()=>{ if(open&&Date.now()-openedAt>=MS) closeCard(); },1000);   // احتياط: لو التايمر اتأخر/اتجمّد (خلفية، توفير طاقة)
}
// أي رجوع للتطبيق أو تنقّل بعد انتهاء المدة = يتطوي فوراً
const late=()=>{ if(open&&Date.now()-openedAt>=MS) closeCard(); };
document.addEventListener('visibilitychange',late); addEventListener('hashchange',late); addEventListener('focus',late); addEventListener('pageshow',late);

async function refreshExtra(){   // من السيرفر لو في نت، ونحتفظ بنسخة على الجهاز
  try{
    const r=await SY.votdList();
    if(Array.isArray(r)){ extra=r.filter(x=>x&&x.ref&&x.text).map(x=>({r:x.ref,t:x.text,m:x.note||''})); await db.set(CACHE,extra); if(started) render(); }
  }catch(e){}
}

export function showVotd(on){
  const box=document.getElementById('votd'); if(!box) return;
  if(!on){ clearTimeout(timer); stopGuard(); started=false; open=false; box.innerHTML=''; box.hidden=true; return; }
  if(started){ late(); if(!open||Date.now()-openedAt<MS) render(); return; }
  started=true;
  Promise.resolve(db.get(CACHE)).catch(()=>null).then((c)=>{ if(!started) return; if(Array.isArray(c)) extra=c; openCard(); refreshExtra(); });
}
