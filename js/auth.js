// هوية المخدوم المحلية + دور المستخدم. (v6) دخول الخادم/المالك الحقيقي في sync.js (staffLogin) والدور يُشتق من جلسة موثّقة، لا من اختيار يدوي.
// ⚠️ الدور هنا لتحديد الواجهة فقط. الحماية الفعلية = RLS في Supabase (my_role() من app_metadata.role في الـJWT).
import * as db from './db.js';
import * as ACC from './accounts.js';
export const ROLE_LABEL={student:'مخدوم',servant:'خادم',priest:'الكاهن',owner:'مالك'};
export const STAFF=['servant','priest','owner'];
// الدور = دور جلسة الخادم/المالك المحفوظة (kv.staff، تكتبها sync.staffLogin بعد تحقق السيرفر)، وإلا مخدوم.
export async function getRole(){ const s=await db.get('staff'); return s&&STAFF.includes(s.role)?s.role:'student'; }

const AL='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ٣١ حرفاً بلا متشابهات (0/O و1/I/L) → ٣١^٨ ≈ ٨٫٥×١٠¹¹
export const CODE_LEN=8;
// rejection sampling: نرفض القيم ≥ 248 (أكبر مضاعف لـ٣١ تحت ٢٥٦) فلا يحدث تحيّز x%31
export function genCode(){
  const lim=256-(256%AL.length); let out='';
  while(out.length<CODE_LEN){
    const a=new Uint8Array(16); crypto.getRandomValues(a);
    for(const x of a){ if(x<lim&&out.length<CODE_LEN) out+=AL[x%AL.length]; }
  }
  return out;
}
export function normName(s){
  return String(s||'').trim().replace(/\s+/g,' ').replace(/[\u064B-\u0652\u0640]/g,'')
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').toLowerCase();
}
export function normDigits(s){
  return String(s||'').replace(/[\u0660-\u0669]/g,d=>d.charCodeAt(0)-0x660).replace(/[\u06F0-\u06F9]/g,d=>d.charCodeAt(0)-0x6F0);
}
export const normPhone=(s)=>normDigits(s).replace(/[\s\-()]/g,'');
// يوحّد رقم الموبايل المصري إلى 01xxxxxxxxx
export const normPhoneEG=(s)=>{ let p=normPhone(s).replace(/^\+?20/,''); return p.startsWith('0')?p:'0'+p; };
export const normCode=(s)=>normDigits(s).replace(/\s/g,'').toUpperCase();
// القبول: ٨ أحرف للجدد أو ٦ للحسابات القديمة (v5)
export const isCode=(c)=>typeof c==='string'&&(c.length===8||c.length===6);

export async function register(d){
  const p={ id:crypto.randomUUID(), code:genCode(), name:d.name.trim().replace(/\s+/g,' '),
    phone:normPhoneEG(d.phone), grade:d.grade, gender:d.gender, email:(d.email||'').trim(),
    guardianName:(d.guardianName||'').trim().replace(/\s+/g,' '), guardianPhone:(d.guardianPhone||'').trim()?normPhoneEG(d.guardianPhone):'', // v9.2: ولي الأمر اختياري
    createdAt:Date.now(), synced:false };
  await ACC.add(p); ACC.setActive(p.id); // (v9.40) يرمي 'full' لو على الجهاز ٣ حسابات
  // تخزّن المهمة الـid فقط: مصدر الحقيقة الوحيد هو ملف الحساب المحلي وقت الرفع، فلا تبقى نسخة من بيانات الاتصال في الطابور بعد المسح
  const createId=await db.queue({type:'profile.create',profileId:p.id}); // تُرفع في المرحلة ٥
  await db.queue({type:'profile.scrub',profileId:p.id,after:createId}); // لا تُنفَّذ إلا بعد تأكيد السيرفر لـ createId
  return p;
}
// (v9.40) الحساب النشط يحدده accounts.js (sessionStorage)؛ db.get('profile') يقرأ ملف النشط تلقائياً
export async function activeProfile(){
  const id=ACC.activeId(); if(!id) return null;
  const p=await db.get('profile');
  return p&&p.id===id?p:null;
}
export const logout=()=>ACC.clearActive(); // تبديل المخدوم: لا يمسح شيئاً

// sync.js يربط هذه الدالة بالسيرفر (Edge Function): async (name,code)=>profile | null (لا يوجد تطابق) | {error:'locked'|'offline'|'unavailable'}
let remote=null; export const setRemoteRestore=(fn)=>{ remote=fn; };
export async function restore(name,code){
  const c=normCode(code), n=normName(name);
  for(const p of await ACC.allProfiles()){ // الحساب موجود على الجهاز أصلاً: نفتحه (الكود هو المفتاح الرئيسي)
    if(p.code===c && normName(p.name)===n){ ACC.setActive(p.id); return {ok:true,profile:p}; }
  }
  if(ACC.count()>=ACC.MAX) return {ok:false,reason:'full'};
  if(remote){
    if(!isCode(c)||n.length<2) return {ok:false,reason:'mismatch'}; // لا نستهلك محاولة على السيرفر لمدخل غير صالح الشكل
    const r=await remote(name,c);
    if(r&&r.error) return {ok:false,reason:r.error};
    if(r){ if(!ACC.has(r.id)) await ACC.add(r); ACC.setActive(r.id); return {ok:true,profile:r}; }
    return {ok:false,reason:'mismatch'};
  }
  return {ok:false,reason:ACC.count()?'mismatch':'nolocal'};
}
// ⚠️ لا تُستدعى إلا بعد تأكيد السيرفر لاستلام مهمة profile.create رقم createId (المرحلة ٥).
// تمسح بيانات الاتصال محلياً عبر مهمة المسح المرتبطة بها فقط؛ لو لم توجد المهمة لا تمسح شيئاً.
export async function scrubAfterAck(createId,profileId){
  const p=await ACC.profileOf(profileId); if(!p) return false; // (v9.40) حسب صاحب المهمة لا الحساب النشط
  const jobs=(await db.pending()).filter(j=>j.type==='profile.scrub'&&j.after===createId&&j.profileId===p.id);
  if(!jobs.length) return false;
  Object.assign(p,{synced:true,phone:'',email:'',guardianName:'',guardianPhone:''}); await ACC.saveProfile(p);
  for(const j of jobs) await db.unqueue(j.id);
  return true;
}
