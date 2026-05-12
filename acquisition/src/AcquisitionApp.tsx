import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clipboard,
  Clock3,
  LogOut,
  Mail,
  MessageSquare,
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
type RouteMode = 'today' | 'leads';

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
  channel: 'linkedin' | 'email' | 'both' | 'blocked';
  status: string;
  crm_stage: CrmStage;
  outreach_drafts: Record<DraftType, string | null>;
  draft_specificity: {
    valid: boolean;
    proof_chips: string[];
    missing: string[];
    warnings?: string[];
    readiness?: 'ready_to_rework' | 'needs_research' | 'needs_rework' | 'blocked';
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
};

type TodayMission = {
  generated_at: string;
  weekly: Dashboard['weekly_quota'];
  counts: {
    sendable: number;
    follow_ups_due: number;
    needs_research: number;
    review_needed: number;
    blocked: number;
    overdue: number;
  };
  sendable: TodayMissionLead[];
  follow_ups_due: TodayMissionLead[];
};

type ApiError = Error & {
  status?: number;
  payload?: unknown;
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
  const [routeMode, setRouteMode] = useState<RouteMode>(() => window.location.pathname.includes('/leads') ? 'leads' : 'today');
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
  const [draftText, setDraftText] = useState('');
  const [fannyNotes, setFannyNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [replyText, setReplyText] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sendModalLead, setSendModalLead] = useState<TodayMissionLead | null>(null);
  const [sendModalDraftType, setSendModalDraftType] = useState<PreferredDraftType>('linkedin_intro');
  const [sendModalError, setSendModalError] = useState('');
  const [sendModalBusy, setSendModalBusy] = useState(false);

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

  const navigateMode = (mode: RouteMode) => {
    setRouteMode(mode);
    window.history.replaceState(null, '', mode === 'today' ? '/acquisition/today' : '/acquisition/leads');
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

  const copyDraft = async () => {
    if (!activeLead) return;
    const payload = await api<{ draft_type: DraftType; text: string }>(`/acquisition/api/leads/${activeLead.id}/copy-draft`, {
      method: 'POST',
      body: JSON.stringify({ draft_type: draftType })
    });
    await navigator.clipboard?.writeText(payload.text).catch(() => null);
    setNotice(`${DRAFT_LABELS[payload.draft_type]} copied`);
    await loadLeadDetail(activeLead.id);
  };

  const copyMissionDraft = async (lead: TodayMissionLead, type: PreferredDraftType) => {
    const payload = await api<{ draft_type: DraftType; text: string }>(`/acquisition/api/leads/${lead.id}/copy-draft`, {
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
    setSendModalError('');
  };

  const copyAndMarkSent = async () => {
    if (!sendModalLead) return;
    setSendModalBusy(true);
    setSendModalError('');
    try {
      await copyMissionDraft(sendModalLead, sendModalDraftType);
      await patchLead(sendModalLead.id, { status: 'sent', crm_stage: 'sent' }, 'Draft copied and marked sent');
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
    await patchLead(activeLead.id, { status: 'sent', crm_stage: 'sent' }, 'Marked sent');
  };

  const recordReply = async () => {
    if (!activeLead || !replyText.trim()) return;
    await patchLead(activeLead.id, { status: 'replied', crm_stage: 'replied', reply_text: replyText.trim() }, 'Reply recorded');
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

  const clearFollowUp = async (lead: TodayMissionLead) => {
    setSelectedId(lead.id);
    await patchLead(lead.id, { next_follow_up_at: null }, 'Follow-up done');
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
          <Metric label="Week target" value={`${dashboard?.weekly_quota.pushed || 0}/${dashboard?.weekly_quota.target || 20}`} />
          <Metric label="Ready" value={String(dashboard?.view_counts?.ready || 0)} />
          <Metric label="Warnings" value={String(dashboard?.compliance_warnings.length || 0)} tone={dashboard?.compliance_warnings.length ? 'warn' : 'ok'} />
          <Metric label="Webhook" value={dashboard?.webhook_health.configured ? 'Configured' : 'Missing'} tone={dashboard?.webhook_health.configured ? 'ok' : 'warn'} />
        </div>
        <div className="account-tools">
          <span>{user.email}</span>
          <span className="role-pill">{user.role}</span>
          <button className="icon-button" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </header>

      <div className="acq-layout">
        <aside className="saved-views" aria-label="Saved views">
          <div className="pane-title">Views</div>
          <button
            className={routeMode === 'today' ? 'view-button active' : 'view-button'}
            onClick={() => navigateMode('today')}
          >
            <span>Today</span>
            <strong>{(mission?.counts.sendable || 0) + (mission?.counts.follow_ups_due || 0)}</strong>
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
              <button className="secondary-action" onClick={adminDryRunPush}><Send size={15} /> Dry-run push</button>
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
              onOpenSend={openSendModal}
              onClearFollowUp={clearFollowUp}
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

        <aside className="inspector" aria-label="Lead inspector">
          {activeLead ? (
            <>
              <section className="inspector-head">
                <div>
                  <h2>{activeLead.company.name}</h2>
                  <p>{activeLead.company.city || activeLead.company.country} · {activeLead.company.industry || 'Industry pending'}</p>
                </div>
                <span className={`score-pill ${scoreClass(activeLead.scoring.total_score)}`}>{activeLead.scoring.total_score}</span>
              </section>

              <section className="detail-grid">
                <Detail label="Contact" value={activeLead.contact.name || 'Pending'} />
                <Detail label="Role" value={activeLead.contact.title || 'Pending'} />
                <Detail label="Employees" value={String(activeLead.company.employee_count || 'Estimate pending')} />
                <Detail label="Source" value={activeLead.compliance.source} />
              </section>

              <section className="inspector-section">
                <div className="pane-title">Evidence</div>
                <div className="evidence-list">
                  {activeLead.evidence.map((item) => (
                    <a key={`${item.label}-${item.detail}`} href={item.url || activeLead.compliance.source_url} target="_blank" rel="noreferrer">
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </a>
                  ))}
                </div>
              </section>

              <section className="inspector-section">
                <div className="pane-title">Compliance</div>
                <div className={`compliance-line ${activeLead.compliance.compliance_badge}`}>
                  <ShieldCheck size={16} />
                  <span>{activeLead.compliance.compliance_badge}</span>
                  <span>{activeLead.compliance.legal_basis}</span>
                </div>
                {activeLead.compliance.guardrail_notes.map((note) => <p className="guardrail" key={note}>{note}</p>)}
              </section>

              <section className="inspector-section">
                <div className="pane-title">Score Breakdown</div>
                <div className="score-breakdown">
                  <Progress label="Language fit" value={activeLead.scoring.english_score} />
                  <Progress label="Size" value={activeLead.scoring.size_score} />
                  <Progress label="Industry" value={activeLead.scoring.industry_fit_score} />
                  <Progress label="Recency" value={activeLead.scoring.recency_score} />
                </div>
              </section>

              <section className="inspector-section outreach-profile">
                <div className="pane-title">Outreach Profile</div>
                {activeLead.draft_specificity.profile ? (
                  <>
                    <div className={`readiness-line ${activeLead.draft_specificity.readiness || 'legacy'}`}>
                      <ShieldCheck size={16} />
                      <span>{(activeLead.draft_specificity.readiness || 'legacy_draft').replace(/_/g, ' ')}</span>
                      <span>{activeLead.draft_specificity.profile.confidence} confidence</span>
                    </div>
                    <p className="profile-signal">{activeLead.draft_specificity.profile.observed_signal}</p>
                    <p>{activeLead.draft_specificity.profile.opening_angle}</p>
                    <p>{activeLead.draft_specificity.profile.why_it_might_matter}</p>
                    <div className="source-links">
                      {activeLead.draft_specificity.profile.source_urls.slice(0, 4).map((url, index) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">Source {index + 1}</a>
                      ))}
                    </div>
                    <div className="claim-guardrails">
                      {activeLead.draft_specificity.profile.do_not_claim.map((claim) => <span key={claim}>{claim}</span>)}
                    </div>
                  </>
                ) : (
                  <p className="guardrail">Profile missing; save draft to recompute.</p>
                )}
                {(activeLead.draft_specificity.warnings || []).map((warning) => (
                  <p className="guardrail" key={warning}><AlertTriangle size={14} /> {warning.replace(/_/g, ' ')}</p>
                ))}
              </section>

              <section className="draft-workspace">
                <div className="draft-tabs">
                  {(Object.keys(DRAFT_LABELS) as DraftType[]).map((type) => (
                    <button key={type} className={draftType === type ? 'active' : ''} onClick={() => setDraftType(type)}>
                      {DRAFT_LABELS[type]}
                    </button>
                  ))}
                </div>
                <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} />
                <div className="proof-chips">
                  {activeLead.draft_specificity.proof_chips.map((chip) => <span key={chip}>{chip}</span>)}
                  {!activeLead.draft_specificity.valid ? <span className="warn-chip">Specificity missing</span> : null}
                </div>
                <div className="action-row">
                  <button className="secondary-action" onClick={saveDraft}><CheckCircle2 size={15} /> Save</button>
                  <button className="secondary-action" onClick={copyDraft}><Clipboard size={15} /> Copy</button>
                </div>
              </section>

              <section className="inspector-section notes-section">
                <div className="pane-title">Next Action</div>
                <label>
                  Fanny notes
                  <textarea value={fannyNotes} onChange={(event) => setFannyNotes(event.target.value)} />
                </label>
                <label>
                  Follow-up date
                  <input type="date" value={followUp} onChange={(event) => setFollowUp(event.target.value)} />
                </label>
                <button className="secondary-action" onClick={saveNotes}><CheckCircle2 size={15} /> Save notes</button>
              </section>

              <section className="quick-actions">
                <button onClick={markSent} disabled={!canMarkActiveLeadSent} title={sendBlockReason || 'Mark sent'}><Send size={15} /> Mark sent</button>
                <button onClick={qualifyLead}><UserCheck size={15} /> Qualify</button>
                <button onClick={blockLead}><XCircle size={15} /> Block</button>
              </section>
              {sendBlockReason ? <p className="send-block-reason"><AlertTriangle size={14} /> {sendBlockReason}</p> : null}

              <section className="inspector-section">
                <div className="pane-title">Reply</div>
                <textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="Paste manual LinkedIn or email reply" />
                <button className="secondary-action" onClick={recordReply}><MessageSquare size={15} /> Record reply</button>
              </section>

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
            </>
          ) : (
            <div className="empty-inspector">Select a lead to inspect drafts, proof, and next action.</div>
          )}
        </aside>
      </div>
      <SendConfirmationModal
        lead={sendModalLead}
        draftType={sendModalDraftType}
        error={sendModalError}
        busy={sendModalBusy}
        onDraftTypeChange={setSendModalDraftType}
        onCancel={() => setSendModalLead(null)}
        onConfirm={copyAndMarkSent}
      />
    </div>
  );
}

function TodayMissionView({
  mission,
  loading,
  onSelectLead,
  onOpenSend,
  onClearFollowUp
}: {
  mission: TodayMission | null;
  loading: boolean;
  onSelectLead: (id: string) => void;
  onOpenSend: (lead: TodayMissionLead) => void;
  onClearFollowUp: (lead: TodayMissionLead) => void;
}) {
  const weekly = mission?.weekly || { target: 20, pushed: 0, remaining: 20 };

  return (
    <section className="today-shell" aria-label="Today Mission">
      <div className="today-header">
        <div>
          <div className="pane-title">Today Mission</div>
          <h2>Fanny workbench</h2>
        </div>
        <WeeklyProgress weekly={weekly} />
      </div>

      <div className="mission-stats" aria-label="Mission blockers">
        <MissionStat label="Ready to send" value={mission?.counts.sendable || 0} tone="ok" />
        <MissionStat label="Follow-ups due" value={mission?.counts.follow_ups_due || 0} tone={mission?.counts.follow_ups_due ? 'warn' : 'neutral'} />
        <MissionStat label="Needs research" value={mission?.counts.needs_research || 0} tone="warn" />
        <MissionStat label="Review needed" value={mission?.counts.review_needed || 0} tone="warn" />
        <MissionStat label="Blocked" value={mission?.counts.blocked || 0} tone="danger" />
        <MissionStat label="Overdue" value={mission?.counts.overdue || 0} tone={mission?.counts.overdue ? 'danger' : 'neutral'} />
      </div>

      {loading ? <div className="empty-mission">Loading mission</div> : null}

      <div className="mission-queues">
        <section className="mission-queue" aria-label="Ready to Send">
          <div className="mission-queue-head">
            <h3><Target size={17} /> Ready to Send</h3>
            <span>{mission?.sendable.length || 0}</span>
          </div>
          <div className="mission-card-list">
            {mission?.sendable.map((lead) => (
              <MissionCard
                key={lead.id}
                lead={lead}
                onSelectLead={onSelectLead}
                actionLabel="Send"
                actionIcon={<Send size={15} />}
                onAction={() => onOpenSend(lead)}
              />
            ))}
            {mission && !mission.sendable.length ? <div className="empty-mission">No sendable leads.</div> : null}
          </div>
        </section>

        <section className="mission-queue" aria-label="Follow-ups Due">
          <div className="mission-queue-head">
            <h3><Clock3 size={17} /> Follow-ups Due</h3>
            <span>{mission?.follow_ups_due.length || 0}</span>
          </div>
          <div className="mission-card-list">
            {mission?.follow_ups_due.map((lead) => (
              <MissionCard
                key={lead.id}
                lead={lead}
                onSelectLead={onSelectLead}
                actionLabel="Follow-up done"
                actionIcon={<CalendarCheck size={15} />}
                onAction={() => onClearFollowUp(lead)}
              />
            ))}
            {mission && !mission.follow_ups_due.length ? <div className="empty-mission">No due follow-ups.</div> : null}
          </div>
        </section>
      </div>
    </section>
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

function SendConfirmationModal({
  lead,
  draftType,
  error,
  busy,
  onDraftTypeChange,
  onCancel,
  onConfirm
}: {
  lead: TodayMissionLead | null;
  draftType: PreferredDraftType;
  error: string;
  busy: boolean;
  onDraftTypeChange: (type: PreferredDraftType) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!lead) return null;
  const draftOptions = (['linkedin_intro', 'email_cold'] as PreferredDraftType[]).filter((type) => Boolean(lead.outreach_drafts[type]));
  const draft = lead.outreach_drafts[draftType] || lead.outreach_drafts[lead.preferred_draft_type] || '';

  return (
    <div className="send-modal-backdrop" role="presentation">
      <section className="send-modal" role="dialog" aria-modal="true" aria-label="Manual send confirmation">
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

        <textarea className="modal-draft" value={draft} readOnly />
        {error ? <div className="notice error"><AlertTriangle size={16} /> {error}</div> : null}
        <div className="modal-actions">
          <button className="secondary-action" onClick={onCancel}>Cancel</button>
          <button className="primary-action" disabled={busy || !draft} onClick={onConfirm}><Clipboard size={15} /> Copy & Mark Sent</button>
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

function ChannelBadge({ channel }: { channel: Lead['channel'] }) {
  const icon = channel === 'email' || channel === 'both' ? <Mail size={14} /> : <MessageSquare size={14} />;
  return <span className={`channel-badge ${channel}`}>{icon}{channel}</span>;
}

function StageBadge({ stage }: { stage: CrmStage }) {
  return <span className={`stage-badge ${stage}`}>{stage.replace(/_/g, ' ')}</span>;
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
