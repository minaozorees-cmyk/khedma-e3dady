// وحدة المالك: رفع ملفات JSON للأسفار إلى جدول books (المالك فقط؛ RLS هي الحماية الفعلية).
// الملف يمر على نفس فحص book-schema (الإصحاح المعيب يُستبعد)، ثم يُدمج مع السفر الموجود (الأحدث يغلب عند تكرار رقم الإصحاح).
import {normalizeFile,normalizeQuestions} from '../../js/book-schema.js';
import * as LIB from '../../js/library.js';
import * as SY from '../../js/sync.js';
import {esc} from '../../js/consts.js';
import {n} from '../../js/dates.js';
import {dropFromCache} from '../../js/books.js';
const MAX_BYTES=2*1024*1024, ID_RE=/^[A-Za-z0-9_\u0600-\u06FF-]{1,60}$/; // نفس books_id_fmt في schema.sql

// الصيغة المخزّنة = صيغة الملف (chapter بدل sections) حتى يعاد فحصها بنفس normalizeFile عند التحميل
// (v9.26) إصحاح أسئلته فقط (needsText): بدون chapter (نصه من المكتبة)، والتأمل اختياري
export const toRaw=(c)=>{ const r={chapterNum:c.chapterNum,questions:c.questions}; if(!c.needsText) r.chapter=c.sections; if(c.meditation) r.meditation=c.meditation; return r; };
// دمج: الجديد يغلب عند تكرار الرقم، ويرجع مرتباً. existing بالصيغة الخام المخزّنة.
export function mergeChapters(existing,incoming){
  const m=new Map(); for(const c of Array.isArray(existing)?existing:[]) if(c&&c.chapterNum>0) m.set(c.chapterNum,c);
  let replaced=0; for(const c of incoming){ if(m.has(c.chapterNum)) replaced++; m.set(c.chapterNum,c); }
  return {chapters:[...m.values()].sort((a,b)=>a.chapterNum-b.chapterNum),replaced};
}
const delErr=(r)=>r.status===401||r.status===403?'الجلسة انتهت أو الحساب غير مصرّح له بالحذف. سجّل الدخول من جديد.':'تعذّر الحذف (رمز '+r.status+').';
const fmtErr=(r)=>r.status===401||r.status===403?'الجلسة انتهت أو الحساب غير مصرّح له. سجّل الدخول من جديد.':'تعذّر الحفظ (رمز '+r.status+').';

