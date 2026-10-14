// تذكيرات داخلية (المرحلة ٤ب). نص إشعار الجهاز عام عمداً ("تذكير من التطبيق") حفاظاً على الخصوصية.
import * as db from './db.js';
import * as D from './dates.js';
export function confessionNext(C){
  const ks=Object.keys((C&&C.entries)||{}).sort(), last=ks[ks.length-1]||null;
  const iv=(C&&C.interval)||40, ov=C&&C.nextOverride;
  let next=null;
  if(ov && (!last || ov>last)) next=ov; else if(last) next=D.addDays(last,iv);
  return {last,next};
}
export async function collect(){
  const st=(await db.get('settings'))||{}; if(st.remind===false) return [];
  const out=[], today=D.key();
  const C=await db.get('confession');
  if(C){ const {next}=confessionNext(C);
    if(next){ const left=D.diffDays(today,next);
      if(left<=3) out.push({id:'confession',module:'confession',text:left<0?`تأخر موعد الاعتراف ${D.n(-left)} يوم`:left===0?'اليوم موعد الاعتراف':`باقي ${D.n(left)} يوم على موعد الاعتراف`}); } }
  const since=await db.get('dataSince'), lb=await db.get('lastBackup');
  if(since && Date.now()-(lb||since)>14*864e5) out.push({id:'backup',module:'me',text:'حان وقت حفظ نسخة احتياطية من سجلاتك'});
  return out;
}
export async function notifyLocal(list){
  try{
    if(typeof Notification==='undefined'||Notification.permission!=='granted'||!list.length) return;
    const today=D.key(); if((await db.get('notifiedDay'))===today) return;
    const reg=await navigator.serviceWorker.ready;
    await reg.showNotification('تذكير من التطبيق',{body:'افتح التطبيق لمراجعة التذكيرات',tag:'lawha',icon:new URL('../icons/icon-192.png',import.meta.url).href});
    await db.set('notifiedDay',today);
  }catch(e){}
}
