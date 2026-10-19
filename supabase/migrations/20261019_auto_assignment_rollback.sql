-- ============================================================
-- v9.42 — التراجع: يوقف الإسناد التلقائي ويحذف القواعد.
-- الإسنادات اللي اتعملت فعلاً بتفضل (امسحها يدوياً من شاشة «إسناد المخدومين» لو عايز).
-- ============================================================
drop trigger if exists auto_assign_ins on public.profiles;
drop trigger if exists auto_assign_upd on public.profiles;
drop function if exists public.auto_assign_profile();
drop table if exists public.staff_assignment_rules;
