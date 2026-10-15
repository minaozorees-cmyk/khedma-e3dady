import {loadAll} from '../../js/books.js';
import * as X from '../../js/exam-engine.js';
import * as R from '../../js/results.js';
import * as A from '../../js/auth.js';
import * as S from '../../js/exam-session.js';
import * as SY from '../../js/sync.js';
import {checkUpdate} from '../../js/update.js';
import {esc} from '../../js/consts.js';
import {n} from '../../js/dates.js';

const AR='٠١٢٣٤٥٦٧٨٩';
const mmss=(ms)=>{ const s=Math.ceil(Math.max(0,ms)/1000); return (n(Math.floor(s/60))+':'+String(s%60).padStart(2,'0')).replace(/\d/g,d=>AR[d]); };
const NEED_CHAP=['start','ans','pick','unpick','next','quit'];

export async function mount(el,ctx){
  el.innerHTML='<div class="ph">جارٍ التحميل…</div>';
  const {books,problems}=await loadAll();
  const prof=await A.activeProfile(), pid=prof?prof.id:'local', nm=esc((prof&&prof.name.split(' ')[0])||'حبيبي');
  const staff=ctx.role!=='student', isStudent=ctx.role==='student'&&!!prof;
  let st={s:'books'}, flash='', tick=null, sess=null;
  const unlocked=new Set(); // إصحاحات انتهى عدّاد قراءتها في هذه الجلسة
  const book=()=>books.find(b=>b.id===st.bid);
  const chap=()=>{ const b=book(); return b&&b.chapters.find(c=>c.chapterNum===st.num); };
  const findCh=(bid,num)=>{ const b=books.find(x=>x.id===bid), c=b&&b.chapters.find(x=>x.chapterNum===num); return c?{b,c}:null; };
  const ukey=()=>st.bid+'|'+st.num;
  const me=(t)=>esc(t).replace(/\{name\}/g,nm);
  const back=(a,t)=>`<button class="btn sec" data-a="${a}">${t}</button>`;
  const answeredCount=(qs,ans)=>qs.filter((q,i)=>X.isAnswered(q,ans[i])).length;
  // v9.12: مدة الامتحان بالثواني من startedAt (للجلسة المغلقة: لآخر نشاط محفوظ). أكتر من ساعتين = غير معروفة (null)
  const dur=(a,b)=>{ const s=Math.round(((b||0)-(a||0))/1000); return a&&b&&s>=0&&s<=7200?s:null; };

  // ===== الجلسة المحفوظة =====
  const persist=()=>{ const c=chap();
    return S.save({bid:st.bid,num:st.num,i:st.i,ans:Array.from({length:c.questions.length},(_,k)=>st.ans[k]??null),
      opts:st.opts,tl:st.shuf.map(x=>x?x.map(e=>e.id):null),startedAt:st.startedAt,profileId:pid}); };
  // يغلق الجلسة ويحسبها محاولة بدرجتها الحالية؛ يرجع رسالة للمخدوم
  async function closeSession(s,source){
    const f=findCh(s.bid,s.num);
    if(!f){ await S.clear(); sess=null; return ''; }
    const ans=s.ans||[], r=X.grade(f.c.questions,ans);
    await R.record({bookId:s.bid,chapterNum:s.num,score:r.score,total:r.total,source,answered:answeredCount(f.c.questions,ans),durationSec:dur(s.startedAt,s.updatedAt)});
    await S.clear(); sess=null;
    const where=`${f.b.title} — إصحاح ${n(s.num)}`;
    return source==='expired'
      ?`انتهت جلسة امتحانك السابق (${where}) لأن مرّ عليها أكتر من ٦ ساعات، وتم تسجيل محاولة بدرجتك: ${n(r.score)} / ${n(r.total)}.`
      :`تم تسجيل محاولة الامتحان السابق (${where}) بدرجتك: ${n(r.score)} / ${n(r.total)}.`;
  }
  // يعيد بناء حالة الامتحان من الجلسة، أو null لو تغيّر محتوى الإصحاح
  function hydrate(s){
    const f=findCh(s.bid,s.num); if(!f) return null; const qs=f.c.questions, L=qs.length;
    if(![s.ans,s.opts,s.tl].every(x=>Array.isArray(x)&&x.length===L)) return null;
    const shuf=[], opts=[];
    for(let k=0;k<L;k++){ const q=qs[k];
      if(q.isTimeline){ const ev=(s.tl[k]||[]).map(id=>q.events.find(e=>e.id===id)); if(ev.length!==q.events.length||ev.some(e=>!e)) return null; shuf.push(ev); opts.push(null); }
      else{ const p=s.opts[k]; if(!Array.isArray(p)||p.length!==q.opts.length||[...p].sort((a,b)=>a-b).some((v,x)=>v!==x)) return null; shuf.push(null); opts.push(p); } }
    return {s:'exam',bid:s.bid,num:s.num,i:Math.min(Math.max(0,s.i|0),L-1),ans:[...s.ans],opts,shuf,startedAt:s.startedAt};
  }
  function enterRead(bid,num){
    const b=books.find(x=>x.id===bid); st={s:'read',bid,num,readUntil:0};
    if(!unlocked.has(ukey())) st.readUntil=Date.now()+b.readMinutes*60000;
    if(isStudent) SY.logOpen(bid,num);
  }
  async function startExam(){
    const c=chap();
    st={s:'exam',bid:st.bid,num:st.num,i:0,ans:[],startedAt:Date.now(),
      opts:c.questions.map(q=>q.isTimeline?null:X.shuffle(q.opts.map((_,k)=>k))), // ترتيب العرض؛ data-k يبقى الـindex الأصلي
      shuf:c.questions.map(q=>q.isTimeline?X.shuffledEvents(q):null)};
    await persist();
  }
  async function finish(source){
    const c=chap(), r=X.grade(c.questions,st.ans);
    const att=await R.record({bookId:st.bid,chapterNum:st.num,score:r.score,total:r.total,source,answered:answeredCount(c.questions,st.ans),durationSec:dur(st.startedAt,Date.now())});
    await S.clear(); sess=null;
    st.res=r; st.att=att; st.sum=R.summary(await R.all(),st.bid,st.num); st.s='result';
  }

  // ===== العرض =====
  const probs=()=>staff&&problems.length?`<details class="card2"><summary>⚠️ ملاحظات على الملفات (${n(problems.length)})</summary>${problems.map(p=>`<div class="row"><span><b>${esc(p.file)}</b> — ${esc(p.msg)}</span></div>`).join('')}</details>`:'';
  const views={
    async books(){
      let rc=''; if(sess){ const f=findCh(sess.bid,sess.num);
        if(f) rc=`<div class="card2"><b>⏸ عندك امتحان مفتوح</b><div class="hint">${esc(f.b.title)} — إصحاح ${n(sess.num)}</div><button class="btn" data-a="resume">كمّل من النقطة</button></div>`; }
      if(!books.length) return `<div class="ph">📖 لا توجد أسفار بعد.<br>تُضاف الأسفار كملفات JSON في مجلد books/</div>${probs()}`;
      return `${rc}<div class="gate">${books.map(b=>`<button class="card2 bk" data-a="book" data-id="${esc(b.id)}"><b>${esc(b.title)}</b><small>${n(b.chapters.length)} إصحاح</small></button>`).join('')}${probs()}</div>`;
    },
    async chapters(){
      const at=await R.all(), b=book();
      return `<div class="gate"><h3 class="ttl">${esc(b.title)}</h3><div class="hint">الرقم تحت كل إصحاح = درجة أول محاولة (المعتمدة)</div><div class="chgrid">${b.chapters.map(c=>{ const s=R.summary(at,b.id,c.chapterNum);
        return `<button class="chb${s.n?' done':''}" data-a="chap" data-n="${c.chapterNum}">${n(c.chapterNum)}<small>${s.first?n(s.first.score)+'/'+n(s.first.total):'—'}</small></button>`; }).join('')}</div>${back('toBooks','رجوع للأسفار')}</div>`;
    },
    async resume(){
      const f=findCh(sess.bid,sess.num), done=answeredCount(f.c.questions,sess.ans||[]);
      return `<div class="gate"><div class="card2"><b>عندك امتحان مفتوح</b><p class="ver">${esc(f.b.title)} — إصحاح ${n(sess.num)}<br>أجبت على ${n(done)} من ${n(f.c.questions.length)} سؤال.</p></div>
        <button class="btn" data-a="resume">كمّل من النقطة</button>
        <button class="btn sec" data-a="fresh">ابدأ محاولة جديدة</button>
        <div class="hint">البدء من جديد بيسجّل الامتحان القديم محاولة بدرجته الحالية.</div>
        ${back('toChap','إلغاء')}</div>`;
    },
    async read(){
      const c=chap(), left=st.readUntil-Date.now()>0&&!unlocked.has(ukey())?st.readUntil-Date.now():0;
      return `<div class="gate"><h3 class="ttl">${esc(book().title)} — إصحاح ${n(c.chapterNum)}</h3>${left?`<div class="hint" id="cd">⏳ وقت القراءة المتبقي: ${mmss(left)}</div>`:''}${c.sections.map(s=>`<div class="card2"><b>${esc(s.title)}</b>${s.imgCap?`<div class="hint">${esc(s.imgCap)}</div>`:''}${s.verses.map(v=>`<p class="ver">${v[0]?`<sup>${esc(v[0])}</sup> `:''}${esc(v[1])}</p>`).join('')}</div>`).join('')}
        <button class="btn" id="go" data-a="start" ${left?'disabled':''}>${left?'ابدأ الامتحان بعد '+mmss(left):`ابدأ الامتحان (${n(c.questions.length)} سؤال)`}</button>${back('toChap','رجوع للإصحاحات')}</div>`;
    },
    async exam(){
      const c=chap(), i=st.i, q=c.questions[i], a=st.ans[i], last=i===c.questions.length-1;
      let body;
      if(q.isTimeline){
        const picked=a||[], rest=st.shuf[i].filter(e=>!picked.includes(e.id)), byId=(id)=>q.events.find(e=>e.id===id);
        body=`<div class="hint">اضغط الأحداث بالترتيب الصحيح. اضغط على حدث مختار لإلغائه.</div>
          <ol class="tl">${picked.map(id=>`<li><button class="opt on" data-a="unpick" data-k="${q.events.indexOf(byId(id))}">${esc(byId(id).text)}</button></li>`).join('')}</ol>
          ${rest.map(e=>`<button class="opt" data-a="pick" data-k="${q.events.indexOf(e)}">${esc(e.text)}</button>`).join('')}`;
      } else body=st.opts[i].map(k=>`<button class="opt${a===k?' on':''}" data-a="ans" data-k="${k}">${esc(q.opts[k])}</button>`).join(''); // k = الـindex الأصلي
      return `<div class="gate"><div class="hint">سؤال ${n(i+1)} من ${n(c.questions.length)}</div><div class="prog"><i style="width:${Math.round(100*i/c.questions.length)}%"></i></div>
        <div class="card2">${q.type?`<small class="k">${esc(q.type)}</small>`:''}<div class="qt">${esc(q.q)}</div>${body}</div>
        <button class="btn" data-a="next" ${X.isAnswered(q,a)?'':'disabled'}>${last?'إنهاء':'التالي'}</button>${back('quit','خروج من الامتحان')}</div>`;
    },
    async result(){
      const c=chap(), r=st.res, m=c.meditation, pc=Math.round(100*r.score/r.total), sm=st.sum, f=sm.first;
      const rev=c.questions.map((q,i)=>{ const ok=r.detail[i], a=st.ans[i]; let fix='';
        if(!ok){ fix=q.isTimeline?`<div class="hint">الترتيب الصحيح: ${X.correctOrder(q).map(id=>esc(q.events.find(e=>e.id===id).text)).join(' ← ')}</div>`
          :`<div class="hint">الصحيح: ${esc(q.opts[q.ans])}${Number.isInteger(a)?` — إجابتك: ${esc(q.opts[a])}`:''}</div>`; }
        return `<div class="row rv"><span>${ok?'✔':'✘'} ${esc(q.q)}${fix}${!ok&&q.ref?`<div class="hint">${esc(q.ref)}</div>`:''}</span></div>`; }).join('');
      return `<div class="gate"><div class="card2" style="text-align:center"><div class="code" style="font-size:2rem;letter-spacing:2px">${n(r.score)} / ${n(r.total)}</div><div>${n(pc)}٪</div>
        <div class="hint">محاولات: ${n(sm.n)} · أول محاولة: ${n(f.score)}/${n(f.total)}</div>
        <div class="hint">${st.att.attemptNo===1?'هذه المحاولة هي المعتمدة':'هذه محاولة للتدريب، والمعتمدة هي الأولى'}</div></div>
        <div class="card2"><b>مراجعة الإجابات</b>${rev}</div>
        <div class="card2"><b>تأمل</b><p class="ver">«${esc(m.verseText)}» — ${esc(m.verseRef)}</p><p class="ver">${me(m.meditation)}</p><p class="ver">${me(m.comment)}</p><p class="ver">💌 ${me(m.message)}</p></div>
        <div class="card2"><button class="btn" data-a="send">📤 إرسال النتيجة</button><div class="hint" id="sendst">بتتبعت تلقائياً. الزر للتأكيد والتحقق من وجود تحديث للتطبيق.</div></div>
        <button class="btn" data-a="start">إعادة الامتحان</button>${back('toChap','الإصحاحات')}</div>`;
    }
  };
  function startTick(){
    const go=el.querySelector('#go'); if(!go||!go.disabled) return;
    const total=chap().questions.length;
    tick=setInterval(()=>{
      if(!go.isConnected||st.s!=='read'){ clearInterval(tick); return; }
      const l=st.readUntil-Date.now(), cd=el.querySelector('#cd');
      if(l>0){ go.textContent='ابدأ الامتحان بعد '+mmss(l); if(cd) cd.textContent='⏳ وقت القراءة المتبقي: '+mmss(l); }
      else{ unlocked.add(ukey()); go.disabled=false; go.textContent=`ابدأ الامتحان (${n(total)} سؤال)`; if(cd) cd.remove(); clearInterval(tick); }
    },500);
  }
  async function render(){
    clearInterval(tick);
    // حماية: لو تغيّر أو اختفى السفر/الإصحاح (بعد إعادة تحميل) نرجع لقائمة آمنة بدل ما نرمي خطأ
    if(['chapters','read','exam','result','resume'].includes(st.s)&&!book()) st={s:'books'};
    if(['read','exam','result'].includes(st.s)&&!chap()) st=book()?{s:'chapters',bid:st.bid}:{s:'books'};
    if(st.s==='result'&&!st.res) st={s:'chapters',bid:st.bid};
    if(st.s==='resume'&&!sess) st={s:'chapters',bid:st.bid};
    let html=await views[st.s]();
    if(flash&&st.s!=='exam'){ html=`<div class="card2">ℹ️ ${esc(flash)}</div>`+html; flash=''; }
    el.innerHTML=html; el.scrollTop=0;
    if(st.s==='read') startTick();
  }

  // (v9.3) زر "إرسال": يرسل النتائج المعلّقة الآن + يفحص التحديث. لا يعيد رسم الشاشة (عشان الرسالة تفضل ظاهرة).
  async function sendNow(btn){
    const box=el.querySelector('#sendst'); btn.disabled=true; const lbl=btn.textContent; btn.textContent='جارٍ التحقق والإرسال…'; box.className='hint'; box.textContent='';
    const [s,u]=await Promise.all([SY.flush(),checkUpdate()]);
    const say=({off:'المزامنة غير مفعّلة على هذا التطبيق.',offline:'مفيش نت دلوقتي. نتيجتك محفوظة على جهازك وهتتبعت تلقائياً أول ما النت يرجع.',
      pending:'لسه ما اتبعتتش. هتتحاول تلقائياً.',done:'تم إرسال نتيجتك ✅'})[s.state];
    const up=({found:'فيه تحديث جديد للتطبيق — اضغط "تحديث" في الشريط الذهبي.',none:'التطبيق على آخر نسخة ✅'})[u]||'';
    box.className=(s.state==='done'||s.state==='off')&&!s.dead?'hint':'warn';
    box.innerHTML=[say,s.dead?'فيه نتيجة تعذّر إرسالها، كلّم المسؤول.':'',s.err?'السبب (للمراجعة): '+s.err:'',up].filter(Boolean).map(esc).join('<br>');
    btn.disabled=false; btn.textContent=lbl;
  }
  el.onclick=async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a, k=Number(t.dataset.k);
    if(a==='send'){ await sendNow(t); return; }
    if(NEED_CHAP.includes(a)&&!chap()){ st={s:'books'}; return render(); }
    if(a==='book'){ st={s:'chapters',bid:t.dataset.id}; }
    else if(a==='toBooks'){ st={s:'books'}; }
    else if(a==='toChap'){ st={s:'chapters',bid:st.bid}; }
    else if(a==='chap'){
      const num=Number(t.dataset.n); sess=await S.load();
      if(sess&&sess.profileId!==pid){ await S.clear(); sess=null; }
      if(sess&&S.expired(sess)) flash=await closeSession(sess,'expired');
      if(sess&&!findCh(sess.bid,sess.num)){ await S.clear(); sess=null; }
      if(sess) st={s:'resume',bid:st.bid,num}; else enterRead(st.bid,num);
    }
    else if(a==='resume'){
      const h=sess&&hydrate(sess);
      if(h) st=h; else{ await S.clear(); sess=null; flash='تغيّر محتوى الامتحان فلا يمكن استكماله، ابدأ من جديد.'; st={s:'books'}; }
    }
    else if(a==='fresh'){ const bid=st.bid, num=st.num; if(sess) flash=await closeSession(sess,'exit'); st.bid=bid; st.num=num; enterRead(bid,num); }
    else if(a==='start'){
      if(st.s==='read'&&!unlocked.has(ukey())&&Date.now()<st.readUntil) return; // الزر لا يعمل قبل انتهاء العدّاد
      unlocked.add(ukey()); await startExam();
    }
    else if(a==='quit'){ if(!confirm('لو خرجت دلوقتي، هتتحسب محاولة بدرجتك الحالية. متأكد؟')) return; await finish('exit'); }
    else if(a==='ans'){ st.ans[st.i]=k; await persist(); }
    else if(a==='pick'){ const q=chap().questions[st.i]; st.ans[st.i]=[...(st.ans[st.i]||[]),q.events[k].id]; await persist(); }
    else if(a==='unpick'){ const q=chap().questions[st.i], id=q.events[k].id; st.ans[st.i]=(st.ans[st.i]||[]).filter(x=>x!==id); await persist(); }
    else if(a==='next'){ if(st.i===chap().questions.length-1) await finish('finish'); else{ st.i++; await persist(); } }
    await render();
  };

  // عند الفتح: نحمّل الجلسة المحفوظة، ونغلق المنتهية (> ٦ ساعات) تلقائياً
  sess=await S.load();
  if(sess&&sess.profileId!==pid){ await S.clear(); sess=null; }
  if(sess&&S.expired(sess)) flash=await closeSession(sess,'expired');
  render();
}
