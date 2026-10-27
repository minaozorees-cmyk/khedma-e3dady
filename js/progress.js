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
