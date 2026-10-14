// Edge Function "reset-password" (v9.2): المالك فقط يعيد ضبط كلمة سر حساب خادم بكلمة مؤقتة.
// الأمان: (١) نتحقق من الـJWT عند Supabase Auth ونقرأ الدور من app_metadata (لا نثق بالواجهة)  (٢) المالك فقط
// (٣) الهدف لازم يكون حساب خادم أو كاهن (لا المالك ولا أي حساب آخر)  (٤) service_role داخل الدالة فقط، ولا يظهر في أي رد.
// المدخل: { email, new_password }  — المخرج: { ok:true } أو { error }. كلمة السر لا تُرجَع ولا تُسجَّل.
// ⚠️ انشرها بـ Verify JWT = OFF (زي restore) عشان طلب الـCORS preflight؛ التحقق من الـJWT بيحصل هنا يدوياً.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const admin = createClient(SB_URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method" });

  // 1) من الطالب؟ لازم يكون المالك (الدور من app_metadata بعد تحقق Supabase من الـJWT)
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "auth" });
  const { data: caller, error: cerr } = await admin.auth.getUser(jwt);
  if (cerr || !caller?.user) return json(401, { error: "auth" });
  if (caller.user.is_anonymous || caller.user.app_metadata?.role !== "owner") return json(403, { error: "forbidden" });

  // 2) المدخلات
  let body: { email?: unknown; new_password?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json(413, { error: "size" });
    body = JSON.parse(raw);
  } catch { return json(400, { error: "bad" }); }
  if (typeof body.email !== "string" || typeof body.new_password !== "string") return json(400, { error: "bad" });
  const email = body.email.trim().toLowerCase(), pw = body.new_password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json(400, { error: "bad" });
  if (pw.length < 8 || pw.length > 72) return json(400, { error: "weak" }); // 72 = حد bcrypt

  // 3) نجد الحساب بالإيميل (عدد الخدام صغير؛ نقلّب الصفحات بحدّ أقصى)
  let target: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null = null;
  for (let page = 1; page <= 10 && !target; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return json(503, { error: "unavailable" });
    target = data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
    if (data.users.length < 1000) break;
  }
  if (!target) return json(404, { error: "not_found" });
  if (!["servant", "priest"].includes(String(target.app_metadata?.role))) return json(403, { error: "not_allowed" }); // خادم أو كاهن فقط؛ لا المالك ولا حسابات بلا دور

  // 4) تعديل كلمة السر + علَم "غيّرها عند أول دخول" (يقرأه التطبيق من الـJWT)
  const { error: uerr } = await admin.auth.admin.updateUserById(target.id, {
    password: pw,
    user_metadata: { ...(target.user_metadata ?? {}), must_change_password: true },
  });
  if (uerr) return json(uerr.status === 422 ? 400 : 503, { error: uerr.status === 422 ? "weak" : "unavailable" });
  return json(200, { ok: true });
});
