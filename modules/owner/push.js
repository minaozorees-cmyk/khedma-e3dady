// لوحة «الإشعارات» (v9.45 — المرحلة ١): المالك يشوف الأجهزة المشتركة ويجرّب الإرسال. للمالك فقط (الحماية الفعلية: RLS على push_subscriptions + التحقق داخل Edge Function).
import * as SY from '../../js/sync.js';
import {api,all,errMsg,fmt,SB} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
const WHY={nofn:'الـEdge Function (push-send) غير منشورة بعد.',novapid:'مفاتيح VAPID غير مضبوطة في Supabase Secrets.',not_found:'مفيش جهاز مشترك لهذا المخدوم.',auth:'الجلسة انتهت. سجّل الدخول من جديد.',offline:'مفيش اتصال بالنت.',forbidden:'غير مسموح.',server:'تعذّر التنفيذ. جرّب بعد شوية.',failed:'الإرسال فشل.',gone:'الاشتراك انتهى وتم حذفه.'};
const dev=(ua)=>{ ua=String(ua||''); const os=/Android/i.test(ua)?'أندرويد':/iPhone|iPad|iOS/i.test(ua)?'آيفون':/Windows/i.test(ua)?'ويندوز':/Mac/i.test(ua)?'ماك':/Linux/i.test(ua)?'لينكس':'جهاز';
  const br=/Edg\//.test(ua)?'Edge':/SamsungBrowser/i.test(ua)?'Samsung':/Firefox/i.test(ua)?'Firefox':/Chrome|CriOS/.test(ua)?'Chrome':/Safari/.test(ua)?'Safari':''; return os+(br?' · '+br:''); };
export async function mount(el,{role}={}){
  if(role!=='owner'){ el.innerHTML='<div class="ph">هذه الصفحة للمالك فقط.</div>'; return; }
  const S={subs:[],names:new Map(),ok:true,busy:false,vapid:null};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.replaceChildren(root);
  const say=(t,bad)=>{ const m=root.querySelector('#msg'); if(m) m.innerHTML=t?`<div class="${bad?'err':'hint'}">${esc(t)}</div>`:''; };
  async function load(){
    root.innerHTML='<div class="ph">جارٍ التحميل…</div>';
    try{
      S.subs=await all('/rest/v1/push_subscriptions?select=id,profile_id,enabled,failed_count,last_ok_at,created_at,user_agent&profile_id=not.is.null&order=created_at.desc,id.asc');
      S.names=new Map((await all('/rest/v1/profiles?select=id,name,grade&order=id.asc')).map(p=>[p.id,p])); S.ok=true;
    }catch(e){ S.subs=[]; S.ok=false; }
    paint();
  }
  function paint(){
    const act=S.subs.filter(s=>s.enabled), people=new Set(act.map(s=>s.profile_id)).size, bad=S.subs.length-act.length;
    root.innerHTML=`<div id="msg"></div>
    <div class="card2"><b>🔔 الإشعارات الفعلية (Web Push)</b>
      <p class="hint">المرحلة ١: تسجيل الأجهزة والإشعار التجريبي فقط. التنبيهات التلقائية لمواعيد الإصحاحات تبدأ في المرحلة ٢.</p>
      ${S.ok?`<div class="stats"><div class="st"><b>${people}</b><small>مخدوم مشترك</small></div><div class="st"><b>${act.length}</b><small>جهاز فعّال</small></div><div class="st"><b>${bad}</b><small>معطّل</small></div></div>`
        :'<div class="err">جدول الاشتراكات غير موجود: شغّل SQL v9.45 (20261021_push_subscriptions.sql) في Supabase ثم اضغط تحديث.</div>'}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sec" style="${SB}" data-a="ping">🩺 فحص الإرسال</button>
        <button class="btn" style="${SB}" data-a="all"${S.ok&&act.length&&!S.busy?'':' disabled'}>🔔 تجريبي للكل (${act.length})</button><button class="btn sec" style="${SB}" data-a="reload">تحديث</button></div>
      <div class="hint" id="pv">${S.vapid===null?'':S.vapid?'✅ الدالة منشورة ومفاتيح VAPID مضبوطة.':'⚠️ الدالة منشورة لكن مفاتيح VAPID غير مضبوطة.'}</div></div>
    ${S.ok?`<div class="card2"><b>الأجهزة المشتركة</b>${S.subs.length?S.subs.map(s=>{ const p=S.names.get(s.profile_id);
      return `<div class="row" style="display:block"><div class="row" style="border:0;padding:0"><b>${esc(p?p.name:'—')}</b><span class="badge ${s.enabled?'on':'off'}">${s.enabled?'فعّال':'معطّل'}</span></div>
        <div class="k">${esc(p?p.grade:'')} · ${esc(dev(s.user_agent))} · اشترك ${fmt(s.created_at)}${s.last_ok_at?' · آخر نجاح '+fmt(s.last_ok_at):''}${s.failed_count?' · فشل متتالي '+Number(s.failed_count):''}</div>
        <div style="margin-top:6px"><button class="btn sec" style="${SB}" data-a="one" data-id="${esc(s.profile_id)}"${S.busy?' disabled':''}>🔔 إشعار تجريبي</button></div></div>`; }).join(''):'<div class="hint">لا توجد أجهزة مشتركة بعد. المخدوم يفعّلها من صفحة «أنا».</div>'}</div>`:''}`;
  }
  root.addEventListener('click',async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='reload') return load();
    if(a==='ping'){ t.disabled=true; const r=await SY.pushSend({action:'ping'}); S.vapid=r.ok?!!r.vapid:null; paint(); say(r.ok?'':(WHY[r.reason]||WHY.server),!r.ok); return; }
    if(a==='all'||a==='one'){
      if(a==='all'&&!confirm('هيتبعت إشعار تجريبي لكل الأجهزة المشتركة. متابعة؟')) return;
      S.busy=true; paint(); say('جارٍ الإرسال…');
      const r=await SY.pushSend(a==='all'?{action:'test_all'}:{action:'test_profile',profile_id:t.dataset.id});
      S.busy=false; await load();
      say(r.ok?`تم: وصل ${Number(r.sent)||0} · فشل ${Number(r.failed)||0} · اتحذف ${Number(r.removed)||0}`:(WHY[r.reason]||WHY.server),!r.ok);
    }
  });
  load();
}
