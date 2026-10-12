#!/usr/bin/env node
// Builds candlestick-guide.pdf: an illustrated beginner's guide to candlestick charts.
// HTML + inline SVG, printed to PDF by headless Chromium.
// Usage: node candlestick-guide.mjs [path-to-chrome]   (or set CHROME_PATH)
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'candlestick-guide.pdf');
const CHROME = process.argv[2] || process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PAGES = 5;

// TradingView default candle colors, so the guide matches the real platform.
const C = {
  up: '#089981', down: '#F23645',
  ink: '#1F2328', ink2: '#4B5563', muted: '#8A9099',
  grid: '#E6E8EB', panel: '#F6F7F8', surface: '#FFFFFF',
};

// ---------- drawing helpers ----------
const k = (o, h, l, c, ctx = false) => ({ o, h, l, c, ctx });
const ctx = (o, h, l, c) => k(o, h, l, c, true);
const scale = (lo, hi, top, bottom) => (p) => top + ((hi - p) / (hi - lo)) * (bottom - top);
const cx = (i, x0, cw, gap) => x0 + i * (cw + gap) + cw / 2;

function candles(data, { x0, cw, gap, y, wick = 1.5 }) {
  return data.map((d, i) => {
    const x = cx(i, x0, cw, gap);
    const col = d.c >= d.o ? C.up : C.down;
    const top = y(Math.max(d.o, d.c));
    const bot = y(Math.min(d.o, d.c));
    const bh = Math.max(bot - top, 1.6);
    const by = (top + bot) / 2 - bh / 2;
    return `<g opacity="${d.ctx ? 0.3 : 1}">` +
      `<line x1="${x}" x2="${x}" y1="${y(d.h)}" y2="${y(d.l)}" stroke="${col}" stroke-width="${wick}"/>` +
      `<rect x="${x - cw / 2}" y="${by}" width="${cw}" height="${bh}" fill="${col}" rx="1"/></g>`;
  }).join('');
}

function miniChart(data, W = 128, H = 116) {
  const cw = 13, gap = 7;
  const lo = Math.min(...data.map((d) => d.l));
  const hi = Math.max(...data.map((d) => d.h));
  const pad = (hi - lo) * 0.08;
  const y = scale(lo - pad, hi + pad, 6, H - 6);
  const span = data.length * (cw + gap) - gap;
  const x0 = (W - span) / 2;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" rx="6" fill="${C.panel}"/>${candles(data, { x0, cw, gap, y })}</svg>`;
}

const GLYPH = { up: '▲', down: '▼', flat: '◆' };
const GCOL = { up: C.up, down: C.down, flat: C.muted };
const tag = (dir, label) =>
  `<span class="tag"><span style="color:${GCOL[dir]}">${GLYPH[dir]}</span> ${label}</span>`;

function card(p) {
  return `<div class="card">${miniChart(p.data)}<div class="ctext">
    <div class="cname">${p.name}</div>${tag(p.dir, p.tag)}
    <p><b>Shape:</b> ${p.shape}</p><p><b>Means:</b> ${p.means}</p><p><b>${p.lastLabel || 'Confirm'}:</b> ${p.last}</p>
  </div></div>`;
}

// ---------- context sequences (faded candles before each pattern) ----------
const DOWN3 = [ctx(56, 56.4, 53.6, 54), ctx(54, 54.4, 51.6, 52), ctx(52, 52.3, 49.6, 50)];
const UP3 = [ctx(44, 46.5, 43.5, 46), ctx(46, 48.6, 45.6, 48), ctx(48, 50.5, 47.6, 50)];
const SIDE3 = [ctx(50, 52, 49.5, 51), ctx(51, 51.6, 49.8, 50.3), ctx(50.3, 51.5, 50, 51)];
const DOWN2 = [ctx(57, 57.4, 54.6, 55), ctx(55, 55.3, 52.6, 53)];
const UP2 = [ctx(43, 45.4, 42.6, 45), ctx(45, 47.4, 44.7, 47)];

