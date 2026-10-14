// شاشة الدخول الموحّدة + "نسيت كلمة السر" (v9.2). حلّت محل staff-login.js.
// ⚠️ لا تذكر أي دور في النصوص عمداً: الدور يُقرأ من app_metadata.role في الـJWT بعد الدخول (sync.staffLogin)، والحماية الفعلية = RLS.
import * as SY from './sync.js';
const MSG={bad:'البريد الإلكتروني أو كلمة السر غير صحيحة.',offline:'مفيش اتصال بالنت.',rate:'محاولات كتير. استنى شوية وجرّب تاني.',
  server:'السيرفر مش متاح دلوقتي. جرّب بعد شوية.',unavailable:'الخدمة غير مفعّلة على هذا التطبيق.'};
const LINK='background:none;border:0;color:var(--gold);text-decoration:underline;font-size:.85rem;cursor:pointer;padding:6px 0';

export function showLogin(root,{students=true,onForgot,onNew,onCode,onCancel}){
  root.innerHTML=`<div class="gate"><h2 style="margin-bottom:12px">دخول</h2>
    <div class="fld"><label for="le">البريد الإلكتروني</label><input id="le" type="email" dir="ltr" autocomplete="username" inputmode="email"></div>
    <div class="fld"><label for="lp">كلمة السر</label><input id="lp" type="password" dir="ltr" autocomplete="current-password"></div>
    <div class="err" id="lerr"></div>
    <button class="btn" id="lgo">دخول</button>
    <div style="text-align:center;margin-top:6px"><button type="button" id="lfg" style="${LINK}">نسيت كلمة السر؟</button></div>
    ${students?`<div style="display:flex;align-items:center;gap:10px;color:var(--ink-2);margin:14px 0"><span style="flex:1;height:1px;background:var(--line-2)"></span><span>أو</span><span style="flex:1;height:1px;background:var(--line-2)"></span></div>
    <button class="btn sec" id="lnew">حساب جديد</button><button class="btn sec" id="lcode">عندي كود</button>`:''}
    ${onCancel?'<button class="btn sec" id="lno">رجوع</button>':''}</div>`;
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
  root.innerHTML=`<div class="gate"><h2 style="margin-bottom:6px">نسيت كلمة السر</h2>
    <p class="hint">اكتب بريدك الإلكتروني وهنراجع طلبك ونرد عليك.</p>
    <div class="fld"><label for="fe">البريد الإلكتروني</label><input id="fe" type="email" dir="ltr" autocomplete="email" inputmode="email" maxlength="200"></div>
    <div class="fld"><label for="fn">الاسم <small>(اختياري)</small></label><input id="fn" maxlength="120" autocomplete="name"></div>
    <div class="fld"><label for="fm">رسالة <small>(اختياري)</small></label><textarea id="fm" rows="3" maxlength="1000"></textarea></div>
    <div class="err" id="ferr"></div><div class="hint" id="fok"></div>
    <button class="btn" id="fgo">إرسال الطلب</button><button class="btn sec" id="fback">رجوع</button></div>`;
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
