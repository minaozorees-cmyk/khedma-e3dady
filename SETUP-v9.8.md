# SETUP-v9.8 — النسخة الموحّدة النظيفة (من الصفر) + GitHub Pages

نسخة واحدة فيها كل حاجة من v9 → v9.6 (دخول موحّد، طلبات، كاهن، رسائل، ترقية، أرشفة، افتقاد، حضور، حسابات الطاقم، أدوات المالك). التصميم زي ما هو.
**الترتيب:** ١) Supabase ← ٢) Edge Functions ← ٣) إعداد التطبيق ← ٤) النشر (GitHub Pages أو Netlify) ← ٥) ربط الـALLOWED_ORIGIN ← ٦) الاختبار.

---

## ما اتغيّر في v9.8
- `supabase/schema.sql` واحد نظيف (٧ أجزاء، كل دالة/trigger/view/policy مرة واحدة، آمن للتكرار). أسماء الجداول والدوال والسياسات كما هي. زودت بس تقييد صلاحيات صريح (`revoke/grant`) على الجداول الأساسية.
- ملفات الـSetup القديمة اتنقلت لـ`docs/old-setup/` (مش محذوفة).
- `sw.js` = `v9.8`. أُضيف `.nojekyll` لـGitHub Pages.
- كل المسارات نسبية (اتفحصت بمحاكاة نشر على `/اسم-الريبو/`)، ومفيش روابط ثابتة. `js/config.js` ما اتلمسش.

---

## ١) Supabase

### أ) مشروع نظيف
**الخيار الأسهل:** مشروع Supabase جديد → خد `Project URL` و`anon public key` (Settings → API) وحطهم في `js/config.js` (انظر القسم ٣).
**أو** استخدم `lawha-test` بعد المسح (كل بياناتك تجريبية):
1. SQL Editor → الصق وشغّل **مسح البيانات** (الجداول بتتمسح، الهيكل يتعمل تاني من الأجزاء):
```sql
drop table if exists public.followups, public.attendance, public.meetings, public.message_reads, public.message_targets, public.messages, public.requests, public.app_meta, public.results, public.book_opens, public.sessions, public.restore_attempts, public.restore_ip_attempts, public.audit_log, public.books, public.profiles cascade;
```
2. Authentication → Users → امسح كل المستخدمين (بما فيهم المجهولين القدام).

### ب) تفعيل الدخول المجهول
Authentication → **Sign In / Providers** → فعّل **Allow anonymous sign-ins** (المخدوم بيدخل بهوية مجهولة).

### ج) شغّل الأجزاء ١ → ٧ بالترتيب
الصق كل جزء لوحده في SQL Editor واضغط Run. لو جزء فشل، **اتأكد إن اللي قبله اتنفذ**. (الملف الكامل نفسه في `supabase/schema.sql`.)

### الجزء 1 من ٧ — الأساس: دوال الدور + الجداول الأساسية
```sql
-- ============================================================
-- خدمة إعدادي — schema v9.8 — الجزء ١ من ٧: الأساس (دوال الدور + الجداول الأساسية)
-- آمن للتكرار. شغّل الأجزاء ١ → ٧ بالترتيب في Supabase → SQL Editor.
-- مطلوب قبله: Authentication → Sign In / Providers → فعّل "Allow anonymous sign-ins".
-- الدور (student/servant/priest/owner) يُقرأ من app_metadata.role في الـJWT (المخدوم المجهول بلا دور = student).
-- ============================================================

create or replace function public.my_role() returns text language sql stable as
$$ select coalesce(auth.jwt()->'app_metadata'->>'role','student') $$;

-- كل من له دور خادم/كاهن/مالك. استعمله بدل تكرار قائمة الأدوار في السياسات.
create or replace function public.is_staff() returns boolean language sql stable as
$$ select public.my_role() in ('servant','priest','owner') $$;

create or replace function public.whoami() returns jsonb language sql stable as
$$ select jsonb_build_object('uid',auth.uid(),'role',public.my_role()) $$;

-- نفس تطبيع الاسم في js/auth.js (normName). يُستعمل في profiles_guard لمزامنة name_norm عند تغيير الاسم.
create or replace function public.norm_name(s text) returns text language sql immutable as $$
  select lower(translate(
    regexp_replace(regexp_replace(regexp_replace(coalesce(s,''),'^\s+|\s+$','','g'),'\s+',' ','g'),E'[\u064B-\u0652\u0640]','','g'),
    'أإآىة','ااايه'))
$$;

-- ===== الجداول =====
create table if not exists public.profiles(
  id uuid primary key,
  auth_uid uuid not null default auth.uid(),          -- مالك الملف (الجهاز الحالي)
  code text not null,
  name text not null check (char_length(name) between 2 and 120),
  name_norm text not null,
  phone text, email text, guardian_name text, guardian_phone text,   -- بيانات الاتصال: للطاقم فقط
  grade text not null, gender text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,                             -- حذف ناعم (٣٠ يوماً ثم تنظيف من المالك)
  archived_at timestamptz                             -- أرشفة الخريجين (ترقية آخر السنة)
);
alter table public.profiles add column if not exists archived_at timestamptz;   -- للمشاريع القديمة
-- الكود ٨ أحرف للجدد (٦ للموجودين)
alter table public.profiles drop constraint if exists profiles_code_check;
alter table public.profiles drop constraint if exists profiles_code_len;
alter table public.profiles add constraint profiles_code_len check (char_length(code) in (6,8));
create index if not exists profiles_name_norm_idx on public.profiles(name_norm);
create index if not exists profiles_auth_uid_idx  on public.profiles(auth_uid);
-- فهرس عادي وليس UNIQUE: أي قيد تفرّد على (name_norm,code) يكشف وجود الزوج عبر الخطأ 23505.
drop index if exists public.profiles_name_code_uniq;
create index if not exists profiles_name_code_idx on public.profiles(name_norm,code);

create or replace function public.owns_profile(pid uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from public.profiles where id=pid and auth_uid=auth.uid() and deleted_at is null) $$;

create table if not exists public.sessions(
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now()
);
create table if not exists public.book_opens(
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  book_id text not null, chapter_num int not null check (chapter_num>0),
  opened_at timestamptz not null default now()
);
create table if not exists public.results(
  id uuid primary key,                                -- = attemptId المحلي (يضمن عدم التكرار)
  profile_id uuid not null references public.profiles(id) on delete cascade,
  book_id text not null, chapter_num int not null check (chapter_num>0),
  attempt_no int not null check (attempt_no>=1),
  score int not null check (score>=0), total int not null check (total>0), check (score<=total),
  source text not null default 'finish' check (source in ('finish','exit','expired')),
  answered int, attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (profile_id,book_id,chapter_num,attempt_no)
);
create index if not exists sessions_profile_idx   on public.sessions(profile_id);
create index if not exists book_opens_profile_idx on public.book_opens(profile_id);
create index if not exists results_profile_idx    on public.results(profile_id);

-- أول محاولة هي المعتمدة في اللوحة والترتيب (كل المحاولات محفوظة في results)
create or replace view public.results_first with (security_invoker=true) as
select distinct on (profile_id,book_id,chapter_num)
  profile_id,book_id,chapter_num,id as first_id,score,total,attempted_at,
  count(*) over (partition by profile_id,book_id,chapter_num) as attempts
from public.results order by profile_id,book_id,chapter_num,attempt_no;

create table if not exists public.books(
  id text primary key, title text not null, read_minutes int not null default 3,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(), updated_by uuid default auth.uid()
);
create table if not exists public.audit_log(
  id bigint generated always as identity primary key,
  at timestamptz not null default now(), actor uuid default auth.uid(),
  action text not null, table_name text not null, row_id text, detail jsonb
);

-- جداول حدّ محاولات الاسترجاع (لا سياسات RLS عمداً: الوصول عبر الدوال وEdge Function فقط)
create table if not exists public.restore_attempts(
  id bigint generated always as identity primary key,
  auth_uid uuid not null,
  succeeded boolean not null,
  at timestamptz not null default now()
);
create index if not exists restore_attempts_uid_at_idx on public.restore_attempts(auth_uid,at);
create table if not exists public.restore_ip_attempts(   -- تكتبه Edge Function فقط (IP مُجزَّأ بملح)
  id bigint generated always as identity primary key,
  ip_hash text not null,
  succeeded boolean not null,
  at timestamptz not null default now()
);
create index if not exists restore_ip_attempts_ip_at_idx on public.restore_ip_attempts(ip_hash,at);
```

