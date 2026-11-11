import { loginTeacher } from "../_lib/store.js";
import { clearTeacherSession, isTeacherSessionOrigin, readTeacherSession, setTeacherSession } from "../_lib/teacher-session.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "GET") {
    try {
      const session = await readTeacherSession(req, res);
      if (session) res.status(200).json({ authenticated: true, ...session });
      else res.status(401).json({ authenticated: false });
    } catch {
      res.status(503).json({ error: "session_unavailable" });
    }
    return;
  }
  if (req.method === "DELETE") {
    if (!isTeacherSessionOrigin(req)) {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }
    try {
      await clearTeacherSession(req, res);
      res.status(200).json({ ok: true });
    } catch {
      res.status(503).json({ error: "session_unavailable" });
    }
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const payload = req.body || {};
  const out = await loginTeacher(payload);

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
      out.error === "invalid_credentials" || out.error === "not_found" ? 401 : 502;
    res.status(status).json({ error: out.error, message: out.message || "Login failed." });
    return;
  }

  try {
    await setTeacherSession(req, res, out.data.userId, String(payload.password || ""));
  } catch {
    res.status(503).json({ error: "session_unavailable", message: "تعذّر حفظ جلسة الدخول. حاول مجددًا." });
    return;
  }
  res.status(200).json({
    userId: out.data.userId,
    profile: out.data.profile || {},
    entries: Array.isArray(out.data.entries) ? out.data.entries : [],
  });
}
