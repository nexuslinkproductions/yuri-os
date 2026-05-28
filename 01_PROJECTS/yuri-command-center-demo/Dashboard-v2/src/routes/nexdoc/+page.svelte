<script lang="ts">
  /**
   * /nexdoc - Smart document intelligence.
   * Upload PDF/image -> Claude extracts structured fields -> stored in Supabase.
   */
  import { onMount } from "svelte";
  import { getAuthed, postAuthed } from "$lib/db";

  type DocStatus = "processing" | "review" | "accepted" | "rejected";
  type DocType =
    | "invoice" | "contract" | "receipt" | "quote"
    | "delivery_note" | "bank_statement" | "credit_note"
    | "other" | "unknown";

  type ScannedDoc = {
    id: string;
    file_name: string;
    file_url: string | null;
    file_size: number | null;
    mime_type: string | null;
    doc_type: DocType;
    source: "upload" | "email" | "manual";
    vendor_name: string | null;
    client_code: string | null;
    document_nr: string | null;
    document_date: string | null;
    due_date: string | null;
    amount_gross: number | null;
    amount_net: number | null;
    vat_amount: number | null;
    currency: string | null;
    category: string | null;
    auto_title: string | null;
    extracted_data: Record<string, any> | null;
    confidence: number | null;
    ai_notes: string | null;
    is_creditor_invoice: boolean | null;
    status: DocStatus;
    reviewed_at: string | null;
    finance_invoice_id: string | null;
    created_at: string;
    updated_at: string;
  };

  type FilterType = "all" | DocType;
  type FilterStatus = "all" | DocStatus;

  let docs = $state<ScannedDoc[]>([]);
  let loading = $state(true);
  let listError = $state("");
  let uploading = $state(false);
  let uploadProgress = $state("");
  let uploadError = $state("");
  let uploadSuccess = $state("");

  let filterType = $state<FilterType>("all");
  let filterStatus = $state<FilterStatus>("all");

  let selectedDoc = $state<ScannedDoc | null>(null);
  let drawerOpen = $state(false);
  let drawerSaving = $state(false);
  let drawerError = $state("");
  let showRawJson = $state(false);

  let dragOver = $state(false);
  let fileInputEl: HTMLInputElement | null = $state(null);

  type DirFilter = "all" | "inbound" | "outbound" | "unclassified";
  let filterDir = $state<DirFilter>("all");

  const filteredDocs = $derived(docs.filter(d => {
    if (filterType !== "all" && d.doc_type !== filterType) return false;
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    if (filterDir === "inbound" && d.is_creditor_invoice !== true) return false;
    if (filterDir === "outbound" && d.is_creditor_invoice !== false) return false;
    if (filterDir === "unclassified" && d.doc_type === "invoice" && d.is_creditor_invoice !== null) return false;
    return true;
  }));

  const stats = $derived.by(() => ({
    total: docs.length,
    review: docs.filter(d => d.status === "review").length,
    accepted: docs.filter(d => d.status === "accepted").length,
    expenses: docs
      .filter(d => d.is_creditor_invoice === true && d.status !== "rejected")
      .reduce((s, d) => s + (Number(d.amount_gross) || 0), 0),
    ar: docs
      .filter(d => d.is_creditor_invoice === false && d.status !== "rejected")
      .reduce((s, d) => s + (Number(d.amount_gross) || 0), 0),
    unclassified: docs.filter(d => d.doc_type === "invoice" && d.is_creditor_invoice === null).length,
  }));

  async function loadDocs() {
    loading = true;
    listError = "";
    try {
      const data = await getAuthed("/api/functions/nexdoc-list?status=all&limit=200");
      docs = (data?.items ?? []) as ScannedDoc[];
    } catch (e: any) {
      listError = e?.message || "Could not load documents";
    } finally {
      loading = false;
    }
  }

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] || "");
      };
      reader.onerror = () => reject(new Error("file read failed"));
      reader.readAsDataURL(file);
    });
  }

  async function uploadFile(file: File) {
    uploadError = "";
    uploadSuccess = "";
    if (file.size > 20 * 1024 * 1024) {
      uploadError = "File too large (>20MB)";
      return;
    }
    const ok = new Set(["application/pdf","image/jpeg","image/png","image/webp","image/gif"]);
    if (!ok.has(file.type)) {
      uploadError = `Unsupported file type: ${file.type || "unknown"}`;
      return;
    }
    uploading = true;
    uploadProgress = `Reading ${file.name}...`;
    try {
      const base64 = await readFileAsBase64(file);
      uploadProgress = "Sending to Claude for extraction...";
      const res = await postAuthed("/api/functions/nexdoc-scan", {
        file_data: base64,
        file_name: file.name,
        mime_type: file.type,
      });
      if (!res?.doc) throw new Error("no doc returned");
      docs = [res.doc as ScannedDoc, ...docs];
      uploadSuccess = `Extracted: ${res.doc.auto_title || file.name}`;
      setTimeout(() => { uploadSuccess = ""; }, 4000);
    } catch (e: any) {
      uploadError = e?.message || "Upload failed";
    } finally {
      uploading = false;
      uploadProgress = "";
    }
  }

  function onFilePick(ev: Event) {
    const t = ev.target as HTMLInputElement;
    const file = t.files?.[0];
    if (file) uploadFile(file);
    if (t) t.value = "";
  }

  function onDrop(ev: DragEvent) {
    ev.preventDefault();
    dragOver = false;
    const file = ev.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  }
  function onDragOver(ev: DragEvent) { ev.preventDefault(); dragOver = true; }
  function onDragLeave() { dragOver = false; }

  function openDrawer(doc: ScannedDoc) {
    selectedDoc = { ...doc };
    drawerOpen = true;
    drawerError = "";
    showRawJson = false;
  }
  function closeDrawer() {
    if (drawerSaving) return;
    drawerOpen = false;
    selectedDoc = null;
  }

  async function saveDoc() {
    if (!selectedDoc) return;
    drawerSaving = true;
    drawerError = "";
    try {
      const res = await postAuthed("/api/functions/nexdoc-update", {
        id: selectedDoc.id,
        status: selectedDoc.status,
        doc_type: selectedDoc.doc_type,
        auto_title: selectedDoc.auto_title,
        vendor_name: selectedDoc.vendor_name,
        client_code: selectedDoc.client_code,
        document_nr: selectedDoc.document_nr,
        document_date: selectedDoc.document_date,
        due_date: selectedDoc.due_date,
        amount_gross: selectedDoc.amount_gross,
        amount_net: selectedDoc.amount_net,
        vat_amount: selectedDoc.vat_amount,
        currency: selectedDoc.currency,
        category: selectedDoc.category,
        ai_notes: selectedDoc.ai_notes,
        is_creditor_invoice: selectedDoc.is_creditor_invoice,
      });
      if (res?.doc) {
        const updated = res.doc as ScannedDoc;
        docs = docs.map(d => d.id === updated.id ? updated : d);
        selectedDoc = updated;
      }
      drawerOpen = false;
    } catch (e: any) {
      drawerError = e?.message || "Save failed";
    } finally {
      drawerSaving = false;
    }
  }

  async function quickStatus(doc: ScannedDoc, status: DocStatus) {
    try {
      const res = await postAuthed("/api/functions/nexdoc-update", {
        id: doc.id, status,
      });
      if (res?.doc) {
        const updated = res.doc as ScannedDoc;
        docs = docs.map(d => d.id === updated.id ? updated : d);
        if (selectedDoc?.id === updated.id) selectedDoc = updated;
      }
    } catch (e: any) {
      console.warn("[nexdoc] quickStatus", e?.message);
    }
  }

  function fmtCHF(n: number | null | undefined, ccy: string | null = "CHF"): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return "-";
    return `${ccy || "CHF"} ${Math.round(n).toLocaleString("de-CH")}`;
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
  function fmtConfidence(c: number | null | undefined): string {
    if (c === null || c === undefined) return "-";
    return `${Math.round(c * 100)}%`;
  }
  function confidenceTone(c: number | null | undefined): "ok" | "warn" | "bad" | "muted" {
    if (c === null || c === undefined) return "muted";
    if (c >= 0.8) return "ok";
    if (c >= 0.6) return "warn";
    return "bad";
  }
  function docTypeTone(t: DocType): "info" | "violet" | "amber" | "muted" {
    if (t === "invoice") return "info";
    if (t === "contract") return "violet";
    if (t === "receipt") return "amber";
    return "muted";
  }
  function statusTone(s: DocStatus): "ok" | "warn" | "bad" | "muted" {
    if (s === "accepted") return "ok";
    if (s === "rejected") return "bad";
    if (s === "review") return "warn";
    return "muted";
  }

  onMount(() => { loadDocs(); });
