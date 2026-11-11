// (v9.509) خريطة الإصحاحات للمخدوم (بديل شبكة الأزرار): مسار متعرج، عقدة لكل إصحاح، popover، نافذة كود الفتح.
// المنطق (الحالات/النصوص) في js/chmap-logic.js (متختبر). هنا الرسم والحركة فقط، بدون أي مكتبة خارجية.
// الربط بالتطبيق عن طريق books/index.js: أزرار popover فيها data-a="chap" data-n فبتعدّي على نفس handler فتح الإصحاح (جلسات/قفل/قراءة)،
// وأزرار الهيدر data-a="toBooks"/"verses". الكلاسات كلها بادئة cm- (css/app.css).
import {esc} from '../../js/consts.js';
import {derive,stateOf,doneIdx,counts,progIdx,hueFor,trailFrac,snap,grew,STATE_AR,footerText,hudText,popMessage,verifyMsg,ar} from '../../js/chmap-logic.js';

const NS='http://www.w3.org/2000/svg';
const ICONS={
  book:'<path d="M12 6.5C10 5 6.5 5 4 5.6v13c2.5-.6 6-.5 8 1 2-1.5 5.5-1.6 8-1v-13c-2.5-.6-6-.6-8 1.1Z"/><path d="M12 6.5v13"/>',
  play:'<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  cross:'<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  pin:'<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  lock:'<rect x="4.5" y="10.5" width="15" height="9.6" rx="2.8"/><path d="M8.2 10.5V7.9a3.8 3.8 0 0 1 7.6 0v2.6"/>',
  unlock:'<rect x="4.5" y="10.5" width="15" height="9.6" rx="2.8"/><path d="M8.2 10.5V7.9a3.8 3.8 0 0 1 7.2-1.6"/>',
  check:'<path d="M5 12.5l4.6 4.6L19 7"/>',
  spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  award:'<circle cx="12" cy="9" r="6"/><path d="M8.5 14.5L7 21l5-3 5 3-1.5-6.5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chev:'<path d="M9 6l6 6-6 6"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>'
};
const ic=(k,s=14,sw=2.4)=>`<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px">${ICONS[k]||''}</svg>`;
const fmtD=(t)=>new Date(t).toLocaleString('ar-EG',{dateStyle:'full',timeStyle:'short'});   // نفس صيغة شاشة «locked»
const fmtShort=(t)=>new Date(t).toLocaleDateString('ar-EG',{day:'numeric',month:'long'});
const reduced=()=>{ try{ return !!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches); }catch(e){ return false; } };
const haptic=(ms)=>{ try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){} };
const easeOutCubic=(t)=>1-Math.pow(1-t,3);

// آخر حالة شافها المخدوم لكل (حساب|سفر): لو رجع من نتيجة وفيه إصحاح اتحلّ جديد، المسار يتحرّك من المكان القديم للجديد. بدونه (أول مرة في الجلسة) فيه حركة افتتاحية.
const snaps=new Map();
let cleanup=null;

