// (v9.493) كشف الأسماء المكررة بين حسابات المخدومين النشطة — منطق نقي (بدون DOM/سيرفر) قابل للاختبار بـNode.
// المدخلات: profiles (من profiles)، activity (من profile_activity: last_seen/sessions)، results (صفوف results_first_staff: أول محاولة لكل إصحاح).
// الاسم يتقارن بنفس normName اللي بيتحفظ به name_norm على السيرفر. ما بنعتمدش على التليفون للتفريق، بس بنعرض هل هو نفسه ولا لأ.
import {normName,normPhoneEG} from './auth.js';
import {n} from './dates.js';
const collator=new Intl.Collator('ar');
const ts=(x)=>{ const t=x?Date.parse(x):NaN; return Number.isFinite(t)?t:0; };
const active=(p)=>!p.deleted_at&&!p.archived_at;
// أسماء متكررة بين النشطين (للشارة في لوحة المالك)
export function dupKeys(profiles){
  const c=new Map(); for(const p of profiles||[]){ if(!active(p)) continue; const k=normName(p.name); if(k) c.set(k,(c.get(k)||0)+1); }
  return new Set([...c].filter(([,v])=>v>1).map(([k])=>k));
}
export const booksText=(books)=>(books||[]).map(b=>`${b.title}: ${b.chapters.map(n).join('، ')}`).join(' · ');
// resOk=false (النتائج ما اتحمّلتش أو من كاش) → ما نقدرش نحكم إن حساب «فاضي» → مفيش أرشفة
export function findDupes({profiles=[],activity=[],results=[],resOk=true}={}){
  const act=new Map(activity.map(a=>[a.profile_id,a])), res=new Map();
  for(const r of results){
    let x=res.get(r.profile_id); if(!x) res.set(r.profile_id,x={n:0,last:0,books:new Map()});
    x.n++; x.last=Math.max(x.last,ts(r.first_attempted_at));
    const t=r.title||r.book_id||'—'; (x.books.get(t)||x.books.set(t,[]).get(t)).push(Number(r.chapter_num));
  }
  const by=new Map();
  for(const p of profiles){ if(!active(p)) continue; const k=normName(p.name); if(!k) continue; (by.get(k)||by.set(k,[]).get(k)).push(p); }
  const groups=[];
  for(const [key,list] of by){
    if(list.length<2) continue;
    const accounts=list.map(p=>{
      const r=res.get(p.id)||{n:0,last:0,books:new Map()}, a=act.get(p.id)||{};
      return {id:p.id,name:p.name,grade:p.grade,phone:p.phone||'',code:p.code||'',created_at:p.created_at,
        guardianName:p.guardian_name||'',guardianPhone:p.guardian_phone||'',
        solved:r.n,lastSolve:r.last,books:[...r.books].map(([title,chs])=>({title,chapters:chs.sort((x,y)=>x-y)})),
        lastSeen:ts(a.last_seen),sessions:a.sessions||0,activity:Math.max(ts(a.last_seen),r.last)};
    }).sort((a,b)=>ts(a.created_at)-ts(b.created_at)||a.id.localeCompare(b.id));   // الأقدم = حساب ١
    const top=Math.max(...accounts.map(a=>a.activity)), tops=accounts.filter(a=>a.activity===top);
    for(const a of accounts){ a.latest=top>0&&tops.length===1&&a.activity===top; a.canArchive=resOk&&a.solved===0; }
    const ph=accounts.map(a=>a.phone?normPhoneEG(a.phone):'');
    const withRes=accounts.filter(a=>a.solved>0).length;
    groups.push({key,name:accounts[0].name,accounts,total:accounts.reduce((s,a)=>s+a.solved,0),
      samePhone:ph.every(x=>x&&x===ph[0]),sameGrade:new Set(accounts.map(a=>a.grade)).size===1,
      verdict:!resOk?'unknown':withRes===0?'allEmpty':withRes===1?'oneHasResults':'manyHaveResults'});
  }
  return groups.sort((a,b)=>b.accounts.length-a.accounts.length||b.total-a.total||collator.compare(a.name,b.name));
}

