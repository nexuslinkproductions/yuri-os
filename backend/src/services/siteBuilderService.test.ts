import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { SiteBuilderService } from './siteBuilderService';

const db = new Database(':memory:');
const memoryWrites: string[] = [];
const service = new SiteBuilderService(db, {
    memoryWriter: (content: string) => {
        memoryWrites.push(content);
        return 1;
    }
});

const pages = service.listPages();
assert.equal(pages.length, 5, 'current website pages should be registered');
assert.equal(pages.some((page: any) => page.route === '/' && page.nodes.some((node: any) => node.id === 'home.hero')), true);

const session = service.createSession({ pageRoute: '/', mode: 'structure' });
assert.equal(session.pageRoute, '/', 'session should keep active page route');
assert.equal(session.mode, 'structure', 'session should keep active mode');

const annotation = service.saveAnnotation({
    sessionId: session.id,
    nodeId: 'home.hero',
    route: '/',
    note: 'Hero needs a sharper offer and stronger CTA rhythm.',
    metadata: { source: 'test' }
});
assert.equal(annotation.nodeId, 'home.hero', 'annotation should persist selected node');

const intent = service.saveIntent({
    sessionId: session.id,
    nodeId: 'home.hero',
    route: '/',
    mode: 'design',
    operation: 'rewrite',
    prompt: 'Rewrite the hero to make the offer concrete and action-led.',
    designSourceIds: ['linear', 'vercel-geist', 'raycast', 'frontier-design-intelligence']
});
assert.equal(intent.status, 'draft', 'new intent should start as draft');

const packet = service.createPatchPacket(intent.id);
assert.equal(packet.intentId, intent.id, 'packet should reference intent');
assert.match(packet.markdown, /home\.hero/, 'packet markdown should name selected node');
assert.match(packet.markdown, /src\/pages\/HomePage\.tsx/, 'packet markdown should include source file');
assert.match(packet.markdown, /linear/, 'packet markdown should include design references');

const reloaded = service.getSession(session.id);
assert.equal(reloaded?.annotations.length, 1, 'session detail should include annotations');
assert.equal(reloaded?.intents.length, 1, 'session detail should include intents');
assert.equal(reloaded?.packets.length, 1, 'session detail should include packets');
assert.equal(memoryWrites.length >= 3, true, 'major actions should write governed memory summaries');

process.stdout.write('site-builder-service: pass\n');
