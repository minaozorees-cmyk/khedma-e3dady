// (v9.35) قراءة الإصحاح بصوت — Web Speech API (صوت الجهاز، مجاني). آية بآية مع تعليم الآية الجارية.
// الاستخدام: html+=TTS.bar()  ثم  TTS.bind(el) مرة واحدة للعنصر، وTTS.stop() قبل إعادة رسم الشاشة.
const RATES=[['0.8','بطيء'],['1','عادي'],['1.2','أسرع']];
const KEY='ttsRate';
const ok=()=>typeof window!=='undefined'&&'speechSynthesis' in window&&typeof SpeechSynthesisUtterance!=='undefined';
let list=[], idx=0, state='idle', root=null, voice=null, noAr=false;   // state: idle | play | pause
const rate=()=>{ try{ return localStorage.getItem(KEY)||'1'; }catch(e){ return '1'; } };
const setRate=(v)=>{ try{ localStorage.setItem(KEY,v); }catch(e){} };

function pickVoice(){
  try{
    const vs=speechSynthesis.getVoices()||[], ar=vs.filter(v=>/^ar/i.test(v.lang));
    voice=ar.find(v=>/EG/i.test(v.lang))||ar.find(v=>v.localService)||ar[0]||null; noAr=!voice&&vs.length>0;
  }catch(e){}
}
if(ok()){ pickVoice(); try{ speechSynthesis.addEventListener('voiceschanged',pickVoice); }catch(e){} }

export const supported=ok;
export function bar(){
  if(!ok()) return '';
  return `<div class="tts-bar" role="group" aria-label="الاستماع للإصحاح">
    <button class="btn" data-tts="play" type="button">🔊 استمع</button>
    <button class="btn sec" data-tts="pause" type="button" hidden>⏸ إيقاف مؤقت</button>
    <button class="btn sec" data-tts="stop" type="button" hidden>⏹ إنهاء</button>
    <select data-tts="rate" aria-label="سرعة القراءة">${RATES.map(([v,l])=>`<option value="${v}"${v===rate()?' selected':''}>${l}</option>`).join('')}</select>
    <div class="hint tts-msg" hidden></div></div>`;
}
const ui=()=>root&&root.querySelector('.tts-bar');
function paint(msg){
  const b=ui(); if(!b) return;
  const q=(k)=>b.querySelector(`[data-tts="${k}"]`);
  q('play').hidden=state==='play'; q('play').textContent=state==='pause'?'▶ كمّل':'🔊 استمع';
  q('pause').hidden=state!=='play'; q('stop').hidden=state==='idle';
  const m=b.querySelector('.tts-msg'); const t=msg||(noAr&&state!=='idle'?'مفيش صوت عربي متاح على جهازك، ممكن الصوت يكون غير واضح. نزّل صوت عربي من إعدادات الجهاز (Text-to-speech).':'');
  m.textContent=t; m.hidden=!t;
}
function clearMark(){ list.forEach(e=>e.classList.remove('tts-on')); }
const textOf=(e)=>{ const c=e.cloneNode(true); c.querySelectorAll('sup').forEach(s=>s.remove()); return c.textContent.replace(/\s+/g,' ').trim(); };
function next(){
  if(state!=='play') return;
  clearMark();
  if(idx>=list.length){ state='idle'; paint(); return; }
  const e=list[idx], t=textOf(e);
  if(!t){ idx++; return next(); }
  e.classList.add('tts-on'); try{ e.scrollIntoView({block:'center',behavior:'smooth'}); }catch(x){}
  const u=new SpeechSynthesisUtterance(t); u.lang=(voice&&voice.lang)||'ar-EG'; if(voice) u.voice=voice; u.rate=Number(rate())||1;
  const my=idx; let done=false;
  const go=()=>{ if(done) return; done=true; if(state==='play'&&idx===my){ idx++; next(); } };
  u.onend=go; u.onerror=(ev)=>{ if(ev&&(ev.error==='canceled'||ev.error==='interrupted')) return; paint('تعذّر تشغيل الصوت على الجهاز.'); state='idle'; clearMark(); };
  try{ speechSynthesis.speak(u); }catch(x){ state='idle'; paint('تعذّر تشغيل الصوت على الجهاز.'); }
}
export function stop(){
  state='idle'; idx=0; try{ if(ok()) speechSynthesis.cancel(); }catch(e){} clearMark(); list=[]; paint();
}
function play(){
  if(!root) return;
  if(state==='pause'){ state='play'; paint(); next(); return; }
  list=[...root.querySelectorAll('.ver')]; if(!list.length){ paint('مفيش نص للقراءة.'); return; }
  try{ speechSynthesis.cancel(); }catch(e){}
  pickVoice(); idx=0; state='play'; paint(); setTimeout(next,60);
}
function pause(){ if(state!=='play') return; state='pause'; try{ speechSynthesis.cancel(); }catch(e){} paint(); }   // إلغاء + تذكّر الآية (يشتغل على كل الأجهزة)
export function bind(el){
  root=el;
  if(el.__tts||!ok()) return; el.__tts=true;
  el.addEventListener('click',(e)=>{ const t=e.target.closest('[data-tts]'); if(!t||t.tagName==='SELECT') return; const a=t.dataset.tts;
    if(a==='play') play(); else if(a==='pause') pause(); else if(a==='stop') stop(); });
  el.addEventListener('change',(e)=>{ const t=e.target; if(t.dataset&&t.dataset.tts==='rate'){ setRate(t.value); if(state==='play'){ try{ speechSynthesis.cancel(); }catch(x){} } } });
  addEventListener('hashchange',stop); addEventListener('pagehide',stop);
}
