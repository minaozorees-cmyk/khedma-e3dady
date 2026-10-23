// (v9.489) جلسة القراءة قبل الامتحان: وقت القراءة المجمّع لكل إصحاح، يتحفظ في مفتاح مستقل (read_session) غير exam_session.
// ليه مستقل؟ exam_session معناه «امتحان مفتوح»: لو اتحط فيه وقت القراءة كان هيظهر كارت «كمّل الامتحان» ويتسجّل محاولة وهمية عند الانتهاء.
// الشكل: {items:{'<bid>|<num>':{first,el,done,upd}}} — first = أول فتح (ms)، el = ثواني القراءة الفعلية (من solve-timer)، done = خلّص القراءة.
// الجلسة تنتهي بعد ٦ ساعات من أول فتح (first): بعدها الإصحاح يبدأ من الأول بدون أي محاولة. المنطق النقي تحت قابل للاختبار بـNode.
import * as db from './db.js';
export const KEY='read_session', TTL=6*3600*1000;
const k=(bid,num)=>bid+'|'+num;
// صالحة: فيها first رقم، ومش في المستقبل (لو الساعة اتغيّرت للخلف نعتبرها منتهية)، ومر عليها ≤ ٦ ساعات
export const fresh=(it,now)=>!!it&&Number.isFinite(it.first)&&now>=it.first&&now-it.first<=TTL;
export function prune(map,now){ const o={}; for(const x in (map||{})) if(fresh(map[x],now)) o[x]=map[x]; return o; }
export const get=(map,bid,num,now)=>{ const it=map&&map[k(bid,num)]; return fresh(it,now)?it:null; };
// يبدأ جلسة جديدة للإصحاح (تستبدل أي جلسة منتهية) ويرجّع الخريطة المحدّثة
export function start(map,bid,num,now){ return {...map,[k(bid,num)]:{first:now,el:0,done:false,upd:now}}; }
// يحدّث جلسة موجودة وصالحة فقط (ما بيعملش جلسة جديدة ولا بيجدد first)
export function update(map,bid,num,patch,now){
  const it=get(map,bid,num,now); if(!it) return map;
  const el=Number.isFinite(patch.el)&&patch.el>=0?patch.el:it.el;
  return {...map,[k(bid,num)]:{first:it.first,el:Math.max(it.el,el),done:!!(patch.done||it.done),upd:now}};   // الوقت ما يرجعش لورا
}
export const load=async()=>prune(((await db.get(KEY))||{}).items,Date.now());
export const save=(map)=>db.set(KEY,{items:map});
export const clear=()=>db.del(KEY);
