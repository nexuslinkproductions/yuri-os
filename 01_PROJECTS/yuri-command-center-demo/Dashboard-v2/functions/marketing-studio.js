/**
 * marketing-studio.js — AI Marketing Document Generator for Fanny
 *
 * GET  ?action=history                    → list of recent docs (no html_content)
 * GET  ?action=get_doc&doc_id=<uuid>      → full html_content for one doc
 * POST body: { client_code, doc_type, title, prompt, files?, created_by? }
 *   → generates HTML via Claude, stores in Supabase, returns html + doc_id
 *
 * Auth: X-Internal-Key header
 */

const https = require('https');
const path = require('path');
const { CORS, ok, err, options, anthropicPost } = require('./shared');

const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// Load per-client brand configs
const BRAND_CONFIGS = (() => {
  try { return require('./brand-configs.json'); } catch { return {}; }
})();

// ── Client registry ──
const CLIENTS = {
  'ALP':  'ALPHAVIVO AG',
  'ALPEA':'ALPEAHOMES',
  'BABA': 'Schafmilchkäserei Koster GmbH',
  'BAL':  'Balas Pflästererungen GmbH',
  'BBA':  'BBA Baumaschinen AG',
  'BOV':  'Boviro Security AG',
  'CARN': 'Carnuccio ReinXpert',
  'CASA': 'CASA Solution',
  'CHI':  'Chicano Conceptstore',
  'GANZ': 'GANZ BOATS AG',
  'GLG':  'Gianluca Giardino GmbH',
  'GRYD': 'GRYD SWISS',
  'ISO':  'Isorol Tacker AG',
  'KAP':  'Kappiserie GmbH',
  'MFB':  'Med For Balance GmbH',
  'NOBA': 'NOBA Shop',
  'OREA': 'OREA CARE',
  'P2S':  'Power2Sales',
  'PDRT': 'PDR Tech',
  'RIBO': 'Carosserie RIBO GmbH',
  'SHI':  'SHIPSTER AG',
  'SLT':  'SLTECH GmbH',
  'UPG':  'UPGREAT AG',
};

const DOC_TYPES = {
  'campaign-report':   'Campaign Report',
  'social-brief':      'Social Media Brief',
  'reel-brief':        'Reel Brief',
  'content-calendar':  'Content Calendar',
  'proposal':          'Services Proposal',
  'meeting-prep':      'Meeting Preparation',
  'brand-guidelines':  'Brand Guidelines',
  'post-copy':         'Post Copy & Captions',
};

