// الحضور (v9.6): تسجيل حضور اجتماع (تاريخ + صف) + تقرير نسبة الحضور لكل مخدوم. الغياب بيغذّي قائمة الافتقاد.
import {api,all,errMsg,fmtD,today,SB} from '../../js/sapi.js';
import {esc} from '../../js/consts.js';
const GRADES=['الأول الإعدادي','الثاني الإعدادي','الثالث الإعدادي'];
const ST={present:['✓ حاضر','on'],absent:['✗ غائب','off'],excused:['~ بعذر','']};
export async function mount(el){
  const S={tab:'rec',date:today(),grade:GRADES[0],title:'',students:[],marks:{},had:{},meetingId:null,days:90,rep:null};
  const root=document.createElement('div'); root.className='gate'; root.style.maxWidth='720px'; el.innerHTML=''; el.appendChild(root);
  const $=(s)=>root.querySelector(s), say=(t,bad)=>{ const m=$('#msg'); if(m) m.innerHTML=t?`<div class="${bad?'err':'hint'}">${esc(t)}</div>`:''; };
  const gradeSel=()=>`<div class="fld"><label for="ag">الصف</label><select id="ag">${GRADES.map(g=>`<option${g===S.grade?' selected':''}>${g}</option>`).join('')}</select></div>`;
  function paint(){
    root.innerHTML=`<div class="tabs2"><button data-a="tab" data-t="rec" class="${S.tab==='rec'?'on':''}">تسجيل حضور</button><button data-a="tab" data-t="rep" class="${S.tab==='rep'?'on':''}">التقرير</button></div><div id="msg"></div><div id="body"></div>`;
    S.tab==='rec'?paintRec():paintRep();
  }
  // ── تسجيل ──
  async function loadRec(){
    say('جارٍ التحميل…'); S.marks={}; S.had={}; S.meetingId=null;
    try{
      S.students=await api(`/rest/v1/profiles?select=id,name&grade=eq.${encodeURIComponent(S.grade)}&deleted_at=is.null&order=name.asc&limit=1000`);
      const m=await api(`/rest/v1/meetings?select=id,title&held_on=eq.${S.date}&grade=eq.${encodeURIComponent(S.grade)}`);
      if(m&&m.length){ S.meetingId=m[0].id; S.title=m[0].title||'';
        const a=await api(`/rest/v1/attendance?select=profile_id,status&meeting_id=eq.${S.meetingId}&limit=1000`);
        a.forEach(x=>{ S.marks[x.profile_id]=x.status; S.had[x.profile_id]=1; }); }
      say('');
    }catch(e){ say(errMsg(e),true); }
    paintRec();
  }
  function counts(){ const c={present:0,absent:0,excused:0}; Object.values(S.marks).forEach(v=>c[v]++); return c; }
  function paintRec(){
    const b=$('#body'); if(!b) return; const c=counts();
    b.innerHTML=`<div class="card2"><div class="fld"><label for="ad">التاريخ</label><input id="ad" type="date" value="${S.date}" max="${today()}"></div>${gradeSel()}
      <div class="fld"><label for="at">عنوان الاجتماع <small>(اختياري)</small></label><input id="at" maxlength="120" value="${esc(S.title)}"></div></div>
      <div class="hint" id="cnt">${S.meetingId?'اجتماع مسجّل — بتعدّل عليه. ':''}حاضر ${c.present} · غائب ${c.absent} · بعذر ${c.excused} · من ${S.students.length}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><button class="btn sec" style="${SB}" data-a="allp">الكل حاضر</button><button class="btn sec" style="${SB}" data-a="clr">مسح</button></div>
      ${S.students.length?S.students.map(s=>`<div class="card2" data-row="${s.id}"><b>${esc(s.name)}</b><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${Object.entries(ST).map(([k,[l]])=>`<button class="btn ${S.marks[s.id]===k?'':'sec'}" style="${SB}" data-a="mark" data-id="${s.id}" data-s="${k}">${l}</button>`).join('')}</div></div>`).join(''):'<div class="ph">لا يوجد مخدومون في هذا الصف.</div>'}
      <div class="err" id="serr"></div><button class="btn" data-a="save">💾 حفظ الحضور</button>`;
  }
  async function save(){
    const err=$('#serr'); err.textContent='';
    const ids=Object.keys(S.marks); if(!ids.length&&!Object.keys(S.had).length){ err.textContent='لسه ما سجّلتش حاجة.'; return; }
    const btn=root.querySelector('[data-a="save"]'); btn.disabled=true;
    try{
      const mt=await api('/rest/v1/meetings?on_conflict=held_on,grade',{method:'POST',prefer:'resolution=merge-duplicates,return=representation',body:{held_on:S.date,grade:S.grade,title:$('#at').value.trim()||null}});
      S.meetingId=mt[0].id;
      if(ids.length) await api('/rest/v1/attendance?on_conflict=meeting_id,profile_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',
        body:ids.map(pid=>({meeting_id:S.meetingId,profile_id:pid,status:S.marks[pid],updated_at:new Date().toISOString()}))});
      const del=Object.keys(S.had).filter(pid=>!S.marks[pid]);                 // اتمسحت علامتهم
      if(del.length) await api(`/rest/v1/attendance?meeting_id=eq.${S.meetingId}&profile_id=in.(${del.join(',')})`,{method:'DELETE',prefer:'return=minimal'});
      S.had={}; ids.forEach(i=>{ S.had[i]=1; }); say('تم حفظ الحضور ✅'); paintRec();
    }catch(e){ err.textContent=errMsg(e); }
    btn.disabled=false;
  }
  // ── التقرير ──
  async function loadRep(){
    say('جارٍ التحميل…'); S.rep=null;
    try{
      const since=S.days?new Date(Date.now()-S.days*864e5).toISOString().slice(0,10):'1970-01-01';
      const [studs,ms]=await Promise.all([api(`/rest/v1/profiles?select=id,name&grade=eq.${encodeURIComponent(S.grade)}&deleted_at=is.null&order=name.asc&limit=1000`),
        api(`/rest/v1/meetings?select=id,held_on&grade=eq.${encodeURIComponent(S.grade)}&held_on=gte.${since}&order=held_on.desc&limit=500`)]);
      let att=[];
      for(let i=0;i<ms.length;i+=40){ const ids=ms.slice(i,i+40).map(m=>m.id).join(','); att=att.concat(await all(`/rest/v1/attendance?select=meeting_id,profile_id,status&meeting_id=in.(${ids})&order=meeting_id.asc,profile_id.asc`)); }
      const by={}; att.forEach(a=>{ (by[a.profile_id]=by[a.profile_id]||[]).push(a.status); });
      S.rep={n:ms.length,rows:studs.map(s=>{ const v=by[s.id]||[], p=v.filter(x=>x==='present').length, ab=v.filter(x=>x==='absent').length, d=p+ab; return {name:s.name,p,ab,ex:v.length-p-ab,pct:d?Math.round(p*100/d):null}; })
        .sort((a,b)=>(a.pct==null)-(b.pct==null)||(a.pct??0)-(b.pct??0))};
      say('');
    }catch(e){ say(errMsg(e),true); }
    paintRep();
  }
  function paintRep(){
    const b=$('#body'); if(!b) return; const R=S.rep;
    b.innerHTML=`<div class="card2">${gradeSel()}<div class="fld"><label for="ap">المدة</label><select id="ap"><option value="30"${S.days===30?' selected':''}>آخر ٣٠ يوم</option><option value="90"${S.days===90?' selected':''}>آخر ٩٠ يوم</option><option value="0"${S.days===0?' selected':''}>كل الاجتماعات</option></select></div></div>
      ${R?`<div class="hint">${R.n} اجتماع. النسبة = حاضر ÷ (حاضر + غائب)، والعذر مش محسوب.</div>`+R.rows.map(r=>`<div class="card2"><div class="row" style="border:0;padding:0"><b>${esc(r.name)}</b><span>${r.pct==null?'—':r.pct+'%'}</span></div>
        <div class="prog"><i style="width:${r.pct||0}%"></i></div><div class="k">حاضر ${r.p} · غائب ${r.ab} · بعذر ${r.ex}</div></div>`).join(''):'<div class="hint">جارٍ التحميل…</div>'}`;
  }
  root.addEventListener('click',(e)=>{
    const t=e.target.closest('[data-a]'); if(!t||t.disabled) return; const a=t.dataset.a;
    if(a==='tab'){ S.tab=t.dataset.t; say(''); paint(); S.tab==='rec'?loadRec():loadRep(); }
    else if(a==='mark'){ const id=t.dataset.id, v=t.dataset.s; if(S.marks[id]===v) delete S.marks[id]; else S.marks[id]=v; paintRec(); }
    else if(a==='allp'){ S.students.forEach(s=>{ S.marks[s.id]='present'; }); paintRec(); }
    else if(a==='clr'){ S.marks={}; paintRec(); }
    else if(a==='save') save();
  });
  root.addEventListener('change',(e)=>{
    const t=e.target;
    if(t.id==='ad'){ if(!t.value) return; S.date=t.value; loadRec(); }
    else if(t.id==='ag'){ S.grade=t.value; S.tab==='rec'?loadRec():loadRep(); }
    else if(t.id==='ap'){ S.days=Number(t.value); loadRep(); }
  });
  root.addEventListener('input',(e)=>{ if(e.target.id==='at') S.title=e.target.value; });
  paint(); await loadRec();
}
