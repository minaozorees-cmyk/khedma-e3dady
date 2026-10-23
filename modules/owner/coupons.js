// (v9.489) 🎁 تقرير الكوبونات الأسبوعي — المالك فقط. بدون SQL جديد.
// «محلول» = أول محاولة في الإصحاح من results_first_staff (نفس تبويب الالتزام). التجميع على كل الأسفار. المنطق في js/coupons.js.
import * as SY from '../../js/sync.js';
import {esc} from '../../js/consts.js';
import {key,n} from '../../js/dates.js';
import {SB} from '../../js/sapi.js';
import * as C from '../../js/coupons.js';
import {buildXlsx} from '../../js/xlsx-lite.js';

async function copyTxt(t){
  try{ await navigator.clipboard.writeText(t); return true; }catch(e){}
  try{ const ta=document.createElement('textarea'); ta.value=t; ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); const ok=document.execCommand('copy'); ta.remove(); return ok; }catch(e){ return false; }
}
// طباعة بدون نافذة جديدة (بتشتغل في الـPWA): عنصر للطباعة بس يتحط في الصفحة، وCSS يخفي باقي الصفحة وقت الطباعة
function printReport(agg,from,to){
  const id='cpn-print'; document.getElementById(id)?.remove(); document.getElementById(id+'-css')?.remove();
  const css=document.createElement('style'); css.id=id+'-css';
  css.textContent=`@media screen{#${id}{display:none}}@media print{body>*:not(#${id}){display:none!important}body{background:#fff!important;color:#000!important}#${id}{display:block;direction:rtl;font-family:Cairo,Tahoma,Arial,sans-serif;color:#000;background:#fff;padding:12px}#${id} h1{font-size:20px;margin:0 0 4px}#${id} h2{font-size:16px;margin:18px 0 6px}#${id} .sub{font-size:14px;margin-bottom:10px}#${id} table{width:100%;border-collapse:collapse;font-size:15px}#${id} th,#${id} td{border:1px solid #444;padding:6px 10px;text-align:right}#${id} th{background:#eee}#${id} td.c,#${id} th.c{text-align:center;width:120px}#${id} tr.t td{font-weight:700;background:#f4f4f4}#${id} .all{margin-top:18px;font-size:18px;font-weight:700;border:2px solid #000;padding:8px 12px}#${id} h2,#${id} table{page-break-inside:avoid}}`;
  const box=document.createElement('div'); box.id=id;
  box.innerHTML=`<h1>🎁 تقرير الكوبونات — خدمة إعدادي</h1><div class="sub">${esc(C.kindWord(from,to))} ${esc(C.rangeLabel(from,to))}</div>`
    +agg.groups.map(g=>`<h2>الصف ${esc(g.grade)}</h2><table><thead><tr><th class="c" style="width:40px">#</th><th>الاسم</th><th class="c">الإصحاحات / الكوبونات</th></tr></thead><tbody>${g.students.map((s,i)=>`<tr><td class="c">${i+1}</td><td>${esc(s.name)}</td><td class="c">${s.count}</td></tr>`).join('')}<tr class="t"><td colspan="2">المجموع</td><td class="c">${g.total}</td></tr></tbody></table>`).join('')
    +`<div class="all">إجمالي الكوبونات المطلوبة: ${agg.total}</div>`;
  document.head.appendChild(css); document.body.appendChild(box);
  const clean=()=>{ removeEventListener('afterprint',clean); box.remove(); css.remove(); };
  addEventListener('afterprint',clean); setTimeout(()=>window.print(),60);
}
function downloadXlsx(agg,from,to){
  const {rows,styles}=C.sheetRows(agg,from,to), bytes=buildXlsx({rows,styles,sheetName:'الكوبونات'});
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a'); a.href=url; a.download=`coupons_${from}_${to}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}

export async function mount(el,{role}={}){
  if(role!=='owner'){ el.innerHTML='<div class="ph">هذه الصفحة للمالك فقط.</div>'; return; }
  if(!SY.enabled()){ el.innerHTML='<div class="ph">المزامنة غير مفعّلة (js/config.js فاضي).</div>'; return; }
  const S={mode:'prev',from:'',to:'',data:null,busy:false,err:''};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.replaceChildren(root);
  const $=(s)=>root.querySelector(s);
  const range=()=>{
    if(S.mode==='custom'){ const d=C.weekRange(key(),'prev'); return [S.from||d[0],S.to||d[1]]; }
    return C.weekRange(key(),S.mode);
  };
  const stamp=(t)=>t?new Date(t).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}):'—';
  function status(){
    const d=S.data; if(!d) return '';
    let h='';
    if(d.error==='auth') h+='<div class="err">الجلسة انتهت أو الحساب غير مصرّح له. سجّل الدخول من جديد.</div>';
    else if(d.fromCache) h+=`<div class="warn">⚠️ البيانات دي من نسخة محفوظة على الجهاز (آخر تحديث ${esc(stamp(d.at))}) لأن ${d.error==='server'?'السيرفر مردّش':'مفيش اتصال بالنت'}. اضغط «🔄 تحديث» قبل ما توزّع الكوبونات.</div>`;
    else h+=`<div class="hint">آخر تحديث للبيانات: ${esc(stamp(d.at))}</div>`;
    if(d.truncated) h+='<div class="warn">⚠️ البيانات اتقطعت (أكتر من ٢٠ ألف صف) فالأرقام ممكن تكون ناقصة.</div>';
    return h;
  }
  function paint(){
    const [from,to]=range(), custom=S.mode==='custom', bad=custom&&!C.validRange(from,to);
    const mb=(m,l)=>`<button class="btn${S.mode===m?'':' sec'}" style="${SB}" data-a="mode" data-m="${m}">${l}</button>`;
    let body='';
    if(S.busy&&!S.data) body='<div class="ph">جارٍ تحميل النتائج…</div>';
    else if(!S.data) body=`<div class="err">${esc(S.err||'تعذّر تحميل النتائج.')}</div>`;
    else if(bad) body='<div class="err">اختر تاريخ بداية ونهاية صحيحين (البداية قبل النهاية أو تساويها).</div>';
    else{
      const agg=C.aggregate(S.data.rows,from,to);
      if(!agg.total) body+='<div class="card2"><div class="hint">مفيش مخدوم حلّ إصحاح في الفترة دي.</div></div>';
      else body+=`<div class="card2" style="text-align:center"><div class="code" style="font-size:2rem">${n(agg.total)}</div><div>إجمالي الكوبونات المطلوبة · ${n(agg.students)} مخدوم</div></div>`
        +agg.groups.map(g=>`<div class="card2"><b>الصف ${esc(g.grade)}</b>${g.students.map(s=>`<div class="row"><span>👤 ${esc(s.name)}</span><span><b>${n(s.count)}</b> ${esc(C.chaptersWord(s.count))}</span></div>`).join('')}<div class="row"><span><b>📊 المجموع</b></span><span><b>${n(g.total)}</b> كوبون</span></div></div>`).join('');
      body+=`<div class="card2"><button class="btn" data-a="copy"${agg.total?'':' disabled'}>📋 نسخ التقرير</button><button class="btn sec" data-a="print"${agg.total?'':' disabled'}>🖨️ طباعة</button><button class="btn sec" data-a="xlsx"${agg.total?'':' disabled'}>📤 تصدير Excel</button><div class="hint" id="amsg"></div></div>`;
    }
    root.innerHTML=`<div class="card2"><b>🎁 تقرير الكوبونات الأسبوعي</b>
      <div class="hint">كوبون لكل إصحاح <b>أول محاولة</b> فيه وقعت جوه الفترة (نفس حساب تبويب الالتزام، على كل الأسفار). الأسبوع من الأحد للسبت.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">${mb('prev','الأسبوع اللي فات')}${mb('cur','الأسبوع الحالي')}${mb('custom','تاريخ يدوي')}<button class="btn sec" style="${SB}" data-a="refresh"${S.busy?' disabled':''}>🔄 تحديث</button></div>
      ${custom?`<div style="display:flex;gap:8px"><div class="fld" style="flex:1"><label for="cf">من</label><input id="cf" type="date" value="${esc(from)}"></div><div class="fld" style="flex:1"><label for="ct">إلى</label><input id="ct" type="date" value="${esc(to)}"></div></div>`:''}
      ${bad?'':`<div class="hint">📅 ${esc(C.kindWord(from,to))} ${esc(C.rangeLabel(from,to))}</div>`}${status()}</div>${body}`;
  }
  async function load(){
    S.busy=true; S.err=''; paint();
    try{ S.data=await SY.resultsFirst({refresh:true}); }catch(e){ S.data=null; S.err='تعذّر تحميل النتائج.'; }
    S.busy=false; paint();
  }
  const msg=(t)=>{ const m=$('#amsg'); if(m) m.textContent=t; };
  root.onclick=async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='mode'){ const m=t.dataset.m; if(m==='custom'&&S.mode!=='custom'){ const d=C.weekRange(key(),S.mode==='cur'?'cur':'prev'); S.from=d[0]; S.to=d[1]; } S.mode=m; paint(); return; }
    if(a==='refresh'){ await load(); return; }
    const [from,to]=range(); if(!S.data||!C.validRange(from,to)) return;
    const agg=C.aggregate(S.data.rows,from,to); if(!agg.total) return;
    if(a==='copy'){ msg((await copyTxt(C.whatsappText(agg,from,to)))?'✅ اتنسخ — الصقه في الواتساب':'تعذّر النسخ، جرّب تاني.'); }
    else if(a==='print'){ printReport(agg,from,to); }
    else if(a==='xlsx'){ try{ downloadXlsx(agg,from,to); msg('✅ جارٍ تنزيل ملف Excel'); }catch(x){ console.error('[coupons] xlsx',x); msg('تعذّر إنشاء الملف.'); } }
  };
  root.onchange=(e)=>{
    if(e.target.id==='cf'){ S.from=e.target.value; paint(); }
    else if(e.target.id==='ct'){ S.to=e.target.value; paint(); }
  };
  await load();
}
