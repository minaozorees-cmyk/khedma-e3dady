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
// (v9.412) عرض القائمة المفتوحة = أطول عنوان + الهوامش: نقيسه على نسخة مخفية بنفس الأنماط (لا تأثير على الأصل)
export function fitSidebar(){
  const sb=$('#sidebar'); if(!sb||!document.body.classList.contains('has-rail')) return;
  const c=sb.cloneNode(true); c.removeAttribute('id'); c.classList.remove('rail'); c.classList.add('open','measure'); c.setAttribute('aria-hidden','true');
  c.querySelectorAll('[id]').forEach(x=>{ if(x.id!=='nav') x.removeAttribute('id'); });
  document.body.appendChild(c);
  const w=Math.ceil(c.getBoundingClientRect().width)+2; c.remove();
  sb.style.setProperty('--dw',Math.max(190,Math.min(w,Math.floor(innerWidth*.88)))+'px');
}
export function openSidebar(){ fitSidebar(); const sb=$('#sidebar'); sb.classList.remove('rail'); sb.classList.add('open'); document.body.classList.add('rail-on'); const o=$('#sbOverlay'); o.classList.remove('clear'); o.classList.add('open'); setTimeout(()=>{ const a=document.querySelector('#nav a.active'); if(a&&a.scrollIntoView) a.scrollIntoView({block:'center'}); },60); }
// (v9.413) ثلاث حالات: مخفية (افتراضي) ← شريط أيقونات (سحب من الحافة) ← درج كامل بالأسماء (زر ☰). أي ضغط خارج أو اختيار تبويب يرجّعها مخفية.
export function showRail(){ if(!document.body.classList.contains('has-rail')) return; const sb=$('#sidebar'); sb.classList.remove('open'); sb.classList.add('rail'); document.body.classList.add('rail-on'); const o=$('#sbOverlay'); o.classList.add('open','clear'); }
export function closeSidebar(){ $('#sidebar').classList.remove('open','rail'); document.body.classList.remove('rail-on'); const o=$('#sbOverlay'); o.classList.remove('open','clear'); }
const isOpen=()=>$('#sidebar').classList.contains('open'), isRail=()=>$('#sidebar').classList.contains('rail');
export function setSection(t){ const e=$('#topSection'); if(e) e.textContent=t||''; }
// إخفاء القائمة أثناء شاشة التسجيل/دخول الخدام (لا شيء يُتنقَّل إليه)
export function setNavVisible(v){ const b=$('#sidebarToggleBtn'); if(b) b.style.display=v?'':'none'; document.body.classList.toggle('has-rail',!!v); if(!v) closeSidebar(); }   // v9.41: شريط الأيقونات الدائم يظهر مع القائمة فقط

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
  $('#sidebarToggleBtn').onclick=openSidebar; { const rb=$('#railBtn'); if(rb) rb.onclick=openSidebar; }
  $('#sbClose').onclick=closeSidebar; $('#sbOverlay').onclick=closeSidebar;
  addEventListener('keydown',e=>{ if(e.key==='Escape') closeSidebar(); });
  addEventListener('hashchange',closeSidebar);
  $('#nav').addEventListener('click',e=>{ if(e.target.closest('a')) closeSidebar(); });
  initNavGroups();   // (v9.491) عناوين مجموعات قائمة المالك
  stars();
  autoHideHeader();
  edgeSwipe();
}

/* إخفاء الهيدر عند النزول وإظهاره عند الصعود (موبايل) */
function autoHideHeader(){
  const main=document.querySelector('main'); if(!main) return;
  const mq=matchMedia('(max-width:900px)');
  let last=0, lock=0, hidden=false;
  const set=h=>{ if(h===hidden) return; hidden=h; document.body.classList.toggle('hdr-hide',h); lock=Date.now()+400; };
  // (v9.481) حدث lawha:keep-header (من شاشة الامتحان عند «التالي»): يمدّ فترة القفل فيتجاهل سكرول الرجوع للأول ولا يظهر الهيدر
  addEventListener('lawha:keep-header',e=>{ const ms=Math.min(3000,Math.max(0,Number(e&&e.detail)||800)); lock=Math.max(lock,Date.now()+ms); });
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
  // (v9.412) صفحات iframe (لوحة التميز، النتائج، المولّد) تسكرول داخلها: نلتقط سكرولها (capture) بنفس المنطق
  const lastOf=new WeakMap();
  const hook=(f)=>{ const go=()=>{ try{
      const d=f.contentDocument; if(!d||d.__hh) return; d.__hh=1;
      d.addEventListener('scroll',e=>{
        if(!mq.matches) return; const el=e.target===d?d.scrollingElement:e.target; if(!el) return;
        const y=el.scrollTop||0, p=lastOf.get(el)||0, dd=y-p;
        if(Date.now()<lock){ lastOf.set(el,y); return; }
        if(y<=40) set(false); else if(dd>10) set(true); else if(dd<-10) set(false);
        if(Math.abs(dd)>10||y<=40) lastOf.set(el,y);
      },{capture:true,passive:true});
    }catch(x){} }; f.addEventListener('load',go); go(); };
  new MutationObserver(ms=>{ for(const m of ms) m.addedNodes.forEach(n=>{ if(n.tagName==='IFRAME') hook(n); }); }).observe(main,{childList:true});
  addEventListener('hashchange',()=>{ set(false); last=0; });
  mq.addEventListener&&mq.addEventListener('change',()=>set(false));
  const sb=document.getElementById('sidebar');
  if(sb) new MutationObserver(()=>{ if(sb.classList.contains('open')) set(false); }).observe(sb,{attributes:true,attributeFilter:['class']});
}

