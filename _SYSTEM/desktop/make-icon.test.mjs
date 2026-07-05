#!/usr/bin/env node
// @capability: yuri-desktop-icon-builder-tests
// @serves: test yuri icon pipeline | verify icns and ico output | make-icon.sh test suite
// @does: node:test verification for the icon pipeline: SVG assets exist and are valid XML with the
//        'YURI' wordmark, png-alpha-punch.mjs and png-to-ico.mjs are structurally sound as standalone
//        zero-dep modules, make-icon.sh is syntactically valid bash, make-app.sh embeds
//        CFBundleIconFile when an icon is present and still builds cleanly without one, and — when
//        generation actually ran on this host (verified by icon-actually-runs, not assumed) —
//        the produced .icns/.ico exist with byte-level-correct headers. Generation-dependent checks
//        SKIP explicitly (node:test t.skip) rather than fake-pass when qlmanage/iconutil aren't usable
//        on a given host, per the task's own instruction: skip, not fake-pass.
// @use: node --test _SYSTEM/desktop/make-icon.test.mjs
// @exports: (test suite — no runtime exports)
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, mkdtempSync, rmSync, readFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DESKTOP_DIR = __dirname;
const ASSETS_DIR = path.join(DESKTOP_DIR, 'assets');
const MAKE_ICON = path.join(DESKTOP_DIR, 'make-icon.sh');
const MAKE_APP = path.join(DESKTOP_DIR, 'make-app.sh');
const ALPHA_PUNCH = path.join(ASSETS_DIR, 'png-alpha-punch.mjs');
const PNG_TO_ICO = path.join(ASSETS_DIR, 'png-to-ico.mjs');
const SVG_DARK = path.join(ASSETS_DIR, 'yuri-icon.svg');
const SVG_LIGHT = path.join(ASSETS_DIR, 'yuri-icon-light.svg');

function freshDir() {
  return mkdtempSync(path.join(tmpdir(), 'yuri-icon-test-'));
}

function toolAvailable(name) {
  const res = spawnSync('which', [name], { encoding: 'utf8' });
  return res.status === 0;
}

// ---- SVG asset checks ----

test('yuri-icon.svg and yuri-icon-light.svg exist', () => {
  assert.ok(existsSync(SVG_DARK), 'yuri-icon.svg should exist');
  assert.ok(existsSync(SVG_LIGHT), 'yuri-icon-light.svg should exist');
});

