// (v9.40) حسابات المخدومين على نفس الجهاز (حتى ٣) + الرقم السري المحلي لكل حساب.
// - قائمة الحسابات في kv.accounts: [{id,name,addedAt,pin:{s,h}|null}]. بيانات كل حساب تحت 'u:<id>:*' (db.js يفصلها تلقائياً).
// - الحساب النشط يعيش في sessionStorage فقط (تبديل = إعادة تحميل الصفحة، فتبدأ كل متغيرات الذاكرة نظيفة).
//   لو على الجهاز حساب واحد يُفتح تلقائياً؛ لو أكثر يظهر اختيار الحساب (+ الرقم السري إن وُجد) عند كل فتح جديد للتطبيق.
// - الرقم السري: ٤ أرقام، يُخزَّن محلياً كـSHA-256 مع salt ولا يُرسل للسيرفر. هو قفل واجهة (يمنع فضول الأخوة)، لا تشفير للبيانات.
import * as db from './db.js';
import {isIOS,askPersist} from './persist.js';   // (v9.493)
export const MAX=3, PIN_TRIES=5, PIN_WAIT=5*60*1000;
const SS='acct_active';
let data={list:[]};

const dg=(s)=>String(s==null?'':s).replace(/[\u0660-\u0669]/g,d=>d.charCodeAt(0)-0x660).replace(/[\u06F0-\u06F9]/g,d=>d.charCodeAt(0)-0x6F0);
const normC=(s)=>dg(s).replace(/\s/g,'').toUpperCase();
export const validPin=(s)=>{ const d=dg(s).trim(); return /^\d{4}$/.test(d)?d:null; };
const hex=(b)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
export const pinSupported=()=>!!(typeof crypto!=='undefined'&&crypto.subtle&&crypto.getRandomValues);
const hashPin=async(salt,id,pin)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${salt}|${id}|${pin}`)));
const find=(id)=>data.list.find(a=>a.id===id);
const save=()=>db.setRaw('accounts',data);

// ===== الهجرة من v9.39 (حساب واحد بمفاتيح عامة) — آمنة للتكرار، والمفاتيح القديمة تبقى نسخة احتياطية لإصدار واحد =====
async function migrate(){
  if(await db.getRaw('acctMig')) return;
  const old=await db.getRaw('profile');
  if(old&&old.id){
    const d=(await db.getRaw('accounts'))||{list:[]}; if(!Array.isArray(d.list)) d.list=[];
    if(!d.list.some(a=>a.id===old.id)){ d.list.push({id:old.id,name:old.name,addedAt:old.createdAt||Date.now(),pin:null}); await db.setRaw('accounts',d); }
    const ks=[...db.PERSONAL_KEYS,...(await db.keys()).filter(k=>typeof k==='string'&&/^lastOpen_/.test(k))];
    for(const k of ks){ const v=await db.getRaw(k); if(v!==undefined&&(await db.getAt(old.id,k))===undefined) await db.setAt(old.id,k,v); }
    // نتائج قديمة بلا هوية صاحبها (قبل v4) كانت تُعدّ للحساب الوحيد؛ نثبّتها له كي لا تظهر لحسابات أخرى
    const R=await db.getRaw('results');
    if(R&&Array.isArray(R.attempts)&&R.attempts.some(a=>!a.profileId||a.profileId==='local')){
      R.attempts=R.attempts.map(a=>(!a.profileId||a.profileId==='local')?{...a,profileId:old.id}:a); await db.setRaw('results',R);
    }
  }
  await db.setRaw('acctMig',1);
}
function pick(){
  let v=null; try{ v=sessionStorage.getItem(SS); }catch(e){}
  if(v==='') return null;                               // تبديل صريح: شاشة الاختيار
  if(v&&find(v)) return v;
  return data.list.length===1?data.list[0].id:null;      // حساب واحد = دخول تلقائي
}
export async function init(){
  try{ await migrate(); }catch(e){}                      // لو فشلت تُعاد في الفتح التالي (idempotent)
  const d=await db.getRaw('accounts'); data=d&&Array.isArray(d.list)?d:{list:[]};
  db.setScope(pick());
  if(isIOS()) askPersist();   // (v9.493) آيفون: اطلب تخزين دائم كل فتح (بدون نافذة على iOS)
}

export const list=()=>data.list.map(a=>({id:a.id,name:a.name,locked:!!a.pin}));
export const count=()=>data.list.length;
export const has=(id)=>!!find(id);
export const hasPin=(id)=>!!(find(id)&&find(id).pin);
export const activeId=()=>db.getScope()||null;
export function setActive(id){ try{ sessionStorage.setItem(SS,id); }catch(e){} db.setScope(id); }
export function clearActive(){ try{ sessionStorage.setItem(SS,''); }catch(e){} db.setScope(''); }

export const profileOf=(id)=>db.getAt(id,'profile');
export const saveProfile=(p)=>db.setAt(p.id,'profile',p);
export async function allProfiles(){ const o=[]; for(const a of data.list){ const p=await profileOf(a.id); if(p) o.push(p); } return o; }
export async function add(p){
  if(find(p.id)) return;
  if(data.list.length>=MAX) throw new Error('full');
  await db.setAt(p.id,'profile',p);
  data.list.push({id:p.id,name:p.name,addedAt:Date.now(),pin:null}); await save();
}

// ===== الرقم السري =====
export async function setPin(id,pin){
  const a=find(id), d=validPin(pin); if(!a||!d||!pinSupported()) return false;
  const s=hex(crypto.getRandomValues(new Uint8Array(8)));
  a.pin={s,h:await hashPin(s,id,d)}; await save();
  const F=(await db.getRaw('pinFails'))||{}; if(F[id]){ delete F[id]; await db.setRaw('pinFails',F); }
  return true;
}
export async function clearPin(id){ const a=find(id); if(a){ a.pin=null; await save(); } }
// يرجع {ok:true} | {ok:false,left} | {ok:false,locked:true,ms}
export async function verifyPin(id,pin){
  const a=find(id); if(!a||!a.pin) return {ok:true};
  const F=(await db.getRaw('pinFails'))||{}, f=F[id]||{n:0,until:0};
  if(f.until>Date.now()) return {ok:false,locked:true,ms:f.until-Date.now()};
  const d=validPin(pin);
  if(d&&(await hashPin(a.pin.s,id,d))===a.pin.h){ if(F[id]){ delete F[id]; await db.setRaw('pinFails',F); } return {ok:true}; }
  f.n=(f.n||0)+1; let locked=false;
  if(f.n>=PIN_TRIES){ f.until=Date.now()+PIN_WAIT; f.n=0; locked=true; }
  F[id]=f; await db.setRaw('pinFails',F);
  return locked?{ok:false,locked:true,ms:PIN_WAIT}:{ok:false,left:PIN_TRIES-f.n};
}
// نسيان الرقم: كود الاسترجاع المحفوظ محلياً يفتح تعيين رقم جديد (بلا سيرفر)
export async function verifyCode(id,code){ const p=await profileOf(id); return !!(p&&p.code&&normC(code)===String(p.code).toUpperCase()); }

// ===== إزالة حساب من الجهاز =====
// ترفض لو له مهام غير مرفوعة (تضيع بياناته). تمسح مفاتيحه، ونسخ v9.39 القديمة إن كانت له، ونتائجه المحلية.
export async function remove(id){
  if(!find(id)) return {ok:true};
  const jobs=(await db.pending()).filter(j=>j.profileId===id);
  if(jobs.length) return {ok:false,reason:'pending',n:jobs.length};
  for(const k of await db.keys()) if(typeof k==='string'&&k.startsWith('u:'+id+':')) await db.delRaw(k);
  const lp=await db.getRaw('profile');
  if(lp&&lp.id===id){ for(const k of [...db.PERSONAL_KEYS,...(await db.keys()).filter(k=>typeof k==='string'&&/^lastOpen_/.test(k))]) await db.delRaw(k); }
  const R=await db.getRaw('results');
  if(R&&Array.isArray(R.attempts)){ R.attempts=R.attempts.filter(a=>a.profileId!==id); await db.setRaw('results',R); }
  const F=(await db.getRaw('pinFails'))||{}; if(F[id]){ delete F[id]; await db.setRaw('pinFails',F); }
  data.list=data.list.filter(a=>a.id!==id); await save();
  clearActive();
  return {ok:true};
}
