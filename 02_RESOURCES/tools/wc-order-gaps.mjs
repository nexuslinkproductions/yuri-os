#!/usr/bin/env node
// WooCommerce order-gap finder.
// Usage:
//   node wc-order-gaps.mjs <orders.csv|orders.json> [--year 2026] [--min-gap 4] [--until YYYY-MM-DD]
//   WC_URL=https://shop.tld WC_KEY=ck_... WC_SECRET=cs_... node wc-order-gaps.mjs --api [--year 2026]
// Input: any CSV with a date column (WooCommerce Analytics/Orders export, order list export plugin)
//        or a JSON array of WC REST /wc/v3/orders objects (date_created).
// Reports every run of consecutive days with zero orders longer than --min-gap.

import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const YEAR = Number(opt('--year', '2026'));
const MIN_GAP = Number(opt('--min-gap', '4'));
const UNTIL = opt('--until', new Date().toISOString().slice(0, 10));
const file = args.find(a => !a.startsWith('--') && fs.existsSync(a));

function parseDate(s) {
  if (!s) return null;
  s = String(s).trim().replace(/^"|"$/g, '');
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/))) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function splitCsvLine(line, sep) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}

function datesFromCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const header = splitCsvLine(lines[0], sep).map(h => h.toLowerCase().trim());
  let col = header.findIndex(h => /^(order[_ ]?date|date[_ ]?created|date|created|order date \(.*\)|datum)$/.test(h));
  if (col < 0) col = header.findIndex(h => h.includes('date') || h.includes('datum'));
  if (col < 0) throw new Error(`No date column found. Header: ${header.join(' | ')}`);
  console.error(`# date column: "${header[col]}" (sep "${sep}")`);
  return lines.slice(1).map(l => parseDate(splitCsvLine(l, sep)[col])).filter(Boolean);
}

function datesFromJson(text) {
  const arr = JSON.parse(text);
  const rows = Array.isArray(arr) ? arr : (arr.orders || arr.data || []);
  return rows.map(o => parseDate(o.date_created || o.date_created_gmt || o.date || o.order_date)).filter(Boolean);
}

async function datesFromApi() {
  const { WC_URL, WC_KEY, WC_SECRET } = process.env;
  if (!WC_URL || !WC_KEY || !WC_SECRET) throw new Error('--api needs WC_URL, WC_KEY, WC_SECRET');
  const auth = 'Basic ' + Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64');
  const out = [];
  for (let page = 1; page < 200; page++) {
    const u = `${WC_URL.replace(/\/$/, '')}/wp-json/wc/v3/orders?status=any&per_page=100&page=${page}` +
      `&after=${YEAR}-01-01T00:00:00&before=${YEAR}-12-31T23:59:59&_fields=id,date_created,status`;
    const r = await fetch(u, { headers: { Authorization: auth } });
    if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    if (!rows.length) break;
    out.push(...rows.map(o => parseDate(o.date_created)));
    if (rows.length < 100) break;
  }
  return out.filter(Boolean);
}

const dayMs = 86400e3;
const toDays = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / dayMs);
const fromDays = n => new Date(n * dayMs).toISOString().slice(0, 10);

let dates;
if (args.includes('--api')) dates = await datesFromApi();
else if (!file) { console.error('Give a CSV/JSON file path or --api'); process.exit(2); }
else { const t = fs.readFileSync(file, 'utf8'); dates = t.trimStart().startsWith('[') || t.trimStart().startsWith('{') ? datesFromJson(t) : datesFromCsv(t); }

const total = dates.length;
dates = dates.filter(d => d.startsWith(`${YEAR}-`));
const days = [...new Set(dates.map(toDays))].sort((a, b) => a - b);
if (!days.length) { console.error(`No orders in ${YEAR} (parsed ${total} rows total)`); process.exit(1); }

const until = Math.min(toDays(UNTIL), toDays(`${YEAR}-12-31`));
const yearStart = toDays(`${YEAR}-01-01`);
const gaps = [];
const push = (from, to, edge) => { const n = to - from + 1; if (n > MIN_GAP) gaps.push({ from: fromDays(from), to: fromDays(to), days: n, edge }); };
if (days[0] > yearStart) push(yearStart, days[0] - 1, 'before first order');
for (let i = 1; i < days.length; i++) if (days[i] - days[i - 1] > 1) push(days[i - 1] + 1, days[i] - 1, '');
if (until > days.at(-1)) push(days.at(-1) + 1, until, `after last order (through ${UNTIL})`);

console.log(`Orders in ${YEAR}: ${dates.length} (of ${total} rows) on ${days.length} distinct days, ${fromDays(days[0])} .. ${fromDays(days.at(-1))}`);
console.log(`Gaps longer than ${MIN_GAP} days with zero orders:\n`);
console.log('from        to          days  note');
for (const g of gaps) console.log(`${g.from}  ${g.to}  ${String(g.days).padStart(4)}  ${g.edge}`);
const inner = gaps.filter(g => !g.edge);
console.log(`\nInner gaps: ${inner.length}, total ${inner.reduce((s, g) => s + g.days, 0)} days`);
console.log(`All gaps incl. edges: ${gaps.length}, total ${gaps.reduce((s, g) => s + g.days, 0)} days`);
