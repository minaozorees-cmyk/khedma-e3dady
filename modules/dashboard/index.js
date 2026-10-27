// لوحة قيادة الخادم: ملخص من الجداول الموجودة، والنطاق الأمني يفرضه RLS في Supabase.
import {api,errMsg,fmtD,dayDiff,SB,studentBox,loadFuTpl} from '../../js/sapi.js';
const EXAM_MSG='سلام ونعمة يا {الاسم} ❤️ بقالك فترة ما حليتش امتحان، ربنا يبارك حياتك. ادخل حلّه لما تفضى.';   // (v9.490) رسالة كارت الامتحانات
import {esc} from '../../js/consts.js';
import * as SY from '../../js/sync.js';   // (v9.496) resultsFirst فقط (قراءة)
import {n} from '../../js/dates.js';
import {buildProgress,ringSvg} from '../../js/progress.js';   // (v9.496) دائرة التقدّم
const when=(x)=>x?dayDiff(x):null;
export async function mount(el,{role}={}){
  if(!['servant','priest','owner'].includes(role)){el.innerHTML='<div class="ph">الصفحة غير متاحة.</div>';return;}
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='850px'; el.replaceChildren(root);
  root.innerHTML='<div class="ph">جارٍ تحميل ملخص الخدمة…</div>';
  const $=s=>root.querySelector(s);
  // (v9.496) بيانات دائرة التقدّم (قراءة بس): مواعيد الإصحاحات + أول محاولة لكل إصحاح (RLS بيحدد النطاق). أي فشل أو كاش قديم = null (الدائرة تختفي والباقي شغال).
  const progP=(async()=>{ try{
    const [acc,res]=await Promise.all([api('/rest/v1/chapter_access?select=book_id,chapter_num,opens_at,closes_at&limit=2000'),SY.resultsFirst({refresh:true})]);
    if(!Array.isArray(acc)||!res||res.error||res.fromCache||res.truncated||!Array.isArray(res.rows)) return null;
    return {access:acc,results:res.rows};
  }catch(e){ return null; } })();
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
  root.innerHTML=`<div id="pgbox"></div><div class="card2" style="background:linear-gradient(135deg,rgba(201,168,76,.16),rgba(201,168,76,.03))">
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
  // ===== (v9.496) دائرة التقدّم: دائرة كبيرة للإجمالي + دوائر صغيرة للصفوف (لو أكتر من صف). كله جوه try/catch =====
  const phoneOf=new Map(followups.map(x=>[x.id,x.phone])), createdOf=new Map(members.map(p=>[p.id,Date.parse(p.created_at)||0]));
  const PG={data:null,sel:'all',open:false,solved:false};
  const scope=role==='servant'?'المسندين لك':'كل المخدومين';
  const ring=(x,d)=>`<div class="pg-ring lv-${x.level.key}" style="--d:${d}px">${ringSvg(x.pct)}<div class="pg-in"><b>${n(x.pct)}٪</b><small>${x.level.emoji} ${x.level.label}</small></div></div>`;
  const rep=(u)=>[...u.accounts].sort((a,b)=>((phoneOf.get(b.id)?1:0)-(phoneOf.get(a.id)?1:0))||((createdOf.get(b.id)||0)-(createdOf.get(a.id)||0)))[0].id;   // الحساب اللي ليه رقم، والأحدث
  function pgHtml(d){
    const head=`<b>📈 تقدّم الإصحاح المفتوح</b>`;
    if(d.state==='noStudents') return `<div class="card2 pg">${head}<div class="hint">${role==='servant'?'مفيش مخدومين مسندين':'مفيش مخدومين'}</div></div>`;
    if(d.state==='noOpen') return `<div class="card2 pg">${head}<div class="hint">لا يوجد إصحاح مفتوح حالياً</div></div>`;
    const ch=d.chapter, c=d.compare, all=d.all;
    const cmp=c?`<div class="k pg-cmp ${c.diff>0?'up':c.diff<0?'down':''}">${c.diff>0?'▲ +'+n(c.diff)+'٪ عن الأسبوع اللي فات':c.diff<0?'▼ −'+n(-c.diff)+'٪ عن الأسبوع اللي فات':'■ نفس نسبة الأسبوع اللي فات'}${c.sameChapter?'':` (إصحاح ${n(c.chapter.chapter_num)} · ${esc(c.chapter.title)})`} · تقريبي</div>`:'';
    const big=`<button class="pg-btn${PG.open&&PG.sel==='all'?' pg-sel':''}" data-a="pg" data-g="all" aria-label="تفاصيل ${esc(scope)}">${ring(all,150)}<div class="k">${n(all.solved)} من ${n(all.total)} مخدوم حلّوا</div></button>`;
    const minis=d.multi?`<div class="pg-row">${d.grades.map(g=>`<button class="pg-btn pg-mini${PG.open&&PG.sel===g.grade?' pg-sel':''}" data-a="pg" data-g="${esc(g.grade)}" aria-label="تفاصيل الصف ${esc(g.grade)}">${ring(g,84)}<b class="pg-gn">${esc(g.grade.replace(' الإعدادي',''))}</b><div class="k">${n(g.solved)} من ${n(g.total)}</div></button>`).join('')}</div>`:'';
    let det='';
    if(PG.open){
      const cur=PG.sel==='all'?all:(d.grades.find(g=>g.grade===PG.sel)||all), ttl=PG.sel==='all'?scope:'الصف '+PG.sel;
      const tpl=`سلام ونعمة يا {الاسم} ❤️ لسه ما حليتش إصحاح ${n(ch.chapter_num)} من ${ch.title}، ربنا يبارك حياتك. ادخل حلّه لما تفضى.`;
      const row=(u)=>{ const id=rep(u); return `<div class="card2" style="width:100%"><div data-profile="${esc(id)}" role="button" tabindex="0" style="cursor:pointer;text-align:right"><b>${esc(u.name)}</b><div class="k">${esc(u.grade)}${u.accounts.length>1?` · 👯 ${n(u.accounts.length)} حسابات`:''}</div></div>${studentBox({phone:phoneOf.get(id)||'',name:u.name,tpl})}</div>`; };
      det=`<div class="pg-det"><div class="row" style="border:0;padding:0"><b>${esc(ttl)}</b><span>${n(cur.solved)} من ${n(cur.total)} · ${n(cur.pct)}٪</span></div>
        <div class="hint">⏳ لم يحلّوا (${n(cur.unsolvedList.length)})</div>${cur.unsolvedList.length?cur.unsolvedList.map(row).join(''):'<p class="hint">🎉 الكل حلّ الإصحاح.</p>'}
        <button class="btn sec" style="${SB}" data-a="pgs">${PG.solved?'إخفاء الذين حلّوا':`✅ إظهار الذين حلّوا (${n(cur.solvedList.length)})`}</button>
        ${PG.solved?`<div class="pg-solved">${cur.solvedList.length?cur.solvedList.map(u=>`<div class="row"><span>✅ ${esc(u.name)}</span><span class="k">${esc(u.grade)}${u.accounts.length>1?` · 👯 ${n(u.accounts.length)}`:''}</span></div>`).join(''):'<p class="hint">لسه محدش حلّ.</p>'}</div>`:''}</div>`;
    }
    return `<div class="card2 pg">${head}<div class="hint">${esc(scope)} · ${esc(ch.title)} · إصحاح ${n(ch.chapter_num)}${ch.opens_at?` · مفتوح من ${esc(fmtD(ch.opens_at))}`:''}${ch.ties>1?` · (${n(ch.ties)} إصحاحات اتفتحوا معاً، المعروض أصغرهم)`:''}</div>
      <div class="pg-main">${big}${cmp}</div>${minis}${det}</div>`;
  }
  function paintPg(){ const b=$('#pgbox'); if(!b) return; try{ b.innerHTML=PG.data?pgHtml(PG.data):''; }catch(e){ b.innerHTML=''; } }
  progP.then(d=>{ try{ if(!d||!root.isConnected) return; PG.data=buildProgress({students:members,results:d.results,access:d.access,now:Date.now()}); paintPg(); }catch(e){ try{ const b=$('#pgbox'); if(b) b.innerHTML=''; }catch(x){} } });
  root.onclick=e=>{
    const t=e.target.closest('[data-go],[data-profile],[data-a]');
    if(!t)return;
    if(t.dataset.go) location.hash='#/'+t.dataset.go;
    else if(t.dataset.profile) openProfile(t.dataset.profile);
    else if(t.dataset.a==='reload') mount(el,{role});
    else if(t.dataset.a==='pg'){ const g=t.dataset.g||'all'; if(PG.open&&PG.sel===g) PG.open=false; else{ PG.sel=g; PG.open=true; } paintPg(); }
    else if(t.dataset.a==='pgs'){ PG.solved=!PG.solved; paintPg(); }
  };
  root.onkeydown=e=>{ const d=e.target&&e.target.dataset; if((e.key==='Enter'||e.key===' ')&&d&&d.profile&&e.target.getAttribute('role')==='button'){ e.preventDefault(); openProfile(d.profile); } };   // (v9.490) لوحة المفاتيح زي الزرار القديم
  root.oninput=e=>{if(e.target.id==='q'){const q=e.target.value.trim().toLocaleLowerCase('ar'); $('#memberList').innerHTML=renderMembers(members.filter(p=>p.name.toLocaleLowerCase('ar').includes(q)));}};
}
