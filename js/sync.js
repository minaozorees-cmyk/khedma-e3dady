// طبقة المزامنة (المرحلة ٥): تقرأ الطابور (outbox) وترسل لـSupabase عبر REST بـfetch فقط (بلا مكتبات/CDN).
// معزولة تماماً: تغيير الخدمة = استبدال هذا الملف (+ config.js). كل مهمة idempotent (id ثابت + ON CONFLICT DO NOTHING).
// المخدوم يدخل Supabase كمستخدم مجهول (anonymous auth)، والملكية تُربط بـauth.uid().
// (v6) الخادم/المالك: email+password حقيقي → JWT فيه app_metadata.role (staffLogin). الاسترجاع عبر Edge Function "restore" فقط.
import * as db from './db.js';
import {FN} from './functions.js';
import * as A from './auth.js';
import * as ACC from './accounts.js';
import {SUPABASE_URL as BASE,SUPABASE_ANON_KEY as KEY} from './config.js';

export const enabled=()=>!!(BASE&&KEY);
const MAX_TRIES=6;
let running=false, timer=null, delay=0;

class E extends Error{ constructor(status,code,msg){ super(msg||('HTTP '+status)); this.status=status; this.code=code; } }
// أخطاء مؤقتة: نوقف الجولة ونعيد المحاولة لاحقاً بدون عدّ محاولة فاشلة (نت، سيرفر، 401، أو الأب لم يُرفع بعد)
const transient=(e)=>!e.status||e.status>=500||[401,408,429].includes(e.status)||e.code==='23503';

// ===== المصادقة المجهولة =====
const pack=(j,old)=>({access:j.access_token,refresh:j.refresh_token,exp:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600),uid:(j.user&&j.user.id)||(old&&old.uid)});
async function token(force){
  let a=await db.get('sbAuth');
  if(a&&!force&&a.exp-60>Date.now()/1000) return a;
  if(a&&a.refresh){
    const r=await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:a.refresh})});
    if(r.ok){ a={...pack(await r.json(),a),fresh:false}; await db.set('sbAuth',a); return a; }
    if(r.status>=500||r.status===429) throw new E(r.status);
  }
  const r=await fetch(BASE+'/auth/v1/signup',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:'{}'}); // مستخدم مجهول جديد
  if(!r.ok) throw new E(r.status);
  a={...pack(await r.json()),fresh:true}; await db.set('sbAuth',a); return a;
}
async function api(path,{method='GET',body,prefer}={}){
  const go=(a)=>fetch(BASE+path,{method,headers:{apikey:KEY,Authorization:'Bearer '+a.access,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},body:body==null?undefined:JSON.stringify(body)});
  let r=await go(await token());
  if(r.status===401) r=await go(await token(true));
  return r;
}
async function fail(r){ let j={}; try{ j=await r.json(); }catch(e){} return new E(r.status,j.code,j.message); }
// إدخال idempotent: التكرار على نفس الـid يُتجاهل (لا خطأ)
async function insert(table,row){
  const r=await api(`/rest/v1/${table}?on_conflict=id`,{method:'POST',body:row,prefer:'resolution=ignore-duplicates,return=minimal'});
  if(!r.ok) throw await fail(r);
}
// بعد استرجاع الحساب على جهاز جديد قد يكون الجهاز فقد ربط الملكية → ندّعي الملف بالكود
async function ensureClaim(){
  const a=await token(); if(!a.fresh) return;
  for(const p of await ACC.allProfiles()){ // (v9.40) كل حسابات الجهاز لازم تتبع نفس الهوية المجهولة
    if(p&&p.code){ const r=await api('/rest/v1/rpc/claim_profile',{method:'POST',body:{p_id:p.id,p_code:p.code}}); if(!r.ok) throw await fail(r); }
  }
  a.fresh=false; await db.set('sbAuth',a);
}

