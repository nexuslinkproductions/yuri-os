// Edge function: guard /marketing-studio.html behind ops.c2moviez.com auth cookie.
// Cookie name matches auth.js (COOKIE_NAME = 'exeo_token').
// No token → redirect to /?redirect=/marketing-studio.html for login.

export default async (request) => {
  const cookie = request.headers.get('cookie') || '';
  // Accept either the custom password cookie or a Supabase OAuth session cookie
  if (cookie.includes('exeo_token=') || cookie.includes('sb-audsscmxfitvbcswvzkm-auth-token=')) return;
  const loginUrl = new URL('/', request.url);
  loginUrl.searchParams.set('redirect', '/marketing-studio.html');
  return Response.redirect(loginUrl.toString(), 302);
};

export const config = { path: '/marketing-studio.html' };
