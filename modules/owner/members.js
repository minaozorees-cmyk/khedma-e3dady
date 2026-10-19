// لوحة المالك (المرحلة ٨ب): المخدومون (بحث/تعديل/حذف ناعم/استرجاع/حذف نهائي) + إحصائيات + سجل التدقيق + تنظيف الحذف الناعم.
// ⚠️ إظهار الوحدة للمالك فقط هو واجهة؛ الحماية الفعلية = RLS + triggers في supabase/schema.sql
//    (profiles_owner_all، profiles_guard، profiles_del_guard، purge_expired_profiles).
import {normName,normPhone,normPhoneEG,genCode} from '../../js/auth.js';
import * as SY from '../../js/sync.js';
import {esc} from '../../js/consts.js';

const GRADES=['الأول الإعدادي','الثاني الإعدادي','الثالث الإعدادي'], GENDERS=['ولد','بنت'];
const DAY=864e5, KEEP_DAYS=30, PAGE=20;
const COLS='id,name,grade,gender,phone,guardian_name,guardian_phone,email,created_at,deleted_at,archived_at';
const FIELD_AR={name:'الاسم',grade:'الصف',gender:'الجنس',phone:'التليفون',guardian_name:'ولي الأمر',guardian_phone:'تليفون ولي الأمر',email:'الإيميل',deleted_at:'حالة الحذف',archived_at:'الأرشفة',auth_uid:'ربط الجهاز',code:'كود الاسترجاع'};
const REQ_TYPE={password_reset:'استرجاع كلمة السر',new_account:'طلب حساب',other:'طلب آخر'}, REQ_ST={pending:'معلّق',approved:'تمت الموافقة',rejected:'مرفوض',done:'تم'};
const PW_AL='ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function genPw(n=10){ const lim=256-(256%PW_AL.length); let o=''; while(o.length<n){ for(const x of crypto.getRandomValues(new Uint8Array(16))){ if(x<lim&&o.length<n) o+=PW_AL[x%PW_AL.length]; } } return o; }
const ACT_AR={promote:'ترقية الصفوف',staff_create:'إنشاء حساب',staff_set_role:'تغيير دور',staff_disable:'إيقاف حساب',staff_enable:'تفعيل حساب',soft_delete:'حذف ناعم',restore:'استرجاع',update:'تعديل',hard_delete:'حذف نهائي',INSERT:'إضافة',UPDATE:'تعديل',DELETE:'حذف'};
const ROLE_AR={student:'مخدوم',servant:'خادم',priest:'كاهن',owner:'مالك'};
const fmt=(t)=>t?new Date(t).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}):'—';
const fmtD=(t)=>t?new Date(t).toLocaleDateString('ar-EG',{dateStyle:'medium'}):'—';
const daysLeft=(m)=>Math.ceil(KEEP_DAYS-(Date.now()-new Date(m.deleted_at).getTime())/DAY); // ≤0 = انتهت المهلة
const SB='width:auto;min-height:36px;margin:0;padding:6px 14px;font-size:.85rem';
const phoneOk=(v)=>/^(?:\+?20)?0?1[0125]\d{8}$/.test(normPhone(v));
const twoWords=(v)=>String(v).trim().split(/\s+/).filter(w=>w.length>1).length>=2;

function errMsg(e){
  if(e&&e.body&&e.body.code==='42501') return 'غير مسموح بهذه العملية.';
  if(e&&(e.status===401||e.status===403)) return 'الجلسة انتهت أو الحساب غير مصرّح له. سجّل الدخول من جديد.';
  if(e&&e.status) return 'تعذّر التنفيذ (رمز '+e.status+').';
  return 'تعذّر الاتصال بالسيرفر.';
}
async function api(path,opts){
  const r=await SY.staffApi(path,opts);
  if(!r.ok){ const e=new Error('HTTP '+r.status); e.status=r.status; try{ e.body=await r.json(); }catch(_){} throw e; }
  return r.status===204?null:await r.json().catch(()=>null);
}
async function all(path){
  const out=[];
  for(let off=0;off<20000;off+=1000){ const p=await api(`${path}&limit=1000&offset=${off}`); out.push(...p); if(p.length<1000) break; }
  return out;
}