// ── (v9.494) رسالة «الحساب المعتمد» + قسم «اتحلّت» ──
const first=(name)=>String(name||'').trim().split(/\s+/)[0]||'';
// archived=true: الحسابات التانية اتأرشفت فعلاً (قسم «اتحلّت»)، false: لسه هتتأرشف (من قايمة المكررة).
// to='guardian': الرسالة لولي الأمر (الحساب مفيهوش رقم للمخدوم نفسه). صيغة الكود زي «📋 نسخ» في لوحة المالك.
export function approvedMsg({name,code,archived=true,to='self'}){
  const others=archived?'الحسابات التانية بنفس اسمه اتأرشفت، وأي حل بيها مش هيتحسب.':'هنأرشف الحسابات التانية بنفس اسمه، وأي حل بيها بعد كده مش هيتحسب.';
  const mine=archived?'الحسابات التانية بنفس اسمك اتأرشفت، وأي حل بيها مش هيتحسب لك.':'هنأرشف الحسابات التانية بنفس اسمك، وأي حل بيها بعد كده مش هيتحسب لك.';
  const L=to==='guardian'
    ?['سلام ونعمة 🙏',`بخصوص حساب «${name}» في خدمة إعدادي، الحساب المعتمد هو:`]
    :[`سلام ونعمة يا ${first(name)} ❤️`,'حسابك المعتمد في خدمة إعدادي هو:'];
  L.push(`الاسم: ${name}`,`الكود: ${String(code||'—')}`,'(اكتب الاسم الكامل مع الكود لو فتحت الحساب على جهاز جديد)',
    to==='guardian'?others:mine,
    to==='guardian'?'من فضلكم ما يسجّلش حساب جديد، ويستخدم الحساب المعتمد بس.':'استخدم الحساب المعتمد بس، وما تسجّلش حساب جديد.',
    to==='guardian'?'احتفظوا بالكود ده في مكان آمن، هيحتاجه لو مسح التطبيق.':'احتفظ بالكود ده في مكان آمن، هتحتاجه لو مسحت التطبيق.',
    to==='guardian'?'لو محتاجين مساعدة، كلّموا الخادم.':'لو محتاج مساعدة، كلم خادمك.');
  return L.join('\n');
}
// الأرقام بالترتيب: رقم المخدوم ثم ولي الأمر؛ valid(phone) = دالة بترجّع true لو الرقم صالح لواتساب
export function pickContact(a,valid){
  if(a&&a.phone&&valid(a.phone)) return {to:'self',phone:a.phone};
  if(a&&a.guardianPhone&&valid(a.guardianPhone)) return {to:'guardian',phone:a.guardianPhone};
  return null;
}
// حسابات نشطة ليها حساب (أو أكتر) مؤرشف بنفس الاسم في آخر `days` يوم، ومفيش غيرها نشط بنفس الاسم (غير كده هي لسه في «المكررة»).
// hidden = Set من hideKey (id|آخر-أرشفة): لو اتأرشف حساب جديد بعدها الصف بيرجع يظهر.
export function findResolved({profiles=[],results=[],days=14,now=Date.now(),hidden=new Set()}={}){
  const solved=new Map(); for(const r of results) solved.set(r.profile_id,(solved.get(r.profile_id)||0)+1);
  const act=new Map(), arch=new Map();
  for(const p of profiles){
    if(p.deleted_at) continue; const k=normName(p.name); if(!k) continue;
    if(!p.archived_at){ (act.get(k)||act.set(k,[]).get(k)).push(p); continue; }
    if(now-ts(p.archived_at)>days*864e5) continue;
    (arch.get(k)||arch.set(k,[]).get(k)).push(p);
  }
  const out=[];
  for(const [k,list] of arch){
    const a=(act.get(k)||[]); if(a.length!==1) continue; const p=a[0];
    const lastArch=Math.max(...list.map(x=>ts(x.archived_at))), hideKey=p.id+'|'+lastArch; if(hidden.has(hideKey)) continue;
    out.push({key:k,name:p.name,hideKey,lastArch,
      account:{id:p.id,name:p.name,grade:p.grade,code:p.code||'',phone:p.phone||'',guardianName:p.guardian_name||'',guardianPhone:p.guardian_phone||'',solved:solved.get(p.id)||0},
      archived:list.map(x=>({id:x.id,archived_at:x.archived_at,code:x.code||''})).sort((x,y)=>ts(y.archived_at)-ts(x.archived_at))});
  }
  return out.sort((x,y)=>y.lastArch-x.lastArch||collator.compare(x.name,y.name));
}
