<script lang="ts" module>
  export type TaskPickResult = {
    client_code: string;
    client_task_id: string;
    task_title: string;
    is_billable: boolean;
    description?: string;
  };
</script>

<script lang="ts">
  /**
   * ClientTaskPicker — task-centric replacement for ClientTicketPicker.
   *
   * CEO directive (2026-05-15): tracker must pick a client + a recurring
   * "client task" (not a Plane.so ticket). No Plane worklog push. The
   * StopModal handles optional ticket reference linking AFTER stopping.
   *
   * Two steps inside a single glass modal:
   *   1. Client chips — distinct client_codes from client_tasks where
   *      archived_at IS NULL. Click to drill in.
   *   2. Task list  — tasks for that client. Each row shows the title,
   *      a billable chip, and optional hourly_rate. Inline "+ New task"
   *      adds another row without leaving the picker.
   *
   * On confirm we call onPick({ client_code, client_task_id, task_title,
   * is_billable, description? }) which the host wires to tracker.start.
   */
  import { supabase, hasClient } from "$lib/db";
  import { user } from "$stores/user.svelte";
  import {
    GlassActionPrimary,
    GlassActionSecondary,
    GlassValueChip,
  } from "$lib/components/glass";

  type ClientTaskRow = {
    id: string;
    client_code: string;
    title: string;
    description: string | null;
    is_billable: boolean;
    hourly_rate: number | null;
    color: string | null;
    sort_order: number | null;
    archived_at: string | null;
  };

  interface Props {
    open: boolean;
    onPick: (sel: TaskPickResult) => void;
    onClose: () => void;
  }
  const { open, onPick, onClose }: Props = $props();

  // ── State ──────────────────────────────────────────────────────────
  type Step = 1 | 2;
  let step = $state<Step>(1);
  let tasks = $state<ClientTaskRow[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let search = $state("");

  let pickedClient = $state<string | null>(null);
  let pickedTask = $state<ClientTaskRow | null>(null);
  let description = $state("");

  // Inline "+ new task" form
  let newTaskOpen = $state(false);
  let newTaskTitle = $state("");
  let newTaskBillable = $state(true);
  let newTaskSaving = $state(false);

  // ── Boot ───────────────────────────────────────────────────────────
  let booted = false;
  $effect(() => {
    if (!open || booted) return;
    booted = true;
    void load();
  });

  // Reset to step 1 every time it reopens
  $effect(() => {
    if (open) {
      step = 1;
      pickedClient = null;
      pickedTask = null;
      search = "";
      description = "";
      newTaskOpen = false;
      newTaskTitle = "";
      newTaskBillable = true;
    }
  });

  async function load() {
    if (!hasClient()) {
      error = "Supabase not configured";
      return;
    }
    loading = true;
    error = null;
    try {
      const { data, error: err } = await supabase()
        .from("client_tasks")
        .select("id, client_code, title, description, is_billable, hourly_rate, color, sort_order, archived_at")
        .is("archived_at", null)
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });
      if (err) throw new Error(err.message);
      tasks = (data ?? []) as ClientTaskRow[];
    } catch (e: any) {
      error = e?.message || "Failed to load tasks";
    } finally {
      loading = false;
    }
  }

  // ── Derived ────────────────────────────────────────────────────────
  const clientCodes = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const counts = new Map<string, number>();
    for (const t of tasks) {
      counts.set(t.client_code, (counts.get(t.client_code) ?? 0) + 1);
    }
    let codes = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
    if (q) codes = codes.filter((c) => c.toLowerCase().includes(q));
    return codes.map((code) => ({ code, taskCount: counts.get(code) ?? 0 }));
  });

  const visibleTasks = $derived.by(() => {
    if (!pickedClient) return [];
    const q = search.trim().toLowerCase();
    let list = tasks.filter((t) => t.client_code === pickedClient);
    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q));
    return list;
  });

  // ── Actions ────────────────────────────────────────────────────────
  function pickClient(code: string) {
    pickedClient = code;
    pickedTask = null;
    search = "";
    step = 2;
  }
  function pickTask(t: ClientTaskRow) {
    pickedTask = t;
  }
  function back() {
    if (step === 2) {
      step = 1;
      pickedClient = null;
      pickedTask = null;
      newTaskOpen = false;
    } else {
      onClose();
    }
  }
  function close() { onClose(); }

  async function saveNewTask() {
    if (!pickedClient || !newTaskTitle.trim()) return;
    if (!hasClient()) {
      error = "Supabase not configured";
      return;
    }
    newTaskSaving = true;
    try {
      const payload: Record<string, unknown> = {
        client_code: pickedClient,
        title: newTaskTitle.trim(),
        is_billable: newTaskBillable,
      };
      if (user.id) payload.created_by = user.id;
      const { data, error: err } = await supabase()
        .from("client_tasks")
        .insert(payload)
        .select("id, client_code, title, description, is_billable, hourly_rate, color, sort_order, archived_at")
        .single();
      if (err) throw new Error(err.message);
      const row = data as ClientTaskRow;
      tasks = [...tasks, row];
      pickedTask = row;
      newTaskOpen = false;
      newTaskTitle = "";
      newTaskBillable = true;
    } catch (e: any) {
      error = e?.message || "Could not create task";
    } finally {
      newTaskSaving = false;
    }
  }

  function confirm() {
    if (!pickedClient || !pickedTask) return;
    onPick({
      client_code: pickedClient,
      client_task_id: pickedTask.id,
      task_title: pickedTask.title,
      is_billable: pickedTask.is_billable,
      description: description.trim() || undefined,
    });
  }

  // ── Keyboard ───────────────────────────────────────────────────────
  function handleKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if open}
  <div class="picker" role="dialog" aria-modal="true" aria-label="Pick a client task to track">
    <div class="picker__backdrop" onclick={close} role="presentation"></div>

    <div class="picker__card" role="document">
      <header class="picker__head">
        <div class="picker__crumbs">
          <button type="button" class="crumb" class:active={step === 1} onclick={() => { step = 1; pickedClient = null; pickedTask = null; }}>1. Client</button>
          <span class="crumb__sep" aria-hidden="true">-&gt;</span>
          <button type="button" class="crumb" class:active={step === 2} disabled={!pickedClient} onclick={() => pickedClient && (step = 2)}>2. Task</button>
        </div>
        <button type="button" class="picker__close" aria-label="Close" onclick={close}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="picker__search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input
          type="text"
          placeholder={step === 1 ? "Search clients..." : "Search tasks..."}
          bind:value={search}
          autofocus
        />
      </div>

      <div class="picker__body">
        {#if loading && tasks.length === 0}
          <div class="picker__loading">Loading client tasks...</div>
        {:else if error}
          <div class="picker__error">! {error}</div>
        {:else if step === 1}
          <div class="grid">
            {#each clientCodes as c (c.code)}
              <button
                type="button"
                class="tile"
                onclick={() => pickClient(c.code)}
                style={`--tile-accent: var(--client-${c.code}, var(--brand));`}
              >
                <span class="tile__bar" aria-hidden="true"></span>
                <div class="tile__body">
                  <div class="tile__code">{c.code}</div>
                  <div class="tile__sub">{c.taskCount} task{c.taskCount === 1 ? "" : "s"}</div>
                </div>
                <div class="tile__meta">
                  <GlassValueChip tone="info" size="sm" static>
                    {#snippet children()}{c.taskCount}{/snippet}
                  </GlassValueChip>
                </div>
              </button>
            {/each}
            {#if clientCodes.length === 0}
              <div class="empty">No clients match "{search}".</div>
            {/if}
          </div>
        {:else if step === 2 && pickedClient}
          <div class="task-list">
            {#each visibleTasks as t (t.id)}
              <button
                type="button"
                class="task"
                class:task--picked={pickedTask?.id === t.id}
                onclick={() => pickTask(t)}
              >
                <div class="task__main">
                  <div class="task__title">{t.title}</div>
                  {#if t.description}
                    <div class="task__desc">{t.description}</div>
                  {/if}
                </div>
                <div class="task__meta">
                  {#if t.hourly_rate != null && t.hourly_rate > 0}
                    <GlassValueChip tone="neutral" size="sm" static>
                      {#snippet children()}CHF {Number(t.hourly_rate).toFixed(0)}/h{/snippet}
                    </GlassValueChip>
                  {/if}
                  <GlassValueChip tone={t.is_billable ? "success" : "neutral"} size="sm" static>
                    {#snippet children()}{t.is_billable ? "billable" : "non-billable"}{/snippet}
                  </GlassValueChip>
                </div>
              </button>
            {/each}
            {#if visibleTasks.length === 0 && !newTaskOpen}
              <div class="empty">
                No tasks for {pickedClient}{search ? ` matching "${search}"` : ""}.
              </div>
            {/if}

            <!-- + New task inline form -->
            {#if newTaskOpen}
              <div class="newtask">
                <input
                  type="text"
                  placeholder="Task title (e.g. Social Media Management)"
                  bind:value={newTaskTitle}
                  onkeydown={(e) => e.key === 'Enter' && saveNewTask()}
                  autofocus
                />
                <label class="newtask__toggle">
                  <input type="checkbox" bind:checked={newTaskBillable} />
                  <span>Billable</span>
                </label>
                <div class="newtask__actions">
                  <button type="button" class="newtask__btn newtask__btn--ghost" onclick={() => { newTaskOpen = false; newTaskTitle = ""; }}>
                    Cancel
                  </button>
                  <button type="button" class="newtask__btn newtask__btn--primary" onclick={saveNewTask} disabled={newTaskSaving || !newTaskTitle.trim()}>
                    {newTaskSaving ? "Saving..." : "Save task"}
                  </button>
                </div>
              </div>
            {:else}
              <button type="button" class="add-task" onclick={() => { newTaskOpen = true; newTaskTitle = ""; newTaskBillable = true; }}>
                + New task for {pickedClient}
              </button>
            {/if}

            {#if pickedTask}
              <div class="confirm-field">
                <label>
                  <span>Description (optional)</span>
                  <input
                    type="text"
                    placeholder="What specifically are you working on?"
                    bind:value={description}
                  />
                </label>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <footer class="picker__foot">
        <GlassActionSecondary onclick={back}>
          {#snippet children()}{step === 1 ? "Cancel" : "< Back"}{/snippet}
        </GlassActionSecondary>
        {#if step === 2 && pickedTask}
          <GlassActionPrimary onclick={confirm}>
            {#snippet children()}Start timer{/snippet}
          </GlassActionPrimary>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  .picker {
    position: fixed; inset: 0;
    z-index: var(--z-modal, 1000);
    display: grid; place-items: center;
    padding: 20px;
  }
  .picker__backdrop {
    position: absolute; inset: 0;
    background: rgba(8, 11, 20, 0.55);
    backdrop-filter: blur(10px) saturate(1.2);
    -webkit-backdrop-filter: blur(10px) saturate(1.2);
  }
  .picker__card {
    position: relative;
    width: min(680px, 100%);
    max-height: 88vh;
    display: flex; flex-direction: column;
    border-radius: 16px;
    background: var(--glass-chrome);
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    border: 1px solid var(--brand-line);
    box-shadow: var(--sh-elev), 0 0 80px -20px rgba(86,188,236,0.40);
    font-family: var(--sa);
    overflow: hidden;
    animation: picker-pop 220ms var(--tier-spring, cubic-bezier(.34,1.56,.64,1)) both;
  }
  @keyframes picker-pop {
    from { opacity: 0; transform: translateY(8px) scale(.98); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .picker__head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--line);
  }
  .picker__crumbs { display: flex; align-items: center; gap: 8px; }
  .crumb {
    appearance: none; border: 0; padding: 4px 10px;
    background: transparent; color: var(--t3); cursor: pointer;
    font: 600 11px/1.2 var(--sa); letter-spacing: 0.04em; text-transform: uppercase;
    border-radius: 6px;
    transition: color 140ms, background 140ms;
  }
  .crumb.active { color: var(--brand-deep); background: var(--brand-soft); }
  .crumb:disabled { opacity: 0.45; cursor: not-allowed; }
  .crumb__sep { color: var(--t4); font-size: 12px; font-family: var(--mo); }

  .picker__close {
    appearance: none; border: 1px solid var(--line);
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--s1); color: var(--t2); cursor: pointer;
    display: grid; place-items: center;
    transition: all 120ms;
  }
  .picker__close:hover { background: var(--s2); color: var(--tx); border-color: var(--line-2); }

  .picker__search {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--line);
    color: var(--t3);
  }
  .picker__search input {
    flex: 1;
    appearance: none; border: 0; background: transparent;
    color: var(--tx);
    font: 500 14px/1.4 var(--sa);
    outline: none;
  }
  .picker__search input::placeholder { color: var(--t3); }

  .picker__body {
    flex: 1; min-height: 0; overflow: auto;
    padding: 16px 20px;
  }
  .picker__loading, .picker__error, .empty {
    padding: 32px 16px; text-align: center;
    color: var(--t3); font: 500 13px/1.5 var(--sa);
  }
  .picker__error { color: var(--re); }

  /* Step 1 - client tiles */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 8px;
  }
  .tile {
    appearance: none; border: 1px solid var(--line);
    background: var(--s1); color: var(--tx);
    border-radius: 12px;
    padding: 12px 14px;
    cursor: pointer;
    display: grid; grid-template-columns: 4px 1fr auto; gap: 10px;
    align-items: center; text-align: left;
    transition: all 140ms var(--ease);
    overflow: hidden;
  }
  .tile:hover { background: var(--s2); border-color: var(--brand-line); transform: translateY(-1px); }
  .tile__bar { background: var(--tile-accent); align-self: stretch; }
  .tile__body { min-width: 0; }
  .tile__code { font: 700 13px/1 var(--mo); color: var(--brand-deep); letter-spacing: 0.04em; }
  .tile__sub { font: 500 11.5px/1.3 var(--sa); color: var(--t3); margin-top: 2px; }

  /* Step 2 - task list */
  .task-list { display: flex; flex-direction: column; gap: 6px; }
  .task {
    appearance: none; border: 1px solid var(--line);
    background: var(--s1); color: var(--tx);
    border-radius: 10px;
    padding: 12px 14px;
    cursor: pointer; text-align: left;
    display: grid; grid-template-columns: 1fr auto; gap: 12px;
    align-items: center;
    transition: all 140ms;
  }
  .task:hover { background: var(--s2); border-color: var(--brand-line); }
  .task--picked {
    background: var(--brand-softer);
    border-color: var(--brand);
    box-shadow: 0 0 0 2px var(--brand-line-2);
  }
  .task__main { min-width: 0; }
  .task__title { font: 600 13.5px/1.3 var(--sa); color: var(--tx); }
  .task__desc {
    font: 500 12px/1.3 var(--sa); color: var(--t3); margin-top: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .task__meta { display: inline-flex; gap: 6px; align-items: center; }

  .add-task {
    appearance: none;
    border: 1px dashed var(--brand-line);
    background: var(--brand-softer);
    color: var(--brand-deep);
    border-radius: 10px;
    padding: 10px 14px;
    cursor: pointer;
    font: 600 12.5px/1.2 var(--sa);
    text-align: left;
    transition: all 140ms;
  }
  .add-task:hover { background: var(--brand-soft); border-color: var(--brand); }

  .newtask {
    display: flex; flex-direction: column; gap: 8px;
    padding: 12px;
    border-radius: 10px;
    background: var(--brand-softer);
    border: 1px solid var(--brand-line);
  }
  .newtask input[type="text"] {
    appearance: none;
    height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    background: var(--s1);
    border: 1px solid var(--line);
    color: var(--tx);
    font: 500 13px/1 var(--sa);
    outline: none;
  }
  .newtask input[type="text"]:focus { border-color: var(--brand); }
  .newtask__toggle {
    display: flex; align-items: center; gap: 8px;
    font: 500 12.5px/1 var(--sa); color: var(--tx);
    cursor: pointer;
  }
  .newtask__toggle input { width: 16px; height: 16px; accent-color: var(--brand); }
  .newtask__actions { display: flex; justify-content: flex-end; gap: 6px; }
  .newtask__btn {
    appearance: none;
    height: 32px; padding: 0 14px;
    border-radius: 8px;
    font: 600 12px/1 var(--sa);
    cursor: pointer;
    border: 1px solid var(--line);
    transition: all 140ms;
  }
  .newtask__btn--ghost { background: transparent; color: var(--t2); }
  .newtask__btn--ghost:hover { color: var(--tx); border-color: var(--line-2); }
  .newtask__btn--primary { background: var(--brand); color: #fff; border-color: var(--brand); }
  .newtask__btn--primary:hover:not(:disabled) { filter: brightness(1.1); }
  .newtask__btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .confirm-field {
    margin-top: 12px;
    padding: 12px;
    border-radius: 10px;
    background: var(--s1);
    border: 1px solid var(--line);
  }
  .confirm-field label { display: flex; flex-direction: column; gap: 6px; }
  .confirm-field span {
    font: 600 11px/1.2 var(--sa);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--t3);
  }
  .confirm-field input {
    appearance: none;
    height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    background: var(--canvas-2, var(--bg));
    border: 1px solid var(--line);
    color: var(--tx);
    font: 500 13px/1 var(--sa);
    outline: none;
  }
  .confirm-field input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-line-2); }

  .picker__foot {
    display: flex; justify-content: space-between; align-items: center;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--line);
  }

  @media (max-width: 640px) {
    .picker { padding: 0; }
    .picker__card { max-height: 100vh; height: 100vh; border-radius: 0; width: 100%; }
    .grid { grid-template-columns: 1fr 1fr; }
  }
</style>