// ===== الهيكل (بيتحط في el.innerHTML من books/index.js، وبعدها init) =====
export function html(title,{verses}={}){
  return `<section class="cm" id="cm-root">
  <div class="cm-hd">
    <button class="cm-hd__back" type="button" data-a="toBooks"><span data-i="chev" data-s="13"></span>رجوع للأسفار</button>
    <div class="cm-hd__t"><b>${esc(title)}</b><small id="cm-bookSub"></small></div>
    ${verses?'<button class="cm-hd__verses" type="button" data-a="verses">📜 آيات السفر</button>':'<span class="cm-hd__verses" style="visibility:hidden" aria-hidden="true">📜 آيات السفر</span>'}
  </div>
  <section class="cm-map-card" id="cm-card">
    <div class="cm-ambient"></div><div class="cm-grid"></div>
    <div class="cm-sparkles">
      <span class="cm-sparkle" style="--x:12%;--y:16%;--d:.0s"></span><span class="cm-sparkle cm-sparkle--warm" style="--x:82%;--y:10%;--d:.7s"></span>
      <span class="cm-sparkle" style="--x:26%;--y:42%;--d:1.4s"></span><span class="cm-sparkle cm-sparkle--warm" style="--x:70%;--y:52%;--d:.3s"></span>
      <span class="cm-sparkle" style="--x:18%;--y:74%;--d:1.9s"></span><span class="cm-sparkle" style="--x:88%;--y:80%;--d:1.1s"></span>
      <span class="cm-sparkle cm-sparkle--warm" style="--x:50%;--y:88%;--d:.5s"></span>
    </div>
    <div class="cm-scroller" id="cm-scroller"><div class="cm-map" id="cm-map">
      <svg id="cm-svg" xmlns="${NS}">
        <defs>
          <linearGradient id="cmTrailGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="3500"></linearGradient>
          <filter id="cmSoftBlur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>
          <filter id="cmHeadGlow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <path id="cmGroove" fill="none" stroke="rgba(255,255,255,.028)" stroke-width="26" stroke-linecap="round"/>
        <path id="cmGhost" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 11"/>
        <path id="cmGlow" fill="none" stroke="url(#cmTrailGrad)" stroke-width="16" stroke-linecap="round" opacity=".55" filter="url(#cmSoftBlur)"/>
        <path id="cmTrail" fill="none" stroke="url(#cmTrailGrad)" stroke-width="4.5" stroke-linecap="round"/>
      </svg></div></div>
    <div class="cm-vig cm-vig--top"></div><div class="cm-vig cm-vig--bottom"></div><div class="cm-vig cm-vig--left"></div><div class="cm-vig cm-vig--right"></div>
    <div class="cm-hud" id="cm-hud">
      <div class="cm-hud__ring"><svg viewBox="0 0 40 40"><defs><linearGradient id="cmHudGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5FE0FF"/><stop offset=".5" stop-color="#B985FF"/><stop offset="1" stop-color="#FF8ADB"/></linearGradient></defs>
        <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="3.5"/>
        <circle id="cm-ringBar" cx="20" cy="20" r="16" fill="none" stroke="url(#cmHudGrad)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="100.53" stroke-dashoffset="100.53" transform="rotate(-90 20 20)" style="transition:stroke-dashoffset .7s ease"/></svg><b id="cm-hudCount">٠</b></div>
      <span class="cm-hud__label" id="cm-hudLabel"></span>
    </div>
    <div class="cm-popover" id="cm-popover" role="dialog" aria-live="polite">
      <div class="cm-pop__head"><div><div class="cm-pop__title" id="cm-popTitle"></div><div class="cm-pop__sub" id="cm-popSub"></div></div><span class="cm-pop__state" id="cm-popState"></span></div>
      <div class="cm-pop__stats" id="cm-popStats"><div><span>الدرجة (أول محاولة)</span><b id="cm-popGrade">—</b></div><div class="cm-sep"></div><div><span>المحاولات</span><b id="cm-popAttempt">—</b></div></div>
      <div class="cm-pop__message" id="cm-popMessage"></div>
      <div class="cm-pop__actions" id="cm-popActions"></div>
    </div>
    <div class="cm-toast" id="cm-toast"><span id="cm-toastIcon"></span><span id="cm-toastText"></span></div>
  </section>
  <div class="cm-footer">
    <div class="cm-location-row"><span class="cm-location-row__text"><span data-i="pin" data-s="13"></span>موقعك: <b id="cm-locationText">—</b></span>
      <button class="cm-btn-jump" id="cm-btnJump" type="button"><span data-i="cross" data-s="12"></span>إلى موصلي</button></div>
    <button class="cm-cta" id="cm-cta" type="button"></button>
  </div>
  <div class="cm-code-modal" id="cm-codeModal" aria-hidden="true">
    <div class="cm-code-modal__backdrop" id="cm-codeBackdrop"></div>
    <div class="cm-code-modal__panel" role="dialog" aria-modal="true">
      <button class="cm-code-modal__close" id="cm-codeClose" type="button" aria-label="إغلاق"><span data-i="x" data-s="15"></span></button>
      <div class="cm-code-modal__icon">🔒</div><h3 class="cm-code-modal__title" id="cm-codeTitle">فتح الإصحاح</h3>
      <p class="cm-code-modal__desc">لو معاك كود فتح من الخادم اكتبه هنا.</p>
      <input class="cm-code-modal__input" id="cm-codeInput" type="text" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="الكود" aria-label="كود الفتح">
      <p class="cm-code-modal__error" id="cm-codeError"></p>
      <div class="cm-code-modal__actions"><button class="cm-code-modal__btn cm-code-modal__btn--ghost" id="cm-codeCancel" type="button">إلغاء</button><button class="cm-code-modal__btn cm-code-modal__btn--primary" id="cm-codeConfirm" type="button">فتح بالكود</button></div>
    </div>
  </div>
</section>`;
}