### الجزء 2 من ٧ — الحماية: RLS + triggers للجداول الأساسية
```sql
-- ============================================================
-- الجزء ٢ من ٧: الحماية للجداول الأساسية (RLS + صلاحيات + triggers)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.book_opens enable row level security;
alter table public.results enable row level security;
alter table public.books enable row level security;
alter table public.audit_log enable row level security;
alter table public.restore_attempts enable row level security;
alter table public.restore_ip_attempts enable row level security;

-- صلاحيات الجداول (الـRLS هي اللي تحدد الصفوف). الـanon: قراءة الأسفار فقط.
revoke all on public.profiles, public.sessions, public.book_opens, public.results, public.books, public.audit_log from anon;
revoke all on public.restore_attempts, public.restore_ip_attempts from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.sessions, public.book_opens, public.results, public.books to authenticated;
revoke all on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;     -- الكتابة عبر triggers (security definer) فقط
grant select on public.books to anon;

-- ===== profiles =====
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_staff_read on public.profiles;
drop policy if exists profiles_owner_all  on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_update_staff on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated with check (auth_uid=auth.uid() and public.my_role()='student');
create policy profiles_select_own on public.profiles for select to authenticated using (auth_uid=auth.uid() and deleted_at is null);
create policy profiles_staff_read on public.profiles for select to authenticated using (public.is_staff() and deleted_at is null and archived_at is null);
create policy profiles_owner_all  on public.profiles for all    to authenticated using (public.my_role()='owner') with check (public.my_role()='owner');
-- المخدوم يعدّل ملفه فقط (الأعمدة الحساسة يحميها profiles_guard)
create policy profiles_update_own on public.profiles for update to authenticated
  using (auth_uid=auth.uid() and deleted_at is null)
  with check (auth_uid=auth.uid() and public.my_role()='student');
-- الطاقم يعدّل ملفات المخدومين (تصحيح اسم/صف/اتصال). الحذف الناعم والأرشفة للمالك فقط.
create policy profiles_update_staff on public.profiles for update to authenticated
  using (public.is_staff() and deleted_at is null and archived_at is null)
  with check (public.is_staff());

-- trigger يمنع تعديل الأعمدة غير القابلة للتغيير من العميل:
-- الكل: لا id/auth_uid/created_at. الكود: المالك فقط. المخدوم: ولا deleted_at/archived_at/name/name_norm/gender.
-- الخادم/الكاهن: يعدّلان الاسم والباقي (لا deleted_at ولا archived_at). المالك: كل شيء عدا الأعمدة الثابتة.
-- تغيير الاسم يعيد حساب name_norm تلقائياً. الدوال security definer وservice_role تمر (current_user ليس authenticated/anon).
create or replace function public.profiles_guard() returns trigger language plpgsql as $$
declare r text:=public.my_role();
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if new.id is distinct from old.id or new.auth_uid is distinct from old.auth_uid or new.created_at is distinct from old.created_at then
    raise exception 'immutable column' using errcode='42501';
  end if;
  if new.code is distinct from old.code and r<>'owner' then
    raise exception 'immutable column' using errcode='42501';
  end if;
  if r not in ('servant','priest','owner') then
    if new.deleted_at is distinct from old.deleted_at or new.archived_at is distinct from old.archived_at or new.name is distinct from old.name
       or new.name_norm is distinct from old.name_norm or new.gender is distinct from old.gender then
      raise exception 'immutable column' using errcode='42501';
    end if;
  elsif r in ('servant','priest') and (new.deleted_at is distinct from old.deleted_at or new.archived_at is distinct from old.archived_at) then
    raise exception 'immutable column' using errcode='42501';
  end if;
  if r in ('servant','priest','owner') and new.name is distinct from old.name then new.name_norm:=public.norm_name(new.name); end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

-- سقف ٣ ملفات لكل auth_uid (الملفات المحذوفة ناعماً لا تُحسب)
create or replace function public.profiles_cap() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (select count(*) from public.profiles where auth_uid=new.auth_uid and deleted_at is null)>=3 then
    raise exception 'profile limit' using errcode='P0001';
  end if;
  return new;
end $$;
drop trigger if exists profiles_cap on public.profiles;
create trigger profiles_cap before insert on public.profiles for each row execute function public.profiles_cap();

-- حذف نهائي: ممنوع من العميل إلا لملف محذوف ناعماً (الحذف يمسح نتائجه/جلساته بالتسلسل)
create or replace function public.profiles_del_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and old.deleted_at is null then
    raise exception 'soft delete first' using errcode='42501';
  end if;
  return old;
end $$;
drop trigger if exists profiles_del_guard on public.profiles;
create trigger profiles_del_guard before delete on public.profiles for each row execute function public.profiles_del_guard();

-- ===== sessions / book_opens / results: المخدوم يكتب ويقرأ سجلاته، الطاقم يقرأ، المالك كامل =====
do $$ declare t text; begin
  foreach t in array array['sessions','book_opens','results'] loop
    execute format('drop policy if exists %I on public.%I',t||'_insert_own',t);
    execute format('drop policy if exists %I on public.%I',t||'_select_own',t);
    execute format('drop policy if exists %I on public.%I',t||'_staff_read',t);
    execute format('drop policy if exists %I on public.%I',t||'_owner_all',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.owns_profile(profile_id) and public.my_role()=''student'')',t||'_insert_own',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.owns_profile(profile_id))',t||'_select_own',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())',t||'_staff_read',t);
    execute format('create policy %I on public.%I for all to authenticated using (public.my_role()=''owner'') with check (public.my_role()=''owner'')',t||'_owner_all',t);
  end loop; end $$;

-- ===== books: القراءة للكل (المحتوى منشور أصلاً في books/*.json)، الكتابة للمالك فقط =====
alter table public.books drop constraint if exists books_id_fmt;
alter table public.books add constraint books_id_fmt check (id ~ '^[A-Za-z0-9_\u0600-\u06FF-]{1,60}$');
alter table public.books drop constraint if exists books_minutes_chk;
alter table public.books add constraint books_minutes_chk check (read_minutes between 0 and 60);
alter table public.books drop constraint if exists books_size_chk;
alter table public.books add constraint books_size_chk check (octet_length(data::text)<=4000000);
create or replace function public.books_touch() returns trigger language plpgsql as $$
begin new.updated_at:=now(); new.updated_by:=auth.uid(); return new; end $$;
drop trigger if exists books_touch on public.books;
create trigger books_touch before insert or update on public.books for each row execute function public.books_touch();
drop policy if exists books_read  on public.books;
drop policy if exists books_read_anon on public.books;
drop policy if exists books_owner on public.books;
create policy books_read_anon on public.books for select to anon using (true);
create policy books_read  on public.books for select to authenticated using (true);
create policy books_owner on public.books for all    to authenticated using (public.my_role()='owner') with check (public.my_role()='owner');

-- ===== audit_log: المالك يقرأ فقط. لا سياسة إدخال: الكتابة عبر triggers/دوال security definer =====
drop policy if exists audit_owner_read on public.audit_log;
create policy audit_owner_read on public.audit_log for select to authenticated using (public.my_role()='owner');
```

