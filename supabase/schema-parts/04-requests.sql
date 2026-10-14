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
