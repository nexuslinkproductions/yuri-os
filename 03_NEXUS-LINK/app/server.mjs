// NEXUS LINK personal work dashboard, zero-dependency Node HTTP server.
// Run: node server.mjs  ->  http://localhost:8472

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './backend/store.mjs';
import { policy } from './backend/policy.mjs';
import { alerts } from './backend/alerts.mjs';
import './backend/rules.mjs'; // subscribes the detection engine to the policy gate

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT) || 8472;

const DRAFTS_DIR = path.join(ROOT, '00_COMMAND-CENTER', 'Inbox', 'content-drafts');
const SIGNALS_DIR = path.join(ROOT, '_SYSTEM', 'signals-radar', 'signals');
const THREADS_INBOX = path.join(ROOT, '_SYSTEM', 'signals-radar', 'threads-inbox');
const CONTENT_ENGINE = path.join(ROOT, '_SYSTEM', 'content-engine');
const LEDGER_PATH = path.join(CONTENT_ENGINE, 'content-ledger.jsonl');
const VOICE_PATH = path.join(CONTENT_ENGINE, 'voice-corpus.json');
const BENCHMARKS_PATH = path.join(__dirname, 'benchmarks.json');
const CONNECTIONS_PATH = path.join(__dirname, 'connections.json');
const INDEX_PATH = path.join(__dirname, 'index.html');
const CATALOG_PATH = path.join(CONTENT_ENGINE, 'references', 'jlee', 'catalog.json');
const MEDIA_DIR = path.join(CONTENT_ENGINE, 'media');
const MEDIA_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
const JLEE_SYNTHESIS_PATH = path.join(CONTENT_ENGINE, 'references', 'jlee', 'SYNTHESIS.md');
const X_SYNTHESIS_PATH = path.join(CONTENT_ENGINE, 'references', 'x', 'X-SYNTHESIS.md');

const STOPWORDS = new Set((
  'the a an and or but of to in on for with at by from as is are was were be been it its this that these those ' +
  'you your we our they their he she his her i me my not no yes so if then than too very just about into over ' +
  'under again more most other some any all each how what when where why who which will would can could should ' +
  'new use using used get got make makes made via out up down off here there now today week month'
).split(' '));

// ---------- helpers ----------

async function readJson(p) {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function atomicWrite(p, content) {
  const tmp = p + '.tmp-' + process.pid + '-' + Date.now();
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, p);
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendErr(res, code, err) {
  sendJson(res, code, { ok: false, error: err });
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1024 * 1024) throw new Error('body_too_large');
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

// ---------- draft files ----------
//
// Format:
//   ---
//   platform: threads
//   ...
//   ---
//
//   body lines...
//
//   ---
//   infographic: none | block
//   media_needed: ...

function splitDraft(raw) {
  const lines = raw.split('\n');
  const seps = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') seps.push(i);
    if (seps.length === 3) break;
  }
  if (seps.length < 2) return null;
  const fmLines = lines.slice(seps[0] + 1, seps[1]);
  const tailStart = seps.length === 3 ? seps[2] : lines.length;
  const body = lines.slice(seps[1] + 1, tailStart).join('\n').trim();
  const tail = seps.length === 3 ? lines.slice(seps[2] + 1) : [];
  return { lines, seps, fmLines, body, tail };
}

function parseFrontmatter(fmLines) {
  const fm = {};
  for (const ln of fmLines) {
    const m = ln.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }
  return fm;
}

