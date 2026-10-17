// (v9.22) مواعيد فتح/قفل الإصحاحات للمخدوم + فحص الكود محلياً (Offline-First). الشبكة في sync.js، وهنا المنطق + الكاش فقط.
// الوقت: من ساعة السيرفر لو في نت، وإلا من ساعة الموبايل. الإصحاح اللي ما له ميعاد مفتوح دايماً.
// الكود: السيرفر ينشر بصمة SHA-256 (مع salt) لكل كود؛ الجهاز يخزّنها فقط (kv.accessHashes) ويقارن بها. الكود الخام ما بيوصلش الجهاز.
// الإصحاح اللي اتفتح بكود يفضل مفتوح على الجهاز (kv.accessUnlocked). المحاولات الغلط محلية (kv.code_tries_local): ١٠/ساعة.
// ⚠️ القفل حاجز واجهة: الحدّ المحلي والبصمات بيتخطّوا بمسح بيانات الموقع أو بتجريب الاحتمالات (المحتوى نفسه محلي).
import * as db from './db.js';
import * as SY from './sync.js';
const K=(bid,num)=>bid+'|'+num;
export const MAX_TRIES=10, WINDOW=3600e3;
let map={}, hashes={}, hashesAt=0, unl={}, off=0;
const build=(rows)=>{ const m={}; for(const r of rows||[]){ if(!r||r.book_id==null) continue;
  const o=r.opens_at?Date.parse(r.opens_at):null, c=r.closes_at?Date.parse(r.closes_at):null;
  m[K(r.book_id,r.chapter_num)]={o:Number.isFinite(o)?o:null,c:Number.isFinite(c)?c:null}; } return m; };
const buildH=(rows)=>{ const m={}; for(const r of rows||[]){ if(r&&r.book_id!=null&&r.salt&&r.hash) m[K(r.book_id,r.chapter_num)]={s:String(r.salt),h:String(r.hash),u:r.updated_at||''}; } return m; };
// من الكاش المحلي فقط (سريع، يشتغل أوفلاين)
export async function load(){
  try{ const c=await db.get('accessCache'); if(c&&typeof c==='object') map=c; }catch(e){}
  try{ const h=await db.get('accessHashes'); if(h&&typeof h==='object'){ hashes=h.m||{}; hashesAt=h.at||0; } }catch(e){}
  try{ const u=await db.get('accessUnlocked'); if(u&&typeof u==='object') unl=u; }catch(e){}
}
// من السيرفر (لو فشل جزء نبقي على كاشه). يرجع true لو وصلت بيانات جديدة (مواعيد أو بصمات). استبدال كامل للقايمتين (الإلغاء بيتشال).
export async function refresh(){
  const [rows,hs,sn]=await Promise.all([SY.accessSyncTimes(),SY.accessSyncCodes(),SY.serverNow()]);
  off=sn==null?0:sn-Date.now();
  let got=false;
  if(Array.isArray(rows)){ map=build(rows); got=true; try{ await db.set('accessCache',map); }catch(e){} }
  if(Array.isArray(hs)){ hashes=buildH(hs); hashesAt=Date.now(); got=true; try{ await db.set('accessHashes',{m:hashes,at:hashesAt}); }catch(e){} }
  return got;
}
if(typeof addEventListener==='function') addEventListener('online',()=>{ refresh().catch(()=>{}); });
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

// ===== فحص الكود محلياً =====
export const normCode=(c)=>String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export async function sha256Hex(s){
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export const hashOf=(salt,bid,num,code)=>sha256Hex(`${salt}|${bid}|${num}|${normCode(code)}`);
const recent=async()=>{ let t=[]; try{ t=await db.get('code_tries_local'); }catch(e){} return (Array.isArray(t)?t:[]).filter(x=>Number.isFinite(x)&&Date.now()-x<WINDOW&&x<=Date.now()+60000); };
// يرجع: 'ok' | 'bad' | 'locked' (حدّ المحاولات) | 'nodata' | 'unavailable' (المتصفح ما بيدعمش SHA-256)
export async function verify(bid,num,code){
  const tries=await recent();
  if(tries.length>=MAX_TRIES) return 'locked';
  if(!normCode(code)) return 'bad';
  if(!(typeof crypto!=='undefined'&&crypto.subtle)) return 'unavailable';
  await Promise.race([refresh().catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);
  const h=hashes[K(bid,num)];
  if(!h&&!hashesAt) return 'nodata';
  const ok=!!h&&(await hashOf(h.s,bid,num,code))===h.h;
  if(ok) return 'ok';
  tries.push(Date.now()); try{ await db.set('code_tries_local',tries); }catch(e){}
  return 'bad';
}
