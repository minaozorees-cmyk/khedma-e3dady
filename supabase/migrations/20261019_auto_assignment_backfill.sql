-- ============================================================
-- v9.42 — (اختياري، مرة واحدة) إسناد المخدومين الحاليين الذين بلا أي خادم، حسب القواعد الموجودة.
-- شغّل الأول قسم المعاينة (SELECT) وراجع الرقم، وبعدين شغّل الـINSERT.
-- ما بيلمسش مخدوماً عنده إسناد لأي خادم، وما بيحذف شيئاً.
-- ============================================================

-- ١) معاينة: كام إسناد هيتضاف؟
select count(*) as will_add, count(distinct p.id) as profiles
from public.profiles p
join public.staff_assignment_rules r on r.grade = p.grade and r.gender = p.gender
where p.deleted_at is null and p.archived_at is null
  and not exists (select 1 from public.staff_profile_assignments a where a.profile_id = p.id);

-- ٢) التنفيذ
insert into public.staff_profile_assignments(staff_uid, profile_id, assigned_by)
select r.staff_uid, p.id, null
from public.profiles p
join public.staff_assignment_rules r on r.grade = p.grade and r.gender = p.gender
where p.deleted_at is null and p.archived_at is null
  and not exists (select 1 from public.staff_profile_assignments a where a.profile_id = p.id)
on conflict do nothing;
