    }// طبقة المزامنة (المرحلة ٥): تقرأ الطابور (outbox) وترسل لـSupabase عبر REST بـfetch فقط (بلا مكتبات/CDN).
// معزولة تماماً: تغيير الخدمة = استبدال هذا الملف (+ config.js). كل مهمة idempotent (id ثابت + ON CONFLICT DO NOTHING).
// المخدوم يدخل Supabase كمستخدم مجهول (anonymous auth)، والملكية تُربط بـauth.uid().
// (v6) الخادم/المالك: email+password حقيقي → JWT فيه app_metadata.role (staffLogin). الاسترجاع عبر Edge Function "restore" فقط.
import * as db from './db.js';
import {FN} from './functions.js';
import * as A from './auth.js';
import {SUPABASE_URL as BASE,SUPABASE_ANON_KEY as KEY} from './config.js';

export const enabled=()=>!!(BASE&&KEY);
const MAX_TRIES=6;
let running=false, timer=null, delay=0;

class E extends Error{ constructor(status,code,msg){ super(msg||('HTTP '+status)); this.status=status; this.code=code; } }
const transient=(e)=>!e.status||e.status>=500||[401,408,429].includes(e.status)||e.code==='23503';

const pack=(j,old)=>({access:j.access_token,refresh:j.refresh_token,exp:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600),uid:(j.user&&j.user.id)||(old&&old.uid)});
async function token(force){
  let a=await db.get('sbAuth');
  if(a&&!force&&a.exp-60>Date.now()/1000) return a;
  if(a&&a.refresh){
    const r=await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:a.refresh})});
    if(r.ok){ a={...pack(await r.json(),a),fresh:false}; await db.set('sbAuth',a); return a; }
    if(r.status>=500||r.status===429) throw new E(r.status);
  }
  const r=await fetch(BASE+'/auth/v1/signup',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:'{}'});
  if(!r.ok) throw new E(r.status);
  a={...pack(await r.json()),fresh:true}; await db.set('sbAuth',a); return a;
}
async function api(path,{method='GET',body,prefer}={}){
  const go=(a)=>fetch(BASE+path,{method,headers:{apikey:KEY,Authorization:'Bearer '+a.access,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},body:body==null?undefined:JSON.stringify(body)});
  let r=await go(await token());
  if(r.status===401) r=await go(await token(true));
  return r;
}
async function fail(r){ let j={}; try{ j=await r.json(); }catch(e){} return new E(r.status,j.code,j.message); }
async function insert(table,row){
  const r=await api(`/rest/v1/${table}?on_conflict=id`,{method:'POST',body:row,prefer:'resolution=ignore-duplicates,return=minimal'});
  if(!r.ok) throw await fail(r);
}
async function ensureClaim(){
  const a=await token(); if(!a.fresh) return;
  const p=await db.get('profile');
  if(p&&p.code){ const r=await api('/rest/v1/rpc/claim_profile',{method:'POST',body:{p_id:p.id,p_code:p.code}}); if(!r.ok) throw await fail(r); }
  a.fresh=false; await db.set('sbAuth',a);
}

