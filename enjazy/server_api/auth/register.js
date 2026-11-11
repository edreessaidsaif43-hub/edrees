import { registerTeacher, updateTeacherProfile } from "../_lib/store.js";
import { setTeacherSession } from "../_lib/teacher-session.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const payload = req.body || {};
  const action = String(payload?.action || "").trim().toLowerCase();
  const out = action === "update_profile"
    ? await updateTeacherProfile(payload)
    : await registerTeacher(payload);

  if (out.error === "db_not_configured") {
    res.status(500).json({
      error: "db_not_configured",
      message:
        "Neon database is not configured. Set DATABASE_URL (or POSTGRES_URL) in Vercel.",
    });
    return;
  }
  if (out.error) {
    const status =
      out.error === "user_exists" ? 409
      : out.error === "not_found" ? 404
      : out.error === "invalid_payload" || out.error === "contact_exists" ? 400
      : 502;
    res.status(status).json({ error: out.error, message: out.message || "Register failed." });
    return;
  }

  if (action !== "update_profile") {
    try {
      await setTeacherSession(req, res, out.data.userId, String(payload.password || ""));
    } catch {
      res.status(503).json({ error: "session_unavailable", message: "تم إنشاء الحساب. سجّل الدخول لاستئناف العمل." });
      return;
    }
  }
  res.status(action === "update_profile" ? 200 : 201).json({
    userId: out.data.userId,
    profile: out.data.profile || {},
    entries: Array.isArray(out.data.entries) ? out.data.entries : [],
  });
}
