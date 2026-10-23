// (v9.6) مساعدات مشتركة لوحدات الطاقم (REST بجلسة الطاقم). الحماية الفعلية = RLS في السيرفر.
import * as SY from './sync.js';
import {normPhone,normPhoneEG} from './auth.js';
import {esc} from './consts.js';
export const SB='width:auto;min-height:36px;margin:0;padding:6px 14px;font-size:.85rem';
export const fmt=(t)=>t?new Date(t).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}):'—';
export const fmtD=(t)=>t?new Date(t).toLocaleDateString('ar-EG',{dateStyle:'medium'}):'—';
export const dayDiff=(t)=>Math.floor((Date.now()-new Date(t).getTime())/864e5);
export const today=()=>{ const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10); };
export async function api(path,opts){
  const r=await SY.staffApi(path,opts);
  if(!r.ok){ const e=new Error('HTTP '+r.status); e.status=r.status; try{ e.body=await r.json(); }catch(_){} throw e; }
  return r.status===204?null:await r.json().catch(()=>null);
}
export async function all(path){   // path لازم يحتوي order=… لثبات الصفحات
  const out=[];
  for(let off=0;off<50000;off+=1000){ const p=await api(`${path}${path.includes('?')?'&':'?'}limit=1000&offset=${off}`); out.push(...p); if(p.length<1000) break; }
  return out;
}
export function errMsg(e){
  const b=(e&&e.body)||{};
  if(b.code==='42501') return 'غير مسموح بهذه العملية.';
  if(e&&(e.status===401||e.status===403)) return 'الجلسة انتهت أو غير مصرّح. سجّل الدخول من جديد.';
  if(b.code==='42P01'||b.code==='PGRST205'||b.code==='42703') return 'قسم الـSQL الخاص بهذه الميزة لسه ما اتشغّلش في Supabase (راجع SETUP).';
  return e&&e.status?'تعذّر التنفيذ (رمز '+e.status+').':'مفيش اتصال بالنت.';
}
// رابط واتساب من رقم مصري (01…) → wa.me/20…
export const waLink=(phone,text)=>{ const n=normPhone(phone||'').replace(/^\+?20/,'').replace(/^0/,''); return n?`https://wa.me/20${n}?text=${encodeURIComponent(text||'')}`:''; };
export const telLink=(phone)=>{ const n=normPhone(phone||''); return n?'tel:'+n:''; };

// (v9.487) أزرار ولي الأمر: «📞 اتصال بولي الأمر» + «👪 واتساب ولي الأمر». تظهر فقط لو الرقم صالح (01[0125]xxxxxxxx بعد التوحيد).
// رسالة واتساب مستقلة لولي الأمر: {الاسم} = الاسم الأول للمخدوم، {ولي_الأمر} = الاسم الأول لولي الأمر.
export const GDEF_MSG='سلام ونعمة يا {ولي_الأمر}، بخصوص {الاسم} في خدمة إعدادي. ربنا يبارك أسرتكم ❤️';
export const firstName=(s)=>String(s||'').trim().split(/\s+/)[0]||'';
export const validEG=(p)=>/^01[0125]\d{8}$/.test(normPhoneEG(p||''));
export const gTel=(p)=>validEG(p)?'tel:+20'+normPhoneEG(p).slice(1):'';
export const gWa=(p,text)=>validEG(p)?`https://wa.me/20${normPhoneEG(p).slice(1)}?text=${encodeURIComponent(text||'')}`:'';
export const gMsg=(tpl,student,guardian)=>String(tpl||GDEF_MSG).split('{الاسم}').join(firstName(student)).split('{ولي_الأمر}').join(firstName(guardian)||'ولي الأمر');
export const loadGTpl=(key)=>{ try{ return localStorage.getItem(key)||GDEF_MSG; }catch(e){ return GDEF_MSG; } };
export const saveGTpl=(key,v)=>{ try{ localStorage.setItem(key,v); }catch(e){} };
// (v9.490) أزرار المخدوم نفسه: «📞 اتصال» + «💬 واتساب» (💬 مش 👪 عشان ما تتلخبطش مع أزرار ولي الأمر). نفس دوال الافتقاد (telLink/waLink)؛ بتظهر لو فيه رقم.
// tpl = نص الرسالة، و{الاسم} = الاسم الأول للمخدوم. الافتراضي: نص الافتقاد المحفوظ (fuMsg) في loadFuTpl.
export const DEF_FU_MSG='سلام ونعمة يا {الاسم} ❤️ افتقدناك في خدمة إعدادي. عامل إيه؟ ربنا يبارك حياتك.';
export const loadFuTpl=()=>{ try{ return localStorage.getItem('fuMsg')||DEF_FU_MSG; }catch(e){ return DEF_FU_MSG; } };
export const stMsg=(tpl,name)=>String(tpl||DEF_FU_MSG).split('{الاسم}').join(firstName(name));
export function studentBox({phone,name,tpl}){
  const t=telLink(phone); if(!t) return '';
  const w=waLink(phone,stMsg(tpl,name));
  return `<div class="sbox" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><a class="btn sec" data-s="tel" style="${SB}" href="${esc(t)}">📞 اتصال</a>${w?`<a class="btn sec" data-s="wa" style="${SB}" target="_blank" rel="noopener" href="${esc(w)}">💬 واتساب</a>`:''}</div>`;
}
export function guardianBox({phone,name,student,tpl}){
  const t=gTel(phone); if(!t) return '';
  return `<div class="k" data-g="1" style="margin-top:6px">👪 ${esc(name||'ولي الأمر')}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><a class="btn sec" data-g="tel" style="${SB}" href="${t}">📞 اتصال بولي الأمر</a><a class="btn sec" data-g="wa" style="${SB}" target="_blank" rel="noopener" href="${gWa(phone,gMsg(tpl,student,name))}">👪 واتساب ولي الأمر</a></div>`;
}
