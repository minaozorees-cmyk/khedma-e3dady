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
