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
