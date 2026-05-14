#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const htmlPath = resolve('docs/research/symbiotic-pulse-launch.html');
const html = readFileSync(htmlPath, 'utf8');

assert(html.includes('Symbiotic Pulse V1'), 'launch title missing');
assert(html.includes('Pulse Seed'), 'Pulse Seed node missing');
assert(html.includes('Capability Planner'), 'Capability Planner node missing');
assert(html.includes('Pulse Trace Ledger'), 'Pulse Trace Ledger node missing');
assert(html.includes('Pulse Envelope'), 'Pulse Envelope node missing');
assert(html.includes('Skill Registry'), 'Skill Registry node missing');
assert(html.includes('@keyframes nodePulse'), 'node pulse animation missing');
assert(html.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion gate missing');
assert(!/font-size:\s*[^;]*vw/.test(html), 'font size must not scale directly with viewport width');
assert(!/letter-spacing:\s*-[^;]+/.test(html), 'negative letter spacing is not allowed');
assert(!/gradient orb|bokeh|blob/i.test(html), 'banned decorative orb/blob language found');

let playwright;
try {
  playwright = await import('playwright');
} catch {
  process.stdout.write('symbiotic-pulse-launch-visual: static pass (playwright unavailable)\n');
  process.exit(0);
}

const browser = await playwright.chromium.launch();
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(pathToFileURL(htmlPath).href);
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => {
      const graph = document.querySelector('.graph-shell')?.getBoundingClientRect();
      const title = document.querySelector('h1')?.getBoundingClientRect();
      const overlaps = [];
      const nodes = [...document.querySelectorAll('.node')].map((node) => node.getBoundingClientRect());
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const overlap = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          if (overlap) overlaps.push([i, j]);
        }
      }
      return {
        graphWidth: graph?.width || 0,
        graphHeight: graph?.height || 0,
        titleWidth: title?.width || 0,
        bodyWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        overlaps,
      };
    });
    assert(metrics.graphWidth > 0 && metrics.graphHeight > 0, `graph should render for ${viewport.width}px`);
    assert(metrics.titleWidth > 0, `title should render for ${viewport.width}px`);
    assert(metrics.scrollWidth <= metrics.bodyWidth + 1, `horizontal overflow at ${viewport.width}px`);
    assert.deepEqual(metrics.overlaps, [], `node overlap at ${viewport.width}px`);
    await page.close();
  }
} finally {
  await browser.close();
}

process.stdout.write('symbiotic-pulse-launch-visual: pass\n');