const SINGLES = [
  { name: 'Bullish Marubozu', dir: 'up', tag: 'Strong buying', data: [...SIDE3, k(50.8, 56, 50.8, 56)],
    shape: 'Long green body, no wicks (or tiny ones).',
    means: 'Buyers were in control from the open to the close.',
    lastLabel: 'Note', last: 'Often continues. After a long run it can also mark exhaustion.' },
  { name: 'Bearish Marubozu', dir: 'down', tag: 'Strong selling', data: [...SIDE3, k(51, 51, 45.8, 45.8)],
    shape: 'Long red body, no wicks.',
    means: 'Sellers were in control from the open to the close.',
    lastLabel: 'Note', last: 'A breakdown candle. Do not try to buy into it.' },
  { name: 'Doji', dir: 'flat', tag: 'Indecision', data: [...UP3, k(50.2, 52, 48.4, 50.25)],
    shape: 'Open and close almost equal, wicks on both sides.',
    means: 'Buyers and sellers ended the session in a draw.',
    lastLabel: 'Note', last: 'Matters only after a strong move: the push is losing force. Not yet a reversal.' },
  { name: 'Dragonfly Doji', dir: 'up', tag: 'Possible bottom', data: [...DOWN3, k(49.8, 49.9, 45.5, 49.85)],
    shape: 'Open, close and high at the top; long lower wick.',
    means: 'Sellers pushed price far down, buyers pushed it all the way back.',
    last: 'Next candle closes higher.' },
  { name: 'Gravestone Doji', dir: 'down', tag: 'Possible top', data: [...UP3, k(50.2, 54.5, 50.1, 50.15)],
    shape: 'Open, close and low at the bottom; long upper wick.',
    means: 'Buyers pushed price far up, sellers erased all of it.',
    last: 'Next candle closes lower.' },
  { name: 'Spinning Top', dir: 'flat', tag: 'Indecision', data: [...UP3, k(50, 52.4, 48.4, 50.8)],
    shape: 'Small body in the middle, wicks on both sides.',
    means: 'Both sides tried, neither won.',
    lastLabel: 'Note', last: 'In a trend it is a pause. Several in a row: the market is waiting.' },
  { name: 'Hammer', dir: 'up', tag: 'Bullish reversal hint', data: [...DOWN3, k(49, 50, 45.6, 49.9)],
    shape: 'After a decline. Small body at the top, lower wick at least 2× the body.',
    means: 'Sellers pushed price down, buyers rejected the low. Location matters more than color.',
    last: 'Next candle closes above the hammer’s high.' },
  { name: 'Hanging Man', dir: 'down', tag: 'Bearish warning', data: [...UP3, k(51, 51.1, 46.8, 50.2)],
    shape: 'Same shape as the hammer, but after a rise.',
    means: 'Sellers managed a hard push down during the session. A first crack in the uptrend.',
    last: 'Next candle closes below its body.' },
  { name: 'Inverted Hammer', dir: 'up', tag: 'Bullish hint (weak)', data: [...DOWN3, k(49.6, 53.6, 49.5, 50.3)],
    shape: 'After a decline. Small body at the bottom, long upper wick.',
    means: 'Buyers tried to push up and failed, but they showed up.',
    last: 'Needs a strong green candle next, more than any other pattern on this page.' },
  { name: 'Shooting Star', dir: 'down', tag: 'Bearish reversal hint', data: [...UP3, k(50.8, 54.6, 50, 50.1)],
    shape: 'After a rise. Small body at the bottom, upper wick at least 2× the body.',
    means: 'Buyers pushed up, sellers slammed price back down.',
    last: 'Next candle closes lower.' },
];