const rankOf=(atts,a)=>atts.filter(x=>x.bookId===a.bookId&&x.chapterNum===a.chapterNum).sort((x,y)=>x.at-y.at).findIndex(x=>x.id===a.id)+1;
async function scrubLocal(p){ Object.assign(p,{synced:true,phone:'',email:'',guardianName:'',guardianPhone:''}); await db.set('profile',p); }
const H={
  async 'profile.create'(j){
    const p=await db.get('profile'); if(!p||p.id!==j.profileId) return 'drop';
    if(p.synced) return 'done';
    await insert('profiles',{id:p.id,code:p.code,name:p.name,name_norm:A.normName(p.name),phone:p.phone,grade:p.grade,gender:p.gender,
      email:p.email||null,guardian_name:p.guardianName||null,guardian_phone:p.guardianPhone||null,created_at:new Date(p.createdAt).toISOString()});
    if(!(await A.scrubAfterAck(j.id))){ const q=await db.get('profile'); if(q) await db.set('profile',{...q,synced:true}); }
    return 'done';
  },
  async 'profile.scrub'(j){
    const p=await db.get('profile'); if(p&&p.id===j.profileId&&p.synced) await scrubLocal(p);
    const waiting=(await db.pending()).some(x=>x.id===j.after);
    return waiting?'skip':'done';
  },
  async 'messages.read'(j){
    const r=await api('/rest/v1/rpc/mark_read',{method:'POST',body:{p_profile:j.profileId,p_ids:j.ids}}); if(!r.ok) throw await fail(r); return 'done';
  },
  async 'result.create'(j){
    const R=(await db.get('results'))||{attempts:[]}, a=R.attempts.find(x=>x.id===j.attemptId); if(!a) return 'drop';
    const SA=(await db.get('syncedAttempts'))||{}; if(SA[a.id]) return 'done';
    const row={id:a.id,profile_id:j.profileId,book_id:a.bookId,chapter_num:a.chapterNum,attempt_no:j.attemptNo||a.attemptNo||rankOf(R.attempts,a),
      score:a.score,total:a.total,source:a.source||'finish',answered:a.answered,attempted_at:new Date(a.at).toISOString()};
    try{ await insert('results',row); }
    catch(e){
      if(e.code!=='23505') throw e;
      const r=await api(`/rest/v1/results?profile_id=eq.${j.profileId}&book_id=eq.${encodeURIComponent(a.bookId)}&chapter_num=eq.${a.chapterNum}&select=attempt_no&order=attempt_no.desc&limit=1`);
      if(!r.ok) throw await fail(r); const top=(await r.json())[0];
      row.attempt_no=(top?top.attempt_no:0)+1; await insert('results',row);
    }
    SA[a.id]=1; await db.set('syncedAttempts',SA);
    return 'done';
  },
  async 'session.create'(j){ await insert('sessions',{id:j.rid,profile_id:j.profileId,started_at:new Date(j.startedAt).toISOString()}); return 'done'; },
  async 'book_open.create'(j){ await insert('book_opens',{id:j.rid,profile_id:j.profileId,book_id:j.bookId,chapter_num:j.chapterNum,opened_at:new Date(j.openedAt).toISOString()}); return 'done'; }
};

async function reconcile(p){
  if(!p) return;
  const R=(await db.get('results'))||{attempts:[]}, SA=(await db.get('syncedAttempts'))||{};
  const have=new Set((await db.pending()).filter(j=>j.type==='result.create').map(j=>j.attemptId));
  for(const a of R.attempts){
    if((a.profileId&&a.profileId!==p.id)||SA[a.id]||have.has(a.id)) continue;
    await db.queue({type:'result.create',attemptId:a.id,profileId:p.id,attemptNo:a.attemptNo});
  }
}

async function pass(){
  const p=await A.activeProfile();
  await reconcile((await A.getRole())==='student'?p:null);
  const jobs=(await db.pending()).filter(j=>!j.dead&&H[j.type]);
  if(!jobs.length) return;
  await ensureClaim();
  for(const j of jobs){
    try{ const res=await H[j.type](j); if(res==='done'||res==='drop') await db.unqueue(j.id); }
    catch(e){
      if(transient(e)) throw e;
      j.tries=(j.tries||0)+1; j.lastErr=String(e.code||e.status||e.message).slice(0,60); if(j.tries>=MAX_TRIES) j.dead=true;
      await db.putJob(j);
    }
  }
}
export async function run(){
  if(!enabled()||running||(typeof navigator!=='undefined'&&navigator.onLine===false)) return;
  running=true;
  try{ await pass(); delay=0; }
  catch(e){ delay=Math.min(300000,delay?delay*3:5000); kick(delay); }
  finally{ running=false; }
}
export function kick(ms=500){ clearTimeout(timer); timer=setTimeout(()=>{ run(); },ms); }
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
export async function flush(){
  if(!enabled()) return {state:'off',pending:0,dead:0};
  if(offline()) return {state:'offline',...(await stats())};
  clearTimeout(timer);
  for(let i=0;i<50&&running;i++) await sleep(300);
  await run();
  for(let i=0;i<50&&running;i++) await sleep(300);
  const s=await stats(); return {state:s.pending?'pending':'done',...s};
}
export const stats=async()=>{ const j=await db.pending(); return {pending:j.filter(x=>!x.dead).length,dead:j.filter(x=>x.dead).length}; };

