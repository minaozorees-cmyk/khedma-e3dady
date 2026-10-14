import * as db from '../../js/db.js';
import * as D from '../../js/dates.js';
import {save} from '../../js/store.js';
import {LITURGY_TYPES,esc} from '../../js/consts.js';
export async function mount(el){
  const today=D.key();
  let L=(await db.get('liturgy'))||{entries:{}};
  if(!L.start){ L.start=today; await db.set('liturgy',L); }
  let view=today.slice(0,7);
  const has=(k)=>!!L.entries[k];
  function sundays(from,to){ const r=[]; let k=from; while(k<=to){ if(D.isSunday(k)) { r.push(k); k=D.addDays(k,7); } else k=D.addDays(k,1); } return r; }
  function monthStat(){
    const [f,l]=D.monthRange(view); const from=f>L.start?f:L.start, to=l<today?l:today;
    const su=from<=to?sundays(from,to).filter(k=>k<today||has(k)):[]; if(!su.length) return null;
    return Math.round(100*su.filter(has).length/su.length);
  }
  function streak(){ let k=today; while(!D.isSunday(k)) k=D.addDays(k,-1); if(k===today&&!has(k)) k=D.addDays(k,-7); let s=0; while(s<1000&&has(k)){ s++; k=D.addDays(k,-7); } return s; }
  const monthCount=()=>{ const [f,l]=D.monthRange(view); return Object.keys(L.entries).filter(k=>k>=f&&k<=l).length; };
  let draft={date:today,type:D.isSunday(today)?'أحد':'يوم عادي',church:''};
  function render(){
    const list=Object.keys(L.entries).sort().reverse().slice(0,12), p=monthStat();
    el.innerHTML=`<div class="gate">
      <div class="stats"><div class="st"><b>${D.n(streak())}</b><small>سلسلة الأحاد</small></div>
        <div class="st"><b>${p==null?'—':D.n(p)+'٪'}</b><small>التزام الشهر</small></div>
        <div class="st"><b>${D.n(monthCount())}</b><small>قداسات الشهر</small></div></div>
      <div class="datebar"><button data-a="pm">›</button><b>${D.parse(view+'-01').toLocaleDateString('ar-EG',{month:'long',year:'numeric'})}</b><button data-a="nm" ${view>=today.slice(0,7)?'disabled':''}>‹</button></div>
      <div class="card2"><div class="fld"><label>التاريخ</label><input type="date" id="ld" max="${today}" value="${draft.date}"></div>
        <div class="fld"><label>النوع</label><select id="lt">${LITURGY_TYPES.map(t=>`<option ${t===draft.type?'selected':''}>${t}</option>`).join('')}</select></div>
        <div class="fld"><label>الكنيسة <small>(اختياري)</small></label><input id="lc" maxlength="60" value="${esc(draft.church)}"></div>
        <button class="btn" data-a="add">تسجيل حضور قداس</button><div class="err" id="le"></div></div>
      <div class="card2">${list.length?list.map(k=>`<div class="row"><span>${D.fmt(k,{weekday:'short',day:'numeric',month:'long',year:'numeric'})} — ${esc(L.entries[k].type)}${L.entries[k].church?' — '+esc(L.entries[k].church):''}</span><button class="x" data-a="del" data-k="${k}">حذف</button></div>`).join(''):'<div class="hint">لا توجد قداسات مسجّلة بعد.</div>'}</div></div>`;
  }
  el.onchange=(e)=>{ if(e.target.id==='ld'){ draft.date=e.target.value; draft.type=D.isSunday(draft.date)?'أحد':draft.type==='أحد'?'يوم عادي':draft.type; render(); } if(e.target.id==='lt') draft.type=e.target.value; };
  el.oninput=(e)=>{ if(e.target.id==='lc') draft.church=e.target.value; };
  el.onclick=async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='pm') view=D.addMonth(view,-1); else if(a==='nm') view=D.addMonth(view,1);
    else if(a==='add'){
      if(!D.isKey(draft.date)||draft.date>today){ el.querySelector('#le').textContent='اختر تاريخاً صحيحاً (لا يمكن تسجيل تاريخ قادم)'; return; }
      L.entries[draft.date]={date:draft.date,type:draft.type,church:draft.church.trim().slice(0,60)};
      if(draft.date<L.start) L.start=draft.date; await save('liturgy',L);
      draft={date:today,type:D.isSunday(today)?'أحد':'يوم عادي',church:draft.church};
    }
    else if(a==='del'){ if(!confirm('حذف هذا السجل؟')) return; delete L.entries[t.dataset.k]; await save('liturgy',L); }
    render();
  };
  render();
}
