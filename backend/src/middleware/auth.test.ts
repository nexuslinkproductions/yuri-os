import assert from 'node:assert/strict';

process.env.API_KEY = process.env.API_KEY || 'test-api-key-1234567890';

import { isLocalRequest } from './auth';

const chromeExtensionRequest = {
    ip: '10.0.0.2',
    socket: { remoteAddress: '10.0.0.2' },
    header(name: string) {
        return name.toLowerCase() === 'origin' ? 'chrome-extension://abcdef' : undefined;
    }
} as any;

assert.equal(isLocalRequest(chromeExtensionRequest), true, 'chrome extension origin should count as local');

process.stdout.write('auth-local-request: pass\n');
