// شاشة الدخول الأول للمخدوم: تسجيل جديد / استرجاع بالكود
import * as A from './auth.js';
import * as ACC from './accounts.js';
const GRADES=['الأول الإعدادي','الثاني الإعدادي','الثالث الإعدادي'];
const esc=(s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export function validate(d){
  const e={};
  if(d.name.trim().split(/\s+/).filter(w=>w.length>1).length<2) e.name='اكتب الاسم كاملاً (اسمين على الأقل)';
  const ph=(v)=>/^(?:\+?20)?0?1[0125]\d{8}$/.test(A.normPhone(v));
  if(!ph(d.phone)) e.phone='رقم موبايل مصري غير صحيح';
  if(!d.grade) e.grade='اختر الصف';
  if(!d.gender) e.gender='اختر الجنس';
  if(d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email='إيميل غير صحيح';
  // v9.2: ولي الأمر (الاسم والرقم) اختياري؛ لو كُتب يُفحص
  if(d.guardianName.trim() && d.guardianName.trim().split(/\s+/).filter(w=>w.length>1).length<2) e.guardianName='اكتب اسم ولي الأمر كاملاً';
  if(d.guardianPhone.trim() && !ph(d.guardianPhone)) e.guardianPhone='رقم موبايل مصري غير صحيح';
  return e;
}
function field(id,label,inner,opt){ return `<div class="fld"><label for="${id}">${label}${opt?' <small>(اختياري)</small>':''}</label>${inner}<div class="err" id="e_${id}"></div></div>`; }

export function showGate(root,done,opts={}){
  root.innerHTML=`<div class="gate"><div class="tabs2"><button id="tNew" class="on">تسجيل جديد</button><button id="tRes">عندي كود</button></div><div id="gBody"></div>${opts.onBack?'<button class="btn sec" id="gBack">رجوع</button>':''}</div>`;
  if(opts.onBack) root.querySelector('#gBack').onclick=opts.onBack;
  const body=root.querySelector('#gBody'), tN=root.querySelector('#tNew'), tR=root.querySelector('#tRes');
  const tab=(w)=>{ tN.classList.toggle('on',w==='n'); tR.classList.toggle('on',w==='r'); (w==='n'?renderNew:renderRes)(); };
  tN.onclick=()=>tab('n'); tR.onclick=()=>tab('r');

  function renderNew(){
    body.innerHTML=`<p class="hint">سجّل بياناتك مرة واحدة. بعد التسجيل ستحصل على كود استرجاع، احتفظ به.</p>
    ${field('name','الاسم كاملاً','<input id="name" autocomplete="off" placeholder="الاسم الثلاثي">')}
    ${field('phone','تليفونك','<input id="phone" type="tel" inputmode="tel" dir="ltr" autocomplete="off">')}
    ${field('grade','الصف',`<select id="grade"><option value="">اختر…</option>${GRADES.map(g=>`<option>${g}</option>`).join('')}</select>`)}
    ${field('gender','الجنس','<select id="gender"><option value="">اختر…</option><option value="ولد">ولد</option><option value="بنت">بنت</option></select>')}
    ${field('email','الإيميل','<input id="email" type="email" dir="ltr" autocomplete="off">',1)}
    ${field('guardianName','اسم ولي الأمر','<input id="guardianName" autocomplete="off">',1)}
    ${field('guardianPhone','تليفون ولي الأمر','<input id="guardianPhone" type="tel" inputmode="tel" dir="ltr" autocomplete="off">',1)}
    <button class="btn" id="go">تسجيل</button>`;
    body.querySelector('#go').onclick=async()=>{
      const d={}; ['name','phone','grade','gender','email','guardianName','guardianPhone'].forEach(k=>d[k]=body.querySelector('#'+k).value);
      const er=validate(d);
      body.querySelectorAll('.err').forEach(x=>x.textContent='');
      for(const k in er) body.querySelector('#e_'+k).textContent=er[k];
      if(Object.keys(er).length){ const f=body.querySelector('.err:not(:empty)'); f&&f.scrollIntoView({block:'center'}); return; }
      let p; try{ p=await A.register(d); }catch(e){ const m=body.querySelector('#e_name'); if(m) m.textContent=e&&e.message==='full'?'وصلت للحد الأقصى (٣ حسابات) على هذا الجهاز.':'تعذّر التسجيل، جرّب تاني.'; return; }
      showCode(p);
    };
  }
  const lockFlow=()=>{ const t=root.querySelector('.tabs2'); if(t) t.style.display='none'; const g=root.querySelector('#gBack'); if(g) g.style.display='none'; }; // بعد إنشاء الحساب: لا رجوع/تبديل تبويب وسط الخطوات
  function showCode(p){
    lockFlow();
    body.innerHTML=`<div class="done"><h2>تم التسجيل ✅</h2><p>كود الاسترجاع الخاص بك:</p>
      <div class="code" id="rc">${esc(p.code)}</div><button class="btn sec" id="cp">نسخ الكود</button>
      <p class="warn">اكتب الكود في مكان آمن. لو فقدت جهازك ستحتاجه مع اسمك لاسترجاع حسابك.</p>
      <button class="btn" id="ok">متابعة</button></div>`;
    body.querySelector('#cp').onclick=()=>{ try{ navigator.clipboard.writeText(p.code); body.querySelector('#cp').textContent='تم النسخ'; }catch(e){} };
    body.querySelector('#ok').onclick=()=>offerPin(p);
  }
  // (v9.40) لو على الجهاز أكثر من مخدوم نعرض وضع رقم سري (اختياري) قبل المتابعة
  function offerPin(p){
    if(ACC.count()<2||!ACC.pinSupported()||ACC.hasPin(p.id)) return done();
    lockFlow();
    const IN='type="password" inputmode="numeric" maxlength="4" dir="ltr" autocomplete="off" style="text-align:center;letter-spacing:8px;font-size:1.3rem"';
    body.innerHTML=`<div class="done"><h2>🔒 رقم سري</h2><p class="hint">على الجهاز أكتر من مخدوم. اختار رقماً من ٤ أرقام عشان محدش يدخل على حسابك. (اختياري، وتقدر تضبطه بعدين من صفحة «أنا»)</p>
      ${field('pn1','الرقم السري',`<input id="pn1" ${IN}>`)}${field('pn2','أعد كتابته',`<input id="pn2" ${IN}>`)}
      <button class="btn" id="pns">حفظ الرقم</button><button class="btn sec" id="pnk">تخطّي</button></div>`;
    body.querySelector('#pnk').onclick=()=>done();
    body.querySelector('#pns').onclick=async()=>{
      const a=ACC.validPin(body.querySelector('#pn1').value), b=ACC.validPin(body.querySelector('#pn2').value), e=body.querySelector('#e_pn1');
      if(!a){ e.textContent='الرقم لازم يكون ٤ أرقام.'; return; }
      if(a!==b){ e.textContent='الرقمان غير متطابقين.'; return; }
      if(!(await ACC.setPin(p.id,a))){ e.textContent='تعذّر حفظ الرقم على هذا المتصفح.'; return; }
      done();
    };
  }
  function renderRes(){
    body.innerHTML=`<p class="hint">أدخل اسمك وكود الاسترجاع.</p>
    ${field('rn','الاسم كاملاً','<input id="rn" autocomplete="off">')}
    ${field('rc','الكود','<input id="rc" dir="ltr" maxlength="8" autocomplete="off" style="text-transform:uppercase;letter-spacing:3px">')}
    <div class="err" id="rerr"></div><button class="btn" id="rgo">استرجاع</button>`;
    body.querySelector('#rgo').onclick=async()=>{
      const r=await A.restore(body.querySelector('#rn').value,body.querySelector('#rc').value), m=body.querySelector('#rerr');
      if(r.ok) return offerPin(r.profile);
      m.textContent=({
        nolocal:'الاسترجاع على جهاز جديد يحتاج الاتصال بالسيرفر.',
        offline:'مفيش اتصال بالنت. جرّب تاني لما يرجع.',
        locked:'محاولات كتير غلط. استنى ساعة وجرّب تاني.',
        full:'وصلت للحد الأقصى (٣ حسابات) على هذا الجهاز. أزل حساباً من صفحة «أنا» الأول.',
        unavailable:'الخدمة مش متاحة دلوقتي. جرّب بعد شوية.'
      })[r.reason]||'الاسم أو الكود غير صحيح.';
    };
  }
  tab(opts.initial==='r'?'r':'n');
}
