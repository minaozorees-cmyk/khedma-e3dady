// (v9.26) قراءة الأسفار: مكتبة نصوص الكتاب المقدس للمخدوم (قراءة فقط، بدون امتحانات).
// الفهرس صغير ومتخزّن مع التطبيق؛ كل سفر ملف مستقل بيتحمّل عند فتحه فقط (lazy) ويتخزّن للأوفلاين.
import * as L from '../../js/library.js';
import {esc} from '../../js/consts.js';
import {n} from '../../js/dates.js';

// تطبيع عربي للبحث: بدون تشكيل، وتوحيد الألف والياء والتاء المربوطة
const norm=(s)=>String(s).replace(/[ً-ٰٟ]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').trim();

export async function mount(el){
  el.innerHTML='<div class="ph">جارٍ التحميل…</div>';
  let idx=[]; try{ idx=await L.index(); }catch(e){}
  if(!idx.length){ el.innerHTML='<div class="ph">📜 المكتبة غير متاحة دلوقتي.<br>افتح التطبيق مرة وانت متصل بالنت.</div>'; return; }
  let fs=await L.getFont(), last=await L.getLast(), st={s:'list'}, bk=null;
  const sizeBar=()=>`<div class="rd-bar"><button class="btn sec" data-a="fm" aria-label="تصغير الخط">أ−</button><span class="hint" style="margin:0">حجم الخط</span><button class="btn sec" data-a="fp" aria-label="تكبير الخط">أ+</button></div>`;
  const group=(t,list)=>list.length?`<div class="rd-sec">${t}</div>`+list.map(b=>`<button class="card2 bk" data-a="book" data-id="${esc(b.id)}"><b>${esc(b.title)}</b><small>${n(b.chapters)} إصحاح</small></button>`).join(''):'';
  const listHtml=(q)=>{ const k=norm(q), f=k?idx.filter(b=>norm(b.title).includes(k)):idx;
    if(!f.length) return '<div class="hint" style="text-align:center">مفيش سفر بالاسم ده.</div>';
    return group('العهد القديم',f.filter(b=>b.testament==='ot'))+group('العهد الجديد',f.filter(b=>b.testament==='nt')); };
  const meta=(id)=>idx.find(b=>b.id===id);

  async function render(){
    el.style.setProperty('--rd',fs+'rem');
    if(st.s==='list'){
      const lm=last&&meta(last.id);
      el.innerHTML=`<div class="gate">
        ${lm?`<button class="card2 bk" data-a="resume"><b>📌 كمّل القراءة</b><small>${esc(lm.title)} — إصحاح ${n(last.n)}</small></button>`:''}
        <div class="fld"><input id="q" type="search" placeholder="ابحث عن سفر…" autocomplete="off" aria-label="بحث"></div>
        <div id="lst">${listHtml('')}</div></div>`;
    }
    else if(st.s==='chapters'){
      const m=meta(st.id);
      el.innerHTML=`<div class="gate"><h3 class="ttl">${esc(m.title)}</h3><div class="hint">اختر الإصحاح</div>
        <div class="chgrid">${Array.from({length:m.chapters},(_,i)=>`<button class="chb${last&&last.id===m.id&&last.n===i+1?' done':''}" data-a="chap" data-n="${i+1}">${n(i+1)}</button>`).join('')}</div>
        <button class="btn sec" data-a="toList">رجوع للأسفار</button></div>`;
    }
    else if(st.s==='read'){
      const m=meta(st.id), c=bk.chapters.find(x=>Number(x.n)===st.n);
      el.innerHTML=`<div class="gate"><h3 class="ttl">${esc(m.title)} — إصحاح ${n(st.n)}</h3>${sizeBar()}
        <div class="card2 rd-txt">${c?c.verses.map(v=>`<p class="ver"><sup>${esc(v[0])}</sup> ${esc(v[1])}</p>`).join(''):'<div class="warn">الإصحاح ده مش موجود.</div>'}</div>
        <div class="rd-nav"><button class="btn sec" data-a="prev" ${st.n<=1?'disabled':''}>› الإصحاح السابق</button><button class="btn sec" data-a="next" ${st.n>=m.chapters?'disabled':''}>الإصحاح التالي ‹</button></div>
        <button class="btn" data-a="toChap">إصحاحات ${esc(m.title)}</button></div>`;
    }
    else if(st.s==='loading') el.innerHTML='<div class="ph">جارٍ تحميل السفر…</div>';
    else if(st.s==='err') el.innerHTML=`<div class="gate"><div class="card2"><div class="warn">تعذّر تحميل السفر. أول مرة تفتحه لازم تكون متصل بالنت، وبعدها هيشتغل أوفلاين.</div></div>
      <button class="btn" data-a="retry">إعادة المحاولة</button><button class="btn sec" data-a="toList">رجوع</button></div>`;
    el.scrollTop=0; window.scrollTo&&window.scrollTo(0,0);
  }
  async function open(id,num){
    st={s:'loading'}; await render();
    try{ bk=await L.book(id); }catch(e){ st={s:'err',id,n:num}; return render(); }
    if(num){ st={s:'read',id,n:num}; last={id,n:num}; L.setLast(last); } else st={s:'chapters',id};
    return render();
  }
  el.onclick=async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='book') await open(t.dataset.id,0);
    else if(a==='resume') await open(last.id,last.n);
    else if(a==='chap') await open(st.id,Number(t.dataset.n));
    else if(a==='next') await open(st.id,st.n+1);
    else if(a==='prev') await open(st.id,st.n-1);
    else if(a==='toChap'){ st={s:'chapters',id:st.id}; await render(); }
    else if(a==='toList'){ st={s:'list'}; await render(); }
    else if(a==='retry') await open(st.id,st.n);
    else if(a==='fm'||a==='fp'){ fs=Math.min(L.FONT.max,Math.max(L.FONT.min,+(fs+(a==='fp'?1:-1)*L.FONT.step).toFixed(2))); L.setFont(fs); el.style.setProperty('--rd',fs+'rem'); }
  };
  el.oninput=(e)=>{ if(e.target.id==='q'){ const l=el.querySelector('#lst'); if(l) l.innerHTML=listHtml(e.target.value); } };
  render();
}
