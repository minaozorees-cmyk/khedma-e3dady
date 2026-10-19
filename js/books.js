// (v7) المصدر: السيرفر (جدول books) ← كاش محلي (لو أوفلاين/فشل) ← ملفات books/*.json المحلية (لو السيرفر فاضي أو معطّل).
// صيغة الملفات المحلية في books/index.json:  {"books":[{"id":"judith","title":"يهوديت","readMinutes":3,"files":["judith.json"]}]}
// الملف قد يحوي عدة إصحاحات أو إصحاحاً واحداً؛ ملفات السفر الواحد تُدمج (الأحدث يغلب عند تكرار الرقم).
import {normalizeFile} from './book-schema.js';
import * as db from './db.js';
import * as SY from './sync.js';
import * as LIB from './library.js';
const FILE_RE=/^[\w\-.\u0600-\u06FF]+\.json$/;
const clampMin=(rm)=>{ rm=rm==null||rm===''?NaN:Number(rm); return Number.isFinite(rm)&&rm>=0?Math.min(rm,60):3; }; // دقائق القراءة قبل الامتحان: افتراضي ٣، و٠ = بلا انتظار
const clampQ=(q)=>{ q=Number(q); return Number.isFinite(q)&&q>0?Math.min(Math.floor(q),200):0; }; // (v9.38) عدد أسئلة الامتحان العشوائية من البنك: ٠ = كل الأسئلة
// يبني قائمة الأسفار من إدخالات {id:{title,rm,chapters}} (chapters بالصيغة الخام: chapterNum/chapter/meditation/questions) ويعيد فحصها كأي ملف
function build(entries,label){
  const books=[], problems=[];
  for(const id of Object.keys(entries).sort()){
    const e=entries[id]||{}, lib=LIB.ID_RE.test(String(e.lib||''))?String(e.lib):'', n=normalizeFile({book:e.title,chapters:e.chapters},{lib:!!lib});
    n.problems.forEach(msg=>problems.push({file:label+id,msg}));
    if(n.chapters.length) books.push({id,title:String(e.title||n.book||id),readMinutes:clampMin(e.rm),qn:clampQ(e.qn),lib,chapters:n.chapters.sort((a,c)=>a.chapterNum-c.chapterNum)});
  }
  return {books,problems};
}
// null = السيرفر غير متاح. نحدّث الكاش بالأسفار التي تغيّر updated_at فقط.
async function fromServer(){
  const list=await SY.booksList(); if(!Array.isArray(list)) return null;
  const old=(await db.get('booksCache'))||{}, fresh={};
  for(const row of list){
    const id=String(row&&row.id||''); if(!id) continue;
    const c=old[id];
    if(c&&c.u===row.updated_at){ fresh[id]=c; continue; }
    const d=await SY.booksGet(id);
    if(d&&Array.isArray(d.chapters)) fresh[id]={u:row.updated_at,title:row.title,rm:row.read_minutes,chapters:d.chapters,lib:d.lib||'',qn:d.qn||0};
    else if(c) fresh[id]=c; // فشل التحميل: نبقي النسخة القديمة
  }
  if(!list.length) await db.del('booksCache'); else await db.set('booksCache',fresh);
  return build(fresh,'السيرفر/');
}
async function fromCache(){ const c=await db.get('booksCache'); return c&&Object.keys(c).length?build(c,'الكاش/'):null; }
export async function loadAll(){
  const srv=await fromServer();
  if(srv&&srv.books.length) return srv;
  if(!srv){ const c=await fromCache(); if(c&&c.books.length) return c; }
  return fromLocal();
}
async function fromLocal(){
  const problems=[]; let idx;
  try{ const r=await fetch('books/index.json'); if(!r.ok) throw 0; idx=await r.json(); }
  catch(e){ return {books:[],problems:[{file:'books/index.json',msg:'تعذّر قراءة الفهرس'}]}; }
  const list=Array.isArray(idx&&idx.books)?idx.books:[], books=[];
  for(const b of list){
    const id=String((b&&b.id)||''), files=Array.isArray(b&&b.files)?b.files:(b&&b.file?[b.file]:[]);
    if(!id||!files.length){ problems.push({file:id||'?',msg:'تعريف السفر ناقص (id و files)'}); continue; }
    const byNum=new Map(); let title=String(b.title||'');
    for(const f of files){
      if(typeof f!=='string'||!FILE_RE.test(f)){ problems.push({file:String(f),msg:'اسم ملف غير مسموح'}); continue; }
      let raw; try{ const r=await fetch('books/'+encodeURIComponent(f)); if(!r.ok) throw 0; raw=await r.json(); }
      catch(e){ problems.push({file:f,msg:'تعذّر تحميل الملف أو قراءته'}); continue; }
      const n=normalizeFile(raw); n.problems.forEach(msg=>problems.push({file:f,msg}));
      if(!title) title=n.book; n.chapters.forEach(c=>byNum.set(c.chapterNum,c));
    }
    const readMinutes=clampMin(b.readMinutes), qn=clampQ(b.qCount);   // qCount اختياري في books/index.json
    if(byNum.size) books.push({id,title:title||id,readMinutes,qn,chapters:[...byNum.values()].sort((a,c)=>a.chapterNum-c.chapterNum)});
  }
  return {books,problems};
}
// (v9.25) بعد حذف سفر من السيرفر: يشيله من الكاش المحلي فوراً (باقي الأجهزة بيتشال منها عند أول فتح أونلاين لأن fromServer بيبني الكاش من قايمة السيرفر).
export async function dropFromCache(id){
  try{ const c=await db.get('booksCache'); if(!c||!(id in c)) return; delete c[id]; if(Object.keys(c).length) await db.set('booksCache',c); else await db.del('booksCache'); }catch(e){}
}
// يُستدعى والنت متاح لتخزين الأسفار للأوفلاين (عبر الـService Worker)
// (v9.26) ويسخّن كاش نصوص المكتبة للأسفار المربوطة بها (عشان الامتحان يشتغل أوفلاين)
export const prefetch=()=>loadAll().then(r=>{ for(const b of r.books) if(b.lib) LIB.warm(b.lib); }).catch(()=>{});
// (v9.26) إصحاح أسئلته فقط (needsText): يسحب نصه من المكتبة عند القراءة. يرجع false لو تعذّر (أوفلاين ولسه ما اتحمّلش).
export async function ensureText(b,c){
  if(!c.needsText||c.sections.length) return true;
  try{ const s=await LIB.chapterSections(b.lib,c.chapterNum); if(!s) return false; c.sections=s; return true; }catch(e){ return false; }
}