### الجزء 3 من ٧ — التدقيق + الاسترجاع + عروض اللوحات
```sql
-- ============================================================
-- الجزء ٣ من ٧: التدقيق + الاسترجاع + تنظيف الحذف الناعم + عروض اللوحات
-- ============================================================

-- ===== التدقيق (بلا أي بيانات اتصال في التفاصيل) =====
-- لـprofiles: أفعال مفهومة (soft_delete / restore / update / hard_delete) + أسماء الأعمدة المتغيرة فقط (لا قيم).
create or replace function public.audit() returns trigger language plpgsql security definer set search_path=public as $$
declare rid text; act text:=tg_op; d jsonb; ch text[];
begin
  if tg_op='DELETE' then rid:=old.id::text; else rid:=new.id::text; end if;
  d:=jsonb_build_object('role',public.my_role(),'email',auth.jwt()->>'email');
  if tg_table_name='profiles' then
    if tg_op='DELETE' then
      act:='hard_delete'; d:=d||jsonb_build_object('name',old.name);
    else
      select array_agg(k) into ch from jsonb_object_keys(to_jsonb(new)) k where to_jsonb(new)->k is distinct from to_jsonb(old)->k;
      if ch is null then return null; end if;
      if old.deleted_at is null and new.deleted_at is not null then act:='soft_delete';
      elsif old.deleted_at is not null and new.deleted_at is null then act:='restore';
      else act:='update'; end if;
      d:=d||jsonb_build_object('name',new.name,'changed',to_jsonb(ch));
    end if;
  end if;
  insert into public.audit_log(action,table_name,row_id,detail) values (act,tg_table_name,rid,d);
  return null;
end $$;
drop trigger if exists audit_books on public.books;
drop trigger if exists audit_profiles on public.profiles;
create trigger audit_books    after insert or update or delete on public.books    for each row execute function public.audit();
create trigger audit_profiles after update or delete          on public.profiles for each row execute function public.audit();

-- ===== دوال الاسترجاع =====
-- restore_profile_svc يستدعيها service_role فقط (من Edge Function "restore" بعد حدّ الـIP).
-- الحد على auth_uid فقط: ٥ فشل في آخر ساعة → قفل. لا قفل على name_norm (DoS على المخدوم).
drop function if exists public.restore_profile(text,text);
create or replace function public.restore_profile_svc(p_uid uuid,p_name text,p_code text) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.profiles%rowtype; fails int;
begin
  if p_uid is null then return null; end if;
  if random()<0.02 then delete from public.restore_attempts where at<now()-interval '7 days'; end if;
  select count(*) into fails from public.restore_attempts where auth_uid=p_uid and not succeeded and at>now()-interval '1 hour';
  if fails>=5 then return jsonb_build_object('locked',true); end if;
  if char_length(coalesce(p_code,'')) not in (6,8) or char_length(coalesce(p_name,'')) not between 2 and 120 then
    insert into public.restore_attempts(auth_uid,succeeded) values (p_uid,false); return null;
  end if;
  select * into r from public.profiles p where p.name_norm=p_name and p.code=upper(p_code) and p.deleted_at is null order by p.created_at asc limit 1;
  if not found then
    insert into public.restore_attempts(auth_uid,succeeded) values (p_uid,false); return null;
  end if;
  update public.profiles p set auth_uid=p_uid where p.id=r.id;
  insert into public.restore_attempts(auth_uid,succeeded) values (p_uid,true);
  return jsonb_build_object('id',r.id,'code',r.code,'name',r.name,'grade',r.grade,'gender',r.gender,'created_at',r.created_at);
end $$;

-- لو فقد الجهاز جلسته المجهولة: يعيد ربط ملفه بالهوية الجديدة (بالـid + الكود)، والأخطاء على نفس حدّ auth_uid.
create or replace function public.claim_profile(p_id uuid,p_code text) returns boolean language plpgsql security definer set search_path=public as $$
declare ok boolean;
begin
  if auth.uid() is null then return false; end if;
  if (select count(*) from public.restore_attempts where auth_uid=auth.uid() and not succeeded and at>now()-interval '1 hour')>=5 then return false; end if;
  update public.profiles p set auth_uid=auth.uid() where p.id=p_id and p.code=upper(p_code) and p.deleted_at is null;
  ok:=found;
  insert into public.restore_attempts(auth_uid,succeeded) values (auth.uid(),ok);
  return ok;
end $$;
create or replace function public.ping() returns int language sql security definer set search_path=public as $$ select 1 $$;

revoke all on function public.restore_profile_svc(uuid,text,text) from public, anon, authenticated;
grant execute on function public.restore_profile_svc(uuid,text,text) to service_role;
revoke all on function public.claim_profile(uuid,text) from public, anon;
grant execute on function public.claim_profile(uuid,text) to authenticated;
grant execute on function public.ping() to anon, authenticated;
grant execute on function public.whoami() to authenticated;

-- ===== تنظيف الحذف الناعم بعد ٣٠ يوماً (زر يدوي في لوحة المالك؛ للمالك فقط) =====
create or replace function public.purge_expired_profiles() returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
  if public.my_role()<>'owner' then raise exception 'forbidden' using errcode='42501'; end if;
  with d as (delete from public.profiles where deleted_at is not null and deleted_at < now()-interval '30 days' returning 1)
  select count(*) into n from d;
  return n;
end $$;
revoke all on function public.purge_expired_profiles() from public, anon;
grant execute on function public.purge_expired_profiles() to authenticated;

-- ===== لوحة التميز المباشرة: أول محاولة لكل (مخدوم، سفر، إصحاح) للطاقم فقط (المحذوف/المؤرشف مستبعدان) =====
drop view if exists public.results_first_staff;
create view public.results_first_staff with (security_invoker=true) as
select f.profile_id, p.name, p.grade, p.gender, f.book_id, coalesce(b.title,f.book_id) as title, f.chapter_num,
       f.score as first_score, f.total as first_total, f.attempted_at as first_attempted_at, f.attempts
from (
  select distinct on (r.profile_id,r.book_id,r.chapter_num)
    r.profile_id, r.book_id, r.chapter_num, r.score, r.total, r.attempted_at,
    count(*) over (partition by r.profile_id,r.book_id,r.chapter_num) as attempts
  from public.results r
  order by r.profile_id,r.book_id,r.chapter_num,r.attempt_no
) f
join public.profiles p on p.id=f.profile_id
left join public.books b on b.id=f.book_id
where p.deleted_at is null and p.archived_at is null and public.is_staff();
revoke all on public.results_first_staff from public, anon;
grant select on public.results_first_staff to authenticated;

-- ===== آخر دخول وعدد الجلسات لكل مخدوم (للمالك فقط) =====
drop view if exists public.profile_activity;
create view public.profile_activity with (security_invoker=true) as
select p.id as profile_id, max(s.started_at) as last_seen, count(s.id) as sessions
from public.profiles p left join public.sessions s on s.profile_id=p.id
where public.my_role()='owner'
group by p.id;
revoke all on public.profile_activity from public, anon;
grant select on public.profile_activity to authenticated;
```

