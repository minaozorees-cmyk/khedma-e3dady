// شاشة الدخول الموحّدة + "نسيت كلمة السر" (v9.2). حلّت محل staff-login.js.
// ⚠️ لا تذكر أي دور في النصوص عمداً: الدور يُقرأ من app_metadata.role في الـJWT بعد الدخول (sync.staffLogin)، والحماية الفعلية = RLS.
import * as SY from './sync.js';
const MSG={bad:'البريد الإلكتروني أو كلمة السر غير صحيحة.',offline:'مفيش اتصال بالنت.',rate:'محاولات كتير. استنى شوية وجرّب تاني.',
  server:'السيرفر مش متاح دلوقتي. جرّب بعد شوية.',unavailable:'الخدمة غير مفعّلة على هذا التطبيق.'};

// ── تصميم الكارت الداكن (Uiverse) — أسماء بادئتها lg- لتفادي التعارض مع .btn/.field الحالية ──
const I={mail:'M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4Zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1H2Zm13 2.383-4.708 2.825L15 11.105V5.383Zm-.034 6.876-5.64-3.471L8 9.583l-1.326-.795-5.64 3.47A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.741ZM1 11.105l4.708-2.897L1 5.383v5.722Z',
  lock:'M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z',
  user:'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4Zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10Z',
  chat:'M2.678 11.894a1 1 0 0 1 .287.801 10.97 10.97 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8.06 8.06 0 0 0 8 14c3.996 0 7-2.807 7-6 0-3.192-3.004-6-7-6S1 4.808 1 8c0 1.468.617 2.83 1.678 3.894Zm-.493 3.905a21.682 21.682 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a9.68 9.68 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9.06 9.06 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105Z'};
const ico=(k)=>`<svg class="lg-ico" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="${I[k]}"></path></svg>`;
function injectCss(){
  if(document.getElementById('lg-css')) return;
  const s=document.createElement('style'); s.id='lg-css';
  s.textContent=`
.lg-form{display:flex;flex-direction:column;gap:10px;padding:0 2em .4em;background:#171717;border-radius:25px;transition:.4s ease-in-out;color:#fff;max-width:420px;margin:0 auto}
@media (hover:hover){.lg-form:hover{transform:scale(1.05);border:1px solid #000}}
.lg-head{text-align:center;margin:1.6em 0 1em;color:#fff;font-size:1.2em;font-weight:700}
.lg-hint{color:#a8a8a8;font-size:.85rem;text-align:center;margin:-.4em 0 .4em}
.lg-field{display:flex;align-items:center;justify-content:center;gap:.5em;border-radius:25px;padding:.6em .9em;background:#171717;box-shadow:inset 2px 5px 10px rgb(5,5,5)}
.lg-field.ta{align-items:flex-start;border-radius:20px}
.lg-ico{height:1.3em;width:1.3em;fill:#fff;flex:none}
.lg-in{background:none;border:none;outline:none;width:100%;color:#d3d3d3;font-family:inherit;font-size:1rem;resize:none}
.lg-in::placeholder{color:#7d7d7d}
.lg-err{color:#ff8a80;font-size:.85rem;min-height:1em;text-align:center}
.lg-ok{color:#8ee6a0;font-size:.9rem;text-align:center}
.lg-row{display:flex;justify-content:center;flex-direction:row;flex-wrap:wrap;gap:.5em;margin-top:1.2em}
.lg-b1,.lg-b2{padding:.6em 1.4em;border-radius:5px;border:none;outline:none;transition:.4s ease-in-out;background:#252525;color:#fff;font-family:inherit;font-weight:700;cursor:pointer}
.lg-b1:hover,.lg-b2:hover{background:#000;color:#fff}
.lg-b1:disabled{opacity:.6}
.lg-b3{margin-bottom:1.6em;padding:.5em;border-radius:5px;border:none;outline:none;transition:.4s ease-in-out;background:#252525;color:var(--gold,#e8c468);font-family:inherit;font-weight:700;cursor:pointer}
.lg-b3:hover{background:var(--gold,#e8c468);color:#171717}
.lg-or{display:flex;align-items:center;gap:10px;color:#a8a8a8;margin:.6em 0 0}
.lg-or span:not(:nth-child(2)){flex:1;height:1px;background:#333}`;
  document.head.appendChild(s);
}

