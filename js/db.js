// طبقة IndexedDB بسيطة: مخزن key-value واحد "kv" + مخزن "outbox" لطابور المزامنة لاحقاً
const NAME='lawha', VER=1;
let _db;
// (v9.40) حسابات متعددة على جهاز واحد: المفاتيح الشخصية تُحفظ تلقائياً تحت 'u:<id>:<key>' حسب الحساب النشط (setScope)،
// فكل الوحدات القديمة (الاعتراف، الأجبية، الرسائل…) تصبح لكل حساب بلا تعديل. بلا حساب نشط تُقرأ من 'u:-:' أي فارغة (لا تتسرب بيانات حساب آخر).
// المفاتيح المشتركة (results، sbAuth، accessCache، booksCache…) تبقى كما هي؛ النتائج تُفلتر بـprofileId داخل results.js.
const PERSONAL=new Set(['profile','confession','agpeya','liturgy','settings','inbox','lastBackup','dataSince','notifiedDay','libLast','agpLast','lastSessionAt','accessUnlocked','exam_session','read_session']);   // (v9.489) read_session: وقت القراءة لكل حساب
const PERSONAL_RE=/^lastOpen_/;
let scope='';
export const isPersonal=(k)=>PERSONAL.has(k)||PERSONAL_RE.test(k);
export const PERSONAL_KEYS=[...PERSONAL];
export const setScope=(id)=>{ scope=id||''; };
export const getScope=()=>scope;
const sk=(k)=>isPersonal(k)?'u:'+(scope||'-')+':'+k:k;
function open(){
  if(_db) return Promise.resolve(_db);
  return new Promise((res,rej)=>{
    const r=indexedDB.open(NAME,VER);
    r.onupgradeneeded=()=>{ const d=r.result;
      if(!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if(!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox',{keyPath:'id',autoIncrement:true});
    };
    r.onblocked=()=>rej(new Error('اقفل التبويبات التانية وحاول تاني'));
    r.onsuccess=()=>{ _db=r.result; _db.onversionchange=()=>{ _db.close(); _db=null; }; res(_db); };
    r.onerror=()=>rej(r.error);
  });
}
function tx(store,mode,fn){
  return open().then(d=>new Promise((res,rej)=>{
    const t=d.transaction(store,mode), s=t.objectStore(store), q=fn(s);
    t.oncomplete=()=>res(q&&q.result); t.onerror=()=>rej(t.error);
  }));
}
export const getRaw=(k)=>tx('kv','readonly',s=>s.get(k));
export const setRaw=(k,v)=>tx('kv','readwrite',s=>s.put(v,k));
export const delRaw=(k)=>tx('kv','readwrite',s=>s.delete(k));
export const get=(k)=>getRaw(sk(k));
export const set=(k,v)=>setRaw(sk(k),v);
export const del=(k)=>delRaw(sk(k));
export const getAt=(id,k)=>getRaw('u:'+id+':'+k);          // مفتاح شخصي لحساب بعينه (مهام الطابور لحساب غير نشط)
export const setAt=(id,k,v)=>setRaw('u:'+id+':'+k,v);
export const keys=()=>tx('kv','readonly',s=>s.getAllKeys());
export const queue=(item)=>tx('outbox','readwrite',s=>s.add({...item,at:Date.now()})).then(id=>{ try{ dispatchEvent(new Event('lawha:queued')); }catch(e){} return id; }); // يرجع id المهمة، ويُنبّه المزامنة
export const putJob=(job)=>tx('outbox','readwrite',s=>s.put(job)); // تحديث مهمة (محاولات/فشل)
export const unqueue=(id)=>tx('outbox','readwrite',s=>s.delete(id));
export const pending=()=>tx('outbox','readonly',s=>s.getAll());
export const exportAll=async()=>{ const ks=await keys(), o={}; for(const k of ks) o[k]=await get(k); return o; };
export const importAll=async(o)=>{ for(const k in o) await set(k,o[k]); };
