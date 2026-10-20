// (v9.45) الإشعارات الفعلية للمخدوم (Web Push) — واجهة الاشتراك فقط. السيرفر (Edge Function) هو اللي بيبعت، حتى لو التطبيق مقفول.
// هنا: طلب الإذن + اشتراك الجهاز + تسجيله عند السيرفر + تزامنه. حالة التفعيل لكل حساب محفوظة محلياً (pushOn).
// ⚠️ VAPID_PUBLIC مفتاح عام (آمن للنشر). المفتاح الخاص يتخزّن في Supabase Secrets فقط، ولا يوضع في أي ملف هنا.
//    لو غيّرت زوج المفاتيح: بدّل المفتاح العام ده والسري في Supabase، والمخدومين لازم يعيدوا التفعيل.
import * as db from './db.js';
import * as SY from './sync.js';
export const VAPID_PUBLIC='BGdNxneaY_mHvJg8nCkkCF7R83zLcH1YOKiCGpEU7fV_KsLTmq7pdPH42pAwQz8FX6QJRgOUChXA2bMesUItGKk';
const key=()=>{ const s=VAPID_PUBLIC, p='='.repeat((4-s.length%4)%4), r=atob((s+p).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(r,c=>c.charCodeAt(0)); };
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
  let sub; try{ const r=await reg(); sub=(await r.pushManager.getSubscription())||(await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key()})); }
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
    const last=(await db.getAt(profileId,'pushSyncAt'))||0; if(!force&&Date.now()-last<864e5) return;
    const r=await reg(); let sub=await r.pushManager.getSubscription();
    if(!sub) sub=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key()});
    const x=await SY.pushSubscribe(profileId,sub);
    if(x.ok) await db.setAt(profileId,'pushSyncAt',Date.now());
  }catch(e){}
}
