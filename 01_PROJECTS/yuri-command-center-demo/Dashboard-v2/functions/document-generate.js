// ═══ DOCUMENT GENERATE — Smart Writer v2 Backend ═══
// POST /.netlify/functions/document-generate
// Generates professional documents using Claude API.
// Auth: JWT cookie/header OR X-Internal-Key.

const { CORS, ok, err, options, anthropicPost } = require('./shared');
const { checkAuth } = require('./auth-check');

// ── Company context injected into every system prompt ──
const COMPANY = {
  name: 'c2moviez GmbH',
  tagline: 'Creative Technology',
  address: 'Hedi-Lang-Strasse 5, 8620 Wetzikon',
  email: 'info@c2moviez.com',
  phone: '+41 78 317 85 85',
  mwst_nr: 'CHE-252.263.743',
  mwst_rate: 8.1,
  website: 'c2moviez.com',
  ceo: 'Claudio Tinner',
  country: 'Switzerland',
  currency: 'CHF',
  hourly_rate: 160,
  team: {
    CTI: { name: 'Claudio Tinner', role: 'CEO / Creative Director' },
    FK:  { name: 'Fanny Kecskes', role: 'Marketing Manager' }
  },
  services: [
    'Video Production',
    'Photography',
    'Website Creation & Development',
    'Visuals & Production',
    'Digital Marketing',
    'Branding & Design',
    'Technology Solutions & Automation'
  ]
};

// ── Shared branding context for all system prompts ──
const BRAND_CONTEXT = `
You are a professional document generator for ${COMPANY.name}, a Swiss creative technology company.

COMPANY INFO:
- Name: ${COMPANY.name}
- Tagline: ${COMPANY.tagline}
- Address: ${COMPANY.address}
- Email: ${COMPANY.email}
- Phone: ${COMPANY.phone}
- Website: ${COMPANY.website}
- MwSt-Nr: ${COMPANY.mwst_nr}
- MwSt Rate: ${COMPANY.mwst_rate}%
- CEO: ${COMPANY.ceo}
- Country: ${COMPANY.country}
- Currency: ${COMPANY.currency}
- Standard hourly rate: CHF ${COMPANY.hourly_rate}
- Services: ${COMPANY.services.join(', ')}
- Team: ${Object.entries(COMPANY.team).map(([k, v]) => `${v.name} (${v.role})`).join(', ')}

OUTPUT FORMAT:
- Return ONLY clean HTML content (no <html>, <head>, <body>, or <style> tags).
- Use semantic HTML: <h1>, <h2>, <h3>, <p>, <ul>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>.
- Use these CSS classes where appropriate:
  - "doc-header" — top flex row with brand + meta
  - "doc-brand" — company name in header
  - "doc-brand-sub" — subtitle/address under brand
  - "doc-meta" — right-aligned meta info
  - "doc-type-badge" — colored badge for doc type
  - "highlight-box" — light accent box for key info
  - "cta-block" — call-to-action box
  - "signature-block" — two-column signature area
  - "sig-line" — individual signature line
  - "doc-footer" — footer with company details
  - "text-right" — right-aligned cell
  - "text-bold" — bold cell
  - "total-row" — totals row in table
- Use Swiss number formatting: 1'000.00 (apostrophe as thousands separator).
- Currency is always CHF.
- Use proper German (Swiss standard) when lang=de, professional English when lang=en.
- Never use umlauts in generated HTML — use ae, oe, ue, ss instead (matching the frontend convention).
`.trim();

