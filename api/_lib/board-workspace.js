const maximumBodyBytes = 3 * 1024 * 1024;
const maximumImageSourceLength = 650 * 1024;
const maximumImageDimension = 4096;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const backgrounds = new Set(["grid", "dots", "notebook", "plain", "dark"]);
const inkTypes = new Set(["pen", "brush", "marker", "eraser"]);
const geometryTypes = new Set([
  "line", "rectangle", "ellipse", "arc", "triangle", "ruler", "protractor", "set-square",
  "axes", "plot", "fraction", "demo-label", "demo-box", "demo-point",
]);
const invalidText = /[\u0000\uD800-\uDFFF]/u;

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isId = value => typeof value === "string" && value.trim().length > 0 && value.length <= 256;
const isPoint = point => isRecord(point) && Number.isFinite(point.x) && Number.isFinite(point.y);

function isImageSource(src) {
  if (typeof src !== "string" || src.length > maximumImageSourceLength) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
  if (!match || match[0].length !== src.length || match[2].length % 4 !== 0) return false;
  const [, format, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) return false;

  if (format === "png") return bytes.subarray(0, pngSignature.length).equals(pngSignature);
  if (format === "jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP";
}

function isDrawing(object) {
  if (!isRecord(object)) return false;
  if (inkTypes.has(object.type)) {
    return Array.isArray(object.points) && object.points.length > 0 && object.points.every(isPoint);
  }
  if (!isPoint(object)) return false;
  if (object.type === "text") return typeof object.text === "string";
  if (object.type === "image") {
    return [object.w, object.h].every(size => Number.isFinite(size) && size > 0 && size <= maximumImageDimension)
      && isImageSource(object.src);
  }
  if (!geometryTypes.has(object.type) || ![object.w, object.h].every(Number.isFinite)) return false;
  if (object.type !== "arc") return true;
  return object.w > 0 && object.h > 0 && Number.isFinite(object.angle)
    && Number.isFinite(object.sweep) && Math.abs(object.sweep) <= Math.PI * 2 + 1e-8;
}

function supportsJsonb(value, depth = 0) {
  if (depth > 16) return false;
  if (typeof value === "string") return !invalidText.test(value);
  if (typeof value === "number") return Number.isFinite(value);
  if (value === null || typeof value !== "object") return true;
  return Object.entries(value).every(([key, child]) => !invalidText.test(key) && supportsJsonb(child, depth + 1));
}

function normalizeWorkspace(workspace) {
  if (!isRecord(workspace) || workspace.version !== 1 || !isId(workspace.activeBoardId)
      || !Array.isArray(workspace.boards) || !workspace.boards.length) return null;
  const ids = new Set();
  const boards = [];
  for (const board of workspace.boards) {
    if (!isRecord(board) || !isId(board.id) || ids.has(board.id) || typeof board.name !== "string"
        || !board.name.trim() || !backgrounds.has(board.background) || !Number.isFinite(board.updatedAt)
        || Math.abs(board.updatedAt) > 8.64e15 || !Array.isArray(board.objects) || !board.objects.every(isDrawing)) {
      return null;
    }
    ids.add(board.id);
    const { id, name, background, updatedAt, objects } = board;
    boards.push({ id, name, background, updatedAt, objects });
  }
  const normalized = { version: 1, boards, activeBoardId: workspace.activeBoardId };
  return ids.has(normalized.activeBoardId) && supportsJsonb(normalized) ? normalized : null;
}

function send(res, status, payload) {
  return res.status(status).json(payload);
}

export function createBoardWorkspaceHandler(sql, readBodyBuffer) {
  let schemaPromise;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = sql`
        CREATE TABLE IF NOT EXISTS teacher_board_workspaces (
          teacher_id TEXT PRIMARY KEY REFERENCES teacher_users(id) ON DELETE CASCADE,
          workspace JSONB NOT NULL,
          revision BIGINT NOT NULL CHECK (revision > 0),
          last_write_id TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `.catch(error => {
        schemaPromise = undefined;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function getWorkspace(res, teacher) {
    await ensureSchema();
    const [row] = await sql`
      SELECT workspace, revision FROM teacher_board_workspaces WHERE teacher_id = ${teacher.id};
    `;
    return send(res, 200, { teacher, workspace: row?.workspace ?? null, revision: Number(row?.revision ?? 0) });
  }

  async function updateWorkspace(req, res, teacher) {
    if (!/^application\/json(?:\s*;|\s*$)/i.test(String(req.headers?.["content-type"] || ""))) {
      return send(res, 415, { error: "invalid_content_type" });
    }
    const tooLarge = () => send(res, 413, { error: "workspace_too_large", maxBytes: maximumBodyBytes });
    if (Number(req.headers?.["content-length"]) > maximumBodyBytes) return tooLarge();
    let payload;
    try {
      const buffer = await readBodyBuffer(req, maximumBodyBytes);
      payload = JSON.parse(buffer.toString("utf8"));
    } catch (error) {
      return error?.statusCode === 413 ? tooLarge() : send(res, 400, { error: "invalid_workspace" });
    }
    if (!isRecord(payload) || !isId(payload.teacherId)) return send(res, 400, { error: "invalid_workspace" });
    if (payload.teacherId !== teacher.id) return send(res, 409, { error: "account_changed" });
    const { expectedRevision, writeId } = payload;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER
        || typeof writeId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(writeId)) {
      return send(res, 400, { error: "invalid_workspace" });
    }
    const workspace = normalizeWorkspace(payload.workspace);
    if (!workspace) return send(res, 400, { error: "invalid_workspace" });
    const serialized = JSON.stringify(workspace);
    if (Buffer.byteLength(serialized, "utf8") > maximumBodyBytes) return tooLarge();

    await ensureSchema();
    const [saved] = expectedRevision === 0 ? await sql`
      INSERT INTO teacher_board_workspaces (teacher_id, workspace, revision, last_write_id)
      VALUES (${teacher.id}, ${serialized}::jsonb, 1, ${writeId})
      ON CONFLICT (teacher_id) DO NOTHING RETURNING revision;
    ` : await sql`
      UPDATE teacher_board_workspaces SET workspace = ${serialized}::jsonb,
        revision = revision + 1, last_write_id = ${writeId}, updated_at = NOW()
      WHERE teacher_id = ${teacher.id} AND revision = ${expectedRevision} AND last_write_id <> ${writeId}
      RETURNING revision;
    `;
    if (saved) return send(res, 200, { revision: Number(saved.revision) });

    const [current] = await sql`
      SELECT revision, (last_write_id = ${writeId} AND workspace = ${serialized}::jsonb) AS same_write
      FROM teacher_board_workspaces WHERE teacher_id = ${teacher.id};
    `;
    const revision = Number(current?.revision ?? 0);
    if (current?.same_write && revision === expectedRevision + 1) return send(res, 200, { revision });
    return send(res, 409, { error: "workspace_conflict", revision });
  }

  return async function boardWorkspace(req, res, teacher) {
    try {
      return req.method === "GET" ? await getWorkspace(res, teacher) : await updateWorkspace(req, res, teacher);
    } catch {
      return send(res, 503, { error: "workspace_unavailable" });
    }
  };
}