const MULTIS = [
  { name: 'Bullish Engulfing', dir: 'up', tag: 'Reversal', data: [...DOWN2, k(53, 53.3, 51.3, 51.6), k(51.3, 54.1, 51, 53.8)],
    shape: 'After a decline. A green body fully covers the previous red body.',
    means: 'Buyers took back more than the whole previous session’s selling.',
    lastLabel: 'Note', last: 'Stronger at support and on high volume.' },
  { name: 'Bearish Engulfing', dir: 'down', tag: 'Reversal', data: [...UP2, k(47, 48.7, 46.8, 48.4), k(48.7, 49, 46.1, 46.4)],
    shape: 'After a rise. A red body fully covers the previous green body.',
    means: 'Sellers took back more than the previous session’s gains.',
    lastLabel: 'Note', last: 'Stronger at resistance and on high volume.' },
  { name: 'Piercing Line', dir: 'up', tag: 'Reversal', data: [...DOWN2, k(52.6, 52.9, 47.8, 48), k(47.4, 51.2, 47.1, 50.9)],
    shape: 'Long red candle, then a green one that opens below its close and closes above the middle of the red body.',
    means: 'Buyers recovered more than half of the sell-off.',
    lastLabel: 'Note', last: 'The weaker cousin of the bullish engulfing.' },
  { name: 'Dark Cloud Cover', dir: 'down', tag: 'Reversal', data: [...UP2, k(47.4, 52.2, 47.1, 52), k(52.6, 52.9, 49.1, 49.4)],
    shape: 'Long green candle, then a red one that opens above its close and closes below the middle of the green body.',
    means: 'Sellers wiped out more than half of the rally.',
    lastLabel: 'Note', last: 'The weaker cousin of the bearish engulfing.' },
  { name: 'Bullish Harami', dir: 'up', tag: 'Selling dries up', data: [...DOWN2, k(53, 53.3, 47.7, 48), k(49, 50.7, 48.7, 50.3)],
    shape: 'After a decline. A small candle sits entirely inside the previous long red body.',
    means: 'The selling momentum stopped. That is not yet buying strength.',
    last: 'A close above the long red candle’s open.' },
  { name: 'Bearish Harami', dir: 'down', tag: 'Buying dries up', data: [...UP2, k(47, 52.3, 46.7, 52), k(51, 51.3, 49.4, 49.7)],
    shape: 'After a rise. A small candle sits entirely inside the previous long green body.',
    means: 'The buying momentum stopped.',
    last: 'A close below the long green candle’s open.' },
  { name: 'Morning Star', dir: 'up', tag: 'Reversal (3 candles)', data: [ctx(57, 57.4, 54.6, 55), k(55, 55.3, 49.2, 49.5), k(48.8, 49.6, 48, 49), k(49.4, 53.5, 49.2, 53.2)],
    shape: 'Long red, then a small candle lower down, then a long green closing above the middle of the first.',
    means: 'Three sessions, one story: sellers, then stalemate, then buyers.',
    lastLabel: 'Note', last: 'On stocks the small candle often gaps; on 24-hour markets it usually does not.' },
  { name: 'Evening Star', dir: 'down', tag: 'Reversal (3 candles)', data: [ctx(43, 45.4, 42.6, 45), k(45, 50.8, 44.7, 50.5), k(51.2, 52, 50.4, 51), k(50.6, 50.8, 46.5, 46.8)],
    shape: 'Long green, then a small candle higher up, then a long red closing below the middle of the first.',
    means: 'Buyers, then stalemate, then sellers.',
    lastLabel: 'Note', last: 'The mirror image of the morning star.' },
  { name: 'Three White Soldiers', dir: 'up', tag: 'Strong buying', data: [ctx(52, 52.3, 49.7, 50), ctx(50, 50.3, 48.2, 48.5), k(48.6, 50.8, 48.4, 50.6), k(50.2, 52.6, 50, 52.4), k(52, 54.5, 51.8, 54.3)],
    shape: 'Three long green candles, each opening inside the previous body and closing near its high.',
    means: 'Steady, persistent buying over three sessions.',
    lastLabel: 'Note', last: 'Late in a long rally it can mean the move is overstretched.' },
  { name: 'Three Black Crows', dir: 'down', tag: 'Strong selling', data: [ctx(48, 50.3, 47.7, 50), ctx(50, 51.8, 49.7, 51.5), k(51.4, 51.6, 49.2, 49.4), k(49.8, 50, 47.4, 47.6), k(48, 48.2, 45.5, 45.7)],
    shape: 'Three long red candles, each opening inside the previous body and closing near its low.',
    means: 'Steady, persistent selling over three sessions.',
    lastLabel: 'Note', last: 'Do not try to catch it. Wait for a bottoming pattern first.' },
];