// ===== معالجات المهام =====
const rankOf=(atts,a)=>atts.filter(x=>x.bookId===a.bookId&&x.chapterNum===a.chapterNum).sort((x,y)=>x.at-y.at).findIndex(x=>x.id===a.id)+1;
async function scrubLocal(p){ Object.assign(p,{synced:true,phone:'',email:'',guardianName:'',guardianPhone:''}); await ACC.saveProfile(p); }
const H={
  async 'profile.create'(j){
    const p=await ACC.profileOf(j.profileId); if(!p) return 'drop'; // (v9.40) حسب صاحب المهمة، لا الحساب النشط
    if(p.synced) return 'done';
    await insert('profiles',{id:p.id,code:p.code,name:p.name,name_norm:A.normName(p.name),phone:p.phone,grade:p.grade,gender:p.gender,
      email:p.email||null,guardian_name:p.guardianName||null,guardian_phone:p.guardianPhone||null,created_at:new Date(p.createdAt).toISOString()});
    // تأكيد السيرفر وصل → فقط الآن تُنفَّذ مهمة المسح المرتبطة (auth.scrubAfterAck تتحقق من after===j.id)
    if(!(await A.scrubAfterAck(j.id,j.profileId))){ const q=await ACC.profileOf(j.profileId); if(q) await ACC.saveProfile({...q,synced:true}); }
    return 'done';
  },
  async 'profile.scrub'(j){
    // المسح الطبيعي يتم داخل scrubAfterAck. هنا حالة السباق فقط: وصل التأكيد قبل إضافة مهمة المسح.
    const p=await ACC.profileOf(j.profileId); if(p&&p.synced) await scrubLocal(p);
    const waiting=(await db.pending()).some(x=>x.id===j.after);
    return waiting?'skip':'done'; // لو مهمة الرفع لم تُؤكد بعد لا نمسح أبداً
  },
  async 'messages.read'(j){ // v9.5: تعليم رسائل كمقروءة (idempotent)
    const r=await api('/rest/v1/rpc/mark_read',{method:'POST',body:{p_profile:j.profileId,p_ids:j.ids}}); if(!r.ok) throw await fail(r); return 'done';
  },
  async 'result.create'(j){
    const R=(await db.get('results'))||{attempts:[]}, a=R.attempts.find(x=>x.id===j.attemptId); if(!a) return 'drop';
    const SA=(await db.get('syncedAttempts'))||{}; if(SA[a.id]) return 'done';
    const row={id:a.id,profile_id:j.profileId,book_id:a.bookId,chapter_num:a.chapterNum,attempt_no:j.attemptNo||a.attemptNo||rankOf(R.attempts,a),
      score:a.score,total:a.total,source:a.source||'finish',answered:a.answered,duration_sec:a.durationSec==null?null:a.durationSec,attempted_at:new Date(a.at).toISOString()};
    // v9.12: لو عمود duration_sec لم يُضف على السيرفر بعد (PGRST204) نرفع النتيجة بدونه بدل ما تفشل
    const ins=async()=>{ try{ await insert('results',row); }catch(e){ if(e.code!=='PGRST204'||!('duration_sec' in row)) throw e; delete row.duration_sec; await insert('results',row); } };
    try{ await ins(); }
    catch(e){
      if(e.code!=='23505') throw e; // تعارض على (profile,book,chapter,attempt_no) = رقم محاولة مستخدم على السيرفر: نأخذ التالي
      const r=await api(`/rest/v1/results?profile_id=eq.${j.profileId}&book_id=eq.${encodeURIComponent(a.bookId)}&chapter_num=eq.${a.chapterNum}&select=attempt_no&order=attempt_no.desc&limit=1`);
      if(!r.ok) throw await fail(r); const top=(await r.json())[0];
      row.attempt_no=(top?top.attempt_no:0)+1; await ins();
    }
    SA[a.id]=1; await db.set('syncedAttempts',SA); // مفتاح منفصل: sync وحده يكتبه فلا يتعارض مع R.record
    return 'done';
  },
  async 'session.create'(j){ await insert('sessions',{id:j.rid,profile_id:j.profileId,started_at:new Date(j.startedAt).toISOString()}); return 'done'; },
  async 'book_open.create'(j){ await insert('book_opens',{id:j.rid,profile_id:j.profileId,book_id:j.bookId,chapter_num:j.chapterNum,opened_at:new Date(j.openedAt).toISOString()}); return 'done'; }
};

// أي محاولة محلية لا توجد لها مهمة ولم تُرفع (مثلاً انقطع التطبيق بين حفظها وإضافة المهمة) تُضاف للطابور
async function reconcile(p){
  if(!p) return;
  const R=(await db.get('results'))||{attempts:[]}, SA=(await db.get('syncedAttempts'))||{};
  const have=new Set((await db.pending()).filter(j=>j.type==='result.create').map(j=>j.attemptId));
  for(const a of R.attempts){
    if((a.profileId&&a.profileId!==p.id)||SA[a.id]||have.has(a.id)) continue;
    await db.queue({type:'result.create',attemptId:a.id,profileId:p.id,attemptNo:a.attemptNo});
  }
}

