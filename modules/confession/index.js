import * as db from '../../js/db.js';
import * as D from '../../js/dates.js';
import {save} from '../../js/store.js';
import {esc} from '../../js/consts.js';
import {confessionNext} from '../../js/reminders.js';
export async function mount(el){
  const today=D.key();
  let C=(await db.get('confession'))||{entries:{},interval:40,nextOverride:''};
  let draft={date:today,father:''};
  const when=(k)=>D.fmt(k,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  function render(){
    const {last,next}=confessionNext(C), keys=Object.keys(C.entries).sort().reverse().slice(0,12);
    const ago=last?D.diffDays(last,today):null, left=next?D.diffDays(today,next):null;
    el.innerHTML=`<div class="gate">
      <div class="hint">تُحفظ التواريخ فقط، على جهازك فقط، ولا تُرفع لأي سيرفر.</div>
      <div class="card2"><div class="k">آخر اعتراف</div><div>${last?when(last)+' <small>(منذ '+D.n(ago)+' يوم)</small>':'لم يُسجَّل بعد'}</div>
        <div class="k">الموعد القادم</div><div>${next?when(next)+' <small>('+(left<0?'متأخر '+D.n(-left)+' يوم':left===0?'اليوم':'بعد '+D.n(left)+' يوم')+')</small>':'—'}</div></div>
      <div class="card2"><div class="fld"><label>تاريخ الاعتراف</label><input type="date" id="cd" max="${today}" value="${draft.date}"></div>
        <div class="fld"><label>اسم الأب <small>(اختياري)</small></label><input id="cf" maxlength="60" value="${esc(draft.father)}"></div>
        <button class="btn" data-a="add">تسجيل اعتراف</button><div class="err" id="ce"></div></div>
      <div class="card2"><div class="fld"><label>تذكير بعد كم يوم من آخر اعتراف؟</label><input type="number" id="ci" min="1" max="365" value="${C.interval}" dir="ltr"></div>
        <div class="fld"><label>موعد محدد قادم <small>(اختياري، يحل محل الحساب التلقائي)</small></label><input type="date" id="co" min="${today}" value="${C.nextOverride||''}"></div></div>
      <div class="card2">${keys.length?keys.map(k=>`<div class="row"><span>${D.fmt(k,{day:'numeric',month:'long',year:'numeric'})}${C.entries[k].father?' — '+esc(C.entries[k].father):''}</span><button class="x" data-a="del" data-k="${k}">حذف</button></div>`).join(''):'<div class="hint">لا توجد سجلات.</div>'}</div></div>`;
  }
  el.onchange=async(e)=>{
    if(e.target.id==='cd') draft.date=e.target.value;
    if(e.target.id==='ci'){ const v=Math.floor(Number(e.target.value)); if(v>=1&&v<=365){ C.interval=v; await save('confession',C); } render(); }
    if(e.target.id==='co'){ C.nextOverride=D.isKey(e.target.value)?e.target.value:''; await save('confession',C); render(); }
  };
  el.oninput=(e)=>{ if(e.target.id==='cf') draft.father=e.target.value; };
  el.onclick=async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t) return;
    if(t.dataset.a==='add'){
      if(!D.isKey(draft.date)||draft.date>today){ el.querySelector('#ce').textContent='اختر تاريخاً صحيحاً (لا يمكن تسجيل تاريخ قادم)'; return; }
      C.entries[draft.date]={date:draft.date,father:draft.father.trim().slice(0,60)};
      if(C.nextOverride&&C.nextOverride<=draft.date) C.nextOverride='';
      await save('confession',C); draft={date:today,father:draft.father};
    } else if(t.dataset.a==='del'){ if(!confirm('حذف هذا السجل؟')) return; delete C.entries[t.dataset.k]; await save('confession',C); }
    render();
  };
  render();
}
