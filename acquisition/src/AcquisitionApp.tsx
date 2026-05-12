import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  LogOut,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
  UserCheck,
  XCircle
} from 'lucide-react';

type Role = 'admin' | 'operator';
type CrmStage = 'new' | 'needs_review' | 'ready' | 'sent' | 'replied' | 'qualified' | 'blocked';
type DraftType = 'linkedin_intro' | 'linkedin_followup' | 'email_cold' | 'email_followup';

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
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      // keep HTTP status message
    }
    throw new Error(message);
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
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
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

  const activeLead = selectedLead || leads.find((lead) => lead.id === selectedId) || leads[0] || null;

  const loadDashboard = useCallback(async () => {
    const payload = await api<{ dashboard: Dashboard }>('/acquisition/api/dashboard');
    setDashboard(payload.dashboard);
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
    void Promise.all([loadDashboard(), loadLeads()]).catch((err) => setError(err.message));
  }, [loadDashboard, loadLeads, user]);

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

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError('');
    try {
      const payload = await api<{ user: User }>('/acquisition/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      setUser(payload.user);
      window.history.replaceState(null, '', '/acquisition');
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    }
  };

  const logout = async () => {
    await api('/acquisition/api/auth/logout', { method: 'POST' }).catch(() => null);
    setUser(null);
    setLeads([]);
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
    await Promise.all([loadLeads(), loadDashboard(), loadLeadDetail(id)]);
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

  const markSent = async () => {
    if (!activeLead) return;
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
    return <div className="acq-loading">Loading acquisition CRM</div>;
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-panel" aria-label="c2moviez acquisition login">
          <div className="brand-mark">c2moviez</div>
          <h1>Acquisition CRM</h1>
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
          <h1>Acquisition CRM</h1>
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
          {SAVED_VIEWS.map((item) => (
            <button
              key={item.key}
              className={view === item.key ? 'view-button active' : 'view-button'}
              onClick={() => setView(item.key)}
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

          {notice ? <div className="notice">{notice}</div> : null}
          {error ? <div className="notice error"><AlertTriangle size={16} /> {error}</div> : null}

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
                <button onClick={markSent}><Send size={15} /> Mark sent</button>
                <button onClick={qualifyLead}><UserCheck size={15} /> Qualify</button>
                <button onClick={blockLead}><XCircle size={15} /> Block</button>
              </section>

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