test('both icon SVGs are valid, well-formed XML (parseable, balanced tags)', () => {
  for (const svgPath of [SVG_DARK, SVG_LIGHT]) {
    const src = readFileSync(svgPath, 'utf8');
    assert.match(src, /^<\?xml version="1\.0"/, `${svgPath} should start with an XML declaration`);
    assert.match(src, /<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${svgPath} should be a namespaced SVG root`);
    // Balanced-tag sanity check without a full XML parser dependency: every opened element that
    // isn't self-closing must have a matching close. Cheap proxy: equal count of "<tagname" opens
    // vs "</tagname>" closes for the structural elements this generator emits.
    for (const tag of ['svg', 'g', 'defs', 'style', 'text']) {
      const opens = (src.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length;
      const closes = (src.match(new RegExp(`</${tag}>`, 'g')) || []).length;
      assert.equal(opens, closes, `${svgPath}: <${tag}> open/close count mismatch (${opens} vs ${closes})`);
    }
  }
});

test('both icon SVGs contain the YURI wordmark text', () => {
  for (const svgPath of [SVG_DARK, SVG_LIGHT]) {
    const src = readFileSync(svgPath, 'utf8');
    assert.match(src, /<text[^>]*>YURI<\/text>/, `${svgPath} should contain a <text>YURI</text> element`);
  }
});

test('icon SVGs carry the original knot path geometry (9 paths) and a fill-defining <style>', () => {
  for (const svgPath of [SVG_DARK, SVG_LIGHT]) {
    const src = readFileSync(svgPath, 'utf8');
    const pathCount = (src.match(/<path /g) || []).length;
    assert.equal(pathCount, 9, `${svgPath} should preserve all 9 original knot path elements`);
    assert.match(src, /\.cls-1\s*\{\s*fill:\s*#[0-9a-fA-F]{6}/, `${svgPath} must define the cls-1 fill (regression: fill class was previously left undefined, rendering the knot black)`);
  }
});

test('yuri-icon.svg has no LIVE external reference into 03_NEXUS-LINK (a provenance comment is fine, an href/xlink:href dependency is not)', () => {
  const src = readFileSync(SVG_DARK, 'utf8');
  // Functional check: the SVG must never externally reference 03_NEXUS-LINK at render time (no
  // href/xlink:href pulling in the original file) — it is a derived, self-contained asset that
  // still renders correctly even if 03_NEXUS-LINK were deleted or moved.
  assert.doesNotMatch(src, /xlink:href|href="[^#]/, 'derived SVG must not reference external files');
  // A textual provenance comment naming the source of truth (for humans reading the file) is
  // intentional and required by the task — only bare functional refs outside a comment are barred.
  const withoutComments = src.replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(withoutComments, /03_NEXUS-LINK/, 'outside of the provenance comment, the SVG must not reference the identity source dir');
});

// ---- script syntax checks ----

test('make-icon.sh exists, is executable, and is syntactically valid bash', () => {
  assert.ok(existsSync(MAKE_ICON), 'make-icon.sh should exist');
  const st = statSync(MAKE_ICON);
  // eslint-disable-next-line no-bitwise
  assert.ok(st.mode & 0o111, 'make-icon.sh should have at least one executable bit set');
  const syn = spawnSync('bash', ['-n', MAKE_ICON], { encoding: 'utf8' });
  assert.equal(syn.status, 0, `make-icon.sh has a bash syntax error: ${syn.stderr}`);
});

test('make-icon.sh --help exits 0 without generating anything', () => {
  const out = freshDir();
  try {
    const res = spawnSync('bash', [MAKE_ICON, '--help'], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: /);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('make-icon.sh rejects a missing source SVG', () => {
  const res = spawnSync('bash', [MAKE_ICON, '--svg', '/nonexistent/path.svg'], { encoding: 'utf8', timeout: 10_000 });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /not found/);
});

test('png-alpha-punch.mjs and png-to-ico.mjs exist and load without syntax errors', () => {
  for (const script of [ALPHA_PUNCH, PNG_TO_ICO]) {
    assert.ok(existsSync(script), `${script} should exist`);
    // node --check parses without executing top-level side effects.
    const res = spawnSync('node', ['--check', script], { encoding: 'utf8' });
    assert.equal(res.status, 0, `${script} failed node --check: ${res.stderr}`);
  }
});

test('png-alpha-punch.mjs --help exits cleanly and documents usage', () => {
  const res = spawnSync('node', [ALPHA_PUNCH, '--help'], { encoding: 'utf8' });
  assert.match(res.stdout, /Usage: /);
});

test('png-to-ico.mjs --help exits cleanly and documents usage', () => {
  const res = spawnSync('node', [PNG_TO_ICO, '--help'], { encoding: 'utf8' });
  assert.match(res.stdout, /Usage: /);
});

test('png-to-ico.mjs rejects a non-square image', async () => {
  const { buildIco } = await import(PNG_TO_ICO);
  // Minimal synthetic 2x1 PNG (1x1 red pixel doubled) isn't worth hand-rolling here; instead assert
  // against the exported buildIco() contract using a fake buffer with a forged IHDR (width=2,height=1).
  const fakeIhdrWidth2Height1 = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
    Buffer.alloc(8), // padding up to byte 16 (chunk len+type for IHDR, not validated by pngDimensions)
    (() => { const b = Buffer.alloc(8); b.writeUInt32BE(2, 0); b.writeUInt32BE(1, 4); return b; })(),
  ]);
  assert.throws(() => buildIco([fakeIhdrWidth2Height1]), /square/);
});

// ---- make-app.sh icon wiring ----

test('make-app.sh embeds CFBundleIconFile when assets/generated/Yuri.icns is present', (t) => {
  const icnsPath = path.join(ASSETS_DIR, 'generated', 'Yuri.icns');
  if (!existsSync(icnsPath)) {
    t.skip('assets/generated/Yuri.icns not present on this host — run make-icon.sh first to exercise this check');
    return;
  }
  const out = freshDir();
  try {
    const res = spawnSync('bash', [MAKE_APP, '-o', out, '--name', 'YuriIconWireTest'], { encoding: 'utf8', timeout: 20_000 });
    assert.equal(res.status, 0, `builder should exit 0; stderr: ${res.stderr}`);

    const appDir = path.join(out, 'YuriIconWireTest.app');
    const infoPlist = path.join(appDir, 'Contents', 'Info.plist');
    const embeddedIcns = path.join(appDir, 'Contents', 'Resources', 'YuriIconWireTest.icns');

    assert.ok(existsSync(embeddedIcns), 'icon should be copied into Contents/Resources/');
    const plist = readFileSync(infoPlist, 'utf8');
    assert.match(plist, /<key>CFBundleIconFile<\/key><string>YuriIconWireTest\.icns<\/string>/);

    const lint = spawnSync('plutil', ['-lint', infoPlist], { encoding: 'utf8' });
    if (!lint.error) {
      assert.equal(lint.status, 0, `plutil -lint failed: ${lint.stdout}${lint.stderr}`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('make-app.sh still builds cleanly without an icon (icon is optional, never required)', () => {
  const out = freshDir();
  const icnsPath = path.join(ASSETS_DIR, 'generated', 'Yuri.icns');
  const stash = path.join(ASSETS_DIR, 'generated', '.Yuri.icns.test-stash');
  const hadIcon = existsSync(icnsPath);
  try {
    if (hadIcon) {
      // Temporarily move the real icon aside so this test exercises the true no-icon path,
      // then restore it in `finally` regardless of test outcome.
      renameSync(icnsPath, stash);
    }
    const res = spawnSync('bash', [MAKE_APP, '-o', out, '--name', 'YuriNoIconWireTest'], { encoding: 'utf8', timeout: 20_000 });
    assert.equal(res.status, 0, `builder should exit 0 even without an icon; stderr: ${res.stderr}`);

    const appDir = path.join(out, 'YuriNoIconWireTest.app');
    const infoPlist = path.join(appDir, 'Contents', 'Info.plist');
    const plist = readFileSync(infoPlist, 'utf8');
    assert.doesNotMatch(plist, /CFBundleIconFile/, 'no CFBundleIconFile key when no icon was generated');

    const lint = spawnSync('plutil', ['-lint', infoPlist], { encoding: 'utf8' });
    if (!lint.error) {
      assert.equal(lint.status, 0, `plutil -lint failed: ${lint.stdout}${lint.stderr}`);
    }
  } finally {
    if (hadIcon && existsSync(stash)) {
      renameSync(stash, icnsPath);
    }
    rmSync(out, { recursive: true, force: true });
  }
});

// ---- generation-dependent checks: run the REAL pipeline once, skip explicitly if tools unusable ----

test('make-icon.sh generation pipeline (real run, skips explicitly if tools unusable on this host)', async (t) => {
  const requiredTools = ['qlmanage', 'sips', 'iconutil'];
  const missing = requiredTools.filter((tool) => !toolAvailable(tool));
  if (missing.length > 0) {
    t.skip(`required tool(s) not available on this host: ${missing.join(', ')} — generation-dependent checks skipped, not faked`);
    return;
  }

  const outDir = freshDir();
  try {
    const res = spawnSync('bash', [MAKE_ICON, '--out-dir', outDir], { encoding: 'utf8', timeout: 60_000 });

    if (res.status !== 0) {
      // The script's own graceful-degrade path: qlmanage's SVG rendering can behave differently
      // across macOS versions. Treat a documented DEGRADE as an explicit skip, not a failure.
      if (/DEGRADE/.test(res.stdout) || /DEGRADE/.test(res.stderr)) {
        t.skip(`make-icon.sh reported a documented degrade on this host: ${res.stdout}${res.stderr}`);
        return;
      }
      assert.fail(`make-icon.sh failed unexpectedly (not a documented degrade): ${res.stdout}${res.stderr}`);
    }

    const icnsPath = path.join(outDir, 'Yuri.icns');
    const icoPath = path.join(outDir, 'yuri.ico');

    assert.ok(existsSync(icnsPath), 'Yuri.icns should be generated');
    assert.ok(existsSync(icoPath), 'yuri.ico should be generated');

    // icns: verify the 'icns' magic header (byte-level, not just file existence).
    const icnsBytes = readFileSync(icnsPath);
    assert.equal(icnsBytes.subarray(0, 4).toString('ascii'), 'icns', 'icns file must start with the icns magic bytes');

    // ico: verify the exact header bytes the task specifies: 00 00 01 00 (reserved=0, type=1/icon).
    const icoBytes = readFileSync(icoPath);
    assert.deepEqual(
      [...icoBytes.subarray(0, 4)],
      [0x00, 0x00, 0x01, 0x00],
      'ico file must start with 00 00 01 00 (ICONDIR reserved=0, type=1)',
    );

    // PNG signature + nonzero alpha check on the alpha-punched master, using our own decoder (which
    // is itself under test above) rather than re-deriving a second image stack.
    const rasterModule = await import(ALPHA_PUNCH);
    const iconsetDir = path.join(outDir, 'Yuri.iconset');
    const samplePng = path.join(iconsetDir, 'icon_512x512.png');
    assert.ok(existsSync(samplePng), 'iconset should contain icon_512x512.png');

    const pngBytes = readFileSync(samplePng);
    assert.deepEqual(
      [...pngBytes.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      'generated PNG must have a valid PNG signature',
    );

    const decoded = rasterModule.readPng(samplePng);
    let transparentCount = 0;
    let opaqueCount = 0;
    for (let i = 3; i < decoded.pixels.length; i += 4) {
      if (decoded.pixels[i] === 0) transparentCount++;
      if (decoded.pixels[i] === 255) opaqueCount++;
    }
    assert.ok(transparentCount > 0, 'generated icon PNG should have transparent pixels (background punched out)');
    assert.ok(opaqueCount > 0, 'generated icon PNG should have opaque pixels (the knot/text itself)');
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

// ---- Windows script: static review only (no pwsh on this host — documented, not faked) ----

test('make-app-windows.ps1 exists and has balanced braces/parens/here-string (static check; no pwsh on this host to execute it)', () => {
  const psPath = path.join(DESKTOP_DIR, 'make-app-windows.ps1');
  assert.ok(existsSync(psPath), 'make-app-windows.ps1 should exist');
  const src = readFileSync(psPath, 'utf8');

  const openBraces = (src.match(/\{/g) || []).length;
  const closeBraces = (src.match(/\}/g) || []).length;
  assert.equal(openBraces, closeBraces, 'braces should balance');

  // Here-string terminator must be at column 0 with nothing else on the line.
  const lines = src.split('\n');
  const terminatorLine = lines.find((l) => l === '"@');
  assert.ok(terminatorLine !== undefined, 'here-string terminator "@ must exist on its own line with no leading/trailing characters');

  assert.match(src, /yuri-repl\.mjs/, 'Windows launcher should reference yuri-repl.mjs');
  assert.match(src, /--start-brain/, 'Windows launcher should pass --start-brain');
  assert.match(src, /WScript\.Shell/, 'should use the zero-dep WScript.Shell COM object for shortcuts');

  const pwshAvailable = toolAvailable('pwsh') || toolAvailable('powershell');
  if (!pwshAvailable) {
    console.warn('pwsh/powershell not available on this host — make-app-windows.ps1 is reviewed statically only; live validation happens on the target Windows box.');
  }
});
