// لوحة قيادة الخادم: ملخص من الجداول الموجودة، والنطاق الأمني يفرضه RLS في Supabase.
import {api,errMsg,fmtD,dayDiff,SB,studentBox,loadFuTpl} from '../../js/sapi.js';
const EXAM_MSG='سلام ونعمة يا {الاسم} ❤️ بقالك فترة ما حليتش امتحان، ربنا يبارك حياتك. ادخل حلّه لما تفضى.';   // (v9.490) رسالة كارت الامتحانات
import {esc} from '../../js/consts.js';
import * as SY from '../../js/sync.js';   // (v9.496) resultsFirst فقط (قراءة)
import {n} from '../../js/dates.js';
import {buildScoped,scopeOptions,openChapter,ringSvg,GRADES,activeIds,activeRows} from '../../js/progress.js';   // (v9.496) دائرة التقدّم (v9.501: نطاق × فئة)
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
  // ===== (v9.501) مؤشرات التقدّم: نطاق القياس (الإصحاح المفتوح / إصحاح محدد / سفر محدد) × فئة (جنس + صف). كله جوه try/catch =====
  // دايرة أساسية للفئة المختارة (أ: نسبة جوّه الفئة + سطر ب: من كل الجنس) + ٥ دوائر ثابتة (أولاد/بنات/٣ صفوف). الضغط على أي دايرة = قائمتا «حلّوا» و«لم يحلّوا» مع نسخ الأسماء.
  const phoneOf=new Map(followups.map(x=>[x.id,x.phone])), createdOf=new Map(members.map(p=>[p.id,Date.parse(p.created_at)||0]));
  const scopeWord=role==='servant'?'المسندين لك':'كل المخدومين';
  const ring=(x,d)=>`<div class="pg-ring lv-${x.level.key}" style="--d:${d}px">${ringSvg(x.pct)}<div class="pg-in"><b>${n(x.pct)}٪</b><small>${x.level.emoji} ${x.level.label}</small></div></div>`;
  const rep=(u)=>[...u.accounts].sort((a,b)=>((phoneOf.get(b.id)?1:0)-(phoneOf.get(a.id)?1:0))||((createdOf.get(b.id)||0)-(createdOf.get(a.id)||0)))[0].id;   // الحساب اللي ليه رقم، والأحدث
  const PG={in:null,scope:{type:'open',book_id:'',chapter_num:0},group:{gender:'all',grade:'all'},sel:'',books:null,busy:false,toast:'',th:null,act:null,bp:null};
  const short=(g)=>String(g).replace(' الإعدادي','');
  const glabel=(g)=>[g.gender==='boys'?'أولاد':g.gender==='girls'?'بنات':'',g.grade!=='all'?short(g.grade):''].filter(Boolean).join(' · ')||scopeWord;
  const bookNums=()=>PG.books?PG.books.chapters:{}, bookTitles=()=>PG.books?PG.books.titles:{};
  // (v9.505) كل حسابات النطاق (دايرة المفتوح، القوايم، شارات «متأخر») على الأسفار النشطة بس (PG.act)؛ لو مش معروفة بتفضل الصفوف زي ما هي
  const rowsOf=(a)=>activeRows(a,PG.act);
  const calc=()=>buildScoped({students:members,results:rowsOf(PG.in.results),access:rowsOf(PG.in.access),now:Date.now(),scope:PG.scope,bookChapters:bookNums(),bookTitles:bookTitles(),group:PG.group});
  const optsOf=()=>scopeOptions({results:rowsOf(PG.in.results),access:rowsOf(PG.in.access),now:Date.now(),bookChapters:bookNums(),bookTitles:bookTitles()});
  // قائمة إصحاحات الأسفار الكاملة بتتحمّل مرة واحدة وقت الحاجة (سفر/إصحاح محدد)؛ لو فشلت نكمّل بتقدير من المواعيد والنتايج
  // (v9.505) بتتحمّل مرة واحدة أول ما اللوحة تفتح (مش بس لما تختار سفر): الأسفار الحقيقية (chapters/titles من books.js) + ids النشطة (SY.booksList = جدول books على السيرفر أولاً).
  // ما بترميش خطأ؛ لو الاتنين فشلوا PG.act=null والسلوك القديم (تقدير من المواعيد والنتايج).
  function loadBooks(){
    if(PG.bp) return PG.bp; PG.busy=true;
    PG.bp=Promise.all([
      import('../../js/books.js').then(m=>m.loadAll()).catch(()=>null),
      Promise.resolve().then(()=>typeof SY.booksList==='function'?SY.booksList():null).catch(()=>null)
    ]).then(([r,list])=>{
      const chapters={},titles={}; for(const bk of ((r&&r.books)||[])){ chapters[bk.id]=(bk.chapters||[]).map(c=>c.chapterNum); titles[bk.id]=bk.title; }
      PG.books=r?{chapters,titles}:{chapters:{},titles:{},failed:true};
      PG.act=activeIds({serverIds:Array.isArray(list)?list.map(x=>x&&x.id):null,loadedIds:Object.keys(chapters)});
    }).catch(()=>{ PG.books={chapters:{},titles:{},failed:true}; PG.act=null; }).then(()=>{ PG.busy=false; });
    return PG.bp;
  }
  const ensureBooks=()=>{ loadBooks().then(()=>paintPg()); };
  function fixChapter(bk,oc){
    if(!bk){ PG.scope.chapter_num=0; return; } const c=bk.chapters;
    if(!c.includes(PG.scope.chapter_num)) PG.scope.chapter_num=(oc&&oc.book_id===bk.book_id&&c.includes(oc.chapter_num))?oc.chapter_num:c[c.length-1];
  }
  function normScope(){   // يضمن إن السفر/الإصحاح المختار لسه موجود في القوايم
    if(PG.scope.type==='open') return;
    const o=optsOf(); let bk=o.find(x=>x.book_id===PG.scope.book_id);
    if(!bk){ const oc=openChapter(rowsOf(PG.in.access),Date.now()); bk=o.find(x=>oc&&x.book_id===oc.book_id)||o[0]; PG.scope.book_id=bk?bk.book_id:''; }
    if(PG.scope.type==='chapter') fixChapter(bk,openChapter(rowsOf(PG.in.access),Date.now()));
  }
  function setType(type){ PG.scope.type=type; if(type!=='open') ensureBooks(); paintPg(); }
  async function copyTxt(t){
    try{ await navigator.clipboard.writeText(t); return true; }catch(e){}
    try{ const ta=document.createElement('textarea'); ta.value=t; ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); const ok=document.execCommand('copy'); ta.remove(); return ok; }catch(e){ return false; }
  }
  function toastIt(m){ PG.toast=m; paintPg(); clearTimeout(PG.th); PG.th=setTimeout(()=>{ PG.toast=''; paintPg(); },2600); }
  const curOf=(d)=>d&&d.state==='ok'&&PG.sel?(PG.sel==='main'?d.main:d.subs.find(x=>x.key===PG.sel)):null;
  async function copyNames(k){   // أسماء بس، سطر لكل اسم (جاهزة للواتساب)
    try{
      const cur=curOf(calc()); if(!cur) return; const list=k==='sv'?cur.solvedList:cur.unsolvedList;
      if(!list.length){ toastIt('مفيش أسماء للنسخ'); return; }
      toastIt((await copyTxt(list.map(u=>u.name).join('\n')))?'تم نسخ الأسماء بنجاح ✅':'تعذّر النسخ، جرّب تاني.');
    }catch(e){}
  }
  function pgHtml(){
    const head='<b>📈 تقدّم المخدومين</b>';
    if(!members.length) return `<div class="card2 pg">${head}<div class="hint">${role==='servant'?'مفيش مخدومين مسندين':'مفيش مخدومين'}</div></div>`;
    normScope();
    const d=calc(), o=optsOf(), sc=PG.scope, gp=PG.group;
    const opt=(v,l,on)=>`<option value="${esc(String(v))}"${on?' selected':''}>${esc(l)}</option>`;
    const bk=o.find(x=>x.book_id===sc.book_id);
    const ctl=`<div class="pg-ctl"><div class="fld"><label for="pgType">النطاق</label><select id="pgType">${opt('open','الإصحاح المفتوح حالياً',sc.type==='open')}${opt('chapter','إصحاح محدد',sc.type==='chapter')}${opt('book','سفر محدد',sc.type==='book')}</select></div>`
      +(sc.type!=='open'?`<div class="fld"><label for="pgBook">السفر</label><select id="pgBook">${o.map(x=>opt(x.book_id,x.title,x.book_id===sc.book_id)).join('')||opt('','—',true)}</select></div>`:'')
      +(sc.type==='chapter'?`<div class="fld"><label for="pgCh">الإصحاح</label><select id="pgCh">${(bk?bk.chapters:[]).map(c=>opt(c,'إصحاح '+n(c),c===sc.chapter_num)).join('')||opt('','—',true)}</select></div>`:'')+'</div>';
    const chip=(a,v,l,on)=>`<button class="btn${on?'':' sec'}" style="${SB}" data-a="${a}" data-v="${v}">${l}</button>`;
    const flt=`<div class="pg-flt">${chip('pgg','all','الكل',gp.gender==='all')}${chip('pgg','boys','👦 أولاد',gp.gender==='boys')}${chip('pgg','girls','👧 بنات',gp.gender==='girls')}</div>`
      +`<div class="pg-flt">${chip('pgr','all','كل الصفوف',gp.grade==='all')}${GRADES.map(g=>chip('pgr',esc(g),esc(short(g)),gp.grade===g)).join('')}</div>`;
    const wait=sc.type!=='open'&&PG.busy?'<div class="hint">جارٍ تحميل قوائم الإصحاحات…</div>':'';
    const frame=(inner)=>`<div class="card2 pg">${head}${ctl}${flt}${wait}${inner}</div>${PG.toast?`<div class="pg-toast" role="status">${esc(PG.toast)}</div>`:''}`;
    if(d.state==='noOpen') return frame('<div class="hint">لا يوجد إصحاح مفتوح حالياً. اختر إصحاح أو سفر من القائمة.</div>');
    if(d.state==='noScope') return frame('<div class="hint">اختر السفر والإصحاح.</div>');
    if(d.state==='noChapters') return frame(`<div class="hint">مفيش إصحاحات مفتوحة في سفر ${esc(d.title||'')} لحد دلوقتي.</div>`);
    const t=d.target, m=d.main, c=d.compare;
    const scopeTxt=t.type==='book'?`${esc(t.title)} · كل الإصحاحات المفتوحة (${n(t.required.length)})${t.approx?' · القائمة تقريبية':''}`:`${esc(t.title)} · إصحاح ${n(t.chapter_num)}${t.type==='open'&&t.opens_at?` · مفتوح من ${esc(fmtD(t.opens_at))}`:''}${t.ties>1?` · (${n(t.ties)} إصحاحات اتفتحوا معاً، المعروض أصغرهم)`:''}`;
    const cmp=c?`<div class="k pg-cmp ${c.diff>0?'up':c.diff<0?'down':''}">${c.diff>0?'▲ +'+n(c.diff)+'٪ عن الأسبوع اللي فات':c.diff<0?'▼ −'+n(-c.diff)+'٪ عن الأسبوع اللي فات':'■ نفس نسبة الأسبوع اللي فات'}${c.sameChapter?'':` (إصحاح ${n(c.chapter.chapter_num)} · ${esc(c.chapter.title)})`} · تقريبي</div>`:'';
    const gl=glabel(m.group);
    const big=m.empty?`<div class="hint">مفيش مخدومين في الفئة دي</div>`
      :`<button class="pg-btn${PG.sel==='main'?' pg-sel':''}" data-a="pg" data-g="main" aria-label="تفاصيل ${esc(gl)}">${ring(m,150)}<div class="k">${n(m.solved)} من ${n(m.total)} (${esc(gl)}) حلّوا</div></button>`
        +(m.share?`<div class="k">يمثّلون ${n(m.share.solved)} من ${n(m.share.total)} ${esc(m.share.word)} (${n(m.share.pct)}٪)</div>`:'');
    const minis=`<div class="pg-row">${d.subs.map(x=>x.empty?`<div class="pg-mini pg-empty"><b class="pg-gn">${esc(x.label)}</b><div class="k">مفيش مخدومين</div></div>`
      :`<button class="pg-btn pg-mini${PG.sel===x.key?' pg-sel':''}" data-a="pg" data-g="${x.key}" aria-label="تفاصيل ${esc(x.label)}">${ring(x,84)}<b class="pg-gn">${esc(x.label)}</b><div class="k">${n(x.solved)} من ${n(x.total)}</div></button>`).join('')}</div>`;
    let det=''; const cur=curOf(d);
    if(cur&&!cur.empty){
      const ttl=PG.sel==='main'?gl:cur.label;
      const tpl=t.type==='book'?`سلام ونعمة يا {الاسم} ❤️ لسه ما كمّلتش إصحاحات سفر ${t.title}، ربنا يبارك حياتك. ادخل كمّلها لما تفضى.`:`سلام ونعمة يا {الاسم} ❤️ لسه ما حليتش إصحاح ${n(t.chapter_num)} من ${t.title}، ربنا يبارك حياتك. ادخل حلّه لما تفضى.`;
      const lbl=(x)=>x.book_id===t.book_id?n(x.chapter_num):`${n(x.chapter_num)} ${esc(x.title)}`;
      const late=(u)=>u.late&&u.late.length?` <span class="warn" style="display:inline;padding:1px 6px;font-size:.75rem">(حل إصحاح ${u.late.map(lbl).join(' و')} متأخر)</span>`:'';
      const row=(u)=>{ const id=rep(u); return `<div class="card2" style="width:100%"><div data-profile="${esc(id)}" role="button" tabindex="0" style="cursor:pointer;text-align:right"><b>${esc(u.name)}</b>${late(u)}<div class="k">${esc(u.grade)}${u.accounts.length>1?` · 👯 ${n(u.accounts.length)} حسابات`:''}</div></div>${studentBox({phone:phoneOf.get(id)||'',name:u.name,tpl})}</div>`; };
      det=`<div class="pg-det"><div class="row" style="border:0;padding:0"><b>${esc(ttl)}</b><span>${n(cur.solved)} من ${n(cur.total)} · ${n(cur.pct)}٪</span></div>
        <div class="pg-cp"><div class="hint">⏳ لم يحلّوا (${n(cur.unsolvedList.length)})</div><button class="btn sec" style="${SB}" data-a="pgcopy" data-k="un"${cur.unsolvedList.length?'':' disabled'}>📋 نسخ أسماء اللي ما حلوش</button></div>
        ${cur.unsolvedList.length?cur.unsolvedList.map(row).join(''):'<p class="hint">🎉 الكل حلّ.</p>'}
        <div class="pg-cp"><div class="hint">✅ حلّوا (${n(cur.solvedList.length)})</div><button class="btn sec" style="${SB}" data-a="pgcopy" data-k="sv"${cur.solvedList.length?'':' disabled'}>📋 نسخ أسماء اللي حلوا</button></div>
        <div class="pg-solved">${cur.solvedList.length?cur.solvedList.map(u=>`<div class="row"><span>✅ ${esc(u.name)}</span><span class="k">${esc(u.grade)}${u.accounts.length>1?` · 👯 ${n(u.accounts.length)}`:''}</span></div>`).join(''):'<p class="hint">لسه محدش حلّ.</p>'}</div></div>`;
    }
    const ng=d.noGender?`<div class="hint">ℹ️ ${n(d.noGender)} مخدوم بدون جنس مسجّل: داخلين في الإجمالي والصفوف، ومش داخلين في أولاد/بنات.</div>`:'';
    return frame(`<div class="hint">${esc(scopeWord)} · ${scopeTxt}</div><div class="pg-main">${big}${cmp}</div>${minis}${ng}${det}`);
  }
  function paintPg(){ const b=$('#pgbox'); if(!b) return; try{ b.innerHTML=PG.in?pgHtml():''; }catch(e){ b.innerHTML=''; } }
  // (v9.505) الرسم بعد ما الاتنين يجهزوا (بيانات التقدّم + قايمة الأسفار النشطة) عشان سفر محذوف ما يظهرش لحظة؛ مهلة ٦ ثواني للأسفار، ولو اتأخرت بنعيد الرسم لما توصل
  const booksP=loadBooks(), booksWait=new Promise(r=>{ const t=setTimeout(r,6000); booksP.then(()=>{ clearTimeout(t); r(); }); });
  Promise.all([progP,booksWait]).then(([d])=>{ try{ if(!d||!root.isConnected) return; PG.in=d; paintPg(); }catch(e){ try{ const b=$('#pgbox'); if(b) b.innerHTML=''; }catch(x){} } });
  booksP.then(()=>{ try{ if(PG.in&&root.isConnected) paintPg(); }catch(e){} });
  root.onclick=e=>{
    const t=e.target.closest('[data-go],[data-profile],[data-a]');
    if(!t)return;
    if(t.dataset.go) location.hash='#/'+t.dataset.go;
    else if(t.dataset.profile) openProfile(t.dataset.profile);
    else if(t.dataset.a==='reload') mount(el,{role});
    else if(t.dataset.a==='pg'){ const g=t.dataset.g||'main'; PG.sel=PG.sel===g?'':g; paintPg(); }   // (v9.501) ضغطة تانية على نفس الدايرة بتقفل التفاصيل
    else if(t.dataset.a==='pgg'){ PG.group.gender=['boys','girls'].includes(t.dataset.v)?t.dataset.v:'all'; paintPg(); }
    else if(t.dataset.a==='pgr'){ PG.group.grade=GRADES.includes(t.dataset.v)?t.dataset.v:'all'; paintPg(); }
    else if(t.dataset.a==='pgcopy') copyNames(t.dataset.k==='sv'?'sv':'un');
  };
  root.onkeydown=e=>{ const d=e.target&&e.target.dataset; if((e.key==='Enter'||e.key===' ')&&d&&d.profile&&e.target.getAttribute('role')==='button'){ e.preventDefault(); openProfile(d.profile); } };   // (v9.490) لوحة المفاتيح زي الزرار القديم
  root.onchange=e=>{   // (v9.501) قوايم النطاق: النوع ← السفر ← الإصحاح
    try{
      const id=e.target&&e.target.id, v=e.target&&e.target.value;
      if(id==='pgType') setType(v==='chapter'||v==='book'?v:'open');
      else if(id==='pgBook'){ PG.scope.book_id=v; PG.scope.chapter_num=0; paintPg(); }
      else if(id==='pgCh'){ PG.scope.chapter_num=Number(v)||0; paintPg(); }
    }catch(x){}
  };
  root.oninput=e=>{if(e.target.id==='q'){const q=e.target.value.trim().toLocaleLowerCase('ar'); $('#memberList').innerHTML=renderMembers(members.filter(p=>p.name.toLocaleLowerCase('ar').includes(q)));}};
}
