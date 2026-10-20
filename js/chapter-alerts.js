// (v9.46) خطة بديلة محلية لتنبيه ميعاد فتح الإصحاح — لو النت فصل أو إشعار السيرفر اتأخر. مكمّلة لـWeb Push مش بديل عنه.
// ⚠️ حدود المتصفح: التايمر ده بيشتغل **طول ما التطبيق مفتوح (حتى في الخلفية لدقايق)** بس. لو التطبيق اتقفل تماماً، المتصفحات ما بتسمحش
//    بجدولة إشعار محلي (مفيش API ثابت لده)؛ وقتها الإشعار الوحيد هو Push من السيرفر. وعند فتح التطبيق، «الإصحاح لسه مفتوح ولم تفتحه»
//    بيظهر كتذكير داخل التطبيق (كمّل من reminders.js → pending()).
// «أول واحد يشتغل يلغي التاني»: الإشعار المحلي والـPush بنفس الـtag (ch-<book>-<num>):
//    • المحلي بيتخطّى لو في إشعار بنفس الـtag ظاهر فعلاً (يعني السيرفر سبق).  • والـPush اللي يجي بعد المحلي بيستبدله بصمت (sw.js).
import * as db from './db.js';
import * as A from './auth.js';
import * as AC from './access.js';
const AHEAD=12*3600e3, CATCHUP=3*3600e3, FIRE_WINDOW=120e3, MAX_SLEEP=6*3600e3;
let timer=null, wired=false;
const tagOf=(b,n)=>('ch-'+b+'-'+n).slice(0,60);
const ar=(n)=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
const opened=async(b,n)=>!!(await db.get('lastOpen_'+b+'_'+n).catch(()=>0));   // بيتسجّل لما المخدوم يفتح الإصحاح (sync.logOpen)، شخصي لكل حساب
// اسم السفر من كاش الأسفار المحلي (خفيف، بدون شبكة)؛ لو مش موجود نرجع معرّف السفر
export async function titleOf(b){ try{ const c=await db.get('booksCache'); const x=c&&c[b]; return String((x&&x.title)||b); }catch(e){ return b; } }
// إصحاحات مفتوحة دلوقتي، اتفتحت من أقل من ٣ ساعات، والمخدوم لم يفتحها (تذكير داخل التطبيق)
export async function pending(){
  const t=AC.now(), out=[];
  for(const c of AC.schedule()){
    if(c.o==null||c.o>t||t-c.o>CATCHUP) continue;
    if(c.c!=null&&c.c<=t) continue;
    if(await opened(c.bid,c.num)) continue;
    out.push(c);
  }
  return out.sort((a,b)=>b.o-a.o);
}
async function show(c){
  try{
    if(typeof Notification==='undefined'||Notification.permission!=='granted'||!('serviceWorker' in navigator)) return false;
    const p=await A.activeProfile(); if(!p) return false;
    const flag='chAlert_'+c.bid+'_'+c.num; if(await db.getAt(p.id,flag)) return false;   // مرة لكل إصحاح
    const reg=await navigator.serviceWorker.ready, tag=tagOf(c.bid,c.num);
    if((await reg.getNotifications({tag})).length) { await db.setAt(p.id,flag,Date.now()); return false; }   // السيرفر سبق: الأول يلغي التاني
    await db.setAt(p.id,flag,Date.now());
    await reg.showNotification('📖 إصحاح '+ar(c.num)+' اتفتح',{body:await titleOf(c.bid),tag,renotify:false,lang:'ar',dir:'rtl',icon:new URL('../icons/icon-192.png',import.meta.url).href,badge:new URL('../icons/icon-192.png',import.meta.url).href,data:{url:'./#/books'}});
    return true;
  }catch(e){ return false; }
}
async function fire(){
  const t=AC.now();
  for(const c of AC.schedule()){
    if(c.o==null||c.o>t||t-c.o>FIRE_WINDOW) continue;
    if(c.c!=null&&c.c<=t) continue;
    if(await opened(c.bid,c.num)) continue;
    await show(c);
  }
  try{ dispatchEvent(new Event('lawha:data')); }catch(e){}   // يحدّث تذكيرات داخل التطبيق
}
// تايمر واحد لأقرب ميعاد فتح خلال ١٢ ساعة (وإعادة ضبط كل ٦ ساعات كحد أقصى)
export function arm(){
  clearTimeout(timer); timer=null;
  try{
    const t=AC.now(); let next=null;
    for(const c of AC.schedule()) if(c.o!=null&&c.o>t&&c.o-t<=AHEAD&&(next==null||c.o<next)) next=c.o;
    if(next==null) return;
    timer=setTimeout(async()=>{ timer=null; if(AC.now()>=next) await fire(); arm(); },Math.min(MAX_SLEEP,Math.max(1000,next-t)+800));
  }catch(e){}
}
export async function start(){
  const ping=()=>{ try{ dispatchEvent(new Event('lawha:data')); }catch(e){} };   // يحدّث تذكيرات داخل التطبيق بعد تحميل المواعيد
  try{ await AC.load(); arm(); ping(); AC.refresh().then(got=>{ if(got){ arm(); ping(); } }).catch(()=>{}); }catch(e){}
  if(wired) return; wired=true;
  addEventListener('online',()=>{ AC.refresh().then(()=>arm()).catch(()=>{}); });
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'){ arm(); try{ dispatchEvent(new Event('lawha:data')); }catch(e){} } });
}
