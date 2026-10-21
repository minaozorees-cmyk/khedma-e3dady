// تغيير كلمة السر (v9.2). إجباري (forced) لو الحساب بكلمة مؤقتة (user_metadata.must_change_password)، واختياري من القائمة.
// (v9.48) + «🔔 ملخص المخدومين»: تفعيل/تجربة/إيقاف إشعار الملخص على الجهاز ده (مش بيظهر في وضع التغيير الإجباري).
import * as SY from '../../js/sync.js';
import * as PUSH from '../../js/push.js';
import {esc} from '../../js/consts.js';
const PM={denied:'الإذن اتحجب.',dismissed:'ما اتفعّلش (الإذن اتقفل).',subscribe:'تعذّر الاشتراك. جرّب تاني على نت أقوى.',offline:'مفيش اتصال بالنت.',nosql:'الخدمة لسه ما اتجهّزتش على السيرفر (SQL v9.48).',not_staff:'الحساب ده مش مسموح له بالإشعارات.',auth:'الجلسة انتهت. سجّل الدخول من جديد.',server:'تعذّر التنفيذ. جرّب بعد شوية.',unsupported:'الإشعارات غير مدعومة هنا.',rate:'استنى شوية وجرّب تاني.',nofn:'دالة الإرسال غير منشورة على السيرفر.',novapid:'مفاتيح الإرسال غير مضبوطة على السيرفر.',not_found:'الجهاز غير مسجّل. اضغط «إعادة التفعيل».',failed:'الإرسال فشل. جرّب تاني.',gone:'الاشتراك انتهى. فعّل تاني.',forbidden:'غير مسموح.'};
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
  if(!forced) paintPush();

  // (v9.48) ملخص المخدومين: إشعار واحد للخادم بعدد مسنديه اللي ما فتحوش الإصحاح (بدون أسماء). الأسماء جوه «الافتقاد».
  async function paintPush(note){
    let box=$('#spbox'); if(!box){ const c=document.createElement('div'); c.className='card2'; c.id='spbox'; el.querySelector('.gate').appendChild(c); box=c; }
    const st=await PUSH.stateStaff().catch(()=>({s:'off'})), n=st.s==='off'?null:await SY.myAssignedCount();
    const m0=note?`<div class="hint" id="spm">${esc(note)}</div>`:'<div class="hint" id="spm"></div>';
    if(st.s==='off'){ box.style.display='none'; return; }
    box.style.display='';
    const head='<b>🔔 ملخص المخدومين</b>', intro='<div class="hint">إشعار واحد في الصباح (الميعاد بيحدده المالك) بعدد مخدوميك اللي ما فتحوش الإصحاح. من غير أسماء، والأسماء جوه «الافتقاد». لو العدد صفر ما بيجيلكش حاجة.</div>';
    const asg=n===null?'':n===0?'<div class="warn">مفيش مخدومين مسندين لك دلوقتي، فمش هيجيلك ملخص لحد ما المالك يسند لك مخدومين.</div>':`<div class="hint">مسند لك ${Number(n)} مخدوم.</div>`;
    const bat='<div class="hint">لو الإشعار اتأخر: من إعدادات الأندرويد اسمح لـChrome بالعمل في الخلفية بدون توفير بطارية. وقبل ما تسجّل خروج من موبايل مش بتاعك اضغط «إيقاف».</div>';
    if(st.s==='unsupported') box.innerHTML=head+'<div class="hint">المتصفح ده ما بيدعمش الإشعارات والتطبيق مقفول. على آيفون: ثبّت التطبيق على الشاشة الرئيسية الأول (مشاركة ← إضافة إلى الشاشة الرئيسية).</div>';
    else if(st.s==='denied') box.innerHTML=head+'<div class="hint">الإشعارات محجوبة. افتح إعدادات الموقع/التطبيق في الموبايل واسمح بالإشعارات، وبعدين ارجع هنا.</div>';
    else if(st.s==='idle') box.innerHTML=head+intro+asg+'<button class="btn" id="spe">🔔 فعّل ملخص المخدومين</button>'+m0+bat;
    else if(st.s==='partial') box.innerHTML=head+'<div class="warn">اشتراك الجهاز غير مكتمل.</div>'+asg+'<button class="btn" id="spe">إعادة التفعيل</button>'+m0;
    else box.innerHTML=head+'<div class="hint">✅ مفعّل على هذا الجهاز'+(st.unsure?' (لم يتم التحقق من السيرفر، لا يوجد اتصال)':'')+'.</div>'+asg+'<button class="btn sec" id="spt">إرسال إشعار تجريبي</button><button class="btn sec" id="spx">إيقاف</button>'+m0+bat;
    const m=(t)=>{ const x=box.querySelector('#spm'); if(x) x.textContent=t; }, lock=(x,on)=>{ if(x) x.disabled=on; };
    const e=box.querySelector('#spe'), t=box.querySelector('#spt'), x=box.querySelector('#spx');
    if(e) e.onclick=async()=>{ lock(e,true); const r=await PUSH.enableStaff(); if(r.ok) return paintPush('اتفعّل ✅ جرّب «إرسال إشعار تجريبي».'); lock(e,false); m(PM[r.reason]||PM.server); };
    if(t) t.onclick=async()=>{ lock(t,true); m('جارٍ الإرسال…'); const r=await PUSH.testStaff(); lock(t,false); m(r.ok?'اتبعت إشعار تجريبي ✅ لو ما ظهرش خلال ثواني راجع إعدادات إشعارات Chrome وتوفير البطارية.':(PM[r.reason]||PM.server)); };
    if(x) x.onclick=async()=>{ lock(x,true); const r=await PUSH.disableStaff(); if(r.ok) return paintPush('اتوقف الملخص على هذا الحساب.'); lock(x,false); m(PM[r.reason]||PM.server); };
  }
}
