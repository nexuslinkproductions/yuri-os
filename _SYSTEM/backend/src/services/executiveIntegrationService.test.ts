import assert from 'node:assert/strict';
import {
    listExecutiveIntegrationLanes,
    planExecutiveIntegrationRoute
} from './executiveIntegrationService';

const lanes = listExecutiveIntegrationLanes();
const sourceNames = new Set(lanes.flatMap((lane) => lane.inspiredBy.map((source) => source.name)));

assert.equal(lanes.length, 4, 'executive integration should expose four native Yuri lanes');
assert.equal(sourceNames.has('Open Higgsfield AI'), false, 'Higgsfield must remain out of scope');
assert.equal(sourceNames.has('Hyperframes'), true, 'Hyperframes should map into the media lane');

const growthRoute = planExecutiveIntegrationRoute('Run SEO and Google Ads audit for the Nexus Link services page');
assert.equal(growthRoute.decision.intent, 'growth_audit');
assert.equal(growthRoute.lane.lane, 'growth');
assert.equal(growthRoute.lane.nativeServices.includes('siteBuilderService'), true);
assert.equal(growthRoute.lane.inspiredBy.some((source) => source.name === 'Toprank'), true);
assert.equal(growthRoute.nextAction, 'Create governed draft artifacts for operator review.');

const mediaRoute = planExecutiveIntegrationRoute('Render a 30 second HTML video showreel');
assert.equal(mediaRoute.decision.intent, 'media_render');
assert.equal(mediaRoute.lane.integrationSurface, 'hyperframesPipeline');
assert.equal(mediaRoute.lane.nativeServices.includes('browserAutomation'), true);

process.stdout.write('executive-integration-service: pass\n');
