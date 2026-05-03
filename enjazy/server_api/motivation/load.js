import { loadTeacherMotivation } from "../_lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const userId = String(req.query?.userId || "");
  const out = await loadTeacherMotivation(userId);

  if (out.error === "db_not_configured") {
    res.status(500).json({
      error: "db_not_configured",
      message:
        "Motivation DB is not configured. Set MOTIVATION_DATABASE_URL (or MOTIVATION_POSTGRES_URL), or ensure DATABASE_URL is set in Vercel.",
    });
    return;
  }
  if (out.error) {
    const status = out.error === "not_found" ? 404 : 502;
    res.status(status).json({ error: out.error, message: out.message || "Load failed." });
    return;
  }

  res.status(200).json({
    userId: out.data.userId,
    state: out.data.state || null,
  });
}

