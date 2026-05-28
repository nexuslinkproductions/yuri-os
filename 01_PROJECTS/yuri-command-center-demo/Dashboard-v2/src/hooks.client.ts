import { browser } from '$app/environment';

// Detect JS chunk hash mismatch after a deploy and hard-reload.
// Symptoms: SvelteKit navigation freezes 5s then aborts — caused by old open
// tabs referencing chunk URLs that no longer exist on the server after rsync --delete.
export function handleError({ error }: { error: unknown }) {
  if (browser && error instanceof Error) {
    const msg = error.message + (error.stack ?? '');
    if (
      msg.includes('dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('Failed to fetch')
    ) {
      window.location.reload();
    }
  }
  return { message: 'An unexpected error occurred.' };
}

// Belt-and-suspenders: catch unhandled rejections from dynamic imports that
// bypass the SvelteKit error boundary (e.g. lazy-loaded sub-components).
if (browser) {
  window.addEventListener('unhandledrejection', (e) => {
    const msg = String(e.reason?.message ?? e.reason ?? '');
    if (
      msg.includes('dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('Failed to fetch')
    ) {
      e.preventDefault();
      window.location.reload();
    }
  });
}
