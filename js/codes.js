// أكواد فتح الإصحاحات (v9.21) — للخادم والكاهن والمالك: عرض ونسخ وإرسال فقط. التوليد والإلغاء من المالك (إدارة مواعيد الإصحاحات).
// الحماية الفعلية: RLS على chapter_codes (الطاقم يقرأ، المالك يكتب، المخدوم لا يرى شيئاً).
import {all,errMsg,fmt} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
import {n} from '../../js/dates.js';
import {loadAll} from '../../js/books.js';

const ALPHA='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ٣٢ حرف بدون المتشابه (O/0 وI/1) → ٨ خانات = ٤٠ بت عشوائية
export function genCode(){ const b=new Uint8Array(8); crypto.getRandomValues(b); return [...b].map(x=>ALPHA[x%32]).join(''); }
export const fmtCode=(c)=>c?String(c).slice(0,4)+'-'+String(c).slice(4):'';
export const codeMsg=(title,num,code)=>`كود فتح ${title} — إصحاح ${n(num)}:\n${fmtCode(code)}\nاكتبه في خانة الكود في شاشة الإصحاح بالتطبيق.`;
export async function copyText(t){
  try{ await navigator.clipboard.writeText(t); return true; }
  catch(e){ try{ const a=document.createElement('textarea'); a.value=t; a.style.cssText='position:fixed;opacity:0'; document.body.appendChild(a); a.select(); const ok=document.execCommand('copy'); a.remove(); return ok; }catch(x){ return false; } }
}
// نافذة المشاركة لو متاحة، وإلا واتساب بالنص. لازم تتنادى مباشرة من ضغطة (بدون await قبلها).
export function shareText(t){
  if(navigator.share){ return navigator.share({text:t}).then(()=>true,(e)=>{ if(e&&e.name==='AbortError') return true; window.open('https://wa.me/?text='+encodeURIComponent(t),'_blank','noopener'); return true; }); }
  window.open('https://wa.me/?text='+encodeURIComponent(t),'_blank','noopener'); return Promise.resolve(true);
}
const D=(t)=>new Date(t).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'});
// وصف الجدول للطاقم (بساعة الجهاز)
export function whenText(a){
  if(!a) return 'مفتوح دايماً';
  const t=Date.now(), o=a.opens_at?Date.parse(a.opens_at):null, c=a.closes_at?Date.parse(a.closes_at):null;
  if(o!=null&&t<o) return 'يفتح '+D(o)+(c!=null?' · ويقفل '+D(c):'');
  if(c!=null&&t>=c) return 'اتقفل '+D(c);
  return 'مفتوح الآن'+(c!=null?' · يقفل '+D(c):'');
}

export async function mount(el,{role}={}){
  if(role==='student'){ el.innerHTML='<div class="ph">هذه الصفحة للطاقم فقط.</div>'; return; }
  const S={err:'',ok:'',books:[],codes:[],acc:[]};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.innerHTML=''; el.appendChild(root);
  function paint(){
    const cm=new Map(S.codes.map(c=>[c.book_id+'|'+c.chapter_num,c])), am=new Map(S.acc.map(a=>[a.book_id+'|'+a.chapter_num,a]));
    const items=S.books.map(b=>({b,list:b.chapters.filter(c=>cm.has(b.id+'|'+c.chapterNum))})).filter(x=>x.list.length);
    root.innerHTML=`${S.err?`<div class="err">${esc(S.err)}</div>`:''}${S.ok?`<div class="hint">${esc(S.ok)}</div>`:''}
      <div class="hint">كل كود صالح لأي مخدوم لفتح إصحاحه. انسخه أو ابعته للمخدومين (واتساب أو أي تطبيق).</div>
      ${items.length?items.map(({b,list})=>`<div class="card2"><b>${esc(b.title)}</b>${list.map(c=>{ const k=b.id+'|'+c.chapterNum, cd=cm.get(k);
        return `<div class="row" style="display:block"><div><b>إصحاح ${n(c.chapterNum)}</b> <span dir="ltr" style="font-family:monospace;font-weight:700;letter-spacing:2px;margin-inline-start:8px">${esc(fmtCode(cd.code))}</span></div>
          <div class="k">${esc(whenText(am.get(k)))}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn sec" style="width:auto;min-height:36px;margin:0;padding:6px 14px;font-size:.85rem" data-a="copy" data-k="${esc(k)}">📋 نسخ</button><button class="btn sec" style="width:auto;min-height:36px;margin:0;padding:6px 14px;font-size:.85rem" data-a="send" data-k="${esc(k)}">📤 إرسال</button></div></div>`; }).join('')}</div>`).join('')
      :'<div class="ph">🔑 لسه مفيش أكواد. المالك بيولّدها من تبويب «مواعيد الإصحاحات».</div>'}
      <button class="btn sec" data-a="reload">تحديث</button>`;
  }
  const find=(k)=>{ const [bid,num]=[k.slice(0,k.lastIndexOf('|')),Number(k.slice(k.lastIndexOf('|')+1))]; const b=S.books.find(x=>x.id===bid), c=S.codes.find(x=>x.book_id===bid&&x.chapter_num===num); return b&&c?{b,c}:null; };
  async function load(){
    try{
      const [bk,codes,acc]=await Promise.all([loadAll(),all('/rest/v1/chapter_codes?select=*&order=book_id,chapter_num'),all('/rest/v1/chapter_access?select=*&order=book_id,chapter_num')]);
      S.books=bk.books; S.codes=codes; S.acc=acc; S.err='';
    }catch(e){ S.err=errMsg(e); }
    paint();
  }
  root.addEventListener('click',(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='reload'){ S.ok=''; load(); return; }
    const f=find(t.dataset.k||''); if(!f) return; const msg=codeMsg(f.b.title,f.c.chapter_num,f.c.code);
    if(a==='send'){ shareText(msg); return; }
    if(a==='copy') copyText(msg).then(ok=>{ S.ok=ok?'تم نسخ الكود ✅':'تعذّر النسخ، انسخه يدوياً.'; S.err=''; paint(); });
  });
  await load();
}
