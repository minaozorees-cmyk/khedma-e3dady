// (v9.5) صندوق رسائل المخدوم: كاش محلي (يشتغل أوفلاين) + polling كل دقيقتين وقت ظهور التطبيق + إشعار صغير للرسائل الجديدة.
// التعليم كمقروء يتخزّن محلياً فوراً ويتبعت بمهمة 'messages.read' في الطابور (تتبعت أوتوماتيك لما النت يرجع).
import * as db from './db.js';
import * as SY from './sync.js';
import * as A from './auth.js';
import {esc} from './consts.js';
const EVERY=120000; let timer=null, cb=null, busy=false;
const emptyBox=()=>({at:0,list:[],read:{}});
export const cached=async()=>(await db.get('inbox'))||emptyBox();
export const countUnread=(c)=>c.list.filter(m=>!m.is_read).length;

export async function refresh(){
  const p=await A.activeProfile(); if(!p) return null;
  const old=await cached(), fresh=await SY.inboxFetch(p.id);
  if(!fresh) return {...old,fromCache:true};
  const read=old.read||{}, seen=new Set(old.list.map(m=>m.id));
  const list=fresh.map(m=>({...m,is_read:!!(m.is_read||read[m.id])}));
  const box={at:Date.now(),list,read};
  await db.set('inbox',box);
  return {...box,fromCache:false,added:list.filter(m=>!seen.has(m.id)&&!m.is_read)};
}
export async function markRead(ids){
  const p=await A.activeProfile(); if(!p||!ids.length) return;
  const c=await cached(); ids.forEach(id=>{ c.read[id]=1; });
  c.list=c.list.map(m=>ids.includes(m.id)?{...m,is_read:true}:m);
  await db.set('inbox',c);
  await db.queue({type:'messages.read',profileId:p.id,ids});
  dispatchEvent(new CustomEvent('lawha:unread',{detail:countUnread(c)}));
}
function toast(n,urgent){
  document.getElementById('inboxToast')?.remove();
  const t=document.createElement('div'); t.id='inboxToast';
  t.style.cssText='position:fixed;z-index:1200;left:12px;right:12px;top:calc(8px + env(safe-area-inset-top));max-width:420px;margin:0 auto;padding:11px 14px;border-radius:14px;cursor:pointer;'+
    'background:linear-gradient(160deg,var(--bg-2),var(--bg-3));border:1px solid '+(urgent?'var(--rust)':'var(--gold)')+';color:var(--gold-2);font-weight:700;font-size:.9rem;box-shadow:var(--shadow-md)';
  t.innerHTML=`${urgent?'🔴':'💬'} ${esc(n===1?'رسالة جديدة':n+' رسائل جديدة')}`;
  t.onclick=()=>{ t.remove(); location.hash='#/messages'; };
  document.body.appendChild(t); setTimeout(()=>t.remove(),7000);
}
async function tick(){
  if(busy||document.hidden) return; busy=true;
  try{
    const r=await refresh(); if(!r) return;
    if(r.added&&r.added.length&&location.hash!=='#/messages') toast(r.added.length,r.added.some(m=>m.urgent));
    if(cb) cb(countUnread(r));
  } finally{ busy=false; }
}
export async function start(onCount){
  stop(); cb=onCount;
  const c=await cached(); if(cb) cb(countUnread(c));    // الرقم من الكاش فوراً (أوفلاين)
  tick(); timer=setInterval(tick,EVERY);
  document.addEventListener('visibilitychange',vis); addEventListener('online',tick);
}
export function stop(){ clearInterval(timer); timer=null; cb=null; document.removeEventListener('visibilitychange',vis); removeEventListener('online',tick); }
function vis(){ if(!document.hidden) tick(); }
