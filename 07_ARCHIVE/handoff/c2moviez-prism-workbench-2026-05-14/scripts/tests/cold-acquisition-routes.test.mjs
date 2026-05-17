#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3342;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /NUDIMMUD_BACKEND_ONLINE/;

const repoScratch = path.join(process.cwd(), '.tmp');
fs.mkdirSync(repoScratch, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(repoScratch, 'cold-acquisition-routes-'));
const appDbPath = path.join(tempDir, 'app.db');
const memoryDbPath = path.join(tempDir, 'memory.db');

let child = null;

try {
  child = await startBackend();

  const anonymous = await request('GET', '/api/cold-acquisition/leads');
  assert.equal(anonymous.status, 401, 'cold acquisition leads should require auth');

  const created = await request('POST', '/api/cold-acquisition/leads', swissLeadBody(), API_KEY);
  assert.equal(created.status, 201, 'lead endpoint should create a lead');
  assert.equal(created.json.lead.company.name, 'Alpine Bio Analytics AG');
  assert.equal(created.json.lead.scoring.total_score, 96);
  assert.equal(typeof created.json.lead.scoring.evidence_score, 'number');
  assert.equal(typeof created.json.lead.scoring.personalization_score, 'number');
  assert.equal(created.json.lead.channel, 'both');

  const blockedAdminSend = await request('PATCH', `/api/cold-acquisition/leads/${created.json.lead.id}`, {
    status: 'sent',
    crm_stage: 'sent'
  }, API_KEY);
  assert.equal(blockedAdminSend.status, 409, 'admin patch should not bypass send compliance gate');
  assert.equal(blockedAdminSend.json.error, 'COMPLIANCE_SEND_BLOCKED');

  const atCreated = await request('POST', '/api/cold-acquisition/leads', austriaLeadBody(), API_KEY);
  assert.equal(atCreated.status, 201, 'AT lead endpoint should create a lead');
  assert.equal(atCreated.json.lead.channel, 'linkedin');
  assert.equal(atCreated.json.lead.outreach_drafts.email_cold, null);

  const zefixIngest = await request('POST', '/api/cold-acquisition/ingest/zefix-bulk', {
    records: [
      {
        name: 'Romandie SaaS Growth AG',
        uid: 'CHE555111222',
        status: 'ACTIVE',
        legal_form: 'AG',
        canton: 'VD',
        city: 'Lausanne',
        postal_code: '1003',
        date_of_entry: '2026-03-02',
        employee_count: 18,
        industry: 'SaaS',
        website: 'https://romandie-growth.com/en',
        linkedin_url: 'https://linkedin.com/company/romandie-growth',
        source_url: 'https://www.zefix.ch/en/search/entity/list/firm/555111222',
        purpose: 'Builds English-language SaaS growth tools for international hospitality groups.'
      }
    ]
  }, API_KEY);
  assert.equal(zefixIngest.status, 201, 'Zefix bulk fixture endpoint should ingest records');
  assert.equal(zefixIngest.json.result.created, 1);

  const austriaIngest = await request('POST', '/api/cold-acquisition/ingest/austria-directory', {
    records: [
      {
        source: 'wko',
        name: 'Ottakring Hospitality Tech GmbH',
        fn: 'FN123456x',
        bezirk: '1160',
        postal_code: '1160',
        city: 'Wien',
        legal_form: 'GmbH',
        employee_count: 22,
        industry: 'hospitality tech',
        website: 'https://ottakring-hospitality.at/en',
        linkedin_url: 'https://linkedin.com/company/ottakring-hospitality',
        contact_name: 'Eva Bauer',
        contact_title: 'Managing Director',
        contact_email: 'business@ottakring-hospitality.at',
        contact_linkedin_url: 'https://linkedin.com/in/eva-bauer',
        source_url: 'https://firmen.wko.at/ottakring-hospitality',
        published_b2b_email: true,
        evidence_detail: 'The English services page targets international hotel operators.'
      }
    ]
  }, API_KEY);
  assert.equal(austriaIngest.status, 201, 'AT directory fixture endpoint should ingest records');
  assert.equal(austriaIngest.json.result.created, 1);

  const list = await request('GET', '/api/cold-acquisition/leads', null, API_KEY);
  assert.equal(list.status, 200, 'lead list should be readable');
  assert.equal(list.json.leads.length, 4);

  const dashboard = await request('GET', '/api/cold-acquisition/dashboard', null, API_KEY);
  assert.equal(dashboard.status, 200, 'dashboard should be readable');
  assert.equal(dashboard.json.dashboard.total_leads, 4);
  assert.equal(dashboard.json.dashboard.market_split.CH, 2);
  assert.equal(dashboard.json.dashboard.market_split.AT, 2);

  const patched = await request('PATCH', `/api/cold-acquisition/leads/${created.json.lead.id}`, {
    notes: 'Fanny reviewed the English biotech angle.',
    outreach_drafts: {
      ...created.json.lead.outreach_drafts,
      linkedin_intro: `${created.json.lead.outreach_drafts.linkedin_intro} Fanny reviewed this for manual send.`
    }
  }, API_KEY);
  assert.equal(patched.status, 200, 'lead draft patch should persist');
  assert.match(patched.json.lead.notes, /Fanny reviewed/);

  const ready = await request('POST', `/api/cold-acquisition/leads/${created.json.lead.id}/ready`, {}, API_KEY);
  assert.equal(ready.status, 200, 'ready endpoint should mark qualified lead ready');
  assert.equal(ready.json.lead.status, 'ready');

  const push = await request('POST', '/api/cold-acquisition/push', { dryRun: true, limit: 20 }, API_KEY);
  assert.equal(push.status, 200, 'dry-run push should validate ready batch');
  assert.equal(push.json.result.pushed, 1);
  assert.equal(push.json.result.results[0].status, 'dry_run');

  const reply = await request('PATCH', `/api/cold-acquisition/leads/${created.json.lead.id}/reply`, {
    reply_text: 'Please send the 5-min overview.'
  }, API_KEY);
  assert.equal(reply.status, 200, 'reply endpoint should update status');
  assert.equal(reply.json.lead.status, 'replied');
  assert.match(reply.json.lead.reply_text, /5-min overview/);

  process.stdout.write('cold-acquisition-routes: pass\n');
} finally {
  if (child) await stopBackend(child);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function swissLeadBody() {
  return {
    company: {
      name: 'Alpine Bio Analytics AG',
      country: 'CH',
      canton_or_bezirk: 'ZH',
      postal_code: '8001',
      city: 'Zuerich',
      uid_or_fn: 'CHE123456789',
      legal_form: 'AG',
      date_of_entry: '2026-04-12',
      employee_count: 28,
      industry: 'biotech',
      website: 'https://alpinebio.com/en/platform',
      linkedin_url: 'https://linkedin.com/company/alpine-bio-analytics'
    },
    contact: {
      name: 'Mira Keller',
      title: 'Founder',
      email: 'hello@alpinebio.com',
      linkedin_url: 'https://linkedin.com/in/mira-keller'
    },
    scoringSignals: {
      websiteHasEnglish: true,
      linkedinCompanyEnglish: true,
      decisionMakerEnglish: true,
      dotComTld: true,
      highFitIndustry: true
    },
    evidence: [
      {
        kind: 'website_language',
        label: 'English product pages',
        detail: 'The /en/platform page explains clinical analytics workflows in English.',
        url: 'https://alpinebio.com/en/platform'
      }
    ],
    compliance: {
      source: 'zefix',
      source_url: 'https://www.zefix.ch/en/search/entity/list/firm/123456',
      source_timestamp: '2026-05-12T11:40:00.000Z',
      legal_basis: 'public_register'
    },
    notes: 'Newcomer track; English-first biotech positioning.'
  };
}

function austriaLeadBody() {
  return {
    company: {
      name: 'Donaustadt Robotics GmbH',
      country: 'AT',
      canton_or_bezirk: '1220',
      postal_code: '1220',
      city: 'Wien',
      uid_or_fn: 'FN987654a',
      legal_form: 'GmbH',
      date_of_entry: '2025-12-01',
      employee_count: 34,
      industry: 'SaaS robotics',
      website: 'https://donaustadt-robotics.at/en',
      linkedin_url: 'https://linkedin.com/company/donaustadt-robotics'
    },
    contact: {
      name: 'Jonas Weiss',
      title: 'CEO',
      email: 'office@donaustadt-robotics.at',
      linkedin_url: 'https://linkedin.com/in/jonas-weiss'
    },
    scoringSignals: {
      websiteHasEnglish: true,
      decisionMakerEnglish: true,
      highFitIndustry: true
    },
    evidence: [
      {
        kind: 'website_language',
        label: 'English product section',
        detail: 'The English product section explains robotics deployment for international clients.',
        url: 'https://donaustadt-robotics.at/en'
      }
    ],
    compliance: {
      source: 'wko',
      source_url: 'https://firmen.wko.at/donaustadt-robotics',
      source_timestamp: '2026-05-12T11:45:00.000Z',
      legal_basis: 'public_register'
    }
  };
}

async function startBackend() {
  const proc = spawn('npm', ['--prefix', 'backend', 'run', 'dev'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_KEY,
      PORT: String(PORT),
      NUDIMMUD_DB_PATH: appDbPath,
      YURI_MEMORY_DB_PATH: memoryDbPath,
      NUDIMMUD_TEST_MODE: '1',
      NUDIMMUD_DISABLE_WATCHERS: '1',
      NUDIMMUD_DISABLE_INTERVALS: '1',
      NUDIMMUD_DISABLE_SWARM_ORCHESTRATOR: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  proc.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  proc.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (SERVER_READY.test(output)) return proc;
    if (proc.exitCode !== null) throw new Error(`backend exited before ready:\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  proc.kill('SIGTERM');
  throw new Error(`backend did not become ready:\n${output}`);
}

async function stopBackend(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  await Promise.race([
    once(proc, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

async function request(method, route, body, apiKey) {
  const headers = { Origin: 'http://localhost:4200' };
  if (apiKey) headers['X-API-KEY'] = apiKey;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`http://127.0.0.1:${PORT}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}
