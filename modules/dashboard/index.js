// لوحة قيادة الخادم: ملخص من الجداول الموجودة، والنطاق الأمني يفرضه RLS في Supabase.
import {api,errMsg,fmtD,dayDiff,SB,studentBox,loadFuTpl} from '../../js/sapi.js';
const EXAM_MSG='سلام ونعمة يا {الاسم} ❤️ بقالك فترة ما حليتش امتحان، ربنا يبارك حياتك. ادخل حلّه لما تفضى.';   // (v9.490) رسالة كارت الامتحانات
import {esc} from '../../js/consts.js';
const when=(x)=>x?dayDiff(x):null;
export async function mount(el,{role}={}){
  if(!['servant','priest','owner'].includes(role)){el.innerHTML='<div class="ph">الصفحة غير متاحة.</div>';return;}
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='850px'; el.replaceChildren(root);
  root.innerHTML='<div class="ph">جارٍ تحميل ملخص الخدمة…</div>';
  const $=s=>root.querySelector(s);
  let members=[], meetings=[], followups=[], error='';
  try{
    const [p,m,f]=await Promise.all([
      api('/rest/v1/profiles?select=id,name,grade,gender,created_at&deleted_at=is.null&archived_at=is.null&order=name.asc&limit=1000'),
      api('/rest/v1/meetings?select=id,held_on,grade,title&order=held_on.desc&limit=500'),
      api('/rest/v1/followup_staff?select=*&limit=1000')   /* (v9.490) * عشان phone (زي شاشة الافتقاد) بدون ما نعتمد على اسم عمود */
    ]);
    members=p||[]; meetings=m||[]; followups=f||[];
  }catch(e){ error=errMsg(e); }
  if(error){
    root.innerHTML=`<div class="card2"><h3 class="ttl">تعذّر تحميل لوحة الخدمة</h3><div class="err">${esc(error)}</div><p class="hint">تأكد من تشغيل ترحيل الصلاحيات وإسناد المخدومين لحساب الخادم. لن يتم عرض بيانات بديلة أو تجريبية.</p><button class="btn" data-a="reload">إعادة المحاولة</button></div>`;
    root.onclick=()=>mount(el,{role}); return;
  }
  const byId=new Map(members.map(p=>[p.id,p]));
  const frows=followups.filter(x=>byId.has(x.id));
  let latest=meetings[0]||null, marks=[];
  if(latest){ try{marks=await api(`/rest/v1/attendance?select=profile_id,status&meeting_id=eq.${latest.id}&limit=1000`)||[];}catch(e){} }
  const mc={present:marks.filter(x=>x.status==='present').length,absent:marks.filter(x=>x.status==='absent').length,excused:marks.filter(x=>x.status==='excused').length};
  const attention=frows.map(r=>{
    const last= r.last_present ? new Date(r.last_present+'T12:00:00') : null;
    const away=last?Math.floor((Date.now()-last.getTime())/86400000):null;
    const examDays=when(r.last_exam);
    const absent=Number(r.absent_30||0)>=2 || (away!==null&&away>=14);
    const exam=!r.last_exam||examDays>=14;
    const call=absent&&(!r.last_followup||dayDiff(r.last_followup)>=7);
    return {...r,away,examDays,absent,exam,call};
  });
  const fuTpl=loadFuTpl();
  const countCard=(label,value,sub,icon)=>`<div class="st"><b>${esc(String(value))}</b><small>${icon} ${label}</small>${sub?`<div class="k">${esc(sub)}</div>`:''}</div>`;
  function openProfile(id){try{sessionStorage.setItem('selectedProfileId',id);}catch(e){} location.hash='#/profile';}
  root.innerHTML=`<div class="card2" style="background:linear-gradient(135deg,rgba(201,168,76,.16),rgba(201,168,76,.03))">
    <div class="k">نظرة عامة</div><h2 class="ttl" style="margin:4px 0 8px">لوحة قيادة الخادم</h2>
    <div class="hint">تظهر هنا البيانات التي يسمح بها إسناد المخدومين في Supabase. يتم إظهار المخدومين المسندين لحساب الخادم فقط؛ الإسناد الحالي فردي لكل مخدوم لأن المشروع لا يحتوي على معرّف فصل مستقل.</div>
    <div class="stats">${countCard('مخدوم في نطاقك',members.length,'المحذوف والمؤرشف مستبعدان','👥')}${countCard('حاضرون',mc.present,latest?'في آخر اجتماع مسجل':'لا يوجد اجتماع مسجل','✅')}${countCard('غياب',mc.absent,latest?'في آخر اجتماع مسجل':'','📅')}${countCard('بعذر',mc.excused,latest?'في آخر اجتماع مسجل':'','📝')}</div>
  </div>
  <div class="card2"><div class="row" style="border:0;padding:0"><b>آخر اجتماع</b><span>${latest?fmtD(latest.held_on):'لا يوجد'}</span></div>
    <div class="hint">${latest?`${esc(latest.grade)}${latest.title?' · '+esc(latest.title):''}`:'سجّل اجتماعًا من وحدة الحضور.'}</div>
    <button class="btn sec" data-go="attendance">فتح الحضور</button>
  </div>
  <div class="card2"><b>⚠️ محتاج افتقاد</b><div class="hint">غياب مرتين أو أكثر في آخر ٣٠ يوم، أو آخر حضور من ١٤ يومًا فأكثر. تحقق من السجل قبل التواصل.</div>
    ${renderRows(attention.filter(x=>x.absent).sort((a,b)=>(b.away??9999)-(a.away??9999)).slice(0,8),'لا توجد حالات حسب البيانات المسجلة.',fuTpl)}
    <button class="btn sec" data-go="followup">فتح وحدة الافتقاد</button>
  </div>
  <div class="card2"><b>📘 امتحانات تحتاج متابعة</b><div class="hint">لم يُسجل امتحان خلال آخر ١٤ يومًا، أو لا يوجد امتحان مسجل. هذا مؤشر للمراجعة وليس إثباتًا أن المخدوم متأخر عن امتحان محدد.</div>
    ${renderRows(attention.filter(x=>x.exam).sort((a,b)=>(b.examDays??9999)-(a.examDays??9999)).slice(0,8),'لا توجد حالات حسب البيانات المسجلة.',EXAM_MSG)}
    <button class="btn sec" data-go="board">فتح لوحة التميز</button>
  </div>
  <div class="card2"><b>📞 مكالمات افتقاد</b><div class="hint">حالات افتقاد لا يظهر لها تسجيل خلال آخر ٧ أيام.</div>
    ${renderRows(attention.filter(x=>x.call).slice(0,8),'لا توجد مكالمات مستحقة حسب السجل الحالي.',fuTpl)}
    <button class="btn sec" data-go="followup">إدارة الافتقاد</button>
  </div>
  <div class="card2"><b>🎂 أعياد الميلاد</b><p class="hint">غير متاحة حاليًا: جدول الملفات لا يحتوي على تاريخ ميلاد. لم أضف حقلًا جديدًا أو أستنتج تواريخ غير موجودة.</p></div>
  <div class="card2"><b>كل المخدومين في نطاقك</b><div class="fld"><input id="q" placeholder="ابحث بالاسم…" autocomplete="off" aria-label="بحث بالاسم"></div><div id="memberList">${renderMembers(members)}</div></div>`;
  // (v9.490) الصف div (مش button) عشان نقدر نحط لينكات اتصال/واتساب جواه؛ الاسم هو اللي يفتح الملف، والأزرار برّاه
  function renderRows(rows,empty,tpl){
    if(!rows.length)return `<p class="hint">${empty}</p>`;
    return rows.map(r=>`<div class="card2" style="width:100%"><div data-profile="${r.id}" role="button" tabindex="0" style="cursor:pointer;text-align:right"><b>${esc(r.name)}</b><div class="k">${esc(r.grade)} · ${r.last_present?'آخر حضور '+fmtD(r.last_present):'لا يوجد حضور مسجل'} · ${r.last_exam?'آخر امتحان '+dayDiff(r.last_exam)+' يوم':'لا يوجد امتحان مسجل'}</div></div>${studentBox({phone:r.phone,name:r.name,tpl})}</div>`).join('');
  }
  function renderMembers(rows){return rows.length?rows.map(p=>`<button class="card2" style="width:100%;text-align:right" data-profile="${p.id}"><b>${esc(p.name)}</b><div class="k">${esc(p.grade)} · ${esc(p.gender||'')}</div></button>`).join(''):'<p class="hint">لا توجد ملفات في نطاق الإسناد. إذا كنت خادمًا، اطلب من المالك إسناد المخدومين إلى حسابك في staff_profile_assignments.</p>';}
  root.onclick=e=>{
    const t=e.target.closest('[data-go],[data-profile],[data-a]');
    if(!t)return;
    if(t.dataset.go) location.hash='#/'+t.dataset.go;
    else if(t.dataset.profile) openProfile(t.dataset.profile);
    else if(t.dataset.a==='reload') mount(el,{role});
  };
  root.onkeydown=e=>{ const d=e.target&&e.target.dataset; if((e.key==='Enter'||e.key===' ')&&d&&d.profile&&e.target.getAttribute('role')==='button'){ e.preventDefault(); openProfile(d.profile); } };   // (v9.490) لوحة المفاتيح زي الزرار القديم
  root.oninput=e=>{if(e.target.id==='q'){const q=e.target.value.trim().toLocaleLowerCase('ar'); $('#memberList').innerHTML=renderMembers(members.filter(p=>p.name.toLocaleLowerCase('ar').includes(q)));}};
}