function parseTail(tailLines) {
  const out = { infographic: '', media_needed: '' };
  for (let i = 0; i < tailLines.length; i++) {
    const m = tailLines[i].match(/^(infographic|media_needed):\s*(.*)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (val.trim() === '|') {
      const block = [];
      for (let j = i + 1; j < tailLines.length; j++) {
        if (/^\s+\S/.test(tailLines[j])) block.push(tailLines[j].trim());
        else break;
      }
      out[key] = block.join('\n');
    } else {
      out[key] = val.trim();
    }
  }
  return out;
}

function resolveDraft(id) {
  if (typeof id !== 'string' || !id || id.includes('..') || path.isAbsolute(id) || !id.endsWith('.md')) {
    return null;
  }
  const resolved = path.resolve(DRAFTS_DIR, id);
  if (!resolved.startsWith(DRAFTS_DIR + path.sep)) return null;
  return resolved;
}

async function listDrafts() {
  const drafts = [];
  let dates = [];
  try { dates = await fs.readdir(DRAFTS_DIR); } catch { return drafts; }
  for (const date of dates.sort()) {
    const dir = path.join(DRAFTS_DIR, date);
    let stat;
    try { stat = await fs.stat(dir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    const files = await fs.readdir(dir);
    for (const file of files.sort()) {
      if (!file.endsWith('.md')) continue;
      const rel = date + '/' + file;
      const raw = await fs.readFile(path.join(dir, file), 'utf8');
      const parts = splitDraft(raw);
      if (!parts) continue;
      const fm = parseFrontmatter(parts.fmLines);
      const tail = parseTail(parts.tail);
      drafts.push({
        id: rel,
        date,
        file,
        platform: fm.platform || '',
        pillar: fm.pillar || '',
        status: fm.status || 'draft',
        source_signal: fm.source_signal || '',
        created: fm.created || date,
        review_note: fm.review_note || '',
        body: parts.body,
        infographic: tail.infographic,
        media_needed: tail.media_needed,
        chars: parts.body.length,
      });
    }
  }
  return drafts;
}

async function mutateDraft(id, mutator) {
  const resolved = resolveDraft(id);
  if (!resolved) return { code: 400, error: 'id_invalid' };
  let raw;
  try { raw = await fs.readFile(resolved, 'utf8'); }
  catch { return { code: 404, error: 'draft_not_found' }; }
  const parts = splitDraft(raw);
  if (!parts) return { code: 422, error: 'draft_unparseable' };
  const result = mutator(parts);
  if (result.error) return { code: result.code || 400, error: result.error };
  await atomicWrite(resolved, result.raw);
  return { code: 200, draft: result.draft || null };
}

function rebuildWithBody(parts, newBody) {
  const { lines, seps } = parts;
  const head = lines.slice(0, seps[1] + 1);
  const tail = seps.length === 3 ? lines.slice(seps[2]) : ['---'];
  // tail.join already reproduces the original trailing-newline state (the last
  // element is '' when the source file ended with a newline); do not add one.
  return head.join('\n') + '\n\n' + newBody.trim() + '\n\n' + tail.join('\n');
}

function rebuildWithFrontmatter(parts, fmMutate) {
  const { lines, seps } = parts;
  const fmLines = fmMutate([...parts.fmLines]);
  const rest = lines.slice(seps[1] + 1);
  return ['---', ...fmLines, '---', ...rest].join('\n');
}

// ---------- backend spine helpers ----------
//
// Every mutation goes through policy.authorize() BEFORE touching the file,
// and every successful mutation re-indexes the draft into the object store
// (file = text truth, store = graph truth). Indexing is best-effort: a store
// hiccup never breaks an endpoint; a policy deny always does (403).

async function indexDraftFromDisk(id) {
  try {
    const resolved = resolveDraft(id);
    if (!resolved) return;
    const raw = await fs.readFile(resolved, 'utf8');
    const parts = splitDraft(raw);
    if (!parts) return;
    const fm = parseFrontmatter(parts.fmLines);
    const tail = parseTail(parts.tail);
    store.indexDraft(id, { ...fm, infographic: tail.infographic, media_needed: tail.media_needed }, parts.body);
  } catch (err) {
    console.error('[nexus store] indexDraft failed for', id, err.message);
  }
}

async function gated(req, res, action, args) {
  await indexDraftFromDisk(args.id);
  const auth = policy.authorize('dashboard', action, args);
  if (auth.decision !== 'allow') {
    sendErr(res, 403, auth.reason);
    return false;
  }
  return true;
}

// ---------- API handlers ----------

async function apiRadar(res) {
  let dates = [];
  try { dates = (await fs.readdir(SIGNALS_DIR)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort(); }
  catch { return sendJson(res, 200, { date: null, channels: {}, items: [], trends: [] }); }
  if (!dates.length) return sendJson(res, 200, { date: null, channels: {}, items: [], trends: [] });
  const date = dates[dates.length - 1];
  const sweep = await readJson(path.join(SIGNALS_DIR, date, 'signals.json'));
  const items = [...(sweep.items || [])].sort((a, b) => (b.signal || 0) - (a.signal || 0)).slice(0, 12)
    .map(it => ({
      channel: it.channel, title: it.title, url: it.url, summary: it.summary,
      signal: it.signal, signal_label: it.signal_label, source: it.source, who: it.who,
    }));
  const freq = new Map();
  for (const it of sweep.items || []) {
    for (const tok of String(it.title || '').toLowerCase().split(/[^a-z0-9+#]+/)) {
      if (tok.length < 3 || STOPWORDS.has(tok)) continue;
      freq.set(tok, (freq.get(tok) || 0) + 1);
    }
  }
  const trends = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([word, count]) => ({ word, count }));
  sendJson(res, 200, {
    date: sweep.date || date,
    generated_at: sweep.generated_at || null,
    channels: sweep.channels || {},
    items,
    trends,
  });
}

async function apiCompetitors(res) {
  const accounts = [];
  let files = [];
  try { files = (await fs.readdir(THREADS_INBOX)).filter(f => f.endsWith('.json')).sort(); }
  catch { return sendJson(res, 200, { accounts }); }
  for (const f of files) {
    try {
      const data = await readJson(path.join(THREADS_INBOX, f));
      accounts.push({
        account: data.account || f.replace(/\.json$/, ''),
        captured_at: data.captured_at || null,
        posts: (data.posts || []).slice().sort((a, b) => (b.likes || 0) - (a.likes || 0)),
      });
    } catch { /* skip unreadable capture */ }
  }
  sendJson(res, 200, { accounts });
}

async function apiDrafts(res) {
  sendJson(res, 200, { drafts: await listDrafts() });
}

// ---------- creators catalog + media ----------

async function apiCreators(res) {
  try {
    const cat = await readJson(CATALOG_PATH);
    const posts = (cat.posts || []).slice().sort((a, b) => (b.plays ?? -1) - (a.plays ?? -1));
    sendJson(res, 200, {
      creator: cat.creator || '',
      name: cat.name || '',
      followers: cat.followers || 0,
      positioning: cat.positioning || '',
      scraped_at: cat.scraped_at || null,
      posts,
    });
  } catch {
    sendJson(res, 200, { creator: '', name: '', followers: 0, positioning: '', scraped_at: null, posts: [] });
  }
}

// ---------- synthesis parsers (markdown -> structured JSON, nothing hardcoded) ----------

const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function playsValue(str) {
  const m = String(str || '').match(/([\d.]+)\s*([kKmM])?/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  const u = (m[2] || '').toLowerCase();
  if (u === 'k') v *= 1000;
  if (u === 'm') v *= 1000000;
  return Math.round(v);
}

// jlee SYNTHESIS.md uses "## 1. Title" numbered sections.
function numberedSections(md) {
  const out = {};
  const re = /^## (\d+)\.\s+(.+)$/gm;
  const heads = [];
  let m;
  while ((m = re.exec(md))) heads.push({ n: m[1], title: m[2].trim(), end: re.lastIndex, start: m.index });
  heads.forEach((h, i) => {
    out[h.n] = { title: h.title, body: md.slice(h.end, i + 1 < heads.length ? heads[i + 1].start : md.length).trim() };
  });
  return out;
}

// Numbered items shaped like: 1. **Name** (qualifier): body possibly wrapped over lines.
// withQualifier consumes a "(...)" right after the bold name as metadata; without it the
// parenthetical stays in the body (cross-tier patterns carry account names there).
function numberedBoldItems(body, withQualifier) {
  return body.split(/^(?=\d+\.\s)/m)
    .filter(c => /^\d+\./.test(c.trim()))
    .map(c => {
      const m = withQualifier
        ? c.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*(?:\(([^)]*)\))?\s*([\s\S]*)$/)
        : c.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*([\s\S]*)$/);
      if (!m) return null;
      const item = { n: +m[1], name: m[2].trim() };
      const rest = withQualifier ? m[4] : m[3];
      if (withQualifier) item.qualifier = (m[3] || '').trim();
      // strip leading separator punctuation only (dash/colon); keep a leading "("
      // so parenthetical account lists stay balanced
      item.body = flat(rest).replace(/^[-–—:]+\s*/, '');
      return item;
    })
    .filter(Boolean);
}

function parseTaxonomyTable(body) {
  const rows = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|') || /^\|[\s:|-]+\|$/.test(t)) continue;
    const cells = t.slice(1, -1).split('|').map(s => s.trim());
    if (cells.length < 3 || /^hook type$/i.test(cells[0])) continue;
    rows.push({
      type: cells[0],
      example: cells[1].replace(/^"|"$/g, ''),
      plays: cells[2],
      playsValue: playsValue(cells[2]),
    });
  }
  return rows;
}

const RECEIPT_STOP = new Set(('this that with from your their every whole thing code guide link setup comment will have just ' +
  'like into over them they what when where which there here about').split(' '));

// Receipts are derived, never listed by hand: primary match by plays proximity
// to the taxonomy row's own plays figure, extras by keyword overlap with the
// row's hook type/example against caption+topic.
function attachReceipts(rows, posts) {
  for (const row of rows) {
    const receipts = [];
    let primary = null, best = Infinity;
    if (row.playsValue) {
      for (const p of posts) {
        if (!p.plays) continue;
        const d = Math.abs(p.plays - row.playsValue) / row.playsValue;
        if (d < best) { best = d; primary = p; }
      }
      if (primary && best > 0.15) primary = null;
    }
    const tokens = (row.type + ' ' + row.example).toLowerCase().split(/[^a-z0-9]+/)
      .filter(t => t.length >= 4 && !RECEIPT_STOP.has(t));
    const scored = posts
      .filter(p => p !== primary)
      .map(p => {
        const hay = (String(p.caption || '') + ' ' + String(p.topic || '')).toLowerCase();
        let s = 0;
        for (const t of tokens) if (hay.includes(t)) s++;
        return { p, s };
      })
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || (b.p.plays || 0) - (a.p.plays || 0));
    if (primary) receipts.push(primary);
    for (const x of scored.slice(0, Math.max(0, 3 - receipts.length))) receipts.push(x.p);
    row.receipts = receipts.map(p => ({
      url: p.url, date: p.date, type: p.type,
      plays: p.plays ?? null, likes: p.likes ?? null, comments: p.comments ?? null,
      caption: p.caption || '',
    }));
  }
  return rows;
}

function parseRefusals(body) {
  const text = flat(body);
  const dot = text.indexOf('. ');
  if (dot === -1) return { items: [], note: text };
  const items = text.slice(0, dot).split(/,\s*/).map(s => s.trim().replace(/\.$/, '')).filter(Boolean);
  return { items, note: text.slice(dot + 2).trim() };
}

function parseJleeSynthesis(md, posts) {
  const title = flat((md.match(/^#\s+(.+)$/m) || [])[1] || '');
  const intro = flat((md.match(/^#[^\n]*\n+([\s\S]*?)(?=\n---|\n## )/) || [])[1] || '');
  const sec = numberedSections(md);
  const skeleton = sec['1'] ? numberedBoldItems(sec['1'].body, true).map(b => ({
    n: b.n, name: b.name, qualifier: b.qualifier, description: b.body,
  })) : [];
  let taxonomy = sec['2'] ? parseTaxonomyTable(sec['2'].body) : [];
  taxonomy = attachReceipts(taxonomy, posts);
  const taxNoteM = sec['2'] ? sec['2'].body.match(/\n\s*\n(Pattern:[\s\S]+)$/) : null;
  const moves = sec['4'] ? numberedBoldItems(sec['4'].body, false).map(b => ({ n: b.n, title: b.name, body: b.body })) : [];
  const refusals = sec['5'] ? parseRefusals(sec['5'].body) : { items: [], note: '' };
  return {
    present: true, title, intro,
    skeleton, skeletonTitle: sec['1'] ? sec['1'].title : '',
    taxonomy, taxonomyTitle: sec['2'] ? sec['2'].title : '', taxonomyNote: taxNoteM ? flat(taxNoteM[1]) : '',
    moves, movesTitle: sec['4'] ? sec['4'].title : '',
    refusals, refusalsTitle: sec['5'] ? sec['5'].title : '',
  };
}

function parseXSynthesis(md) {
  const title = flat((md.match(/^#\s+(.+)$/m) || [])[1] || '');
  const methodM = md.match(/Method:\s*([\s\S]*?)(?=\n\n)/);
  const method = methodM ? flat('Method: ' + methodM[1]) : '';
  const headlineM = md.match(/Headline finding:\s*([\s\S]*?)(?=\n\n)/);
  const headline = headlineM ? flat(headlineM[1]).replace(/\*\*/g, '') : '';

  const followers = {};
  if (methodM) {
    for (const m of methodM[0].matchAll(/([a-z][\w.]*)\s+\(([\d.]+[kKmM])\)/g)) followers[m[1]] = m[2];
  }

  // per-account sections: "### karpathy - the professor in lowercase"
  const accounts = [];
  const accMap = {};
  const accRe = /^### (\S+)\s+\S+\s+(.+)$/gm;
  const heads = [];
  let m;
  while ((m = accRe.exec(md))) heads.push({ name: m[1], epithet: m[2].trim(), end: accRe.lastIndex, start: m.index });
  heads.forEach((h, i) => {
    const body = md.slice(h.end, i + 1 < heads.length ? heads[i + 1].start : md.length);
    const moveM = body.match(/Move to steal:\s*([\s\S]*?)(?=\n\s*\n|\n## |$)/);
    const acc = {
      name: h.name, epithet: h.epithet,
      followers: followers[h.name] || '',
      move: moveM ? flat(moveM[1]) : '',
    };
    accounts.push(acc);
    accMap[h.name] = acc;
  });

  const ctM = md.match(/## Cross-tier patterns[^\n]*\n([\s\S]*?)(?=\n## |$)/);
  const patterns = ctM ? numberedBoldItems(ctM[1], false).map(b => {
    const names = Object.keys(followers).filter(n => b.body.includes(n) || b.name.includes(n));
    return {
      n: b.n, name: b.name, body: b.body,
      receipts: names.map(n => ({
        account: n,
        followers: accMap[n] ? accMap[n].followers : (followers[n] || ''),
        epithet: accMap[n] ? accMap[n].epithet : '',
        move: accMap[n] ? accMap[n].move : '',
      })),
    };
  }) : [];

  return { present: true, title, method, headline, accounts, patterns };
}

async function apiSynthesis(res) {
  let posts = [];
  try { posts = (await readJson(CATALOG_PATH)).posts || []; } catch { /* catalog optional */ }
  let jlee = null, x = null;
  try { jlee = parseJleeSynthesis(await fs.readFile(JLEE_SYNTHESIS_PATH, 'utf8'), posts); } catch { jlee = { present: false }; }
  try { x = parseXSynthesis(await fs.readFile(X_SYNTHESIS_PATH, 'utf8')); } catch { x = { present: false }; }
  sendJson(res, 200, { jlee, x });
}

async function serveMedia(res, pathname) {
  let name;
  try { name = decodeURIComponent(pathname.slice('/media/'.length)); }
  catch { return sendErr(res, 404, 'not_found'); }
  if (!name || name !== path.basename(name)) return sendErr(res, 404, 'not_found');
  const type = MEDIA_TYPES[path.extname(name).toLowerCase()];
  if (!type) return sendErr(res, 404, 'not_found');
  const resolved = path.resolve(MEDIA_DIR, name);
  if (!resolved.startsWith(MEDIA_DIR + path.sep)) return sendErr(res, 404, 'not_found');
  try {
    const data = await fs.readFile(resolved);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    sendErr(res, 404, 'not_found');
  }
}

async function apiDraftEdit(req, res) {
  const { id, body } = await readBody(req);
  if (typeof body !== 'string' || !body.trim()) return sendErr(res, 400, 'body_required');
  if (!(await gated(req, res, 'draft.edit', { id }))) return;
  const out = await mutateDraft(id, (parts) => ({
    raw: rebuildWithBody(parts, body),
    draft: { id, chars: body.trim().length },
  }));
  if (out.error) return sendErr(res, out.code, out.error);
  await indexDraftFromDisk(id);
  sendJson(res, 200, { ok: true, id, chars: out.draft.chars });
}

async function apiDraftApprove(req, res) {
  const { id } = await readBody(req);
  if (!(await gated(req, res, 'draft.approve', { id }))) return;
  const out = await mutateDraft(id, (parts) => ({
    raw: rebuildWithFrontmatter(parts, (fm) => fm.map(l => /^status:/.test(l) ? 'status: approved' : l)),
  }));
  if (out.error) return sendErr(res, out.code, out.error);
  store.relate(id, 'marcel', 'approved-by');
  await indexDraftFromDisk(id);
  sendJson(res, 200, { ok: true, id, status: 'approved' });
}

async function apiDraftDisapprove(req, res) {
  const { id, note } = await readBody(req);
  const safeNote = String(note || '').replace(/[\r\n]+/g, ' ').trim();
  if (!safeNote) return sendErr(res, 400, 'note_required');
  if (!(await gated(req, res, 'draft.disapprove', { id }))) return;
  const out = await mutateDraft(id, (parts) => ({
    raw: rebuildWithFrontmatter(parts, (fm) => {
      const next = fm.map(l => /^status:/.test(l) ? 'status: rejected' : l)
        .filter(l => !/^review_note:/.test(l));
      next.push('review_note: ' + safeNote);
      return next;
    }),
  }));
  if (out.error) return sendErr(res, out.code, out.error);
  store.unrelate(id, 'marcel', 'approved-by');
  await indexDraftFromDisk(id);
  sendJson(res, 200, { ok: true, id, status: 'rejected' });
}

async function apiQueue(res) {
  const drafts = (await listDrafts()).filter(d => d.status === 'approved');
  drafts.sort((a, b) => (a.created + a.id).localeCompare(b.created + b.id));
  sendJson(res, 200, { queue: drafts });
}

async function apiQueuePosted(req, res) {
  const { id, permalink } = await readBody(req);
  if (typeof permalink !== 'string' || !permalink.trim()) return sendErr(res, 400, 'permalink_required');
  const drafts = await listDrafts();
  const draft = drafts.find(d => d.id === id);
  if (!draft) return sendErr(res, 404, 'draft_not_found');
  if (!(await gated(req, res, 'post.execute', { id, permalink: permalink.trim() }))) return;
  const out = await mutateDraft(id, (parts) => ({
    raw: rebuildWithFrontmatter(parts, (fm) => fm.map(l => /^status:/.test(l) ? 'status: posted' : l)),
  }));
  if (out.error) return sendErr(res, out.code, out.error);
  const entry = { ts: new Date().toISOString(), platform: draft.platform, file: id, permalink: permalink.trim() };
  await fs.mkdir(CONTENT_ENGINE, { recursive: true });
  await fs.appendFile(LEDGER_PATH, JSON.stringify(entry) + '\n', 'utf8');
  await indexDraftFromDisk(id);
  sendJson(res, 200, { ok: true, entry });
}

async function apiLedger(res) {
  const entries = [];
  if (await exists(LEDGER_PATH)) {
    const raw = await fs.readFile(LEDGER_PATH, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try { entries.push(JSON.parse(line)); } catch { /* skip bad line */ }
    }
  }
  sendJson(res, 200, { entries });
}

async function apiVoice(res) {
  if (!(await exists(VOICE_PATH))) return sendJson(res, 200, { voice: null });
  const v = await readJson(VOICE_PATH);
  sendJson(res, 200, {
    voice: {
      account: v.account || '',
      bio: v.bio || '',
      note: v.note || '',
      eras: v.eras || {},
      voice_facts: v.voice_facts || {},
      posts: (v.posts || []).map(p => ({ posted: p.posted, likes: p.likes, replies: p.replies, text: p.text })),
    },
  });
}

async function apiBenchmarks(res) {
  try { sendJson(res, 200, { items: await readJson(BENCHMARKS_PATH) }); }
  catch { sendJson(res, 200, { items: [] }); }
}

async function apiConnections(res) {
  try { sendJson(res, 200, { connections: await readJson(CONNECTIONS_PATH) }); }
  catch { sendJson(res, 200, { connections: [] }); }
}

// ---------- router ----------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      const html = await fs.readFile(INDEX_PATH);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    }
    if (req.method === 'GET' && p === '/api/health') return sendJson(res, 200, { ok: true });
    if (req.method === 'GET' && p === '/api/radar') return await apiRadar(res);
    if (req.method === 'GET' && p === '/api/competitors') return await apiCompetitors(res);
    if (req.method === 'GET' && p === '/api/creators') return await apiCreators(res);
    if (req.method === 'GET' && p === '/api/synthesis') return await apiSynthesis(res);
    if (req.method === 'GET' && p.startsWith('/media/')) return await serveMedia(res, p);
    if (req.method === 'GET' && p === '/api/drafts') return await apiDrafts(res);
    if (req.method === 'POST' && p === '/api/drafts/edit') return await apiDraftEdit(req, res);
    if (req.method === 'POST' && p === '/api/drafts/approve') return await apiDraftApprove(req, res);
    if (req.method === 'POST' && p === '/api/drafts/disapprove') return await apiDraftDisapprove(req, res);
    if (req.method === 'GET' && p === '/api/queue') return await apiQueue(res);
    if (req.method === 'POST' && p === '/api/queue/posted') return await apiQueuePosted(req, res);
    if (req.method === 'GET' && p === '/api/ledger') return await apiLedger(res);
    if (req.method === 'GET' && p === '/api/voice') return await apiVoice(res);
    if (req.method === 'GET' && p === '/api/benchmarks') return await apiBenchmarks(res);
    if (req.method === 'GET' && p === '/api/connections') return await apiConnections(res);
    if (req.method === 'GET' && p === '/api/alerts') return sendJson(res, 200, alerts.getBanner());

    if (p.startsWith('/api/')) return sendErr(res, 404, 'not_found');
    sendErr(res, 404, 'not_found');
  } catch (err) {
    sendErr(res, err instanceof SyntaxError ? 400 : 500, err instanceof SyntaxError ? 'bad_json' : 'server_error');
  }
});

server.listen(PORT, () => {
  console.log(`NEXUS LINK dashboard on http://localhost:${PORT}`);
});
