<script lang="ts">
  /**
   * /admin/design — Workstream W canonical design-system gallery.
   *
   * The single page that proves "we built one design language across NEX."
   * Shows every interactive tier (L1-L4), every tone, every size, every
   * state side-by-side. Designers + CEO use this to spot regressions when
   * tokens change.
   *
   * Gated to CEO/CTO via user.isAdmin (same pattern as /admin/permissions).
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { user } from "$stores/user.svelte";
  import {
    GlassActionPrimary,
    GlassActionSecondary,
    GlassValueChip,
    GlassInlineLink,
  } from "$lib/components/glass";

  let mounted = $state(false);
  let copied = $state<string | null>(null);

  onMount(async () => {
    await user.init();
    if (!user.isAdmin) {
      goto("/");
      return;
    }
    mounted = true;
  });

  // Demo handlers — never fire real network calls
  function noop(label: string) {
    return () => {
      copied = label;
      setTimeout(() => copied = null, 1400);
    };
  }

  function copySnippet(text: string) {
    navigator.clipboard?.writeText(text);
    copied = "snippet copied";
    setTimeout(() => copied = null, 1400);
  }

  // L3 demo data — match real lifecycle values from customer_master
  const lifecycles = [
    { code: "cold_queued",   label: "Cold queued",   tone: "neutral", accent: undefined },
    { code: "outreached",    label: "Outreached",    tone: "info",    accent: undefined },
    { code: "replied",       label: "Replied",       tone: "info",    accent: undefined },
    { code: "discovery",     label: "Discovery",     tone: "info",    accent: undefined },
    { code: "proposal_sent", label: "Proposal sent", tone: "violet",  accent: undefined },
    { code: "negotiation",   label: "Negotiation",   tone: "violet",  accent: undefined },
    { code: "pre_contract",  label: "Pre-contract",  tone: "warn",    accent: undefined },
    { code: "active",        label: "Active",        tone: "success", accent: undefined },
    { code: "dormant",       label: "Dormant",       tone: "neutral", accent: undefined },
    { code: "lost",          label: "Lost",          tone: "danger",  accent: undefined },
  ] as const;

  // L3 demo — client codes with real --client-* accents
  const clientCodes = ["SHI","GANZ","MFB","CASA","UPG","RIBO","BOV","BABA","ALP","CALI"];

  // L3 demo — priority pills
  const priorities = [
    { label: "Urgent", tone: "danger" as const,  accent: "var(--prio-urgent)" },
    { label: "High",   tone: "warn"   as const,  accent: "var(--prio-high)" },
    { label: "Medium", tone: "info"   as const,  accent: "var(--prio-medium)" },
    { label: "Low",    tone: "success" as const, accent: "var(--prio-low)" },
    { label: "None",   tone: "neutral" as const, accent: "var(--prio-none)" },
  ];
</script>

<svelte:head>
  <title>NEX · Design System · /admin/design</title>
</svelte:head>

{#if !mounted}
  <div class="loading">Loading design system…</div>
{:else}
  <div class="ds-page">
    <header class="ds-head">
      <div>
        <span class="ds-eyebrow">Workstream W · Canonical NEX surfaces</span>
        <h1>NEX Design System</h1>
        <p class="ds-lede">
          Four interactive tiers, three semantic tones each, one operational app.
          Counting rule per surface: ≤ 1 L1 · ≤ 3 L2 · unlimited L3 · unlimited L4.
        </p>
      </div>
      <div class="ds-head-actions">
        <GlassValueChip tone="info" static>
          {#snippet children()}theme · {document.documentElement.dataset.theme || "system"}{/snippet}
        </GlassValueChip>
        <GlassValueChip tone="neutral" static>
          {#snippet children()}role · {user.role}{/snippet}
        </GlassValueChip>
      </div>
    </header>

    <!-- Tier 1 — Hero action -->
    <section class="ds-tier">
      <div class="ds-tier-head">
        <h2><span class="ds-rank">L1</span> Hero action</h2>
        <p>The single most important action on a surface. Brand-tinted, signature glow, spring-press. Use sparingly.</p>
      </div>
      <div class="ds-row">
        <GlassActionPrimary onclick={noop("L1 default")}>
          {#snippet children()}Start tracker{/snippet}
        </GlassActionPrimary>
        <GlassActionPrimary tone="success" onclick={noop("L1 success")}>
          {#snippet children()}Approve plan{/snippet}
        </GlassActionPrimary>
        <GlassActionPrimary tone="warn" onclick={noop("L1 warn")}>
          {#snippet children()}Submit for review{/snippet}
        </GlassActionPrimary>
        <GlassActionPrimary tone="danger" onclick={noop("L1 danger")}>
          {#snippet children()}Reject request{/snippet}
        </GlassActionPrimary>
        <GlassActionPrimary disabled>
          {#snippet children()}Disabled{/snippet}
        </GlassActionPrimary>
        <GlassActionPrimary loading>
          {#snippet children()}Sending…{/snippet}
        </GlassActionPrimary>
      </div>
      <button class="ds-copy" onclick={() => copySnippet('<GlassActionPrimary onclick={fn}>...</GlassActionPrimary>')}>copy snippet</button>
    </section>

    <!-- Tier 2 — Secondary action -->
    <section class="ds-tier">
      <div class="ds-tier-head">
        <h2><span class="ds-rank">L2</span> Secondary action</h2>
        <p>Ordinary clickable actions. Glass-thin, hairline border, lifts on hover. ≤ 3 in the primary action zone.</p>
      </div>
      <div class="ds-row">
        <GlassActionSecondary onclick={noop("L2 default")}>{#snippet children()}Save changes{/snippet}</GlassActionSecondary>
        <GlassActionSecondary onclick={noop("L2 cancel")}>{#snippet children()}Cancel{/snippet}</GlassActionSecondary>
        <GlassActionSecondary tone="success" onclick={noop("L2 success")}>{#snippet children()}Mark done{/snippet}</GlassActionSecondary>
        <GlassActionSecondary tone="warn" onclick={noop("L2 warn")}>{#snippet children()}Send draft{/snippet}</GlassActionSecondary>
        <GlassActionSecondary tone="danger" onclick={noop("L2 danger")}>{#snippet children()}Delete{/snippet}</GlassActionSecondary>
        <GlassActionSecondary disabled>{#snippet children()}Disabled{/snippet}</GlassActionSecondary>
        <GlassActionSecondary loading>{#snippet children()}Loading{/snippet}</GlassActionSecondary>
      </div>
      <div class="ds-row">
        <span class="ds-mini-label">Icon kind</span>
        <GlassActionSecondary kind="icon" ariaLabel="Drag" onclick={noop("L2 icon drag")}>
          {#snippet icon()}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          {/snippet}
        </GlassActionSecondary>
        <GlassActionSecondary kind="icon" ariaLabel="Add" onclick={noop("L2 icon add")}>
          {#snippet icon()}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {/snippet}
        </GlassActionSecondary>
        <GlassActionSecondary kind="icon" ariaLabel="More" onclick={noop("L2 icon more")}>
          {#snippet icon()}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
          {/snippet}
        </GlassActionSecondary>
      </div>
      <button class="ds-copy" onclick={() => copySnippet('<GlassActionSecondary onclick={fn}>...</GlassActionSecondary>')}>copy snippet</button>
    </section>

    <!-- Tier 3 — Value chip / pill -->
    <section class="ds-tier">
      <div class="ds-tier-head">
        <h2><span class="ds-rank">L3</span> Value chip / pill</h2>
        <p>Clickable values: status, priority, ticket ID, client code, tag. Left-edge accent bar = the click signal.</p>
      </div>

      <div class="ds-subhead">Lifecycle status (CRM)</div>
      <div class="ds-row ds-row--tight">
        {#each lifecycles as l}
          <GlassValueChip tone={l.tone} onclick={noop(`lifecycle ${l.code}`)}>
            {#snippet children()}{l.label}{/snippet}
          </GlassValueChip>
        {/each}
      </div>

      <div class="ds-subhead">Priority</div>
      <div class="ds-row ds-row--tight">
        {#each priorities as p}
          <GlassValueChip tone={p.tone} accent={p.accent} onclick={noop(`prio ${p.label}`)}>
            {#snippet children()}{p.label}{/snippet}
          </GlassValueChip>
        {/each}
      </div>

      <div class="ds-subhead">Client codes (live brand colours)</div>
      <div class="ds-row ds-row--tight">
        {#each clientCodes as code}
          <GlassValueChip accent={`var(--client-${code})`} onclick={noop(`client ${code}`)}>
            {#snippet children()}{code}{/snippet}
          </GlassValueChip>
        {/each}
      </div>

      <div class="ds-subhead">Sizes</div>
      <div class="ds-row ds-row--tight">
        <GlassValueChip tone="info" size="sm" onclick={noop("size sm")}>{#snippet children()}small{/snippet}</GlassValueChip>
        <GlassValueChip tone="info" size="md" onclick={noop("size md")}>{#snippet children()}medium (default){/snippet}</GlassValueChip>
        <GlassValueChip tone="info" size="lg" onclick={noop("size lg")}>{#snippet children()}large{/snippet}</GlassValueChip>
      </div>

      <div class="ds-subhead">Static (non-clickable label)</div>
      <div class="ds-row ds-row--tight">
        <GlassValueChip tone="neutral" static>{#snippet children()}read-only label{/snippet}</GlassValueChip>
        <GlassValueChip tone="success" static>{#snippet children()}auto badge{/snippet}</GlassValueChip>
      </div>

      <button class="ds-copy" onclick={() => copySnippet('<GlassValueChip tone="info" onclick={openTicket}>SHI-142</GlassValueChip>')}>copy snippet</button>
    </section>

    <!-- Tier 4 — Inline link -->
    <section class="ds-tier">
      <div class="ds-tier-head">
        <h2><span class="ds-rank">L4</span> Inline link</h2>
        <p>Quiet body-text-embedded action. Underline on hover only.</p>
      </div>
      <p class="ds-paragraph">
        Met with Hans Müller (
        <GlassInlineLink href="mailto:hans@example.ch">hans@example.ch</GlassInlineLink>
        ) on
        <GlassInlineLink onclick={noop("L4 date")}>Monday</GlassInlineLink>
        to review the
        <GlassInlineLink href="#" onclick={noop("L4 proposal")}>Q3 proposal</GlassInlineLink>.
        See the full thread in
        <GlassInlineLink href="https://plane.so" target="_blank">Plane</GlassInlineLink>.
      </p>
      <button class="ds-copy" onclick={() => copySnippet('<GlassInlineLink href={url}>...</GlassInlineLink>')}>copy snippet</button>
    </section>

    <!-- Composition — lane + card preview (CRM Kanban) -->
    <section class="ds-tier">
      <div class="ds-tier-head">
        <h2>Lane + card composition (CRM Kanban preview)</h2>
        <p>How the components combine on the surface most-named-as-"weird simple sales force" today.</p>
      </div>
      <div class="ds-lanes-preview">
        {#each [["lifecycle-prospect","Prospects",4], ["lifecycle-sales","Sales",2], ["lifecycle-pre-active","Pre-contract",1], ["lifecycle-active","Active",6]] as [accent, title, n]}
          <div class="lane" data-accent={accent}>
            <header class="lane__header">
              <span class="lane__title">{title}</span>
              <span class="lane__count">{n}</span>
            </header>
            <div class="lane__body">
              {#each Array(n) as _, i}
                <div class="card" data-accent role="button" tabindex="0" style={`--card-accent: var(--client-${["SHI","MFB","GANZ","UPG","CASA","BOV"][i % 6]})`}>
                  <div class="card__title">{["Shipster onboard","Med For Balance Q3","GANZ Bootsmesse","UPG demo","Casa investment","Boviro security site"][i % 6]}</div>
                  <div class="card__meta">
                    <GlassValueChip tone="info" size="sm" accent={`var(--client-${["SHI","MFB","GANZ","UPG","CASA","BOV"][i % 6]})`}>{#snippet children()}{["SHI","MFB","GANZ","UPG","CASA","BOV"][i % 6]}{/snippet}</GlassValueChip>
                    <GlassValueChip tone="warn" size="sm">{#snippet children()}high{/snippet}</GlassValueChip>
                    <span class="card__meta-sep">·</span>
                    <span>CHF {["3,333","4,000","12,500","6,000","18,000","2,500"][i % 6]}/mo</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Counting-rule reminder -->
    <section class="ds-tier ds-discipline">
      <div class="ds-tier-head">
        <h2>Discipline lock</h2>
        <p>The bare-button enforcement (W.5) ships with a pre-commit hook. Until then, the rule is operator-enforced.</p>
      </div>
      <ul class="ds-rules">
        <li><strong>One L1 per surface.</strong> If you want two L1s, one of them is wrong.</li>
        <li><strong>At most three L2s</strong> in the primary action zone. Move secondary actions to a menu past 3.</li>
        <li><strong>Every clickable value is L3.</strong> Status pills, ticket IDs, client codes, tags, contacts — always.</li>
        <li><strong>L4 only inside body copy.</strong> Never as a standalone button.</li>
        <li><strong>No bare <code>&lt;button&gt;</code></strong> outside <code>src/lib/components/glass/</code>.</li>
      </ul>
    </section>
  </div>

  {#if copied}
    <div class="ds-toast" role="status" aria-live="polite">{copied}</div>
  {/if}
{/if}

<style>
  .loading {
    display: grid; place-items: center;
    min-height: 60vh;
    color: var(--t3); font-family: var(--sa);
  }

  .ds-page {
    max-width: 1280px;
    margin: 0 auto;
    padding: 40px 32px 80px;
    font-family: var(--sa);
    color: var(--tx);
  }

  .ds-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 32px;
  }
  .ds-head h1 {
    font-family: var(--hd);
    font-weight: 700;
    font-size: 30px;
    margin: 8px 0 6px;
    letter-spacing: -0.02em;
    color: var(--tx);
  }
  .ds-eyebrow {
    font: 700 11px/1.3 var(--sa);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--brand-deep);
  }
  .ds-lede {
    font-size: 15px;
    color: var(--t2);
    line-height: 1.55;
    max-width: 640px;
    margin: 0;
  }
  .ds-head-actions { display: flex; gap: 8px; flex-shrink: 0; }

  .ds-tier {
    margin-top: 40px;
    padding: 24px;
    border-radius: var(--r2);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
  }
  .ds-tier-head { margin-bottom: 16px; }
  .ds-tier-head h2 {
    display: flex; align-items: center; gap: 12px;
    font-family: var(--hd);
    font-weight: 600;
    font-size: 20px;
    margin: 0 0 6px;
    color: var(--tx);
    letter-spacing: -0.01em;
  }
  .ds-tier-head p {
    margin: 0;
    font-size: 13px;
    color: var(--t2);
    line-height: 1.5;
  }
  .ds-rank {
    display: inline-grid; place-items: center;
    min-width: 36px; height: 22px; padding: 0 8px;
    font: 700 11px/1 var(--mo);
    color: var(--brand-deep);
    background: var(--brand-soft);
    border: 1px solid var(--brand-line);
    border-radius: 999px;
    letter-spacing: 0.06em;
  }

  .ds-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin: 8px 0;
  }
  .ds-row--tight { gap: 6px 8px; }

  .ds-subhead {
    margin-top: 18px;
    font: 700 10.5px/1.4 var(--sa);
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: var(--t3);
  }

  .ds-mini-label {
    font: 600 11px/1.2 var(--sa);
    color: var(--t3);
    margin-right: 8px;
  }

  .ds-paragraph {
    font-size: 14px;
    line-height: 1.7;
    color: var(--t2);
    margin: 0;
  }

  .ds-copy {
    margin-top: 16px;
    padding: 6px 12px;
    border: 1px dashed var(--line-2);
    border-radius: 8px;
    background: transparent;
    font: 500 11px/1 var(--mo);
    color: var(--t3);
    cursor: pointer;
    transition: color 120ms, border-color 120ms;
  }
  .ds-copy:hover { color: var(--brand-deep); border-color: var(--brand-line); }

  .ds-lanes-preview {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-top: 16px;
  }
  @media (max-width: 1024px) {
    .ds-lanes-preview { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 640px) {
    .ds-lanes-preview { grid-template-columns: 1fr; }
  }

  .ds-discipline { border-color: var(--brand-line); }
  .ds-rules {
    display: grid; gap: 8px;
    margin: 0; padding: 0;
    list-style: none;
    font-size: 13px;
    color: var(--t2);
    line-height: 1.6;
  }
  .ds-rules li { padding: 8px 12px; border-radius: 8px; background: var(--s1); }
  .ds-rules code { font-family: var(--mo); font-size: 12px; color: var(--tx); }

  .ds-toast {
    position: fixed;
    bottom: 32px; left: 50%;
    transform: translateX(-50%);
    padding: 10px 18px;
    border-radius: 12px;
    background: var(--glass-elev);
    backdrop-filter: var(--blur-elev);
    -webkit-backdrop-filter: var(--blur-elev);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card-hover);
    color: var(--tx);
    font: 600 13px/1 var(--sa);
    z-index: var(--z-toast);
    animation: toast-in 220ms var(--ease) both;
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to   { opacity: 1; transform: translate(-50%, 0); }
  }

  /* Mobile parity baseline — every section stays readable + tappable */
  @media (max-width: 640px) {
    .ds-page { padding: 24px 16px 64px; }
    .ds-head { flex-direction: column; align-items: flex-start; }
    .ds-head-actions { width: 100%; flex-wrap: wrap; }
    .ds-tier { padding: 16px; }
    .ds-tier-head h2 { font-size: 17px; }
  }
</style>
