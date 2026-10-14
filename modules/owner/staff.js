// حسابات الطاقم (v9.6) — للمالك فقط. بيتكلم مع Edge Function staff-admin (service_role جوّاها بس).
// ⚠️ الواجهة للعرض؛ الحماية الفعلية: الدالة بتتحقق إن الطالب مالك من الـJWT وترفض لمس المالك/النفس/أي حساب بلا دور.
import * as SY from '../../js/sync.js';
import {fmt,SB} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
const ROLE_AR={servant:'خادم',priest:'كاهن',owner:'مالك'};
const MSG={exists:'الإيميل ده مسجّل قبل كده.',weak:'كلمة السر من ٨ إلى ٧٢ حرف.',bad:'بيانات غير صحيحة.',not_allowed:'الحساب ده مش مسموح تعديله من هنا.',not_found:'الحساب غير موجود.',
  auth:'الجلسة انتهت. سجّل الدخول من جديد.',forbidden:'غير مسموح.',offline:'مفيش اتصال بالنت.',nofn:'الـEdge Function (staff-admin) غير منشورة بعد.',unavailable:'السيرفر مش متاح دلوقتي.'};
const PW='ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function genPw(n=10){ const lim=256-(256%PW.length); let o=''; while(o.length<n){ for(const x of crypto.getRandomValues(new Uint8Array(16))){ if(x<lim&&o.length<n) o+=PW[x%PW.length]; } } return o; }
export async function mount(el,{role}={}){
  if(role!=='owner'){ el.innerHTML='<div class="ph">هذه الصفحة للمالك فقط.</div>'; return; }
  const S={users:[],made:null};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.innerHTML=''; el.appendChild(root);
  const $=(s)=>root.querySelector(s), say=(t,bad)=>{ const m=$('#msg'); if(m) m.innerHTML=t?`<div class="${bad?'err':'hint'}">${esc(t)}</div>`:''; };
  async function call(p){ const r=await SY.staffAdmin(p); if(!r.ok) throw new Error(MSG[r.reason]||'تعذّر التنفيذ.'); return r; }
  function paint(){
    root.innerHTML=`<div id="msg"></div>
      ${S.made?`<div class="card2"><b>تم إنشاء الحساب ✅</b><p class="hint"><span dir="ltr">${esc(S.made.email)}</span></p><div class="code" style="font-size:1.3rem;letter-spacing:2px">${esc(S.made.pw)}</div><p class="warn">ابعت له الكلمة دي بنفسك. مش هتظهر تاني، وهيُطلب منه يغيّرها أول دخول.</p><button class="btn sec" style="${SB}" data-a="hide">تم، إخفاء</button></div>`:''}
      <div class="card2"><b>إضافة حساب</b>
        <div class="fld"><label for="ne">البريد الإلكتروني</label><input id="ne" type="email" dir="ltr" inputmode="email"></div>
        <div class="fld"><label for="nr">الدور</label><select id="nr"><option value="servant">خادم</option><option value="priest">كاهن مسؤول</option></select></div>
        <div class="fld"><label for="np">كلمة سر مؤقتة <small>(٨ أحرف+)</small></label><input id="np" dir="ltr" autocomplete="off"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" style="${SB}" data-a="gen">توليد</button><button class="btn" style="${SB}" data-a="create">إنشاء</button></div></div>
      <div class="card2"><b>الحسابات (${S.users.length})</b>${S.users.map(u=>`<div class="row" style="display:block"><div class="row" style="border:0;padding:0"><span dir="ltr">${esc(u.email||'—')}</span><span class="badge ${u.banned?'off':'on'}">${u.banned?'موقوف':ROLE_AR[u.role]||u.role}</span></div>
        <div class="k">آخر دخول: ${fmt(u.last_sign_in_at)}</div>
        ${u.role==='owner'?'':`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><select data-a="role" data-id="${u.id}" style="width:auto"><option value="servant"${u.role==='servant'?' selected':''}>خادم</option><option value="priest"${u.role==='priest'?' selected':''}>كاهن مسؤول</option></select>
          <button class="${u.banned?'btn sec':'x'}" style="${u.banned?SB:''}" data-a="${u.banned?'enable':'disable'}" data-id="${u.id}">${u.banned?'تفعيل':'إيقاف'}</button></div>`}</div>`).join('')}</div>
      <button class="btn sec" data-a="reload">تحديث</button>`;
  }
  async function load(){ say('جارٍ التحميل…'); try{ S.users=(await call({action:'list'})).users.sort((a,b)=>(a.role==='owner'?-1:0)-(b.role==='owner'?-1:0)||String(a.email).localeCompare(String(b.email))); say(''); }catch(e){ say(e.message,true); } paint(); }
  root.addEventListener('click',async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled||t.tagName==='SELECT') return; const a=t.dataset.a;
    try{
      if(a==='reload') await load();
      else if(a==='hide'){ S.made=null; paint(); }
      else if(a==='gen') $('#np').value=genPw();
      else if(a==='create'){
        const email=$('#ne').value.trim(), pw=$('#np').value, r=$('#nr').value;
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ say('اكتب بريداً صحيحاً.',true); return; }
        if(pw.length<8||pw.length>72){ say(MSG.weak,true); return; }
        t.disabled=true; await call({action:'create',email,password:pw,role:r}); S.made={email,pw}; await load();
      }else if(a==='disable'||a==='enable'){
        if(a==='disable'&&!confirm('إيقاف الحساب؟ مش هيقدر يدخل أو يجدّد الجلسة.')) return;
        await call({action:'set_active',id:t.dataset.id,active:a==='enable'}); await load(); say(a==='enable'?'تم التفعيل.':'تم الإيقاف.');
      }
    }catch(x){ say(x.message,true); t.disabled=false; }
  });
  root.addEventListener('change',async(e)=>{
    const t=e.target; if(t.dataset.a!=='role') return;
    if(!confirm('تغيير الدور؟ يسري على الحساب خلال ساعة كحد أقصى (أو عند الدخول من جديد).')){ await load(); return; }
    try{ await call({action:'set_role',id:t.dataset.id,role:t.value}); await load(); say('تم تغيير الدور.'); }catch(x){ say(x.message,true); await load(); }
  });
  await load();
}
