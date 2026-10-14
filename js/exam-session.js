// حفظ حالة الامتحان الجاري في kv (مفتاح واحد: exam_session) ليكمل المخدوم لو قفل التطبيق.
// تنتهي الجلسة تلقائياً بعد ٦ ساعات من آخر نشاط (تُحسب محاولة بدرجتها الحالية — المنطق في modules/books).
import * as db from './db.js';
export const KEY='exam_session', TTL=6*3600*1000;
export const load=()=>db.get(KEY);
export const save=(s)=>db.set(KEY,{...s,updatedAt:Date.now()});
export const clear=()=>db.del(KEY);
export const expired=(s)=>!!s&&Date.now()-(s.updatedAt||0)>TTL;
