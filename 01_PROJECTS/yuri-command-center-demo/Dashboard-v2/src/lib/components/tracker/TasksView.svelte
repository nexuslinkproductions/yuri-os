<script lang="ts">
  /**
   * TasksView.svelte — CHRONEX Phase 1 (2026-05-25).
   *
   * Admin (CTI) full CRUD on client_tasks. FK and other users see the same
   * grid but without hourly rates and without create/edit/delete actions.
   *
   * Layout:
   *   Header bar with [+ New task] (admin only) + active/archived toggle
   *   Per-client card sections, alphabetically by client_code
   *     each section: client code header (colored bar) + task rows
   *   Inline edit (click a row to expand into edit form)
   *
   * Reads via Supabase (RLS-public select). Writes via /api/functions/tasks-crud.
   */
  import { onMount } from "svelte";
  import { user } from "$stores/user.svelte";
  import { supabase, hasClient, postAuthed } from "$lib/db";
  import { toast } from "$components/GlassToast.svelte";

  type TaskRow = {
    id: string;
    client_code: string;
    title: string;
    description: string | null;
    category: string | null;
    is_billable: boolean;
    hourly_rate: number | null;
    color: string | null;
    sort_order: number;
    archived_at: string | null;
    created_at: string;
  };

  const CATEGORIES: { id: string; label: string }[] = [
    { id: "video",     label: "Video"     },
    { id: "photo",     label: "Photo"     },
    { id: "social",    label: "Social"    },
    { id: "marketing", label: "Marketing" },
    { id: "sales",     label: "Sales"     },
    { id: "it",        label: "IT"        },
    { id: "admin",     label: "Admin"     },
    { id: "other",     label: "Other"     },
  ];

  let tasks = $state<TaskRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showArchived = $state(false);
  let search = $state("");

  // Create form state
  let createOpen = $state(false);
  let createClient = $state("");
  let createTitle = $state("");
  let createCategory = $state<string>("other");
  let createRate = $state<string>("");
  let createBillable = $state(true);
  let createSaving = $state(false);

  // Edit state (one row at a time)
  let editingId = $state<string | null>(null);
  let editDraft = $state<Partial<TaskRow>>({});
  let editSaving = $state(false);

  const isAdmin = $derived(user.isAdmin);

  onMount(async () => {
    await load();
  });

  async function load() {
    if (!hasClient()) { error = "Database not configured"; loading = false; return; }
    loading = true;
    error = null;
    try {
      const { data, error: err } = await supabase()
        .from("client_tasks")
        .select("id, client_code, title, description, category, is_billable, hourly_rate, color, sort_order, archived_at, created_at")
        .order("client_code", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });
      if (err) throw new Error(err.message);
      tasks = (data ?? []) as TaskRow[];
    } catch (e: any) {
      error = e?.message || "Load failed";
    } finally {
      loading = false;
    }
  }

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t => {
      if (!showArchived && t.archived_at) return false;
      if (showArchived && !t.archived_at) return false;
      if (!q) return true;
      return (
        t.client_code.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.category ?? "").toLowerCase().includes(q)
      );
    });
  });

  const grouped = $derived.by(() => {
    const map = new Map<string, TaskRow[]>();
    for (const t of filtered) {
      const list = map.get(t.client_code) ?? [];
      list.push(t);
      map.set(t.client_code, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, items]) => ({ code, items }));
  });

  function openCreate() {
    if (!isAdmin) return;
    createOpen = true;
    createClient = "";
    createTitle = "";
    createCategory = "other";
    createRate = "";
    createBillable = true;
  }

  async function submitCreate() {
    if (createSaving) return;
    if (!createClient.trim() || !createTitle.trim()) {
      toast("Client code and title are required", "error");
      return;
    }
    createSaving = true;
    try {
      const r = await postAuthed("/api/functions/tasks-crud", {
        action: "create",
        client_code: createClient.trim().toUpperCase(),
        title: createTitle.trim(),
        category: createCategory || null,
        hourly_rate: createRate ? Number(createRate) : null,
        is_billable: createBillable,
      });
      if (r?.task) {
        tasks = [...tasks, r.task];
      }
      createOpen = false;
      toast("Task created", "ok");
    } catch (e: any) {
      toast(e?.message || "Create failed", "error");
    } finally {
      createSaving = false;
    }
  }

  function openEdit(t: TaskRow) {
    if (!isAdmin) return;
    editingId = t.id;
    editDraft = {
      client_code: t.client_code,
      title: t.title,
      category: t.category,
      hourly_rate: t.hourly_rate,
      is_billable: t.is_billable,
    };
  }
  function cancelEdit() { editingId = null; editDraft = {}; }

  async function saveEdit(id: string) {
    if (editSaving) return;
    editSaving = true;
    try {
      const patch: any = { action: "update", id };
      const d = editDraft;
      if (d.client_code !== undefined) patch.client_code = d.client_code;
      if (d.title !== undefined) patch.title = d.title;
      if (d.category !== undefined) patch.category = d.category;
      if (d.hourly_rate !== undefined) patch.hourly_rate = d.hourly_rate;
      if (d.is_billable !== undefined) patch.is_billable = d.is_billable;
      const r = await postAuthed("/api/functions/tasks-crud", patch);
      if (r?.task) {
        const idx = tasks.findIndex(t => t.id === id);
        if (idx >= 0) tasks[idx] = r.task;
      }
      editingId = null;
      editDraft = {};
      toast("Task updated", "ok");
    } catch (e: any) {
      toast(e?.message || "Update failed", "error");
    } finally {
      editSaving = false;
    }
  }

  async function archive(id: string) {
    if (!isAdmin) return;
    if (!confirm("Archive this task? Time entries linked to it stay intact.")) return;
    try {
      const r = await postAuthed("/api/functions/tasks-crud", { action: "archive", id });
      if (r?.task) {
        const idx = tasks.findIndex(t => t.id === id);
        if (idx >= 0) tasks[idx] = r.task;
      }
      toast("Archived", "ok");
    } catch (e: any) {
      toast(e?.message || "Archive failed", "error");
    }
  }

  async function restore(id: string) {
    if (!isAdmin) return;
    try {
      const r = await postAuthed("/api/functions/tasks-crud", { action: "restore", id });
      if (r?.task) {
        const idx = tasks.findIndex(t => t.id === id);
        if (idx >= 0) tasks[idx] = r.task;
      }
      toast("Restored", "ok");
    } catch (e: any) {
      toast(e?.message || "Restore failed", "error");
    }
  }

  function catLabel(cat: string | null): string {
    if (!cat) return "-";
    return CATEGORIES.find(c => c.id === cat)?.label ?? cat;
  }
