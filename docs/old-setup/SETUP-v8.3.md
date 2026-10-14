# SETUP-v8.3 — نشر Edge Function `restore` من Supabase Dashboard (بدون CLI)

الدالة موجودة في `supabase/functions/restore/index.ts` (نفس ملف v8.2 بدون تغيير) وهي اللي بتخلّي استرجاع حساب المخدوم (اسم + كود) يشتغل. من غيرها الاسترجاع بيرجع "غير متاح".

## قبل ما تبدأ
- `supabase/schema.sql` لازم يكون اتشغّل على المشروع (فيه جدولي `restore_attempts` و`restore_ip_attempts` والدالة `restore_profile_svc`).
- جهّز رابط الموقع اللي هتختبر منه (مثلاً رابط Netlify).

## ١) الـ Secrets
**Edge Functions → Secrets** (أو "Manage secrets") وأضف:

| الاسم | القيمة |
|---|---|
| `RESTORE_IP_SALT` | نص عشوائي طويل (٣٢ بايت فأكثر). مثال تولّده من Console المتصفح: `crypto.randomUUID()+crypto.randomUUID()` |
| `ALLOWED_ORIGIN` | **أصل الموقع فقط**: `https://xxxx.netlify.app` — بدون `/` في الآخر وبدون أي مسار |
| `MAX_IP_FAILS` | `30` |

- `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` بيوفّرهم Supabase تلقائياً. **لا تضيفهم ولا تحط الـ service_role في أي ملف من التطبيق.**
- `ALLOWED_ORIGIN` قيمة واحدة بس. لو الموقع على GitHub Pages فالقيمة `https://USERNAME.github.io` (من غير اسم الـ repo). وعند الانتقال من Netlify للإنتاج غيّرها.
- لو نسيت `ALLOWED_ORIGIN` الدالة بتقبل أي موقع (`*`). لا تسيبها كده في الإنتاج.
- احفظ `RESTORE_IP_SALT` في مكان آمن: تغييرها بيصفّر عدّاد الـ IP الحالي (مش مشكلة، بس يخلّي الحدود تبدأ من الصفر).

## ٢) إنشاء الدالة
1. **Edge Functions** من القائمة الجانبية.
2. **Deploy a new function** (عبر Editor / "Via Editor").
3. الاسم: `restore` بالظبط (التطبيق بينادي `/functions/v1/restore`).
4. امسح الكود التجريبي والصق محتوى `index.ts` كاملاً.
5. **Deploy**.

## ٣) إلغاء Verify JWT
افتح الدالة `restore` ← إعداداتها (Details / Settings) وأطفئ **Verify JWT** (في الواجهات الأحدث اسمها "Verify JWT with legacy secret"). السبب: الدالة بتتحقق من الـ JWT بنفسها عبر `auth.getUser`، ولو التحقق التلقائي شغّال طلب الـ preflight (OPTIONS) من المتصفح بيترفض. لو الإعداد مش ظاهر في واجهتك أو الدالة بترجّع 401 "Invalid JWT" قبل ما تدخل الكود، فده هو السبب.
> ملحوظة: شكل الواجهة بيتغيّر من وقت لآخر، فلو الأسماء مختلفة قليلاً دوّر على نفس الخيار.

## ٤) اختبار
1. افتح التطبيق من `ALLOWED_ORIGIN`. سجّل مخدوم تجريبي (جهاز أ) وسجّل الكود.
2. من جهاز تاني أو نافذة Incognito: استرجاع بالاسم والكود الصحيحين ← لازم يرجّع الحساب.
3. كود غلط ← "بيانات غير مطابقة". ٥ محاولات غلط في ساعة من نفس الجهاز ← "مقفول مؤقتاً".
4. للتشخيص: **Edge Functions → restore → Logs** (وتبويب Invocations).

## أعطال شائعة
| العرض | السبب |
|---|---|
| خطأ CORS في Console | `ALLOWED_ORIGIN` مش مطابقة لأصل الموقع (https، بدون `/` أخيرة، بدون مسار) |
| 401 قبل ما الكود يشتغل | Verify JWT لسه شغّال |
| 404 بدون `mismatch` | الدالة اسمها غير `restore` أو لم تُنشر |
| 503 `unavailable` | `schema.sql` ناقص (`restore_ip_attempts` أو `restore_profile_svc`) |
| 429 `locked` | حدّ المخدوم (٥ فشل/ساعة) أو حدّ الـ IP (`MAX_IP_FAILS`) |

## ما اتغيّر في v8.3
- `sw.js`: `VERSION='v8.3'`. باقي الملفات (بما فيها `config.js` و`index.ts`) كما في v8.2.
- الدالة لم تُختبر على Supabase حقيقي بعد (ولا Deno متاح هنا). تقدر تراجعها: بتتحقق من JWT بـ `auth.getUser`، وتأخذ `p_uid` من الـ JWT لا من الـ body، وتحسب الـ IP من `cf-connecting-ip` (ثم `x-real-ip` و`x-forwarded-for` احتياطي)، وتحدّ ٣٠ فشل/ساعة لكل IP، وتنادي `restore_profile_svc` بـ service_role، وتردّ `{profile}` أو `{error:'mismatch'|'locked'}`.
