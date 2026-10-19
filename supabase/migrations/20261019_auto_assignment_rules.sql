-- ============================================================
-- خدمة إعدادي — v9.42 — الإسناد التلقائي للمخدومين الجدد (قواعد ثابتة)
-- آمن للتكرار. شغّله مرة واحدة في Supabase → SQL Editor (بعد migration الإسناد 20261018).
-- ⚠️ خد نسخة احتياطية قبل التشغيل. التراجع: 20261019_auto_assignment_rollback.sql
--
-- staff_assignment_rules: قاعدة = (خادم + صف + نوع). المالك فقط يقرأ/يكتب.
-- auto_assign_profile  : عند إضافة مخدوم (INSERT)، أو تغيير صفه/نوعه (UPDATE)، يُسنَد لكل خادم عنده قاعدة مطابقة.
--   • لو أكثر من خادم لنفس الصف والنوع: يُسنَد لكلهم.
--   • لا يحذف أي إسناد قديم أبداً (حتى لو غيّر المخدوم صفه).
--   • يتجاهل الملفات المحذوفة ناعماً أو المؤرشفة.
-- ============================================================

create table if not exists public.staff_assignment_rules(
  id         bigserial primary key,
  staff_uid  uuid not null references auth.users(id) on delete cascade,
  grade      text not null check (char_length(grade) between 1 and 60),
  gender     text not null check (char_length(gender) between 1 and 20),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (staff_uid, grade, gender)
);
create index if not exists staff_assignment_rules_match on public.staff_assignment_rules(grade, gender);

alter table public.staff_assignment_rules enable row level security;
revoke all on public.staff_assignment_rules from public, anon, authenticated;
grant select, insert, delete on public.staff_assignment_rules to authenticated;
grant usage, select on sequence public.staff_assignment_rules_id_seq to authenticated;
drop policy if exists staff_assignment_rules_owner on public.staff_assignment_rules;
create policy staff_assignment_rules_owner on public.staff_assignment_rules
  for all to authenticated using (public.my_role()='owner') with check (public.my_role()='owner');

create or replace function public.auto_assign_profile() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.deleted_at is not null or new.archived_at is not null then return new; end if;
  insert into public.staff_profile_assignments(staff_uid, profile_id, assigned_by)
    select r.staff_uid, new.id, null
    from public.staff_assignment_rules r
    where r.grade = new.grade and r.gender = new.gender
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.auto_assign_profile() from public, anon, authenticated;

drop trigger if exists auto_assign_ins on public.profiles;
create trigger auto_assign_ins after insert on public.profiles
  for each row execute function public.auto_assign_profile();

drop trigger if exists auto_assign_upd on public.profiles;
create trigger auto_assign_upd after update of grade, gender on public.profiles
  for each row when (old.grade is distinct from new.grade or old.gender is distinct from new.gender)
  execute function public.auto_assign_profile();
