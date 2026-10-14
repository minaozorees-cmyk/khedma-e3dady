// الافتقاد (v9.6): مين محتاج اتصال؟ (مش داخل التطبيق / غياب / مش بيحل امتحانات) + واتساب + تسجيل "تم الافتقاد".
import {api,errMsg,fmtD,dayDiff,SB,waLink,telLink} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
const GRADES=['الأول الإعدادي','الثاني الإعدادي','الثالث الإعدادي'];
const DEF_MSG='سلام ونعمة يا {الاسم} ❤️ افتقدناك في خدمة إعدادي. عامل إيه؟ ربنا يبارك حياتك.';
export async function mount(el){
  const S={rows:[],days:14,grade:'',why:'any',hideDone:true};
  let tpl; try{ tpl=localStorage.getItem('fuMsg')||DEF_MSG; }catch(e){ tpl=DEF_MSG; }
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.innerHTML=''; el.appendChild(root);
  const $=(s)=>root.querySelector(s), say=(t,bad)=>{ const m=$('#msg'); if(m) m.innerHTML=t?`<div class="${bad?'err':'hint'}">${esc(t)}</div>`:''; };
  root.innerHTML=`<div class="card2">
    <div class="fld"><label for="fg">الصف</label><select id="fg"><option value="">كل الصفوف</option>${GRADES.map(g=>`<option>${g}</option>`).join('')}</select></div>
    <div class="fld"><label for="fw">السبب</label><select id="fw"><option value="any">أي سبب (غياب أو مش بيدخل)</option><option value="app">مش بيدخل التطبيق</option><option value="abs">غياب (مرتين+ آخر ٣٠ يوم)</option><option value="exam">مش بيحل امتحانات</option></select></div>
    <div class="fld"><label for="fd">المدة</label><select id="fd"><option value="7">٧ أيام</option><option value="14" selected>١٤ يوم</option><option value="30">٣٠ يوم</option></select></div>
    <label class="chk"><input type="checkbox" id="fh" checked> إخفاء اللي اتفتقد آخر ٧ أيام</label>
    <div class="fld"><label for="ft">نص رسالة الواتساب <small>({الاسم} = الاسم الأول)</small></label><input id="ft" value="${esc(tpl)}" maxlength="300"></div></div>
    <div id="msg"></div><div id="list"></div><button class="btn sec" data-a="reload">تحديث</button>`;
  async function load(){
    say('جارٍ التحميل…');
    try{ S.rows=await api('/rest/v1/followup_staff?select=*&order=name.asc&limit=1000'); say(''); }catch(e){ say(errMsg(e),true); }
    paint();
  }
  function calc(r){
    const N=S.days, seen=[r.last_seen,r.last_exam].filter(Boolean).sort().pop();
    const dSeen=seen?dayDiff(seen):null, dExam=r.last_exam?dayDiff(r.last_exam):null, why=[];
    const app=!seen||dSeen>=N, abs=Number(r.absent_30)>=2, exam=!r.last_exam||dExam>=N;
    if(app) why.push(seen?`آخر دخول من ${dSeen} يوم`:'لم يدخل التطبيق بعد');
    if(abs) why.push(`غاب ${r.absent_30} مرات آخر ٣٠ يوم`);
    if(S.why==='exam'&&exam) why.push(r.last_exam?`آخر امتحان من ${dExam} يوم`:'لم يحل أي امتحان');
    const hit=S.why==='any'?(app||abs):S.why==='app'?app:S.why==='abs'?abs:exam;
    return {hit,why,score:dSeen==null?9999:dSeen};
  }
  function paint(){
    const rows=S.rows.filter(r=>(!S.grade||r.grade===S.grade)&&!(S.hideDone&&r.last_followup&&dayDiff(r.last_followup)<7))
      .map(r=>({r,...calc(r)})).filter(x=>x.hit).sort((a,b)=>b.score-a.score);
    $('#list').innerHTML=`<div class="hint">${rows.length} مخدوم محتاج افتقاد</div>`+rows.map(({r,why})=>{
      const msg=tpl.replace('{الاسم}',r.name.split(' ')[0]), w1=waLink(r.phone,msg), w2=waLink(r.guardian_phone,msg);
      return `<div class="card2"><div class="row" style="border:0;padding:0"><b>${esc(r.name)}</b><small>${esc(r.grade)}</small></div>
        <div class="k">${esc(why.join(' · '))}</div>
        <div class="k">آخر حضور: ${r.last_present?fmtD(r.last_present):'—'} · آخر افتقاد: ${r.last_followup?fmtD(r.last_followup):'—'}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          ${w1?`<a class="btn sec" style="${SB}" target="_blank" rel="noopener" href="${w1}">📱 واتساب</a>`:''}
          ${r.guardian_phone&&w2?`<a class="btn sec" style="${SB}" target="_blank" rel="noopener" href="${w2}">👪 ولي الأمر</a>`:''}
          ${telLink(r.phone)?`<a class="btn sec" style="${SB}" href="${telLink(r.phone)}">📞 اتصال</a>`:''}
          <button class="btn" style="${SB}" data-a="done" data-id="${r.id}">✓ تم الافتقاد</button></div></div>`; }).join('');
  }
  root.addEventListener('change',(e)=>{
    const t=e.target;
    if(t.id==='fg') S.grade=t.value; else if(t.id==='fw') S.why=t.value; else if(t.id==='fd') S.days=Number(t.value); else if(t.id==='fh') S.hideDone=t.checked; else return;
    paint();
  });
  root.addEventListener('input',(e)=>{ if(e.target.id==='ft'){ tpl=e.target.value||DEF_MSG; try{ localStorage.setItem('fuMsg',tpl); }catch(x){} paint(); } });
  root.addEventListener('click',async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return;
    if(t.dataset.a==='reload'){ load(); return; }
    if(t.dataset.a==='done'){
      const note=prompt('ملاحظة عن الافتقاد (اختياري):'); if(note===null) return;
      t.disabled=true;
      try{
        await api('/rest/v1/followups',{method:'POST',prefer:'return=minimal',body:{profile_id:t.dataset.id,note:note.trim()||null}});
        const r=S.rows.find(x=>x.id===t.dataset.id); if(r) r.last_followup=new Date().toISOString();
        say('اتسجّل ✅'); paint();
      }catch(x){ say(errMsg(x),true); t.disabled=false; }
    }
  });
  await load();
}
