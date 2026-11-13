import { saveTeacherPortfolio } from "../_lib/store.js";
import { readTeacherSession } from "../_lib/teacher-session.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const payload = req.body || {};
  let session;
  try {
    session = await readTeacherSession(req, res);
  } catch {
    res.status(503).json({ error: "session_unavailable" });
    return;
  }
  if (!session) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  if (String(payload.userId || "") !== session.userId) {
    res.status(403).json({ error: "portfolio_owner_mismatch" });
    return;
  }
  const out = await saveTeacherPortfolio({ ...payload, userId: session.userId });

  if (out.error === "db_not_configured") {
    res.status(500).json({
      error: "db_not_configured",
      message:
        "Neon database is not configured. Set DATABASE_URL (or POSTGRES_URL) in Vercel.",
    });
    return;
  }
  if (out.error) {
    const status = out.error === "not_found" ? 404 : out.error === "invalid_payload" ? 400 : 502;
    res.status(status).json({ error: out.error, message: out.message || "Save failed." });
    return;
  }

  res.status(200).json({ ok: true });
}
