// (v9.6) مساعدات مشتركة لوحدات الطاقم (REST بجلسة الطاقم). الحماية الفعلية = RLS في السيرفر.
import * as SY from './sync.js';
import {normPhone} from './auth.js';
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
