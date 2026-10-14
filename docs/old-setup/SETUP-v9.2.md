# SETUP-v9.2 — دخول موحّد + "نسيت كلمة السر" + طلبات للمالك

الباقي زي v9. التصميم ما اتلمسش. نظام المخدوم زي ما هو (اسم + كود، anonymous auth) غير إن **الإيميل واسم/رقم ولي الأمر بقوا اختياريين**.

## ما اتغيّر
| الملف | التغيير |
|---|---|
| `js/login.js` (**جديد**، بدل `staff-login.js`) | شاشة الدخول الموحّدة + شاشة "نسيت كلمة السر". بلا أي ذكر لأدوار. |
| `js/router.js` | الدور من الـJWT فقط. بعد الدخول: `servant → لوحة التميز (pages/servant.html)`، `owner → لوحة المالك`. Badge `(٣)` على "لوحة المالك". الزر العلوي بقى "دخول/خروج" بس. |
| `js/auth.js`, `js/register.js`, `js/sync.js` | ولي الأمر + الإيميل اختياريين. `submitRequest` / `resetPassword` / `changePassword`. |
| `js/req-watch.js` (**جديد**) | polling كل ٦٠ ثانية للمالك: يحدّث الـbadge + إشعار صغير في الأعلى + صوت خفيف (اختياري). |
| `modules/owner/members.js` | تاب **🔑 الطلبات** (موافقة/رفض + كلمة مؤقتة) + زر **🔄 كود جديد** + ولي الأمر اختياري. |
| `modules/account/index.js` (**جديد**) | تغيير كلمة السر (إجباري بعد الكلمة المؤقتة، واختياري من القائمة 🔐). |
| `modules/registry.json`, `sw.js` | تبويب `account` + `VERSION='v9.2'` وملفات الكاش الجديدة. |
| `supabase/schema.sql` | جدول `requests` + تعديل `profiles_guard` (الكود يغيّره المالك فقط). |
| `supabase/functions/reset-password/index.ts` (**جديد**) | Edge Function. |

`index.html` ما اتغيّرش (الزر العلوي بيتكتب من `router.js`).

## ١) schema.sql — قطع صغيرة (انسخ كل قطعة وشغّلها لوحدها في SQL Editor)
> الملف الكامل `supabase/schema.sql` فيه كل حاجة ولسه آمن للتكرار، لو تحب تشغّله مرة واحدة من اللابتوب. القطع دي هي قسم v9.2 بس (في آخر الملف).

**قطعة ١ — الجدول**
```sql
create table if not exists public.requests(id uuid primary key default gen_random_uuid(),type text not null check (type in ('password_reset','new_account','other')),requester_name text check (requester_name is null or char_length(requester_name)<=120),requester_contact text check (requester_contact is null or char_length(requester_contact)<=200),message text check (message is null or char_length(message)<=1000),status text not null default 'pending' check (status in ('pending','approved','rejected','done')),handled_by uuid,handled_at timestamptz,meta jsonb default '{}'::jsonb,created_at timestamptz not null default now());
create index if not exists requests_status_idx on public.requests(status,created_at desc);
```
**قطعة ٢ — تفعيل RLS والصلاحيات**
```sql
alter table public.requests enable row level security; revoke all on public.requests from public, anon, authenticated;
grant insert on public.requests to anon, authenticated; grant select, update on public.requests to authenticated;
```
**قطعة ٣ — سياسة الإدخال (أي حد، بشروط)**
```sql
drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests for insert to anon, authenticated with check (status='pending' and handled_by is null and handled_at is null and meta='{}'::jsonb and char_length(coalesce(requester_contact,''))>=3);
```
**قطعة ٤ — القراءة والتعديل للمالك فقط**
```sql
drop policy if exists requests_owner_read on public.requests; drop policy if exists requests_owner_update on public.requests;
create policy requests_owner_read on public.requests for select to authenticated using (public.my_role()='owner'); create policy requests_owner_update on public.requests for update to authenticated using (public.my_role()='owner') with check (public.my_role()='owner');
```
**قطعة ٥ — منع الـspam (دالة)**
```sql
create or replace function public.requests_limit() returns trigger language plpgsql security definer set search_path=public as $$
begin
if exists(select 1 from public.requests where status='pending' and type=new.type and lower(requester_contact)=lower(new.requester_contact)) then raise exception 'duplicate' using errcode='P0001'; end if;
if (select count(*) from public.requests where status='pending')>=200 then raise exception 'full' using errcode='P0001'; end if;
return new; end $$;
```
**قطعة ٦ — ربط دالة الـspam**
```sql
drop trigger if exists requests_limit on public.requests;
create trigger requests_limit before insert on public.requests for each row execute function public.requests_limit();
```
**قطعة ٧ — ختم المعالجة (مين/امتى) تلقائياً**
```sql
create or replace function public.requests_stamp() returns trigger language plpgsql as $$
begin if new.status is distinct from old.status then new.handled_by:=auth.uid(); new.handled_at:=now(); end if; return new; end $$;
```
**قطعة ٨ — ربط الختم**
```sql
drop trigger if exists requests_stamp on public.requests;
create trigger requests_stamp before update on public.requests for each row execute function public.requests_stamp();
```
**قطعة ٩ — زر "كود جديد": الكود يغيّره المالك فقط (الوحيدة الطويلة نسبياً؛ الصقها كاملة)**
```sql
create or replace function public.profiles_guard() returns trigger language plpgsql as $$
declare r text:=public.my_role();
begin
if current_user not in ('authenticated','anon') then return new; end if;
if new.id is distinct from old.id or new.auth_uid is distinct from old.auth_uid or new.created_at is distinct from old.created_at then raise exception 'immutable column' using errcode='42501'; end if;
if new.code is distinct from old.code and r<>'owner' then raise exception 'immutable column' using errcode='42501'; end if;
if r not in ('servant','owner') then
if new.deleted_at is distinct from old.deleted_at or new.name is distinct from old.name or new.name_norm is distinct from old.name_norm or new.gender is distinct from old.gender then raise exception 'immutable column' using errcode='42501'; end if;
elsif r='servant' and new.deleted_at is distinct from old.deleted_at then raise exception 'immutable column' using errcode='42501'; end if;
if r in ('servant','owner') and new.name is distinct from old.name then new.name_norm:=public.norm_name(new.name); end if;
return new; end $$;
```
> قطعة ٩ محتاجة `norm_name()` من v9 (موجودة لو شغّلت schema v9).

