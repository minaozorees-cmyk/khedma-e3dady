// (v9.493) 👯 الأسماء المكررة — المالك فقط. بدون SQL. بيجمّع الحسابات النشطة بنفس الاسم ويورّي لكل حساب: تاريخ التسجيل، آخر دخول،
// الإصحاحات اللي حلّها، والكود. الحساب «الفاضي» (ما حلّش حاجة) ينفع يتأرشف (نفس أرشفة لوحة المالك، وبترجع من «مؤرشف ← إلغاء الأرشفة»).
// الحساب اللي فيه نتايج ما بيتأرشفش من هنا (الأرشفة بتخفي نتايجه)؛ الكوبونات بتجمع الحسابين تلقائياً في تقرير الكوبونات.
import * as SY from '../../js/sync.js';
import {esc} from '../../js/consts.js';
import {n} from '../../js/dates.js';
import {api,all,fmt,errMsg,SB} from '../../js/sapi.js';
import {findDupes,booksText} from '../../js/dupes.js';

const ADV={
  oneHasResults:'الحساب اللي فيه النتايج هو اللي يفضل. الحساب الفاضي ينفع يتأرشف (اتأكد إن المخدوم بيدخل بالحساب التاني).',
  manyHaveResults:'⚠️ أكتر من حساب حلّوا إصحاحات. ما تأرشفش حاجة (هتخبي نتايج): سيبهم، وتقرير الكوبونات بيجمعهم في سطر واحد. الدمج الكامل لسه مش متاح.',
  allEmpty:'كلهم فاضيين. أرشف الأقل استخداماً وسيب واحد بس.',
  unknown:'تعذّر تحميل النتايج، فمش هعرض أرشفة (مش هعرف مين الفاضي). اضغط «🔄 تحديث» بعد ما النت يتظبط.'
};
export async function mount(el,{role}={}){
  if(role!=='owner'){ el.innerHTML='<div class="ph">هذه الصفحة للمالك فقط.</div>'; return; }
  if(!SY.enabled()){ el.innerHTML='<div class="ph">المزامنة غير مفعّلة (js/config.js فاضي).</div>'; return; }
  const S={profiles:[],activity:[],results:[],resOk:true,groups:[],busy:false,err:'',msg:''};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.replaceChildren(root);
  const calc=()=>{ S.groups=findDupes({profiles:S.profiles,activity:S.activity,results:S.results,resOk:S.resOk}); };
  const acct=(g,a,i)=>{
    const seen=a.lastSeen?`آخر دخول ${esc(fmt(a.lastSeen))} (${n(a.sessions)} جلسة)`:'لم يدخل بعد';
    return `<div class="row" style="display:block;border-top:1px solid rgba(128,128,128,.25);padding:8px 0">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><b>حساب ${n(i+1)}</b>${a.latest?'<span class="badge on">⭐ الأحدث نشاطاً</span>':''}<span class="badge ${a.solved?'on':'off'}">${a.solved?`حلّ ${n(a.solved)} إصحاح`:'فاضي — ما حلّش حاجة'}</span></div>
      <div class="k">سُجّل ${esc(fmt(a.created_at))} · ${seen}</div>
      <div class="k">الكود: <span dir="ltr">${esc(a.code||'—')}</span>${a.phone?` · التليفون: <span dir="ltr">${esc(a.phone)}</span>`:''}</div>
      ${a.books.length?`<div class="k">الإصحاحات: ${esc(booksText(a.books))}${a.lastSolve?` · آخر حل ${esc(fmt(a.lastSolve))}`:''}</div>`:''}
      ${a.canArchive?`<button class="btn sec" style="${SB};margin-top:6px" data-a="arch" data-id="${esc(a.id)}">🗄️ أرشفة الحساب الفاضي</button>`:''}</div>`;
  };
  function paint(){
    const head=`<div class="card2"><b>👯 الأسماء المكررة</b>
      <div class="hint">حسابات نشطة بنفس الاسم (غالباً المخدوم سجّل مرتين). الحساب الأقدم = «حساب ١». التليفون لوحده مش بيفرّق، اعتمد على تاريخ التسجيل وآخر دخول والإصحاحات.</div>
      <button class="btn sec" style="${SB}" data-a="refresh"${S.busy?' disabled':''}>🔄 تحديث</button>
      ${S.msg?`<div class="hint">${esc(S.msg)}</div>`:''}${S.err?`<div class="err">${esc(S.err)}</div>`:''}
      ${!S.busy&&!S.err&&!S.resOk?`<div class="warn">⚠️ النتايج ما اتحمّلتش (أو من نسخة محفوظة)، فالأرشفة مقفولة لحد ما تتحمّل.</div>`:''}</div>`;
    let body='';
    if(S.busy&&!S.profiles.length) body='<div class="ph">جارٍ التحميل…</div>';
    else if(!S.err&&!S.groups.length) body='<div class="card2"><div class="hint">✅ مفيش أسماء مكررة بين الحسابات النشطة.</div></div>';
    else body=`<div class="hint" style="margin:4px 2px">${n(S.groups.length)} اسم مكرر · ${n(S.groups.reduce((s,g)=>s+g.accounts.length,0))} حساب</div>`+S.groups.map(g=>
      `<div class="card2"><div class="row" style="border:0;padding:0"><b>${esc(g.name)}</b><span>${n(g.accounts.length)} حسابات · ${n(g.total)} إصحاح</span></div>
        <div class="k">${g.samePhone?'✅ نفس التليفون (غالباً نفس الشخص)':'⚠️ تليفون مختلف أو ناقص'} · ${g.sameGrade?'نفس الصف':'⚠️ الصف مختلف'}</div>
        <div class="hint">${esc(ADV[g.verdict])}</div>${g.accounts.map((a,i)=>acct(g,a,i)).join('')}</div>`).join('');
    root.innerHTML=head+body;
  }
  async function load(){
    S.busy=true; S.err=''; S.msg=''; paint();
    try{
      const [profiles,activity,res]=await Promise.all([
        all('/rest/v1/profiles?select=id,name,grade,gender,phone,code,created_at,deleted_at,archived_at&order=created_at.desc,id.asc'),
        all('/rest/v1/profile_activity?select=profile_id,last_seen,sessions&order=profile_id.asc').catch(()=>[]),
        SY.resultsFirst({refresh:true}).catch(()=>null)]);
      S.profiles=profiles; S.activity=activity;
      S.resOk=!!res&&!res.error&&!res.fromCache&&!res.truncated; S.results=(res&&res.rows)||[];
    }catch(e){ S.err=errMsg(e)||'تعذّر تحميل الحسابات.'; S.profiles=[]; }
    S.busy=false; calc(); paint();
  }
  root.onclick=async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='refresh'){ await load(); return; }
    if(a==='arch'){
      let g=null,i=-1,acc=null; for(const x of S.groups){ const k=x.accounts.findIndex(y=>y.id===t.dataset.id); if(k>=0){ g=x; i=k; acc=x.accounts[k]; break; } }
      if(!acc||!acc.canArchive||g.accounts.length<2) return;   // أمان: ما نؤرشفش حساب فيه نتايج ولا آخر حساب
      const warn=acc.latest?`\n⚠️ ده الحساب الأحدث استخداماً. لو المخدوم لسه بيدخل بيه، أرشفته هتمنعه يرفع نتايجه. متأكد إنه بيستخدم الحساب التاني؟`:'';
      if(!confirm(`أرشفة «${acc.name}» (حساب ${i+1}) الفاضي؟\n• ما حلّش أي إصحاح.\n• ${acc.lastSeen?'آخر دخول '+fmt(acc.lastSeen):'لم يدخل بعد'}.${warn}\n• الأرشفة بتخفيه من القوائم والنتايج.\n• ترجعه من: لوحة المالك ← مؤرشف ← إلغاء الأرشفة.`)) return;
      t.disabled=true;
      try{
        const r=await api(`/rest/v1/profiles?id=eq.${encodeURIComponent(acc.id)}`,{method:'PATCH',prefer:'return=representation',body:{archived_at:new Date().toISOString()}});
        if(!Array.isArray(r)||!r.length) throw Object.assign(new Error('no rows'),{status:403});   // RLS بتتجاهل الصف بصمت
        const p=S.profiles.find(x=>x.id===acc.id); if(p) Object.assign(p,r[0]);
        S.msg=`اتأرشف حساب «${acc.name}» الفاضي ✅`; calc(); paint();
      }catch(x){ S.msg=''; S.err=errMsg(x)||'تعذّرت الأرشفة.'; t.disabled=false; paint(); }
    }
  };
  await load();
}