// ── Type-specific system prompts ──
const TYPE_PROMPTS = {
  offer: (lang) => `${BRAND_CONTEXT}

DOCUMENT TYPE: Formal Offer / Angebot
LANGUAGE: ${lang === 'de' ? 'German (Swiss)' : 'English'}

Generate a professional, complete offer document with these sections:
1. Document header: company brand left, doc type badge + offer number + date + validity right
2. Title: "Angebot" or "Offer" with client type
3. Client info line (name, contact person)
4. Scope of Services (Leistungsumfang): a detailed pricing table with columns: Service, Description, Qty, Amount CHF
   - Generate realistic service line items based on the client context and notes
   - Include subtotal, MwSt ${COMPANY.mwst_rate}%, and total rows
5. Terms (Konditionen): payment terms (30 days net), validity period, MwSt note
6. Notes section (if custom notes provided)
7. Signature block: two columns (c2moviez + client)
8. Footer: company details

Make the services specific to the client context. Calculate realistic prices based on CHF ${COMPANY.hourly_rate}/hr rate.
Generate an offer number in format: ANGyyyyMMdd (today's date).
Valid for 30 days from today.`,

  proposal: (lang) => `${BRAND_CONTEXT}

DOCUMENT TYPE: Project Proposal / Praesentation
LANGUAGE: ${lang === 'de' ? 'German (Swiss)' : 'English'}

Generate a compelling project proposal with these sections:
1. Document header: company brand left, doc type badge + date right
2. Title: "Zusammenarbeit mit [Client]" or "Collaboration with [Client]"
3. About Us: brief company introduction (2-3 sentences)
4. Context (Ausgangslage): what we know about the client, their needs, the opportunity
5. Our Recommendation: 3-4 service areas with bullet points, tailored to the client
6. Timeline: phased approach (Phase 1, 2, 3) with realistic durations
7. Investment overview: summary table with estimated budget ranges
8. Team: who from c2moviez will be involved and their roles
9. Next Steps: CTA with contact info
10. Footer

Make it persuasive but professional. Tailor every section to the client's industry and stated needs.`,

  'meeting-prep': (lang) => `${BRAND_CONTEXT}

DOCUMENT TYPE: Meeting Preparation Brief
LANGUAGE: ${lang === 'de' ? 'German (Swiss)' : 'English'}

Generate a thorough pre-meeting briefing document with:
1. Document header: brand + "Meeting Vorbereitung" / "Meeting Preparation"
2. Meeting details box: date, time, location, duration, attendees
3. Client Overview: who they are, what they do, current relationship status
4. Open Items: any known open tickets, pending deliverables, or action items
5. Key Talking Points: 4-6 strategic topics to discuss, with brief context for each
6. Objectives: what we want to achieve in this meeting (3-4 clear goals)
7. Questions to Ask: 3-5 smart questions to gather intel
8. Preparation Checklist: what to bring/prepare before the meeting
9. Footer

Be strategic and actionable. Help the CEO walk into this meeting fully prepared.`,

  'meeting-notes': (lang) => `${BRAND_CONTEXT}

DOCUMENT TYPE: Meeting Notes / Protokoll
LANGUAGE: ${lang === 'de' ? 'German (Swiss)' : 'English'}

Generate structured meeting notes with:
1. Document header: brand + "Protokoll" / "Meeting Notes"
2. Meeting info box: date, location, duration, attendees
3. Agenda / Topics Discussed: numbered list of main topics
4. Key Decisions: clearly marked decisions made during the meeting
5. Action Items: table with columns: Action, Responsible, Deadline
   - Generate realistic action items based on the context
6. Open Questions: any unresolved items
7. Follow-up: next meeting date/topic, follow-up tasks
8. Footer

If custom notes are provided, use them as the raw meeting content and structure them professionally.
If no notes provided, generate a template with placeholder content that can be edited.`,

  'meeting-agenda': (lang) => `${BRAND_CONTEXT}

DOCUMENT TYPE: Meeting Agenda / Tagesordnung
LANGUAGE: ${lang === 'de' ? 'German (Swiss)' : 'English'}

Generate a structured meeting agenda with:
1. Document header: brand + "Tagesordnung" / "Agenda"
2. Meeting info box: date, location, duration, attendees
3. Agenda items: numbered with time allocations, responsible person, and brief description
   - Start with welcome/intro (5 min)
   - Include 4-6 substantive agenda items based on client context
   - End with next steps / wrap-up (10 min)
4. Preparation notes: what attendees should prepare
5. Footer

Time allocations should add up to the total meeting duration.`,

  'job-posting': (lang) => `${BRAND_CONTEXT}

DOCUMENT TYPE: Job Posting / Stelleninserat
LANGUAGE: ${lang === 'de' ? 'German (Swiss)' : 'English'}

Generate a compelling job posting with:
1. Document header: brand + "Stelleninserat" / "Job Posting"
2. Company intro: 2-3 sentences about c2moviez and culture
3. Role title and summary
4. What you'll do: 5-7 responsibility bullet points
5. What you bring: 5-7 requirement bullet points (mix of must-have and nice-to-have)
6. What we offer: 4-6 benefits (Swiss context: flexible hours, modern tools, creative environment, central location Wetzikon)
7. How to apply: email to ${COMPANY.email}, what to include
8. Footer

Tone: professional but approachable. Reflect a modern, creative tech company.
Based on the notes/context, determine the specific role being posted.`,

  report: (lang) => `${BRAND_CONTEXT}

DOCUMENT TYPE: Monthly / Campaign Report
LANGUAGE: ${lang === 'de' ? 'German (Swiss)' : 'English'}

Generate a professional report with:
1. Document header: brand + "Bericht" / "Report"
2. Report period and client info
3. Executive Summary: 3-4 sentences overview
4. KPIs / Key Metrics: table with metric, target, actual, status (use checkmarks/arrows)
5. Results & Analysis: detailed breakdown by area (content, campaigns, technical, etc.)
6. Highlights: top 3 achievements this period
7. Challenges: any issues encountered and how they were addressed
8. Recommendations: 3-5 actionable next steps
9. Next Period Goals: what we'll focus on next
10. Footer

Use realistic metrics and data placeholders. Make it data-driven and actionable.`,

  'ci-cd': (lang) => `${BRAND_CONTEXT}

DOCUMENT TYPE: CI/CD / Strategic Technical Document
LANGUAGE: ${lang === 'de' ? 'German (Swiss)' : 'English'}

Generate a technical strategy document with:
1. Document header: brand + document type badge
2. Document title and scope
3. Executive Summary
4. Current State Analysis: where we are now
5. Target State: where we want to be
6. Strategy / Plan: phased approach with milestones
7. Technical Architecture: systems, tools, integrations
8. Team & Responsibilities: who does what
9. Timeline: Gantt-style table or phased timeline
10. Investment / Resources: budget and resource needs
11. Risk Assessment: key risks and mitigations
12. Footer

If a template name is provided, tailor the document to that specific topic.
Be technically accurate and strategic.`
};

