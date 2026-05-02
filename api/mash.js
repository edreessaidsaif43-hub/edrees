import {
  createMashProject,
  getMashStats,
  listMashProjects,
  readMashProject,
  updateMashProject,
} from "./_lib/mash-store.js";

function send(res, status, payload) {
  res.status(status).json(payload);
}

function ownerTokenValid(req) {
  const password = process.env.MASH_OWNER_PASSWORD || "owner12345";
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token === password;
}

function teacherSlugFromReq(req) {
  return String(req.headers["x-teacher-slug"] || "").trim().toLowerCase();
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
  try {
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
      const body = req.body || {};
      if (!ownerTokenValid(req)) {
        const teacherSlug = teacherSlugFromReq(req);
        const existing = await readMashProject(id);
        if (existing.error || !existing.data) {
          return send(res, 404, { error: "not_found", message: "Project not found." });
        }
        const projectOwner = String(existing.data.teacherSlug || "").trim().toLowerCase();
        if (!teacherSlug || !projectOwner || teacherSlug !== projectOwner) {
          return send(res, 403, { error: "owner_only", message: "You can only edit your own projects." });
        }
        const teacherPatch = {
          title: body.title,
          school: body.school,
          category: body.category,
          subject: body.subject,
          grade: body.grade,
          description: body.description,
          cover: body.cover,
          logo: body.logo,
          media: body.media,
          links: body.links,
          problem: body.problem,
          goals: body.goals,
          steps: body.steps,
          evidence: body.evidence,
          results: body.results,
          recommendations: body.recommendations,
          publicInMain: body.publicInMain,
          latest: true,
        };
        const out = await updateMashProject(id, teacherPatch);
        if (out.error) return sendStoreError(res, out, "Could not update project.");
        return send(res, 200, out.data);
      }
      const out = await updateMashProject(id, body);
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
  } catch (error) {
    const msg = String(error?.message || error || "Internal error");
    return send(res, 500, {
      error: "mash_api_crash",
      message: msg,
    });
  }
}
