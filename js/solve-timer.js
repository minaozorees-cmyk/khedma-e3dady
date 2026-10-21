// (v9.481) وقت الحل الفعلي: يعدّ فقط وهو على شاشة الأسئلة وظاهر. منطق نقي بلا DOM (قابل للاختبار بـNode).
// الزمن بالمللي ثانية من performance.now() (مش ساعة الموبايل). كل نبضة (tick) بتضيف الفرق من آخر نبضة بحدّ أقصى MAX_GAP،
// فلو الجهاز نام/الصفحة اتجمّدت من غير ما نعرف، ما يتحسبش وقت وهمي.
export const MAX_GAP=2500, MAX_SEC=86400;   // MAX_SEC = حدّ السيرفر لـduration_sec (٠–٨٦٤٠٠)
const AR='٠١٢٣٤٥٦٧٨٩';
const ar=(x)=>String(x).replace(/\d/g,d=>AR[d]);
const sane=(v)=>Number.isFinite(v)&&v>=0&&v<=MAX_SEC?v:0;
// el = ثواني مجمّعة (ممكن كسور)، last = وقت آخر نبضة (ms) أو null لو واقف
export const create=(el0=0)=>({el:sane(Number(el0)),last:null});
export const running=(t)=>t.last!=null;
export function tick(t,now){
  if(t.last==null) return t.el;
  const gap=Math.min(MAX_GAP,Math.max(0,now-t.last));
  t.el=Math.min(MAX_SEC,t.el+gap/1000); t.last=now; return t.el;
}
export function resume(t,now){ if(t.last==null) t.last=now; return t; }
export function pause(t,now){ tick(t,now); t.last=null; return t; }
// الرقم المحفوظ في الجلسة (عشر ثانية كفاية)
export const snap=(t,now)=>Math.round(tick(t,now)*10)/10;
// ما يتسجّلش أقل من ١ ثانية، ولا أكتر من حدّ السيرفر
export const toDuration=(el)=>{ const v=Number(el), r=Math.round(Number.isFinite(v)?Math.min(MAX_SEC,Math.max(0,v)):0); return r<1?1:r; };
// صيغة العدّاد: ٥ ، ١:٠٥ ، ١:٠٥:٠٠ (يبدأ من ١)
export function clock(el){
  const s=Math.max(1,Math.floor(sane(Number(el)))), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), x=s%60, p=(v)=>String(v).padStart(2,'0');
  return ar(h?`${h}:${p(m)}:${p(x)}`:s>=60?`${m}:${p(x)}`:s);
}
// صيغة شاشة النتيجة: ٣ د ٤٢ ث — أو «—» لو مجهول
export function text(sec){
  const s=Math.round(Number(sec)); if(!Number.isFinite(s)||s<=0) return '—';
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), x=s%60;
  return ar(h?`${h} س ${m} د`:m?`${m} د ${x} ث`:`${x} ث`);
}