// Aliases for document types that map to the same generator
const TYPE_ALIASES = {
  'invoice-cover': 'offer',
  'meeting-agenda': 'meeting-prep',
  'cicd-report': 'ci-cd',
  'cicd-plan': 'ci-cd',
  'cicd-audit': 'ci-cd',
  'job': 'job-posting',
  'team-brief': 'report',
  'onboarding': 'report'
};

// ── Title generation per type ──
function generateTitle(type, clientName, lang) {
  const de = lang === 'de';
  const titles = {
    'offer':         de ? `Angebot — ${clientName}` : `Offer — ${clientName}`,
    'proposal':      de ? `Praesentation — ${clientName}` : `Proposal — ${clientName}`,
    'invoice-cover': de ? `Rechnungsdeckblatt — ${clientName}` : `Invoice Cover — ${clientName}`,
    'meeting-prep':  de ? `Meeting-Vorbereitung — ${clientName}` : `Meeting Prep — ${clientName}`,
    'meeting-notes': de ? `Protokoll — ${clientName}` : `Meeting Notes — ${clientName}`,
    'meeting-agenda':de ? `Tagesordnung — ${clientName}` : `Agenda — ${clientName}`,
    'job-posting':   de ? `Stelleninserat — ${COMPANY.name}` : `Job Posting — ${COMPANY.name}`,
    'job':           de ? `Stelleninserat — ${COMPANY.name}` : `Job Posting — ${COMPANY.name}`,
    'report':        de ? `Bericht — ${clientName}` : `Report — ${clientName}`,
    'team-brief':    de ? `Team Briefing — ${COMPANY.name}` : `Team Briefing — ${COMPANY.name}`,
    'onboarding':    de ? `Onboarding — ${COMPANY.name}` : `Onboarding — ${COMPANY.name}`,
    'ci-cd':         de ? `CI/CD Dokument — ${COMPANY.name}` : `CI/CD Document — ${COMPANY.name}`,
    'cicd-report':   de ? `CI/CD Bericht — ${COMPANY.name}` : `CI/CD Report — ${COMPANY.name}`,
    'cicd-plan':     de ? `Strategieplan — ${COMPANY.name}` : `Strategic Plan — ${COMPANY.name}`,
    'cicd-audit':    de ? `Audit — ${COMPANY.name}` : `Audit — ${COMPANY.name}`
  };
  return titles[type] || `Document — ${clientName || COMPANY.name}`;
}

