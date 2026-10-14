// تصدير/استيراد سجلات الأجبية والقداسات والاعتراف (JSON). الاستيراد دمج لا استبدال، فلا يضيع شيء.
import * as db from './db.js';
import * as D from './dates.js';
import {save} from './store.js';
import {PRAYER_IDS,LITURGY_TYPES} from './consts.js';
const MAX_BYTES=2*1024*1024, MAX_ENTRIES=6000;

export async function build(){
  const p=await db.get('profile');
  return {app:'lawha-backup',schema:1,exportedAt:new Date().toISOString(),owner:p?{id:p.id,name:p.name}:null,
    data:{agpeya:(await db.get('agpeya'))||null,liturgy:(await db.get('liturgy'))||null,confession:(await db.get('confession'))||null}};
}
export function canShareFiles(){
  try{ return !!(navigator.canShare&&navigator.canShare({files:[new File(['{}'],'a.json',{type:'application/json'})]})); }catch(e){ return false; }
}
export async function exportFile(share){
  const text=JSON.stringify(await build()), name=`نسخة_خدمة_إعدادي_${D.key()}.json`;
  const file=new File([text],name,{type:'application/json'});
  if(share&&canShareFiles()){ await navigator.share({files:[file]}); } // يرمي AbortError لو ألغى المستخدم
  else{ const a=document.createElement('a'); a.href=URL.createObjectURL(file); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); }
  await db.set('lastBackup',Date.now()); dispatchEvent(new Event('lawha:data'));
}

// يفحص ويعقّم الملف؛ يرمي Error برسالة عربية لو غير صالح
export function parseBackup(text){
  if(text.length>MAX_BYTES) throw new Error('الملف كبير جداً');
  let o; try{ o=JSON.parse(text); }catch(e){ throw new Error('الملف ليس نسخة احتياطية صالحة'); }
  if(!o||o.app!=='lawha-backup'||o.schema!==1||!o.data||typeof o.data!=='object') throw new Error('الملف ليس نسخة احتياطية من هذا التطبيق');
  const d=o.data, clean={agpeya:null,liturgy:null,confession:null}; let count=0;
  const str=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
  if(d.agpeya&&typeof d.agpeya==='object'){
    const days={};
    for(const k of Object.keys(d.agpeya.days||{})){ if(!D.isKey(k)||!Array.isArray(d.agpeya.days[k])) continue;
      const ids=[...new Set(d.agpeya.days[k].filter(x=>PRAYER_IDS.includes(x)))]; if(ids.length){ days[k]=ids; count++; } }
    const sm=Number(d.agpeya.streakMin); clean.agpeya={days,streakMin:sm>=1&&sm<=7?Math.floor(sm):1};
  }
  if(d.liturgy&&typeof d.liturgy==='object'){
    const entries={};
    for(const k of Object.keys(d.liturgy.entries||{})){ if(!D.isKey(k)) continue; const e=d.liturgy.entries[k]||{};
      entries[k]={date:k,type:LITURGY_TYPES.includes(e.type)?e.type:'يوم عادي',church:str(e.church,60)}; count++; }
    clean.liturgy={entries};
  }
  if(d.confession&&typeof d.confession==='object'){
    const entries={};
    for(const k of Object.keys(d.confession.entries||{})){ if(!D.isKey(k)) continue; entries[k]={date:k,father:str((d.confession.entries[k]||{}).father,60)}; count++; }
    const iv=Number(d.confession.interval);
    clean.confession={entries,interval:iv>=1&&iv<=365?Math.floor(iv):40,nextOverride:D.isKey(d.confession.nextOverride)?d.confession.nextOverride:''};
  }
  if(count>MAX_ENTRIES) throw new Error('عدد السجلات أكبر من المسموح');
  return {owner:o.owner&&typeof o.owner==='object'?{id:str(o.owner.id,64),name:str(o.owner.name,80)}:null,clean,count};
}
export async function applyBackup(clean){
  let added=0;
  if(clean.agpeya){
    const S=(await db.get('agpeya'))||{days:{},streakMin:clean.agpeya.streakMin};
    for(const k in clean.agpeya.days){ const cur=S.days[k]||[]; const u=[...new Set([...cur,...clean.agpeya.days[k]])]; if(u.length>cur.length) added++; S.days[k]=u; }
    const first=Object.keys(S.days).sort()[0]; if(first&&(!S.start||first<S.start)) S.start=first;
    await save('agpeya',S);
  }
  if(clean.liturgy){
    const L=(await db.get('liturgy'))||{entries:{}};
    for(const k in clean.liturgy.entries) if(!L.entries[k]){ L.entries[k]=clean.liturgy.entries[k]; added++; }
    const first=Object.keys(L.entries).sort()[0]; if(first&&(!L.start||first<L.start)) L.start=first;
    await save('liturgy',L);
  }
  if(clean.confession){
    const C=(await db.get('confession'))||{entries:{},interval:clean.confession.interval,nextOverride:clean.confession.nextOverride};
    for(const k in clean.confession.entries) if(!C.entries[k]){ C.entries[k]=clean.confession.entries[k]; added++; }
    await save('confession',C);
  }
  return added;
}
