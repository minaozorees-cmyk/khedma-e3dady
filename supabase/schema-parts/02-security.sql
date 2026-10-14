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
