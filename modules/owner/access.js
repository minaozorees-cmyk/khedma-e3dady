// مواعيد فتح/قفل الإصحاحات + أكواد الفتح (v9.21) — المالك فقط.
// (v9.47) الحفظ بقى واضح: حالة جنب كل زرار + إشعار ثابت، تحقق من السيرفر بعد الحفظ، والتوقيت = توقيت القاهرة صراحةً (مش توقيت الجهاز).
// الحماية الفعلية: RLS على chapter_access/chapter_codes (الكتابة للمالك فقط). الإصحاح بدون ميعاد = مفتوح دايماً.
import {api,all,errMsg,SB} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
import {n,key,addDays,autoSchedule} from '../../js/dates.js';
import {loadAll} from '../../js/books.js';
import {genCode,fmtCode,codeMsg,copyText,shareText} from '../books/codes.js';

const AP='/rest/v1/chapter_access', CP='/rest/v1/chapter_codes';
const pad=(x)=>String(x).padStart(2,'0');
// (v9.47) كل المواعيد بتوقيت القاهرة (UTC+2 شتاءً / UTC+3 صيفاً تلقائياً) بغض النظر عن توقيت جهاز المالك. السيرفر بيخزّن UTC.
const TZ='Africa/Cairo';
const TZF=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const tzParts=(ms)=>Object.fromEntries(TZF.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
const tzOff=(ms)=>{ ms=Math.floor(ms/1000)*1000; const p=tzParts(ms); return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-ms; };
// 'YYYY-MM-DDTHH:mm' (توقيت القاهرة) → ISO UTC. لو القيمة فاضية null؛ لو غير صالحة null كمان (والمستدعي بيفرّق بينهم).
const toIso=(s)=>{ if(!s) return null; const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s); if(!m) return null; const w=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]); const t=w-tzOff(w-tzOff(w)); return isNaN(t)?null:new Date(t).toISOString(); };
// ISO → 'YYYY-MM-DDTHH:mm' بتوقيت القاهرة (قيمة حقل datetime-local)
const toLocal=(iso)=>{ if(!iso) return ''; const ms=Date.parse(iso); if(isNaN(ms)) return ''; const p=tzParts(ms); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
const D=(t)=>new Date(t).toLocaleString('ar-EG',{timeZone:TZ,dateStyle:'medium',timeStyle:'short'});
const whenC=(a)=>{   // نفس whenText بس بتوقيت القاهرة
  if(!a) return 'مفتوح دايماً';
  const t=Date.now(), o=a.opens_at?Date.parse(a.opens_at):null, c=a.closes_at?Date.parse(a.closes_at):null;
  if(o!=null&&t<o) return 'يفتح '+D(o)+(c!=null?' · ويقفل '+D(c):'');
  if(c!=null&&t>=c) return 'اتقفل '+D(c);
  return 'مفتوح الآن'+(c!=null?' · يقفل '+D(c):'');
};
const same=(a,b)=>(a?Date.parse(a):null)===(b?Date.parse(b):null);
const VE=(m)=>Object.assign(new Error(m),{vmsg:m});   // رسالة جاهزة للمالك
// بعد الحفظ: نتأكد إن السيرفر رجّع نفس القيم (لو رجّع فاضي أو مختلف نظهر خطأ بدل ما نسكت)
function verify(rows,exp){
  const got=new Map((Array.isArray(rows)?rows:[]).map(r=>[r.chapter_num,r]));
  for(const e of exp){
    const g=got.get(e.chapter_num);
    if(!g) throw VE(`إصحاح ${n(e.chapter_num)}: السيرفر ما رجّعش الصف بعد الحفظ، يعني غالباً ما اتحفظش. اضغط «تحديث» وراجع.`);
    if(!same(g.opens_at,e.opens_at)||!same(g.closes_at,e.closes_at)) throw VE(`إصحاح ${n(e.chapter_num)}: السيرفر خزّن قيم مختلفة عن اللي اخترتها (الفتح: ${g.opens_at||'فاضي'} · القفل: ${g.closes_at||'فاضي'}). ابعتلي الرسالة دي.`);
  }
}
function saveErr(x){
  if(x&&x.vmsg) return x.vmsg;
  const b=(x&&x.body)||{};
  if(b.code==='23514') return 'ما اتحفظش ❌ — السيرفر رفض الميعاد (لازم الفتح أو القفل على الأقل، والقفل بعد الفتح).';
  const d=b.message||b.details||b.hint;
  return 'ما اتحفظش ❌ — '+errMsg(x)+(d?' ['+d+']':'');
}
// إشعار ثابت أسفل الشاشة (بيظهر مهما كان مكانك في الصفحة الطويلة)
function toast(msg,type){
  let t=document.getElementById('accToast');
  if(!t){ t=document.createElement('div'); t.id='accToast'; t.setAttribute('role','status'); t.setAttribute('aria-live','polite'); document.body.appendChild(t); }
  t.style.cssText=`position:fixed;left:12px;right:12px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:9999;max-width:520px;margin:0 auto;padding:12px 16px;border-radius:14px;font:700 .95rem/1.7 Cairo,sans-serif;text-align:center;box-shadow:0 8px 28px rgba(0,0,0,.45);background:var(--bg-2);color:var(--ink);border:2px solid ${type==='err'?'var(--rust)':'var(--teal)'}`;
  t.textContent=msg; t.style.display='block';
  clearTimeout(toast.h); toast.h=setTimeout(()=>{ t.style.display='none'; },type==='err'?8000:4000);
}
const STY={ok:'color:var(--teal)',err:'color:var(--rust)',wait:'color:var(--orange)',dirty:'color:var(--orange)'};
const stCss=(type)=>type?`margin-top:8px;padding:8px 10px;border-radius:10px;border:1px solid currentColor;font-size:.85rem;font-weight:700;line-height:1.8;${STY[type]}`:'display:none';
const q=encodeURIComponent;

export async function mount(el,{role}={}){
  if(role!=='owner'){ el.innerHTML='<div class="ph">هذه الصفحة للمالك فقط.</div>'; return; }
  const S={err:'',ok:'',st:{},books:[],acc:[],codes:[],bid:'',pv:null,f:{start:0,date:addDays(key(),1),ot:'21:00',ct:'00:00'}};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.innerHTML=''; el.appendChild(root);
  const book=()=>S.books.find(b=>b.id===S.bid);
  const $=(s)=>root.querySelector(s);
  const inp=(f,num)=>root.querySelector(`[data-${f}="${num}"]`);
  // حالة الحفظ جنب كل زرار (key = رقم الإصحاح أو 'auto'/'pv'/'bulk')
  const stBox=(k)=>{ const x=S.st[k]; return `<div data-st="${k}" role="status" aria-live="polite" style="${stCss(x&&x.type)}">${x?esc(x.msg):''}</div>`; };
  function setSt(k,type,msg){ if(type) S.st[k]={type,msg}; else delete S.st[k]; const e=root.querySelector(`[data-st="${k}"]`); if(!e) return; e.style.cssText=stCss(type); e.textContent=type?msg:''; }
  const scroller=()=>{ for(let p=root.parentElement;p;p=p.parentElement){ const c=getComputedStyle(p); if(/(auto|scroll)/.test(c.overflowY)&&p.scrollHeight>p.clientHeight) return p; } return document.scrollingElement||document.documentElement; };
  function paint(){ const sc=scroller(), y=sc.scrollTop; draw(); sc.scrollTop=y; }   // إعادة الرسم ما تنطّش بيك لأول الصفحة
  function draw(){
    for(const k of Object.keys(S.st)) if(S.st[k]&&(S.st[k].type==='dirty'||S.st[k].type==='wait')) delete S.st[k];   // حالات مؤقتة ما تتكررش بعد إعادة الرسم
    const b=book(), am=new Map(S.acc.map(a=>[a.book_id+'|'+a.chapter_num,a])), cm=new Map(S.codes.map(c=>[c.book_id+'|'+c.chapter_num,c]));
    const missing=b?b.chapters.filter(c=>!cm.has(b.id+'|'+c.chapterNum)).length:0;
    if(b&&!b.chapters.some(c=>c.chapterNum===S.f.start)) S.f.start=b.chapters[0].chapterNum;
    const F=S.f, pv=S.pv;
    const autoCard=b?`<div class="card2"><b>📅 جدولة تلقائية (إصحاح كل يوم)</b>
        <p class="hint">اختر إصحاح البداية وتاريخه وساعتي الفتح والقفل؛ الإصحاحات اللي بعده تتوزّع يوم بيوم بنفس الساعة، بدون أيام راحة. لو ساعة القفل أصغر من الفتح تتحسب لليوم التالي (٩م ← ١٢ منتصف الليل). التوقيت = توقيت القاهرة.</p>
        <div class="fld"><label for="as">إصحاح البداية</label><select id="as">${b.chapters.map(c=>`<option value="${c.chapterNum}"${c.chapterNum===F.start?' selected':''}>إصحاح ${n(c.chapterNum)}</option>`).join('')}</select></div>
        <div class="fld"><label for="ad">تاريخ إصحاح البداية</label><input type="date" id="ad" value="${esc(F.date)}"></div>
        <div class="fld"><label for="at">يفتح الساعة</label><input type="time" id="at" value="${esc(F.ot)}"></div>
        <div class="fld"><label for="ac">يقفل الساعة</label><input type="time" id="ac" value="${esc(F.ct)}"></div>
        <button class="btn" style="${SB}" data-a="preview">معاينة التوزيع</button>
        ${stBox('auto')}
        ${pv?`<div style="margin-top:12px"><b>المعاينة (${n(pv.length)} إصحاح)</b>
          <p class="hint">عدّل أي صف لو حبيت، وبعدين اضغط «موافقة على الكل».</p>
          ${pv.map(r=>`<div class="row" style="display:block"><div><b>إصحاح ${n(r.N)}</b> ${am.has(b.id+'|'+r.N)?'<span class="badge off">⚠️ له ميعاد سابق هيتبدّل</span>':''}</div>
            <div class="fld" style="margin-top:8px"><label>يفتح</label><input type="datetime-local" data-po="${r.N}" value="${esc(r.o)}"></div>
            <div class="fld"><label>يقفل</label><input type="datetime-local" data-pc="${r.N}" value="${esc(r.c)}"></div></div>`).join('')}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn" style="${SB}" data-a="pvsave">✅ موافقة على الكل وحفظ</button><button class="x" data-a="pvcancel">إلغاء المعاينة</button></div>${stBox('pv')}</div>`:''}</div>`:'';
    root.innerHTML=`${S.err?`<div class="err">${esc(S.err)}</div>`:''}${S.ok?`<div class="hint">${esc(S.ok)}</div>`:''}
      ${!S.books.length?'<div class="ph">لا توجد أسفار. ارفع سفراً من تبويب «إدارة الأسفار» أولاً.</div>':`
      <div class="card2"><b>السفر</b><div class="fld" style="margin-top:8px"><select id="bk">${S.books.map(x=>`<option value="${esc(x.id)}"${x.id===S.bid?' selected':''}>${esc(x.title)}</option>`).join('')}</select></div>
        <p class="hint">الإصحاح اللي ما له ميعاد يفضل مفتوح. المخدوم اللي يفتح بالكود يفضل الإصحاح مفتوح له على جهازه حتى بعد وقت القفل.</p></div>
      ${autoCard}
      <div class="card2"><b>تطبيق ميعاد واحد على كل إصحاحات السفر</b>
        <div class="fld" style="margin-top:8px"><label for="bo">الفتح</label><input type="datetime-local" id="bo"></div>
        <div class="fld"><label for="bc">القفل <small>(اختياري)</small></label><input type="datetime-local" id="bc"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" style="${SB}" data-a="bulk">تطبيق على الكل</button><button class="x" data-a="clearall">مسح مواعيد السفر</button></div>${stBox('bulk')}</div>
      <div class="card2"><b>الإصحاحات (${n(b.chapters.length)})</b>
        <div style="margin:8px 0"><button class="btn sec" style="${SB}" data-a="genmissing"${missing?'':' disabled'}>🔑 توليد كود لكل إصحاح ناقص (${n(missing)})</button></div>
        ${b.chapters.map(c=>{ const k=b.id+'|'+c.chapterNum, a=am.get(k), cd=cm.get(k), N=c.chapterNum;
          return `<div class="row" style="display:block"><div><b>إصحاح ${n(N)}</b> <span class="badge ${a?'off':'on'}">${esc(whenC(a))}</span></div>
          <div class="fld" style="margin-top:8px"><label>يفتح</label><input type="datetime-local" data-o="${N}" value="${toLocal(a&&a.opens_at)}"></div>
          <div class="fld"><label>يقفل <small>(اختياري)</small></label><input type="datetime-local" data-c="${N}" value="${toLocal(a&&a.closes_at)}"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" style="${SB}" data-a="save" data-n="${N}">حفظ الميعاد</button>${a?`<button class="x" data-a="clear" data-n="${N}">مسح الميعاد</button>`:''}</div>
          ${stBox(N)}
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
    }catch(e){ S.err=errMsg(e); toast(S.err,'err'); }
    paint();
  }
  const upsert=(path,body)=>api(`${path}?on_conflict=book_id,chapter_num`,{method:'POST',body,prefer:'resolution=merge-duplicates,return=minimal'});
  // (v9.47) حفظ المواعيد: بيرجّع الصفوف من السيرفر ونتحقق منها (return=representation)
  const upsertAcc=async(rows)=>{ const out=await api(`${AP}?on_conflict=book_id,chapter_num`,{method:'POST',body:rows,prefer:'resolution=merge-duplicates,return=representation'}); verify(out,rows); };
  const delAcc=async(qs)=>{ const out=await api(`${AP}?${qs}`,{method:'DELETE',prefer:'return=representation'}); return Array.isArray(out)?out.length:0; };
  const chk=(o,c)=>{ if(!o&&!c) return 'اكتب ميعاد الفتح أو القفل.'; if(o&&c&&Date.parse(c)<=Date.parse(o)) return 'ميعاد القفل لازم يكون بعد ميعاد الفتح.'; return ''; };
  const fail=(k,m)=>{ setSt(k,'err','⚠️ '+m); toast('⚠️ '+m,'err'); };
  // تشغيل عملية حفظ: زرار «جاري الحفظ…» ← نجاح (رسالة + إشعار + إعادة تحميل) أو خطأ (رسالة جنب الزرار بدون ما نمسح اللي كتبته)
  async function run(t,k,work,okK=k){
    const old=t.textContent; t.disabled=true; t.textContent='⏳ جاري الحفظ…'; setSt(k,'wait','⏳ جاري الحفظ… ما تقفلش الصفحة');
    let msg;
    try{ msg=await work(); }
    catch(x){ t.disabled=false; t.textContent=old; fail(k,saveErr(x)); return false; }
    S.err=''; S.ok=''; S.st={}; S.st[okK]={type:'ok',msg}; toast(msg,'ok');
    await load(); return true;
  }
  root.addEventListener('change',(e)=>{
    const t=e.target, d=t.dataset||{};
    if(t.id==='bk'){ S.bid=t.value; S.ok=''; S.err=''; S.pv=null; S.st={}; paint(); return; }
    if(d.po||d.pc){ const r=S.pv&&S.pv.find(x=>x.N===Number(d.po||d.pc)); if(r){ if(d.po) r.o=t.value; else r.c=t.value; } return; }
    if(d.o||d.c){ setSt(Number(d.o||d.c),'dirty','✏️ في تعديل لسه ما اتحفظش — اضغط «حفظ الميعاد»'); return; }
    const k={as:'start',ad:'date',at:'ot',ac:'ct'}[t.id]; if(!k) return;
    S.f[k]=k==='start'?Number(t.value):t.value; if(S.pv){ S.pv=null; S.ok=''; paint(); }   // تغيير المدخلات يلغي المعاينة القديمة
  });
  root.addEventListener('click',async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a, N=Number(t.dataset.n), b=book(); S.ok=''; S.err='';
    const cd=b&&S.codes.find(c=>c.book_id===b.id&&c.chapter_num===N);
    try{
      if(a==='reload'){ S.st={}; await load(); return; }
      if(!b) return;
      if(a==='preview'){
        const r=autoSchedule(S.f.date,S.f.ot,S.f.ct,0); if(r.err){ fail('auto',r.err); return; }
        const list=b.chapters.filter(c=>c.chapterNum>=S.f.start).sort((x,y)=>x.chapterNum-y.chapterNum), g=autoSchedule(S.f.date,S.f.ot,S.f.ct,list.length);
        S.pv=list.map((c,i)=>({N:c.chapterNum,o:g.rows[i].o,c:g.rows[i].c})); S.st={}; paint(); return;
      }
      if(a==='pvcancel'){ S.pv=null; S.st={}; paint(); return; }
      if(a==='pvsave'){
        if(!S.pv||!S.pv.length) return;
        const now=new Date().toISOString(), rows=[];
        for(const r of S.pv){
          if(!r.o||!r.c){ fail('pv',`إصحاح ${n(r.N)}: اكتب الفتح والقفل.`); return; }
          const o=toIso(r.o), c=toIso(r.c);
          if(!o||!c){ fail('pv',`إصحاح ${n(r.N)}: التاريخ أو الساعة مش مكتملين.`); return; }
          if(Date.parse(c)<=Date.parse(o)){ fail('pv',`إصحاح ${n(r.N)}: القفل لازم يكون بعد الفتح (لا يُحفظ شيء).`); return; }
          rows.push({book_id:b.id,chapter_num:r.N,opens_at:o,closes_at:c,updated_at:now});
        }
        const had=S.pv.filter(r=>S.acc.some(x=>x.book_id===b.id&&x.chapter_num===r.N)).length;
        if(had&&!confirm(`${n(had)} إصحاح لهم ميعاد سابق هيتبدّل. موافق؟`)) return;
        await run(t,'pv',async()=>{ await upsertAcc(rows); S.pv=null; return `✅ اتحفظت مواعيد ${n(rows.length)} إصحاح (بتوقيت القاهرة) والسيرفر أكّدها`; },'auto');
        return;
      }
      if(a==='send'){ if(cd) shareText(codeMsg(b.title,N,cd.code)); return; }
      if(a==='copy'){ if(cd){ const ok=await copyText(codeMsg(b.title,N,cd.code)); S.ok=ok?'تم نسخ الكود ✅':''; S.err=ok?'':'تعذّر النسخ، انسخه يدوياً.'; toast(ok?'تم نسخ الكود ✅':'تعذّر النسخ، انسخه يدوياً.',ok?'ok':'err'); paint(); } return; }
      if(a==='save'){
        const o=inp('o',N).value, c=inp('c',N).value;
        if(!o&&!c){
          if(!S.acc.some(x=>x.book_id===b.id&&x.chapter_num===N)){ fail(N,'اكتب ميعاد الفتح أو القفل.'); return; }
          if(!confirm('الخانتين فاضيتين: ده هيمسح الميعاد ويرجّع الإصحاح مفتوح. متأكد؟')) return;
          await run(t,N,async()=>{ const k=await delAcc(`book_id=eq.${q(b.id)}&chapter_num=eq.${N}`); if(!k) throw VE('ما اتمسحش: السيرفر ما لقاش الميعاد (أو مفيش صلاحية). اضغط «تحديث».'); return `✅ اتمسح ميعاد إصحاح ${n(N)}، الإصحاح مفتوح.`; });
          return;
        }
        const oi=toIso(o), ci=toIso(c);
        if((o&&!oi)||(c&&!ci)){ fail(N,'التاريخ أو الساعة مش مكتملين. اختار التاريخ والساعة مع بعض.'); return; }
        const m=chk(oi,ci); if(m){ fail(N,m); return; }
        const row={book_id:b.id,chapter_num:N,opens_at:oi,closes_at:ci,updated_at:new Date().toISOString()};
        await run(t,N,async()=>{ await upsertAcc([row]); return `✅ اتحفظ إصحاح ${n(N)} (توقيت القاهرة) — يفتح: ${oi?D(oi):'—'} · يقفل: ${ci?D(ci):'—'}`; });
      }
      else if(a==='clear'){
        if(!confirm('مسح الميعاد؟ الإصحاح هيرجع مفتوح.')) return;
        await run(t,N,async()=>{ const k=await delAcc(`book_id=eq.${q(b.id)}&chapter_num=eq.${N}`); if(!k) throw VE('ما اتمسحش: السيرفر ما لقاش الميعاد (أو مفيش صلاحية). اضغط «تحديث».'); return `✅ اتمسح ميعاد إصحاح ${n(N)}.`; });
      }
      else if(a==='bulk'){
        const o=$('#bo').value, c=$('#bc').value, oi=toIso(o), ci=toIso(c), m=chk(oi,ci); if(m){ fail('bulk',m); return; }
        if((o&&!oi)||(c&&!ci)){ fail('bulk','التاريخ أو الساعة مش مكتملين. اختار التاريخ والساعة مع بعض.'); return; }
        if(!confirm(`تطبيق الميعاد على ${n(b.chapters.length)} إصحاح؟ المواعيد الحالية هتتبدّل.`)) return;
        const now=new Date().toISOString(), rows=b.chapters.map(x=>({book_id:b.id,chapter_num:x.chapterNum,opens_at:oi,closes_at:ci,updated_at:now}));
        await run(t,'bulk',async()=>{ await upsertAcc(rows); return `✅ اتطبّق الميعاد على ${n(rows.length)} إصحاح (بتوقيت القاهرة) والسيرفر أكّده`; });
      }
      else if(a==='clearall'){
        if(!confirm('مسح مواعيد كل إصحاحات السفر؟ كلها هترجع مفتوحة.')) return;
        await run(t,'bulk',async()=>{ const k=await delAcc(`book_id=eq.${q(b.id)}`); return k?`✅ اتمسحت مواعيد ${n(k)} إصحاح، كلها رجعت مفتوحة.`:'مفيش مواعيد للسفر ده أصلاً.'; });
      }
      else if(a==='gen'){
        if(cd&&!confirm('الكود القديم هيبطل فوراً. توليد كود جديد؟')) return;
        await run(t,N,async()=>{ await upsert(CP,[{book_id:b.id,chapter_num:N,code:genCode(),created_at:new Date().toISOString()}]); return `✅ اتولّد كود إصحاح ${n(N)}`; });
      }
      else if(a==='genmissing'){
        const have=new Set(S.codes.filter(c=>c.book_id===b.id).map(c=>c.chapter_num)), now=new Date().toISOString();
        const body=b.chapters.filter(x=>!have.has(x.chapterNum)).map(x=>({book_id:b.id,chapter_num:x.chapterNum,code:genCode(),created_at:now}));
        if(!body.length) return;
        await run(t,'gm',async()=>{ await upsert(CP,body); return `✅ اتولّد ${n(body.length)} كود`; });
      }
      else if(a==='revoke'){
        if(!confirm('إلغاء الكود؟ ما حدش هيقدر يفتح بيه تاني (اللي فتح بيه قبل كده يفضل مفتوح له).')) return;
        await run(t,N,async()=>{ await api(`${CP}?book_id=eq.${q(b.id)}&chapter_num=eq.${N}`,{method:'DELETE',prefer:'return=minimal'}); return `✅ اتلغى كود إصحاح ${n(N)}.`; });
      }
    }catch(x){ toast(saveErr(x),'err'); }
  });
  await load();
}
