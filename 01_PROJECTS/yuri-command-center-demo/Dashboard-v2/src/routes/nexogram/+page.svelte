<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { supabase, postAuthed, getAuthed, hasClient } from "$lib/db";
  import {
    subscribeNexogramChannel,
    subscribeNexogramEphemeral,
    onConnectionStateChange,
    getConnectionState,
    reconnectPusher,
  } from "$lib/pusher-realtime";

  // ─────────────────────────────────────────────────────────────────────────
  // Types
  // ─────────────────────────────────────────────────────────────────────────
  interface Channel {
    id: string;
    name: string;
    description: string | null;
    type: "team" | "direct" | "client";
    kind?: "team" | "direct" | "client" | "nex";
    slug: string;
    owner_id?: string | null;
    created_at: string;
  }

  interface MessageMetadata {
    model?: string;
    latency_ms?: number;
    [k: string]: unknown;
  }

  interface Message {
    id: string;
    channel_id: string;
    sender_id: string | null;
    sender_name: string;
    content: string;
    type: "text" | "ai" | "system";
    created_at: string;
    pending?: boolean;
    failed?: boolean;
    error?: string;
    metadata?: MessageMetadata | null;
    edited_at?: string | null;
    deleted_at?: string | null;
    reactions?: Record<string, string[]> | null;
  }

  const REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','🔥','✅','👀'];

  interface CtxTicket {
    id: string;
    seq: string;
    name: string;
    priority: string | null;
    due_date: string | null;
    state: string | null;
    state_group: string | null;
    customer: string | null;
    is_overdue: boolean;
  }

  interface CtxCommitment {
    id: string;
    promise: string;
    due_at: string | null;
    actor: string;
  }

  interface CtxAgent {
    agent_name: string;
    last_action: string | null;
    last_action_at: string | null;
    status: string | null;
    liveness: string | null;
    expected_interval_s: number | null;
    age_seconds: number | null;
  }

  interface CtxTracker {
    active: boolean;
    entry: {
      description: string | null;
      client_code: string | null;
      plane_issue_seq: string | null;
      started_at: string | null;
    } | null;
  }

  interface CtxDecision {
    decision: string | null;
    rationale: string | null;
    outcome: string | null;
    client_code: string | null;
    created_at: string | null;
  }

  interface CtxMeeting {
    title: string;
    start: string | null;
    end: string | null;
    attendees: string[];
  }

  interface CtxClient {
    code: string;
    name: string;
    mrr: number;
    stage: string | null;
  }

  interface ContextSnapshot {
    as_of: string;
    open_tickets: { count: number; overdue_count: number; items: CtxTicket[] };
    clients: { count: number; items: CtxClient[] };
    meetings_today: CtxMeeting[];
    meetings_week: CtxMeeting[];
    recent_decisions: CtxDecision[];
    tracker_live: CtxTracker;
    commitments: { count: number; overdue_count: number; items: CtxCommitment[] };
    agent_health: { total: number; healthy: number; stale: number; items: CtxAgent[] };
  }

  type SlashCommand = { name: string; hint: string };
  const SLASH_COMMANDS: SlashCommand[] = [
    { name: "/track",     hint: "Start tracker on a ticket" },
    { name: "/stop",      hint: "Stop the active tracker" },
    { name: "/ticket",    hint: "Create a new Plane ticket" },
    { name: "/find",      hint: "Search tickets, clients, notes" },
    { name: "/decisions", hint: "Show recent decisions" },
    { name: "/whoami",    hint: "Show your access scope" },
  ];

  interface UserProfile {
    id: string;
    email: string;
    display_name: string | null;
    role: string | null;
    code: string | null;
    color: string | null;
    is_active: boolean;
  }

  let userProfiles = $state<UserProfile[]>([]);

  const MENTION_OPTIONS = $derived([
    { handle: "@NEX", label: "NEX AI", kind: "ai" as const },
    ...userProfiles
      .filter(p => p.id !== userId)
      .map(p => ({
        handle: `@${p.code || p.display_name?.split(" ")[0] || "user"}`,
        label: p.display_name || p.email,
        kind: "user" as const,
      })),
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────
  let session = $state<{ user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null } | null>(null);
  let userId = $derived(session?.user?.id ?? null);
  let userEmail = $derived(session?.user?.email ?? "");
  let displayName = $derived.by(() => {
    const meta = session?.user?.user_metadata;
    if (meta?.full_name && typeof meta.full_name === "string") return meta.full_name;
    if (meta?.name && typeof meta.name === "string") return meta.name;
    const local = userEmail.split("@")[0] || "You";
    return local.charAt(0).toUpperCase() + local.slice(1);
  });

  let channels = $state<Channel[]>([]);
  let activeChannelId = $state<string | null>(null);
  let messages = $state<Message[]>([]);
  let input = $state("");
  let loadingMessages = $state(false);
  let sending = $state(false);
  let toast = $state<string | null>(null);
  let scrollEl = $state<HTMLDivElement | null>(null);

  let creatingChannel = $state(false);
  let newChannelName = $state("");
  let newChannelSlug = $state("");

  let channelSubs = new Map<string, () => void>();
  let unreadCounts = $state<Record<string, number>>({});
  let wsState = $state<string>(getConnectionState());

  // Health telemetry
  let lastSentAt = $state<number>(0);
  let lastReceivedAt = $state<number>(0);
  let sendFailures = $state<number>(0);
  let healthOpen = $state(false);

  // Context panel
  let contextOpen = $state(false);
  let contextSnapshot = $state<ContextSnapshot | null>(null);
  let contextLoading = $state(false);
  let contextError = $state<string | null>(null);
  let contextLastFetch = $state<number>(0);
  let contextTimer: ReturnType<typeof setInterval> | null = null;

  // Slash + mention autocomplete
  let slashOpen = $state(false);
  let slashQuery = $state("");
  let slashIndex = $state(0);
  let mentionOpen = $state(false);
  let mentionQuery = $state("");
  let mentionIndex = $state(0);
  let mentionStart = $state(-1);

  // Mobile drawers
  let sidebarOpen = $state(false);
  let mobileCtxOpen = $state(false);

  // Tracker timer tick
  let nowMs = $state<number>(Date.now());
  let nowTimer: ReturnType<typeof setInterval> | null = null;

  let textareaEl = $state<HTMLTextAreaElement | null>(null);

  // ─── File picker (NEX File Vault) ───────────────────────────────────────
  interface VaultFile {
    id: string;
    filename: string;
    mime_type: string | null;
    size_bytes: number | null;
    client_code: string | null;
    category: string | null;
    source_module: string;
    created_at: string;
    s3_key: string;
  }
  let filePickerOpen = $state(false);
  let filePickerTab = $state<'browse' | 'upload'>('browse');
  let filePickerQuery = $state('');
  let filePickerCategory = $state<string>('');
  let filePickerLoading = $state(false);
  let filePickerFiles = $state<VaultFile[]>([]);
  let filePickerError = $state<string | null>(null);
  let fileUploading = $state(false);
  let fileUploadProgress = $state<string | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  // NEX typing indicator (optimistic UI - shows while waiting for AI reply)
  let nexTyping = $state(false);
  let nexTypingChannelId = $state<string | null>(null);
  let nexTypingTimeout: ReturnType<typeof setTimeout> | null = null;

  function startNexTyping(channelId: string) {
    nexTypingChannelId = channelId;
    nexTyping = true;
    if (nexTypingTimeout) clearTimeout(nexTypingTimeout);
    // Safety fallback - never leave the indicator spinning past 30s
    nexTypingTimeout = setTimeout(() => { stopNexTyping(); }, 30_000);
    // Defer scroll so the bubble lands in view
    tick().then(() => scrollToBottom());
  }

  function stopNexTyping() {
    nexTyping = false;
    nexTypingChannelId = null;
    if (nexTypingTimeout) { clearTimeout(nexTypingTimeout); nexTypingTimeout = null; }
  }

  // ─── Live typing indicators (other users) ────────────────────────────────
  // Map: channelId -> { userId -> { displayName, expiresAt } }
  type TypingUser = { displayName: string; expiresAt: number };
  let typingByChannel = $state<Record<string, Record<string, TypingUser>>>({});
  let typingSweepTimer: ReturnType<typeof setInterval> | null = null;
  const TYPING_TTL_MS = 4_000;
  // Throttle outgoing typing broadcasts (don't spam server on every keystroke)
  let lastTypingSentAt = 0;
  let typingStopTimeout: ReturnType<typeof setTimeout> | null = null;

  // Active typing list for the current channel (excluding myself)
  const activeTypingUsers = $derived.by(() => {
    if (!activeChannelId) return [] as TypingUser[];
    const map = typingByChannel[activeChannelId];
    if (!map) return [] as TypingUser[];
    const now = Date.now();
    return Object.entries(map)
      .filter(([uid, u]) => uid !== userId && u.expiresAt > now)
      .map(([, u]) => u);
  });

  // ─── Edit message state ──────────────────────────────────────────────────
  let editingMessageId = $state<string | null>(null);
  let editingContent = $state("");
  let editingInputEl = $state<HTMLTextAreaElement | null>(null);

  // ─── Reaction picker state ───────────────────────────────────────────────
  let reactionPickerForId = $state<string | null>(null);

  // Lifecycle cleanup handlers — populated in onMount, drained in onDestroy
  const cleanupFns: Array<() => void> = [];

  // ─── Draft persistence (localStorage per channel) ───────────────────────
  function draftKey(channelId: string) { return `nexogram_draft_${channelId}`; }
  function loadDraft(channelId: string): string {
    if (typeof localStorage === "undefined") return "";
    try { return localStorage.getItem(draftKey(channelId)) || ""; } catch { return ""; }
  }
  function saveDraft(channelId: string, value: string) {
    if (typeof localStorage === "undefined") return;
    try {
      if (value) localStorage.setItem(draftKey(channelId), value);
      else localStorage.removeItem(draftKey(channelId));
    } catch { /* quota or denied — fail silently */ }
  }
  function clearDraft(channelId: string) {
    if (typeof localStorage === "undefined") return;
    try { localStorage.removeItem(draftKey(channelId)); } catch { /* noop */ }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derived
  // ─────────────────────────────────────────────────────────────────────────
  const activeChannel = $derived(channels.find(c => c.id === activeChannelId) ?? null);
  const isNexDM = $derived(activeChannel?.kind === "nex");

  const sortedChannels = $derived(
    [...channels].sort((a, b) => {
      if (a.kind === "nex" && b.kind !== "nex") return -1;
      if (a.kind !== "nex" && b.kind === "nex") return 1;
      return (a.name || "").localeCompare(b.name || "");
    })
  );

  const filteredSlash = $derived(
    SLASH_COMMANDS.filter(c => c.name.startsWith(slashQuery)).slice(0, 6)
  );
  const filteredMentions = $derived(
    MENTION_OPTIONS.filter(m =>
      m.handle.toLowerCase().includes(mentionQuery.toLowerCase()) ||
      m.label.toLowerCase().includes(mentionQuery.toLowerCase())
    ).slice(0, 6)
  );

  const trackerElapsed = $derived.by(() => {
    const t = contextSnapshot?.tracker_live;
    if (!t?.active || !t.entry?.started_at) return null;
    const started = new Date(t.entry.started_at).getTime();
    if (Number.isNaN(started)) return null;
    return Math.max(0, Math.floor((nowMs - started) / 1000));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────
  function showToast(msg: string, ms = 2400) {
    toast = msg;
    setTimeout(() => { if (toast === msg) toast = null; }, ms);
  }

  function colorForSender(senderId: string | null, senderName: string): string {
    const seed = (senderId || senderName || "x");
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    const palette = [
      "linear-gradient(135deg, #56bcec, #1f7aab)",
      "linear-gradient(135deg, #7c3aed, #4c1d95)",
      "linear-gradient(135deg, #10b981, #047857)",
      "linear-gradient(135deg, #f59e0b, #b45309)",
      "linear-gradient(135deg, #ef4444, #991b1b)",
      "linear-gradient(135deg, #ec4899, #9d174d)",
    ];
    return palette[Math.abs(h) % palette.length];
  }

  function initials(name: string): string {
    const parts = (name || "?").trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (name || "?").trim().slice(0, 2).toUpperCase();
  }

  function fmtTime(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }

  function fmtDay(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
    } catch { return ""; }
  }

  function fmtElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function fmtCHF(n: number): string {
    return n.toLocaleString("de-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function fmtClock(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function fmtRelative(iso: string | null): string {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  function dueLabel(iso: string | null): string {
    if (!iso) return "";
    try {
      const due = new Date(iso);
      const now = new Date();
      const dueMid = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = Math.round((dueMid.getTime() - nowMid.getTime()) / 86_400_000);
      if (diffDays < 0) return `${diffDays}d`;
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Tomorrow";
      return `+${diffDays}d`;
    } catch { return ""; }
  }

  function priorityDot(p: string | null): string {
    const v = (p || "").toLowerCase();
    if (v === "urgent" || v === "high") return "pri-h";
    if (v === "medium") return "pri-m";
    return "pri-l";
  }

  function channelLabel(ch: Channel): string {
    if (ch.kind === "nex") return "nex";
    return ch.name || ch.slug;
  }

  function channelBadge(ch: Channel): string | null {
    if (ch.kind === "nex") return "AI";
    if (ch.kind === "direct" || ch.type === "direct") return "DM";
    if (ch.kind === "client" || ch.type === "client") return "CL";
    return null;
  }

  /**
   * Simple inline markdown renderer. Supports **bold**, *italic*, `code`,
   * and converts line breaks to <br>. All other input is HTML-escaped.
   */
  function renderMarkdown(input: string): string {
    const escaped = input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/\n/g, "<br>");
  }

  async function scrollToBottom() {
    await tick();
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Channel + message loading
  // ─────────────────────────────────────────────────────────────────────────
  async function loadMembers() {
    if (!hasClient()) return;
    const { data } = await supabase()
      .from("user_profiles")
      .select("id,email,display_name,role,code,color,is_active")
      .eq("is_active", true)
      .order("display_name", { ascending: true });
    if (data) userProfiles = data as UserProfile[];
  }

  async function openDM(targetId: string) {
    try {
      const r = await postAuthed("/api/functions/nexogram-channels",
        { target_user_id: targetId }) as { channel_id?: string };
      if (!r?.channel_id) { showToast("Could not open DM"); return; }
      await loadChannels();
      selectChannel(r.channel_id);
      sidebarOpen = false;
    } catch (e) {
      showToast(`DM failed: ${(e as Error).message}`);
    }
  }

  async function loadChannels() {
    if (!hasClient()) return;
    const { data, error } = await supabase()
      .from("nexogram_channels")
      .select("id,name,description,type,kind,slug,owner_id,created_at")
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[nexogram] loadChannels", error);
      return;
    }
    channels = (data || []) as Channel[];
    subscribeAllChannels();
  }

  async function ensureNexDM(): Promise<string | null> {
    try {
      const r = await postAuthed("/api/functions/nexogram-channels", {}) as { channel_id?: string };
      return r?.channel_id ?? null;
    } catch (e) {
      console.warn("[nexogram] ensureNexDM failed:", (e as Error).message);
      return null;
    }
  }

  async function loadMessages(channelId: string) {
    if (!hasClient()) return;
    loadingMessages = true;
    const { data, error } = await supabase()
      .from("nexogram_messages")
      .select("id,channel_id,sender_id,sender_name,content,type,created_at,metadata,edited_at,deleted_at,reactions")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(80);
    loadingMessages = false;
    if (error) {
      console.error("[nexogram] loadMessages", error);
      return;
    }
    messages = (data || []) as Message[];
    scrollToBottom();
  }

  function selectChannel(channelId: string) {
    if (activeChannelId === channelId) return;
    // Persist current channel's draft before switching
    if (activeChannelId && input) saveDraft(activeChannelId, input);
    cancelEdit();
    activeChannelId = channelId;
    messages = [];
    // Hydrate the input with this channel's saved draft (if any)
    input = loadDraft(channelId);
    loadMessages(channelId);
    unreadCounts = { ...unreadCounts, [channelId]: 0 };

    // Sync read state
    if (userId) {
      void supabase()
        .from("nexogram_members")
        .upsert({ channel_id: channelId, user_id: userId, last_read_at: new Date().toISOString() },
                 { onConflict: 'channel_id,user_id' })
        .then(() => {});
    }
    ensureChannelSub(channelId);

    // Default context-panel state per channel kind
    const ch = channels.find(c => c.id === channelId);
    if (ch?.kind === "nex") {
      contextOpen = true;
      refreshContext();
    } else {
      contextOpen = false;
    }

    // Close mobile sidebar on selection
    sidebarOpen = false;
  }

  function ensureChannelSub(channelId: string) {
    if (channelSubs.has(channelId)) return;
    const unsubMsg = subscribeNexogramChannel(channelId, (raw) => {
      const msg = raw as unknown as Message;
      if (!msg?.id) return;
      lastReceivedAt = Date.now();
      // AI reply landed on the typing channel: drop the indicator
      if (msg.type === "ai" && nexTyping && nexTypingChannelId === channelId) {
        stopNexTyping();
      }
      if (channelId === activeChannelId) {
        // Reconcile optimistic / failed local message with the canonical one
        messages = messages.filter(m =>
          !((m.pending || m.failed) && m.content === msg.content && m.sender_id === msg.sender_id));
        if (!messages.some(m => m.id === msg.id)) {
          messages = [...messages, msg];
          scrollToBottom();
          console.log('[NEXOGRAM] message in', { channelId, type: msg.type, id: msg.id });
          // AI reply: refresh context (state may have changed)
          if (msg.type === "ai" || msg.type === "system") refreshContext(true);
        }
      } else {
        unreadCounts = { ...unreadCounts, [channelId]: (unreadCounts[channelId] ?? 0) + 1 };
      }
    });

    // Ephemeral: typing, edits, deletes, reactions
    const unsubEph = subscribeNexogramEphemeral(channelId, {
      typing: (payload) => {
        const uid = String(payload.userId || "");
        if (!uid || uid === userId) return; // never show your own typing
        const name = String(payload.displayName || "Someone");
        const map = { ...(typingByChannel[channelId] || {}) };
        map[uid] = { displayName: name, expiresAt: Date.now() + TYPING_TTL_MS };
        typingByChannel = { ...typingByChannel, [channelId]: map };
      },
      stop_typing: (payload) => {
        const uid = String(payload.userId || "");
        if (!uid) return;
        const map = { ...(typingByChannel[channelId] || {}) };
        if (map[uid]) {
          delete map[uid];
          typingByChannel = { ...typingByChannel, [channelId]: map };
        }
      },
      edit: (payload) => {
        const id = String(payload.messageId || "");
        if (!id) return;
        const newContent = String(payload.content ?? "");
        const editedAt = payload.edited_at as string | undefined;
        if (channelId === activeChannelId) {
          messages = messages.map(m =>
            m.id === id ? { ...m, content: newContent, edited_at: editedAt ?? new Date().toISOString() } : m
          );
        }
      },
      delete: (payload) => {
        const id = String(payload.messageId || "");
        if (!id) return;
        const deletedAt = payload.deleted_at as string | undefined;
        if (channelId === activeChannelId) {
          messages = messages.map(m =>
            m.id === id ? { ...m, deleted_at: deletedAt ?? new Date().toISOString() } : m
          );
        }
      },
      reaction: (payload) => {
        const id = String(payload.messageId || "");
        if (!id) return;
        const reactions = (payload.reactions as Record<string, string[]>) || {};
        if (channelId === activeChannelId) {
          messages = messages.map(m => m.id === id ? { ...m, reactions } : m);
        }
      },
    });

    channelSubs.set(channelId, () => { unsubMsg(); unsubEph(); });
  }

  function subscribeAllChannels() {
    for (const ch of channels) ensureChannelSub(ch.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Send
  // ─────────────────────────────────────────────────────────────────────────
  async function sendMessage() {
    const content = input.trim();
    if (!content || !activeChannelId || sending) return;
    const channelId = activeChannelId;
    await performSend(content, channelId);
    input = "";
    clearDraft(channelId);
    sendStopTyping(channelId);
    closeAutocomplete();
  }

  async function performSend(content: string, channelId: string, existingId?: string) {
    sending = true;
    const optimisticId = existingId ?? `local-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: optimisticId,
      channel_id: channelId,
      sender_id: userId,
      sender_name: userEmail ? userEmail.split("@")[0] : "You",
      content,
      type: "text",
      created_at: new Date().toISOString(),
      pending: true,
      failed: false,
    };
    if (existingId) {
      messages = messages.map(m => m.id === existingId ? optimistic : m);
    } else {
      messages = [...messages, optimistic];
    }
    scrollToBottom();

    const triggersNex = isNexDM || /(^|\s)@nex\b/i.test(content);
    if (triggersNex) startNexTyping(channelId);

    try {
      await postAuthed("/api/functions/nexogram-send", {
        channel_id: channelId,
        content,
      });
      lastSentAt = Date.now();
      console.log('[NEXOGRAM] sent', { channelId, len: content.length });
    } catch (e) {
      const msg = (e as Error).message;
      sendFailures++;
      console.error('[NEXOGRAM] send failed', msg);
      // Keep optimistic message but mark as failed for retry UI
      messages = messages.map(m => m.id === optimisticId
        ? { ...m, pending: false, failed: true, error: msg }
        : m);
      if (triggersNex) stopNexTyping();
      showToast(`Send failed: ${msg}`);
    } finally {
      sending = false;
    }
  }

  function retryFailedMessage(m: Message) {
    if (!m.failed || !m.channel_id) return;
    void performSend(m.content, m.channel_id, m.id);
  }

  function discardFailedMessage(id: string) {
    messages = messages.filter(m => m.id !== id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // File Vault — picker + upload + attach to message
  // ─────────────────────────────────────────────────────────────────────────
  async function openFilePicker() {
    filePickerOpen = true;
    filePickerTab = 'browse';
    filePickerError = null;
    await loadVaultFiles();
  }

  function closeFilePicker() {
    filePickerOpen = false;
    fileUploadProgress = null;
  }

  async function loadVaultFiles() {
    filePickerLoading = true;
    filePickerError = null;
    try {
      const params = new URLSearchParams();
      params.set('limit', '30');
      if (filePickerCategory) params.set('category', filePickerCategory);
      const r = await getAuthed(`/api/functions/nex-files-list?${params.toString()}`) as { files?: VaultFile[] };
      let files = Array.isArray(r?.files) ? r.files : [];
      // Client-side text filter
      const q = filePickerQuery.trim().toLowerCase();
      if (q) {
        files = files.filter(f =>
          f.filename.toLowerCase().includes(q) ||
          (f.client_code || '').toLowerCase().includes(q) ||
          (f.category || '').toLowerCase().includes(q)
        );
      }
      filePickerFiles = files;
    } catch (e) {
      filePickerError = (e as Error).message || 'Failed to load files';
      filePickerFiles = [];
    } finally {
      filePickerLoading = false;
    }
  }

  function fileIconFor(mime: string | null): string {
    if (!mime) return '📦';
    if (mime.startsWith('image/')) return '🖼';
    if (mime === 'application/pdf') return '📄';
    if (mime.includes('spreadsheet') || mime === 'text/csv') return '📊';
    if (mime.includes('zip') || mime.includes('compressed')) return '📦';
    if (mime.startsWith('video/')) return '🎬';
    if (mime.startsWith('audio/')) return '🎵';
    if (mime.startsWith('text/')) return '📝';
    return '📄';
  }

  function categoryColor(cat: string | null): string {
    switch ((cat || '').toLowerCase()) {
      case 'offers':       return 'amber';
      case 'deliverables': return 'cyan';
      case 'meetings':     return 'purple';
      case 'finance':      return 'red';
      case 'reports':      return 'blue';
      case 'brand':        return 'pink';
      case 'templates':    return 'green';
      default:             return 'gray';
    }
  }

  function fmtSize(bytes: number | null): string {
    if (!bytes || bytes < 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  async function attachVaultFile(file: VaultFile) {
    if (!activeChannelId) return;
    const channelId = activeChannelId;
    closeFilePicker();
    await sendFileMessage(channelId, {
      file_id: file.id,
      filename: file.filename,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      category: file.category,
      client_code: file.client_code,
    });
  }

  async function uploadFromInput(ev: Event) {
    const inp = ev.target as HTMLInputElement;
    const file = inp.files?.[0];
    if (!file || !activeChannelId) return;
    if (file.size > 8 * 1024 * 1024) {
      filePickerError = 'File too large (max 8 MB for inline upload)';
      return;
    }
    fileUploading = true;
    fileUploadProgress = `Uploading ${file.name}...`;
    filePickerError = null;
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const r = await postAuthed('/api/functions/nex-file-ingest', {
        source_module: 'nexogram',
        source_entity_type: 'message',
        filename: file.name,
        mime_type: file.type || 'application/octet-stream',
        content_base64: b64,
      }) as { ok: boolean; file_id?: string; s3_pending?: boolean; error?: string };
      if (!r?.ok || !r.file_id) throw new Error(r?.error || 'upload failed');
      const channelId = activeChannelId;
      closeFilePicker();
      await sendFileMessage(channelId, {
        file_id: r.file_id,
        filename: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        category: null,
        client_code: null,
        s3_pending: !!r.s3_pending,
      });
    } catch (e) {
      filePickerError = (e as Error).message || 'Upload failed';
    } finally {
      fileUploading = false;
      fileUploadProgress = null;
      if (fileInputEl) fileInputEl.value = '';
    }
  }

  async function sendFileMessage(channelId: string, meta: Record<string, unknown>) {
    const optimisticId = `local-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: optimisticId,
      channel_id: channelId,
      sender_id: userId,
      sender_name: userEmail ? userEmail.split('@')[0] : 'You',
      content: '',
      type: 'text',
      created_at: new Date().toISOString(),
      pending: true,
      failed: false,
      metadata: { attachment_kind: 'file', ...meta },
    };
    messages = [...messages, optimistic];
    scrollToBottom();
    try {
      await postAuthed('/api/functions/nexogram-send', {
        channel_id: channelId,
        content: '',
        metadata: { attachment_kind: 'file', ...meta },
      });
      lastSentAt = Date.now();
    } catch (e) {
      const msg = (e as Error).message;
      messages = messages.map(m => m.id === optimisticId
        ? { ...m, pending: false, failed: true, error: msg }
        : m);
      showToast(`File send failed: ${msg}`);
    }
  }

  async function downloadVaultFile(fileId: string) {
    try {
      const r = await getAuthed(`/api/functions/nex-file-download?file_id=${encodeURIComponent(fileId)}`) as { url?: string | null; error?: string };
      if (!r?.url) {
        showToast(r?.error || 'Download unavailable');
        return;
      }
      window.open(r.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      showToast(`Download failed: ${(e as Error).message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Typing broadcasts
  // ─────────────────────────────────────────────────────────────────────────
  function sendTyping(channelId: string) {
    const now = Date.now();
    // Throttle: max one typing broadcast per 2.5s
    if (now - lastTypingSentAt < 2500) {
      // Still bump the stop-timer so we keep sending while user keeps typing
      armStopTyping(channelId);
      return;
    }
    lastTypingSentAt = now;
    void postAuthed("/api/functions/nexogram-typing", {
      channel_id: channelId,
      state: "typing",
    }).catch(() => { /* non-fatal */ });
    armStopTyping(channelId);
  }
  function armStopTyping(channelId: string) {
    if (typingStopTimeout) clearTimeout(typingStopTimeout);
    typingStopTimeout = setTimeout(() => sendStopTyping(channelId), 3000);
  }
  function sendStopTyping(channelId: string) {
    if (typingStopTimeout) { clearTimeout(typingStopTimeout); typingStopTimeout = null; }
    lastTypingSentAt = 0;
    void postAuthed("/api/functions/nexogram-typing", {
      channel_id: channelId,
      state: "stop",
    }).catch(() => { /* non-fatal */ });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Edit / delete / react
  // ─────────────────────────────────────────────────────────────────────────
  function beginEdit(m: Message) {
    if (m.sender_id !== userId) return;
    editingMessageId = m.id;
    editingContent = m.content;
    tick().then(() => {
      editingInputEl?.focus();
      // Place cursor at end
      if (editingInputEl) {
        const len = editingContent.length;
        editingInputEl.setSelectionRange(len, len);
      }
    });
  }
  function cancelEdit() {
    editingMessageId = null;
    editingContent = "";
  }
  async function saveEdit() {
    const id = editingMessageId;
    const content = editingContent.trim();
    if (!id) return;
    if (!content) { showToast("Empty - delete instead"); return; }
    // Optimistic
    const orig = messages.find(m => m.id === id);
    if (orig) {
      messages = messages.map(m => m.id === id ? { ...m, content, edited_at: new Date().toISOString() } : m);
    }
    cancelEdit();
    try {
      await postAuthed("/api/functions/nexogram-messages", {
        op: "edit",
        message_id: id,
        content,
      });
    } catch (e) {
      showToast(`Edit failed: ${(e as Error).message}`);
      // Revert on failure
      if (orig) messages = messages.map(m => m.id === id ? orig : m);
    }
  }
  async function deleteMessage(m: Message) {
    if (m.sender_id !== userId) return;
    if (!confirm("Delete this message?")) return;
    // Optimistic
    const orig = { ...m };
    messages = messages.map(x => x.id === m.id ? { ...x, deleted_at: new Date().toISOString() } : x);
    try {
      await postAuthed("/api/functions/nexogram-messages", {
        op: "delete",
        message_id: m.id,
      });
    } catch (e) {
      showToast(`Delete failed: ${(e as Error).message}`);
      messages = messages.map(x => x.id === m.id ? orig : x);
    }
  }
  function toggleReactionPicker(messageId: string) {
    reactionPickerForId = reactionPickerForId === messageId ? null : messageId;
  }
  async function toggleReaction(m: Message, emoji: string) {
    if (!userId) return;
    // Optimistic toggle
    const current = { ...(m.reactions || {}) } as Record<string, string[]>;
    const users = current[emoji] ? [...current[emoji]] : [];
    const idx = users.indexOf(userId);
    if (idx >= 0) users.splice(idx, 1); else users.push(userId);
    if (users.length === 0) delete current[emoji]; else current[emoji] = users;
    messages = messages.map(x => x.id === m.id ? { ...x, reactions: current } : x);
    reactionPickerForId = null;
    try {
      await postAuthed("/api/functions/nexogram-messages", {
        op: "react",
        message_id: m.id,
        emoji,
      });
    } catch (e) {
      showToast(`Reaction failed: ${(e as Error).message}`);
      // Revert
      messages = messages.map(x => x.id === m.id ? { ...x, reactions: m.reactions || null } : x);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Composer / autocomplete
  // ─────────────────────────────────────────────────────────────────────────
  function closeAutocomplete() {
    slashOpen = false;
    slashQuery = "";
    slashIndex = 0;
    mentionOpen = false;
    mentionQuery = "";
    mentionIndex = 0;
    mentionStart = -1;
  }

  function onInputChange() {
    const el = textareaEl;
    if (!el) { closeAutocomplete(); return; }
    const value = input;
    const caret = el.selectionStart ?? value.length;

    // Persist draft (per-channel)
    if (activeChannelId) saveDraft(activeChannelId, value);

    // Broadcast typing while there is content. Skip in NEX DM (no human peer).
    if (activeChannelId && value.trim().length > 0 && !isNexDM) {
      sendTyping(activeChannelId);
    } else if (activeChannelId && value.trim().length === 0) {
      sendStopTyping(activeChannelId);
    }

    // Slash detection — only when '/' is at the very start of the composer
    if (value.startsWith("/")) {
      const firstSpace = value.indexOf(" ");
      const token = firstSpace === -1 ? value : value.slice(0, firstSpace);
      slashQuery = token;
      slashOpen = filteredSlash.length > 0;
      slashIndex = 0;
      mentionOpen = false;
      return;
    }

    // Mention detection — find the latest '@' before caret
    const upToCaret = value.slice(0, caret);
    const at = upToCaret.lastIndexOf("@");
    if (at !== -1) {
      const before = at === 0 ? "" : upToCaret[at - 1];
      const isBoundary = at === 0 || /\s/.test(before);
      const segment = upToCaret.slice(at + 1);
      if (isBoundary && !/\s/.test(segment)) {
        mentionStart = at;
        mentionQuery = segment;
        mentionOpen = filteredMentions.length > 0;
        mentionIndex = 0;
        slashOpen = false;
        return;
      }
    }
    closeAutocomplete();
  }

  function completeSlash(cmd: SlashCommand) {
    input = cmd.name + " ";
    closeAutocomplete();
    tick().then(() => textareaEl?.focus());
  }

  function completeMention(handle: string) {
    if (mentionStart < 0) return;
    const before = input.slice(0, mentionStart);
    const afterStart = mentionStart + 1 + mentionQuery.length;
    const after = input.slice(afterStart);
    input = `${before}${handle} ${after.replace(/^\s+/, "")}`;
    closeAutocomplete();
    tick().then(() => {
      textareaEl?.focus();
      if (textareaEl) {
        const pos = before.length + handle.length + 1;
        textareaEl.setSelectionRange(pos, pos);
      }
    });
  }

  function handleKey(e: KeyboardEvent) {
    // Autocomplete navigation
    if (slashOpen) {
      if (e.key === "ArrowDown") { e.preventDefault(); slashIndex = (slashIndex + 1) % Math.max(1, filteredSlash.length); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); slashIndex = (slashIndex - 1 + filteredSlash.length) % Math.max(1, filteredSlash.length); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        if (filteredSlash[slashIndex]) {
          e.preventDefault();
          completeSlash(filteredSlash[slashIndex]);
          return;
        }
      }
      if (e.key === "Escape") { e.preventDefault(); closeAutocomplete(); return; }
    }
    if (mentionOpen) {
      if (e.key === "ArrowDown") { e.preventDefault(); mentionIndex = (mentionIndex + 1) % Math.max(1, filteredMentions.length); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); mentionIndex = (mentionIndex - 1 + filteredMentions.length) % Math.max(1, filteredMentions.length); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        if (filteredMentions[mentionIndex]) {
          e.preventDefault();
          completeMention(filteredMentions[mentionIndex].handle);
          return;
        }
      }
      if (e.key === "Escape") { e.preventDefault(); closeAutocomplete(); return; }
    }

    // Send
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Channel creation
  // ─────────────────────────────────────────────────────────────────────────
  async function createChannel() {
    const name = newChannelName.trim();
    const slug = (newChannelSlug.trim() || name.toLowerCase()).replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    if (!name || !slug || !userId) return;
    const { data, error } = await supabase()
      .from("nexogram_channels")
      .insert({ name, slug, type: "team", kind: "team", description: null, created_by: userId })
      .select()
      .single();
    if (error) {
      showToast(`Create failed: ${error.message}`);
      return;
    }
    channels = [...channels, data as Channel];
    newChannelName = "";
    newChannelSlug = "";
    creatingChannel = false;
    selectChannel((data as Channel).id);
  }

  function quickPrompt(text: string) {
    input = text;
    tick().then(() => textareaEl?.focus());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Context snapshot
  // ─────────────────────────────────────────────────────────────────────────
  async function refreshContext(force = false) {
    // Throttle: max once per 15s unless forced
    const now = Date.now();
    if (!force && now - contextLastFetch < 15_000) return;
    if (contextLoading) return;
    contextLoading = true;
    contextError = null;
    try {
      const r = await getAuthed("/api/functions/nexita-context") as
        { ok?: boolean; snapshot?: ContextSnapshot; error?: string };
      if (r?.ok && r.snapshot) {
        contextSnapshot = r.snapshot;
        contextLastFetch = now;
      } else {
        contextError = r?.error || "snapshot unavailable";
      }
    } catch (e) {
      contextError = (e as Error).message;
    } finally {
      contextLoading = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────
  onMount(async () => {
    if (!hasClient()) return;
    const { data } = await supabase().auth.getSession();
    session = { user: data.session?.user ? { id: data.session.user.id, email: data.session.user.email ?? "" } : null };
    if (!userId) return;

    const nexId = await ensureNexDM();
    await Promise.all([loadChannels(), loadMembers()]);

    if (!activeChannelId) {
      if (nexId && channels.some(c => c.id === nexId)) {
        selectChannel(nexId);
      } else {
        const nexCh = channels.find(c => c.kind === "nex");
        if (nexCh) selectChannel(nexCh.id);
        else if (channels[0]) selectChannel(channels[0].id);
      }
    }

    const offConn = onConnectionStateChange((s) => { wsState = s; });

    function onWsReconnected() {
      if (activeChannelId) loadMessages(activeChannelId);
      subscribeAllChannels();
    }
    window.addEventListener('nex:ws-connected', onWsReconnected);

    function onAppRefresh() {
      loadChannels();
      if (activeChannelId) loadMessages(activeChannelId);
      refreshContext(true);
    }
    window.addEventListener('nex:data-refresh', onAppRefresh);

    // Tab refocus: pull missed messages on the active channel + heal subs
    function onVisibility() {
      if (document.visibilityState !== 'visible') return;
      console.log('[NEXOGRAM] tab visible, healing state');
      if (activeChannelId) loadMessages(activeChannelId);
      subscribeAllChannels();
    }
    document.addEventListener('visibilitychange', onVisibility);

    // Periodic context refresh — every 60s
    contextTimer = setInterval(() => {
      if (contextOpen || mobileCtxOpen) refreshContext();
    }, 60_000);

    // Tracker clock — every second while a tracker is active
    nowTimer = setInterval(() => { nowMs = Date.now(); }, 1000);

    // Typing-indicator sweep: expire stale entries every 1.5s
    typingSweepTimer = setInterval(() => {
      const now = Date.now();
      let mutated = false;
      const next: Record<string, Record<string, TypingUser>> = {};
      for (const [chId, users] of Object.entries(typingByChannel)) {
        const kept: Record<string, TypingUser> = {};
        for (const [uid, u] of Object.entries(users)) {
          if (u.expiresAt > now) kept[uid] = u;
          else mutated = true;
        }
        if (Object.keys(kept).length > 0) next[chId] = kept;
      }
      if (mutated) typingByChannel = next;
    }, 1500);

    // Close reaction picker when clicking outside any message
    function onDocClick(e: MouseEvent) {
      if (!reactionPickerForId) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.msg-actions-hover, .react-picker')) return;
      reactionPickerForId = null;
    }
    document.addEventListener('click', onDocClick);
    cleanupFns.push(() => document.removeEventListener('click', onDocClick));

    cleanupFns.push(() => {
      offConn();
      window.removeEventListener('nex:ws-connected', onWsReconnected);
      window.removeEventListener('nex:data-refresh', onAppRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  });

  onDestroy(() => {
    for (const fn of cleanupFns) { try { fn(); } catch { /* ignore */ } }
    cleanupFns.length = 0;
    for (const unsub of channelSubs.values()) unsub();
    channelSubs.clear();
    if (contextTimer) clearInterval(contextTimer);
    if (nowTimer) clearInterval(nowTimer);
    if (typingSweepTimer) clearInterval(typingSweepTimer);
    if (typingStopTimeout) clearTimeout(typingStopTimeout);
    // Persist any in-flight draft so it survives full unmount/navigation
    if (activeChannelId && input) saveDraft(activeChannelId, input);
  });
</script>

<svelte:head>
  <title>NEXOGRAM · NEX OPS</title>
</svelte:head>

<div
  class="nexogram"
  class:nexogram--ctx-open={contextOpen}
  class:nexogram--sidebar-open={sidebarOpen}
  class:nexogram--mobile-ctx-open={mobileCtxOpen}
>
  <!-- ═════════════════════════════════════════════════════════════════════ -->
  <!-- LEFT SIDEBAR                                                           -->
  <!-- ═════════════════════════════════════════════════════════════════════ -->
  <aside class="sidebar" class:sidebar--open={sidebarOpen}>
    <div class="sb-head">
      <div class="brand">
        <div class="brand-l">
          <span class="logo-dot" aria-hidden="true"></span>
          <span class="brand-name">NEXOGRAM</span>
        </div>
        {#if wsState === 'connected'}
          <span class="live-pill"><span class="pulse"></span> Live</span>
        {:else if wsState === 'connecting'}
          <span class="live-pill live-pill--wait"><span class="pulse pulse--wait"></span> Sync</span>
        {:else}
          <button class="live-pill live-pill--off" onclick={() => reconnectPusher()}>
            <span class="pulse pulse--off"></span> Reconnect
          </button>
        {/if}
      </div>
      <div class="ver">v0.5 · Soketi · self-hosted</div>
    </div>

    <div class="sb-body">
      <div class="sb-group">
        <h4>
          <span>Channels</span>
          <button class="add-btn" type="button" onclick={() => { creatingChannel = true; }} aria-label="Add channel">+</button>
        </h4>

        {#each sortedChannels as ch (ch.id)}
          <button
            type="button"
            class="sb-item"
            class:sb-item--active={ch.id === activeChannelId}
            class:sb-item--nex={ch.kind === 'nex'}
            onclick={() => selectChannel(ch.id)}
          >
            {#if ch.kind === 'nex'}
              <span class="ai-orb" aria-hidden="true"></span>
            {:else}
              <span class="hash">#</span>
            {/if}
            <span class="sb-name">{channelLabel(ch)}</span>
            {#if channelBadge(ch)}
              <span class="sb-badge">{channelBadge(ch)}</span>
            {/if}
            {#if (unreadCounts[ch.id] ?? 0) > 0}
              <span class="unread">{unreadCounts[ch.id] > 9 ? '9+' : unreadCounts[ch.id]}</span>
            {/if}
          </button>
        {/each}

        {#if creatingChannel}
          <div class="ch-create">
            <input
              type="text"
              class="ch-create-input"
              placeholder="channel-name"
              bind:value={newChannelName}
              onkeydown={(e) => { if (e.key === "Enter") createChannel(); if (e.key === "Escape") { creatingChannel = false; newChannelName = ""; } }}
            />
            <div class="ch-create-actions">
              <button type="button" class="btn-mini btn-primary" onclick={createChannel}>Create</button>
              <button type="button" class="btn-mini btn-ghost" onclick={() => { creatingChannel = false; newChannelName = ""; }}>Cancel</button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Members section -->
      {#if userProfiles.length > 0}
        <div class="sb-group">
          <h4><span>Members</span></h4>
          {#each userProfiles as member (member.id)}
            {@const isMe = member.id === userId}
            <button
              type="button"
              class="sb-item sb-item--member"
              onclick={() => { if (!isMe) openDM(member.id); else showToast("That's you!"); }}
              title={member.role?.replace(/_/g, ' ') ?? ''}
            >
              <span class="member-av" style="background:{member.color ?? '#56bcec'}">{member.code?.slice(0,2) ?? initials(member.display_name ?? member.email)}</span>
              <span class="sb-name">{member.display_name ?? member.email}</span>
              {#if isMe}
                <span class="member-you">you</span>
              {:else}
                <span class="member-role">{member.code ?? ''}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="sb-foot">
      <div class="me-av">{initials(displayName)}</div>
      <div class="me-info">
        <div class="me-name">{userId ? displayName : "Not signed in"}</div>
        <div class="me-conn">
          {#if wsState === 'connected'}
            <span class="pulse"></span> Live · realtime
          {:else}
            <span class="pulse pulse--off"></span> Offline
          {/if}
        </div>
      </div>
    </div>
  </aside>

  <!-- Mobile sidebar backdrop -->
  {#if sidebarOpen}
    <button type="button" class="backdrop" aria-label="Close menu" onclick={() => sidebarOpen = false}></button>
  {/if}

  <!-- ═════════════════════════════════════════════════════════════════════ -->
  <!-- CENTER THREAD                                                          -->
  <!-- ═════════════════════════════════════════════════════════════════════ -->
  <section class="center">
    <header class="ch-head">
      <div class="ch-head-l">
        <button class="ham" type="button" onclick={() => sidebarOpen = !sidebarOpen} aria-label="Open channels">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        {#if activeChannel}
          {#if activeChannel.kind === 'nex'}
            <div class="nex-head-avatar" aria-hidden="true">N</div>
            <div class="ch-titles">
              <div class="ch-title">
                NEX
                <span class="ch-sub-inline">· AI COO</span>
              </div>
              <div class="ch-sub">Private channel · Claude 4.7 · full operational intelligence</div>
            </div>
          {:else}
            <div class="ch-hash-mark" aria-hidden="true">#</div>
            <div class="ch-titles">
              <div class="ch-title">{channelLabel(activeChannel)}</div>
              <div class="ch-sub">
                {activeChannel.description || (activeChannel.kind === 'direct' ? 'Direct message' : 'Team channel · @NEX available')}
                ·
                {#if wsState === 'connected'}
                  <span class="conn-on">live</span>
                {:else}
                  <span class="conn-off">offline</span>
                {/if}
              </div>
            </div>
          {/if}
        {:else}
          <div class="ch-titles"><div class="ch-title">Select a channel</div></div>
        {/if}
      </div>

      <div class="ch-head-r">
        <button
          class="health-badge"
          class:health-badge--ok={wsState === 'connected'}
          class:health-badge--warn={wsState === 'connecting'}
          class:health-badge--err={wsState !== 'connected' && wsState !== 'connecting'}
          type="button"
          onclick={() => healthOpen = !healthOpen}
          aria-label="System health"
          title="NEXOGRAM health"
        >
          <span class="health-dot"></span>
          <span class="health-label">
            {#if wsState === 'connected'}OK{:else if wsState === 'connecting'}SYNC{:else}OFFLINE{/if}
          </span>
        </button>
        <button
          class="head-btn head-btn--mobile-ctx"
          type="button"
          onclick={() => { mobileCtxOpen = true; refreshContext(true); }}
          aria-label="Open context"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
        </button>
        <button
          class="head-btn"
          type="button"
          onclick={() => { contextOpen = !contextOpen; if (contextOpen) refreshContext(true); }}
          aria-label="Toggle context panel"
        >
          {#if contextOpen}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            <span class="head-btn-label">Hide context</span>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span class="head-btn-label">Show context</span>
          {/if}
        </button>
      </div>
    </header>

    {#if healthOpen}
      <div class="health-panel">
        <div class="health-row">
          <span class="health-key">Realtime (Soketi)</span>
          <span class="health-val health-val--{wsState === 'connected' ? 'ok' : (wsState === 'connecting' ? 'warn' : 'err')}">{wsState}</span>
        </div>
        <div class="health-row">
          <span class="health-key">Last message sent</span>
          <span class="health-val">{lastSentAt ? fmtRelative(new Date(lastSentAt).toISOString()) : 'never this session'}</span>
        </div>
        <div class="health-row">
          <span class="health-key">Last realtime event</span>
          <span class="health-val">{lastReceivedAt ? fmtRelative(new Date(lastReceivedAt).toISOString()) : 'never this session'}</span>
        </div>
        <div class="health-row">
          <span class="health-key">Send failures (session)</span>
          <span class="health-val health-val--{sendFailures === 0 ? 'ok' : 'warn'}">{sendFailures}</span>
        </div>
        <div class="health-row">
          <span class="health-key">Active channel subs</span>
          <span class="health-val">{channelSubs.size}</span>
        </div>
        <div class="health-actions">
          <button class="health-btn" type="button" onclick={() => reconnectPusher()}>Force reconnect</button>
          <button class="health-btn" type="button" onclick={() => { if (activeChannelId) loadMessages(activeChannelId); }}>Reload messages</button>
          <button class="health-btn health-btn--ghost" type="button" onclick={() => healthOpen = false}>Close</button>
        </div>
      </div>
    {/if}

    {#if isNexDM}
      <div class="quick-prompts">
        <button class="qp" onclick={() => quickPrompt("What should I focus on today?")}>What should I focus on today?</button>
        <button class="qp" onclick={() => quickPrompt("Which clients need attention?")}>Which clients need attention?</button>
        <button class="qp" onclick={() => quickPrompt("Summarise this week's decisions")}>Summarise this week's decisions</button>
        <button class="qp" onclick={() => quickPrompt("/track ")}>/track</button>
        <button class="qp" onclick={() => quickPrompt("/ticket ")}>/ticket</button>
      </div>
    {/if}

    {#if wsState !== 'connected' && wsState !== 'connecting' && userId}
      <div class="reconnect-banner" role="status">
        <span class="reconnect-pulse"></span>
        <span class="reconnect-text">Realtime offline - new messages may be delayed. Auto-retry in progress.</span>
        <button class="reconnect-btn" type="button" onclick={() => reconnectPusher()}>Retry now</button>
      </div>
    {/if}

    <div class="thread" bind:this={scrollEl}>
      {#if !userId}
        <div class="empty">
          <div class="empty-icon">N</div>
          <div class="empty-title">Sign in to use NEXOGRAM</div>
          <div class="empty-sub">Authenticate to read and post in channels.</div>
        </div>
      {:else if loadingMessages}
        <div class="empty"><div class="empty-sub">Loading messages...</div></div>
      {:else if messages.length === 0}
        <div class="empty">
          <div class="empty-icon">{isNexDM ? 'N' : '#'}</div>
          <div class="empty-title">
            {isNexDM ? 'Ask NEX anything' : 'No messages yet'}
          </div>
          <div class="empty-sub">
            {isNexDM ? 'Private channel · full company context.' : 'Be the first to say hi. Use @NEX to ping the AI.'}
          </div>
        </div>
      {:else}
        {#each messages as m, i (m.id)}
          {@const own = !!userId && m.sender_id === userId}
          {@const isSystem = m.type === "system"}
          {@const isAi = m.type === "ai"}
          {@const prev = i > 0 ? messages[i - 1] : null}
          {@const showDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()}
          {@const sameSender = prev && !showDay && prev.type === m.type && prev.sender_id === m.sender_id && prev.sender_name === m.sender_name && (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60 * 1000}
          {@const isGrouped = !!sameSender && !isSystem}

          {#if showDay}
            <div class="day-div">{fmtDay(m.created_at)}</div>
          {/if}

          {#if isSystem}
            <div class="system-pill">
              <span class="system-pill-text">{@html renderMarkdown(m.content)}</span>
              <span class="system-pill-time" title={new Date(m.created_at).toLocaleString('de-CH')}>{fmtTime(m.created_at)}</span>
            </div>
          {:else if isAi}
            <div class="msg msg--ai" class:msg--grouped={isGrouped}>
              {#if isGrouped}
                <div class="msg-av msg-av--spacer" aria-hidden="true"></div>
              {:else}
                <div class="msg-av msg-av--nex" aria-hidden="true">N</div>
              {/if}
              <div class="msg-body">
                {#if !isGrouped}
                  <div class="msg-meta">
                    <span class="msg-name msg-name--nex">NEX</span>
                    <span class="model-pill" class:model-pill--apertus={(m.metadata?.model || "").toLowerCase().includes("apertus")}>
                      {m.metadata?.model || (isNexDM ? "Claude 4.7" : "Apertus-70B")}
                    </span>
                    <span class="msg-time" title={new Date(m.created_at).toLocaleString('de-CH')}>
                      {fmtTime(m.created_at)}{m.metadata?.latency_ms ? ` · ${(m.metadata.latency_ms / 1000).toFixed(1)} s` : ''}
                    </span>
                  </div>
                {/if}
                <div class="msg-text msg-text--ai">{@html renderMarkdown(m.content)}</div>
              </div>
            </div>
          {:else if m.deleted_at}
            <div class="msg" class:msg--own={own} class:msg--grouped={isGrouped}>
              {#if isGrouped}
                <div class="msg-av msg-av--spacer" aria-hidden="true"></div>
              {:else}
                <div class="msg-av" style="background:{colorForSender(m.sender_id, m.sender_name)}">{initials(m.sender_name)}</div>
              {/if}
              <div class="msg-body">
                {#if !isGrouped}
                  <div class="msg-meta">
                    <span class="msg-name">{m.sender_name}</span>
                    <span class="msg-time" title={new Date(m.created_at).toLocaleString('de-CH')}>{fmtTime(m.created_at)}</span>
                  </div>
                {/if}
                <div class="msg-text msg-text--deleted">This message was deleted.</div>
              </div>
            </div>
          {:else}
            {@const isEditing = editingMessageId === m.id}
            {@const reactionEntries = m.reactions ? Object.entries(m.reactions).filter(([, u]) => u && u.length > 0) : []}
            <div class="msg msg--has-actions"
                 class:msg--own={own}
                 class:msg--grouped={isGrouped}
                 class:msg--failed={m.failed}
                 class:msg--editing={isEditing}>
              {#if isGrouped}
                <div class="msg-av msg-av--spacer" aria-hidden="true"></div>
              {:else}
                <div class="msg-av" style="background:{colorForSender(m.sender_id, m.sender_name)}">{initials(m.sender_name)}</div>
              {/if}
              <div class="msg-body">
                {#if !isGrouped}
                  <div class="msg-meta">
                    <span class="msg-name">{m.sender_name}</span>
                    <span class="msg-time" title={new Date(m.created_at).toLocaleString('de-CH')}>{fmtTime(m.created_at)}</span>
                    {#if m.pending}<span class="pending">sending...</span>{/if}
                    {#if m.failed}<span class="failed-tag">failed to send</span>{/if}
                  </div>
                {/if}

                {#if isEditing}
                  <div class="msg-edit">
                    <textarea
                      class="msg-edit-input"
                      bind:this={editingInputEl}
                      bind:value={editingContent}
                      rows="1"
                      onkeydown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                        else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                      }}
                    ></textarea>
                    <div class="msg-edit-actions">
                      <button type="button" class="msg-edit-btn msg-edit-save" onclick={saveEdit}>Save</button>
                      <button type="button" class="msg-edit-btn msg-edit-cancel" onclick={cancelEdit}>Cancel</button>
                      <span class="msg-edit-hint">Enter to save · Esc to cancel</span>
                    </div>
                  </div>
                {:else}
                  <div class="msg-text-wrap">
                    {#if m.metadata?.attachment_kind === 'file'}
                      {@const meta = m.metadata as Record<string, unknown>}
                      {@const fileId  = typeof meta.file_id === 'string' ? meta.file_id : null}
                      {@const fName   = typeof meta.filename === 'string' ? meta.filename : 'file'}
                      {@const fMime   = typeof meta.mime_type === 'string' ? meta.mime_type : null}
                      {@const fSize   = typeof meta.size_bytes === 'number' ? meta.size_bytes : null}
                      {@const fCat    = typeof meta.category === 'string' ? meta.category : null}
                      {@const fClient = typeof meta.client_code === 'string' ? meta.client_code : null}
                      {@const fPending = meta.s3_pending === true}
                      <div class="file-card cat-{categoryColor(fCat)}">
                        <span class="file-card-icon" aria-hidden="true">{fileIconFor(fMime)}</span>
                        <div class="file-card-body">
                          <div class="file-card-name">{fName}</div>
                          <div class="file-card-meta">
                            {#if fCat}<span class="file-card-chip">{fCat}</span>{/if}
                            {#if fClient}<span class="file-card-chip file-card-chip--client">{fClient}</span>{/if}
                            {#if fSize}<span class="file-card-size">{fmtSize(fSize)}</span>{/if}
                          </div>
                        </div>
                        {#if fileId && !fPending}
                          <button
                            type="button"
                            class="file-card-dl"
                            onclick={() => downloadVaultFile(fileId)}
                            aria-label="Download {fName}"
                            title="Download"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            <span>Open</span>
                          </button>
                        {:else if fPending}
                          <span class="file-card-pending" title="S3 not configured yet">pending S3</span>
                        {/if}
                      </div>
                    {/if}
                    {#if m.content}
                      <div class="msg-text">{@html renderMarkdown(m.content)}</div>
                    {/if}
                    {#if own && !m.pending && !m.failed && !String(m.id).startsWith('local-')}
                      <div class="msg-actions-hover" class:msg-actions-hover--left={!own}>
                        <button type="button" class="hover-btn" title="React" onclick={(e) => { e.stopPropagation(); toggleReactionPicker(m.id); }} aria-label="React">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                        </button>
                        <button type="button" class="hover-btn" title="Edit" onclick={() => beginEdit(m)} aria-label="Edit">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" class="hover-btn hover-btn--danger" title="Delete" onclick={() => deleteMessage(m)} aria-label="Delete">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                        </button>
                      </div>
                    {:else if !own && !m.pending && !m.failed && !String(m.id).startsWith('local-')}
                      <div class="msg-actions-hover msg-actions-hover--left">
                        <button type="button" class="hover-btn" title="React" onclick={(e) => { e.stopPropagation(); toggleReactionPicker(m.id); }} aria-label="React">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                        </button>
                      </div>
                    {/if}
                    {#if reactionPickerForId === m.id}
                      <div class="react-picker" class:react-picker--own={own}>
                        {#each REACTION_EMOJIS as emo (emo)}
                          <button type="button" class="react-pick-btn" onclick={(e) => { e.stopPropagation(); toggleReaction(m, emo); }}>{emo}</button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                  {#if m.edited_at}
                    <span class="msg-edited" title={`Edited ${new Date(m.edited_at).toLocaleString('de-CH')}`}>(edited)</span>
                  {/if}
                  {#if reactionEntries.length > 0}
                    <div class="reaction-pills">
                      {#each reactionEntries as [emoji, users] (emoji)}
                        {@const youReacted = !!userId && users.includes(userId)}
                        <button
                          type="button"
                          class="reaction-pill"
                          class:reaction-pill--mine={youReacted}
                          onclick={() => toggleReaction(m, emoji)}
                          title={youReacted ? 'Click to remove' : 'Click to add'}
                        >
                          <span class="reaction-emo">{emoji}</span>
                          <span class="reaction-cnt">{users.length}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                {/if}

                {#if m.failed}
                  <div class="msg-actions">
                    <span class="msg-error" title={m.error || ''}>{m.error || 'Network error'}</span>
                    <button class="msg-retry" type="button" onclick={() => retryFailedMessage(m)}>Retry</button>
                    <button class="msg-discard" type="button" onclick={() => discardFailedMessage(m.id)}>Discard</button>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      {/if}

      {#if nexTyping && nexTypingChannelId === activeChannelId}
        <div class="msg msg--ai msg--typing" aria-live="polite" aria-label="NEX is typing">
          <div class="msg-av msg-av--nex" aria-hidden="true">N</div>
          <div class="msg-body">
            <div class="msg-meta">
              <span class="msg-name msg-name--nex">NEX</span>
              <span class="typing-label">is thinking</span>
            </div>
            <div class="typing-bubble">
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
            </div>
          </div>
        </div>
      {/if}
    </div>

    {#if activeTypingUsers.length > 0}
      <div class="typing-strip" aria-live="polite">
        <span class="typing-strip-dots" aria-hidden="true">
          <span class="typing-strip-dot"></span>
          <span class="typing-strip-dot"></span>
          <span class="typing-strip-dot"></span>
        </span>
        <span class="typing-strip-text">
          {#if activeTypingUsers.length === 1}
            {activeTypingUsers[0].displayName} is typing...
          {:else if activeTypingUsers.length === 2}
            {activeTypingUsers[0].displayName} and {activeTypingUsers[1].displayName} are typing...
          {:else}
            {activeTypingUsers.length} people are typing...
          {/if}
        </span>
      </div>
    {/if}

    {#if userId && activeChannelId}
      <footer class="composer">
        <div class="composer-wrap" class:composer-wrap--mention={mentionOpen || slashOpen}>
          <!-- Autocomplete overlay -->
          {#if slashOpen && filteredSlash.length > 0}
            <div class="ac-overlay">
              <div class="ac-header">Commands</div>
              {#each filteredSlash as cmd, i (cmd.name)}
                <button
                  type="button"
                  class="ac-item"
                  class:ac-item--active={i === slashIndex}
                  onmouseenter={() => slashIndex = i}
                  onclick={() => completeSlash(cmd)}
                >
                  <span class="ac-name">{cmd.name}</span>
                  <span class="ac-hint">{cmd.hint}</span>
                </button>
              {/each}
            </div>
          {/if}

          {#if mentionOpen && filteredMentions.length > 0}
            <div class="ac-overlay">
              <div class="ac-header">Mention</div>
              {#each filteredMentions as mo, i (mo.handle)}
                <button
                  type="button"
                  class="ac-item"
                  class:ac-item--active={i === mentionIndex}
                  onmouseenter={() => mentionIndex = i}
                  onclick={() => completeMention(mo.handle)}
                >
                  <span class="ac-name">{mo.handle}</span>
                  <span class="ac-hint">{mo.label}{mo.kind === 'ai' ? ' · AI' : ''}</span>
                </button>
              {/each}
            </div>
          {/if}

          <textarea
            bind:this={textareaEl}
            class="composer-input"
            placeholder={isNexDM ? "Ask NEX anything... ('/' for commands, '@' to mention)" : `Message #${channelLabel(activeChannel!)} · type @NEX to ping the AI`}
            rows="1"
            bind:value={input}
            oninput={onInputChange}
            onkeydown={handleKey}
            disabled={sending}
          ></textarea>

          <div class="composer-tools">
            <button
              type="button"
              class="attach-btn"
              onclick={openFilePicker}
              aria-label="Attach a file from the vault"
              title="Attach file (vault or upload)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49"/>
              </svg>
            </button>
            <span class="tool-hint">
              <span class="kbd">/</span> commands · <span class="kbd">@</span> mention · <span class="kbd">↵</span> send · <span class="kbd">⇧↵</span> newline
            </span>
            <button
              type="button"
              class="send-btn"
              disabled={!input.trim() || sending}
              onclick={sendMessage}
              aria-label="Send message"
              title="Send (Enter)"
            >
              <span>Send</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
        </div>
        {#if nexTyping && nexTypingChannelId === activeChannelId}
          <div class="nex-processing" aria-live="polite">
            <span class="nex-processing-pulse"></span>
            <span class="nex-processing-text">NEX is processing your request...</span>
          </div>
        {/if}
      </footer>
    {/if}
  </section>

  <!-- ═════════════════════════════════════════════════════════════════════ -->
  <!-- RIGHT CONTEXT PANEL                                                    -->
  <!-- ═════════════════════════════════════════════════════════════════════ -->
  {#if contextOpen}
    <aside class="context">
      <div class="ctx-head">
        <h3><span class="ping" class:ping--off={!contextSnapshot}></span> Live Context</h3>
        <div class="ctx-head-r">
          <span class="ctx-ts">{contextLastFetch ? fmtClock(contextLastFetch) : '—'}</span>
          <button class="ctx-close" type="button" onclick={() => refreshContext(true)} aria-label="Refresh" disabled={contextLoading}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
          <button class="ctx-close" type="button" onclick={() => contextOpen = false} aria-label="Close context">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div class="ctx-body">
        {#if contextError}
          <div class="ctx-card ctx-card--error">
            <div class="ctx-card-head"><h4>Context unavailable</h4></div>
            <div class="ctx-empty">{contextError}</div>
          </div>
        {/if}

        <!-- Tracker -->
        <div class="ctx-card">
          <div class="ctx-card-head">
            <h4>Tracker</h4>
            {#if contextSnapshot?.tracker_live?.active}
              <span class="count-pill green">Active</span>
            {:else}
              <span class="count-pill">Idle</span>
            {/if}
          </div>
          {#if contextSnapshot?.tracker_live?.active && contextSnapshot.tracker_live.entry}
            {@const entry = contextSnapshot.tracker_live.entry}
            <div class="tracker-state">
              <span class="ind"></span>
              <span class="lbl">{entry.client_code || '—'} · {entry.description || entry.plane_issue_seq || 'Untitled'}</span>
              <span class="timer">{trackerElapsed !== null ? fmtElapsed(trackerElapsed) : '—'}</span>
            </div>
            {#if entry.plane_issue_seq}
              <div class="tracker-task">
                <span class="c2">{entry.plane_issue_seq}</span>
                {entry.description || ''}
              </div>
            {/if}
          {:else}
            <div class="ctx-empty">No active tracker</div>
          {/if}
        </div>

        <!-- Agent Health -->
        {#if contextSnapshot?.agent_health}
          {@const ah = contextSnapshot.agent_health}
          <div class="ctx-card">
            <div class="ctx-card-head">
              <h4>Agent Health</h4>
              <span class="count-pill" class:green={ah.stale === 0} class:amber={ah.stale > 0 && ah.stale < 4} class:red={ah.stale >= 4}>
                {ah.healthy} / {ah.total}
              </span>
            </div>
            {#if ah.items.length === 0}
              <div class="ctx-empty">All agents healthy</div>
            {:else}
              {#each ah.items.slice(0, 5) as agent (agent.agent_name)}
                <div class="ctx-row">
                  <span class="pri" class:pri-l={agent.liveness === 'yellow'} class:pri-m={agent.liveness === 'yellow'} class:pri-h={agent.liveness === 'red'}></span>
                  <span class="t">{agent.agent_name}</span>
                  <span class="s" class:s-pend={agent.liveness === 'red'}>{agent.liveness || 'ok'}</span>
                </div>
              {/each}
            {/if}
          </div>
        {/if}

        <!-- Open tickets -->
        {#if contextSnapshot?.open_tickets}
          {@const tickets = contextSnapshot.open_tickets}
          <div class="ctx-card ctx-card--accent">
            <div class="ctx-card-head">
              <h4>Open Tickets</h4>
              <span class="count-pill" class:red={tickets.overdue_count > 0}>
                {tickets.count}{tickets.overdue_count > 0 ? ` · ${tickets.overdue_count} overdue` : ''}
              </span>
            </div>
            {#if tickets.items.length === 0}
              <div class="ctx-empty">No open tickets</div>
            {:else}
              {#each tickets.items.slice(0, 5) as t (t.id)}
                <div class="ctx-row" class:ctx-row--overdue={t.is_overdue}>
                  <span class="pri {priorityDot(t.priority)}"></span>
                  <span class="id">{t.seq}</span>
                  <span class="t">{t.name}</span>
                  <span class="s" class:s-prog={!t.is_overdue && t.due_date} class:s-pend={t.is_overdue}>
                    {dueLabel(t.due_date) || (t.state || 'Open')}
                  </span>
                </div>
              {/each}
            {/if}
          </div>
        {/if}

        <!-- Commitments -->
        {#if contextSnapshot?.commitments && contextSnapshot.commitments.count > 0}
          {@const c = contextSnapshot.commitments}
          <div class="ctx-card">
            <div class="ctx-card-head">
              <h4>Commitments</h4>
              {#if c.overdue_count > 0}
                <span class="count-pill red">{c.overdue_count} overdue</span>
              {:else}
                <span class="count-pill">{c.count}</span>
              {/if}
            </div>
            {#each c.items.slice(0, 5) as it (it.id)}
              <div class="ctx-row">
                <span class="pri pri-h"></span>
                <span class="t">{it.promise}</span>
                <span class="s" class:s-pend={it.due_at && it.due_at < new Date().toISOString()}>
                  {it.due_at ? dueLabel(it.due_at) : '—'}
                </span>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Meetings today -->
        {#if contextSnapshot?.meetings_today && contextSnapshot.meetings_today.length > 0}
          <div class="ctx-card">
            <div class="ctx-card-head">
              <h4>Today's Meetings</h4>
              <span class="count-pill">{contextSnapshot.meetings_today.length}</span>
            </div>
            {#each contextSnapshot.meetings_today as mtg, idx (idx)}
              <div class="mtg-row">
                <span class="mtg-time">{mtg.start ? fmtTime(mtg.start) : '—'}</span>
                <div class="mtg-info">
                  <div class="mtg-title">{mtg.title}</div>
                  {#if mtg.attendees.length > 0}
                    <div class="mtg-att">{mtg.attendees.slice(0, 3).join(' · ')}</div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Clients / MRR -->
        {#if contextSnapshot?.clients && contextSnapshot.clients.items.length > 0}
          {@const totalMrr = contextSnapshot.clients.items.reduce((s, c) => s + (c.mrr || 0), 0)}
          {@const topClients = [...contextSnapshot.clients.items].filter(c => c.mrr > 0).sort((a, b) => b.mrr - a.mrr).slice(0, 5)}
          <div class="ctx-card ctx-card--accent">
            <div class="ctx-card-head">
              <h4>Clients · MRR</h4>
              <span class="count-pill green">{contextSnapshot.clients.count}</span>
            </div>
            <div class="metric">
              <span class="metric-v">CHF {fmtCHF(totalMrr)}</span>
              <span class="metric-u">/ month</span>
            </div>
            {#each topClients as c (c.code)}
              <div class="client-row">
                <span class="client-code">{c.code}</span>
                <span class="client-name">{c.name}</span>
                <span class="client-r">{fmtCHF(c.mrr)}</span>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Decisions -->
        {#if contextSnapshot?.recent_decisions && contextSnapshot.recent_decisions.length > 0}
          <div class="ctx-card">
            <div class="ctx-card-head"><h4>Recent Decisions</h4></div>
            {#each contextSnapshot.recent_decisions.slice(0, 3) as d, idx (idx)}
              <div class="dec">
                {#if d.client_code}<span class="dec-tag">{d.client_code}</span>{/if}
                <span class="dec-text">{d.decision}</span>
                {#if d.created_at}<span class="dec-when">{fmtRelative(d.created_at)}</span>{/if}
              </div>
            {/each}
          </div>
        {/if}

        {#if !contextSnapshot && !contextError}
          <div class="ctx-card">
            <div class="ctx-empty">{contextLoading ? 'Loading live context...' : 'No data yet'}</div>
          </div>
        {/if}
      </div>
    </aside>
  {/if}

  <!-- Mobile context drawer -->
  {#if mobileCtxOpen}
    <button type="button" class="backdrop backdrop--ctx" aria-label="Close context" onclick={() => mobileCtxOpen = false}></button>
    <aside class="ctx-drawer">
      <div class="ctx-head">
        <h3><span class="ping"></span> Live Context</h3>
        <div class="ctx-head-r">
          <span class="ctx-ts">{contextLastFetch ? fmtClock(contextLastFetch) : '—'}</span>
          <button class="ctx-close" type="button" onclick={() => mobileCtxOpen = false} aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div class="ctx-body">
        {#if contextSnapshot?.tracker_live?.active && contextSnapshot.tracker_live.entry}
          {@const entry = contextSnapshot.tracker_live.entry}
          <div class="ctx-card">
            <div class="ctx-card-head"><h4>Tracker</h4><span class="count-pill green">Active</span></div>
            <div class="tracker-state">
              <span class="ind"></span>
              <span class="lbl">{entry.client_code || '—'}</span>
              <span class="timer">{trackerElapsed !== null ? fmtElapsed(trackerElapsed) : '—'}</span>
            </div>
          </div>
        {/if}
        {#if contextSnapshot?.open_tickets?.items?.length}
          <div class="ctx-card">
            <div class="ctx-card-head">
              <h4>Open Tickets</h4>
              <span class="count-pill" class:red={contextSnapshot.open_tickets.overdue_count > 0}>{contextSnapshot.open_tickets.count}</span>
            </div>
            {#each contextSnapshot.open_tickets.items.slice(0, 6) as t (t.id)}
              <div class="ctx-row">
                <span class="pri {priorityDot(t.priority)}"></span>
                <span class="t">{t.name}</span>
                <span class="s" class:s-pend={t.is_overdue}>{dueLabel(t.due_date) || (t.state || 'Open')}</span>
              </div>
            {/each}
          </div>
        {/if}
        {#if contextSnapshot?.commitments && contextSnapshot.commitments.count > 0}
          <div class="ctx-card">
            <div class="ctx-card-head">
              <h4>Commitments</h4>
              {#if contextSnapshot.commitments.overdue_count > 0}
                <span class="count-pill red">{contextSnapshot.commitments.overdue_count} overdue</span>
              {/if}
            </div>
            {#each contextSnapshot.commitments.items.slice(0, 5) as it (it.id)}
              <div class="ctx-row"><span class="pri pri-h"></span><span class="t">{it.promise}</span></div>
            {/each}
          </div>
        {/if}
      </div>
    </aside>
  {/if}

  {#if toast}
    <div class="toast">{toast}</div>
  {/if}

  <!-- ═════════════════════════════════════════════════════════════════════ -->
  <!-- FILE PICKER MODAL (NEX File Vault)                                     -->
  <!-- ═════════════════════════════════════════════════════════════════════ -->
  {#if filePickerOpen}
    <div class="fp-overlay" onclick={closeFilePicker} onkeydown={(e) => { if (e.key === 'Escape') closeFilePicker(); }} role="presentation">
      <div class="fp-modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') closeFilePicker(); }} role="dialog" aria-modal="true" aria-label="Share a file" tabindex="-1">
        <div class="fp-head">
          <h3 class="fp-title">Share a file</h3>
          <button type="button" class="fp-close" onclick={closeFilePicker} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="fp-tabs">
          <button type="button" class="fp-tab" class:fp-tab--active={filePickerTab === 'browse'} onclick={() => { filePickerTab = 'browse'; void loadVaultFiles(); }}>Browse vault</button>
          <button type="button" class="fp-tab" class:fp-tab--active={filePickerTab === 'upload'} onclick={() => filePickerTab = 'upload'}>Upload</button>
        </div>

        {#if filePickerTab === 'browse'}
          <div class="fp-filters">
            <input
              type="text"
              class="fp-search"
              placeholder="Search by name, client, category..."
              bind:value={filePickerQuery}
              oninput={() => void loadVaultFiles()}
            />
            <select class="fp-select" bind:value={filePickerCategory} onchange={() => void loadVaultFiles()}>
              <option value="">All categories</option>
              <option value="offers">Offers</option>
              <option value="deliverables">Deliverables</option>
              <option value="meetings">Meetings</option>
              <option value="reports">Reports</option>
              <option value="strategy">Strategy</option>
              <option value="brand">Brand</option>
              <option value="templates">Templates</option>
              <option value="finance">Finance</option>
              <option value="other">Other</option>
            </select>
          </div>

          {#if filePickerError}
            <div class="fp-error">{filePickerError}</div>
          {/if}

          <div class="fp-list">
            {#if filePickerLoading}
              <div class="fp-empty">Loading...</div>
            {:else if filePickerFiles.length === 0}
              <div class="fp-empty">No files in the vault yet. Switch to "Upload" to add one.</div>
            {:else}
              {#each filePickerFiles as f (f.id)}
                <button type="button" class="fp-item" onclick={() => attachVaultFile(f)}>
                  <span class="fp-item-icon">{fileIconFor(f.mime_type)}</span>
                  <span class="fp-item-body">
                    <span class="fp-item-name">{f.filename}</span>
                    <span class="fp-item-meta">
                      {#if f.category}<span class="fp-chip fp-chip--{categoryColor(f.category)}">{f.category}</span>{/if}
                      {#if f.client_code}<span class="fp-chip fp-chip--client">{f.client_code}</span>{/if}
                      {#if f.size_bytes}<span class="fp-item-size">{fmtSize(f.size_bytes)}</span>{/if}
                      <span class="fp-item-date">{new Date(f.created_at).toLocaleDateString('de-CH')}</span>
                    </span>
                  </span>
                </button>
              {/each}
            {/if}
          </div>
        {:else}
          <div class="fp-upload">
            {#if filePickerError}
              <div class="fp-error">{filePickerError}</div>
            {/if}
            <label class="fp-drop" class:fp-drop--busy={fileUploading}>
              <input
                bind:this={fileInputEl}
                type="file"
                onchange={uploadFromInput}
                disabled={fileUploading}
                style="display:none"
              />
              {#if fileUploading}
                <span class="fp-drop-text">{fileUploadProgress || 'Uploading...'}</span>
              {:else}
                <span class="fp-drop-icon" aria-hidden="true">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </span>
                <span class="fp-drop-text">Click to choose a file</span>
                <span class="fp-drop-hint">Max 8 MB. Will be archived to the vault and sent in this thread.</span>
              {/if}
            </label>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* ───────────────────────── Design tokens ──────────────────────────────── */
  :global(.nexogram-scope) { /* tokens carried inline */ }

  /* Nexogram is a full-viewport chat app. Override the app shell layout:
     - zero out .main padding (it adds 32px top + 80px bottom = composer disappears)
     - hide topbar (chat has its own header)
     - constrain heights so the 1fr thread row actually stops growing */
  :global(body:has(.nexogram)) { overflow: hidden; }
  :global(body:has(.nexogram) .app-shell)     { height: 100dvh; overflow: hidden; }
  :global(body:has(.nexogram) .shell-content) { height: 100dvh; overflow: hidden; flex-shrink: 0; }
  :global(body:has(.nexogram) .topbar)        { display: none; }
  :global(body:has(.nexogram) .main) {
    padding: 0;
    max-width: 100%;
    margin: 0;
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .nexogram {
    --bg: #0a0a0f;
    --bg-1: #0d0e15;
    --bg-2: #11131c;
    --a: #56bcec;
    --a-2: #7c5cbf;
    --a-glow: rgba(86, 188, 236, 0.4);
    --bd: rgba(86, 188, 236, 0.15);
    --bd-2: rgba(255, 255, 255, 0.06);
    --tx: #ffffff;
    --tx-2: rgba(255, 255, 255, 0.65);
    --tx-3: rgba(255, 255, 255, 0.4);
    --tx-4: rgba(255, 255, 255, 0.25);
    --green: #22c55e;
    --amber: #f59e0b;
    --red: #ef4444;
    --glass: rgba(255, 255, 255, 0.04);
    --glass-hi: rgba(255, 255, 255, 0.07);

    display: grid;
    grid-template-columns: 260px 1fr;
    /* Fill the parent (now padding-free .main) instead of 100dvh,
       so it never fights the layout shell */
    height: 100%;
    min-height: 0;
    background:
      radial-gradient(900px 600px at 15% -10%, rgba(86, 188, 236, 0.07), transparent 60%),
      radial-gradient(800px 500px at 100% 100%, rgba(124, 92, 191, 0.06), transparent 60%),
      var(--bg);
    color: var(--tx);
    font-family: Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 14px;
    overflow: hidden;
    position: relative;
  }
  .nexogram--ctx-open { grid-template-columns: 260px 1fr 320px; }

  /* ───────────────────────── Sidebar ────────────────────────────────────── */
  .sidebar {
    background: var(--bg);
    border-right: 1px solid var(--bd-2);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .sb-head {
    padding: 18px 18px 14px;
    border-bottom: 1px solid var(--bd-2);
    flex-shrink: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    gap: 8px;
  }
  .brand-l {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 800 17px/1 'Manrope', 'Inter', sans-serif;
    letter-spacing: -0.01em;
  }
  .brand-name {
    background: linear-gradient(135deg, #fff 0%, var(--a) 60%, var(--a-2) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .logo-dot {
    width: 10px; height: 10px; border-radius: 3px;
    background: linear-gradient(135deg, var(--a), var(--a-2));
    box-shadow: 0 0 12px var(--a-glow);
  }
  .live-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 600 10px/1 Inter, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--green);
    padding: 3px 8px;
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: 999px;
    cursor: default;
  }
  .live-pill--wait { color: var(--amber); background: rgba(245,158,11,0.10); border-color: rgba(245,158,11,0.25); }
  .live-pill--off {
    color: var(--red);
    background: rgba(239,68,68,0.10);
    border-color: rgba(239,68,68,0.30);
    cursor: pointer;
    all: revert;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 600 10px/1 Inter, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 999px;
  }
  .pulse {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 8px var(--green);
  }
  .pulse--wait { background: var(--amber); box-shadow: 0 0 8px var(--amber); }
  .pulse--off  { background: var(--red);   box-shadow: 0 0 8px var(--red); }
  .ver { font: 400 11px/1.2 Inter, sans-serif; color: var(--tx-3); }

  .sb-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 8px 12px;
    min-height: 0;
  }
  .sb-body::-webkit-scrollbar { width: 6px; }
  .sb-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 6px; }

  .sb-group { margin-top: 6px; }
  .sb-group h4 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font: 600 10.5px/1 Inter, sans-serif;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--tx-3);
    padding: 8px 10px 8px;
    margin: 0;
  }
  .add-btn {
    all: unset;
    cursor: pointer;
    width: 18px; height: 18px;
    display: grid;
    place-items: center;
    background: var(--glass);
    border: 1px solid var(--bd-2);
    border-radius: 6px;
    color: var(--tx-2);
    font-size: 13px;
    font-weight: 600;
  }
  .add-btn:hover { background: var(--glass-hi); border-color: var(--a); color: var(--a); }

  .sb-item {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 8px;
    font: 500 13.5px/1.2 Inter, sans-serif;
    color: var(--tx-2);
    cursor: pointer;
    position: relative;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
    border: 1px solid transparent;
    margin: 1px 0;
  }
  .sb-item:hover { background: var(--glass); color: var(--tx); }
  .sb-item--active {
    background: linear-gradient(90deg, rgba(86, 188, 236, 0.16), rgba(86, 188, 236, 0.04));
    color: var(--tx);
    border-color: rgba(86, 188, 236, 0.25);
    box-shadow: 0 0 18px rgba(86, 188, 236, 0.08) inset;
  }
  .sb-item--active .hash { color: var(--a); }
  .sb-item--nex {
    border-color: rgba(86, 188, 236, 0.18);
    background: linear-gradient(90deg, rgba(86, 188, 236, 0.12), rgba(124, 92, 191, 0.08));
    position: relative;
    overflow: hidden;
  }
  .sb-item--nex::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, var(--a), var(--a-2));
    box-shadow: 0 0 12px var(--a);
  }
  .sb-item--nex.sb-item--active {
    background: linear-gradient(90deg, rgba(86, 188, 236, 0.22), rgba(124, 92, 191, 0.14));
    border-color: rgba(86, 188, 236, 0.40);
  }
  .ai-orb {
    width: 16px; height: 16px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #fff 0%, var(--a) 40%, var(--a-2) 100%);
    box-shadow: 0 0 10px var(--a-glow);
    flex-shrink: 0;
  }
  .hash { color: var(--tx-3); font-weight: 500; width: 14px; text-align: center; flex-shrink: 0; }
  .sb-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sb-badge {
    font: 600 9.5px/1 Inter, sans-serif;
    letter-spacing: 0.08em;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(86, 188, 236, 0.12);
    color: var(--a);
    border: 1px solid rgba(86, 188, 236, 0.2);
    text-transform: uppercase;
  }
  .unread {
    font: 700 10px/1 Inter, sans-serif;
    background: var(--a);
    color: #000;
    border-radius: 999px;
    padding: 2px 6px;
    min-width: 18px;
    text-align: center;
  }

  .sb-item--member { cursor: pointer; }
  .sb-item--member:disabled { cursor: default; }
  .member-av {
    width: 26px; height: 26px;
    border-radius: 8px;
    display: grid; place-items: center;
    font: 700 10px/1 'Manrope', Inter, sans-serif;
    color: #000;
    flex-shrink: 0;
    text-transform: uppercase;
    opacity: 0.92;
  }
  .member-role {
    font: 600 9.5px/1 Inter, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--tx-3);
    padding: 2px 5px;
    border: 1px solid var(--bd-2);
    border-radius: 4px;
    flex-shrink: 0;
  }
  .member-you {
    font: 500 9.5px/1 Inter, sans-serif;
    color: var(--a);
    letter-spacing: 0.06em;
    flex-shrink: 0;
  }

  .ch-create {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    margin: 6px 0 2px;
    background: rgba(86,188,236,0.05);
    border: 1px solid rgba(86,188,236,0.18);
    border-radius: 8px;
  }
  .ch-create-input {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    padding: 6px 8px;
    background: rgba(0,0,0,0.25);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 6px;
    color: var(--tx);
    font: 500 12px/1.3 Inter, sans-serif;
  }
  .ch-create-input:focus { border-color: rgba(86,188,236,0.35); }
  .ch-create-actions { display: flex; gap: 6px; }
  .btn-mini {
    all: unset;
    padding: 4px 8px;
    border-radius: 5px;
    font: 600 11px/1 Inter, sans-serif;
    cursor: pointer;
    text-align: center;
  }
  .btn-primary { background: var(--a); color: #0a1020; }
  .btn-primary:hover { background: #74c8ef; }
  .btn-ghost { color: var(--tx-2); }
  .btn-ghost:hover { color: var(--tx); }

  .sb-foot {
    border-top: 1px solid var(--bd-2);
    padding: 12px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-1);
    flex-shrink: 0;
  }
  .me-av {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #ff7a59, #c14a8e);
    display: grid; place-items: center;
    font: 700 12px/1 Inter, sans-serif;
    color: #fff;
    flex-shrink: 0;
    text-transform: uppercase;
  }
  .me-info { flex: 1; min-width: 0; }
  .me-name {
    font: 600 13px/1.2 Inter, sans-serif;
    color: var(--tx);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .me-conn {
    font: 500 10.5px/1 Inter, sans-serif;
    color: var(--tx-3);
    display: flex; align-items: center; gap: 5px;
    margin-top: 4px;
  }

  /* ───────────────────────── Center thread ──────────────────────────────── */
  .center {
    display: flex;
    flex-direction: column;
    min-height: 0;
    position: relative;
    background:
      radial-gradient(800px 500px at 50% -10%, rgba(86, 188, 236, 0.04), transparent 60%),
      var(--bg-1);
  }
  .ch-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 22px;
    border-bottom: 1px solid var(--bd-2);
    background: rgba(10, 10, 15, 0.7);
    backdrop-filter: blur(12px);
    flex-shrink: 0;
  }
  .ch-head-l { display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1; }
  .ch-head-r { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .head-btn {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 500 12px/1 Inter, sans-serif;
    color: var(--tx-2);
    padding: 7px 11px;
    background: var(--glass);
    border: 1px solid var(--bd-2);
    border-radius: 8px;
    cursor: pointer;
    transition: all 140ms ease;
  }
  .head-btn:hover { background: var(--glass-hi); color: var(--tx); border-color: var(--a); }
  .head-btn--mobile-ctx { display: none; }

  .ham {
    all: unset;
    cursor: pointer;
    display: none;
    padding: 6px;
    border-radius: 6px;
    color: var(--tx-2);
  }
  .ham:hover { color: var(--a); background: var(--glass); }

  .nex-head-avatar {
    width: 34px; height: 34px;
    border-radius: 10px;
    background: radial-gradient(circle at 30% 30%, #fff 0%, var(--a) 40%, var(--a-2) 100%);
    display: grid; place-items: center;
    font: 800 13px/1 'Manrope', sans-serif;
    color: #000;
    box-shadow: 0 0 24px rgba(86, 188, 236, 0.35), 0 0 0 1px rgba(86, 188, 236, 0.25) inset;
    flex-shrink: 0;
  }
  .ch-hash-mark {
    width: 32px; height: 32px;
    border-radius: 10px;
    background: var(--glass);
    border: 1px solid var(--bd-2);
    display: grid; place-items: center;
    color: var(--tx-3);
    font: 700 18px/1 Inter, sans-serif;
    flex-shrink: 0;
  }
  .ch-titles { min-width: 0; flex: 1; }
  .ch-title {
    font: 700 16px/1.2 'Manrope', Inter, sans-serif;
    color: var(--tx);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ch-sub-inline { color: var(--tx-3); font-weight: 500; font-size: 13px; }
  .ch-sub {
    font: 400 12px/1.4 Inter, sans-serif;
    color: var(--tx-3);
    margin-top: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .conn-on { color: var(--green); }
  .conn-off { color: var(--red); }

  .quick-prompts {
    padding: 12px 22px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    border-bottom: 1px solid var(--bd-2);
    background: rgba(86, 188, 236, 0.02);
    flex-shrink: 0;
  }
  .qp {
    all: unset;
    cursor: pointer;
    font: 500 12px/1 Inter, sans-serif;
    padding: 7px 12px;
    background: var(--glass);
    border: 1px solid var(--bd);
    border-radius: 999px;
    color: var(--tx-2);
    transition: all 140ms ease;
  }
  .qp:hover {
    background: rgba(86, 188, 236, 0.1);
    color: var(--tx);
    border-color: var(--a);
    box-shadow: 0 0 16px rgba(86, 188, 236, 0.15);
  }

  .thread {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 18px 22px 8px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    scroll-behavior: smooth;
    min-height: 0;
  }
  .thread::-webkit-scrollbar { width: 8px; }
  .thread::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 8px; }

  .day-div {
    display: flex;
    align-items: center;
    gap: 12px;
    font: 600 11px/1 Inter, sans-serif;
    color: var(--tx-3);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin: 6px 0;
  }
  .day-div::before, .day-div::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--bd-2);
  }

  .empty {
    margin: auto;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: var(--tx-3);
  }
  .empty-icon {
    font: 800 22px/1 'Manrope', Inter, sans-serif;
    color: var(--a);
    width: 52px; height: 52px;
    display: grid; place-items: center;
    border-radius: 12px;
    background: rgba(86,188,236,0.08);
    border: 1px solid rgba(86,188,236,0.18);
    margin-bottom: 4px;
  }
  .empty-title { font: 600 15px/1.2 Inter, sans-serif; color: var(--tx-2); }
  .empty-sub { font: 400 13px/1.4 Inter, sans-serif; max-width: 360px; }

  /* Messages */
  .msg { display: flex; gap: 12px; align-items: flex-start; max-width: 100%; }
  .msg--own { flex-direction: row-reverse; }
  .msg--ai { align-items: flex-start; }
  .msg-av {
    width: 36px; height: 36px;
    border-radius: 10px;
    flex-shrink: 0;
    display: grid; place-items: center;
    font: 700 13px/1 'Manrope', Inter, sans-serif;
    color: #fff;
    text-transform: uppercase;
  }
  .msg-av--nex {
    background: radial-gradient(circle at 30% 30%, #fff 0%, var(--a) 40%, var(--a-2) 100%) !important;
    color: #000 !important;
    box-shadow: 0 0 18px rgba(86, 188, 236, 0.25);
  }
  /* Unified chat bubble sizing - consistent across all channel kinds
     (team / direct / nex). Width follows content up to a single max. */
  .msg-body {
    flex: 1;
    min-width: 0;
    max-width: min(640px, 78%);
    display: flex;
    flex-direction: column;
    width: fit-content;
  }
  .msg--own .msg-body { align-items: flex-end; }
  .msg--ai .msg-body { align-items: flex-start; }
  /* Thread itself caps width so the column is identical in every channel */
  .thread > * { width: 100%; }

  .msg-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    flex-wrap: wrap;
  }
  .msg--own .msg-meta { justify-content: flex-end; }
  .msg-name { font: 600 13px/1 Inter, sans-serif; color: var(--tx); }
  .msg-name--nex {
    background: linear-gradient(135deg, var(--a), var(--a-2));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    font-weight: 700;
  }
  .msg-time { color: var(--tx-3); font: 400 11px/1 Inter, sans-serif; }
  .pending { color: var(--a); font: 400 10px/1 Inter, sans-serif; font-style: italic; }
  .model-pill {
    font: 600 9.5px/1 Inter, sans-serif;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid var(--bd);
    color: var(--a);
    background: rgba(86,188,236,0.04);
  }
  .model-pill--apertus {
    color: #c4b5fd;
    border-color: rgba(124, 92, 191, 0.30);
    background: rgba(124, 92, 191, 0.06);
  }

  /* ───────── NEX typing indicator ───────── */
  .msg--typing { animation: typing-fade-in 220ms ease-out both; }
  .typing-label {
    font: 500 11px/1 Inter, sans-serif;
    color: var(--tx-3);
    font-style: italic;
    letter-spacing: 0.01em;
  }
  .typing-bubble {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    background: rgba(86, 188, 236, 0.06);
    border: 1px solid rgba(86, 188, 236, 0.22);
    border-radius: 4px 12px 12px 12px;
    box-shadow: 0 0 0 0 rgba(86, 188, 236, 0.0);
    animation: typing-bubble-pulse 2.4s ease-in-out infinite;
  }
  .typing-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #56bcec;
    box-shadow: 0 0 8px rgba(86, 188, 236, 0.55);
    animation: nex-dot 1.2s ease-in-out infinite both;
  }
  .typing-dot:nth-child(1) { animation-delay: 0ms; }
  .typing-dot:nth-child(2) { animation-delay: 150ms; }
  .typing-dot:nth-child(3) { animation-delay: 300ms; }
  @keyframes nex-dot {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.55; }
    40%           { transform: translateY(-6px); opacity: 1; }
  }
  @keyframes typing-bubble-pulse {
    0%, 100% {
      border-color: rgba(86, 188, 236, 0.22);
      background:   rgba(86, 188, 236, 0.06);
      box-shadow: 0 0 0 0 rgba(86, 188, 236, 0.0);
    }
    50% {
      border-color: rgba(86, 188, 236, 0.45);
      background:   rgba(86, 188, 236, 0.10);
      box-shadow: 0 0 16px 0 rgba(86, 188, 236, 0.18);
    }
  }
  @keyframes typing-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ───────── Composer "NEX is processing..." hint ───────── */
  .nex-processing {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 4px 0;
    font: 500 11px/1 Inter, sans-serif;
    color: var(--a);
    letter-spacing: 0.02em;
    animation: typing-fade-in 220ms ease-out both;
  }
  .nex-processing-pulse {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #56bcec;
    box-shadow: 0 0 8px rgba(86, 188, 236, 0.7);
    animation: nex-processing-pulse 1.2s ease-in-out infinite;
  }
  .nex-processing-text { opacity: 0.85; }
  @keyframes nex-processing-pulse {
    0%, 100% { opacity: 0.4; transform: scale(0.85); }
    50%      { opacity: 1;   transform: scale(1.15); }
  }

  .msg-text {
    font: 400 14px/1.55 Inter, system-ui, sans-serif;
    color: var(--tx);
    word-wrap: break-word;
    overflow-wrap: anywhere;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--bd-2);
    border-radius: 4px 12px 12px 12px;
    padding: 8px 12px;
    display: inline-block;
    max-width: 100%;
  }
  .msg--own .msg-text {
    background: rgba(86, 188, 236, 0.10);
    border: 1px solid rgba(86, 188, 236, 0.22);
    border-radius: 12px 12px 4px 12px;
    padding: 8px 12px;
  }
  .msg-text :global(code) {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12.5px;
    background: rgba(86, 188, 236, 0.08);
    padding: 1px 5px;
    border-radius: 4px;
    color: var(--a);
  }
  .msg-text :global(strong) { font-weight: 700; color: var(--tx); }
  .msg-text :global(em) { color: var(--tx-2); font-style: italic; }

  .msg-text--ai {
    background: rgba(86, 188, 236, 0.04);
    border: 1px solid var(--bd);
    border-left: 3px solid var(--a);
    border-radius: 4px 12px 12px 12px;
    padding: 10px 14px;
    box-shadow: 0 0 0 1px rgba(86, 188, 236, 0.06), 0 4px 18px rgba(86, 188, 236, 0.08);
  }

  .system-pill {
    align-self: center;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px;
    font: 500 11.5px/1.4 Inter, sans-serif;
    color: var(--tx-3);
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--bd-2);
    border-radius: 999px;
    max-width: 80%;
    text-align: center;
  }
  .system-pill-text :global(code) {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    color: var(--a);
    background: rgba(86,188,236,0.06);
    padding: 1px 5px;
    border-radius: 3px;
  }
  .system-pill-time {
    font: 400 10px/1 Inter, sans-serif;
    color: var(--tx-4);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
  }

  /* ───────────────────────── Composer ───────────────────────────────────── */
  .composer {
    padding: 14px 22px 18px;
    border-top: 1px solid var(--bd-2);
    background: rgba(10, 10, 15, 0.6);
    flex-shrink: 0;
  }
  .composer-wrap {
    position: relative;
    background: var(--glass);
    border: 1px solid var(--bd);
    border-radius: 14px;
    padding: 12px 14px 8px;
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  .composer-wrap:focus-within {
    border-color: var(--a);
    box-shadow: 0 0 24px rgba(86, 188, 236, 0.10);
  }
  .composer-wrap--mention {
    border-color: var(--a);
    box-shadow: 0 0 24px rgba(86, 188, 236, 0.15);
  }
  .composer-input {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    min-height: 24px;
    max-height: 160px;
    overflow-y: auto;
    font: 400 14px/1.5 Inter, system-ui, sans-serif;
    color: var(--tx);
    resize: none;
    word-break: break-word;
    display: block;
  }
  .composer-input::placeholder { color: var(--tx-3); }

  .composer-tools {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--bd-2);
    margin-top: 6px;
  }
  .tool-hint {
    flex: 1;
    font: 400 11px/1 Inter, sans-serif;
    color: var(--tx-3);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .kbd {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    background: var(--glass);
    border: 1px solid var(--bd-2);
    padding: 1px 5px;
    border-radius: 4px;
    color: var(--tx-2);
  }
  .send-btn {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 600 12.5px/1 Inter, sans-serif;
    padding: 7px 14px;
    background: linear-gradient(135deg, var(--a), var(--a-2));
    color: #000;
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(86, 188, 236, 0.30);
    transition: filter 120ms ease, transform 120ms ease;
  }
  .send-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .send-btn:disabled { opacity: 0.4; cursor: not-allowed; filter: none; transform: none; box-shadow: none; }

  /* Autocomplete overlay */
  .ac-overlay {
    position: absolute;
    left: 0; right: 0;
    bottom: calc(100% + 6px);
    background: var(--bg-2);
    border: 1px solid var(--bd);
    border-radius: 12px;
    box-shadow: 0 14px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(86,188,236,0.10);
    padding: 6px;
    max-height: 240px;
    overflow-y: auto;
    z-index: 20;
  }
  .ac-header {
    font: 700 10px/1 Inter, sans-serif;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--tx-3);
    padding: 8px 10px 6px;
  }
  .ac-item {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 100ms ease;
  }
  .ac-item:hover, .ac-item--active {
    background: rgba(86,188,236,0.10);
  }
  .ac-name {
    font: 600 13px/1.2 'JetBrains Mono', ui-monospace, monospace;
    color: var(--a);
  }
  .ac-hint {
    font: 400 12px/1.2 Inter, sans-serif;
    color: var(--tx-3);
    flex: 1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* ───────────────────────── Context panel ──────────────────────────────── */
  .context {
    border-left: 1px solid var(--bd-2);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .ctx-head {
    padding: 14px 18px 12px;
    border-bottom: 1px solid var(--bd-2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-shrink: 0;
  }
  .ctx-head h3 {
    font: 700 11.5px/1 Inter, sans-serif;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--tx-2);
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }
  .ping {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--a);
    box-shadow: 0 0 10px var(--a);
    animation: ping-pulse 2s ease-in-out infinite;
  }
  .ping--off { background: var(--tx-3); box-shadow: none; animation: none; }
  @keyframes ping-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }
  .ctx-head-r { display: flex; align-items: center; gap: 6px; }
  .ctx-ts {
    font: 500 10.5px/1 'JetBrains Mono', ui-monospace, monospace;
    color: var(--tx-3);
  }
  .ctx-close {
    all: unset;
    cursor: pointer;
    width: 24px; height: 24px;
    display: grid; place-items: center;
    border-radius: 6px;
    color: var(--tx-3);
    transition: all 140ms ease;
  }
  .ctx-close:hover { color: var(--a); background: rgba(86,188,236,0.08); }
  .ctx-close:disabled { opacity: 0.4; cursor: not-allowed; }

  .ctx-body {
    flex: 1;
    overflow-y: auto;
    padding: 10px 14px 14px;
    min-height: 0;
  }
  .ctx-body::-webkit-scrollbar { width: 6px; }
  .ctx-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 6px; }

  .ctx-card {
    background: var(--glass);
    border: 1px solid var(--bd-2);
    border-radius: 12px;
    padding: 12px 14px;
    margin-top: 10px;
    backdrop-filter: blur(12px);
  }
  .ctx-card--accent { border-color: var(--bd); }
  .ctx-card--error { border-color: rgba(239,68,68,0.30); background: rgba(239,68,68,0.04); }

  .ctx-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    gap: 8px;
  }
  .ctx-card-head h4 {
    font: 600 11px/1 Inter, sans-serif;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--tx-3);
    margin: 0;
  }
  .count-pill {
    font: 700 10.5px/1 Inter, sans-serif;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(86, 188, 236, 0.12);
    color: var(--a);
    border: 1px solid var(--bd);
  }
  .count-pill.green { background: rgba(34, 197, 94, 0.10); color: var(--green); border-color: rgba(34, 197, 94, 0.25); }
  .count-pill.amber { background: rgba(245, 158, 11, 0.10); color: var(--amber); border-color: rgba(245, 158, 11, 0.25); }
  .count-pill.red   { background: rgba(239, 68, 68, 0.10);  color: var(--red);   border-color: rgba(239, 68, 68, 0.25); }

  .ctx-empty {
    font: 400 12px/1.4 Inter, sans-serif;
    color: var(--tx-3);
    padding: 4px 0 2px;
  }

  .ctx-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    font: 500 12.5px/1.3 Inter, sans-serif;
    min-width: 0;
  }
  .ctx-row + .ctx-row { border-top: 1px solid var(--bd-2); padding-top: 7px; margin-top: 4px; }
  .pri { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .pri-h { background: var(--red); box-shadow: 0 0 6px var(--red); }
  .pri-m { background: var(--amber); }
  .pri-l { background: var(--tx-4); }
  .ctx-row .id {
    font: 500 10.5px/1 'JetBrains Mono', ui-monospace, monospace;
    color: var(--tx-3);
    flex-shrink: 0;
  }
  .ctx-row .t {
    flex: 1;
    color: var(--tx);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .ctx-row .s {
    font: 600 10px/1 Inter, sans-serif;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--glass-hi);
    color: var(--tx-2);
    border: 1px solid var(--bd-2);
    flex-shrink: 0;
  }
  .s-prog { background: rgba(86, 188, 236, 0.10); color: var(--a); border-color: var(--bd); }
  .s-pend { background: rgba(245, 158, 11, 0.10); color: var(--amber); border-color: rgba(245, 158, 11, 0.25); }
  .ctx-row--overdue .t { color: var(--red); }

  .metric { display: flex; align-items: baseline; gap: 8px; margin: 4px 0 12px; }
  .metric-v {
    font: 800 24px/1 'Manrope', Inter, sans-serif;
    letter-spacing: -0.02em;
    color: var(--tx);
  }
  .metric-u { font: 500 11px/1 Inter, sans-serif; color: var(--tx-3); }

  .client-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    font: 500 12.5px/1 Inter, sans-serif;
  }
  .client-row + .client-row { border-top: 1px solid var(--bd-2); padding-top: 7px; margin-top: 4px; }
  .client-code {
    font: 700 10px/1 'JetBrains Mono', ui-monospace, monospace;
    padding: 2px 6px;
    background: var(--glass-hi);
    border: 1px solid var(--bd-2);
    border-radius: 4px;
    color: var(--tx-2);
    flex-shrink: 0;
  }
  .client-name {
    flex: 1;
    color: var(--tx);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .client-r { font: 700 12.5px/1 'Manrope', Inter, sans-serif; color: var(--a); }

  .tracker-state { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
  .ind {
    width: 10px; height: 10px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 12px var(--green);
    animation: ping-pulse 1.8s ease-in-out infinite;
  }
  .lbl { font-weight: 600; font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .timer {
    margin-left: auto;
    font: 600 13px/1 'JetBrains Mono', ui-monospace, monospace;
    color: var(--a);
  }
  .tracker-task {
    margin-top: 6px;
    font: 400 12px/1.4 Inter, sans-serif;
    color: var(--tx-2);
  }
  .c2 {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    color: var(--tx-3);
    margin-right: 6px;
  }

  .mtg-row { display: flex; gap: 10px; padding: 6px 0; align-items: flex-start; }
  .mtg-row + .mtg-row { border-top: 1px solid var(--bd-2); padding-top: 7px; margin-top: 4px; }
  .mtg-time {
    font: 500 11px/1.2 'JetBrains Mono', ui-monospace, monospace;
    color: var(--a);
    padding-top: 1px;
    min-width: 44px;
    flex-shrink: 0;
  }
  .mtg-info { flex: 1; min-width: 0; }
  .mtg-title {
    font: 500 12.5px/1.3 Inter, sans-serif;
    color: var(--tx);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .mtg-att {
    font: 400 11px/1.3 Inter, sans-serif;
    color: var(--tx-3);
    margin-top: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .dec {
    font: 400 12px/1.5 Inter, sans-serif;
    color: var(--tx-2);
    padding: 7px 0;
  }
  .dec + .dec { border-top: 1px solid var(--bd-2); }
  .dec-tag {
    font: 700 10px/1 'JetBrains Mono', ui-monospace, monospace;
    background: rgba(124, 92, 191, 0.10);
    color: var(--a-2);
    border: 1px solid rgba(124, 92, 191, 0.25);
    padding: 2px 6px;
    border-radius: 4px;
    margin-right: 6px;
  }
  .dec-text { display: block; margin-top: 4px; color: var(--tx); font-size: 12.5px; line-height: 1.45; }
  .dec-when { font: 400 10.5px/1 Inter, sans-serif; color: var(--tx-3); margin-top: 4px; display: block; }

  /* ───────────────────────── Backdrop + drawers ─────────────────────────── */
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(2px);
    border: 0;
    cursor: pointer;
    z-index: 40;
    display: none;
  }
  .ctx-drawer {
    position: fixed;
    inset: auto 0 0 0;
    height: 80vh;
    background: var(--bg);
    border-top: 1px solid var(--bd);
    border-radius: 18px 18px 0 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    box-shadow: 0 -20px 60px rgba(0,0,0,0.5);
    animation: drawer-up 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes drawer-up {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  /* ───────────────────────── Toast ──────────────────────────────────────── */
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 18px;
    background: rgba(220,38,38,0.15);
    border: 1px solid rgba(220,38,38,0.40);
    color: #fca5a5;
    border-radius: 10px;
    font: 500 13px/1.3 Inter, sans-serif;
    backdrop-filter: blur(10px);
    z-index: 100;
  }

  /* ───────────────────────── Health badge + panel ───────────────────────── */
  .health-badge {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--glass);
    border: 1px solid var(--bd-2);
    cursor: pointer;
    font: 700 10px/1 Inter, sans-serif;
    letter-spacing: 0.08em;
    transition: all 140ms ease;
  }
  .health-badge:hover { background: var(--glass-hi); }
  .health-badge--ok   { color: var(--green); border-color: rgba(34,197,94,0.30); }
  .health-badge--warn { color: var(--amber); border-color: rgba(245,158,11,0.30); }
  .health-badge--err  { color: var(--red);   border-color: rgba(239,68,68,0.35); }
  .health-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
  }
  .health-badge--warn .health-dot,
  .health-badge--err  .health-dot {
    animation: ping-pulse 1.4s ease-in-out infinite;
  }
  .health-label { letter-spacing: 0.1em; }

  .health-panel {
    padding: 14px 22px;
    border-bottom: 1px solid var(--bd-2);
    background: rgba(10,10,15,0.85);
    backdrop-filter: blur(10px);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    animation: typing-fade-in 200ms ease-out both;
  }
  .health-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font: 500 12px/1.4 Inter, sans-serif;
  }
  .health-key { color: var(--tx-3); letter-spacing: 0.04em; }
  .health-val {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11.5px;
    color: var(--tx);
  }
  .health-val--ok   { color: var(--green); }
  .health-val--warn { color: var(--amber); }
  .health-val--err  { color: var(--red); }
  .health-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .health-btn {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    padding: 6px 12px;
    font: 600 11px/1 Inter, sans-serif;
    border-radius: 6px;
    background: rgba(86,188,236,0.12);
    color: var(--a);
    border: 1px solid var(--bd);
    transition: all 120ms ease;
  }
  .health-btn:hover { background: rgba(86,188,236,0.20); }
  .health-btn--ghost {
    background: transparent;
    color: var(--tx-3);
    border-color: var(--bd-2);
  }
  .health-btn--ghost:hover { color: var(--tx); border-color: var(--tx-3); background: var(--glass); }

  /* ───────────────────────── Reconnect banner ───────────────────────────── */
  .reconnect-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 22px;
    background: rgba(239,68,68,0.08);
    border-bottom: 1px solid rgba(239,68,68,0.25);
    color: #fca5a5;
    font: 500 12px/1.4 Inter, sans-serif;
    flex-shrink: 0;
    animation: typing-fade-in 200ms ease-out both;
  }
  .reconnect-pulse {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--red);
    box-shadow: 0 0 10px var(--red);
    animation: ping-pulse 1.2s ease-in-out infinite;
    flex-shrink: 0;
  }
  .reconnect-text { flex: 1; }
  .reconnect-btn {
    all: unset;
    cursor: pointer;
    padding: 5px 12px;
    border-radius: 6px;
    background: rgba(239,68,68,0.15);
    border: 1px solid rgba(239,68,68,0.30);
    color: #fca5a5;
    font: 600 11px/1 Inter, sans-serif;
    transition: all 120ms ease;
  }
  .reconnect-btn:hover { background: rgba(239,68,68,0.25); color: #fff; }

  /* ───────────────────────── Grouped messages + failed state ────────────── */
  .msg--grouped { margin-top: -6px; }
  .msg-av--spacer { background: transparent !important; box-shadow: none !important; }
  .msg--failed .msg-text {
    border-color: rgba(239,68,68,0.40);
    background: rgba(239,68,68,0.06);
  }
  .failed-tag {
    font: 600 9.5px/1 Inter, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--red);
    background: rgba(239,68,68,0.10);
    border: 1px solid rgba(239,68,68,0.30);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .msg-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    font: 400 11px/1.3 Inter, sans-serif;
  }
  .msg--own .msg-actions { justify-content: flex-end; }
  .msg-error {
    color: var(--red);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 240px;
  }
  .msg-retry, .msg-discard {
    all: unset;
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 5px;
    font: 600 11px/1 Inter, sans-serif;
    border: 1px solid var(--bd);
    background: rgba(86,188,236,0.10);
    color: var(--a);
    transition: all 120ms ease;
  }
  .msg-retry:hover { background: rgba(86,188,236,0.20); }
  .msg-discard {
    background: transparent;
    color: var(--tx-3);
    border-color: var(--bd-2);
  }
  .msg-discard:hover { color: var(--tx); border-color: var(--tx-3); background: var(--glass); }

  /* ─────────── Hover actions (edit / delete / react) ─────────── */
  .msg-text-wrap { position: relative; display: inline-block; max-width: 100%; }
  .msg-actions-hover {
    position: absolute;
    top: -14px;
    right: 0;
    display: flex;
    gap: 4px;
    padding: 4px;
    background: rgba(13, 14, 21, 0.92);
    border: 1px solid var(--bd);
    border-radius: 8px;
    backdrop-filter: blur(10px);
    box-shadow: 0 6px 18px rgba(0,0,0,0.45);
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease, transform 140ms ease;
    transform: translateY(2px);
    z-index: 5;
  }
  .msg-actions-hover--left { right: auto; left: 0; }
  .msg--has-actions:hover .msg-actions-hover,
  .msg--has-actions:focus-within .msg-actions-hover {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
  .hover-btn {
    all: unset;
    cursor: pointer;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    color: var(--tx-2);
    transition: background 120ms ease, color 120ms ease;
  }
  .hover-btn:hover { background: rgba(86,188,236,0.15); color: var(--a); }
  .hover-btn--danger:hover { background: rgba(239,68,68,0.18); color: #fca5a5; }

  .react-picker {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    display: flex;
    gap: 2px;
    padding: 6px;
    background: rgba(13, 14, 21, 0.96);
    border: 1px solid var(--bd);
    border-radius: 12px;
    box-shadow: 0 12px 28px rgba(0,0,0,0.5), 0 0 0 1px rgba(86,188,236,0.12);
    backdrop-filter: blur(12px);
    z-index: 10;
    animation: react-picker-in 160ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .react-picker--own { right: 0; left: auto; }
  .react-picker:not(.react-picker--own) { left: 0; right: auto; }
  @keyframes react-picker-in {
    from { opacity: 0; transform: translateY(-4px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .react-pick-btn {
    all: unset;
    cursor: pointer;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    font-size: 18px;
    line-height: 1;
    transition: background 100ms ease, transform 100ms ease;
  }
  .react-pick-btn:hover { background: rgba(86,188,236,0.12); transform: scale(1.18); }

  /* ─────────── Reaction pills under message ─────────── */
  .reaction-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .msg--own .reaction-pills { justify-content: flex-end; }
  .reaction-pill {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px 2px 6px;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--bd-2);
    border-radius: 999px;
    font: 500 11px/1 Inter, sans-serif;
    color: var(--tx-2);
    transition: background 120ms ease, border-color 120ms ease;
  }
  .reaction-pill:hover { background: rgba(86,188,236,0.1); border-color: var(--bd); }
  .reaction-pill--mine {
    background: rgba(86,188,236,0.16);
    border-color: rgba(86,188,236,0.45);
    color: var(--tx);
  }
  .reaction-emo { font-size: 13px; line-height: 1; }
  .reaction-cnt { font-variant-numeric: tabular-nums; font-weight: 600; }

  /* ─────────── Edited tag + deleted tombstone ─────────── */
  .msg-edited {
    display: inline-block;
    margin-top: 3px;
    font: 400 10px/1 Inter, sans-serif;
    color: var(--tx-3);
    font-style: italic;
  }
  .msg--own .msg-edited { align-self: flex-end; }
  .msg-text--deleted {
    background: rgba(255,255,255,0.02) !important;
    border-style: dashed !important;
    color: var(--tx-3) !important;
    font-style: italic;
  }

  /* ─────────── Inline editor ─────────── */
  .msg-edit {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: min(560px, 100%);
  }
  .msg-edit-input {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    padding: 8px 12px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--a);
    border-radius: 8px;
    font: 400 14px/1.5 Inter, system-ui, sans-serif;
    color: var(--tx);
    box-shadow: 0 0 18px rgba(86,188,236,0.18);
    min-height: 36px;
    resize: vertical;
    max-height: 160px;
  }
  .msg-edit-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .msg-edit-btn {
    all: unset;
    cursor: pointer;
    padding: 5px 12px;
    border-radius: 6px;
    font: 600 11.5px/1 Inter, sans-serif;
    transition: filter 120ms ease;
  }
  .msg-edit-save {
    background: linear-gradient(135deg, var(--a), var(--a-2));
    color: #000;
    box-shadow: 0 0 14px rgba(86,188,236,0.25);
  }
  .msg-edit-save:hover { filter: brightness(1.1); }
  .msg-edit-cancel {
    color: var(--tx-3);
    border: 1px solid var(--bd-2);
  }
  .msg-edit-cancel:hover { color: var(--tx); border-color: var(--tx-3); }
  .msg-edit-hint { font: 400 10.5px/1 Inter, sans-serif; color: var(--tx-4); margin-left: auto; }

  /* ─────────── Live typing strip (other users) ─────────── */
  .typing-strip {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 22px 8px;
    font: 500 12px/1.4 Inter, sans-serif;
    color: var(--tx-3);
    background: linear-gradient(to bottom, transparent, rgba(86,188,236,0.04));
    border-top: 1px solid var(--bd-2);
    flex-shrink: 0;
    animation: typing-fade-in 200ms ease-out both;
  }
  .typing-strip-dots {
    display: inline-flex;
    gap: 3px;
    align-items: center;
  }
  .typing-strip-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--a);
    box-shadow: 0 0 6px rgba(86,188,236,0.5);
    animation: nex-dot 1.2s ease-in-out infinite both;
  }
  .typing-strip-dot:nth-child(1) { animation-delay: 0ms; }
  .typing-strip-dot:nth-child(2) { animation-delay: 150ms; }
  .typing-strip-dot:nth-child(3) { animation-delay: 300ms; }
  .typing-strip-text { font-style: italic; }

  /* ───────────────────────── Responsive ─────────────────────────────────── */
  @media (max-width: 1100px) {
    .nexogram--ctx-open { grid-template-columns: 260px 1fr; }
    .context { display: none; }
    .head-btn--mobile-ctx { display: inline-flex; }
    .head-btn:not(.head-btn--mobile-ctx) .head-btn-label { display: none; }
  }

  @media (max-width: 768px) {
    /* Make the whole app feel native on phones */
    .nexogram {
      grid-template-columns: 1fr !important;
      height: 100vh;
      height: 100dvh;
    }
    .sidebar {
      position: fixed;
      inset: 0 auto 0 0;
      width: 280px;
      max-width: 85vw;
      transform: translateX(-100%);
      transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 50;
      box-shadow: 12px 0 40px rgba(0,0,0,0.5);
      /* Account for status bar / notch */
      padding-top: env(safe-area-inset-top);
    }
    .sidebar--open { transform: translateX(0); }
    .backdrop { display: block; }
    .ham { display: grid; place-items: center; min-width: 40px; min-height: 40px; }

    .quick-prompts { padding: 8px 12px; gap: 6px; overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; }
    .quick-prompts::-webkit-scrollbar { display: none; }
    .quick-prompts .qp { font-size: 11px; padding: 6px 10px; flex-shrink: 0; }

    .ch-head {
      padding: 10px 12px;
      padding-top: calc(10px + env(safe-area-inset-top));
    }
    .thread {
      padding: 12px 10px 6px;
      gap: 8px;
    }
    .composer {
      padding: 10px 10px 14px;
      padding-bottom: calc(14px + env(safe-area-inset-bottom));
    }
    .nex-head-avatar, .ch-hash-mark { width: 28px; height: 28px; font-size: 12px; }
    .ch-title { font-size: 14px; }
    .ch-sub { font-size: 11px; }

    /* Collapse health badge to dot-only; keep label for screen readers visible only via tap */
    .health-label { display: none; }
    .health-badge { padding: 8px; min-width: 32px; min-height: 32px; }

    .head-btn-label { display: none; }
    .head-btn { padding: 6px 8px; min-width: 36px; min-height: 36px; justify-content: center; }

    .msg-text { font-size: 14px; line-height: 1.5; padding: 8px 12px; }
    .msg-av { width: 30px; height: 30px; font-size: 11px; border-radius: 8px; }
    .msg { gap: 8px; }

    /* iMessage-style: max 75vw on mobile so own bubbles right-pin nicely */
    .msg-body { max-width: 75vw !important; }
    .msg-name { font-size: 12px; }
    .msg-time { font-size: 10px; }

    /* Make hover actions tap-friendly on touch (always semi-visible on touch focus) */
    .msg-actions-hover {
      top: auto;
      bottom: -10px;
      padding: 3px;
    }
    .msg--own .msg-actions-hover { right: 4px; }
    .msg-actions-hover--left { left: 4px; }
    .hover-btn { width: 32px; height: 32px; }

    .react-picker {
      /* Render upward on mobile so the keyboard doesn't clip the picker */
      top: auto;
      bottom: calc(100% + 6px);
      max-width: calc(100vw - 24px);
      flex-wrap: wrap;
    }
    .react-pick-btn { width: 36px; height: 36px; font-size: 20px; }

    .tool-hint { display: none; }
    .composer-tools {
      border-top: none;
      padding-top: 6px;
      margin-top: 4px;
      justify-content: flex-end;
    }
    .composer-wrap { padding: 10px 12px 8px; border-radius: 14px; }
    .composer-input { font-size: 16px; min-height: 24px; } /* 16px = no iOS auto-zoom on focus */
    .send-btn { padding: 9px 14px; min-height: 36px; }
    .model-pill { font-size: 9px; padding: 1px 5px; }
    .day-div { font-size: 10px; }

    /* Sidebar items: bigger tap targets */
    .sb-item { padding: 11px 12px; font-size: 14px; }
    .sb-item--member { padding: 10px 12px; }
    .member-av { width: 30px; height: 30px; }

    /* Typing strip + NEX processing on mobile */
    .typing-strip { padding: 4px 12px 6px; font-size: 11.5px; }
    .nex-processing { font-size: 10.5px; padding: 4px 2px 0; }
    .msg-edit-hint { display: none; }
    .reaction-pill { font-size: 12px; padding: 3px 9px 3px 7px; }
    .reaction-emo { font-size: 14px; }

    /* Auto-suggestion overlays sit above the composer keyboard on mobile */
    .ac-overlay { max-height: 200px; }
  }

  /* ─── Extra-small phones (iPhone SE 375px) ─── */
  @media (max-width: 380px) {
    .ch-head { padding: 8px 10px; }
    .thread { padding: 10px 8px 4px; }
    .composer { padding: 8px 8px 12px; padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
    .msg-body { max-width: 78vw !important; }
    .ver { display: none; }
  }

  /* ─── Touch devices: keep hover-actions discoverable ─── */
  @media (hover: none) {
    .msg-actions-hover {
      opacity: 0.85;
      pointer-events: auto;
      transform: translateY(0);
    }
    .msg--has-actions .msg-actions-hover { opacity: 0.85; }
  }

  /* ═════════════════════════════════════════════════════════════════════ */
  /* NEX File Vault — composer attach button, file card, picker modal       */
  /* ═════════════════════════════════════════════════════════════════════ */
  .attach-btn {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px; height: 30px;
    margin-right: 8px;
    border-radius: 8px;
    color: var(--tx-2);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    cursor: pointer;
    transition: background 120ms ease, color 120ms ease, transform 120ms ease;
  }
  .attach-btn:hover {
    background: rgba(86, 188, 236, 0.12);
    color: var(--a);
    transform: translateY(-1px);
  }

  /* File attachment card inside messages */
  .file-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    margin: 2px 0 6px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-left: 3px solid var(--a);
    border-radius: 10px;
    max-width: 420px;
    backdrop-filter: blur(8px);
  }
  .file-card.cat-amber  { border-left-color: #f59e0b; }
  .file-card.cat-cyan   { border-left-color: #56bcec; }
  .file-card.cat-purple { border-left-color: #7c3aed; }
  .file-card.cat-red    { border-left-color: #ef4444; }
  .file-card.cat-blue   { border-left-color: #3b82f6; }
  .file-card.cat-pink   { border-left-color: #ec4899; }
  .file-card.cat-green  { border-left-color: #10b981; }
  .file-card.cat-gray   { border-left-color: #6b7280; }
  .file-card-icon {
    font-size: 22px;
    line-height: 1;
    flex-shrink: 0;
  }
  .file-card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .file-card-name {
    font: 600 13px/1.25 Inter, sans-serif;
    color: var(--tx-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-card-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font: 500 11px/1 Inter, sans-serif;
    color: var(--tx-3);
  }
  .file-card-chip {
    background: rgba(86, 188, 236, 0.14);
    color: var(--a);
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .file-card-chip--client {
    background: rgba(124, 58, 237, 0.16);
    color: #c4b5fd;
  }
  .file-card-size { color: var(--tx-3); }
  .file-card-dl {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    font: 600 11.5px/1 Inter, sans-serif;
    color: var(--a);
    background: rgba(86, 188, 236, 0.10);
    border: 1px solid rgba(86, 188, 236, 0.30);
    border-radius: 8px;
    cursor: pointer;
    transition: background 120ms ease, transform 120ms ease;
  }
  .file-card-dl:hover {
    background: rgba(86, 188, 236, 0.20);
    transform: translateY(-1px);
  }
  .file-card-pending {
    font: 500 10.5px/1 Inter, sans-serif;
    color: var(--tx-3);
    font-style: italic;
  }

  /* File picker modal */
  .fp-overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 12, 20, 0.74);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
    animation: fp-fade-in 160ms ease;
  }
  @keyframes fp-fade-in { from { opacity: 0; } to { opacity: 1; } }
  .fp-modal {
    width: 100%;
    max-width: 560px;
    max-height: min(80vh, 720px);
    background: rgba(20, 26, 38, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 16px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(86, 188, 236, 0.12);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: fp-slide-up 200ms cubic-bezier(.2,.7,.2,1);
  }
  @keyframes fp-slide-up {
    from { opacity: 0; transform: translateY(16px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .fp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .fp-title {
    margin: 0;
    font: 700 16px/1.2 Inter, sans-serif;
    color: var(--tx-1);
  }
  .fp-close {
    all: unset;
    cursor: pointer;
    color: var(--tx-3);
    padding: 6px;
    border-radius: 6px;
    transition: color 120ms ease, background 120ms ease;
  }
  .fp-close:hover { color: var(--tx-1); background: rgba(255, 255, 255, 0.06); }
  .fp-tabs {
    display: flex;
    gap: 2px;
    padding: 10px 14px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .fp-tab {
    all: unset;
    cursor: pointer;
    padding: 8px 14px 10px;
    font: 600 12.5px/1 Inter, sans-serif;
    color: var(--tx-3);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 120ms ease, border-color 120ms ease;
  }
  .fp-tab:hover { color: var(--tx-2); }
  .fp-tab--active { color: var(--a); border-bottom-color: var(--a); }
  .fp-filters {
    display: flex;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .fp-search {
    flex: 1;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 8px 12px;
    color: var(--tx-1);
    font: 500 13px/1.2 Inter, sans-serif;
  }
  .fp-search:focus {
    outline: none;
    border-color: rgba(86, 188, 236, 0.45);
    background: rgba(86, 188, 236, 0.05);
  }
  .fp-select {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 8px 12px;
    color: var(--tx-1);
    font: 500 12.5px/1.2 Inter, sans-serif;
    cursor: pointer;
  }
  .fp-error {
    margin: 10px 14px 0;
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.10);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 8px;
    color: #fca5a5;
    font: 500 12px/1.3 Inter, sans-serif;
  }
  .fp-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px 8px 12px;
  }
  .fp-empty {
    padding: 32px 16px;
    text-align: center;
    color: var(--tx-3);
    font: 500 13px/1.4 Inter, sans-serif;
  }
  .fp-item {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: 10px;
    margin: 3px 0;
    transition: background 120ms ease, transform 120ms ease;
  }
  .fp-item:hover {
    background: rgba(86, 188, 236, 0.08);
    transform: translateX(2px);
  }
  .fp-item:focus-visible {
    outline: 2px solid var(--a);
    outline-offset: -2px;
  }
  .fp-item-icon {
    font-size: 22px;
    line-height: 1;
    flex-shrink: 0;
  }
  .fp-item-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .fp-item-name {
    font: 600 13px/1.25 Inter, sans-serif;
    color: var(--tx-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fp-item-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font: 500 11px/1 Inter, sans-serif;
    color: var(--tx-3);
  }
  .fp-item-size, .fp-item-date { color: var(--tx-3); }
  .fp-chip {
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: rgba(255, 255, 255, 0.06);
    color: var(--tx-2);
  }
  .fp-chip--amber  { background: rgba(245, 158, 11, 0.16); color: #fbbf24; }
  .fp-chip--cyan   { background: rgba(86, 188, 236, 0.16); color: var(--a); }
  .fp-chip--purple { background: rgba(124, 58, 237, 0.18); color: #c4b5fd; }
  .fp-chip--red    { background: rgba(239, 68, 68, 0.16);  color: #fca5a5; }
  .fp-chip--blue   { background: rgba(59, 130, 246, 0.16); color: #93c5fd; }
  .fp-chip--pink   { background: rgba(236, 72, 153, 0.16); color: #f9a8d4; }
  .fp-chip--green  { background: rgba(16, 185, 129, 0.16); color: #6ee7b7; }
  .fp-chip--gray   { background: rgba(107, 114, 128, 0.18); color: var(--tx-2); }
  .fp-chip--client { background: rgba(124, 58, 237, 0.16); color: #c4b5fd; }

  /* Upload tab */
  .fp-upload {
    padding: 16px 14px 20px;
  }
  .fp-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 40px 20px;
    border-radius: 12px;
    border: 2px dashed rgba(86, 188, 236, 0.25);
    background: rgba(86, 188, 236, 0.04);
    color: var(--tx-2);
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
    text-align: center;
  }
  .fp-drop:hover {
    background: rgba(86, 188, 236, 0.08);
    border-color: rgba(86, 188, 236, 0.45);
  }
  .fp-drop--busy { cursor: progress; opacity: 0.7; }
  .fp-drop-icon { color: var(--a); }
  .fp-drop-text { font: 600 14px/1.2 Inter, sans-serif; color: var(--tx-1); }
  .fp-drop-hint { font: 500 11.5px/1.4 Inter, sans-serif; color: var(--tx-3); }

  @media (max-width: 640px) {
    .fp-overlay { padding: 0; align-items: flex-end; }
    .fp-modal {
      max-width: none;
      width: 100%;
      max-height: 86vh;
      border-radius: 16px 16px 0 0;
    }
    .file-card { max-width: 100%; }
  }
</style>
