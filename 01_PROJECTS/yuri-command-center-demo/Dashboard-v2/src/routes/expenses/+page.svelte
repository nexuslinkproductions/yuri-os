<script lang="ts">
  /**
   * /expenses - AP (Accounts Payable) creditor invoice tracker.
   *
   * What c2moviez OWES or HAS PAID to vendors (Anthropic, Swisscom, Adobe,
   * subcontractors, etc.). Mirror of /revenue (AR) on the other side of the
   * ledger. Links to NEXdoc scans when an expense came from an auto-scanned
   * vendor invoice.
   */
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { getAuthed, postAuthed } from "$lib/db";

  type ExpenseStatus = "open" | "paid" | "disputed" | "cancelled";

  type Expense = {
    id: string;
    user_id: string;
    vendor_name: string;
    vendor_uid: string | null;
    vendor_iban: string | null;
    document_nr: string | null;
    document_date: string;
    due_date: string | null;
    currency: string;
    amount_net: number;
    vat_rate: number | null;
    vat_amount: number | null;
    amount_gross: number;
    category: string | null;
    notes: string | null;
    status: ExpenseStatus;
    paid_date: string | null;
    paid_via: string | null;
    paid_account: string | null;
    scanned_doc_id: string | null;
    created_at: string;
    updated_at: string;
  };

  type Totals = {
    total_open: number;
    total_paid_ytd: number;
    total_month: number;
    count_open: number;
    count_overdue: number;
  };

  type ScannedInvoice = {
    id: string;
    vendor_name: string | null;
    document_nr: string | null;
    document_date: string | null;
    due_date: string | null;
    amount_net: number | null;
    amount_gross: number | null;
    vat_amount: number | null;
    currency: string | null;
    category: string | null;
    auto_title: string | null;
  };

  type Tab = "overview" | "list" | "add";
  type FilterStatus = "all" | ExpenseStatus | "overdue";

  const CATEGORIES = [
    "Hosting", "AI", "SaaS", "Equipment", "Travel",
    "Subcontractor", "Marketing", "Office", "Other",
  ];
  const VAT_RATES = [
    { value: 8.1, label: "8.1% (Standard CH)" },
    { value: 3.8, label: "3.8% (Beherbergung)" },
    { value: 2.6, label: "2.6% (Reduziert)" },
    { value: 0,   label: "0% (Steuerfrei)" },
  ];

  // ──────────────────────────── state ────────────────────────────
  let tab = $state<Tab>("overview");
  let expenses = $state<Expense[]>([]);
  let totals = $state<Totals>({
    total_open: 0, total_paid_ytd: 0, total_month: 0,
    count_open: 0, count_overdue: 0,
  });
  let loading = $state(true);
  let listError = $state("");

  let filterStatus = $state<FilterStatus>("all");
  let filterCategory = $state<string>("all");

  // Add drawer
  let addDrawerOpen = $state(false);
  let saving = $state(false);
  let saveError = $state("");

  let formVendor = $state("");
  let formDate = $state("");
  let formDueDate = $state("");
  let formDocNr = $state("");
  let formCurrency = $state("CHF");
  let formAmountNet = $state("");
  let formVatRate = $state<number>(8.1);
  let formCategory = $state<string>("Other");
  let formNotes = $state("");
  let formScannedDocId = $state<string | null>(null);

  // Edit drawer
  let editDrawerOpen = $state(false);
  let selectedExpense = $state<Expense | null>(null);
  let editError = $state("");
  let editSaving = $state(false);

  // NEXdoc picker modal
  let nexdocPickerOpen = $state(false);
  let nexdocCandidates = $state<ScannedInvoice[]>([]);
  let nexdocLoading = $state(false);
  let nexdocError = $state("");

  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });

  // ──────────────────────────── derived ────────────────────────────
  const formVatAmount = $derived(
    formAmountNet && formVatRate >= 0
      ? Math.round(parseFloat(formAmountNet || "0") * formVatRate) / 100
      : 0,
  );
  const formAmountGross = $derived(
    formAmountNet
      ? Math.round((parseFloat(formAmountNet || "0") + formVatAmount) * 100) / 100
      : 0,
  );
  const formValid = $derived(
    !!formVendor.trim() && !!formDate && !!formAmountNet
      && Number.isFinite(parseFloat(formAmountNet))
      && parseFloat(formAmountNet) > 0,
  );

  const filteredExpenses = $derived(
    expenses.filter((e) => {
      if (filterStatus === "overdue") {
        if (e.status !== "open") return false;
        if (!e.due_date || e.due_date >= todayISO) return false;
      } else if (filterStatus !== "all") {
        if (e.status !== filterStatus) return false;
      }
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      return true;
    }),
  );

  const overdueExpenses = $derived(
    expenses.filter((e) => e.status === "open" && e.due_date && e.due_date < todayISO),
  );

  const recentExpenses = $derived(expenses.slice(0, 5));

  // Monthly spend (last 6 months) from document_date.
  const monthlySpend = $derived.by(() => {
    const months: { key: string; label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("de-CH", { month: "short" });
      months.push({ key, label, total: 0 });
    }
    for (const e of expenses) {
      if (!e.document_date) continue;
      const k = String(e.document_date).slice(0, 7);
      const slot = months.find((m) => m.key === k);
      if (slot) slot.total += Number(e.amount_gross) || 0;
    }
    return months;
  });

  const monthlyMax = $derived(
    Math.max(1, ...monthlySpend.map((m) => m.total)),
  );

  // Category breakdown YTD.
  const categoryBreakdown = $derived.by(() => {
    const yearNow = todayISO.slice(0, 4);
    const buckets = new Map<string, number>();
    for (const e of expenses) {
      if (!e.document_date || !String(e.document_date).startsWith(yearNow)) continue;
      const cat = e.category || "Other";
      buckets.set(cat, (buckets.get(cat) || 0) + (Number(e.amount_gross) || 0));
    }
    const arr = Array.from(buckets.entries()).map(([k, v]) => ({ category: k, total: v }));
    arr.sort((a, b) => b.total - a.total);
    const sum = arr.reduce((s, x) => s + x.total, 0);
    return arr.map((x) => ({ ...x, pct: sum > 0 ? (x.total / sum) * 100 : 0 }));
  });

  // ──────────────────────────── helpers ────────────────────────────
  function fmtCHF(n: number | null | undefined, ccy = "CHF"): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return `${ccy} 0`;
    return `${ccy} ${Math.round(n).toLocaleString("de-CH")}`;
  }
  function fmtCHFShort(n: number | null | undefined): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return "CHF 0";
    if (n >= 1_000_000) return "CHF " + (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return "CHF " + (n / 1_000).toFixed(1) + "k";
    return "CHF " + Math.round(n);
  }
  function fmtDate(s: string | null | undefined): string {
    if (!s) return "-";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function statusTone(s: ExpenseStatus, overdue: boolean): string {
    if (overdue) return "danger";
    if (s === "paid") return "good";
    if (s === "open") return "warn";
    if (s === "disputed") return "amber";
    return "muted";
  }
  function isOverdue(e: Expense): boolean {
    return e.status === "open" && !!e.due_date && e.due_date < todayISO;
  }
  function categoryColor(cat: string): string {
    const palette: Record<string, string> = {
      "Hosting":       "#0ea5e9",
      "AI":            "#8b5cf6",
      "SaaS":          "#06b6d4",
      "Equipment":     "#f59e0b",
      "Travel":        "#10b981",
      "Subcontractor": "#f97316",
      "Marketing":     "#ec4899",
      "Office":        "#6b7280",
      "Other":         "#94a3b8",
    };
    return palette[cat] || "#94a3b8";
  }

  // ──────────────────────────── data ────────────────────────────
  async function loadExpenses() {
    loading = true;
    listError = "";
    try {
      const data = await getAuthed("/api/functions/expenses-list?status=all&limit=500");
      expenses = (data?.items ?? []) as Expense[];
      if (data?.totals) totals = data.totals as Totals;
    } catch (e: any) {
      listError = e?.message || "Could not load expenses";
    } finally {
      loading = false;
    }
  }

  function resetForm() {
    formVendor = "";
    formDate = todayISO;
    formDueDate = "";
    formDocNr = "";
    formCurrency = "CHF";
    formAmountNet = "";
    formVatRate = 8.1;
    formCategory = "Other";
    formNotes = "";
    formScannedDocId = null;
    saveError = "";
  }

  function openAddDrawer() {
    resetForm();
    addDrawerOpen = true;
  }
  function closeAddDrawer() {
    if (saving) return;
    addDrawerOpen = false;
  }

  async function submitNewExpense() {
    if (!formValid || saving) return;
    saving = true;
    saveError = "";
    try {
      const res = await postAuthed("/api/functions/expenses-create", {
        vendor_name: formVendor.trim(),
        document_date: formDate,
        due_date: formDueDate || null,
        document_nr: formDocNr.trim() || null,
        currency: formCurrency || "CHF",
        amount_net: parseFloat(formAmountNet),
        vat_rate: formVatRate,
        vat_amount: formVatAmount,
        category: formCategory || null,
        notes: formNotes.trim() || null,
        scanned_doc_id: formScannedDocId,
      });
      if (res?.expense) {
        expenses = [res.expense as Expense, ...expenses];
        // Re-pull totals for accuracy.
        loadExpenses();
        addDrawerOpen = false;
        tab = "list";
        // URL sync
        const url = new URL($page.url);
        url.searchParams.set("tab", "list");
        goto(url.toString(), { replaceState: true, noScroll: true });
      }
    } catch (e: any) {
      saveError = e?.message || "Could not save expense";
    } finally {
      saving = false;
    }
  }

  async function markPaid(e: Expense) {
    try {
      const res = await patchExpense(e.id, { status: "paid", paid_date: todayISO });
      if (res?.expense) {
        expenses = expenses.map((x) => (x.id === e.id ? (res.expense as Expense) : x));
        loadExpenses();
      }
    } catch (err: any) {
      console.warn("[expenses] markPaid", err?.message);
    }
  }

  async function patchExpense(id: string, patch: Partial<Expense>) {
    const r = await fetch("/api/functions/expenses-update", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await getAccessToken()}`,
      },
      body: JSON.stringify({ id, ...patch }),
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) throw new Error(json?.error || `update ${r.status}`);
    return json;
  }

  async function getAccessToken(): Promise<string> {
    const mod = await import("$lib/db");
    const sb = mod.supabase();
    const { data } = await sb.auth.getSession();
    const t = data?.session?.access_token;
    if (!t) throw new Error("not authenticated");
    return t;
  }

  function openEditDrawer(e: Expense) {
    selectedExpense = { ...e };
    editDrawerOpen = true;
    editError = "";
  }
  function closeEditDrawer() {
    if (editSaving) return;
    editDrawerOpen = false;
    selectedExpense = null;
  }

  async function saveEdit() {
    if (!selectedExpense || editSaving) return;
    editSaving = true;
    editError = "";
    try {
      const e = selectedExpense;
      const res = await patchExpense(e.id, {
        status: e.status,
        vendor_name: e.vendor_name,
        document_nr: e.document_nr,
        document_date: e.document_date,
        due_date: e.due_date,
        currency: e.currency,
        amount_net: e.amount_net,
        vat_rate: e.vat_rate,
        vat_amount: e.vat_amount,
        category: e.category,
        notes: e.notes,
        paid_date: e.paid_date,
        paid_via: e.paid_via,
        paid_account: e.paid_account,
      });
      if (res?.expense) {
        expenses = expenses.map((x) => (x.id === e.id ? (res.expense as Expense) : x));
        loadExpenses();
        editDrawerOpen = false;
      }
    } catch (err: any) {
      editError = err?.message || "Could not save";
    } finally {
      editSaving = false;
    }
  }

  // NEXdoc picker
  async function openNexdocPicker() {
    nexdocPickerOpen = true;
    nexdocLoading = true;
    nexdocError = "";
    try {
      const data = await getAuthed(
        "/api/functions/nexdoc-list?type=invoice&status=accepted&limit=20",
      );
      const all = (data?.items ?? []) as any[];
      // Filter out those already linked.
      const linked = new Set(expenses.map((e) => e.scanned_doc_id).filter(Boolean));
      nexdocCandidates = all
        .filter((d) => !linked.has(d.id))
        .map((d) => ({
          id: d.id,
          vendor_name: d.vendor_name,
          document_nr: d.document_nr,
          document_date: d.document_date,
          due_date: d.due_date,
          amount_net: d.amount_net,
          amount_gross: d.amount_gross,
          vat_amount: d.vat_amount,
          currency: d.currency,
          category: d.category,
          auto_title: d.auto_title,
        }));
    } catch (e: any) {
      nexdocError = e?.message || "Could not load NEXdoc invoices";
    } finally {
      nexdocLoading = false;
    }
  }
  function closeNexdocPicker() {
    nexdocPickerOpen = false;
  }
  function selectNexdoc(d: ScannedInvoice) {
    formScannedDocId = d.id;
    if (d.vendor_name) formVendor = d.vendor_name;
    if (d.document_date) formDate = d.document_date;
    if (d.due_date) formDueDate = d.due_date;
    if (d.document_nr) formDocNr = d.document_nr;
    if (d.currency) formCurrency = d.currency;
    if (d.category) formCategory = d.category;
    if (d.amount_net !== null && d.amount_net !== undefined) {
      formAmountNet = String(d.amount_net);
    } else if (d.amount_gross !== null && d.amount_gross !== undefined && d.vat_amount !== null && d.vat_amount !== undefined) {
      formAmountNet = String(Math.round((Number(d.amount_gross) - Number(d.vat_amount)) * 100) / 100);
    } else if (d.amount_gross !== null && d.amount_gross !== undefined) {
      // Assume 8.1% if unknown.
      formAmountNet = String(Math.round((Number(d.amount_gross) / 1.081) * 100) / 100);
    }
    nexdocPickerOpen = false;
  }

  // ──────────────────────────── tab routing ────────────────────────────
  function setTab(t: Tab) {
    tab = t;
    const url = new URL($page.url);
    url.searchParams.set("tab", t);
    goto(url.toString(), { replaceState: true, noScroll: true });
    if (t === "add") openAddDrawer();
  }

  onMount(() => {
    const t = $page.url.searchParams.get("tab") as Tab | null;
    if (t === "overview" || t === "list" || t === "add") {
      tab = t;
      if (t === "add") openAddDrawer();
    }
    loadExpenses();
  });
</script>

<svelte:head>
  <title>Expenses · NEX</title>
</svelte:head>

<header class="page-header">
  <div class="hdr-row">
    <h1>Expenses</h1>
    <span class="live-pill">Accounts Payable</span>
    <button type="button" class="refresh-btn" onclick={loadExpenses} disabled={loading} aria-label="Refresh">
      {loading ? "..." : "Refresh"}
    </button>
  </div>
  <div class="hdr-sub">
    <span>What c2moviez owes or has paid to vendors. AP ledger, synced from NEXdoc.</span>
    <span class="dot">·</span>
    <a class="hdr-link" href="/nexdoc">NEXdoc -&gt;</a>
    <span class="dot">·</span>
    <a class="hdr-link" href="/revenue">Revenue (AR) -&gt;</a>
  </div>
</header>

<nav class="tab-row" aria-label="Expenses sections">
  <button type="button" class="tab-btn" class:active={tab === "overview"} onclick={() => setTab("overview")}>
    <span class="tab-icon" aria-hidden="true">◆</span>
    Overview
  </button>
  <button type="button" class="tab-btn" class:active={tab === "list"} onclick={() => setTab("list")}>
    <span class="tab-icon" aria-hidden="true">▤</span>
    List
    {#if expenses.length}<span class="tab-count">{expenses.length}</span>{/if}
  </button>
  <button type="button" class="tab-btn" class:active={tab === "add"} onclick={() => setTab("add")}>
    <span class="tab-icon" aria-hidden="true">+</span>
    Add
  </button>
</nav>

{#if listError}
  <div class="banner banner-err">{listError}</div>
{/if}

{#if tab === "overview"}
  <section class="kpis kpi-row">
    <div class="kpi-chip tone-warn">
      <div class="kpi-label">Total Open</div>
      <div class="kpi-value">{fmtCHFShort(totals.total_open)}</div>
      <div class="kpi-sub">{totals.count_open} open</div>
    </div>
    <div class="kpi-chip tone-good">
      <div class="kpi-label">Paid YTD</div>
      <div class="kpi-value">{fmtCHFShort(totals.total_paid_ytd)}</div>
      <div class="kpi-sub">{todayISO.slice(0, 4)}</div>
    </div>
    <div class="kpi-chip" class:tone-danger={totals.count_overdue > 0}>
      <div class="kpi-label">Overdue</div>
      <div class="kpi-value">{totals.count_overdue}</div>
      <div class="kpi-sub">{totals.count_overdue === 1 ? "invoice" : "invoices"}</div>
    </div>
    <div class="kpi-chip tone-info">
      <div class="kpi-label">This Month</div>
      <div class="kpi-value">{fmtCHFShort(totals.total_month)}</div>
      <div class="kpi-sub">gross spend</div>
    </div>
  </section>

  <div class="grid-2col">
    <section class="glass-card">
      <div class="card-head">
        <h2>Monthly Spend</h2>
        <span class="card-sub">last 6 months</span>
      </div>
      <div class="chart-wrap">
        <svg viewBox="0 0 360 180" preserveAspectRatio="none" class="bar-chart" aria-label="Monthly spend chart">
          <defs>
            <linearGradient id="expBarGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"   stop-color="#56bcec" stop-opacity="1" />
              <stop offset="100%" stop-color="#56bcec" stop-opacity="0.40" />
            </linearGradient>
          </defs>
          {#each monthlySpend as m, i}
            {@const w = 44}
            {@const gap = 12}
            {@const x = 10 + i * (w + gap)}
            {@const h = (m.total / monthlyMax) * 130}
            {@const y = 150 - h}
            <rect class="exp-bar" x={x} y={y} width={w} height={Math.max(h, 2)} rx="4" fill="url(#expBarGrad)" style="--bar-h: {Math.max(h, 2)}px;" />
            <text x={x + w / 2} y="170" text-anchor="middle" fill="var(--ink-2)" font-size="10">{m.label}</text>
            <text x={x + w / 2} y={y - 6} text-anchor="middle" fill="var(--ink)" font-size="9.5" font-weight="600">
              {m.total > 0 ? fmtCHFShort(m.total) : ""}
            </text>
          {/each}
        </svg>
      </div>
    </section>

    <section class="glass-card">
      <div class="card-head">
        <h2>By Category (YTD)</h2>
        <span class="card-sub">{categoryBreakdown.length} categories</span>
      </div>
      {#if categoryBreakdown.length === 0}
        <div class="empty">No expenses booked this year.</div>
      {:else}
        <ul class="cat-list">
          {#each categoryBreakdown as c}
            <li class="cat-row">
              <div class="cat-head">
                <span class="cat-dot" style="background: {categoryColor(c.category)};"></span>
                <span class="cat-name">{c.category}</span>
                <span class="cat-amount">{fmtCHF(c.total)}</span>
              </div>
              <div class="cat-bar">
                <div class="cat-fill" style="width: {c.pct.toFixed(1)}%; background: {categoryColor(c.category)};"></div>
              </div>
              <div class="cat-pct">{c.pct.toFixed(1)}%</div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>

  <section class="glass-card">
    <div class="card-head">
      <h2>Recent Expenses</h2>
      <button type="button" class="glass-btn glass-btn--ghost" onclick={() => setTab("list")}>View all</button>
    </div>
    {#if recentExpenses.length === 0}
      <div class="empty">No expenses yet. Click Add to book your first one.</div>
    {:else}
      <ul class="recent-list">
        {#each recentExpenses as e}
          {@const ov = isOverdue(e)}
          <li class="recent-row">
            <div class="recent-left">
              <div class="recent-vendor">{e.vendor_name}</div>
              <div class="recent-meta">
                <span>{fmtDate(e.document_date)}</span>
                {#if e.category}<span class="dot">·</span><span>{e.category}</span>{/if}
              </div>
            </div>
            <div class="recent-right">
              <div class="recent-amount">{fmtCHF(e.amount_gross, e.currency)}</div>
              <span class="status-chip status-{statusTone(e.status, ov)}">
                {ov ? "overdue" : e.status}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

{#if tab === "list"}
  <section class="glass-card">
    <div class="filter-row">
      <button type="button" class="filter-btn" class:active={filterStatus === "all"} onclick={() => (filterStatus = "all")}>All</button>
      <button type="button" class="filter-btn" class:active={filterStatus === "open"} onclick={() => (filterStatus = "open")}>Open</button>
      <button type="button" class="filter-btn" class:active={filterStatus === "paid"} onclick={() => (filterStatus = "paid")}>Paid</button>
      <button type="button" class="filter-btn" class:active={filterStatus === "overdue"} onclick={() => (filterStatus = "overdue")}>
        Overdue{totals.count_overdue > 0 ? ` (${totals.count_overdue})` : ""}
      </button>
      <button type="button" class="filter-btn" class:active={filterStatus === "disputed"} onclick={() => (filterStatus = "disputed")}>Disputed</button>

      <div class="filter-spacer"></div>

      <label class="cat-select">
        <span>Category</span>
        <select bind:value={filterCategory}>
          <option value="all">All</option>
          {#each CATEGORIES as c}
            <option value={c}>{c}</option>
          {/each}
        </select>
      </label>

      <button type="button" class="glass-btn glass-btn--primary" onclick={openAddDrawer}>Add Expense</button>
    </div>

    <div class="table-wrap">
      <table class="exp-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Vendor</th>
            <th>Doc Nr</th>
            <th>Category</th>
            <th class="num">Net</th>
            <th class="num">Gross</th>
            <th>Status</th>
            <th class="num">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if loading && expenses.length === 0}
            <tr><td colspan="8" class="loading-row">Loading expenses...</td></tr>
          {:else if filteredExpenses.length === 0}
            <tr><td colspan="8" class="empty-row">
              No expenses match these filters.
            </td></tr>
          {:else}
            {#each filteredExpenses as e (e.id)}
              {@const ov = isOverdue(e)}
              <tr class:overdue={ov}>
                <td>{fmtDate(e.document_date)}</td>
                <td class="cell-strong">{e.vendor_name}</td>
                <td>{e.document_nr || "-"}</td>
                <td>
                  {#if e.category}
                    <span class="cat-pill" style="--cat-color: {categoryColor(e.category)};">{e.category}</span>
                  {:else}
                    <span class="muted">-</span>
                  {/if}
                </td>
                <td class="num">{fmtCHF(e.amount_net, e.currency)}</td>
                <td class="num cell-strong">{fmtCHF(e.amount_gross, e.currency)}</td>
                <td>
                  <span class="status-chip status-{statusTone(e.status, ov)}" class:pulse={ov}>
                    {ov ? "overdue" : e.status}
                  </span>
                </td>
                <td class="num actions-cell">
                  {#if e.status === "open"}
                    <button type="button" class="row-btn row-btn--primary" onclick={() => markPaid(e)}>Mark Paid</button>
                  {/if}
                  <button type="button" class="row-btn" onclick={() => openEditDrawer(e)}>Edit</button>
                  {#if e.scanned_doc_id}
                    <a class="row-btn row-btn--link" href="/nexdoc">Scan</a>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </section>
{/if}

{#if tab === "add"}
  <section class="glass-card empty-add">
    <p>Use the side drawer to add a new expense.</p>
    <button type="button" class="glass-btn glass-btn--primary" onclick={openAddDrawer}>Open Add Drawer</button>
  </section>
{/if}

<!-- ───────────────────────── Add drawer ───────────────────────── -->
{#if addDrawerOpen}
  <div class="drawer-backdrop" onclick={closeAddDrawer} role="presentation"></div>
  <div class="drawer" role="dialog" aria-modal="true" aria-label="Add expense" tabindex="-1">
    <header class="drawer-head">
      <h2>Add Expense</h2>
      <button type="button" class="close-btn" onclick={closeAddDrawer} aria-label="Close">×</button>
    </header>

    <div class="drawer-body">
      <div class="import-row">
        <button type="button" class="glass-btn glass-btn--ghost" onclick={openNexdocPicker}>
          <span aria-hidden="true">⊡</span> Import from NEXdoc
        </button>
        {#if formScannedDocId}
          <span class="import-pill">Linked to scan</span>
        {/if}
      </div>

      <div class="form-grid">
        <label class="field field-wide">
          <span>Vendor name *</span>
          <input type="text" bind:value={formVendor} placeholder="Anthropic, Swisscom, Adobe..." />
        </label>

        <label class="field">
          <span>Document date *</span>
          <input type="date" bind:value={formDate} />
        </label>

        <label class="field">
          <span>Due date</span>
          <input type="date" bind:value={formDueDate} />
        </label>

        <label class="field">
          <span>Document nr</span>
          <input type="text" bind:value={formDocNr} placeholder="INV-12345" />
        </label>

        <label class="field">
          <span>Currency</span>
          <select bind:value={formCurrency}>
            <option value="CHF">CHF</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
          </select>
        </label>

        <label class="field">
          <span>Net amount *</span>
          <input type="number" step="0.01" min="0" bind:value={formAmountNet} placeholder="0.00" />
        </label>

        <label class="field">
          <span>VAT rate</span>
          <select bind:value={formVatRate}>
            {#each VAT_RATES as v}
              <option value={v.value}>{v.label}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>Category</span>
          <select bind:value={formCategory}>
            {#each CATEGORIES as c}
              <option value={c}>{c}</option>
            {/each}
          </select>
        </label>

        <label class="field field-wide">
          <span>Notes</span>
          <textarea rows="2" bind:value={formNotes} placeholder="What was this for?"></textarea>
        </label>
      </div>

      <div class="vat-calc">
        <div class="vat-row">
          <span class="vat-label">Net</span>
          <span class="vat-value">{fmtCHF(parseFloat(formAmountNet || "0"), formCurrency)}</span>
        </div>
        <div class="vat-row">
          <span class="vat-label">VAT ({formVatRate}%)</span>
          <span class="vat-value">{fmtCHF(formVatAmount, formCurrency)}</span>
        </div>
        <div class="vat-row vat-total">
          <span class="vat-label">Gross</span>
          <span class="vat-value">{fmtCHF(formAmountGross, formCurrency)}</span>
        </div>
      </div>

      {#if saveError}
        <div class="banner banner-err">{saveError}</div>
      {/if}
    </div>

    <footer class="drawer-foot">
      <button type="button" class="glass-btn glass-btn--ghost" onclick={closeAddDrawer} disabled={saving}>Cancel</button>
      <button type="button" class="glass-btn glass-btn--primary" onclick={submitNewExpense} disabled={!formValid || saving}>
        {saving ? "Saving..." : "Save Expense"}
      </button>
    </footer>
  </div>
{/if}

<!-- ───────────────────────── Edit drawer ───────────────────────── -->
{#if editDrawerOpen && selectedExpense}
  <div class="drawer-backdrop" onclick={closeEditDrawer} role="presentation"></div>
  <div class="drawer" role="dialog" aria-modal="true" aria-label="Edit expense" tabindex="-1">
    <header class="drawer-head">
      <h2>Edit Expense</h2>
      <button type="button" class="close-btn" onclick={closeEditDrawer} aria-label="Close">×</button>
    </header>
    <div class="drawer-body">
      <div class="form-grid">
        <label class="field field-wide">
          <span>Vendor</span>
          <input type="text" bind:value={selectedExpense.vendor_name} />
        </label>
        <label class="field">
          <span>Document date</span>
          <input type="date" bind:value={selectedExpense.document_date} />
        </label>
        <label class="field">
          <span>Due date</span>
          <input type="date" bind:value={selectedExpense.due_date} />
        </label>
        <label class="field">
          <span>Document nr</span>
          <input type="text" bind:value={selectedExpense.document_nr} />
        </label>
        <label class="field">
          <span>Currency</span>
          <select bind:value={selectedExpense.currency}>
            <option value="CHF">CHF</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
          </select>
        </label>
        <label class="field">
          <span>Net amount</span>
          <input type="number" step="0.01" bind:value={selectedExpense.amount_net} />
        </label>
        <label class="field">
          <span>VAT rate</span>
          <input type="number" step="0.1" bind:value={selectedExpense.vat_rate} />
        </label>
        <label class="field">
          <span>VAT amount</span>
          <input type="number" step="0.01" bind:value={selectedExpense.vat_amount} />
        </label>
        <label class="field">
          <span>Category</span>
          <select bind:value={selectedExpense.category}>
            <option value={null}>-</option>
            {#each CATEGORIES as c}
              <option value={c}>{c}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Status</span>
          <select bind:value={selectedExpense.status}>
            <option value="open">Open</option>
            <option value="paid">Paid</option>
            <option value="disputed">Disputed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        {#if selectedExpense.status === "paid"}
          <label class="field">
            <span>Paid date</span>
            <input type="date" bind:value={selectedExpense.paid_date} />
          </label>
          <label class="field">
            <span>Paid via</span>
            <input type="text" bind:value={selectedExpense.paid_via} placeholder="Bank transfer, credit card..." />
          </label>
          <label class="field">
            <span>Paid account</span>
            <input type="text" bind:value={selectedExpense.paid_account} placeholder="Hauptkonto, AmEx..." />
          </label>
        {/if}
        <label class="field field-wide">
          <span>Notes</span>
          <textarea rows="2" bind:value={selectedExpense.notes}></textarea>
        </label>
      </div>

      {#if editError}
        <div class="banner banner-err">{editError}</div>
      {/if}
    </div>
    <footer class="drawer-foot">
      <button type="button" class="glass-btn glass-btn--ghost" onclick={closeEditDrawer} disabled={editSaving}>Cancel</button>
      <button type="button" class="glass-btn glass-btn--primary" onclick={saveEdit} disabled={editSaving}>
        {editSaving ? "Saving..." : "Save"}
      </button>
    </footer>
  </div>
{/if}

<!-- ───────────────────────── NEXdoc picker ───────────────────────── -->
{#if nexdocPickerOpen}
  <div class="modal-backdrop" onclick={closeNexdocPicker} role="presentation"></div>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Pick NEXdoc invoice">
    <header class="modal-head">
      <h2>Import from NEXdoc</h2>
      <button type="button" class="close-btn" onclick={closeNexdocPicker} aria-label="Close">×</button>
    </header>
    <div class="modal-body">
      {#if nexdocLoading}
        <p class="muted">Loading accepted invoices...</p>
      {:else if nexdocError}
        <div class="banner banner-err">{nexdocError}</div>
      {:else if nexdocCandidates.length === 0}
        <p class="muted">No accepted vendor invoices available.</p>
        <p><a class="hdr-link" href="/nexdoc">Open NEXdoc to scan invoices -&gt;</a></p>
      {:else}
        <ul class="picker-list">
          {#each nexdocCandidates as d}
            <li>
              <button type="button" class="picker-row" onclick={() => selectNexdoc(d)}>
                <div class="picker-left">
                  <div class="picker-vendor">{d.vendor_name || d.auto_title || "Unknown vendor"}</div>
                  <div class="picker-meta">
                    {fmtDate(d.document_date)}
                    {#if d.document_nr}<span class="dot">·</span>{d.document_nr}{/if}
                  </div>
                </div>
                <div class="picker-right">
                  <div class="picker-amount">{fmtCHF(d.amount_gross, d.currency || "CHF")}</div>
                  {#if d.category}<div class="picker-cat">{d.category}</div>{/if}
                </div>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ───────── Header ───────── */
  .page-header { margin-bottom: 18px; }
  .hdr-row {
    display: flex; align-items: center; gap: 10px; margin-bottom: 6px;
  }
  .hdr-row h1 {
    margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink);
  }
  .live-pill {
    display: inline-flex; align-items: center;
    padding: 3px 8px;
    background: rgba(86,188,236,0.15);
    color: #56bcec;
    border: 1px solid rgba(86,188,236,0.4);
    border-radius: 999px;
    font-size: 11px; font-weight: 500; letter-spacing: 0.02em;
  }
  .refresh-btn {
    margin-left: auto;
    background: transparent;
    border: 1px solid var(--brand-line);
    color: var(--ink-2);
    padding: 5px 12px; border-radius: 8px;
    font-size: 12px; font-weight: 500;
    cursor: pointer; transition: all 0.15s;
  }
  .refresh-btn:hover:not(:disabled) {
    color: #56bcec; border-color: rgba(86,188,236,0.4);
  }
  .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .hdr-sub {
    color: var(--ink-2); font-size: 13px;
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }
  .hdr-link {
    color: #56bcec; text-decoration: none;
    border-bottom: 1px solid transparent; transition: border-color 0.15s;
  }
  .hdr-link:hover { border-color: #56bcec; }
  .dot { color: var(--ink-3); }

  /* ───────── Tabs ───────── */
  .tab-row {
    display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap;
  }
  .tab-btn {
    all: unset;
    display: inline-flex; align-items: center; gap: 8px;
    height: 36px; padding: 0 14px;
    border-radius: 10px;
    color: var(--ink-2);
    font-size: 13px; font-weight: 500;
    cursor: pointer;
    background: var(--canvas-2, rgba(255,255,255,0.02));
    border: 1px solid var(--brand-line);
    transition: all 0.15s;
  }
  .tab-btn:hover { color: var(--ink); border-color: var(--brand-line-2); }
  .tab-btn.active {
    background: rgba(86,188,236,0.10);
    color: #56bcec;
    border-color: rgba(86,188,236,0.4);
  }
  .tab-icon { font-size: 14px; line-height: 1; }
  .tab-count {
    margin-left: 4px;
    background: rgba(86,188,236,0.18);
    color: #56bcec;
    padding: 1px 6px; border-radius: 999px;
    font-size: 10.5px; font-weight: 600;
  }

  /* ───────── Cards ───────── */
  .glass-card {
    background: var(--glass-chrome, rgba(255,255,255,0.03));
    backdrop-filter: var(--blur-chrome, blur(20px));
    -webkit-backdrop-filter: var(--blur-chrome, blur(20px));
    border: 1px solid var(--brand-line);
    border-radius: 16px;
    padding: 18px;
    margin-bottom: 16px;
  }
  .card-head {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 12px;
  }
  .card-head h2 {
    margin: 0; font-size: 14px; font-weight: 600;
    letter-spacing: 0.02em; color: var(--ink);
    text-transform: uppercase;
  }
  .card-sub {
    margin-left: 8px; color: var(--ink-3); font-size: 11px;
  }
  .card-head .glass-btn {
    margin-left: auto;
  }

  /* ───────── KPI chips ───────── */
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }
  .kpi-chip {
    background: var(--glass-chrome, rgba(255,255,255,0.03));
    backdrop-filter: var(--blur-chrome, blur(20px));
    -webkit-backdrop-filter: var(--blur-chrome, blur(20px));
    border: 1px solid var(--brand-line);
    border-radius: 14px;
    padding: 14px 16px;
  }
  .kpi-label {
    font-size: 11px; color: var(--ink-2);
    text-transform: uppercase; letter-spacing: 0.05em;
    margin-bottom: 4px;
  }
  .kpi-value {
    font-size: 22px; font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .kpi-sub {
    font-size: 11px; color: var(--ink-3); margin-top: 2px;
  }
  .kpi-chip.tone-warn { border-color: rgba(251,146,60,0.35); }
  .kpi-chip.tone-warn .kpi-value { color: #fb923c; }
  .kpi-chip.tone-good { border-color: rgba(74,222,128,0.3); }
  .kpi-chip.tone-good .kpi-value { color: #4ade80; }
  .kpi-chip.tone-info { border-color: rgba(86,188,236,0.3); }
  .kpi-chip.tone-info .kpi-value { color: #56bcec; }
  .kpi-chip.tone-danger { border-color: rgba(248,113,113,0.4); }
  .kpi-chip.tone-danger .kpi-value { color: #f87171; }

  /* ───────── Grid 2 col ───────── */
  .grid-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }
  @media (max-width: 900px) {
    .grid-2col { grid-template-columns: 1fr; }
  }

  /* ───────── Chart ───────── */
  .chart-wrap {
    width: 100%; overflow: hidden;
  }
  .bar-chart { width: 100%; height: 180px; }

  /* ───────── Category list ───────── */
  .cat-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .cat-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    align-items: center;
  }
  .cat-head {
    grid-column: 1 / -1;
    display: flex; align-items: center; gap: 8px;
    font-size: 12.5px; color: var(--ink);
  }
  .cat-dot {
    width: 9px; height: 9px; border-radius: 999px; flex-shrink: 0;
  }
  .cat-name { font-weight: 500; }
  .cat-amount { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--ink); }
  .cat-bar {
    grid-column: 1;
    height: 6px; border-radius: 3px;
    background: rgba(255,255,255,0.05);
    overflow: hidden;
  }
  .cat-fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
  .cat-pct {
    grid-column: 2;
    font-size: 11px;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    min-width: 42px;
    text-align: right;
  }

  /* ───────── Recent list ───────── */
  .recent-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 1px; }
  .recent-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 4px;
    border-bottom: 1px solid var(--brand-line);
  }
  .recent-row:last-child { border-bottom: 0; }
  .recent-left { flex: 1; min-width: 0; }
  .recent-vendor {
    font-size: 13px; font-weight: 500; color: var(--ink);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .recent-meta {
    font-size: 11.5px; color: var(--ink-3); margin-top: 2px;
    display: flex; gap: 6px; align-items: center;
  }
  .recent-right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .recent-amount { font-size: 13px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }

  /* ───────── Filters ───────── */
  .filter-row {
    display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap;
    align-items: center;
  }
  .filter-spacer { flex: 1; min-width: 12px; }
  .filter-btn {
    background: var(--canvas-2, rgba(255,255,255,0.03));
    border: 1px solid var(--brand-line);
    color: var(--ink-2); font-size: 12px;
    padding: 6px 12px; border-radius: 8px;
    cursor: pointer; transition: all 0.15s;
  }
  .filter-btn:hover { color: var(--ink); border-color: rgba(86,188,236,0.4); }
  .filter-btn.active {
    background: rgba(86,188,236,0.12);
    color: #56bcec;
    border-color: rgba(86,188,236,0.4);
  }
  .cat-select {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12px; color: var(--ink-2);
  }
  .cat-select select {
    background: var(--canvas-2, rgba(255,255,255,0.03));
    color: var(--ink);
    border: 1px solid var(--brand-line);
    border-radius: 8px;
    padding: 5px 8px;
    font-size: 12px;
    cursor: pointer;
  }

  /* ───────── Table ───────── */
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .exp-table {
    width: 100%; border-collapse: collapse;
    font-size: 13px;
    min-width: 700px;
  }
  .exp-table th {
    text-align: left;
    padding: 10px 12px;
    font-size: 11px; font-weight: 500;
    color: var(--ink-2);
    text-transform: uppercase; letter-spacing: 0.04em;
    border-bottom: 1px solid var(--brand-line);
  }
  .exp-table td {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    color: var(--ink);
    vertical-align: middle;
  }
  .exp-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .cell-strong { font-weight: 500; }
  .exp-table tbody tr.overdue { background: rgba(239,68,68,0.04); }
  .exp-bar {
    transform-origin: bottom;
    animation: bar-grow 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes bar-grow {
    from { transform: scaleY(0); }
    to   { transform: scaleY(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .exp-bar { animation: none; }
  }
  .exp-table .loading-row,
  .exp-table .empty-row {
    text-align: center; color: var(--ink-3); padding: 24px;
  }
  .muted { color: var(--ink-3); }

  .cat-pill {
    display: inline-flex; align-items: center;
    padding: 2px 8px;
    background: color-mix(in srgb, var(--cat-color) 14%, transparent);
    color: var(--cat-color);
    border: 1px solid color-mix(in srgb, var(--cat-color) 35%, transparent);
    border-radius: 6px;
    font-size: 10.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.04em;
  }

  /* ───────── Status chips ───────── */
  .status-chip {
    display: inline-flex; align-items: center;
    padding: 2px 9px;
    font-size: 10.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.04em;
    border-radius: 6px;
    border: 1px solid transparent;
  }
  .status-good {
    background: rgba(74,222,128,0.12); color: #4ade80;
    border-color: rgba(74,222,128,0.35);
  }
  .status-warn {
    background: rgba(251,146,60,0.12); color: #fb923c;
    border-color: rgba(251,146,60,0.35);
  }
  .status-amber {
    background: rgba(251,191,36,0.14); color: #fbbf24;
    border-color: rgba(251,191,36,0.35);
  }
  .status-danger {
    background: rgba(248,113,113,0.12); color: #f87171;
    border-color: rgba(248,113,113,0.40);
  }
  .status-muted {
    background: rgba(255,255,255,0.05); color: var(--ink-2);
    border-color: var(--brand-line);
  }
  .status-chip.pulse { animation: chip-pulse 1.8s ease-in-out infinite; }
  @keyframes chip-pulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(248,113,113,0); }
    50%     { box-shadow: 0 0 0 4px rgba(248,113,113,0.15); }
  }

  /* ───────── Row actions ───────── */
  .actions-cell { white-space: nowrap; }
  .row-btn {
    background: transparent;
    border: 1px solid var(--brand-line);
    color: var(--ink-2);
    padding: 4px 10px;
    border-radius: 7px;
    font-size: 11.5px; font-weight: 500;
    cursor: pointer;
    margin-left: 4px;
    transition: all 0.15s;
    text-decoration: none;
  }
  .row-btn:hover { color: var(--ink); border-color: rgba(86,188,236,0.4); }
  .row-btn--primary {
    background: rgba(86,188,236,0.12);
    color: #56bcec;
    border-color: rgba(86,188,236,0.4);
  }
  .row-btn--primary:hover { background: rgba(86,188,236,0.2); }
  .row-btn--link {
    display: inline-flex; align-items: center;
  }

  /* ───────── Glass buttons (override / ensure tokens) ───────── */
  :global(.glass-btn) {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px;
    border-radius: 10px;
    border: 1px solid var(--brand-line);
    background: var(--canvas-2, rgba(255,255,255,0.04));
    color: var(--ink-2);
    font-size: 12.5px; font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    backdrop-filter: var(--blur-chrome, blur(12px));
    -webkit-backdrop-filter: var(--blur-chrome, blur(12px));
  }
  :global(.glass-btn:hover:not(:disabled)) {
    border-color: rgba(86,188,236,0.4);
    color: var(--ink);
  }
  :global(.glass-btn:disabled) { opacity: 0.5; cursor: not-allowed; }
  :global(.glass-btn--primary) {
    background: linear-gradient(135deg, rgba(86,188,236,0.20), rgba(86,188,236,0.08));
    color: #56bcec;
    border-color: rgba(86,188,236,0.45);
    box-shadow: 0 4px 14px var(--brand-glow, rgba(86,188,236,0.20));
  }
  :global(.glass-btn--primary:hover:not(:disabled)) {
    background: linear-gradient(135deg, rgba(86,188,236,0.30), rgba(86,188,236,0.14));
  }
  :global(.glass-btn--ghost) {
    background: transparent;
  }

  /* ───────── Banner ───────── */
  .banner {
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
    margin-bottom: 12px;
  }
  .banner-err {
    background: rgba(248,113,113,0.10);
    color: #f87171;
    border: 1px solid rgba(248,113,113,0.30);
  }

  .empty {
    color: var(--ink-3); font-size: 13px;
    padding: 20px; text-align: center;
  }
  .empty-add {
    text-align: center;
    display: flex; flex-direction: column; gap: 14px; align-items: center;
    padding: 40px 20px;
  }
  .empty-add p { color: var(--ink-2); margin: 0; }

  /* ───────── Drawer ───────── */
  .drawer-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 200;
  }
  .drawer {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: min(520px, 100vw);
    background: var(--canvas, #0a0c10);
    border-left: 1px solid var(--brand-line);
    display: flex; flex-direction: column;
    z-index: 201;
    box-shadow: -20px 0 60px rgba(0,0,0,0.4);
    animation: drawer-in 0.22s ease-out;
  }
  @keyframes drawer-in {
    from { transform: translateX(20px); opacity: 0; }
    to   { transform: translateX(0); opacity: 1; }
  }
  .drawer-head {
    display: flex; align-items: center;
    padding: 16px 18px;
    border-bottom: 1px solid var(--brand-line);
  }
  .drawer-head h2 {
    margin: 0; font-size: 16px; font-weight: 600; color: var(--ink);
  }
  .close-btn {
    margin-left: auto;
    background: transparent; border: none;
    color: var(--ink-2);
    width: 30px; height: 30px;
    border-radius: 8px;
    font-size: 22px; line-height: 1;
    cursor: pointer;
    transition: all 0.15s;
  }
  .close-btn:hover { color: var(--ink); background: rgba(255,255,255,0.05); }
  .drawer-body {
    flex: 1; overflow-y: auto;
    padding: 18px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .drawer-foot {
    display: flex; gap: 10px; justify-content: flex-end;
    padding: 14px 18px;
    border-top: 1px solid var(--brand-line);
  }

  .import-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
    background: rgba(86,188,236,0.04);
    border: 1px dashed rgba(86,188,236,0.3);
    border-radius: 10px;
  }
  .import-pill {
    background: rgba(74,222,128,0.12);
    color: #4ade80;
    border: 1px solid rgba(74,222,128,0.3);
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px; font-weight: 500;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .field {
    display: flex; flex-direction: column; gap: 4px;
  }
  .field-wide { grid-column: 1 / -1; }
  .field > span {
    font-size: 11px; color: var(--ink-2);
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .field input,
  .field select,
  .field textarea {
    background: var(--canvas-2, rgba(255,255,255,0.03));
    border: 1px solid var(--brand-line);
    color: var(--ink);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    font-family: inherit;
    transition: border-color 0.15s;
  }
  .field input:focus,
  .field select:focus,
  .field textarea:focus {
    outline: none;
    border-color: rgba(86,188,236,0.5);
    box-shadow: 0 0 0 3px rgba(86,188,236,0.10);
  }

  .vat-calc {
    background: rgba(86,188,236,0.04);
    border: 1px solid rgba(86,188,236,0.25);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .vat-row {
    display: flex; justify-content: space-between;
    font-size: 12.5px;
  }
  .vat-label { color: var(--ink-2); }
  .vat-value { color: var(--ink); font-variant-numeric: tabular-nums; font-weight: 500; }
  .vat-total {
    padding-top: 6px;
    border-top: 1px solid rgba(86,188,236,0.2);
    font-weight: 600;
  }
  .vat-total .vat-value { color: #56bcec; font-size: 16px; }

  /* ───────── Modal ───────── */
  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(4px);
    z-index: 300;
  }
  .modal {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, 92vw);
    max-height: 80vh;
    background: var(--canvas, #0a0c10);
    border: 1px solid var(--brand-line);
    border-radius: 14px;
    z-index: 301;
    display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }
  .modal-head {
    display: flex; align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid var(--brand-line);
  }
  .modal-head h2 {
    margin: 0; font-size: 15px; font-weight: 600; color: var(--ink);
  }
  .modal-body {
    flex: 1; overflow-y: auto; padding: 14px 16px;
  }
  .picker-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .picker-row {
    all: unset;
    display: flex; gap: 10px;
    padding: 10px 12px;
    background: var(--canvas-2, rgba(255,255,255,0.02));
    border: 1px solid var(--brand-line);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
    width: 100%;
    box-sizing: border-box;
  }
  .picker-row:hover {
    border-color: rgba(86,188,236,0.4);
    background: rgba(86,188,236,0.04);
  }
  .picker-left { flex: 1; min-width: 0; }
  .picker-vendor {
    font-size: 13px; font-weight: 500; color: var(--ink);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .picker-meta { font-size: 11.5px; color: var(--ink-3); margin-top: 2px; }
  .picker-right { text-align: right; }
  .picker-amount { font-size: 13px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
  .picker-cat { font-size: 11px; color: var(--ink-3); margin-top: 2px; }

  /* ───────── Mobile ───────── */
  @media (max-width: 760px) {
    .kpis { grid-template-columns: repeat(2, 1fr); }
    .tab-row { gap: 6px; }
    .form-grid { grid-template-columns: 1fr; }
    .field-wide { grid-column: 1; }
    .drawer {
      top: auto;
      left: 0; right: 0; bottom: 0;
      width: 100vw;
      height: 90vh;
      border-left: none;
      border-top: 1px solid var(--brand-line);
      border-radius: 16px 16px 0 0;
      animation: drawer-up 0.22s ease-out;
    }
    @keyframes drawer-up {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }
    .hdr-row h1 { font-size: 22px; }
  }
</style>
