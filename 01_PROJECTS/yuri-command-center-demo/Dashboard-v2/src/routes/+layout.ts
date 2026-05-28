// Client-side rendering only. The app is Realtime-driven from Supabase —
// SSR would force stale snapshots into every first paint.
export const ssr = false;
export const prerender = false;