// ===== التشغيل =====
let curJob='';   // v9.10: لتشخيص آخر فشل (يُعرض في زر الإرسال)
async function pass(){
  curJob='reconcile';
  if((await A.getRole())==='student') for(const p of await ACC.allProfiles()) await reconcile(p); // جلسة خادم/مالك لا تُصعّد نتائج ملف مخدوم على نفس الجهاز
  const jobs=(await db.pending()).filter(j=>!j.dead&&H[j.type]);
  if(!jobs.length) return;
  curJob='auth'; await ensureClaim();
  for(const j of jobs){ // بالترتيب: profile.create قبل نتائجه
    curJob=j.type;
    try{ const res=await H[j.type](j); if(res==='done'||res==='drop') await db.unqueue(j.id); }
    catch(e){
      if(transient(e)) throw e;
      j.tries=(j.tries||0)+1; j.lastErr=String(e.code||e.status||e.message).slice(0,60); if(j.tries>=MAX_TRIES) j.dead=true; // لا نحذف أبداً: تبقى للمراجعة
      await db.putJob(j);
    }
  }
}
export async function run(){
  if(!enabled()||running||(typeof navigator!=='undefined'&&navigator.onLine===false)) return;
  running=true;
  try{ await pass(); delay=0; await db.del('syncErr').catch(()=>{}); }
  catch(e){ delay=Math.min(300000,delay?delay*3:5000); kick(delay);
    try{ await db.set('syncErr',{at:Date.now(),job:curJob,status:e&&e.status||0,code:(e&&e.code)||'',msg:String((e&&e.message)||'').slice(0,100)}); }catch(x){} } // 5ث ثم ١٥ ثم ٤٥... حتى ٥ دقائق
  finally{ running=false; }
}
export function kick(ms=500){ clearTimeout(timer); timer=setTimeout(()=>{ run(); },ms); }
// (v9.3) إرسال يدوي بزر "إرسال": يشغّل جولة المزامنة فوراً وينتظر نتيجتها. الإرسال التلقائي (kick/online/كل ٢ دقيقة) يفضل شغّال كما هو
// كاحتياطي، فلو مفيش نت النتيجة تفضل في الطابور وتتبعت لوحدها بعدين. يرجع {state:'off'|'offline'|'pending'|'done',pending,dead}.
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
export async function flush(){
  if(!enabled()) return {state:'off',pending:0,dead:0};
  if(offline()) return {state:'offline',...(await stats())};
  clearTimeout(timer);
  for(let i=0;i<50&&running;i++) await sleep(300);   // لو فيه جولة شغّالة نستناها
  await run();
  for(let i=0;i<50&&running;i++) await sleep(300);
  const s=await stats(); let err='';
  if(s.pending||s.dead){
    const e=await db.get('syncErr'), lj=(await db.pending()).filter(x=>x.lastErr).pop();
    err=e?`${e.job} · ${[e.status,e.code,e.msg].filter(Boolean).join(' ')}`:(lj?`${lj.type} · ${lj.lastErr}`:'');
  }
  return {state:s.pending?'pending':'done',...s,err};
}
export const stats=async()=>{ const j=await db.pending(); return {pending:j.filter(x=>!x.dead).length,dead:j.filter(x=>x.dead).length}; };

// ===== سجلات إضافة فقط (جلسة / فتح إصحاح) — لا تُسجَّل لو المزامنة غير مفعّلة، حتى لا يكبر الطابور =====
const stu=async()=>{ const p=await A.activeProfile(); return p&&(await A.getRole())==='student'&&enabled()?p:null; };
export async function logSession(){
  try{ const p=await stu(); if(!p) return; const t=await db.get('lastSessionAt'); if(t&&Date.now()>=t&&Date.now()-t<30*60000) return;
    await db.set('lastSessionAt',Date.now()); await db.queue({type:'session.create',rid:crypto.randomUUID(),profileId:p.id,startedAt:Date.now()}); }catch(e){}
}
// v6: throttle ٣٠ دقيقة لكل (سفر، إصحاح) عبر مفتاح kv منفصل
export async function logOpen(bookId,chapterNum){
  try{ const p=await stu(); if(!p) return;
    const k=`lastOpen_${bookId}_${chapterNum}`, t=await db.get(k); if(t&&Date.now()>=t&&Date.now()-t<30*60000) return;
    await db.set(k,Date.now()); await db.queue({type:'book_open.create',rid:crypto.randomUUID(),profileId:p.id,bookId,chapterNum,openedAt:Date.now()}); }catch(e){}
}

