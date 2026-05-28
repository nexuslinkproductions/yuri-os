<script lang="ts">
  /**
   * /admin  index. Redirects to /admin/members (the primary admin surface).
   * Kept as a thin client-side redirect so the sidebar "Admin" link can target
   * a stable /admin URL while the actual landing is /admin/members.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    goto('/admin/members', { replaceState: true });
  });
</script>

<svelte:head><title>NEX  Admin</title></svelte:head>

<div class="admin-redirect">
  <p>Loading admin...</p>
</div>

<style>
  .admin-redirect {
    display: grid;
    place-items: center;
    min-height: 50vh;
    color: var(--ink-3);
    font: 500 13px/1.4 var(--sa, Inter, sans-serif);
  }
</style>
