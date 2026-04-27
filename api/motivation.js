import {
  findMotivationStudentByCode,
  joinTeacherMotivationClassByCode,
  loadTeacherMotivation,
  saveTeacherMotivation,
} from "../enjazy/api/_lib/store.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const action = String(req.query?.action || "").trim().toLowerCase();
    if (action === "student_by_code") {
      const code = String(req.query?.code || "");
      const out = await findMotivationStudentByCode({ code });

      if (out.error === "db_not_configured") {
        res.status(500).json({
          error: "db_not_configured",
          message:
            "Motivation DB is not configured. Set MOTIVATION_DATABASE_URL (or MOTIVATION_POSTGRES_URL), or ensure DATABASE_URL is set in Vercel.",
        });
        return;
      }
      if (out.error) {
        if (out.error === "not_found") {
          res.status(200).json({
            ok: true,
            found: false,
            code: String(code || "").trim().toUpperCase(),
            classData: null,
            student: null,
          });
          return;
        }
        const status = out.error === "invalid_payload" ? 400 : 502;
        res.status(status).json({ error: out.error, message: out.message || "Lookup failed." });
        return;
      }

      res.status(200).json({
        ok: true,
        found: true,
        code: out?.data?.code || "",
        classData: out?.data?.classData || null,
        student: out?.data?.student || null,
      });
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
    return;
  }

  if (req.method === "POST") {
    const payload = req.body || {};
    const action = String(payload?.action || "").trim().toLowerCase();
    const out = action === "join_class"
      ? await joinTeacherMotivationClassByCode(payload)
      : await saveTeacherMotivation(payload);

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
      res.status(status).json({ error: out.error, message: out.message || "Save failed." });
      return;
    }

    if (action === "join_class") {
      res.status(200).json({
        ok: true,
        classData: out?.data?.classData || null,
      });
      return;
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}
