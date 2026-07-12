// url-policy.mjs — shared deterministic URL safety policy.
// Zero dependencies. No DNS, no network, no external binaries.
// Fail-closed: malformed/private-network URLs → unsafe.
// Imported by both .claude/hooks/url-safety-guard.js (CJS, dynamic import())
// and .omp/hooks/pre/url-safety-guard.js (ESM, static import).

// ---------------------------------------------------------------------------
// IPv4 helpers
// ---------------------------------------------------------------------------

export function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0; // unsigned
}

export function ipv4InCidr(ip, cidr) {
  const [base, bits] = cidr.split('/');
  const baseInt = ipv4ToInt(base);
  const ipInt = ipv4ToInt(ip);
  if (baseInt === null || ipInt === null) return false;
  const mask = ~((1 << (32 - Number(bits))) - 1) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export const DANGEROUS_IPV4_CIDRS = [
  '127.0.0.0/8',    // loopback
  '10.0.0.0/8',     // RFC1918
  '172.16.0.0/12',  // RFC1918
  '192.168.0.0/16', // RFC1918
  '0.0.0.0/8',      // "this network"
  '169.254.0.0/16', // link-local
  '100.64.0.0/10',  // CGNAT (RFC6598)
];

// ---------------------------------------------------------------------------
// IPv6 helpers
// ---------------------------------------------------------------------------

export const DANGEROUS_IPV6 = new Set([
  '::',          // unspecified address
  '::1',         // loopback
  '0:0:0:0:0:0:0:1', // loopback variant
]);

// Link-local: fe80::/10
export function isIPv6LinkLocal(hostname) {
  if (!hostname.includes(':')) return false;
  try {
    const norm = expandIPv6(hostname);
    return norm.toLowerCase().startsWith('fe8') || norm.toLowerCase().startsWith('fe9') ||
           norm.toLowerCase().startsWith('fea') || norm.toLowerCase().startsWith('feb');
  } catch {
    return false;
  }
}

// ULA: fc00::/7 → first two chars are 'fc' or 'fd'
export function isIPv6ULA(hostname) {
  if (!hostname.includes(':')) return false;
  try {
    const norm = expandIPv6(hostname);
    const head = norm.toLowerCase().slice(0, 2);
    return head === 'fc' || head === 'fd';
  } catch {
    return false;
  }
}

export function expandIPv6(ip) {
  if (ip.includes('::')) {
    const [pre, post] = ip.split('::');
    const preParts = pre ? pre.split(':').filter(Boolean) : [];
    const postParts = post ? post.split(':').filter(Boolean) : [];
    const missing = 8 - preParts.length - postParts.length;
    const middle = Array(missing).fill('0');
    const parts = [...preParts, ...middle, ...postParts];
    return parts.map(p => p.padStart(4, '0')).join(':');
  }
  return ip.split(':').map(p => p.padStart(4, '0')).join(':');
}

// ---------------------------------------------------------------------------
// Hostname / URL checks
// ---------------------------------------------------------------------------

export const DANGEROUS_HOSTNAMES = new Set(['localhost']);
export const DANGEROUS_SUFFIXES = ['.local', '.localhost', '.internal'];

export function isPrivateURL(hostname) {
  // Normalize: strip trailing dot (FQDN form like "localhost.")
  let h = hostname.toLowerCase();
  if (h.endsWith('.')) h = h.slice(0, -1);

  // IPv4 check
  if (ipv4ToInt(h) !== null) {
    for (const cidr of DANGEROUS_IPV4_CIDRS) {
      if (ipv4InCidr(h, cidr)) return true;
    }
    return false;
  }

  // IPv6 check — unbracket if needed
  let ipv6 = h;
  if (h.startsWith('[') && h.endsWith(']')) ipv6 = h.slice(1, -1);

  if (ipv6.includes(':')) {
    if (DANGEROUS_IPV6.has(ipv6)) return true;
    if (isIPv6LinkLocal(ipv6) || isIPv6ULA(ipv6)) return true;
    // IPv4-mapped: handle both dotted (::ffff:127.0.0.1) and canonical hex (::ffff:7f00:1)
    const mappedHex = ipv6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      const ip = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
      return isPrivateURL(ip);
    }
    const mappedDot = ipv6.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
    if (mappedDot) return isPrivateURL(mappedDot[1]);
    return false;
  }

  // Hostname
  if (DANGEROUS_HOSTNAMES.has(h)) return true;
  for (const suffix of DANGEROUS_SUFFIXES) {
    if (h.endsWith(suffix)) return true;
  }
  return false;
}

export function assessUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    // Malformed URL → fail closed
    return { safe: false, reason: `malformed URL: ${urlStr.slice(0, 64)}` };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: true, reason: 'non-http(s) protocol' };
  }

  if (isPrivateURL(parsed.hostname)) {
    return { safe: false, reason: `private-network hostname: ${parsed.hostname}` };
  }

  return { safe: true, reason: 'public hostname' };
}

// ---------------------------------------------------------------------------
// URL extraction
// ---------------------------------------------------------------------------

export const URL_RE = /https?:\/\/[^\s"'`<>]+/gi;

export function cleanUrl(url) {
  return url.replace(/[)\],.;!?]+$/g, '');
}

export function extractUrls(command) {
  const matches = command.match(URL_RE) || [];
  return [...new Set(matches.map(cleanUrl).map(u => {
    try { const d = decodeURIComponent(u); return d.includes(' ') ? u : d; } catch { return u; }
  }))];
}

// ---------------------------------------------------------------------------
// Convenience: full extraction → first-unsafe scan
// ---------------------------------------------------------------------------

/**
 * Scan a command string for dangerous URLs.
 * @param {string} command
 * @returns {null | {url: string, reason: string}}
 *   null  — no dangerous URLs found (safe)
 *   {url, reason} — first unsafe URL and why
 */
export function scanCommand(command) {
  const urls = extractUrls(command);
  for (const url of urls) {
    const result = assessUrl(url);
    if (!result.safe) {
      return { url, reason: `URL blocked: ${result.reason}` };
    }
  }
  return null; // safe
}
