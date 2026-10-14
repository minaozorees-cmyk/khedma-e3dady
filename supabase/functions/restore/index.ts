// Edge Function "restore": استرجاع حساب المخدوم على جهاز جديد (اسم + كود).
// الطبقات: (١) حدّ IP هنا  (٢) حدّ auth_uid داخل restore_profile_svc (٥ فشل/ساعة)  (٣) كود ٨ أحرف.
// الدالة تتحقق من JWT المخدوم (المجهول) وتأخذ منه الـuid، ثم تنادي RPC بصلاحية service_role.
// المتغيرات SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY يوفّرها Supabase تلقائياً. اختيارية: RESTORE_IP_SALT, MAX_IP_FAILS, ALLOWED_ORIGIN.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SALT = Deno.env.get("RESTORE_IP_SALT") ?? SVC;
// الحد لكل IP: أعلى من حدّ المخدوم الواحد لأن شبكة الكنيسة/الواي فاي قد تشاركها عشرات الأجهزة بنفس الـIP
const MAX_IP_FAILS = Number(Deno.env.get("MAX_IP_FAILS") ?? "30");
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*"; // الأفضل: https://USERNAME.github.io

const admin = createClient(SB_URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// نفس تطبيع الواجهة (js/auth.js) حتى لا نعتمد على العميل
function normDigits(s: string) {
  return s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660))
          .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x6F0));
}
function normName(s: string) {
  return s.trim().replace(/\s+/g, " ").replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();
}
const normCode = (s: string) => normDigits(s).replace(/\s/g, "").toUpperCase();

function clientIp(req: Request): string {
  // cf-connecting-ip يضعه Cloudflare أمام Supabase ولا يستطيع العميل تزويره؛ ثم x-real-ip؛ ثم أول عنصر في x-forwarded-for
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
    ((req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown");
}
async function sha256Hex(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method" });

  // 1) من هو المستخدم؟ نتحقق من الـJWT عند Supabase Auth (لا نثق بالـclaims دون تحقق)
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "auth" });
  const { data: u, error: uerr } = await admin.auth.getUser(jwt);
  if (uerr || !u?.user) return json(401, { error: "auth" });

  // 2) مدخلات
  let body: { name?: unknown; code?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json(413, { error: "size" });
    body = JSON.parse(raw);
  } catch { return json(400, { error: "bad" }); }
  if (typeof body.name !== "string" || typeof body.code !== "string") return json(400, { error: "bad" });
  const name = normName(body.name), code = normCode(body.code);
  if (name.length < 2 || name.length > 120 || (code.length !== 6 && code.length !== 8)) return json(404, { error: "mismatch" });

  // 3) حدّ الـIP (فشل فقط يُحسب؛ النجاح لا يُعاقَب)
  const ipHash = await sha256Hex(SALT + "|" + clientIp(req));
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error: cerr } = await admin.from("restore_ip_attempts").select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash).eq("succeeded", false).gte("at", since);
  if (cerr) return json(503, { error: "unavailable" });
  if ((count ?? 0) >= MAX_IP_FAILS) return json(429, { error: "locked" });

  // 4) الاسترجاع (حدّ auth_uid ٥ فشل/ساعة داخل الدالة)
  const { data, error } = await admin.rpc("restore_profile_svc", { p_uid: u.user.id, p_name: name, p_code: code });
  if (error) return json(503, { error: "unavailable" });
  if (data && (data as { locked?: boolean }).locked) return json(429, { error: "locked" });

  const ok = !!data && !!(data as { id?: string }).id;
  await admin.from("restore_ip_attempts").insert({ ip_hash: ipHash, succeeded: ok });
  if (Math.random() < 0.02) await admin.from("restore_ip_attempts").delete().lt("at", new Date(Date.now() - 7 * 86400_000).toISOString());

  return ok ? json(200, { profile: data }) : json(404, { error: "mismatch" });
});
