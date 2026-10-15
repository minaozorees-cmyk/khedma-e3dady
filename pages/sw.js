// غيّر VERSION مع كل تحديث ليصل للأجهزة
const VERSION='v9.16', CACHE='lawha-'+VERSION;
const SHELL=['./','index.html','manifest.json','css/app.css','css/fonts.css',
 'js/db.js','js/auth.js','js/router.js','js/register.js','js/consts.js','js/dates.js','js/store.js','js/reminders.js','js/backup.js','js/books.js','js/book-schema.js','js/exam-engine.js','js/results.js','js/sync.js','js/config.js','js/exam-session.js','js/login.js','js/functions.js','js/sapi.js','js/inbox.js','js/update.js','js/req-watch.js','js/ui.js','modules/me/index.js','modules/owner/index.js','modules/owner/members.js','modules/account/index.js','modules/messages/index.js','modules/messages/staff.js','modules/followup/index.js','modules/attendance/index.js','modules/owner/staff.js','modules/owner/tools.js','modules/registry.json',
 'modules/books/index.js','modules/agpeya/index.js','modules/liturgy/index.js','modules/confession/index.js',
 'books/index.json','pages/servant.html','pages/generator.html',
 'icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png',
 // اختيارية: لو الملف غير موجود لا يفشل التثبيت
 'fonts/Cairo-Variable.woff2','fonts/Tajawal-Regular.woff2','fonts/Tajawal-Bold.woff2','fonts/Amiri-Regular.woff2','fonts/Amiri-Bold.woff2',
 'fonts/JetBrainsMono-Regular.woff2','fonts/JetBrainsMono-Bold.woff2',
 'lib/html2canvas.min.js','lib/jspdf.umd.min.js'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(SHELL.map(u=>c.add(u)))));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',e=>{ if(e.data==='SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin) return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit=>{
    const net=fetch(e.request).then(r=>{ if(r.ok){ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); } return r; }).catch(()=>hit);
    return hit||net;
  }));
});

self.addEventListener('notificationclick',e=>{ e.notification.close(); e.waitUntil(clients.matchAll({type:'window'}).then(l=>l.length?l[0].focus():clients.openWindow('./'))); });
