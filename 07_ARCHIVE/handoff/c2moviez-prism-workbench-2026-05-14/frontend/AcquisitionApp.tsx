import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clipboard,
  Clock3,
  ExternalLink,
  LogOut,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Target,
  UserCheck,
  XCircle
} from 'lucide-react';

type Role = 'admin' | 'operator';
type CrmStage = 'new' | 'needs_review' | 'ready' | 'sent' | 'replied' | 'qualified' | 'blocked';
type DraftType = 'linkedin_intro' | 'linkedin_followup' | 'email_cold' | 'email_followup';
type PreferredDraftType = 'linkedin_intro' | 'email_cold';
type RouteMode = 'today' | 'leads' | 'admin-sources';
type InspectorTab = 'dossier' | 'draft' | 'activity' | 'compliance' | 'notes';
type SourceConfidenceLevel = 'high' | 'medium' | 'low';
type DraftFlag = 'unrelated_claim' | 'generic_language' | 'fake_familiarity' | 'ai_spam_tone' | 'inflated_promise' | 'diagnosis_heavy';
type SendChannel = 'linkedin' | 'email';
type ReplyType = 'interested' | 'not_now' | 'opt_out' | 'other';

type SourceConfidence = {
  score: number;
  level: SourceConfidenceLevel;
  signals: string[];
};

type SourcePipeline = {
  confidence: SourceConfidence;
  batch_id: string | null;
  public_email_basis: boolean;
  wrong_lead_risk: boolean;
};

type User = {
  id: string;
  email: string;
  role: Role;
};

type Lead = {
  id: string;
  company: {
    name: string;
    country: 'CH' | 'AT';
    canton_or_bezirk: string;
    postal_code: string;
    city: string;
    uid_or_fn: string;
    legal_form: string;
    date_of_entry: string;
    employee_count: number;
    industry: string;
    website: string;
    linkedin_url: string;
  };
  contact: {
    name: string;
    title: string;
    email: string | null;
    linkedin_url: string;
  };
  scoring: {
    english_score: number;
    size_score: number;
    industry_fit_score: number;
    recency_score: number;
    evidence_score?: number;
    personalization_score?: number;
    total_score: number;
  };
  evidence: Array<{
    kind: string;
    label: string;
    detail: string;
    url?: string;
    captured_at?: string;
  }>;
  compliance: {
    source: string;
    source_url: string;
    source_timestamp: string;
    legal_basis: string;
    email_allowed: boolean;
    email_block_reason: string | null;
    legal_review_required: boolean;
    compliance_badge: 'ok' | 'review' | 'blocked';
    guardrail_notes: string[];
  };
  source_pipeline: SourcePipeline;
  channel: 'linkedin' | 'email' | 'both' | 'blocked';
  status: string;
  crm_stage: CrmStage;
  outreach_drafts: Record<DraftType, string | null>;
  draft_versions?: Array<{
    id: string;
    draft_type: DraftType;
    text: string;
    source: 'generated' | 'fanny_edit';
    created_at: string;
  }>;
  draft_specificity: {
    valid: boolean;
    proof_chips: string[];
    missing: string[];
    warnings?: string[];
    readiness?: 'ready_to_rework' | 'draft_review' | 'needs_research' | 'needs_rework' | 'blocked';
    evaluation_flags?: DraftFlag[];
    profile?: {
      observed_signal: string;
      why_it_might_matter: string;
      opening_angle: string;
      source_urls: string[];
      do_not_claim: string[];
      confidence: 'low' | 'medium' | 'high';
    };
  };
  dedupe: {
    is_duplicate: boolean;
    duplicate_of: string | null;
    matched_on: string;
  };
  notes: string;
  fanny_notes: string;
  next_follow_up_at: string | null;
  last_touch_at: string | null;
  updated_at: string;
  created_at: string;
  reply_text: string | null;
};

type Activity = {
  id: string;
  type: string;
  detail: string;
  created_at: string;
};

type Dashboard = {
  total_leads: number;
  weekly_quota: { target: number; pushed: number; remaining: number };
  market_split: Record<string, number>;
  score_distribution: Record<string, number>;
  compliance_warnings: Array<{ lead_id: string; company: string; message: string }>;
  webhook_health: { configured: boolean; last_status: string | null; last_pushed_at: string | null };
  view_counts?: Record<string, number>;
};

type TodayMissionLead = Lead & {
  send_blockers: string[];
  preferred_draft_type: PreferredDraftType;
  draft_excerpt: string;
  due_state: 'none' | 'due_today' | 'overdue';
  quality_label?: string;
  quality_blockers?: string[];
  source_confidence?: 'low' | 'medium' | 'high';
  evidence_confidence?: 'low' | 'medium' | 'high';
};

type TodayMission = {
  generated_at: string;
  weekly: Dashboard['weekly_quota'];
  counts: {
    review_ready?: number;
    sendable: number;
    follow_ups_due: number;
    needs_research: number;
    review_needed: number;
    blocked: number;
    overdue: number;
  };
  review_ready?: TodayMissionLead[];
  sendable: TodayMissionLead[];
  follow_ups_due: TodayMissionLead[];
  needs_research?: TodayMissionLead[];
};

type ApiError = Error & {
  status?: number;
  payload?: unknown;
};

type IntakeType = 'zefix-bulk' | 'austria-directory';

type IntakeResult = {
  created: number;
  skipped: number;
  errors: string[];
};

type LiveFeedResult = {
  ok?: boolean;
  mode?: 'dry_run';
  counts?: { ch: number; at: number };
  zefix?: IntakeResult & { lead_ids?: string[] };
  austria?: { created: number; leads: Array<{ id?: string; company?: string; score?: number; channel?: string }> };
  skipped_existing?: { ch: number; at: number };
  dashboard?: Dashboard;
};

type SourceStatus = 'configured' | 'missing_credentials' | 'available_discovery_only' | 'requires_provider_access';

type AcquisitionSource = {
  key: 'zefix' | 'firmafind' | 'wirtschaftscompass';
  label: string;
  market: 'CH' | 'AT';
  status: SourceStatus;
  api_base_url: string;
  api_docs_url: string;
  ingest_endpoint: string | null;
  required_env: string[];
  configured_env: string[];
  notes: string[];
};

type SourceConfig = {
  generated_at: string;
  sources: AcquisitionSource[];
};

const SAVED_VIEWS = [
  { key: 'ready', label: 'Ready' },
  { key: 'needs_review', label: 'Needs Review' },
  { key: 'email_eligible', label: 'Email Eligible' },
  { key: 'linkedin_first', label: 'LinkedIn First' },
  { key: 'sent', label: 'Sent' },
  { key: 'replied', label: 'Replied' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'blocked', label: 'Blocked' }
] as const;

const DRAFT_LABELS: Record<DraftType, string> = {
  linkedin_intro: 'LinkedIn intro',
  linkedin_followup: 'LinkedIn follow-up',
  email_cold: 'Cold email',
  email_followup: 'Email follow-up'
};

const INTAKE_ENDPOINTS: Record<IntakeType, string> = {
  'zefix-bulk': '/acquisition/api/admin/ingest/zefix-bulk',
  'austria-directory': '/acquisition/api/admin/ingest/austria-directory'
};

const emptyIntakeJson = '[]';

const INTAKE_PLACEHOLDERS: Record<IntakeType, string> = {
  'zefix-bulk': `[
  {
    "name": "",
    "uid": "",
    "status": "ACTIVE",
    "legal_form": "GmbH",
    "canton": "",
    "city": "",
    "postal_code": "",
    "date_of_entry": "",
    "employee_count": 0,
    "industry": "",
    "website": "",
    "linkedin_url": "",
    "contact_name": "",
    "contact_title": "",
    "contact_email": "",
    "contact_linkedin_url": "",
    "source_url": "",
    "purpose": ""
  }
]`,
  'austria-directory': `[
  {
    "source": "wko",
    "name": "",
    "fn": "",
    "bezirk": "1220",
    "postal_code": "1220",
    "city": "Wien",
    "legal_form": "GmbH",
    "date_of_entry": "",
    "employee_count": 0,
    "industry": "",
    "website": "",
    "linkedin_url": "",
    "contact_name": "",
    "contact_title": "",
    "contact_email": "",
    "contact_linkedin_url": "",
    "source_url": "",
    "published_b2b_email": true,
    "evidence_detail": ""
  }
]`
};

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let payload: unknown = null;
    try {
      payload = await response.json();
      message = (payload as { error?: string }).error || message;
    } catch {
      // keep HTTP status message
    }
    const error = new Error(message) as ApiError;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return response.json() as Promise<T>;
}

function scoreClass(score: number) {
  if (score >= 90) return 'score-high';
  if (score >= 60) return 'score-good';
  return 'score-low';
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit', year: 'numeric' }).format(date);
}

