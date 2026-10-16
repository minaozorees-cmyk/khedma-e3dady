// رسالة الترحيب: كارت عائم لمدة ٢ ثانية ثم يختفي وحده (وفيه ✕ للإغلاق قبلها). مرة لكل دخول.
const MS=2000;
let last='', timer=null;
const esc=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function text(role,name){
  if(role==='student') return name?`سلام ونعمة يا ${name} 🌿 ربنا يبارك يومك ويفتح قلبك لكلمته.`:'سلام ونعمة 🌿 ربنا يبارك يومك ويفتح قلبك لكلمته.';
  if(role==='priest') return 'سلام ونعمة يا أبونا 🙏 ربنا يحفظ رعايتك وخدمتك.';
  return 'أهلاً بيك، تعبك في الخدمة مش ضايع قدام ربنا.';   // خادم / مالك: حسابات الطاقم لا تحمل اسماً
}
export function hideWelcome(){ clearTimeout(timer); const e=document.getElementById('welcome'); if(e) e.remove(); }
export function resetWelcome(){ last=''; hideWelcome(); }
export function maybeWelcome(role,name){
  const key=role+'|'+(name||''); if(last===key) return; last=key;
  hideWelcome();
  const e=document.createElement('div'); e.id='welcome'; e.setAttribute('role','status'); e.setAttribute('aria-live','polite');
  e.innerHTML=`<span>${esc(text(role,name))}</span><button type="button" aria-label="إغلاق">✕</button>`;
  e.querySelector('button').onclick=hideWelcome;
  document.body.appendChild(e);
  timer=setTimeout(hideWelcome,MS);
}