export function showLogin(root,{students=true,onForgot,onNew,onCode,onCancel}){
  injectCss();
  root.innerHTML=`<div class="gate"><form class="lg-form" id="lform" onsubmit="return false"><p class="lg-head">دخول</p>
    <div class="lg-field">${ico('mail')}<input id="le" class="lg-in" type="email" dir="ltr" autocomplete="username" inputmode="email" placeholder="البريد الإلكتروني" aria-label="البريد الإلكتروني"></div>
    <div class="lg-field">${ico('lock')}<input id="lp" class="lg-in" type="password" dir="ltr" autocomplete="current-password" placeholder="كلمة السر" aria-label="كلمة السر"></div>
    <div class="lg-err" id="lerr"></div>
    <div class="lg-row"><button type="button" class="lg-b1" id="lgo">دخول</button>${students?'<button type="button" class="lg-b2" id="lnew">حساب جديد</button>':''}</div>
    ${students?`<div class="lg-or"><span></span><span>أو</span><span></span></div><div class="lg-row" style="margin-top:.6em"><button type="button" class="lg-b2" id="lcode">عندي كود</button></div>`:''}
    <div class="lg-row" style="margin-top:.6em"><button type="button" class="lg-b3" id="lfg">نسيت كلمة السر؟</button></div>
    ${onCancel?'<div class="lg-row" style="margin-top:0"><button type="button" class="lg-b2" id="lno">رجوع</button></div>':''}</form></div>`;
  const $=(s)=>root.querySelector(s), go=$('#lgo');
  const submit=async()=>{
    const email=$('#le').value.trim(), pw=$('#lp').value; $('#lerr').textContent='';
    if(!email||!pw){ $('#lerr').textContent='اكتب البريد الإلكتروني وكلمة السر.'; return; }
    go.disabled=true; go.textContent='جارٍ الدخول…';
    const r=await SY.staffLogin(email,pw);          // نجاح ⇒ lawha:role ⇒ الراوتر يوجّه حسب الدور
    go.disabled=false; go.textContent='دخول';
    if(r.ok){ $('#lp').value=''; return; }
    $('#lerr').textContent=MSG[r.reason]||MSG.bad;  // نفس الرسالة لو الحساب بلا صلاحية (لا نكشف شيئاً)
  };
  go.onclick=submit; $('#lp').onkeydown=(e)=>{ if(e.key==='Enter') submit(); };
  $('#lfg').onclick=onForgot;
  if(students){ $('#lnew').onclick=onNew; $('#lcode').onclick=onCode; }
  if(onCancel) $('#lno').onclick=onCancel;
}

export function showForgot(root,{onBack}){
  injectCss();
  root.innerHTML=`<div class="gate"><form class="lg-form" onsubmit="return false"><p class="lg-head">نسيت كلمة السر</p>
    <p class="lg-hint">اكتب بريدك الإلكتروني وهنراجع طلبك ونرد عليك.</p>
    <div class="lg-field">${ico('mail')}<input id="fe" class="lg-in" type="email" dir="ltr" autocomplete="email" inputmode="email" maxlength="200" placeholder="البريد الإلكتروني" aria-label="البريد الإلكتروني"></div>
    <div class="lg-field">${ico('user')}<input id="fn" class="lg-in" maxlength="120" autocomplete="name" placeholder="الاسم (اختياري)" aria-label="الاسم"></div>
    <div class="lg-field ta">${ico('chat')}<textarea id="fm" class="lg-in" rows="3" maxlength="1000" placeholder="رسالة (اختياري)" aria-label="رسالة"></textarea></div>
    <div class="lg-err" id="ferr"></div><div class="lg-ok" id="fok"></div>
    <div class="lg-row"><button type="button" class="lg-b1" id="fgo">إرسال الطلب</button><button type="button" class="lg-b2" id="fback">رجوع</button></div>
    <div style="height:1.4em"></div></form></div>`;
  const $=(s)=>root.querySelector(s), go=$('#fgo');
  $('#fback').onclick=onBack;
  go.onclick=async()=>{
    const contact=$('#fe').value.trim(); $('#ferr').textContent=''; $('#fok').textContent='';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)){ $('#ferr').textContent='اكتب بريداً إلكترونياً صحيحاً.'; return; }
    go.disabled=true; go.textContent='جارٍ الإرسال…';
    const r=await SY.submitRequest({type:'password_reset',name:$('#fn').value.trim().replace(/\s+/g,' '),contact,message:$('#fm').value.trim()});
    if(r.ok){ $('#fok').textContent='تم إرسال طلبك ✅ هيتم الرد عليك بعد المراجعة.'; go.style.display='none'; return; }
    go.disabled=false; go.textContent='إرسال الطلب';
    $('#ferr').textContent=({offline:MSG.offline,unavailable:MSG.unavailable,rate:MSG.rate,busy:'فيه طلبات كتير دلوقتي. جرّب بعد شوية.'})[r.reason]||'تعذّر إرسال الطلب. جرّب بعد شوية.';
  };
}
