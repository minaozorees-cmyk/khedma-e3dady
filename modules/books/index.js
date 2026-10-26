import {loadAll,ensureText} from '../../js/books.js';
import * as X from '../../js/exam-engine.js';
import * as R from '../../js/results.js';
import * as A from '../../js/auth.js';
import * as S from '../../js/exam-session.js';
import * as SY from '../../js/sync.js';
import * as AC from '../../js/access.js';
import {checkUpdate} from '../../js/update.js';
import {esc} from '../../js/consts.js';
import {n} from '../../js/dates.js';
import * as TTS from '../../js/tts.js';
import * as T from '../../js/solve-timer.js';
import * as RS from '../../js/read-session.js';
const ARCH_MSG='⚠️ حسابك اتأرشف: نتيجتك اتسجّلت بس ما بتظهرش للخدام ولا بتتحسب. استخدم حسابك المعتمد بالكود اللي اتبعتلك (اضغط «عندي كود» واكتب اسمك والكود)، أو كلّم خادمك.';   // (v9.494)   // (v9.489) وقت القراءة Pause/Resume
import * as db from '../../js/db.js';

const AR='٠١٢٣٤٥٦٧٨٩';
const mmss=(ms)=>{ const s=Math.ceil(Math.max(0,ms)/1000); return (n(Math.floor(s/60))+':'+String(s%60).padStart(2,'0')).replace(/\d/g,d=>AR[d]); };
const NEED_CHAP=['start','med','toRead','ans','pick','unpick','next','quit','redeem'];
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

