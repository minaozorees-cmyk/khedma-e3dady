// نتائج المحاولات محلياً (إضافة فقط). كل المحاولات تُسجل؛ المعتمدة في اللوحة والترتيب = أول محاولة.
// attemptNo يُحسب من محاولات نفس (bookId, chapterNum, profileId). المخدوم المسجّل: مهمة result.create تُضاف للطابور (id فقط).
import * as db from './db.js';
import * as A from './auth.js';
// v6: نتائج الخادم/المالك التجريبية تُسجَّل تحت هوية 'staff' محلية فقط: لا تختلط بملف مخدوم على نفس الجهاز ولا تُرفع
const identity=async()=>{ if((await A.getRole())!=='student') return {p:null,pid:'staff',student:false}; const p=await A.activeProfile(); return {p,pid:p?p.id:'local',student:true}; };
const mine=(a,pid)=>!a.profileId||a.profileId===pid||a.profileId==='local'; // محاولات v4 بلا profileId تُعتبر لصاحب الجهاز
export async function record({bookId,chapterNum,score,total,source='finish',answered=null,durationSec=null}){
  const R=(await db.get('results'))||{attempts:[]};
  const {p,pid,student}=await identity();
  const attemptNo=R.attempts.filter(x=>x.bookId===bookId&&x.chapterNum===chapterNum&&mine(x,pid)).length+1;
  const a={id:crypto.randomUUID(),profileId:pid,bookId,chapterNum,attemptNo,score,total,source,answered,durationSec,at:Date.now()};
  R.attempts.push(a); await db.set('results',R);
  if(student&&p) await db.queue({type:'result.create',attemptId:a.id,profileId:p.id,attemptNo});
  return a;
}
export async function all(){
  const {pid}=await identity();
  return ((await db.get('results'))||{attempts:[]}).attempts.filter(a=>mine(a,pid));
}
// n = عدد المحاولات، first = أول محاولة (الأقدم) وهي المعتمدة
export function summary(attempts,bookId,chapterNum){
  const xs=attempts.filter(a=>a.bookId===bookId&&a.chapterNum===chapterNum).sort((a,b)=>a.at-b.at);
  if(!xs.length) return {n:0,first:null};
  return {n:xs.length,first:{score:xs[0].score,total:xs[0].total,at:xs[0].at}};
}
