// واجهة الهيكل: النجوم، الثيم (داكن/فاتح)، القائمة الجانبية، عنوان القسم. لا علاقة له بالبيانات.
const $=(s)=>document.querySelector(s);
const THEME_COLOR={dark:'#08090B',light:'#F4F7FB'};

// ── الثيم: المفتاح 'theme' مشترك مع صفحات iframe (نفس الـorigin) ──
export function getTheme(){ return document.documentElement.dataset.theme==='light'?'light':'dark'; }
export function setTheme(t){
  t=t==='light'?'light':'dark';
  document.documentElement.dataset.theme=t;
  try{ localStorage.setItem('theme',t); }catch(e){}
  const m=document.querySelector('meta[name=theme-color]'); if(m) m.content=THEME_COLOR[t];
  const b=$('#themeBtn'); if(b){ b.textContent=t==='light'?'🌙':'☀️'; b.setAttribute('aria-label',t==='light'?'الوضع الداكن':'الوضع الفاتح'); }
  // أعلم الصفحات المضمّنة (iframe) بالتغيير
  document.querySelectorAll('iframe').forEach(f=>{ try{ f.contentDocument.documentElement.dataset.theme=t; }catch(e){} });
}

// ── القائمة الجانبية ──
export function openSidebar(){ $('#sidebar').classList.add('open'); $('#sbOverlay').classList.add('open'); setTimeout(()=>{ const a=document.querySelector('#nav a.active'); if(a&&a.scrollIntoView) a.scrollIntoView({block:'center'}); },60); }
export function closeSidebar(){ $('#sidebar').classList.remove('open'); $('#sbOverlay').classList.remove('open'); }
export function setSection(t){ const e=$('#topSection'); if(e) e.textContent=t||''; }
// إخفاء القائمة أثناء شاشة التسجيل/دخول الخدام (لا شيء يُتنقَّل إليه)
export function setNavVisible(v){ const b=$('#sidebarToggleBtn'); if(b) b.style.display=v?'':'none'; if(!v) closeSidebar(); }

// ── النجوم (خلفية خفيفة؛ تتوقف عند إخفاء الصفحة أو تفضيل تقليل الحركة) ──
function stars(){
  const c=$('#stars-canvas'); if(!c||matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const ctx=c.getContext('2d'); let list=[], raf=0;
  function init(){
    c.width=innerWidth; c.height=innerHeight; list=[];
    const n=Math.min(260,Math.floor(c.width*c.height/3200));
    for(let i=0;i<n;i++) list.push({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*2.2+.4,a:Math.random()*.5+.5,da:(Math.random()-.5)*.006,gold:Math.random()<.06});
  }
  function draw(){
    ctx.clearRect(0,0,c.width,c.height);
    for(const s of list){
      s.a+=s.da; if(s.a<.3||s.a>1) s.da*=-1;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle=s.gold?`rgba(255,220,80,${s.a*.85+.15})`:`rgba(255,255,255,${s.a*.9+.1})`; ctx.fill();
      if(s.r>1.4){ ctx.beginPath(); ctx.arc(s.x,s.y,s.r*2.2,0,Math.PI*2); ctx.fillStyle=s.gold?`rgba(255,200,60,${s.a*.12})`:`rgba(200,230,255,${s.a*.12})`; ctx.fill(); }
    }
    raf=requestAnimationFrame(draw);
  }
  const go=()=>{ cancelAnimationFrame(raf); if(!document.hidden&&getTheme()==='dark') raf=requestAnimationFrame(draw); else ctx.clearRect(0,0,c.width,c.height); };
  addEventListener('resize',()=>{ init(); go(); });
  document.addEventListener('visibilitychange',go);
  addEventListener('lawha:theme',go);
  init(); go();
}

export function initUI(){
  setTheme(getTheme());
  $('#themeBtn').onclick=()=>{ setTheme(getTheme()==='dark'?'light':'dark'); dispatchEvent(new Event('lawha:theme')); };
  $('#sidebarToggleBtn').onclick=openSidebar;
  $('#sbClose').onclick=closeSidebar; $('#sbOverlay').onclick=closeSidebar;
  addEventListener('keydown',e=>{ if(e.key==='Escape') closeSidebar(); });
  addEventListener('hashchange',closeSidebar);
  $('#nav').addEventListener('click',e=>{ if(e.target.closest('a')) closeSidebar(); });
  stars();
  autoHideHeader();
}

/* إخفاء الهيدر عند النزول وإظهاره عند الصعود (موبايل) */
function autoHideHeader(){
  const main=document.querySelector('main'); if(!main) return;
  const mq=matchMedia('(max-width:900px)');
  let last=0, lock=0, hidden=false;
  const set=h=>{ if(h===hidden) return; hidden=h; document.body.classList.toggle('hdr-hide',h); lock=Date.now()+400; };
  main.addEventListener('scroll',()=>{
    const y=main.scrollTop;
    if(!mq.matches){ set(false); last=y; return; }
    if(Date.now()<lock){ last=y; return; }
    const d=y-last;
    if(y<=40) set(false);
    else if(d>10) set(true);
    else if(d<-10) set(false);
    if(Math.abs(d)>10||y<=40) last=y;
  },{passive:true});
  addEventListener('hashchange',()=>{ set(false); last=0; });
  mq.addEventListener&&mq.addEventListener('change',()=>set(false));
  const sb=document.getElementById('sidebar');
  if(sb) new MutationObserver(()=>{ if(sb.classList.contains('open')) set(false); }).observe(sb,{attributes:true,attributeFilter:['class']});
}