### الجزء 4 من ٧ — طلبات نسيت كلمة السر (requests)
```sql
-- ============================================================
-- الجزء ٤ من ٧: طلبات "نسيت كلمة السر" (requests)
-- أي حد يبعت طلب (بشروط)، القراءة والتعديل للمالك فقط.
-- ============================================================
create table if not exists public.requests(
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('password_reset','new_account','other')),
  requester_name text check (requester_name is null or char_length(requester_name)<=120),
  requester_contact text check (requester_contact is null or char_length(requester_contact)<=200),
  message text check (message is null or char_length(message)<=1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','done')),
  handled_by uuid,
  handled_at timestamptz,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists requests_status_idx on public.requests(status,created_at desc);

alter table public.requests enable row level security;
revoke all on public.requests from public, anon, authenticated;
grant insert on public.requests to anon, authenticated;
grant select, update on public.requests to authenticated;
drop policy if exists requests_insert on public.requests;
drop policy if exists requests_owner_read on public.requests;
drop policy if exists requests_owner_update on public.requests;
create policy requests_insert on public.requests for insert to anon, authenticated with check (status='pending' and handled_by is null and handled_at is null and meta='{}'::jsonb and char_length(coalesce(requester_contact,''))>=3);
create policy requests_owner_read on public.requests for select to authenticated using (public.my_role()='owner');
create policy requests_owner_update on public.requests for update to authenticated using (public.my_role()='owner') with check (public.my_role()='owner');

-- منع الـspam: طلب معلّق واحد لكل (نوع + جهة اتصال)، وسقف ٢٠٠ طلب معلّق. security definer لأن anon لا يقرأ الجدول.
create or replace function public.requests_limit() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.requests where status='pending' and type=new.type and lower(requester_contact)=lower(new.requester_contact)) then raise exception 'duplicate' using errcode='P0001'; end if;
  if (select count(*) from public.requests where status='pending')>=200 then raise exception 'full' using errcode='P0001'; end if;
  return new;
end $$;
drop trigger if exists requests_limit on public.requests;
create trigger requests_limit before insert on public.requests for each row execute function public.requests_limit();

-- ختم المعالجة تلقائياً (مين/امتى) عند تغيير الحالة؛ لا نثق بالعميل
create or replace function public.requests_stamp() returns trigger language plpgsql as $$
begin if new.status is distinct from old.status then new.handled_by:=auth.uid(); new.handled_at:=now(); end if; return new; end $$;
drop trigger if exists requests_stamp on public.requests;
create trigger requests_stamp before update on public.requests for each row execute function public.requests_stamp();
```