// ── Build per-client system prompt with brand tokens ──
function buildSystemPrompt(clientCode) {
  const brand = BRAND_CONFIGS[clientCode] || {};

  // Style templates matching CEO reference docs
  const styleGuides = {
    luxury: `
DESIGN STYLE — Warm Luxury (like CASA Privera reference):
- Page background: ${brand.bg || '#FAF5EF'} (warm cream)
- Card/panel background: ${brand.paper || '#FFFFFF'}
- Primary accent: ${brand.primary || '#C5B09A'} — use for headings, borders, cover backgrounds, highlights
- Secondary: ${brand.secondary || '#1A1613'} — dark ink for emphasis
- Main text: ${brand.ink || '#1A1613'}
- Muted/labels: ${brand.muted || '#A89E93'}
- Dividers/lines: ${brand.line || '#ECE2D5'}
- Font: ${brand.font || 'Georgia, serif'} — elegant, warm
- Cover page: full-width accent-color gradient header, centered white title, client logo placeholder SVG
- Section dividers: thin colored rules, not heavy borders
- KPI cards: warm bordered boxes, accent-color number, label in muted
- Tables: alternating cream/white rows, colored header row`,

    corporate: `
DESIGN STYLE — Clean Corporate (like SLT/UPG Vertrieb reference):
- Page background: ${brand.bg || '#EEF2F5'} (light cool grey)
- Card/panel background: ${brand.paper || '#FFFFFF'}
- Primary accent: ${brand.primary || '#1AA8DD'} — buttons, headers, accent borders, sidebar accents
- Secondary: ${brand.secondary || '#0E1726'} — deep ink for headings
- Main text: ${brand.ink || '#1a1a2e'}
- Muted/labels: ${brand.muted || '#6B7280'}
- Dividers/lines: ${brand.line || '#E5E7EB'}
- Font: ${brand.font || 'system-ui, -apple-system, sans-serif'} — clean, modern
- Cover: two-column layout — left accent bar + large title, right summary box with key stats
- Sidebar elements: left accent-colored vertical bar on section headers
- KPI cards: white cards with colored top border, metric large + bold
- Tables: clean with colored thead, hover effect described in CSS`,

    bold: `
DESIGN STYLE — Bold & Impactful:
- Page background: ${brand.bg || '#F8F9FA'}
- Card/panel background: ${brand.paper || '#FFFFFF'}
- Primary accent: ${brand.primary || '#FFD60A'} — strong, high-contrast accents and highlights
- Secondary: ${brand.secondary || '#111111'} — near-black for headings and structure
- Main text: ${brand.ink || '#111827'}
- Muted/labels: ${brand.muted || '#6B7280'}
- Dividers/lines: ${brand.line || '#E5E5E5'}
- Font: ${brand.font || 'system-ui, -apple-system, sans-serif'} — bold weight (800+) for headings
- Cover: full-bleed dark (secondary color) header, large accent-colored headline, bold subtitle
- KPI cards: dark background, accent-colored numbers, white labels
- Tables: minimal, dark header row, clean rows`,

    nature: `
DESIGN STYLE — Natural & Organic:
- Page background: ${brand.bg || '#F2F7F4'} (soft green-white)
- Card/panel background: ${brand.paper || '#FFFFFF'}
- Primary accent: ${brand.primary || '#2D7A4F'} — nature green for accents and structure
- Secondary: ${brand.secondary || '#1A2E21'} — deep forest for headings
- Main text: ${brand.ink || '#1A2E21'}
- Muted/labels: ${brand.muted || '#6B8C74'}
- Dividers/lines: ${brand.line || '#C5DED5'}
- Font: ${brand.font || 'system-ui, -apple-system, sans-serif'} — clean, approachable
- Cover: natural gradient (accent light to white), rounded elements, leaf/organic SVG icon placeholder
- KPI cards: soft green-tinted backgrounds, colored left border
- Tables: alternating white/light-green rows`
  };

  const styleGuide = styleGuides[brand.style || 'corporate'];

  return `You are EXEO Designer, the marketing document generator for c2moviez GmbH.

PRODUCER (c2moviez):
- Name: c2moviez GmbH | Creative Technology
- Address: Hedi-Lang-Strasse 5, 8620 Wetzikon, Switzerland
- Email: info@c2moviez.com | Phone: +41 78 317 85 85 | Website: c2moviez.com
- CEO: Claudio Tinner | Marketing Manager: Fanny Kecskes
- MwSt-Nr: CHE-252.263.743 (8.1% VAT)

CLIENT BRAND — ${brand.name || clientCode}:
- Industry: ${brand.industry || 'Swiss business'}
- Primary color: ${brand.primary || '#1AA8DD'}
- Secondary color: ${brand.secondary || '#0E1726'}
${styleGuide}

UNIVERSAL RULES:
- Language: German for all client-facing documents (unless prompt specifies English)
- Include visual KPI/metric cards wherever data is present — use large numbers, colored accents
- Charts and data: pure HTML+CSS only — bar charts as styled divs, no canvas/chart.js
- c2moviez footer on every page: address, phone, email, MwSt-Nr, in muted small text
- Always include a professional cover/header section with: document title, client name, date, prepared by Fanny Kecskes / c2moviez
- Minimum 3 rich sections of content
- Tables: always styled with headers and alternating rows
- Print-ready: page-break-before on major sections, generous margins

OUTPUT: ONLY the complete HTML document. <!DOCTYPE html> through </html>. No markdown, no explanation.
All CSS in <style> tag. No external CSS files. Google Fonts via @import URL are allowed.`;
}

