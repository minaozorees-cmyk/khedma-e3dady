// مواعيد فتح/قفل الإصحاحات + أكواد الفتح (v9.21) — المالك فقط.
// الحماية الفعلية: RLS على chapter_access/chapter_codes (الكتابة للمالك فقط). الإصحاح بدون ميعاد = مفتوح دايماً.
import {api,all,errMsg,SB} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
import {n} from '../../js/dates.js';
import {loadAll} from '../../js/books.js';
import {genCode,fmtCode,codeMsg,copyText,shareText,whenText} from '../books/codes.js';

const AP='/rest/v1/chapter_access', CP='/rest/v1/chapter_codes';
const pad=(x)=>String(x).padStart(2,'0');
const toLocal=(iso)=>{ if(!iso) return ''; const d=new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toIso=(s)=>s?new Date(s).toISOString():null;
const q=encodeURIComponent;

export async function mount(el,{role}={}){
  if(role!=='owner'){ el.innerHTML='<div class="ph">هذه الصفحة للمالك فقط.</div>'; return; }
  const S={err:'',ok:'',books:[],acc:[],codes:[],bid:''};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.innerHTML=''; el.appendChild(root);
  const book=()=>S.books.find(b=>b.id===S.bid);
  const $=(s)=>root.querySelector(s);
  const inp=(f,num)=>root.querySelector(`[data-${f}="${num}"]`);
  function paint(){
    const b=book(), am=new Map(S.acc.map(a=>[a.book_id+'|'+a.chapter_num,a])), cm=new Map(S.codes.map(c=>[c.book_id+'|'+c.chapter_num,c]));
    const missing=b?b.chapters.filter(c=>!cm.has(b.id+'|'+c.chapterNum)).length:0;
    root.innerHTML=`${S.err?`<div class="err">${esc(S.err)}</div>`:''}${S.ok?`<div class="hint">${esc(S.ok)}</div>`:''}
      ${!S.books.length?'<div class="ph">لا توجد أسفار. ارفع سفراً من تبويب «إدارة الأسفار» أولاً.</div>':`
      <div class="card2"><b>السفر</b><div class="fld" style="margin-top:8px"><select id="bk">${S.books.map(x=>`<option value="${esc(x.id)}"${x.id===S.bid?' selected':''}>${esc(x.title)}</option>`).join('')}</select></div>
        <p class="hint">الإصحاح اللي ما له ميعاد يفضل مفتوح. المخدوم اللي يفتح بالكود يفضل الإصحاح مفتوح له على جهازه حتى بعد وقت القفل.</p></div>
      <div class="card2"><b>تطبيق ميعاد واحد على كل إصحاحات السفر</b>
        <div class="fld" style="margin-top:8px"><label for="bo">الفتح</label><input type="datetime-local" id="bo"></div>
        <div class="fld"><label for="bc">القفل <small>(اختياري)</small></label><input type="datetime-local" id="bc"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" style="${SB}" data-a="bulk">تطبيق على الكل</button><button class="x" data-a="clearall">مسح مواعيد السفر</button></div></div>
      <div class="card2"><b>الإصحاحات (${n(b.chapters.length)})</b>
        <div style="margin:8px 0"><button class="btn sec" style="${SB}" data-a="genmissing"${missing?'':' disabled'}>🔑 توليد كود لكل إصحاح ناقص (${n(missing)})</button></div>
        ${b.chapters.map(c=>{ const k=b.id+'|'+c.chapterNum, a=am.get(k), cd=cm.get(k), N=c.chapterNum;
          return `<div class="row" style="display:block"><div><b>إصحاح ${n(N)}</b> <span class="badge ${a?'off':'on'}">${esc(whenText(a))}</span></div>
          <div class="fld" style="margin-top:8px"><label>يفتح</label><input type="datetime-local" data-o="${N}" value="${toLocal(a&&a.opens_at)}"></div>
          <div class="fld"><label>يقفل <small>(اختياري)</small></label><input type="datetime-local" data-c="${N}" value="${toLocal(a&&a.closes_at)}"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" style="${SB}" data-a="save" data-n="${N}">حفظ الميعاد</button>${a?`<button class="x" data-a="clear" data-n="${N}">مسح الميعاد</button>`:''}</div>
          <div style="margin-top:10px">${cd?`<span dir="ltr" style="font-family:monospace;font-weight:700;letter-spacing:2px">${esc(fmtCode(cd.code))}</span>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn sec" style="${SB}" data-a="copy" data-n="${N}">📋 نسخ</button><button class="btn sec" style="${SB}" data-a="send" data-n="${N}">📤 إرسال</button><button class="btn sec" style="${SB}" data-a="gen" data-n="${N}">🔄 كود جديد</button><button class="x" data-a="revoke" data-n="${N}">إلغاء الكود</button></div>`
            :`<button class="btn sec" style="${SB}" data-a="gen" data-n="${N}">🔑 توليد كود</button>`}</div></div>`; }).join('')}</div>`}
      <button class="btn sec" data-a="reload">تحديث</button>`;
  }
  async function load(){
    try{
      const [bk,acc,codes]=await Promise.all([loadAll(),all(`${AP}?select=*&order=book_id,chapter_num`),all(`${CP}?select=*&order=book_id,chapter_num`)]);
      S.books=bk.books; S.acc=acc; S.codes=codes; S.err='';
      if(!S.books.some(b=>b.id===S.bid)) S.bid=S.books[0]?S.books[0].id:'';
    }catch(e){ S.err=errMsg(e); }
    paint();
  }
  const upsert=(path,body)=>api(`${path}?on_conflict=book_id,chapter_num`,{method:'POST',body,prefer:'resolution=merge-duplicates,return=minimal'});
  const chk=(o,c)=>{ if(!o&&!c) return 'اكتب ميعاد الفتح أو القفل.'; if(o&&c&&new Date(c)<=new Date(o)) return 'ميعاد القفل لازم يكون بعد ميعاد الفتح.'; return ''; };
  root.addEventListener('change',(e)=>{ if(e.target.id==='bk'){ S.bid=e.target.value; S.ok=''; S.err=''; paint(); } });
  root.addEventListener('click',async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a, N=Number(t.dataset.n), b=book(); S.ok='';
    const cd=b&&S.codes.find(c=>c.book_id===b.id&&c.chapter_num===N);
    try{
      if(a==='reload'){ S.err=''; await load(); return; }
      if(!b) return;
      if(a==='send'){ if(cd) shareText(codeMsg(b.title,N,cd.code)); return; }
      if(a==='copy'){ if(cd){ const ok=await copyText(codeMsg(b.title,N,cd.code)); S.ok=ok?'تم نسخ الكود ✅':''; S.err=ok?'':'تعذّر النسخ، انسخه يدوياً.'; paint(); } return; }
      if(a==='save'){
        const o=inp('o',N).value, c=inp('c',N).value, m=chk(o,c);
        if(!o&&!c){ if(!S.acc.some(x=>x.book_id===b.id&&x.chapter_num===N)){ S.err=m; paint(); return; } if(!confirm('الخانتين فاضيتين: ده هيمسح الميعاد ويرجّع الإصحاح مفتوح. متأكد؟')) return; t.disabled=true; await api(`${AP}?book_id=eq.${q(b.id)}&chapter_num=eq.${N}`,{method:'DELETE',prefer:'return=minimal'}); S.ok='اتمسح الميعاد، الإصحاح مفتوح.'; await load(); return; }
        if(m){ S.err=m; paint(); return; }
        t.disabled=true; await upsert(AP,[{book_id:b.id,chapter_num:N,opens_at:toIso(o),closes_at:toIso(c),updated_at:new Date().toISOString()}]); S.ok=`اتحفظ ميعاد إصحاح ${n(N)} ✅`; S.err=''; await load();
      }
      else if(a==='clear'){ if(!confirm('مسح الميعاد؟ الإصحاح هيرجع مفتوح.')) return; t.disabled=true; await api(`${AP}?book_id=eq.${q(b.id)}&chapter_num=eq.${N}`,{method:'DELETE',prefer:'return=minimal'}); S.ok='اتمسح الميعاد.'; S.err=''; await load(); }
      else if(a==='bulk'){
        const o=$('#bo').value, c=$('#bc').value, m=chk(o,c); if(m){ S.err=m; paint(); return; }
        if(!confirm(`تطبيق الميعاد على ${n(b.chapters.length)} إصحاح؟ المواعيد الحالية هتتبدّل.`)) return;
        t.disabled=true; const now=new Date().toISOString();
        await upsert(AP,b.chapters.map(x=>({book_id:b.id,chapter_num:x.chapterNum,opens_at:toIso(o),closes_at:toIso(c),updated_at:now}))); S.ok='اتطبّق الميعاد على كل الإصحاحات ✅'; S.err=''; await load();
      }
      else if(a==='clearall'){ if(!confirm('مسح مواعيد كل إصحاحات السفر؟ كلها هترجع مفتوحة.')) return; t.disabled=true; await api(`${AP}?book_id=eq.${q(b.id)}`,{method:'DELETE',prefer:'return=minimal'}); S.ok='اتمسحت مواعيد السفر.'; S.err=''; await load(); }
      else if(a==='gen'){
        if(cd&&!confirm('الكود القديم هيبطل فوراً. توليد كود جديد؟')) return;
        t.disabled=true; await upsert(CP,[{book_id:b.id,chapter_num:N,code:genCode(),created_at:new Date().toISOString()}]); S.ok=`اتولّد كود إصحاح ${n(N)} ✅`; S.err=''; await load();
      }
      else if(a==='genmissing'){
        const have=new Set(S.codes.filter(c=>c.book_id===b.id).map(c=>c.chapter_num)), now=new Date().toISOString();
        const body=b.chapters.filter(x=>!have.has(x.chapterNum)).map(x=>({book_id:b.id,chapter_num:x.chapterNum,code:genCode(),created_at:now}));
        if(!body.length) return; t.disabled=true; await upsert(CP,body); S.ok=`اتولّد ${n(body.length)} كود ✅`; S.err=''; await load();
      }
      else if(a==='revoke'){ if(!confirm('إلغاء الكود؟ ما حدش هيقدر يفتح بيه تاني (اللي فتح بيه قبل كده يفضل مفتوح له).')) return; t.disabled=true; await api(`${CP}?book_id=eq.${q(b.id)}&chapter_num=eq.${N}`,{method:'DELETE',prefer:'return=minimal'}); S.ok='اتلغى الكود.'; S.err=''; await load(); }
    }catch(x){ S.err=errMsg(x); paint(); }
  });
  await load();
}
