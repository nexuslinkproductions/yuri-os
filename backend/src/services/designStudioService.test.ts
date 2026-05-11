import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { DesignStudioService } from './designStudioService';

const db = new Database(':memory:');
const memoryWrites: Array<{ content: string; tags: string[] }> = [];
const service = new DesignStudioService(db, {
    artifactRoot: 'backend/data/design-studio-test',
    memoryWriter: (content: string, tags: string[]) => {
        memoryWrites.push({ content, tags });
        return 1;
    }
});

const project = service.createProject({
    name: 'Homepage redesign control surface',
    description: 'Visual design work across website and reference screenshots.',
    targetRoot: '/Users/marcelspatz/NUDIMMUD'
});
assert.equal(project.name, 'Homepage redesign control surface');
assert.equal(project.status, 'active');

const website = service.addArtifact({
    projectId: project.id,
    type: 'website',
    name: 'Local services page',
    uri: 'http://127.0.0.1:5174/services',
    metadata: { route: '/services' }
});
assert.equal(website.type, 'website');

const capture = service.captureArtifact(website.id, {
    label: 'Services first viewport',
    previewUri: 'http://127.0.0.1:5174/services',
    metadata: { viewport: { width: 1440, height: 960 } }
});
assert.equal(capture.artifactId, website.id);

const selection = service.saveSelection({
    projectId: project.id,
    artifactId: website.id,
    captureId: capture.id,
    label: 'Hero value proposition',
    kind: 'region',
    locator: {
        type: 'bbox',
        bbox: { x: 88, y: 104, width: 760, height: 360 },
        url: 'http://127.0.0.1:5174/services'
    },
    note: 'Needs stronger hierarchy and clearer service promise.'
});
assert.equal(selection.kind, 'region');

const references = service.setReferenceSet({
    projectId: project.id,
    sourceIds: ['linear', 'vercel-geist', 'raycast', 'frontier-design-intelligence'],
    notes: 'Keep it dense, precise, and reviewable.'
});
assert.equal(references.sourceIds.length, 4);

const intent = service.saveIntent({
    projectId: project.id,
    selectionId: selection.id,
    mode: 'design',
    operation: 'restyle',
    prompt: 'Restyle this hero into a sharper operator-grade services entry point.',
    constraints: ['Preserve current public copy meaning', 'No direct browser-side source mutation'],
    acceptanceChecks: ['Selection evidence is represented', 'Run npm run build'],
    designSourceIds: references.sourceIds
});
assert.equal(intent.status, 'draft');

const packet = service.generatePacket(intent.id);
assert.equal(packet.intentId, intent.id);
assert.match(packet.markdown, /Hero value proposition/);
assert.match(packet.markdown, /linear/);
assert.match(packet.markdown, /No direct browser-side source mutation/);

const detail = service.getProject(project.id);
assert.equal(detail?.artifacts.length, 1);
assert.equal(detail?.captures.length, 1);
assert.equal(detail?.selections.length, 1);
assert.equal(detail?.intents.length, 1);
assert.equal(detail?.packets.length, 1);
assert.equal(memoryWrites.some((write) => write.tags.includes('codex_control_packet')), true);

const resources = service.listMcpResources(project.id);
assert.equal(resources.some((resource) => resource.uri.includes('/packets/')), true);

process.stdout.write('design-studio-service: pass\n');