export async function mount(el,{role}={}){
  if(role!=='owner'){ el.innerHTML='<div class="ph">هذه الصفحة للمالك فقط.</div>'; return; }
  if(!SY.enabled()){ el.innerHTML='<div class="ph">المزامنة غير مفعّلة (js/config.js فاضي).</div>'; return; }
  let t0='m'; try{ if(sessionStorage.getItem('ownerTab')==='r'){ t0='r'; sessionStorage.removeItem('ownerTab'); } }catch(e){}
  const S={tab:t0,f:'active',q:'',sel:null,members:[],act:new Map(),sess:[],audit:{page:0,tbl:'',rows:[],more:false},req:{rows:[],open:null,done:null,err:''},pend:0,staff:[],staffOk:false,svs:[],asg:new Map(),asgOk:false,asel:null,acur:new Set(),abusy:false};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px';
  el.innerHTML=''; el.appendChild(root);
  const $=(s)=>root.querySelector(s);
  const say=(t,bad)=>{ const m=$('#msg'); if(m) m.innerHTML=t?`<div class="${bad?'err':'hint'}">${esc(t)}</div>`:''; };
  const byId=(id)=>S.members.find(m=>m.id===id);

  // ── تحميل ──
  async function load(){
    say('جارٍ التحميل…');
    try{
      S.members=(await all(`/rest/v1/profiles?select=${COLS}&order=created_at.desc,id.asc`)).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
      S.act=new Map((await all('/rest/v1/profile_activity?select=profile_id,last_seen,sessions&order=profile_id.asc')).map(a=>[a.profile_id,a]));
      say('');
    }catch(e){ say(errMsg(e)+' (تأكد أن schema.sql v9 اتشغّل.)',true); }
    await loadAssign();
    paintBody();
  }
  // (v9.43) الخدام + الإسنادات الحالية، لعرض/تعديل خادم كل مخدوم من هنا. لو فشل التحميل نخفي الميزة ونكمّل.
  async function loadAssign(){
    try{
      const r=await SY.staffAdmin({action:'list'}); if(!r.ok) throw new Error('nofn');
      S.svs=(r.users||[]).filter(u=>u.role==='servant').sort((a,b)=>String(a.name||a.email).localeCompare(String(b.name||b.email),'ar'));
      const as=await all('/rest/v1/staff_profile_assignments?select=staff_uid,profile_id&order=staff_uid.asc,profile_id.asc');
      S.asg=new Map(); for(const a of as){ if(!S.asg.has(a.profile_id)) S.asg.set(a.profile_id,new Set()); S.asg.get(a.profile_id).add(a.staff_uid); }
      S.asgOk=true;
    }catch(e){ S.svs=[]; S.asg=new Map(); S.asgOk=false; }
  }
  const svName=(uid)=>{ const u=S.svs.find(x=>x.id===uid); return u?(u.name||u.email):'خادم غير معروف'; };
  function svBox(m){
    if(!S.asgOk||m.deleted_at) return '';
    const cur=[...(S.asg.get(m.id)||[])], names=cur.map(svName), open=S.asel===m.id;
    const lbl=names.length?esc(names.join('، ')):'بلا خادم';
    return `<div style="margin-top:8px"><button class="btn sec" style="${SB};${names.length?'':'color:#b45309'}" data-a="svedit" data-id="${m.id}" aria-expanded="${open}">🧑‍🏫 الخادم: ${lbl} ✏️</button></div>
      ${open?`<div class="card2" style="margin-top:8px"><b>اختر الخدام</b>${S.svs.length?`<div style="max-height:40vh;overflow:auto;margin-top:6px">${S.svs.map(u=>`<label class="chk"><input type="checkbox" data-sv="${u.id}"${S.acur.has(u.id)?' checked':''}> ${esc(u.name||u.email)}</label>`).join('')}</div>`:'<p class="hint">مفيش خدام. أضف حساب خادم من «حسابات الطاقم».</p>'}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn" style="${SB}" data-a="svsave" data-id="${m.id}"${S.abusy?' disabled':''}>حفظ</button><button class="btn sec" style="${SB}" data-a="svcancel">إلغاء</button></div></div>`:''}`;
  }
  async function svSave(id){
    const orig=new Set(S.asg.get(id)||[]), add=[...S.acur].filter(x=>!orig.has(x)), del=[...orig].filter(x=>!S.acur.has(x));
    if(!add.length&&!del.length){ S.asel=null; paintList(); return; }
    const m=byId(id); if(del.length&&!confirm(`هتشيل ${del.length} خادم من «${m?m.name:''}». متأكد؟`)) return;
    S.abusy=true; paintList();
    try{
      if(add.length) await api('/rest/v1/staff_profile_assignments?on_conflict=staff_uid,profile_id',{method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:add.map(uid=>({staff_uid:uid,profile_id:id}))});
      if(del.length) await api(`/rest/v1/staff_profile_assignments?profile_id=eq.${encodeURIComponent(id)}&staff_uid=in.(${del.join(',')})`,{method:'DELETE',prefer:'return=minimal'});
      S.asg.set(id,new Set(S.acur)); S.asel=null; S.abusy=false; paintList(); say('تم حفظ الإسناد ✅');
    }catch(e){ S.abusy=false; paintList(); say(errMsg(e),true); }
  }
  async function loadStatsExtra(){
    try{ S.sess=await api('/rest/v1/sessions?select=profile_id,started_at&order=started_at.desc&limit=15'); }catch(e){ S.sess=[]; }
  }
  async function loadAudit(){
    const a=S.audit, t=a.tbl?`&table_name=eq.${a.tbl}`:'';
    say('جارٍ التحميل…');
    try{
      const r=await api(`/rest/v1/audit_log?select=id,at,actor,action,table_name,row_id,detail&order=at.desc,id.desc${t}&limit=${PAGE+1}&offset=${a.page*PAGE}`);
      a.more=r.length>PAGE; a.rows=r.slice(0,PAGE); say('');
    }catch(e){ a.rows=[]; a.more=false; say(errMsg(e),true); }
    paintBody();
  }

  // ── رسم ──
  function paint(){
    root.innerHTML=`<div class="tabs2" id="tabs"></div><div id="msg"></div><div id="body"></div>`;
    paintTabs(); paintBody();
  }
  function paintTabs(){
    const t=$('#tabs'); if(!t) return;
    t.innerHTML=[['m','المخدومون'],['s','إحصائيات'],['a','السجل'],['r','🔑 الطلبات'+(S.pend?` (${S.pend})`:'')]]
      .map(([k,l])=>`<button data-a="tab" data-t="${k}" class="${S.tab===k?'on':''}" style="font-size:.8rem;padding:9px 4px">${l}</button>`).join('');
  }
  function paintBody(){
    const b=$('#body'); if(!b) return;
    paintTabs();
    if(S.tab==='m'){
      b.innerHTML=`<div class="fld"><input id="q" placeholder="بحث بالاسم أو رقم التليفون" value="${esc(S.q)}" autocomplete="off"></div>
        <div class="tabs2">${[['active','نشط'],['archived','مؤرشف'],['deleted','محذوف'],['all','الكل']].map(([k,l])=>`<button data-a="f" data-f="${k}" class="${S.f===k?'on':''}">${l}</button>`).join('')}</div>
        <div id="clean"></div><div id="list"></div>
        <button class="btn sec" data-a="reload">تحديث</button>`;
      paintClean(); paintList();
    }else if(S.tab==='s') paintStats(b);
    else if(S.tab==='r') paintReq(b);
    else paintAudit(b);
  }
  function paintClean(){
    const n=S.members.filter(m=>m.deleted_at&&daysLeft(m)<=0).length, c=$('#clean'); if(!c) return;
    c.innerHTML=n?`<div class="card2"><b>تنظيف الحذف الناعم</b><p class="hint">${n} ملف مرّ عليه أكثر من ${KEEP_DAYS} يوماً من الحذف. التنظيف يمسحهم نهائياً مع نتائجهم وجلساتهم.</p>
      <button class="x" data-a="cleanup">تنظيف الآن (${n})</button></div>`:'';
  }
  function matches(m){
    if(S.f==='active'&&(m.deleted_at||m.archived_at)) return false;
    if(S.f==='archived'&&(m.deleted_at||!m.archived_at)) return false;
    if(S.f==='deleted'&&!m.deleted_at) return false;
    const q=S.q.trim(); if(!q) return true;
    const qd=normPhone(q).replace(/^\+?20/,'0');
    if(/^\d{3,}$/.test(qd)) return [m.phone,m.guardian_phone].some(p=>normPhone(p||'').replace(/^\+?20/,'0').includes(qd));
    return normName(m.name).includes(normName(q));
  }
  function editor(m){
    return `<div style="margin-top:12px"><div class="fld"><label for="e_name">الاسم</label><input id="e_name" value="${esc(m.name)}" maxlength="120"></div>
      <div class="fld"><label for="e_grade">الصف</label><select id="e_grade">${GRADES.map(g=>`<option${g===m.grade?' selected':''}>${g}</option>`).join('')}</select></div>
      <div class="fld"><label for="e_gender">الجنس</label><select id="e_gender">${GENDERS.map(g=>`<option${g===m.gender?' selected':''}>${g}</option>`).join('')}</select></div>
      <div class="fld"><label for="e_phone">التليفون</label><input id="e_phone" dir="ltr" inputmode="tel" value="${esc(m.phone||'')}"></div>
      <div class="fld"><label for="e_gname">ولي الأمر <small>(اختياري)</small></label><input id="e_gname" value="${esc(m.guardian_name||'')}"></div>
      <div class="fld"><label for="e_gphone">تليفون ولي الأمر <small>(اختياري)</small></label><input id="e_gphone" dir="ltr" inputmode="tel" value="${esc(m.guardian_phone||'')}"></div>
      <div class="fld"><label for="e_email">الإيميل <small>(اختياري)</small></label><input id="e_email" dir="ltr" value="${esc(m.email||'')}"></div>
      <div class="err" id="eerr"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" style="${SB}" data-a="save" data-id="${m.id}">حفظ</button><button class="btn sec" style="${SB}" data-a="cancel">إلغاء</button></div></div>`;
  }
  function paintList(){
    const l=$('#list'); if(!l) return;
    const rows=S.members.filter(matches);
    l.innerHTML=rows.length?rows.map(m=>{
      const a=S.act.get(m.id), del=!!m.deleted_at, left=del?daysLeft(m):0;
      const info=`${esc(m.grade)} · ${esc(m.gender)} · سُجّل ${fmtD(m.created_at)} · ${a&&a.last_seen?'آخر دخول '+fmt(a.last_seen)+' ('+a.sessions+' جلسة)':'لم يدخل بعد'}`;
      const st=del?`<div class="warn" style="margin:6px 0">${left>0?`محذوف — باقي ${left} يوم للاسترجاع`:'انتهت مهلة الاسترجاع — جاهز للتنظيف'}</div>`:'';
      const btns=del?`${left>0?`<button class="btn sec" style="${SB}" data-a="restore" data-id="${m.id}">♻️ استرجاع</button>`:''}<button class="x" data-a="purge" data-id="${m.id}">حذف نهائي</button>`
        :`${m.archived_at?`<button class="btn sec" style="${SB}" data-a="unarch" data-id="${m.id}">إلغاء الأرشفة</button>`:`<button class="btn sec" style="${SB}" data-a="edit" data-id="${m.id}">✏️ تعديل</button>`}<button class="btn sec" style="${SB}" data-a="newcode" data-id="${m.id}">🔄 كود جديد</button><button class="x" data-a="del" data-id="${m.id}">🗑 حذف</button>`;
      return `<div class="card2"><div class="row" style="border:0;padding:0"><b>${esc(m.name)}</b><span class="badge ${del?'off':'on'}">${del?'محذوف':m.archived_at?'مؤرشف':'نشط'}</span></div>
        <div class="k">${info}</div>${svBox(m)}${st}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${btns}</div>${S.sel===m.id&&!del?editor(m):''}</div>`;
    }).join(''):'<div class="hint">لا توجد نتائج.</div>';
  }
  function dist(title,map,total){
    const es=[...map.entries()].sort((a,b)=>b[1]-a[1]);
    return `<div class="card2"><b>${title}</b>${es.length?es.map(([k,v])=>`<div class="row" style="display:block"><div class="row" style="border:0;padding:0"><span>${esc(k)}</span><span>${v}</span></div><div class="prog"><i style="width:${total?Math.round(v*100/total):0}%"></i></div></div>`).join(''):'<div class="hint">لا بيانات.</div>'}</div>`;
  }
  function paintStats(b){
    const act=S.members.filter(m=>!m.deleted_at&&!m.archived_at), del=S.members.filter(m=>m.deleted_at).length;
    const wk=Date.now()-7*DAY, recent=act.filter(m=>{ const a=S.act.get(m.id); return a&&a.last_seen&&new Date(a.last_seen).getTime()>=wk; }).length;
    const never=act.filter(m=>!(S.act.get(m.id)&&S.act.get(m.id).last_seen)).length;
    const cnt=(f)=>act.reduce((m,x)=>m.set(f(x),(m.get(f(x))||0)+1),new Map());
    b.innerHTML=`<div class="stats"><div class="st"><b>${act.length}</b><small>نشط</small></div><div class="st"><b>${del}</b><small>محذوف</small></div>
      <div class="st"><b>${recent}</b><small>دخلوا آخر ٧ أيام</small></div><div class="st"><b>${never}</b><small>لم يدخلوا</small></div></div>
      ${dist('توزيع الصفوف',cnt(m=>m.grade),act.length)}${dist('توزيع الجنس',cnt(m=>m.gender),act.length)}
      <div class="card2"><b>آخر الدخول</b>${S.sess.length?S.sess.map(s=>{ const m=byId(s.profile_id); return `<div class="row"><span>${m?esc(m.name):'—'}</span><small>${fmt(s.started_at)}</small></div>`; }).join(''):'<div class="hint">لا توجد جلسات مسجّلة.</div>'}</div>`;
  }
  function target(r){
    const d=r.detail||{};
    if(r.table_name==='profiles'){ const m=byId(r.row_id); return 'مخدوم: '+(d.name||(m&&m.name)||String(r.row_id).slice(0,8)); }
    if(r.table_name==='messages') return 'رسالة';
    if(r.table_name==='staff') return 'حساب: '+((r.detail||{}).target||String(r.row_id).slice(0,8))+((r.detail||{}).new_role?' ← '+({servant:'خادم',priest:'كاهن'})[(r.detail||{}).new_role]:'');
    if(r.action==='promote') return 'كل المخدومين'+((r.detail||{}).label?' ('+r.detail.label+')':'');
    return 'سفر: '+r.row_id;
  }
  function paintAudit(b){
    const a=S.audit;
    b.innerHTML=`<div class="fld"><select id="atbl"><option value=""${a.tbl?'':' selected'}>كل الأحداث</option><option value="profiles"${a.tbl==='profiles'?' selected':''}>المخدومون</option><option value="books"${a.tbl==='books'?' selected':''}>الأسفار</option><option value="messages"${a.tbl==='messages'?' selected':''}>الرسائل</option></select></div>
      <div class="card2">${a.rows.length?a.rows.map(r=>{
        const d=r.detail||{}, who=d.email||ROLE_AR[d.role]||'—';
        const ch=Array.isArray(d.changed)?d.changed.filter(c=>c!=='name_norm'||!d.changed.includes('name')).map(c=>FIELD_AR[c]||c).join('، '):'';
        return `<div class="row"><div><b>${esc(ACT_AR[r.action]||r.action)}</b> ${esc(target(r))}<div class="k">${esc(who)}${ch?' · '+esc(ch):''}</div></div><small>${fmt(r.at)}</small></div>`;
      }).join(''):'<div class="hint">لا توجد أحداث.</div>'}</div>
      <div style="display:flex;gap:8px;justify-content:space-between;align-items:center"><button class="btn sec" style="${SB}" data-a="apage" data-d="-1"${a.page?'':' disabled'}>السابق</button><span class="hint">صفحة ${a.page+1}</span><button class="btn sec" style="${SB}" data-a="apage" data-d="1"${a.more?'':' disabled'}>التالي</button></div>`;
  }

  // ── العمليات ──
  async function patch(id,body){
    const r=await api(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',prefer:'return=representation',body});
    if(!Array.isArray(r)||!r.length) throw Object.assign(new Error('no rows'),{status:403}); // RLS تتجاهل الصف بصمت
    const i=S.members.findIndex(m=>m.id===id); if(i>=0) S.members[i]={...S.members[i],...r[0]};
  }
  async function save(id){
    const v=(s)=>$(s).value, d={name:v('#e_name').trim().replace(/\s+/g,' '),grade:v('#e_grade'),gender:v('#e_gender'),phone:v('#e_phone'),gname:v('#e_gname').trim().replace(/\s+/g,' '),gphone:v('#e_gphone'),email:v('#e_email').trim()};
    const err=$('#eerr'); err.textContent='';
    if(!twoWords(d.name)||d.name.length>120) err.textContent='اكتب الاسم كاملاً (اسمين على الأقل).';
    else if(!phoneOk(d.phone)||(d.gphone.trim()&&!phoneOk(d.gphone))) err.textContent='رقم موبايل مصري غير صحيح.';
    else if(d.gname&&!twoWords(d.gname)) err.textContent='اكتب اسم ولي الأمر كاملاً.';
    else if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) err.textContent='إيميل غير صحيح.';
    if(err.textContent) return;
    const m=byId(id);
    if(m&&m.name!==d.name&&!confirm('تغيير الاسم يغيّر الاسم المطلوب عند استرجاع حساب المخدوم على جهاز جديد. متابعة؟')) return;
    try{
      await patch(id,{name:d.name,name_norm:normName(d.name),grade:d.grade,gender:d.gender,phone:normPhoneEG(d.phone),guardian_name:d.gname||null,guardian_phone:d.gphone.trim()?normPhoneEG(d.gphone):null,email:d.email||null});
      S.sel=null; say('تم الحفظ ✅'); paintList();
    }catch(e){ err.textContent=errMsg(e); }
  }
  async function act(a,id){
    const m=byId(id);
    try{
      if(a==='unarch'){ if(!confirm(`إلغاء أرشفة «${m.name}»؟ هيرجع نشط بصفه الحالي.`)) return; await patch(id,{archived_at:null}); say('تم إلغاء الأرشفة.'); paintClean(); paintList(); return; }
      if(a==='newcode'){
        if(!confirm(`توليد كود استرجاع جديد لـ «${m.name}»؟ الكود القديم هيبطل يشتغل.`)) return;
        const c=genCode(); await patch(id,{code:c});
        say(`كود «${m.name}» الجديد: ${c} — ابعته له. (مش هيظهر تاني)`); return;
      }
      if(a==='del'){
        if(!confirm(`حذف «${m.name}»؟ يختفي من اللوحات ويمكن استرجاعه خلال ${KEEP_DAYS} يوم.`)) return;
        await patch(id,{deleted_at:new Date().toISOString()}); S.sel=null; say('تم الحذف (ناعم).');
      }else if(a==='restore'){
        await patch(id,{deleted_at:null}); say('تم الاسترجاع ✅');
      }else if(a==='purge'){
        const expired=daysLeft(m)<=0;
        if(!confirm(`حذف «${m.name}» نهائياً مع كل نتائجه وجلساته؟ لا يمكن التراجع.`)) return;
        if(!expired){ const t=prompt(`لم تمرّ ${KEEP_DAYS} يوماً بعد. تأكيد ثانٍ: اكتب اسم المخدوم بالظبط لتأكيد الحذف النهائي:`); if(t===null||normName(t)!==normName(m.name)){ say('تم إلغاء الحذف النهائي.',true); return; } }
        const r=await api(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&deleted_at=not.is.null`,{method:'DELETE',prefer:'return=representation'});
        if(!Array.isArray(r)||!r.length) throw Object.assign(new Error('no rows'),{status:403});
        S.members=S.members.filter(x=>x.id!==id); S.sel=null; say('تم الحذف النهائي.');
      }
      paintClean(); paintList();
    }catch(e){ say(errMsg(e),true); }
  }
  async function cleanup(){
    const n=S.members.filter(m=>m.deleted_at&&daysLeft(m)<=0).length;
    if(!n||!confirm(`مسح ${n} ملف نهائياً مع نتائجهم وجلساتهم؟ لا يمكن التراجع.`)) return;
    try{ const k=await api('/rest/v1/rpc/purge_expired_profiles',{method:'POST',body:{}}); say(`تم تنظيف ${Number(k)||0} ملف.`); await load(); }
    catch(e){ say(errMsg(e),true); }
  }

  // ── (v9.2) طلبات الاسترجاع ──
  async function loadReqCount(){ try{ const r=await api('/rest/v1/requests?select=id&status=eq.pending&limit=100'); S.pend=r.length; paintTabs(); dispatchEvent(new CustomEvent('lawha:reqcount',{detail:S.pend})); }catch(e){} }
  async function loadReq(){
    say('جارٍ التحميل…');
    try{
      S.req.rows=await api('/rest/v1/requests?select=id,type,requester_name,requester_contact,message,status,created_at,handled_at&order=created_at.desc&limit=100');
      S.pend=S.req.rows.filter(r=>r.status==='pending').length; say(''); paintTabs();
      dispatchEvent(new CustomEvent('lawha:reqcount',{detail:S.pend}));   // يحدّث الـbadge في القائمة
    }catch(e){ say(errMsg(e)+' (تأكد أن قسم requests في schema.sql اتشغّل.)',true); }
    paintBody();
  }
  function reqCard(r){
    const isPw=r.type==='password_reset', open=S.req.open===r.id;
    const em=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.requester_contact||'')?r.requester_contact:'';
    return `<div class="row" style="display:block"><div class="row" style="border:0;padding:0"><b>${esc(r.requester_name||'—')}</b><small>${fmt(r.created_at)}</small></div>
      <div class="k">${esc(REQ_TYPE[r.type]||r.type)} · <span dir="ltr">${esc(r.requester_contact||'—')}</span></div>${r.message?`<div class="hint" style="margin:6px 0">${esc(r.message)}</div>`:''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${isPw?`<button class="btn" style="${SB}" data-a="rq-ok" data-id="${r.id}">موافقة</button>`:`<button class="btn" style="${SB}" data-a="rq-fin" data-id="${r.id}">تم</button>`}<button class="x" data-a="rq-no" data-id="${r.id}">رفض</button></div>
      ${open?`<div style="margin-top:10px">${S.staff.length?`<div class="fld"><label for="rq_sel">اختر حساب الخادم <small>(الأضمن من الكتابة)</small></label><select id="rq_sel"><option value="">— اختر —</option>${S.staff.map(u=>`<option value="${esc(u.email)}"${u.email.toLowerCase()===em.toLowerCase()?' selected':''}>${esc(u.email)} · ${esc(ROLE_AR[u.role]||'كاهن')}</option>`).join('')}</select></div>`:''}
        <div class="fld"><label for="rq_em">البريد الإلكتروني للحساب</label><input id="rq_em" dir="ltr" value="${esc(em)}"></div>
        <div class="fld"><label for="rq_pw">كلمة السر المؤقتة <small>(٨ أحرف على الأقل)</small></label><input id="rq_pw" dir="ltr" autocomplete="off"></div>
        <div class="err" id="rq_err"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" style="${SB}" data-a="rq-gen">توليد</button><button class="btn" style="${SB}" data-a="rq-run" data-id="${r.id}">تنفيذ</button><button class="btn sec" style="${SB}" data-a="rq-cancel">إلغاء</button></div></div>`:''}</div>`;
  }
  function paintReq(b){
    const R=S.req, pend=R.rows.filter(r=>r.status==='pending'), old=R.rows.filter(r=>r.status!=='pending').slice(0,20);
    b.innerHTML=`${R.done?`<div class="card2"><b>تم ✅</b><p class="hint">كلمة السر المؤقتة لـ <span dir="ltr">${esc(R.done.email)}</span>:</p><div class="code" style="font-size:1.3rem;letter-spacing:2px">${esc(R.done.pw)}</div>
      <p class="warn">ابعتها له بنفسك. مش هتظهر تاني، وهيُطلب منه يغيّرها أول ما يدخل.</p><button class="btn sec" style="${SB}" data-a="rq-dismiss">تم، إخفاء</button></div>`:''}
      <label class="chk"><input type="checkbox" id="rsnd"${localStorage.getItem('reqSound')==='1'?' checked':''}> صوت تنبيه خفيف عند وصول طلب</label>
      <div class="card2"><b>طلبات معلّقة (${pend.length})</b>${pend.length?pend.map(reqCard).join(''):'<div class="hint">لا توجد طلبات معلّقة.</div>'}</div>
      ${old.length?`<div class="card2"><b>آخر الطلبات المعالجة</b>${old.map(r=>`<div class="row"><div>${esc(r.requester_name||r.requester_contact||'—')}<div class="k">${esc(REQ_TYPE[r.type]||r.type)} · ${REQ_ST[r.status]||r.status}</div></div><small>${fmt(r.handled_at||r.created_at)}</small></div>`).join('')}</div>`:''}
      <button class="btn sec" data-a="rq-reload">تحديث</button>`;
  }
  async function setReq(id,status,meta){
    const body={status}; if(meta) body.meta=meta;
    const r=await api(`/rest/v1/requests?id=eq.${encodeURIComponent(id)}&status=eq.pending`,{method:'PATCH',prefer:'return=representation',body});
    if(!Array.isArray(r)||!r.length) throw Object.assign(new Error('no rows'),{status:403});
  }
  async function reqAct(a,id){
    const R=S.req;
    try{
      if(a==='rq-ok'){ R.open=id; paintBody();
        if(!S.staffOk){ const r=await SY.staffAdmin({action:'list'}); if(r.ok){ S.staff=r.users.filter(u=>u.role!=='owner'&&u.email).sort((a,b)=>String(a.email).localeCompare(String(b.email))); S.staffOk=true; if(R.open===id) paintBody(); } }
        return; }
      if(a==='rq-cancel'){ R.open=null; paintBody(); return; }
      if(a==='rq-dismiss'){ R.done=null; paintBody(); return; }
      if(a==='rq-gen'){ $('#rq_pw').value=genPw(); return; }
      if(a==='rq-reload'){ await loadReq(); return; }
      if(a==='rq-no'){ if(!confirm('رفض الطلب؟')) return; await setReq(id,'rejected'); say('تم الرفض.'); R.open=null; await loadReq(); return; }
      if(a==='rq-fin'){ await setReq(id,'done'); say('تم.'); await loadReq(); return; }
      if(a==='rq-run'){
        const em=$('#rq_em').value.trim(), pw=$('#rq_pw').value, err=$('#rq_err'), btn=root.querySelector('[data-a="rq-run"]');
        err.textContent='';
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){ err.textContent='اكتب البريد الإلكتروني للحساب.'; return; }
        if(pw.length<8||pw.length>72){ err.textContent='كلمة السر من ٨ إلى ٧٢ حرف.'; return; }
        btn.disabled=true;
        const x=await SY.resetPassword(em,pw);
        btn.disabled=false;
        if(!x.ok){ err.textContent=({not_found:'مفيش حساب بالبريد ده.',not_allowed:'الحساب ده مش مسموح إعادة ضبط كلمة سره من هنا.',weak:'كلمة السر غير مقبولة.',auth:'الجلسة انتهت. سجّل الدخول من جديد.',offline:'مفيش اتصال بالنت.',nofn:'الـEdge Function (reset-password) غير منشورة بعد.'})[x.reason]||'تعذّر التنفيذ.'; return; }
        R.done={email:em,pw}; R.open=null;
        try{ await setReq(id,'done',{email:em}); }catch(e){ say('اتغيّرت كلمة السر لكن تعذّر تحديث حالة الطلب. حدّث القائمة.',true); }
        await loadReq();
      }
    }catch(e){ say(errMsg(e),true); }
  }

  // ── الأحداث ──
  root.addEventListener('click',(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return;
    const a=t.dataset.a, id=t.dataset.id;
    if(a==='tab'){ S.tab=t.dataset.t; say(''); paintBody(); if(S.tab==='s') loadStatsExtra().then(()=>S.tab==='s'&&paintBody()); if(S.tab==='a') loadAudit(); if(S.tab==='r') loadReq(); }
    else if(a==='f'){ S.f=t.dataset.f; S.sel=null; paintBody(); }
    else if(a==='reload') load();
    else if(a==='svedit'){ if(S.asel===id){ S.asel=null; } else { S.asel=id; S.acur=new Set(S.asg.get(id)||[]); } paintList(); }
    else if(a==='svcancel'){ S.asel=null; paintList(); }
    else if(a==='svsave') svSave(id);
    else if(a==='edit'){ S.sel=id; paintList(); }
    else if(a==='cancel'){ S.sel=null; paintList(); }
    else if(a==='save') save(id);
    else if(a==='cleanup') cleanup();
    else if(a==='apage'){ S.audit.page=Math.max(0,S.audit.page+Number(t.dataset.d)); loadAudit(); }
    else if(a.startsWith('rq-')) reqAct(a,id);
    else act(a,id);
  });
  root.addEventListener('input',(e)=>{ if(e.target.id==='q'){ S.q=e.target.value; paintList(); } });
  root.addEventListener('change',(e)=>{ const sv=e.target.dataset&&e.target.dataset.sv; if(sv){ e.target.checked?S.acur.add(sv):S.acur.delete(sv); return; } if(e.target.id==='rq_sel'){ const i=$('#rq_em'); if(i&&e.target.value) i.value=e.target.value; return; } if(e.target.id==='rsnd'){ try{ localStorage.setItem('reqSound',e.target.checked?'1':'0'); }catch(x){} } if(e.target.id==='atbl'){ S.audit.tbl=e.target.value; S.audit.page=0; loadAudit(); } });

  addEventListener('lawha:ownertab',function h(){ if(!root.isConnected){ removeEventListener('lawha:ownertab',h); return; } S.tab='r'; paintTabs(); paintBody(); loadReq(); });
  paint(); await load(); if(S.tab==='r') loadReq(); else loadReqCount();
}