const stu=async()=>{ const p=await A.activeProfile(); return p&&(await A.getRole())==='student'&&enabled()?p:null; };
export async function logSession(){
  try{ const p=await stu(); if(!p) return; const t=await db.get('lastSessionAt'); if(t&&Date.now()>=t&&Date.now()-t<30*60000) return;
    await db.set('lastSessionAt',Date.now()); await db.queue({type:'session.create',rid:crypto.randomUUID(),profileId:p.id,startedAt:Date.now()}); }catch(e){}
}
export async function logOpen(bookId,chapterNum){
  try{ const p=await stu(); if(!p) return;
    const k=`lastOpen_${bookId}_${chapterNum}`, t=await db.get(k); if(t&&Date.now()>=t&&Date.now()-t<30*60000) return;
    await db.set(k,Date.now()); await db.queue({type:'book_open.create',rid:crypto.randomUUID(),profileId:p.id,bookId,chapterNum,openedAt:Date.now()}); }catch(e){}
}

const PAGE=1000, CAP=5000;
async function pullResults(p){
  const rows=[];
  for(let off=0;off<CAP;off+=PAGE){
    const r=await api(`/rest/v1/results?profile_id=eq.${p.id}&select=id,book_id,chapter_num,attempt_no,score,total,source,answered,attempted_at&order=attempted_at.asc,id.asc&limit=${Math.min(PAGE,CAP-off)}&offset=${off}`);
    if(!r.ok) break;
    const part=await r.json(); rows.push(...part); if(part.length<PAGE) break;
  }
  if(!rows.length) return;
  const R=(await db.get('results'))||{attempts:[]}, SA=(await db.get('syncedAttempts'))||{}, have=new Set(R.attempts.map(a=>a.id));
  for(const x of rows){ SA[x.id]=1; if(!have.has(x.id)) R.attempts.push({id:x.id,profileId:p.id,bookId:x.book_id,chapterNum:x.chapter_num,attemptNo:x.attempt_no,score:x.score,total:x.total,source:x.source,answered:x.answered,at:Date.parse(x.attempted_at)}); }
  await db.set('results',R); await db.set('syncedAttempts',SA);
}
export async function remoteRestore(name,code){
  if(!enabled()) return {error:'unavailable'};
  if(typeof navigator!=='undefined'&&navigator.onLine===false) return {error:'offline'};
  try{
    const go=(a)=>fetch(BASE+'/functions/v1/'+FN['restore'],{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+a.access,'Content-Type':'application/json'},body:JSON.stringify({name:A.normName(name),code})});
    let r=await go(await token()); if(r.status===401) r=await go(await token(true));
    let j={}; try{ j=await r.json(); }catch(e){}
    if(r.status===429||j.error==='locked') return {error:'locked'};
    if(r.status===404&&j.error==='mismatch') return null;
    if(!r.ok||!j.profile||!j.profile.id) return {error:'unavailable'};
    const x=j.profile;
    const a=await db.get('sbAuth'); if(a&&a.fresh){ a.fresh=false; await db.set('sbAuth',a); }
    const p={id:x.id,code:x.code,name:x.name,grade:x.grade,gender:x.gender,phone:'',email:'',guardianName:'',guardianPhone:'',createdAt:Date.parse(x.created_at)||Date.now(),synced:true};
    await pullResults(p);
    return p;
  }catch(e){ return {error:'offline'}; }
}

const claims=(jwt)=>{ try{ return JSON.parse(atob(String(jwt).split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); }catch(e){ return {}; } };
const staffRoleOf=(jwt)=>{ const c=claims(jwt), r=(c.app_metadata||{}).role; return !c.is_anonymous&&A.STAFF.includes(r)?r:null; };
const staffPack=(j,role)=>({role,uid:(j.user&&j.user.id)||claims(j.access_token).sub,access:j.access_token,refresh:j.refresh_token,exp:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600),
  mustChange:!!(claims(j.access_token).user_metadata||{}).must_change_password});
