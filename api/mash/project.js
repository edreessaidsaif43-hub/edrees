import { readMashProject, updateMashProject } from "../../enjazy/api/_lib/store.js";

function ownerTokenValid(req) {
  const password = process.env.MASH_OWNER_PASSWORD || "owner12345";
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token === password;
}

function sendStoreError(res, out, fallback = "Request failed.") {
  if (out.error === "db_not_configured") {
    res.status(500).json({
      error: "db_not_configured",
      message: "Mash database is not configured. Add MASH_DATABASE_URL. Set MASH_DATABASE_URL in the deployment environment.",
    });
    return;
  }
  res.status(out.error === "not_found" ? 404 : 502).json({
    error: out.error || "upstream_failed",
    message: out.message || fallback,
  });
}

export default async function handler(req, res) {
  const id = String(req.query?.id || "");
  if (!id) {
    res.status(400).json({ error: "invalid_payload", message: "Missing id." });
    return;
  }

  if (req.method === "GET") {
    const out = await readMashProject(id);
    if (out.error) return sendStoreError(res, out, "Could not load project.");
    res.status(200).json(out.data);
    return;
  }

  if (req.method === "PATCH") {
    if (!ownerTokenValid(req)) {
      res.status(403).json({ error: "owner_only" });
      return;
    }
    const out = await updateMashProject(id, req.body || {});
    if (out.error) return sendStoreError(res, out, "Could not update project.");
    res.status(200).json(out.data);
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}

