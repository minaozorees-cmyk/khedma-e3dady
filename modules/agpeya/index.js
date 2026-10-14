import * as db from '../../js/db.js';
import * as D from '../../js/dates.js';
import {save} from '../../js/store.js';
import {PRAYERS} from '../../js/consts.js';
const DOW=['سبت','أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة'];
export async function mount(el){
  const today=D.key();
  let S=(await db.get('agpeya'))||{days:{},streakMin:1};
  if(!S.start){ S.start=today; await db.set('agpeya',S); }
  let sel=today, view=today.slice(0,7);
  const cnt=(k)=>(S.days[k]||[]).length;
  const pct=(from,to)=>{ from=from>S.start?from:S.start; if(from>to) return null; const len=D.diffDays(from,to)+1; let s=0; for(let i=0;i<len;i++) s+=cnt(D.addDays(from,i)); return Math.round(100*s/(7*len)); };
  const streak=()=>{ let k=cnt(today)>=S.streakMin?today:D.addDays(today,-1), s=0; while(s<4000&&cnt(k)>=S.streakMin){ s++; k=D.addDays(k,-1); } return s; };
  const P=(v)=>v==null?'—':D.n(v)+'٪';

  function render(){
    const [mf,ml]=D.monthRange(view), mTo=ml<today?ml:today;
    const lead=(D.parse(mf).getDay()+1)%7, len=D.diffDays(mf,ml)+1;
    let grid=DOW.map(d=>`<div class="dw">${d}</div>`).join('')+'<div></div>'.repeat(lead);
    for(let i=0;i<len;i++){ const k=D.addDays(mf,i), c=cnt(k), fut=k>today;
      grid+=`<button class="dc${k===sel?' sel':''}" data-a="sel" data-k="${k}" ${fut?'disabled':''} style="background:rgba(201,168,76,${(c/7*.75).toFixed(2)})">${D.n(i+1)}</button>`; }
    let wk=''; for(let i=6;i>=0;i--){ const k=D.addDays(today,-i);
      wk+=`<button class="wc${k===sel?' sel':''}" data-a="sel" data-k="${k}"><small>${DOW[(D.parse(k).getDay()+1)%7]}</small><b>${D.n(cnt(k))}</b></button>`; }
    const done=S.days[sel]||[];
    el.innerHTML=`<div class="gate">
      <div class="datebar"><button data-a="pd">السابق</button><div><b>${D.fmt(sel)}</b>${sel===today?' <small>(اليوم)</small>':''}</div><button data-a="nd" ${sel>=today?'disabled':''}>التالي</button></div>
      <div class="prayers">${PRAYERS.map(([id,t])=>`<button class="pb${done.includes(id)?' on':''}" data-a="tog" data-id="${id}">${done.includes(id)?'✔ ':''}${t}</button>`).join('')}</div>
      <div class="hint" style="text-align:center">${D.n(done.length)} / ${D.n(7)}</div>
      <div class="stats"><div class="st"><b>${D.n(streak())}</b><small>سلسلة الأيام</small></div>
        <div class="st"><b>${P(pct(D.addDays(today,-6),today))}</b><small>التزام الأسبوع</small></div>
        <div class="st"><b>${P(pct(mf,mTo))}</b><small>التزام الشهر</small></div></div>
      <div class="week">${wk}</div>
      <div class="datebar"><button data-a="pm">›</button><b>${D.parse(view+'-01').toLocaleDateString('ar-EG',{month:'long',year:'numeric'})}</b><button data-a="nm" ${view>=today.slice(0,7)?'disabled':''}>‹</button></div>
      <div class="mgrid">${grid}</div>
      <div class="fld" style="margin-top:14px"><label>يُحسب اليوم ضمن السلسلة إذا صلّيت على الأقل</label>
        <select id="sm">${[1,2,3,4,5,6,7].map(i=>`<option value="${i}" ${i===S.streakMin?'selected':''}>${D.n(i)} صلاة</option>`).join('')}</select></div></div>`;
  }
  el.onclick=async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='tog'){ const id=t.dataset.id, cur=S.days[sel]||[]; const nx=cur.includes(id)?cur.filter(x=>x!==id):[...cur,id];
      if(nx.length) S.days[sel]=nx; else delete S.days[sel]; if(sel<S.start) S.start=sel; await save('agpeya',S); }
    else if(a==='sel'){ sel=t.dataset.k; }
    else if(a==='pd'){ sel=D.addDays(sel,-1); view=sel.slice(0,7); }
    else if(a==='nd'){ sel=D.addDays(sel,1); view=sel.slice(0,7); }
    else if(a==='pm'){ view=D.addMonth(view,-1); }
    else if(a==='nm'){ view=D.addMonth(view,1); }
    render();
  };
  el.onchange=async(e)=>{ if(e.target.id==='sm'){ S.streakMin=Number(e.target.value); await save('agpeya',S); render(); } };
  render();
}