const offline=()=>typeof navigator!=='undefined'&&navigator.onLine===false;

export async function staffLogin(email,password){
  if(!enabled()) return {ok:false,reason:'unavailable'};
  if(offline()) return {ok:false,reason:'offline'};
  let r; try{ r=await fetch(BASE+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({email:String(email||'').trim(),password:String(password||'')})}); }
  catch(e){ return {ok:false,reason:'offline'}; }
  if(r.status===429) return {ok:false,reason:'rate'};
  if(!r.ok) return {ok:false,reason:r.status>=500?'server':'bad'};
  const j=await r.json(), role=staffRoleOf(j.access_token);
  if(!role){
    try{ await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+j.access_token}}); }catch(e){}
    return {ok:false,reason:'noRole'};
  }
  await db.set('staff',staffPack(j,role));
  dispatchEvent(new Event('lawha:role'));
  return {ok:true,role};
}
export async function staffLogout(){
  const s=await db.get('staff'); await db.del('staff'); await db.del('resultsBoard');
  if(s&&s.access&&!offline()){ try{ await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+s.access}}); }catch(e){} }
  dispatchEvent(new Event('lawha:role'));
}
let staffBusy=null;
export function staffAuth(force){ return staffBusy||(staffBusy=(async()=>{
  try{
    let s=await db.get('staff'); if(!s) return null;
    if(!force&&s.exp-60>Date.now()/1000) return s;
    let r; try{ r=await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh})}); }
    catch(e){ throw new E(0); }
    if(r.ok){ const j=await r.json(), role=staffRoleOf(j.access_token);
      if(!role){ await db.del('staff'); return null; }
      s=staffPack(j,role); await db.set('staff',s); return s; }
    if(r.status>=500||r.status===408||r.status===429) throw new E(r.status);
    await db.del('staff'); return null;
  } finally{ staffBusy=null; }
})()); }
export async function staffApi(path,opts={}){
  const s=await staffAuth(false); if(!s) throw new E(401);
  const go=(t)=>fetch(BASE+path,{method:opts.method||'GET',headers:{apikey:KEY,Authorization:'Bearer '+t,'Content-Type':'application/json',...(opts.prefer?{Prefer:opts.prefer}:{})},body:opts.body==null?undefined:JSON.stringify(opts.body)});
  let r=await go(s.access);
  if(r.status===401){ const n=await staffAuth(true); if(!n) throw new E(401); r=await go(n.access); }
  return r;
}