export function AcquisitionApp() {
  const [user, setUser] = useState<User | null>(null);
  const [routeMode, setRouteMode] = useState<RouteMode>(() => {
    if (window.location.pathname.includes('/admin/sources')) return 'admin-sources';
    if (window.location.pathname.includes('/leads')) return 'leads';
    return 'today';
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [mission, setMission] = useState<TodayMission | null>(null);
  const [missionLoading, setMissionLoading] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [view, setView] = useState<(typeof SAVED_VIEWS)[number]['key']>('ready');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('score_desc');
  const [draftType, setDraftType] = useState<DraftType>('linkedin_intro');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('dossier');
  const [draftText, setDraftText] = useState('');
  const [fannyNotes, setFannyNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [replyText, setReplyText] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sendModalLead, setSendModalLead] = useState<TodayMissionLead | null>(null);
  const [sendModalDraftType, setSendModalDraftType] = useState<PreferredDraftType>('linkedin_intro');
  const [sendModalChannel, setSendModalChannel] = useState<SendChannel | ''>('');
  const [sendModalFollowUp, setSendModalFollowUp] = useState('');
  const [sendModalError, setSendModalError] = useState('');
  const [sendModalBusy, setSendModalBusy] = useState(false);
  const [nextLeadMessage, setNextLeadMessage] = useState('');
  const [postSendLeadId, setPostSendLeadId] = useState<string | null>(null);
  const [replyModalLead, setReplyModalLead] = useState<Lead | null>(null);
  const [replyType, setReplyType] = useState<ReplyType>('other');
  const [replyNote, setReplyNote] = useState('');
  const [replyModalError, setReplyModalError] = useState('');
  const [replyModalBusy, setReplyModalBusy] = useState(false);

  const activeLead = selectedLead || leads.find((lead) => lead.id === selectedId) || leads[0] || null;
  const sendBlockReason = useMemo(() => {
    if (!activeLead) return 'No lead selected';
    if (activeLead.compliance.compliance_badge !== 'ok') return 'Compliance not cleared';
    if (activeLead.channel === 'blocked') return 'Channel blocked';
    if (activeLead.dedupe.is_duplicate) return 'Duplicate candidate';
    if (!activeLead.draft_specificity.valid || activeLead.draft_specificity.readiness !== 'ready_to_rework') return 'Draft not ready';
    if (!activeLead.outreach_drafts.linkedin_intro && !activeLead.outreach_drafts.email_cold) return 'Draft missing';
    return '';
  }, [activeLead]);
  const canMarkActiveLeadSent = !sendBlockReason;

  const loadDashboard = useCallback(async () => {
    const payload = await api<{ dashboard: Dashboard }>('/acquisition/api/dashboard');
    setDashboard(payload.dashboard);
  }, []);

  const loadTodayMission = useCallback(async () => {
    setMissionLoading(true);
    try {
      const payload = await api<{ mission: TodayMission }>('/acquisition/api/today-mission');
      setMission(payload.mission);
    } finally {
      setMissionLoading(false);
    }
  }, []);

  const loadLeads = useCallback(async () => {
    const params = new URLSearchParams({ view, sort });
    if (query.trim()) params.set('q', query.trim());
    const payload = await api<{ leads: Lead[] }>(`/acquisition/api/leads?${params.toString()}`);
    setLeads(payload.leads);
    setSelectedId((current) => current && payload.leads.some((lead) => lead.id === current) ? current : payload.leads[0]?.id || null);
  }, [query, sort, view]);

  const loadLeadDetail = useCallback(async (id: string) => {
    const payload = await api<{ lead: Lead; activity: Activity[] }>(`/acquisition/api/leads/${id}`);
    setSelectedLead(payload.lead);
    setActivity(payload.activity);
    setDraftText(payload.lead.outreach_drafts[draftType] || '');
    setFannyNotes(payload.lead.fanny_notes || '');
    setFollowUp(payload.lead.next_follow_up_at ? payload.lead.next_follow_up_at.slice(0, 10) : '');
    setReplyText(payload.lead.reply_text || '');
  }, [draftType]);

  useEffect(() => {
    api<{ user: User }>('/acquisition/api/auth/me')
      .then((payload) => setUser(payload.user))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (window.location.pathname === '/acquisition' || window.location.pathname === '/acquisition/') {
      window.history.replaceState(null, '', '/acquisition/today');
      setRouteMode('today');
    }
    void Promise.all([loadDashboard(), loadLeads(), loadTodayMission()]).catch((err) => setError(err.message));
  }, [loadDashboard, loadLeads, loadTodayMission, user]);

  useEffect(() => {
    if (!selectedId || !user) {
      setSelectedLead(null);
      setActivity([]);
      return;
    }
    void loadLeadDetail(selectedId).catch((err) => setError(err.message));
  }, [loadLeadDetail, selectedId, user]);

  useEffect(() => {
    if (!activeLead) return;
    setDraftText(activeLead.outreach_drafts[draftType] || '');
  }, [activeLead, draftType]);

  const selectedIndex = useMemo(() => leads.findIndex((lead) => lead.id === selectedId), [leads, selectedId]);
  const reviewReady = mission?.review_ready || mission?.sendable || [];
  const todayCount = reviewReady.length + (mission?.follow_ups_due?.length || 0) + (mission?.needs_research?.length || 0);

  const navigateMode = (mode: RouteMode) => {
    setRouteMode(mode);
    const path = mode === 'today'
      ? '/acquisition/today'
      : mode === 'admin-sources'
        ? '/acquisition/admin/sources'
        : '/acquisition/leads';
    window.history.replaceState(null, '', path);
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError('');
    try {
      const payload = await api<{ user: User }>('/acquisition/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      setUser(payload.user);
      navigateMode('today');
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    }
  };

  const logout = async () => {
    await api('/acquisition/api/auth/logout', { method: 'POST' }).catch(() => null);
    setUser(null);
    setLeads([]);
    setMission(null);
    setSelectedLead(null);
    window.history.replaceState(null, '', '/acquisition/login');
  };

  const patchLead = async (id: string, patch: Record<string, unknown>, success: string) => {
    setError('');
    const payload = await api<{ lead: Lead }>(`/acquisition/api/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
    setNotice(success);
    setSelectedLead(payload.lead);
    await Promise.all([loadLeads(), loadDashboard(), loadTodayMission(), loadLeadDetail(id)]);
  };

  const saveDraft = async () => {
    if (!activeLead) return;
    await patchLead(activeLead.id, { outreach_drafts: { [draftType]: draftText } }, 'Draft saved');
  };

  const saveNotes = async () => {
    if (!activeLead) return;
    await patchLead(activeLead.id, {
      fanny_notes: fannyNotes,
      next_follow_up_at: followUp || null
    }, 'Notes saved');
  };

  const regenerateDraft = async () => {
    if (!activeLead) return;
    setError('');
    const payload = await api<{ lead: Lead }>(`/acquisition/api/leads/${activeLead.id}/regenerate-draft`, {
      method: 'POST'
    });
    setNotice('Profile regenerated');
    setSelectedLead(payload.lead);
    setDraftText(payload.lead.outreach_drafts[draftType] || '');
    await Promise.all([loadLeads(), loadDashboard(), loadTodayMission(), loadLeadDetail(activeLead.id)]);
  };

  const copyDraft = async () => {
    if (sendBlockReason) {
      setError(sendBlockReason);
      return;
    }
    openActiveLeadSendModal();
  };

  const copyMissionDraft = async (lead: TodayMissionLead, type: PreferredDraftType) => {
    const payload = await api<{ draft_type: DraftType; subject?: string; body: string; text: string }>(`/acquisition/api/leads/${lead.id}/copy-draft`, {
      method: 'POST',
      body: JSON.stringify({ draft_type: type })
    });
    await navigator.clipboard?.writeText(payload.text).catch(() => null);
    return payload;
  };

  const openSendModal = (lead: TodayMissionLead) => {
    setSelectedId(lead.id);
    setSendModalLead(lead);
    setSendModalDraftType(lead.preferred_draft_type);
    setSendModalChannel('');
    setSendModalFollowUp(lead.next_follow_up_at?.slice(0, 10) || '');
    setSendModalError('');
  };

  const openActiveLeadSendModal = () => {
    if (!activeLead) return;
    const preferred_draft_type: PreferredDraftType = activeLead.outreach_drafts.linkedin_intro ? 'linkedin_intro' : 'email_cold';
    setSendModalLead({
      ...activeLead,
      send_blockers: [],
      preferred_draft_type,
      draft_excerpt: activeLead.outreach_drafts[preferred_draft_type] || '',
      due_state: 'none'
    });
    setSendModalDraftType(preferred_draft_type);
    setSendModalChannel('');
    setSendModalFollowUp(activeLead.next_follow_up_at?.slice(0, 10) || '');
    setSendModalError('');
  };

  const copyAndMarkSent = async () => {
    if (!sendModalLead) return;
    if (!sendModalChannel) {
      setSendModalError('channel required');
      return;
    }
    setSendModalBusy(true);
    setSendModalError('');
    try {
      await copyMissionDraft(sendModalLead, sendModalDraftType);
      const payload = await api<{ lead: Lead }>(`/acquisition/api/leads/${sendModalLead.id}/mark-sent`, {
        method: 'POST',
        body: JSON.stringify({
          channel: sendModalChannel,
          follow_up_date: sendModalFollowUp || null
        })
      });
      setNotice('Draft copied and marked sent');
      setSelectedLead(payload.lead);
      await Promise.all([loadLeads(), loadDashboard(), loadTodayMission(), loadLeadDetail(sendModalLead.id)]);
      setPostSendLeadId(sendModalLead.id);
      setSendModalLead(null);
    } catch (err: any) {
      const message = err?.message || 'Send check failed';
      if (err?.status === 409 || message === 'COMPLIANCE_SEND_BLOCKED') {
        setSendModalError('COMPLIANCE_SEND_BLOCKED');
        await loadTodayMission().catch(() => null);
      } else {
        setSendModalError(message);
      }
    } finally {
      setSendModalBusy(false);
    }
  };

  const markSent = async () => {
    if (!activeLead || sendBlockReason) return;
    openActiveLeadSendModal();
  };

  const openReplyModal = () => {
    if (!activeLead) return;
    setReplyModalLead(activeLead);
    setReplyType('other');
    setReplyNote(activeLead.reply_text || '');
    setReplyModalError('');
  };

  const submitReply = async () => {
    if (!replyModalLead) return;
    setReplyModalBusy(true);
    setReplyModalError('');
    try {
      const payload = await api<{ suppressed: boolean; lead_id: string; lead?: Lead }>(`/acquisition/api/leads/${replyModalLead.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ reply_type: replyType, note: replyNote })
      });
      setNotice(payload.suppressed ? 'Contact suppressed. Lead disqualified.' : 'Reply logged.');
      setReplyModalLead(null);
      await Promise.all([loadLeads(), loadDashboard(), loadTodayMission(), loadLeadDetail(replyModalLead.id)]);
    } catch (err: any) {
      setReplyModalError(err?.message || 'Reply logging failed');
    } finally {
      setReplyModalBusy(false);
    }
  };

  const recordReply = async () => {
    if (!activeLead) return;
    await api<{ suppressed: boolean; lead_id: string }>(`/acquisition/api/leads/${activeLead.id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply_type: 'other', note: replyText.trim() })
    });
    setNotice('Reply recorded');
    await Promise.all([loadLeads(), loadDashboard(), loadTodayMission(), loadLeadDetail(activeLead.id)]);
  };

  const qualifyLead = async () => {
    if (!activeLead) return;
    await patchLead(activeLead.id, { crm_stage: 'qualified' }, 'Lead qualified');
  };

  const blockLead = async () => {
    if (!activeLead) return;
    await patchLead(activeLead.id, { crm_stage: 'blocked' }, 'Lead blocked');
  };

  const adminDryRunPush = async () => {
    const payload = await api<{ result: { requested: number; pushed: number } }>('/acquisition/api/admin/push', {
      method: 'POST',
      body: JSON.stringify({ dryRun: true, limit: 20 })
    });
    setNotice(`Dry run checked ${payload.result.requested} leads`);
  };

  const submitIntake = async (type: IntakeType, records: unknown[]): Promise<IntakeResult> => {
    const payload = await api<{ result: IntakeResult }>(INTAKE_ENDPOINTS[type], {
      method: 'POST',
      body: JSON.stringify({ records })
    });
    await Promise.all([loadDashboard(), loadLeads(), loadTodayMission()]);
    setNotice(`Import created ${payload.result.created}, skipped ${payload.result.skipped}`);
    return payload.result;
  };

  const runLiveFeed = async (): Promise<LiveFeedResult> => {
    const payload = await api<{ result: LiveFeedResult }>('/acquisition/api/admin/live-feed', {
      method: 'POST',
      body: JSON.stringify({ apply: true, ch_limit: 40, at_limit: 9 })
    });
    await Promise.all([loadDashboard(), loadLeads(), loadTodayMission()]);
    const created = (payload.result.zefix?.created || 0) + (payload.result.austria?.created || 0);
    const skippedExisting = (payload.result.skipped_existing?.ch || 0) + (payload.result.skipped_existing?.at || 0);
    setNotice(`Live feed imported ${created}; existing skipped ${skippedExisting}`);
    return payload.result;
  };

  const clearFollowUp = async (lead: TodayMissionLead) => {
    setSelectedId(lead.id);
    const payload = await api<{ lead: Lead }>(`/acquisition/api/leads/${lead.id}/follow-up`, {
      method: 'POST',
      body: JSON.stringify({ next_follow_up_at: null })
    });
    setSelectedLead(payload.lead);
    setNotice('Follow-up done');
    await Promise.all([loadLeads(), loadDashboard(), loadTodayMission(), loadLeadDetail(lead.id)]);
  };

  const openNextLead = async () => {
    setNextLeadMessage('');
    const payload = await api<{ lead_id: string | null; score?: number }>('/acquisition/api/next-lead');
    if (!payload.lead_id) {
      setNextLeadMessage('No sendable leads available');
      return;
    }
    setSelectedId(payload.lead_id);
    setInspectorTab('dossier');
    await loadLeadDetail(payload.lead_id);
  };

  const postSendOpenNextLead = async () => {
    setPostSendLeadId(null);
    await openNextLead();
  };

  const postSendAddNote = () => {
    setInspectorTab('notes');
  };

  const onTableKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!leads.length) return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const nextIndex = event.key === 'ArrowDown'
      ? Math.min(leads.length - 1, Math.max(0, selectedIndex) + 1)
      : Math.max(0, selectedIndex - 1);
    setSelectedId(leads[nextIndex]?.id || null);
  };

  const openNextReviewReady = () => {
    const next = reviewReady.find((lead) => lead.id !== sendModalLead?.id);
    setSendModalLead(null);
    if (next) setSelectedId(next.id);
  };

  if (authLoading) {
    return <div className="acq-loading">Loading PRISM Workbench</div>;
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-panel" aria-label="c2moviez PRISM Workbench login">
          <div className="brand-mark">c2moviez</div>
          <h1>PRISM Workbench</h1>
          <p>Secure operator access for lead review, manual outreach, and reply tracking.</p>
          <form onSubmit={handleLogin}>
            <label>
              Email
              <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} type="password" autoComplete="current-password" required />
            </label>
            {loginError ? <div className="form-error">{loginError}</div> : null}
            <button className="primary-action" type="submit">Sign in</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="acq-shell">
      <header className="acq-header">
        <div>
          <div className="brand-mark">c2moviez</div>
          <h1>PRISM Workbench</h1>
        </div>
        <div className="header-metrics" aria-label="weekly acquisition metrics">
          <Metric label="Sent this week" value={`${dashboard?.weekly_quota.pushed || 0}/${dashboard?.weekly_quota.target || 20}`} />
          <Metric label="Overdue" value={String(mission?.counts.overdue || 0)} tone={mission?.counts.overdue ? 'warn' : 'ok'} />
          <Metric label="Blocked" value={String(mission?.counts.blocked || 0)} tone={mission?.counts.blocked ? 'warn' : 'ok'} />
        </div>
        <div className="account-tools">
          <span>{user.email}</span>
          <span className="role-pill">{user.role}</span>
          <button className="icon-button" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </header>

      <div className={routeMode === 'admin-sources' ? 'acq-layout admin-sources-layout' : 'acq-layout'}>
        <aside className="saved-views" aria-label="Saved views">
          <div className="pane-title">Views</div>
          <button
            className={routeMode === 'today' ? 'view-button active' : 'view-button'}
            onClick={() => navigateMode('today')}
          >
            <span>Today</span>
            <strong>{todayCount}</strong>
          </button>
          {SAVED_VIEWS.map((item) => (
            <button
              key={item.key}
              className={routeMode === 'leads' && view === item.key ? 'view-button active' : 'view-button'}
              onClick={() => {
                setView(item.key);
                navigateMode('leads');
              }}
            >
              <span>{item.label}</span>
              <strong>{dashboard?.view_counts?.[item.key] || 0}</strong>
            </button>
          ))}
          {user.role === 'admin' ? (
            <section className="admin-panel">
              <div className="pane-title">Admin</div>
              <button
                className={routeMode === 'admin-sources' ? 'view-button active' : 'view-button'}
                onClick={() => navigateMode('admin-sources')}
              >
                <span>Source Admin</span>
                <strong><ExternalLink size={14} /></strong>
              </button>
            </section>
          ) : null}
        </aside>

        <main className="lead-workspace">
          {notice ? <div className="notice">{notice}</div> : null}
          {error ? <div className="notice error"><AlertTriangle size={16} /> {error}</div> : null}

          {routeMode === 'today' ? (
            <TodayMissionView
              mission={mission}
              loading={missionLoading}
              onSelectLead={setSelectedId}
              onOpenNextLead={openNextLead}
              onClearFollowUp={clearFollowUp}
              nextLeadMessage={nextLeadMessage}
            />
          ) : routeMode === 'admin-sources' && user.role === 'admin' ? (
            <AdminSourcesView
              dashboard={dashboard}
              onSubmitIntake={submitIntake}
              onDryRunPush={adminDryRunPush}
              onRunLiveFeed={runLiveFeed}
            />
          ) : (
            <>
              <section className="table-toolbar" aria-label="Lead controls">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search company, city, contact, notes"
                  aria-label="Search leads"
                />
                <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort leads">
                  <option value="score_desc">Score high to low</option>
                  <option value="updated_desc">Recently updated</option>
                  <option value="date_asc">Oldest updated</option>
                  <option value="stage">Stage</option>
                </select>
              </section>

              <div className="lead-table-wrap" tabIndex={0} onKeyDown={onTableKeyDown}>
                <table className="lead-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Market</th>
                      <th>Contact</th>
                      <th>Channel</th>
                      <th>Score</th>
                      <th>Stage</th>
                      <th>Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr
                        key={lead.id}
                        className={lead.id === activeLead?.id ? 'selected' : ''}
                        onClick={() => setSelectedId(lead.id)}
                      >
                        <td>
                          <strong>{lead.company.name}</strong>
                          <span>{lead.company.industry || 'Industry pending'}</span>
                        </td>
                        <td>{lead.company.country} {lead.company.canton_or_bezirk || lead.company.postal_code}</td>
                        <td>
                          <strong>{lead.contact.name || 'Decision maker pending'}</strong>
                          <span>{lead.contact.title || 'Role pending'}</span>
                        </td>
                        <td><ChannelBadge channel={lead.channel} /></td>
                        <td><span className={`score-pill ${scoreClass(lead.scoring.total_score)}`}>{lead.scoring.total_score}</span></td>
                        <td><StageBadge stage={lead.crm_stage} /></td>
                        <td>{formatDate(lead.next_follow_up_at)}</td>
                      </tr>
                    ))}
                    {!leads.length ? (
                      <tr>
                        <td colSpan={7} className="empty-row">No leads in this view.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>

        {routeMode !== 'admin-sources' ? (
          <aside className="inspector" aria-label="Lead inspector">
            <LeadInspector
              activeLead={activeLead}
              activity={activity}
              inspectorTab={inspectorTab}
              onTabChange={setInspectorTab}
              draftType={draftType}
              onDraftTypeChange={setDraftType}
              draftText={draftText}
              onDraftTextChange={setDraftText}
              onSaveDraft={saveDraft}
              onCopyDraft={copyDraft}
              onRegenerateDraft={regenerateDraft}
              fannyNotes={fannyNotes}
              onFannyNotesChange={setFannyNotes}
              followUp={followUp}
              onFollowUpChange={setFollowUp}
              onSaveNotes={saveNotes}
              onMarkSent={markSent}
              canMarkSent={canMarkActiveLeadSent}
              sendBlockReason={sendBlockReason}
              onQualify={qualifyLead}
              onBlock={blockLead}
              replyText={replyText}
              onReplyTextChange={setReplyText}
              onRecordReply={recordReply}
              onOpenReplyModal={openReplyModal}
              postSendVisible={Boolean(activeLead && postSendLeadId === activeLead.id)}
              onPostSendOpenNext={postSendOpenNextLead}
              onPostSendAddNote={postSendAddNote}
              onPostSendDone={() => setPostSendLeadId(null)}
            />
          </aside>
        ) : null}
      </div>
      <SendConfirmModal
        lead={sendModalLead}
        draftType={sendModalDraftType}
        channel={sendModalChannel}
        followUp={sendModalFollowUp}
        error={sendModalError}
        busy={sendModalBusy}
        onDraftTypeChange={setSendModalDraftType}
        onChannelChange={setSendModalChannel}
        onFollowUpChange={setSendModalFollowUp}
        onCancel={() => setSendModalLead(null)}
        onConfirm={copyAndMarkSent}
      />
      <ReplyModal
        lead={replyModalLead}
        replyType={replyType}
        note={replyNote}
        error={replyModalError}
        busy={replyModalBusy}
        onReplyTypeChange={setReplyType}
        onNoteChange={setReplyNote}
        onCancel={() => setReplyModalLead(null)}
        onSubmit={submitReply}
      />
    </div>
  );
}

function LeadInspector({
  activeLead,
  activity,
  inspectorTab,
  onTabChange,
  draftType,
  onDraftTypeChange,
  draftText,
  onDraftTextChange,
  onSaveDraft,
  onCopyDraft,
  onRegenerateDraft,
  fannyNotes,
  onFannyNotesChange,
  followUp,
  onFollowUpChange,
  onSaveNotes,
  onMarkSent,
  canMarkSent,
  sendBlockReason,
  onQualify,
  onBlock,
  replyText,
  onReplyTextChange,
  onRecordReply,
  onOpenReplyModal,
  postSendVisible,
  onPostSendOpenNext,
  onPostSendAddNote,
  onPostSendDone
}: {
  activeLead: Lead | null;
  activity: Activity[];
  inspectorTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  draftType: DraftType;
  onDraftTypeChange: (type: DraftType) => void;
  draftText: string;
  onDraftTextChange: (value: string) => void;
  onSaveDraft: () => Promise<void>;
  onCopyDraft: () => void;
  onRegenerateDraft: () => Promise<void>;
  fannyNotes: string;
  onFannyNotesChange: (value: string) => void;
  followUp: string;
  onFollowUpChange: (value: string) => void;
  onSaveNotes: () => Promise<void>;
  onMarkSent: () => Promise<void>;
  canMarkSent: boolean;
  sendBlockReason: string;
  onQualify: () => Promise<void>;
  onBlock: () => Promise<void>;
  replyText: string;
  onReplyTextChange: (value: string) => void;
  onRecordReply: () => Promise<void>;
  onOpenReplyModal: () => void;
  postSendVisible: boolean;
  onPostSendOpenNext: () => Promise<void>;
  onPostSendAddNote: () => void;
  onPostSendDone: () => void;
}) {
  if (!activeLead) {
    return (
      <div className="empty-inspector">
        <strong>No lead selected</strong>
        <span>Choose a review, follow-up, or research item to inspect its dossier and draft.</span>
      </div>
    );
  }

  const tabs: Array<[InspectorTab, string]> = [
    ['dossier', 'Dossier'],
    ['draft', 'Draft'],
    ['activity', 'Activity'],
    ['compliance', 'Compliance'],
    ['notes', 'Notes']
  ];
  const draftVersions = (activeLead.draft_versions || [])
    .filter((version) => version.draft_type === draftType)
    .slice()
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const draftFlags = activeLead.draft_specificity.evaluation_flags || [];

  return (
    <>
      <section className="inspector-head">
        <div>
          <h2>{activeLead.company.name}</h2>
          <p>{activeLead.company.city || activeLead.company.country} · {activeLead.company.industry || 'Industry pending'}</p>
        </div>
        <div className="inspector-head-badges">
          <button className="secondary-action compact-action" onClick={onOpenReplyModal}><MessageSquare size={14} /> Log reply</button>
          {shouldShowWrongLeadRisk(activeLead) ? <WrongLeadRiskChip /> : null}
          <span className={`score-pill ${scoreClass(activeLead.scoring.total_score)}`}>{activeLead.scoring.total_score}</span>
        </div>
      </section>

      <section className="detail-grid compact">
        <Detail label="Contact" value={activeLead.contact.name || 'Pending'} />
        <Detail label="Role" value={activeLead.contact.title || 'Pending'} />
        <Detail label="Channel" value={channelRecommendation(activeLead)} />
        <Detail label="Status" value={draftReadinessLabel(activeLead)} />
      </section>

      <nav className="inspector-tabs" aria-label="Lead inspector sections">
        {tabs.map(([tab, label]) => (
          <button key={tab} className={inspectorTab === tab ? 'active' : ''} onClick={() => onTabChange(tab)}>
            {label}
          </button>
        ))}
      </nav>

      {inspectorTab === 'dossier' ? <DossierPanel lead={activeLead} /> : null}

      {inspectorTab === 'draft' ? (
        <section className="draft-workspace">
          <div className="draft-workspace-head">
            <div className="pane-title">Draft Workspace</div>
            <span className={`readiness-chip ${readinessClass(activeLead)}`}>{draftReadinessLabel(activeLead)}</span>
          </div>
          <div className="draft-tabs">
            {(Object.keys(DRAFT_LABELS) as DraftType[]).map((type) => (
              <button key={type} className={draftType === type ? 'active' : ''} onClick={() => onDraftTypeChange(type)}>
                {DRAFT_LABELS[type]}
              </button>
            ))}
          </div>
          {activeLead.draft_specificity.readiness === 'draft_review' ? (
            <span className="readiness-chip draft_review">Draft needs review</span>
          ) : null}
          <div className="draft-quality-bar">
            <div className="subject-preview">
              <span>Subject</span>
              <strong>{draftSubject(draftText) || (draftType.startsWith('email') ? 'Subject pending' : 'LinkedIn message')}</strong>
            </div>
            <span className="draft-meter">{draftCountLabel(draftType, draftText)}</span>
            <span className={`confidence-chip ${activeLead.draft_specificity.profile?.confidence || 'low'}`}>
              {activeLead.draft_specificity.profile?.confidence || 'low'} confidence
            </span>
          </div>
          {draftFlags.length ? (
            <section className="draft-flags-section" aria-label="Draft quality flags">
              <div className="pane-title">DRAFT FLAGS</div>
              <div>
                {draftFlags.map((flag) => <span key={flag} className="draft-flag-chip">{draftFlagLabel(flag)}</span>)}
              </div>
            </section>
          ) : null}
          <button
            className="secondary-action regenerate-draft-btn"
            onClick={onRegenerateDraft}
            disabled={activeLead.source_pipeline?.confidence?.level === 'low'}
          >
            <RefreshCw size={15} /> Regenerate profile
          </button>
          <textarea value={draftText} onChange={(event) => onDraftTextChange(event.target.value)} />
          <div className="personalization-checklist">
            {personalizationChecklist(activeLead, draftText).map((item) => (
              <span key={item.label} className={item.ok ? 'ok' : 'missing'}>
                {item.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                {item.label}
              </span>
            ))}
          </div>
          <div className="proof-chips">
            {activeLead.draft_specificity.proof_chips.map((chip) => <span key={chip}>{chip}</span>)}
            {!activeLead.draft_specificity.valid ? <span className="warn-chip">Specificity missing</span> : null}
          </div>
          <div className="action-row">
            <button className="secondary-action" onClick={onSaveDraft}><CheckCircle2 size={15} /> Save</button>
            <button className="secondary-action" onClick={onCopyDraft} disabled={!canMarkSent} title={sendBlockReason || 'Copy draft'}><Clipboard size={15} /> Copy</button>
          </div>
          <div className="draft-version-list">
            <div className="pane-title">Versions</div>
            {draftVersions.slice(0, 4).map((version) => (
              <div key={version.id}>
                <strong>{version.source.replace(/_/g, ' ')}</strong>
                <span>{formatDate(version.created_at)} · {draftCountLabel(version.draft_type, version.text)}</span>
              </div>
            ))}
            {!draftVersions.length ? <p className="guardrail">No saved versions for this draft type.</p> : null}
          </div>
        </section>
      ) : null}

      {inspectorTab === 'activity' ? (
        <section className="inspector-section">
          <div className="pane-title">Activity</div>
          <div className="activity-list">
            {activity.map((item) => (
              <div key={item.id}>
                <strong>{item.type.replace(/_/g, ' ')}</strong>
                <span>{formatDate(item.created_at)} · {item.detail}</span>
              </div>
            ))}
            {!activity.length ? <p className="guardrail">No activity yet.</p> : null}
          </div>
        </section>
      ) : null}

      {inspectorTab === 'compliance' ? (
        <>
          <section className="inspector-section">
            <div className="pane-title">Score Breakdown</div>
            <ScoreGraph lead={activeLead} />
          </section>
          <section className="inspector-section">
            <div className="pane-title">Evidence</div>
            <EvidenceList lead={activeLead} />
          </section>
          <section className="inspector-section">
            <div className="pane-title">Compliance</div>
            <div className={`compliance-line ${activeLead.compliance.compliance_badge}`}>
              <ShieldCheck size={16} />
              <span>{activeLead.compliance.compliance_badge}</span>
              <span>{activeLead.compliance.legal_basis}</span>
            </div>
            {activeLead.compliance.guardrail_notes
              .filter((note) => !/1220|1160|target scope|Vienna|Swiss company records/i.test(note))
              .map((note) => <p className="guardrail compact" key={note}>{note}</p>)}
          </section>
        </>
      ) : null}

      {inspectorTab === 'notes' ? (
        <>
          <section className="inspector-section notes-section">
            <div className="pane-title">Next Action</div>
            <label>
              Fanny notes
              <textarea value={fannyNotes} onChange={(event) => onFannyNotesChange(event.target.value)} />
            </label>
            <label>
              Follow-up date
              <input type="date" value={followUp} onChange={(event) => onFollowUpChange(event.target.value)} />
            </label>
            <button className="secondary-action" onClick={onSaveNotes}><CheckCircle2 size={15} /> Save notes</button>
          </section>
          <section className="quick-actions">
            <button onClick={onMarkSent} disabled={!canMarkSent} title={sendBlockReason || 'Copy and mark sent'}><Send size={15} /> Copy & mark sent</button>
            <button onClick={onQualify}><UserCheck size={15} /> Qualify</button>
            <button onClick={onBlock}><XCircle size={15} /> Block</button>
          </section>
          {postSendVisible ? (
            <PostSendPrompt
              onOpenNext={onPostSendOpenNext}
              onAddNote={onPostSendAddNote}
              onDone={onPostSendDone}
            />
          ) : null}
          {sendBlockReason ? <p className="send-block-reason"><AlertTriangle size={14} /> {sendBlockReason}</p> : null}
          <section className="inspector-section">
            <div className="pane-title">Reply</div>
            <textarea value={replyText} onChange={(event) => onReplyTextChange(event.target.value)} placeholder="Paste manual LinkedIn or email reply" />
            <button className="secondary-action" onClick={onRecordReply}><MessageSquare size={15} /> Record reply</button>
          </section>
        </>
      ) : null}
    </>
  );
}

function TodayMissionView({
  mission,
  loading,
  onSelectLead,
  onOpenNextLead,
  onClearFollowUp,
  nextLeadMessage
}: {
  mission: TodayMission | null;
  loading: boolean;
  onSelectLead: (id: string) => void;
  onOpenNextLead: () => void;
  onClearFollowUp: (lead: TodayMissionLead) => void;
  nextLeadMessage: string;
}) {
  const weekly = mission?.weekly || { target: 20, pushed: 0, remaining: 20 };
  const reviewReady = mission?.review_ready || mission?.sendable || [];
  const followUpsDue = mission?.follow_ups_due || [];
  const needsResearch = mission?.needs_research || [];
  const hasNoMissionItems = Boolean(mission) && reviewReady.length === 0 && followUpsDue.length === 0 && needsResearch.length === 0;
  const showResearchQueue = needsResearch.length > 0 || Boolean(mission?.counts.needs_research);

  return (
    <section className="today-shell" aria-label="Today Mission">
      <div className="today-header">
        <div>
          <div className="pane-title">Today Mission</div>
          <h2>Review queue</h2>
        </div>
        <div className="today-header-actions">
          <WeeklyProgress weekly={weekly} />
          {reviewReady.length > 0 ? (
            <button className="open-next-lead-btn" onClick={onOpenNextLead}>Open next lead -&gt;</button>
          ) : null}
          {nextLeadMessage ? <span className="next-lead-message">{nextLeadMessage}</span> : null}
        </div>
      </div>

      <div className="mission-stats" aria-label="Mission blockers">
        <MissionStat label="Ready for review" value={mission?.counts.review_ready ?? reviewReady.length} tone="ok" />
        <MissionStat label="Follow-ups due" value={mission?.counts.follow_ups_due || 0} tone={mission?.counts.follow_ups_due ? 'warn' : 'neutral'} />
        <MissionStat label="Needs research" value={mission?.counts.needs_research || 0} tone="warn" />
        <MissionStat label="Review needed" value={mission?.counts.review_needed || 0} tone="warn" />
        <MissionStat label="Blocked" value={mission?.counts.blocked || 0} tone="danger" />
        <MissionStat label="Overdue" value={mission?.counts.overdue || 0} tone={mission?.counts.overdue ? 'danger' : 'neutral'} />
      </div>

      {loading ? <div className="empty-mission">Loading mission</div> : null}

      {hasNoMissionItems && !loading ? (
        <MissionEmptyState mission={mission} />
      ) : (
      <div className="mission-queues">
        <section className="mission-queue" aria-label="Ready for Review">
          <div className="mission-queue-head">
            <h3><Target size={17} /> Ready for Review</h3>
            <span>{reviewReady.length}</span>
          </div>
          <div className="mission-card-list">
            {reviewReady.map((lead) => (
              <MissionCard
                key={lead.id}
                lead={lead}
                onSelectLead={onSelectLead}
                actionLabel="Review"
                actionIcon={<Search size={15} />}
                onAction={() => onSelectLead(lead.id)}
              />
            ))}
            {mission && !reviewReady.length ? <div className="empty-mission">No review-ready leads.</div> : null}
          </div>
        </section>

        <section className="mission-queue" aria-label="Follow-ups Due">
          <div className="mission-queue-head">
            <h3><Clock3 size={17} /> Follow-ups Due</h3>
            <span>{followUpsDue.length}</span>
          </div>
          <div className="mission-card-list">
            {followUpsDue.map((lead) => (
              <MissionCard
                key={lead.id}
                lead={lead}
                onSelectLead={onSelectLead}
                actionLabel="Follow-up done"
                actionIcon={<CalendarCheck size={15} />}
                onAction={() => onClearFollowUp(lead)}
              />
            ))}
            {mission && !followUpsDue.length ? <div className="empty-mission">No due follow-ups.</div> : null}
          </div>
        </section>

        {showResearchQueue ? (
          <section className="mission-queue research-queue" aria-label="Needs Research">
            <div className="mission-queue-head">
              <h3><Search size={17} /> Needs Research</h3>
              <span>{needsResearch.length}</span>
            </div>
            <div className="mission-card-list research-card-list">
              {needsResearch.map((lead) => (
                <ResearchCard key={lead.id} lead={lead} onSelectLead={onSelectLead} />
              ))}
              {mission && !needsResearch.length ? <div className="empty-mission">No research items.</div> : null}
            </div>
          </section>
        ) : null}
      </div>
      )}
    </section>
  );
}

function MissionEmptyState({ mission }: { mission: TodayMission | null }) {
  const chips = [
    ['Needs research', mission?.counts.needs_research || 0],
    ['Review needed', mission?.counts.review_needed || 0],
    ['Blocked', mission?.counts.blocked || 0]
  ].filter(([, value]) => Number(value) > 0) as Array<[string, number]>;

  return (
    <div className="mission-empty-state">
      <strong>No mission items yet.</strong>
      <span>Waiting on source intake or research clearance.</span>
      {chips.length ? (
        <div className="mission-empty-chips">
          {chips.map(([label, value]) => <span key={label}>{label}: {value}</span>)}
        </div>
      ) : null}
    </div>
  );
}

function AdminSourcesView({
  dashboard,
  onSubmitIntake,
  onDryRunPush,
  onRunLiveFeed
}: {
  dashboard: Dashboard | null;
  onSubmitIntake: (type: IntakeType, records: unknown[]) => Promise<IntakeResult>;
  onDryRunPush: () => Promise<void>;
  onRunLiveFeed: () => Promise<LiveFeedResult>;
}) {
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [liveError, setLiveError] = useState('');

  const runLive = async () => {
    setLiveBusy(true);
    setLiveMessage('');
    setLiveError('');
    try {
      const result = await onRunLiveFeed();
      const created = (result.zefix?.created || 0) + (result.austria?.created || 0);
      const existing = (result.skipped_existing?.ch || 0) + (result.skipped_existing?.at || 0);
      const errors = result.zefix?.errors?.length || 0;
      setLiveMessage(`created ${created} · existing skipped ${existing} · errors ${errors}`);
    } catch (err: any) {
      setLiveError(err?.message || 'Live intake failed');
    } finally {
      setLiveBusy(false);
    }
  };

  return (
    <section className="admin-sources-shell" aria-label="Admin Sources">
      <div className="today-header">
        <div>
          <div className="pane-title">Admin Sources</div>
          <h2>Source control</h2>
        </div>
        <div className={`webhook-card ${dashboard?.webhook_health.configured ? 'ok' : 'warn'}`}>
          <span>Webhook</span>
          <strong>{dashboard?.webhook_health.configured ? 'Configured' : 'Missing'}</strong>
          <small>{dashboard?.webhook_health.last_status || 'No recent push'}</small>
        </div>
      </div>
      <div className="source-admin-actions">
        <button className="primary-action" onClick={runLive} disabled={liveBusy}>
          <RefreshCw size={15} /> {liveBusy ? 'Importing live feed' : 'Import live feed'}
        </button>
        <button className="secondary-action" onClick={onDryRunPush}><Send size={15} /> Dry-run push</button>
      </div>
      {(liveMessage || liveError) ? (
        <div className={`live-feed-result ${liveError ? 'error' : ''}`}>
          {liveError || liveMessage}
        </div>
      ) : null}
      <AdminIntakePanel onSubmit={onSubmitIntake} defaultOpen />
    </section>
  );
}

function AdminIntakePanel({
  onSubmit,
  defaultOpen
}: {
  onSubmit: (type: IntakeType, records: unknown[]) => Promise<IntakeResult>;
  defaultOpen: boolean;
}) {
  const [type, setType] = useState<IntakeType>('zefix-bulk');
  const [rawJson, setRawJson] = useState(emptyIntakeJson);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [localError, setLocalError] = useState('');
  const [expanded, setExpanded] = useState(defaultOpen);
  const [sourceConfig, setSourceConfig] = useState<SourceConfig | null>(null);
  const [sourceBusy, setSourceBusy] = useState(false);

  useEffect(() => {
    if (defaultOpen) setExpanded(true);
  }, [defaultOpen]);

  const loadSources = useCallback(async () => {
    setSourceBusy(true);
    try {
      const payload = await api<{ source_config: SourceConfig }>('/acquisition/api/admin/source-config');
      setSourceConfig(payload.source_config);
    } catch (err: any) {
      setLocalError(err?.message || 'Source check failed');
    } finally {
      setSourceBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const refreshSources = async () => {
    setLocalError('');
    setSourceBusy(true);
    try {
      const payload = await api<{ source_config: SourceConfig }>('/acquisition/api/admin/source-reload', { method: 'POST' });
      setSourceConfig(payload.source_config);
      setMessage('source APIs checked');
    } catch (err: any) {
      setLocalError(err?.message || 'Source check failed');
    } finally {
      setSourceBusy(false);
    }
  };

  const changeType = (nextType: IntakeType) => {
    setType(nextType);
    setRawJson(emptyIntakeJson);
    setMessage('');
    setLocalError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError('');
    setMessage('');
    let records: unknown;
    try {
      records = JSON.parse(rawJson);
    } catch {
      setLocalError('JSON parse failed');
      return;
    }
    if (!Array.isArray(records)) {
      setLocalError('Paste a JSON array');
      return;
    }
    setBusy(true);
    try {
      const result = await onSubmit(type, records);
      setMessage(`created ${result.created} · skipped ${result.skipped} · errors ${result.errors.length}`);
    } catch (err: any) {
      setLocalError(err?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="admin-intake-panel" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        <div>
          <div className="pane-title">Admin Intake</div>
          <h3>Import prospects</h3>
        </div>
        <span>Source APIs</span>
      </summary>
      <div className="source-api-panel" aria-label="Linked source APIs">
        <div className="source-api-head">
          <div>
            <strong>Linked feeds</strong>
            <span>{sourceConfig ? `checked ${formatDate(sourceConfig.generated_at)}` : 'checking source APIs'}</span>
          </div>
          <button className="secondary-action" type="button" onClick={refreshSources} disabled={sourceBusy}>
            <RefreshCw size={15} /> {sourceBusy ? 'Checking' : 'Check APIs'}
          </button>
        </div>
        <div className="source-api-grid">
          {(sourceConfig?.sources || []).map((source) => <SourceApiCard key={source.key} source={source} />)}
        </div>
      </div>
      <form className="admin-intake-form" onSubmit={submit} aria-label="Admin prospect intake">
      <div className="admin-intake-head">
        <select value={type} onChange={(event) => changeType(event.target.value as IntakeType)} aria-label="Import type">
          <option value="zefix-bulk">Swiss register records</option>
          <option value="austria-directory">Austria directory records</option>
        </select>
      </div>
      <textarea value={rawJson} onChange={(event) => setRawJson(event.target.value)} placeholder={INTAKE_PLACEHOLDERS[type]} aria-label="Prospect JSON array" />
      <div className="admin-intake-actions">
        <button className="primary-action" type="submit" disabled={busy}>{busy ? 'Importing' : 'Import'}</button>
        {message ? <span className="intake-result">{message}</span> : null}
        {localError ? <span className="intake-result error">{localError}</span> : null}
      </div>
      </form>
    </details>
  );
}

function SourceApiCard({ source }: { source: AcquisitionSource }) {
  return (
    <article className={`source-api-card ${source.status}`}>
      <div className="source-api-card-head">
        <div>
          <strong>{source.label}</strong>
          <span>{source.market} · {source.status.replace(/_/g, ' ')}</span>
        </div>
        <span className="source-status-dot" aria-hidden="true" />
      </div>
      <div className="source-links-row">
        <a href={source.api_docs_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Docs</a>
        <a href={source.api_base_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> API</a>
      </div>
      {source.required_env.length ? (
        <div className="source-env-list">
          {source.required_env.map((key) => (
            <span key={key} className={source.configured_env.includes(key) ? 'configured' : ''}>{key}</span>
          ))}
        </div>
      ) : null}
      <ul>
        {source.notes.slice(0, 3).map((note) => <li key={note}>{note}</li>)}
      </ul>
    </article>
  );
}

function DossierPanel({ lead }: { lead: Lead }) {
  const profile = lead.draft_specificity.profile;
  const sourcePipeline = lead.source_pipeline;
  const observed = profile?.observed_signal || lead.evidence[0]?.detail || '';
  const why = profile?.why_it_might_matter || '';
  const opening = profile?.opening_angle || '';
  const doNotMention = compactDoNotMention(profile?.do_not_claim || []);
  const facts = [
    ['Company', lead.company.name],
    ['Market', `${lead.company.country}${lead.company.city ? ` · ${lead.company.city}` : ''}`],
    ['Contact', lead.contact.name ? `${lead.contact.name}${lead.contact.title ? ` · ${lead.contact.title}` : ''}` : 'Decision maker pending'],
    ['Source', sourceLabel(lead.compliance.source_url, lead.compliance.source)]
  ];

  return (
    <section className="dossier-panel" aria-label="Dossier">
      <div className="dossier-chip-row">
        <ChannelBadge channel={lead.channel} />
        <span className={`confidence-chip ${profile?.confidence || 'low'}`}>{profile?.confidence || 'low'} evidence</span>
        <span className={`compliance-mini ${lead.compliance.compliance_badge}`}>{lead.compliance.compliance_badge}</span>
        {shouldShowWrongLeadRisk(lead) ? <WrongLeadRiskChip /> : null}
      </div>

      <DossierSection title="What we know">
        <div className="dossier-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </DossierSection>

      <DossierSection title="Source Pipeline">
        <div className="source-pipeline-section">
          <div className="source-pipeline-summary">
            <span className={`confidence-chip ${sourcePipeline.confidence.level}`}>
              {sourcePipeline.confidence.level} source confidence
            </span>
            <span className={sourcePipeline.public_email_basis ? 'source-basis-label ok' : 'source-basis-label muted'}>
              {sourcePipeline.public_email_basis ? 'Public email basis ✓' : 'No public email basis'}
            </span>
            {sourcePipeline.batch_id ? <span className="source-batch-label">Batch: {sourcePipeline.batch_id}</span> : null}
          </div>
          <div className="source-signal-list" aria-label="Source confidence signals">
            {sourcePipeline.confidence.signals.map((signal) => <span key={signal}>{signal}</span>)}
          </div>
        </div>
      </DossierSection>

      {lead.draft_specificity?.profile?.observed_signal ? (
        <DossierSection title="Company Profile">
          <div className="company-profile-section">
            <p className="profile-observation">{lead.draft_specificity.profile.observed_signal}</p>
            {lead.draft_specificity.profile.why_it_might_matter ? (
              <p className="profile-why">{lead.draft_specificity.profile.why_it_might_matter}</p>
            ) : null}
            {lead.draft_specificity.profile.opening_angle ? (
              <p className="profile-angle">
                <span className="profile-angle-label">Offer angle:</span> {lead.draft_specificity.profile.opening_angle}
              </p>
            ) : null}
          </div>
        </DossierSection>
      ) : null}

      {observed ? (
        <DossierSection title="What was observed">
          <p>{observed}</p>
          <EvidenceList lead={lead} compact />
        </DossierSection>
      ) : null}

      {why ? (
        <DossierSection title="Why it might matter">
          <p>{why}</p>
        </DossierSection>
      ) : null}

      {opening ? (
        <DossierSection title="Safe opening angle">
          <p>{opening}</p>
        </DossierSection>
      ) : null}

      <DossierSection title="What not to mention">
        <div className="dossier-chip-row">
          {doNotMention.map((item) => <span key={item} className="avoid-chip">{item}</span>)}
        </div>
      </DossierSection>

      {lead.draft_specificity.readiness === 'needs_research' ? (
        <DossierSection title="Research blockers">
          <div className="research-blockers">
            {researchBlockerLabels(lead).map((label) => <span key={label}>{label}</span>)}
          </div>
        </DossierSection>
      ) : null}
    </section>
  );
}

function DossierSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dossier-section">
      <div className="pane-title">{title}</div>
      {children}
    </section>
  );
}

function EvidenceList({ lead, compact }: { lead: Lead; compact?: boolean }) {
  const rows = lead.evidence.length ? lead.evidence : [{
    kind: 'source',
    label: lead.compliance.source,
    detail: 'Source record available without detailed outreach evidence.',
    url: lead.compliance.source_url,
    captured_at: lead.compliance.source_timestamp
  }];

  return (
    <div className={compact ? 'evidence-list compact' : 'evidence-list'}>
      {rows.map((item) => {
        const url = item.url || lead.compliance.source_url;
        const content = (
          <>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
            <small>
              {sourceLabel(url, lead.compliance.source)}
              {url ? ` · ${url}` : ''}
              {' · '}
              captured {formatDate(item.captured_at || lead.compliance.source_timestamp)}
            </small>
          </>
        );
        return validUrl(url) ? (
          <a key={`${item.label}-${item.detail}-${url}`} href={url} target="_blank" rel="noreferrer">{content}</a>
        ) : (
          <div key={`${item.label}-${item.detail}-${url}`}>{content}</div>
        );
      })}
    </div>
  );
}

function WeeklyProgress({ weekly }: { weekly: Dashboard['weekly_quota'] }) {
  const percent = weekly.target ? Math.min(100, Math.round((weekly.pushed / weekly.target) * 100)) : 0;
  return (
    <div className="weekly-progress" aria-label="Weekly progress">
      <div>
        <span>Weekly target</span>
        <strong>{weekly.pushed}/{weekly.target}</strong>
      </div>
      <div className="weekly-progress-track"><i style={{ width: `${percent}%` }} /></div>
      <small>{weekly.remaining} remaining</small>
    </div>
  );
}

function MissionStat({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  return (
    <div className={`mission-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MissionCard({
  lead,
  onSelectLead,
  actionLabel,
  actionIcon,
  onAction
}: {
  lead: TodayMissionLead;
  onSelectLead: (id: string) => void;
  actionLabel: string;
  actionIcon: ReactNode;
  onAction: () => void;
}) {
  return (
    <article className="mission-card">
      <div className="mission-card-head">
        <div>
          <h4>{lead.company.name}</h4>
          <p>{lead.company.city || lead.company.country} · {lead.company.industry || 'Industry pending'}</p>
        </div>
        <span className={`score-pill ${scoreClass(lead.scoring.total_score)}`}>{lead.scoring.total_score}</span>
      </div>
      <div className="mission-card-meta">
        <ChannelBadge channel={lead.channel} />
        <StageBadge stage={lead.crm_stage} />
        <span className={`due-pill ${lead.due_state}`}>{lead.due_state.replace(/_/g, ' ')}</span>
      </div>
      <p className="draft-excerpt">{lead.draft_excerpt || lead.outreach_drafts[lead.preferred_draft_type] || 'Draft pending'}</p>
      {lead.send_blockers.length ? (
        <div className="blocker-list">
          {lead.send_blockers.map((blocker) => <span key={blocker}>{blocker.replace(/_/g, ' ')}</span>)}
        </div>
      ) : null}
      <div className="mission-card-actions">
        <button className="secondary-action" onClick={() => onSelectLead(lead.id)}>Inspect</button>
        <button className="primary-action" onClick={onAction}>{actionIcon}{actionLabel}</button>
      </div>
    </article>
  );
}

function ResearchCard({ lead, onSelectLead }: { lead: TodayMissionLead; onSelectLead: (id: string) => void }) {
  const blockers = researchBlockerLabels(lead);
  return (
    <article className="research-card" onClick={() => onSelectLead(lead.id)}>
      <div className="mission-card-head">
        <div>
          <h4>{lead.company.name}</h4>
          <p>{lead.contact.name || 'Contact pending'} · {lead.company.city || lead.company.country}</p>
        </div>
        <span className={`score-pill ${scoreClass(lead.scoring.total_score)}`}>{lead.scoring.total_score}</span>
      </div>
      <div className="mission-card-meta">
        <ChannelBadge channel={lead.channel} />
        <span className="source-pill">{lead.compliance.source}</span>
      </div>
      <div className="research-blockers">
        {blockers.map((blocker) => <span key={blocker}>{blocker}</span>)}
      </div>
      <div className="mission-card-actions">
        <button className="secondary-action" type="button" onClick={(event) => {
          event.stopPropagation();
          onSelectLead(lead.id);
        }}>Inspect</button>
      </div>
    </article>
  );
}

function researchBlockerLabels(lead: Lead) {
  const labels: string[] = [];
  const missingLabels: Record<string, string> = {
    evidence_detail: 'Missing: specific company evidence',
    company_name: 'Missing: company name reference',
    contact_reference: 'Missing: contact name reference'
  };
  const warningLabels: Record<string, string> = {
    thin_evidence: 'Warning: thin evidence'
  };

  for (const item of lead.draft_specificity.missing || []) {
    labels.push(missingLabels[item] || `Missing: ${item.replace(/_/g, ' ')}`);
  }
  for (const item of lead.draft_specificity.warnings || []) {
    labels.push(warningLabels[item] || `Warning: ${item.replace(/_/g, ' ')}`);
  }
  return labels.length ? labels : ['Missing: specific company evidence'];
}

function SendConfirmModal({
  lead,
  draftType,
  channel,
  followUp,
  error,
  busy,
  onDraftTypeChange,
  onChannelChange,
  onFollowUpChange,
  onCancel,
  onConfirm
}: {
  lead: TodayMissionLead | null;
  draftType: PreferredDraftType;
  channel: SendChannel | '';
  followUp: string;
  error: string;
  busy: boolean;
  onDraftTypeChange: (type: PreferredDraftType) => void;
  onChannelChange: (channel: SendChannel) => void;
  onFollowUpChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!lead) return null;
  const draftOptions = (['linkedin_intro', 'email_cold'] as PreferredDraftType[]).filter((type) => Boolean(lead.outreach_drafts[type]));
  const draft = lead.outreach_drafts[draftType] || lead.outreach_drafts[lead.preferred_draft_type] || '';
  const subject = draftSubject(draft);

  return (
    <div className="send-modal-backdrop" role="presentation">
      <section className="send-modal send-confirm-modal" role="dialog" aria-modal="true" aria-label="Manual send confirmation">
        <div className="send-modal-head">
          <div>
            <div className="pane-title">Manual Send</div>
            <h2>{lead.company.name}</h2>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Close send modal"><XCircle size={17} /></button>
        </div>

        <div className="draft-type-toggle" aria-label="Draft type">
          {draftOptions.map((type) => (
            <button key={type} className={draftType === type ? 'active' : ''} onClick={() => onDraftTypeChange(type)}>
              {DRAFT_LABELS[type]}
            </button>
          ))}
        </div>

        <div className="channel-selector" aria-label="Send channel">
          {(['linkedin', 'email'] as SendChannel[]).map((item) => (
            <button
              key={item}
              className={channel === item ? 'channel-selector-btn selected' : 'channel-selector-btn'}
              onClick={() => onChannelChange(item)}
              type="button"
            >
              {item === 'linkedin' ? 'LinkedIn' : 'Email'}
            </button>
          ))}
        </div>

        {subject ? (
          <div className="subject-preview modal-subject">
            <span>Subject</span>
            <strong>{subject}</strong>
          </div>
        ) : null}
        <textarea className="modal-draft" value={draft} readOnly />
        <label className="follow-up-confirm">
          Follow-up date
          <input type="date" value={followUp} onChange={(event) => onFollowUpChange(event.target.value)} />
        </label>
        {lead.send_blockers.length ? (
          <div className="blocker-list modal-blockers">
            {lead.send_blockers.map((blocker) => <span key={blocker}>{blocker.replace(/_/g, ' ')}</span>)}
          </div>
        ) : null}
        {error ? <div className="notice error"><AlertTriangle size={16} /> {error}</div> : null}
        <div className="modal-actions">
          <button className="secondary-action" onClick={onCancel}>Cancel</button>
          <button className="primary-action" disabled={busy || !draft || !channel} onClick={onConfirm}><Send size={15} /> Mark sent + copy draft</button>
        </div>
      </section>
    </div>
  );
}

function PostSendPrompt({
  onOpenNext,
  onAddNote,
  onDone
}: {
  onOpenNext: () => Promise<void>;
  onAddNote: () => void;
  onDone: () => void;
}) {
  return (
    <section className="post-send-prompt" aria-label="Post-send next action">
      <strong>Sent. What's next?</strong>
      <div>
        <button type="button" onClick={onOpenNext}>Open next lead -&gt;</button>
        <button type="button" onClick={onAddNote}>Add a note</button>
        <button type="button" onClick={onDone}>Done for today</button>
      </div>
    </section>
  );
}

function ReplyModal({
  lead,
  replyType,
  note,
  error,
  busy,
  onReplyTypeChange,
  onNoteChange,
  onCancel,
  onSubmit
}: {
  lead: Lead | null;
  replyType: ReplyType;
  note: string;
  error: string;
  busy: boolean;
  onReplyTypeChange: (type: ReplyType) => void;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  if (!lead) return null;
  const options: Array<[ReplyType, string]> = [
    ['interested', 'Interested'],
    ['not_now', 'Not now'],
    ['opt_out', 'Opted out'],
    ['other', 'Other']
  ];

  return (
    <div className="send-modal-backdrop" role="presentation">
      <section className="send-modal reply-modal" role="dialog" aria-modal="true" aria-label="Log reply">
        <div className="send-modal-head">
          <div>
            <div className="pane-title">Reply</div>
            <h2>{lead.company.name}</h2>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Close reply modal"><XCircle size={17} /></button>
        </div>
        <div className="reply-type-selector" aria-label="Reply type">
          {options.map(([value, label]) => (
            <button
              key={value}
              className={replyType === value ? 'channel-selector-btn selected' : 'channel-selector-btn'}
              onClick={() => onReplyTypeChange(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {replyType === 'opt_out' ? (
          <div className="opt-out-warning"><AlertTriangle size={15} /> This will suppress the contact and disqualify the lead.</div>
        ) : null}
        <label>
          Note
          <textarea value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Paste or summarize the reply" />
        </label>
        {error ? <div className="notice error"><AlertTriangle size={16} /> {error}</div> : null}
        <div className="modal-actions">
          <button className="secondary-action" onClick={onCancel}>Cancel</button>
          <button className="primary-action" disabled={busy} onClick={onSubmit}><MessageSquare size={15} /> Log reply</button>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`metric ${tone || ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IntelItem({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="intel-item">
      <span>{label}</span>
      <strong className={strong ? 'primary' : ''}>{value}</strong>
    </div>
  );
}

function ScoreGraph({ lead }: { lead: Lead }) {
  const rows = [
    ['Language', lead.scoring.english_score],
    ['Size', lead.scoring.size_score],
    ['Industry', lead.scoring.industry_fit_score],
    ['Recency', lead.scoring.recency_score],
    ['Evidence', lead.scoring.evidence_score ?? 0],
    ['Personalization', lead.scoring.personalization_score ?? 0]
  ] as const;

  return (
    <div className="score-graph">
      <div className={`score-orbit ${scoreClass(lead.scoring.total_score)}`}>
        <strong>{lead.scoring.total_score}</strong>
        <span>total</span>
      </div>
      <div className="score-breakdown">
        {rows.map(([label, value]) => <Progress key={label} label={label} value={value} />)}
      </div>
    </div>
  );
}

function channelRecommendation(lead: Lead) {
  if (lead.channel === 'both') return 'LinkedIn first, email available';
  if (lead.channel === 'email') return 'Email available';
  if (lead.channel === 'linkedin') return 'LinkedIn first';
  return 'Blocked';
}

function draftReadinessLabel(lead: Lead) {
  if (lead.draft_specificity.readiness === 'ready_to_rework') return 'Ready for Review';
  if (lead.draft_specificity.readiness === 'draft_review') return 'Draft needs review';
  if (lead.draft_specificity.readiness === 'needs_research') return 'Needs research';
  if (lead.draft_specificity.readiness === 'needs_rework') return 'Needs rework';
  if (lead.draft_specificity.readiness === 'blocked') return 'Blocked';
  return 'Draft status';
}

function readinessClass(lead: Lead) {
  return lead.draft_specificity.readiness || 'legacy';
}

function ChannelBadge({ channel }: { channel: Lead['channel'] }) {
  const icon = channel === 'email' || channel === 'both' ? <Mail size={14} /> : <MessageSquare size={14} />;
  const label = channel === 'both' ? 'email · linkedin' : channel;
  return <span className={`channel-badge ${channel}`}>{icon}{label}</span>;
}

function StageBadge({ stage }: { stage: CrmStage }) {
  return <span className={`stage-badge ${stage}`}>{stage.replace(/_/g, ' ')}</span>;
}

function WrongLeadRiskChip() {
  return <span className="wrong-lead-risk-chip"><AlertTriangle size={13} /> WRONG-LEAD RISK</span>;
}

function shouldShowWrongLeadRisk(lead: Lead) {
  return Boolean(lead.source_pipeline.wrong_lead_risk && lead.draft_specificity.readiness !== 'needs_research');
}

function draftFlagLabel(flag: DraftFlag) {
  const labels: Record<DraftFlag, string> = {
    generic_language: 'No company/contact reference',
    fake_familiarity: 'Familiarity without LinkedIn',
    ai_spam_tone: 'AI-spam phrases',
    inflated_promise: 'Inflated promise',
    diagnosis_heavy: 'Ungrounded diagnosis',
    unrelated_claim: 'Unrelated claim'
  };
  return labels[flag] || flag.replace(/_/g, ' ');
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="progress-row">
      <span>{label}</span>
      <div><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
      <strong>{value}</strong>
    </div>
  );
}

function draftSubject(text: string) {
  const firstLine = text.split(/\n/)[0] || '';
  const match = firstLine.match(/^Subject:\s*(.+)$/i);
  return match?.[1]?.trim() || '';
}

function draftBody(text: string) {
  return text.replace(/^Subject:\s*.+\n+/i, '').trim();
}

function draftCountLabel(type: DraftType, text: string) {
  if (type.startsWith('linkedin')) return `${text.length}/450 chars`;
  const body = draftBody(text);
  const words = body ? body.split(/\s+/).filter(Boolean).length : 0;
  return `${words}/110 words`;
}

function personalizationChecklist(lead: Lead, text: string) {
  const haystack = text.toLowerCase();
  const evidence = lead.evidence[0]?.detail?.toLowerCase() || '';
  return [
    { label: 'Company named', ok: haystack.includes(lead.company.name.toLowerCase()) },
    { label: 'Contact or role', ok: Boolean((lead.contact.name && haystack.includes(lead.contact.name.toLowerCase())) || (lead.contact.title && haystack.includes(lead.contact.title.toLowerCase()))) },
    { label: 'Observed evidence', ok: Boolean(evidence && evidence.split(/\s+/).some((token) => token.length > 5 && haystack.includes(token))) },
    { label: 'Gentle question', ok: /(\?|worth|open to|useful|relevant)/i.test(text) },
    { label: 'No lift claim', ok: !/(revenue|conversion|pipeline|demand|growth|increase|improve|fix)/i.test(text) }
  ];
}

function validUrl(value?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sourceLabel(url?: string | null, fallback = 'source') {
  if (!url) return fallback;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('zefix')) return 'zefix';
    if (host.includes('wko')) return 'wko.at';
    if (host.includes('firmenabc')) return 'firmenabc.at';
    if (host.includes('linkedin')) return 'LinkedIn';
    return host;
  } catch {
    return fallback;
  }
}

function compactDoNotMention(items: string[]) {
  const compact = items.flatMap((item) => {
    const lower = item.toLowerCase();
    const labels: string[] = [];
    if (lower.includes('revenue') || lower.includes('conversion') || lower.includes('pipeline') || lower.includes('demand')) labels.push('No lift claims');
    if (lower.includes('struggling') || lower.includes('failing') || lower.includes('wrong')) labels.push('No blame');
    if (lower.includes('improve') || lower.includes('fix') || lower.includes('clarify')) labels.push('No repair pitch');
    if (lower.includes('ads') || lower.includes('retargeting') || lower.includes('campaign')) labels.push('Only sourced topics');
    if (lower.includes('client')) labels.push('No client assumptions');
    return labels;
  });
  return Array.from(new Set(compact.length ? compact : ['Unverified claims']));
}
