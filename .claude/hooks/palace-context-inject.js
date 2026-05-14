#!/usr/bin/env node
// Palace Context Injection: wire top-K vault hub concepts into session init context
const fs = require('fs');
const path = require('path');

// Local only — T7 is dead, never fall back
const PALACE_PATHS = [
  '/Users/marcelspatz/NUDIMMUD/claude-palace-out/palace-index.md',
];

let palaceContext = null;
let palaceStatus = 'UNAVAILABLE';

// Find and read palace-index.md
for (const palacePath of PALACE_PATHS) {
  try {
    if (fs.existsSync(palacePath)) {
      const content = fs.readFileSync(palacePath, 'utf8');
      palaceContext = parseHubConcepts(content);
      const age = Math.floor((Date.now() - fs.statSync(palacePath).mtimeMs) / 86400000);
      palaceStatus = age > 7 ? `STALE (${age}d old)` : `CURRENT (${age}d old)`;
      break;
    }
  } catch (e) {
    // Continue to next path
  }
}

// Parse Hub Concepts section (top ~15 entries, extract top 12)
function parseHubConcepts(content) {
  const hubMatch = content.match(
    /## Hub Concepts \(Most Central\)([\s\S]*?)(?=\n## [A-Z]|$)/
  );
  if (!hubMatch) return null;

  const hubSection = hubMatch[1];
  const conceptRegex = /^\d+\.\s+\*\*([^*]+)\*\*\s+\(([^)]+)\)\s*\n\s*[-•]\s+Centrality:\s+([\d.]+)\s*\n\s*[-•]\s+Connections:\s+(\d+)/gm;

  const concepts = [];
  let match;
  while ((match = conceptRegex.exec(hubSection)) !== null) {
    concepts.push({
      name: match[1].trim(),
      type: match[2].trim(),
      centrality: parseFloat(match[3]),
      connections: parseInt(match[4], 10),
    });
  }

  // Return top 12
  return concepts.slice(0, 12);
}

// Format for injection into context
function formatPalaceInjection(concepts) {
  if (!concepts || concepts.length === 0) {
    return 'PALACE_VAULT_CONTEXT: unavailable';
  }

  const formatted = concepts
    .map((c, i) => `  ${i + 1}. ${c.name} (${c.type}) — ${c.connections} refs, centrality ${c.centrality.toFixed(3)}`)
    .join('\n');

  return `PALACE_VAULT_CONTEXT (Top Hub Concepts — Most Central in Your Vault):
${formatted}`;
}

// Inject into session-state.json
const stateDir = '/Users/marcelspatz/NUDIMMUD/.claude/state';
const stateFile = `${stateDir}/session-state.json`;
try {
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (!state.vault_context) {
      state.vault_context = {
        status: palaceStatus,
        hub_concepts_top_12: palaceContext,
        injected_at: new Date().toISOString(),
      };
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    }
  }
} catch (e) {
  // Silently fail—state may not exist yet
}

// Output for Claude context injection
console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart:PalaceContextInject',
      additionalContext: formatPalaceInjection(palaceContext),
      metadata: {
        status: palaceStatus,
        topConceptCount: palaceContext ? palaceContext.length : 0,
      },
    },
  })
);