export async function mount(el,ctx){
  el.innerHTML='<div class="ph">جارٍ التحميل…</div>';
  const {books,problems}=await loadAll();
  const prof=await A.activeProfile(), pid=prof?prof.id:'local', nm=esc((prof&&prof.name.split(' ')[0])||'حبيبي');
  const staff=ctx.role!=='student', isStudent=ctx.role==='student'&&!!prof, gated=ctx.role==='student'; // v9.21: القفل بالمواعيد على المخدوم فقط
  let st={s:'books'}, flash='', tick=null, sess=null, bt=null, tm=null, qt=null, rt=null, rtk=null, rmap={}, rSaved=0;   // (v9.489) rt: وقت القراءة الفعلي، rtk: مؤقّت عرضه، rmap: جلسات القراءة المحفوظة، rSaved: آخر حفظ   // (v9.481) tm: وقت الحل الفعلي، qt: مؤقّت عرض العدّاد   // bt: مؤقّت ظهور أسفار جديدة عند حلول ميعادها (v9.39)
  const unlocked=new Set(); // إصحاحات انتهى عدّاد قراءتها في هذه الجلسة
  const book=()=>books.find(b=>b.id===st.bid);
  const chap=()=>{ const b=book(); return b&&b.chapters.find(c=>c.chapterNum===st.num); };
  const findCh=(bid,num)=>{ const b=books.find(x=>x.id===bid), c=b&&b.chapters.find(x=>x.chapterNum===num); return c?{b,c}:null; };
  const ukey=()=>st.bid+'|'+st.num;
  // (v9.39) للمخدوم: السفر يظهر فقط لو فيه إصحاح مفتوح الآن (بميعاد حلّ أو بدون ميعاد أو مفتوح بكود). الطاقم يرى كل الأسفار. الوقت من ساعة السيرفر/الموبايل ويشتغل أوفلاين.
  const bookOpen=(b)=>b.chapters.some(c=>!AC.isLocked(b.id,c.chapterNum));
  const shownBooks=()=>gated?books.filter(bookOpen):books;
  // (v9.39) تكبير/تصغير الخط (نسبة مئوية) — يُحفظ على الجهاز
  const ZK='quizZoom', ZMIN=80, ZMAX=160, ZSTEP=10;
  let zoom=100; try{ const v=Number(localStorage.getItem(ZK)); if(Number.isFinite(v)&&v>=ZMIN&&v<=ZMAX) zoom=Math.round(v/ZSTEP)*ZSTEP; }catch(e){}
  const zbar=()=>`<div class="zbar"><button class="zb" data-a="zout" aria-label="تصغير الخط"${zoom<=ZMIN?' disabled':''}>A−</button><span class="zl" id="zl">${n(zoom)}٪</span><button class="zb" data-a="zin" aria-label="تكبير الخط"${zoom>=ZMAX?' disabled':''}>A+</button></div>`;
  const me=(t)=>esc(t).replace(/\{name\}/g,nm);
  const back=(a,t)=>`<button class="btn sec" data-a="${a}">${t}</button>`;
  const answeredCount=(qs,ans)=>qs.filter((q,i)=>X.isAnswered(q,ans[i])).length;
  // (v9.38) عدد أسئلة الامتحان: لو للسفر qn>0 بيتسحب qn سؤال عشوائياً من البنك (بترتيب الملف). sel = أرقام الأسئلة المختارة وبتتحفظ في الجلسة.
  const examN=(b,c)=>{ const L=c.questions.length; return b.qn>0&&b.qn<L?b.qn:L; };
  const pickSel=(L,k)=>{ const all=Array.from({length:L},(_,i)=>i); return k>0&&k<L?X.shuffle(all).slice(0,k).sort((a,b)=>a-b):all; };
  const validSel=(sel,L)=>Array.isArray(sel)&&sel.length>0&&sel.length<=L&&new Set(sel).size===sel.length&&sel.every(i=>Number.isInteger(i)&&i>=0&&i<L);
  const sessQs=(c,s)=>s.sel==null?c.questions:(validSel(s.sel,c.questions.length)?s.sel.map(i=>c.questions[i]):null);   // جلسة قديمة بلا sel = كل الأسئلة؛ null = تغيّر المحتوى
  const nextA=(c)=>c.meditation?'med':'start';
  const goLabel=(c,left)=>c.meditation?(left?'التالي: الآية والتأمل بعد '+mmss(left):'التالي: الآية والتأمل ←'):(left?'ابدأ الامتحان بعد '+mmss(left):`ابدأ الامتحان (${n(examN(book(),c))} سؤال)`);
  // v9.12: مدة الامتحان بالثواني من startedAt (للجلسة المغلقة: لآخر نشاط محفوظ). أكتر من ساعتين = غير معروفة (null)
  const dur=(a,b)=>{ const s=Math.round(((b||0)-(a||0))/1000); return a&&b&&s>=0&&s<=7200?s:null; };

  // ===== الجلسة المحفوظة =====
  const pnow=()=>performance.now();
  const persist=()=>{
    return S.save({bid:st.bid,num:st.num,i:st.i,sel:st.sel,ans:Array.from({length:st.qs.length},(_,k)=>st.ans[k]??null),
      opts:st.opts,tl:st.shuf.map(x=>x?x.map(e=>e.id):null),startedAt:st.startedAt,profileId:pid,el:tm?T.snap(tm,pnow()):0}); };   // el = ثواني الحل المجمّعة (v9.481)
  // يغلق الجلسة ويحسبها محاولة بدرجتها الحالية؛ يرجع رسالة للمخدوم
  // (v9.485) R.record لازم يرجّع الوقت اللي اتبعتله؛ لو ما رجّعوش (results.js قديم) نكتبه في المحاولة المخزّنة وفي الكائن الراجع.
  async function ensureDuration(att,d){
    if(d==null||att.durationSec===d) return false;
    try{ const X=(await db.get('results'))||{attempts:[]}, t=X.attempts.find(x=>x.id===att.id); if(t){ t.durationSec=d; await db.set('results',X); } }catch(e){ console.error('[results] تعذّر حفظ durationSec',e); }
    att.durationSec=d; return true;
  }
  async function closeSession(s,source){
    const f=findCh(s.bid,s.num), qs0=f&&sessQs(f.c,s);
    if(!f||!qs0){ await S.clear(); sess=null; return ''; }
    const ans=s.ans||[], r=X.grade(qs0,ans);
    const cd=Number.isFinite(s.el)?T.toDuration(s.el):dur(s.startedAt,s.updatedAt);
    const ca=await R.record({bookId:s.bid,chapterNum:s.num,score:r.score,total:r.total,source,answered:answeredCount(qs0,ans),durationSec:cd}); await ensureDuration(ca,cd);   // جلسات قديمة بلا el: الحساب القديم
    await S.clear(); sess=null;
    const where=`${f.b.title} — إصحاح ${n(s.num)}`;
    return source==='expired'
      ?`انتهت جلسة امتحانك السابق (${where}) لأن مرّ عليها أكتر من ٦ ساعات، وتم تسجيل محاولة بدرجتك: ${n(r.score)} / ${n(r.total)}.`
      :`تم تسجيل محاولة الامتحان السابق (${where}) بدرجتك: ${n(r.score)} / ${n(r.total)}.`;
  }
  // يعيد بناء حالة الامتحان من الجلسة، أو null لو تغيّر محتوى الإصحاح
  function hydrate(s){
    const f=findCh(s.bid,s.num); if(!f) return null; const qs=sessQs(f.c,s); if(!qs) return null; const L=qs.length;
    if(![s.ans,s.opts,s.tl].every(x=>Array.isArray(x)&&x.length===L)) return null;
    const shuf=[], opts=[];
    for(let k=0;k<L;k++){ const q=qs[k];
      if(q.isTimeline){ const ev=(s.tl[k]||[]).map(id=>q.events.find(e=>e.id===id)); if(ev.length!==q.events.length||ev.some(e=>!e)) return null; shuf.push(ev); opts.push(null); }
      else{ const p=s.opts[k]; if(!Array.isArray(p)||p.length!==q.opts.length||[...p].sort((a,b)=>a-b).some((v,x)=>v!==x)) return null; shuf.push(null); opts.push(p); } }
    return {s:'exam',bid:s.bid,num:s.num,i:Math.min(Math.max(0,s.i|0),L-1),ans:[...s.ans],opts,shuf,sel:s.sel==null?null:s.sel,qs,startedAt:s.startedAt,el0:Number.isFinite(s.el)&&s.el>=0?s.el:0};
  }
  // (v9.489) وقت القراءة بقى Pause/Resume: بيعدّ والتطبيق ظاهر بس (performance.now مش ساعة الحيط)، ويتحفظ لكل إصحاح في read_session.
  // لو الجلسة عدّت ٦ ساعات من أول فتح، أو المخدوم كان خلّص القراءة قبل كده في نفس الجلسة، بتتعامل بالقاعدة دي.
  function enterRead(bid,num){
    const b=books.find(x=>x.id===bid), now=Date.now(); st={s:'read',bid,num}; rt=null; rStop();
    const need=Number(b.readMinutes)>0; let it=RS.get(rmap,bid,num,now);
    if(!it&&need) unlocked.delete(ukey());   // الجلسة انتهت (> ٦ ساعات من أول فتح): تبدأ من الأول
    if(it&&(it.done||it.el*1000>=b.readMinutes*60000)) unlocked.add(ukey());   // خلّص القراءة قبل كده
    if(need&&!unlocked.has(ukey())){
      if(!it){ rmap=RS.start(rmap,bid,num,now); it=RS.get(rmap,bid,num,now); }
      rt=T.create(it.el); rt.b=bid; rt.n=num; rPersist();
    }
    if(isStudent) SY.logOpen(bid,num);
  }
  async function startExam(){
    const c=chap(), sel=pickSel(c.questions.length,book().qn), qs=sel.map(i=>c.questions[i]);   // (v9.38) سحب عشوائي لو qn>0
    st={s:'exam',bid:st.bid,num:st.num,i:0,ans:[],startedAt:Date.now(),sel,qs,
      opts:qs.map(q=>q.isTimeline?null:X.shuffle(q.opts.map((_,k)=>k))), // ترتيب العرض؛ data-k يبقى الـindex الأصلي
      shuf:qs.map(q=>q.isTimeline?X.shuffledEvents(q):null)};
    tm=T.create(0);   // العدّاد يبدأ فعلياً لما شاشة السؤال تظهر (qSync)
    await persist();
  }
  async function finish(source){
    const r=X.grade(st.qs,st.ans);
    if(tm) T.pause(tm,pnow());
    const elBefore=tm?Math.round(tm.el*10)/10:null;
    const durSec=tm?T.toDuration(tm.el):dur(st.startedAt,Date.now());   // (v9.481) وقت الأسئلة الفعلي
    const att=await R.record({bookId:st.bid,chapterNum:st.num,score:r.score,total:r.total,source,answered:answeredCount(st.qs,st.ans),durationSec:durSec});
    const fixed=await ensureDuration(att,durSec);   // (v9.485) لو results.js على الجهاز قديم ومابيحفظش الوقت: نصلّحه فوراً قبل الرفع
    SY.finishDiag({at:Date.now(),build:'v9.486',bid:st.bid,num:st.num,att:att.attemptNo,hasTimer:!!tm,el:elBefore,dur:att.durationSec==null?null:att.durationSec,fix:fixed,src:source});   // (v9.484) تشخيص مؤقت: ما حسبه finish()
    await S.clear(); sess=null;
    st.res=r; st.att=att; st.sum=R.summary(await R.all(),st.bid,st.num); st.s='result';
  }

  // ===== العرض =====
  const probs=()=>staff&&problems.length?`<details class="card2"><summary>⚠️ ملاحظات على الملفات (${n(problems.length)})</summary>${problems.map(p=>`<div class="row"><span><b>${esc(p.file)}</b> — ${esc(p.msg)}</span></div>`).join('')}</details>`:'';
  const views={
    async books(){
      let rc=''; if(sess){ const f=findCh(sess.bid,sess.num);
        if(f) rc=`<div class="card2"><b>⏸ عندك امتحان مفتوح</b><div class="hint">${esc(f.b.title)} — إصحاح ${n(sess.num)}</div><button class="btn" data-a="resume">كمّل من النقطة</button></div>`; }
      if(!books.length) return `<div class="ph">📖 لا توجد مسابقات بعد.<br>تُضاف كملفات JSON في مجلد books/</div>${probs()}`;
      const vis=shownBooks();
      if(!vis.length) return `${rc}<div class="ph">📖 لا يوجد امتحان مفتوح اليوم.<br><small>لو لسه ما فتحتش التطبيق بالنت من وقت قريب، افتحه مرة عشان توصلك آخر المواعيد.</small></div>`;
      return `${rc}<div class="gate">${vis.map(b=>`<button class="card2 bk" data-a="book" data-id="${esc(b.id)}"><b>${esc(b.title)}</b><small>${n(b.chapters.length)} إصحاح</small></button>`).join('')}${probs()}</div>`;
    },
    async chapters(){
      const at=await R.all(), b=book();
      return `<div class="gate"><h3 class="ttl">${esc(b.title)}</h3><div class="hint">الرقم تحت كل إصحاح = درجة أول محاولة (المعتمدة)</div><div class="chgrid">${b.chapters.map(c=>{ const s=R.summary(at,b.id,c.chapterNum), lk=gated&&AC.isLocked(b.id,c.chapterNum);
        return `<button class="chb${s.n?' done':''}" data-a="chap" data-n="${c.chapterNum}">${n(c.chapterNum)}<small>${lk?'🔒':s.first?n(s.first.score)+'/'+n(s.first.total):'—'}</small></button>`; }).join('')}</div>${gated&&b.chapters.some(c=>AC.isLocked(b.id,c.chapterNum))?'<div class="hint">🔒 = مقفول لحد ميعاده، أو بكود من الخادم</div>':''}${b.chapters.some(c=>c.meditation)?'<button class="btn sec" data-a="verses">📜 آيات السفر</button>':''}${back('toBooks','رجوع للأسفار')}</div>`;
    },
    async locked(){
      const c=chap(), lk=AC.lock(st.bid,st.num), D=(t)=>new Date(t).toLocaleString('ar-EG',{dateStyle:'full',timeStyle:'short'});
      const msg=lk.why==='before'?`الإصحاح ده بيفتح ${D(lk.at)}.`:`الإصحاح ده اتقفل ${D(lk.at)}.`;
      return `<div class="gate"><h3 class="ttl">🔒 ${esc(book().title)} — إصحاح ${n(c.chapterNum)}</h3>
        <div class="card2"><p class="ver">${esc(msg)}</p><div class="hint">لو معاك كود فتح من الخادم اكتبه هنا.</div>
        <div class="fld" style="margin-top:10px"><label for="cc">كود الفتح</label><input id="cc" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" style="text-align:center;letter-spacing:3px;text-transform:uppercase"></div>
        <button class="btn" data-a="redeem">فتح بالكود</button><div class="err" id="ce"></div></div>
        ${back('toChap','رجوع للإصحاحات')}</div>`;
    },
    async resume(){
      const f=findCh(sess.bid,sess.num), qs=sessQs(f.c,sess)||f.c.questions, done=answeredCount(qs,sess.ans||[]);
      return `<div class="gate"><div class="card2"><b>عندك امتحان مفتوح</b><p class="ver">${esc(f.b.title)} — إصحاح ${n(sess.num)}<br>أجبت على ${n(done)} من ${n(qs.length)} سؤال.</p></div>
        <button class="btn" data-a="resume">كمّل من النقطة</button>
        <button class="btn sec" data-a="fresh">ابدأ محاولة جديدة</button>
        <div class="hint">البدء من جديد بيسجّل الامتحان القديم محاولة بدرجته الحالية.</div>
        ${back('toChap','إلغاء')}</div>`;
    },
    async read(){
      const c=chap(), left=rLeftMs();
      const okText=await ensureText(book(),c);   // v9.26: نص المكتبة (lazy) للإصحاحات اللي أسئلتها فقط
      const noText=okText?'':'<div class="card2"><div class="warn">تعذّر تحميل نص الإصحاح. افتح التطبيق مرة وانت متصل بالنت عشان النص يتخزّن على جهازك. تقدر تبدأ الامتحان بعد انتهاء وقت القراءة.</div></div>';
      return `<div class="gate">${zbar()}<h3 class="ttl">${esc(book().title)} — إصحاح ${n(c.chapterNum)}</h3>${left?`<div class="hint" id="cd">${rdLabel(left)}</div>`:''}${noText}${TTS.bar()}${c.sections.map(s=>`<div class="card2">${s.title?`<b>${esc(s.title)}</b>`:''}${s.imgCap?`<div class="hint">${esc(s.imgCap)}</div>`:''}${s.verses.map(v=>`<p class="ver">${v[0]?`<sup>${esc(v[0])}</sup> `:''}${esc(v[1])}</p>`).join('')}</div>`).join('')}
        <button class="btn" id="go" data-a="${nextA(c)}" ${left?'disabled':''}>${goLabel(c,left)}</button>${left&&staff?'<button class="btn sec" data-a="skip">⏩ تخطي وقت القراءة</button>':''}${back('toChap','رجوع للإصحاحات')}</div>`;
    },
    async med(){   // (v9.38) بعد قراءة الإصحاح: الآية ثم التأمل، وبعدها الأسئلة
      const c=chap(), m=c.meditation;
      return `<div class="gate">${zbar()}<h3 class="ttl">${esc(book().title)} — إصحاح ${n(c.chapterNum)}</h3>
        <div class="card2"><b>آية الإصحاح</b><p class="ver">«${esc(m.verseText)}» — ${esc(m.verseRef)}</p></div>
        <div class="card2"><b>تأمل</b><p class="ver">${me(m.meditation)}</p><p class="ver">${me(m.comment)}</p><p class="ver">💌 ${me(m.message)}</p></div>
        <button class="btn" data-a="start">ابدأ الامتحان (${n(examN(book(),c))} سؤال)</button>${back('toRead','رجوع للقراءة')}</div>`;
    },
    async verses(){   // (v9.38) آيات السفر: آية التأمل لكل إصحاح (المقفول بمواعيد يظهر 🔒 للمخدوم)
      const b=book(), rows=b.chapters.filter(c=>c.meditation).map(c=>{ const lk=gated&&AC.isLocked(b.id,c.chapterNum), m=c.meditation;
        return `<div class="card2"><b>إصحاح ${n(c.chapterNum)}</b>${lk?'<p class="hint">🔒 مقفول لحد ميعاده</p>':`<p class="ver">«${esc(m.verseText)}» — ${esc(m.verseRef)}</p>`}</div>`; }).join('');
      return `<div class="gate"><h3 class="ttl">📜 آيات ${esc(b.title)}</h3>${rows||'<div class="hint">لا توجد آيات بعد.</div>'}${back('toChap','رجوع للإصحاحات')}</div>`;
    },
    async exam(){
      const i=st.i, q=st.qs[i], a=st.ans[i], last=i===st.qs.length-1;
      let body;
      if(q.isTimeline){
        const picked=a||[], rest=st.shuf[i].filter(e=>!picked.includes(e.id)), byId=(id)=>q.events.find(e=>e.id===id);
        body=`<div class="hint">اضغط الأحداث بالترتيب الصحيح. اضغط على حدث مختار لإلغائه.</div>
          <ol class="tl">${picked.map(id=>`<li><button class="opt on" data-a="unpick" data-k="${q.events.indexOf(byId(id))}">${esc(byId(id).text)}</button></li>`).join('')}</ol>
          ${rest.map(e=>`<button class="opt" data-a="pick" data-k="${q.events.indexOf(e)}">${esc(e.text)}</button>`).join('')}`;
      } else body=st.opts[i].map(k=>`<button class="opt${a===k?' on':''}" data-a="ans" data-k="${k}">${esc(q.opts[k])}</button>`).join(''); // k = الـindex الأصلي
      return `<div class="gate">${zbar()}<div class="hint">سؤال ${n(i+1)} من ${n(st.qs.length)} · ⏱ <span id="qtimer" style="font-variant-numeric:tabular-nums">${T.clock(tm?tm.el:0)}</span></div><div class="prog"><i style="width:${Math.round(100*i/st.qs.length)}%"></i></div>
        <div class="card2">${q.type?`<small class="k">${esc(q.type)}</small>`:''}<div class="qt">${esc(q.q)}</div>${body}</div>
        <button class="btn" data-a="next" ${X.isAnswered(q,a)?'':'disabled'}>${last?'إنهاء':'التالي'}</button>${back('quit','خروج من الامتحان')}</div>`;
    },
    async result(){
      const r=st.res, pc=Math.round(100*r.score/r.total), sm=st.sum, f=sm.first;
      const rev=st.qs.map((q,i)=>{ const ok=r.detail[i], a=st.ans[i]; let fix='';
        if(!ok){ fix=q.isTimeline?`<div class="hint">الترتيب الصحيح: ${X.correctOrder(q).map(id=>esc(q.events.find(e=>e.id===id).text)).join(' ← ')}</div>`
          :`<div class="hint">الصحيح: ${esc(q.opts[q.ans])}${Number.isInteger(a)?` — إجابتك: ${esc(q.opts[a])}`:''}</div>`; }
        return `<div class="row rv"><span>${ok?'✔':'✘'} ${esc(q.q)}${fix}${!ok&&q.ref?`<div class="hint">${esc(q.ref)}</div>`:''}</span></div>`; }).join('');
      return `<div class="gate"><div class="card2" style="text-align:center"><div class="code" style="font-size:2rem;letter-spacing:2px">${n(r.score)} / ${n(r.total)}</div><div>${n(pc)}٪</div>
        <div class="hint">محاولات: ${n(sm.n)} · أول محاولة: ${n(f.score)}/${n(f.total)}</div>
        <div class="hint">⏱ وقت الحل: ${T.text(st.att.durationSec)}</div>
        <div class="hint">${st.att.attemptNo===1?'هذه المحاولة هي المعتمدة':'هذه محاولة للتدريب، والمعتمدة هي الأولى'}</div></div>
        <div class="card2"><b>مراجعة الإجابات</b>${rev}</div>
        <div class="card2"><button class="btn" data-a="send">📤 إرسال النتيجة</button><div class="hint" id="sendst">بتتبعت تلقائياً. الزر للتأكيد والتحقق من وجود تحديث للتطبيق.</div>
          <button class="btn sec" data-a="diag" aria-expanded="false" style="font-size:.72rem;padding:.2rem .6rem;margin-top:.6rem;opacity:.75">📊 تفاصيل الرفع (للدعم)</button><div id="diagbox" hidden style="margin-top:.5rem"></div></div>
        <button class="btn" data-a="start">إعادة الامتحان</button>${back('toChap','الإصحاحات')}</div>`;
    }
  };
  // ===== (v9.489) عدّاد القراءة: يقف لما التطبيق يروح للخلفية ويكمل من نفس الرقم =====
  const rdLabel=(ms)=>'⏳ باقي للقراءة: '+mmss(ms);
  const rTotalMs=()=>{ const b=book(); return Math.max(0,Number(b&&b.readMinutes)||0)*60000; };
  const rMine=()=>!!rt&&rt.b===st.bid&&rt.n===st.num;
  const rLeftMs=()=>{ if(st.s!=='read'||!rMine()||unlocked.has(ukey())) return 0; if(T.running(rt)) T.tick(rt,pnow()); return Math.max(0,rTotalMs()-rt.el*1000); };
  const rStop=()=>{ if(rtk){ clearInterval(rtk); rtk=null; } };
  const rExpired=()=>st.s==='read'&&rTotalMs()>0&&!RS.get(rmap,st.bid,st.num,Date.now());
  async function rPersist(done){   // يحفظ الرقم الحالي (الجلسة المنتهية ما تتحفظش)
    if(!rt) return;
    const m2=RS.update(rmap,rt.b,rt.n,{el:T.snap(rt,pnow()),done:!!done},Date.now()); if(m2===rmap) return;
    rmap=m2; try{ await RS.save(rmap); }catch(e){ console.error('[read-session] تعذّر حفظ وقت القراءة',e); }
  }
  function rLoop(){
    const go=el.querySelector('#go');
    if(!rt||!go||!go.isConnected||!el.isConnected||st.s!=='read'||document.hidden){ rStop(); return; }
    const l=rLeftMs(), c=chap(), cd=el.querySelector('#cd');
    if(l>0){ go.textContent=goLabel(c,l); if(cd) cd.textContent=rdLabel(l); if(pnow()-rSaved>3000){ rSaved=pnow(); rPersist(); } }
    else{ unlocked.add(ukey()); T.pause(rt,pnow()); rStop(); rPersist(true); go.disabled=false; go.textContent=goLabel(c,0); if(cd) cd.remove(); }
  }
  function rSync(){   // زي qSync: يشغّل العدّاد لو شاشة القراءة ظاهرة، وإلا يفضل واقف
    rStop(); if(!rt) return;
    if(st.s==='read'&&rMine()&&!unlocked.has(ukey())&&!document.hidden&&el.isConnected){
      if(rLeftMs()<=0){ unlocked.add(ukey()); T.pause(rt,pnow()); rPersist(true); return; }
      T.resume(rt,pnow()); rSaved=pnow(); rtk=setInterval(rLoop,500);
    }
  }
  // (v9.481) عدّاد وقت الحل: تحديثه = textContent لعنصر واحد (#qtimer) كل ثانية، بدون render (عشان ما يبوّظش تثبيت الشاشة)
  const qStop=()=>{ if(qt){ clearInterval(qt); qt=null; } };
  const qPaint=()=>{ const e=el.querySelector('#qtimer'); if(e&&tm){ const t=T.clock(tm.el); if(e.textContent!==t) e.textContent=t; } };
  function qSync(){
    qStop();
    if(!tm) return;
    if(st.s==='exam'&&!document.hidden&&el.isConnected){
      T.resume(tm,pnow()); qPaint();
      qt=setInterval(()=>{ if(!el.isConnected||st.s!=='exam'||document.hidden){ qStop(); return; } T.tick(tm,pnow()); qPaint(); },1000);
    } else T.pause(tm,pnow());   // خارج شاشة الأسئلة أو الصفحة مخفية: الوقت واقف
  }
  // الصفحة اتخبّت/اتقفلت: نوقف العدّادين (الأسئلة والقراءة) ونحفظ الرقم؛ ورجعت: نكمّل من نفس الرقم
  const onVis=()=>{ if(!el.isConnected){ document.removeEventListener('visibilitychange',onVis); removeEventListener('pagehide',onHide); return; }
    if(st.s==='exam'&&tm){ if(document.hidden){ qStop(); T.pause(tm,pnow()); persist(); } else qSync(); return; }
    if(st.s==='read'){
      if(document.hidden){ if(rt){ rStop(); T.pause(rt,pnow()); rPersist(); } return; }
      if(rExpired()){ unlocked.delete(ukey()); enterRead(st.bid,st.num); render(); return; }   // رجع بعد ٦ ساعات من أول فتح: يبدأ من الأول
      rSync();
    } };
  const onHide=()=>{ if(!el.isConnected) return;
    if(st.s==='exam'&&tm){ qStop(); T.pause(tm,pnow()); persist(); }
    else if(st.s==='read'&&rt){ rStop(); T.pause(rt,pnow()); rPersist(); } };
  document.addEventListener('visibilitychange',onVis); addEventListener('pagehide',onHide);
  async function render(){
    clearInterval(tick); clearTimeout(bt); qStop(); rStop(); if(rt){ T.pause(rt,pnow()); rPersist(); }   // (v9.489) وقت القراءة يقف ويتحفظ عند أي إعادة رسم، ويكمل في rSync
    // حماية: لو تغيّر أو اختفى السفر/الإصحاح (بعد إعادة تحميل) نرجع لقائمة آمنة بدل ما نرمي خطأ
    if(['chapters','verses','read','med','exam','result','resume','locked'].includes(st.s)&&!book()) st={s:'books'};
    if(['read','med','exam','result','locked'].includes(st.s)&&!chap()) st=book()?{s:'chapters',bid:st.bid}:{s:'books'};
    if(st.s==='locked'&&!AC.lock(st.bid,st.num)) enterRead(st.bid,st.num);   // اتفتح (ميعاده جه أو التحديث وصل)
    if(st.s==='result'&&!st.res) st={s:'chapters',bid:st.bid};
    if(st.s==='resume'&&!sess) st={s:'chapters',bid:st.bid};
    let html=await views[st.s]();
    if(flash&&st.s!=='exam'){ html=`<div class="card2">ℹ️ ${esc(flash)}</div>`+html; flash=''; }
    if(['read','med','exam','verses','result'].includes(st.s)) html=`<div class="zm" style="--qz:${zoom/100}">${html}</div>`;   // (v9.39) نطاق التكبير
    TTS.stop(); el.innerHTML=html; el.scrollTop=0; qSync(); rSync();
    if(st.s==='read'){ TTS.bind(el); }
    if(st.s==='result'&&isStudent) SY.accountArchived().then(a=>{ const bx=el.querySelector('#sendst'); if(a&&bx&&st.s==='result'){ bx.className='warn'; bx.textContent=ARCH_MSG; } }).catch(()=>{});   // (v9.494) حسابه اتأرشف؟ نبلّغه فوراً
    if(gated&&st.s==='books'){ const w=AC.nextChangeIn(); if(w!=null) bt=setTimeout(()=>{ if(el.isConnected&&st.s==='books') render(); },Math.min(w+1000,2147e6)); }   // (v9.39) السفر يظهر/يختفي لحظة الميعاد حتى أوفلاين
  }

  // (v9.486) «📊 تفاصيل الرفع (للدعم)»: مخفية افتراضياً؛ بعد الضغط تظهر ٣ أسطر + زر «📋 نسخ التفاصيل» (جوه الصندوق بس)
  let diagCopy='';
  const dv=(x)=>x==null?'فاضي':x;
  async function diagLines(){
    const [dg,fd,mine]=await Promise.all([SY.resultDiag(),SY.getFinishDiag(),R.all().catch(()=>[])]);
    return [
      'آخر إنهاء: '+(fd?`إصحاح ${fd.num} محاولة ${fd.att} · عدّاد=${fd.hasTimer?dv(fd.el):'مفيش'} · اتسجّل=${dv(fd.dur)} · results.js=${fd.fix?'قديم (اتصلّح)':'سليم'} · ${fd.src} (${fd.build})`:'مفيش سجل'),
      'آخر محاولات على الجهاز: '+([...mine].sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,4).map(a=>`إ${a.chapterNum}/م${a.attemptNo}=${dv(a.durationSec)}`).join(' | ')||'—'),
      'آخر رفع: '+(dg?`إصحاح ${dv(dg.num)} م${dv(dg.attemptNo)} (من ${dv(dg.ageMin)} د) · محلي=${dv(dg.local)} · اتبعت=${dv(dg.sent)} · ${dg.err?'فشل: '+dg.err:'HTTP '+dg.http+' · السيرفر رجّع='+dv(dg.read)} (${dg.build})`:'مفيش سجل')
    ];
  }
  async function refreshDiag(){
    const box=el.querySelector('#diagbox'); if(!box||box.hidden) return;
    const lines=await diagLines();
    diagCopy='تفاصيل الرفع — '+new Date().toLocaleString('ar-EG')+'\n'+lines.join('\n');
    box.innerHTML='<div class="hint" style="line-height:1.9;user-select:text">'+lines.map(esc).join('<br>')+'</div><button class="btn sec" data-a="copydiag" style="font-size:.75rem;padding:.25rem .7rem;margin-top:.4rem">📋 نسخ التفاصيل</button>';
  }
  async function copyTxt(t){
    try{ await navigator.clipboard.writeText(t); return true; }catch(e){}
    try{ const ta=document.createElement('textarea'); ta.value=t; ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); const ok=document.execCommand('copy'); ta.remove(); return ok; }catch(e){ return false; }
  }
  // (v9.3) زر "إرسال": يرسل النتائج المعلّقة الآن + يفحص التحديث. لا يعيد رسم الشاشة (عشان الرسالة تفضل ظاهرة).
  async function sendNow(btn){
    const box=el.querySelector('#sendst'); btn.disabled=true; const lbl=btn.textContent; btn.textContent='جارٍ التحقق والإرسال…'; box.className='hint'; box.textContent='';
    const [s,u]=await Promise.all([SY.flush(),checkUpdate()]);
    refreshDiag();   // لو صندوق التفاصيل مفتوح نحدّثه
    const say=({off:'المزامنة غير مفعّلة على هذا التطبيق.',offline:'مفيش نت دلوقتي. نتيجتك محفوظة على جهازك وهتتبعت تلقائياً أول ما النت يرجع.',
      pending:'لسه ما اتبعتتش. هتتحاول تلقائياً.',done:'تم إرسال نتيجتك ✅'})[s.state];
    const up=({found:'فيه تحديث جديد للتطبيق — اضغط "تحديث" في الشريط الذهبي.',none:'التطبيق على آخر نسخة ✅'})[u]||'';
    box.className=(s.state==='done'||s.state==='off')&&!s.dead&&!s.archived?'hint':'warn';
    box.innerHTML=[say,s.archived?ARCH_MSG:'',s.dead?'فيه نتيجة تعذّر إرسالها، كلّم المسؤول.':'',s.err?'السبب (للمراجعة): '+s.err:'',up].filter(Boolean).map(esc).join('<br>');
    btn.disabled=false; btn.textContent=lbl;
  }
  el.onclick=async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a, k=Number(t.dataset.k);
    if(a==='send'){ await sendNow(t); return; }
    if(a==='diag'){   // بدون إعادة رسم
      const box=el.querySelector('#diagbox'); if(!box) return;
      if(box.hidden){ box.hidden=false; box.textContent='جارٍ التحميل…'; await refreshDiag(); t.setAttribute('aria-expanded','true'); t.textContent='🙈 إخفاء تفاصيل الرفع'; }
      else{ box.hidden=true; t.setAttribute('aria-expanded','false'); t.textContent='📊 تفاصيل الرفع (للدعم)'; }
      return;
    }
    if(a==='copydiag'){ const ok=await copyTxt(diagCopy), o=t.textContent; t.textContent=ok?'✅ اتنسخ':'تعذّر النسخ'; setTimeout(()=>{ if(t.isConnected) t.textContent=o; },1500); return; }
    if(a==='zin'||a==='zout'){   // (v9.39) بدون إعادة رسم (عشان عدّاد القراءة والإجابات ما يتأثروش)
      zoom=Math.min(ZMAX,Math.max(ZMIN,zoom+(a==='zin'?ZSTEP:-ZSTEP))); try{ localStorage.setItem(ZK,String(zoom)); }catch(x){}
      const zm=el.querySelector('.zm'); if(zm) zm.style.setProperty('--qz',String(zoom/100));
      const zl=el.querySelector('#zl'); if(zl) zl.textContent=n(zoom)+'٪';
      const zi=el.querySelector('[data-a="zin"]'), zo=el.querySelector('[data-a="zout"]'); if(zi) zi.disabled=zoom>=ZMAX; if(zo) zo.disabled=zoom<=ZMIN;
      return;
    }
    if(NEED_CHAP.includes(a)&&!chap()){ st={s:'books'}; return render(); }
    if(a==='book'){ st={s:'chapters',bid:t.dataset.id}; }
    else if(a==='toBooks'){ st={s:'books'}; }
    else if(a==='toChap'){ st={s:'chapters',bid:st.bid}; }
    else if(a==='verses'){ st={s:'verses',bid:st.bid}; }
    else if(a==='toRead'){ st={s:'read',bid:st.bid,num:st.num}; }
    else if(a==='med'){ if(st.s==='read'&&!unlocked.has(ukey())&&rLeftMs()>0) return; unlocked.add(ukey()); st={s:'med',bid:st.bid,num:st.num}; }
    else if(a==='chap'){
      const num=Number(t.dataset.n); sess=await S.load();
      if(sess&&sess.profileId!==pid){ await S.clear(); sess=null; }
      if(sess&&S.expired(sess)) flash=await closeSession(sess,'expired');
      if(sess&&!findCh(sess.bid,sess.num)){ await S.clear(); sess=null; }
      if(gated) await Promise.race([AC.refresh(),sleep(2000)]);   // v9.21: أحدث مواعيد (حدّ أقصى ٢ث)
      const lk=gated&&AC.lock(st.bid,num)&&!(sess&&sess.bid===st.bid&&sess.num===num);   // جلسة بدأت قبل القفل تكمل
      if(lk) st={s:'locked',bid:st.bid,num};
      else if(sess) st={s:'resume',bid:st.bid,num}; else enterRead(st.bid,num);
    }
    else if(a==='resume'){
      const h=sess&&hydrate(sess);
      if(h){ st=h; tm=T.create(h.el0); } else{ await S.clear(); sess=null; flash='تغيّر محتوى الامتحان فلا يمكن استكماله، ابدأ من جديد.'; st={s:'books'}; }
    }
    else if(a==='fresh'){ const bid=st.bid, num=st.num; if(sess) flash=await closeSession(sess,'exit'); st.bid=bid; st.num=num; if(gated&&AC.lock(bid,num)) st={s:'locked',bid,num}; else enterRead(bid,num); }
    else if(a==='redeem'){
      const ce=el.querySelector('#ce'), code=((el.querySelector('#cc')||{}).value||'').trim();
      if(!code){ if(ce) ce.textContent='اكتب الكود.'; return; }
      t.disabled=true; if(ce) ce.textContent='جارٍ التحقق…';
      const r=await AC.verify(st.bid,st.num,code);   // v9.22: فحص محلي (بصمة SHA-256)، ما يحتاجش نت
      if(r==='ok'){ await AC.markUnlocked(st.bid,st.num); flash='تم فتح الإصحاح ✅'; enterRead(st.bid,st.num); }
      else{ if(ce) ce.textContent=({bad:'الكود غلط. اتأكد منه وجرّب تاني.',locked:'جرّبت كتير. استنى ساعة وجرّب تاني.',nodata:'الأكواد لسه ما وصلتش جهازك. افتح التطبيق مرة وانت متصل بالنت وجرّب تاني.',unavailable:'المتصفح ده مش بيدعم فحص الكود. افتح التطبيق من متصفح تاني.'})[r]||'تعذّر الفحص، جرّب تاني.'; t.disabled=false; return; }
    }
    else if(a==='skip'){ if(!staff||st.s!=='read') return; unlocked.add(ukey()); }   // v9.19: تخطي وقت القراءة للطاقم فقط
    else if(a==='start'){
      if(st.s==='read'&&!unlocked.has(ukey())&&rLeftMs()>0) return; // الزر لا يعمل قبل انتهاء العدّاد
      unlocked.add(ukey()); await startExam();
    }
    else if(a==='quit'){ if(!confirm('لو خرجت دلوقتي، هتتحسب محاولة بدرجتك الحالية. متأكد؟')) return; await finish('exit'); }
    // (v9.481) أثناء الحل: تحديث الـDOM مباشرة بدون render() — عشان الشاشة ما ترجعش لأول الصفحة ولا يظهر الهيدر
    else if(a==='ans'||a==='pick'||a==='unpick'){
      if(st.s!=='exam') return;
      const q=st.qs[st.i];
      if(a==='ans'){
        st.ans[st.i]=k;
        el.querySelectorAll('.opt[data-a="ans"]').forEach(b=>b.classList.toggle('on',Number(b.dataset.k)===k));
      } else if(a==='pick'){
        const ol=el.querySelector('ol.tl'); if(!ol) return;
        st.ans[st.i]=[...(st.ans[st.i]||[]),q.events[k].id];
        const li=document.createElement('li'); t.dataset.a='unpick'; t.classList.add('on'); li.appendChild(t); ol.appendChild(li);
      } else{
        const id=q.events[k].id, li=t.closest('li'), ol=el.querySelector('ol.tl'); if(!li||!ol) return;
        st.ans[st.i]=(st.ans[st.i]||[]).filter(x=>x!==id);
        li.remove(); t.dataset.a='pick'; t.classList.remove('on');
        // نرجّع الحدث لمكانه حسب ترتيب العرض العشوائي الأصلي
        const pos=(b)=>st.shuf[st.i].findIndex(e=>e===q.events[Number(b.dataset.k)]);
        const rest=[...el.querySelectorAll('button.opt[data-a="pick"]')].filter(b=>b!==t), nxt=rest.find(b=>pos(b)>pos(t));
        if(nxt) nxt.before(t); else if(rest.length) rest[rest.length-1].after(t); else ol.after(t);
      }
      const nb=el.querySelector('[data-a="next"]'); if(nb) nb.disabled=!X.isAnswered(q,st.ans[st.i]);
      await persist(); return;
    }
    else if(a==='next'){
      if(st.i===st.qs.length-1) await finish('finish');
      else{ st.i++; await persist(); window.dispatchEvent(new CustomEvent('lawha:keep-header',{detail:1200})); }   // السؤال الجديد: ما يظهرش الهيدر (v9.481)
    }
    await render();
  };

  // v9.21: مواعيد الإصحاحات — الكاش فوراً (يشتغل أوفلاين) والتحديث من السيرفر في الخلفية
  if(gated){ await AC.load(); AC.refresh().then(ok=>{ if(ok&&(st.s==='books'||st.s==='chapters'||st.s==='verses'||st.s==='locked')&&el.isConnected) render(); }).catch(()=>{}); }
  // عند الفتح: نحمّل الجلسة المحفوظة، ونغلق المنتهية (> ٦ ساعات) تلقائياً
  rmap=await RS.load().catch(()=>({}));   // (v9.489) جلسات القراءة المحفوظة (المنتهية > ٦ ساعات بتتشال)
  sess=await S.load();
  if(sess&&sess.profileId!==pid){ await S.clear(); sess=null; }
  if(sess&&S.expired(sess)) flash=await closeSession(sess,'expired');
  render();
}