export async function mount(el){
  let parsed=null; // {title,chapters(raw),problems,fileName}
  let qp=null, libIdx=[], srvList=[]; // (v9.26) qp = أسئلة فقط: {lib,chapters(raw),problems,ignored}
  const $=(s)=>el.querySelector(s);
  async function listServer(){
    const l=await SY.booksList(); // قراءة عامة
    if(!Array.isArray(l)) return '<div class="hint">تعذّر قراءة الأسفار الحالية من السيرفر.</div>';
    return l.length?l.map(b=>`<div class="row" style="display:block"><span>${esc(b.title)} <small>(${esc(b.id)})</small></span>
      <div style="margin-top:6px"><button class="x" data-del="${esc(b.id)}" data-t="${esc(b.title)}">🗑️ حذف السفر</button></div></div>`).join(''):'<div class="hint">لا توجد أسفار على السيرفر بعد.</div>';
  }
  const libOpts=()=>{ const g=(t,l)=>l.length?`<optgroup label="${t}">${l.map(b=>`<option value="${esc(b.id)}">${esc(b.title)} (${n(b.chapters)})</option>`).join('')}</optgroup>`:'';
    return '<option value="">— اختر سفر المكتبة —</option>'+g('العهد القديم',libIdx.filter(b=>b.testament==='ot'))+g('العهد الجديد',libIdx.filter(b=>b.testament==='nt')); };
  async function paint(){
    libIdx=await LIB.index().catch(()=>[]);
    el.innerHTML=`<div class="gate"><div class="card2"><b>رفع أسئلة فقط (النص من المكتبة)</b>
      <p class="hint">اختر السفر من المكتبة، ثم ملف JSON فيه الأسئلة فقط (ممكن أكتر من ملف مرة واحدة). نص الإصحاح بيتسحب من المكتبة وقت القراءة، وكل مواعيد الفتح والأكواد بتتطبّق عليه زي أي إصحاح.</p>
      ${libIdx.length?`<div class="fld"><label for="lbk">سفر المكتبة</label><select id="lbk">${libOpts()}</select></div>
      <button class="btn sec" id="qpick" disabled>اختيار ملفات الأسئلة JSON</button><input type="file" id="qf" accept="application/json,.json" multiple hidden>`:'<div class="err">تعذّر تحميل فهرس المكتبة (bible/index.json). تأكد إن مجلد bible اترفع على GitHub.</div>'}
      <div id="qrep"></div></div>
      <div class="card2"><b>رفع سفر / إصحاحات</b>
      <p class="hint">اختر ملف JSON (سفر كامل أو إصحاح مفرد). الإصحاح المعيب يُستبعد ويظهر سببه، والباقي يُرفع ويُدمج مع السفر الموجود.</p>
      <button class="btn sec" id="pick">اختيار ملف JSON</button><input type="file" id="f" accept="application/json,.json" hidden>
      <div id="rep"></div></div>
      <div class="card2"><b>الأسفار على السيرفر</b><div id="lmsg"></div><div id="lst"><div class="hint">جارٍ التحميل…</div></div></div></div>`;
    $('#pick').onclick=()=>$('#f').click();
    $('#f').onchange=onFile;
    if($('#lbk')){ $('#lbk').onchange=()=>{ $('#qpick').disabled=!$('#lbk').value; qp=null; $('#qrep').innerHTML=''; }; $('#qpick').onclick=()=>$('#qf').click(); $('#qf').onchange=onQFiles; }
    $('#lst').innerHTML=await listServer();
    $('#lst').onclick=(e)=>{ const b=e.target.closest('[data-del]'); if(b&&!b.disabled) delBook(b); };
  }
  // (v9.25) حذف سفر نهائياً: DELETE بـreturn=representation عشان نكتشف لو RLS ما مسحتش حاجة (PostgREST بيرجّع 204 حتى لو صفر صفوف)
  async function delBook(btn){
    const id=btn.dataset.del, title=btn.dataset.t||id, lm=$('#lmsg');
    if(!confirm(`هل أنت متأكد من حذف سفر ${title} نهائياً؟ سيتم مسحه من السيرفر ومن أجهزة المخدومين عند فتح التطبيق في المرة القادمة. النتائج المسجلة للمخدومين هتفضل موجودة في سجلهم كمرجع.`)) return;
    btn.disabled=true; lm.innerHTML='';
    try{
      const r=await SY.staffApi(`/rest/v1/books?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',prefer:'return=representation'});
      if(!r.ok){ lm.innerHTML=`<div class="err">${esc(delErr(r))}</div>`; return; }
      const rows=await r.json().catch(()=>null);
      if(!Array.isArray(rows)||!rows.length){ lm.innerHTML='<div class="err">ما اتمسحش: السفر مش موجود على السيرفر أو الحساب مش مصرّح له بالحذف.</div>'; $('#lst').innerHTML=await listServer(); return; }
      await dropFromCache(id);
      lm.innerHTML=`<div class="hint">تم حذف سفر ${esc(title)} ✅</div>`;
      $('#lst').innerHTML=await listServer();
    }catch(x){ lm.innerHTML=`<div class="err">${x&&x.status===401?'سجّل الدخول من جديد.':'تعذّر الاتصال بالسيرفر.'}</div>`; }
    finally{ btn.disabled=false; }
  }
  // ===== (v9.26) أسئلة فقط =====
  async function onQFiles(e){
    const files=[...(e.target.files||[])]; e.target.value=''; if(!files.length) return;
    const lid=$('#lbk').value, meta=libIdx.find(b=>b.id===lid), rep=$('#qrep'); qp=null;
    if(!meta){ rep.innerHTML='<div class="err">اختر سفر المكتبة الأول.</div>'; return; }
    const byNum=new Map(), problems=[]; let ignored=0;
    for(const f of files){
      if(f.size>MAX_BYTES){ problems.push(`${f.name}: الملف كبير جداً (الحد ٢ ميجا)`); continue; }
      let raw; try{ raw=JSON.parse(await f.text()); }catch(x){ problems.push(`${f.name}: ليس JSON صالحاً`); continue; }
      const r=normalizeQuestions(raw); ignored+=r.ignoredText; r.problems.forEach(p=>problems.push(`${f.name}: ${p}`));
      for(const c of r.chapters){
        if(c.chapterNum>meta.chapters){ problems.push(`${f.name}: إصحاح ${c.chapterNum} مش موجود في ${meta.title} (عدد إصحاحاته ${meta.chapters})`); continue; }
        byNum.set(c.chapterNum,toRaw(c)); }
    }
    const chapters=[...byNum.values()].sort((a,b)=>a.chapterNum-b.chapterNum);
    const probs=problems.length?`<div class="warn">${problems.map(p=>'• '+esc(p)).join('<br>')}</div>`:'';
    if(!chapters.length){ rep.innerHTML=probs+'<div class="err">لا يوجد أي إصحاح صالح للرفع.</div>'; return; }
    qp={lib:lid,chapters,ignored};
    srvList=await SY.booksList().catch(()=>null); if(!Array.isArray(srvList)) srvList=[];
    const ex=srvList.find(b=>b.id===lid);
    rep.innerHTML=`${probs}<div class="hint">إصحاحات صالحة (${n(chapters.length)}): ${chapters.map(c=>n(c.chapterNum)).join('، ')}</div>
      ${ignored?`<div class="hint">ℹ️ ${n(ignored)} إصحاح كان فيه نص جوه الملف، اتجاهل واتاخد النص من المكتبة.</div>`:''}
      <div class="fld"><label for="qtg">الإضافة إلى</label><select id="qtg"><option value="">سفر جديد</option>${srvList.map(b=>`<option value="${esc(b.id)}"${ex&&ex.id===b.id?' selected':''}>${esc(b.title)} (${esc(b.id)})</option>`).join('')}</select></div>
      <div class="fld"><label for="qid">معرّف السفر (id)</label><input id="qid" dir="ltr" maxlength="60" autocomplete="off"></div>
      <div class="fld"><label for="qtl">اسم السفر</label><input id="qtl" maxlength="120"></div>
      <div class="fld"><label for="qrm">دقائق القراءة قبل الامتحان</label><input id="qrm" type="number" min="0" max="60" inputmode="numeric"></div>
      <div class="err" id="qerr"></div><div class="hint" id="qmsg"></div>
      <button class="btn" id="qup">رفع إلى السيرفر</button>`;
    const fill=()=>{ const t=srvList.find(b=>b.id===$('#qtg').value), isNew=!t;
      $('#qid').value=isNew?lid:t.id; $('#qtl').value=isNew?meta.title:t.title; $('#qrm').value=isNew?3:(t.read_minutes??3);
      $('#qid').readOnly=!isNew; $('#qtl').readOnly=!isNew; };
    $('#qtg').onchange=fill; fill(); $('#qup').onclick=uploadQ;
  }
  async function uploadQ(){
    const id=$('#qid').value.trim(), title=$('#qtl').value.trim(), rm=Number($('#qrm').value), err=$('#qerr'), msg=$('#qmsg'), btn=$('#qup');
    err.textContent=''; msg.textContent='';
    if(!qp) return;
    if(!ID_RE.test(id)){ err.textContent='المعرّف: حروف/أرقام/شرطة فقط (حتى ٦٠).'; return; }
    if(title.length<2){ err.textContent='اكتب اسم السفر.'; return; }
    if(!Number.isFinite(rm)||rm<0||rm>60){ err.textContent='دقائق القراءة بين ٠ و٦٠.'; return; }
    btn.disabled=true;
    try{
      const g=await SY.staffApi(`/rest/v1/books?id=eq.${encodeURIComponent(id)}&select=data`);
      if(!g.ok){ err.textContent=fmtErr(g); return; }
      const cur=(await g.json())[0], data=(cur&&cur.data)||{};
      if(data.lib&&data.lib!==qp.lib){ err.textContent=`السفر ده مربوط بسفر تاني في المكتبة (${data.lib}). اختر سفر المكتبة الصحيح أو معرّف تاني.`; return; }
      const {chapters,replaced}=mergeChapters(data.chapters,qp.chapters);
      const p=await SY.staffApi('/rest/v1/books?on_conflict=id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{id,title,read_minutes:Math.floor(rm),data:{...data,chapters,lib:qp.lib}}});
      if(!p.ok){ err.textContent=fmtErr(p); return; }
      await dropFromCache(id);
      msg.textContent=`تم الرفع ✅ — ${n(chapters.length)} إصحاح في السفر${replaced?` (استُبدل ${n(replaced)})`:''}. النص من المكتبة.`;
      qp=null; $('#lst').innerHTML=await listServer();
    }catch(x){ err.textContent=x&&x.status===401?'سجّل الدخول من جديد.':'تعذّر الاتصال بالسيرفر.'; }
    finally{ btn.disabled=false; }
  }
  async function onFile(e){
    const f=e.target.files&&e.target.files[0]; e.target.value=''; if(!f) return;
    const rep=$('#rep'); parsed=null;
    if(f.size>MAX_BYTES){ rep.innerHTML='<div class="err">الملف كبير جداً (الحد ٢ ميجا).</div>'; return; }
    let raw; try{ raw=JSON.parse(await f.text()); }catch(x){ rep.innerHTML='<div class="err">الملف ليس JSON صالحاً.</div>'; return; }
    const n=normalizeFile(raw);
    parsed={title:n.book,chapters:n.chapters.map(toRaw),problems:n.problems,fileName:f.name};
    const probs=n.problems.length?`<div class="warn">${n.problems.map(p=>'• '+esc(p)).join('<br>')}</div>`:'';
    if(!parsed.chapters.length){ rep.innerHTML=probs+'<div class="err">لا يوجد أي إصحاح صالح للرفع.</div>'; parsed=null; return; }
    rep.innerHTML=`${probs}<div class="hint">إصحاحات صالحة: ${parsed.chapters.map(c=>c.chapterNum).join('، ')}</div>
      <div class="fld"><label for="bid">معرّف السفر (id)</label><input id="bid" dir="ltr" maxlength="60" autocomplete="off" placeholder="مثال: judith"></div>
      <div class="fld"><label for="btl">اسم السفر</label><input id="btl" value="${esc(parsed.title)}" maxlength="120"></div>
      <div class="fld"><label for="brm">دقائق القراءة قبل الامتحان</label><input id="brm" type="number" min="0" max="60" value="3" inputmode="numeric"></div>
      <div class="err" id="uerr"></div><div class="hint" id="umsg"></div>
      <button class="btn" id="up">رفع إلى السيرفر</button>`;
    $('#up').onclick=upload;
  }
  async function upload(){
    const id=$('#bid').value.trim(), title=$('#btl').value.trim(), rm=Number($('#brm').value), err=$('#uerr'), msg=$('#umsg'), btn=$('#up');
    err.textContent=''; msg.textContent='';
    if(!ID_RE.test(id)){ err.textContent='المعرّف: حروف/أرقام/شرطة فقط (حتى ٦٠).'; return; }
    if(title.length<2){ err.textContent='اكتب اسم السفر.'; return; }
    if(!Number.isFinite(rm)||rm<0||rm>60){ err.textContent='دقائق القراءة بين ٠ و٦٠.'; return; }
    btn.disabled=true;
    try{
      const g=await SY.staffApi(`/rest/v1/books?id=eq.${encodeURIComponent(id)}&select=data`);
      if(!g.ok){ err.textContent=fmtErr(g); return; }
      const cur=(await g.json())[0], {chapters,replaced}=mergeChapters(cur&&cur.data&&cur.data.chapters,parsed.chapters);
      const p=await SY.staffApi('/rest/v1/books?on_conflict=id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{id,title,read_minutes:Math.floor(rm),data:{chapters}}});
      if(!p.ok){ err.textContent=fmtErr(p); return; }
      msg.textContent=`تم الرفع ✅ — ${chapters.length} إصحاح في السفر${replaced?` (استُبدل ${replaced})`:''}.`;
      parsed=null; $('#lst').innerHTML=await listServer();
    }catch(x){ err.textContent=x&&x.status===401?'سجّل الدخول من جديد.':'تعذّر الاتصال بالسيرفر.'; }
    finally{ btn.disabled=false; }
  }
  await paint();
}
