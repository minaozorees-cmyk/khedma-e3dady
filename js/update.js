// (v9.3) فحص يدوي لتحديث التطبيق (Service Worker). يرجع: 'found' | 'none' | 'offline' | 'unsupported' | 'error'.
// لو لقى نسخة جديدة يظهر الشريط الذهبي الموجود في index.html؛ زر "تحديث" فيه هو اللي يفعّلها (لا نعيد تحميل الصفحة تلقائياً).
function showBanner(reg){
  const b=document.getElementById('banner'), u=document.getElementById('upd'); if(!b||!u) return;
  b.classList.add('show'); u.onclick=()=>reg.waiting&&reg.waiting.postMessage('SKIP_WAITING');
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
