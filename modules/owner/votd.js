// آيات "آية اليوم" (v9.20) — المالك فقط يضيف/يخفي/يحذف. الحماية الفعلية: RLS على votd_verses (القراءة للمفعّل فقط لغير المالك).
import {api,errMsg,fmt,SB} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
import {VERSES} from '../../js/votd-data.js';
const P='/rest/v1/votd_verses';
export async function mount(el,{role}={}){
  if(role!=='owner'){ el.innerHTML='<div class="ph">هذه الصفحة للمالك فقط.</div>'; return; }
  const S={rows:[],err:'',ok:''};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.innerHTML=''; el.appendChild(root);
  const $=(s)=>root.querySelector(s);
  function paint(){
    const act=S.rows.filter(r=>r.active).length;
    root.innerHTML=`${S.err?`<div class="err">${esc(S.err)}</div>`:''}${S.ok?`<div class="hint">${esc(S.ok)}</div>`:''}
      <div class="card2"><b>إضافة آية</b>
        <p class="hint">المدمج في التطبيق: ${VERSES.length} آية، والمضاف من هنا: ${act} مفعّلة. كل آية جديدة بتدخل في الدورة، فآية النهارده ممكن تتغير. راجع النص قبل الحفظ.</p>
        <div class="fld"><label for="vr">المرجع</label><input id="vr" maxlength="60" placeholder="مثال: مزمور 16: 8"></div>
        <div class="fld"><label for="vt">نص الآية</label><textarea id="vt" rows="3" maxlength="600"></textarea></div>
        <div class="fld"><label for="vm">سطر تأمل <small>(اختياري)</small></label><input id="vm" maxlength="300"></div>
        <button class="btn" data-a="add">إضافة</button></div>
      <div class="card2"><b>الآيات المضافة (${S.rows.length})</b>${S.rows.length?S.rows.map(r=>`<div class="row" style="display:block"><div><b>${esc(r.ref)}</b> <span class="badge ${r.active?'on':'off'}">${r.active?'مفعّلة':'مخفية'}</span></div>
        <p style="margin:6px 0">${esc(r.text)}</p>${r.note?`<div class="k">${esc(r.note)}</div>`:''}<div class="k">${fmt(r.created_at)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn sec" style="${SB}" data-a="toggle" data-id="${r.id}">${r.active?'إخفاء':'إظهار'}</button><button class="x" data-a="del" data-id="${r.id}">حذف</button></div></div>`).join(''):'<div class="hint">لسه ما أضفتش آيات.</div>'}</div>
      <button class="btn sec" data-a="reload">تحديث</button>`;
  }
  async function load(){ try{ S.rows=await api(`${P}?select=*&order=id.desc`)||[]; S.err=''; }catch(e){ S.err=errMsg(e); } paint(); }
  root.addEventListener('click',async(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a, id=t.dataset.id; S.ok='';
    try{
      if(a==='reload') await load();
      else if(a==='add'){
        const ref=$('#vr').value.trim(), text=$('#vt').value.trim(), note=$('#vm').value.trim();
        if(!ref||!text){ S.err='اكتب المرجع ونص الآية.'; paint(); return; }
        t.disabled=true; await api(P,{method:'POST',body:{ref,text,note:note||null},prefer:'return=minimal'}); S.ok='تمت الإضافة ✅'; await load();
      }
      else if(a==='toggle'){ const r=S.rows.find(x=>String(x.id)===id); t.disabled=true; await api(`${P}?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{active:!r.active},prefer:'return=minimal'}); await load(); }
      else if(a==='del'){ if(!confirm('حذف الآية نهائياً؟')) return; t.disabled=true; await api(`${P}?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',prefer:'return=minimal'}); await load(); }
    }catch(x){ S.err=errMsg(x); paint(); }
  });
  await load();
}
