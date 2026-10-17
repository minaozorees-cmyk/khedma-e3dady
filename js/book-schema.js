// فحص وتنظيف ملفات الأسفار (نفس قواعد أداة التوليد + فحص ans والترتيب). الحقول التي تبدأ بـ _ تُتجاهل.
const str=(v)=>typeof v==='string'?v.trim():(typeof v==='number'?String(v):'');
function verse(v){ if(Array.isArray(v)&&v.length>=2&&str(v[1])) return [str(v[0]),str(v[1])]; if(typeof v==='string'&&v.trim()) return ['',v.trim()]; return null; }
function cleanQ(q,i,errs){
  const n=i+1;
  if(!q||typeof q!=='object'){ errs.push(`السؤال ${n} غير صالح`); return null; }
  const base={type:str(q.type),q:str(q.q),ref:str(q.ref)};
  if(!base.q){ errs.push(`السؤال ${n}: نص السؤال (q) مفقود`); return null; }
  if(q.isTimeline){
    const ev=Array.isArray(q.events)?q.events.map(e=>({id:e&&e.id,correctOrder:e&&Number(e.correctOrder),text:str(e&&e.text)})):[];
    if(ev.length<2||ev.some(e=>e.id==null||!e.text||!Number.isFinite(e.correctOrder))){ errs.push(`سؤال الترتيب ${n}: يلزم حدثان على الأقل لكل منهما id و correctOrder و text`); return null; }
    if(new Set(ev.map(e=>e.id)).size!==ev.length||new Set(ev.map(e=>e.correctOrder)).size!==ev.length){ errs.push(`سؤال الترتيب ${n}: id أو correctOrder مكرر`); return null; }
    return {...base,isTimeline:true,events:ev};
  }
  const opts=Array.isArray(q.opts)?q.opts.map(str):[];
  if(opts.length<2||opts.some(o=>!o)){ errs.push(`السؤال ${n}: الاختيارات (opts) ناقصة`); return null; }
  if(!Number.isInteger(q.ans)||q.ans<0||q.ans>=opts.length){ errs.push(`السؤال ${n}: ans خارج نطاق الاختيارات`); return null; }
  return {...base,opts,ans:q.ans};
}
// opt.lib=true: السفر مربوط بالمكتبة، فنص الإصحاح (chapter) والتأمل اختياريان (النص يُسحب من المكتبة عند القراءة)
export function cleanChapter(c,opt={}){
  const lib=!!opt.lib;
  const errs=[];
  if(!c||typeof c!=='object') return {chapter:null,errs:['إصحاح غير صالح']};
  const num=parseInt(c.chapterNum,10);
  if(!(num>0)) errs.push('رقم الإصحاح (chapterNum) مفقود أو غير صحيح');
  let sections=[], needsText=false;
  if(!Array.isArray(c.chapter)||!c.chapter.length){ if(lib) needsText=true; else errs.push('لا توجد أقسام في chapter'); }
  else sections=c.chapter.map((s,i)=>{
    if(!s||!str(s.title)) errs.push(`القسم ${i+1}: العنوان (title) مفقود`);
    const verses=Array.isArray(s&&s.verses)?s.verses.map(verse).filter(Boolean):[];
    if(!verses.length) errs.push(`القسم ${i+1}: لا توجد آيات (verses)`);
    return {title:str(s&&s.title),imgCap:str(s&&s.imgCap),verses};
  });
  const m=c.meditation||{};
  const med={verseText:str(m.verseText),verseRef:str(m.verseRef),meditation:str(m.meditation),comment:str(m.comment),message:str(m.message)};
  const noMed=lib&&Object.values(med).every(v=>!v);   // في سفر المكتبة: التأمل اختياري كله أو لا شيء
  if(!noMed&&Object.values(med).some(v=>!v)) errs.push('التأمل (meditation) ينقصه verseText أو verseRef أو meditation أو comment أو message');
  let qs=[];
  if(!Array.isArray(c.questions)||!c.questions.length) errs.push('لا توجد أسئلة (questions)');
  else qs=c.questions.map((q,i)=>cleanQ(q,i,errs)); // أي سؤال معيب يُسقط الإصحاح كله (لا يُعرض امتحان ناقص)
  if(errs.length) return {chapter:null,errs};
  return {chapter:{chapterNum:num,sections,meditation:noMed?null:med,questions:qs,needsText},errs};
}
// يقبل ملف سفر بعدة إصحاحات {book,chapters:[...]} أو إصحاحاً مفرداً {book,chapterNum,...}
export function normalizeFile(raw,opt={}){
  const out={book:'',chapters:[],problems:[]};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){ out.problems.push('الملف ليس كائن JSON صالحاً'); return out; }
  out.book=str(raw.book);
  const list=Array.isArray(raw.chapters)?raw.chapters:(raw.chapterNum!=null?[raw]:null);
  if(!list){ out.problems.push('لا توجد إصحاحات (chapters) ولا إصحاح مفرد'); return out; }
  list.forEach((c,i)=>{ const {chapter,errs}=cleanChapter(c,opt);
    if(errs.length) out.problems.push(`إصحاح ${c&&c.chapterNum!=null?c.chapterNum:'#'+(i+1)}: `+errs.join('، ')); else out.chapters.push(chapter); });
  return out;
}

// (v9.26) ملف أسئلة فقط: {book?, chapterNum, questions, meditation?} أو {chapters:[...]} أو مصفوفة إصحاحات.
// أي نص إصحاح (chapter) داخل الملف يُتجاهل: النص يُسحب من المكتبة. ignoredText = عدد الإصحاحات اللي نصها اتجاهل.
export function normalizeQuestions(raw){
  const out={book:'',chapters:[],problems:[],ignoredText:0};
  if(!raw||typeof raw!=='object'){ out.problems.push('الملف ليس JSON صالحاً'); return out; }
  out.book=Array.isArray(raw)?'':str(raw.book);
  const list=Array.isArray(raw)?raw:(Array.isArray(raw.chapters)?raw.chapters:(raw.chapterNum!=null?[raw]:null));
  if(!list){ out.problems.push('لا توجد إصحاحات (chapters) ولا إصحاح مفرد (chapterNum)'); return out; }
  list.forEach((c,i)=>{
    if(c&&typeof c==='object'&&Array.isArray(c.chapter)&&c.chapter.length) out.ignoredText++;
    const {chapter,errs}=cleanChapter(c&&typeof c==='object'?{...c,chapter:null}:c,{lib:true});
    if(errs.length) out.problems.push(`إصحاح ${c&&c.chapterNum!=null?c.chapterNum:'#'+(i+1)}: `+errs.join('، ')); else out.chapters.push(chapter); });
  return out;
}