// ---------- page 1: anatomy ----------
function anatomySVG() {
  const W = 360, H = 300;
  const y = scale(25, 85, 20, H - 20);
  const g = { x: 110, o: 40, c: 70 }, r = { x: 250, o: 70, c: 40 };
  const hi = 80, lo = 30, bw = 46;
  const one = (s, col) =>
    `<line x1="${s.x}" x2="${s.x}" y1="${y(hi)}" y2="${y(lo)}" stroke="${col}" stroke-width="3"/>` +
    `<rect x="${s.x - bw / 2}" y="${y(Math.max(s.o, s.c))}" width="${bw}" height="${y(Math.min(s.o, s.c)) - y(Math.max(s.o, s.c))}" fill="${col}" rx="2"/>`;
  const lab = (x1, p, x2, text, anchor) =>
    `<line x1="${x1}" x2="${x2}" y1="${y(p)}" y2="${y(p)}" stroke="${C.muted}" stroke-width="1"/>` +
    `<text x="${anchor === 'end' ? x2 - 4 : x2 + 4}" y="${y(p) + 4}" text-anchor="${anchor}" class="al">${text}</text>`;
  const bracket = (p1, p2, text) => {
    const xm = 180, y1 = y(p1), y2 = y(p2);
    return `<path d="M${xm - 5} ${y1 + 2} H${xm} V${y2 - 2} H${xm - 5}" fill="none" stroke="${C.ink2}" stroke-width="1"/>` +
      `<text x="${xm + 4}" y="${(y1 + y2) / 2 + 4}" class="al2">${text}</text>`;
  };
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${one(g, C.up)}${one(r, C.down)}
    ${lab(g.x, hi, 70, 'High', 'end')}${lab(g.x - bw / 2, g.c, 70, 'Close', 'end')}
    ${lab(g.x - bw / 2, g.o, 70, 'Open', 'end')}${lab(g.x, lo, 70, 'Low', 'end')}
    ${lab(r.x, hi, 290, 'High', 'start')}${lab(r.x + bw / 2, r.o, 290, 'Open', 'start')}
    ${lab(r.x + bw / 2, r.c, 290, 'Close', 'start')}${lab(r.x, lo, 290, 'Low', 'start')}
    ${bracket(80, 70, 'Upper wick')}${bracket(70, 40, 'Body')}${bracket(40, 30, 'Lower wick')}
    <text x="${g.x}" y="${H - 2}" text-anchor="middle" class="al"><tspan fill="${C.up}">▲</tspan> Up candle</text>
    <text x="${r.x}" y="${H - 2}" text-anchor="middle" class="al"><tspan fill="${C.down}">▼</tspan> Down candle</text>
  </svg>`;
}

// tiny two-candle comparisons for the "three questions"
function pairSVG(a, b, la, lb) {
  const W = 170, H = 104;
  const y = scale(0, 10, 8, H - 20);
  const one = (d, x) => {
    const col = d.c >= d.o ? C.up : C.down;
    const t = y(Math.max(d.o, d.c)), bt = y(Math.min(d.o, d.c));
    return `<line x1="${x}" x2="${x}" y1="${y(d.h)}" y2="${y(d.l)}" stroke="${col}" stroke-width="2"/>` +
      `<rect x="${x - 9}" y="${t}" width="18" height="${Math.max(bt - t, 1.6)}" fill="${col}" rx="1"/>`;
  };
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="6" fill="${C.panel}"/>
    ${one(a, 48)}${one(b, 122)}
    <text x="48" y="${H - 6}" text-anchor="middle" class="al3">${la}</text>
    <text x="122" y="${H - 6}" text-anchor="middle" class="al3">${lb}</text></svg>`;
}

// ---------- page 2: candles in context ----------
const STORY = [
  k(60, 60.5, 58.2, 58.6), k(58.6, 59, 57, 57.4), k(57.4, 58.6, 57.1, 58.1), k(58.1, 58.3, 55.8, 56.2),
  k(56.2, 56.6, 54.5, 54.9), k(54.9, 55.9, 54.6, 55.5), k(55.5, 55.7, 53, 53.4), k(53.4, 53.7, 51.4, 51.8),
  k(51.8, 52.1, 50, 50.4), k(50.4, 50.7, 48.6, 49), k(48.6, 49.4, 46.4, 49.3), k(49.4, 51.1, 49.2, 50.9),
  k(50.9, 51.2, 49.7, 50), k(49.8, 52, 49.6, 51.8), k(51.8, 53, 51.5, 52.6), k(52.5, 54.4, 52.3, 54.2),
  k(53.9, 56, 53.7, 55.8), k(55.5, 57.6, 55.3, 57.4), k(57.4, 57.9, 56.4, 56.8), k(56.8, 58.9, 56.6, 58.6),
  k(58.6, 60.2, 58.4, 59.9), k(60, 61, 59.1, 60.05), k(59.9, 62.6, 59.8, 60.3), k(60.5, 60.7, 58.2, 58.4),
  k(58.4, 58.7, 56.9, 57.2), k(57.2, 58.2, 56.9, 57.8), k(57.8, 58, 55.7, 56), k(56, 56.3, 54.3, 54.6),
];

