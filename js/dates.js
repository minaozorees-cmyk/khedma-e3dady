// كل التواريخ بالتوقيت المحلي وبصيغة YYYY-MM-DD
export const pad=(n)=>String(n).padStart(2,'0');
export const key=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export const parse=(k)=>{ const [y,m,d]=k.split('-').map(Number); return new Date(y,m-1,d); };
export const addDays=(k,n)=>{ const d=parse(k); d.setDate(d.getDate()+n); return key(d); };
export const diffDays=(a,b)=>Math.round((parse(b)-parse(a))/864e5);
export const isKey=(s)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&key(parse(s))===s;
export const fmt=(k,o={weekday:'long',day:'numeric',month:'long'})=>parse(k).toLocaleDateString('ar-EG',o);
export const n=(x)=>Number(x).toLocaleString('ar-EG');
export const isSunday=(k)=>parse(k).getDay()===0;
export const monthRange=(ym)=>{ const [y,m]=ym.split('-').map(Number); return [key(new Date(y,m-1,1)),key(new Date(y,m,0))]; };
export const addMonth=(ym,d)=>{ const [y,m]=ym.split('-').map(Number); const x=new Date(y,m-1+d,1); return `${x.getFullYear()}-${pad(x.getMonth()+1)}`; };
// (v9.41) جدولة تلقائية: إصحاح كل يوم بنفس الساعة، بلا أيام راحة. توقيت الجهاز، ويُحسب كل يوم على حدة (تغيير التوقيت الصيفي).
// قفل أصغر من الفتح = اليوم التالي. يرجع [{o,c}] بصيغة datetime-local (YYYY-MM-DDTHH:MM) أو {err}.
export const dtLocal=(d)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function autoSchedule(dateKey,openT,closeT,count){
  if(!isKey(dateKey)||!/^\d{2}:\d{2}$/.test(openT||'')||!/^\d{2}:\d{2}$/.test(closeT||'')) return {err:'اكمل التاريخ وساعتي الفتح والقفل.'};
  if(openT===closeT) return {err:'الفتح والقفل في نفس اللحظة. غيّر إحدى الساعتين.'};
  const [y,m,d]=dateKey.split('-').map(Number), [oh,om]=openT.split(':').map(Number), [ch,cm]=closeT.split(':').map(Number);
  const next=(ch*60+cm)<(oh*60+om)?1:0, out=[];
  for(let i=0;i<count;i++) out.push({o:dtLocal(new Date(y,m-1,d+i,oh,om)),c:dtLocal(new Date(y,m-1,d+i+next,ch,cm))});
  return {rows:out};
}