// ===== استرجاع الحساب على جهاز جديد (يربط auth.setRemoteRestore) =====
const PAGE=1000, CAP=5000; // PostgREST في Supabase يقصّ الرد عند ١٠٠٠ صف افتراضياً، فنجلب صفحات بـoffset حتى CAP
async function pullResults(p){
  const rows=[];
  for(let off=0;off<CAP;off+=PAGE){
    const get=(c)=>api(`/rest/v1/results?profile_id=eq.${p.id}&select=${c}&order=attempted_at.asc,id.asc&limit=${Math.min(PAGE,CAP-off)}&offset=${off}`);
    let r=await get('id,book_id,chapter_num,attempt_no,score,total,source,answered,duration_sec,attempted_at');
    if(r.status===400) r=await get('id,book_id,chapter_num,attempt_no,score,total,source,answered,attempted_at'); // قبل تشغيل SQL الوقت
    if(!r.ok) break;
    const part=await r.json(); rows.push(...part); if(part.length<PAGE) break;
  }
  // TODO: pagination — لو تخطّت نتائج المخدوم الواحد CAP (٥٠٠٠) استخدم keyset على (attempted_at,id)
  if(!rows.length) return;
  const R=(await db.get('results'))||{attempts:[]}, SA=(await db.get('syncedAttempts'))||{}, have=new Set(R.attempts.map(a=>a.id));
  for(const x of rows){ SA[x.id]=1; if(!have.has(x.id)) R.attempts.push({id:x.id,profileId:p.id,bookId:x.book_id,chapterNum:x.chapter_num,attemptNo:x.attempt_no,score:x.score,total:x.total,source:x.source,answered:x.answered,durationSec:x.duration_sec==null?null:x.duration_sec,at:Date.parse(x.attempted_at)}); }
  await db.set('results',R); await db.set('syncedAttempts',SA);
}
// v6: الاسترجاع عبر Edge Function "restore" (حدّ IP + حدّ auth_uid داخل الدالة). دالة RPC القديمة سُحبت صلاحيتها.
// يرجع: profile | null (لا تطابق) | {error:'locked'|'offline'|'unavailable'}
export async function remoteRestore(name,code){
  if(!enabled()) return {error:'unavailable'};
  if(typeof navigator!=='undefined'&&navigator.onLine===false) return {error:'offline'};
  try{
    const go=(a)=>fetch(BASE+'/functions/v1/'+FN['restore'],{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+a.access,'Content-Type':'application/json'},body:JSON.stringify({name:A.normName(name),code})});
    let r=await go(await token()); if(r.status===401) r=await go(await token(true));
    let j={}; try{ j=await r.json(); }catch(e){}
    if(r.status===429||j.error==='locked') return {error:'locked'};
    if(r.status===404&&j.error==='mismatch') return null; // 404 بلا error=mismatch = الدالة غير منشورة
    if(!r.ok||!j.profile||!j.profile.id) return {error:'unavailable'};
    const x=j.profile; // الرد هوية فقط، بلا بيانات اتصال
    const a=await db.get('sbAuth'); if(a&&a.fresh){ a.fresh=false; await db.set('sbAuth',a); } // الدالة ربطت الملف بالهوية الحالية
    const p={id:x.id,code:x.code,name:x.name,grade:x.grade,gender:x.gender,phone:'',email:'',guardianName:'',guardianPhone:'',createdAt:Date.parse(x.created_at)||Date.now(),synced:true};
    await pullResults(p); // لازم قبل أي محاولة جديدة، حتى لا تتكرر أرقام المحاولات
    return p;
  }catch(e){ return {error:'offline'}; }
}