function storySVG() {
  const W = 690, H = 430, axisW = 40;
  const cw = 13, gap = 9, x0 = 14;
  const y = scale(44.5, 64, 14, H - 30);
  const X = (i) => cx(i, x0, cw, gap);
  let s = '';
  for (const t of [46, 50, 54, 58, 62]) {
    s += `<line x1="0" x2="${W - axisW}" y1="${y(t)}" y2="${y(t)}" stroke="${C.grid}" stroke-width="1"/>` +
      `<text x="${W - axisW + 6}" y="${y(t) + 4}" class="ax">${t}</text>`;
  }
  const level = (p, i1, i2, text, col) =>
    `<line x1="${X(i1) - 10}" x2="${X(i2) + 10}" y1="${y(p)}" y2="${y(p)}" stroke="${col}" stroke-width="1.5" stroke-dasharray="5 4"/>` +
    `<text x="${X(i1) - 10}" y="${y(p) - 6}" class="lv">${text}</text>`;
  s += level(60.5, 0, 27, 'Resistance (old high)', C.ink2);
  s += level(46.4, 7, 17, 'Support', C.ink2);
  s += candles(STORY, { x0, cw, gap, y });
  const mark = (i, n, above) => {
    const d = STORY[i];
    const py = above ? y(d.h) - 15 : y(d.l) + 15;
    return `<circle cx="${X(i)}" cy="${py}" r="9" fill="${C.surface}" stroke="${C.ink}" stroke-width="1.5"/>` +
      `<text x="${X(i)}" y="${py + 4}" text-anchor="middle" class="mk">${n}</text>`;
  };
  s += mark(10, 1, false) + mark(13, 2, false);
  // bracket under three white soldiers (candles 15-17)
  const by = y(Math.min(STORY[15].l, STORY[16].l, STORY[17].l)) + 8;
  s += `<path d="M${X(15) - 7} ${by} V${by + 5} H${X(17) + 7} V${by}" fill="none" stroke="${C.ink}" stroke-width="1.2"/>`;
  s += `<circle cx="${X(16)}" cy="${by + 18}" r="9" fill="${C.surface}" stroke="${C.ink}" stroke-width="1.5"/>` +
    `<text x="${X(16)}" y="${by + 22}" text-anchor="middle" class="mk">3</text>`;
  s += mark(21, 4, true) + mark(22, 5, true) + mark(23, 6, false);
  s += `<text x="0" y="${H - 6}" class="ax">Each candle = 1 trading day (daily chart). Faint lines: price levels on the right axis.</text>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`;
}

const STORY_NOTES = [
  ['Hammer at support', 'Sellers push price to a new low, buyers reject it. The next day closes above the hammer’s high: confirmation.'],
  ['Bullish engulfing', 'After a small pullback, a green body swallows the red one. Buyers are now in charge.'],
  ['Three white soldiers', 'Three strong green days in a row. The new uptrend has momentum.'],
  ['Doji', 'After a strong rally, a draw. Momentum is fading. A reason to pay attention, not yet a sell signal.'],
  ['Shooting star at resistance', 'Buyers push above the old high, sellers slam price back below it. A failed breakout.'],
  ['Bearish engulfing', 'Sellers take back more than the previous day. This confirms the top, and the trend turns down.'],
];

// ---------- page 5: worked trade ----------
const TRADE = [
  k(86, 87.8, 85.6, 87.4), k(87.4, 89.3, 87, 88.9), k(88.9, 89.4, 87.8, 88.2), k(88.2, 90.4, 88, 90.1),
  k(90.1, 92.2, 89.8, 91.8), k(91.8, 92.3, 90.6, 91), k(91, 93.5, 90.8, 93.2), k(93.2, 95.9, 93, 95.6),
  k(95.6, 97.6, 95.2, 97.1), k(97.1, 97.8, 96, 96.4), k(96.4, 99.3, 96.2, 99), k(99, 102.6, 98.7, 102.3),
  k(102.3, 105, 102, 104.6), k(104.6, 106.8, 104.2, 106.2), k(106.2, 108.2, 105.8, 107.6), k(107.6, 107.9, 105, 105.4),
  k(105.4, 105.7, 102.8, 103.1), k(103.1, 103.4, 100.9, 101.4), k(101.4, 101.8, 99.6, 100.4), k(100, 101, 96, 100.8),
  k(100.9, 103.5, 100.6, 103.2), k(103.2, 104.9, 102.7, 104.4), k(104.4, 105.3, 103.4, 103.9),
];
const HAMMER = 19;

