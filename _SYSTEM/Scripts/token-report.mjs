// _SYSTEM/Scripts/token-report.mjs
// Token usage watcher — pure formatting surface (observe-only, no enforcement)
//
// @capability: token-report
// @serves: token usage report | how many tokens used | cost watcher surface | observe-only token visibility | token rollup summary
// @does: pure renderReport(rollups) formats token-ledger getRollups() into a session + recent-daily totals summary; the CLI prints it. Observe-only — never enforces or arms anything.
// @use: `node _SYSTEM/Scripts/token-report.mjs` for a token-usage summary; import { renderReport } to format rollups elsewhere.
// @exports: renderReport

/**
 * Format token-usage rollups into a concise readable summary.
 * @param {Array<Object>|null|undefined} rollups - Array of daily rollup rows from getRollups()
 * @returns {string} Formatted summary (never throws)
 */
export function renderReport(rollups) {
  const emptyMsg = 'No token usage recorded.';
  if (!rollups || rollups.length === 0) return emptyMsg;

  // ---- Session totals (sum across all rows) ----
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;

  // ---- Group by day for recent daily totals ----
  const byDay = new Map(); // day -> {input, output, cost}
  for (const row of rollups) {
    const input = Number(row.input_tokens) || 0;
    const output = Number(row.output_tokens) || 0;
    const cost = Number(row.cost_usd) || 0;
    totalInput += input;
    totalOutput += output;
    totalCost += cost;

    const day = row.day;
    if (!day) continue;
    const d = byDay.get(day) || { input: 0, output: 0, cost: 0 };
    d.input += input;
    d.output += output;
    d.cost += cost;
    byDay.set(day, d);
  }

  const totalTokens = totalInput + totalOutput;
  const fmt = (n) => Number(n).toLocaleString();
  const fmtCost = (n) => Number(n).toFixed(4);

  // ---- Build output lines ----
  const lines = [];
  lines.push('Token Usage Summary');
  lines.push('===================');
  lines.push(`Session totals:  in=${fmt(totalInput)}  out=${fmt(totalOutput)}  total=${fmt(totalTokens)}  $${fmtCost(totalCost)}`);
  lines.push('');
  lines.push('Recent days (last 7):');

  // Sort days descending, take first 7
  const sortedDays = [...byDay.keys()].sort((a, b) => (a < b ? 1 : -1)).slice(0, 7);
  if (sortedDays.length === 0) {
    lines.push('  (no daily data)');
  } else {
    for (const day of sortedDays) {
      const d = byDay.get(day);
      const dayTotal = d.input + d.output;
      lines.push(`  ${day}:  in=${fmt(d.input)}  out=${fmt(d.output)}  total=${fmt(dayTotal)}  $${fmtCost(d.cost)}`);
    }
  }

  return lines.join('\n');
}

// ---- CLI entrypoint (only runs when invoked directly) ----
if (import.meta.url === `file://${process.argv[1]}`) {
  import('./token-ledger.mjs')
    .then(({ getRollups }) => getRollups())
    .then((rollups) => console.log(renderReport(rollups)))
    .catch((err) => {
      // Never throw from CLI — print empty state on any error
      console.log(renderReport(null));
    });
}