### الجزء 5 من ٧ — الرسائل (messages)
```sql
-- ============================================================
-- الجزء ٥ من ٧: الرسائل (messages) — الكاهن/المالك: للكل + عاجل + تثبيت. الخادم: لصف أو أسماء محددة.
-- المخدوم لا يقرأ الجداول مباشرة: my_messages / mark_read (security definer) تتحقق أن الملف ملكه.
-- ============================================================
create table if not exists public.messages(
  id uuid primary key default gen_random_uuid(),
  sender uuid not null default auth.uid(),
  sender_role text not null check (sender_role in ('servant','priest','owner')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  urgent boolean not null default false, pinned boolean not null default false,
  audience text not null check (audience in ('all','grade','list')),
  grade text, expires_at timestamptz, deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (audience<>'grade' or grade is not null)
);
create index if not exists messages_created_idx on public.messages(created_at desc);
create table if not exists public.message_targets(
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key(message_id,profile_id)
);
create index if not exists message_targets_profile_idx on public.message_targets(profile_id);
create table if not exists public.message_reads(
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(message_id,profile_id)
);

-- RLS + صلاحيات: القراءة للطاقم فقط؛ الإدخال عبر send_message فقط؛ التعديل حذف ناعم/تثبيت بس
alter table public.messages enable row level security;
alter table public.message_targets enable row level security;
alter table public.message_reads enable row level security;
revoke all on public.messages, public.message_targets, public.message_reads from public, anon, authenticated;
grant select on public.messages, public.message_targets, public.message_reads to authenticated;
grant update (deleted_at, pinned) on public.messages to authenticated;
drop policy if exists messages_staff_read on public.messages;
drop policy if exists messages_update on public.messages;
drop policy if exists message_targets_staff_read on public.message_targets;
drop policy if exists message_reads_staff_read on public.message_reads;
create policy messages_staff_read on public.messages for select to authenticated using (public.is_staff());
create policy messages_update on public.messages for update to authenticated using (public.is_staff() and (sender=auth.uid() or public.my_role()='owner')) with check (public.is_staff() and (sender=auth.uid() or public.my_role()='owner'));
create policy message_targets_staff_read on public.message_targets for select to authenticated using (public.is_staff());
create policy message_reads_staff_read on public.message_reads for select to authenticated using (public.is_staff());

-- التثبيت للكاهن/المالك فقط
create or replace function public.messages_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and new.pinned is distinct from old.pinned and public.my_role() not in ('priest','owner') then raise exception 'forbidden' using errcode='42501'; end if;
  return new;
end $$;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before update on public.messages for each row execute function public.messages_guard();

-- إرسال رسالة (ذرّي) مع فحص الصلاحيات وحدّ ٣٠ رسالة/يوم لكل مرسل
create or replace function public.send_message(p_title text,p_body text,p_urgent boolean,p_pinned boolean,p_audience text,p_grade text,p_expires timestamptz,p_targets uuid[]) returns uuid language plpgsql security definer set search_path=public as $$
declare r text:=public.my_role(); mid uuid; n int;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  if (p_audience='all' or coalesce(p_urgent,false) or coalesce(p_pinned,false)) and r not in ('priest','owner') then raise exception 'forbidden' using errcode='42501'; end if;
  if (select count(*) from public.messages where sender=auth.uid() and created_at>now()-interval '1 day')>=30 then raise exception 'rate' using errcode='P0001'; end if;
  if p_audience='list' and coalesce(array_length(p_targets,1),0) not between 1 and 200 then raise exception 'targets' using errcode='P0001'; end if;
  insert into public.messages(sender,sender_role,title,body,urgent,pinned,audience,grade,expires_at)
    values (auth.uid(),r,btrim(p_title),btrim(p_body),coalesce(p_urgent,false),coalesce(p_pinned,false),p_audience,case when p_audience='grade' then p_grade end,p_expires) returning id into mid;
  if p_audience='list' then
    insert into public.message_targets(message_id,profile_id) select mid,p.id from public.profiles p where p.id=any(p_targets) and p.deleted_at is null and p.archived_at is null;
    get diagnostics n=row_count; if n=0 then raise exception 'targets' using errcode='P0001'; end if;
  end if;
  return mid;
end $$;

-- رسائل المخدوم (لملفه فقط) + تعليم كمقروءة
create or replace function public.my_messages(p_profile uuid) returns table(id uuid,sender_role text,title text,body text,urgent boolean,pinned boolean,created_at timestamptz,expires_at timestamptz,is_read boolean)
language sql stable security definer set search_path=public as $$
  select m.id,m.sender_role,m.title,m.body,m.urgent,m.pinned,m.created_at,m.expires_at,(r.profile_id is not null)
  from public.messages m
  join public.profiles p on p.id=p_profile and p.auth_uid=auth.uid() and p.deleted_at is null and p.archived_at is null
  left join public.message_reads r on r.message_id=m.id and r.profile_id=p.id
  where m.deleted_at is null and (m.expires_at is null or m.expires_at>now())
    and (m.audience='all' or (m.audience='grade' and m.grade=p.grade) or (m.audience='list' and exists(select 1 from public.message_targets t where t.message_id=m.id and t.profile_id=p.id)))
  order by m.pinned desc, m.created_at desc limit 60
$$;
create or replace function public.mark_read(p_profile uuid,p_ids uuid[]) returns void language sql security definer set search_path=public as $$
  insert into public.message_reads(message_id,profile_id)
  select m.id,p.id from public.messages m join public.profiles p on p.id=p_profile and p.auth_uid=auth.uid() and p.deleted_at is null and p.archived_at is null
  where m.id=any(p_ids) and m.deleted_at is null
    and (m.audience='all' or (m.audience='grade' and m.grade=p.grade) or (m.audience='list' and exists(select 1 from public.message_targets t where t.message_id=m.id and t.profile_id=p.id)))
  on conflict do nothing
$$;
revoke all on function public.send_message(text,text,boolean,boolean,text,text,timestamptz,uuid[]), public.my_messages(uuid), public.mark_read(uuid,uuid[]) from public, anon;
grant execute on function public.send_message(text,text,boolean,boolean,text,text,timestamptz,uuid[]), public.my_messages(uuid), public.mark_read(uuid,uuid[]) to authenticated;

-- عرض الطاقم: المستلمون وعدد من قرأ (security_invoker: RLS على القارئ)
drop view if exists public.messages_staff;
create view public.messages_staff with (security_invoker=true) as
select m.id,m.sender,m.sender_role,m.title,m.body,m.urgent,m.pinned,m.audience,m.grade,m.expires_at,m.deleted_at,m.created_at,
  case m.audience when 'all' then (select count(*) from public.profiles p where p.deleted_at is null and p.archived_at is null)
    when 'grade' then (select count(*) from public.profiles p where p.deleted_at is null and p.archived_at is null and p.grade=m.grade)
    else (select count(*) from public.message_targets t where t.message_id=m.id) end as recipients,
  (select count(*) from public.message_reads r where r.message_id=m.id) as reads
from public.messages m where public.is_staff();
revoke all on public.messages_staff from public, anon; grant select on public.messages_staff to authenticated;

-- سجل التدقيق
drop trigger if exists audit_messages on public.messages;
create trigger audit_messages after insert or update on public.messages for each row execute function public.audit();
```

### الجزء 6 من ٧ — ترقية الصفوف (promote_grades)
```sql
-- ============================================================
-- الجزء ٦ من ٧: ترقية الصفوف (app_meta + promote_grades) — للمالك فقط
-- الأول→الثاني، الثاني→الثالث، الثالث→مؤرشف (مش محذوف). مرة لكل "سنة" (p_label) إلا بـ p_force.
-- ============================================================
create table if not exists public.app_meta(key text primary key, value text, updated_at timestamptz not null default now());
alter table public.app_meta enable row level security;
revoke all on public.app_meta from public, anon, authenticated;
grant select on public.app_meta to authenticated;
drop policy if exists app_meta_owner_read on public.app_meta;
create policy app_meta_owner_read on public.app_meta for select to authenticated using (public.my_role()='owner');

create or replace function public.promote_grades(p_label text, p_force boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb;
begin
  if public.my_role()<>'owner' then raise exception 'forbidden' using errcode='42501'; end if;
  if coalesce(btrim(p_label),'')='' then raise exception 'label' using errcode='P0001'; end if;
  if not p_force and exists(select 1 from public.app_meta where key='last_promotion' and value=p_label) then raise exception 'already' using errcode='P0001'; end if;
  select jsonb_build_object('first',count(*) filter (where grade='الأول الإعدادي'),'second',count(*) filter (where grade='الثاني الإعدادي'),'archived',count(*) filter (where grade='الثالث الإعدادي'))
    into r from public.profiles where deleted_at is null and archived_at is null;
  update public.profiles set
    grade=case grade when 'الأول الإعدادي' then 'الثاني الإعدادي' when 'الثاني الإعدادي' then 'الثالث الإعدادي' else grade end,
    archived_at=case when grade='الثالث الإعدادي' then now() else archived_at end
  where deleted_at is null and archived_at is null;
  insert into public.app_meta(key,value) values('last_promotion',p_label) on conflict (key) do update set value=excluded.value, updated_at=now();
  insert into public.audit_log(action,table_name,row_id,detail) values('promote','profiles',null,r||jsonb_build_object('label',p_label,'email',auth.jwt()->>'email','role','owner'));
  return r;
end $$;
revoke all on function public.promote_grades(text,boolean) from public, anon;
grant execute on function public.promote_grades(text,boolean) to authenticated;
```