function ema(values, n) {
  const a = 2 / (n + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(a * values[i] + (1 - a) * out[i - 1]);
  return out;
}

function tradeSVG() {
  const W = 690, H = 330, labW = 150;
  const cw = 13, gap = 9, x0 = 10;
  const y = scale(84, 114, 12, H - 22);
  const X = (i) => cx(i, x0, cw, gap);
  const right = W - labW;
  let s = '';
  for (const t of [86, 92, 98, 104, 110]) {
    s += `<line x1="0" x2="${right}" y1="${y(t)}" y2="${y(t)}" stroke="${C.grid}" stroke-width="1"/>` +
      `<text x="${right + 6}" y="${y(t) + 4}" class="ax">${t}</text>`;
  }
  const entry = 101.1, stop = 95.9, target = entry + 2 * (entry - stop);
  const zx = X(HAMMER) - 10;
  s += `<rect x="${zx}" y="${y(target)}" width="${right - zx}" height="${y(entry) - y(target)}" fill="${C.up}" opacity="0.1"/>`;
  s += `<rect x="${zx}" y="${y(entry)}" width="${right - zx}" height="${y(stop) - y(entry)}" fill="${C.down}" opacity="0.1"/>`;
  const ma = ema(TRADE.map((d) => d.c), 10);
  s += `<polyline points="${ma.map((v, i) => `${X(i)},${y(v)}`).join(' ')}" fill="none" stroke="${C.ink2}" stroke-width="1.5" opacity="0.6"/>`;
  s += `<text x="${X(6)}" y="${y(ma[6]) + 16}" class="lv">moving average</text>`;
  s += candles(TRADE, { x0, cw, gap, y });
  const line = (p, col, text) =>
    `<line x1="${zx}" x2="${right}" y1="${y(p)}" y2="${y(p)}" stroke="${col}" stroke-width="1.5" stroke-dasharray="5 4"/>` +
    `<text x="${right + 40}" y="${y(p) + 4}" class="tl">${text}</text>`;
  s += line(target, C.up, `Target (2R) ${target.toFixed(2)}`);
  s += line(entry, C.ink, `Entry (buy stop) ${entry.toFixed(2)}`);
  s += line(stop, C.down, `Stop ${stop.toFixed(2)}`);
  const h = TRADE[HAMMER];
  s += `<line x1="${X(HAMMER)}" x2="${X(HAMMER)}" y1="${y(h.l) + 4}" y2="${y(h.l) + 22}" stroke="${C.muted}"/>` +
    `<text x="${X(HAMMER)}" y="${y(h.l) + 34}" text-anchor="middle" class="lv">Hammer: High 101.00 · Low 96.00</text>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`;
}

// ---------- document ----------
const footer = (n) =>
  `<div class="foot"><span>Candlestick Field Guide · educational material for paper-trading practice, not investment advice</span><span>${n} / ${PAGES}</span></div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Candlestick Field Guide</title>
<style>
@page { size: A4; margin: 13mm 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, 'DejaVu Sans', sans-serif; color: ${C.ink}; font-size: 10.5px; line-height: 1.42;
  font-feature-settings: 'tnum' 1; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { height: 270mm; position: relative; page-break-after: always; overflow: hidden; }
.page:last-child { page-break-after: auto; }
h1 { font-size: 26px; margin: 0 0 2px; letter-spacing: -0.3px; }
h2 { font-size: 17px; margin: 0 0 4px; }
h3 { font-size: 12.5px; margin: 0 0 4px; }
.sub { color: ${C.ink2}; font-size: 12px; margin: 0 0 14px; }
.lead { color: ${C.ink2}; margin: 0 0 10px; font-size: 11px; }
p { margin: 0 0 6px; }
.row { display: flex; gap: 18px; align-items: flex-start; }
.box { background: ${C.panel}; border-radius: 8px; padding: 10px 12px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.card { display: flex; gap: 10px; border: 1px solid ${C.grid}; border-radius: 8px; padding: 8px; height: 47mm; }
.card svg, .q svg { flex: none; }
.ctext p { margin: 0 0 3px; font-size: 9.6px; line-height: 1.36; }
.cname { font-weight: 700; font-size: 12px; }
.tag { display: inline-block; font-size: 9.6px; font-weight: 600; color: ${C.ink2}; margin: 1px 0 4px; }
.q { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
.q h3 { margin-bottom: 2px; }
.num { display: inline-flex; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid ${C.ink}; align-items: center; justify-content: center;
  font-weight: 700; font-size: 10px; flex: none; }
.notes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; margin-top: 8px; }
.note { display: flex; gap: 8px; }
.note b { display: block; }
ol, ul { margin: 0; padding-left: 16px; }
li { margin-bottom: 4px; }
table.calc { border-collapse: collapse; width: 100%; font-size: 10.5px; }
table.calc td { padding: 3px 0; border-bottom: 1px solid ${C.grid}; }
table.calc td:last-child { text-align: right; font-weight: 600; }
.al { font: 600 12px Inter, sans-serif; fill: ${C.ink}; }
.al2 { font: 500 11px Inter, sans-serif; fill: ${C.ink2}; }
.al3 { font: 500 9.5px Inter, sans-serif; fill: ${C.ink2}; }
.ax { font: 400 9.5px Inter, sans-serif; fill: ${C.muted}; }
.lv { font: 500 10px Inter, sans-serif; fill: ${C.ink2}; }
.tl { font: 600 10px Inter, sans-serif; fill: ${C.ink}; }
.mk { font: 700 10px Inter, sans-serif; fill: ${C.ink}; }
.foot { position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; font-size: 8.5px; color: ${C.muted};
  border-top: 1px solid ${C.grid}; padding-top: 4px; }
.colnote { font-size: 9.5px; color: ${C.ink2}; }
</style></head><body>

<section class="page">
  <h1>Reading Candlesticks</h1>
  <p class="sub">A field guide for your paper-trading practice</p>
  <div class="row">
    <div>${anatomySVG()}</div>
    <div style="flex:1">
      <h2>Anatomy of a candle</h2>
      <p>One candle = one time period. On a daily chart each candle is one trading day; on a 1-hour chart, one hour.
      Every candle shows four prices: <b>Open, High, Low, Close</b> (OHLC).</p>
      <p><b><span style="color:${C.up}">▲</span> Up candle (green):</b> closed higher than it opened. The open is the bottom of the body, the close is the top.</p>
      <p><b><span style="color:${C.down}">▼</span> Down candle (red):</b> closed lower than it opened. The open is the top of the body, the close is the bottom.</p>
      <p><b>Body:</b> the range between open and close. What the session actually achieved.</p>
      <p><b>Wicks</b> (also called shadows): how far price travelled but could not hold. A wick is a rejected price.</p>
    </div>
  </div>
  <h2 style="margin-top:16px">Three questions for every candle</h2>
  <p class="lead">You do not need to memorize 40 pattern names. Ask these three questions and most patterns explain themselves.</p>
  <div class="q">${pairSVG(k(3, 8.6, 2.6, 8.2), k(8, 8.4, 2.4, 2.8), 'buyers won', 'sellers won')}
    <div><h3><span class="num">1</span> Who won?</h3><p>Look at the color. Green: price closed above the open, so buyers won the session. Red: sellers won.</p></div></div>
  <div class="q">${pairSVG(k(2, 9.2, 1.6, 8.8), k(5, 9.2, 1.6, 5.4), 'clear win', 'barely a win')}
    <div><h3><span class="num">2</span> How clearly?</h3><p>Compare the body with the whole candle. A big body with small wicks shows conviction.
    A tiny body shows indecision: both sides fought, nobody won.</p></div></div>
  <div class="q">${pairSVG(k(6, 7.6, 1.6, 7.3), k(3.6, 9.2, 2.6, 3.0), 'low rejected', 'high rejected')}
    <div><h3><span class="num">3</span> What was rejected?</h3><p>Long wicks show where price went and got pushed back. A long lower wick:
    buyers defended the low. A long upper wick: sellers defended the high.</p></div></div>
  <div class="box" style="margin-top:10px">
    <p style="margin:0"><b>How to use this guide:</b> page 2 shows a full chart with the patterns in action. Pages 3 and 4 are the pattern
    catalogue (faded candles show the trend before the pattern). Page 5 turns a pattern into a complete paper trade with entry, stop and position size.</p>
  </div>
  <p class="colnote" style="margin-top:8px">Colors match TradingView’s defaults. If red and green are hard to tell apart for you, switch the chart type to
  <b>Hollow candles</b> in TradingView, or pick your own colors in Chart settings → Symbol.</p>
  ${footer(1)}
</section>

<section class="page">
  <h2>Candles in context: one chart, six signals</h2>
  <p class="lead">A downtrend finds support, turns into an uptrend, fails at an old high and turns down again. Numbers mark the signals described below.</p>
  ${storySVG()}
  <div class="notes">
    ${STORY_NOTES.map(([t, d], i) => `<div class="note"><span class="num">${i + 1}</span><div><b>${t}</b>${d}</div></div>`).join('')}
  </div>
  <div class="box" style="margin-top:14px">
    <h3>What to notice</h3>
    <ul>
      <li><b>Location made each signal meaningful.</b> The hammer appeared at a low, the shooting star at the old high. The same shapes in the middle of a range would mean little.</li>
      <li><b>The next candle confirmed each signal.</b> The hammer was followed by a higher close; the shooting star by a bearish engulfing. A pattern is a question, and the next candle is the answer.</li>
      <li><b>Indecision came before the turn.</b> The doji did not reverse anything by itself. It warned that the rally was running out of buyers.</li>
    </ul>
  </div>
  ${footer(2)}
</section>

<section class="page">
  <h2>Single-candle patterns</h2>
  <p class="lead">Faded candles show the trend before the pattern. The same shape can mean opposite things depending on where it appears.</p>
  <div class="grid">${SINGLES.map(card).join('')}</div>
  ${footer(3)}
</section>

<section class="page">
  <h2>Two- and three-candle patterns</h2>
  <p class="lead">These patterns show a shift of control over several sessions. They are usually more meaningful than a single candle.</p>
  <div class="grid">${MULTIS.map(card).join('')}</div>
  ${footer(4)}
</section>

<section class="page">
  <h2>From pattern to paper trade</h2>
  <p class="lead">An uptrend pulls back below its moving average and prints a hammer. Here is how the candle turns into a complete trade plan for a CHF 2000 account risking 1% (CHF 20).</p>
  ${tradeSVG()}
  <div class="row" style="margin-top:10px">
    <div class="box" style="flex:1">
      <h3>The calculation</h3>
      <table class="calc">
        <tr><td>Entry: buy stop just above the hammer’s high</td><td>101.10</td></tr>
        <tr><td>Stop: just below the hammer’s low</td><td>95.90</td></tr>
        <tr><td>Risk per share: 101.10 − 95.90</td><td>5.20</td></tr>
        <tr><td>Shares: 20 ÷ 5.20 = 3.85, always round down</td><td>3</td></tr>
        <tr><td>Money needed: 3 × 101.10</td><td>CHF 303.30</td></tr>
        <tr><td>Loss if stopped: 3 × 5.20, plus fees</td><td>CHF 15.60</td></tr>
        <tr><td>Target (2R): 101.10 + 2 × 5.20</td><td>111.50</td></tr>
      </table>
      <p class="colnote" style="margin-top:6px">The buy stop means you only get in if buyers follow through above the hammer’s high. No follow-through, no trade.
      TradingView’s <b>Long Position</b> tool (left toolbar) draws the green and red boxes for you.</p>
    </div>
    <div class="box" style="flex:1">
      <h3>Rules for using candles</h3>
      <ol>
        <li><b>Location beats shape.</b> At support or on a pullback in an uptrend, a hammer means something. In the middle of nowhere it is noise.</li>
        <li><b>Wait for confirmation.</b> Enter only when the next candle moves in the pattern’s direction.</li>
        <li><b>The pattern gives you the stop.</b> Below the pattern’s low for longs, above its high for shorts. Then size with the formula.</li>
        <li><b>Prefer daily candles.</b> A daily candle holds a full day of trading. 1-minute candles are far noisier.</li>
      </ol>
    </div>
  </div>
  <div class="row" style="margin-top:10px">
    <div class="box" style="flex:1">
      <h3>An honest warning</h3>
      <p style="margin:0">Academic tests have found that candlestick patterns on their own predict little. Treat them as a language for reading who is in control,
      not as buy and sell buttons. Test them yourself: tag every paper trade in your journal with its pattern, and after 50 trades check which ones actually made money.</p>
    </div>
    <div class="box" style="flex:1">
      <h3>Practice: Bar Replay drill</h3>
      <p style="margin:0">In TradingView, open a daily chart, start <b>Bar Replay</b> one year back and step forward one candle at a time.
      Each time you spot a hammer or an engulfing at support, write down the entry, stop and share count, then note what happened over the next 5 candles.
      Goal: 20 examples.</p>
    </div>
  </div>
  ${footer(5)}
</section>
</body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'candle-guide-'));
const htmlPath = join(dir, 'guide.html');
writeFileSync(htmlPath, html);
execFileSync(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
  `--print-to-pdf=${OUT}`, `file://${htmlPath}`,
], { stdio: 'pipe' });
console.log(`wrote ${OUT}`);
