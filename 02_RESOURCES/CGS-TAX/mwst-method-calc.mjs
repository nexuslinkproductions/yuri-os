#!/usr/bin/env node
// @capability: cgs-mwst-method-calc
// @serves: Effektiv vs Saldosteuersatz | MwSt Abrechnungsmethode | VAT method comparison | Einlageentsteuerung estimate | SSS breakeven
// @does: parametric Swiss-VAT method comparison for CGS (effective method vs Saldosteuersatz) from the
//        cgs-books / cockpit figures, with price-pass-through scenarios, Bezugsteuer, Einlageentsteuerung
//        one-off, and the breakeven Saldosteuersatz. Prints a markdown report.
// @use:  rerun whenever the figures, the SSS rate, or an assumption changes:
//        node 02_RESOURCES/CGS-TAX/mwst-method-calc.mjs [--sss 3.7] [--year 2026] [--rent-opted] [--md]
// @exports: compute, DEFAULTS
//
// Every number here is an INPUT with a provenance comment. The law side (rates, which spend carries
// deductible tax) is cited to 02_RESOURCES/CGS-TAX/sources/*.md; "[A]" marks an assumption René must
// confirm (see 10-cgs-figures-2025-2026.md §C3). Output is advisory until the Treuhänder signs the method.

const RATE = 0.081;                 // Normalsatz Art. 25 Abs. 1 MWSTG (since 01/01/2024)
const INCL = RATE / (1 + RATE);     // VAT share of a gross (VAT-inclusive) amount = 7.4930 %

// Figures: 02_RESOURCES/CGS-TAX/10-cgs-figures-2025-2026.md (pulled 24/10/2026)
export const DEFAULTS = {
  2025: {
    label: '2025 actual (cgs-books, full year)',
    revenue: 83868.02,          // 3000 Produktionserlöse, cash basis
    export_share: 0.003,        // EUR proxy 215.65 / 74'741 (cockpit)
    ch81: 25698,                // Swiss suppliers with 8.1 % on invoice  [A: CKK is Swiss]
    post: 5505,                 // Swiss Post postage, domestic share below
    import_big: 19600,          // goods from abroad incl. the Sorotec CNC 13'692 (investment)
    import_small: 1536,         // AliExpress de-minimis parcels, no Einfuhrsteuer
    courier: 1327,              // UPS/FedEx bills (Einfuhrsteuer+duty+fee)
    bezug: 385,                 // foreign services → Bezugsteuer
    rent: 5760,                 // 4'260 + 1'500 Schallschutzkabine
    exempt_other: 1978 + 459,   // SVA/AXA/bank + private sellers
    unknown: 3379 - 1500,
  },
  2026: {
    label: '2026 YTD 01/01–24/10 (cgs-books), annualised ×1.23',
    scale: 365 / 297,
    revenue: 85396,
    export_share: 0.021,        // EUR proxy 2'069 / 98'057 (cockpit)
    ch81: 17729,
    post: 3765,
    import_big: 18387,          // incl. Commarker laser 2'758 (investment)
    import_small: 190,
    courier: 671,
    bezug: 1607,
    rent: 1820,
    exempt_other: 321,
    unknown: 1039,
  },
};

export const ASSUMPTIONS = {
  post_domestic_share: 0.90,    // [A] exports ≈ 2 % of revenue → postage mostly domestic; cross-border postage is exempt
  courier_fee_share: 0.25,      // [A] share of a courier bill that is the courier's own fee (8.1 %) vs tax/duty passed through
  import_vat_share: 1.00,       // Einfuhrsteuer = 8.1 % of the CIF value; import_big is the CHF paid ≈ CIF (no VAT inside)
  rent_opted: false,            // [A] landlord opted for VAT? (Art. 22) — default no
  trade_share: 0.15,            // [A] resold-goods share of turnover (second SSS at 2.1 %)
  // Einlageentsteuerung (Art. 32 MWSTG; Zeitwert = cost − 20 %/year for movables, MWSTV Art. 73 — verify in sources/02 §4)
  assets_on_2027_01_01: [
    { name: 'Sorotec CNC gantry (DE import, 2025)', cost: 13692, year: 2025, vat_basis: 'einfuhr' },
    { name: 'Atomstack laser (import, 2025)',        cost: 2178,  year: 2025, vat_basis: 'einfuhr' },
    { name: 'Commarker laser (import, 2026)',        cost: 2758,  year: 2026, vat_basis: 'einfuhr' },
    { name: 'Kydex/HDPE/hardware stock [A]',         cost: 8000,  year: 2026, vat_basis: 'mixed', stock: true }, // inventory: full value, no depreciation
    { name: 'Vacuum press, Bambu P2S, tools [A]',    cost: 4000,  year: 2024, vat_basis: 'incl' },
  ],
};

