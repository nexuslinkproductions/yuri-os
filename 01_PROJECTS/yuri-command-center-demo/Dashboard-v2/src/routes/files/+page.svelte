<script lang="ts">
  import { onMount } from 'svelte';
  import LiveBadge from '$components/LiveBadge.svelte';
  import { getAuthed, postAuthed } from '$lib/db';

  interface NexFile {
    id: string;
    filename: string;
    mime_type: string | null;
    size_bytes: number;
    category: string | null;
    subcategory: string | null;
    source_module: string | null;
    client_code: string | null;
    ai_summary: string | null;
    ai_tags: string[] | null;
    embedding_status: string | null;
    created_at: string;
  }

  type FilterType = 'client' | 'category' | 'module' | null;
  interface ActiveFilter { type: FilterType; value: string; }

  // ── Single source of truth ────────────────────────────
  let allFiles     = $state<NexFile[]>([]);
  let loading      = $state(true);
  let loadError    = $state<string | null>(null);
  let downloading  = $state<string | null>(null);
  let total        = $state(0);
  let displayCount = $state(36);
  const LIMIT      = 36;

  // ── Filter / search / view state ──────────────────────
  let activeFilter = $state<ActiveFilter>({ type: null, value: '' });
  let search       = $state('');
  let searchDebounced = $state('');
  let viewMode     = $state<'grid' | 'list'>('grid');
  let sortBy       = $state<'date' | 'name' | 'size' | 'client'>('date');
  let mobileFilterOpen = $state(false);

  // ── Upload modal ──────────────────────────────────────
  let showUpload    = $state(false);
  let uploadFile    = $state<File | null>(null);
  let uploadCat     = $state('other');
  let uploadModule  = $state('nexodocs');
  let uploadClient  = $state('');
  let uploading     = $state(false);
  let uploadError   = $state('');
  let uploadSuccess = $state('');
  let uploadProgress = $state(0);
  let dragOver      = $state(false);
  let fileInputEl: HTMLInputElement;

  // Files >= this threshold use the direct browser->Swift path (presign + PUT + confirm).
  // Below it, the legacy inline base64 path is cheaper (one HTTP roundtrip, no CORS).
  const DIRECT_UPLOAD_THRESHOLD = 500 * 1024;

  const CATEGORY_LABELS: Record<string,string> = {
    deliverables: 'Deliverables', finance: 'Finance', brand: 'Brand',
    strategy: 'Strategy', offers: 'Offers', other: 'Other',
  };
  const MODULE_LABELS: Record<string,string> = {
    nexogram: 'NEXOGRAM', finance: 'Finance', meeting: 'Meeting',
    plane: 'Plane', obsidian: 'Obsidian', nexodocs: 'NEXdocs',
  };

  // Debounce search
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const v = search;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchDebounced = v; }, 300);
  });

  async function loadAll() {
    loading = true;
    loadError = null;
    try {
      const data = await getAuthed('/api/functions/nex-files-list?limit=2000&offset=0');
      allFiles = data.files || [];
      total    = data.total ?? allFiles.length;
    } catch (e: any) {
      console.error('[files]', e);
      loadError = e?.message || 'Load failed';
    } finally {
      loading = false;
    }
  }

  function applyFilter(type: FilterType, value: string) {
    displayCount = LIMIT; // reset pagination on every filter change
    if (type === null) {
      activeFilter = { type: null, value: '' };
    } else if (activeFilter.type === type && activeFilter.value === value) {
      activeFilter = { type: null, value: '' };
    } else {
      activeFilter = { type, value };
    }
    mobileFilterOpen = false;
  }

  async function download(file: NexFile) {
    downloading = file.id;
    try {
      const d = await getAuthed(`/api/functions/nex-file-download?file_id=${file.id}`);
      if (d.url) {
        const a = document.createElement('a');
        a.href = d.url; a.download = d.filename || file.filename;
        a.target = '_blank'; a.rel = 'noopener'; a.click();
      } else {
        alert(d.error || 'Download not available yet.');
      }
    } finally {
      downloading = null;
    }
  }

  // ── Upload handlers ─────────────────────────────────
  function pickFile() {
    uploadError = ''; uploadSuccess = '';
    fileInputEl?.click();
  }

  function handleFile(f: File | null | undefined) {
    if (!f) return;
    // No size cap — large files use direct browser->Swift path.
    uploadFile = f;
    uploadError = '';
    if (f.type === 'application/pdf') uploadCat = 'deliverables';
    else if (f.type.startsWith('image/')) uploadCat = 'brand';
    else if (f.type.includes('spreadsheet') || f.type === 'text/csv') uploadCat = 'finance';
    else uploadCat = 'other';
  }

  function onFilePicked(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    handleFile(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const f = e.dataTransfer?.files?.[0];
    handleFile(f);
  }
  function onDragOver(e: DragEvent) { e.preventDefault(); dragOver = true; }
  function onDragLeave() { dragOver = false; }

  async function submitUpload() {
    if (!uploadFile) { uploadError = 'Please select a file first.'; return; }
    uploading = true; uploadError = ''; uploadSuccess = '';
    uploadProgress = 0;

    const f = uploadFile;
    const useDirect = f.size >= DIRECT_UPLOAD_THRESHOLD;

    try {
      if (!useDirect) {
        // Small files: legacy inline base64 path (cheaper, one HTTP roundtrip, no CORS)
        const buf = await f.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const payload = {
          filename: f.name,
          source_module: uploadModule || 'nexodocs',
          category: uploadCat || 'other',
          client_code: uploadClient.toUpperCase() || null,
          mime_type: f.type || null,
          content_base64: b64,
          created_by: 'ceo-upload',
          tags: ['manual-upload'],
        };
        const d = await postAuthed('/api/functions/nex-file-ingest', payload);
        uploadSuccess = `Uploaded: ${f.name}${d.deduped ? ' (already exists)' : ''}`;
      } else {
        // Large files: direct browser -> Swift path (unlimited size)
        // Step 1: pre-sign
        const presign = await postAuthed('/api/functions/nex-file-presign', {
          filename: f.name,
          mime_type: f.type || null,
          size_bytes: f.size,
          source_module: uploadModule || 'nexodocs',
          category: uploadCat || 'other',
          client_code: uploadClient.toUpperCase() || null,
          created_by: 'ceo-upload',
          tags: ['manual-upload'],
        });
        if (!presign?.ok) throw new Error(presign?.error || 'Pre-sign failed');

        // Step 2: PUT directly to Swift TempURL
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', presign.upload_url);
          xhr.setRequestHeader('Content-Type', f.type || 'application/octet-stream');
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) uploadProgress = Math.round((e.loaded / e.total) * 100);
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Swift upload failed: HTTP ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error('Network error during upload (check Swift CORS config)'));
          xhr.send(f);
        });

        // Step 3: confirm
        const confirm = await postAuthed('/api/functions/nex-file-confirm', { file_id: presign.file_id });
        if (!confirm?.ok) throw new Error(confirm?.error || 'Confirm failed');

        uploadSuccess = `Uploaded: ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`;
      }

      uploadFile = null;
      if (fileInputEl) fileInputEl.value = '';
      uploadProgress = 0;
      await loadAll();
    } catch (e: any) {
      uploadError = e.message || 'Upload failed.';
    } finally {
      uploading = false;
    }
  }

  function closeUpload() {
    showUpload = false; uploadFile = null;
    uploadError = ''; uploadSuccess = ''; dragOver = false;
    uploadProgress = 0;
  }

  onMount(() => {
    loadAll();
  });

  // ── Derived: sidebar counts ─────────────────────────
  const clientCounts = $derived.by(() => {
    const map = new Map<string, number>();
    for (const f of allFiles) {
      if (!f.client_code) continue;
      map.set(f.client_code, (map.get(f.client_code) || 0) + 1);
    }
    return [...map.entries()]
      .map(([k, v]) => ({ key: k, count: v }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  });

  const categoryCounts = $derived.by(() => {
    const map = new Map<string, number>();
    for (const f of allFiles) {
      if (!f.category) continue;
      map.set(f.category, (map.get(f.category) || 0) + 1);
    }
    return [...map.entries()]
      .map(([k, v]) => ({ key: k, count: v }))
      .sort((a, b) => b.count - a.count);
  });

  const moduleCounts = $derived.by(() => {
    const map = new Map<string, number>();
    for (const f of allFiles) {
      if (!f.source_module) continue;
      map.set(f.source_module, (map.get(f.source_module) || 0) + 1);
    }
    return [...map.entries()]
      .map(([k, v]) => ({ key: k, count: v }))
      .sort((a, b) => b.count - a.count);
  });

  // ── Derived: filtered + sorted display list ─────────
  // Single source: allFiles is always the truth. No switching between files/allFiles.
  const visible = $derived.by(() => {
    let list: NexFile[] = allFiles;

    // Apply sidebar filter client-side
    if (activeFilter.type === 'client') {
      list = list.filter(f => f.client_code?.toUpperCase() === activeFilter.value.toUpperCase());
    } else if (activeFilter.type === 'category') {
      list = list.filter(f => f.category === activeFilter.value);
    } else if (activeFilter.type === 'module') {
      list = list.filter(f => f.source_module === activeFilter.value);
    }

    // Apply search
    const q = searchDebounced.trim().toLowerCase();
    if (q) {
      list = list.filter(f => (
        f.filename.toLowerCase().includes(q) ||
        f.ai_summary?.toLowerCase().includes(q) ||
        f.client_code?.toLowerCase().includes(q) ||
        f.ai_tags?.some(t => t.toLowerCase().includes(q))
      ));
    }

    const sorted = [...list];
    if (sortBy === 'date') {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.filename.localeCompare(b.filename));
    } else if (sortBy === 'size') {
      sorted.sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0));
    } else if (sortBy === 'client') {
      sorted.sort((a, b) => (a.client_code || 'ZZZ').localeCompare(b.client_code || 'ZZZ'));
    }
    return sorted;
  });

  // Paginated slice shown in the grid/list (filter/search shows all; unfiltered paginates)
  const shownFiles = $derived(
    (activeFilter.type || searchDebounced) ? visible : visible.slice(0, displayCount)
  );

  // Whether more items are available via Load More
  const has_more = $derived(!activeFilter.type && !searchDebounced && visible.length > displayCount);

  // Display total: always the filtered count
  const displayTotal = $derived(visible.length);

  // ── Helpers ─────────────────────────────────────────
  function fmtSize(b: number) {
    if (!b) return '-';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function fmtDate(s: string) {
    return new Date(s).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: '2-digit' });
  }

  type IconSpec = { kind: string; label: string; bg: string; fg: string };
  function iconSpec(file: { mime_type: string | null; filename: string }): IconSpec {
    const mime = file.mime_type || '';
    const ext = (file.filename.split('.').pop() || '').toLowerCase();
    if (mime === 'application/pdf' || ext === 'pdf') return { kind: 'pdf', label: 'PDF', bg: '#e85a4f', fg: '#fff' };
    if (mime === 'text/markdown' || ext === 'md' || ext === 'markdown') return { kind: 'md', label: 'MD', bg: '#56bcec', fg: '#001722' };
    if (mime === 'text/html' || ext === 'html' || ext === 'htm') return { kind: 'html', label: '</>', bg: '#e8923a', fg: '#fff' };
    if (mime.startsWith('image/') || ['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return { kind: 'image', label: 'IMG', bg: '#3fb27f', fg: '#fff' };
    if (mime === 'application/json' || ext === 'json') return { kind: 'json', label: '{ }', bg: '#9b59b6', fg: '#fff' };
    if (mime === 'text/csv' || ext === 'csv') return { kind: 'csv', label: 'CSV', bg: '#2aa698', fg: '#fff' };
    if (mime.includes('spreadsheet') || ['xls','xlsx'].includes(ext)) return { kind: 'csv', label: 'XLS', bg: '#2aa698', fg: '#fff' };
    if (mime.startsWith('video/') || ['mp4','mov','webm'].includes(ext)) return { kind: 'video', label: 'VID', bg: '#7e6cd9', fg: '#fff' };
    if (['woff','woff2','ttf','otf','eot'].includes(ext)) return { kind: 'font', label: 'BIN', bg: '#6e7681', fg: '#fff' };
    if (mime.startsWith('text/') || ['txt','log'].includes(ext)) return { kind: 'text', label: 'TXT', bg: '#5b8def', fg: '#fff' };
    return { kind: 'doc', label: 'DOC', bg: '#5b6b87', fg: '#fff' };
  }

  function moduleColor(mod: string | null) {
    const m: Record<string, string> = {
      nexogram: 'var(--a)', finance: 'var(--success, #2ecc71)', meeting: 'var(--warn, #f5a623)',
      plane: '#7e6cd9', obsidian: '#9b59b6', nexodocs: 'var(--t2)',
    };
    return m[mod || ''] || 'var(--t3)';
  }

  function embeddingDot(status: string | null) {
    if (status === 'tagged' || status === 'embedded') return { color: 'var(--a)', label: 'Embedded' };
    if (status === 'pending') return { color: 'var(--warn, #f5a623)', label: 'Pending' };
    return { color: 'var(--t4, #5a6577)', label: status || 'N/A' };
  }

  function activeIs(type: FilterType, value: string) {
    return activeFilter.type === type && activeFilter.value === value;
  }

  // Known client codes for upload autocomplete
  const knownClientCodes = $derived.by(() => {
    const set = new Set<string>();
    for (const f of allFiles) if (f.client_code) set.add(f.client_code);
    return [...set].sort();
  });
</script>

<!-- Hidden file input -->
<input bind:this={fileInputEl} type="file" style="display:none" onchange={onFilePicked} />

<!-- ── Header ──────────────────────────────────────── -->
<header class="row between items-center wrap gap-4 page-header">
  <div class="stack gap-1">
    <span class="caption">09 / NEX FILE VAULT</span>
    <div class="row items-center gap-3">
      <h1 class="h1 font-display" style="margin:0">File Vault</h1>
      <span class="count-badge">{displayTotal} file{displayTotal !== 1 ? 's' : ''}</span>
    </div>
    <p class="body">Finder-style archive across every NEX module. Click a sidebar entry to scope.</p>
  </div>
  <div class="row gap-2 items-center">
    <button class="upload-btn" onclick={() => (showUpload = true)}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
      Upload
    </button>
    <LiveBadge />
  </div>
</header>

<!-- ── Mobile filter toggle (visible <768px) ──────── -->
<button class="mobile-filter-toggle" onclick={() => (mobileFilterOpen = !mobileFilterOpen)}>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="9" y1="18" x2="15" y2="18"/></svg>
  {activeFilter.type ? `${activeFilter.type}: ${activeFilter.value}` : 'All Files'}
  <span class="mft-count">{displayTotal}</span>
</button>

<!-- ── Two-panel layout ──────────────────────────── -->
<div class="vault-layout">
  <!-- LEFT SIDEBAR -->
  <aside class="sidebar" class:open={mobileFilterOpen}>
    <button
      class="sb-item sb-all"
      class:active={activeFilter.type === null}
      onclick={() => applyFilter(null, '')}
    >
      <span class="sb-dot" style="background:var(--a)"></span>
      <span class="sb-label">All Files</span>
      <span class="sb-count">{allFiles.length}</span>
    </button>

    {#if clientCounts.length}
      <div class="sb-section">
        <span class="sb-section-label">Clients</span>
        <div class="sb-list">
          {#each clientCounts as c (c.key)}
            <button
              class="sb-item"
              class:active={activeIs('client', c.key)}
              onclick={() => applyFilter('client', c.key)}
            >
              <span class="sb-chev">›</span>
              <span class="sb-label sb-client">{c.key}</span>
              <span class="sb-count">{c.count}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if categoryCounts.length}
      <div class="sb-section">
        <span class="sb-section-label">Categories</span>
        <div class="sb-list">
          {#each categoryCounts as c (c.key)}
            <button
              class="sb-item"
              class:active={activeIs('category', c.key)}
              onclick={() => applyFilter('category', c.key)}
            >
              <span class="sb-chev">›</span>
              <span class="sb-label">{CATEGORY_LABELS[c.key] || c.key}</span>
              <span class="sb-count">{c.count}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if moduleCounts.length}
      <div class="sb-section">
        <span class="sb-section-label">Modules</span>
        <div class="sb-list">
          {#each moduleCounts as m (m.key)}
            <button
              class="sb-item"
              class:active={activeIs('module', m.key)}
              onclick={() => applyFilter('module', m.key)}
            >
              <span class="sb-dot" style="background:{moduleColor(m.key)}"></span>
              <span class="sb-label">{MODULE_LABELS[m.key] || m.key}</span>
              <span class="sb-count">{m.count}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </aside>

  <!-- MAIN CONTENT -->
  <main class="content">
    <!-- Top toolbar -->
    <div class="toolbar">
      <div class="search-wrap">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input class="search-input" placeholder="Search filename, summary, tags…" bind:value={search} />
        {#if search}
          <button class="search-clear" onclick={() => { search = ''; }} title="Clear">x</button>
        {/if}
      </div>

      <div class="sort-wrap">
        <span class="sort-label">Sort</span>
        <select class="sort-sel" bind:value={sortBy}>
          <option value="date">Date (newest)</option>
          <option value="name">Name (A-Z)</option>
          <option value="size">Size (largest)</option>
          <option value="client">Client (A-Z)</option>
        </select>
      </div>

      <div class="view-toggle">
        <button
          class="vt-btn"
          class:active={viewMode === 'grid'}
          onclick={() => (viewMode = 'grid')}
          title="Grid view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        </button>
        <button
          class="vt-btn"
          class:active={viewMode === 'list'}
          onclick={() => (viewMode = 'list')}
          title="List view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
    </div>

    <!-- Breadcrumb / active filter chip -->
    {#if activeFilter.type}
      <div class="active-chip-row">
        <span class="caption">Filtering by</span>
        <span class="active-chip">
          {activeFilter.type}: <strong>{activeFilter.value}</strong>
          <button class="chip-x" onclick={() => applyFilter(null, '')} title="Clear filter">x</button>
        </span>
      </div>
    {/if}

    <!-- Content -->
    {#if loading}
      <div class="empty-state">
        <div class="loader"></div>
        <p class="body" style="color:var(--t3)">Loading vault…</p>
      </div>
    {:else if loadError}
      <div class="empty-state empty-glass">
        <p class="h2 font-display" style="color:var(--error,#e85a4f);margin:0">Load error</p>
        <p class="body small" style="color:var(--t3);font-family:monospace">{loadError}</p>
        <button class="upload-btn" onclick={loadAll}>Retry</button>
      </div>
    {:else if visible.length === 0}
      <div class="empty-state empty-glass">
        <div class="empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        </div>
        <p class="h2 font-display" style="color:var(--t2);margin:0">No files found</p>
        <p class="body small" style="color:var(--t3);max-width:420px;text-align:center">
          {searchDebounced ? 'Try a different search term.' : 'Files auto-archive when meetings analyze, invoices settle, or tickets close.'}
        </p>
        <button class="upload-btn" onclick={() => (showUpload = true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
          Upload a file
        </button>
      </div>
    {:else if viewMode === 'grid'}
      <div class="file-grid">
        {#each shownFiles as f, i (f.id)}
          {@const ic = iconSpec(f)}
          {@const emb = embeddingDot(f.embedding_status)}
          <article class="file-card enter-up" style="">
            <div class="fc-top">
              <span class="file-icon" style="background:{ic.bg};color:{ic.fg}">{ic.label}</span>
              <div class="fc-meta">
                <span class="fc-name" title={f.filename}>{f.filename}</span>
                <div class="fc-badges">
                  {#if f.client_code}
                    <span class="badge accent">{f.client_code}</span>
                  {/if}
                  {#if f.category}
                    <span class="badge muted">{CATEGORY_LABELS[f.category] || f.category}</span>
                  {/if}
                  {#if f.source_module}
                    <span class="badge mod">
                      <span class="mod-dot" style="background:{moduleColor(f.source_module)}"></span>
                      {MODULE_LABELS[f.source_module] || f.source_module}
                    </span>
                  {/if}
                </div>
              </div>
              <button class="dl-btn" onclick={() => download(f)} disabled={downloading === f.id} title="Download">
                {#if downloading === f.id}
                  <span class="dl-spin"></span>
                {:else}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>
                {/if}
              </button>
            </div>

            {#if f.ai_summary}
              <p class="fc-summary">{f.ai_summary}</p>
            {/if}

            {#if f.ai_tags?.length}
              <div class="fc-tags">
                {#each (f.ai_tags || []).slice(0, 5) as tag}
                  <span class="tag">#{tag}</span>
                {/each}
              </div>
            {/if}

            <div class="fc-footer">
              <span class="caption">{fmtSize(f.size_bytes)}</span>
              <span class="caption">{fmtDate(f.created_at)}</span>
              <span class="emb-pill" title={emb.label}>
                <span class="emb-dot" style="background:{emb.color}"></span>
                {emb.label}
              </span>
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <!-- List view -->
      <div class="file-list">
        <div class="fl-head">
          <div class="fl-cell fl-icon"></div>
          <div class="fl-cell fl-name">Name</div>
          <div class="fl-cell fl-client">Client</div>
          <div class="fl-cell fl-cat">Category</div>
          <div class="fl-cell fl-mod">Module</div>
          <div class="fl-cell fl-size">Size</div>
          <div class="fl-cell fl-date">Date</div>
          <div class="fl-cell fl-action"></div>
        </div>
        {#each shownFiles as f, i (f.id)}
          {@const ic = iconSpec(f)}
          <div class="fl-row enter-up" style="">
            <div class="fl-cell fl-icon">
              <span class="file-icon sm" style="background:{ic.bg};color:{ic.fg}">{ic.label}</span>
            </div>
            <div class="fl-cell fl-name" title={f.filename}>{f.filename}</div>
            <div class="fl-cell fl-client">
              {#if f.client_code}<span class="badge accent">{f.client_code}</span>{:else}<span class="dash">-</span>{/if}
            </div>
            <div class="fl-cell fl-cat">{f.category ? (CATEGORY_LABELS[f.category] || f.category) : '-'}</div>
            <div class="fl-cell fl-mod">
              {#if f.source_module}
                <span class="mod-dot" style="background:{moduleColor(f.source_module)}"></span>
                {MODULE_LABELS[f.source_module] || f.source_module}
              {:else}
                <span class="dash">-</span>
              {/if}
            </div>
            <div class="fl-cell fl-size">{fmtSize(f.size_bytes)}</div>
            <div class="fl-cell fl-date">{fmtDate(f.created_at)}</div>
            <div class="fl-cell fl-action">
              <button class="dl-btn sm" onclick={() => download(f)} disabled={downloading === f.id} title="Download">
                {#if downloading === f.id}
                  <span class="dl-spin"></span>
                {:else}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>
                {/if}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if has_more}
      <div class="load-more-row">
        <button class="load-more" onclick={() => (displayCount += LIMIT)}>
          Load more ({visible.length - displayCount} remaining)
        </button>
      </div>
    {/if}
  </main>
</div>

<!-- ── Upload modal ──────────────────────────────── -->
{#if showUpload}
  <div class="modal-overlay" onclick={closeUpload} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Upload file">
      <header class="row between items-center">
        <div class="stack gap-0">
          <span class="caption">UPLOAD</span>
          <h2 class="h2 font-display" style="margin:0">Add to Vault</h2>
        </div>
        <button class="close-btn" onclick={closeUpload} title="Close">x</button>
      </header>

      <!-- Drop zone -->
      <div
        class="drop-zone"
        class:has-file={uploadFile}
        class:drag-over={dragOver}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={onDrop}
        onclick={pickFile}
        role="button"
        tabindex="0"
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && pickFile()}
      >
        {#if uploadFile}
          {@const ic = iconSpec({ mime_type: uploadFile.type, filename: uploadFile.name })}
          <span class="file-icon lg" style="background:{ic.bg};color:{ic.fg}">{ic.label}</span>
          <span class="dz-name">{uploadFile.name}</span>
          <span class="dz-size">{fmtSize(uploadFile.size)}</span>
          <span class="dz-hint">Click to choose a different file</span>
        {:else}
          <span class="dz-upload-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </span>
          <span class="dz-label">Drop a file or click to select</span>
          <span class="dz-hint">PDF, images, video, text, HTML / no size limit</span>
        {/if}
      </div>

      <!-- Metadata -->
      <div class="upload-fields">
        <div class="field-row">
          <label class="field-group">
            <span class="field-label">Category</span>
            <select class="field-input" bind:value={uploadCat}>
              <option value="deliverables">Deliverables</option>
              <option value="finance">Finance</option>
              <option value="brand">Brand</option>
              <option value="strategy">Strategy</option>
              <option value="offers">Offers</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label class="field-group">
            <span class="field-label">Module</span>
            <select class="field-input" bind:value={uploadModule}>
              <option value="nexodocs">NEXdocs</option>
              <option value="plane">Plane</option>
              <option value="meeting">Meeting</option>
              <option value="finance">Finance</option>
              <option value="nexogram">NEXOGRAM</option>
              <option value="obsidian">Obsidian</option>
            </select>
          </label>
        </div>

        <label class="field-group">
          <span class="field-label">Client code (optional)</span>
          <input
            class="field-input"
            placeholder="e.g. SHI, CASA, MFB"
            list="known-client-codes"
            bind:value={uploadClient}
          />
          <datalist id="known-client-codes">
            {#each knownClientCodes as code}
              <option value={code}></option>
            {/each}
          </datalist>
        </label>

        <p class="ai-hint">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Files in <strong>{CATEGORY_LABELS[uploadCat]}</strong> get auto-tagged + embedded by NEX-RAG.
        </p>
      </div>

      {#if uploading && uploadProgress > 0}
        <div class="upload-progress">
          <div class="upload-progress-bar" style="width:{uploadProgress}%"></div>
        </div>
        <div class="upload-progress-label">{uploadProgress}% uploaded</div>
      {/if}

      {#if uploadError}<p class="upload-msg error">{uploadError}</p>{/if}
      {#if uploadSuccess}<p class="upload-msg success">{uploadSuccess}</p>{/if}

      <div class="row gap-2" style="margin-top:4px">
        <button class="cancel-btn" onclick={closeUpload} disabled={uploading}>Cancel</button>
        <button class="submit-btn" onclick={submitUpload} disabled={uploading || !uploadFile}>
          {#if uploading}
            <span class="dl-spin"></span> Uploading…
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
            Upload & Tag
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Header ─────────────────────────────────────── */
  .page-header { margin-bottom: 18px; }
  .count-badge {
    display: inline-flex; align-items: center;
    height: 22px; padding: 0 10px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--a) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--a) 30%, transparent);
    color: var(--a);
    font-family: 'Space Mono', monospace; font-size: 11.5px; font-weight: 600;
    letter-spacing: 0.02em;
  }
  .upload-btn {
    all: unset; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px;
    border: 1px solid var(--a);
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--a) 14%, transparent);
    color: var(--a);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13px; font-weight: 600;
    transition: background 0.15s, transform 0.1s;
  }
  .upload-btn:hover { background: color-mix(in srgb, var(--a) 24%, transparent); }
  .upload-btn:active { transform: translateY(1px); }

  /* ── Mobile filter toggle ──────────────────────── */
  .mobile-filter-toggle {
    display: none;
    all: unset; cursor: pointer;
    align-items: center; gap: 8px;
    padding: 10px 14px;
    background: var(--s1);
    border: 1px solid var(--b2);
    border-radius: var(--r-md);
    color: var(--tx);
    font-family: 'Space Grotesk', sans-serif; font-size: 13px;
    margin-bottom: 12px;
    width: 100%; box-sizing: border-box;
  }
  .mft-count {
    margin-left: auto;
    font-family: 'Space Mono', monospace; font-size: 11px;
    color: var(--t3);
  }

  /* ── Layout ────────────────────────────────────── */
  .vault-layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 16px;
    align-items: start;
  }

  /* ── Sidebar ───────────────────────────────────── */
  .sidebar {
    position: sticky; top: 16px;
    display: flex; flex-direction: column;
    gap: 14px;
    padding: 14px 10px;
    background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01));
    border: 1px solid var(--b1);
    border-radius: var(--r-md);
    backdrop-filter: blur(8px);
    max-height: calc(100vh - 32px);
    overflow-y: auto;
  }
  .sidebar::-webkit-scrollbar { width: 6px; }
  .sidebar::-webkit-scrollbar-thumb { background: var(--b2); border-radius: 3px; }

  .sb-section { display: flex; flex-direction: column; gap: 2px; }
  .sb-section-label {
    font-family: 'Space Mono', monospace;
    font-size: 10.5px; font-weight: 600;
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0 8px;
    margin-bottom: 4px;
  }
  .sb-list { display: flex; flex-direction: column; gap: 1px; }

  .sb-item {
    all: unset; cursor: pointer;
    display: flex; align-items: center; gap: 8px;
    padding: 7px 10px;
    border-left: 2px solid transparent;
    border-radius: 0 var(--r-sm) var(--r-sm) 0;
    color: var(--t2);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12.5px;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .sb-item:hover {
    background: color-mix(in srgb, var(--a) 6%, transparent);
    color: var(--tx);
  }
  .sb-item.active {
    background: color-mix(in srgb, var(--a) 15%, transparent);
    color: var(--a);
    border-left-color: var(--a);
  }
  .sb-all { font-weight: 600; }
  .sb-dot {
    width: 8px; height: 8px; border-radius: 50%;
    flex-shrink: 0;
  }
  .sb-chev {
    color: var(--t4, #5a6577);
    font-size: 12px;
    width: 8px;
  }
  .sb-item.active .sb-chev { color: var(--a); }
  .sb-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sb-client { font-weight: 700; letter-spacing: 0.03em; font-family: 'Space Mono', monospace; font-size: 11.5px; }
  .sb-count {
    font-family: 'Space Mono', monospace;
    font-size: 10.5px;
    color: var(--t3);
    background: var(--s2);
    padding: 1px 6px;
    border-radius: 8px;
  }
  .sb-item.active .sb-count {
    color: var(--a);
    background: color-mix(in srgb, var(--a) 18%, transparent);
  }

  /* ── Content area ──────────────────────────────── */
  .content { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

  /* ── Toolbar ───────────────────────────────────── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    background: var(--s1);
    border: 1px solid var(--b1);
    border-radius: var(--r-md);
    flex-wrap: wrap;
  }
  .search-wrap {
    position: relative;
    flex: 1;
    min-width: 200px;
    display: flex; align-items: center;
  }
  .search-icon {
    position: absolute;
    left: 10px;
    color: var(--t3);
    pointer-events: none;
  }
  .search-input {
    width: 100%;
    background: var(--s2);
    border: 1px solid var(--b2);
    border-radius: var(--r-sm);
    color: var(--tx);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13px;
    padding: 8px 30px 8px 32px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .search-input:focus { border-color: var(--a); }
  .search-input::placeholder { color: var(--t4, #5a6577); }
  .search-clear {
    all: unset; cursor: pointer;
    position: absolute; right: 8px;
    width: 18px; height: 18px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    color: var(--t3);
    font-size: 11px;
    background: var(--s3);
  }
  .search-clear:hover { background: var(--s1); color: var(--tx); }

  .sort-wrap { display: flex; align-items: center; gap: 6px; }
  .sort-label {
    font-family: 'Space Mono', monospace;
    font-size: 10.5px;
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .sort-sel {
    background: var(--s2);
    border: 1px solid var(--b2);
    border-radius: var(--r-sm);
    color: var(--tx);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12.5px;
    padding: 7px 10px;
    outline: none;
    cursor: pointer;
  }
  .sort-sel:focus { border-color: var(--a); }

  .view-toggle {
    display: flex;
    background: var(--s2);
    border: 1px solid var(--b2);
    border-radius: var(--r-sm);
    padding: 2px;
    gap: 2px;
  }
  .vt-btn {
    all: unset; cursor: pointer;
    width: 30px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 4px;
    color: var(--t3);
    transition: background 0.15s, color 0.15s;
  }
  .vt-btn:hover { color: var(--tx); }
  .vt-btn.active {
    background: color-mix(in srgb, var(--a) 18%, transparent);
    color: var(--a);
  }

  /* ── Active filter chip ────────────────────────── */
  .active-chip-row {
    display: flex; align-items: center; gap: 10px;
    padding: 4px 2px;
  }
  .active-chip {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 4px 10px;
    background: color-mix(in srgb, var(--a) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--a) 30%, transparent);
    border-radius: 14px;
    color: var(--a);
    font-family: 'Space Mono', monospace;
    font-size: 11.5px;
  }
  .chip-x {
    all: unset; cursor: pointer;
    width: 16px; height: 16px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--a) 22%, transparent);
    font-size: 10px;
  }
  .chip-x:hover { background: var(--a); color: #001722; }

  /* ── Grid view ─────────────────────────────────── */
  .file-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  @media (max-width: 1100px) {
    .file-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 640px) {
    .file-grid { grid-template-columns: 1fr; }
  }

  .file-card {
    display: flex; flex-direction: column; gap: 10px;
    padding: 14px;
    border-radius: var(--r-md);
    border: 1px solid var(--b1);
    background: linear-gradient(180deg, var(--s1), color-mix(in srgb, var(--s1) 88%, transparent));
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
  }
  .file-card:hover {
    border-color: color-mix(in srgb, var(--a) 30%, var(--b2));
    box-shadow: 0 8px 24px rgba(0,0,0,0.18), 0 0 0 1px color-mix(in srgb, var(--a) 8%, transparent);
    transform: translateY(-1px);
  }

  .fc-top { display: flex; align-items: flex-start; gap: 10px; }

  .file-icon {
    width: 36px; height: 36px;
    flex-shrink: 0;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Space Mono', monospace;
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.02em;
  }
  .file-icon.sm { width: 26px; height: 26px; border-radius: 5px; font-size: 9px; }
  .file-icon.lg { width: 56px; height: 56px; border-radius: 12px; font-size: 16px; }

  .fc-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .fc-name {
    font-size: 13px; font-weight: 600;
    color: var(--tx);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: 'Space Grotesk', sans-serif;
  }
  .fc-badges { display: flex; flex-wrap: wrap; gap: 4px; }

  .badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-family: 'Space Mono', monospace;
    font-size: 10px; font-weight: 600;
    padding: 2px 7px;
    border-radius: 10px;
    border: 1px solid var(--b1);
    color: var(--t2);
    letter-spacing: 0.02em;
    line-height: 1.4;
  }
  .badge.accent {
    color: var(--a);
    background: color-mix(in srgb, var(--a) 10%, transparent);
    border-color: color-mix(in srgb, var(--a) 28%, transparent);
  }
  .badge.muted { color: var(--t3); }
  .badge.mod { color: var(--t2); }
  .mod-dot {
    width: 6px; height: 6px; border-radius: 50%;
    display: inline-block;
  }

  .dl-btn {
    all: unset; cursor: pointer;
    width: 30px; height: 30px;
    border-radius: var(--r-sm);
    border: 1px solid var(--b2);
    background: var(--s2);
    color: var(--t2);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .dl-btn:hover {
    background: color-mix(in srgb, var(--a) 14%, var(--s2));
    color: var(--a);
    border-color: var(--a);
  }
  .dl-btn:disabled { opacity: 0.4; cursor: default; }
  .dl-btn.sm { width: 24px; height: 24px; }

  .dl-spin {
    width: 12px; height: 12px;
    border: 2px solid color-mix(in srgb, var(--a) 30%, transparent);
    border-top-color: var(--a);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .fc-summary {
    font-size: 12px;
    color: var(--t2);
    line-height: 1.45;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .fc-tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag {
    font-family: 'Space Mono', monospace;
    font-size: 10px;
    color: var(--t3);
    background: var(--s2);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .fc-footer {
    display: flex; align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--b1);
    padding-top: 8px;
    margin-top: 2px;
    gap: 8px;
  }
  .emb-pill {
    display: inline-flex; align-items: center; gap: 4px;
    font-family: 'Space Mono', monospace;
    font-size: 10px;
    color: var(--t3);
  }
  .emb-dot {
    width: 6px; height: 6px; border-radius: 50%;
  }

  /* ── List view ─────────────────────────────────── */
  .file-list {
    display: flex; flex-direction: column;
    border: 1px solid var(--b1);
    border-radius: var(--r-md);
    overflow: hidden;
    background: var(--s1);
  }
  .fl-head, .fl-row {
    display: grid;
    grid-template-columns: 48px 1fr 90px 130px 130px 80px 90px 48px;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    font-size: 12.5px;
  }
  .fl-head {
    background: var(--s2);
    border-bottom: 1px solid var(--b2);
    font-family: 'Space Mono', monospace;
    font-size: 10.5px;
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .fl-row {
    border-bottom: 1px solid var(--b1);
    transition: background 0.15s;
  }
  .fl-row:nth-child(odd) { background: color-mix(in srgb, var(--s2) 40%, transparent); }
  .fl-row:hover { background: color-mix(in srgb, var(--a) 5%, transparent); }
  .fl-row:last-child { border-bottom: none; }

  .fl-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fl-name { color: var(--tx); font-weight: 500; }
  .fl-client, .fl-cat, .fl-mod, .fl-size, .fl-date { color: var(--t2); }
  .fl-mod { display: flex; align-items: center; gap: 6px; }
  .dash { color: var(--t4, #5a6577); }

  @media (max-width: 900px) {
    .fl-head, .fl-row {
      grid-template-columns: 40px 1fr 80px 80px 60px 40px;
    }
    .fl-cat, .fl-date { display: none; }
  }

  /* ── Empty / Loader ────────────────────────────── */
  .empty-state {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 14px;
    padding: 60px 20px;
    border-radius: var(--r-lg);
  }
  .empty-glass {
    background: var(--s1);
    border: 1px solid var(--b1);
  }
  .empty-icon { color: var(--t3); }

  .loader {
    width: 28px; height: 28px;
    border: 3px solid color-mix(in srgb, var(--a) 20%, transparent);
    border-top-color: var(--a);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }

  /* ── Load more ─────────────────────────────────── */
  .load-more-row { display: flex; justify-content: center; padding: 12px 0 4px; }
  .load-more {
    all: unset; cursor: pointer;
    padding: 9px 22px;
    border: 1px solid var(--b2);
    border-radius: var(--r-md);
    background: var(--s1);
    color: var(--t2);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12.5px;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .load-more:hover {
    background: color-mix(in srgb, var(--a) 8%, var(--s1));
    color: var(--a);
    border-color: var(--a);
  }
  .load-more:disabled { opacity: 0.5; cursor: default; }

  /* ── Enter animation ───────────────────────────── */
  .enter-up {
    animation: enterUp 0.22s ease both;
  }
  @keyframes enterUp {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Upload modal ──────────────────────────────── */
  .modal-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .modal {
    width: 100%; max-width: 520px;
    padding: 24px;
    border-radius: var(--r-lg);
    display: flex; flex-direction: column;
    gap: 16px;
    border: 1px solid var(--b2);
    background:
      linear-gradient(180deg, rgba(86,188,236,0.04), transparent 40%),
      var(--s1);
    box-shadow: 0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(86,188,236,0.08);
    animation: modalIn 0.25s cubic-bezier(0.2, 0.7, 0.3, 1);
  }
  @keyframes modalIn {
    from { opacity: 0; transform: translateY(12px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .close-btn {
    all: unset; cursor: pointer;
    width: 30px; height: 30px;
    display: flex; align-items: center; justify-content: center;
    border-radius: var(--r-sm);
    color: var(--t3);
    font-size: 13px;
    background: var(--s2);
    border: 1px solid var(--b1);
  }
  .close-btn:hover { background: var(--s3); color: var(--tx); }

  .drop-zone {
    cursor: pointer;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 8px;
    padding: 32px 16px;
    border: 2px dashed var(--b2);
    border-radius: var(--r-md);
    background: var(--s2);
    transition: border-color 0.2s, background 0.2s;
    width: 100%; box-sizing: border-box;
    text-align: center;
  }
  .drop-zone:hover { border-color: var(--a); background: color-mix(in srgb, var(--a) 6%, var(--s2)); }
  .drop-zone.has-file { border-color: var(--a); border-style: solid; }
  .drop-zone.drag-over {
    border-color: var(--a);
    background: color-mix(in srgb, var(--a) 12%, var(--s2));
  }
  .dz-upload-icon { color: var(--t3); }
  .dz-name { font-size: 14px; font-weight: 600; color: var(--tx); font-family: 'Space Grotesk', sans-serif; }
  .dz-size { font-size: 12px; color: var(--t3); font-family: 'Space Mono', monospace; }
  .dz-label { font-size: 13px; color: var(--t2); font-family: 'Space Grotesk', sans-serif; }
  .dz-hint { font-size: 11px; color: var(--t4, #5a6577); font-family: 'Space Mono', monospace; }

  .upload-fields { display: flex; flex-direction: column; gap: 12px; }
  .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .field-group { display: flex; flex-direction: column; gap: 4px; }
  .field-label {
    font-size: 10.5px; color: var(--t3);
    font-family: 'Space Mono', monospace;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .field-input {
    background: var(--s2);
    border: 1px solid var(--b2);
    border-radius: var(--r-sm);
    color: var(--tx);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13px;
    padding: 8px 10px;
    outline: none;
    transition: border-color 0.15s;
  }
  .field-input:focus { border-color: var(--a); }

  .ai-hint {
    display: flex; align-items: center; gap: 6px;
    margin: 0;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--a) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--a) 18%, transparent);
    border-radius: var(--r-sm);
    color: var(--t2);
    font-size: 11.5px;
    line-height: 1.4;
  }
  .ai-hint strong { color: var(--a); font-weight: 600; }

  .upload-progress {
    height: 6px;
    background: rgba(255,255,255,0.07);
    border-radius: 4px;
    overflow: hidden;
    margin: 4px 0 2px;
  }
  .upload-progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--a), color-mix(in srgb, var(--a) 70%, #7c3aed));
    transition: width 0.2s ease;
  }
  .upload-progress-label {
    font-family: 'Space Mono', monospace;
    font-size: 11px;
    color: var(--t3);
    text-align: right;
  }

  .upload-msg {
    font-size: 12.5px;
    padding: 8px 12px;
    border-radius: var(--r-sm);
    margin: 0;
  }
  .upload-msg.error {
    background: color-mix(in srgb, var(--err, #e74c3c) 12%, transparent);
    color: var(--err, #e74c3c);
    border: 1px solid color-mix(in srgb, var(--err, #e74c3c) 28%, transparent);
  }
  .upload-msg.success {
    background: color-mix(in srgb, var(--success, #2ecc71) 12%, transparent);
    color: var(--success, #2ecc71);
    border: 1px solid color-mix(in srgb, var(--success, #2ecc71) 28%, transparent);
  }

  .cancel-btn {
    all: unset; cursor: pointer; flex: 1;
    text-align: center;
    padding: 10px;
    border: 1px solid var(--b2);
    border-radius: var(--r-md);
    color: var(--t2);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13px;
    background: var(--s2);
  }
  .cancel-btn:hover { background: var(--s3); color: var(--tx); }
  .cancel-btn:disabled { opacity: 0.5; cursor: default; }

  .submit-btn {
    all: unset; cursor: pointer; flex: 2;
    text-align: center;
    padding: 10px;
    border-radius: var(--r-md);
    background: var(--a);
    color: #001722;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; gap: 6px;
  }
  .submit-btn:hover { opacity: 0.92; }
  .submit-btn:disabled { opacity: 0.45; cursor: default; }

  /* ── Responsive ────────────────────────────────── */
  @media (max-width: 768px) {
    .vault-layout { grid-template-columns: 1fr; }
    .mobile-filter-toggle { display: inline-flex; }
    .sidebar {
      position: static;
      max-height: 60vh;
      display: none;
    }
    .sidebar.open { display: flex; }
    .field-row { grid-template-columns: 1fr; }
  }
</style>
