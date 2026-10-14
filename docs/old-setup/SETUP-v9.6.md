# SETUP-v9.6 — ترقية الصفوف + الافتقاد + الحضور + حسابات الطاقم + النسخة الاحتياطية

الباقي زي v9.5. التصميم ما اتلمسش. تبويبات جديدة في القائمة (حسب الدور).

## الجديد
| الميزة | مين يشوفها | فين |
|---|---|---|
| **🤝 الافتقاد** | خادم/كاهن/مالك | قائمة المحتاجين اتصال (مش بيدخل / غاب مرتين+ في ٣٠ يوم / مش بيحل امتحانات) + واتساب (المخدوم وولي الأمر) + اتصال + «✓ تم الافتقاد» مع ملاحظة. نص الواتساب قابل للتعديل. |
| **🗓️ الحضور** | خادم/كاهن/مالك | تسجيل حضور (تاريخ + صف): حاضر/غائب/بعذر + «الكل حاضر». تقرير نسبة الحضور لكل مخدوم (٣٠/٩٠ يوم/الكل). الغياب بيغذّي الافتقاد. |
| **👥 حسابات الطاقم** | مالك | إضافة خادم/كاهن (كلمة مؤقتة بتتغيّر أول دخول)، تغيير الدور، إيقاف/تفعيل. عبر Edge Function `staff-admin`. |
| **🧰 أدوات المالك** | مالك | **نسخة احتياطية** (JSON لكل الجداول + CSV للمخدومين والنتائج) و**ترقية الصفوف**. |
| **مؤرشف** | مالك (في لوحة المالك) | فلتر جديد. خريجو الثالث بيتأرشفوا (مش بيتمسحوا) ويختفوا من الطاقم والمراسلات، ويمكن إلغاء الأرشفة. |

**ترقية الصفوف**: الأول←الثاني، الثاني←الثالث، الثالث←مؤرشف. بتتنفذ مرة لكل «سنة دراسية» (بتكتبها)، وتحتاج كتابة كلمة «ترقية» وتأكيد، وبتحذّرك لو مفيش نسخة احتياطية في آخر ٧ أيام. **خد نسخة احتياطية قبلها.**

## ١) SQL — قطع صغيرة (بالترتيب، كل قطعة لوحدها)
### أ) الأرشفة (تعديل على الموجود)
**أ١ — عمود الأرشفة**
```sql
alter table public.profiles add column if not exists archived_at timestamptz;
```
**أ٢ — صلاحيات الطاقم تستبعد المؤرشف**
```sql
drop policy if exists profiles_staff_read on public.profiles; drop policy if exists profiles_update_staff on public.profiles;
create policy profiles_staff_read on public.profiles for select to authenticated using (public.is_staff() and deleted_at is null and archived_at is null);
create policy profiles_update_staff on public.profiles for update to authenticated using (public.is_staff() and deleted_at is null and archived_at is null) with check (public.is_staff());
```
**أ٣ — عرض نتائج لوحة التميز**
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
where p.deleted_at is null and p.archived_at is null and public.is_staff();
revoke all on public.results_first_staff from public, anon;
grant select on public.results_first_staff to authenticated;
```
**أ٤ — حارس profiles (الأرشفة للمالك فقط؛ الصق كاملة)**
```sql
create or replace function public.profiles_guard() returns trigger language plpgsql as $$
declare r text:=public.my_role();
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if new.id is distinct from old.id or new.auth_uid is distinct from old.auth_uid or new.created_at is distinct from old.created_at then raise exception 'immutable column' using errcode='42501'; end if;
  if new.code is distinct from old.code and r<>'owner' then raise exception 'immutable column' using errcode='42501'; end if;
  if r not in ('servant','priest','owner') then
    if new.deleted_at is distinct from old.deleted_at or new.archived_at is distinct from old.archived_at or new.name is distinct from old.name or new.name_norm is distinct from old.name_norm or new.gender is distinct from old.gender then raise exception 'immutable column' using errcode='42501'; end if;
  elsif r in ('servant','priest') and (new.deleted_at is distinct from old.deleted_at or new.archived_at is distinct from old.archived_at) then raise exception 'immutable column' using errcode='42501'; end if;
  if r in ('servant','priest','owner') and new.name is distinct from old.name then new.name_norm:=public.norm_name(new.name); end if;
  return new;
