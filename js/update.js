// (v9.3) فحص يدوي لتحديث التطبيق (Service Worker). يرجع: 'found' | 'none' | 'offline' | 'unsupported' | 'error'.
// لو لقى نسخة جديدة يظهر الشريط الذهبي الموجود في index.html؛ زر "تحديث" فيه هو اللي يفعّلها (لا نعيد تحميل الصفحة تلقائياً).
// (v9.500) + تحديث تلقائي (initAutoUpdate): النسخة الجديدة بتتفعّل لوحدها بس لما يكون آمن (مفيش امتحان جاري ولا شاشة نتيجة ظاهرة). القرار في الصفحة مش في sw.js لأن الـSW مش بيشوف exam_session.
import * as EX from './exam-session.js';
import * as db from './db.js';
let manual=false;   // (v9.500) الشريط اتعرض بطلب المخدوم (زر «إرسال النتيجة» ← checkUpdate): التحديث التلقائي المؤجَّل ما يخفيهوش
function showBanner(reg){
  const b=document.getElementById('banner'), u=document.getElementById('upd'); if(!b||!u) return;
  manual=true; b.classList.add('show'); u.onclick=()=>reg.waiting&&reg.waiting.postMessage('SKIP_WAITING');
}
const ready=(reg)=>!!(reg&&reg.waiting&&navigator.serviceWorker.controller);
export async function checkUpdate(){
  if(!('serviceWorker' in navigator)) return 'unsupported';
  if(navigator.onLine===false) return 'offline';
  try{
    const reg=await navigator.serviceWorker.getRegistration(); if(!reg) return 'none';
    if(ready(reg)){ showBanner(reg); return 'found'; }
    await reg.update();                                   // يجلب sw.js من السيرفر ويقارنه
    const w=reg.installing;
    if(w) await new Promise((res)=>{ const f=()=>{ if(w.state==='installed'||w.state==='redundant'){ w.removeEventListener('statechange',f); res(); } };
      w.addEventListener('statechange',f); f(); setTimeout(res,20000); });
    if(ready(reg)){ showBanner(reg); return 'found'; }
    return 'none';
  }catch(e){ return 'error'; }
}

// ===== (v9.500) التحديث التلقائي =====
// آمن = مفيش امتحان جاري (exam_session موجودة ومش منتهية) ومفيش شاشة نتيجة ظاهرة (#sendst: الـreload هيمسح رسالة الإرسال). شاشة القراءة عادية (وقتها محفوظ في read_session).
export async function safeToApply(){
  try{
    // بنفحص مفاتيح exam_session لكل حسابات الجهاز مش الحساب النشط بس: وقت فتح التطبيق الـscope ممكن لسه ما اتحددش (db.setScope بيتنادى بعد ما الراوتر يحدد الحساب)
    for(const k of (await db.keys())){ if(typeof k==='string'&&/^u:.+:exam_session$/.test(k)){ const s=await db.getRaw(k); if(s&&!EX.expired(s)) return false; } }
    if(typeof document!=='undefined'&&document.getElementById('sendst')) return false;
    return true;
  }catch(e){ return false; }   // لو معرفناش نتأكد ما نحدّثش
}
const RETRY_MS=30000, FALLBACK_MS=10000, GUARD_KEY='lawha_auto_upd', GUARD_MS=60000;
// منطق نقي بتبعيّات محقونة (عشان يتختبر بـNode): waiting() hasController() safe() setTimer(fn,ms) showBanner() hideBanner() guardOk() guardSet()
export function makeUpdater(d){
  let retryT=null, applying=false;
  const retry=()=>{ if(retryT) return; retryT=d.setTimer(()=>{ retryT=null; check(); },RETRY_MS); };
  async function check(){
    const w=d.waiting();
    if(!w||!d.hasController()) return 'none';
    if(applying) return 'applying';
    let ok=false; try{ ok=await d.safe(); }catch(e){ ok=false; }
    if(!ok){ if(!d.isManual()) d.hideBanner(); retry(); return 'deferred'; }   // مؤجَّل: نسيب الشريط مخفي (إلا لو المخدوم طلبه) ونعيد الفحص
    if(!d.guardOk()){ d.showBanner(); return 'guard'; }   // حارس حلقة reload: نرجع للشريط اليدوي
    applying=true; d.guardSet(); d.hideBanner();
    try{ w.postMessage('SKIP_WAITING'); }catch(e){ applying=false; d.showBanner(); return 'error'; }
    d.setTimer(()=>{ applying=false; if(d.waiting()) d.showBanner(); },FALLBACK_MS);   // لو التفعيل ما حصلش: الشريط اليدوي احتياطي
    return 'applied';
  }
  return {check};
}
const lsGet=()=>{ try{ return Number(localStorage.getItem(GUARD_KEY)||0); }catch(e){ return 0; } };
export function initAutoUpdate(reg){
  try{
    const b=()=>document.getElementById('banner'), manualShow=()=>{ const bn=b(), u=document.getElementById('upd'); if(bn&&u){ bn.classList.add('show'); u.onclick=()=>reg.waiting&&reg.waiting.postMessage('SKIP_WAITING'); } };
    const U=makeUpdater({
      waiting:()=>reg.waiting, hasController:()=>!!navigator.serviceWorker.controller, safe:safeToApply,
      setTimer:(f,ms)=>setTimeout(f,ms), isManual:()=>manual,
      showBanner:manualShow, hideBanner:()=>{ const bn=b(); if(bn) bn.classList.remove('show'); },
      guardOk:()=>{ const t=lsGet(); return !(t&&Date.now()-t<GUARD_MS); },
      guardSet:()=>{ try{ localStorage.setItem(GUARD_KEY,String(Date.now())); }catch(e){} }
    });
    const check=()=>{ U.check().catch(()=>{}); };
    check();
    reg.addEventListener('updatefound',()=>{ const w=reg.installing; if(w) w.addEventListener('statechange',()=>{ if(w.state==='installed') check(); }); });
    // التطبيق بيفضل مفتوح أيام: نسأل عن نسخة جديدة كل ما يرجع ظاهر (بحد أدنى ٢٠ دقيقة بين كل سؤال)
    let last=Date.now();
    const poke=()=>{ if(document.hidden) return; check(); if(navigator.onLine!==false&&Date.now()-last>20*60000){ last=Date.now(); reg.update().catch(()=>{}); } };
    document.addEventListener('visibilitychange',poke);
    if(navigator.onLine!==false) reg.update().catch(()=>{});
  }catch(e){}
}
// الـSW الجديد استلم التحكم (claim): نعيد تحميل الصفحة عشان تشتغل بملفاته، بس لما يكون آمن (حتى لو جهاز/تبويب تاني هو اللي طبّق التحديث)
export function reloadWhenSafe(){
  const tick=async()=>{ let ok=true; try{ ok=await safeToApply(); }catch(e){ ok=true; } if(ok) location.reload(); else setTimeout(tick,5000); };
  tick();
}
