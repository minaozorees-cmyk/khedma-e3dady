// (v9.515) لوحة النتائج المباشرة تعرض كل المسجّلين (مش اللي حلّوا بس) + مقام الالتزام = الإصحاحات المفتوحة فعلاً.
// منطق نقي بدون DOM/سيرفر (قابل للاختبار بـNode من غير loader، زي progress.js).
// المفتوح = نفس js/progress.js حرفياً (requiredChapters/isOpened بلا تعديل): إصحاح له صف chapter_access بـopens_at لسه جاي = مقفول،
// وإصحاح من غير صف = مفتوح دايماً، والقفل (closes_at) ما بيشيلش الإصحاح من المقام.
// الأسماء بتتسلّم خام (من غير تهريب HTML)؛ التهريب في servant.html عند البناء، وحماية حقن المعادلات (liveSafe) هنا في صفوف التصدير.
import {requiredChapters, isOpened} from './progress.js';
import {normName} from './auth.js';

const collator=new Intl.Collator('ar');
const ts=(x)=>{ const t=x?Date.parse(x):NaN; return Number.isFinite(t)?t:NaN; };
const str=(v)=>v==null?'':String(v);

// مفتاح تجميع الأسماء المكررة: الصف + الاسم المُطبَّع (نفس مفتاح mkUnits في progress.js)
export const unitKey=(name,grade)=>String(grade||'—')+'|'+(normName(name)||'');
// داخلياً: لو الاسم فاضي نستخدم الـid عشان مسجّلين من غير اسم ما يتدمجوش في واحد
const unitOf=(p)=>{ const n=normName(p&&p.name)||''; return String((p&&p.grade)||'—')+'|'+(n||('#'+str(p&&p.id))); };

// يمنع CSV/Excel formula injection (نفس liveSafe في servant.html)
export const liveSafe=(v)=>{ v=str(v); return /^[=+\-@\t\r]/.test(v)?"'"+v:v; };
export const livePct=(s,t)=>t>0?Math.round(s/t*100):0;

// فلاتر الصف/الجنس/البحث بالاسم. نفس معنى liveFilter القديمة (المقارنة بالتساوي). book بيتعامل معاه بره.
const matchPerson=(p,f)=>{
  const q=str(f.q).trim().toLowerCase();
  return (!f.grade||p.grade===f.grade)&&(!f.gender||p.gender===f.gender)&&(!q||str(p.name).toLowerCase().includes(q));
};

// السفر المعروض: 1) المختار 2) الأحدث بأول محاولة في الصفوف 3) (من غير نتايج) أحدث سفر اتفتح فعلاً بحسب المواعيد 4) null
// activeBooks (اختياري): أسفار السيرفر/المحمّلة؛ سفر محذوف بتفضل له مواعيد قديمة (v9.505) فما بيتختارش في حالة «من غير نتايج»
export function pickScope({rows=[],selectedBook='',access=[],bookChapters={},bookTitles={},activeBooks=null,now=Date.now()}={}){
  const titleOf=new Map();
  for(const r of rows) if(r&&r.book_id&&!titleOf.has(r.book_id)) titleOf.set(r.book_id,r.title||'');
  const title=(id)=>(bookTitles&&bookTitles[id])||titleOf.get(id)||id;
  const latest=new Map();
  for(const r of rows){ if(!r||!r.book_id) continue; const t=ts(r.first_attempted_at)||0; const x=latest.get(r.book_id); if(x===undefined||t>x) latest.set(r.book_id,t); }
  const multi=latest.size>1;
  if(selectedBook) return {id:selectedBook,title:title(selectedBook),multi,byUser:true,note:''};
  if(latest.size){
    const id=[...latest].sort((a,b)=>b[1]-a[1])[0][0];
    return {id,title:title(id),multi,byUser:false,note:multi?`يوجد أكثر من سفر — معروض أحدثها: ${title(id)} (اختر سفراً من القائمة)`:''};
  }
  // مفيش نتايج خالص: أحدث سفر ليه إصحاح اتفتح (أكبر opens_at ≤ now)
  let best=null;
  const act=Array.isArray(activeBooks)&&activeBooks.length?new Set(activeBooks):null;
  for(const a of access){ const o=ts(a&&a.opens_at); if(!a||!a.book_id||!Number.isFinite(o)||o>now||(act&&!act.has(a.book_id))) continue; if(!best||o>best.o) best={o,id:a.book_id}; }
  return best?{id:best.id,title:title(best.id),multi:false,byUser:false,note:''}:null;
}