## ٢) نشر Edge Function `reset-password` (من الـDashboard، نفس طريقة restore)
1. **Edge Functions → Deploy a new function (Via Editor)** والاسم: `reset-password` بالظبط.
2. امسح الكود التجريبي والصق محتوى `supabase/functions/reset-password/index.ts` كاملاً → **Deploy**.
3. **Details / Settings** للدالة ← **Verify JWT = OFF** (زي restore؛ الدالة بتتحقق من الـJWT والدور بنفسها).
4. الـSecrets: `ALLOWED_ORIGIN` موجود من restore (نفس الرابط). `SUPABASE_URL` و`SERVICE_ROLE_KEY` تلقائيين. **لا تحط service_role في أي ملف في التطبيق.**

الدالة بترفض: أي حد مش المالك (403)، أي حساب غير الخادم (المالك مايتغيّرش من هنا)، وكلمة سر أقل من ٨ أحرف. ومابترجّعش كلمة السر ولا أي مفتاح في الرد.

## ٣) انشر التطبيق
ارفع `PWA_v9.2` على Netlify. افتح التطبيق مرتين (أول مرة يحمّل النسخة الجديدة `v9.2`، التانية تشتغل بيها) أو اضغط "تحديث" في الشريط.

## ٤) الاختبار
1. **شاشة الدخول** (على جهاز فيه حساب أو من نافذة خاصة): بريد + كلمة سر + دخول + "نسيت كلمة السر؟" + فاصل "أو" + "حساب جديد" و"عندي كود". مفيش أي ذكر لدور.
2. **دخول المالك** (owner@test.com) ← يفتح "لوحة المالك" مباشرة. **دخول خادم** ← يفتح لوحة التميز.
3. **حساب جديد** ← الإيميل واسم/رقم ولي الأمر اختياريين (سيبهم فاضيين وسجّل). **عندي كود** ← يفتح تاب الاسترجاع.
4. **نسيت كلمة السر**: اكتب إيميل الخادم ← إرسال ← تظهر "تم إرسال طلبك". ابعت نفس الإيميل تاني ← نفس الرسالة (طلب واحد معلّق بس).
5. **المالك**: بعد ≤٦٠ ثانية يظهر `(١)` جنب "لوحة المالك" في القائمة، وإشعار 🔔 في الأعلى (اضغط عليه يفتح تاب 🔑 الطلبات). فعّل "صوت تنبيه" لو عايز.
6. **موافقة**: اضغط موافقة ← اكتب الإيميل (بيتملا لوحده لو كان إيميل) + "توليد" لكلمة مؤقتة ← تنفيذ ← تظهر الكلمة ← ابعتها للخادم. الطلب يتحول "تم". **رفض** ← "مرفوض".
7. **الخادم**: يدخل بالكلمة المؤقتة ← يطلب منه تغيير كلمة السر فوراً ← يغيّرها ← يدخل عادي. (اختياري بعدها من 🔐 كلمة السر).
8. **🔄 كود جديد**: من تاب المخدومين ← يظهر الكود الجديد مرة واحدة.
9. **أوفلاين**: افصل النت ← التطبيق والمخدوم يشتغلوا. الطلبات/الدخول يقولوا "مفيش اتصال بالنت".
10. **RLS**: بدون دخول (anon) من Console: `select` على `requests` يرجّع فاضي، و`update` مرفوض.

## ملاحظات مهمة
- **الدخول بإيميل حقيقي** للخادم/المالك (مفيش اسم مستخدم).
- لو غيّرت كود مخدوم ومعاه جلسة شغالة على جهازه، جهازه الحالي يكمل عادي؛ الكود الجديد يتطلب بس عند الاسترجاع على جهاز جديد.
- كلمة سر المالك نفسه لو اتنسيت: من **Supabase Dashboard → Authentication → Users**، مش من التطبيق.
- الجلسات المفتوحة للخادم قبل إعادة الضبط تفضل لحد ما تنتهي؛ لو الحساب متخاف عليه، اعمله Sign out من الـDashboard.
- الـpolling كل ٦٠ ثانية بيشتغل بس والتطبيق ظاهر على الشاشة (مش في الخلفية).
- لم أقدر أشغّل SQL أو الدالة هنا (مفيش Postgres/Supabase في البيئة)؛ الـJS اتفحص syntax فقط. جرّب الخطوات فوق، ولو ظهر خطأ ابعتهولي.
