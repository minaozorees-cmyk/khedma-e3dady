// غيّر VERSION مع كل تحديث ليصل للأجهزة
const VERSION='v9.485', CACHE='lawha-'+VERSION;
// (v9.26) كاش مستقل لنصوص المكتبة (bible/*.json): بيفضل زي ما هو عند تحديث النسخة، فمايتنزّلش الأسفار تاني من الأول
const BIBLE='lawha-bible-v1';
const SHELL=['./','index.html','manifest.json','css/app.css','css/fonts.css',
 'js/db.js','js/auth.js','js/router.js','js/register.js','js/accounts.js','js/picker.js','js/consts.js','js/dates.js','js/store.js','js/reminders.js','js/push.js','js/chapter-alerts.js','js/backup.js','js/books.js','js/book-schema.js','js/exam-engine.js','js/results.js','js/sync.js','js/config.js','js/exam-session.js','js/solve-timer.js','js/login.js','js/functions.js','js/sapi.js','js/inbox.js','js/update.js','js/req-watch.js','js/ui.js','js/votd.js','js/welcome.js','js/votd-data.js','js/access.js','js/library.js','js/tts.js','modules/me/index.js','modules/dashboard/index.js','modules/contest/index.js','modules/profile/index.js','modules/owner/assign.js','modules/owner/index.js','modules/owner/members.js','modules/account/index.js','modules/messages/index.js','modules/messages/staff.js','modules/followup/index.js','modules/attendance/index.js','modules/owner/staff.js','modules/owner/tools.js','modules/owner/access.js','modules/books/codes.js','modules/registry.json',
 'modules/books/index.js','modules/library/index.js','modules/agpeya/index.js','modules/agpeya-read/index.js','modules/liturgy/index.js','modules/confession/index.js',
 'books/index.json','pages/servant.html','pages/generator.html',
 'icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png',
 // اختيارية: لو الملف غير موجود لا يفشل التثبيت
 'fonts/Cairo-Variable.woff2','fonts/Tajawal-Regular.woff2','fonts/Tajawal-Bold.woff2','fonts/Amiri-Regular.woff2','fonts/Amiri-Bold.woff2',
 'fonts/JetBrainsMono-Regular.woff2','fonts/JetBrainsMono-Bold.woff2',
 'lib/html2canvas.min.js','lib/jspdf.umd.min.js'];
self.addEventListener('install',e=>{
  e.waitUntil(Promise.all([
    caches.open(CACHE).then(c=>Promise.allSettled(SHELL.map(u=>c.add(new Request(u,{cache:'reload'}))))), // v9.40: نتجاوز كاش المتصفح العادي حتى لا تختلط ملفات إصدارين (مثلاً router قديم مع db جديد)
    caches.open(BIBLE).then(c=>Promise.allSettled(['bible/index.json','bible/agpeya.json'].map(u=>c.add(new Request(u,{cache:'reload'})))))   // الفهرس والأجبية جاهزين أوفلاين؛ باقي الأسفار تتخزّن عند أول فتح
  ]));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!==BIBLE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',e=>{ if(e.data==='SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin) return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit=>{
    const store=new URL(e.request.url).pathname.includes('/bible/')?BIBLE:CACHE;
    const net=fetch(e.request).then(r=>{ if(r.ok){ const cp=r.clone(); caches.open(store).then(c=>c.put(e.request,cp)); } return r; }).catch(()=>hit);
    return hit||net;
  }));
});

// (v9.45) إشعارات Web Push: بتوصل حتى لو التطبيق مقفول. الشكل: {title, body, tag?, url?}. لازم نعرض إشعار دايماً (userVisibleOnly).
self.addEventListener('push',e=>{
  let d={}; try{ d=e.data?e.data.json():{}; }catch(_){ try{ d={body:e.data.text()}; }catch(__){} }
  const title=String(d.title||'خدمة إعدادي').slice(0,80), tag=d.tag?String(d.tag).slice(0,60):undefined;
  e.waitUntil((async()=>{
    // (v9.46) «أول واحد يشتغل يلغي التاني»: لو في إشعار بنفس الـtag ظاهر (جه من التنبيه المحلي مثلاً) الجديد يستبدله بصمت، إلا لو طالب تنبيه (ren) زي التذكير التاني
    let dup=false; if(tag){ try{ dup=(await self.registration.getNotifications({tag})).length>0; }catch(_){} }
    const quiet=dup&&!d.ren;
    await self.registration.showNotification(title,{body:String(d.body||'').slice(0,200),tag,renotify:!!tag&&!quiet,silent:quiet||undefined,lang:'ar',dir:'rtl',icon:'icons/icon-192.png',badge:'icons/icon-192.png',data:{url:d.url||'./'}});
  })());
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const u=new URL((e.notification.data&&e.notification.data.url)||'./',self.registration.scope);   // نفس الأصل فقط
  const home=self.registration.scope, url=u.origin===self.location.origin?u.href:home;
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    const c=l[0];
    if(!c) return clients.openWindow(url);
    return c.focus().then(()=>{ if(url!==home&&'navigate' in c) return c.navigate(url).catch(()=>{}); });
  }));
});
// لو خدمة الإشعارات غيّرت الاشتراك: نبلّغ التطبيق (لو مفتوح) يجدّد تسجيله؛ ولو مقفول بيتجدد عند أول فتح
self.addEventListener('pushsubscriptionchange',e=>{
  e.waitUntil(self.clients.matchAll({includeUncontrolled:true,type:'window'}).then(l=>l.forEach(c=>c.postMessage({type:'push-resub'}))));
});
