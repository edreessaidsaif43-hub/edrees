import { createMashProject, listMashProjects } from "../../enjazy/api/_lib/store.js";

function sendStoreError(res, out, fallback = "Request failed.") {
  if (out.error === "db_not_configured") {
    res.status(500).json({
      error: "db_not_configured",
      message: "Mash database is not configured. Add MASH_DATABASE_URL. Set MASH_DATABASE_URL in the deployment environment.",
    });
    return;
  }
  res.status(out.error === "invalid_payload" ? 400 : 502).json({
    error: out.error || "upstream_failed",
    message: out.message || fallback,
  });
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const out = await listMashProjects(String(req.query?.scope || ""));
    if (out.error) return sendStoreError(res, out, "Could not load projects.");
    res.status(200).json(out.data || []);
    return;
  }

  if (req.method === "POST") {
    const out = await createMashProject(req.body || {});
    if (out.error) return sendStoreError(res, out, "Could not create project.");
    res.status(201).json(out.data);
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}