### الجزء 7 من ٧ — الحضور + الافتقاد
```sql
-- ============================================================
-- الجزء ٧ من ٧: الحضور (meetings + attendance) + الافتقاد (followups + followup_staff)
-- ============================================================
-- اجتماع لكل (تاريخ + صف) وحالة كل مخدوم (حاضر/غائب/بعذر). الطاقم يقرأ ويكتب.
create table if not exists public.meetings(
  id uuid primary key default gen_random_uuid(),
  held_on date not null, grade text not null,
  title text check (title is null or char_length(title)<=120),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  unique(held_on,grade)
);
create table if not exists public.attendance(
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('present','absent','excused')),
  noted_by uuid default auth.uid(), updated_at timestamptz not null default now(),
  primary key(meeting_id,profile_id)
);
create index if not exists attendance_profile_idx on public.attendance(profile_id);
-- سجل الافتقاد: مين افتقد مين وامتى (ملاحظة اختيارية)
create table if not exists public.followups(
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  by uuid default auth.uid(), note text check (note is null or char_length(note)<=500),
  created_at timestamptz not null default now()
);
create index if not exists followups_profile_idx on public.followups(profile_id,created_at desc);

-- RLS + صلاحيات (الطاقم فقط؛ لا وصول للمخدوم)
alter table public.meetings enable row level security;
alter table public.attendance enable row level security;
alter table public.followups enable row level security;
revoke all on public.meetings, public.attendance, public.followups from public, anon, authenticated;
grant select, insert, update, delete on public.meetings, public.attendance to authenticated;
grant select, insert on public.followups to authenticated;
drop policy if exists meetings_staff_rw on public.meetings;
drop policy if exists meetings_staff_del on public.meetings;
drop policy if exists attendance_staff_rw on public.attendance;
drop policy if exists followups_staff_read on public.followups;
drop policy if exists followups_staff_ins on public.followups;
create policy meetings_staff_rw on public.meetings for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy attendance_staff_rw on public.attendance for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy followups_staff_read on public.followups for select to authenticated using (public.is_staff());
create policy followups_staff_ins on public.followups for insert to authenticated with check (public.is_staff() and by=auth.uid());

-- عرض الافتقاد: آخر دخول/امتحان/حضور + غياب آخر ٣٠ يوم + آخر افتقاد (للطاقم؛ المؤرشف والمحذوف مستبعدان)
drop view if exists public.followup_staff;
create view public.followup_staff with (security_invoker=true) as
select p.id,p.name,p.grade,p.phone,p.guardian_name,p.guardian_phone,p.created_at,
  (select max(s.started_at) from public.sessions s where s.profile_id=p.id) as last_seen,
  (select max(r.attempted_at) from public.results r where r.profile_id=p.id) as last_exam,
  (select max(m.held_on) from public.attendance a join public.meetings m on m.id=a.meeting_id where a.profile_id=p.id and a.status='present') as last_present,
  (select count(*) from public.attendance a join public.meetings m on m.id=a.meeting_id where a.profile_id=p.id and a.status='absent' and m.held_on>=current_date-30) as absent_30,
  (select max(f.created_at) from public.followups f where f.profile_id=p.id) as last_followup
from public.profiles p where p.deleted_at is null and p.archived_at is null and public.is_staff();
revoke all on public.followup_staff from public, anon; grant select on public.followup_staff to authenticated;
```


### د) حساب المالك (مالك واحد فقط)
1. Authentication → Users → **Add user → Create new user**: إيميل حقيقي + كلمة سر + فعّل **Auto Confirm User**.
2. SQL Editor (غيّر الإيميل):
```sql
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"role":"owner"}'::jsonb where email = 'OWNER_EMAIL';
```
3. بعدها الخدام والكهنة بتضيفهم من التطبيق نفسه: **👥 حسابات الطاقم** (مفيش حاجة تانية في SQL).

---

## ٢) Edge Functions (التلاتة)
Supabase → **Edge Functions → Deploy a new function → Via Editor**. لكل دالة: الاسم بالظبط، امسح الكود التجريبي، الصق الكود، **Deploy**.
بعد النشر، لكل دالة: **Settings (Details) ← Verify JWT = OFF** (الدوال بتتحقق من الـJWT والدور بنفسها).

### ١) restore — استرجاع حساب المخدوم
الاسم بالظبط: `restore`
```ts
// Edge Function "restore": استرجاع حساب المخدوم على جهاز جديد (اسم + كود).
// الطبقات: (١) حدّ IP هنا  (٢) حدّ auth_uid داخل restore_profile_svc (٥ فشل/ساعة)  (٣) كود ٨ أحرف.
// الدالة تتحقق من JWT المخدوم (المجهول) وتأخذ منه الـuid، ثم تنادي RPC بصلاحية service_role.
// المتغيرات SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY يوفّرها Supabase تلقائياً. اختيارية: RESTORE_IP_SALT, MAX_IP_FAILS, ALLOWED_ORIGIN.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SALT = Deno.env.get("RESTORE_IP_SALT") ?? SVC;
// الحد لكل IP: أعلى من حدّ المخدوم الواحد لأن شبكة الكنيسة/الواي فاي قد تشاركها عشرات الأجهزة بنفس الـIP
const MAX_IP_FAILS = Number(Deno.env.get("MAX_IP_FAILS") ?? "30");
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*"; // الأفضل: https://USERNAME.github.io

const admin = createClient(SB_URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// نفس تطبيع الواجهة (js/auth.js) حتى لا نعتمد على العميل
function normDigits(s: string) {
  return s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660))
          .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x6F0));
}
function normName(s: string) {
  return s.trim().replace(/\s+/g, " ").replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();
}
const normCode = (s: string) => normDigits(s).replace(/\s/g, "").toUpperCase();

function clientIp(req: Request): string {
  // cf-connecting-ip يضعه Cloudflare أمام Supabase ولا يستطيع العميل تزويره؛ ثم x-real-ip؛ ثم أول عنصر في x-forwarded-for
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
    ((req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown");
}
async function sha256Hex(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method" });

  // 1) من هو المستخدم؟ نتحقق من الـJWT عند Supabase Auth (لا نثق بالـclaims دون تحقق)
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "auth" });
  const { data: u, error: uerr } = await admin.auth.getUser(jwt);
  if (uerr || !u?.user) return json(401, { error: "auth" });

  // 2) مدخلات
  let body: { name?: unknown; code?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json(413, { error: "size" });
    body = JSON.parse(raw);
  } catch { return json(400, { error: "bad" }); }
  if (typeof body.name !== "string" || typeof body.code !== "string") return json(400, { error: "bad" });
  const name = normName(body.name), code = normCode(body.code);
  if (name.length < 2 || name.length > 120 || (code.length !== 6 && code.length !== 8)) return json(404, { error: "mismatch" });

  // 3) حدّ الـIP (فشل فقط يُحسب؛ النجاح لا يُعاقَب)
  const ipHash = await sha256Hex(SALT + "|" + clientIp(req));
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error: cerr } = await admin.from("restore_ip_attempts").select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash).eq("succeeded", false).gte("at", since);
  if (cerr) return json(503, { error: "unavailable" });
  if ((count ?? 0) >= MAX_IP_FAILS) return json(429, { error: "locked" });

  // 4) الاسترجاع (حدّ auth_uid ٥ فشل/ساعة داخل الدالة)
  const { data, error } = await admin.rpc("restore_profile_svc", { p_uid: u.user.id, p_name: name, p_code: code });
  if (error) return json(503, { error: "unavailable" });
  if (data && (data as { locked?: boolean }).locked) return json(429, { error: "locked" });

  const ok = !!data && !!(data as { id?: string }).id;
  await admin.from("restore_ip_attempts").insert({ ip_hash: ipHash, succeeded: ok });
  if (Math.random() < 0.02) await admin.from("restore_ip_attempts").delete().lt("at", new Date(Date.now() - 7 * 86400_000).toISOString());

  return ok ? json(200, { profile: data }) : json(404, { error: "mismatch" });
});
```

