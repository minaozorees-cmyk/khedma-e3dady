import * as db from './db.js';
// يحفظ ويسجّل أول وقت بيانات، ثم يُبلغ الواجهة (لتحديث التذكيرات)
export async function save(k,v){
  await db.set(k,v);
  if(!(await db.get('dataSince'))) await db.set('dataSince',Date.now());
  dispatchEvent(new Event('lawha:data'));
}
