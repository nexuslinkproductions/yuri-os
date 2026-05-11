import assert from 'node:assert/strict';
import { normalizeBounds, selectorFromElementParts } from '../src/shared/selector.ts';

assert.deepEqual(
    normalizeBounds({ x: -20, y: 10, width: 200, height: 90 }, { width: 160, height: 80 }),
    { x: 0, y: 10, width: 160, height: 70 }
);

assert.deepEqual(
    normalizeBounds({ x: 24.4, y: 12.2, width: 100.8, height: 44.9 }, { width: 400, height: 300 }),
    { x: 24, y: 12, width: 101, height: 45 }
);

assert.equal(
    selectorFromElementParts({
        tagName: 'button',
        id: 'save-button',
        classNames: ['primary', 'large'],
        nthOfType: 2,
        parentSelector: 'main form'
    }),
    'button#save-button'
);

assert.equal(
    selectorFromElementParts({
        tagName: 'span',
        classNames: ['label', 'active'],
        nthOfType: 3,
        parentSelector: 'main form button'
    }),
    'main form button > span.label.active:nth-of-type(3)'
);

process.stdout.write('chrome-design-assistant-selector: pass\n');
