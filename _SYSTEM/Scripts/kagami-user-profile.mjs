#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtectedPath } from './lane-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_USER_PROFILE_ROOT = path.join(REPO_ROOT, '_SYSTEM', 'state', 'user-profile');
export const DEFAULT_USER_PROFILE_FILE = 'marcel-cognitive-profile.md';
export const ACTIVE_PROFILE_START = '## Active Operating Profile';

function resolveProfileRoot(root = process.env.KAGAMI_USER_PROFILE_ROOT || DEFAULT_USER_PROFILE_ROOT) {
  const resolved = path.resolve(root);
  if (isProtectedPath(resolved)) {
    throw new Error(`protected user profile root denied: ${resolved}`);
  }
  return resolved;
}

export function resolveUserProfilePath(options = {}) {
  const root = resolveProfileRoot(options.root);
  const file = options.file || DEFAULT_USER_PROFILE_FILE;
  const resolved = path.resolve(root, file);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error(`user profile path escapes root: ${resolved}`);
  }
  if (isProtectedPath(resolved)) {
    throw new Error(`protected user profile path denied: ${resolved}`);
  }
  return resolved;
}

export function readUserProfileMarkdown(options = {}) {
  const filePath = resolveUserProfilePath(options);
  if (!existsSync(filePath)) return '';
  const maxChars = Number(options.maxChars || 30_000);
  return readFileSync(filePath, 'utf8').slice(0, maxChars);
}

export function extractActiveOperatingProfile(markdown = '', options = {}) {
  const text = String(markdown || '');
  const start = text.indexOf(ACTIVE_PROFILE_START);
  if (start === -1) return '';
  const afterStart = text.slice(start + ACTIVE_PROFILE_START.length);
  const nextSection = afterStart.search(/\n## /u);
  const section = (nextSection === -1 ? afterStart : afterStart.slice(0, nextSection)).trim();
  return section.slice(0, Number(options.maxChars || 2_500)).trim();
}

export function buildUserProfilePromptBlock(options = {}) {
  const profile = extractActiveOperatingProfile(readUserProfileMarkdown(options), options);
  if (!profile) return '';
  return [
    '[Marcel Operating Profile]',
    'Use this as interaction guidance only. Do not repeat private biography unless Marcel asks.',
    profile,
  ].join('\n');
}

export function writeUserProfileMarkdown(markdown, options = {}) {
  const filePath = resolveUserProfilePath(options);
  if (existsSync(filePath) && !options.overwrite) {
    throw new Error(`user profile already exists: ${filePath}`);
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, String(markdown || '').trimEnd() + '\n', 'utf8');
  return filePath;
}
