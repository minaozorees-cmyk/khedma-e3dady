// أدوات المالك (v9.6): نسخة احتياطية كاملة + ترقية الصفوف آخر السنة + (v9.24) زر تنشيط Supabase يدوياً. للمالك فقط (الحماية الفعلية: RLS + promote_grades).
import {api,all,errMsg,fmt,dayDiff,SB} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
const GR=['الأول الإعدادي','الثاني الإعدادي','الثالث الإعدادي'];
const TABLES=[['profiles','id'],['results','id'],['sessions','id'],['book_opens','id'],['books','id'],['messages','id'],['message_targets','message_id,profile_id'],['message_reads','message_id,profile_id'],
  ['meetings','id'],['attendance','meeting_id,profile_id'],['followups','id'],['requests','id'],['audit_log','id'],['app_meta','key']];
const lastKA=()=>{ try{ return localStorage.getItem('lastKeepAlive')||''; }catch(e){ return ''; } };
const lastBk=()=>{ try{ return localStorage.getItem('lastBackup')||''; }catch(e){ return ''; } };
function download(name,text,type){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500);
}
const csvCell=(v)=>{ const s=v==null?'':String(v); return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
const toCsv=(cols,rows)=>'\uFEFF'+[cols.map(c=>c[1]).join(','),...rows.map(r=>cols.map(c=>csvCell(r[c[0]])).join(','))].join('\r\n');
const stamp=()=>new Date().toISOString().slice(0,10);

export async function mount(el,{role}={}){
  if(role!=='owner'){ el.innerHTML='<div class="ph">هذه الصفحة للمالك فقط.</div>'; return; }
  const S={profiles:[],last:'',busy:false};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.innerHTML=''; el.appendChild(root);
  const $=(s)=>root.querySelector(s), say=(t,bad)=>{ const m=$('#msg'); if(m) m.innerHTML=t?`<div class="${bad?'err':'hint'}">${esc(t)}</div>`:''; };
  const lbl=()=>{ const d=new Date(), y=d.getFullYear(); return d.getMonth()>=5?`${y}-${y+1}`:`${y-1}-${y}`; };   // السنة الدراسية المنتهية (تُعدَّل يدوياً)
  function paint(){
    const cnt=(g)=>S.profiles.filter(p=>!p.deleted_at&&!p.archived_at&&p.grade===g).length, bk=lastBk(), old=!bk||dayDiff(bk)>30;
    root.innerHTML=`<div id="msg"></div>
      <div class="card2"><b>💾 نسخة احتياطية كاملة</b>
        <p class="hint">${bk?'آخر نسخة: '+fmt(bk):'لم تُؤخذ نسخة بعد.'}</p>${old?'<div class="warn">خد نسخة احتياطية (مرة كل شهر على الأقل). الخطة المجانية في Supabase مفيهاش نسخ تلقائية.</div>':''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn" style="${SB}" data-a="json">تنزيل كل البيانات (JSON)</button><button class="btn sec" style="${SB}" data-a="csvp">CSV المخدومين</button><button class="btn sec" style="${SB}" data-a="csvr">CSV النتائج</button></div>
        <p class="warn" style="margin-top:8px">الملفات فيها بيانات شخصية وأكواد استرجاع، احفظها في مكان آمن ولا تشاركها. النسخة لا تشمل كلمات سر الحسابات.</p></div>
      <div class="card2"><b>🟢 تنشيط Supabase (Keep-Alive)</b>
        <p class="hint">${lastKA()?'آخر طلب يدوي من الجهاز ده: '+fmt(lastKA()):'لم يُرسل طلب يدوي من الجهاز ده.'}</p>
        <p class="hint">بيبعت طلب قراءة خفيف عشان المشروع المجاني ما يتوقفش لو فضل ٧ أيام من غير نشاط. الـGitHub Action بيعمله تلقائياً كل ٣ أيام، والزر ده للتأكد أو للطوارئ.</p>
        <button class="btn sec" style="${SB}" data-a="ping">إرسال الآن</button></div>
      <div class="card2"><b>🎓 ترقية الصفوف (آخر السنة)</b>
        <p class="hint">الأول ← الثاني · الثاني ← الثالث · الثالث ← <b>يتأرشفوا</b> (مش بيتمسحوا؛ بيختفوا من الطاقم والمراسلات ويفضلوا عندك في «مؤرشف»).</p>
        <div class="stats">${GR.map(g=>`<div class="st"><b>${cnt(g)}</b><small>${g.replace(' الإعدادي','')}</small></div>`).join('')}</div>
        <p class="hint">${S.last?'آخر ترقية اتنفذت لسنة: '+esc(S.last):'لم تُنفَّذ ترقية بعد.'}</p>
        <div class="fld"><label for="yl">السنة الدراسية المنتهية</label><input id="yl" value="${esc(lbl())}" maxlength="20" dir="ltr"></div>
        <div class="fld"><label for="yc">اكتب كلمة «ترقية» للتأكيد</label><input id="yc" autocomplete="off"></div>
        <div class="err" id="yerr"></div><button class="x" data-a="promote">تنفيذ الترقية</button></div>`;
  }
  async function load(){
    try{
      S.profiles=await all('/rest/v1/profiles?select=id,grade,deleted_at,archived_at&order=id.asc');
      const m=await api('/rest/v1/app_meta?select=value&key=eq.last_promotion'); S.last=(m&&m[0]&&m[0].value)||'';
    }catch(e){ say(errMsg(e),true); }
    paint();
  }
  async function dump(){
    const out={app:'خدمة إعدادي',exported_at:new Date().toISOString(),version:'v9.6',tables:{}};
    for(const [t,o] of TABLES){ say(`جارٍ تحميل ${t}…`); out.tables[t]=await all(`/rest/v1/${t}?select=*&order=${o}`); }
    return out;
  }
  async function run(fn,btn){
    if(S.busy) return; S.busy=true; btn.disabled=true;
    try{ await fn(); }catch(e){ say(errMsg(e),true); }
    S.busy=false; btn.disabled=false;
  }
  root.addEventListener('click',(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='json') run(async()=>{ const d=await dump(); download(`نسخة_خدمة_إعدادي_${stamp()}.json`,JSON.stringify(d),'application/json'); try{ localStorage.setItem('lastBackup',new Date().toISOString()); }catch(x){} say('تم تنزيل النسخة ✅'); paint(); },t);
    else if(a==='ping') run(async()=>{
      say('جارٍ إرسال الطلب…'); const t0=Date.now();
      try{ await api('/rest/v1/books?select=id&limit=1'); }
      catch(x){ say(errMsg(x)+' — لو المشروع متوقف اعمل Resume من لوحة Supabase.',true); return; }
      try{ localStorage.setItem('lastKeepAlive',new Date().toISOString()); }catch(x){}
      paint(); say(`تمام ✅ Supabase رد في ${Date.now()-t0} م.ث. المشروع نشط.`);
    },t);
    else if(a==='csvp') run(async()=>{
      const r=await all('/rest/v1/profiles?select=*&order=name.asc');
      download(`المخدومين_${stamp()}.csv`,toCsv([['name','الاسم'],['grade','الصف'],['gender','الجنس'],['phone','التليفون'],['guardian_name','ولي الأمر'],['guardian_phone','تليفون ولي الأمر'],['email','الإيميل'],['created_at','تاريخ التسجيل'],['deleted_at','تاريخ الحذف'],['archived_at','تاريخ الأرشفة']],r),'text/csv;charset=utf-8'); say('تم تنزيل الملف ✅');
    },t);
    else if(a==='csvr') run(async()=>{
      const [p,r]=await Promise.all([all('/rest/v1/profiles?select=id,name,grade&order=id.asc'),all('/rest/v1/results?select=*&order=id.asc')]);
      const nm=Object.fromEntries(p.map(x=>[x.id,x]));
      download(`النتائج_${stamp()}.csv`,toCsv([['name','الاسم'],['grade','الصف'],['book_id','السفر'],['chapter_num','الإصحاح'],['attempt_no','المحاولة'],['score','الدرجة'],['total','من'],['attempted_at','الوقت']],
        r.map(x=>({...x,name:(nm[x.profile_id]||{}).name,grade:(nm[x.profile_id]||{}).grade}))),'text/csv;charset=utf-8'); say('تم تنزيل الملف ✅');
    },t);
    else if(a==='promote') run(async()=>{
      const err=$('#yerr'); err.textContent='';
      const label=$('#yl').value.trim();
      if(!label){ err.textContent='اكتب السنة الدراسية.'; return; }
      if($('#yc').value.trim()!=='ترقية'){ err.textContent='اكتب كلمة «ترقية» للتأكيد.'; return; }
      const bk=lastBk(), warnBk=!bk||dayDiff(bk)>7?'\n⚠️ مفيش نسخة احتياطية في آخر ٧ أيام. الأفضل تاخد نسخة الأول.':'';
      if(!confirm(`تنفيذ الترقية لسنة ${label}؟ الثالث هيتأرشف.${warnBk}\nمتأكد؟`)) return;
      let force=false;
      try{ await api('/rest/v1/rpc/promote_grades',{method:'POST',body:{p_label:label,p_force:false}}); }
      catch(x){
        if(x.body&&x.body.message==='already'){ if(!confirm('الترقية دي اتنفذت قبل كده لنفس السنة. تنفيذها تاني هيرقّي الكل مرة كمان! تكمّل فعلاً؟')) return; force=true; await api('/rest/v1/rpc/promote_grades',{method:'POST',body:{p_label:label,p_force:true}}); }
        else throw x;
      }
      say(force?'اتنفذت الترقية (إجبارياً) ✅':'اتنفذت الترقية ✅'); await load();
    },t);
  });
  paint(); await load();
}
