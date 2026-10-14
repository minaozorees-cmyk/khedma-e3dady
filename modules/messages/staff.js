// إرسال الرسائل + المرسلة (الخادم/الكاهن/المالك). الحماية الفعلية = RPC send_message + RLS (schema.sql v9.5)؛ الواجهة بتخفي بس.
// للكاهن/المالك: "كل المخدومين" + عاجل + تثبيت + إحصائيات القراءة. الخادم: صف أو أسماء محددة.
import * as SY from '../../js/sync.js';
import * as db from '../../js/db.js';
import {esc} from '../../js/consts.js';
const GRADES=['الأول الإعدادي','الثاني الإعدادي','الثالث الإعدادي'];
const FROM={priest:'⛪ الكاهن',owner:'الإدارة',servant:'خادم'};
const fmt=(t)=>new Date(t).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'});
const SB='width:auto;min-height:36px;margin:0;padding:6px 14px;font-size:.85rem';
async function api(path,opts){
  const r=await SY.staffApi(path,opts);
  if(!r.ok){ const e=new Error('HTTP '+r.status); e.status=r.status; try{ e.body=await r.json(); }catch(_){} throw e; }
  return r.status===204?null:await r.json().catch(()=>null);
}
function errMsg(e){
  const b=e&&e.body||{};
  if(b.message==='rate') return 'وصلت للحد اليومي للرسائل (٣٠).';
  if(b.message==='targets') return 'اختر مخدومين صالحين (من ١ إلى ٢٠٠).';
  if(b.code==='42501') return 'غير مسموح بهذه العملية.';
  if(b.code==='23514') return 'العنوان أو النص خارج الحدّ المسموح.';
  if(e&&(e.status===401||e.status===403)) return 'الجلسة انتهت. سجّل الدخول من جديد.';
  return e&&e.status?'تعذّر التنفيذ (رمز '+e.status+').':'مفيش اتصال بالنت.';
}
export async function mount(el,{role}){
  const top=role==='priest'||role==='owner', me=(await db.get('staff')||{}).uid;
  const S={tab:'new',P:[],sel:new Set(),q:'',sent:[]};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.innerHTML=''; el.appendChild(root);
  const $=(s)=>root.querySelector(s), say=(t,bad)=>{ const m=$('#msg'); if(m) m.innerHTML=t?`<div class="${bad?'err':'hint'}">${esc(t)}</div>`:''; };

  function paint(){
    root.innerHTML=`<div class="tabs2"><button data-a="tab" data-t="new" class="${S.tab==='new'?'on':''}">رسالة جديدة</button><button data-a="tab" data-t="sent" class="${S.tab==='sent'?'on':''}">المرسلة</button></div><div id="msg"></div><div id="body"></div>`;
    S.tab==='new'?paintNew():paintSent();
  }
  function paintNew(){
    $('#body').innerHTML=`<div class="card2">
      <div class="fld"><label for="aud">إلى</label><select id="aud">${top?'<option value="all">كل المخدومين</option>':''}<option value="grade">صف معيّن</option><option value="list">أسماء محددة</option></select></div>
      <div class="fld" id="gw"><label for="grd">الصف</label><select id="grd">${GRADES.map(g=>`<option>${g}</option>`).join('')}</select></div>
      <div id="lw" style="display:none"><div class="fld"><input id="q" placeholder="بحث بالاسم" autocomplete="off"></div>
        <div class="hint" id="selc"></div><div id="plist" style="max-height:260px;overflow:auto"></div></div>
      <div class="fld"><label for="ttl">العنوان</label><input id="ttl" maxlength="120"></div>
      <div class="fld"><label for="bdy">الرسالة</label><textarea id="bdy" rows="5" maxlength="2000" style="width:100%"></textarea></div>
      ${top?'<label class="chk"><input type="checkbox" id="urg"> 🔴 عاجل</label><label class="chk"><input type="checkbox" id="pin"> 📌 تثبيت في الأعلى</label>':''}
      <div class="fld"><label for="exp">تنتهي بعد</label><select id="exp"><option value="">بدون انتهاء</option><option value="7">٧ أيام</option><option value="30">٣٠ يوم</option></select></div>
      <div class="err" id="serr"></div><button class="btn" data-a="send">📤 إرسال</button></div>`;
    syncAud(); if(!S.P.length) loadP(); else paintList();
  }
  function syncAud(){ const a=$('#aud').value; $('#gw').style.display=a==='grade'?'':'none'; $('#lw').style.display=a==='list'?'':'none'; }
  async function loadP(){
    try{ S.P=await api('/rest/v1/profiles?select=id,name,grade&deleted_at=is.null&order=name.asc&limit=1000'); }catch(e){ say(errMsg(e),true); }
    paintList();
  }
  function paintList(){
    const l=$('#plist'); if(!l) return; const q=S.q.trim();
    const rows=S.P.filter(p=>!q||p.name.includes(q));
    l.innerHTML=rows.map(p=>`<label class="chk"><input type="checkbox" data-p="${p.id}"${S.sel.has(p.id)?' checked':''}> ${esc(p.name)} <small>${esc(p.grade)}</small></label>`).join('')||'<div class="hint">لا نتائج.</div>';
    $('#selc').textContent=`المحدد: ${S.sel.size}`;
  }
  async function send(){
    const aud=$('#aud').value, grade=$('#grd').value, ttl=$('#ttl').value.trim(), bdy=$('#bdy').value.trim(), err=$('#serr'); err.textContent='';
    if(!ttl||!bdy){ err.textContent='اكتب العنوان والرسالة.'; return; }
    if(aud==='list'&&(S.sel.size<1||S.sel.size>200)){ err.textContent='اختر من ١ إلى ٢٠٠ مخدوم.'; return; }
    const n=aud==='all'?S.P.length:aud==='grade'?S.P.filter(p=>p.grade===grade).length:S.sel.size;
    if(!confirm(`إرسال الرسالة إلى ${n} مخدوم؟`)) return;
    const days=Number($('#exp').value), btn=root.querySelector('[data-a="send"]'); btn.disabled=true;
    try{
      await api('/rest/v1/rpc/send_message',{method:'POST',body:{p_title:ttl,p_body:bdy,p_urgent:top&&$('#urg').checked,p_pinned:top&&$('#pin').checked,p_audience:aud,
        p_grade:aud==='grade'?grade:null,p_expires:days?new Date(Date.now()+days*864e5).toISOString():null,p_targets:aud==='list'?[...S.sel]:[]}});
      S.sel.clear(); S.tab='sent'; paint(); say('تم الإرسال ✅'); await loadSent();
    }catch(e){ err.textContent=errMsg(e); }
    btn.disabled=false;
  }
  async function loadSent(){
    try{ S.sent=await api('/rest/v1/messages_staff?select=id,sender,sender_role,title,audience,grade,pinned,urgent,created_at,recipients,reads&deleted_at=is.null&order=created_at.desc&limit=30'); }
    catch(e){ say(errMsg(e),true); }
    if(S.tab==='sent') paintSent();
  }
  function paintSent(){
    const aud=(m)=>m.audience==='all'?'كل المخدومين':m.audience==='grade'?m.grade:`${m.recipients} مخدوم`;
    $('#body').innerHTML=S.sent.length?S.sent.map(m=>`<div class="card2"><div class="row" style="border:0;padding:0"><b>${m.pinned?'📌 ':''}${m.urgent?'🔴 ':''}${esc(m.title)}</b><small>${fmt(m.created_at)}</small></div>
      <div class="k">${esc(FROM[m.sender_role]||'')} · إلى: ${esc(aud(m))}${top?` · قرأها ${m.reads} من ${m.recipients}`:''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${top?`<button class="btn sec" style="${SB}" data-a="pin" data-id="${m.id}" data-v="${m.pinned?0:1}">${m.pinned?'إلغاء التثبيت':'📌 تثبيت'}</button>`:''}
      ${(m.sender===me||role==='owner')?`<button class="x" data-a="del" data-id="${m.id}">🗑 حذف</button>`:''}</div></div>`).join(''):'<div class="ph">لا توجد رسائل مرسلة.</div>';
  }
  async function patch(id,body){
    const r=await api(`/rest/v1/messages?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',prefer:'return=representation',body});
    if(!Array.isArray(r)||!r.length) throw Object.assign(new Error('no rows'),{status:403});
  }
  root.addEventListener('click',async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    try{
      if(a==='tab'){ S.tab=t.dataset.t; say(''); paint(); if(S.tab==='sent') loadSent(); }
      else if(a==='send') await send();
      else if(a==='del'){ if(!confirm('حذف الرسالة؟ هتختفي من عند المخدومين.')) return; await patch(t.dataset.id,{deleted_at:new Date().toISOString()}); await loadSent(); }
      else if(a==='pin'){ await patch(t.dataset.id,{pinned:t.dataset.v==='1'}); await loadSent(); }
    }catch(x){ say(errMsg(x),true); }
  });
  root.addEventListener('change',(e)=>{
    if(e.target.id==='aud') syncAud();
    else if(e.target.dataset&&e.target.dataset.p){ e.target.checked?S.sel.add(e.target.dataset.p):S.sel.delete(e.target.dataset.p); $('#selc').textContent=`المحدد: ${S.sel.size}`; }
  });
  root.addEventListener('input',(e)=>{ if(e.target.id==='q'){ S.q=e.target.value; paintList(); } });
  paint();
}
