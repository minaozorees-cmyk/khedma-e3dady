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
