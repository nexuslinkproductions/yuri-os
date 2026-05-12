#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3354;
const API_KEY = 'test-api-key-123456';
const ADMIN_EMAIL = 'marcel.crm@example.test';
const ADMIN_PASSWORD = 'admin-pass-123456';
const FANNY_EMAIL = 'fanny.crm@example.test';
const FANNY_PASSWORD = 'fanny-pass-123456';
const SERVER_READY = /NUDIMMUD_BACKEND_ONLINE/;

const repoScratch = path.join(process.cwd(), '.tmp');
fs.mkdirSync(repoScratch, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(repoScratch, 'cold-acquisition-crm-routes-'));
const appDbPath = path.join(tempDir, 'app.db');
const memoryDbPath = path.join(tempDir, 'memory.db');

let child = null;

try {
  child = await startBackend();

  const loginPage = await request('GET', '/acquisition/login');
  assert.equal(loginPage.status, 200, 'acquisition login route should serve the standalone CRM app');
  assert.match(loginPage.text, /acquisition-root/, 'served CRM shell should include acquisition root');

  const unauthenticated = await request('GET', '/acquisition/api/leads');
  assert.equal(unauthenticated.status, 401, 'CRM leads should require CRM session auth');

  const fannyLogin = await request('POST', '/acquisition/api/auth/login', {
    email: FANNY_EMAIL,
    password: FANNY_PASSWORD
  });
  assert.equal(fannyLogin.status, 200, 'Fanny should be able to log in');
  assert.equal(fannyLogin.json.user.role, 'operator');
  const fannyCookie = sessionCookie(fannyLogin);
  assert.ok(fannyCookie, 'login should return an httpOnly session cookie');

  const me = await request('GET', '/acquisition/api/auth/me', null, { cookie: fannyCookie });
  assert.equal(me.status, 200, 'session should authenticate /me');
  assert.equal(me.json.user.email, FANNY_EMAIL);

  const created = await request('POST', '/api/cold-acquisition/leads', swissLeadBody(), { apiKey: API_KEY });
  assert.equal(created.status, 201, 'local admin API should still create acquisition leads');
  const leadId = created.json.lead.id;

  const fannyList = await request('GET', '/acquisition/api/leads?view=ready', null, { cookie: fannyCookie });
  assert.equal(fannyList.status, 200, 'Fanny should read CRM leads');
  assert.equal(fannyList.json.leads.length, 1);
  assert.equal(fannyList.json.leads[0].crm_stage, 'ready');
  assert.equal(fannyList.json.leads[0].fanny_notes, '');
  assert.equal(fannyList.json.leads[0].next_follow_up_at, null);

  const fannyPatch = await request('PATCH', `/acquisition/api/leads/${leadId}`, {
    fanny_notes: 'Fanny checked the diagnosis and will send manually.',
    next_follow_up_at: '2026-05-20T09:00:00.000Z',
    status: 'sent',
    crm_stage: 'sent',
    outreach_drafts: {
      ...created.json.lead.outreach_drafts,
      email_cold: `${created.json.lead.outreach_drafts.email_cold}\n\nManual note: trimmed for Fanny.`
    }
  }, { cookie: fannyCookie });
  assert.equal(fannyPatch.status, 200, 'Fanny should update notes, status, follow-up, and drafts');
  assert.equal(fannyPatch.json.lead.status, 'sent');
  assert.equal(fannyPatch.json.lead.crm_stage, 'sent');
  assert.match(fannyPatch.json.lead.fanny_notes, /diagnosis/);

  const copy = await request('POST', `/acquisition/api/leads/${leadId}/copy-draft`, {
    draft_type: 'email_cold'
  }, { cookie: fannyCookie });
  assert.equal(copy.status, 200, 'copy-draft should return the selected draft and log activity');
  assert.equal(copy.json.draft_type, 'email_cold');
  assert.match(copy.json.text, /Manual note/);

  const customActivity = await request('POST', `/acquisition/api/leads/${leadId}/activity`, {
    type: 'reply_logged',
    detail: 'Prospect replied and asked for the overview.'
  }, { cookie: fannyCookie });
  assert.equal(customActivity.status, 201, 'Fanny should log lead activity');

  const leadDetail = await request('GET', `/acquisition/api/leads/${leadId}`, null, { cookie: fannyCookie });
  assert.equal(leadDetail.status, 200, 'lead detail should be readable');
  assert.ok(leadDetail.json.activity.length >= 3, 'activity timeline should include patch, copy, and manual activity');
  assert.ok(leadDetail.json.activity.some((entry) => entry.type === 'draft_copied'));

  const fannyAdminBlocked = await request('POST', '/acquisition/api/admin/push', { dryRun: true }, { cookie: fannyCookie });
  assert.equal(fannyAdminBlocked.status, 403, 'operator should be blocked from admin-only push');

  const adminLogin = await request('POST', '/acquisition/api/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });
  assert.equal(adminLogin.status, 200, 'admin should be able to log in');
  const adminCookie = sessionCookie(adminLogin);
  const adminPush = await request('POST', '/acquisition/api/admin/push', { dryRun: true, limit: 20 }, { cookie: adminCookie });
  assert.equal(adminPush.status, 200, 'admin should access CRM admin push');

  const logout = await request('POST', '/acquisition/api/auth/logout', null, { cookie: fannyCookie });
  assert.equal(logout.status, 200, 'logout should clear session server-side');
  const afterLogout = await request('GET', '/acquisition/api/auth/me', null, { cookie: fannyCookie });
  assert.equal(afterLogout.status, 401, 'logged-out session should be rejected');

  process.stdout.write('cold-acquisition-crm-routes: pass\n');
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
        label: 'Product pages',
        detail: 'The platform page explains clinical analytics workflows clearly.',
        url: 'https://alpinebio.com/en/platform'
      }
    ],
    compliance: {
      source: 'zefix',
      source_url: 'https://www.zefix.ch/en/search/entity/list/firm/123456',
      source_timestamp: '2026-05-12T11:40:00.000Z',
      legal_basis: 'public_register'
    },
    notes: 'Newcomer track; biotech positioning.'
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
      COLD_ACQ_ADMIN_EMAIL: ADMIN_EMAIL,
      COLD_ACQ_ADMIN_PASSWORD: ADMIN_PASSWORD,
      COLD_ACQ_FANNY_EMAIL: FANNY_EMAIL,
      COLD_ACQ_FANNY_PASSWORD: FANNY_PASSWORD,
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

function sessionCookie(response) {
  const cookie = response.headers.get('set-cookie') || '';
  return cookie.split(';')[0];
}

async function request(method, route, body, options = {}) {
  const headers = {};
  if (options.apiKey) headers['X-API-KEY'] = options.apiKey;
  if (options.cookie) headers.Cookie = options.cookie;
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
  return { status: response.status, json, text, headers: response.headers };
}
