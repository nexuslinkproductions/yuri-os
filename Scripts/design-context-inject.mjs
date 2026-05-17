#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const MEMORY_FILE = path.join(ROOT, 'design-memory.json');
const DESIGN_DOC_FILE = path.join(ROOT, 'DESIGN.md');

function readText(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readJson(filePath) {
  const raw = readText(filePath).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function readFirstLines(filePath, count) {
  const text = readText(filePath);
  if (!text) return '';
  return text.split(/\r?\n/, count).slice(0, count).join('\n');
}

function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function truncateDecision(value, maxLength = 100) {
  const text = compactText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function parseDateValue(value, fallbackIndex) {
  const timestamp = Date.parse(String(value ?? ''));
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY + fallbackIndex : timestamp;
}

function sortEntries(entries) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const aTime = parseDateValue(a.entry?.date, a.index);
      const bTime = parseDateValue(b.entry?.date, b.index);

      if (bTime !== aTime) return bTime - aTime;
      return b.index - a.index;
    });
}

function buildContext() {
  const designPreview = readFirstLines(DESIGN_DOC_FILE, 30);
  void designPreview;

  const memory = readJson(MEMORY_FILE);
  const entries = Array.isArray(memory?.entries) ? memory.entries.filter(Boolean) : [];
  if (!entries.length) return '';

  const sortedEntries = sortEntries(entries);
  const recentEntries = sortedEntries.slice(0, 5);

  const tokens = new Set();
  for (const entry of entries) {
    if (!Array.isArray(entry.tokens_used)) continue;
    for (const token of entry.tokens_used) {
      const compactToken = compactText(token);
      if (compactToken) tokens.add(compactToken);
    }
  }

  const patternEntry = sortedEntries.find(({ entry }) => compactText(entry?.pattern));
  const pattern = compactText(patternEntry?.entry?.pattern);

  const recentLines = recentEntries.map(({ entry }) => {
    const date = compactText(entry?.date) || 'unknown-date';
    const component = compactText(entry?.component || entry?.file) || 'unknown-component';
    const decision = truncateDecision(entry?.decision || '', 100);
    return `${date} ${component}: ${decision}`;
  });

  const tokenLine = Array.from(tokens).sort((a, b) => a.localeCompare(b)).join(', ');

  return [
    '## DESIGN MASTER ACTIVE',
    '### Recent decisions (last 5)',
    ...recentLines,
    '### Active design tokens',
    tokenLine,
    '### Current pattern',
    pattern,
  ].join('\n');
}

function main() {
  try {
    const output = buildContext();
    if (output) {
      process.stdout.write(`${output}\n`);
    }
  } catch {
    // Silent by design. Hook callers must never fail on context extraction.
  } finally {
    process.exit(0);
  }
}

main();
