// (v9.496) دائرة تقدّم الإصحاح المفتوح (لوحة الخادم/المالك) — منطق نقي بدون DOM/سيرفر، قابل للاختبار بـNode.
// النسبة = (المخدومين اللي حلّوا الإصحاح المفتوح حالياً) ÷ (المخدومين في نطاق المستخدم) × 100.
// المخدوم = (الاسم + الصف) فلو سجّل بحسابين وواحد منهم حلّ يتعد حلّ (زي تقرير الكوبونات).
// «الإصحاح المفتوح»: صف في chapter_access opens_at فاتت وcloses_at لسه (أو غايبة). لو أكتر من واحد: الأحدث opens_at،
// ولو اتفتحوا مع بعض: أصغر رقم إصحاح (وبعده اسم السفر). مفيش صف opens_at = مش «مفتوح بميعاد» فبيتجاهل.
// المقارنة: الإصحاح اللي كان مفتوح آخر سبت (قبل بداية الأسبوع الحالي الأحد 00:00 بتوقيت الجهاز)، الحل محسوب لحد وقتها،
// ومن غير المخدومين اللي اتسجلوا بعدها. المسندين وقتها مش معروفين فالمقارنة «تقريبية» دايماً.
import {normName} from './auth.js';
const collator=new Intl.Collator('ar');
export const GRADES=['الأول الإعدادي','الثاني الإعدادي','الثالث الإعدادي'];
const ts=(x)=>{ const t=x?Date.parse(x):NaN; return Number.isFinite(t)?t:NaN; };
// المستوى من النسبة بعد التقريب (عشان اللون يطابق الرقم المعروض)
export function levelOf(p){
  const v=Math.round(Number(p)||0);
  if(v>=80) return {key:'great',label:'ممتاز',emoji:'🟢'};
  if(v>=60) return {key:'good',label:'جيد',emoji:'🟡'};
  if(v>=40) return {key:'mid',label:'يحتاج دفعة',emoji:'🟠'};
  return {key:'low',label:'محتاج تدخل',emoji:'🔴'};
}
// الإصحاح المفتوح وقت t (ms). rows = صفوف chapter_access. بيرجّع {book_id,chapter_num,opens_at,closes_at,ties} أو null
export function openChapter(rows,t){
  const open=(rows||[]).filter(a=>{ const o=ts(a.opens_at); if(!Number.isFinite(o)||o>t) return false;
    if(a.closes_at){ const c=ts(a.closes_at); if(Number.isFinite(c)&&c<=t) return false; } return true; });
  if(!open.length) return null;
  const top=Math.max(...open.map(a=>ts(a.opens_at)));
  const ties=open.filter(a=>ts(a.opens_at)===top).sort((a,b)=>(a.chapter_num-b.chapter_num)||String(a.book_id).localeCompare(String(b.book_id)));
  const a=ties[0]; return {book_id:a.book_id,chapter_num:Number(a.chapter_num),opens_at:a.opens_at,closes_at:a.closes_at||null,ties:ties.length};
}
// بداية الأسبوع الحالي (الأحد 00:00 بتوقيت الجهاز) بالمللي ثانية
export function weekStartMs(now){ const d=new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay()); return d.getTime(); }
const pct=(s,t)=>t?Math.round(s/t*100):0;
const rank=(g)=>{ const i=GRADES.indexOf(g); return i<0?99:i; };
// students: [{id,name,grade,created_at}] (النشطين في نطاق المستخدم) — results: صفوف results_first_staff — access: صفوف chapter_access
export function buildProgress({students=[],results=[],access=[],now=Date.now()}={}){
  const units=new Map();
  for(const s of students){
    const grade=String(s.grade||'—'), k=grade+'|'+(normName(s.name)||s.id);
    let u=units.get(k); if(!u) units.set(k,u={key:k,name:String(s.name||'—'),grade,accounts:[]});
    u.accounts.push({id:s.id,created:ts(s.created_at)});
  }
  const U=[...units.values()];
  if(!U.length) return {state:'noStudents'};
  const ch=openChapter(access,now); if(!ch) return {state:'noOpen',total:U.length};
  const title=new Map(); for(const r of results) if(r.title) title.set(r.book_id,r.title);
  const label=(c)=>({book_id:c.book_id,chapter_num:c.chapter_num,title:title.get(c.book_id)||c.book_id});
  const isCh=(r,c)=>r.book_id===c.book_id&&Number(r.chapter_num)===c.chapter_num;
  const solvedNow=new Set(results.filter(r=>isCh(r,ch)).map(r=>r.profile_id));
  const mk=(list,solvedSet)=>{ const sv=[],un=[]; for(const u of list) (u.accounts.some(a=>solvedSet.has(a.id))?sv:un).push(u);
    const byName=(a,b)=>collator.compare(a.name,b.name); sv.sort(byName); un.sort(byName);
    const p=pct(sv.length,list.length); return {total:list.length,solved:sv.length,pct:p,level:levelOf(p),solvedList:sv,unsolvedList:un}; };
  const all=mk(U,solvedNow);
  const gs=[...new Set(U.map(u=>u.grade))].sort((a,b)=>rank(a)-rank(b)||collator.compare(a,b));
  const grades=gs.map(g=>({grade:g,...mk(U.filter(u=>u.grade===g),solvedNow)}));
  // مقارنة بالأسبوع اللي فات
  let compare=null;
  const T=weekStartMs(now), lc=openChapter(access,T-1);
  if(lc){
    const sLast=new Set(results.filter(r=>isCh(r,lc)&&ts(r.first_attempted_at)<=T).map(r=>r.profile_id));
    const eligible=U.filter(u=>u.accounts.some(a=>!Number.isFinite(a.created)||a.created<=T));
    if(eligible.length){
      const solved=eligible.filter(u=>u.accounts.some(a=>sLast.has(a.id))).length, p=pct(solved,eligible.length);
      compare={pct:p,diff:all.pct-p,chapter:label(lc),sameChapter:lc.book_id===ch.book_id&&lc.chapter_num===ch.chapter_num,approx:true};
    }
  }
  return {state:'ok',chapter:{...label(ch),opens_at:ch.opens_at,ties:ch.ties},all,grades,multi:grades.length>=2,compare};
}
// دائرة SVG (قوس التقدّم فقط؛ الرقم والكلمة بيتحطوا فوقها بـHTML). الألوان من CSS حسب فئة المستوى lv-*.
export function ringSvg(p,{r=52,w=10}={}){
  const v=Math.max(0,Math.min(100,Math.round(Number(p)||0))), C=2*Math.PI*r, off=C*(1-v/100);
  return `<svg class="pg-svg" viewBox="0 0 120 120" aria-hidden="true"><circle class="pg-track" cx="60" cy="60" r="${r}" style="stroke-width:${w}"/><circle class="pg-arc" cx="60" cy="60" r="${r}" style="stroke-width:${w}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/></svg>`;
}

