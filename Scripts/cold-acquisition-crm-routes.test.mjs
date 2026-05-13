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
  const todayPage = await request('GET', '/acquisition/today');
  assert.equal(todayPage.status, 200, 'acquisition today route should serve the standalone CRM app');
  assert.match(todayPage.text, /acquisition-root/, 'today route should serve the CRM shell for direct visits');

  const unauthenticated = await request('GET', '/acquisition/api/leads');
  assert.equal(unauthenticated.status, 401, 'CRM leads should require CRM session auth');
  const unauthenticatedMission = await request('GET', '/acquisition/api/today-mission');
  assert.equal(unauthenticatedMission.status, 401, 'today mission should require CRM session auth');

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

  const blockedSend = await request('PATCH', `/acquisition/api/leads/${leadId}`, {
    status: 'sent',
    crm_stage: 'sent'
  }, { cookie: fannyCookie });
  assert.equal(blockedSend.status, 409, 'Fanny should not mark CH review-needed leads as sent');
  assert.equal(blockedSend.json.error, 'COMPLIANCE_SEND_BLOCKED');
  const blockedExplicitSend = await request('POST', `/acquisition/api/leads/${leadId}/mark-sent`, {
    channel: 'email',
    next_follow_up_at: null
  }, { cookie: fannyCookie });
  assert.equal(blockedExplicitSend.status, 409, 'CH review-needed leads should fail explicit mark-sent');
  assert.equal(blockedExplicitSend.json.error, 'COMPLIANCE_SEND_BLOCKED');

  const sendable = await request('POST', '/api/cold-acquisition/leads', austriaSendableLeadBody(), { apiKey: API_KEY });
  assert.equal(sendable.status, 201, 'local admin API should create sendable AT acquisition leads');
  const sendableLeadId = sendable.json.lead.id;

  const sendableDuePatch = await request('PATCH', `/acquisition/api/leads/${sendableLeadId}`, {
    next_follow_up_at: '2026-05-01'
  }, { cookie: fannyCookie });
  assert.equal(sendableDuePatch.status, 200, 'sendable lead should accept date-only follow-up values');

  const lowerScoreSendable = await request('POST', '/api/cold-acquisition/leads', lowerScoreSendableLeadBody(), { apiKey: API_KEY });
  assert.equal(lowerScoreSendable.status, 201, 'local admin API should create lower-score sendable AT lead');

  const thinEvidence = await request('POST', '/api/cold-acquisition/leads', thinEvidenceLeadBody(), { apiKey: API_KEY });
  assert.equal(thinEvidence.status, 201, 'local admin API should create thin-evidence lead');
  assert.ok(thinEvidence.json.lead.scoring.total_score <= 40, 'thin-evidence leads should be capped at low score');

  const blocked = await request('POST', '/api/cold-acquisition/leads', blockedLeadBody(), { apiKey: API_KEY });
  assert.equal(blocked.status, 201, 'local admin API should create blocked lead');

  const followUp = await request('POST', '/api/cold-acquisition/leads', followUpLeadBody(), { apiKey: API_KEY });
  assert.equal(followUp.status, 201, 'local admin API should create follow-up lead');
  const followUpPatch = await request('PATCH', `/acquisition/api/leads/${followUp.json.lead.id}`, {
    status: 'sent',
    crm_stage: 'sent',
    next_follow_up_at: '2026-05-02'
  }, { cookie: fannyCookie });
  assert.equal(followUpPatch.status, 200, 'sent lead should accept due follow-up date');

  const mission = await request('GET', '/acquisition/api/today-mission', null, { cookie: fannyCookie });
  assert.equal(mission.status, 200, 'today mission should be readable');
  assert.equal(typeof mission.json.mission.generated_at, 'string');
  assert.equal(mission.json.mission.weekly.target, 20);
  assert.equal(mission.json.mission.counts.sendable, mission.json.mission.sendable.length);
  assert.ok(Array.isArray(mission.json.mission.review_ready), 'today mission should expose review-ready queue');
  assert.equal(mission.json.mission.counts.review_ready, mission.json.mission.review_ready.length);
  assert.deepEqual(
    mission.json.mission.review_ready.map((lead) => lead.id),
    mission.json.mission.sendable.map((lead) => lead.id),
    'deprecated sendable alias should mirror review-ready queue'
  );
  assert.equal(mission.json.mission.counts.follow_ups_due, mission.json.mission.follow_ups_due.length);
  assert.equal(mission.json.mission.counts.needs_research, 1);
  assert.equal(mission.json.mission.counts.review_needed, 1);
  assert.ok(mission.json.mission.counts.blocked >= 1);
  assert.ok(mission.json.mission.counts.overdue >= 1);
  assert.ok(Array.isArray(mission.json.mission.needs_research), 'today mission should expose a renderable needs-research queue');
  assert.ok(
    mission.json.mission.needs_research.length <= mission.json.mission.counts.needs_research,
    'needs-research queue can be narrower than raw count because blocked records are filtered'
  );

  const dashboardForMission = await request('GET', '/acquisition/api/dashboard', null, { cookie: fannyCookie });
  assert.deepEqual(mission.json.mission.weekly, dashboardForMission.json.dashboard.weekly_quota);

  const missionSendableIds = mission.json.mission.sendable.map((lead) => lead.id);
  const missionReviewReadyIds = mission.json.mission.review_ready.map((lead) => lead.id);
  assert.ok(missionReviewReadyIds.includes(sendableLeadId), 'AT published B2B email lead should be review-ready');
  assert.ok(
    missionReviewReadyIds.indexOf(sendableLeadId) < missionReviewReadyIds.indexOf(lowerScoreSendable.json.lead.id),
    'review-ready mission queue should sort by score and confidence descending'
  );
  assert.equal(missionReviewReadyIds.includes(leadId), false, 'CH review-needed lead should not be review-ready');
  assert.equal(missionReviewReadyIds.includes(thinEvidence.json.lead.id), false, 'thin-evidence lead should not be review-ready');
  assert.equal(missionReviewReadyIds.includes(blocked.json.lead.id), false, 'blocked lead should not be review-ready');
  const missionResearchIds = mission.json.mission.needs_research.map((lead) => lead.id);
  assert.ok(missionResearchIds.includes(thinEvidence.json.lead.id), 'thin-evidence lead should appear in needs research');
  assert.equal(missionResearchIds.includes(sendableLeadId), false, 'sendable lead should not appear in needs research');
  assert.equal(missionResearchIds.includes(blocked.json.lead.id), false, 'blocked lead should not appear in needs research');
  const missionSendableLead = mission.json.mission.sendable.find((lead) => lead.id === sendableLeadId);
  assert.equal(missionSendableLead.preferred_draft_type, 'linkedin_intro');
  assert.equal(missionSendableLead.due_state, 'overdue');
  assert.deepEqual(missionSendableLead.send_blockers, []);
  assert.ok(missionSendableLead.draft_excerpt.length <= 143);
  const blockedCopy = await request('POST', `/acquisition/api/leads/${leadId}/copy-draft`, {
    draft_type: 'linkedin_intro'
  }, { cookie: fannyCookie });
  assert.equal(blockedCopy.status, 409, 'copy-draft should use the same send blockers as mark-sent');
  assert.equal(blockedCopy.json.error, 'COMPLIANCE_SEND_BLOCKED');

  const missionFollowUpIds = mission.json.mission.follow_ups_due.map((lead) => lead.id);
  assert.ok(missionFollowUpIds.includes(followUp.json.lead.id), 'sent due lead should appear in follow-ups due');
  assert.equal(missionFollowUpIds.includes(sendableLeadId), false, 'sendable due lead should not appear twice');
  const missionFollowUpLead = mission.json.mission.follow_ups_due.find((lead) => lead.id === followUp.json.lead.id);
  assert.equal(missionFollowUpLead.due_state, 'overdue');
  assert.ok(Array.isArray(missionFollowUpLead.send_blockers));
  const followUpDone = await request('POST', `/acquisition/api/leads/${followUp.json.lead.id}/follow-up`, {
    next_follow_up_at: null
  }, { cookie: fannyCookie });
  assert.equal(followUpDone.status, 200, 'explicit follow-up done should clear next follow-up');
  assert.equal(followUpDone.json.lead.next_follow_up_at, null, 'next_follow_up_at should clear to null');

  const fannyPatch = await request('PATCH', `/acquisition/api/leads/${sendableLeadId}`, {
    fanny_notes: 'Fanny checked the observed signal and will send manually.',
    next_follow_up_at: '2026-05-20T09:00:00.000Z',
    outreach_drafts: {
      ...sendable.json.lead.outreach_drafts,
      email_cold: `${sendable.json.lead.outreach_drafts.email_cold}\n\nManual note: trimmed for Fanny.`
    }
  }, { cookie: fannyCookie });
  assert.equal(fannyPatch.status, 200, 'Fanny should update notes, follow-up, and drafts before manual send');
  assert.notEqual(fannyPatch.json.lead.status, 'sent');
  assert.equal(fannyPatch.json.lead.crm_stage, 'ready');
  assert.match(fannyPatch.json.lead.fanny_notes, /observed signal/);

  const copy = await request('POST', `/acquisition/api/leads/${sendableLeadId}/copy-draft`, {
    draft_type: 'email_cold'
  }, { cookie: fannyCookie });
  assert.equal(copy.status, 200, 'copy-draft should return the selected draft and log activity');
  assert.equal(copy.json.draft_type, 'email_cold');
  assert.match(copy.json.subject, /quick note on/i, 'email copy should expose subject separately');
  assert.match(copy.json.body, /Manual note/, 'email copy should expose body separately');
  assert.match(copy.json.text, /Manual note/);

  const markSentMissingDecision = await request('POST', `/acquisition/api/leads/${sendableLeadId}/mark-sent`, {
    channel: 'linkedin'
  }, { cookie: fannyCookie });
  assert.equal(markSentMissingDecision.status, 400, 'mark-sent should require a follow-up decision');
  const explicitMarkSent = await request('POST', `/acquisition/api/leads/${sendableLeadId}/mark-sent`, {
    channel: 'linkedin',
    next_follow_up_at: '2026-05-20'
  }, { cookie: fannyCookie });
  assert.equal(explicitMarkSent.status, 200, 'review-ready lead should support explicit mark-sent');
  assert.equal(explicitMarkSent.json.lead.status, 'sent');
  assert.equal(explicitMarkSent.json.lead.crm_stage, 'sent');

  const explicitReply = await request('POST', `/acquisition/api/leads/${sendableLeadId}/reply`, {
    reply_text: 'Prospect replied and asked for the overview.'
  }, { cookie: fannyCookie });
  assert.equal(explicitReply.status, 200, 'reply endpoint should record manual replies');
  assert.equal(explicitReply.json.lead.status, 'replied');

  const customActivity = await request('POST', `/acquisition/api/leads/${sendableLeadId}/activity`, {
    type: 'reply_logged',
    detail: 'Prospect replied and asked for the overview.'
  }, { cookie: fannyCookie });
  assert.equal(customActivity.status, 201, 'Fanny should log lead activity');

  const leadDetail = await request('GET', `/acquisition/api/leads/${sendableLeadId}`, null, { cookie: fannyCookie });
  assert.equal(leadDetail.status, 200, 'lead detail should be readable');
  assert.ok(leadDetail.json.activity.length >= 3, 'activity timeline should include patch, copy, and manual activity');
  assert.ok(leadDetail.json.activity.some((entry) => entry.type === 'draft_copied'));

  const fannyAdminBlocked = await request('POST', '/acquisition/api/admin/push', { dryRun: true }, { cookie: fannyCookie });
  assert.equal(fannyAdminBlocked.status, 403, 'operator should be blocked from admin-only push');
  const fannyIngestBlocked = await request('POST', '/acquisition/api/admin/ingest/austria-directory', {
    records: [austriaIngestRecord()]
  }, { cookie: fannyCookie });
  assert.equal(fannyIngestBlocked.status, 403, 'operator should be blocked from admin-only ingest');
  const fannySourceConfigBlocked = await request('GET', '/acquisition/api/admin/source-config', null, { cookie: fannyCookie });
  assert.equal(fannySourceConfigBlocked.status, 403, 'operator should be blocked from admin-only source config');
  const fannyLiveFeedBlocked = await request('POST', '/acquisition/api/admin/live-feed', {
    apply: true
  }, { cookie: fannyCookie });
  assert.equal(fannyLiveFeedBlocked.status, 403, 'operator should be blocked from admin-only live source intake');

  const adminLogin = await request('POST', '/acquisition/api/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });
  assert.equal(adminLogin.status, 200, 'admin should be able to log in');
  const adminCookie = sessionCookie(adminLogin);
  const adminPush = await request('POST', '/acquisition/api/admin/push', { dryRun: true, limit: 20 }, { cookie: adminCookie });
  assert.equal(adminPush.status, 200, 'admin should access CRM admin push');
  const adminSourceConfig = await request('GET', '/acquisition/api/admin/source-config', null, { cookie: adminCookie });
  assert.equal(adminSourceConfig.status, 200, 'admin should access source API configuration');
  assert.ok(Array.isArray(adminSourceConfig.json.source_config.sources), 'source config should include sources');
  const zefixSource = adminSourceConfig.json.source_config.sources.find((source) => source.key === 'zefix');
  const firmafindSource = adminSourceConfig.json.source_config.sources.find((source) => source.key === 'firmafind');
  const compassSource = adminSourceConfig.json.source_config.sources.find((source) => source.key === 'wirtschaftscompass');
  assert.ok(zefixSource, 'source config should link Zefix');
  assert.ok(firmafindSource, 'source config should link FirmaFind');
  assert.ok(compassSource, 'source config should link Wirtschafts-Compass');
  assert.equal(zefixSource.api_docs_url, 'https://www.zefix.admin.ch/ZefixPublicREST/v3/api-docs');
  assert.ok(zefixSource.required_env.includes('ZEFIX_API_USERNAME'));
  assert.equal(firmafindSource.api_base_url, 'https://firmafind.at/api');
  assert.equal(compassSource.status, 'requires_provider_access');
  const adminSourceReload = await request('POST', '/acquisition/api/admin/source-reload', null, { cookie: adminCookie });
  assert.equal(adminSourceReload.status, 200, 'admin should refresh linked source API status');
  assert.equal(adminSourceReload.json.status, 'source_api_links_ready');
  const adminIngest = await request('POST', '/acquisition/api/admin/ingest/austria-directory', {
    records: [austriaIngestRecord()]
  }, { cookie: adminCookie });
  assert.equal(adminIngest.status, 201, 'admin should access Austria directory ingest');
  assert.equal(typeof adminIngest.json.result.created, 'number');
  assert.equal(typeof adminIngest.json.result.skipped, 'number');
  assert.ok(Array.isArray(adminIngest.json.result.errors));

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

function austriaSendableLeadBody() {
  return {
    company: {
      name: 'Donaustadt Robotics GmbH',
      country: 'AT',
      canton_or_bezirk: '1220',
      postal_code: '1220',
      city: 'Wien',
      uid_or_fn: 'FN987654a',
      legal_form: 'GmbH',
      date_of_entry: '2026-03-28',
      employee_count: 34,
      industry: 'SaaS robotics',
      website: 'https://donaustadt-robotics.at/en',
      linkedin_url: 'https://linkedin.com/company/donaustadt-robotics'
    },
    contact: {
      name: 'Jonas Weiss',
      title: 'CEO',
      email: 'business@donaustadt-robotics.at',
      linkedin_url: 'https://linkedin.com/in/jonas-weiss'
    },
    scoringSignals: {
      websiteHasEnglish: true,
      linkedinCompanyEnglish: true,
      decisionMakerEnglish: true,
      dotComTld: false,
      highFitIndustry: true
    },
    evidence: [
      {
        kind: 'website_language',
        label: 'Product section',
        detail: 'The product section explains robotics deployment for international clients.',
        url: 'https://donaustadt-robotics.at/en'
      }
    ],
    compliance: {
      source: 'wko',
      source_url: 'https://firmen.wko.at/donaustadt-robotics',
      source_timestamp: '2026-05-12T11:45:00.000Z',
      legal_basis: 'website_published_email'
    },
    notes: 'Published B2B inquiry route documented.'
  };
}

function thinEvidenceLeadBody() {
  return {
    company: {
      name: 'Generic Growth Systems GmbH',
      country: 'AT',
      canton_or_bezirk: '1220',
      postal_code: '1220',
      city: 'Wien',
      uid_or_fn: 'FN111222g',
      legal_form: 'GmbH',
      date_of_entry: '2026-04-18',
      employee_count: 18,
      industry: 'SaaS',
      website: 'https://generic-growth-systems.at/en',
      linkedin_url: 'https://linkedin.com/company/generic-growth-systems'
    },
    contact: {
      name: 'Lea Graf',
      title: 'CEO',
      email: 'business@generic-growth-systems.at',
      linkedin_url: 'https://linkedin.com/in/lea-graf'
    },
    scoringSignals: {
      websiteHasEnglish: true,
      linkedinCompanyEnglish: true,
      decisionMakerEnglish: true,
      dotComTld: false,
      highFitIndustry: true
    },
    evidence: [
      {
        kind: 'website_language',
        label: 'Website exists',
        detail: 'Company website exists.',
        url: 'https://generic-growth-systems.at/en'
      }
    ],
    compliance: {
      source: 'wko',
      source_url: 'https://firmen.wko.at/generic-growth-systems',
      source_timestamp: '2026-05-12T11:46:00.000Z',
      legal_basis: 'website_published_email'
    }
  };
}

function lowerScoreSendableLeadBody() {
  return {
    company: {
      name: 'Floridsdorf Sensor Ops GmbH',
      country: 'AT',
      canton_or_bezirk: '1220',
      postal_code: '1220',
      city: 'Wien',
      uid_or_fn: 'FN777888l',
      legal_form: 'GmbH',
      date_of_entry: '2026-03-22',
      employee_count: 16,
      industry: 'SaaS sensors',
      website: 'https://floridsdorf-sensor-ops.at/en'
    },
    contact: {
      name: 'Nora Leitner',
      title: 'CEO',
      email: 'business@floridsdorf-sensor-ops.at'
    },
    scoringSignals: {
      websiteHasEnglish: true,
      linkedinCompanyEnglish: false,
      decisionMakerEnglish: false,
      dotComTld: false,
      highFitIndustry: true
    },
    evidence: [
      {
        kind: 'website_language',
        label: 'Sensor workflow page',
        detail: 'The sensor workflow page describes deployment dashboards for industrial operators.',
        url: 'https://floridsdorf-sensor-ops.at/en'
      }
    ],
    compliance: {
      source: 'wko',
      source_url: 'https://firmen.wko.at/floridsdorf-sensor-ops',
      source_timestamp: '2026-05-12T11:46:30.000Z',
      legal_basis: 'website_published_email'
    }
  };
}

function blockedLeadBody() {
  return {
    company: {
      name: 'Innere Stadt Analytics GmbH',
      country: 'AT',
      canton_or_bezirk: '1010',
      postal_code: '1010',
      city: 'Wien',
      uid_or_fn: 'FN333444b',
      legal_form: 'GmbH',
      date_of_entry: '2026-03-15',
      employee_count: 24,
      industry: 'analytics software',
      website: 'https://innere-analytics.at/en',
      linkedin_url: 'https://linkedin.com/company/innere-analytics'
    },
    contact: {
      name: 'Paul Novak',
      title: 'Founder',
      email: 'business@innere-analytics.at',
      linkedin_url: 'https://linkedin.com/in/paul-novak'
    },
    scoringSignals: {
      websiteHasEnglish: true,
      linkedinCompanyEnglish: true,
      decisionMakerEnglish: true,
      highFitIndustry: true
    },
    evidence: [
      {
        kind: 'website_language',
        label: 'Product page',
        detail: 'The product page describes analytics workflow software for finance teams.',
        url: 'https://innere-analytics.at/en'
      }
    ],
    compliance: {
      source: 'wko',
      source_url: 'https://firmen.wko.at/innere-analytics',
      source_timestamp: '2026-05-12T11:47:00.000Z',
      legal_basis: 'website_published_email'
    }
  };
}

function followUpLeadBody() {
  return {
    company: {
      name: 'Leopoldstadt Cloud Robotics GmbH',
      country: 'AT',
      canton_or_bezirk: '1220',
      postal_code: '1220',
      city: 'Wien',
      uid_or_fn: 'FN555666f',
      legal_form: 'GmbH',
      date_of_entry: '2026-02-20',
      employee_count: 31,
      industry: 'robotics SaaS',
      website: 'https://leopoldstadt-cloud-robotics.at/en',
      linkedin_url: 'https://linkedin.com/company/leopoldstadt-cloud-robotics'
    },
    contact: {
      name: 'Mara Steiner',
      title: 'Managing Director',
      email: 'business@leopoldstadt-cloud-robotics.at',
      linkedin_url: 'https://linkedin.com/in/mara-steiner'
    },
    scoringSignals: {
      websiteHasEnglish: true,
      linkedinCompanyEnglish: true,
      decisionMakerEnglish: true,
      highFitIndustry: true
    },
    evidence: [
      {
        kind: 'website_language',
        label: 'Robotics workflow page',
        detail: 'The workflow page explains cloud robotics deployments for international logistics teams.',
        url: 'https://leopoldstadt-cloud-robotics.at/en'
      }
    ],
    compliance: {
      source: 'wko',
      source_url: 'https://firmen.wko.at/leopoldstadt-cloud-robotics',
      source_timestamp: '2026-05-12T11:48:00.000Z',
      legal_basis: 'website_published_email'
    }
  };
}

function austriaIngestRecord() {
  return {
    source: 'wko',
    name: 'Demo Intake Motion GmbH',
    fn: 'FN121212i',
    bezirk: '1220',
    postal_code: '1220',
    city: 'Wien',
    legal_form: 'GmbH',
    date_of_entry: '2026-04-11',
    employee_count: 19,
    industry: 'video operations software',
    website: 'https://demo-intake-motion.at/en',
    linkedin_url: 'https://linkedin.com/company/demo-intake-motion',
    contact_name: 'Selina Berger',
    contact_title: 'Founder',
    contact_email: 'business@demo-intake-motion.at',
    contact_linkedin_url: 'https://linkedin.com/in/selina-berger',
    source_url: 'https://firmen.wko.at/demo-intake-motion',
    published_b2b_email: true,
    evidence_detail: 'The company page describes video operations tooling for international production teams.'
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
