// لوحة «الإشعارات» (v9.46): الأجهزة المشتركة + إعدادات الجدولة التلقائية + معاينة + سجل الإرسال. للمالك فقط
// (الحماية الفعلية: RLS على push_subscriptions/push_settings/push_log + التحقق داخل Edge Function).
import * as SY from '../../js/sync.js';
import {api,all,errMsg,fmt,SB} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
const WHY={nofn:'الـEdge Function (push-send) غير منشورة بعد.',novapid:'مفاتيح VAPID غير مضبوطة في Supabase Secrets.',not_found:'مفيش جهاز مشترك لهذا المخدوم.',auth:'الجلسة انتهت. سجّل الدخول من جديد.',offline:'مفيش اتصال بالنت.',forbidden:'غير مسموح.',server:'تعذّر التنفيذ. جرّب بعد شوية.',failed:'الإرسال فشل.',gone:'الاشتراك انتهى وتم حذفه.',bad:'طلب غير صالح.'};
const ST={pending:'قيد الإرسال',sent:'اتبعت ✅',failed:'فشل ❌',skipped_opened:'تخطّي: فتحه',skipped_closed:'تخطّي: اتقفل',skipped_quiet:'تخطّي: ساعات الهدوء',skipped_noprev:'تخطّي: ما وصلهوش الأول'};
const dev=(ua)=>{ ua=String(ua||''); const os=/Android/i.test(ua)?'أندرويد':/iPhone|iPad|iOS/i.test(ua)?'آيفون':/Windows/i.test(ua)?'ويندوز':/Mac/i.test(ua)?'ماك':/Linux/i.test(ua)?'لينكس':'جهاز';
  const br=/Edg\//.test(ua)?'Edge':/SamsungBrowser/i.test(ua)?'Samsung':/Firefox/i.test(ua)?'Firefox':/Chrome|CriOS/.test(ua)?'Chrome':/Safari/.test(ua)?'Safari':''; return os+(br?' · '+br:''); };
const HHMM=/^([01]\d|2[0-3]):[0-5]\d$/;
const ago=(iso)=>{ if(!iso) return null; const m=Math.round((Date.now()-Date.parse(iso))/60000); return m<1?'أقل من دقيقة':m<60?m+' دقيقة':m<1440?Math.round(m/60)+' ساعة':Math.round(m/1440)+' يوم'; };
export async function mount(el,{role}={}){
  if(role!=='owner'){ el.innerHTML='<div class="ph">هذه الصفحة للمالك فقط.</div>'; return; }
  const S={subs:[],names:new Map(),ok:true,busy:false,vapid:null,cron:null,cfg:null,sched:true,log:[],prev:null,books:new Map()};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.replaceChildren(root);
  const say=(t,bad)=>{ const m=root.querySelector('#msg'); if(m) m.innerHTML=t?`<div class="${bad?'err':'hint'}">${esc(t)}</div>`:''; };
  async function load(keepMsg){
    if(!keepMsg) root.innerHTML='<div class="ph">جارٍ التحميل…</div>';
    try{
      S.subs=await all('/rest/v1/push_subscriptions?select=id,profile_id,enabled,failed_count,last_ok_at,created_at,user_agent&profile_id=not.is.null&order=created_at.desc,id.asc');
      S.names=new Map((await all('/rest/v1/profiles?select=id,name,grade&order=id.asc')).map(p=>[p.id,p])); S.ok=true;
    }catch(e){ S.subs=[]; S.ok=false; }
    try{ const c=await api('/rest/v1/push_settings?select=*&id=eq.1'); S.cfg=(c&&c[0])||null; S.sched=!!S.cfg;
      S.log=await api('/rest/v1/push_log?select=profile_id,book_id,chapter_num,attempt,status,created_at&order=id.desc&limit=20'); }catch(e){ S.cfg=null; S.sched=false; S.log=[]; }
    try{ S.books=new Map((await all('/rest/v1/books?select=id,title&order=id.asc')).map(b=>[b.id,b.title])); }catch(e){}
    paint();
  }
  const bt=(id)=>S.books.get(id)||id;
  function schedHtml(){
    if(!S.sched) return '<div class="card2"><b>⏱ الجدولة التلقائية</b><div class="err">جداول الجدولة غير موجودة: شغّل SQL v9.46 (20261022_push_schedule.sql) في Supabase ثم اضغط تحديث.</div></div>';
    const c=S.cfg, a=ago(c.last_run_at), stale=!c.last_run_at||(Date.now()-Date.parse(c.last_run_at))>3*60000;
    return `<div class="card2"><b>⏱ الجدولة التلقائية</b>
      <p class="hint">إشعار عند ميعاد فتح كل إصحاح، وتذكير بعد المدة المحددة لمن لم يفتحه. التذكير التاني ما بيتبعتش في ساعات الهدوء ولا بعد قفل الإصحاح.</p>
      <div class="row" style="border:0;padding:0"><b>الحالة</b><span class="badge ${c.enabled?'on':'off'}">${c.enabled?'شغّالة':'مقفولة'}</span></div>
      <div class="${stale?'warn':'hint'}">${a?`آخر نبض للجدولة: قبل ${esc(a)}.${stale?' ⚠️ أكتر من ٣ دقايق: راجع pg_cron.':''}`:'⚠️ الجدولة لسه ما اشتغلتش. شغّل 20261022_push_cron.sql وتأكد من pg_cron وpg_net.'}</div>
      <div style="margin-top:8px"><button class="btn ${c.enabled?'sec':''}" style="${SB}" data-a="toggle">${c.enabled?'⏸ إيقاف الإشعارات التلقائية':'▶️ تشغيل الإشعارات التلقائية'}</button></div>
      <div class="fld"><label for="cf_f">دقائق التذكير التاني بعد الأول (٥–٧٢٠)</label><input id="cf_f" type="number" min="5" max="720" inputmode="numeric" value="${Number(c.followup_minutes)}"></div>
      <div class="fld"><label for="cf_m">عدد التذكيرات بعد الأول</label><select id="cf_m">${[0,1,2,3].map(n=>`<option value="${n}"${Number(c.max_followups)===n?' selected':''}>${n===0?'بدون تذكير':n===1?'مرة واحدة (موصى)':n+' مرات'}</option>`).join('')}</select></div>
      <div class="fld"><label>ساعات الهدوء (بتوقيت القاهرة): التذكير التاني ما بيتبعتش فيها</label>
        <div style="display:flex;gap:8px;align-items:center"><input id="cf_qf" type="time" value="${esc(c.quiet_from)}"><span>إلى</span><input id="cf_qt" type="time" value="${esc(c.quiet_to)}"></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn" style="${SB}" data-a="savecfg">💾 حفظ الإعدادات</button><button class="btn sec" style="${SB}" data-a="preview">👁 معاينة (بدون إرسال)</button></div>
      ${S.prev?prevHtml():''}</div>`;
  }
  function prevHtml(){
    const r=S.prev; if(!r.ok) return '';
    const items=r.items||[];
    return `<div class="hint" style="margin-top:10px"><b>المعاينة الآن</b> ${r.quiet?'(داخل ساعات الهدوء)':''}${r.enabled?'':' · ⚠️ الإشعارات التلقائية مقفولة حالياً'}</div>`+
      (items.length?items.map(i=>`<div class="row" style="display:block"><b>إصحاح ${Number(i.chapter_num)} من ${esc(bt(i.book_id))} · ${Number(i.attempt)===1?'الأول':'تذكير '+(Number(i.attempt)-1)}</b>
        <div class="k">هيتبعت لـ ${Number(i.would_send)}${Object.keys(i.skipped||{}).length?' · '+Object.entries(i.skipped).map(([k,v])=>esc(ST[k]||k)+' '+Number(v)).join(' · '):''}</div></div>`).join(''):'<div class="hint">مفيش إصحاح مستحق دلوقتي.</div>');
  }
  function logHtml(){
    if(!S.sched) return '';
    return `<div class="card2"><b>آخر ٢٠ إرسال</b>${S.log.length?S.log.map(l=>{ const p=S.names.get(l.profile_id);
      return `<div class="row" style="display:block"><b>${esc(p?p.name:'—')}</b> <span class="k">· إصحاح ${Number(l.chapter_num)} من ${esc(bt(l.book_id))} · ${Number(l.attempt)===1?'الأول':'تذكير '+(Number(l.attempt)-1)}</span><div class="k">${esc(ST[l.status]||l.status)} · ${fmt(l.created_at)}</div></div>`; }).join(''):'<div class="hint">لسه مفيش إرسال تلقائي.</div>'}</div>`;
  }
  function paint(){
    const act=S.subs.filter(s=>s.enabled), people=new Set(act.map(s=>s.profile_id)).size, bad=S.subs.length-act.length;
    root.innerHTML=`<div id="msg"></div>
    <div class="card2"><b>🔔 الإشعارات الفعلية (Web Push)</b>
      ${S.ok?`<div class="stats"><div class="st"><b>${people}</b><small>مخدوم مشترك</small></div><div class="st"><b>${act.length}</b><small>جهاز فعّال</small></div><div class="st"><b>${bad}</b><small>معطّل</small></div></div>`
        :'<div class="err">جدول الاشتراكات غير موجود: شغّل SQL v9.45 (20261021_push_subscriptions.sql) في Supabase ثم اضغط تحديث.</div>'}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sec" style="${SB}" data-a="ping">🩺 فحص الإرسال</button>
        <button class="btn" style="${SB}" data-a="all"${S.ok&&act.length&&!S.busy?'':' disabled'}>🔔 تجريبي للكل (${act.length})</button><button class="btn sec" style="${SB}" data-a="reload">تحديث</button></div>
      <div class="hint" id="pv">${S.vapid===null?'':(S.vapid?'✅ الدالة منشورة ومفاتيح VAPID مضبوطة.':'⚠️ الدالة منشورة لكن مفاتيح VAPID غير مضبوطة.')+(S.cron===null?'':S.cron?' ✅ CRON_SECRET مضبوط.':' ⚠️ CRON_SECRET غير مضبوط (الجدولة لن تعمل).')}</div></div>
    ${schedHtml()}${logHtml()}
    ${S.ok?`<div class="card2"><b>الأجهزة المشتركة</b>${S.subs.length?S.subs.map(s=>{ const p=S.names.get(s.profile_id);
      return `<div class="row" style="display:block"><div class="row" style="border:0;padding:0"><b>${esc(p?p.name:'—')}</b><span class="badge ${s.enabled?'on':'off'}">${s.enabled?'فعّال':'معطّل'}</span></div>
        <div class="k">${esc(p?p.grade:'')} · ${esc(dev(s.user_agent))} · اشترك ${fmt(s.created_at)}${s.last_ok_at?' · آخر نجاح '+fmt(s.last_ok_at):''}${s.failed_count?' · فشل متتالي '+Number(s.failed_count):''}</div>
        <div style="margin-top:6px"><button class="btn sec" style="${SB}" data-a="one" data-id="${esc(s.profile_id)}"${S.busy?' disabled':''}>🔔 إشعار تجريبي</button></div></div>`; }).join(''):'<div class="hint">لا توجد أجهزة مشتركة بعد. المخدوم يفعّلها من صفحة «أنا».</div>'}</div>`:''}`;
  }
  const patch=(body)=>api('/rest/v1/push_settings?id=eq.1',{method:'PATCH',prefer:'return=minimal',body:{...body,updated_at:new Date().toISOString()}});
  root.addEventListener('click',async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='reload'){ S.prev=null; return load(); }
    if(a==='ping'){ t.disabled=true; const r=await SY.pushSend({action:'ping'}); S.vapid=r.ok?!!r.vapid:null; S.cron=r.ok?!!r.cron:null; paint(); say(r.ok?'':(WHY[r.reason]||WHY.server),!r.ok); return; }
    if(a==='preview'){ t.disabled=true; const r=await SY.pushSend({action:'dispatch_preview'}); S.prev=r; paint(); say(r.ok?'':(WHY[r.reason]||WHY.server),!r.ok); return; }
    if(a==='toggle'){
      const on=!S.cfg.enabled; if(on&&!confirm('تشغيل الإشعارات التلقائية؟ هتتبعت للمخدومين المشتركين عند ميعاد فتح كل إصحاح من دلوقتي.')) return;
      t.disabled=true; try{ await patch({enabled:on}); await load(true); say(on?'اتشغّلت الإشعارات التلقائية ✅':'اتوقفت الإشعارات التلقائية.'); }catch(x){ paint(); say(errMsg(x),true); } return;
    }
    if(a==='savecfg'){
      const f=Number(root.querySelector('#cf_f').value), m=Number(root.querySelector('#cf_m').value), qf=root.querySelector('#cf_qf').value, qt=root.querySelector('#cf_qt').value;
      if(!Number.isInteger(f)||f<5||f>720) return say('دقائق التذكير لازم تكون بين ٥ و٧٢٠.',true);
      if(!Number.isInteger(m)||m<0||m>3) return say('عدد التذكيرات من ٠ لـ٣.',true);
      if(!HHMM.test(qf)||!HHMM.test(qt)) return say('اكتب ساعات الهدوء بصيغة صحيحة.',true);
      t.disabled=true; try{ await patch({followup_minutes:f,max_followups:m,quiet_from:qf,quiet_to:qt}); S.prev=null; await load(true); say('اتحفظت الإعدادات ✅'); }catch(x){ paint(); say(errMsg(x),true); } return;
    }
    if(a==='all'||a==='one'){
      if(a==='all'&&!confirm('هيتبعت إشعار تجريبي لكل الأجهزة المشتركة. متابعة؟')) return;
      S.busy=true; paint(); say('جارٍ الإرسال…');
      const r=await SY.pushSend(a==='all'?{action:'test_all'}:{action:'test_profile',profile_id:t.dataset.id});
      S.busy=false; await load(true);
      say(r.ok?`تم: وصل ${Number(r.sent)||0} · فشل ${Number(r.failed)||0} · اتحذف ${Number(r.removed)||0}`:(WHY[r.reason]||WHY.server),!r.ok);
    }
  });
  load();
}
