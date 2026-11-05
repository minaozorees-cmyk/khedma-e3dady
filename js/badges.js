// (v9.502) الإنجازات والشارات — دوال نقية (بدون شبكة أو تخزين). الحساب كله في الواجهة من نتائج المخدوم + جدول المواعيد المحلي.
// «محلول» = لإصحاح له أول محاولة (المعتمدة) بأي درجة. الأسبوع يبدأ الأحد ٠٠:٠٠ بتوقيت الجهاز (زي الداشبورد).
// المدخلات: attempts (results.all)، schedule ([{bid,num,o,c}] من access.schedule)، books ([{id,chapters:[{chapterNum}]}])، now.
const DAY=864e5, WEEK=7*DAY;
export const NASHEET_RUN=3, MUTHABIR_N=5;   // نشيط: ٣ ورا بعض · مثابر: ٥ في سفر واحد
export const weekStart=(t)=>{ const d=new Date(t); d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay()); return d.getTime(); };
const K=(b,n)=>b+'|'+n;

// أول محاولة (الأقدم) لكل إصحاح
export function firstAttempts(attempts){
  const m=new Map();
  for(const a of Array.isArray(attempts)?attempts:[]){
    if(!a||a.bookId==null||!(a.chapterNum>0)) continue;
    const at=Number.isFinite(a.at)?a.at:0, k=K(a.bookId,a.chapterNum), c=m.get(k);
    if(!c||at<c.at) m.set(k,{bookId:a.bookId,num:a.chapterNum,at});
  }
  return m;
}
const sched=(schedule)=>{ const m=new Map(); for(const s of Array.isArray(schedule)?schedule:[]) if(s&&s.bid!=null) m.set(K(s.bid,s.num),s); return m; };

// 🔥 نشيط: أطول تتابع إصحاحات محلولة ورا بعض بترتيب فتحها داخل السفر (الإصحاح المفتوح فقط يدخل الترتيب).
export function longestRun(first,schedule,books,now){
  const sm=sched(schedule); let best=0;
  for(const b of Array.isArray(books)?books:[]){
    const seq=(b.chapters||[]).map(c=>{ const s=sm.get(K(b.id,c.chapterNum)); return {num:c.chapterNum,o:s&&s.o!=null?s.o:0}; })
      .filter(x=>x.o<=now).sort((x,y)=>x.o-y.o||x.num-y.num);
    let run=0;
    for(const x of seq){ if(first.has(K(b.id,x.num))){ run++; if(run>best) best=run; } else run=0; }
  }
  return best;
}
// 📖 مثابر: أكبر عدد إصحاحات محلولة في سفر واحد
export function bestInBook(first){
  const per=new Map(); for(const f of first.values()) per.set(f.bookId,(per.get(f.bookId)||0)+1);
  let best=0; for(const v of per.values()) if(v>best) best=v; return best;
}
// ⭐ منظم: عدد الإصحاحات المحلولة في أول أسبوع (٧ أيام) من فتحها (لازم الإصحاح له ميعاد فتح)
export function onTimeCount(first,schedule){
  const sm=sched(schedule); let n=0;
  for(const f of first.values()){ const s=sm.get(K(f.bookId,f.num)); if(s&&s.o!=null&&f.at<=s.o+WEEK) n++; }
  return n;
}
// سلسلة الأسابيع: أسابيع متتالية فيها حل واحد على الأقل، تنتهي بالأسبوع الحالي (لو لسه ما حلّش فيه ما نكسرش السلسلة).
// الأسبوع اللي مفيهوش أي إصحاح مفتوح يتعدّى من غير ما يكسر السلسلة (ومن غير ما يتعدّ).
export function weekStreak(first,schedule,books,now){
  const sm=sched(schedule), W0=weekStart(now);
  const solvedWeeks=new Set([...first.values()].map(f=>weekStart(f.at)));
  if(!solvedWeeks.size) return 0;
  const minW=Math.min(...solvedWeeks);
  let alwaysOpen=false;   // إصحاح من غير ميعاد = مفتوح دايماً ← كل الأسابيع فيها إصحاح مفتوح
  for(const b of Array.isArray(books)?books:[]) for(const c of b.chapters||[]) if(!sm.has(K(b.id,c.chapterNum))) alwaysOpen=true;
  const rows=[...sm.values()];
  const hasOpen=(ws)=>{ if(alwaysOpen) return true; const we=ws+WEEK;
    return rows.some(s=>(s.o==null||s.o<we)&&(s.c==null||s.c>ws)); };
  let streak=0;
  for(let ws=W0,i=0;ws>=minW&&i<600;i++){
    if(solvedWeeks.has(ws)) streak++;
    else if(ws===W0) { /* الأسبوع الحالي لسه فاضي: مهلة */ }
    else if(hasOpen(ws)) break;
    const d=new Date(ws); d.setDate(d.getDate()-7); ws=d.getTime();
  }
  return streak;
}
export function computeBadges({attempts,schedule,books,now}={}){
  now=Number.isFinite(now)?now:Date.now();
  const first=firstAttempts(attempts);
  const run=longestRun(first,schedule,books,now), best=bestInBook(first), ontime=onTimeCount(first,schedule);
  const mk=(id,icon,name,desc,val,goal)=>({id,icon,name,desc,progress:Math.min(val,goal),goal,unlocked:val>=goal});
  return {
    stats:{solved:first.size,weekStreak:weekStreak(first,schedule,books,now)},
    badges:[
      mk('active','🔥','نشيط',`حل ${NASHEET_RUN} إصحاحات ورا بعض بترتيب فتحها`,run,NASHEET_RUN),
      mk('steady','📖','مثابر',`حل ${MUTHABIR_N} إصحاحات في سفر واحد`,best,MUTHABIR_N),
      mk('organized','⭐','منظم','حل إصحاح في أول أسبوع من فتحه',ontime,1)
    ]
  };
}
