#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const DEFAULT_TARGET = path.join(REPO_ROOT, '_SYSTEM/reports/YURI_OS_SUPERCHARGE_LOGBOOK_PRESENTATION_2026-05-21.html');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, '_SYSTEM/state/playwright-visual-check');

const CANDIDATE_NODE_MODULE_DIRS = [
  process.env.PLAYWRIGHT_NODE_MODULES,
  process.env.CODEX_PLAYWRIGHT_NODE_MODULES,
  path.join(REPO_ROOT, 'node_modules'),
  '/Users/marcelspatz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules',
  '/Users/marcelspatz/.hermes/hermes-agent/node_modules',
  path.join(REPO_ROOT, '01_PROJECTS', 'gstack', 'node_modules'),
  '/opt/homebrew/lib/node_modules',
].filter(Boolean);

export function resolvePlaywright() {
  const checked = [];
  for (const nodeModulesDir of CANDIDATE_NODE_MODULE_DIRS) {
    checked.push(nodeModulesDir);
    if (!existsSync(nodeModulesDir)) continue;
    try {
      const entry = require.resolve('playwright', { paths: [nodeModulesDir] });
      return { ok: true, entry, nodeModulesDir, checked };
    } catch {}
  }
  return { ok: false, entry: null, nodeModulesDir: null, checked };
}

function usage() {
  process.stdout.write(`Usage:
  node _SYSTEM/Scripts/playwright-visual-check.mjs --where
  node _SYSTEM/Scripts/playwright-visual-check.mjs --target <html-or-url> [--screenshots]

Environment:
  PLAYWRIGHT_NODE_MODULES=/path/to/node_modules  Override Playwright resolution.
`);
}

function targetToUrl(target) {
  if (/^https?:\/\//.test(target) || /^file:\/\//.test(target)) return target;
  return pathToFileURL(path.resolve(target)).href;
}

async function runVisualCheck(options = {}) {
  const resolved = resolvePlaywright();
  if (!resolved.ok) {
    return { ok: false, error: 'playwright_not_found', resolution: resolved };
  }

  const { chromium } = require(resolved.entry);
  const target = options.target || DEFAULT_TARGET;
  const url = targetToUrl(target);
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ];
  const results = [];

  if (options.screenshots) mkdirSync(DEFAULT_OUT_DIR, { recursive: true });

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(350);
      const initial = await inspectPage(page);
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(options.screenshots ? 1100 : 450);
      const afterPageDown = await page.evaluate(() => ({
        scrollY,
        active: document.querySelector('.chapter-nav a.active')?.getAttribute('href') || '',
      }));

      let screenshotPath = null;
      if (options.screenshots) {
        screenshotPath = path.join(DEFAULT_OUT_DIR, `presentation-${viewport.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
      }

      results.push({
        viewport,
        initial,
        afterPageDown,
        screenshotPath,
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const failures = [];
  for (const result of results) {
    if (result.initial.sceneCount < 8) failures.push(`${result.viewport.name}: expected at least 8 continuous scenes`);
    if (result.initial.overflowX > 0) failures.push(`${result.viewport.name}: horizontal overflow ${result.initial.overflowX}`);
    if (result.initial.emptyBlocks > 0) failures.push(`${result.viewport.name}: empty content blocks ${result.initial.emptyBlocks}`);
    if (result.initial.hasSlideDeckChrome) failures.push(`${result.viewport.name}: slide-deck chrome still present`);
    if (!result.initial.hasKagamiMirror) failures.push(`${result.viewport.name}: missing Kagami mirror`);
    if (!result.initial.hasVariedLayouts) failures.push(`${result.viewport.name}: missing varied layout grammar`);
    if (!result.initial.hasCameraMotion) failures.push(`${result.viewport.name}: missing camera motion`);
    if (result.initial.visibleTextHasHud) failures.push(`${result.viewport.name}: visible text still contains HUD`);
    if (result.afterPageDown.scrollY <= 0 && result.viewport.name === 'desktop') failures.push(`${result.viewport.name}: keyboard page navigation did not move`);
  }

  return {
    ok: failures.length === 0,
    failures,
    target: url,
    playwright: resolved,
    results,
  };
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const visibleText = document.body.innerText || '';
    const sceneCount = document.querySelectorAll('.scene').length;
    const animations = document.getAnimations({ subtree: true }).map((animation) => {
      const target = animation.effect?.target;
      return {
        playState: animation.playState,
        tag: target?.tagName || '',
        className: target?.className || '',
      };
    });
    const mirrorStage = document.querySelector('.kagami-stage, .mirror-stage');
    const animatedCameraLayer = document.querySelector('.camera .orbit, .camera .light-sweep, .kagami-orbit, .kagami-disk');
    const cameraTransform = animatedCameraLayer ? getComputedStyle(animatedCameraLayer).transform : '';
    const scrollSnap = getComputedStyle(document.documentElement).scrollSnapType || '';
    return {
      title: document.title,
      sceneCount,
      overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      emptyBlocks: [...document.querySelectorAll('.washi, .capsule, .orb-node, .road-shell, .closing')]
        .filter((node) => !node.textContent.trim()).length,
      hasSlideDeckChrome: Boolean(document.querySelector('.chapter-nav, .slide')) || /mandatory/.test(scrollSnap),
      hasKagamiMirror: Boolean(mirrorStage && document.querySelector('.kagami-disk, .mirror') && document.body.innerText.includes('鏡')),
      hasVariedLayouts: Boolean(document.querySelector('.opening-layout') && document.querySelector('.thesis-grid') && document.querySelector('.river') && document.querySelector('.constellation') && document.querySelector('.road-stage')),
      hasCameraMotion: Boolean(document.querySelector('.camera') && animatedCameraLayer && (cameraTransform && cameraTransform !== 'none' || animations.length >= 6)),
      animationCount: animations.length,
      animations: animations.slice(0, 12),
      visibleTextHasHud: /\bHUD\b/i.test(visibleText),
    };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
  }
  if (args.includes('--where')) {
    process.stdout.write(`${JSON.stringify(resolvePlaywright(), null, 2)}\n`);
    process.exit(0);
  }
  const targetIndex = args.indexOf('--target');
  const target = targetIndex >= 0 ? args[targetIndex + 1] : DEFAULT_TARGET;
  const screenshots = args.includes('--screenshots');
  runVisualCheck({ target, screenshots })
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exit(result.ok ? 0 : 1);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exit(1);
    });
}
