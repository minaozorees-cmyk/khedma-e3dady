// (v9.509) منطق خريطة الإصحاحات للمخدوم (modules/books/chmap.js). دوال نقية بدون DOM عشان تتختبر بـNode (tests/chmap-logic.test.mjs).
// شكل الإصحاح: {num, sub, lock:{why:'before'|'after',at}|null, first:{score,total}|null (أول محاولة), attempts}
//   done    = محلول (له أول محاولة؛ المحلول عمره ما يتقفل: نفس access.lock v9.503)
//   current = أول إصحاح مفتوح ومش محلول
//   open    = مفتوح ومش محلول (بعد الحالي)
//   locked  = ميعاد فتحه لسه ما جاش
//   ended   = اتقفل بميعاده ومحلّوش
const AR='٠١٢٣٤٥٦٧٨٩';
export const ar=(x)=>String(x).replace(/\d/g,(d)=>AR[d]);
// (قفل «before» يغلب المحلول: نفس الشبكة القديمة اللي كانت بتظهر 🔒 حتى لو الإصحاح محلول، زي إصحاح اتحلّ وبعدين ميعاده اتأجّل). «after» ما بيتجمعش مع المحلول أصلاً (access.lock v9.503).
export const kindOf=(c)=>c.lock&&c.lock.why==='before'?'locked':c.first?'done':c.lock?'ended':'open';
// الحالي = أول مفتوح ومش محلول؛ التلميح (الحلقة المتقطعة) = أقرب مقفول لسه هيتفتح
export function derive(chs){
  const cur=chs.findIndex((c)=>kindOf(c)==='open');
  let hint=-1, best=Infinity;
  chs.forEach((c,i)=>{ if(kindOf(c)==='locked'&&c.lock.at<best){ best=c.lock.at; hint=i; } });
  return {cur,hint};
}
export const stateOf=(chs,i,cur)=>{ const k=kindOf(chs[i]); return k==='open'&&i===cur?'current':k; };
export const doneIdx=(chs)=>chs.map((c,i)=>kindOf(c)==='done'?i:-1).filter((i)=>i>=0);
export const counts=(chs)=>({done:doneIdx(chs).length,open:chs.filter((c)=>kindOf(c)==='open').length,N:chs.length});
// نقطة التقدّم اللي المسار بيوصلها: الحالي، وإلا آخر محلول، وإلا -1
export function progIdx(chs,cur){ if(cur>=0) return cur; const d=doneIdx(chs); return d.length?d[d.length-1]:-1; }
export const hueFor=(i,N)=>(i*360/Math.max(1,N)+200)%360;
export const trailFrac=(i,N)=>(i<0||N<2)?0:(i+0.5)/N;
// لقطة حالة السفر (للمقارنة بعد الرجوع من النتيجة: لو اتحلّ إصحاح جديد المسار يتحرّك)
export const snap=(chs)=>{ const {cur}=derive(chs); return {done:chs.filter((c)=>kindOf(c)==='done').map((c)=>c.num).sort((a,b)=>a-b),prog:progIdx(chs,cur)}; };
export const grew=(prev,now)=>!!prev&&now.done.some((x)=>!prev.done.includes(x));
// العنوان الفرعي = أول عنوان قسم في الإصحاح (مقصوص)
export function subOf(c,max=42){
  const t=c&&Array.isArray(c.chapter)&&c.chapter[0]&&c.chapter[0].title;
  const s=typeof t==='string'?t.replace(/\s+/g,' ').trim():'';
  return s.length>max?s.slice(0,max-1).trimEnd()+'…':s;
}
export const STATE_AR={done:'محلول',current:'جاري',open:'مفتوح',locked:'مقفول',ended:'انتهى ميعاده'};
// نصوص الشريط السفلي (بدون أيقونات/تواريخ؛ التاريخ بيتمرّر جاهز)
export function footerText(chs,{cur,hint},fmtShort){
  const c=counts(chs);
  if(cur>=0){ const num=ar(chs[cur].num); return {mode:'go',loc:'الإصحاح '+num,cta:(c.done>0?'أكمل رحلتك':'ابدأ رحلتك')+' · الإصحاح '+num}; }
  if(c.N>0&&c.done===c.N) return {mode:'all',loc:'خلّصت كل الإصحاحات',cta:'أكملت السفر كله 🏆'};
  return {mode:'none',loc:'مفيش إصحاح مفتوح دلوقتي',cta:hint>=0?'أقرب فتح: إصحاح '+ar(chs[hint].num)+' · '+fmtShort(chs[hint].lock.at):'مفيش إصحاح مفتوح دلوقتي'};
}
export const hudText=(chs)=>{ const c=counts(chs); return {main:ar(c.done)+' محلول',open:c.open>0?ar(c.open)+' مفتوح':'',sub:ar(c.N)+' إصحاح · '+ar(c.done)+' محلول'}; };
// رسالة الـpopover حسب الحالة
export function popMessage(s,{curNum,at,fmt}){
  if(s==='current') return 'الإصحاح ده مفتوح. ابدأ بالقراءة وبعدها الأسئلة.';
  if(s==='open') return 'سبقك فضولك للإصحاح ده ✨ بس إصحاح '+ar(curNum)+' لسه في انتظارك، ما تنساهوش.';
  if(s==='locked') return 'الإصحاح ده بيفتح '+fmt(at)+'. لو معاك كود فتح من الخادم تقدر تفتحه بيه.';
  if(s==='ended') return 'الإصحاح ده اتقفل '+fmt(at)+'. لو معاك كود فتح من الخادم تقدر تفتحه بيه.';
  return '';
}
// رسائل فحص الكود (نفس رسائل شاشة «locked»)
export const VERIFY_MSG={
  bad:'الكود غلط. اتأكد منه وجرّب تاني.',
  locked:'جرّبت كتير. استنى ساعة وجرّب تاني.',
  nodata:'الأكواد لسه ما وصلتش جهازك. افتح التطبيق مرة وانت متصل بالنت وجرّب تاني.',
  unavailable:'المتصفح ده مش بيدعم فحص الكود. افتح التطبيق من متصفح تاني.'
};
export const verifyMsg=(r)=>VERIFY_MSG[r]||'تعذّر الفحص، جرّب تاني.';