</script>

<header class="page-header">
  <div class="hdr-row">
    <h1>NEXdoc</h1>
    <span class="live-pill">AI Extraction</span>
    <button type="button" class="refresh-btn" onclick={loadDocs} disabled={loading} aria-label="Refresh">
      {loading ? "..." : "Refresh"}
    </button>
  </div>
  <div class="hdr-sub">
    <span>Drop any invoice, contract or receipt. Claude extracts the fields.</span>
    <span class="dot">·</span>
    <a class="hdr-link" href="/finance">Finance -&gt;</a>
  </div>
</header>

<section
  class="upload-zone glass-card"
  class:drag-over={dragOver}
  class:uploading
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
  aria-label="Upload area"
>
  <input
    type="file"
    accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
    class="hidden-input"
    onchange={onFilePick}
    bind:this={fileInputEl}
  />
  <div class="upload-inner">
    <svg class="upload-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#56bcec" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
      <path d="M9 13h6"/>
      <path d="M9 17h4"/>
    </svg>
    {#if uploading}
      <p class="upload-title">{uploadProgress || "Working..."}</p>
      <p class="upload-sub">Hold tight, Claude is reading your document.</p>
    {:else}
      <p class="upload-title">Drop invoices, contracts or receipts here</p>
      <p class="upload-sub">PDF, JPEG, PNG, WEBP, GIF - up to 20 MB</p>
      <button type="button" class="glass-btn glass-btn--primary" onclick={() => fileInputEl?.click()}>
        Choose file
      </button>
    {/if}
    {#if uploadError}
      <p class="upload-msg upload-err">{uploadError}</p>
    {/if}
    {#if uploadSuccess}
      <p class="upload-msg upload-ok">{uploadSuccess}</p>
    {/if}
  </div>
</section>

<section class="stats-row">
  <div class="stat-chip">
    <div class="stat-label">Total docs</div>
    <div class="stat-value">{stats.total}</div>
  </div>
  <div class="stat-chip tone-warn">
    <div class="stat-label">Pending review</div>
    <div class="stat-value">{stats.review}</div>
  </div>
  <div class="stat-chip tone-orange">
    <div class="stat-label">Expenses (to pay)</div>
    <div class="stat-value">{fmtCHFShort(stats.expenses)}</div>
  </div>
  <div class="stat-chip tone-good">
    <div class="stat-label">AR sent</div>
    <div class="stat-value">{fmtCHFShort(stats.ar)}</div>
  </div>
  {#if stats.unclassified > 0}
  <div class="stat-chip tone-muted">
    <div class="stat-label">Unclassified</div>
    <div class="stat-value">{stats.unclassified}</div>
  </div>
  {/if}
</section>

<section class="filter-row">
  <button class="filter-btn" class:active={filterType === "all"} onclick={() => filterType = "all"}>All</button>
  <button class="filter-btn" class:active={filterType === "invoice"} onclick={() => filterType = "invoice"}>Invoices</button>
  <button class="filter-btn" class:active={filterType === "contract"} onclick={() => filterType = "contract"}>Contracts</button>
  <button class="filter-btn" class:active={filterType === "receipt"} onclick={() => filterType = "receipt"}>Receipts</button>
  <button class="filter-btn" class:active={filterType === "other"} onclick={() => filterType = "other"}>Other</button>
  <span class="filter-spacer"></span>
  <button class="filter-btn filter-btn--dir" class:active={filterDir === "all"} onclick={() => filterDir = "all"}>All dir.</button>
  <button class="filter-btn filter-btn--exp" class:active={filterDir === "inbound"} onclick={() => filterDir = "inbound"}>To Pay</button>
  <button class="filter-btn filter-btn--ar" class:active={filterDir === "outbound"} onclick={() => filterDir = "outbound"}>Sent</button>
  {#if stats.unclassified > 0}
  <button class="filter-btn filter-btn--muted" class:active={filterDir === "unclassified"} onclick={() => filterDir = "unclassified"}>? {stats.unclassified}</button>
  {/if}
  <span class="filter-spacer"></span>
  <button class="filter-btn" class:active={filterStatus === "all"} onclick={() => filterStatus = "all"}>All status</button>
  <button class="filter-btn" class:active={filterStatus === "review"} onclick={() => filterStatus = "review"}>Review</button>
  <button class="filter-btn" class:active={filterStatus === "accepted"} onclick={() => filterStatus = "accepted"}>Accepted</button>
  <button class="filter-btn" class:active={filterStatus === "rejected"} onclick={() => filterStatus = "rejected"}>Rejected</button>
</section>

{#if listError}
  <div class="glass-card error-card">
    <p class="error-msg">{listError}</p>
    <button type="button" class="glass-btn glass-btn--ghost" onclick={loadDocs}>Retry</button>
  </div>
{/if}

<div class="glass-card doc-card">
  {#if loading}
    <p class="empty"><span class="shimmer">Loading documents...</span></p>
  {:else if filteredDocs.length === 0}
    <p class="empty">No documents match this filter.</p>
  {:else}
    <div class="table-wrap">
      <table class="doc-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Title</th>
            <th>Vendor</th>
            <th class="num">Amount</th>
            <th>Confidence</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredDocs as doc (doc.id)}
            <tr onclick={() => openDrawer(doc)}>
              <td>
                <div class="doc-type-cell">
                  <span class="doc-badge doc-badge--{docTypeTone(doc.doc_type)}">{doc.doc_type}</span>
                  {#if doc.doc_type === "invoice"}
                    {#if doc.is_creditor_invoice === true}
                      <span class="dir-badge dir-badge--exp">TO PAY</span>
                    {:else if doc.is_creditor_invoice === false}
                      <span class="dir-badge dir-badge--ar">SENT</span>
                    {:else}
                      <span class="dir-badge dir-badge--unk">?</span>
                    {/if}
                  {/if}
                </div>
              </td>
              <td>
                <span class="cell-strong">{doc.auto_title || doc.file_name}</span>
              </td>
              <td>{doc.vendor_name || "-"}</td>
              <td class="num">{fmtCHF(doc.amount_gross, doc.currency)}</td>
              <td>
                <div class="conf-cell">
                  <div class="confidence-bar conf-{confidenceTone(doc.confidence)}">
                    <div class="confidence-fill" style="width: {Math.round((doc.confidence || 0) * 100)}%"></div>
                  </div>
                  <span class="conf-label conf-{confidenceTone(doc.confidence)}">{fmtConfidence(doc.confidence)}</span>
                </div>
              </td>
              <td>
                <span class="chip chip-{statusTone(doc.status)}">{doc.status}</span>
              </td>
              <td>{fmtDate(doc.document_date || doc.created_at)}</td>
              <td>
                <div class="row-actions" onclick={(e) => e.stopPropagation()} role="presentation">
                  <button
                    type="button"
                    class="icon-btn"
                    title="Accept"
                    disabled={doc.status === "accepted"}
                    onclick={() => quickStatus(doc, "accepted")}
                  >✓</button>
                  <button
                    type="button"
                    class="icon-btn"
                    title="Reject"
                    disabled={doc.status === "rejected"}
                    onclick={() => quickStatus(doc, "rejected")}
                  >×</button>
                  <button
                    type="button"
                    class="icon-btn"
                    title="Edit"
                    onclick={() => openDrawer(doc)}
                  >✎</button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if drawerOpen && selectedDoc}
  <div class="drawer-backdrop" onclick={closeDrawer} role="presentation"></div>
  <aside class="nex-sheet drawer" aria-label="Document detail">
    <header class="drawer-head">
      <div class="drawer-head-titles">
        <span class="drawer-eyebrow">{selectedDoc.file_name}</span>
        <input
          class="drawer-title-input"
          type="text"
          bind:value={selectedDoc.auto_title}
          placeholder="Auto-title"
        />
      </div>
      <button type="button" class="icon-btn" onclick={closeDrawer} aria-label="Close">×</button>
    </header>

    <div class="drawer-body">
      <div class="form-row">
        <label class="form-field">
          <span class="form-label">Doc type</span>
          <select bind:value={selectedDoc.doc_type}>
            <option value="invoice">invoice</option>
            <option value="contract">contract</option>
            <option value="receipt">receipt</option>
            <option value="quote">quote</option>
            <option value="delivery_note">delivery_note</option>
            <option value="bank_statement">bank_statement</option>
            <option value="credit_note">credit_note</option>
            <option value="other">other</option>
            <option value="unknown">unknown</option>
          </select>
        </label>
        <label class="form-field">
          <span class="form-label">Status</span>
          <select bind:value={selectedDoc.status}>
            <option value="processing">processing</option>
            <option value="review">review</option>
            <option value="accepted">accepted</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
      </div>

      {#if selectedDoc.doc_type === "invoice"}
        <label class="form-field">
          <span class="form-label">Direction</span>
          <select
            value={selectedDoc.is_creditor_invoice === null ? "null" : String(selectedDoc.is_creditor_invoice)}
            onchange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              if (selectedDoc) selectedDoc.is_creditor_invoice = v === "null" ? null : v === "true";
            }}
          >
            <option value="null">? Not classified</option>
            <option value="true">To Pay - expense received</option>
            <option value="false">Sent - our AR invoice</option>
          </select>
        </label>
      {/if}

      <label class="form-field">
        <span class="form-label">Vendor name</span>
        <input type="text" bind:value={selectedDoc.vendor_name} />
      </label>

      <div class="form-row">
        <label class="form-field">
          <span class="form-label">Document Nr</span>
          <input type="text" bind:value={selectedDoc.document_nr} />
        </label>
        <label class="form-field">
          <span class="form-label">Client code</span>
          <input type="text" bind:value={selectedDoc.client_code} placeholder="SHI, UPG, ..." />
        </label>
      </div>

      <div class="form-row">
        <label class="form-field">
          <span class="form-label">Document date</span>
          <input type="date" bind:value={selectedDoc.document_date} />
        </label>
        <label class="form-field">
          <span class="form-label">Due date</span>
          <input type="date" bind:value={selectedDoc.due_date} />
        </label>
      </div>

      <div class="form-row">
        <label class="form-field">
          <span class="form-label">Amount gross</span>
          <input type="number" step="0.01" bind:value={selectedDoc.amount_gross} />
        </label>
        <label class="form-field">
          <span class="form-label">Amount net</span>
          <input type="number" step="0.01" bind:value={selectedDoc.amount_net} />
        </label>
      </div>

      <div class="form-row">
        <label class="form-field">
          <span class="form-label">VAT amount</span>
          <input type="number" step="0.01" bind:value={selectedDoc.vat_amount} />
        </label>
        <label class="form-field">
          <span class="form-label">Currency</span>
          <input type="text" maxlength="8" bind:value={selectedDoc.currency} />
        </label>
      </div>

      <label class="form-field">
        <span class="form-label">Category</span>
        <input type="text" bind:value={selectedDoc.category} />
      </label>

      <div class="confidence-block">
        <div class="confidence-head">
          <span class="form-label">AI confidence</span>
          <span class="conf-label conf-{confidenceTone(selectedDoc.confidence)}">{fmtConfidence(selectedDoc.confidence)}</span>
        </div>
        <div class="confidence-bar conf-{confidenceTone(selectedDoc.confidence)} confidence-bar--big">
          <div class="confidence-fill" style="width: {Math.round((selectedDoc.confidence || 0) * 100)}%"></div>
        </div>
      </div>

      {#if selectedDoc.ai_notes}
        <div class="ai-notes">
          <span class="form-label">AI notes</span>
          <p class="ai-notes-body">{selectedDoc.ai_notes}</p>
        </div>
      {/if}

      <div class="raw-block">
        <button type="button" class="link-btn" onclick={() => showRawJson = !showRawJson}>
          {showRawJson ? "Hide" : "Show"} raw extraction JSON
        </button>
        {#if showRawJson}
          <pre class="raw-json">{JSON.stringify(selectedDoc.extracted_data ?? {}, null, 2)}</pre>
        {/if}
      </div>

      {#if drawerError}
        <p class="form-error">{drawerError}</p>
      {/if}
    </div>

    <footer class="drawer-foot">
      <button type="button" class="glass-btn glass-btn--ghost" onclick={closeDrawer} disabled={drawerSaving}>Cancel</button>
      <button
        type="button"
        class="glass-btn"
        onclick={() => { if (selectedDoc) quickStatus(selectedDoc, "rejected"); }}
        disabled={drawerSaving || selectedDoc.status === "rejected"}
      >Reject</button>
      <button
        type="button"
        class="glass-btn"
        onclick={() => { if (selectedDoc) quickStatus(selectedDoc, "accepted"); }}
        disabled={drawerSaving || selectedDoc.status === "accepted"}
      >Accept</button>
      <button type="button" class="glass-btn glass-btn--primary" onclick={saveDoc} disabled={drawerSaving}>
        {drawerSaving ? "Saving..." : "Save changes"}
      </button>
    </footer>
  </aside>
{/if}

<style>
  .page-header {
    padding: 24px 0 12px;
    border-bottom: 1px solid var(--brand-line);
    margin-bottom: 20px;
  }
  .hdr-row { display: flex; align-items: center; gap: 12px; }
  .page-header h1 {
    font-size: 28px; font-weight: 600; margin: 0;
    letter-spacing: -0.01em;
  }
  .hdr-sub {
    margin-top: 6px; color: var(--ink-2); font-size: 13px;
    display: flex; gap: 8px; align-items: center;
  }
  .hdr-sub .dot { opacity: 0.5; }
  .hdr-link {
    color: #56bcec; text-decoration: none;
    border-bottom: 1px solid transparent; transition: border-color 0.15s;
  }
  .hdr-link:hover { border-color: #56bcec; }
  .live-pill {
    display: inline-flex; align-items: center;
    padding: 3px 8px;
    background: rgba(86, 188, 236, 0.15);
    color: #56bcec;
    border: 1px solid rgba(86, 188, 236, 0.4);
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
    color: #56bcec; border-color: rgba(86, 188, 236, 0.4);
  }
  .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .glass-card {
    background: var(--glass-chrome, rgba(255,255,255,0.03));
    backdrop-filter: var(--blur-chrome, blur(20px));
    border: 1px solid var(--brand-line);
    border-radius: 16px;
    padding: 18px;
    margin-bottom: 16px;
  }

  .upload-zone {
    border: 1.5px dashed var(--brand-line-2, rgba(86, 188, 236, 0.4));
    border-radius: 16px;
    min-height: 180px;
    display: grid;
    place-items: center;
    text-align: center;
    background: var(--canvas-2, rgba(255,255,255,0.02));
    transition: all 0.2s ease;
    position: relative;
    cursor: pointer;
  }
  .upload-zone.drag-over {
    border-color: #56bcec;
    background: rgba(86, 188, 236, 0.06);
    box-shadow: 0 0 0 4px rgba(86, 188, 236, 0.10), 0 8px 30px var(--brand-glow, rgba(86,188,236,0.25));
    animation: zone-pulse 1.4s ease-in-out infinite;
  }
  .upload-zone.uploading {
    border-color: #56bcec;
    background: rgba(86, 188, 236, 0.04);
  }
  @keyframes zone-pulse {
    0%, 100% { border-color: rgba(86, 188, 236, 0.45); }
    50%      { border-color: rgba(86, 188, 236, 0.95); }
  }
  .hidden-input { display: none; }
  .upload-inner {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    padding: 24px 20px;
  }
  .upload-icon {
    margin-bottom: 4px;
    filter: drop-shadow(0 4px 12px var(--brand-glow, rgba(86,188,236,0.30)));
  }
  .upload-title {
    margin: 0;
    font-size: 16px; font-weight: 600;
    color: var(--ink, #fff);
  }
  .upload-sub {
    margin: 0;
    font-size: 12.5px; color: var(--ink-2);
  }
  .upload-msg {
    margin: 6px 0 0; padding: 6px 12px;
    font-size: 12px; border-radius: 999px;
  }
  .upload-err {
    background: rgba(248, 113, 113, 0.10);
    color: #f87171;
    border: 1px solid rgba(248, 113, 113, 0.25);
  }
  .upload-ok {
    background: rgba(74, 222, 128, 0.10);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.30);
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 18px;
  }
  .stat-chip {
    background: var(--glass-chrome, rgba(255,255,255,0.03));
    backdrop-filter: var(--blur-chrome, blur(20px));
    border: 1px solid var(--brand-line);
    border-radius: 14px;
    padding: 14px 16px;
  }
  .stat-label {
    font-size: 11px; color: var(--ink-2);
    text-transform: uppercase; letter-spacing: 0.05em;
    margin-bottom: 4px;
  }
  .stat-value {
    font-size: 22px; font-weight: 600;
    color: var(--ink, #fff);
    letter-spacing: -0.01em;
  }
  .stat-chip.tone-warn { border-color: rgba(251, 146, 60, 0.35); }
  .stat-chip.tone-warn .stat-value { color: #fb923c; }
  .stat-chip.tone-good { border-color: rgba(74, 222, 128, 0.3); }
  .stat-chip.tone-good .stat-value { color: #4ade80; }
  .stat-chip.tone-info { border-color: rgba(86, 188, 236, 0.3); }
  .stat-chip.tone-info .stat-value { color: #56bcec; }
  .stat-chip.tone-orange { border-color: rgba(251, 146, 60, 0.35); }
  .stat-chip.tone-orange .stat-value { color: #fb923c; }
  .stat-chip.tone-muted { border-color: var(--brand-line); }
  .stat-chip.tone-muted .stat-value { color: var(--ink-2); }

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
  .filter-btn:hover { color: var(--ink, #fff); border-color: rgba(86, 188, 236, 0.4); }
  .filter-btn.active {
    background: rgba(86, 188, 236, 0.12);
    color: #56bcec;
    border-color: rgba(86, 188, 236, 0.4);
  }
  .filter-btn--exp.active {
    background: rgba(251, 146, 60, 0.12);
    color: #fb923c;
    border-color: rgba(251, 146, 60, 0.4);
  }
  .filter-btn--ar.active {
    background: rgba(74, 222, 128, 0.12);
    color: #4ade80;
    border-color: rgba(74, 222, 128, 0.4);
  }
  .filter-btn--muted.active {
    background: rgba(255,255,255,0.06);
    color: var(--ink-2);
    border-color: rgba(255,255,255,0.15);
  }

  .doc-type-cell { display: flex; flex-direction: column; gap: 4px; }

  .dir-badge {
    display: inline-flex; align-items: center;
    padding: 1px 7px;
    font-size: 9.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    border-radius: 4px;
    border: 1px solid transparent;
    width: fit-content;
  }
  .dir-badge--exp {
    background: rgba(251, 146, 60, 0.14);
    color: #fb923c;
    border-color: rgba(251, 146, 60, 0.35);
  }
  .dir-badge--ar {
    background: rgba(74, 222, 128, 0.12);
    color: #4ade80;
    border-color: rgba(74, 222, 128, 0.3);
  }
  .dir-badge--unk {
    background: rgba(255,255,255,0.04);
    color: var(--ink-3, var(--ink-2));
    border-color: var(--brand-line);
  }

  .doc-card { padding: 6px 6px 4px; }
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .doc-table {
    width: 100%; border-collapse: collapse;
    font-size: 13px;
  }
  @media (max-width: 760px) {
    .doc-table { min-width: 640px; }
  }
  .doc-table th {
    text-align: left;
    padding: 10px 12px;
    font-size: 11px; font-weight: 500;
    color: var(--ink-2);
    text-transform: uppercase; letter-spacing: 0.04em;
    border-bottom: 1px solid var(--brand-line);
  }
  .doc-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--line, rgba(255,255,255,0.04));
    color: var(--ink, #fff);
    vertical-align: middle;
  }
  .doc-table tbody tr {
    cursor: pointer;
    transition: background 0.15s;
  }
  .doc-table tbody tr:hover {
    background: rgba(86, 188, 236, 0.05);
  }
  .doc-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .cell-strong { font-weight: 500; color: var(--ink, #fff); }

  .doc-badge {
    display: inline-flex; align-items: center;
    padding: 2px 9px;
    font-size: 10.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.04em;
    border-radius: 6px;
    border: 1px solid transparent;
  }
  .doc-badge--info {
    background: rgba(86, 188, 236, 0.12); color: #56bcec;
    border-color: rgba(86, 188, 236, 0.3);
  }
  .doc-badge--violet {
    background: rgba(139, 92, 246, 0.14); color: #a78bfa;
    border-color: rgba(139, 92, 246, 0.35);
  }
  .doc-badge--amber {
    background: rgba(251, 191, 36, 0.14); color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.35);
  }
  .doc-badge--muted {
    background: rgba(255,255,255,0.05); color: var(--ink-2);
    border-color: var(--brand-line);
  }

  .chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 2px 9px;
    font-size: 11px; font-weight: 500;
    border-radius: 999px;
    border: 1px solid transparent;
    text-transform: capitalize;
  }
  .chip::before {
    content: ""; width: 6px; height: 6px;
    border-radius: 999px; background: currentColor;
  }
  .chip-ok {
    background: rgba(74, 222, 128, 0.12); color: #4ade80;
    border-color: rgba(74, 222, 128, 0.3);
  }
  .chip-warn {
    background: rgba(251, 146, 60, 0.12); color: #fb923c;
    border-color: rgba(251, 146, 60, 0.3);
    animation: chip-pulse 2s ease-in-out infinite;
  }
  .chip-bad {
    background: rgba(248, 113, 113, 0.12); color: #f87171;
    border-color: rgba(248, 113, 113, 0.3);
  }
  .chip-muted {
    background: rgba(255,255,255,0.05); color: var(--ink-2);
    border-color: var(--brand-line);
  }
  @keyframes chip-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .conf-cell {
    display: flex; align-items: center; gap: 8px;
    min-width: 110px;
  }
  .confidence-bar {
    position: relative;
    width: 60px; height: 5px;
    background: rgba(255,255,255,0.06);
    border-radius: 999px;
    overflow: hidden;
  }
  .confidence-bar--big { width: 100%; height: 8px; }
  .confidence-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.3s ease;
  }
  .conf-ok .confidence-fill { background: #4ade80; }
  .conf-warn .confidence-fill { background: #fb923c; }
  .conf-bad .confidence-fill { background: #f87171; }
  .conf-muted .confidence-fill { background: var(--ink-3); }
  .conf-label {
    font-size: 11px; font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .conf-label.conf-ok { color: #4ade80; }
  .conf-label.conf-warn { color: #fb923c; }
  .conf-label.conf-bad { color: #f87171; }
  .conf-label.conf-muted { color: var(--ink-3); }

  .row-actions { display: flex; gap: 4px; }
  .icon-btn {
    background: transparent; border: 1px solid var(--brand-line);
    color: var(--ink-2);
    width: 28px; height: 28px; border-radius: 6px;
    font-size: 13px; line-height: 1;
    cursor: pointer; transition: all 0.15s;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .icon-btn:hover:not(:disabled) {
    color: #56bcec; border-color: rgba(86, 188, 236, 0.45);
    background: rgba(86, 188, 236, 0.06);
  }
  .icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .empty { color: var(--ink-2); font-size: 13px; margin: 16px; }
  .error-card {
    border-color: rgba(248, 113, 113, 0.35);
    background: rgba(248, 113, 113, 0.05);
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  .error-msg { color: #f87171; font-size: 13px; margin: 0; }

  .shimmer {
    display: inline-block;
    background: linear-gradient(
      90deg,
      rgba(255,255,255,0.06) 0%,
      rgba(86,188,236,0.18) 50%,
      rgba(255,255,255,0.06) 100%
    );
    background-size: 200% 100%;
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    animation: shimmerMove 1.4s ease-in-out infinite;
  }
  @keyframes shimmerMove {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .drawer-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(2px);
    z-index: 90;
    animation: fadeIn 0.2s ease;
  }
  .drawer {
    position: fixed;
    top: 0; right: 0; bottom: 0;
    width: 560px; max-width: 100vw;
    background: rgba(15, 18, 28, 0.92);
    backdrop-filter: var(--blur-chrome, blur(28px));
    border-left: 1px solid var(--brand-line);
    z-index: 100;
    display: flex; flex-direction: column;
    animation: slideIn 0.25s ease;
    box-shadow: -8px 0 32px rgba(0,0,0,0.4);
  }
  @media (max-width: 760px) {
    .drawer {
      width: 100vw;
      top: auto;
      max-height: 92vh;
      border-left: none;
      border-top: 1px solid var(--brand-line);
      border-radius: 16px 16px 0 0;
      animation: slideInUp 0.25s ease;
    }
  }
  .drawer-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 16px 18px;
    border-bottom: 1px solid var(--brand-line);
    gap: 12px;
  }
  .drawer-head-titles { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
  .drawer-eyebrow {
    font-size: 11px; color: var(--ink-3, var(--ink-2));
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .drawer-title-input {
    background: transparent;
    border: none;
    color: var(--ink, #fff);
    font-size: 17px; font-weight: 600;
    padding: 2px 0;
    width: 100%;
    border-bottom: 1px solid transparent;
    transition: border-color 0.15s;
  }
  .drawer-title-input:focus { outline: none; border-bottom-color: #56bcec; }

  .drawer-body {
    flex: 1; overflow-y: auto;
    padding: 16px 18px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .drawer-foot {
    padding: 14px 18px;
    border-top: 1px solid var(--brand-line);
    display: flex; gap: 8px; justify-content: flex-end;
    flex-wrap: wrap;
  }
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .form-field {
    display: flex; flex-direction: column; gap: 4px;
  }
  .form-label {
    font-size: 11px; color: var(--ink-2);
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .form-field input,
  .form-field select {
    background: var(--canvas-2, rgba(255,255,255,0.03));
    border: 1px solid var(--brand-line);
    color: var(--ink, #fff);
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    transition: border-color 0.15s;
  }
  .form-field input:focus,
  .form-field select:focus {
    outline: none;
    border-color: #56bcec;
  }

  .confidence-block {
    display: flex; flex-direction: column; gap: 6px;
    padding: 12px 14px;
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--brand-line);
    border-radius: 10px;
  }
  .confidence-head {
    display: flex; align-items: center; justify-content: space-between;
  }

  .ai-notes {
    display: flex; flex-direction: column; gap: 4px;
    padding: 12px 14px;
    background: rgba(86, 188, 236, 0.04);
    border: 1px solid rgba(86, 188, 236, 0.20);
    border-radius: 10px;
  }
  .ai-notes-body {
    font-style: italic; color: var(--ink-2);
    font-size: 13px; margin: 0;
    line-height: 1.5;
  }

  .raw-block {
    display: flex; flex-direction: column; gap: 6px;
  }
  .raw-json {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--brand-line);
    border-radius: 10px;
    padding: 12px 14px;
    font: 11.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--ink-2);
    overflow: auto;
    max-height: 240px;
    margin: 0;
  }
  .link-btn {
    background: transparent; border: none;
    color: #56bcec; font-size: 12px;
    cursor: pointer; padding: 2px 0;
    text-decoration: none;
    align-self: flex-start;
  }
  .link-btn:hover { text-decoration: underline; }

  .form-error {
    color: #f87171; font-size: 12px;
    margin: 0; padding: 8px 10px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.25);
    border-radius: 8px;
  }

  @media (max-width: 980px) {
    .stats-row { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 760px) {
    .filter-row {
      flex-wrap: nowrap;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding-bottom: 4px;
    }
    .filter-row::-webkit-scrollbar { display: none; }
    .filter-btn { flex-shrink: 0; }
  }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes slideInUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
</style>