export function compute(year = 2026, opts = {}) {
  const f = { ...DEFAULTS[year] };
  const A = { ...ASSUMPTIONS, ...opts };
  const s = f.scale ?? 1;
  for (const k of ['revenue', 'ch81', 'post', 'import_big', 'import_small', 'courier', 'bezug', 'rent', 'exempt_other', 'unknown']) f[k] *= s;

  const domestic = f.revenue * (1 - f.export_share);
  const exports = f.revenue - domestic;

  // ---- Output tax, two price policies -------------------------------------------------------
  // (a) ABSORB: keep today's gross prices → VAT is carved out of the price (net revenue drops)
  // (b) PASS-THROUGH: raise prices by 8.1 % → net revenue unchanged, customer pays the VAT
  const out_absorb = domestic * INCL;
  const out_pass = domestic * RATE;

  // ---- Input tax (Vorsteuer), effective method only ----------------------------------------
  const vst_ch = f.ch81 * INCL;
  const vst_post = f.post * A.post_domestic_share * INCL;
  const vst_import = f.import_big * A.import_vat_share * RATE;      // Einfuhrsteuer, needs the BAZG eVV
  const vst_courier = f.courier * A.courier_fee_share * INCL;
  const vst_rent = A.rent_opted ? f.rent * INCL : 0;
  const vst_total = vst_ch + vst_post + vst_import + vst_courier + vst_rent;

  // Bezugsteuer (Art. 45, Ziffer 383): declared by both methods; deductible only under Effektiv (Ziffer 400) → neutral there, a cost under SSS (MWSTV Art. 91)
  const bezug_tax = f.bezug * RATE;

  const eff = {
    absorb: out_absorb - vst_total,
    pass: out_pass - vst_total,
    out_absorb, out_pass, vst_total, vst_ch, vst_post, vst_import, vst_courier, vst_rent, bezug_tax,
  };

  // ---- Saldosteuersatz: rate × gross turnover (domestic); exports reported at 0; Bezugsteuer paid on top
  const sss = (rate) => ({
    absorb: domestic * rate + bezug_tax,                 // gross prices unchanged
    pass: domestic * (1 + RATE) * rate + bezug_tax,      // prices raised 8.1 %, SSS applies to the new gross
  });

  // Breakeven SSS rate: where SSS tax == Effektiv tax (absorb scenario)
  const breakeven_absorb = (eff.absorb - bezug_tax) / domestic;
  const breakeven_pass = (eff.pass - bezug_tax) / (domestic * (1 + RATE));

  // ---- Einlageentsteuerung one-off (Effektiv only; Art. 32 + MWSTV 72-73: 20 %/yr linear on movables)
  const einlage = A.assets_on_2027_01_01.map(a => {
    const yrs = a.stock ? 0 : Math.max(0, 2027 - a.year);
    const zeitwert = a.cost * Math.max(0, 1 - 0.2 * yrs);
    const vat = a.vat_basis === 'einfuhr' ? zeitwert * RATE : a.vat_basis === 'incl' ? zeitwert * INCL : zeitwert * (RATE + INCL) / 2;
    return { ...a, yrs, zeitwert, vat };
  });
  const einlage_total = einlage.reduce((t, a) => t + a.vat, 0);

  return { year, label: f.label, f, A, domestic, exports, eff, sss, breakeven_absorb, breakeven_pass, einlage, einlage_total };
}

const chf = n => n.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/’/g, "'");
const pct = n => (n * 100).toFixed(2) + ' %';

