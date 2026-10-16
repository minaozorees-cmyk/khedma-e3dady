// آية اليوم — كارت صغير تحت شريط التذكيرات، لكل الأدوار بعد الدخول. أوفلاين بالكامل (بلا سيرفر).
import {VERSES} from './votd-data.js';
const K='votd:closed';
const esc=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{ const d=new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); };
const dayOfYear=()=>{ const d=new Date(), s=new Date(d.getFullYear(),0,0); return Math.floor((d-s)/864e5); };
const get=()=>{ try{ return localStorage.getItem(K); }catch(e){ return null; } };
const set=(v)=>{ try{ v?localStorage.setItem(K,v):localStorage.removeItem(K); }catch(e){} };
export const verseOfToday=()=>VERSES.length?VERSES[(dayOfYear()-1)%VERSES.length]:null;

export function showVotd(on){
  const box=document.getElementById('votd'); if(!box) return;
  const v=on?verseOfToday():null;
  if(!v){ box.innerHTML=''; box.hidden=true; return; }
  box.hidden=false;
  const closed=get()===today();
  box.innerHTML=closed
    ?`<button type="button" class="vt-bar" data-v="open" aria-expanded="false">📖 آية اليوم <span>▾</span></button>`
    :`<div class="vt-card"><div class="vt-head"><b>📖 آية اليوم</b><button type="button" data-v="close" aria-label="طي">✕</button></div><p class="vt-t">«${esc(v.t)}»</p><p class="vt-r">${esc(v.r)}</p>${v.m?`<p class="vt-m">${esc(v.m)}</p>`:''}</div>`;
  box.onclick=(e)=>{ const b=e.target.closest('[data-v]'); if(!b) return; set(b.dataset.v==='close'?today():''); showVotd(true); };
}
