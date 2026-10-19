// إسناد المخدومين للخدام (v9.30) — للمالك فقط.
// الحماية الفعلية في Supabase (جدول staff_profile_assignments + RLS)؛ الواجهة للإدارة فقط.
import * as SY from '../../js/sync.js';
import {api,all,errMsg,SB} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
const nz=s=>String(s||'').replace(/[ً-ٰٟ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').toLowerCase();
export async function mount(el,{role}={}){
  if(role!=='owner'){ el.innerHTML='<div class="ph">هذه الصفحة للمالك فقط.</div>'; return; }
  const S={staff:[],profs:[],sel:'',orig:new Set(),cur:new Set(),q:'',g:'',counts:new Map(),busy:false,rules:[],rulesOk:true,rg:'',rn:''};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='760px'; el.replaceChildren(root);
  const say=(t,bad)=>{ const m=root.querySelector('#msg'); if(m) m.innerHTML=t?`<div class="${bad?'err':'hint'}">${esc(t)}</div>`:''; };
  async function load(){
    root.innerHTML='<div class="ph">جارٍ التحميل…</div>';
    try{
      const r=await SY.staffAdmin({action:'list'});
      if(!r.ok) throw new Error(r.reason==='nofn'?'الـEdge Function (staff-admin) غير منشورة.':'تعذّر تحميل الخدام.');
      S.staff=(r.users||[]).filter(u=>u.role==='servant').sort((a,b)=>String(a.name||a.email).localeCompare(String(b.name||b.email),'ar'));
      S.profs=await all('/rest/v1/profiles?select=id,name,grade,gender&deleted_at=is.null&archived_at=is.null&order=name.asc');
      const as=await all('/rest/v1/staff_profile_assignments?select=staff_uid,profile_id&order=staff_uid.asc,profile_id.asc');
      S.counts=new Map(); for(const a of as) S.counts.set(a.staff_uid,(S.counts.get(a.staff_uid)||0)+1);
      S.all=as;
      await loadRules();   // (v9.42) لو جدول القواعد لسه ما اتعملش نكمّل بدونه
      if(S.sel) pick(S.sel); else paint();
    }catch(e){ root.innerHTML=`<div class="card2"><div class="err">${esc(e.message&&!e.status?e.message:errMsg(e))}</div><button class="btn sec" data-a="reload">إعادة المحاولة</button></div>`; }
  }
  async function loadRules(){
    try{ S.rules=await all('/rest/v1/staff_assignment_rules?select=id,staff_uid,grade,gender&order=id.asc'); S.rulesOk=true; }
    catch(e){ S.rules=[]; S.rulesOk=false; }
  }
  function pick(uid){
    S.sel=uid; S.orig=new Set((S.all||[]).filter(a=>a.staff_uid===uid).map(a=>a.profile_id)); S.cur=new Set(S.orig); paint();
  }
  const dirty=()=>S.orig.size!==S.cur.size||[...S.cur].some(x=>!S.orig.has(x));
  function paint(){
    const q=nz(S.q), list=S.profs.filter(p=>(!q||nz(p.name).includes(q))&&(!S.g||p.gender===S.g));
    const gl=S.g?(S.g==='ولد'?' (ولاد)':' (بنات)'):'';
    const grades=[...new Set(S.profs.map(p=>p.grade))];
    root.innerHTML=`<div id="msg"></div>
    <div class="card2"><b>🔗 إسناد المخدومين للخدام</b>
      <p class="hint">الخادم بيشوف (حضور، افتقاد، نتايج، ملف) المخدومين المسندين له بس. الكاهن والمالك بيشوفوا الكل. خادم من غير إسناد = شاشات فاضية.</p>
      <div class="fld"><label for="sv">الخادم</label><select id="sv"><option value="">— اختر —</option>${S.staff.map(u=>`<option value="${u.id}"${u.id===S.sel?' selected':''}>${esc(u.name||u.email)} (${S.counts.get(u.id)||0})</option>`).join('')}</select></div>
      ${S.staff.length?'':'<p class="hint">مفيش خدام بعد. أضف حساب خادم من «حسابات الطاقم».</p>'}
    </div>
    ${S.sel?`<div class="card2">
      <div class="fld"><input id="q" placeholder="ابحث بالاسم…" autocomplete="off" value="${esc(S.q)}" aria-label="بحث"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${[['','الكل'],['ولد','👦 ولاد'],['بنت','👧 بنات']].map(([v,l])=>`<button class="btn${S.g===v?'':' sec'}" style="${SB}" data-a="gender" data-v="${v}">${l}</button>`).join('')}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${grades.map(g=>`<button class="btn sec" style="${SB}" data-a="grade-on" data-g="${esc(g)}">+ كل ${esc(g)}${gl}</button>`).join('')}<button class="btn sec" style="${SB}" data-a="all-on">+ كل المعروضين</button><button class="btn sec" style="${SB}" data-a="none">إلغاء الكل</button></div>
      <p class="hint">المحدد: <b>${S.cur.size}</b> من ${S.profs.length}${dirty()?' — <b>تعديلات غير محفوظة</b>':''}</p>
      <div style="max-height:50vh;overflow:auto">${list.map(p=>`<label class="chk"><input type="checkbox" data-id="${p.id}"${S.cur.has(p.id)?' checked':''}> ${esc(p.name)} <small class="k">· ${esc(p.grade)} · ${esc(p.gender||'')}</small></label>`).join('')||'<p class="hint">لا نتائج.</p>'}</div>
      <button class="btn" data-a="save"${dirty()&&!S.busy?'':' disabled'}>حفظ الإسناد</button>
    </div>
    <div class="card2"><b>📌 قواعد الإسناد التلقائي</b>
      <p class="hint">أي مخدوم جديد (أو غيّر صفه/نوعه) يطابق القاعدة يتسند للخادم ده تلقائياً، حتى لو متسند لخدام تانيين. القاعدة ما بتمسحش إسناداً موجوداً، وما بتغيّرش الحاليين (للحاليين استخدم أزرار «+ كل …» فوق).</p>
      ${S.rulesOk?`${(()=>{ const rgr=[...new Set([...grades,...S.rules.map(r=>r.grade)])], rg=S.rg&&rgr.includes(S.rg)?S.rg:(rgr[0]||''), rn=S.rn||S.g||'ولد';
        return `<div class="fld"><label for="rg">الصف</label><select id="rg">${rgr.map(g=>`<option value="${esc(g)}"${g===rg?' selected':''}>${esc(g)}</option>`).join('')}</select></div>
        <div class="fld"><label for="rn">النوع</label><select id="rn"><option value="ولد"${rn==='ولد'?' selected':''}>👦 ولاد</option><option value="بنت"${rn==='بنت'?' selected':''}>👧 بنات</option></select></div>
        <button class="btn" data-a="rule-add"${rg?'':' disabled'}>📌 حفظ كقاعدة ثابتة</button>`; })()}
      ${S.rules.filter(r=>r.staff_uid===S.sel).map(r=>`<div class="row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px"><span>${esc(r.grade)} · ${r.gender==='ولد'?'👦 ولاد':'👧 بنات'}</span><button class="x" data-a="rule-del" data-id="${Number(r.id)}">حذف</button></div>`).join('')||'<p class="hint">لا توجد قواعد لهذا الخادم.</p>'}`
      :'<div class="err">جدول القواعد غير موجود: شغّل SQL v9.42 (20261019_auto_assignment_rules.sql) في Supabase ثم اضغط إعادة التحميل.</div>'}
    </div>`:''}`;
  }
  root.addEventListener('change',e=>{
    if(e.target.id==='rg'){ S.rg=e.target.value; return; }
    if(e.target.id==='rn'){ S.rn=e.target.value; return; }
    if(e.target.id==='sv'){ if(dirty()&&!confirm('فيه تعديلات غير محفوظة. تتجاهلها؟')){ e.target.value=S.sel; return; } S.sel=''; if(e.target.value) pick(e.target.value); else paint(); return; }
    const id=e.target.dataset&&e.target.dataset.id; if(id){ e.target.checked?S.cur.add(id):S.cur.delete(id); const h=root.querySelector('.hint b'); paint2(); }
  });
  function paint2(){ const sc=root.querySelector('div[style*="max-height"]'); const top=sc?sc.scrollTop:0; const qv=root.querySelector('#q'); const f=qv&&document.activeElement===qv; paint(); const n=root.querySelector('div[style*="max-height"]'); if(n) n.scrollTop=top; if(f){ const x=root.querySelector('#q'); x.focus(); x.setSelectionRange(x.value.length,x.value.length);} }
  root.addEventListener('input',e=>{ if(e.target.id==='q'){ S.q=e.target.value; paint2(); } });
  root.addEventListener('click',async e=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='reload') return load();
    if(a==='none'){ S.cur.clear(); return paint2(); }
    if(a==='gender'){ S.g=t.dataset.v; return paint2(); }
    if(a==='grade-on'){ for(const p of S.profs) if(p.grade===t.dataset.g&&(!S.g||p.gender===S.g)) S.cur.add(p.id); return paint2(); }
    if(a==='all-on'){ const q=nz(S.q); for(const p of S.profs) if((!q||nz(p.name).includes(q))&&(!S.g||p.gender===S.g)) S.cur.add(p.id); return paint2(); }
    if(a==='rule-add'){
      const sel=root.querySelector('#rg'), gn=root.querySelector('#rn'); const grade=sel&&sel.value, gender=gn&&gn.value; if(!S.sel||!grade||!gender) return;
      S.rg=grade; S.rn=gender; t.disabled=true;
      try{
        await api('/rest/v1/staff_assignment_rules?on_conflict=staff_uid,grade,gender',{method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:[{staff_uid:S.sel,grade,gender}]});
        await loadRules(); paint2(); say('اتحفظت القاعدة ✅ — بتسري على المخدومين الجدد من دلوقتي.');
      }catch(x){ paint2(); say(errMsg(x),true); }
      return;
    }
    if(a==='rule-del'){
      if(!confirm('حذف القاعدة؟ الإسنادات الموجودة بتفضل زي ما هي.')) return; t.disabled=true;
      try{ await api(`/rest/v1/staff_assignment_rules?id=eq.${Number(t.dataset.id)}`,{method:'DELETE',prefer:'return=minimal'}); await loadRules(); paint2(); say('اتحذفت القاعدة.'); }
      catch(x){ paint2(); say(errMsg(x),true); }
      return;
    }
    if(a==='save'){
      const add=[...S.cur].filter(x=>!S.orig.has(x)), del=[...S.orig].filter(x=>!S.cur.has(x));
      if(del.length&&!confirm(`هتشيل ${del.length} مخدوم من الخادم ده. متأكد؟`)) return;
      S.busy=true; t.disabled=true;
      try{
        for(let i=0;i<add.length;i+=200) await api('/rest/v1/staff_profile_assignments?on_conflict=staff_uid,profile_id',{method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:add.slice(i,i+200).map(pid=>({staff_uid:S.sel,profile_id:pid}))});
        for(let i=0;i<del.length;i+=100) await api(`/rest/v1/staff_profile_assignments?staff_uid=eq.${S.sel}&profile_id=in.(${del.slice(i,i+100).join(',')})`,{method:'DELETE',prefer:'return=minimal'});
        S.busy=false; const keep=S.sel; await load(); pick(keep); say('تم حفظ الإسناد ✅');
      }catch(x){ S.busy=false; paint(); say(errMsg(x),true); }
    }
  });
  load();
}
