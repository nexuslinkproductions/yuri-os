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

function doctrineDrafts(opts = {}) {
  const greeting = opts.greeting || 'Hi,';
  const firstBase = opts.first || 'Your services page describes specialist B2B work.';
  const second = opts.second || 'But generic positioning loses the buyer in 30 seconds.';
  const third = opts.third || 'Would a 60-second clarifier video pull more enquiries?';
  const first = `${opts.company ? `${opts.company} ` : ''}${firstBase}${opts.proof ? ` ${opts.proof}` : ''}`.trim();
  const body = `${first} ${second} ${third}`;
  return {
    linkedin_intro: `${greeting} ${body}`,
    linkedin_followup: `${greeting} following up - ${third}`,
    email_cold: `Subject: ${opts.subject || 'your positioning'}\n\n${greeting}\n\n${body}\n\nBest,\nFanny\nc2moviez`,
    email_followup: `Subject: Re: ${opts.subject || 'your positioning'}\n\n${greeting}\n\nFollowing up. ${third}\n\nBest,\nFanny`
  };
}

async function hydrateColdLead(response, companyName) {
  const deadline = Date.now() + 5_000;
  const targetName = normalizeLeadName(companyName);
  while (Date.now() < deadline) {
    const list = await request('GET', '/api/cold-acquisition/leads', null, { apiKey: API_KEY });
    assert.equal(list.status, 200, `should list cold-acquisition leads for ${companyName}`);
    const lead = list.json.leads.find((entry) => {
      const actualName = normalizeLeadName(entry.company?.name || '');
      return actualName.includes(targetName) || targetName.includes(actualName);
    });
    if (lead) {
      const detail = await request('GET', `/api/cold-acquisition/leads/${lead.id}`, null, { apiKey: API_KEY });
      assert.equal(detail.status, 200, `should load cold-acquisition lead detail for ${companyName}`);
      response.json.lead = detail.json.lead;
      return lead.id;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`should find created lead for ${companyName}`);
}

function normalizeLeadName(value) {
  return String(value || '').toLowerCase().replace(/\b(ag|gmbh|sarl|sarl\.|sa|ltd\.?|limited|inc\.?)\b\.?/g, '').replace(/\s+/g, ' ').trim();
}

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

  const emptyNextLead = await request('GET', '/acquisition/api/next-lead', null, { cookie: fannyCookie });
  assert.equal(emptyNextLead.status, 200, 'next lead should be readable when authenticated');
  assert.deepEqual(emptyNextLead.json, { lead_id: null }, 'next lead should return null when no sendable leads exist');

  const created = await request('POST', '/api/cold-acquisition/leads', swissLeadBody(), { apiKey: API_KEY });
  assert.equal(created.status, 201, 'local admin API should still create acquisition leads');
  const leadId = await hydrateColdLead(created, 'Alpine Bio Analytics AG');
  const createdDoctrinePatch = await request('PATCH', `/api/cold-acquisition/leads/${leadId}`, {
    status: 'ready',
    crm_stage: 'ready',
    outreach_drafts: doctrineDrafts({
      company: 'Alpine Bio Analytics AG',
      proof: 'The platform page explains clinical analytics workflows clearly.',
      subject: 'quick thought on your positioning',
      greeting: 'Hi Mira,',
      first: 'Your platform page gives a clear specialist B2B story.',
      second: 'But the current draft still needs sharper buyer language.',
      third: 'Would a 60-second clarifier video help pull more enquiries?'
    })
  }, { apiKey: API_KEY });
  assert.equal(createdDoctrinePatch.status, 200, 'Swiss lead should accept doctrine-compliant drafts');

  const fannyList = await request('GET', '/acquisition/api/leads?view=ready', null, { cookie: fannyCookie });
  assert.equal(fannyList.status, 200, 'Fanny should read CRM leads');
  assert.equal(fannyList.json.leads.length, 1);
  assert.equal(fannyList.json.leads[0].crm_stage, 'ready');
  assert.equal(fannyList.json.leads[0].fanny_notes, '');
  assert.equal(fannyList.json.leads[0].next_follow_up_at, null);
  assertSourcePipeline(fannyList.json.leads[0], 'listed CRM lead');

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
  const sendableLeadId = await hydrateColdLead(sendable, 'Donaustadt Robotics GmbH');
  const sendableDoctrinePatch = await request('PATCH', `/api/cold-acquisition/leads/${sendableLeadId}`, {
    status: 'ready',
    crm_stage: 'ready',
    outreach_drafts: doctrineDrafts({
      company: 'Donaustadt Robotics GmbH',
      proof: 'The product section explains robotics deployment for international clients.',
      subject: 'quick thought on your positioning',
      greeting: 'Hi Jonas,',
      first: 'Your product page reads like a strong published B2B route.',
      second: 'But the draft still needs a tighter buyer outcome hook.',
      third: 'Would a 60-second clarifier video pull more enquiries?'
    })
  }, { apiKey: API_KEY });
  assert.equal(sendableDoctrinePatch.status, 200, 'sendable lead should accept doctrine-compliant drafts');
  sendable.json.lead = sendableDoctrinePatch.json.lead;

  const sendableDuePatch = await request('PATCH', `/acquisition/api/leads/${sendableLeadId}`, {
    next_follow_up_at: '2026-05-01'
  }, { cookie: fannyCookie });
  assert.equal(sendableDuePatch.status, 200, 'sendable lead should accept date-only follow-up values');

  const lowerScoreSendable = await request('POST', '/api/cold-acquisition/leads', lowerScoreSendableLeadBody(), { apiKey: API_KEY });
  assert.equal(lowerScoreSendable.status, 201, 'local admin API should create lower-score sendable AT lead');
  const lowerScoreLeadId = await hydrateColdLead(lowerScoreSendable, 'Floridsdorf Sensor Ops GmbH');
  const lowerScoreDoctrinePatch = await request('PATCH', `/api/cold-acquisition/leads/${lowerScoreLeadId}`, {
    status: 'ready',
    crm_stage: 'ready',
    outreach_drafts: doctrineDrafts({
      company: 'Floridsdorf Sensor Ops GmbH',
      proof: 'The sensor workflow page describes deployment dashboards for industrial operators.',
      subject: 'quick thought on your positioning',
      greeting: 'Hi Nora,',
      first: 'Your website shows a clear live product with a real target market.',
      second: 'But the draft still needs a buyer-facing clarifier.',
      third: 'Would a 60-second clarifier video help pull more enquiries?'
    })
  }, { apiKey: API_KEY });
  assert.equal(lowerScoreDoctrinePatch.status, 200, 'lower-score lead should accept doctrine-compliant drafts');
  lowerScoreSendable.json.lead = lowerScoreDoctrinePatch.json.lead;

  const thinEvidence = await request('POST', '/api/cold-acquisition/leads', thinEvidenceLeadBody(), { apiKey: API_KEY });
  assert.equal(thinEvidence.status, 201, 'local admin API should create thin-evidence lead');
  const thinEvidenceLeadId = await hydrateColdLead(thinEvidence, 'Generic Growth Systems GmbH');
  assert.ok(thinEvidence.json.lead.scoring.total_score <= 40, 'thin-evidence leads should be capped at low score');

  const lowConfidence = await request('POST', '/api/cold-acquisition/leads', lowConfidenceSendableLeadBody(), { apiKey: API_KEY });
  assert.equal(lowConfidence.status, 201, 'local admin API should create low-confidence sendable lead');
  const lowConfidenceLeadId = await hydrateColdLead(lowConfidence, 'Manual Signal Studio GmbH');
  const lowConfidenceDoctrinePatch = await request('PATCH', `/api/cold-acquisition/leads/${lowConfidenceLeadId}`, {
    status: 'ready',
    crm_stage: 'ready',
    outreach_drafts: doctrineDrafts({
      company: 'Manual Signal Studio GmbH',
      proof: 'The service page describes customer-facing video workflow reviews for product teams.',
      subject: 'quick thought on your positioning',
      greeting: 'Hi Eva,',
      first: 'Your company page shows a live outbound path and a decision-maker contact.',
      second: 'But the draft still needs a clearer reason to reply.',
      third: 'Would a 60-second clarifier video help pull more enquiries?'
    })
  }, { apiKey: API_KEY });
  assert.equal(lowConfidenceDoctrinePatch.status, 200, 'low-confidence lead should accept doctrine-compliant drafts');

  const blocked = await request('POST', '/api/cold-acquisition/leads', blockedLeadBody(), { apiKey: API_KEY });
  assert.equal(blocked.status, 201, 'local admin API should create blocked lead');
  const blockedLeadId = await hydrateColdLead(blocked, 'Innere Stadt Analytics GmbH');
  const blockedDoctrinePatch = await request('PATCH', `/api/cold-acquisition/leads/${blockedLeadId}`, {
    outreach_drafts: doctrineDrafts({
      company: 'Innere Stadt Analytics GmbH',
      proof: 'The product page describes analytics workflow software for finance teams.',
      subject: 'quick thought on your positioning',
      greeting: 'Hi Paul,',
      first: 'Your product page makes the buyer use case clear.',
      second: 'But the draft still needs a cleaner reply trigger.',
      third: 'Would a 60-second clarifier video pull more enquiries?'
    })
  }, { apiKey: API_KEY });
  assert.equal(blockedDoctrinePatch.status, 200, 'blocked lead should accept doctrine-compliant drafts');

  const followUp = await request('POST', '/api/cold-acquisition/leads', followUpLeadBody(), { apiKey: API_KEY });
  assert.equal(followUp.status, 201, 'local admin API should create follow-up lead');
  const followUpLeadId = await hydrateColdLead(followUp, 'Leopoldstadt Cloud Robotics GmbH');
  const followUpDoctrinePatch = await request('PATCH', `/api/cold-acquisition/leads/${followUpLeadId}`, {
    status: 'ready',
    crm_stage: 'ready',
    outreach_drafts: doctrineDrafts({
      company: 'Leopoldstadt Cloud Robotics GmbH',
      proof: 'The workflow page explains cloud robotics deployments for international logistics teams.',
      subject: 'quick thought on your positioning',
      greeting: 'Hi Mara,',
      first: 'Your cloud robotics page gives a clear international deployment story.',
      second: 'But the draft still needs a stronger buyer reply hook.',
      third: 'Would a 60-second clarifier video pull more enquiries?'
    })
  }, { apiKey: API_KEY });
  assert.equal(followUpDoctrinePatch.status, 200, 'follow-up lead should accept doctrine-compliant drafts');
  const followUpPatch = await request('PATCH', `/acquisition/api/leads/${followUpLeadId}`, {
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
  assert.equal(missionReviewReadyIds.includes(thinEvidenceLeadId), false, 'thin-evidence lead should not be review-ready');
  assert.equal(missionReviewReadyIds.includes(blockedLeadId), false, 'blocked lead should not be review-ready');
  const missionResearchIds = mission.json.mission.needs_research.map((lead) => lead.id);
  assert.ok(missionResearchIds.includes(thinEvidenceLeadId), 'thin-evidence lead should appear in needs research');
  assert.equal(missionResearchIds.includes(sendableLeadId), false, 'sendable lead should not appear in needs research');
  assert.equal(missionResearchIds.includes(blockedLeadId), false, 'blocked lead should not appear in needs research');
  const missionSendableLead = mission.json.mission.sendable.find((lead) => lead.id === sendableLeadId);
  assert.equal(missionSendableLead.preferred_draft_type, 'linkedin_intro');
  assert.equal(missionSendableLead.due_state, 'overdue');
  assert.deepEqual(missionSendableLead.send_blockers, []);
  assert.ok(missionSendableLead.draft_excerpt.length <= 143);
  assertSourcePipeline(missionSendableLead, 'today mission sendable lead');
  assert.ok(['high', 'medium'].includes(missionSendableLead.source_pipeline.confidence.level), 'LinkedIn plus multi-evidence lead should be high or medium confidence');

  const nextLead = await request('GET', '/acquisition/api/next-lead', null, { cookie: fannyCookie });
  assert.equal(nextLead.status, 200, 'next lead endpoint should return an eligible lead');
  assert.equal(nextLead.json.lead_id, sendableLeadId, 'next lead should choose the highest-score sendable lead');
  assert.equal(nextLead.json.lead_id === leadId, false, 'CH review-needed lead should be excluded from next lead');
  assert.equal(typeof nextLead.json.score, 'number', 'next lead should include score');

  const lowConfidenceMissionLead = mission.json.mission.sendable.find((lead) => lead.id === lowConfidenceLeadId);
  assert.ok(lowConfidenceMissionLead, 'low-confidence sendable lead should appear in mission sendable queue');
  assert.equal(lowConfidenceMissionLead.source_pipeline.confidence.level, 'low');
  assert.equal(lowConfidenceMissionLead.source_pipeline.wrong_lead_risk, true, 'low-confidence sendable lead should be flagged as wrong-lead risk');

  const thinEvidenceDetail = await request('GET', `/acquisition/api/leads/${thinEvidenceLeadId}`, null, { cookie: fannyCookie });
  assert.equal(thinEvidenceDetail.status, 200, 'thin-evidence detail should be readable');
  assertSourcePipeline(thinEvidenceDetail.json.lead, 'needs-research lead detail');
  assert.equal(thinEvidenceDetail.json.lead.source_pipeline.wrong_lead_risk, false, 'wrong-lead risk should be false for needs-research leads');

  const unknownSource = await request('POST', '/api/cold-acquisition/leads', unknownSourceLeadBody(), { apiKey: API_KEY });
  assert.equal(unknownSource.status, 201, 'local admin API should create unknown-source low evidence lead');
  const unknownSourceLeadId = await hydrateColdLead(unknownSource, 'Unknown Source Holding GmbH');
  const unknownSourceDetail = await request('GET', `/acquisition/api/leads/${unknownSourceLeadId}`, null, { cookie: fannyCookie });
  assert.equal(unknownSourceDetail.status, 200, 'unknown-source detail should be readable');
  assert.equal(unknownSourceDetail.json.lead.source_pipeline.confidence.level, 'low', 'unknown source with no evidence should be low confidence');
  const blockedCopy = await request('POST', `/acquisition/api/leads/${leadId}/copy-draft`, {
    draft_type: 'linkedin_intro'
  }, { cookie: fannyCookie });
  assert.equal(blockedCopy.status, 409, 'copy-draft should use the same send blockers as mark-sent');
  assert.equal(blockedCopy.json.error, 'COMPLIANCE_SEND_BLOCKED');

  const regenerated = await request('POST', `/acquisition/api/leads/${leadId}/regenerate-draft`, null, { cookie: fannyCookie });
  assert.equal(regenerated.status, 200, 'regenerate draft should return updated lead');
  assert.equal(regenerated.json.lead.id, leadId);
  assert.match(regenerated.json.lead.draft_specificity.profile.observed_signal, /./, 'regenerated lead should include a compiled company profile');

  const missionFollowUpIds = mission.json.mission.follow_ups_due.map((lead) => lead.id);
  assert.ok(missionFollowUpIds.includes(followUpLeadId), 'sent due lead should appear in follow-ups due');
  assert.equal(missionFollowUpIds.includes(sendableLeadId), false, 'sendable due lead should not appear twice');
  const missionFollowUpLead = mission.json.mission.follow_ups_due.find((lead) => lead.id === followUpLeadId);
  assert.equal(missionFollowUpLead.due_state, 'overdue');
  assert.ok(Array.isArray(missionFollowUpLead.send_blockers));
  const followUpDone = await request('POST', `/acquisition/api/leads/${followUpLeadId}/follow-up`, {
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
  assert.match(copy.json.subject, /quick thought on/i, 'email copy should expose subject separately');
  assert.match(copy.json.body, /Manual note/, 'email copy should expose body separately');
  assert.match(copy.json.text, /Manual note/);

  const markSentMissingDecision = await request('POST', `/acquisition/api/leads/${sendableLeadId}/mark-sent`, {
    channel: 'linkedin'
  }, { cookie: fannyCookie });
  assert.equal(markSentMissingDecision.status, 200, 'mark-sent should allow a missing follow-up date when channel is present');
  assert.equal(markSentMissingDecision.json.lead.status, 'sent');

  const sendableForExplicitMark = await request('POST', '/api/cold-acquisition/leads', explicitMarkSentLeadBody(), { apiKey: API_KEY });
  assert.equal(sendableForExplicitMark.status, 201, 'local admin API should create explicit mark-sent lead');
  const sendableForExplicitMarkLeadId = await hydrateColdLead(sendableForExplicitMark, 'Brigittenau Motion Stack GmbH');
  const explicitMarkDoctrinePatch = await request('PATCH', `/api/cold-acquisition/leads/${sendableForExplicitMarkLeadId}`, {
    status: 'ready',
    crm_stage: 'ready',
    outreach_drafts: doctrineDrafts({
      company: 'Brigittenau Motion Stack GmbH',
      proof: 'The motion stack page describes visual workflow reviews for production operators.',
      subject: 'quick thought on your positioning',
      greeting: 'Hi Pia,',
      first: 'Your product page makes the buyer use case clear.',
      second: 'But the draft still needs a cleaner reply trigger.',
      third: 'Would a 60-second clarifier video pull more enquiries?'
    })
  }, { apiKey: API_KEY });
  assert.equal(explicitMarkDoctrinePatch.status, 200, 'explicit mark-sent lead should accept doctrine-compliant drafts');
  const markSentWithoutChannel = await request('POST', `/acquisition/api/leads/${sendableForExplicitMarkLeadId}/mark-sent`, {
    follow_up_date: '2026-05-20'
  }, { cookie: fannyCookie });
  assert.equal(markSentWithoutChannel.status, 400, 'mark-sent should require channel');
  assert.equal(markSentWithoutChannel.json.error, 'channel required');
  const explicitMarkSent = await request('POST', `/acquisition/api/leads/${sendableForExplicitMarkLeadId}/mark-sent`, {
    channel: 'linkedin',
    follow_up_date: '2026-05-20'
  }, { cookie: fannyCookie });
  assert.equal(explicitMarkSent.status, 200, 'review-ready lead should support explicit mark-sent');
  assert.equal(explicitMarkSent.json.lead.status, 'sent');
  assert.equal(explicitMarkSent.json.lead.crm_stage, 'sent');
  assert.equal(explicitMarkSent.json.lead.next_follow_up_at, '2026-05-20');

  const explicitReply = await request('POST', `/acquisition/api/leads/${sendableLeadId}/reply`, {
    reply_type: 'interested',
    note: 'Prospect replied and asked for the overview.'
  }, { cookie: fannyCookie });
  assert.equal(explicitReply.status, 200, 'reply endpoint should record manual replies');
  assert.equal(explicitReply.json.suppressed, false);
  assert.equal(explicitReply.json.lead_id, sendableLeadId);

  const optOutLead = await request('POST', '/api/cold-acquisition/leads', optOutLeadBody(), { apiKey: API_KEY });
  assert.equal(optOutLead.status, 201, 'local admin API should create opt-out test lead');
  const optOutLeadId = await hydrateColdLead(optOutLead, 'Ottakring Reply Loop GmbH');
  const optOutReply = await request('POST', `/acquisition/api/leads/${optOutLeadId}/reply`, {
    reply_type: 'opt_out',
    note: 'Please do not contact me again.'
  }, { cookie: fannyCookie });
  assert.equal(optOutReply.status, 200, 'opt-out replies should be accepted');
  assert.equal(optOutReply.json.suppressed, true);
  assert.equal(optOutReply.json.lead_id, optOutLeadId);
  const optOutDetail = await request('GET', `/acquisition/api/leads/${optOutLeadId}`, null, { cookie: fannyCookie });
  assert.equal(optOutDetail.json.lead.status, 'disqualified', 'opt-out should disqualify the lead');
  const afterOptOutMission = await request('GET', '/acquisition/api/today-mission', null, { cookie: fannyCookie });
  assert.equal(
    afterOptOutMission.json.mission.sendable.some((lead) => lead.id === optOutLeadId),
    false,
    'suppressed contact should not appear in sendable pool'
  );

  const customActivity = await request('POST', `/acquisition/api/leads/${sendableLeadId}/activity`, {
    type: 'reply_logged',
    detail: 'Prospect replied and asked for the overview.'
  }, { cookie: fannyCookie });
  assert.equal(customActivity.status, 201, 'Fanny should log lead activity');

  const leadDetail = await request('GET', `/acquisition/api/leads/${sendableLeadId}`, null, { cookie: fannyCookie });
  assert.equal(leadDetail.status, 200, 'lead detail should be readable');
  assertSourcePipeline(leadDetail.json.lead, 'CRM lead detail');
  assert.equal(leadDetail.json.lead.source_pipeline.public_email_basis, true);
  assert.equal(leadDetail.json.lead.source_pipeline.batch_id, null);
  assert.deepEqual(leadDetail.json.lead.draft_specificity.evaluation_flags || [], [], 'clean draft should pass evaluator with no flags');
  assert.ok(leadDetail.json.activity.length >= 3, 'activity timeline should include patch, copy, and manual activity');
  assert.ok(leadDetail.json.activity.some((entry) => entry.type === 'draft_copied'));

  const genericDraftPatch = await request('PATCH', `/acquisition/api/leads/${lowerScoreLeadId}`, {
    outreach_drafts: {
      ...lowerScoreSendable.json.lead.outreach_drafts,
      linkedin_intro: 'Hi, this could be a game-changer for your team. I can help you take your workflow to the next level.'
    }
  }, { cookie: fannyCookie });
  assert.equal(genericDraftPatch.status, 200, 'draft evaluator should run after draft edits');
  assert.equal(genericDraftPatch.json.lead.draft_specificity.readiness, 'draft_review', 'failed evaluator should move draft to review');
  assert.ok(genericDraftPatch.json.lead.draft_specificity.evaluation_flags.includes('generic_language'), 'draft without company/contact reference should flag generic language');
  assert.ok(genericDraftPatch.json.lead.draft_specificity.evaluation_flags.includes('ai_spam_tone'), 'draft with game-changer should flag AI-spam tone');

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
      },
      {
        kind: 'linkedin_company',
        label: 'LinkedIn company page',
        detail: 'The LinkedIn company page positions Donaustadt Robotics around deployment teams.',
        url: 'https://linkedin.com/company/donaustadt-robotics'
      },
      {
        kind: 'directory_profile',
        label: 'WKO directory profile',
        detail: 'The WKO directory profile connects Donaustadt Robotics to Vienna software services.',
        url: 'https://firmen.wko.at/donaustadt-robotics'
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

function lowConfidenceSendableLeadBody() {
  return {
    company: {
      name: 'Manual Signal Studio GmbH',
      country: 'AT',
      canton_or_bezirk: '1220',
      postal_code: '1220',
      city: 'Wien',
      uid_or_fn: 'FN222333m',
      legal_form: 'GmbH',
      date_of_entry: '2026-04-02',
      employee_count: 22,
      industry: 'creative software',
      website: 'https://manual-signal-studio.at/en'
    },
    contact: {
      name: 'Eva Brandner',
      title: 'Founder',
      email: 'business@manual-signal-studio.at'
    },
    scoringSignals: {
      websiteHasEnglish: true,
      decisionMakerEnglish: true,
      highFitIndustry: true
    },
    evidence: [
      {
        kind: 'website_language',
        label: 'Service page',
        detail: 'The service page describes customer-facing video workflow reviews for product teams.',
        url: 'https://manual-signal-studio.at/en'
      }
    ],
    compliance: {
      source: 'manual',
      source_url: 'https://example.test/manual-signal-studio-source',
      source_timestamp: '2026-05-12T11:46:45.000Z',
      legal_basis: 'website_published_email'
    }
  };
}

function unknownSourceLeadBody() {
  return {
    company: {
      name: 'Unknown Source Holding GmbH',
      country: 'AT',
      canton_or_bezirk: '1220',
      postal_code: '1220',
      city: 'Wien',
      uid_or_fn: 'FN444555u',
      legal_form: 'GmbH',
      date_of_entry: '2026-04-05',
      employee_count: 14,
      industry: 'services'
    },
    contact: {
      name: 'Tina Moser',
      title: 'Managing Director'
    },
    compliance: {
      source: 'manual',
      source_url: 'https://example.test/unknown-source-holding',
      source_timestamp: '2026-05-12T11:46:50.000Z',
      legal_basis: 'linkedin_platform'
    }
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

function explicitMarkSentLeadBody() {
  return {
    ...lowerScoreSendableLeadBody(),
    company: {
      ...lowerScoreSendableLeadBody().company,
      name: 'Brigittenau Motion Stack GmbH',
      uid_or_fn: 'FN121314e',
      website: 'https://brigittenau-motion-stack.at/en'
    },
    contact: {
      ...lowerScoreSendableLeadBody().contact,
      name: 'Pia Auer',
      email: 'business@brigittenau-motion-stack.at'
    },
    evidence: [
      {
        kind: 'website_language',
        label: 'Motion stack page',
        detail: 'The motion stack page describes visual workflow reviews for production operators.',
        url: 'https://brigittenau-motion-stack.at/en'
      }
    ],
    compliance: {
      source: 'wko',
      source_url: 'https://firmen.wko.at/brigittenau-motion-stack',
      source_timestamp: '2026-05-12T11:49:30.000Z',
      legal_basis: 'website_published_email'
    }
  };
}

function optOutLeadBody() {
  return {
    ...lowerScoreSendableLeadBody(),
    company: {
      ...lowerScoreSendableLeadBody().company,
      name: 'Ottakring Reply Loop GmbH',
      uid_or_fn: 'FN151617o',
      website: 'https://ottakring-reply-loop.at/en'
    },
    contact: {
      ...lowerScoreSendableLeadBody().contact,
      name: 'Karin Hofer',
      email: 'business@ottakring-reply-loop.at',
      linkedin_url: 'https://linkedin.com/in/karin-hofer'
    },
    evidence: [
      {
        kind: 'website_language',
        label: 'Reply operations page',
        detail: 'The reply operations page describes customer message handling for sales teams.',
        url: 'https://ottakring-reply-loop.at/en'
      }
    ],
    compliance: {
      source: 'wko',
      source_url: 'https://firmen.wko.at/ottakring-reply-loop',
      source_timestamp: '2026-05-12T11:49:40.000Z',
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

function assertSourcePipeline(lead, label) {
  assert.ok(lead.source_pipeline, `${label} should include source_pipeline`);
  assert.equal(typeof lead.source_pipeline.confidence.score, 'number', `${label} should include confidence score`);
  assert.ok(['high', 'medium', 'low'].includes(lead.source_pipeline.confidence.level), `${label} should include confidence level`);
  assert.ok(Array.isArray(lead.source_pipeline.confidence.signals), `${label} should include confidence signals`);
  assert.ok(lead.source_pipeline.confidence.signals.length > 0, `${label} should include human-readable confidence signals`);
  assert.ok(Object.prototype.hasOwnProperty.call(lead.source_pipeline, 'batch_id'), `${label} should include batch_id`);
  assert.equal(typeof lead.source_pipeline.public_email_basis, 'boolean', `${label} should include public_email_basis`);
  assert.equal(typeof lead.source_pipeline.wrong_lead_risk, 'boolean', `${label} should include wrong_lead_risk`);
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
