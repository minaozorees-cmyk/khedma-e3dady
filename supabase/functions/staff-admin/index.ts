// Edge Function "staff-admin" (v9.6): المالك فقط يدير حسابات الطاقم (خادم/كاهن) من اللوحة.
// الإجراءات: list | create {email,password,role} | set_role {id,role} | set_active {id,active}
// الأمان: (١) JWT يُتحقق منه عند Supabase Auth والدور من app_metadata  (٢) المالك فقط  (٣) لا نلمس المالك ولا حسابات بلا دور ولا نفسه
// (٤) الأدوار المسموحة servant/priest فقط (لا إنشاء مالك)  (٥) service_role داخل الدالة فقط ولا يظهر في أي رد  (٦) كل إجراء يُسجَّل في audit_log.
// ⚠️ انشرها بـ Verify JWT = OFF (زي restore/reset-password)؛ التحقق يتم هنا يدوياً.
// ملاحظة: تغيير الدور يسري عند تجديد الـJWT (حتى ساعة). الإيقاف (ban) يمنع تجديد الجلسة وتسجيل الدخول.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const admin = createClient(SB_URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const ROLES = ["servant", "priest"];
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type U = any;

async function allUsers(): Promise<U[]> {
  const out: U[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return out;
}
const pub = (u: U) => ({ id: u.id, email: u.email, role: u.app_metadata?.role ?? null, banned: !!u.banned_until && new Date(u.banned_until) > new Date(), last_sign_in_at: u.last_sign_in_at ?? null, created_at: u.created_at });
const log = (caller: U, action: string, target: string, detail: Record<string, unknown>) =>
  admin.from("audit_log").insert({ actor: caller.id, action: "staff_" + action, table_name: "staff", row_id: target, detail: { role: "owner", email: caller.email, ...detail } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method" });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "auth" });
  const { data: c, error: ce } = await admin.auth.getUser(jwt);
  if (ce || !c?.user) return json(401, { error: "auth" });
  const caller = c.user;
  if (caller.is_anonymous || caller.app_metadata?.role !== "owner") return json(403, { error: "forbidden" });

  let b: Record<string, unknown>;
  try { const raw = await req.text(); if (raw.length > 2048) return json(413, { error: "size" }); b = JSON.parse(raw); } catch { return json(400, { error: "bad" }); }
  const action = String(b.action ?? "");

  try {
    if (action === "list") {
      const users = (await allUsers()).filter((u) => !u.is_anonymous && ["owner", ...ROLES].includes(u.app_metadata?.role));
      return json(200, { ok: true, users: users.map(pub) });
    }
    if (action === "create") {
      const email = String(b.email ?? "").trim().toLowerCase(), pw = String(b.password ?? ""), role = String(b.role ?? "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || !ROLES.includes(role)) return json(400, { error: "bad" });
      if (pw.length < 8 || pw.length > 72) return json(400, { error: "weak" });
      const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: { role }, user_metadata: { must_change_password: true } });
      if (error) return json(/already|exists|registered/i.test(error.message) ? 409 : 400, { error: /already|exists|registered/i.test(error.message) ? "exists" : "bad" });
      await log(caller, "create", data.user.id, { target: email, new_role: role });
      return json(200, { ok: true });
    }
    if (action === "set_role" || action === "set_active") {
      const id = String(b.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id) || id === caller.id) return json(400, { error: "bad" });
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data?.user) return json(404, { error: "not_found" });
      const t = data.user;
      if (t.is_anonymous || !ROLES.includes(String(t.app_metadata?.role))) return json(403, { error: "not_allowed" }); // لا المالك ولا حسابات أخرى
      if (action === "set_role") {
        const role = String(b.role ?? ""); if (!ROLES.includes(role)) return json(400, { error: "bad" });
        const { error: e } = await admin.auth.admin.updateUserById(id, { app_metadata: { ...(t.app_metadata ?? {}), role } });
        if (e) return json(503, { error: "unavailable" });
        await log(caller, "set_role", id, { target: t.email, from: t.app_metadata?.role, new_role: role });
      } else {
        const active = b.active === true;
        const { error: e } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
        if (e) return json(503, { error: "unavailable" });
        await log(caller, active ? "enable" : "disable", id, { target: t.email });
      }
      return json(200, { ok: true });
    }
    return json(400, { error: "bad" });
  } catch { return json(503, { error: "unavailable" }); }
});