// ===== احتفال خفيف (Canvas) =====
const COLORS=['#5FE0FF','#B985FF','#FF8ADB','#FFD27A','#FFE29A','#FFFFFF'];
let cv=null,cx=null,parts=[],raf=0;
function fitCv(){ if(!cv) return; const r=Math.min(2,window.devicePixelRatio||1); cv.width=innerWidth*r; cv.height=innerHeight*r; cx.setTransform(r,0,0,r,0,0); }
function emit(x,y,count,angle,spread,speed){
  for(let i=0;i<count;i++){ const a=(angle+(Math.random()-.5)*spread)*Math.PI/180, v=speed*(.45+Math.random()*.7);
    parts.push({x,y,vx:Math.cos(a)*v,vy:-Math.sin(a)*v,w:5+Math.random()*5,h:3+Math.random()*4,r:Math.random()*6.28,vr:(Math.random()-.5)*.4,c:COLORS[(Math.random()*COLORS.length)|0],t:0}); }
}
function loop(){
  cx.clearRect(0,0,innerWidth,innerHeight); parts=parts.filter((p)=>p.t<150);
  parts.forEach((p)=>{ p.t++; p.vy+=.3; p.vx*=.985; p.vy*=.985; p.x+=p.vx; p.y+=p.vy; p.r+=p.vr;
    cx.save(); cx.globalAlpha=Math.max(0,Math.min(1,(150-p.t)/50)); cx.translate(p.x,p.y); cx.rotate(p.r); cx.fillStyle=p.c; cx.fillRect(-p.w/2,-p.h/2,p.w,p.h); cx.restore(); });
  raf=parts.length?requestAnimationFrame(loop):0; if(!parts.length) cx.clearRect(0,0,innerWidth,innerHeight);
}
function burst(x,y,big){
  if(reduced()) return;
  if(!cv){ cv=document.createElement('canvas'); cv.setAttribute('aria-hidden','true'); cv.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999'; document.body.appendChild(cv); cx=cv.getContext('2d'); fitCv(); window.addEventListener('resize',fitCv); }
  emit(x,y,big?110:55,90,big?100:70,big?15:11);
  if(big) setTimeout(()=>{ emit(0,y,45,60,55,13); emit(innerWidth,y,45,120,55,13); if(!raf) raf=requestAnimationFrame(loop); },140);
  if(!raf) raf=requestAnimationFrame(loop);
}

// ===== التشغيل =====
// opts: {key, chapters:[{num,sub,lock,first,attempts}], verify(num,code)→'ok'|'bad'|'locked'|'nodata'|'unavailable', unlock(num) (AC.markUnlocked)،
//        reload()→chapters جديدة، open(num) يفتح الإصحاح بنفس handler الزر، resumable(num)→هل فيه جلسة امتحان شغالة للإصحاح ده}
export function init(root,opts){
  if(cleanup){ try{ cleanup(); }catch(e){} cleanup=null; }
  if(!root||!root.querySelector) return;
  const ac=new AbortController(), sig=ac.signal, timers=new Set();
  const later=(fn,ms)=>{ const t=setTimeout(()=>{ timers.delete(t); if(root.isConnected) fn(); },ms); timers.add(t); return t; };
  const $=(id)=>root.querySelector('#cm-'+id), byId=(id)=>root.querySelector('#'+id);
  root.querySelectorAll('[data-i]').forEach((e)=>{ e.innerHTML=ic(e.dataset.i,+e.dataset.s||14); e.style.display='inline-flex'; });

  let chs=opts.chapters.slice(), D=derive(chs);
  const N=()=>chs.length;
  const scroller=$('scroller'), map=$('map'), svg=$('svg'), card=$('card');
  const pGroove=byId('cmGroove'), pGhost=byId('cmGhost'), pGlow=byId('cmGlow'), pTrail=byId('cmTrail'), gTrail=byId('cmTrailGrad');
  const STEP_Y=108, PAD_TOP=84, PAD_BOTTOM=132;
  let TOTAL_LEN=0, nodeEls=[], hereEl=null, headEl=null;
  const trailLenFor=(i)=>TOTAL_LEN*trailFrac(i,N());
  const st=(i)=>stateOf(chs,i,D.cur);

  function buildMap(){
    const n=N(), W=scroller.clientWidth||360, chH=scroller.clientHeight||420;
    const xl=W*0.30, xr=W*0.70, span=Math.max(0,n-1)*STEP_Y, H=Math.max(chH,PAD_TOP+span+PAD_BOTTOM), padTop=Math.max(PAD_TOP,(H-span)/2);
    let d=`M ${n>1?xl:W/2} ${padTop}`;
    for(let i=0;i<n-1;i++){ const y0=padTop+i*STEP_Y, y1=y0+STEP_Y, xa=i%2===0?xl:xr, xb=i%2===0?xr:xl; d+=` C ${xa} ${y0+STEP_Y/2}, ${xb} ${y1-STEP_Y/2}, ${xb} ${y1}`; }
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('width',W); svg.setAttribute('height',H); map.style.width=W+'px'; map.style.height=H+'px';
    [pGroove,pGhost,pGlow,pTrail].forEach((p)=>p.setAttribute('d',d));
    TOTAL_LEN=n>1?pTrail.getTotalLength():0;
    const pts=[]; for(let i=0;i<n;i++) pts.push(n>1?pTrail.getPointAtLength(TOTAL_LEN*((i+0.5)/n)):{x:W/2,y:padTop});
    gTrail.setAttribute('y2',H); gTrail.innerHTML='';
    pts.forEach((pt,i)=>{ const s=document.createElementNS(NS,'stop'); s.setAttribute('offset',(pt.y/H*100).toFixed(3)+'%'); s.setAttribute('stop-color',`hsl(${hueFor(i,n)} 100% 62%)`); gTrail.appendChild(s); });
    map.querySelectorAll('.cm-node,.cm-node-label').forEach((e)=>e.remove());
    if(headEl){ headEl.remove(); headEl=null; } hereEl=null; nodeEls=[];
    pts.forEach((pt,i)=>{ const b=document.createElement('button'); b.type='button'; b.className='cm-node'; b.dataset.index=i; b.style.setProperty('--h',hueFor(i,n).toFixed(1)); b.style.left=pt.x+'px'; b.style.top=pt.y+'px'; map.appendChild(b); nodeEls.push(b); });
  }
  function paintNodes(){
    nodeEls.forEach((b,i)=>{
      const s=st(i), num=chs[i].num, face=`<span class="cm-node__face">${ar(num)}</span>`;
      b.className='cm-node cm-node--'+s; b.setAttribute('aria-label',`الإصحاح ${ar(num)} — ${STATE_AR[s]}`);
      if(s==='done') b.innerHTML=`${face}<span class="cm-node__badge cm-node__badge--done">${ic('check',11,4.2)}</span>`;
      else if(s==='current') b.innerHTML=`<span class="cm-pulse"></span><span class="cm-pulse"></span>${face}`;
      else if(s==='open') b.innerHTML=`${face}<span class="cm-node__badge cm-node__badge--book">${ic('book',10,2.6)}</span>`;
      else if(s==='ended') b.innerHTML=`${face}<span class="cm-node__badge cm-node__badge--ended">${ic('clock',10,2.8)}</span>`;
      else b.innerHTML=`${i===D.hint?'<span class="cm-node__hint"></span>':''}${face}<span class="cm-node__badge cm-node__badge--lock">${ic('lock',9,2.8)}</span>`;
    });
  }
  function paintHere(){
    if(hereEl){ hereEl.remove(); hereEl=null; }
    if(D.cur<0||!nodeEls[D.cur]) return;
    const cur=nodeEls[D.cur]; hereEl=document.createElement('div'); hereEl.className='cm-node-label'; hereEl.textContent='أنت هنا';
    hereEl.style.setProperty('--h',hueFor(D.cur,N()).toFixed(1)); hereEl.style.left=cur.style.left; hereEl.style.top=(parseFloat(cur.style.top)+56)+'px'; map.appendChild(hereEl);
  }
  function paintHud(){
    const c=counts(chs), h=hudText(chs);
    $('hudCount').textContent=ar(c.done); $('ringBar').setAttribute('stroke-dashoffset',(100.53*(1-(c.N?c.done/c.N:0))).toFixed(2));
    $('hudLabel').innerHTML=esc(h.main)+(h.open?`<span class="cm-hud__sep">·</span><span class="cm-hud__unread">${esc(h.open)}</span>`:''); $('bookSub').textContent=h.sub;
  }
  function paintFooter(){
    const f=footerText(chs,D,fmtShort), cta=$('cta'), pi=progIdx(chs,D.cur);
    root.style.setProperty('--hud-h',(pi>=0?hueFor(pi,N()):205).toFixed(1));
    $('locationText').textContent=f.loc; cta.dataset.mode=f.mode; cta.disabled=f.mode==='none';
    cta.innerHTML=`${ic(f.mode==='go'?'play':f.mode==='all'?'award':'lock',16,2.4)} ${esc(f.cta)}`;
    $('btnJump').style.display=pi>=0?'':'none';
  }
  const paint=()=>{ paintNodes(); paintHere(); paintHud(); paintFooter(); };

  // ----- حركة المسار -----
  function setTrail(len){
    [pTrail,pGlow].forEach((p)=>{ p.style.transition='none'; p.style.strokeDasharray=`${len} ${TOTAL_LEN+10}`; p.style.strokeDashoffset='0'; });
    pTrail.style.opacity=len>0?'1':'0'; pGlow.style.opacity=len>0?'.55':'0';
  }
  function animateTrail(oldLen,newLen,duration){
    if(headEl){ headEl.remove(); headEl=null; }
    if(reduced()||newLen<=oldLen||TOTAL_LEN===0){ setTrail(newLen); return; }
    pTrail.style.opacity='1'; pGlow.style.opacity='.55';
    [pTrail,pGlow].forEach((p)=>{ p.style.transition='none'; p.style.strokeDasharray=`${newLen} ${TOTAL_LEN+10}`; p.style.strokeDashoffset=String(newLen-oldLen); });
    const head=document.createElementNS(NS,'circle'); head.setAttribute('r','7'); head.setAttribute('fill',`hsl(${hueFor(Math.max(0,progIdx(chs,D.cur)),N())} 100% 94%)`); head.setAttribute('filter','url(#cmHeadGlow)'); head.style.opacity='0'; svg.appendChild(head); headEl=head;
    const start=performance.now(), popped=new Set(), dn=doneIdx(chs);
    (function frame(now){
      if(headEl!==head||!root.isConnected) return;
      const t=Math.min(1,(now-start)/duration), cur=oldLen+(newLen-oldLen)*easeOutCubic(t);
      [pTrail,pGlow].forEach((p)=>p.style.strokeDashoffset=String(newLen-cur));
      if(cur>0.5){ const pt=pTrail.getPointAtLength(cur); head.setAttribute('cx',pt.x); head.setAttribute('cy',pt.y); head.style.opacity=String(Math.min(1,t*6)*(t>0.92?Math.max(0,(1-t)/0.08):1)); }
      dn.forEach((i)=>{ if(popped.has(i)||cur<trailLenFor(i)-6) return; popped.add(i); const el=nodeEls[i];
        if(el&&el.animate) el.animate([{transform:'translate(-50%,-50%) scale(1)'},{transform:'translate(-50%,-50%) scale(1.35)'},{transform:'translate(-50%,-50%) scale(1)'}],{duration:420,easing:'cubic-bezier(.2,.9,.3,1.4)'}); });
      if(t<1) requestAnimationFrame(frame); else{ head.remove(); if(headEl===head) headEl=null; }
    })(performance.now());
  }
  // تمرير برمجي (توسيط/استعادة مكان): ما يقفلش الـpopover المفتوح (حدث scroll بيتأخر عن التمرير نفسه)
  let progScroll=false, progT=0;
  const markProg=(ms)=>{ progScroll=true; clearTimeout(progT); progT=setTimeout(()=>{ progScroll=false; },ms); timers.add(progT); };
  function centerActive(behavior){
    const nd=nodeEls[Math.max(0,progIdx(chs,D.cur))]; if(!nd) return;
    markProg(behavior==='smooth'&&!reduced()?900:150);
    scroller.scrollTo({left:0,top:Math.max(0,parseFloat(nd.style.top)-scroller.clientHeight/2),behavior:reduced()?'auto':(behavior||'auto')});
  }
  function burstAtNode(i,big){ const nd=nodeEls[i]; if(!nd) return; const r=nd.getBoundingClientRect(); burst(r.left+r.width/2,r.top+r.height/2,big); }

  // ----- توست -----
  const toastEl=$('toast'); let toastTimer=0;
  function toast(msg,icon){ $('toastIcon').innerHTML=ic(icon||'spark',14,2.4); $('toastText').textContent=msg; toastEl.classList.add('cm-show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toastEl.classList.remove('cm-show'),2600); timers.add(toastTimer); }

  // ----- Popover -----
  const pop=$('popover'); let activeIdx=null;
  function positionPopover(node){
    const cr=card.getBoundingClientRect(), r=node.getBoundingClientRect(), w=pop.offsetWidth, h=pop.offsetHeight;
    let left=r.left-cr.left+r.width/2; left=Math.max(14+w/2,Math.min(cr.width-14-w/2,left));
    let top=r.top-cr.top-16, below=false;
    if(top-h<12){ below=true; top=Math.min(r.bottom-cr.top+16,cr.height-12-h); } else top=Math.max(top,h+12);
    pop.style.left=left+'px'; pop.style.top=top+'px'; pop.classList.toggle('cm-below',below);
  }
  function openPopover(i){
    const c=chs[i], s=st(i), node=nodeEls[i], resum=!!(opts.resumable&&opts.resumable(c.num));
    activeIdx=i; pop.style.setProperty('--h',hueFor(i,N()).toFixed(1));
    $('popTitle').textContent='الإصحاح '+ar(c.num);
    const sub=$('popSub'); sub.textContent=c.sub||''; sub.style.display=c.sub?'':'none';
    const stt=$('popState'); stt.textContent=STATE_AR[s];
    stt.className='cm-pop__state'+({current:' cm-pop__state--live',open:' cm-pop__state--open',locked:' cm-pop__state--lock',ended:' cm-pop__state--ended'}[s]||'');
    const stats=$('popStats'), msg=$('popMessage'), act=$('popActions'); stats.style.display='none'; msg.style.display='none'; act.innerHTML='';
    const go=(cls,html)=>`<button type="button" class="cm-btn cm-btn--${cls}" data-a="chap" data-n="${c.num}" data-act="open">${html}</button>`;
    const btn=(cls,a,html)=>`<button type="button" class="cm-btn cm-btn--${cls}" data-act="${a}">${html}</button>`;
    if(s==='done'){
      stats.style.display='flex'; $('popGrade').textContent=ar(c.first.score)+' / '+ar(c.first.total);
      $('popAttempt').textContent=c.attempts>1?ar(c.attempts)+' محاولات':'محاولة واحدة';
      act.innerHTML=go('neon',ic(resum?'play':'book',13,2.6)+(resum?' كمّل الامتحان':' اقرأ الإصحاح'))+btn('ghost','close','إغلاق');
    }else if(s==='current'||s==='open'){
      msg.style.display='block'; msg.textContent=popMessage(s,{curNum:D.cur>=0?chs[D.cur].num:0});
      act.innerHTML=go('neon',ic('play',13,2.4)+(resum?' كمّل الامتحان':' ابدأ الإصحاح'))+btn('ghost','close','لاحقًا');
    }else{
      msg.style.display='block'; msg.textContent=popMessage(s,{at:c.lock.at,fmt:fmtD});
      act.innerHTML=(resum?go('neon',ic('play',13,2.4)+' كمّل الامتحان')+btn('ghost','code',ic('unlock',13,2.4)+' عندي كود'):btn('neon','code',ic('unlock',13,2.4)+' عندي كود')+btn('ghost','close','تمام'));
    }
    pop.classList.remove('cm-show'); positionPopover(node); requestAnimationFrame(()=>pop.classList.add('cm-show'));
  }
  function closePopover(){ pop.classList.remove('cm-show'); activeIdx=null; }
  // زرار «open» عليه data-a="chap" فالحدث بيكمل لـ el.onclick في books/index.js (نفس مسار فتح الإصحاح بالظبط)
  pop.addEventListener('click',(e)=>{ const b=e.target.closest('[data-act]'); if(!b) return; const i=activeIdx; closePopover(); if(b.dataset.act==='code'&&i!==null) openCodeModal(i); },{signal:sig});

  // ----- نافذة الكود -----
  const modal=$('codeModal'), inp=$('codeInput'), err=$('codeError'), okBtn=$('codeConfirm'); let codeIdx=null, busy=false;
  function openCodeModal(i){
    codeIdx=i; busy=false; $('codeTitle').textContent='فتح الإصحاح '+ar(chs[i].num);
    inp.value=''; err.textContent=''; inp.classList.remove('cm-shake'); okBtn.disabled=false; okBtn.textContent='فتح بالكود';
    modal.classList.add('cm-open'); modal.setAttribute('aria-hidden','false'); later(()=>inp.focus(),260);
  }
  function closeCodeModal(){ modal.classList.remove('cm-open'); modal.setAttribute('aria-hidden','true'); codeIdx=null; }
  async function submitCode(){
    if(codeIdx===null||busy) return;
    const code=inp.value.trim(); if(!code){ err.textContent='اكتب الكود.'; return; }
    busy=true; okBtn.disabled=true; err.textContent='جارٍ التحقق…';
    const i=codeIdx, num=chs[i].num; let r; try{ r=await opts.verify(num,code); }catch(e){ r='error'; }
    if(!root.isConnected) return;
    busy=false; okBtn.disabled=false;
    if(r==='ok'){ closeCodeModal(); later(()=>unlockChapter(num),260); return; }
    err.textContent=verifyMsg(r); inp.classList.remove('cm-shake'); void inp.offsetWidth; inp.classList.add('cm-shake'); inp.focus(); inp.select(); haptic(20);
  }
  okBtn.addEventListener('click',submitCode,{signal:sig}); $('codeCancel').addEventListener('click',closeCodeModal,{signal:sig}); $('codeClose').addEventListener('click',closeCodeModal,{signal:sig}); $('codeBackdrop').addEventListener('click',closeCodeModal,{signal:sig});
  inp.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); submitCode(); } },{signal:sig});
  document.addEventListener('keydown',(e)=>{ if(e.key==='Escape'){ if(modal.classList.contains('cm-open')) closeCodeModal(); else closePopover(); } },{signal:sig});

  // فتح بكود: نحدّث الحالة من المصدر الحقيقي، نحرّك المسار ونحتفل، وبعدها نفتح الإصحاح (زي الشاشة القديمة: تم فتح الإصحاح ← القراءة)
  async function unlockChapter(num){
    try{ await opts.unlock(num); }catch(e){}
    let fresh=null; try{ fresh=await opts.reload(); }catch(e){}
    if(!root.isConnected) return;
    const oldLen=trailLenFor(progIdx(chs,D.cur)); if(Array.isArray(fresh)&&fresh.length===chs.length) chs=fresh; D=derive(chs); paint();
    const i=chs.findIndex((c)=>c.num===num), nw=trailLenFor(progIdx(chs,D.cur)); centerActive('smooth'); animateTrail(oldLen,nw,Math.min(2400,Math.max(900,Math.abs(nw-oldLen)*4)));
    later(()=>{ if(i>=0) burstAtNode(i,true); haptic(22); toast('🔓 فُتح الإصحاح '+ar(num),'unlock'); },reduced()?0:Math.min(1200,Math.max(400,Math.abs(nw-oldLen)*3)));
    later(()=>{ if(opts.open) opts.open(num); },reduced()?600:2200);
  }

  // ----- التفاعل -----
  let justDragged=false;
  map.addEventListener('click',(e)=>{
    const b=e.target.closest('.cm-node'); if(!b||justDragged) return; e.stopPropagation();
    const i=+b.dataset.index, s=st(i);
    if(s==='locked'||s==='ended'){ b.classList.remove('cm-shake'); void b.offsetWidth; b.classList.add('cm-shake'); haptic(14); } else haptic(10);
    openPopover(i);
  },{signal:sig});
  scroller.addEventListener('click',(e)=>{ if(!e.target.closest('.cm-node')) closePopover(); },{signal:sig});
  scroller.addEventListener('scroll',()=>{ if(activeIdx!==null&&!progScroll) closePopover(); },{passive:true,signal:sig});
  let dragging=false,sx=0,sy=0,sl=0,stp=0;
  scroller.addEventListener('pointerdown',(e)=>{ if(e.pointerType==='touch') return; dragging=true; justDragged=false; sx=e.clientX; sy=e.clientY; sl=scroller.scrollLeft; stp=scroller.scrollTop; },{signal:sig});
  window.addEventListener('pointermove',(e)=>{ if(!dragging) return; const dx=e.clientX-sx, dy=e.clientY-sy; if(Math.abs(dx)>4||Math.abs(dy)>4) justDragged=true; scroller.scrollLeft=sl-dx; scroller.scrollTop=stp-dy; },{signal:sig});
  window.addEventListener('pointerup',()=>{ if(!dragging) return; dragging=false; if(justDragged) later(()=>{ justDragged=false; },60); },{signal:sig});
  let t0=null;
  scroller.addEventListener('touchstart',(e)=>{ if(e.touches.length===1) t0={x:e.touches[0].clientX,y:e.touches[0].clientY}; },{passive:true,signal:sig});
  scroller.addEventListener('touchmove',(e)=>{ if(!t0) return; if(Math.hypot(e.touches[0].clientX-t0.x,e.touches[0].clientY-t0.y)>8) justDragged=true; },{passive:true,signal:sig});
  scroller.addEventListener('touchend',()=>{ if(justDragged) later(()=>{ justDragged=false; },80); },{passive:true,signal:sig});
  $('btnJump').addEventListener('click',()=>{ centerActive('smooth'); closePopover(); haptic(10); },{signal:sig});
  $('cta').addEventListener('click',()=>{
    const m=$('cta').dataset.mode;
    if(m==='go'){ centerActive('smooth'); later(()=>openPopover(D.cur),reduced()?0:350); haptic(16); }
    else if(m==='all'){ const r=$('cta').getBoundingClientRect(); burst(r.left+r.width/2,r.top,true); toast('🏆 خلّصت كل إصحاحات السفر','award'); }
  },{signal:sig});

  // المقاس اتغيّر (دوران الموبايل، الكيبورد…): إعادة بناء من غير حركة
  let rz=0, ro=null, lw=card.clientWidth, lh=card.clientHeight;
  if(window.ResizeObserver){ ro=new ResizeObserver(()=>{ cancelAnimationFrame(rz); rz=requestAnimationFrame(()=>{
    if(!root.isConnected||!scroller.clientWidth) return;
    const w=card.clientWidth, h=card.clientHeight; if(Math.abs(w-lw)<1&&Math.abs(h-lh)<1) return; lw=w; lh=h;   // تغيّر فعلي في المقاس بس (مش أول إشعار ولا تهتّز بكسل)
    const keep=activeIdx, top=scroller.scrollTop/(map.offsetHeight||1); buildMap(); paint(); setTrail(trailLenFor(progIdx(chs,D.cur)));
    markProg(200); scroller.scrollTop=top*map.offsetHeight; if(keep!==null&&keep<nodeEls.length) openPopover(keep); else closePopover(); }); }); ro.observe(card); }

  cleanup=()=>{ ac.abort(); timers.forEach(clearTimeout); timers.clear(); if(ro) ro.disconnect(); cancelAnimationFrame(rz); if(headEl){ headEl.remove(); headEl=null; } };

  // ----- أول رسم -----
  buildMap(); paint(); centerActive('auto');
  const now=snap(chs), prev=snaps.get(opts.key); snaps.set(opts.key,now);
  const target=trailLenFor(progIdx(chs,D.cur));
  if(prev===undefined){ setTrail(0); later(()=>animateTrail(0,target,2000),300); }                              // أول مرة في الجلسة: حركة افتتاحية
  else if(grew(prev,now)){ const old=trailLenFor(prev.prog); setTrail(Math.min(old,target)); later(()=>animateTrail(Math.min(old,target),target,1600),450); }   // رجع من نتيجة: المسار يتحرّك لإصحاح جديد
  else setTrail(target);                                                                                          // إعادة رسم عادية (تحديث مواعيد…): ثابتة من غير حركة
}
