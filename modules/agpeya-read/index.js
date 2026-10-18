// (v9.33) قراءة الأجبية: قائمتان فوق (الصلاة ← الجزء/المزمور) + قراءة الجزء المختار أو الصلاة كلها.
// (تبويب «الأجبية» القديم = متابعة الصلوات اليومية، ده تبويب منفصل للنص.)
import * as L from '../../js/library.js';
import * as DB from '../../js/db.js';
import {esc} from '../../js/consts.js';

export async function mount(el){
  el.innerHTML='<div class="ph">جارٍ التحميل…</div>';
  let data; try{ data=await L.agpeya(); }catch(e){}
  const hours=data&&Array.isArray(data.hours)?data.hours:[];
  if(!hours.length){ el.innerHTML='<div class="ph">🕯️ نص الأجبية غير متاح دلوقتي.<br>افتح التطبيق مرة وانت متصل بالنت وهيتخزّن على جهازك.</div>'; return; }
  let fs=await L.getFont();
  const secs=(h)=>(h.sections||[]).filter(s=>s&&String(s.content||'').trim());   // لا نعرض قسم بدون نص
  let st={i:0,k:-1};   // k=-1 → الصلاة كلها
  try{ const s=await DB.get('agpLast'); if(s&&hours[s.i]){ st={i:s.i,k:(s.k>=0&&s.k<secs(hours[s.i]).length)?s.k:-1}; } }catch(e){}
  const save=()=>{ try{ DB.set('agpLast',{i:st.i,k:st.k}); }catch(e){} };
  const labels=(h)=>{ const seen={}, all=secs(h); const cnt={}; all.forEach(s=>{cnt[s.title]=(cnt[s.title]||0)+1;});
    return all.map(s=>{ const t=s.title||'جزء'; seen[t]=(seen[t]||0)+1; return cnt[t]>1?`${t} (${seen[t]})`:t; }); };
  const bar=()=>`<div class="rd-bar"><button class="btn sec" data-a="fm" aria-label="تصغير الخط">أ−</button><span class="hint" style="margin:0">حجم الخط</span><button class="btn sec" data-a="fp" aria-label="تكبير الخط">أ+</button></div>`;
  function render(){
    el.style.setProperty('--rd',fs+'rem');
    const h=hours[st.i], all=secs(h), lb=labels(h);
    const body=st.k<0?all:[all[st.k]];
    const atFirst=st.k<=0&&st.i<=0, atLast=(st.k<0||st.k>=all.length-1)&&st.i>=hours.length-1;
    el.innerHTML=`<div class="gate">
      <div class="rd-pick">
        <select id="hs" aria-label="الصلاة">${hours.map((x,i)=>`<option value="${i}"${i===st.i?' selected':''}>${esc(x.title)}</option>`).join('')}</select>
        <select id="ss" aria-label="الجزء أو المزمور"><option value="-1"${st.k<0?' selected':''}>— الصلاة كلها —</option>${lb.map((t,k)=>`<option value="${k}"${k===st.k?' selected':''}>${esc(t)}</option>`).join('')}</select>
      </div>
      <h3 class="ttl">${esc(st.k<0?h.title:lb[st.k])}</h3>${st.k>=0?`<div class="hint" style="margin-top:-4px">${esc(h.title)}</div>`:''}${bar()}
      ${body.map(s=>`<div class="card2 rd-txt"><b>${esc(s.title||'')}</b><div class="rd-pre">${esc(s.content||'')}</div></div>`).join('')}
      <div class="rd-nav"><button class="btn sec" data-a="pv" ${atFirst?'disabled':''}>› ${st.k<0?'الصلاة السابقة':'السابق'}</button><button class="btn sec" data-a="nx" ${atLast?'disabled':''}>${st.k<0?'الصلاة التالية':'التالي'} ‹</button></div></div>`;
    el.scrollTop=0; window.scrollTo&&window.scrollTo(0,0); save();
  }
  function step(d){
    const n=secs(hours[st.i]).length;
    if(st.k<0){ st.i=Math.min(hours.length-1,Math.max(0,st.i+d)); }
    else{ const k=st.k+d; if(k<0){ if(st.i>0){ st.i--; st.k=secs(hours[st.i]).length-1; } } else if(k>=n){ if(st.i<hours.length-1){ st.i++; st.k=0; } } else st.k=k; }
    render();
  }
  el.onchange=(e)=>{
    if(e.target.id==='hs'){ st={i:Number(e.target.value),k:-1}; render(); }
    else if(e.target.id==='ss'){ st.k=Number(e.target.value); render(); }
  };
  el.onclick=(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='nx') step(1); else if(a==='pv') step(-1);
    else if(a==='fm'||a==='fp'){ fs=Math.min(L.FONT.max,Math.max(L.FONT.min,+(fs+(a==='fp'?1:-1)*L.FONT.step).toFixed(2))); L.setFont(fs); el.style.setProperty('--rd',fs+'rem'); }
  };
  render();
}
