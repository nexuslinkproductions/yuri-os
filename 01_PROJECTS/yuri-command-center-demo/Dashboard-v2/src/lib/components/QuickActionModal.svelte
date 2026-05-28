<script lang="ts">
  import { goto } from "$app/navigation";
  import { quickAction, type QuickVerb } from "$stores/quickAction.svelte";
  import { supabase, hasClient, listEntityState } from "$lib/db";

  // ── per-verb form state ───────────────────────────────────────────────
  let activeVerb = $state<QuickVerb>(null);
  let saving = $state(false);
  let result = $state<{ ok: boolean; msg: string } | null>(null);

  // pipeline-won
  let clients = $state<{ code: string; name: string }[]>([]);
  let wonClient = $state("");

  // email
  let emailTo   = $state("");
  let emailSubj = $state("");
  let emailBody = $state("");

  // push (Telegram)
  let pushMsg = $state("");

  // ── sync with store verb ──────────────────────────────────────────────
  $effect(() => {
    if (quickAction.open) {
      activeVerb = quickAction.verb;
      result = null;
      saving = false;
      if (quickAction.verb === "pipeline-won" && clients.length === 0) loadClients();
    }
  });

  async function loadClients() {
    if (!hasClient()) return;
    try {
      const rows = await listEntityState("client", 100);
      clients = rows
        .map((r) => ({ code: r.entity_id, name: String(r.state?.name || r.entity_id) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch { /* silent */ }
  }

  function selectVerb(v: QuickVerb) {
    activeVerb = v;
    result = null;
    if (v === "pipeline-won" && clients.length === 0) loadClients();
  }

  function close() { quickAction.hide(); activeVerb = null; result = null; }

  // ── actions ───────────────────────────────────────────────────────────
  async function submitPipelineWon() {
    if (!wonClient) return;
    saving = true;
    try {
      const r = await fetch("/api/functions/pipeline-move", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_code: wonClient, to_lane: "won", stage: "won", source: "quick-action" }),
      });
      const d = await r.json();
      result = { ok: d.ok, msg: d.ok ? `${wonClient} marked as Won` : (d.error || "Failed") };
    } catch { result = { ok: false, msg: "Network error" }; }
    finally { saving = false; }
  }

  async function submitEmail() {
    if (!emailTo || !emailSubj || !emailBody) return;
    saving = true;
    try {
      const r = await fetch("/api/functions/pipeline-email-draft", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: emailTo, subject: emailSubj, body: emailBody }),
      });
      const d = await r.json();
      result = { ok: d.ok, msg: d.ok ? "Draft queued in Outlook" : (d.error || "Failed") };
    } catch { result = { ok: false, msg: "Network error" }; }
    finally { saving = false; }
  }

  async function submitPush() {
    if (!pushMsg) return;
    saving = true;
    try {
      const r = await fetch("/api/functions/telegram", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", text: pushMsg }),
      });
      const d = await r.json();
      result = { ok: d.ok, msg: d.ok ? "Sent to Telegram" : (d.error || "Failed") };
    } catch { result = { ok: false, msg: "Network error" }; }
    finally { saving = false; }
  }

  function submitSchedule() {
    close();
    goto("/schedule");
  }

  const VERBS: { id: QuickVerb; icon: string; label: string; desc: string; color: string }[] = [
    { id: "pipeline-won",  icon: "🏆", label: "Pipeline Won",  desc: "Mark a deal as closed-won", color: "#22c55e" },
    { id: "email",         icon: "✉️",  label: "Email",         desc: "Queue a draft to Outlook",   color: "#56BCEC" },
    { id: "push",          icon: "📲", label: "Push",          desc: "Send to Telegram",           color: "#A78BFA" },
    { id: "schedule",      icon: "📅", label: "Schedule",      desc: "Plan a ticket into calendar", color: "#FB923C" },
  ];
</script>

