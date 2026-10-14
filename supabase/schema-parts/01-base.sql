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
