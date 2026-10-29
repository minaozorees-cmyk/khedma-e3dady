import * as A from '../../js/auth.js';
import * as B from '../../js/backup.js';
import * as db from '../../js/db.js';
import * as ACC from '../../js/accounts.js';
import * as SY from '../../js/sync.js';
import * as D from '../../js/dates.js';
import * as LIB from '../../js/library.js';
import * as R from '../../js/results.js';
import * as EX from '../../js/exam-session.js';
import {loadAll} from '../../js/books.js';
import * as PUSH from '../../js/push.js';
import {esc} from '../../js/consts.js';
import {APP_VERSION} from '../../js/version.js';   // (v9.497)

const ar=(v)=>D.n(v);
function agpeyaStats(S){
  const days=S&&S.days||{}, min=Math.max(1,Math.min(7,Number(S&&S.streakMin)||1));
  const today=D.key(), count=k=>(days[k]||[]).length;
  let k=count(today)>=min?today:D.addDays(today,-1), streak=0;
  while(streak<4000&&count(k)>=min){streak++;k=D.addDays(k,-1);}
  return {streak, today:count(today), week:Array.from({length:7},(_,i)=>count(D.addDays(today,-i))).reduce((a,b)=>a+b,0)};
}
export async function mount(el){
  const p=await A.activeProfile();
  if(!p){ el.innerHTML='<div class="ph">غير مسجّل.</div>'; return; }
  const [st,lb,last,ag,lit,attempts,session,bookData] = await Promise.all([
    db.get('settings').catch(()=>null),db.get('lastBackup').catch(()=>null),LIB.getLast().catch(()=>null),db.get('agpeya').catch(()=>null),db.get('liturgy').catch(()=>null),R.all().catch(()=>[]),EX.load().catch(()=>null),loadAll().catch(()=>({books:[]}))
  ]);
  const hasPin=ACC.hasPin(p.id);
  const settings=st||{}, notifOK=typeof Notification!=='undefined', perm=notifOK?Notification.permission:'unsupported';
  let idx=[]; try{idx=await LIB.index();}catch(e){}
  const lastBook=last&&idx.find(x=>x.id===last.id);
  const stats=agpeyaStats(ag||{});
  const books=bookData&&bookData.books||[];
  const completed=new Set(attempts.map(a=>a.bookId+'|'+a.chapterNum));
  const allChapters=books.reduce((n,b)=>n+(b.chapters||[]).length,0);
  const doneCount=completed.size;
  const pct=allChapters?Math.min(100,Math.round(doneCount*100/allChapters)):0;
  const litEntries=lit&&lit.entries||{};
  const litCount=Object.keys(litEntries).length;
  const activeSession=!!session;
  const examName=activeSession?(books.find(b=>b.id===session.bid)?.title||session.bid)+' — إصحاح '+D.n(session.num):'';
  el.innerHTML=`<div class="gate">
    <div class="card2" style="background:linear-gradient(135deg,rgba(201,168,76,.18),rgba(201,168,76,.04));">
      <div class="k">أهلًا بيك</div><h2 class="ttl" style="margin:4px 0 10px">${esc(p.name)}</h2>
      <div class="hint">${esc(p.grade)} · رحلتك التعليمية والروحية في مكان واحد</div>
      <div class="stats">
        <div class="st"><b>${ar(doneCount)}</b><small>إصحاح له نتيجة امتحان على الجهاز</small></div>
        <div class="st"><b>${ar(stats.streak)}</b><small>سلسلة الأجبية (أيام)</small></div>
        <div class="st"><b>${ar(litCount)}</b><small>قداس مسجّل على جهازك</small></div>
      </div>
    </div>
    <div class="card2"><div class="row" style="border:0;padding:0"><b>📚 تقدم الامتحانات</b><b>${allChapters?ar(pct)+'٪':'—'}</b></div>
      <div class="prog"><i style="width:${pct}%"></i></div>
      <div class="hint">${allChapters?'تم تسجيل نتيجة امتحان على الجهاز لـ '+ar(doneCount)+' من '+ar(allChapters)+' إصحاح متاح في ملفات الامتحانات. النسبة تقيس وجود نتيجة، لا إتقان السفر.':'تعذر حساب تقدم الامتحانات من ملفات الامتحان المتاحة.'}</div>
      <button class="btn" data-go="books">📖 افتح المسابقة</button>
    </div>
    <div class="card2"><b>▶️ كمّل من حيث وقفت</b>
      ${activeSession?`<p>${esc(examName)}</p><button class="btn" data-go="books">استكمال الامتحان المفتوح</button>`:
        lastBook?`<p>${esc(lastBook.title)} — إصحاح ${ar(last.n)}</p><button class="btn" data-go="library">كمّل القراءة</button>`:
        '<p class="hint">لسه مفيش قراءة محفوظة. اختار سفر وابدأ رحلتك.</p><button class="btn" data-go="library">افتح المكتبة</button>'}
    </div>
    <div class="card2"><b>🙏 الأجبية</b>
      <div class="stats"><div class="st"><b>${ar(stats.today)} / 7</b><small>صلوات مسجلة اليوم</small></div><div class="st"><b>${ar(stats.week)}</b><small>صلوات آخر ٧ أيام</small></div></div>
      <button class="btn sec" data-go="agpeya">افتح الأجبية</button>
    </div>
    <div class="card2"><b>⛪ القداسات</b><p class="hint">عندك ${ar(litCount)} سجل قداس محفوظ على هذا الجهاز.</p><button class="btn sec" data-go="liturgy">سجل القداسات</button></div>
    <div class="card2"><b>البيانات الشخصية</b><div class="k">الاسم</div><div>${esc(p.name)}</div>
      <div class="k">الصف</div><div>${esc(p.grade)}</div><div class="k">كود الاسترجاع</div><div class="code" style="font-size:1.6rem">${esc(p.code)}</div></div>
    <div class="card2"><b>النسخة الاحتياطية</b>
      <p class="warn">سجلات الأجبية والقداسات والاعتراف محفوظة على هذا الجهاز فقط. لو فقدته أو مُسحت بيانات التطبيق بدون نسخة احتياطية فستضيع. الملف يحتوي سجلاتك فاحتفظ به في مكان خاص.</p>
      <div class="hint">${lb?'آخر نسخة: '+D.fmt(D.key(new Date(lb)),{day:'numeric',month:'long',year:'numeric'}):'لم تحفظ نسخة بعد'}</div>
      <button class="btn" id="bx">حفظ ملف النسخة</button>
      ${B.canShareFiles()?'<button class="btn sec" id="bs">مشاركة الملف</button>':''}
      <button class="btn sec" id="bi">استيراد نسخة (دمج مع السجلات الحالية)</button>
      <input type="file" id="bf" accept="application/json,.json" hidden><div class="hint" id="bm"></div></div>
    <div class="card2"><b>التذكيرات</b>
      <label class="chk"><input type="checkbox" id="rm" ${settings.remind===false?'':'checked'}> تفعيل التذكيرات داخل التطبيق</label>
      <button class="btn sec" id="nt" ${perm==='granted'||perm==='denied'||!notifOK?'disabled':''}>${!notifOK?'الإشعارات غير مدعومة':perm==='granted'?'إشعارات الجهاز مفعّلة':perm==='denied'?'الإشعارات محجوبة من إعدادات المتصفح':'تفعيل إشعارات الجهاز'}</button>
      <div class="hint">الإشعار يظهر عند فتح التطبيق بنص عام ("تذكير من التطبيق")، وقد تحتاج بعض هواتف الأندرويد لاستثناء التطبيق من توفير البطارية.</div>
      <div id="pushbox" style="margin-top:14px"></div></div>
    <div class="card2"><b>👥 الحسابات على هذا الجهاز</b>
      <p class="hint">${ar(ACC.count())} من ${ar(ACC.MAX)} حسابات. تبديل المخدوم لا يمسح أي بيانات. الرقم السري يُطلب فقط لما يكون على الجهاز أكتر من حساب.</p>
      <button class="btn" id="sw">🔁 تبديل المخدوم</button>
      <button class="btn sec" id="pinb">🔒 ${hasPin?'تغيير الرقم السري':'وضع رقم سري'}</button>${hasPin?'<button class="btn sec" id="pinx">إلغاء الرقم السري</button>':''}
      <div id="pinbox"></div>
      <button class="btn sec" id="rmv" style="color:var(--rust)">🗑️ إزالة هذا الحساب من الجهاز</button>
      <div class="hint" id="acm"></div></div>
    <div class="card2"><b>ℹ️ معلومات التطبيق</b>
      <div class="hint" id="appver">رقم النسخة: ${esc(APP_VERSION)}</div>
      <div class="hint" id="lnkst">حالة الاتصال: جارٍ التحقق…</div></div></div>`;
  // (v9.497) حالة ربط الجهاز بالحساب: قراءة فقط. أي فشل = «تعذّر التحقق» والصفحة شغالة.
  SY.linkStatus().catch(()=>null).then(v=>{ const x=el.querySelector('#lnkst'); if(!x) return;
    x.textContent=v===true?'حالة الاتصال: ✅ الجهاز مربوط بحسابك':v===false?'حالة الاتصال: ⚠️ الجهاز مش مربوط بحسابك. كلّم خادمك وابعتله رقم النسخة.':'حالة الاتصال: تعذّر التحقق الآن (تأكد من النت)';
    if(v===false) x.className='warn'; }).catch(()=>{});
  const $=(s)=>el.querySelector(s), msg=(t)=>{ const m=$('#bm'); if(m) m.textContent=t; };
  el.onclick=(e)=>{ const t=e.target.closest('[data-go]'); if(t) location.hash='#/'+t.dataset.go; };
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

  // (v9.45) إشعارات الإصحاحات حتى لو التطبيق مقفول (Web Push). في المرحلة ١: تفعيل الجهاز + إشعار تجريبي.
  const PM={denied:'الإذن اتحجب.',dismissed:'ما اتفعّلش (الإذن اتقفل).',subscribe:'تعذّر الاشتراك. جرّب تاني على نت أقوى.',offline:'مفيش اتصال بالنت.',nosql:'الخدمة لسه ما اتجهّزتش على السيرفر.',not_owner:'تعذّر ربط الحساب. حدّث التطبيق وجرّب تاني.',server:'تعذّر التنفيذ. جرّب بعد شوية.',unsupported:'الإشعارات غير مدعومة هنا.',
    rate:'استنى شوية وجرّب تاني.',nofn:'دالة الإرسال غير منشورة على السيرفر.',novapid:'مفاتيح الإرسال غير مضبوطة على السيرفر.',not_found:'الجهاز غير مسجّل. اضغط «إعادة التفعيل».',failed:'الإرسال فشل. جرّب تاني.',gone:'الاشتراك انتهى. فعّل تاني.'};
  async function paintPush(note){
    const b=$('#pushbox'); if(!b) return;
    const st=await PUSH.state(p.id).catch(()=>({s:'off'})), say=(t)=>note?`<div class="hint" id="pushm">${esc(note)}</div>`:'<div class="hint" id="pushm"></div>';
    if(st.s==='off'){ b.innerHTML=''; return; }
    const head='<b>🔔 إشعارات الإصحاحات</b>', intro='<div class="hint">تنبيه لما إصحاح يتفتح، حتى لو التطبيق مقفول. التنبيهات التلقائية بتبدأ في تحديث قريب، ودلوقتي تقدر تفعّل جهازك وتجرّب إشعار تجريبي.</div>';
    const bat='<div class="hint">لو الإشعار اتأخر: من إعدادات الأندرويد اسمح لـChrome بالعمل في الخلفية بدون توفير بطارية.</div>';
    if(st.s==='unsupported') b.innerHTML=head+'<div class="hint">المتصفح ده ما بيدعمش الإشعارات والتطبيق مقفول. على آيفون: ثبّت التطبيق على الشاشة الرئيسية الأول (مشاركة ← إضافة إلى الشاشة الرئيسية).</div>';
    else if(st.s==='denied') b.innerHTML=head+'<div class="hint">الإشعارات محجوبة. افتح إعدادات الموقع/التطبيق في الموبايل واسمح بالإشعارات، وبعدين ارجع هنا.</div>';
    else if(st.s==='idle') b.innerHTML=head+intro+'<button class="btn" id="pe">🔔 فعّل إشعارات الإصحاحات</button>'+say()+bat;
    else if(st.s==='partial') b.innerHTML=head+'<div class="warn">اشتراك الجهاز غير مكتمل.</div><button class="btn" id="pe">إعادة التفعيل</button>'+say();
    else b.innerHTML=head+'<div class="hint">✅ مفعّلة على هذا الجهاز'+(st.unsure?' (لم يتم التحقق من السيرفر، لا يوجد اتصال)':'')+'.</div><button class="btn sec" id="pt">إرسال إشعار تجريبي</button><button class="btn sec" id="px">إيقاف</button>'+say()+bat;
    const m=(t)=>{ const x=$('#pushm'); if(x) x.textContent=t; }, lock=(x,on)=>{ if(x){ x.disabled=on; } };
    const pe=$('#pe'), pt=$('#pt'), px=$('#px');
    if(pe) pe.onclick=async()=>{ lock(pe,true); const r=await PUSH.enable(p.id); if(r.ok) return paintPush('اتفعّلت ✅ جرّب «إرسال إشعار تجريبي».'); lock(pe,false); m(PM[r.reason]||PM.server); };
    if(pt) pt.onclick=async()=>{ lock(pt,true); m('جارٍ الإرسال…'); const r=await PUSH.test(); lock(pt,false); m(r.ok?'اتبعت إشعار تجريبي ✅ لو ما ظهرش خلال ثواني راجع إعدادات إشعارات Chrome وتوفير البطارية.':(PM[r.reason]||PM.server)); };
    if(px) px.onclick=async()=>{ lock(px,true); const r=await PUSH.disable(p.id); if(r.ok) return paintPush('اتوقفت الإشعارات على هذا الحساب.'); lock(px,false); m(PM[r.reason]||PM.server); };
  }
  paintPush();
  $('#rm').onchange=async(e)=>{ const s=(await db.get('settings'))||{}; s.remind=e.target.checked; await db.set('settings',s); dispatchEvent(new Event('lawha:data')); };
  $('#nt').onclick=async()=>{
    const r=await Notification.requestPermission();
    if(r==='granted'){ try{ await (await navigator.serviceWorker.ready).showNotification('تذكير من التطبيق',{body:'تم تفعيل الإشعارات',icon:new URL('../../icons/icon-192.png',import.meta.url).href}); }catch(e){} }
    mount(el);
  };
  const am=(t)=>{ const m=$('#acm'); if(m) m.textContent=t; };
  $('#sw').onclick=()=>{ A.logout(); location.reload(); };
  $('#pinb').onclick=()=>{
    if(!ACC.pinSupported()){ am('المتصفح ده لا يدعم حفظ الرقم السري.'); return; }
    const IN='type="password" inputmode="numeric" maxlength="4" dir="ltr" autocomplete="off" style="text-align:center;letter-spacing:8px"';
    $('#pinbox').innerHTML=`${hasPin?`<div class="fld"><label>الرقم الحالي</label><input id="pc" ${IN}></div>`:''}
      <div class="fld"><label>الرقم الجديد (٤ أرقام)</label><input id="p1" ${IN}></div>
      <div class="fld"><label>أعد كتابته</label><input id="p2" ${IN}></div><button class="btn" id="ps">حفظ</button>`;
    $('#ps').onclick=async()=>{
      if(hasPin){ const r=await ACC.verifyPin(p.id,$('#pc').value); if(!r.ok){ am(r.locked?'محاولات كتير غلط. استنى ٥ دقايق.':'الرقم الحالي غلط.'); return; } }
      const a=ACC.validPin($('#p1').value), b=ACC.validPin($('#p2').value);
      if(!a){ am('الرقم لازم يكون ٤ أرقام.'); return; }
      if(a!==b){ am('الرقمان غير متطابقين.'); return; }
      if(await ACC.setPin(p.id,a)) mount(el); else am('تعذّر حفظ الرقم.');
    };
  };
  const px=$('#pinx'); if(px) px.onclick=async()=>{
    const v=prompt('اكتب الرقم السري الحالي لإلغائه'); if(v==null) return;
    const r=await ACC.verifyPin(p.id,v); if(!r.ok){ am(r.locked?'محاولات كتير غلط. استنى ٥ دقايق.':'الرقم غلط.'); return; }
    await ACC.clearPin(p.id); mount(el);
  };
  $('#rmv').onclick=async()=>{
    if(!confirm('هتتشال «'+p.name+'» من الجهاز مع سجلات الأجبية والقداسات والاعتراف والرسائل. تأكد إنك حافظ كود الاسترجاع ('+p.code+') ونسخة احتياطية. متأكد؟')) return;
    if(ACC.hasPin(p.id)){ const v=prompt('اكتب الرقم السري للتأكيد'); if(v==null) return; const r=await ACC.verifyPin(p.id,v); if(!r.ok){ am(r.locked?'محاولات كتير غلط. استنى ٥ دقايق.':'الرقم غلط.'); return; } }
    am('جارٍ رفع البيانات المعلّقة…'); try{ await SY.flush(); }catch(e){}
    const r=await ACC.remove(p.id);
    if(!r.ok){ am('في '+ar(r.n)+' بيانات لسه ما اترفعتش للسيرفر. اتصل بالنت وجرّب تاني.'); return; }
    location.reload();
  };
}
