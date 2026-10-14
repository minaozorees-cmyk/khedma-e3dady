# SETUP-v9.5 — الرسائل + الكاهن المسؤول

الباقي زي v9.4. التصميم ما اتلمسش. المخدوم بيشوف تبويب جديد **💬 الرسائل**.

## الفكرة (باختصار)
- **صندوق رسائل داخل التطبيق** (مش Push). المخدوم يشوف رسائله في تبويب "الرسائل" مع رقم غير المقروء على القائمة وإشعار صغير لما يفتح التطبيق، وبتتخزّن على جهازه فتشتغل أوفلاين. التطبيق بيتحقق من رسائل جديدة كل دقيقتين وقت ظهوره.
- **من يبعت لمين:**
  | | كل المخدومين | صف معيّن | أسماء محددة | عاجل/تثبيت | إحصائيات القراءة |
  |---|---|---|---|---|---|
  | خادم | ✗ | ✓ | ✓ | ✗ | ✗ |
  | **كاهن** | ✓ | ✓ | ✓ | ✓ | ✓ |
  | مالك | ✓ | ✓ | ✓ | ✓ | ✓ |
- **الكاهن المسؤول** = دور `priest` بصلاحيات الخادم (لوحة التميز + الأسفار + الرسائل + كلمة السر) **ومعاها**: رسائله تظهر للمخدوم بشكل مميز (إطار ذهبي + "⛪ الكاهن المسؤول")، وعاجل 🔴 وتثبيت 📌، وعدد "قرأها X من Y".
- بيانات الاعتراف والقداسات فضلت **محلية على جهاز المخدوم** ومش متاحة لأي دور.
- الأمان الفعلي في السيرفر (RLS + دوال): المخدوم يقرأ رسائله هو بس، الخادم مايقدرش يبعت "للكل" ولا يعمل عاجل حتى لو عدّل الواجهة، وحدّ ٣٠ رسالة/يوم لكل مرسل.

## الملفات
`js/inbox.js` (جديد)، `modules/messages/index.js` + `staff.js` (جديدين)، `js/router.js`، `js/auth.js`، `js/sync.js`، `modules/registry.json`، `modules/owner/members.js` (سجل التدقيق يعرف الرسائل)، `pages/servant.html` (بوابة الدور تقبل الكاهن)، `supabase/schema.sql`، `supabase/functions/reset-password/index.ts` (تقبل الكاهن كهدف)، `sw.js` (`v9.5`).

