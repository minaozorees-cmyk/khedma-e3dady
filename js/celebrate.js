// (v9.502) احتفال بعد إنهاء الامتحان: كونفيتي ذهبي/أبيض بـCSS (٣ ثواني) + نغمة خفيفة Web Audio (~٢ث) لو المخدوم فعّل الصوت.
// الصوت مغلق افتراضياً (localStorage 'celebSound'='1' للتفعيل). ما فيش API في المتصفح يكشف إن الموبايل صامت:
// آيفون بيكتم Web Audio مع مفتاح الصامت تلقائياً، وأندرويد ما فيهوش وسيلة — عشان كده الصوت اختياري.
// المتصفح بيشترط لمسة من المستخدم قبل الصوت: أول لمسة على الصفحة (لو الصوت مفعّل) بتجهّز الـAudioContext.
export const SOUND_KEY='celebSound';
export const MS_VISIBLE=3000, PIECES=44;
let ctx=null;
const ls=()=>{ try{ return typeof localStorage!=='undefined'?localStorage:null; }catch(e){ return null; } };
export const soundOn=()=>{ try{ const s=ls(); return !!s&&s.getItem(SOUND_KEY)==='1'; }catch(e){ return false; } };
export function setSound(on){ try{ const s=ls(); if(s){ if(on) s.setItem(SOUND_KEY,'1'); else s.removeItem(SOUND_KEY); } }catch(e){} if(on) unlock(); }
// تحتفل لأول محاولة فقط، ودرجتها أكبر من صفر، ومن إنهاء الامتحان (مش الخروج في النص)
export const shouldCelebrate=(att,source)=>!!att&&source==='finish'&&att.attemptNo===1&&Number(att.score)>0;
const AC=()=>{ try{ return typeof window!=='undefined'?(window.AudioContext||window.webkitAudioContext):null; }catch(e){ return null; } };
export function unlock(){
  try{ const C=AC(); if(!C) return false; if(!ctx) ctx=new C(); if(ctx.state==='suspended') ctx.resume().catch(()=>{}); return true; }catch(e){ return false; }
}
// نغمة صاعدة هادية (دو-مي-صول-دو عالي) بنحو ٢ ثانية، بصوت منخفض
export function tone(){
  try{
    if(!unlock()||!ctx) return false;
    const t0=ctx.currentTime+0.02, notes=[523.25,659.25,783.99,1046.5], out=ctx.createGain();
    out.gain.value=0.5; out.connect(ctx.destination);
    notes.forEach((f,i)=>{
      const o=ctx.createOscillator(), g=ctx.createGain(), s=t0+i*0.28, dur=i===notes.length-1?1.15:0.5;
      o.type='sine'; o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,s); g.gain.exponentialRampToValueAtTime(0.22,s+0.04); g.gain.exponentialRampToValueAtTime(0.0001,s+dur);
      o.connect(g); g.connect(out); o.start(s); o.stop(s+dur+0.05);
    });
    return true;
  }catch(e){ return false; }
}
const reduced=()=>{ try{ return !!(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){ return false; } };
// يبني طبقة الكونفيتي ويشيلها بعد ٣ ثواني. بترجع العنصر (أو null لو مفيش document).
export function confetti(doc){
  doc=doc||(typeof document!=='undefined'?document:null); if(!doc||!doc.body) return null;
  const old=doc.getElementById('cele'); if(old) old.remove();
  const el=doc.createElement('div'); el.id='cele'; el.setAttribute('aria-hidden','true');
  if(reduced()){ el.className='cele-static'; el.textContent='🎉 أحسنت!'; }
  else{
    let h='';
    for(let i=0;i<PIECES;i++){
      const left=Math.round((i+0.5)*100/PIECES+(((i*37)%7)-3)), delay=((i*53)%12)/10, dur=1.6+((i*29)%10)/10, w=6+((i*17)%6), rot=((i*71)%360);
      h+=`<i class="${i%2?'w':'g'}" style="left:${Math.min(98,Math.max(1,left))}%;width:${w}px;height:${w*1.7}px;animation-delay:${delay}s;animation-duration:${dur}s;--r:${rot}deg"></i>`;
    }
    el.innerHTML=h;
  }
  doc.body.appendChild(el);
  setTimeout(()=>{ try{ el.remove(); }catch(e){} },MS_VISIBLE);
  return el;
}
export function celebrate(){ confetti(); if(soundOn()) tone(); }
// نقطة الدخول الوحيدة من books/index.js: ما بترميش أي خطأ أبداً (الاحتفال ما يكسرش الامتحان)
export function maybe(att,source){ try{ if(shouldCelebrate(att,source)) celebrate(); }catch(e){} }
if(typeof document!=='undefined'&&document.addEventListener){
  const once=()=>{ if(soundOn()) unlock(); };
  document.addEventListener('pointerdown',once,{passive:true,capture:true});
}