export function report(r, sssRates) {
  const L = [];
  L.push(`### ${r.label}`);
  L.push('');
  L.push(`Revenue ${chf(r.f.revenue)} → domestic ${chf(r.domestic)} (export share ${pct(r.f.export_share)}, exports ${chf(r.exports)} at 0 %).`);
  L.push('');
  L.push('| | Prices unchanged (absorb) | Prices +8.1 % (pass-through) |');
  L.push('|---|---|---|');
  L.push(`| Output tax (Umsatzsteuer) | ${chf(r.eff.out_absorb)} | ${chf(r.eff.out_pass)} |`);
  L.push(`| − Vorsteuer CH suppliers (8.1 % incl.) | ${chf(r.eff.vst_ch)} | ${chf(r.eff.vst_ch)} |`);
  L.push(`| − Vorsteuer Swiss Post (domestic ${pct(r.A.post_domestic_share)}) | ${chf(r.eff.vst_post)} | ${chf(r.eff.vst_post)} |`);
  L.push(`| − Einfuhrsteuer on imports (needs eVV) | ${chf(r.eff.vst_import)} | ${chf(r.eff.vst_import)} |`);
  L.push(`| − Vorsteuer courier fees | ${chf(r.eff.vst_courier)} | ${chf(r.eff.vst_courier)} |`);
  L.push(`| − Vorsteuer rent (${r.A.rent_opted ? 'opted' : 'not opted'}) | ${chf(r.eff.vst_rent)} | ${chf(r.eff.vst_rent)} |`);
  L.push(`| Bezugsteuer (declared + deducted = 0) | 0 | 0 |`);
  L.push(`| **EFFEKTIV net tax / year** | **${chf(r.eff.absorb)}** | **${chf(r.eff.pass)}** |`);
  for (const rate of sssRates) {
    const s = r.sss(rate);
    const lbl = Math.abs(rate - 0.037) < 1e-9 ? 'Kunststoffwaren-Herstellung' : Math.abs(rate - 0.045) < 1e-9 ? 'generic Herstellung' : `blended 3.7/2.1 (trade share ${pct(r.A.trade_share ?? 0.15)})`;
    L.push(`| **SALDO @ ${(rate * 100).toFixed(2)} %** ${lbl} (incl. Bezugsteuer ${chf(r.eff.bezug_tax)}) | **${chf(s.absorb)}** | **${chf(s.pass)}** |`);
  }
  L.push('');
  L.push(`Breakeven Saldosteuersatz: **${pct(r.breakeven_absorb)}** (absorb) / **${pct(r.breakeven_pass)}** (pass-through). ` +
    'A Branchen-SSS below this is cheaper than Effektiv on the recurring year; above it, Effektiv wins.');
  L.push('');
  L.push('Einlageentsteuerung one-off on 01/01/2027 (Effektiv only — NOT available under Saldo):');
  L.push('');
  L.push('| Asset | Cost | Years held | Zeitwert (−20 %/yr) | Recoverable |');
  L.push('|---|---|---|---|---|');
  for (const a of r.einlage) L.push(`| ${a.name} | ${chf(a.cost)} | ${a.yrs} | ${chf(a.zeitwert)} | ${chf(a.vat)} |`);
  L.push(`| **Total one-off** | | | | **${chf(r.einlage_total)}** |`);
  L.push('');
  return L.join('\n');
}

// ---- CLI ------------------------------------------------------------------------------------
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('mwst-method-calc.mjs')) {
  const args = process.argv.slice(2);
  const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const sssArg = get('--sss', null);
  // Default rates = what the ESTV ordinance SR 641.202.62 offers for this business (sources/02 §3):
  //   3.7 % Kunststoffe/Kunststoffwaren: Herstellung (also Sattlerei)  ← most plausible for a Kydex holster maker
  //   4.5 % Herstellung von Gegenständen zum Normalsatz, soweit nicht anderswo genannt (ESTV fallback)
  //   2.1 % Handel (resold accessories — a second SSS is granted per activity above 10 % of turnover, MI12 §15.1)
  const tradeShare = Number(get('--trade-share', '0.15'));   // [A] share of turnover that is resold goods (4200 Handelswaren)
  const blended = 0.037 * (1 - tradeShare) + 0.021 * tradeShare;
  const sssRates = sssArg ? sssArg.split(',').map(Number).map(x => x / 100) : [0.037, 0.045, blended];
  const years = get('--year', '2026,2025').split(',').map(Number);
  const opts = { rent_opted: args.includes('--rent-opted'), trade_share: tradeShare };
  const out = [];
  out.push('# Effektiv vs Saldosteuersatz — CGS, computed ' + new Date().toLocaleDateString('de-CH'));
  out.push('');
  out.push('Generated by `02_RESOURCES/CGS-TAX/mwst-method-calc.mjs` (rerun with `--sss <rate[,rate]>` once the Branchen-rate is confirmed; `--rent-opted` if the landlord charges MWST). All inputs + their provenance are in the script header and in `10-cgs-figures-2025-2026.md`.');
  out.push('');
  for (const y of years) out.push(report(compute(y, opts), sssRates));
  console.log(out.join('\n'));
}
