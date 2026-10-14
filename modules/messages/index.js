// وحدة الرسائل (v9.5): المخدوم = صندوق وارد، الخادم/الكاهن/المالك = إرسال + المرسلة (staff.js).
import {esc} from '../../js/consts.js';
import * as IB from '../../js/inbox.js';
const fmt=(t)=>new Date(t).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'});
const FROM={priest:'⛪ الكاهن المسؤول',owner:'الإدارة',servant:'الخدمة'};

export async function mount(el,{role}={}){
  if(role!=='student'){ const m=await import('./staff.js'); return m.mount(el,{role}); }
  const paint=(box,fresh)=>{
    const newIds=new Set(box.list.filter(m=>!m.is_read).map(m=>m.id));
    el.innerHTML=`<div class="gate">${box.fromCache&&box.at?`<div class="hint">آخر تحديث: ${fmt(box.at)} (بدون اتصال)</div>`:''}
      ${box.list.length?box.list.map(m=>{
        const pr=m.sender_role==='priest';
        return `<div class="card2" style="${pr?'border-color:var(--gold);box-shadow:var(--shadow-gold)':''}${m.urgent?';border-color:var(--rust)':''}">
          <div class="row" style="border:0;padding:0"><span><b>${m.pinned?'📌 ':''}${m.urgent?'🔴 ':''}${esc(m.title)}</b></span>${newIds.has(m.id)?'<span class="badge on">جديد</span>':''}</div>
          <div class="k">${esc(FROM[m.sender_role]||'')} · ${fmt(m.created_at)}</div>
          <p class="ver" style="white-space:pre-wrap">${esc(m.body)}</p></div>`; }).join(''):'<div class="ph">لا توجد رسائل.</div>'}</div>`;
    return [...newIds];
  };
  let box=await IB.cached(); let ids=paint(box);
  const r=await IB.refresh();
  if(r){ box=r; ids=paint(box); }
  if(ids.length) await IB.markRead(ids);      // بعد العرض: يتصفّر العدّاد، والنقطة "جديد" فضلت ظاهرة في هذه الزيارة
}
