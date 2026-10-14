-- ============================================================
-- الجزء ٧ من ٧: الحضور (meetings + attendance) + الافتقاد (followups + followup_staff)
-- ============================================================
-- اجتماع لكل (تاريخ + صف) وحالة كل مخدوم (حاضر/غائب/بعذر). الطاقم يقرأ ويكتب.
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
-- سجل الافتقاد: مين افتقد مين وامتى (ملاحظة اختيارية)
create table if not exists public.followups(
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  by uuid default auth.uid(), note text check (note is null or char_length(note)<=500),
  created_at timestamptz not null default now()
);
create index if not exists followups_profile_idx on public.followups(profile_id,created_at desc);

-- RLS + صلاحيات (الطاقم فقط؛ لا وصول للمخدوم)
alter table public.meetings enable row level security;
alter table public.attendance enable row level security;
alter table public.followups enable row level security;
revoke all on public.meetings, public.attendance, public.followups from public, anon, authenticated;
grant select, insert, update, delete on public.meetings, public.attendance to authenticated;
grant select, insert on public.followups to authenticated;
drop policy if exists meetings_staff_rw on public.meetings;
drop policy if exists meetings_staff_del on public.meetings;
drop policy if exists attendance_staff_rw on public.attendance;
drop policy if exists followups_staff_read on public.followups;
drop policy if exists followups_staff_ins on public.followups;
create policy meetings_staff_rw on public.meetings for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy attendance_staff_rw on public.attendance for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy followups_staff_read on public.followups for select to authenticated using (public.is_staff());
create policy followups_staff_ins on public.followups for insert to authenticated with check (public.is_staff() and by=auth.uid());

-- عرض الافتقاد: آخر دخول/امتحان/حضور + غياب آخر ٣٠ يوم + آخر افتقاد (للطاقم؛ المؤرشف والمحذوف مستبعدان)
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
