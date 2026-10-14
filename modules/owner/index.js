// وحدة المالك: رفع ملفات JSON للأسفار إلى جدول books (المالك فقط؛ RLS هي الحماية الفعلية).
// الملف يمر على نفس فحص book-schema (الإصحاح المعيب يُستبعد)، ثم يُدمج مع السفر الموجود (الأحدث يغلب عند تكرار رقم الإصحاح).
import {normalizeFile} from '../../js/book-schema.js';
import * as SY from '../../js/sync.js';
import {esc} from '../../js/consts.js';
const MAX_BYTES=2*1024*1024, ID_RE=/^[A-Za-z0-9_\u0600-\u06FF-]{1,60}$/; // نفس books_id_fmt في schema.sql

// الصيغة المخزّنة = صيغة الملف (chapter بدل sections) حتى يعاد فحصها بنفس normalizeFile عند التحميل
export const toRaw=(c)=>({chapterNum:c.chapterNum,chapter:c.sections,meditation:c.meditation,questions:c.questions});
// دمج: الجديد يغلب عند تكرار الرقم، ويرجع مرتباً. existing بالصيغة الخام المخزّنة.
export function mergeChapters(existing,incoming){
  const m=new Map(); for(const c of Array.isArray(existing)?existing:[]) if(c&&c.chapterNum>0) m.set(c.chapterNum,c);
  let replaced=0; for(const c of incoming){ if(m.has(c.chapterNum)) replaced++; m.set(c.chapterNum,c); }
  return {chapters:[...m.values()].sort((a,b)=>a.chapterNum-b.chapterNum),replaced};
}
const fmtErr=(r)=>r.status===401||r.status===403?'الجلسة انتهت أو الحساب غير مصرّح له. سجّل الدخول من جديد.':'تعذّر الحفظ (رمز '+r.status+').';

export async function mount(el){
  let parsed=null; // {title,chapters(raw),problems,fileName}
  const $=(s)=>el.querySelector(s);
  async function listServer(){
    const l=await SY.booksList(); // قراءة عامة
    if(!Array.isArray(l)) return '<div class="hint">تعذّر قراءة الأسفار الحالية من السيرفر.</div>';
    return l.length?l.map(b=>`<div class="row"><span>${esc(b.title)} <small>(${esc(b.id)})</small></span></div>`).join(''):'<div class="hint">لا توجد أسفار على السيرفر بعد.</div>';
  }
  async function paint(){
    el.innerHTML=`<div class="gate"><div class="card2"><b>رفع سفر / إصحاحات</b>
      <p class="hint">اختر ملف JSON (سفر كامل أو إصحاح مفرد). الإصحاح المعيب يُستبعد ويظهر سببه، والباقي يُرفع ويُدمج مع السفر الموجود.</p>
      <button class="btn sec" id="pick">اختيار ملف JSON</button><input type="file" id="f" accept="application/json,.json" hidden>
      <div id="rep"></div></div>
      <div class="card2"><b>الأسفار على السيرفر</b><div id="lst"><div class="hint">جارٍ التحميل…</div></div></div></div>`;
    $('#pick').onclick=()=>$('#f').click();
    $('#f').onchange=onFile;
    $('#lst').innerHTML=await listServer();
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
