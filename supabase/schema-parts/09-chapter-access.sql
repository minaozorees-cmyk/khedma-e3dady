-- ============================================================
-- خدمة إعدادي — schema v9.21 — الجزء ٩: مواعيد فتح/قفل الإصحاحات + أكواد الفتح
-- آمن للتكرار. شغّله مرة في Supabase → SQL Editor (بعد الأجزاء ١–٨).
-- chapter_access : الكل يقرأ (المخدوم محتاج يعرف ميعاد الفتح). الكتابة: المالك فقط.
-- chapter_codes  : المالك يكتب، الطاقم (خادم/كاهن/مالك) يقرأ. المخدوم لا يقرأه نهائياً.
-- redeem_chapter_code : المخدوم يكتب الكود فتتحقق الدالة (بدون ما يقرا الجدول). حدّ ١٠ محاولات فاشلة/ساعة لكل هوية.
-- server_now          : ساعة السيرفر (المخدوم بيقارن بيها لو في نت).
-- ============================================================

-- ===== المواعيد (صف واحد لكل إصحاح؛ غياب الصف = مفتوح دايماً) =====
create table if not exists public.chapter_access(
  book_id     text not null check (char_length(book_id) between 1 and 60),
  chapter_num int  not null check (chapter_num between 1 and 999),
  opens_at    timestamptz,
  closes_at   timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (book_id, chapter_num),
  check (opens_at is not null or closes_at is not null),
  check (opens_at is null or closes_at is null or closes_at > opens_at)
);
alter table public.chapter_access enable row level security;
drop policy if exists chapter_access_read  on public.chapter_access;
drop policy if exists chapter_access_owner on public.chapter_access;
create policy chapter_access_read  on public.chapter_access for select to anon, authenticated using (true);
create policy chapter_access_owner on public.chapter_access for all    to authenticated using (public.my_role()='owner') with check (public.my_role()='owner');
revoke all on public.chapter_access from anon, authenticated;
grant select on public.chapter_access to anon, authenticated;
grant insert, update, delete on public.chapter_access to authenticated;

-- ===== الأكواد (كود واحد لكل إصحاح، صالح لأي مخدوم) =====
create table if not exists public.chapter_codes(
  book_id     text not null check (char_length(book_id) between 1 and 60),
  chapter_num int  not null check (chapter_num between 1 and 999),
  code        text not null check (code ~ '^[A-Z0-9]{8}$'),
  created_at  timestamptz not null default now(),
  primary key (book_id, chapter_num)
);
alter table public.chapter_codes enable row level security;
drop policy if exists chapter_codes_staff_read on public.chapter_codes;
drop policy if exists chapter_codes_owner      on public.chapter_codes;
create policy chapter_codes_staff_read on public.chapter_codes for select to authenticated using (public.is_staff());
create policy chapter_codes_owner      on public.chapter_codes for all    to authenticated using (public.my_role()='owner') with check (public.my_role()='owner');
revoke all on public.chapter_codes from anon, authenticated;
grant select, insert, update, delete on public.chapter_codes to authenticated;

-- ===== محاولات الكود الغلط (للحدّ فقط؛ لا أحد يقراها من التطبيق) =====
create table if not exists public.code_tries(
  id  bigserial primary key,
  uid uuid not null,
  at  timestamptz not null default now()
);
create index if not exists code_tries_uid_at on public.code_tries(uid, at);
alter table public.code_tries enable row level security;
revoke all on public.code_tries from anon, authenticated;

-- ===== التحقق من الكود: 'ok' | 'bad' | 'locked' =====
create or replace function public.redeem_chapter_code(p_book text, p_chapter int, p_code text) returns text
language plpgsql security definer set search_path=public as $$
declare u uuid := auth.uid(); c text := upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9]','','g'));
begin
  if u is null then raise exception 'forbidden' using errcode='42501'; end if;
  delete from public.code_tries where at < now() - interval '1 day';
  if (select count(*) from public.code_tries where uid=u and at > now() - interval '1 hour') >= 10 then return 'locked'; end if;
  if exists (select 1 from public.chapter_codes where book_id=p_book and chapter_num=p_chapter and code=c) then return 'ok'; end if;
  insert into public.code_tries(uid) values (u);
  return 'bad';
end $$;
revoke all on function public.redeem_chapter_code(text,int,text) from public, anon;
grant execute on function public.redeem_chapter_code(text,int,text) to authenticated;

-- ===== ساعة السيرفر =====
create or replace function public.server_now() returns timestamptz language sql stable as $$ select now() $$;
grant execute on function public.server_now() to anon, authenticated;
