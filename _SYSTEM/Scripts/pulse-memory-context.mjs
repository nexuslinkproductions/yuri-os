import fs from 'node:fs';

const CACHE = new Map();
const TTL_MS = 5 * 60 * 1000;

function readSlice(file, chars) {
  if (!file || chars <= 0 || !fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').slice(0, chars);
}

function latestArchiveFile() {
  const archiveDir = '_SYSTEM/SELF-IMPROVEMENT/pulse-archive/';
  if (!fs.existsSync(archiveDir)) return '';
  const latest = fs.readdirSync(archiveDir).filter((name) => !name.startsWith('.')).sort().pop();
  return latest ? archiveDir + latest : '';
}

export async function readMemoryContext({ tier, budget }) {
  const safeBudget = Math.max(0, Number(budget) || 6000);
  const key = `${tier}-${Math.floor(Date.now() / TTL_MS)}-${safeBudget}`;
  if (CACHE.has(key)) return CACHE.get(key);

  const palace = readSlice('palace-index.md', Math.floor(safeBudget * 0.4));
  const archive = readSlice(latestArchiveFile(), Math.floor(safeBudget * 0.4));
  const prevention = readSlice(
    '_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md',
    Math.floor(safeBudget * 0.2)
  );

  const ctx = `[PALACE]\n${palace}\n\n[RECENT FINDINGS]\n${archive}\n\n[RULES]\n${prevention}`;
  CACHE.set(key, ctx);
  return ctx;
}
