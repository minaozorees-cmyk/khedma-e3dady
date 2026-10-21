// (v9.45) الإشعارات الفعلية للمخدوم (Web Push) — واجهة الاشتراك فقط. السيرفر (Edge Function) هو اللي بيبعت، حتى لو التطبيق مقفول.
// هنا: طلب الإذن + اشتراك الجهاز + تسجيله عند السيرفر + تزامنه. حالة التفعيل لكل حساب محفوظة محلياً (pushOn).
// ⚠️ VAPID_PUBLIC مفتاح عام (آمن للنشر). المفتاح الخاص يتخزّن في Supabase Secrets فقط، ولا يوضع في أي ملف هنا.
//    لو غيّرت زوج المفاتيح: بدّل المفتاح العام ده والسري في Supabase. المخدومين اللي مفعّلين بيتجدّد اشتراكهم تلقائياً عند أول فتح للتطبيق (sameKey/sync).
import * as db from './db.js';
import * as SY from './sync.js';
export const VAPID_PUBLIC='BC5yqkVX_voOQ3DoubFkerOAQk7wSxTANS__xdNWVK754UyprEf4ocCNGyKE1gRcIgzdMgLIlTqa7gKT8XO2puM';
const key=()=>{ const s=VAPID_PUBLIC, p='='.repeat((4-s.length%4)%4), r=atob((s+p).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(r,c=>c.charCodeAt(0)); };
const sameKey=(sub)=>{ try{ const a=sub&&sub.options&&sub.options.applicationServerKey; if(!a) return true; const x=new Uint8Array(a), y=key(); return x.length===y.length&&x.every((v,i)=>v===y[i]); }catch(e){ return true; } };   // اشتراك بمفتاح VAPID قديم = لازم يتجدّد
export const supported=()=>typeof window!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
export const configured=()=>SY.enabled()&&!!VAPID_PUBLIC;
const reg=()=>navigator.serviceWorker.ready;
export async function localSub(){ try{ return await (await reg()).pushManager.getSubscription(); }catch(e){ return null; } }

// s: unsupported | off (غير مجهّز) | denied | idle (غير مفعّل) | on | partial (اشتراك الجهاز موجود لكن غير مسجّل عند السيرفر)
export async function state(profileId){
  if(!supported()) return {s:'unsupported'};
  if(!configured()) return {s:'off'};
  if(Notification.permission==='denied') return {s:'denied'};
  const sub=await localSub(), on=!!(await db.getAt(profileId,'pushOn'));
  if(!sub) return {s:'idle'};
  if(!sameKey(sub)) return {s:on?'partial':'idle',endpoint:sub.endpoint,stale:true};   // مفتاح قديم: «إعادة التفعيل» أو التجديد التلقائي
  const srv=await SY.pushStatus(profileId,sub.endpoint);
  if(srv===true) return {s:'on',endpoint:sub.endpoint};
  if(srv===false) return {s:on?'partial':'idle',endpoint:sub.endpoint};
  return {s:on?'on':'idle',endpoint:sub.endpoint,unsure:true};   // تعذّر السؤال (أوفلاين): نعتمد على العلَم المحلي
}
// لازم تُنادى من ضغطة زر (طلب الإذن يحتاج لمسة من المستخدم)
export async function enable(profileId){
  if(!supported()||!configured()) return {ok:false,reason:'unsupported'};
  const perm=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(perm!=='granted') return {ok:false,reason:perm==='denied'?'denied':'dismissed'};
  let sub; try{ const r=await reg(); sub=await r.pushManager.getSubscription(); if(sub&&!sameKey(sub)){ try{ await sub.unsubscribe(); }catch(e){} sub=null; } sub=sub||(await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key()})); }
  catch(e){ return {ok:false,reason:'subscribe'}; }
  const x=await SY.pushSubscribe(profileId,sub);
  if(!x.ok) return x;
  await db.setAt(profileId,'pushOn',1); await db.setAt(profileId,'pushSyncAt',Date.now());
  return {ok:true,endpoint:sub.endpoint};
}
// بنشيل تسجيل الحساب ده عند السيرفر بس؛ اشتراك المتصفح نفسه بيفضل (ممكن يكون مستخدم لحساب تاني على نفس الجهاز)
export async function disable(profileId){
  const sub=await localSub(); await db.setAt(profileId,'pushOn',0);
  if(!sub) return {ok:true};
  return SY.pushUnsubscribe(profileId,sub.endpoint);
}
export async function test(){
  const sub=await localSub(); if(!sub) return {ok:false,reason:'not_found'};
  return SY.pushTest(sub.endpoint);
}
// عند فتح التطبيق (مرة/يوم): لو المخدوم مفعّل الإشعارات نجدّد تسجيل الجهاز (لو اتغيّر الـendpoint أو المتصفح فقد الاشتراك)
export async function sync(profileId,force){
  try{
    if(!supported()||!configured()||Notification.permission!=='granted') return;
    if(!(await db.getAt(profileId,'pushOn'))) return;
    const last=(await db.getAt(profileId,'pushSyncAt'))||0, r=await reg(); let sub=await r.pushManager.getSubscription();
    const stale=!!sub&&!sameKey(sub);                                   // (v9.46) تدوير مفاتيح VAPID: نجدّد الاشتراك بدون تدخّل المخدوم
    if(!force&&!stale&&Date.now()-last<864e5) return;
    if(stale){ try{ await sub.unsubscribe(); }catch(e){} sub=null; }
    if(!sub) sub=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key()});
    const x=await SY.pushSubscribe(profileId,sub);
    if(x.ok) await db.setAt(profileId,'pushSyncAt',Date.now());
  }catch(e){}
}