export async function inboxFetch(profileId){
  if(!enabled()||offline()) return null;
  try{ try{ await ensureClaim(); }catch(e){}
    const r=await api('/rest/v1/rpc/my_messages',{method:'POST',body:{p_profile:profileId}});
    return r.ok?await r.json():null;
  }catch(e){ return null; }
}
export async function submitRequest({type='password_reset',name='',contact='',message=''}){
  if(!enabled()) return {ok:false,reason:'unavailable'};
  if(offline()) return {ok:false,reason:'offline'};
  try{
    const r=await fetch(BASE+'/rest/v1/requests',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({type,requester_name:name||null,requester_contact:contact,message:message||null})});
    if(r.ok) return {ok:true};
    let j={}; try{ j=await r.json(); }catch(e){}
    if(j&&j.message==='duplicate') return {ok:true,dup:true};
    if(j&&j.message==='full') return {ok:false,reason:'busy'};
    return {ok:false,reason:r.status===429?'rate':(r.status>=500?'server':'bad')};
  }catch(e){ return {ok:false,reason:'offline'}; }
}
export async function resetPassword(email,password){
  let s; try{ s=await staffAuth(false); }catch(e){ return {ok:false,reason:'offline'}; }
  if(!s) return {ok:false,reason:'auth'};
  try{
    const r=await fetch(BASE+'/functions/v1/'+FN['reset-password'],{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+s.access,'Content-Type':'application/json'},body:JSON.stringify({email,new_password:password})});
    let j={}; try{ j=await r.json(); }catch(e){}
    if(r.ok&&j.ok) return {ok:true};
    return {ok:false,reason:j.error||(r.status===404?'nofn':'server')};
  }catch(e){ return {ok:false,reason:'offline'}; }
}
export async function staffAdmin(payload){
  let s; try{ s=await staffAuth(false); }catch(e){ return {ok:false,reason:'offline'}; }
  if(!s) return {ok:false,reason:'auth'};
  try{
    const r=await fetch(BASE+'/functions/v1/'+FN['staff-admin'],{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+s.access,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    let j={}; try{ j=await r.json(); }catch(e){}
    if(r.ok&&j.ok) return j;
    return {ok:false,reason:j.error||(r.status===404?'nofn':'server')};
  }catch(e){ return {ok:false,reason:'offline'}; }
}
export async function changePassword(password){
  let s; try{ s=await staffAuth(false); }catch(e){ return {ok:false,reason:'offline'}; }
  if(!s) return {ok:false,reason:'auth'};
  try{
    const r=await fetch(BASE+'/auth/v1/user',{method:'PUT',headers:{apikey:KEY,Authorization:'Bearer '+s.access,'Content-Type':'application/json'},body:JSON.stringify({password,data:{must_change_password:false}})});
    if(!r.ok){ let j={}; try{ j=await r.json(); }catch(e){}
      return {ok:false,reason:r.status===401?'auth':r.status===422?(/different/i.test(j.msg||j.message||'')?'same':'weak'):(r.status>=500?'server':'bad')}; }
    const cur=await db.get('staff'); if(cur) await db.set('staff',{...cur,mustChange:false});
    return {ok:true};
  }catch(e){ return {ok:false,reason:'offline'}; }
}

const RB_PAGE=1000, RB_CAP=20000;
const RB_COLS='profile_id,name,grade,gender,book_id,title,chapter_num,first_score,first_total,first_attempted_at,attempts';
export async function resultsFirst({refresh=true}={}){
  const cached=await db.get('resultsBoard');
  const fb=(error)=>({rows:cached?cached.rows:[],at:cached?cached.at:0,fromCache:true,truncated:!!(cached&&cached.truncated),error});
  if(!refresh||!enabled()||offline()) return fb(cached?undefined:'offline');
  try{
    const rows=[]; let truncated=false;
    for(let off=0;;off+=RB_PAGE){
      if(off>=RB_CAP){ truncated=true; break; }
      const r=await staffApi(`/rest/v1/results_first_staff?select=${RB_COLS}&order=profile_id.asc,book_id.asc,chapter_num.asc&limit=${RB_PAGE}&offset=${off}`);
      if(!r.ok) throw new E(r.status);
      const part=await r.json(); rows.push(...part); if(part.length<RB_PAGE) break;
    }
    const out={rows,at:Date.now(),truncated}; await db.set('resultsBoard',out);
    return {...out,fromCache:false};
  }catch(e){ return fb(e.status===401||e.status===403?'auth':(!e.status?'offline':'server')); }
}

async function pub(path){
  if(!enabled()||offline()) return null;
  const c=new AbortController(), t=setTimeout(()=>c.abort(),6000);
  try{ const r=await fetch(BASE+path,{headers:{apikey:KEY,Authorization:'Bearer '+KEY},signal:c.signal}); return r.ok?await r.json():null; }
  catch(e){ return null; } finally{ clearTimeout(t); }
}
export const booksList=()=>pub('/rest/v1/books?select=id,title,read_minutes,updated_at&order=id');
export async function booksGet(id){ const x=await pub(`/rest/v1/books?id=eq.${encodeURIComponent(id)}&select=data`); return x&&x[0]&&x[0].data?x[0].data:null; }

export function init(){
  if(!enabled()) return;
  A.setRemoteRestore(remoteRestore);
  db.get('staff').then(s=>{ if(s&&navigator.onLine) staffAuth(true).then(n=>{ if(!n) dispatchEvent(new Event('lawha:role')); }).catch(()=>{}); });
  addEventListener('online',()=>kick(500));
  addEventListener('lawha:queued',()=>kick(800));
  if(typeof document!=='undefined') document.addEventListener('visibilitychange',()=>{ if(!document.hidden) kick(1500); });
  setInterval(()=>kick(0),120000);
  kick(2500);
}
