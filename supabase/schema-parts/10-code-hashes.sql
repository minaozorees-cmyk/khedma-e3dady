-- ============================================================
-- خدمة إعدادي — schema v9.22 — الجزء ١٠: بصمات (hash) أكواد الإصحاحات للفحص المحلي أوفلاين
-- آمن للتكرار. شغّله مرة في Supabase → SQL Editor (بعد الجزء ٩).
-- chapter_code_hashes: يتحدّث تلقائياً (trigger) من chapter_codes. المخدوم (حتى anon) يقراه ليفحص الكود على جهازه.
--   الكود الخام يفضل في chapter_codes (الطاقم يقرا، المالك يكتب) ولا يخرج منه.
--   البصمة = SHA-256 لـ: salt|book_id|chapter_num|CODE  (CODE حروف كبيرة بدون شرطة). salt جديد عشوائي مع كل تغيير للكود.
-- الإلغاء/التغيير بيوصل الأجهزة عند أول فتح أونلاين (التطبيق بيستبدل القايمة كلها).
-- ============================================================

alter table public.chapter_codes add column if not exists updated_at timestamptz not null default now();

create table if not exists public.chapter_code_hashes(
  book_id     text not null check (char_length(book_id) between 1 and 60),
  chapter_num int  not null check (chapter_num between 1 and 999),
  salt        text not null,
  hash        text not null check (hash ~ '^[0-9a-f]{64}$'),
  updated_at  timestamptz not null default now(),
  primary key (book_id, chapter_num)
);
alter table public.chapter_code_hashes enable row level security;
drop policy if exists chapter_code_hashes_read on public.chapter_code_hashes;
create policy chapter_code_hashes_read on public.chapter_code_hashes for select to anon, authenticated using (true);
revoke all on public.chapter_code_hashes from anon, authenticated;
grant select on public.chapter_code_hashes to anon, authenticated;   -- لا كتابة من التطبيق: الـtrigger (security definer) هو الوحيد

-- updated_at على الأكواد
create or replace function public.chapter_codes_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists chapter_codes_touch on public.chapter_codes;
create trigger chapter_codes_touch before insert or update on public.chapter_codes for each row execute function public.chapter_codes_touch();

-- مزامنة البصمات
create or replace function public.chapter_codes_hash_sync() returns trigger language plpgsql security definer set search_path=public as $$
declare s text;
begin
  if tg_op in ('DELETE','UPDATE') then
    if tg_op='DELETE' or old.book_id is distinct from new.book_id or old.chapter_num is distinct from new.chapter_num then
      delete from public.chapter_code_hashes where book_id=old.book_id and chapter_num=old.chapter_num;
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    s := replace(gen_random_uuid()::text,'-','');
    insert into public.chapter_code_hashes(book_id,chapter_num,salt,hash,updated_at)
    values (new.book_id,new.chapter_num,s, encode(sha256(convert_to(s||'|'||new.book_id||'|'||new.chapter_num::text||'|'||new.code,'UTF8')),'hex'), now())
    on conflict (book_id,chapter_num) do update set salt=excluded.salt, hash=excluded.hash, updated_at=excluded.updated_at;
  end if;
  return null;
end $$;
drop trigger if exists chapter_codes_hash_sync on public.chapter_codes;
create trigger chapter_codes_hash_sync after insert or update or delete on public.chapter_codes for each row execute function public.chapter_codes_hash_sync();

-- الأكواد الموجودة قبل التشغيل: ولّد لها بصمات (الأكواد نفسها ما بتتغيّر)
insert into public.chapter_code_hashes(book_id,chapter_num,salt,hash,updated_at)
select c.book_id,c.chapter_num,x.s, encode(sha256(convert_to(x.s||'|'||c.book_id||'|'||c.chapter_num::text||'|'||c.code,'UTF8')),'hex'), now()
from public.chapter_codes c cross join lateral (select replace(gen_random_uuid()::text,'-','') as s) x
on conflict (book_id,chapter_num) do update set salt=excluded.salt, hash=excluded.hash, updated_at=excluded.updated_at;