// ===== (v9.48) إشعارات الخدام: ملخص المخدومين اللي ما فتحوش الإصحاح =====
// نفس اشتراك الجهاز (endpoint واحد للمتصفح)، لكن مسجّل للخادم نفسه عبر دوال push_*_staff (الهوية من جلسته). حالة التفعيل المحلية لكل خادم (kv: spush:<uid>).
const sUid=async()=>{ const s=await db.get('staff'); return s&&s.uid?String(s.uid):''; };
const sFlag=async(uid)=>(await db.getRaw('spush:'+uid))||{};
const sSet=(uid,v)=>db.setRaw('spush:'+uid,v);
// s: unsupported | off (غير مجهّز/مفيش جلسة) | denied | idle | on | partial (اشتراك الجهاز موجود لكن غير مسجّل للخادم ده)
export async function stateStaff(){
  if(!supported()) return {s:'unsupported'};
  if(!configured()) return {s:'off'};
  if(Notification.permission==='denied') return {s:'denied'};
  const uid=await sUid(); if(!uid) return {s:'off'};
  const sub=await localSub(), on=!!(await sFlag(uid)).on;
  if(!sub) return {s:'idle'};
  if(!sameKey(sub)) return {s:on?'partial':'idle',endpoint:sub.endpoint,stale:true};
  const srv=await SY.pushStatusStaff(sub.endpoint);
  if(srv===true) return {s:'on',endpoint:sub.endpoint};
  if(srv===false) return {s:on?'partial':'idle',endpoint:sub.endpoint};
  return {s:on?'on':'idle',endpoint:sub.endpoint,unsure:true};
}
export async function enableStaff(){   // لازم تُنادى من ضغطة زر (طلب الإذن)
  if(!supported()||!configured()) return {ok:false,reason:'unsupported'};
  const uid=await sUid(); if(!uid) return {ok:false,reason:'auth'};
  const perm=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(perm!=='granted') return {ok:false,reason:perm==='denied'?'denied':'dismissed'};
  let sub; try{ const r=await reg(); sub=await r.pushManager.getSubscription(); if(sub&&!sameKey(sub)){ try{ await sub.unsubscribe(); }catch(e){} sub=null; } sub=sub||(await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key()})); }
  catch(e){ return {ok:false,reason:'subscribe'}; }
  const x=await SY.pushSubscribeStaff(sub); if(!x.ok) return x;
  await sSet(uid,{on:1,syncAt:Date.now()});
  return {ok:true,endpoint:sub.endpoint};
}
// بنشيل تسجيل الخادم ده بس؛ اشتراك المتصفح نفسه بيفضل (ممكن يكون مستخدم لحساب مخدوم على نفس الجهاز)
export async function disableStaff(){
  const uid=await sUid(), sub=await localSub(); if(uid) await sSet(uid,{on:0,syncAt:0});
  if(!sub) return {ok:true};
  return SY.pushUnsubscribeStaff(sub.endpoint);
}
export async function testStaff(){
  const sub=await localSub(); if(!sub) return {ok:false,reason:'not_found'};
  return SY.pushStaffTest(sub.endpoint);
}
// عند فتح التطبيق بجلسة طاقم (مرة/يوم): لو الخادم مفعّل الملخص نجدّد تسجيل الجهاز (endpoint اتغيّر / مفتاح VAPID اتدوّر / المتصفح فقد الاشتراك)
export async function syncStaff(force){
  try{
    if(!supported()||!configured()||Notification.permission!=='granted') return;
    const uid=await sUid(); if(!uid) return;
    const f=await sFlag(uid); if(!f.on) return;
    const r=await reg(); let sub=await r.pushManager.getSubscription();
    const stale=!!sub&&!sameKey(sub);
    if(!force&&!stale&&Date.now()-(f.syncAt||0)<864e5) return;
    if(stale){ try{ await sub.unsubscribe(); }catch(e){} sub=null; }
    if(!sub) sub=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key()});
    const x=await SY.pushSubscribeStaff(sub);
    if(x.ok) await sSet(uid,{on:1,syncAt:Date.now()});
  }catch(e){}
}
