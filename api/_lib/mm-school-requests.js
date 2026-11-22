import { pbkdf2, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { isTeacherSessionOrigin, readTeacherSession } from '../../enjazy/server_api/_lib/teacher-session.js';
import { readPreparationSubscription } from '../subscriptions.js';

const derivePassword = promisify(pbkdf2);
const schoolTypes = new Set(['male', 'female', 'mixed']);

function normalizeName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeDigits(value) {
  return value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 32) return '';
  const phone = normalizeDigits(value).replace(/[\s()-]/g, '');
  const match = /^(?:(?:\+|00)?968)?([0-9]{8})$/.exec(phone);
  return match ? `968${match[1]}` : '';
}

export function createMmSchoolRequests(sql) {
  let schema;
  function ensureSchema() {
    if (!schema) {
      schema = (async () => {
        await sql`
        CREATE TABLE IF NOT EXISTS mm_school_requests (
          user_id TEXT NOT NULL,
          school_name TEXT NOT NULL,
          teacher_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, school_name)
        );
        `;
        await sql`
          ALTER TABLE mm_school_requests
            ADD COLUMN IF NOT EXISTS school_code TEXT,
            ADD COLUMN IF NOT EXISTS school_gender TEXT,
            ADD COLUMN IF NOT EXISTS manager_verifier TEXT;
        `;
      })().catch(error => { schema = undefined; throw error; });
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
          SELECT school_name AS "schoolName", teacher_name AS "teacherName", phone,
            school_code AS "schoolCode", school_gender AS "schoolGender",
            manager_verifier AS "managerVerifier", created_at AS "createdAt"
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
    const schoolCode = typeof body?.schoolCode === 'string' ? normalizeDigits(body.schoolCode.trim()) : '';
    if (!/^[0-9]{4,12}$/.test(schoolCode)) return fail(400, 'invalid_school_code');
    const schoolGender = body?.schoolGender;
    if (!schoolTypes.has(schoolGender)) return fail(400, 'invalid_school_gender');
    const managerPassword = typeof body?.managerPassword === 'string' ? normalizeDigits(body.managerPassword.trim()) : '';
    if (managerPassword.length < 8 || managerPassword.length > 100 || /^[0-9]+$/.test(managerPassword)) {
      return fail(400, 'invalid_manager_password');
    }

    try {
      await ensureSchema();
      const salt = randomBytes(16);
      const digest = await derivePassword(managerPassword, salt, 600000, 32, 'sha256');
      const verifier = 'pbkdf2-sha256$' + salt.toString('hex') + '$' + digest.toString('hex');
      await sql`
        INSERT INTO mm_school_requests (user_id, school_name, teacher_name, phone, school_code, school_gender, manager_verifier)
        VALUES (${userId}, ${schoolName}, ${teacherName}, ${phone}, ${schoolCode}, ${schoolGender}, ${verifier})
        ON CONFLICT (user_id, school_name) DO UPDATE
        SET teacher_name = EXCLUDED.teacher_name, phone = EXCLUDED.phone,
          school_code = EXCLUDED.school_code, school_gender = EXCLUDED.school_gender,
          manager_verifier = EXCLUDED.manager_verifier;
      `;
      return res.status(200).json({ success:true });
    } catch {
      return fail(503, 'school_requests_unavailable');
    }
  };
}
