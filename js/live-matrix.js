// (v9.517) تبويب «🗂 كل الأسفار» في «نتائج مباشرة»: مصفوفة (مخدوم × سفر) بالإصحاحات/الدرجة/الوقت + إجمالي، مترتبة: الالتزام ← الدرجات ← الوقت.
// منطق نقي بدون DOM/سيرفر (قابل للاختبار بـNode من غير loader، زي live-roster.js). بيستورد قراءةً بس: requiredFor/isOpened (live-roster.js) وnormName (auth.js).
// الأسماء بتتسلّم خام في الموديل؛ التهريب (esc) داخل matrixHtml، وحماية حقن المعادلات (liveSafe) في matrixExportRows.
import {requiredFor, isOpened, liveSafe, livePct} from './live-roster.js';
import {normName} from './auth.js';

const collator=new Intl.Collator('ar');
const ts=(x)=>{ const t=x?Date.parse(x):NaN; return Number.isFinite(t)?t:NaN; };
const str=(v)=>v==null?'':String(v);
const esc=(v)=>str(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// نفس فلتر الصف/الجنس/البحث في live-roster.js (المقارنة بالتساوي). book بيتعامل معاه بره.
const matchPerson=(p,f)=>{
  const q=str(f.q).trim().toLowerCase();
  return (!f.grade||p.grade===f.grade)&&(!f.gender||p.gender===f.gender)&&(!q||str(p.name).toLowerCase().includes(q));
};
// هوية المخدوم: الصف + الاسم المُطبَّع (الاسم الفاضي ← الـid عشان ما يتدمجوش) — نفس unitOf في live-roster.js
const unitOf=(p)=>{ const n=normName(p&&p.name)||''; return String((p&&p.grade)||'—')+'|'+(n||('#'+str(p&&p.id!=null?p.id:p&&p.profile_id))); };

// وقت بالثواني ← «٤د ٢٠ث» (نفس fmt في servant.html)، المجهول «—»
export const fmtSec=(sec)=>{ sec=Number(sec); if(!sec||sec<=0||sec>=99999) return '—'; const m=Math.floor(sec/60), s=Math.round(sec%60); return m===0?`${s}ث`:`${m}د ${s}ث`; };
// لون نسبة الالتزام: 🟢 ≥٨٠ · 🟡 ≥٦٠ · 🟠 ≥٤٠ · 🔴 <٤٠
export const commitLevel=(p)=>p>=80?'g':p>=60?'y':p>=40?'o':'r';

// ترتيب المخدومين: ١) التزام الإجمالي % (المعروض) تنازلي ٢) مجموع الدرجات الخام تنازلي ٣) الوقت الإجمالي تصاعدي (المجهول بعد المعروف) ٤) الاسم
export function compareAllBooks(a,b){
  const ta=a.total, tb=b.total;
  if(ta.commitPct!==tb.commitPct) return tb.commitPct-ta.commitPct;
  if(ta.score!==tb.score) return tb.score-ta.score;
  if(!!ta.timeKnown!==!!tb.timeKnown) return ta.timeKnown?-1:1;
  if(ta.timeKnown&&ta.time!==tb.time) return ta.time-tb.time;
  return collator.compare(str(a.name),str(b.name))||(str(a.key)<str(b.key)?-1:str(a.key)>str(b.key)?1:0);
}

// rows = results_first_staff، roster = المسجّلين (أو null لو فشل تحميلهم)، filters = {grade,book,gender,q}
export function buildMatrixModel({rows=[],roster=null,access=[],bookChapters={},bookTitles={},activeBooks=null,filters={},now=Date.now(),truncated=false}={}){
  const f=filters||{}, all=(Array.isArray(rows)?rows:[]).filter(r=>r&&r.book_id), acc=Array.isArray(access)?access:[];
  const rosterOk=Array.isArray(roster);
  const hidden=rosterOk?(truncated?'truncated':null):'no-roster';
  const rowsP=all.filter(r=>matchPerson(r,f));                  // بعد فلاتر المخدوم (من غير فلتر السفر)
  const act=Array.isArray(activeBooks)&&activeBooks.length?new Set(activeBooks):null;

  // ── ١) الأسفار (الأعمدة) ──
  const titleOf=new Map(); for(const r of all) if(r.title&&!titleOf.has(r.book_id)) titleOf.set(r.book_id,r.title);
  const title=(id)=>(bookTitles&&bookTitles[id])||titleOf.get(id)||id;
  const firstAt=new Map();                                       // أقدم أول محاولة للسفر (من كل الصفوف: ترتيب أعمدة ثابت مهما كانت الفلاتر)
  for(const r of all){ const t=ts(r.first_attempted_at); if(Number.isFinite(t)){ const x=firstAt.get(r.book_id); if(x===undefined||t<x) firstAt.set(r.book_id,t); } }
  const firstOpen=new Map(); let ids=new Set();
  for(const a of acc){ if(!a||!a.book_id) continue; const o=ts(a.opens_at); if(Number.isFinite(o)){ const x=firstOpen.get(a.book_id); if(x===undefined||o<x) firstOpen.set(a.book_id,o); } if(isOpened(acc,a.book_id,a.chapter_num,now)) ids.add(a.book_id); }
  for(const r of rowsP) ids.add(r.book_id);
  if(act) ids=new Set([...ids].filter(id=>act.has(id)));
  if(f.book) ids=new Set([f.book]);
  const keyOf=(id)=>firstAt.has(id)?firstAt.get(id):firstOpen.has(id)?firstOpen.get(id):Infinity;
  const bookIds=[...ids].sort((a,b)=>(keyOf(a)-keyOf(b))||collator.compare(title(a),title(b))||(a<b?-1:1));
  let approx=false;
  const books=bookIds.map(id=>{ const rq=requiredFor(id,{rows:all,access:acc,bookChapters,now}); if(rq.approx) approx=true; return {id,title:title(id),required:rq.nums,approx:rq.approx}; });
  const reqSet=new Map(books.map(b=>[b.id,new Set(b.required)]));

  // ── ٢) المخدومين: تجميع بالصف|الاسم، والإصحاح المكرر (حسابين) ← الأقدم بأول محاولة ──
  const units=new Map();
  const unit=(p,id)=>{ const k=unitOf({name:p.name,grade:p.grade,id}); let u=units.get(k); if(!u) units.set(k,u={key:k,name:str(p.name),grade:str(p.grade),gender:str(p.gender),ch:new Map(),solver:false}); return u; };
  for(const r of rowsP){
    if(!reqSet.has(r.book_id)) continue;
    const u=unit(r,r.profile_id); u.solver=true;
    const ck=r.book_id+'|'+Number(r.chapter_num), old=u.ch.get(ck), t=ts(r.first_attempted_at), ot=old?ts(old.first_attempted_at):NaN;
    const older=!old||(Number.isFinite(t)&&(!Number.isFinite(ot)||t<ot))||(t===ot&&str(r.profile_id)<str(old.profile_id));
    if(older) u.ch.set(ck,r);
  }
  let registered=units.size;
  if(rosterOk){
    // مسجّلين ما حلّوش: بيظهروا بأصفار، وحساب تاني لنفس (الصف+الاسم) وواحد حلّ ← مفيش «لم يحل» وهمي (نفس مفتاح الدمج)
    const extra=new Set();
    for(const p of roster.filter(p=>p&&matchPerson(p,f)).sort((a,b)=>collator.compare(str(a.name),str(b.name))||(str(a.id)<str(b.id)?-1:1))){
      const k=unitOf(p); if(units.has(k)||extra.has(k)) continue;
      extra.add(k); if(!hidden) unit(p,p.id);                       // مخفي (مقصوص): بنعدّه في «مسجّل» بس
    }
    registered=units.size+(hidden?extra.size:0);
  }

  // ── ٣) الأرقام لكل (مخدوم × سفر) + الإجمالي ──
  const students=[...units.values()].map(u=>{
    const cells=books.map(b=>{
      const N=b.required.length; if(!N) return {bookId:b.id,n:0,done:0,score:0,max:0,pct:0,commitPct:0,time:0,timeKnown:false};
      let done=0,score=0,max=0,time=0,tk=false;
      for(const c of b.required){ const r=u.ch.get(b.id+'|'+c); if(!r) continue; done++; score+=Number(r.first_score)||0; max+=Number(r.first_total)||0; const d=Number(r.first_duration_sec); if(d>0){ time+=d; tk=true; } }
      return {bookId:b.id,n:N,done,score,max,pct:livePct(score,max),commitPct:livePct(done,N),time,timeKnown:tk};
    });
    const live=cells.filter(c=>c.n>0), sum=(k)=>live.reduce((a,c)=>a+c[k],0);
    const n=sum('n'), done=sum('done'), score=sum('score'), max=sum('max'), time=sum('time');
    const total={n,done,score,max,pct:livePct(score,max),commitPct:livePct(done,n),time,timeKnown:live.some(c=>c.timeKnown),full:n>0&&done===n};
    return {key:u.key,name:u.name,grade:u.grade,gender:u.gender,cells,total};
  }).sort(compareAllBooks).map((s,i)=>({...s,rank:i+1,medal:i<3&&s.total.done>0?['🥇','🥈','🥉'][i]:''}));

  const solved=students.filter(s=>s.total.done>0).length, full=students.filter(s=>s.total.full).length;
  const avgCommit=students.length?Math.round(students.reduce((a,s)=>a+s.total.commitPct,0)/students.length):0;
  return {books,students,approx,rosterOk,unsolvedHidden:hidden,
    counts:{registered,shown:students.length,solved,full,avgCommit,books:books.length}};
}

// ── العرض: HTML نصي (مصدر واحد للشاشة والـPDF). كل النصوص من السيرفر بتتهرّب هنا ──
const bookWord=(n)=>n===1?'سفر واحد':n===2?'سفرين':`${n} أسفار`;
export function matrixSummary(model){
  const c=model.counts;
  return `${c.registered} مسجّل — حلّوا ${c.solved} — ${bookWord(c.books)}`;
}
function cellHtml(c){
  if(!c.n) return `<td class="ab-cell ab-na">—</td>`;
  const lv=commitLevel(c.commitPct);
  let h=`<td class="ab-cell ab-lv-${lv}" data-ab-cell="${esc(c.bookId)}"><div class="ab-l1"><b>${c.done}</b> من ${c.n} إصحاحات</div>`+
    `<div class="ab-pr"><span class="ab-bar"><i style="width:${c.commitPct}%"></i></span><span class="ab-pc">${c.commitPct}%</span></div>`;
  if(c.done>0) h+=`<div class="ab-l2">${c.score}/${c.max} — ${c.pct}%</div><div class="ab-l3">⏱ ${c.timeKnown?fmtSec(c.time):'—'}</div>`;
  return h+`</td>`;
}
function totalHtml(t){
  if(!t.n) return `<td class="ab-cell ab-tot ab-na">—</td>`;
  const lv=commitLevel(t.commitPct);
  let h=`<td class="ab-cell ab-tot ab-lv-${lv}"><div class="ab-l1"><b>${t.done}</b> من ${t.n}</div>`+
    `<div class="ab-pr"><span class="ab-bar"><i style="width:${t.commitPct}%"></i></span><span class="ab-pc">${t.commitPct}%</span></div>`;
  if(t.done>0) h+=`<div class="ab-l2">${t.score}/${t.max} — ${t.pct}%</div><div class="ab-l3">⏱ ${t.timeKnown?fmtSec(t.time):'—'}</div>`;
  return h+`</td>`;
}
export function matrixHtml(model){
  const c=model.counts;
  if(!model.books.length) return `<div class="live-empty">لا توجد أسفار مفتوحة بعد${model.rosterOk&&c.registered?` — ${c.registered} مسجّل`:''}</div>`;
  const shown=!model.unsolvedHidden;
  const cards=[[shown?c.registered:c.shown,shown?'مسجّل':'ظاهرين'],[shown?`${c.solved} من ${c.registered}`:c.solved,'حلّوا ≥ إصحاح'],
    [`${c.avgCommit}%`,shown?'متوسط الالتزام الإجمالي':'متوسط الالتزام (للي حلّوا)'],[c.full,'ملتزم بالكل ⭐']];
  let h=`<div class="stats-bar">`+cards.map(x=>`<div class="stat-card"><div class="num">${x[0]}</div><div class="lbl">${x[1]}</div></div>`).join('')+`</div>`;
  if(model.unsolvedHidden==='truncated') h+=`<div class="ab-note">⚠️ النتايج مقصوصة (أو المسجّلين فوق ٥٠٠٠) — اللي ما حلّش مخفي</div>`;
  if(model.approx) h+=`<div class="ab-note">(الإصحاحات المفتوحة تقديرية)</div>`;
  if(!model.students.length) return h+`<div class="live-empty">لا توجد نتائج مطابقة</div>`;
  h+=`<div class="ab-scroll"><table class="ab-tbl"><thead><tr><th class="ab-c-rk">#</th><th class="ab-c-nm">المخدوم</th>`+
    model.books.map(b=>`<th class="ab-h-bk" data-ab-book="${esc(b.id)}">${esc(b.title)}</th>`).join('')+`<th class="ab-h-tot">الإجمالي</th></tr></thead><tbody>`+
    model.students.map(s=>`<tr data-ab-row="${s.rank}"><td class="ab-c-rk">${s.medal||s.rank}</td><td class="ab-c-nm"><b>${esc(s.name)}</b>${s.total.full?' ⭐':''}<small>${esc(s.grade)}</small></td>`+
      s.cells.map(cellHtml).join('')+totalHtml(s.total)+`</tr>`).join('')+`</tbody></table></div>`;
  return h;
}

// ── التصدير ──
// الأعمدة ثابتة العدد: الترتيب | الاسم | الصف | (لكل سفر: إصحاحات | من | الدرجة | من | النسبة % | وقت (ثانية)) | (نفس الستة للإجمالي) | الحالة
const SUB=['إصحاحات','من','الدرجة','من','النسبة %','وقت (ثانية)'];
const cellRow=(c)=>c.n?[c.done,c.n,c.done>0?c.score:'',c.done>0?c.max:'',c.max>0?c.pct:'',c.timeKnown?c.time:'']:['','','','','',''];
export function matrixExportRows(model){
  const head=['الترتيب','الاسم','الصف'];
  for(const b of model.books) for(const s of SUB) head.push(liveSafe(`${b.title} — ${s}`));
  for(const s of SUB) head.push(`الإجمالي — ${s}`);
  head.push('الحالة');
  const body=model.students.map(s=>{
    const t=s.total, st=t.full?'ملتزم بالكل':t.done>0?'حلّ':'لم يحل';
    return [s.rank,liveSafe(s.name),liveSafe(s.grade),...s.cells.flatMap(cellRow),...cellRow(t),st];
  });
  return {head,body};
}
// نص للنسخ: سطر لكل مخدوم «1. الاسم — 4/5 (80%) — 34/40 — 5د 30ث»
export function matrixCopyText(model){
  const lines=model.students.map(s=>{
    const t=s.total; if(!t.done) return `${s.rank}. ${s.name} — ${s.grade} — لم يحل`;
    return `${s.rank}. ${s.name} — ${s.grade} — ${t.done}/${t.n} (${t.commitPct}%) — ${t.score}/${t.max}${t.timeKnown?' — '+fmtSec(t.time):''}${t.full?' ⭐':''}`;
  });
  return '🗂 ترتيب كل الأسفار (أول محاولة)\n'+lines.join('\n');
}
