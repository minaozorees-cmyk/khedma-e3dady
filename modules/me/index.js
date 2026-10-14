import * as A from '../../js/auth.js';
import * as B from '../../js/backup.js';
import * as db from '../../js/db.js';
import * as D from '../../js/dates.js';
import {esc} from '../../js/consts.js';
export async function mount(el){
  const p=await A.activeProfile();
  if(!p){ el.innerHTML='<div class="ph">غير مسجّل.</div>'; return; }
  const st=(await db.get('settings'))||{}, lb=await db.get('lastBackup');
  const notifOK=typeof Notification!=='undefined', perm=notifOK?Notification.permission:'unsupported';
  el.innerHTML=`<div class="gate"><div class="card2"><div class="k">الاسم</div><div>${esc(p.name)}</div>
    <div class="k">الصف</div><div>${esc(p.grade)}</div><div class="k">الجنس</div><div>${esc(p.gender)}</div>
    <div class="k">كود الاسترجاع</div><div class="code" style="font-size:1.6rem">${esc(p.code)}</div></div>
    <div class="card2"><b>النسخة الاحتياطية</b>
      <p class="warn">سجلات الأجبية والقداسات والاعتراف محفوظة على هذا الجهاز فقط. لو فقدته أو مُسحت بيانات التطبيق بدون نسخة احتياطية فستضيع. الملف يحتوي سجلاتك فاحتفظ به في مكان خاص.</p>
      <div class="hint">${lb?'آخر نسخة: '+D.fmt(D.key(new Date(lb)),{day:'numeric',month:'long',year:'numeric'}):'لم تحفظ نسخة بعد'}</div>
      <button class="btn" id="bx">حفظ ملف النسخة</button>
      ${B.canShareFiles()?'<button class="btn sec" id="bs">مشاركة الملف</button>':''}
      <button class="btn sec" id="bi">استيراد نسخة (دمج مع السجلات الحالية)</button>
      <input type="file" id="bf" accept="application/json,.json" hidden><div class="hint" id="bm"></div></div>
    <div class="card2"><b>التذكيرات</b>
      <label class="chk"><input type="checkbox" id="rm" ${st.remind===false?'':'checked'}> تفعيل التذكيرات داخل التطبيق</label>
      <button class="btn sec" id="nt" ${perm==='granted'||perm==='denied'||!notifOK?'disabled':''}>${!notifOK?'الإشعارات غير مدعومة':perm==='granted'?'إشعارات الجهاز مفعّلة':perm==='denied'?'الإشعارات محجوبة من إعدادات المتصفح':'تفعيل إشعارات الجهاز'}</button>
      <div class="hint">الإشعار يظهر عند فتح التطبيق بنص عام ("تذكير من التطبيق")، وقد تحتاج بعض هواتف الأندرويد لاستثناء التطبيق من توفير البطارية.</div></div>
    <button class="btn sec" id="lo">تسجيل الخروج</button>
    <p class="hint">الخروج لا يمسح بياناتك من الجهاز، ويمكنك الرجوع بالاسم والكود.</p></div>`;
  const $=(s)=>el.querySelector(s), msg=(t)=>{ $('#bm').textContent=t; };
  const doExport=(share)=>async()=>{ try{ await B.exportFile(share); msg('تم حفظ النسخة ✅'); }catch(e){ if(e&&e.name!=='AbortError') msg('تعذّر حفظ الملف'); } };
  $('#bx').onclick=doExport(false); const bs=$('#bs'); if(bs) bs.onclick=doExport(true);
  $('#bi').onclick=()=>$('#bf').click();
  $('#bf').onchange=async(e)=>{
    const f=e.target.files[0]; e.target.value=''; if(!f) return;
    try{
      const r=B.parseBackup(await f.text());
      if(r.owner&&r.owner.id&&r.owner.id!==p.id&&!confirm('هذه النسخة تخص «'+r.owner.name+'». هل تريد دمج سجلاتها مع حسابك الحالي؟')) return;
      const added=await B.applyBackup(r.clean); msg(`تم الاستيراد: ${D.n(added)} سجل جديد من ${D.n(r.count)}`);
    }catch(err){ msg(err.message||'تعذّر الاستيراد'); }
  };
  $('#rm').onchange=async(e)=>{ const s=(await db.get('settings'))||{}; s.remind=e.target.checked; await db.set('settings',s); dispatchEvent(new Event('lawha:data')); };
  $('#nt').onclick=async()=>{
    const r=await Notification.requestPermission();
    if(r==='granted'){ try{ await (await navigator.serviceWorker.ready).showNotification('تذكير من التطبيق',{body:'تم تفعيل الإشعارات',icon:new URL('../../icons/icon-192.png',import.meta.url).href}); }catch(e){} }
    mount(el);
  };
  $('#lo').onclick=async()=>{ await A.logout(); location.reload(); };
}