/* (v9.413) سحب من الحافة اليمنى (شريط شفاف #edgeZone فوق الصفحات المضمّنة) لليسار = إظهار شريط الأيقونات.
   وهو ظاهر: سحب آخر لليسار = الدرج الكامل، وسحب لليمين = إخفاء. السحب الرأسي الغالب يُلغى. */
function edgeSwipe(){
  let sx=0, sy=0, on=false, mode='';
  const ZONE=22, RAIL=60;
  addEventListener('touchstart',e=>{
    on=false; if(e.touches.length!==1||!document.body.classList.contains('has-rail')) return;
    const t=e.touches[0]; sx=t.clientX; sy=t.clientY;
    if(isOpen()){ mode='close'; on=true; }
    else if(isRail()){ mode='rail'; on=true; }
    else if(sx>=innerWidth-ZONE){ mode='show'; on=true; }
  },{passive:true});
  addEventListener('touchmove',e=>{
    if(!on) return; const t=e.touches[0], dx=t.clientX-sx, dy=t.clientY-sy;
    if(Math.abs(dy)>14&&Math.abs(dy)>Math.abs(dx)*1.2){ on=false; return; }
    if(mode==='show'&&-dx>40){ on=false; showRail(); }
    else if(mode==='rail'){ if(dx>60){ on=false; closeSidebar(); } else if(-dx>45&&sx>=innerWidth-RAIL){ on=false; openSidebar(); } }
    else if(mode==='close'&&dx>60){ on=false; closeSidebar(); }
  },{passive:true});
  addEventListener('touchend',()=>{ on=false; },{passive:true});
  addEventListener('touchcancel',()=>{ on=false; },{passive:true});
}

// ── (v9.491) تقسيم قائمة المالك بعناوين فاصلة ──
// بيانات التجميع من modules/registry.json: group = اسم القسم، go = ترتيب المالك. ترتيب الملف نفسه ما اتغيرش، فقوايم الخدام والمخدومين زي ما هي.
// بتشتغل للمالك فقط (القائمة فيها «لوحة المالك»). router.js بيبني القائمة زي ما هو، وهنا بنعيد ترتيب الروابط ونضيف العناوين بعدها، ونصحّح موضع المؤشر الذهبي (--gi/--gb).
// أي خطأ أو فشل في تحميل الـregistry = القائمة تفضل بالشكل الأصلي بالظبط.
// plan: الروابط بالترتيب الجديد + مكان كل عنوان. info = {id:{g,o}}. بترجّع null لو مفيش داعي للتعديل.
export function planNav(ids,info){
  if(!info||!ids.includes('members')) return null;
  const rows=ids.map((id,i)=>({id,i,g:(info[id]||{}).g||'',o:(info[id]||{}).o||1e6}));
  rows.sort((a,b)=>a.o-b.o||a.i-b.i);
  const items=[]; let cur=null;
  for(const r of rows){ if(r.g&&r.g!==cur){ items.push({grp:r.g}); cur=r.g; } else if(!r.g) cur=null; items.push({id:r.id}); }
  return items;
}
// موضع المؤشر: ترتيب الرابط النشط بين الروابط، وعدد العناوين قبله
export function glideVars(items,activeId){
  let gi=-1,gb=0,n=0,g=0; for(const it of items){ if(it.grp){ g++; continue; } if(it.id===activeId){ gi=n; gb=g; break; } n++; }
  return gi<0?null:{gi,gb};
}
export function initNavGroups(){
  const nav=$('#nav'); if(!nav||typeof MutationObserver==='undefined') return;
  let info=null;
  const ready=fetch('modules/registry.json').then(r=>r.json()).then(j=>{ info={}; for(const m of (j.modules||[])) if(m.group) info[m.id]={g:m.group,o:Number(m.go)||1e6}; }).catch(()=>{ info=null; });
  const links=()=>[...nav.children].filter(x=>x.tagName==='A');
  function sync(){
    const ls=links(), act=ls.find(a=>a.classList.contains('active'));
    const items=[...nav.children].filter(x=>x.tagName==='A'||x.classList.contains('nav-grp')).map(x=>x.tagName==='A'?{id:x.dataset.id}:{grp:1});
    const v=act&&glideVars(items,act.dataset.id);
    if(v){ nav.style.setProperty('--gi',v.gi); nav.style.setProperty('--gb',v.gb); }
  }
  function run(){
    try{
      const ls=links(); if(!ls.length) return;
      if(!nav.querySelector('.nav-grp')){   // قائمة جديدة من router (مفيهاش عناوين بعد)
        const plan=planNav(ls.map(a=>a.dataset.id),info); if(!plan) return;
        const byId=new Map(ls.map(a=>[a.dataset.id,a])), gl=nav.querySelector('.gl-glider');
        for(const it of plan){
          let el; if(it.grp){ el=document.createElement('div'); el.className='nav-grp'; el.setAttribute('role','presentation'); const s=document.createElement('span'); s.textContent=it.grp; el.appendChild(s); }
          else el=byId.get(it.id);
          nav.insertBefore(el,gl||null);
        }
      }
      sync();
    }catch(e){ console.error('[nav-groups]',e); }
    mo.takeRecords();   // تجاهل تغييراتنا نحن
  }
  const mo=new MutationObserver(()=>{ ready.then(run); });
  mo.observe(nav,{childList:true}); mo.observe(nav,{attributes:true,attributeFilter:['class'],subtree:true});
}