// ===== (v6) دخول الخادم/المالك =====
// email+password حقيقي (ليس مجهولاً). الدور يُقرأ من app_metadata.role في الـJWT الذي أصدره Supabase؛ لا يمكن للمستخدم تعيينه.
// كلمة السر لا تُخزَّن أبداً؛ نخزّن فقط access/refresh في kv.staff (يُمسح بالخروج). الصلاحيات الفعلية تفرضها RLS مهما عُدّل في الواجهة.
const claims=(jwt)=>{ try{ return JSON.parse(atob(String(jwt).split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); }catch(e){ return {}; } };
const staffRoleOf=(jwt)=>{ const c=claims(jwt), r=(c.app_metadata||{}).role; return !c.is_anonymous&&A.STAFF.includes(r)?r:null; };
const staffPack=(j,role)=>({role,uid:(j.user&&j.user.id)||claims(j.access_token).sub,access:j.access_token,refresh:j.refresh_token,exp:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600),
  mustChange:!!(claims(j.access_token).user_metadata||{}).must_change_password,
  name:String((claims(j.access_token).user_metadata||{}).name||'')}); // v9.2: كلمة سر مؤقتة ⇒ تغيير إجباري (علَم واجهة فقط)
const offline=()=>typeof navigator!=='undefined'&&navigator.onLine===false;

export async function staffLogin(email,password){
  if(!enabled()) return {ok:false,reason:'unavailable'};
  if(offline()) return {ok:false,reason:'offline'};
  let r; try{ r=await fetch(BASE+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({email:String(email||'').trim(),password:String(password||'')})}); }
  catch(e){ return {ok:false,reason:'offline'}; }
  if(r.status===429) return {ok:false,reason:'rate'};
  if(!r.ok) return {ok:false,reason:r.status>=500?'server':'bad'};
  const j=await r.json(), role=staffRoleOf(j.access_token);
  if(!role){ // دخول صحيح لكن الحساب بلا دور خادم/مالك: لا نحتفظ بالجلسة
    try{ await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+j.access_token}}); }catch(e){}
    return {ok:false,reason:'noRole'};
  }
  await db.set('staff',staffPack(j,role));
  dispatchEvent(new Event('lawha:role'));
  return {ok:true,role};
}
export async function staffLogout(){
  const s=await db.get('staff'); await db.del('staff'); await db.del('resultsBoard'); // v8: كاش النتائج فيه أسماء مخدومين؛ يُمسح مع الخروج
  // نمسح محلياً دائماً، حتى لو فشل الاتصال
  if(s&&s.access&&!offline()){ try{ await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+s.access}}); }catch(e){} }
  dispatchEvent(new Event('lawha:role'));
}
// يرجع جلسة صالحة {access,role,uid} أو null (لا جلسة / سُحبت). فشل الشبكة يرمي E (الجلسة تبقى).
let staffBusy=null;
export function staffAuth(force){ return staffBusy||(staffBusy=(async()=>{
  try{
    let s=await db.get('staff'); if(!s) return null;
    if(!force&&s.exp-60>Date.now()/1000) return s;
    let r; try{ r=await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh})}); }
    catch(e){ throw new E(0); }
    if(r.ok){ const j=await r.json(), role=staffRoleOf(j.access_token);
      if(!role){ await db.del('staff'); return null; } // الدور اتسحب من الحساب
      s=staffPack(j,role); await db.set('staff',s); return s; }
    if(r.status>=500||r.status===408||r.status===429) throw new E(r.status);
    await db.del('staff'); return null; // الـrefresh token مرفوض (انتهى/سُحب)
  } finally{ staffBusy=null; }
})()); }
// طلب REST بصلاحيات الخادم/المالك (للمرحلة ٧: لوحة التميز تقرأ results_first)
export async function staffApi(path,opts={}){
  const s=await staffAuth(false); if(!s) throw new E(401);
  const go=(t)=>fetch(BASE+path,{method:opts.method||'GET',headers:{apikey:KEY,Authorization:'Bearer '+t,'Content-Type':'application/json',...(opts.prefer?{Prefer:opts.prefer}:{})},body:opts.body==null?undefined:JSON.stringify(opts.body)});
  let r=await go(s.access);
  if(r.status===401){ const n=await staffAuth(true); if(!n) throw new E(401); r=await go(n.access); }
  return r;
}

