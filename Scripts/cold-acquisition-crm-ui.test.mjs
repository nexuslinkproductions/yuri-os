#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const appPath = 'acquisition/src/AcquisitionApp.tsx';
const cssPath = 'acquisition/src/acquisition.css';
const indexPath = 'acquisition/index.html';
const vitePath = 'acquisition/vite.config.mts';
const shellPath = 'src/operator/OperatorShell.tsx';
const navPath = 'src/operator/components/OperatorNav.tsx';
const oldSectionPath = 'src/operator/sections/ColdAcquisitionSection.tsx';

for (const file of [appPath, cssPath, indexPath, vitePath]) {
  assert.equal(fs.existsSync(file), true, `${file} should exist for standalone acquisition workbench`);
}

const app = fs.readFileSync(appPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');
const vite = fs.readFileSync(vitePath, 'utf8');
const shell = fs.readFileSync(shellPath, 'utf8');
const nav = fs.readFileSync(navPath, 'utf8');

assert.match(index, /id="acquisition-root"/, 'standalone app should mount to acquisition-root');
assert.match(index, /c2moviez PRISM Workbench/, 'browser title should use PRISM Workbench naming');
assert.match(vite, /backend\/public\/acquisition/, 'workbench build should output to backend public acquisition directory');
assert.match(app, /\/acquisition\/api\/auth\/login/, 'workbench should use same-origin acquisition login');
assert.match(app, /PRISM Workbench/, 'visible app name should be PRISM Workbench');
assert.doesNotMatch(app, /Acquisition CRM|Loading acquisition CRM/, 'visible app copy should not call the tool a CRM');
assert.match(app, /\/acquisition\/api\/leads/, 'workbench should use acquisition lead API');
assert.match(app, /\/acquisition\/api\/today-mission/, 'workbench should fetch today mission queue API');
assert.match(app, /TodayMission|today mission|Today Mission/i, 'workbench should expose Today Mission UI');
assert.match(app, /sendable/, 'Today Mission should render sendable leads');
assert.match(app, /follow_ups_due/, 'Today Mission should render due follow-up leads');
assert.match(app, /weekly-progress/, 'Today Mission should render weekly quota progress');
assert.match(app, /Copy & Mark Sent/, 'Send modal should require draft copy before marking sent');
assert.match(app, /COMPLIANCE_SEND_BLOCKED/, 'Send modal should handle backend compliance send blocks');
assert.match(app, /clearFollowUp|Follow-up done/, 'Today Mission should support clearing completed follow-ups');
assert.match(app, /savedViews|SAVED_VIEWS/, 'workbench should expose saved views');
assert.match(app, /table|<thead|<tbody/i, 'workbench should be table-first');
assert.match(app, /copyDraft|copy-draft/, 'workbench should support manual draft copy workflow');
assert.match(app, /Outreach Profile/, 'workbench should expose lead-specific outreach profile context');
assert.match(app, /observed_signal/, 'workbench should show the observed signal behind draft copy');
assert.match(app, /do_not_claim/, 'workbench should show draft claim guardrails');
assert.match(app, /readiness/, 'workbench should expose draft readiness state');
assert.match(app, /markSent|status: 'sent'|status: "sent"/, 'workbench should support mark sent workflow');
assert.match(app, /sendBlockReason|Compliance not cleared/, 'workbench should block mark-sent when send gates fail');
assert.match(app, /qualif/i, 'workbench should support qualify workflow');
assert.match(app, /next_follow_up_at/, 'workbench should support next follow-up field');
assert.doesNotMatch(app, /draggable=\{true\}|onDragStart|onDrop=/, 'workbench must not use draggable card board');

assert.match(css, /#56bcec/i, 'workbench should use c2moviez brand blue');
assert.match(css, /Montserrat/i, 'workbench should use Montserrat');
assert.match(css, /outreach-profile/, 'workbench should style outreach profile context');
assert.match(css, /send-block-reason/, 'workbench should style send block reason');
assert.match(css, /today-shell/, 'workbench should style Today Mission shell');
assert.match(css, /mission-queue/, 'workbench should style mission queues');
assert.match(css, /mission-card/, 'workbench should style mission cards');
assert.match(css, /send-modal/, 'workbench should style send confirmation modal');
assert.match(css, /weekly-progress/, 'workbench should style weekly quota progress');
assert.match(css, /position:\s*sticky/i, 'workbench table should use sticky UI affordances');
assert.doesNotMatch(css, /--bg-void|--cyan-glow|op-shell|HUD/i, 'workbench CSS should not reuse NUDIMMUD HUD styling');

assert.doesNotMatch(shell, /ColdAcquisitionSection|cold-acquisition/, 'operator shell should not expose Cold Acquisition');
assert.doesNotMatch(nav, /Cold Acquisition|\/operator\/cold-acquisition/, 'operator nav should not expose Cold Acquisition');
assert.equal(fs.existsSync(oldSectionPath), false, 'old draggable ColdAcquisitionSection should be removed');

process.stdout.write('cold-acquisition-crm-ui: pass\n');