## ١) SQL — قطع صغيرة (كل قطعة لوحدها بالترتيب)
### أ) الكاهن (تعديل صلاحيات موجودة)
**أ١ — دالة الطاقم**
```sql
create or replace function public.is_staff() returns boolean language sql stable as $$ select public.my_role() in ('servant','priest','owner') $$;
```
**أ٢ — صلاحيات المخدومين للطاقم**
```sql
drop policy if exists profiles_staff_read on public.profiles; drop policy if exists profiles_update_staff on public.profiles;
create policy profiles_staff_read on public.profiles for select to authenticated using (public.is_staff() and deleted_at is null);
create policy profiles_update_staff on public.profiles for update to authenticated using (public.is_staff() and deleted_at is null) with check (public.is_staff());
```
**أ٣ — قراءة الجلسات والنتائج للطاقم**
```sql
do $$ declare t text; begin foreach t in array array['sessions','book_opens','results'] loop execute format('drop policy if exists %I on public.%I',t||'_staff_read',t); execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())',t||'_staff_read',t); end loop; end $$;
```
**أ٤ — عرض نتائج لوحة التميز**
```sql
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
where p.deleted_at is null and public.is_staff();
revoke all on public.results_first_staff from public, anon;
grant select on public.results_first_staff to authenticated;
```
**أ٥ — حارس profiles (يقبل الكاهن؛ الصق كاملة)**
```sql
create or replace function public.profiles_guard() returns trigger language plpgsql as $$
declare r text:=public.my_role();
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if new.id is distinct from old.id or new.auth_uid is distinct from old.auth_uid or new.created_at is distinct from old.created_at then raise exception 'immutable column' using errcode='42501'; end if;
  if new.code is distinct from old.code and r<>'owner' then raise exception 'immutable column' using errcode='42501'; end if;
  if r not in ('servant','priest','owner') then
    if new.deleted_at is distinct from old.deleted_at or new.name is distinct from old.name or new.name_norm is distinct from old.name_norm or new.gender is distinct from old.gender then raise exception 'immutable column' using errcode='42501'; end if;
  elsif r in ('servant','priest') and new.deleted_at is distinct from old.deleted_at then raise exception 'immutable column' using errcode='42501'; end if;
  if r in ('servant','priest','owner') and new.name is distinct from old.name then new.name_norm:=public.norm_name(new.name); end if;
  return new;
end $$;
```
### ب) الرسائل
**ب١ — الجداول**
```sql
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
```
**ب٢ — RLS والصلاحيات والسياسات**
```sql
alter table public.messages enable row level security;
alter table public.message_targets enable row level security;
alter table public.message_reads enable row level security;
revoke all on public.messages, public.message_targets, public.message_reads from public, anon, authenticated;
grant select on public.messages, public.message_targets, public.message_reads to authenticated;
grant update (deleted_at, pinned) on public.messages to authenticated;
drop policy if exists messages_staff_read on public.messages; drop policy if exists messages_update on public.messages;
drop policy if exists message_targets_staff_read on public.message_targets; drop policy if exists message_reads_staff_read on public.message_reads;
create policy messages_staff_read on public.messages for select to authenticated using (public.is_staff());
create policy messages_update on public.messages for update to authenticated using (public.is_staff() and (sender=auth.uid() or public.my_role()='owner')) with check (public.is_staff() and (sender=auth.uid() or public.my_role()='owner'));
create policy message_targets_staff_read on public.message_targets for select to authenticated using (public.is_staff());
create policy message_reads_staff_read on public.message_reads for select to authenticated using (public.is_staff());
```
**ب٣ — حارس التثبيت**
```sql
create or replace function public.messages_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and new.pinned is distinct from old.pinned and public.my_role() not in ('priest','owner') then raise exception 'forbidden' using errcode='42501'; end if;
  return new;
end $$;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before update on public.messages for each row execute function public.messages_guard();
```
**ب٤ — دالة الإرسال**
```sql
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
    insert into public.message_targets(message_id,profile_id) select mid,p.id from public.profiles p where p.id=any(p_targets) and p.deleted_at is null;
    get diagnostics n=row_count; if n=0 then raise exception 'targets' using errcode='P0001'; end if;
  end if;
  return mid;
end $$;
```
**ب٥ — دوال المخدوم (رسائله + تعليم مقروء)**
```sql
create or replace function public.my_messages(p_profile uuid) returns table(id uuid,sender_role text,title text,body text,urgent boolean,pinned boolean,created_at timestamptz,expires_at timestamptz,is_read boolean)
language sql stable security definer set search_path=public as $$
  select m.id,m.sender_role,m.title,m.body,m.urgent,m.pinned,m.created_at,m.expires_at,(r.profile_id is not null)
  from public.messages m
  join public.profiles p on p.id=p_profile and p.auth_uid=auth.uid() and p.deleted_at is null
  left join public.message_reads r on r.message_id=m.id and r.profile_id=p.id
  where m.deleted_at is null and (m.expires_at is null or m.expires_at>now())
    and (m.audience='all' or (m.audience='grade' and m.grade=p.grade) or (m.audience='list' and exists(select 1 from public.message_targets t where t.message_id=m.id and t.profile_id=p.id)))
  order by m.pinned desc, m.created_at desc limit 60
$$;
create or replace function public.mark_read(p_profile uuid,p_ids uuid[]) returns void language sql security definer set search_path=public as $$
  insert into public.message_reads(message_id,profile_id)
  select m.id,p.id from public.messages m join public.profiles p on p.id=p_profile and p.auth_uid=auth.uid() and p.deleted_at is null
  where m.id=any(p_ids) and m.deleted_at is null
    and (m.audience='all' or (m.audience='grade' and m.grade=p.grade) or (m.audience='list' and exists(select 1 from public.message_targets t where t.message_id=m.id and t.profile_id=p.id)))
  on conflict do nothing
$$;
```
**ب٦ — صلاحيات الدوال**
```sql
revoke all on function public.send_message(text,text,boolean,boolean,text,text,timestamptz,uuid[]), public.my_messages(uuid), public.mark_read(uuid,uuid[]) from public, anon;
grant execute on function public.send_message(text,text,boolean,boolean,text,text,timestamptz,uuid[]), public.my_messages(uuid), public.mark_read(uuid,uuid[]) to authenticated;
```
**ب٧ — عرض الطاقم (المستلمون/القراءة)**
```sql
drop view if exists public.messages_staff;
create view public.messages_staff with (security_invoker=true) as
select m.id,m.sender,m.sender_role,m.title,m.body,m.urgent,m.pinned,m.audience,m.grade,m.expires_at,m.deleted_at,m.created_at,
  case m.audience when 'all' then (select count(*) from public.profiles p where p.deleted_at is null)
    when 'grade' then (select count(*) from public.profiles p where p.deleted_at is null and p.grade=m.grade)
    else (select count(*) from public.message_targets t where t.message_id=m.id) end as recipients,
  (select count(*) from public.message_reads r where r.message_id=m.id) as reads
from public.messages m where public.is_staff();
revoke all on public.messages_staff from public, anon; grant select on public.messages_staff to authenticated;
```
**ب٨ — سجل التدقيق**
```sql
drop trigger if exists audit_messages on public.messages;
create trigger audit_messages after insert or update on public.messages for each row execute function public.audit();
```

