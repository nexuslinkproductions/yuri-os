#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const REGISTRY_PATH = path.join(REPO, '_SYSTEM/context/context-registry.json');
const task = process.argv.slice(2).join(' ').trim();

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function scorePacket(packet, text) {
  if (!text) return packet.id === 'baseline' ? 1 : 0;
  const haystack = text.toLowerCase();
  return packet.triggers.reduce((score, trigger) => {
    return hasBoundedTrigger(haystack, String(trigger).toLowerCase()) ? score + 1 : score;
  }, 0);
}

function hasBoundedTrigger(haystack, needle) {
  if (!needle) return false;
  let offset = 0;
  while (offset <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) return false;
    const before = index > 0 ? haystack[index - 1] : '';
    const afterIndex = index + needle.length;
    const after = afterIndex < haystack.length ? haystack[afterIndex] : '';
    const leftBounded = !/[a-z0-9]/.test(needle[0]) || !/[a-z0-9]/.test(before);
    const rightBounded = !/[a-z0-9]/.test(needle[needle.length - 1]) || !/[a-z0-9]/.test(after);
    if (leftBounded && rightBounded) return true;
    offset = index + 1;
  }
  return false;
}

function existingPaths(paths) {
  return paths.map((entry) => {
    const fullPath = path.join(REPO, entry);
    return {
      path: entry,
      exists: existsSync(fullPath),
    };
  });
}

if (!existsSync(REGISTRY_PATH)) {
  console.error(`Missing context registry: ${REGISTRY_PATH}`);
  process.exit(1);
}

const registry = readJson(REGISTRY_PATH);
const ranked = registry.packets
  .map((packet) => ({ ...packet, score: scorePacket(packet, task) }))
  .filter((packet) => packet.score > 0 || packet.id === 'baseline')
  .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

const selected = ranked[0]?.id === 'baseline' && ranked.length > 1 ? ranked[1] : ranked[0];
const baseline = registry.packets.find((packet) => packet.id === 'baseline');

const output = {
  task: task || null,
  readOrder: registry.readOrder,
  selectedPacket: selected
    ? {
        id: selected.id,
        label: selected.label,
        score: selected.score,
        loadRule: selected.loadRule,
        paths: existingPaths(selected.paths),
      }
    : null,
  baseline: baseline
    ? {
        id: baseline.id,
        label: baseline.label,
        paths: existingPaths(baseline.paths),
      }
    : null,
  protected: registry.protected,
};

console.log(JSON.stringify(output, null, 2));
