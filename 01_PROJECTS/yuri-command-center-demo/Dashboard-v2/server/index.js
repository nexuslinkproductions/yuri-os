'use strict';

// Load env vars from /opt/nex/.env (production) or .env (local dev)
const path = require('path');
const envPath = process.env.NEX_ENV_FILE || path.join(__dirname, '../../.env');
try { require('dotenv').config({ path: envPath }); } catch {}

const express = require('express');
const { netlifyadapter } = require('./netlify-adapter');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Safe-load wrapper: a bad module can't crash the whole server.
function fn(modulePath) {
  let handler = null;
  let loadErr = null;
  try { handler = require(modulePath); } catch (e) { loadErr = e; }
  return async (req, res) => {
    if (loadErr) {
      console.error(`[server] Load failed ${modulePath}: ${loadErr.message}`);
      return res.status(503).json({ error: 'Handler unavailable', detail: loadErr.message });
    }
    try {
      await netlifyadapter(handler)(req, res);
    } catch (e) {
      console.error(`[server] Handler error ${modulePath}: ${e.message}`);
      res.status(500).json({ error: 'Internal error', detail: e.message });
    }
  };
}

// ── Health ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── Webhooks ──────────────────────────────────────────────────────────
app.all('/.netlify/functions/plane-webhook',      fn('../netlify/functions/plane-webhook'));
app.all('/.netlify/functions/outlook-webhook',    fn('../netlify/functions/outlook-webhook'));
app.all('/.netlify/functions/event-dispatch',     fn('../netlify/functions/event-dispatch'));
app.all('/.netlify/functions/outlook-subscribe',  fn('../netlify/functions/outlook-subscribe'));
app.all('/.netlify/functions/outlook-sync',       fn('../netlify/functions/outlook-sync'));

// ── MCP server ────────────────────────────────────────────────────────
app.all('/.netlify/functions/mcp-server', fn('../netlify/functions/mcp-server'));

// ── Auth ──────────────────────────────────────────────────────────────
app.all('/.netlify/functions/auth',       fn('../netlify/functions/auth'));
app.all('/.netlify/functions/auth-check', fn('../netlify/functions/auth-check'));

// ── API endpoints ─────────────────────────────────────────────────────
app.all('/.netlify/functions/chat',                    fn('../netlify/functions/chat'));
app.all('/.netlify/functions/context-engine',          fn('../netlify/functions/context-engine'));
app.all('/.netlify/functions/document-generate',       fn('../netlify/functions/document-generate'));
app.all('/.netlify/functions/offer-accept',            fn('../netlify/functions/offer-accept'));
app.all('/.netlify/functions/offer-create',            fn('../netlify/functions/offer-create'));
app.all('/.netlify/functions/pipeline-email-draft',    fn('../netlify/functions/pipeline-email-draft'));
app.all('/.netlify/functions/pipeline-move',           fn('../netlify/functions/pipeline-move'));
app.all('/.netlify/functions/plan',                    fn('../netlify/functions/plan'));
app.all('/.netlify/functions/plane',                   fn('../netlify/functions/plane'));
app.all('/.netlify/functions/nex-rag-query',           fn('../netlify/functions/nex-rag-query'));
app.all('/.netlify/functions/nexbox-fleet',            fn('../netlify/functions/nexbox-fleet'));
app.all('/.netlify/functions/nlp-ticket',              fn('../netlify/functions/nlp-ticket'));
app.all('/.netlify/functions/production-hub',          fn('../netlify/functions/production-hub'));
app.all('/.netlify/functions/client-update',           fn('../netlify/functions/client-update'));
app.all('/.netlify/functions/client-meeting-note',     fn('../netlify/functions/client-meeting-note'));
app.all('/.netlify/functions/marketing-studio',        fn('../netlify/functions/marketing-studio'));
app.all('/.netlify/functions/fanny-ai',                fn('../netlify/functions/fanny-ai'));
app.all('/.netlify/functions/analyze-meeting',         fn('../netlify/functions/analyze-meeting'));
app.all('/.netlify/functions/push-meeting-to-obsidian',fn('../netlify/functions/push-meeting-to-obsidian'));
app.all('/.netlify/functions/meeting-followup',        fn('../netlify/functions/meeting-followup'));
app.all('/.netlify/functions/meeting-research',        fn('../netlify/functions/meeting-research'));
app.all('/.netlify/functions/intel-retrieval-stats',   fn('../netlify/functions/intel-retrieval-stats'));
app.all('/.netlify/functions/predictive-intel',        fn('../netlify/functions/predictive-intel'));
app.all('/.netlify/functions/calendar-schedule-event', fn('../netlify/functions/calendar-schedule-event'));
app.all('/.netlify/functions/schedule-list',           fn('../netlify/functions/schedule-list'));
app.all('/.netlify/functions/schedule-plan-ticket',    fn('../netlify/functions/schedule-plan-ticket'));
app.all('/.netlify/functions/decision-outcome',        fn('../netlify/functions/decision-outcome'));
app.all('/.netlify/functions/config-public',           fn('../netlify/functions/config-public'));
app.all('/.netlify/functions/health',                  fn('../netlify/functions/health'));

// ── Scheduled (PM2 cron calls via localhost) ──────────────────────────
app.post('/_internal/scheduled/telegram-digest',       fn('../netlify/functions/telegram-digest'));
app.post('/_internal/scheduled/telegram-prebrief',     fn('../netlify/functions/telegram-prebrief'));
app.post('/_internal/scheduled/telegram-proactive',    fn('../netlify/functions/telegram-proactive'));
app.post('/_internal/scheduled/telegram-eod',          fn('../netlify/functions/telegram-eod'));
app.post('/_internal/scheduled/telegram-team-digest',  fn('../netlify/functions/telegram-team-digest'));
app.post('/_internal/scheduled/telegram-fk-digest',    fn('../netlify/functions/telegram-fk-digest'));
app.post('/_internal/scheduled/telegram-fact-changes', fn('../netlify/functions/telegram-fact-changes'));
app.post('/_internal/scheduled/metrics-snapshot',      fn('../netlify/functions/metrics-snapshot'));
app.post('/_internal/scheduled/deep-learning',         fn('../netlify/functions/deep-learning'));

// ── 404 handler ───────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'not found' }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] NEX API running on port ${PORT}`);
});

module.exports = app;
