// (v9.26) المكتبة: نصوص الأسفار والأجبية كملفات ثابتة في bible/*.json.
// تُحمَّل عند الطلب فقط (lazy) ويخزّنها الـService Worker في كاش مستقل للأوفلاين.
import * as db from './db.js';
const memo=new Map();
export const ID_RE=/^[a-z0-9]{2,12}$/;   // معرّفات المكتبة: gen, psa, cor1 …
function getJSON(path){
  if(memo.has(path)) return memo.get(path);
  const p=fetch(path).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }).catch(e=>{ memo.delete(path); throw e; });
  memo.set(path,p); return p;
}
// فهرس المكتبة: [{id,title,testament:'ot'|'nt',chapters:N,file}]
export const index=()=>getJSON('bible/index.json').then(j=>Array.isArray(j&&j.books)?j.books:[]);
// سفر كامل: {id,title,testament,chapters:[{n,verses:[[رقم,نص]]}]}
export const book=(id)=>ID_RE.test(String(id))?getJSON('bible/'+id+'.json'):Promise.reject(new Error('معرّف غير صالح'));
export const agpeya=()=>getJSON('bible/agpeya.json');
// تسخين الكاش: يحمّل السفر في الخلفية (بدون أخطاء) عشان يشتغل أوفلاين
export const warm=(id)=>book(id).then(()=>true,()=>false);
// نص إصحاح بصيغة أقسام الامتحان [{title,imgCap,verses:[[رقم,نص]]}] أو null لو الإصحاح غير موجود
export async function chapterSections(libId,num){
  const b=await book(libId), c=(b.chapters||[]).find(x=>Number(x.n)===Number(num));
  if(!c||!Array.isArray(c.verses)||!c.verses.length) return null;
  return [{title:'',imgCap:'',verses:c.verses.map(v=>[String(v[0]),String(v[1])])}];
}
// حجم الخط المشترك للقراءة (مخزّن على الجهاز)
export const FONT={min:1,max:1.9,step:.15,def:1.2};
export async function getFont(){ try{ const v=Number(await db.get('readFont')); return v>=FONT.min&&v<=FONT.max?v:FONT.def; }catch(e){ return FONT.def; } }
export async function setFont(v){ try{ await db.set('readFont',v); }catch(e){} }
export async function getLast(){ try{ return (await db.get('libLast'))||null; }catch(e){ return null; } }
export async function setLast(v){ try{ await db.set('libLast',v); }catch(e){} }
