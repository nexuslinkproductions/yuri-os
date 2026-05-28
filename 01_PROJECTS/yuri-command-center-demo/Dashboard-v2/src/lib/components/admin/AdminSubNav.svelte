<script lang="ts">
  /**
   * AdminSubNav  glass pill tab strip used at the top of every /admin page.
   * Sub-pages: Members, System, Modules.
   * Mobile: horizontal scroll, no wrap.
   */
  import { page } from '$app/stores';

  type Tab = { href: string; label: string; icon: string; key: string };

  const TABS: Tab[] = [
    { href: '/admin/members', label: 'Members', icon: '◇', key: 'members' },
    { href: '/admin/system',  label: 'System',  icon: '⊕', key: 'system'  },
    { href: '/admin/modules', label: 'Modules', icon: '⊟', key: 'modules' },
    { href: '/admin/pitch',   label: 'Pitch SSO', icon: '◈', key: 'pitch' },
  ];

  function isActive(href: string): boolean {
    const p = $page.url.pathname;
    return p === href || p.startsWith(href + '/');
  }
</script>

<nav class="admin-subnav" aria-label="Admin sections">
  <div class="admin-subnav__inner">
    {#each TABS as t (t.key)}
      <a
        href={t.href}
        class="admin-subnav__tab"
        class:admin-subnav__tab--active={isActive(t.href)}
        aria-current={isActive(t.href) ? 'page' : undefined}
      >
        <span class="admin-subnav__icon" aria-hidden="true">{t.icon}</span>
        <span class="admin-subnav__label">{t.label}</span>
      </a>
    {/each}
  </div>
</nav>

<style>
  .admin-subnav {
    margin: 0 0 20px;
    padding: 0;
    width: 100%;
  }
  .admin-subnav__inner {
    display: flex;
    gap: 6px;
    padding: 6px;
    border-radius: 14px;
    background: var(--glass-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    backdrop-filter: var(--blur-chrome);
    border: 1px solid var(--brand-line);
    overflow-x: auto;
    scrollbar-width: none;
    width: max-content;
    max-width: 100%;
  }
  .admin-subnav__inner::-webkit-scrollbar { display: none; }
  .admin-subnav__tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 10px;
    text-decoration: none;
    color: var(--ink-2);
    font: 600 13px/1 var(--sa, Inter, sans-serif);
    letter-spacing: 0.01em;
    white-space: nowrap;
    transition: color 140ms ease, background 140ms ease, transform 140ms ease;
    border: 1px solid transparent;
  }
  .admin-subnav__tab:hover {
    color: var(--ink);
    background: var(--brand-soft, rgba(86, 188, 236, 0.10));
  }
  .admin-subnav__tab--active {
    color: #06080E;
    background: linear-gradient(180deg, #56bcec 0%, #3aa6dd 100%);
    border-color: var(--brand-line-2);
    box-shadow: 0 4px 14px var(--brand-glow), inset 0 1px 0 rgba(255,255,255,0.25);
  }
  .admin-subnav__tab--active:hover {
    color: #06080E;
    background: linear-gradient(180deg, #56bcec 0%, #3aa6dd 100%);
  }
  .admin-subnav__icon {
    font-size: 14px;
    line-height: 1;
    opacity: 0.85;
  }
  .admin-subnav__label {
    font-size: 13px;
  }

  @media (max-width: 760px) {
    .admin-subnav__inner {
      width: 100%;
      border-radius: 12px;
    }
    .admin-subnav__tab {
      padding: 8px 12px;
      font-size: 12.5px;
    }
  }
</style>