### ٢) reset-password — إعادة ضبط كلمة سر خادم/كاهن (للمالك)
الاسم بالظبط: `reset-password`
```ts
// Edge Function "reset-password" (v9.2): المالك فقط يعيد ضبط كلمة سر حساب خادم بكلمة مؤقتة.
// الأمان: (١) نتحقق من الـJWT عند Supabase Auth ونقرأ الدور من app_metadata (لا نثق بالواجهة)  (٢) المالك فقط
// (٣) الهدف لازم يكون حساب خادم أو كاهن (لا المالك ولا أي حساب آخر)  (٤) service_role داخل الدالة فقط، ولا يظهر في أي رد.
// المدخل: { email, new_password }  — المخرج: { ok:true } أو { error }. كلمة السر لا تُرجَع ولا تُسجَّل.
// ⚠️ انشرها بـ Verify JWT = OFF (زي restore) عشان طلب الـCORS preflight؛ التحقق من الـJWT بيحصل هنا يدوياً.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const admin = createClient(SB_URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method" });

  // 1) من الطالب؟ لازم يكون المالك (الدور من app_metadata بعد تحقق Supabase من الـJWT)
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "auth" });
  const { data: caller, error: cerr } = await admin.auth.getUser(jwt);
  if (cerr || !caller?.user) return json(401, { error: "auth" });
  if (caller.user.is_anonymous || caller.user.app_metadata?.role !== "owner") return json(403, { error: "forbidden" });

  // 2) المدخلات
  let body: { email?: unknown; new_password?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json(413, { error: "size" });
    body = JSON.parse(raw);
  } catch { return json(400, { error: "bad" }); }
  if (typeof body.email !== "string" || typeof body.new_password !== "string") return json(400, { error: "bad" });
  const email = body.email.trim().toLowerCase(), pw = body.new_password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json(400, { error: "bad" });
  if (pw.length < 8 || pw.length > 72) return json(400, { error: "weak" }); // 72 = حد bcrypt

  // 3) نجد الحساب بالإيميل (عدد الخدام صغير؛ نقلّب الصفحات بحدّ أقصى)
  let target: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null = null;
  for (let page = 1; page <= 10 && !target; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return json(503, { error: "unavailable" });
    target = data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
    if (data.users.length < 1000) break;
  }
  if (!target) return json(404, { error: "not_found" });
  if (!["servant", "priest"].includes(String(target.app_metadata?.role))) return json(403, { error: "not_allowed" }); // خادم أو كاهن فقط؛ لا المالك ولا حسابات بلا دور

  // 4) تعديل كلمة السر + علَم "غيّرها عند أول دخول" (يقرأه التطبيق من الـJWT)
  const { error: uerr } = await admin.auth.admin.updateUserById(target.id, {
    password: pw,
    user_metadata: { ...(target.user_metadata ?? {}), must_change_password: true },
  });
  if (uerr) return json(uerr.status === 422 ? 400 : 503, { error: uerr.status === 422 ? "weak" : "unavailable" });
  return json(200, { ok: true });
});
```

### ٣) staff-admin — إدارة حسابات الطاقم (للمالك)
الاسم بالظبط: `staff-admin`
```ts
// Edge Function "staff-admin" (v9.6): المالك فقط يدير حسابات الطاقم (خادم/كاهن) من اللوحة.
// الإجراءات: list | create {email,password,role} | set_role {id,role} | set_active {id,active}
// الأمان: (١) JWT يُتحقق منه عند Supabase Auth والدور من app_metadata  (٢) المالك فقط  (٣) لا نلمس المالك ولا حسابات بلا دور ولا نفسه
// (٤) الأدوار المسموحة servant/priest فقط (لا إنشاء مالك)  (٥) service_role داخل الدالة فقط ولا يظهر في أي رد  (٦) كل إجراء يُسجَّل في audit_log.
// ⚠️ انشرها بـ Verify JWT = OFF (زي restore/reset-password)؛ التحقق يتم هنا يدوياً.
// ملاحظة: تغيير الدور يسري عند تجديد الـJWT (حتى ساعة). الإيقاف (ban) يمنع تجديد الجلسة وتسجيل الدخول.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const admin = createClient(SB_URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const ROLES = ["servant", "priest"];
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type U = any;

async function allUsers(): Promise<U[]> {
  const out: U[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return out;
}
const pub = (u: U) => ({ id: u.id, email: u.email, role: u.app_metadata?.role ?? null, banned: !!u.banned_until && new Date(u.banned_until) > new Date(), last_sign_in_at: u.last_sign_in_at ?? null, created_at: u.created_at });
const log = (caller: U, action: string, target: string, detail: Record<string, unknown>) =>
  admin.from("audit_log").insert({ actor: caller.id, action: "staff_" + action, table_name: "staff", row_id: target, detail: { role: "owner", email: caller.email, ...detail } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method" });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "auth" });
  const { data: c, error: ce } = await admin.auth.getUser(jwt);
  if (ce || !c?.user) return json(401, { error: "auth" });
  const caller = c.user;
  if (caller.is_anonymous || caller.app_metadata?.role !== "owner") return json(403, { error: "forbidden" });

  let b: Record<string, unknown>;
  try { const raw = await req.text(); if (raw.length > 2048) return json(413, { error: "size" }); b = JSON.parse(raw); } catch { return json(400, { error: "bad" }); }
  const action = String(b.action ?? "");

  try {
    if (action === "list") {
      const users = (await allUsers()).filter((u) => !u.is_anonymous && ["owner", ...ROLES].includes(u.app_metadata?.role));
      return json(200, { ok: true, users: users.map(pub) });
    }
    if (action === "create") {
      const email = String(b.email ?? "").trim().toLowerCase(), pw = String(b.password ?? ""), role = String(b.role ?? "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || !ROLES.includes(role)) return json(400, { error: "bad" });
      if (pw.length < 8 || pw.length > 72) return json(400, { error: "weak" });
      const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: { role }, user_metadata: { must_change_password: true } });
      if (error) return json(/already|exists|registered/i.test(error.message) ? 409 : 400, { error: /already|exists|registered/i.test(error.message) ? "exists" : "bad" });
      await log(caller, "create", data.user.id, { target: email, new_role: role });
      return json(200, { ok: true });
    }
    if (action === "set_role" || action === "set_active") {
      const id = String(b.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id) || id === caller.id) return json(400, { error: "bad" });
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data?.user) return json(404, { error: "not_found" });
      const t = data.user;
      if (t.is_anonymous || !ROLES.includes(String(t.app_metadata?.role))) return json(403, { error: "not_allowed" }); // لا المالك ولا حسابات أخرى
      if (action === "set_role") {
        const role = String(b.role ?? ""); if (!ROLES.includes(role)) return json(400, { error: "bad" });
        const { error: e } = await admin.auth.admin.updateUserById(id, { app_metadata: { ...(t.app_metadata ?? {}), role } });
        if (e) return json(503, { error: "unavailable" });
        await log(caller, "set_role", id, { target: t.email, from: t.app_metadata?.role, new_role: role });
      } else {
        const active = b.active === true;
        const { error: e } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
        if (e) return json(503, { error: "unavailable" });
        await log(caller, active ? "enable" : "disable", id, { target: t.email });
      }
      return json(200, { ok: true });
    }
    return json(400, { error: "bad" });
  } catch { return json(503, { error: "unavailable" }); }
});
```


### Secrets (مرة واحدة لكل المشروع)
Edge Functions → **Secrets** (أو Project Settings → Edge Functions):
| الاسم | القيمة |
|---|---|
| `ALLOWED_ORIGIN` | سيبه فاضي دلوقتي، هتحطه في القسم ٥ بعد ما تعرف رابط الموقع |
| `RESTORE_IP_SALT` | اختياري: أي نص عشوائي طويل |

`SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` بيتوفروا تلقائياً. **ما تحطش service_role في أي ملف في التطبيق أو الريبو.**

---

## ٣) إعداد التطبيق
- لو **نفس المشروع** `lawha-test`: `js/config.js` جاهز، **ما تلمسوش**.
- لو **مشروع جديد**: افتح `js/config.js` وغيّر سطرين فقط: `SUPABASE_URL` و`SUPABASE_ANON_KEY` (الـanon فقط، مش service_role).
- اختياري: خطوط Tajawal وملفي PDF مش مرفقين (انظر `fonts/README.txt` و`lib/README.txt`). بدونهم التطبيق يشتغل بخط النظام، لكن **تصدير PDF من لوحة التميز** محتاج `lib/html2canvas.min.js` و`lib/jspdf.umd.min.js`.

---

## ٤) النشر

### الخيار الأول (الموصى به): GitHub Pages
**١. أنشئ Repo**
- github.com → New repository → الاسم مثلاً `khedma-edady` (حروف صغيرة) → **Public** (الـPages المجانية محتاجة Public؛ مفيش أسرار في الملفات: الـanon key عام بطبيعته).

**٢. ارفع الملفات** (محتاج الملفات **مفكوكة** بنفس شكل المجلدات؛ فك `PWA_v9.8.zip` الأول)
- **من كمبيوتر (الأسهل):** Repo → Add file → **Upload files** → اسحب **كل محتويات** المجلد المفكوك (مش المجلد نفسه) → Commit.
- **من الموبايل:** المتصفح مابيرفعش مجلدات. استخدم تطبيق Git: **Working Copy** (آيفون) أو **Termux** (أندرويد). أوامر Termux/Git:
```bash
cd /sdcard/khedma-edady          # المجلد المفكوك
git init && git add -A && git commit -m "v9.8"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO-NAME.git
git push -u origin main
```
- لازم تتأكد إن `index.html` و`sw.js` و`manifest.json` في **جذر** الريبو (مش جوه مجلد فرعي) وإن مجلد `.github` و`.nojekyll` اترفعوا.

**٣. فعّل Pages**
- Repo → **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
- استنى ١–٣ دقايق. الرابط: `https://USERNAME.github.io/REPO-NAME/`

**٤. (اختياري) keepalive** عشان Supabase المجاني ما يتوقفش: Repo → Settings → Secrets and variables → Actions → New secret: `SUPABASE_URL` و`SUPABASE_ANON_KEY`.

**٥. التحديثات بعد كده:** عدّل الملفات، **غيّر `VERSION` في `sw.js`** (مثلاً `v9.9`)، Commit. الأجهزة بتشوف شريط "تحديث" (GitHub Pages ممكن يتأخر ~١٠ دقايق).

### الخيار البديل: Netlify
- app.netlify.com → Add new site → **Deploy manually** → اسحب المجلد المفكوك (أو اربط الريبو). الرابط `https://اسم-موقعك.netlify.app`.
- نفس الملفات ونفس `sw.js`. القسم ٥ بالرابط ده.

---

## ٥) ALLOWED_ORIGIN (مهم جداً: من غيره الاسترجاع وإعادة الضبط وحسابات الطاقم يفشلوا بخطأ CORS)
Supabase → Edge Functions → Secrets → عدّل `ALLOWED_ORIGIN`:

| الاستضافة | القيمة |
|---|---|
| **GitHub Pages** | `https://USERNAME.github.io` ← **من غير** `/REPO-NAME` ومن غير `/` في الآخر (الـOrigin هو الدومين بس) |
| Netlify | `https://اسم-موقعك.netlify.app` |
| القديم | `https://sweet-liger-f6bd22.netlify.app` ← **بطل يشتغل** بعد التغيير |

- القيمة لازم **أصغر حروف** وبالظبط زي ما المتصفح بيعرضها.
- الدوال بتقبل **Origin واحد** فقط. لو بتختبر على موقعين، غيّر القيمة بين اختبار وآخر.
- بعد التعديل: **أعد نشر** الدوال التلاتة (Deploy) لو الـSecret ما اتحدّثش لوحده.

---

## ٦) الاختبار من الصفر
1. افتح الرابط ← شاشة دخول: بريد + كلمة سر + دخول + "نسيت كلمة السر؟" + أو + "حساب جديد" و"عندي كود" (مفيش كلمة خادم/مالك/مخدوم).
2. ادخل بحساب **المالك** ← بيفتح "لوحة المالك".
3. 👥 حسابات الطاقم ← أضف **خادم** و**كاهن** بكلمات مؤقتة (التليفون بتبعتها يدوياً). كل واحد يدخل ويغيّر كلمته.
4. **حساب جديد** (جهاز/نافذة خاصة): سجّل مخدوم (التليفون مطلوب، الإيميل وولي الأمر اختياري) واحفظ الكود. جرّب "عندي كود" بعد مسح البيانات.
5. المخدوم يحل امتحان ← "📤 إرسال النتيجة" ← تظهر في لوحة التميز عند الخادم.
6. الكاهن يبعت رسالة للكل (عاجل + تثبيت) ← تظهر عند المخدوم بإطار ذهبي، والكاهن يشوف "قرأها X من Y".
7. 🗓️ الحضور ثم 🤝 الافتقاد. "نسيت كلمة السر" من شاشة الدخول ← تظهر في 🔑 الطلبات عند المالك (Badge) ← موافقة.
8. 🧰 أدوات المالك: نسخة احتياطية JSON/CSV. (الترقية على بيانات تجريبية فقط.)

---

## مشاكل شائعة
| العَرَض | الحل |
|---|---|
| خطأ CORS / "Failed to fetch" في الاسترجاع أو الطلبات أو حسابات الطاقم | `ALLOWED_ORIGIN` غلط (فيه `/REPO` أو `/` أو حروف كبيرة) ← صحّحه وأعد نشر الدوال |
| `relation ... does not exist` | جزء SQL اتنفّذ قبل اللي قبله ← شغّل الأجزاء بالترتيب |
| 404 على GitHub Pages | الريبو مش Public، أو Pages مش متفعّلة على `main/(root)`، أو الملفات جوه مجلد فرعي |
| التطبيق ما اتحدّثش | غيّر `VERSION` في `sw.js` وارفع، ثم أغلق التطبيق وافتحه (أو امسح بيانات الموقع) |
| `Edge Function not found` / `nofn` | اسم الدالة غلط أو ما اتنشرتش |
| 401/403 من الدوال | Verify JWT لازم OFF، وأعد تسجيل الدخول بحساب المالك |
| تغيير دور حساب ما ظهرش | يسري عند تجديد الجلسة (حتى ساعة) أو الدخول من جديد |

> **تنبيه صريح:** لم أقدر أشغّل SQL أو الدوال أو أجرّب التطبيق في متصفح في أي مرحلة (فحصت syntax وتركيب SQL ومسارات النشر فقط). نفّذ الاختبار فوق بالترتيب، ولو ظهر خطأ في أي جزء ابعتلي نصه وهصلحه.