## ٢) أنشئ حساب الكاهن
Dashboard → Authentication → Users → **Add user** (إيميل حقيقي + كلمة سر + Auto Confirm). بعدين في SQL Editor:
```sql
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"role":"priest"}'::jsonb where email = 'EMAIL_HERE';
```
(غيّر `EMAIL_HERE`). لازم يطلع ويدخل من جديد عشان الدور يوصل للـJWT.

## ٣) أعد نشر Edge Function `reset-password`
الصق `supabase/functions/reset-password/index.ts` الجديد → Deploy (عشان تقبل الكاهن). Verify JWT يفضل OFF.

## ٤) انشر التطبيق
ارفع `PWA_v9.5`. (`sw.js` = `v9.5`.)

## ٥) الاختبار
1. **الكاهن**: يدخل ← لوحة التميز + 💬 الرسائل. اكتب رسالة "كل المخدومين" + عاجل + تثبيت ← تأكيد ← إرسال ← تظهر في "المرسلة" وفيها "قرأها ٠ من N".
2. **المخدوم**: يفتح التطبيق ← بعد دقيقتين كحد أقصى (أو يفتحه من جديد) يظهر إشعار 🔔 ورقم على "الرسائل" ← يفتحها ← الرسالة بإطار ذهبي وتوقيع الكاهن، فوق (مثبتة)، وعليها "جديد" ← يرجع للقائمة والرقم اختفى. بعدها عند الكاهن "قرأها ١ من N".
3. **خادم**: يشوف في "إلى" **صف** و**أسماء محددة** بس (مفيش "كل المخدومين" ولا عاجل/تثبيت). جرّب إرسال لأسماء محددة ← توصل لهم بس.
4. **أوفلاين**: المخدوم يفتح "الرسائل" من غير نت ← آخر رسائل متخزّنة تظهر، ومكتوب "آخر تحديث… (بدون اتصال)".
5. **حذف**: الراسل (أو المالك) يحذف رسالة ← تختفي عند المخدوم بعد التحديث التالي.
6. **سجل التدقيق** للمالك: يظهر فيه إرسال/حذف الرسائل (فلتر "الرسائل").

## ملاحظات
- Push حقيقي (إشعار والتطبيق مقفول) مش مضاف: محتاج مفاتيح VAPID وEdge Function إضافية، وعلى الآيفون التطبيق لازم يكون مثبّت على الشاشة الرئيسية (iOS 16.4+). لو احتجته نعمله كمرحلة منفصلة.
- إحصائيات القراءة والتثبيت مقصورة على الكاهن/المالك: الإرسال والتثبيت **متحكّم فيهم من السيرفر**، أما إخفاء الأرقام عن الخادم فهو في الواجهة بس (الأرقام نفسها ليست بيانات حساسة).
- مفيش ربط بين رسالة وواتساب؛ الرسائل جوه التطبيق بس.
- لم أقدر أشغّل SQL أو أجرّب التطبيق في متصفح هنا؛ الـJS اتفحص syntax فقط. جرّب الخطوات، ولو ظهر خطأ في أي قطعة ابعتهولي.
