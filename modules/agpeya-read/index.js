// (v9.26) قراءة الأجبية: نصوص الساعات (باكر … نصف الليل) من المكتبة، قراءة فقط.
// (تبويب «الأجبية» القديم = متابعة الصلوات اليومية، ده تبويب منفصل للنص.)
import * as L from '../../js/library.js';
import {esc} from '../../js/consts.js';
import {n} from '../../js/dates.js';

export async function mount(el){
  el.innerHTML='<div class="ph">جارٍ التحميل…</div>';
  let data; try{ data=await L.agpeya(); }catch(e){}
  const hours=data&&Array.isArray(data.hours)?data.hours:[];
  if(!hours.length){ el.innerHTML='<div class="ph">🕯️ نص الأجبية غير متاح دلوقتي.<br>افتح التطبيق مرة وانت متصل بالنت وهيتخزّن على جهازك.</div>'; return; }
  let fs=await L.getFont(), st={s:'list'};
  const secs=(h)=>(h.sections||[]).filter(s=>s&&String(s.content||'').trim());   // v9.27: لا نعرض قسم بدون نص
  const bar=()=>`<div class="rd-bar"><button class="btn sec" data-a="fm" aria-label="تصغير الخط">أ−</button><span class="hint" style="margin:0">حجم الخط</span><button class="btn sec" data-a="fp" aria-label="تكبير الخط">أ+</button></div>`;
  function render(){
    el.style.setProperty('--rd',fs+'rem');
    if(st.s==='list'){
      el.innerHTML=`<div class="gate">${hours.map((h,i)=>`<button class="card2 bk" data-a="hour" data-i="${i}"><b>${esc(h.title)}</b><small>${n(secs(h).length)} قسم</small></button>`).join('')}</div>`;
    } else {
      const h=hours[st.i], last=hours.length-1;
      el.innerHTML=`<div class="gate"><h3 class="ttl">${esc(h.title)}</h3>${bar()}
        ${secs(h).map(s=>`<div class="card2 rd-txt"><b>${esc(s.title||'')}</b><div class="rd-pre">${esc(s.content||'')}</div></div>`).join('')}
        <div class="rd-nav"><button class="btn sec" data-a="pv" ${st.i<=0?'disabled':''}>› الساعة السابقة</button><button class="btn sec" data-a="nx" ${st.i>=last?'disabled':''}>الساعة التالية ‹</button></div>
        <button class="btn" data-a="toList">كل الساعات</button></div>`;
    }
    el.scrollTop=0; window.scrollTo&&window.scrollTo(0,0);
  }
  el.onclick=(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='hour'){ st={s:'read',i:Number(t.dataset.i)}; render(); }
    else if(a==='nx'){ st.i++; render(); }
    else if(a==='pv'){ st.i--; render(); }
    else if(a==='toList'){ st={s:'list'}; render(); }
    else if(a==='fm'||a==='fp'){ fs=Math.min(L.FONT.max,Math.max(L.FONT.min,+(fs+(a==='fp'?1:-1)*L.FONT.step).toFixed(2))); L.setFont(fs); el.style.setProperty('--rd',fs+'rem'); }
  };
  render();
}
