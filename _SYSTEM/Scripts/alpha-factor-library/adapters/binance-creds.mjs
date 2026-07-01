import { pathToFileURL } from 'node:url';
// binance-creds.mjs — hydrate the owner's Binance view-only key from the macOS keychain into env.
// INV-2: reads the secret into process.env ONLY; NEVER echoes, logs, or commits it. Fail-open (no key → keyless).
// The key is VIEW-ONLY (read permission, no order placement) — used for higher rate limits on market data
// (X-MBX-APIKEY header) + authenticated account reads. The adapters read process.env.PERP_API_KEY/SECRET.
import { execSync } from 'node:child_process';

// @capability: binance-creds
// @serves: binance key hydration | view-only key | rate limit auth | X-MBX-APIKEY | keychain creds
// @does: Reads the owner's Binance view-only key+secret (BINANCE_READ_KEY/BINANCE_READ_SECRET, unprefixed macOS keychain entries) into process.env.PERP_API_KEY/SECRET so the perp/spot adapters can send the X-MBX-APIKEY header for higher rate limits + authenticated account reads. Fail-open: absent/macos-missing → keyless public path. NEVER logs the values.
// @use: call hydrateBinanceCreds() ONCE at daemon/CLI startup (observatory-server --serve, carry-beat, funding-carry --probe). Adapters then read process.env.PERP_API_KEY for the header.
// @exports: hydrateBinanceCreds, readKeychain, hasBinanceCreds

function readKeychain(service) {
  try {
    // -w outputs ONLY the password to stdout (captured, never echoed). 2>/dev/null suppresses the
    // macOS security tool's stderr prompt noise on missing entries. Fail-open on any error.
    const v = execSync(`security find-generic-password -s ${service} -w 2>/dev/null`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return v && v.trim();
  } catch { return ''; }
}

export function hasBinanceCreds() {
  return !!(process.env.PERP_API_KEY && process.env.PERP_API_SECRET);
}

/**
 * hydrateBinanceCreds() — read BINANCE_READ_KEY/SECRET from keychain → process.env.PERP_API_KEY/SECRET
 * (what the adapters' hasCreds reads). Idempotent (won't overwrite an already-set env). Returns true if
 * both present after hydration. NEVER logs the values. The key is VIEW-ONLY (no order permission).
 */
export function hydrateBinanceCreds() {
  if (!process.env.PERP_API_KEY) {
    const key = readKeychain('BINANCE_READ_KEY');
    if (key) process.env.PERP_API_KEY = key;
  }
  if (!process.env.PERP_API_SECRET) {
    const secret = readKeychain('BINANCE_READ_SECRET');
    if (secret) process.env.PERP_API_SECRET = secret;
  }
  return hasBinanceCreds();
}

const _main = process.argv[1] && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main) {
  // CLI: report presence ONLY (never the value). For startup/diagnostic use.
  const ok = hydrateBinanceCreds();
  console.log(`binance-creds: ${ok ? 'HYDRATED (key+secret present, view-only)' : 'NOT FOUND (keyless public path)'}`);
  process.exit(ok ? 0 : 1);
}