// ===== (v9.510) قايمة الأسفار للمخدوم: ظهور السفر + «أقرب فتح» (modules/books/index.js) =====
// دوال نقية (بدون DOM ولا access.js): index.js بيحوّل كل سفر لشكل بسيط ويمرّره هنا. الاختبار: tests/books-visibility.test.mjs
// شكل السفر: {id, title, chapters:[{num, lock:{why:'before'|'after',at}|null (نتيجة AC.lock), solved:bool (AC.isSolved)}]}
//   locked = ميعاد فتحه لسه ما جاش (بيغلب المحلول: نفس kindOf) · done = محلول · ended = اتقفل بميعاده ومحلّوش · open = مفتوح ومش محلول
const DAY=864e5;
export const WINDOW_DAYS=30, KEEP_DAYS=60, HOT_HOURS=24;   // (v9.511) السفر اللي لسه ما بدأش بيظهر في البانر بس لو أقرب فتح فيه ≤٣٠ يوم (الأقرب فقط)، وأي سفر تاني لسه ما بدأش بيظهر لما يفضله ≤٢٤ ساعة · السفر المنتهي من غير حل بيفضل ظاهر ٦٠ يوم بعد قفل آخر إصحاح
export const chKind=(c)=>c.lock&&c.lock.why==='before'?'locked':c.solved?'done':c.lock?'ended':'open';
export const bookHasOpen=(b)=>b.chapters.some((c)=>chKind(c)==='open');
export const bookStarted=(b)=>b.chapters.some((c)=>chKind(c)!=='locked');   // فيه إصحاح اتفتح قبل كده (مفتوح/محلول/انتهى)
export const bookEnded=(b)=>b.chapters.length>0&&b.chapters.every((c)=>{ const k=chKind(c); return k==='done'||k==='ended'; });   // كله «منتهي» (بند ٤: من غير شرط إن فيه محاولة)
// أقرب إصحاح هيفتح في السفر: {num,at} أو null (لو في نفس اللحظة: الأقل رقماً)
export function bookNextOpen(b){
  let best=null;
  for(const c of b.chapters){ if(chKind(c)!=='locked'||!Number.isFinite(c.lock.at)) continue;
    if(!best||c.lock.at<best.at||(c.lock.at===best.at&&c.num<best.num)) best={num:c.num,at:c.lock.at}; }
  return best;
}
// آخر لحظة قفل لإصحاحات السفر المنتهية (للسفر اللي كله ended)، وإلا null
const closedAt=(b)=>{ let m=null; for(const c of b.chapters) if(chKind(c)==='ended'&&Number.isFinite(c.lock.at)&&(m==null||c.lock.at>m)) m=c.lock.at; return m; };
// الأسفار اللي تظهر للمخدوم «ككروت» (بنفس ترتيب المدخلات):
//   ١) فيه إصحاح متاح دلوقتي (مفتوح أو محلول، زي bookOpen القديمة)
//   ٢) فيه إصحاح جاي وبدأ قبل كده (فيه إصحاح اتفتح): يظهر مهما كان الميعاد بعيد
//      (v9.511) السفر اللي **لسه ما بدأش** مش كارت خالص لحد ما أول إصحاح فيه يفتح؛ قبلها بيظهر في البانر بـ🔒 بس (bannerLines)
//   ٣) كله منتهي ومحلّش حاجة: يظهر (في القسم المطوي) لو المخدوم حلّ أي حاجة في أي سفر، أو آخر إصحاح اتقفل من أقل من keepDays
export function visibleBooks(books,now,{keepDays=KEEP_DAYS}={}){
  const anySolved=books.some((b)=>b.chapters.some((c)=>c.solved));
  return books.filter((b)=>{
    if(!b.chapters.length) return false;
    if(b.chapters.some((c)=>{ const k=chKind(c); return k==='open'||k==='done'; })) return true;
    if(bookNextOpen(b)) return bookStarted(b);
    const t=closedAt(b);
    return anySolved||(t!=null&&now-t<keepDays*DAY);
  });
}
// (v9.511) سطور البانر «أقرب فتح»: [{id,title,num,at,locked}] مترتبة بالميعاد (والتعادل بترتيب الأسفار ثم رقم الإصحاح)، كل سطر = سفر واحد:
//   • أقرب إصحاح جاي في الأسفار اللي **بدأت** (locked:false)، مهما كان بعيد
//   • الأسفار اللي **لسه ما بدأتش** (locked:true = 🔒): الأقرب بس (لو خلال windowDays)، وأي سفر تاني لو فاضله ≤ hotHours على فتحه؛ ولو سفرين نفس لحظة الأقرب يظهروا الاتنين
export function bannerLines(books,now,{windowDays=WINDOW_DAYS,hotHours=HOT_HOURS}={}){
  const out=[]; let ord=0, started=null; const fresh=[];
  for(const b of books){ const o=ord++; if(!b.chapters.length) continue; const x=bookNextOpen(b); if(!x) continue;
    const r={id:b.id,title:b.title,num:x.num,at:x.at,locked:!bookStarted(b),o};
    if(r.locked) fresh.push(r); else if(!started||r.at<started.at) started=r; }
  if(started) out.push(started);
  fresh.sort((a,b)=>a.at-b.at||a.o-b.o);
  const first=fresh[0];
  if(first&&first.at-now<=windowDays*DAY) for(const r of fresh) if(r===first||r.at===first.at||r.at-now<=hotHours*36e5) out.push(r);
  out.sort((a,b)=>a.at-b.at||a.o-b.o);
  return out.map(({o,...r})=>r);
}
// (v9.513) «دلوقتي جاري»: سطر لكل سفر فيه إصحاح مفتوح ومش محلول (أقل رقم): [{id,title,num,closes}] بترتيب الأسفار. closes = ميعاد قفل الإصحاح (ms) أو null (الشكل adapt: c.closes اختياري)
export function runningLines(books){
  const out=[];
  for(const b of books){ let best=null; for(const c of b.chapters) if(chKind(c)==='open'&&(!best||c.num<best.num)) best=c;
    if(best) out.push({id:b.id,title:b.title,num:best.num,closes:Number.isFinite(best.closes)?best.closes:null}); }
  return out;
}
// (v9.511) بعد كام مللي ثانية يتغيّر اللي بيظهر بسبب حدّ زمني (مش بسبب ميعاد فتح/قفل إصحاح: ده مؤقّت AC.nextChangeIn): دخول سفر لسه ما بدأش نافذة الـ٣٠ يوم أو الـ٢٤ ساعة، وانتهاء الـ٦٠ يوم للسفر المنتهي. null لو مفيش.
export function nextWindowIn(books,now,{windowDays=WINDOW_DAYS,hotHours=HOT_HOURS,keepDays=KEEP_DAYS}={}){
  let best=null; const add=(t)=>{ const d=t-now; if(d>0&&(best==null||d<best)) best=d; };
  for(const b of books){ if(!b.chapters.length) continue; const x=bookNextOpen(b);
    if(x&&!bookStarted(b)){ add(x.at-windowDays*DAY); add(x.at-hotHours*36e5); }
    else if(!x&&bookEnded(b)){ const t=closedAt(b); if(t!=null) add(t+keepDays*DAY); }
    for(const c of b.chapters) if(chKind(c)==='open'&&Number.isFinite(c.closes)) add(c.closes-hotHours*36e5); }   // (v9.513) سطر «بيقفل …» بيظهر لما يفضل ≤ hotHours على القفل
  return best;
}
// أقرب فتح بين الأسفار اللي بتتمرّر (v9.510؛ من v9.511 البانر بقى بـbannerLines، والدالة دي لسه متاحة): {id,title,num,at} أو null. التعادل: الأسبق في الترتيب ثم الأقل رقماً
export function nextOpenAcross(books){
  let best=null;
  for(const b of books){ const x=bookNextOpen(b); if(x&&(!best||x.at<best.at)) best={id:b.id,title:b.title,num:x.num,at:x.at}; }
  return best;
}
// ===== تاريخ بالعربي بتوقيت القاهرة (الجداول بتاعتنا مش toLocaleString عشان الناتج يطلع واحد على أي موبايل) =====
export const TZ='Africa/Cairo';
const DAYS_AR=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const MONTHS_AR=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function partsAt(ts){
  try{
    const o={}; for(const p of new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(new Date(ts))) o[p.type]=p.value;
    const r={y:+o.year,m:+o.month,d:+o.day,h:+o.hour%24,mi:+o.minute};
    if(Object.values(r).every(Number.isFinite)) return r;
  }catch(e){}
  const t=new Date(ts); return {y:t.getFullYear(),m:t.getMonth()+1,d:t.getDate(),h:t.getHours(),mi:t.getMinutes()};   // المتصفح ما بيدعمش المنطقة الزمنية: توقيت الجهاز
}
function pieces(ts,now){
  if(!Number.isFinite(ts)) return null;
  const p=partsAt(ts), n=partsAt(Number.isFinite(now)?now:Date.now()), y=p.y!==n.y?' '+ar(p.y):'';
  const h12=p.h%12===0?12:p.h%12;
  const rel=Math.round((Date.UTC(p.y,p.m-1,p.d)-Date.UTC(n.y,n.m-1,n.d))/DAY);   // (v9.512) فرق الأيام بتاريخ القاهرة (مش بعدد الساعات): ٠ = النهارده، ١ = بكرة
  return {rel,day:DAYS_AR[new Date(Date.UTC(p.y,p.m-1,p.d)).getUTCDay()],date:ar(p.d)+' '+MONTHS_AR[p.m-1]+y,time:ar(h12)+':'+ar(String(p.mi).padStart(2,'0'))+' '+(p.h<12?'ص':'م')};
}
// (v9.512) اليوم بتاريخ القاهرة كرقم (للمقارنة بس)
const dayKey=(ts)=>{ const p=partsAt(ts); return p.y*10000+p.m*100+p.d; };
// (v9.512) بعد كام مللي ثانية يبدأ يوم جديد بتوقيت القاهرة (بحث ثنائي على الدقايق عشان يمشي صح مع تغيير التوقيت الصيفي)، عشان «بكرة» تبقى «النهارده» لوحدها
export function msToNextDay(now){
  const m0=Math.floor(now/6e4), d0=dayKey(m0*6e4); let lo=0, hi=26*60;   // lo = لسه نفس اليوم، hi = يوم تاني
  if(dayKey((m0+hi)*6e4)===d0) return null;
  while(hi-lo>1){ const mid=(lo+hi)>>1; if(dayKey((m0+mid)*6e4)===d0) lo=mid; else hi=mid; }
  return (m0+hi)*6e4-now;
}
// (v9.512) لو فيه أي سفر عليه ميعاد فتح جاي (بيظهر في البانر أو سطر الكارت بـ«النهارده/بكرة»): بعد كام مللي ثانية نعيد الرسم عند بداية اليوم الجاي. null لو مفيش.
export function nextDayChangeIn(books,now){
  return books.some((b)=>b.chapters.length&&((bookNextOpen(b)&&bookNextOpen(b).at>now)||b.chapters.some((c)=>chKind(c)==='open'&&Number.isFinite(c.closes)&&c.closes>now)))?msToNextDay(now):null;   // (v9.513) كمان لو فيه ميعاد قفل جاي (سطر «بيقفل النهارده/بكرة»)
}
// «يوم الأحد ١٥ نوفمبر الساعة ٨:٠٠ م» (السنة بتظهر بس لو غير السنة الحالية)
// (v9.512) لو الميعاد النهارده أو بكرة (بتاريخ القاهرة): «النهارده الساعة ٨:٠٠ م» / «بكرة الساعة ٨:٠٠ م»
export function fmtOpenAr(ts,now){ const x=pieces(ts,now); return !x?'':x.rel===0?'النهارده الساعة '+x.time:x.rel===1?'بكرة الساعة '+x.time:'يوم '+x.day+' '+x.date+' الساعة '+x.time; }
// «الأحد ١٥ نوفمبر ٨:٠٠ م» (للكارت)، و(v9.512) «النهارده ٨:٠٠ م» / «بكرة ٨:٠٠ م»
export function fmtOpenShort(ts,now){ const x=pieces(ts,now); return !x?'':x.rel===0?'النهارده '+x.time:x.rel===1?'بكرة '+x.time:x.day+' '+x.date+' '+x.time; }
// نص البانر (نص عادي: index.js بيعمل esc) ونص سطر الكارت
export const bannerText=(nx,now)=>'⏳ إصحاح '+ar(nx.num)+' من '+(nx.locked?'🔒 ':'')+'«'+nx.title+'» هيفتح '+fmtOpenAr(nx.at,now);   // (v9.511) 🔒 للسفر اللي لسه ما بدأش
// (v9.513) نصوص بانر «دلوقتي جاري»: سطر الجاري، سطر القفل (لو ≤٢٤ ساعة بس: «بيقفل النهارده الساعة …»)، وشريحة «N جاية»
export const runningText=(r)=>'▶️ دلوقتي جاري إصحاح '+ar(r.num)+' من «'+r.title+'»';
export const closeText=(r,now)=>{ if(r.closes==null) return ''; const d=r.closes-now; return d>0&&d<=HOT_HOURS*36e5?'بيقفل '+fmtOpenAr(r.closes,now):''; };
export const chipText=(n)=>n===1?'١ جاي':ar(n)+' جاية';
export const cardLine=(nx,now)=>'⏳ أقرب فتح: إصحاح '+ar(nx.num)+' · '+fmtOpenShort(nx.at,now);
