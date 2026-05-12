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
  assert.equal(fs.existsSync(file), true, `${file} should exist for standalone acquisition CRM`);
}

const app = fs.readFileSync(appPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');
const vite = fs.readFileSync(vitePath, 'utf8');
const shell = fs.readFileSync(shellPath, 'utf8');
const nav = fs.readFileSync(navPath, 'utf8');

assert.match(index, /id="acquisition-root"/, 'standalone app should mount to acquisition-root');
assert.match(vite, /backend\/public\/acquisition/, 'CRM build should output to backend public acquisition directory');
assert.match(app, /\/acquisition\/api\/auth\/login/, 'CRM should use same-origin acquisition login');
assert.match(app, /\/acquisition\/api\/leads/, 'CRM should use acquisition lead API');
assert.match(app, /savedViews|SAVED_VIEWS/, 'CRM should expose saved views');
assert.match(app, /table|<thead|<tbody/i, 'CRM should be table-first');
assert.match(app, /copyDraft|copy-draft/, 'CRM should support manual draft copy workflow');
assert.match(app, /markSent|status: 'sent'|status: "sent"/, 'CRM should support mark sent workflow');
assert.match(app, /qualif/i, 'CRM should support qualify workflow');
assert.match(app, /next_follow_up_at/, 'CRM should support next follow-up field');
assert.doesNotMatch(app, /draggable=\{true\}|onDragStart|onDrop=/, 'CRM must not use draggable card board');

assert.match(css, /#56bcec/i, 'CRM should use c2moviez brand blue');
assert.match(css, /Montserrat/i, 'CRM should use Montserrat');
assert.match(css, /position:\s*sticky/i, 'CRM table should use sticky UI affordances');
assert.doesNotMatch(css, /--bg-void|--cyan-glow|op-shell|HUD/i, 'CRM CSS should not reuse NUDIMMUD HUD styling');

assert.doesNotMatch(shell, /ColdAcquisitionSection|cold-acquisition/, 'operator shell should not expose Cold Acquisition');
assert.doesNotMatch(nav, /Cold Acquisition|\/operator\/cold-acquisition/, 'operator nav should not expose Cold Acquisition');
assert.equal(fs.existsSync(oldSectionPath), false, 'old draggable ColdAcquisitionSection should be removed');

process.stdout.write('cold-acquisition-crm-ui: pass\n');