// ===== (v9.5) رسائل المخدوم: RPC my_messages لملفه فقط. يرجع قائمة أو null (أوفلاين/فشل) =====
export async function inboxFetch(profileId){
  if(!enabled()||offline()) return null;
  try{ try{ await ensureClaim(); }catch(e){}
    const r=await api('/rest/v1/rpc/my_messages',{method:'POST',body:{p_profile:profileId}});
    return r.ok?await r.json():null;
  }catch(e){ return null; }
}
// ===== (v9.2) طلبات "نسيت كلمة السر": INSERT مفتوح للـanon (سياسة RLS بشروط)، بلا قراءة. =====
export async function submitRequest({type='password_reset',name='',contact='',message=''}){
  if(!enabled()) return {ok:false,reason:'unavailable'};
  if(offline()) return {ok:false,reason:'offline'};
  try{
    const r=await fetch(BASE+'/rest/v1/requests',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({type,requester_name:name||null,requester_contact:contact,message:message||null})});
    if(r.ok) return {ok:true};
    let j={}; try{ j=await r.json(); }catch(e){}
    if(j&&j.message==='duplicate') return {ok:true,dup:true};   // طلب معلّق بنفس الإيميل: نعامله كنجاح (لا نكشف شيئاً)
    if(j&&j.message==='full') return {ok:false,reason:'busy'};
    return {ok:false,reason:r.status===429?'rate':(r.status>=500?'server':'bad')};
  }catch(e){ return {ok:false,reason:'offline'}; }
}
// المالك فقط: يعدّل كلمة سر حساب عبر Edge Function reset-password (service_role داخلها فقط). لا تُرجع كلمة السر.
export async function resetPassword(email,password){
  let s; try{ s=await staffAuth(false); }catch(e){ return {ok:false,reason:'offline'}; }
  if(!s) return {ok:false,reason:'auth'};
  try{
    const r=await fetch(BASE+'/functions/v1/'+FN['reset-password'],{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+s.access,'Content-Type':'application/json'},body:JSON.stringify({email,new_password:password})});
    let j={}; try{ j=await r.json(); }catch(e){}
    if(r.ok&&j.ok) return {ok:true};
    return {ok:false,reason:j.error||(r.status===404?'nofn':'server')};
  }catch(e){ return {ok:false,reason:'offline'}; }
}
// (v9.6) المالك فقط: إدارة حسابات الطاقم عبر Edge Function staff-admin (list/create/set_role/set_active). ترجع {ok,...} أو {ok:false,reason}.
export async function staffAdmin(payload){
  let s; try{ s=await staffAuth(false); }catch(e){ return {ok:false,reason:'offline'}; }
  if(!s) return {ok:false,reason:'auth'};
  try{
    const r=await fetch(BASE+'/functions/v1/'+FN['staff-admin'],{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+s.access,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    let j={}; try{ j=await r.json(); }catch(e){}
    if(r.ok&&j.ok) return j;
    return {ok:false,reason:j.error||(r.status===404?'nofn':'server')};
  }catch(e){ return {ok:false,reason:'offline'}; }
}
// ===== (v9.45) الإشعارات الفعلية (Web Push): تسجيل اشتراك الجهاز + إشعار تجريبي. الإرسال الفعلي من Edge Function "push-send" =====
const pushWhy=(f)=>f.code==='42501'?'not_owner':(f.status===404||f.code==='PGRST202'||f.code==='42883'||f.code==='42P01')?'nosql':'server';
export async function pushSubscribe(profileId,sub){
  if(!enabled()||offline()) return {ok:false,reason:'offline'};
  try{ try{ await ensureClaim(); }catch(e){}
    const j=sub&&sub.toJSON?sub.toJSON():(sub||{}), k=j.keys||{};
    if(!j.endpoint||!k.p256dh||!k.auth) return {ok:false,reason:'subscribe'};
    const r=await api('/rest/v1/rpc/push_subscribe',{method:'POST',body:{p_profile:profileId,p_endpoint:j.endpoint,p_p256dh:k.p256dh,p_auth:k.auth,p_ua:String(navigator.userAgent||'').slice(0,300)}});
    return r.ok?{ok:true}:{ok:false,reason:pushWhy(await fail(r))};
  }catch(e){ return {ok:false,reason:'offline'}; }
}
export async function pushUnsubscribe(profileId,endpoint){
  if(!enabled()||offline()) return {ok:false,reason:'offline'};
  try{ try{ await ensureClaim(); }catch(e){}
    const r=await api('/rest/v1/rpc/push_unsubscribe',{method:'POST',body:{p_profile:profileId,p_endpoint:endpoint}});
    return r.ok?{ok:true}:{ok:false,reason:pushWhy(await fail(r))};
  }catch(e){ return {ok:false,reason:'offline'}; }
}
export async function pushStatus(profileId,endpoint){   // true/false، أو null لو تعذّر السؤال (نت/SQL ناقص)
  if(!enabled()||offline()) return null;
  try{ try{ await ensureClaim(); }catch(e){}
    const r=await api('/rest/v1/rpc/push_status',{method:'POST',body:{p_profile:profileId,p_endpoint:endpoint}});
    return r.ok?(await r.json())===true:null;
  }catch(e){ return null; }
}
async function pushFn(jwt,payload){
  try{
    const r=await fetch(BASE+'/functions/v1/'+FN['push-send'],{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    let j={}; try{ j=await r.json(); }catch(e){}
    if(r.ok) return j.ok?{ok:true,...j}:{ok:false,reason:j.removed?'gone':'failed',...j};
    return {ok:false,reason:j.error||(r.status===404?'nofn':'server')};
  }catch(e){ return {ok:false,reason:'offline'}; }
}
export async function pushTest(endpoint){   // المخدوم: إشعار تجريبي لجهازه فقط
  if(!enabled()||offline()) return {ok:false,reason:'offline'};
  try{ const a=await token(); return await pushFn(a.access,{action:'test',endpoint}); }catch(e){ return {ok:false,reason:'offline'}; }
}
export async function pushSend(payload){    // المالك: ping | test_profile | test_all
  let s; try{ s=await staffAuth(false); }catch(e){ return {ok:false,reason:'offline'}; }
  if(!s) return {ok:false,reason:'auth'};
  return pushFn(s.access,payload);
}
// تغيير كلمة سر الحساب الحالي (GoTrue PUT /auth/v1/user) وإزالة علَم "كلمة مؤقتة".
export async function changePassword(password){
  let s; try{ s=await staffAuth(false); }catch(e){ return {ok:false,reason:'offline'}; }
  if(!s) return {ok:false,reason:'auth'};
  try{
    const r=await fetch(BASE+'/auth/v1/user',{method:'PUT',headers:{apikey:KEY,Authorization:'Bearer '+s.access,'Content-Type':'application/json'},body:JSON.stringify({password,data:{must_change_password:false}})});
    if(!r.ok){ let j={}; try{ j=await r.json(); }catch(e){}
      return {ok:false,reason:r.status===401?'auth':r.status===422?(/different/i.test(j.msg||j.message||'')?'same':'weak'):(r.status>=500?'server':'bad')}; }
    const cur=await db.get('staff'); if(cur) await db.set('staff',{...cur,mustChange:false});
    return {ok:true};
  }catch(e){ return {ok:false,reason:'offline'}; }
}

// ===== (v8) لوحة التميز المباشرة: results_first_staff بجلسة الخادم/المالك =====
// يرجع {rows,at,fromCache,error?,truncated?}. أوفلاين/فشل → آخر نسخة محفوظة (kv.resultsBoard). error: 'auth'|'offline'|'server'|'none'
const RB_PAGE=1000, RB_CAP=20000;
const RB_COLS='profile_id,name,grade,gender,book_id,title,chapter_num,first_score,first_total,first_attempted_at,attempts,first_duration_sec';
const RB_COLS_OLD='profile_id,name,grade,gender,book_id,title,chapter_num,first_score,first_total,first_attempted_at,attempts'; // قبل تشغيل SQL الوقت
export async function resultsFirst({refresh=true}={}){
  const cached=await db.get('resultsBoard');
  const fb=(error)=>({rows:cached?cached.rows:[],at:cached?cached.at:0,fromCache:true,truncated:!!(cached&&cached.truncated),error});
  if(!refresh||!enabled()||offline()) return fb(cached?undefined:'offline');
  try{
    const rows=[]; let truncated=false, oldCols=false;
    for(let off=0;;off+=RB_PAGE){
      if(off>=RB_CAP){ truncated=true; break; }
      const q=(cols)=>staffApi(`/rest/v1/results_first_staff?select=${cols}&order=profile_id.asc,book_id.asc,chapter_num.asc&limit=${RB_PAGE}&offset=${off}`);
      let r=await q(oldCols?RB_COLS_OLD:RB_COLS);
      if(r.status===400&&!oldCols){ oldCols=true; r=await q(RB_COLS_OLD); } // العمود الجديد غير موجود بعد على السيرفر
      if(!r.ok) throw new E(r.status);
      const part=await r.json(); rows.push(...part); if(part.length<RB_PAGE) break;
    }
    const out={rows,at:Date.now(),truncated}; await db.set('resultsBoard',out);
    return {...out,fromCache:false};
  }catch(e){ return fb(e.status===401||e.status===403?'auth':(!e.status?'offline':'server')); }
}
// TODO: keyset pagination بدل offset لو زاد العدد عن RB_CAP.

// ===== (v7) الأسفار من السيرفر (قراءة عامة بمفتاح anon؛ لا حاجة لهوية مجهولة) =====
// يرجع null لو الخدمة معطّلة/أوفلاين/فشل الطلب (فيرجع المستدعي للكاش ثم الملفات المحلية).
async function pub(path){
  if(!enabled()||offline()) return null;
  const c=new AbortController(), t=setTimeout(()=>c.abort(),6000);
  try{ const r=await fetch(BASE+path,{headers:{apikey:KEY,Authorization:'Bearer '+KEY},signal:c.signal}); return r.ok?await r.json():null; }
  catch(e){ return null; } finally{ clearTimeout(t); }
}
export const votdList=()=>pub('/rest/v1/votd_verses?select=id,ref,text,note&order=id'); // v9.20: آيات أضافها المالك (المفعّلة فقط تظهر لغيره عبر RLS)
export const booksList=()=>pub('/rest/v1/books?select=id,title,read_minutes,updated_at&order=id');
export async function booksGet(id){ const x=await pub(`/rest/v1/books?id=eq.${encodeURIComponent(id)}&select=data`); return x&&x[0]&&x[0].data?x[0].data:null; }

// ===== (v9.21) مواعيد وأكواد الإصحاحات =====
// accessSyncTimes (accessList سابقاً): قراءة عامة (null = أوفلاين/فشل/الـSQL لسه ما اتشغّلش → المستدعي يرجع للكاش). serverNow: ملّي ثانية أو null.
export const accessSyncTimes=()=>pub('/rest/v1/chapter_access?select=book_id,chapter_num,opens_at,closes_at,updated_at&order=book_id,chapter_num');
export const accessList=accessSyncTimes; // اسم v9.21 (توافق)
// v9.22: بصمات الأكواد (SHA-256 + salt) فقط؛ الكود الخام ما بيطلعش من chapter_codes. null = أوفلاين/فشل/الـSQL لسه ما اتشغّلش.
export const accessSyncCodes=()=>pub('/rest/v1/chapter_code_hashes?select=book_id,chapter_num,salt,hash,updated_at&order=book_id,chapter_num');
export async function serverNow(){
  if(!enabled()||offline()) return null;
  const c=new AbortController(), t=setTimeout(()=>c.abort(),6000);
  try{ const r=await fetch(BASE+'/rest/v1/rpc/server_now',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:'{}',signal:c.signal});
    if(!r.ok) return null; const s=Date.parse(await r.json()); return Number.isFinite(s)?s:null; }
  catch(e){ return null; } finally{ clearTimeout(t); }
}
// يرجع: 'ok' | 'bad' | 'locked' (حدّ المحاولات) | 'offline' | 'unavailable'. بهوية المخدوم المجهولة.
export async function redeemCode(bookId,chapterNum,code){
  if(!enabled()) return 'unavailable'; if(offline()) return 'offline';
  try{ const r=await api('/rest/v1/rpc/redeem_chapter_code',{method:'POST',body:{p_book:bookId,p_chapter:chapterNum,p_code:code}});
    if(!r.ok) return 'unavailable'; const j=await r.json(); return ['ok','bad','locked'].includes(j)?j:'unavailable'; }
  catch(e){ return 'offline'; }
}

export function init(){
  if(!enabled()) return;
  A.setRemoteRestore(remoteRestore);
  db.get('staff').then(s=>{ if(s&&navigator.onLine) staffAuth(true).then(n=>{ if(!n) dispatchEvent(new Event('lawha:role')); }).catch(()=>{}); }); // يتأكد أن الدور ما زال سارياً
  addEventListener('online',()=>kick(500));
  addEventListener('lawha:queued',()=>kick(800));
  if(typeof document!=='undefined') document.addEventListener('visibilitychange',()=>{ if(!document.hidden) kick(1500); });
  setInterval(()=>kick(0),120000);
  kick(2500);
}
