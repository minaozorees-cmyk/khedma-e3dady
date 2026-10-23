// ملف المخدوم الموحد: يعرض السجلات الموجودة فقط؛ لا ينشئ ملاحظات أو بيانات جديدة.
import {api,errMsg,fmtD,SB,studentBox,loadFuTpl} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
export async function mount(el,{role}={}){
  if(!['servant','priest','owner'].includes(role)){el.innerHTML='<div class="ph">الصفحة غير متاحة.</div>';return;}
  let id=''; try{id=sessionStorage.getItem('selectedProfileId')||'';}catch(e){}
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)){el.innerHTML='<div class="card2"><p class="hint">افتح ملف المخدوم من لوحة قيادة الخادم.</p><button class="btn sec" data-go="dashboard">العودة للوحة القيادة</button></div>';el.onclick=e=>{const t=e.target.closest('[data-go]');if(t)location.hash='#/'+t.dataset.go;};return;}
  const root=document.createElement('div');root.className='gate';root.style.maxWidth='850px';el.replaceChildren(root);
  root.innerHTML='<div class="ph">جارٍ تحميل الملف…</div>';
  const $=s=>root.querySelector(s);
  try{
    const p=await api(`/rest/v1/profiles?select=id,name,grade,gender,created_at&id=eq.${id}&limit=1`);
    if(!p||!p.length) throw Object.assign(new Error('لا يمكن الوصول إلى هذا الملف أو أنه غير موجود.'),{status:403});
    const profile=p[0];
    const [attendance,results,followups,opens,phone]=await Promise.all([
      api(`/rest/v1/attendance?select=meeting_id,status,updated_at,meetings(held_on,title)&profile_id=eq.${id}&order=updated_at.desc&limit=50`).catch(()=>[]),
      api(`/rest/v1/results?select=book_id,chapter_num,score,total,attempt_no,attempted_at&profile_id=eq.${id}&order=attempted_at.desc&limit=100`).catch(()=>[]),
      api(`/rest/v1/followups?select=created_at&profile_id=eq.${id}&order=created_at.desc&limit=30`).catch(()=>[]),
      api(`/rest/v1/book_opens?select=book_id,chapter_num,opened_at&profile_id=eq.${id}&order=opened_at.desc&limit=30`).catch(()=>[]),
      // (v9.490) التليفون في طلب منفصل: لو فشل الأزرار بس تختفي والملف يفتح عادي
      api(`/rest/v1/profiles?select=phone&id=eq.${id}&limit=1`).then(r=>(r&&r[0]&&r[0].phone)||'').catch(()=>'')
    ]);
    const firstMap=new Map();
    for(const r of results){const k=r.book_id+'|'+r.chapter_num;if(!firstMap.has(k)||Number(r.attempt_no)<Number(firstMap.get(k).attempt_no))firstMap.set(k,r);}
    const first=[...firstMap.values()];
    const avg=first.length?Math.round(first.reduce((n,r)=>n+100*Number(r.score)/Math.max(1,Number(r.total)),0)/first.length):null;
    const attCount={present:attendance.filter(a=>a.status==='present').length,absent:attendance.filter(a=>a.status==='absent').length,excused:attendance.filter(a=>a.status==='excused').length};
    root.innerHTML=`<div class="card2" style="background:linear-gradient(135deg,rgba(201,168,76,.16),rgba(201,168,76,.03))">
      <button class="btn sec" data-go="dashboard" style="${SB}">← لوحة قيادة الخادم</button>
      <h2 class="ttl">${esc(profile.name)}</h2><div class="hint">${esc(profile.grade)} · ${esc(profile.gender||'')} · تاريخ التسجيل ${fmtD(profile.created_at)}</div>${studentBox({phone,name:profile.name,tpl:loadFuTpl()})}
      <div class="stats"><div class="st"><b>${attCount.present}</b><small>حضور (آخر ٥٠ سجلًا)</small></div><div class="st"><b>${attCount.absent}</b><small>غياب (آخر ٥٠ سجلًا)</small></div><div class="st"><b>${first.length}</b><small>إصحاح له نتيجة</small></div><div class="st"><b>${avg===null?'—':avg+'٪'}</b><small>متوسط نسبة أول محاولة</small></div></div>
    </div>
    <div class="card2"><b>🗓️ الحضور</b><div class="hint">آخر ${attendance.length} سجل حضور متاح.</div>
      ${attendance.length?attendance.map(a=>`<div class="row"><span>${esc(a.meetings&&a.meetings.held_on?fmtD(a.meetings.held_on):'اجتماع')} ${a.meetings&&a.meetings.title?'· '+esc(a.meetings.title):''}</span><b>${a.status==='present'?'حاضر':a.status==='absent'?'غائب':'بعذر'}</b></div>`).join(''):'<p class="hint">لا توجد سجلات حضور.</p>'}
    </div>
    <div class="card2"><b>📘 نتائج الامتحانات</b><div class="hint">يعرض هذا القسم أول محاولة لكل إصحاح، اتساقًا مع احتساب لوحة التميز. لا يتضمن إجابات الامتحان.</div>
      ${first.length?first.sort((a,b)=>new Date(b.attempted_at)-new Date(a.attempted_at)).slice(0,50).map(r=>`<div class="row"><span>${esc(r.book_id)} — إصحاح ${r.chapter_num}<small class="k"> · ${fmtD(r.attempted_at)}</small></span><b>${r.score} / ${r.total}</b></div>`).join(''):'<p class="hint">لا توجد نتائج مسجلة.</p>'}
    </div>
    <div class="card2"><b>🤝 سجل الافتقاد</b><div class="hint">نعرض تواريخ تسجيل الافتقاد فقط. لا نعرض نص الملاحظات هنا.</div>
      ${followups.length?followups.map(f=>`<div class="row"><span>تم تسجيل افتقاد</span><b>${fmtD(f.created_at)}</b></div>`).join(''):'<p class="hint">لا توجد سجلات افتقاد.</p>'}
    </div>
    <div class="card2"><b>📖 آخر الأنشطة التعليمية</b>
      ${opens.length?opens.map(o=>`<div class="row"><span>${esc(o.book_id)} — إصحاح ${o.chapter_num}</span><b>${fmtD(o.opened_at)}</b></div>`).join(''):'<p class="hint">لا توجد سجلات فتح مواد تعليمية.</p>'}
    </div>
    <p class="hint">البيانات المعروضة مستمدة من سجلات المشروع الحالية. لا يتضمن الملف الاعتراف أو الأجبية أو أي ملاحظات روحية جديدة.</p>`;
    root.onclick=e=>{const t=e.target.closest('[data-go]');if(t)location.hash='#/'+t.dataset.go;};
  }catch(e){
    root.innerHTML=`<div class="card2"><h3 class="ttl">تعذّر فتح الملف</h3><div class="err">${esc(errMsg(e))}</div><p class="hint">قد لا تكون مخوّلًا لهذا الملف، أو قد لا تكون سياسات قاعدة البيانات قد حُدّثت بعد. لم يتم عرض بيانات بديلة.</p><button class="btn sec" data-go="dashboard">العودة للوحة القيادة</button></div>`;
    root.onclick=e=>{const t=e.target.closest('[data-go]');if(t)location.hash='#/'+t.dataset.go;};
  }
}