// ── Supabase helpers ──
function sbRequest(method, path, body) {
  return new Promise((resolve) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) { resolve(null); return; }
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(method === 'POST' ? { 'Prefer': 'return=representation' } : {}),
      },
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Handler ──
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();

  const provided = event.headers['x-internal-key'];
  if (!INTERNAL_KEY || !provided || provided !== INTERNAL_KEY) return err('Unauthorized', 401);

  const qs = event.queryStringParameters || {};

  // GET: brand configs (for frontend client picker)
  if (event.httpMethod === 'GET' && qs.action === 'brands') {
    return ok({ brands: BRAND_CONFIGS });
  }

  // GET: history list
  if (event.httpMethod === 'GET' && qs.action === 'history') {
    const rows = await sbRequest('GET',
      'marketing_docs?select=id,created_at,client_code,doc_type,title,created_by,file_size_bytes,telegram_sent&order=created_at.desc&limit=50',
      null
    );
    return ok({ docs: Array.isArray(rows) ? rows : [] });
  }

  // GET: single doc html
  if (event.httpMethod === 'GET' && qs.action === 'get_doc' && qs.doc_id) {
    const rows = await sbRequest('GET',
      `marketing_docs?id=eq.${qs.doc_id}&select=id,title,client_code,doc_type,html_content`,
      null
    );
    if (!Array.isArray(rows) || !rows[0]) return err('Not found', 404);
    return ok(rows[0]);
  }

  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('Invalid JSON'); }

  const { client_code, doc_type, title, prompt, files = [], created_by = 'FK' } = body;
  if (!client_code || !doc_type || !title || !prompt) {
    return err('client_code, doc_type, title, prompt are required');
  }

  const clientName = CLIENTS[client_code] || client_code;
  const docTypeName = DOC_TYPES[doc_type] || doc_type;

  // Build Claude message content
  const textBlock = {
    type: 'text',
    text: `Generate a complete "${docTypeName}" document for client: ${clientName} (${client_code})

Document title: ${title}

Instructions from marketing manager:
${prompt}

Output ONLY the complete HTML document. No explanations, no markdown fences.`,
  };

  const msgContent = [textBlock];

  // Attach up to 3 images
  for (const f of files.slice(0, 3)) {
    if (f.type && f.type.startsWith('image/') && f.data) {
      msgContent.push({
        type: 'image',
        source: { type: 'base64', media_type: f.type, data: f.data },
      });
    }
  }

  let html;
  try {
    const resp = await anthropicPost({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: buildSystemPrompt(client_code),
      messages: [{ role: 'user', content: msgContent }],
    });
    html = resp?.content?.[0]?.text;
    if (!html) return err('AI returned no content', 502);
    // Strip markdown fences if AI wraps in them
    html = html.replace(/^```html\s*/i, '').replace(/\s*```\s*$/, '').trim();
  } catch (e) {
    return err('AI generation failed: ' + (e.message || 'unknown'), 500);
  }

  // Store in Supabase
  const docRow = {
    client_code,
    doc_type,
    title,
    prompt: prompt.slice(0, 2000),
    html_content: html,
    created_by,
    file_size_bytes: Buffer.byteLength(html, 'utf8'),
    telegram_sent: false,
  };

  let docId = null;
  const inserted = await sbRequest('POST', 'marketing_docs', docRow);
  if (Array.isArray(inserted) && inserted[0]?.id) {
    docId = inserted[0].id;
  }

  return ok({ html, doc_id: docId, client_name: clientName, doc_type_name: docTypeName });
};