</script>

<div class="tasks-view">
  <div class="head">
    <div class="head__title">
      <span class="eyebrow">CHRONEX / TASKS</span>
      <h2>Client Tasks</h2>
      <p class="sub">{tasks.filter(t => !t.archived_at).length} active task{tasks.filter(t => !t.archived_at).length === 1 ? "" : "s"} across {new Set(tasks.filter(t => !t.archived_at).map(t => t.client_code)).size} client{new Set(tasks.filter(t => !t.archived_at).map(t => t.client_code)).size === 1 ? "" : "s"}</p>
    </div>
    <div class="head__actions">
      <input class="search" type="search" placeholder="Search tasks..." bind:value={search} />
      <div class="toggle">
        <button type="button" class="toggle__btn" class:toggle__btn--active={!showArchived} onclick={() => showArchived = false}>Active</button>
        <button type="button" class="toggle__btn" class:toggle__btn--active={showArchived} onclick={() => showArchived = true}>Archived</button>
      </div>
      {#if isAdmin}
        <button type="button" class="add-btn" onclick={openCreate}>+ New task</button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="state">Loading tasks...</div>
  {:else if error}
    <div class="state state--err">{error}</div>
  {:else if grouped.length === 0}
    <div class="state">
      {showArchived ? "No archived tasks." : (search ? `No tasks match "${search}".` : "No tasks yet. Create one to start tracking.")}
    </div>
  {:else}
    <div class="groups">
      {#each grouped as g (g.code)}
        <section class="group">
          <header class="group__head" style={`--gh-accent: var(--client-${g.code}, var(--brand));`}>
            <span class="group__bar"></span>
            <span class="group__code">{g.code}</span>
            <span class="group__count">{g.items.length}</span>
          </header>
          <div class="group__body">
            {#each g.items as t (t.id)}
              {@const editing = editingId === t.id}
              <div class="task" class:task--edit={editing} class:task--arch={!!t.archived_at}>
                {#if editing}
                  <div class="edit-grid">
                    <label>
                      <span>Client code</span>
                      <input type="text" bind:value={editDraft.client_code} />
                    </label>
                    <label class="edit-grid--wide">
                      <span>Title</span>
                      <input type="text" bind:value={editDraft.title} />
                    </label>
                    <label>
                      <span>Category</span>
                      <select bind:value={editDraft.category}>
                        <option value={null}>-</option>
                        {#each CATEGORIES as c}<option value={c.id}>{c.label}</option>{/each}
                      </select>
                    </label>
                    <label>
                      <span>Rate (CHF/h)</span>
                      <input type="number" step="0.5" min="0" bind:value={editDraft.hourly_rate} />
                    </label>
                    <label class="edit-grid--check">
                      <input type="checkbox" bind:checked={editDraft.is_billable} />
                      <span>Billable</span>
                    </label>
                    <div class="edit-grid--actions">
                      <button type="button" class="btn btn--ghost" onclick={cancelEdit}>Cancel</button>
                      <button type="button" class="btn btn--primary" disabled={editSaving} onclick={() => saveEdit(t.id)}>
                        {editSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                {:else}
                  <div class="task__main">
                    <div class="task__title">{t.title}</div>
                    <div class="task__meta">
                      {#if t.category}<span class="chip chip--cat">{catLabel(t.category)}</span>{/if}
                      <span class="chip chip--bill" class:chip--off={!t.is_billable}>{t.is_billable ? "billable" : "non-billable"}</span>
                      {#if t.archived_at}<span class="chip chip--arch">archived</span>{/if}
                    </div>
                  </div>
                  <div class="task__rate">
                    {#if isAdmin}
                      {#if t.hourly_rate != null && t.hourly_rate > 0}
                        <span class="rate">CHF {Number(t.hourly_rate).toFixed(0)}<span class="rate__unit">/h</span></span>
                      {:else}
                        <span class="rate rate--muted">no rate</span>
                      {/if}
                    {:else}
                      <span class="rate rate--muted">-</span>
                    {/if}
                  </div>
                  {#if isAdmin}
                    <div class="task__actions">
                      <button type="button" class="iconbtn" title="Edit" aria-label="Edit" onclick={() => openEdit(t)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      {#if t.archived_at}
                        <button type="button" class="iconbtn iconbtn--restore" title="Restore" aria-label="Restore" onclick={() => restore(t.id)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                        </button>
                      {:else}
                        <button type="button" class="iconbtn iconbtn--danger" title="Archive" aria-label="Archive" onclick={() => archive(t.id)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                        </button>
                      {/if}
                    </div>
                  {/if}
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

<!-- Create modal -->
{#if createOpen}
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modal__backdrop" onclick={() => createOpen = false} role="presentation"></div>
    <div class="modal__box">
      <header class="modal__head">
        <h3>New client task</h3>
        <button type="button" class="iconbtn" aria-label="Close" onclick={() => createOpen = false}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>
      <div class="form-grid">
        <label>
          <span>Client code</span>
          <input type="text" placeholder="e.g. SHI" bind:value={createClient} />
        </label>
        <label>
          <span>Category</span>
          <select bind:value={createCategory}>
            {#each CATEGORIES as c}<option value={c.id}>{c.label}</option>{/each}
          </select>
        </label>
        <label class="form-grid--wide">
          <span>Title</span>
          <input type="text" placeholder="e.g. Social Media Management" bind:value={createTitle} />
        </label>
        <label>
          <span>Hourly rate (CHF)</span>
          <input type="number" step="0.5" min="0" placeholder="120" bind:value={createRate} />
        </label>
        <label class="form-grid--check">
          <input type="checkbox" bind:checked={createBillable} />
          <span>Billable</span>
        </label>
      </div>
      <footer class="modal__actions">
        <button type="button" class="btn btn--ghost" onclick={() => createOpen = false}>Cancel</button>
        <button type="button" class="btn btn--primary" disabled={createSaving} onclick={submitCreate}>
          {createSaving ? "Creating..." : "Create task"}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .tasks-view {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .head {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 16px;
    align-items: end;
    padding: 16px 18px;
    border-radius: var(--r2);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
  }
  .head__title { min-width: 0; }
  .eyebrow {
    font: 700 10.5px/1.3 var(--sa);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--brand-deep);
  }
  .head__title h2 {
    font-family: var(--hd);
    font-weight: 700;
    font-size: 22px;
    margin: 6px 0 4px;
    letter-spacing: -0.01em;
  }
  .sub { margin: 0; font-size: 12.5px; color: var(--t2); }
  .head__actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .search {
    appearance: none;
    height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    background: var(--s1);
    border: 1px solid var(--line);
    color: var(--tx);
    font: 500 13px/1 var(--sa);
    outline: none;
    min-width: 200px;
  }
  .search:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-line-2); }
  .toggle {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
    background: var(--s1);
  }
  .toggle__btn {
    appearance: none; border: 0;
    height: 36px; padding: 0 14px;
    background: transparent;
    font: 600 12px/1 var(--sa); color: var(--t3);
    cursor: pointer;
    transition: background 120ms, color 120ms;
  }
  .toggle__btn--active { background: var(--brand-softer); color: var(--brand-deep); }

  .add-btn {
    appearance: none; border: 1px solid var(--brand);
    background: linear-gradient(135deg, var(--brand) 0%, var(--brand-deep) 100%);
    color: #fff;
    height: 36px; padding: 0 16px;
    border-radius: 999px;
    font: 700 12.5px/1 var(--sa);
    cursor: pointer;
    box-shadow: 0 4px 18px -8px rgba(86,188,236,0.55);
    transition: transform 140ms, box-shadow 140ms;
  }
  .add-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 22px -6px rgba(86,188,236,0.7); }

  .state {
    padding: 40px 16px;
    text-align: center;
    color: var(--t3);
    font: 500 13.5px/1.5 var(--sa);
    border-radius: var(--r2);
    background: var(--glass-card);
    border: 1px dashed var(--line-2);
  }
  .state--err { color: var(--re); border-color: rgba(224,49,43,.4); }

  .groups { display: flex; flex-direction: column; gap: 14px; }
  .group {
    border-radius: var(--r2);
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
    overflow: hidden;
  }
  .group__head {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px;
    background: rgba(255,255,255,0.02);
    border-bottom: 1px solid var(--line);
  }
  .group__bar {
    width: 3px; height: 18px;
    background: var(--gh-accent);
    border-radius: 2px;
  }
  .group__code {
    font: 700 13px/1 var(--mo);
    color: var(--gh-accent);
    letter-spacing: 0.04em;
  }
  .group__count {
    font: 600 11px/1 var(--mo);
    color: var(--t3);
    padding: 3px 8px;
    background: var(--s1);
    border-radius: 999px;
  }
  .group__body {
    display: flex; flex-direction: column;
  }
  .task {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 12px;
    align-items: center;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
    transition: background 120ms;
  }
  .task:first-child { border-top: 0; }
  .task:hover { background: rgba(86,188,236,0.03); }
  .task--edit { background: var(--brand-softer); }
  .task--arch { opacity: 0.65; }
  .task__main { min-width: 0; }
  .task__title {
    font: 600 13.5px/1.3 var(--sa);
    color: var(--tx);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .task__meta {
    display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;
  }
  .chip {
    font: 600 10.5px/1.2 var(--sa);
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--s2);
    color: var(--t2);
  }
  .chip--cat { background: rgba(86,188,236,0.10); color: var(--brand-deep); }
  .chip--bill { background: rgba(30,160,51,0.10); color: var(--gr, #1ea033); }
  .chip--bill.chip--off { background: var(--s2); color: var(--t3); }
  .chip--arch { background: rgba(217,119,0,0.12); color: #d97700; }

  .task__rate {
    text-align: right;
    min-width: 90px;
  }
  .rate {
    font: 700 14px/1 var(--mo);
    color: var(--tx);
    font-variant-numeric: tabular-nums;
  }
  .rate__unit {
    font: 500 11px/1 var(--mo);
    color: var(--t3);
    margin-left: 2px;
  }
  .rate--muted { color: var(--t3); font-weight: 500; font-size: 12px; }

  .task__actions { display: flex; gap: 4px; }
  .iconbtn {
    appearance: none; border: 1px solid var(--line);
    background: var(--s1); color: var(--t2);
    width: 30px; height: 30px; border-radius: 8px;
    cursor: pointer;
    display: grid; place-items: center;
    transition: all 120ms;
  }
  .iconbtn:hover { background: var(--s2); color: var(--tx); border-color: var(--brand-line); }
  .iconbtn--danger:hover { color: var(--re); border-color: rgba(224,49,43,.4); }
  .iconbtn--restore:hover { color: var(--gr, #1ea033); border-color: rgba(30,160,51,.4); }

  /* Edit grid */
  .edit-grid {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr auto auto;
    gap: 10px;
    align-items: end;
    padding: 4px;
  }
  .edit-grid label { display: flex; flex-direction: column; gap: 4px; }
  .edit-grid--wide { grid-column: span 2; }
  .edit-grid label span {
    font: 600 10.5px/1.2 var(--sa);
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .edit-grid input[type="text"],
  .edit-grid input[type="number"],
  .edit-grid select {
    appearance: none;
    height: 32px; padding: 0 10px;
    border-radius: 8px;
    background: var(--s1); border: 1px solid var(--line);
    color: var(--tx);
    font: 500 12.5px/1 var(--sa);
    outline: none;
  }
  .edit-grid input:focus, .edit-grid select:focus { border-color: var(--brand); }
  .edit-grid--check {
    flex-direction: row !important;
    align-items: center !important;
    gap: 6px !important;
    padding-bottom: 6px;
  }
  .edit-grid--check span { text-transform: none !important; letter-spacing: 0 !important; color: var(--tx) !important; font-size: 12px !important; }
  .edit-grid--actions {
    display: flex; gap: 6px;
    grid-column: span 1;
  }
  .btn {
    appearance: none;
    height: 32px; padding: 0 14px;
    border-radius: 8px;
    font: 600 12px/1 var(--sa);
    cursor: pointer;
    border: 1px solid var(--line);
    transition: all 140ms;
  }
  .btn--ghost { background: transparent; color: var(--t2); }
  .btn--ghost:hover { color: var(--tx); border-color: var(--line-2); }
  .btn--primary { background: var(--brand); color: #fff; border-color: var(--brand); }
  .btn--primary:hover:not(:disabled) { filter: brightness(1.1); }
  .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Create modal */
  .modal {
    position: fixed; inset: 0;
    z-index: var(--z-modal, 1000);
    display: grid; place-items: center;
    padding: 20px;
  }
  .modal__backdrop {
    position: absolute; inset: 0;
    background: rgba(8,11,20,0.55);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .modal__box {
    position: relative;
    width: min(520px, 100%);
    padding: 20px 22px;
    border-radius: 16px;
    background: var(--glass-chrome);
    backdrop-filter: var(--blur-chrome);
    -webkit-backdrop-filter: var(--blur-chrome);
    border: 1px solid var(--brand-line);
    box-shadow: var(--sh-elev), 0 0 80px -20px rgba(86,188,236,0.40);
    animation: pop 220ms cubic-bezier(.34,1.56,.64,1) both;
  }
  @keyframes pop {
    from { opacity: 0; transform: translateY(8px) scale(.98); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }
  .modal__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .modal__head h3 { margin: 0; font: 700 16px/1.2 var(--hd); }
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .form-grid label { display: flex; flex-direction: column; gap: 4px; }
  .form-grid--wide { grid-column: 1 / -1; }
  .form-grid--check {
    grid-column: 1 / -1;
    flex-direction: row !important;
    align-items: center !important;
    gap: 8px !important;
  }
  .form-grid--check span { text-transform: none !important; letter-spacing: 0 !important; color: var(--tx) !important; font-size: 13px !important; }
  .form-grid label span {
    font: 600 11px/1.2 var(--sa);
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .form-grid input[type="text"],
  .form-grid input[type="number"],
  .form-grid select {
    appearance: none;
    height: 36px; padding: 0 12px;
    border-radius: 10px;
    background: var(--s1); border: 1px solid var(--line);
    color: var(--tx);
    font: 500 13px/1 var(--sa);
    outline: none;
  }
  .form-grid input:focus, .form-grid select:focus {
    border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-line-2);
  }
  .modal__actions {
    display: flex; justify-content: flex-end; gap: 8px;
    margin-top: 16px;
  }

  @media (max-width: 760px) {
    .head { grid-template-columns: 1fr; }
    .head__actions { justify-content: flex-start; }
    .search { min-width: 0; flex: 1; }
    .task { grid-template-columns: 1fr auto; }
    .task__rate { grid-column: 2; }
    .task__actions { grid-column: 1 / -1; justify-content: flex-end; }
    .edit-grid { grid-template-columns: 1fr 1fr; }
    .edit-grid--wide { grid-column: 1 / -1; }
    .edit-grid--actions { grid-column: 1 / -1; justify-content: flex-end; }
  }
</style>