// نموذج العرض الواحد (مصدر واحد للشاشة والتصدير). rows = نتايج results_first_staff، roster = المسجّلين (أو null لو فشل تحميلهم)
export function buildLiveModel({rows=[],roster=null,access=[],bookChapters={},bookTitles={},activeBooks=null,filters={},now=Date.now(),truncated=false}={}){
  const f=filters||{}, all=Array.isArray(rows)?rows:[], acc=Array.isArray(access)?access:[];
  const rowsF=all.filter(r=>matchPerson(r,f)&&(!f.book||r.book_id===f.book));
  const rowsNoBook=all.filter(r=>matchPerson(r,f));
  const scope=pickScope({rows:rowsNoBook,selectedBook:f.book||'',access:acc,bookChapters,bookTitles,activeBooks,now});
  const rosterOk=Array.isArray(roster);
  const base={scope,filteredRows:rowsF,rosterOk,unsolvedHidden:rosterOk?(truncated?'truncated':null):'no-roster'};
  if(!scope){
    const reg=rosterOk?dedupeRoster(roster.filter(p=>matchPerson(p,f)),new Set(),new Set()).length:0;
    return {...base,required:[],approx:false,scopeRows:[],solverIds:[],unsolved:[],counts:{registered:reg,solved:0,unsolved:0}};
  }
  const req=requiredChapters(scope.id,{access:acc,results:all,bookChapters,now});
  const scopeRows=rowsNoBook.filter(r=>r.book_id===scope.id);
  const solverIds=[...new Set(scopeRows.map(r=>r.profile_id))];
  // اللي حلّوا السفر (بدون فلاتر) عشان نحدد مين «لم يحل» ونشيل التكرار (حسابين لنفس الاسم والصف وواحد حلّ)
  const solvedIdsAll=new Set(), solvedUnitsAll=new Set();
  for(const r of all) if(r.book_id===scope.id){ solvedIdsAll.add(r.profile_id); solvedUnitsAll.add(unitOf(r)); }
  let unsolvedAll=[], registered=solverIds.length;
  if(rosterOk){
    const rf=roster.filter(p=>matchPerson(p,f));
    unsolvedAll=dedupeRoster(rf,solvedIdsAll,solvedUnitsAll);
    // «N مسجّل»: مسجّلين الروستر (من غير تكرار) + اللي حلّوا وهم مش في الروستر (أرشيف)
    if(truncated){ const units=new Set(rf.map(unitOf)); for(const r of scopeRows) units.add(unitOf(r)); registered=units.size; }
    else registered=solverIds.length+unsolvedAll.length;
  }
  const unsolved=rosterOk&&!truncated?unsolvedAll:[];
  return {...base,required:req.nums,approx:req.approx,scopeRows,solverIds,unsolved,counts:{registered,solved:solverIds.length,unsolved:unsolved.length}};
}
// مسجّلين ما حلّوش: نشيل اللي id بتاعه أو (الصف+الاسم) بتاعه حلّ، ونعرض المكرر الفاضي مرة واحدة. مرتبين بالاسم.
function dedupeRoster(list,solvedIds,solvedUnits){
  const seen=new Set(), out=[];
  for(const p of [...list].sort((a,b)=>collator.compare(str(a.name),str(b.name))||(str(a.id)<str(b.id)?-1:1))){
    if(!p||solvedIds.has(p.id)) continue;
    const k=unitOf(p); if(solvedUnits.has(k)||seen.has(k)) continue;
    seen.add(k); out.push({id:p.id,name:str(p.name),grade:str(p.grade),gender:str(p.gender)});
  }
  return out;
}

// إحصاءات اللوحة. students = اللي حلّوا بعد buildStudents (فيهم pct, commitPct, isFullCommit)
//  avgPct    = متوسط الدرجات للي حلّوا فقط
//  avgCommit = متوسط الالتزام على كل المسجّلين (اللي لم يحل التزامه ٠)
export function liveStats(students=[],unsolvedCount=0){
  const solved=students.length, unsolved=Math.max(0,Number(unsolvedCount)||0), registered=solved+unsolved;
  const sum=(k)=>students.reduce((a,s)=>a+(Number(s[k])||0),0);
  return {registered,solved,unsolved,full:students.filter(s=>s.isFullCommit).length,
    avgPct:solved?Math.round(sum('pct')/solved):0,
    avgCommit:registered?Math.round(sum('commitPct')/registered):0};
}

// الإصحاحات المطلوبة (المفتوحة) لسفر معيّن — للنسخ/JSON لما فيه أكتر من سفر
export function requiredFor(bookId,{rows=[],access=[],bookChapters={},now=Date.now()}={}){
  return requiredChapters(bookId,{access,results:rows,bookChapters,now});
}

// صفوف التصدير (CSV/Excel): نتايج + «لم يحل» دايماً، وعمود «الحالة» آخر عمود
export const LIVE_HEAD=['الاسم','الصف','السفر','الإصحاح','الدرجة','من','النسبة %','تاريخ أول محاولة','عدد المحاولات','الوقت (ثانية)'];
const titleOfRow=(r)=>r.title||r.book_id;
export function exportRows({rows=[],unsolved=[],scopeTitle=''}={}){
  const head=[...LIVE_HEAD,'الحالة'];
  const detail=[...rows].sort((a,b)=>collator.compare(str(a.name),str(b.name))||collator.compare(str(titleOfRow(a)),str(titleOfRow(b)))||(a.chapter_num-b.chapter_num));
  const body=detail.map(r=>[liveSafe(r.name),liveSafe(r.grade),liveSafe(titleOfRow(r)),r.chapter_num,r.first_score,r.first_total,livePct(r.first_score,r.first_total),
    r.first_attempted_at?new Date(r.first_attempted_at).toLocaleDateString('en-CA'):'',r.attempts,r.first_duration_sec>0?r.first_duration_sec:'','حلّ']);
  const un=[...unsolved].sort((a,b)=>collator.compare(str(a.name),str(b.name)));
  for(const u of un) body.push([liveSafe(u.name),liveSafe(u.grade),liveSafe(scopeTitle),'','','','','','','','لم يحل']);
  return {head,body};
}

export {isOpened};