// ===== (v9.501) مؤشرات متقدّمة: نطاق القياس × الفئة (جنس + صف) — منطق نقي. buildProgress فوق ما اتغيّرش. =====
// النطاق (scope): {type:'open'} الإصحاح المفتوح حالياً | {type:'chapter',book_id,chapter_num} إصحاح محدد | {type:'book',book_id} سفر محدد.
// «حلّ السفر» = حلّ كل إصحاحاته المفتوحة لحد دلوقتي (مفيش صف في chapter_access = مفتوح دايماً، وopens_at فاتت = مفتوح؛ opens_at لسه ما جاتش = مش مطلوب).
//   قائمة إصحاحات السفر الكاملة من bookChapters {book_id:[أرقام]} (مصدرها books.js)؛ لو مش متاحة نقدّر من chapter_access + النتايج (approx=true).
// الفئة (group): {gender:'all'|'boys'|'girls', grade:'all'|<الصف>}. الدايرة الأساسية = (أ) نسبة جوّه الفئة، وshare = (ب) نسبة الفئة من كل الجنس (لما يتحدد صف).
// subs: ٥ دوائر ثابتة (أولاد، بنات، ٣ صفوف) على كل المخدومين في النطاق، ما بتتأثرش بفلتر الفئة.
// «متأخر»: مخدوم ما حلّش النطاق المختار، لكن أول محاولة ليه في إصحاح تاني (مش المفتوح حالياً) وقعت جوه الأسبوع الحالي. (مش بنخمّن «بكود»: مش متسجّلة على السيرفر.)
const BOY=/^(ولد|ذكر)$/, GIRL=/^(بنت|انثى|أنثى)$/;
export const genderKey=(g)=>{ const s=String(g||'').trim(); return BOY.test(s)?'boys':GIRL.test(s)?'girls':''; };
export const GENDER_WORD={boys:'ولد',girls:'بنت',all:'مخدوم'};
function mkUnits(students){
  const m=new Map();
  for(const s of students){
    const grade=String(s.grade||'—'), k=grade+'|'+(normName(s.name)||s.id);
    let u=m.get(k); if(!u) m.set(k,u={key:k,name:String(s.name||'—'),grade,gender:'',accounts:[]});
    const g=genderKey(s.gender); if(g&&!u.gender) u.gender=g;   // جنس المخدوم من أي حساب ليه فيه جنس
    u.accounts.push({id:s.id,created:ts(s.created_at)});
  }
  return [...m.values()];
}
// الإصحاح اتفتح لحد now؟ (مفيش صف = مفتوح دايماً)
export function isOpened(access,bookId,num,now){
  const a=(access||[]).find(x=>x.book_id===bookId&&Number(x.chapter_num)===Number(num)); if(!a) return true;
  const o=ts(a.opens_at); return !Number.isFinite(o)||o<=now;
}
// إصحاحات السفر المطلوبة (المفتوحة لحد دلوقتي) مرتبة. approx=true لو القائمة مش من مصدر الأسفار
export function requiredChapters(bookId,{access=[],results=[],bookChapters={},now=Date.now()}={}){
  const bc=bookChapters&&bookChapters[bookId], nums=new Set(), approx=!(Array.isArray(bc)&&bc.length);
  if(!approx) for(const c of bc) nums.add(Number(c));
  else{ for(const a of access) if(a.book_id===bookId) nums.add(Number(a.chapter_num)); for(const r of results) if(r.book_id===bookId) nums.add(Number(r.chapter_num)); }
  return {nums:[...nums].filter(c=>Number.isFinite(c)&&isOpened(access,bookId,c,now)).sort((a,b)=>a-b),approx};
}
// خيارات القوايم: [{book_id,title,chapters:[الإصحاحات المفتوحة]}] مرتبة بالعنوان
export function scopeOptions({access=[],results=[],bookChapters={},bookTitles={},now=Date.now()}={}){
  const ids=new Set([...Object.keys(bookChapters||{}),...access.map(a=>a.book_id),...results.map(r=>r.book_id)].filter(Boolean));
  const title=new Map(); for(const r of results) if(r.title&&!title.has(r.book_id)) title.set(r.book_id,r.title);
  return [...ids].map(id=>({book_id:id,title:(bookTitles&&bookTitles[id])||title.get(id)||id,chapters:requiredChapters(id,{access,results,bookChapters,now}).nums}))
    .filter(b=>b.chapters.length).sort((a,b)=>collator.compare(a.title,b.title));
}
export const SUB_DEFS=[{key:'boys',label:'أولاد',gender:'boys'},{key:'girls',label:'بنات',gender:'girls'},{key:'g1',label:'الأول',grade:GRADES[0]},{key:'g2',label:'الثاني',grade:GRADES[1]},{key:'g3',label:'الثالث',grade:GRADES[2]}];
export function buildScoped({students=[],results=[],access=[],now=Date.now(),scope={type:'open'},bookChapters={},bookTitles={},group={}}={}){
  const U=mkUnits(students); if(!U.length) return {state:'noStudents'};
  const gr={gender:group.gender||'all',grade:group.grade||'all'};
  const titles=new Map(); for(const r of results) if(r.title&&!titles.has(r.book_id)) titles.set(r.book_id,r.title);
  const titleOf=(b)=>(bookTitles&&bookTitles[b])||titles.get(b)||b;
  let target;
  if(scope.type==='book'){
    if(!scope.book_id) return {state:'noScope',total:U.length};
    const req=requiredChapters(scope.book_id,{access,results,bookChapters,now});
    if(!req.nums.length) return {state:'noChapters',total:U.length,title:titleOf(scope.book_id)};
    target={type:'book',book_id:scope.book_id,title:titleOf(scope.book_id),required:req.nums,approx:req.approx};
  }else if(scope.type==='chapter'){
    if(!scope.book_id||!Number.isFinite(Number(scope.chapter_num))||!Number(scope.chapter_num)) return {state:'noScope',total:U.length};
    target={type:'chapter',book_id:scope.book_id,chapter_num:Number(scope.chapter_num),title:titleOf(scope.book_id)};
  }else{
    const ch=openChapter(access,now); if(!ch) return {state:'noOpen',total:U.length};
    target={type:'open',book_id:ch.book_id,chapter_num:ch.chapter_num,title:titleOf(ch.book_id),opens_at:ch.opens_at,ties:ch.ties};
  }
  const done=new Map(); for(const r of results){ let s=done.get(r.profile_id); if(!s) done.set(r.profile_id,s=new Set()); s.add(r.book_id+'|'+Number(r.chapter_num)); }
  const has=(u,k)=>u.accounts.some(a=>{ const s=done.get(a.id); return !!s&&s.has(k); });
  const solvedFn=target.type==='book'?(u)=>target.required.every(c=>has(u,target.book_id+'|'+c)):(u)=>has(u,target.book_id+'|'+target.chapter_num);
  // «متأخر»: أول محاولة جوه الأسبوع الحالي في إصحاح غير المفتوح حالياً
  const W=weekStartMs(now), ch0=openChapter(access,now), lateBy=new Map();
  if(ch0) for(const r of results){
    const t=ts(r.first_attempted_at); if(!Number.isFinite(t)||t<W||t>now) continue;
    if(r.book_id===ch0.book_id&&Number(r.chapter_num)===ch0.chapter_num) continue;
    let a=lateBy.get(r.profile_id); if(!a) lateBy.set(r.profile_id,a=[]); a.push({book_id:r.book_id,chapter_num:Number(r.chapter_num),title:titleOf(r.book_id)});
  }
  const lateOf=(u)=>{ const seen=new Map(); for(const a of u.accounts) for(const c of (lateBy.get(a.id)||[])) seen.set(c.book_id+'|'+c.chapter_num,c); return [...seen.values()].sort((x,y)=>(x.chapter_num-y.chapter_num)||collator.compare(x.title,y.title)); };
  const inGroup=(g)=>(u)=>(!g.gender||g.gender==='all'||u.gender===g.gender)&&(!g.grade||g.grade==='all'||u.grade===g.grade);
  const byName=(a,b)=>collator.compare(a.name,b.name);
  const stat=(list)=>{ const sv=[],un=[]; for(const u of list){ if(solvedFn(u)) sv.push(u); else{ u.late=lateOf(u); un.push(u); } }
    sv.sort(byName); un.sort(byName); const p=pct(sv.length,list.length);
    return {total:list.length,solved:sv.length,pct:p,level:levelOf(p),empty:!list.length,solvedList:sv,unsolvedList:un}; };
  const mainList=U.filter(inGroup(gr)), main={...stat(mainList),group:gr};
  // (ب): نسبة الفئة من كل الجنس المختار (لما يتحدد صف بس؛ غير كده هي نفس (أ))
  if(gr.grade!=='all'&&!main.empty){ const den=U.filter(u=>gr.gender==='all'||u.gender===gr.gender).length; main.share={solved:main.solved,total:den,pct:pct(main.solved,den),word:GENDER_WORD[gr.gender]||'مخدوم'}; }
  const subs=SUB_DEFS.map(d=>({key:d.key,label:d.label,...stat(U.filter(inGroup({gender:d.gender||'all',grade:d.grade||'all'})))}));
  let compare=null;
  if(target.type==='open'){   // المقارنة بالأسبوع اللي فات للإصحاح المفتوح بس (تقريبية)
    const T=W, lc=openChapter(access,T-1);
    if(lc){
      const sLast=new Set(results.filter(r=>r.book_id===lc.book_id&&Number(r.chapter_num)===lc.chapter_num&&ts(r.first_attempted_at)<=T).map(r=>r.profile_id));
      const eligible=mainList.filter(u=>u.accounts.some(a=>!Number.isFinite(a.created)||a.created<=T));
      if(eligible.length){ const s=eligible.filter(u=>u.accounts.some(a=>sLast.has(a.id))).length, p=pct(s,eligible.length);
        compare={pct:p,diff:main.pct-p,chapter:{book_id:lc.book_id,chapter_num:Number(lc.chapter_num),title:titleOf(lc.book_id)},sameChapter:lc.book_id===target.book_id&&Number(lc.chapter_num)===target.chapter_num,approx:true}; }
    }
  }
  return {state:'ok',target,group:gr,main,subs,noGender:U.filter(u=>!u.gender).length,compare};
}
