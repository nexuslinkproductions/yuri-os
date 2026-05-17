import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { DesignAssistantBridgeService } from './designAssistantBridgeService';

const scratch = path.join(process.cwd(), '.tmp', 'design-assistant-service-test');
fs.rmSync(scratch, { recursive: true, force: true });
fs.mkdirSync(scratch, { recursive: true });

const db = new Database(':memory:');
const service = new DesignAssistantBridgeService(db, { artifactRoot: scratch });

const capture = service.saveCapture({
    tabId: 12,
    url: 'http://localhost:4200/operator',
    title: 'NUDIMMUD Operator',
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    screenshotDataUrl: 'data:image/png;base64,aGVsbG8=',
    metadata: { source: 'service-test' }
});

assert.equal(capture.tabId, 12);
assert.equal(capture.screenshotMime, 'image/png');
assert.ok(capture.screenshotPath, 'capture should persist screenshot to disk');
assert.ok(fs.existsSync(path.join(process.cwd(), capture.screenshotPath || '')));

const selection = service.saveSelection({
    captureId: capture.id,
    tabId: 12,
    url: capture.url,
    kind: 'element',
    selector: 'main .hero h1',
    label: 'Hero headline',
    role: 'heading',
    text: 'Build the operator layer',
    bounds: { x: 100, y: 80, width: 640, height: 96 },
    computedStyles: { color: 'rgb(255, 255, 255)', fontSize: '64px' },
    structure: { parent: 'main.hero', siblings: ['p', 'a'] },
    screenshotCropDataUrl: 'data:image/png;base64,Y3JvcA==',
    metadata: { confidence: 0.9 }
});

assert.equal(selection.kind, 'element');
assert.equal(selection.captureId, capture.id);
assert.equal(selection.selector, 'main .hero h1');
assert.ok(selection.screenshotCropPath, 'selection should persist crop screenshot');

const request = service.createDesignRequest({
    captureId: capture.id,
    selectionId: selection.id,
    instruction: 'Tighten the hero hierarchy and align it with the HUD design system.',
    constraints: ['Codex owns source edits', 'Do not mutate from the extension'],
    targetProjectRoot: process.cwd(),
    designSourceIds: ['linear', 'vercel', 'raycast'],
    payload: { route: '/operator', priority: 'high' }
});

assert.equal(request.status, 'pending');
assert.equal(request.selectionId, selection.id);
assert.deepEqual(request.constraints, ['Codex owns source edits', 'Do not mutate from the extension']);

const pendingBeforeClaim = service.listPendingRequests();
assert.equal(pendingBeforeClaim.length, 1);
assert.equal(pendingBeforeClaim[0].id, request.id);

const claimed = service.claimNextRequest('codex-test');
assert.equal(claimed?.id, request.id);
assert.equal(claimed?.status, 'claimed');
assert.equal(service.listPendingRequests().length, 0);

const response = service.postResponse({
    requestId: request.id,
    source: 'codex',
    status: 'working',
    message: 'Implementing the selected hero update.',
    artifacts: [{ path: 'src/operator/sections/CockpitSection.tsx' }]
});

assert.equal(response.requestId, request.id);
assert.equal(service.getRequest(request.id)?.status, 'responded');

const applied = service.markApplied(request.id, 'Verified in browser.');
assert.equal(applied.status, 'applied');
assert.equal(service.getRequest(request.id)?.status, 'applied');

assert.equal(service.getActiveTab()?.url, capture.url);
assert.equal(service.getLatestSelection()?.id, selection.id);
assert.equal(service.getCapture(capture.id)?.id, capture.id);

const resources: Array<{ uri: string }> = service.listMcpResources();
assert.ok(resources.some((resource: { uri: string }) => resource.uri === 'design-assistant://active-tab'));
assert.ok(resources.some((resource: { uri: string }) => resource.uri === 'design-assistant://latest-selection'));
assert.ok(resources.some((resource: { uri: string }) => resource.uri === `design-assistant://captures/${capture.id}`));

const history = service.searchHistory('hero');
assert.equal(history.requests.some((item: { id: string }) => item.id === request.id), true);
assert.equal(history.responses.some((item: { id: string }) => item.id === response.id), true);

db.close();
fs.rmSync(scratch, { recursive: true, force: true });
process.stdout.write('design-assistant-bridge-service: pass\n');