end $$;
```
**أ٥ — دالة الإرسال (تستبعد المؤرشف)**
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
    insert into public.message_targets(message_id,profile_id) select mid,p.id from public.profiles p where p.id=any(p_targets) and p.deleted_at is null and p.archived_at is null;
    get diagnostics n=row_count; if n=0 then raise exception 'targets' using errcode='P0001'; end if;
  end if;
  return mid;
end $$;
```
**أ٦ — رسائل المخدوم + تعليم مقروء**
```sql
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
```
**أ٧ — عرض الرسائل للطاقم**
```sql
drop view if exists public.messages_staff;
create view public.messages_staff with (security_invoker=true) as
select m.id,m.sender,m.sender_role,m.title,m.body,m.urgent,m.pinned,m.audience,m.grade,m.expires_at,m.deleted_at,m.created_at,
  case m.audience when 'all' then (select count(*) from public.profiles p where p.deleted_at is null and p.archived_at is null)
    when 'grade' then (select count(*) from public.profiles p where p.deleted_at is null and p.archived_at is null and p.grade=m.grade)
    else (select count(*) from public.message_targets t where t.message_id=m.id) end as recipients,
  (select count(*) from public.message_reads r where r.message_id=m.id) as reads
from public.messages m where public.is_staff();
revoke all on public.messages_staff from public, anon; grant select on public.messages_staff to authenticated;
```
### ب) الترقية
**ب١ — جدول الإعدادات + دالة الترقية (الصق كاملة)**
```sql
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
### ج) الحضور والافتقاد
**ج١ — الجداول**
```sql
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
-- (3) سجل الافتقاد: مين افتقد مين وامتى (ملاحظة اختيارية)
create table if not exists public.followups(
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  by uuid default auth.uid(), note text check (note is null or char_length(note)<=500),
  created_at timestamptz not null default now()
);
create index if not exists followups_profile_idx on public.followups(profile_id,created_at desc);
```
**ج٢ — RLS والصلاحيات**
```sql
alter table public.meetings enable row level security;
alter table public.attendance enable row level security;
alter table public.followups enable row level security;
revoke all on public.meetings, public.attendance, public.followups from public, anon, authenticated;
grant select, insert, update, delete on public.meetings, public.attendance to authenticated;
grant select, insert on public.followups to authenticated;
drop policy if exists meetings_staff_rw on public.meetings; drop policy if exists meetings_staff_del on public.meetings;
drop policy if exists attendance_staff_rw on public.attendance; drop policy if exists followups_staff_read on public.followups; drop policy if exists followups_staff_ins on public.followups;
create policy meetings_staff_rw on public.meetings for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy attendance_staff_rw on public.attendance for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy followups_staff_read on public.followups for select to authenticated using (public.is_staff());
create policy followups_staff_ins on public.followups for insert to authenticated with check (public.is_staff() and by=auth.uid());
```
**ج٣ — عرض الافتقاد**
```sql
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

## ٢) انشر Edge Function جديدة `staff-admin`
1. **Edge Functions → Deploy a new function (Via Editor)** والاسم `staff-admin` بالظبط.
2. الصق `supabase/functions/staff-admin/index.ts` ← **Deploy**.
3. **Verify JWT = OFF** (زي restore وreset-password؛ الدالة بتتحقق بنفسها).
4. نفس الـSecrets (`ALLOWED_ORIGIN` موجود). **service_role مش بيتحط في أي ملف في التطبيق.**

الدالة بترفض: أي حد مش المالك، ولمس المالك أو نفسك أو حسابات بلا دور، وإنشاء مالك جديد (الأدوار المسموحة خادم/كاهن فقط). كل إجراء بيتسجّل في سجل التدقيق.

## ٣) انشر التطبيق
ارفع `PWA_v9.6` (`sw.js` = `v9.6`).

## ٤) الاختبار
1. **أرشفة**: ابدأ بنسخة احتياطية (🧰 أدوات المالك ← تنزيل كل البيانات).
2. **حضور** (خادم): 🗓️ الحضور ← اختر صف ← «الكل حاضر» ثم غيّر واحد لغائب ← حفظ. افتح نفس التاريخ تاني ← العلامات ظاهرة ومتعدّلة. التقرير يظهر النسب.
3. **افتقاد**: بعد تسجيل غياب مرتين لمخدوم (اجتماعين مختلفين خلال ٣٠ يوم) يظهر في 🤝 الافتقاد بسبب «غاب ٢ مرات». زر واتساب يفتح محادثة بالنص. «✓ تم الافتقاد» ← يختفي (لو «إخفاء اللي اتفتقد» مفعّل) ويتسجّل.
4. **حسابات الطاقم** (مالك): 👥 ← إضافة خادم بكلمة مؤقتة ← ابعتها ← يدخل ويُطلب منه تغييرها. جرّب تغيير الدور (يسري خلال ساعة) والإيقاف (يمنعه من تجديد الجلسة والدخول).
5. **ترقية** (على بيانات تجريبية!): 🧰 ← اكتب «ترقية» ← تنفيذ ← الأول بقوا ثاني… والثالث ظهروا في «مؤرشف» وغابوا عن الخادم. حاول تنفيذها تاني لنفس السنة ← يرفض (إلا بتأكيد إضافي).
6. **نسخة احتياطية**: ملف JSON فيه كل الجداول، وCSV بيفتح في Excel بالعربي.

## ملاحظات مهمة
- **الخصوصية (اقتراح ١ اللي ما اتنفذش)**: قائمة الافتقاد بتعرض أرقام المخدومين وأولياء الأمور للخادم والكاهن والمالك زي باقي بيانات الطاقم. لو عايز نقصر الأرقام على الكاهن/المالك أو على صف الخادم، قولي.
- **النسخة الاحتياطية** بتتنزّل على جهازك فقط؛ الاستعادة منها لسه يدوية (من Dashboard/SQL). لو عايز أداة استعادة قولي.
- بعد الترقية، المخدوم اللي جهازه عليه الصف القديم محلياً: الرسائل بتتبعت حسب الصف في السيرفر (فصح)، لكن اسم الصف المعروض عنده في صفحته ممكن يفضل القديم لحد ما تتحدّث بياناته.
- تغيير دور حساب بيسري عند تجديد الـJWT (حتى ساعة). الإيقاف بيمنع التجديد والدخول.
- لم أقدر أشغّل SQL أو الـEdge Function أو أجرّب التطبيق في متصفح هنا؛ الـJS اتفحص syntax فقط. جرّب الخطوات بالترتيب (والترقية على بيانات تجريبية الأول) وابعتلي أي خطأ.