// ── Build user message from context ──
function buildUserMessage(type, context) {
  const parts = [];

  if (context.title) parts.push(`Document title: ${context.title}`);

  // Client info
  const clientName = context.clientName || context.client || '';
  if (clientName) parts.push(`Client: ${clientName}`);
  if (context.kuerzel) parts.push(`Client code: ${context.kuerzel}`);
  if (context.clientType) parts.push(`Client type/relationship: ${context.clientType}`);
  if (context.contact) parts.push(`Contact person: ${context.contact}`);

  // Date info
  const today = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  parts.push(`Today's date: ${today}`);

  if (context.date) parts.push(`Document date: ${context.date}`);

  // Meeting-specific
  if (context.meetingDate) parts.push(`Meeting date/time: ${context.meetingDate}`);
  if (context.meetingLocation || context.location) parts.push(`Location: ${context.meetingLocation || context.location}`);
  if (context.meetingDuration || context.duration) parts.push(`Duration: ${context.meetingDuration || context.duration}`);
  if (context.meetingAttendees || context.attendees) {
    const att = context.meetingAttendees || context.attendees;
    const list = Array.isArray(att) ? att.join(', ') : att;
    parts.push(`Attendees: ${list}`);
  }

  // Offer-specific
  if (context.offerNr) parts.push(`Offer number: ${context.offerNr}`);
  if (context.validUntil) parts.push(`Valid until: ${context.validUntil}`);

  // Services & pricing
  if (context.services && context.services.length) {
    parts.push(`Services requested: ${Array.isArray(context.services) ? context.services.join(', ') : context.services}`);
  }
  if (context.pricing) {
    parts.push(`Pricing info: ${JSON.stringify(context.pricing)}`);
  }

  // Template (CI/CD)
  if (context.template) parts.push(`Template/topic: ${context.template}`);

  // Notes / free text — capped at 4 KB to prevent prompt injection / cost abuse
  if (context.notes) parts.push(`Additional notes/instructions:\n${String(context.notes).slice(0, 4096)}`);

  // Custom fields
  if (context.custom_fields && Object.keys(context.custom_fields).length) {
    parts.push(`Custom fields: ${JSON.stringify(context.custom_fields)}`);
  }

  // Type-specific additions
  if (type === 'invoice-cover') {
    parts.push('Generate an invoice cover letter / Rechnungsdeckblatt, not a full offer.');
  }
  if (type === 'meeting-agenda') {
    parts.push('Generate a meeting agenda with time-boxed items, not a preparation brief.');
  }
  if (type === 'cicd-report') {
    parts.push('Focus on reporting: results, metrics, status updates.');
  }
  if (type === 'cicd-plan') {
    parts.push('Focus on strategic planning: goals, phases, timeline, resources.');
  }
  if (type === 'cicd-audit') {
    parts.push('Focus on audit: current state assessment, findings, risk matrix, recommendations.');
  }
  if (type === 'team-brief') {
    parts.push('Generate an internal team briefing document with updates, priorities, and action items.');
  }
  if (type === 'onboarding') {
    parts.push('Generate a new team member onboarding document: welcome, tools, processes, contacts, first-week plan.');
  }

  return parts.join('\n');
}

// ═══ HANDLER ═══════════════════════════════════════════
exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') return options();
  if (event.httpMethod !== 'POST') {
    return err('Method not allowed', 405);
  }

  // Auth
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  try {
    const body = JSON.parse(event.body || '{}');
    const { type, client, language, template, context: ctx } = body;

    // Validate required fields
    if (!type) return err('Missing required field: type');

    const lang = language || 'de';
    const context = ctx || {};

    // Merge top-level fields into context
    if (client && !context.clientName) context.clientName = client;
    if (template && !context.template) context.template = template;

    // Resolve prompt — use alias if the exact type has one, otherwise try the type directly
    const promptKey = TYPE_ALIASES[type] || type;
    const promptFn = TYPE_PROMPTS[promptKey];
    if (!promptFn) {
      return err(`Unknown document type: ${type}. Valid types: ${Object.keys(TYPE_PROMPTS).join(', ')}, ${Object.keys(TYPE_ALIASES).join(', ')}`);
    }

    const systemPrompt = promptFn(lang);
    const userMessage = buildUserMessage(type, context);

    console.log(`[document-generate] type=${type} client=${client || 'none'} lang=${lang}`);

    // Call Claude API
    const result = await anthropicPost({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    // Extract HTML from response
    let html = result?.content?.[0]?.text || '';

    // If Claude wrapped the HTML in a code block, extract it
    const codeBlockMatch = html.match(/```(?:html)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      html = codeBlockMatch[1].trim();
    }

    // Generate title
    const title = generateTitle(type, context.clientName || client || '', lang);

    return ok({
      ok: true,
      html,
      title,
      type,
      meta: {
        client: client || context.clientName || null,
        language: lang,
        generated_at: new Date().toISOString(),
        model: 'claude-sonnet-4-20250514'
      }
    });

  } catch (e) {
    console.error(`[document-generate] Error: ${e.message}`);
    return err(`Generation failed: ${e.message}`, 500);
  }
};
