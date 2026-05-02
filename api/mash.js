import {
  createMashProject,
  getMashStats,
  listMashProjects,
  readMashProject,
  updateMashProject,
} from "../enjazy/server_api/_lib/store.js";

function send(res, status, payload) {
  res.status(status).json(payload);
}

function ownerTokenValid(req) {
  const password = process.env.MASH_OWNER_PASSWORD || "owner12345";
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token === password;
}

function sendStoreError(res, out, fallback = "Request failed.") {
  if (out.error === "db_not_configured") {
    send(res, 500, {
      error: "db_not_configured",
      message: "Mash database is not configured. Add MASH_DATABASE_URL.",
    });
    return;
  }
  const status = out.error === "invalid_payload" ? 400 : out.error === "not_found" ? 404 : 502;
  send(res, status, {
    error: out.error || "upstream_failed",
    message: out.message || fallback,
  });
}

export default async function handler(req, res) {
  const action = String(req.query?.action || "projects");

  if (action === "owner-login") {
    if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
    const body = req.body || {};
    const password = process.env.MASH_OWNER_PASSWORD || "owner12345";
    if (String(body?.password || "") !== password) {
      return send(res, 403, { error: "invalid_password", message: "كلمة المرور غير صحيحة." });
    }
    return send(res, 200, { token: password });
  }

  if (action === "stats") {
    if (!ownerTokenValid(req)) return send(res, 403, { error: "owner_only" });
    const out = await getMashStats();
    if (out.error) return sendStoreError(res, out, "Could not load stats.");
    return send(res, 200, out.data || {});
  }

  if (action === "project") {
    const id = String(req.query?.id || "");
    if (!id) return send(res, 400, { error: "invalid_payload", message: "Missing id." });

    if (req.method === "GET") {
      const out = await readMashProject(id);
      if (out.error) return sendStoreError(res, out, "Could not load project.");
      return send(res, 200, out.data);
    }

    if (req.method === "PATCH") {
      if (!ownerTokenValid(req)) return send(res, 403, { error: "owner_only" });
      const out = await updateMashProject(id, req.body || {});
      if (out.error) return sendStoreError(res, out, "Could not update project.");
      return send(res, 200, out.data);
    }

    return send(res, 405, { error: "method_not_allowed" });
  }

  if (action === "projects") {
    if (req.method === "GET") {
      const out = await listMashProjects(String(req.query?.scope || ""));
      if (out.error) return sendStoreError(res, out, "Could not load projects.");
      return send(res, 200, out.data || []);
    }

    if (req.method === "POST") {
      const out = await createMashProject(req.body || {});
      if (out.error) return sendStoreError(res, out, "Could not create project.");
      return send(res, 201, out.data);
    }

    return send(res, 405, { error: "method_not_allowed" });
  }

  return send(res, 404, { error: "unknown_action" });
}