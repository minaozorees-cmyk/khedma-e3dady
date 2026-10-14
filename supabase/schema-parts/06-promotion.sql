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
