import { next } from '@vercel/functions';
import { readTeacherSession } from './enjazy/server_api/_lib/teacher-session.js';
import { readPreparationSubscription } from './api/subscriptions.js';

export const config = { matcher: '/mm/:path*', runtime: 'nodejs' };

const publicFiles = new Set(['/mm/manifest.webmanifest', '/mm/service-worker.js']);

function accessMessage(status, heading, message, href, label) {
  return new Response(`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>رصد غياب الطلبة | التحضير الذكي</title>
<style>
body{font:1rem/1.7 system-ui,sans-serif;margin:0;padding:2rem 1rem;background:#f0f5f8;color:#142c43}
main{max-width:34rem;margin:8vh auto;padding:clamp(1.25rem,5vw,2.5rem);background:#fff;border:1px solid #d6e2eb;border-block-start:5px solid #13776d;border-radius:1rem}
h1{font-size:1.7rem;margin:.3rem 0}p{margin:.5rem 0 1.25rem}small{color:#17645c;font-weight:700}
.actions{display:flex;flex-wrap:wrap;gap:.65rem}
a{display:inline-block;padding:.6rem 1rem;border:1px solid #cbdbe6;border-radius:.6rem;color:#142c43;text-decoration:none;font-weight:700}
a.primary{color:#fff;background:#185d57;border-color:#185d57}
a:focus-visible{outline:3px solid #287e77;outline-offset:3px}
</style>
</head><body><main><small>التحضير الذكي / رصد غياب الطلبة</small><h1>${heading}</h1><p>${message}</p>
<nav class="actions" aria-label="خيارات الوصول"><a class="primary" href="${href}">${label}</a><a href="/school-services/">الخدمات المدرسية</a></nav></main></body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  if (publicFiles.has(pathname)) return next();

  const returnPath = /^\/mm\/admin(?:\.html)?\/?$/i.test(pathname) ? '/mm/admin.html' : '/mm/index.html';
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex, nofollow'
  });
  const login = () => new Response(null, {
    status: 303,
    headers: {
      'Cache-Control': 'private, no-store',
      Location: `/enjazy/auth.html?mode=login&reauth=attendance&return=${encodeURIComponent(returnPath)}`
    }
  });

  try {
    const session = await readTeacherSession({ method: request.method, headers: Object.fromEntries(request.headers) }, {
      setHeader(name, value) { headers.set(name, value); }
    });
    if (!session) return login();
    const access = await readPreparationSubscription(session.userId);
    if (access.status === 200) return next({ headers });
    if (access.status === 401) return login();
    if (access.error === 'subscription_required') {
      return accessMessage(403, 'الخدمة للمشتركين', 'فعّل اشتراكك في التحضير الذكي لتفتح بوابة المدرسة وترصد غياب الطلبة.', '/subscription.html', 'إدارة الاشتراك');
    }
    if (access.error === 'account_stopped') {
      return accessMessage(403, 'الحساب موقوف', 'تواصل مع إدارة التحضير الذكي لإعادة تفعيل حسابك.', '/subscription.html', 'عرض حالة الحساب');
    }
  } catch {
    // Leave the attendance page closed whenever the subscription check fails.
  }
  return accessMessage(503, 'تعذّر التحقق من الاشتراك', 'حاول فتح بوابة المدرسة مرة أخرى.', returnPath, 'إعادة المحاولة');
}
