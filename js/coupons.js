// (v9.489) منطق تقرير الكوبونات الأسبوعي — نقي بلا DOM/سيرفر (قابل للاختبار بـNode).
// «الإصحاح المحلول» = صف في results_first_staff (أول محاولة للمخدوم في الإصحاح، حتى لو exit) — نفس تبويب الالتزام في لوحة النتائج بالظبط.
// الصف يدخل الأسبوع لو first_attempted_at وقع جواه (بتوقيت الجهاز). فالإصحاح بياخد كوبون مرة واحدة في أسبوع أول محاولة، ومحاولات التدريب بعدها ما بتتحسبش.
// التجميع على كل الأسفار مع بعض. اللي حلّوا صفر ما بيظهروش.
import {key,parse,addDays,diffDays} from './dates.js';
export const GRADES=['الأول الإعدادي','الثاني الإعدادي','الثالث الإعدادي'];
const GICON=['👦','👧','🧒'];                 // أيقونة عنوان كل صف في نص الواتساب (زينة بس)
const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const BAR='━━━━━━━━━━━━━━━━━━━━━━━━━';
const collator=new Intl.Collator('ar');

// الأسبوع أحد→سبت. k = YYYY-MM-DD (تاريخ محلي). getDay(): الأحد=0
export const weekStart=(k)=>addDays(k,-parse(k).getDay());
// which: 'prev' (الأسبوع اللي فات — الافتراضي) | 'cur' (الأسبوع الحالي). يرجع [from,to] شاملين الطرفين
export function weekRange(todayKey,which='prev'){
  const s=weekStart(todayKey), a=which==='cur'?s:addDays(s,-7);
  return [a,addDays(a,6)];
}
// حدود زمنية بالمللي ثانية: [من 00:00 أول يوم، قبل 00:00 اليوم التالي لآخر يوم) — بالتوقيت المحلي (آمنة مع تغيير التوقيت الصيفي)
export const bounds=(from,to)=>[parse(from).getTime(),parse(addDays(to,1)).getTime()];
export const validRange=(from,to)=>/^\d{4}-\d{2}-\d{2}$/.test(from||'')&&/^\d{4}-\d{2}-\d{2}$/.test(to||'')&&key(parse(from))===from&&key(parse(to))===to&&from<=to;

// rows من SY.resultsFirst(): {profile_id,name,grade,book_id,chapter_num,first_attempted_at,...}
// يرجع {groups:[{grade,students:[{id,name,count,zero}],total,zeros}],total,students,zeros}   (zero = كام إصحاح أول محاولة له بدرجة ٠)
export function aggregate(rows,from,to){
  const [lo,hi]=bounds(from,to), by=new Map();
  for(const r of rows||[]){
    const t=Date.parse(r.first_attempted_at); if(!Number.isFinite(t)||t<lo||t>=hi) continue;
    const g=String(r.grade||'—'), id=r.profile_id;
    let G=by.get(g); if(!G) by.set(g,G=new Map());
    let S=G.get(id); if(!S) G.set(id,S={id,name:String(r.name||'—'),count:0,zero:0});
    S.count++;
    if(r.first_score!=null&&Number(r.first_score)===0) S.zero++;   // (v9.492) أول محاولة بدرجة ٠ (غالباً خروج سريع): تنبيه للمراجعة بس، الرقم ما بيتغيرش
  }
  const rank=(g)=>{ const i=GRADES.indexOf(g); return i<0?99:i; };
  const groups=[...by.entries()].sort((a,b)=>rank(a[0])-rank(b[0])||collator.compare(a[0],b[0])).map(([grade,G])=>{
    const students=[...G.values()].sort((a,b)=>b.count-a.count||collator.compare(a.name,b.name));
    return {grade,students,total:students.reduce((s,x)=>s+x.count,0),zeros:students.reduce((s,x)=>s+x.zero,0)};
  });
  return {groups,total:groups.reduce((s,g)=>s+g.total,0),students:groups.reduce((s,g)=>s+g.students.length,0),zeros:groups.reduce((s,g)=>s+g.zeros,0)};
}

// «19 - 25 أكتوبر 2026» أو «28 أكتوبر - 3 نوفمبر 2026» أو «28 ديسمبر 2026 - 3 يناير 2027»
export function rangeLabel(from,to){
  const a=parse(from), b=parse(to), d=(x)=>x.getDate(), m=(x)=>MONTHS[x.getMonth()], y=(x)=>x.getFullYear();
  if(from===to) return `${d(a)} ${m(a)} ${y(a)}`;
  if(y(a)!==y(b)) return `${d(a)} ${m(a)} ${y(a)} - ${d(b)} ${m(b)} ${y(b)}`;
  if(a.getMonth()!==b.getMonth()) return `${d(a)} ${m(a)} - ${d(b)} ${m(b)} ${y(b)}`;
  return `${d(a)} - ${d(b)} ${m(b)} ${y(b)}`;
}
export const kindWord=(from,to)=>diffDays(from,to)===6?'أسبوع':'الفترة';
export const chaptersWord=(n)=>n===1?'إصحاح':n===2?'إصحاحين':'إصحاحات';
const gTitle=(g)=>{ const i=GRADES.indexOf(g); return `${i<0?'👥':GICON[i]} الصف ${g}`; };

// نص الواتساب (أرقام إنجليزية زي النموذج)
export function whatsappText(agg,from,to){
  const L=[`📅 ${kindWord(from,to)} ${rangeLabel(from,to)}`,BAR];
  for(const g of agg.groups){
    L.push(gTitle(g.grade));
    for(const s of g.students) L.push(`👤 ${s.name}: ${s.count} ${chaptersWord(s.count)}`);
    L.push(`📊 المجموع: ${g.total} كوبون`,BAR);
  }
  L.push(`📊 إجمالي ${kindWord(from,to)==='أسبوع'?'الأسبوع':'الفترة'}: ${agg.total} كوبون`);
  return L.join('\n');
}

// صفوف الإكسيل: [الصف | الاسم | عدد الإصحاحات (الكوبونات)] + مجموع كل صف + الإجمالي
export function sheetRows(agg,from,to){
  const rows=[[`تقرير الكوبونات — ${kindWord(from,to)} ${rangeLabel(from,to)}`],[],['الصف','الاسم','عدد الإصحاحات المحلولة (الكوبونات)']];
  const styles={title:[0],head:[2],total:[]};
  for(const g of agg.groups){
    for(const s of g.students) rows.push([g.grade,s.name,s.count]);
    styles.total.push(rows.length); rows.push([`مجموع ${g.grade}`,'',g.total]);
  }
  styles.total.push(rows.length); rows.push(['إجمالي الكوبونات','',agg.total]);
  return {rows,styles};
}
