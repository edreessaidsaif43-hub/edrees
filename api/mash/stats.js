import { getMashStats } from "../../enjazy/api/_lib/store.js";

function ownerTokenValid(req) {
  const password = process.env.MASH_OWNER_PASSWORD || "owner12345";
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token === password;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!ownerTokenValid(req)) {
    res.status(403).json({ error: "owner_only" });
    return;
  }
  const out = await getMashStats();
  if (out.error === "db_not_configured") {
    res.status(500).json({
      error: "db_not_configured",
      message: "Mash database is not configured. Add MASH_DATABASE_URL. Set MASH_DATABASE_URL in the deployment environment.",
    });
    return;
  }
  if (out.error) {
    res.status(502).json({ error: out.error, message: out.message || "Could not load stats." });
    return;
  }
  res.status(200).json(out.data);
}

