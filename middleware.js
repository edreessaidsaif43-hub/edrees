import { next } from '@vercel/functions';
import { readTeacherSession } from './enjazy/server_api/_lib/teacher-session.js';
import { readPreparationSubscription } from './api/subscriptions.js';

export const config = { matcher: '/mm/:path*', runtime: 'nodejs' };

const publicFiles = new Set(['/mm/manifest.webmanifest', '/mm/service-worker.js']);

function accessMessage(status, message, action) {
  return new Response(`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>نظام الحضور والتسرب المدرسي</title>
<style>body{font:1rem/1.7 system-ui,sans-serif;margin:0;padding:2rem 1rem;background:#f1f5f9;color:#1e293b}main{max-width:34rem;margin:8vh auto;padding:1.5rem;background:white;border-radius:1rem}h1{font-size:1.4rem}a{display:inline-block;padding:.5rem .8rem;border-radius:.5rem;color:white;background:#1e3a5f;text-decoration:none}</style>
</head><body><main><h1>نظام الحضور والتسرب المدرسي</h1><p>${message}</p>${action}</main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' }
  });
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  if (publicFiles.has(pathname)) return next();

  const returnPath = /^\/mm\/admin(?:\.html)?\/?$/i.test(pathname) ? '/mm/admin.html' : '/mm/index.html';
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
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
      return accessMessage(403, 'يلزم اشتراك ساري في التحضير الذكي للمعلم العماني.', '<a href="/subscription.html">إدارة الاشتراك</a>');
    }
    if (access.error === 'account_stopped') {
      return accessMessage(403, 'حسابك موقوف. تواصل مع إدارة التحضير الذكي.', '<a href="/school-services/">العودة إلى الخدمات المدرسية</a>');
    }
  } catch {
    // Leave the attendance page closed whenever the subscription check fails.
  }
  return accessMessage(503, 'تعذّر التحقق من الاشتراك الآن.', `<a href="${returnPath}">إعادة المحاولة</a>`);
}
