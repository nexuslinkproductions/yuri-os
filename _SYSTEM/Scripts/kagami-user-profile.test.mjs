import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildUserProfilePromptBlock,
  extractActiveOperatingProfile,
  readUserProfileMarkdown,
  resolveUserProfilePath,
  writeUserProfileMarkdown,
} from './kagami-user-profile.mjs';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'kagami-user-profile-'));
}

test('active operating profile is extracted without raw private sections', () => {
  const markdown = [
    '# Private Profile',
    '',
    '## Active Operating Profile',
    '- Keep the goal spine visible.',
    '- Park side branches without stopping progress.',
    '',
    '## User-Provided Personal Context',
    '- raw private detail',
  ].join('\n');

  const profile = extractActiveOperatingProfile(markdown);

  assert.match(profile, /goal spine/);
  assert.doesNotMatch(profile, /raw private detail/);
});

test('prompt block uses only active guidance', () => {
  const root = tempRoot();
  writeUserProfileMarkdown([
    '# Private Profile',
    '',
    '## Active Operating Profile',
    '- Decode fast nonlinear input into ordered work.',
    '',
    '## User-Provided Personal Context',
    '- private raw detail',
  ].join('\n'), { root });

  const block = buildUserProfilePromptBlock({ root });

  assert.match(block, /Marcel Operating Profile/);
  assert.match(block, /Decode fast nonlinear input/);
  assert.doesNotMatch(block, /private raw detail/);
});

test('missing profile is a no-op', () => {
  const root = tempRoot();

  assert.equal(readUserProfileMarkdown({ root }), '');
  assert.equal(buildUserProfilePromptBlock({ root }), '');
});

test('protected profile roots are denied', () => {
  assert.throws(
    () => resolveUserProfilePath({ root: '.claude/state/user-profile' }),
    /protected/,
  );
  assert.throws(
    () => resolveUserProfilePath({ root: 'backend/data/user-profile' }),
    /protected/,
  );
});
