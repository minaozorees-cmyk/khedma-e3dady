// متابعة المسابقة (v9.36): مين حلّ ومين لم يحلّ في مدة تختارها (+ سفر/إصحاح/صف/جنس) مع اتصال وواتساب للي لم يحلّوا.
// البيانات من results/profiles/followup_staff، والنطاق (المسندين للخادم) يفرضه RLS في Supabase.
import {api,all,errMsg,fmtD,SB,waLink,telLink,today} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
const GRADES=['الأول الإعدادي','الثاني الإعدادي','الثالث الإعدادي'];
const DEF_MSG='سلام ونعمة يا {الاسم} ❤️ فاكّرك بالمسابقة، ربنا يبارك حياتك ويفتح قلبك لكلمته.';
const ymd=(d)=>new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
const addDays=(s,n)=>{ const d=new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return ymd(d); };
const PRESETS=[['today','اليوم'],['yest','أمس'],['7','آخر ٧ أيام'],['30','آخر ٣٠ يوم'],['custom','من تاريخ لتاريخ']];
export async function mount(el,{role}={}){
  if(!['servant','priest','owner'].includes(role)){ el.innerHTML='<div class="ph">الصفحة غير متاحة.</div>'; return; }
  const S={preset:'7',from:'',to:'',book:'',chap:'',grade:'',gender:'',members:[],books:[],chapters:[],results:[],loaded:false};
  let tpl; try{ tpl=localStorage.getItem('ctMsg')||DEF_MSG; }catch(e){ tpl=DEF_MSG; }
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='760px'; el.replaceChildren(root);
  const $=(s)=>root.querySelector(s), say=(t,bad)=>{ const m=$('#msg'); if(m) m.innerHTML=t?`<div class="${bad?'err':'hint'}">${esc(t)}</div>`:''; };
  function range(){
    const t=today();
    if(S.preset==='today') return [t,t];
    if(S.preset==='yest') return [addDays(t,-1),addDays(t,-1)];
    if(S.preset==='7') return [addDays(t,-6),t];
    if(S.preset==='30') return [addDays(t,-29),t];
    return [S.from||t,S.to||S.from||t];
  }
  function shell(){
    const [f,t]=range();
    root.innerHTML=`<div class="card2"><b>🎯 متابعة المسابقة</b>
      <div class="fld"><label for="cp">المدة</label><select id="cp">${PRESETS.map(([v,l])=>`<option value="${v}"${S.preset===v?' selected':''}>${l}</option>`).join('')}</select></div>
      ${S.preset==='custom'?`<div style="display:flex;gap:8px"><div class="fld" style="flex:1"><label for="cf">من</label><input id="cf" type="date" value="${f}"></div><div class="fld" style="flex:1"><label for="ct">إلى</label><input id="ct" type="date" value="${t}"></div></div>`:`<div class="hint">من ${fmtD(f+'T12:00:00')} إلى ${fmtD(t+'T12:00:00')}</div>`}
      <div class="fld"><label for="cb">السفر</label><select id="cb"><option value="">أي سفر</option>${S.books.map(b=>`<option value="${esc(b.id)}"${S.book===b.id?' selected':''}>${esc(b.title||b.id)}</option>`).join('')}</select></div>
      <div class="fld"><label for="cc">الإصحاح</label><select id="cc"${S.book?'':' disabled'}><option value="">أي إصحاح</option>${S.chapters.map(n=>`<option value="${n}"${String(S.chap)===String(n)?' selected':''}>إصحاح ${n}</option>`).join('')}</select></div>
      <div style="display:flex;gap:8px"><div class="fld" style="flex:1"><label for="cg">الصف</label><select id="cg"><option value="">كل الصفوف</option>${GRADES.map(g=>`<option${S.grade===g?' selected':''}>${g}</option>`).join('')}</select></div>
      <div class="fld" style="flex:1"><label for="cx">الجنس</label><select id="cx"><option value="">ولد وبنت</option><option value="ولد"${S.gender==='ولد'?' selected':''}>ولد</option><option value="بنت"${S.gender==='بنت'?' selected':''}>بنت</option></select></div></div>
      <div class="fld"><label for="cm">نص رسالة الواتساب <small>({الاسم} = الاسم الأول)</small></label><input id="cm" maxlength="300" value="${esc(tpl)}"></div>
      <button class="btn" data-a="go">عرض</button></div>
      <div id="msg"></div><div id="out"></div>`;
  }
  async function boot(){
    root.innerHTML='<div class="ph">جارٍ التحميل…</div>';
    try{
      const [m,c,b]=await Promise.all([
        all('/rest/v1/profiles?select=id,name,grade,gender&deleted_at=is.null&archived_at=is.null&order=name.asc'),
        all('/rest/v1/followup_staff?select=id,phone,guardian_phone&order=id.asc'),
        api('/rest/v1/books?select=id,title&order=title.asc&limit=200')
      ]);
      const ph=new Map(c.map(x=>[x.id,x])); S.members=m.map(p=>({...p,phone:(ph.get(p.id)||{}).phone,gp:(ph.get(p.id)||{}).guardian_phone})); S.books=b||[];
    }catch(e){ root.innerHTML=`<div class="card2"><div class="err">${esc(errMsg(e))}</div><button class="btn sec" data-a="boot">إعادة المحاولة</button></div>`; return; }
    shell();
  }
  async function loadChapters(){
    S.chapters=[]; if(!S.book) return;
    try{
      const r=await api(`/rest/v1/books?id=eq.${encodeURIComponent(S.book)}&select=chs:data->chapters&limit=1`);
      const arr=(r&&r[0]&&r[0].chs)||[]; S.chapters=arr.map(c=>c&&(c.chapterNum??c.n??c.num??c.chapter)).filter(x=>Number.isFinite(Number(x))).map(Number);
      S.chapters=[...new Set(S.chapters)].sort((a,b)=>a-b);
    }catch(e){}
    if(!S.chapters.length){   // احتياطي: الإصحاحات اللي ليها نتائج
      try{ const r=await api(`/rest/v1/results?book_id=eq.${encodeURIComponent(S.book)}&select=chapter_num&order=chapter_num.asc&limit=1000`); S.chapters=[...new Set((r||[]).map(x=>x.chapter_num))]; }catch(e){}
    }
  }
  async function run(){
    const [f,t]=range(); if(f>t){ say('تاريخ البداية بعد تاريخ النهاية.',true); return; }
    const a=new Date(f+'T00:00:00').toISOString(), z=new Date(addDays(t,1)+'T00:00:00').toISOString();
    say('جارٍ التحميل…'); $('#out').innerHTML='';
    let q=`/rest/v1/results?select=profile_id,book_id,chapter_num,score,total,attempt_no,attempted_at&attempted_at=gte.${encodeURIComponent(a)}&attempted_at=lt.${encodeURIComponent(z)}&order=attempted_at.asc,id.asc`;
    if(S.book) q+=`&book_id=eq.${encodeURIComponent(S.book)}`; if(S.chap) q+=`&chapter_num=eq.${Number(S.chap)}`;
    try{ S.results=await all(q); }catch(e){ say(errMsg(e),true); return; }
    say(''); paint(f,t);
  }
  function paint(f,t){
    const mem=S.members.filter(p=>(!S.grade||p.grade===S.grade)&&(!S.gender||p.gender===S.gender));
    const by=new Map(); for(const r of S.results){ (by.get(r.profile_id)||by.set(r.profile_id,[]).get(r.profile_id)).push(r); }
    const solved=[], not=[];
    for(const p of mem){ const rs=by.get(p.id); if(rs&&rs.length){ solved.push({p,rs}); } else not.push(p); }
    const pct=mem.length?Math.round(100*solved.length/mem.length):0;
    const what=S.book?(S.books.find(b=>b.id===S.book)||{}).title||S.book:'أي سفر', ch=S.chap?` — إصحاح ${S.chap}`:'';
    const line=({p,rs})=>{
      const best=new Map(); for(const r of rs){ const k=r.book_id+'|'+r.chapter_num; const o=best.get(k); if(!o||r.attempt_no<o.attempt_no) best.set(k,r); }
      const arr=[...best.values()], last=rs[rs.length-1];
      const info=S.chap&&arr.length===1?`${arr[0].score} / ${arr[0].total}`:`${arr.length} إصحاح · متوسط ${Math.round(arr.reduce((n,r)=>n+100*r.score/Math.max(1,r.total),0)/arr.length)}%`;
      return `<div class="row"><span>${esc(p.name)} <small class="k">· ${esc(p.grade)}</small><br><small class="k">آخر محاولة ${fmtD(last.attempted_at)}</small></span><b>${info}</b></div>`; };
    const miss=(p)=>{ const msg=tpl.replace('{الاسم}',p.name.split(' ')[0]), w1=waLink(p.phone,msg), w2=waLink(p.gp,msg);
      return `<div class="card2"><div class="row" style="border:0;padding:0"><b>${esc(p.name)}</b><small>${esc(p.grade)}</small></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        ${w1?`<a class="btn sec" style="${SB}" target="_blank" rel="noopener" href="${w1}">📱 واتساب</a>`:''}${w2?`<a class="btn sec" style="${SB}" target="_blank" rel="noopener" href="${w2}">👪 ولي الأمر</a>`:''}${telLink(p.phone)?`<a class="btn sec" style="${SB}" href="${telLink(p.phone)}">📞 اتصال</a>`:''}${(!w1&&!w2&&!telLink(p.phone))?'<small class="k">لا يوجد رقم مسجّل</small>':''}</div></div>`; };
    $('#out').innerHTML=`<div class="card2" style="background:linear-gradient(135deg,rgba(201,168,76,.16),rgba(201,168,76,.03))"><div class="stats">
        <div class="st"><b>${solved.length} / ${mem.length}</b><small>حلّوا (${pct}٪)</small></div><div class="st"><b>${not.length}</b><small>لم يحلّوا</small></div></div>
      <div class="hint">${esc(what)}${esc(ch)} · من ${fmtD(f+'T12:00:00')} إلى ${fmtD(t+'T12:00:00')}</div></div>
      <div class="card2"><b>✅ حلّوا (${solved.length})</b>${solved.length?solved.map(line).join(''):'<p class="hint">لا أحد في المدة دي.</p>'}</div>
      <div class="card2"><b>❌ لم يحلّوا (${not.length})</b><p class="hint">«لم يحلّوا» = لا توجد نتيجة مرفوعة. لو مخدوم حلّ أوفلاين ولسه ما اترفعتش نتيجته هيظهر هنا مؤقتاً.</p></div>
      ${not.map(miss).join('')}`;
  }
  root.addEventListener('change',async(e)=>{
    const t=e.target, id=t.id;
    if(id==='cp'){ S.preset=t.value; shell(); }
    else if(id==='cf'){ S.from=t.value; if(S.to&&S.to<S.from) S.to=S.from; }
    else if(id==='ct'){ S.to=t.value; }
    else if(id==='cb'){ S.book=t.value; S.chap=''; await loadChapters(); shell(); }
    else if(id==='cc') S.chap=t.value;
    else if(id==='cg') S.grade=t.value; else if(id==='cx') S.gender=t.value;
    else if(id==='cm'){ tpl=t.value||DEF_MSG; try{ localStorage.setItem('ctMsg',tpl); }catch(x){} }
  });
  root.addEventListener('click',(e)=>{ const t=e.target.closest('[data-a]'); if(!t) return; if(t.dataset.a==='go') run(); else if(t.dataset.a==='boot') boot(); });
  boot();
}