{#if quickAction.open}
  <div class="backdrop" onclick={close} role="presentation">
    <div
      class="modal glass-elev"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Quick actions"
    >
      <!-- header -->
      <div class="modal-head">
        <div class="head-left">
          {#if activeVerb}
            <button class="back-btn" onclick={() => { activeVerb = null; result = null; }} aria-label="Back">←</button>
          {/if}
          <div>
            <p class="eyebrow">QUICK ACTION</p>
            <h2 class="title">
              {#if !activeVerb}What do you want to do?
              {:else}{VERBS.find(v => v.id === activeVerb)?.label}
              {/if}
            </h2>
          </div>
        </div>
        <div class="head-right">
          <kbd class="shortcut">⌘⇧A</kbd>
          <button class="close-btn" onclick={close} aria-label="Close">×</button>
        </div>
      </div>

      <!-- verb picker -->
      {#if !activeVerb}
        <div class="verb-grid">
          {#each VERBS as v}
            <button class="verb-card" style="--vc:{v.color}" onclick={() => selectVerb(v.id)}>
              <span class="verb-icon">{v.icon}</span>
              <span class="verb-label">{v.label}</span>
              <span class="verb-desc">{v.desc}</span>
              <span class="verb-arrow">→</span>
            </button>
          {/each}
        </div>

      <!-- pipeline won form -->
      {:else if activeVerb === "pipeline-won"}
        <div class="form">
          <div class="field">
            <label class="field-label">Client</label>
            <select class="select" bind:value={wonClient}>
              <option value="">Select client…</option>
              {#each clients as c}
                <option value={c.code}>{c.name} ({c.code})</option>
              {/each}
            </select>
          </div>
          {#if result}
            <div class="result" class:ok={result.ok} class:err={!result.ok}>{result.msg}</div>
          {/if}
          <div class="form-foot">
            <button class="btn-ghost" onclick={close}>Cancel</button>
            <button class="btn-primary" style="--bc:#22c55e" onclick={submitPipelineWon} disabled={saving || !wonClient}>
              {saving ? "Saving…" : "Mark Won"}
            </button>
          </div>
        </div>

      <!-- email form -->
      {:else if activeVerb === "email"}
        <div class="form">
          <div class="field">
            <label class="field-label">To</label>
            <input class="input" type="email" placeholder="recipient@email.com" bind:value={emailTo} />
          </div>
          <div class="field">
            <label class="field-label">Subject</label>
            <input class="input" type="text" placeholder="Email subject…" bind:value={emailSubj} />
          </div>
          <div class="field">
            <label class="field-label">Body</label>
            <textarea class="textarea" rows="4" placeholder="Email body…" bind:value={emailBody}></textarea>
          </div>
          {#if result}
            <div class="result" class:ok={result.ok} class:err={!result.ok}>{result.msg}</div>
          {/if}
          <div class="form-foot">
            <button class="btn-ghost" onclick={close}>Cancel</button>
            <button class="btn-primary" style="--bc:#56BCEC" onclick={submitEmail} disabled={saving || !emailTo || !emailSubj || !emailBody}>
              {saving ? "Sending…" : "Queue Draft"}
            </button>
          </div>
        </div>

      <!-- push form -->
      {:else if activeVerb === "push"}
        <div class="form">
          <div class="field">
            <label class="field-label">Message</label>
            <textarea class="textarea" rows="3" placeholder="Message to send to Telegram…" bind:value={pushMsg}></textarea>
          </div>
          {#if result}
            <div class="result" class:ok={result.ok} class:err={!result.ok}>{result.msg}</div>
          {/if}
          <div class="form-foot">
            <button class="btn-ghost" onclick={close}>Cancel</button>
            <button class="btn-primary" style="--bc:#A78BFA" onclick={submitPush} disabled={saving || !pushMsg}>
              {saving ? "Sending…" : "Send Push"}
            </button>
          </div>
        </div>

      <!-- schedule -->
      {:else if activeVerb === "schedule"}
        <div class="form">
          <p class="schedule-hint">Opens the team planner where you can drag any open ticket into a calendar block.</p>
          <div class="form-foot">
            <button class="btn-ghost" onclick={close}>Cancel</button>
            <button class="btn-primary" style="--bc:#FB923C" onclick={submitSchedule}>Open Schedule →</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(11,16,32,.52);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  display: grid;
  place-items: center;
  padding: 20px;
  animation: fade-in 160ms var(--ease) both;
}
@keyframes fade-in { from { opacity:0; } to { opacity:1; } }

.modal {
  width: 100%;
  max-width: 480px;
  background: var(--glass-elev);
  -webkit-backdrop-filter: var(--blur-elev);
  backdrop-filter: var(--blur-elev);
  border: 1px solid var(--line);
  border-radius: var(--r3);
  box-shadow: var(--sh-card-hover);
  animation: slide-up 240ms var(--ease) both;
  overflow: hidden;
}
@keyframes slide-up { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }

/* header */
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 16px;
  border-bottom: 1px solid var(--line);
}
.head-left { display: flex; align-items: center; gap: 10px; }
.head-right { display: flex; align-items: center; gap: 8px; }
.eyebrow {
  font: 600 9.5px/1 'JetBrains Mono', monospace;
  letter-spacing: .14em;
  color: var(--brand-deep);
  text-transform: uppercase;
  margin: 0 0 4px;
}
.title {
  font: 700 17px/1.2 Inter, sans-serif;
  color: var(--ink);
  margin: 0;
  letter-spacing: -.03em;
}
.back-btn {
  all: unset;
  cursor: pointer;
  width: 28px; height: 28px;
  border-radius: 8px;
  display: grid; place-items: center;
  font-size: 16px;
  color: var(--ink-3);
  border: 1px solid var(--line);
  transition: all var(--dur) var(--ease);
}
.back-btn:hover { background: var(--canvas); color: var(--ink); }
.close-btn {
  all: unset;
  cursor: pointer;
  width: 28px; height: 28px;
  border-radius: 8px;
  display: grid; place-items: center;
  font-size: 19px;
  color: var(--ink-3);
  transition: all var(--dur) var(--ease);
}
.close-btn:hover { background: var(--canvas); color: var(--ink); }
.shortcut {
  font: 600 10px/1 'JetBrains Mono', monospace;
  padding: 3px 7px;
  border-radius: 6px;
  background: var(--line);
  color: var(--ink-2);
  border: 1px solid var(--line-2);
}

/* verb grid */
.verb-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 16px;
}
.verb-card {
  all: unset;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 16px 14px;
  border-radius: var(--r2);
  background: var(--canvas);
  border: 1px solid var(--line);
  position: relative;
  transition: all var(--dur) var(--ease);
}
.verb-card:hover {
  background: color-mix(in oklab, var(--vc) 8%, var(--canvas));
  border-color: color-mix(in oklab, var(--vc) 35%, transparent);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0,0,0,.08);
}
.verb-icon { font-size: 22px; line-height: 1; margin-bottom: 4px; }
.verb-label {
  font: 700 13.5px/1.2 Inter, sans-serif;
  color: var(--ink);
  letter-spacing: -.02em;
}
.verb-desc {
  font: 400 11.5px/1.3 Inter, sans-serif;
  color: var(--ink-3);
}
.verb-arrow {
  position: absolute;
  top: 14px; right: 14px;
  font-size: 14px;
  color: var(--ink-4);
  transition: transform var(--dur) var(--ease), color var(--dur) var(--ease);
}
.verb-card:hover .verb-arrow { transform: translateX(3px); color: var(--vc); }

/* forms */
.form {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label {
  font: 600 11px/1 Inter, sans-serif;
  color: var(--ink-2);
  letter-spacing: .03em;
}
.input, .select, .textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--canvas);
  font: 400 13.5px/1.4 Inter, sans-serif;
  color: var(--ink);
  outline: none;
  transition: border-color var(--dur) var(--ease);
  resize: vertical;
}
.input:focus, .select:focus, .textarea:focus { border-color: var(--brand-line-2); }
.textarea { min-height: 80px; font-family: inherit; }
.select { appearance: none; cursor: pointer; }

.schedule-hint {
  font: 400 14px/1.6 Inter, sans-serif;
  color: var(--ink-2);
  padding: 14px 16px;
  background: var(--canvas);
  border-radius: 10px;
  border: 1px solid var(--line);
}

.result {
  padding: 10px 14px;
  border-radius: 9px;
  font: 500 12.5px/1 Inter, sans-serif;
}
.result.ok { background: rgba(34,197,94,.1); color: var(--success); border: 1px solid rgba(34,197,94,.2); }
.result.err { background: rgba(239,68,68,.1); color: var(--danger); border: 1px solid rgba(239,68,68,.2); }

.form-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}
.btn-primary {
  all: unset;
  cursor: pointer;
  padding: 9px 18px;
  border-radius: 10px;
  background: var(--bc, var(--brand));
  color: #fff;
  font: 600 13px/1 Inter, sans-serif;
  box-shadow: 0 2px 8px color-mix(in oklab, var(--bc, var(--brand)) 40%, transparent);
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.btn-primary:hover { opacity: .9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; transform: none; }
.btn-ghost {
  all: unset;
  cursor: pointer;
  padding: 9px 14px;
  border-radius: 10px;
  border: 1px solid var(--line);
  font: 500 12.5px/1 Inter, sans-serif;
  color: var(--ink-2);
  transition: background var(--dur) var(--ease);
}
.btn-ghost:hover { background: var(--canvas); }

@media (max-width: 520px) {
  .verb-grid { grid-template-columns: 1fr; }
}
</style>
