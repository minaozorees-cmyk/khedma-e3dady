// (v9.40) شاشة اختيار المخدوم + إدخال الرقم السري. تبديل الحساب = setActive ثم إعادة تحميل الصفحة.
import * as ACC from './accounts.js';
const esc=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PIN_IN='type="password" inputmode="numeric" maxlength="4" dir="ltr" autocomplete="off" style="text-align:center;letter-spacing:8px;font-size:1.3rem"';

export function showPicker(root,{onHome}){   // (v9.44) زر «الشاشة الرئيسية» بدل «إضافة مخدوم» و«دخول خادم / مالك»
  const L=ACC.list();
  root.innerHTML=`<div class="gate"><h2 class="ttl" style="text-align:center;margin:6px 0 14px">مين بيستخدم التطبيق؟</h2>
    <div>${L.map(a=>`<button type="button" class="btn sec acct" data-id="${esc(a.id)}"><span>${esc(a.name)}</span><span>${a.locked?'🔒':''}</span></button>`).join('')}</div>
    <div id="pkBody"></div>
    ${L.length<ACC.MAX?'':'<p class="hint">وصلت للحد الأقصى (٣ حسابات). لإضافة غيره أزل حساباً من صفحة «أنا».</p>'}
    <button type="button" class="btn" id="pkHome">🏠 الشاشة الرئيسية</button></div>`;
  const body=root.querySelector('#pkBody'), $=(s)=>body.querySelector(s);
  const enter=(id)=>{ ACC.setActive(id); location.reload(); };
  const name=(id)=>(L.find(a=>a.id===id)||{}).name||'';
  const wait=(ms)=>'استنى '+Math.max(1,Math.ceil(ms/60000))+' دقيقة وجرّب تاني.';

  function askPin(id){
    body.innerHTML=`<div class="card2"><b>${esc(name(id))}</b>
      <div class="fld"><label for="pk">الرقم السري</label><input id="pk" ${PIN_IN}></div>
      <div class="err" id="pke"></div>
      <button type="button" class="btn" id="pkgo">دخول</button>
      <button type="button" class="btn sec" id="pkfg">نسيت الرقم؟</button></div>`;
    const inp=$('#pk'), err=$('#pke'); let busy=false;
    const go=async()=>{
      if(busy) return; busy=true;
      const r=await ACC.verifyPin(id,inp.value);
      if(r.ok){ enter(id); return; }
      err.textContent=r.locked?'محاولات كتير غلط. '+wait(r.ms):'الرقم غلط. باقي '+r.left+' محاولات.';
      inp.value=''; inp.focus(); busy=false;
    };
    $('#pkgo').onclick=go; inp.oninput=()=>{ if(ACC.validPin(inp.value)) go(); };
    $('#pkfg').onclick=()=>forgot(id);
    inp.focus();
  }
  function forgot(id){
    body.innerHTML=`<div class="card2"><b>${esc(name(id))}</b><p class="hint">اكتب كود الاسترجاع (٨ حروف) عشان تحط رقم جديد.</p>
      <div class="fld"><label for="fc">كود الاسترجاع</label><input id="fc" dir="ltr" maxlength="8" autocomplete="off" style="text-transform:uppercase;letter-spacing:3px"></div>
      <div class="err" id="fe"></div><button type="button" class="btn" id="fgo">متابعة</button>
      <button type="button" class="btn sec" id="fbk">رجوع</button></div>`;
    $('#fbk').onclick=()=>askPin(id);
    $('#fgo').onclick=async()=>{ if(await ACC.verifyCode(id,$('#fc').value)) newPin(id); else $('#fe').textContent='الكود غير صحيح.'; };
  }
  function newPin(id){
    body.innerHTML=`<div class="card2"><b>رقم سري جديد</b>
      <div class="fld"><label for="n1">الرقم الجديد (٤ أرقام)</label><input id="n1" ${PIN_IN}></div>
      <div class="fld"><label for="n2">أعد كتابته</label><input id="n2" ${PIN_IN}></div>
      <div class="err" id="ne"></div><button type="button" class="btn" id="ngo">حفظ ودخول</button></div>`;
    $('#ngo').onclick=async()=>{
      const a=ACC.validPin($('#n1').value), b=ACC.validPin($('#n2').value), e=$('#ne');
      if(!a) return void(e.textContent='الرقم لازم يكون ٤ أرقام.');
      if(a!==b) return void(e.textContent='الرقمان غير متطابقين.');
      if(!(await ACC.setPin(id,a))) return void(e.textContent='تعذّر حفظ الرقم على هذا المتصفح.');
      enter(id);
    };
  }
  root.querySelectorAll('.acct').forEach(b=>b.onclick=()=>{ const id=b.dataset.id; if(ACC.hasPin(id)) askPin(id); else enter(id); });
  root.querySelector('#pkHome').onclick=onHome;
}
