// (v9.493) تخزين دائم + كشف آيفون: بيقلل ضياع حساب المخدوم على Safari.
// - على الآيفون تطبيق «الشاشة الرئيسية» تخزينه منفصل عن Safari، فمخدوم يسجّل من Safari ثم يثبّت التطبيق يلاقيه فاضي ويسجّل تاني (حسابين).
// - navigator.storage.persist() بيطلب من المتصفح ما يمسحش البيانات (best-effort، على iOS من غير نافذة).
const NAV=()=>(typeof navigator!=='undefined'?navigator:{}), WIN=()=>(typeof window!=='undefined'?window:{});
export const isIOS=(nav=NAV())=>/iPad|iPhone|iPod/.test(nav.userAgent||'')||(nav.platform==='MacIntel'&&(nav.maxTouchPoints||0)>1);
export const isStandalone=(nav=NAV(),win=WIN())=>nav.standalone===true||!!(win.matchMedia&&win.matchMedia('(display-mode: standalone)').matches);
// آيفون + مفتوح من Safari (مش من أيقونة الشاشة الرئيسية)
export const needsInstall=(nav=NAV(),win=WIN())=>isIOS(nav)&&!isStandalone(nav,win);
export async function askPersist(nav=NAV()){
  try{ const s=nav.storage; if(!s||!s.persist) return null; if(s.persisted&&await s.persisted()) return true; return await s.persist(); }catch(e){ return null; }
}
