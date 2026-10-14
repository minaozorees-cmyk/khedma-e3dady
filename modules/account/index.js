// تغيير كلمة السر (v9.2). إجباري (forced) لو الحساب بكلمة مؤقتة (user_metadata.must_change_password)، واختياري من القائمة.
import * as SY from '../../js/sync.js';
const MSG={weak:'كلمة السر غير مقبولة. جرّب كلمة أطول.',same:'اختر كلمة سر مختلفة عن الحالية.',offline:'مفيش اتصال بالنت.',auth:'سجّل الدخول من جديد.',server:'السيرفر مش متاح دلوقتي.',bad:'تعذّر التغيير. جرّب تاني.'};
export async function mount(el,{forced=false,onDone}={}){
  el.innerHTML=`<div class="gate"><div class="card2"><b>${forced?'لازم تغيّر كلمة السر قبل ما تكمّل':'تغيير كلمة السر'}</b>
    <p class="hint">٨ أحرف على الأقل.</p>
    <div class="fld"><label for="np">كلمة السر الجديدة</label><input id="np" type="password" dir="ltr" autocomplete="new-password"></div>
    <div class="fld"><label for="np2">تأكيد كلمة السر</label><input id="np2" type="password" dir="ltr" autocomplete="new-password"></div>
    <div class="err" id="perr"></div><div class="hint" id="pok"></div>
    <button class="btn" id="pgo">حفظ</button></div></div>`;
  const $=(s)=>el.querySelector(s), go=$('#pgo');
  go.onclick=async()=>{
    const a=$('#np').value, b=$('#np2').value; $('#perr').textContent='';
    if(a.length<8||a.length>72){ $('#perr').textContent='كلمة السر من ٨ إلى ٧٢ حرف.'; return; }
    if(a!==b){ $('#perr').textContent='التأكيد غير مطابق.'; return; }
    go.disabled=true;
    const r=await SY.changePassword(a);
    go.disabled=false;
    if(!r.ok){ $('#perr').textContent=MSG[r.reason]||MSG.bad; return; }
    $('#np').value=''; $('#np2').value='';
    if(onDone) onDone(); else $('#pok').textContent='تم تغيير كلمة السر ✅';
  };
}
