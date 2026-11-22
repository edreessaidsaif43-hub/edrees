import { isTeacherSessionOrigin, readTeacherSession } from '../../enjazy/server_api/_lib/teacher-session.js';
import { readPreparationSubscription } from '../subscriptions.js';

function normalizeName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 32) return '';
  const phone = value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[\s()-]/g, '');
  const match = /^(?:(?:\+|00)?968)?([0-9]{8})$/.exec(phone);
  return match ? `968${match[1]}` : '';
}

export function createMmSchoolRequests(sql) {
  let schema;
  function ensureSchema() {
    if (!schema) {
      schema = sql`
        CREATE TABLE IF NOT EXISTS mm_school_requests (
          user_id TEXT NOT NULL,
          school_name TEXT NOT NULL,
          teacher_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, school_name)
        );
      `.catch(error => { schema = undefined; throw error; });
    }
    return schema;
  }

  return async function schoolRequests(req, res, action, body, isAdmin) {
    res.setHeader('Cache-Control', 'private, no-store');
    const fail = (status, error) => res.status(status).json({ success:false, error });
    const submitting = action === 'submitMmSchoolRequest';
    const expectedMethod = submitting ? 'POST' : 'GET';
    if (req.method !== expectedMethod) {
      res.setHeader('Allow', expectedMethod);
      return fail(405, 'method_not_allowed');
    }
    if (!isTeacherSessionOrigin(req)) return fail(403, 'origin_not_allowed');

    if (!submitting) {
      if (!isAdmin) return fail(401, 'admin_session_required');
      try {
        await ensureSchema();
        const requests = await sql`
          SELECT school_name AS "schoolName", teacher_name AS "teacherName", phone, created_at AS "createdAt"
          FROM mm_school_requests ORDER BY created_at DESC LIMIT 200;
        `;
        return res.status(200).json({ success:true, requests });
      } catch {
        return fail(503, 'school_requests_unavailable');
      }
    }

    let userId;
    try {
      const session = await readTeacherSession(req, res);
      if (!session) return fail(401, 'sign_in_required');
      const access = await readPreparationSubscription(session.userId);
      if (access.status !== 200) return fail(access.status, access.error);
      userId = session.userId;
    } catch {
      return fail(503, 'subscription_check_unavailable');
    }

    const schoolName = normalizeName(body?.schoolName);
    const teacherName = normalizeName(body?.teacherName);
    const phone = normalizePhone(body?.phone);
    if (schoolName.length < 2 || schoolName.length > 160 || teacherName.length < 2 || teacherName.length > 100) {
      return fail(400, 'names_required');
    }
    if (!phone) return fail(400, 'invalid_phone');

    try {
      await ensureSchema();
      await sql`
        INSERT INTO mm_school_requests (user_id, school_name, teacher_name, phone)
        VALUES (${userId}, ${schoolName}, ${teacherName}, ${phone})
        ON CONFLICT (user_id, school_name) DO UPDATE
        SET teacher_name = EXCLUDED.teacher_name, phone = EXCLUDED.phone;
      `;
      return res.status(200).json({ success:true });
    } catch {
      return fail(503, 'school_requests_unavailable');
    }
  };
}
