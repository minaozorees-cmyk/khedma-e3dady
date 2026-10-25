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
