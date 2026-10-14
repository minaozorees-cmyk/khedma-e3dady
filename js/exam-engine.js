// منطق الامتحان فقط (بلا واجهة): تصحيح الاختيار من متعدد وأسئلة الترتيب.
export function shuffle(a){ const r=[...a]; for(let i=r.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [r[i],r[j]]=[r[j],r[i]]; } return r; }
export const correctOrder=(q)=>[...q.events].sort((a,b)=>a.correctOrder-b.correctOrder).map(e=>e.id);
export function shuffledEvents(q){ const co=correctOrder(q).join(); let r; for(let t=0;t<8;t++){ r=shuffle(q.events); if(r.map(e=>e.id).join()!==co) break; } return r; }
// الإجابة: رقم الاختيار للـMC، أو مصفوفة ids بالترتيب للترتيب
export const isAnswered=(q,a)=>q.isTimeline?(Array.isArray(a)&&a.length===q.events.length):Number.isInteger(a);
export function isCorrect(q,a){
  if(q.isTimeline){ const co=correctOrder(q); return Array.isArray(a)&&a.length===co.length&&a.every((id,i)=>id===co[i]); }
  return a===q.ans;
}
export function grade(qs,answers){ const detail=qs.map((q,i)=>isCorrect(q,answers[i])); return {score:detail.filter(Boolean).length,total:qs.length,detail}; }
