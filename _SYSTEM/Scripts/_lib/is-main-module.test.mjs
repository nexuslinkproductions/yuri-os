#!/usr/bin/env node
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { isMainModule } from './is-main-module.mjs';

const WIN_SCRIPT = 'C:\\Users\\rene\\YURI-OS-MUSUBI\\_SYSTEM\\Scripts\\yuri-search.mjs';
const WIN_META = pathToFileURL(WIN_SCRIPT).href;

assert.equal(WIN_META === `file://${WIN_SCRIPT}`, false, 'legacy guard must fail on win32 paths');
assert.equal(isMainModule(WIN_META, WIN_SCRIPT), true, 'pathToFileURL guard must pass on win32 paths');

const unixScript = '/Users/marcel/YURI-OS-MUSUBI/_SYSTEM/Scripts/yuri-search.mjs';
const unixMeta = pathToFileURL(unixScript).href;
assert.equal(isMainModule(unixMeta, unixScript), true, 'unix paths must pass');
assert.equal(isMainModule(unixMeta, '/other/path.mjs'), false, 'mismatch must fail');

console.log('is-main-module.test.mjs: OK');
