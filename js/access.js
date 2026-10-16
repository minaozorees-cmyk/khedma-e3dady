// (v9.21) مواعيد فتح/قفل الإصحاحات للمخدوم. الشبكة في sync.js، وهنا المنطق + الكاش فقط.
// الوقت: من ساعة السيرفر لو في نت، وإلا من ساعة الموبايل. الإصحاح اللي ما له ميعاد مفتوح دايماً.
// الإصحاح اللي اتفتح بكود يفضل مفتوح على الجهاز (kv.accessUnlocked) حتى بعد وقت القفل.
import * as db from './db.js';
import * as SY from './sync.js';
const K=(bid,num)=>bid+'|'+num;
let map={}, unl={}, off=0;
const build=(rows)=>{ const m={}; for(const r of rows||[]){ if(!r||r.book_id==null) continue;
  const o=r.opens_at?Date.parse(r.opens_at):null, c=r.closes_at?Date.parse(r.closes_at):null;
  m[K(r.book_id,r.chapter_num)]={o:Number.isFinite(o)?o:null,c:Number.isFinite(c)?c:null}; } return m; };
// من الكاش المحلي فقط (سريع، يشتغل أوفلاين)
export async function load(){
  try{ const c=await db.get('accessCache'); if(c&&typeof c==='object') map=c; }catch(e){}
  try{ const u=await db.get('accessUnlocked'); if(u&&typeof u==='object') unl=u; }catch(e){}
}
// من السيرفر (لو فشل نبقي على الكاش). يرجع true لو جاب بيانات جديدة.
export async function refresh(){
  const [rows,sn]=await Promise.all([SY.accessList(),SY.serverNow()]);
  off=sn==null?0:sn-Date.now();
  if(!Array.isArray(rows)) return false;
  map=build(rows); try{ await db.set('accessCache',map); }catch(e){}
  return true;
}
export const now=()=>Date.now()+off;
// null = مفتوح، وإلا {why:'before'|'after', at:وقت الفتح أو القفل بالمللي ثانية}
export function lock(bid,num){
  if(unl[K(bid,num)]) return null;
  const a=map[K(bid,num)]; if(!a) return null;
  const t=now();
  if(a.o!=null&&t<a.o) return {why:'before',at:a.o};
  if(a.c!=null&&t>=a.c) return {why:'after',at:a.c};
  return null;
}
export const isLocked=(bid,num)=>!!lock(bid,num);
export async function markUnlocked(bid,num){ unl[K(bid,num)]=Date.now(); try{ await db.set('accessUnlocked',unl); }catch(e){} }
