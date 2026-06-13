#!/usr/bin/env node
// corpus-threat-taxonomy.mjs — the 16-category threat taxonomy for the skill-security SAST gate.
//
// This is the shared vocabulary every security/* analyzer keys against. It is a SUPERSET of the
// legacy 7-category regex scanner (CREDENTIAL_ACCESS, NETWORK_EXFILTRATION, PATH_TRAVERSAL,
// PROMPT_INJECTION, OBFUSCATION, SUPPLY_CHAIN, HARDCODED_SECRETS) plus 9 additive categories.
//
// HARDENING (build-contract item 7): DYNAMIC_CODE_EXEC is an ADDITIVE category. It is NOT split
// out of SUPPLY_CHAIN — SUPPLY_CHAIN keeps its legacy regex matches (eval/Function/exec/postinstall)
// so the corpus-absorb score consumer sees no drift on existing skills. DYNAMIC_CODE_EXEC fires
// only on the AST-confirmed dynamic-exec sinks the legacy regex never modelled (dynamic import(),
// vm.runInContext, getattr/__import__, reflective construction). It can co-occur with SUPPLY_CHAIN.
//
// PURE node-builtin. ZERO REPO_ROOT / filesystem-root computation — pure data. (Hardening item 1:
// orchestrator injects all paths; this module computes nothing about where the repo lives.)
//
// Severity → numeric weight is the SAME table the legacy scanner used (CRITICAL 40 / HIGH 20 /
// MEDIUM 10 / LOW 5) so the additive 0..100 install score and the legacy `score` field stay
// arithmetically compatible.

export const SEVERITY_SCORE = Object.freeze({
  CRITICAL: 40,
  HIGH: 20,
  MEDIUM: 10,
  LOW: 5,
});

// The 16 categories. id is the stable machine key (used as SARIF ruleId + threat.type).
// Order: the 7 legacy categories first (stable), then the 9 additive ones.
export const THREAT_TAXONOMY = Object.freeze([
  // ---- 7 legacy categories (id + severity MUST match the old scanner) ----
  {
    id: 'CREDENTIAL_ACCESS',
    name: 'Credential / secret-store access',
    severity: 'HIGH',
    explanation:
      'Reads environment variables, keychains, ~/.ssh, .env files, or API-key/token identifiers. A skill that reads secrets it has no functional reason to touch is a likely exfiltration precursor.',
    remediation:
      'Pass credentials in explicitly scoped, never read the ambient secret store. If a key is genuinely required, document why and which one, and require the operator to inject it.',
  },
  {
    id: 'NETWORK_EXFILTRATION',
    name: 'Outbound network / data egress',
    severity: 'HIGH',
    explanation:
      'Issues outbound requests (fetch/XHR/curl/wget) or base64-encodes data near an egress. Combined with credential or file reads this is the exfiltration sink.',
    remediation:
      'Restrict network calls to documented, allow-listed endpoints. Never POST data derived from secrets or local files to an external host.',
  },
  {
    id: 'PATH_TRAVERSAL',
    name: 'Path traversal / sensitive-file access',
    severity: 'HIGH',
    explanation:
      'References ../ traversal sequences or sensitive system paths (/etc/passwd, /etc/shadow, ~/.claude/). In code this can read or write outside the skill sandbox.',
    remediation:
      'Resolve and validate all paths against an explicit allowed root. Reject inputs that escape the sandbox after realpath resolution.',
  },
  {
    id: 'PROMPT_INJECTION',
    name: 'Prompt injection / instruction override',
    severity: 'HIGH',
    explanation:
      'Skill text attempts to override the host model instructions ("ignore previous instructions", "you are now", "system prompt"). A foreign skill description is untrusted input, not authority.',
    remediation:
      'Treat skill prose as data, never as instructions. Strip or quarantine override phrasing; never let a foreign skill rewrite the host policy.',
  },
  {
    id: 'OBFUSCATION',
    name: 'Obfuscation / encoded payload',
    severity: 'MEDIUM',
    explanation:
      'Hex/unicode escape sequences or very long single lines that hide the real payload from review. Obfuscation is itself a signal — benign code rarely needs it.',
    remediation:
      'Require human-readable source. Decode and re-review any obfuscated segment before trusting it.',
  },
  {
    id: 'SUPPLY_CHAIN',
    name: 'Supply-chain / install-time code execution',
    severity: 'CRITICAL',
    explanation:
      'package.json postinstall hooks or eval/new Function/exec constructs that run code at install or load time, before any review of behavior. Classic dependency-confusion / install-script attack surface.',
    remediation:
      'Forbid lifecycle install scripts in foreign skills. Vendor dependencies pinned by integrity hash; review any code that executes at install time.',
  },
  {
    id: 'HARDCODED_SECRETS',
    name: 'Hardcoded secret / private key',
    severity: 'CRITICAL',
    explanation:
      'A literal long high-entropy token or an embedded PEM private key. A committed secret is both a leak and a sign the skill smuggles its own credentials.',
    remediation:
      'Remove the embedded secret, rotate it, and load credentials from a runtime secret store the operator controls.',
  },
  // ---- 9 additive categories ----
  {
    id: 'DYNAMIC_CODE_EXEC',
    name: 'Dynamic / reflective code execution',
    severity: 'CRITICAL',
    explanation:
      'AST-confirmed dynamic execution sinks the legacy regex could not model: dynamic import() of a computed specifier, vm.runInContext / vm.compileFunction, Python __import__/getattr/exec/compile, or reflective construction. Additive to SUPPLY_CHAIN — it does not replace it.',
    remediation:
      'Replace dynamic dispatch with a static, closed-set lookup. Never execute a code string or import a specifier derived from input.',
  },
  {
    id: 'CHILD_PROCESS_SPAWN',
    name: 'Child-process / shell spawn',
    severity: 'CRITICAL',
    explanation:
      'Spawns OS processes (child_process spawn/exec/execFile/fork, os.system, subprocess.*, popen). A skill that shells out can do anything the host user can, well beyond its stated scope.',
    remediation:
      'Avoid shelling out. If unavoidable, use argument arrays (never a shell string), an allow-listed binary, and never pass untrusted input as a command.',
  },
  {
    id: 'FILESYSTEM_WRITE',
    name: 'Unscoped filesystem write / delete',
    severity: 'HIGH',
    explanation:
      'Writes, appends, renames, chmods, or deletes files (writeFile/rm/unlink/rmdir/rename/chmod, shutil/os.remove). Outside the skill sandbox this can corrupt the host or plant persistence.',
    remediation:
      'Confine writes to an explicit sandbox dir resolved with realpath. Never delete or chmod host files; never write outside the declared output path.',
  },
  {
    id: 'TAINT_FLOW',
    name: 'Tainted source → dangerous sink flow',
    severity: 'CRITICAL',
    explanation:
      'A modelled data-flow where a source (credential / file read / external input) reaches a dangerous sink (network egress, code exec, shell). The composition is the attack, even when each half looks benign.',
    remediation:
      'Break the flow: do not let secrets or untrusted input reach a network, exec, or shell sink. Sanitize and re-scope at the boundary.',
  },
  {
    id: 'VULNERABLE_DEPENDENCY',
    name: 'Known-vulnerable dependency (CVE/OSV)',
    severity: 'HIGH',
    explanation:
      'A declared dependency version matches a known OSV/CVE advisory (offline snapshot, optionally refreshed online). Importing a known-bad package inherits its vulnerability.',
    remediation:
      'Upgrade to a fixed version per the advisory. If no fix exists, remove or replace the dependency before install.',
  },
  {
    id: 'PERSISTENCE_MECHANISM',
    name: 'Persistence / autostart hook',
    severity: 'HIGH',
    explanation:
      'Installs cron jobs, launchd/systemd units, shell-rc edits (.bashrc/.zshrc/.profile), or startup hooks so code survives the session. A skill should not outlive its invocation.',
    remediation:
      'Remove autostart/persistence wiring. A skill must be stateless between invocations unless the operator explicitly grants persistence.',
  },
  {
    id: 'PRIVILEGE_ESCALATION',
    name: 'Privilege escalation',
    severity: 'CRITICAL',
    explanation:
      'Invokes sudo/doas/runas, setuid, or capability changes to gain elevated rights. A skill running with more privilege than granted is a containment breach.',
    remediation:
      'Never escalate privilege. Run with least privilege and fail closed if elevation is required.',
  },
  {
    id: 'DATA_DESTRUCTION',
    name: 'Destructive / irreversible operation',
    severity: 'CRITICAL',
    explanation:
      'Irreversible destruction: rm -rf, recursive deletes, dd, mkfs, git reset --hard / clean -fdx, DROP/TRUNCATE. A foreign skill has no business issuing these.',
    remediation:
      'Forbid destructive commands. Require explicit operator approval and a dry-run for any irreversible operation.',
  },
  {
    id: 'CRYPTO_MINING_OR_ABUSE',
    name: 'Resource abuse / crypto-mining indicator',
    severity: 'MEDIUM',
    explanation:
      'References to miners (xmrig/stratum/coinhive/minerd) or mining pools. Resource-hijack payloads frequently masquerade as utility skills.',
    remediation:
      'Remove the mining/abuse code path entirely. There is no legitimate reason for a utility skill to mine.',
  },
]);

// Fast id → spec lookup. Frozen so a consumer cannot mutate the shared taxonomy.
export const TAXONOMY_BY_ID = Object.freeze(
  Object.fromEntries(THREAT_TAXONOMY.map((t) => [t.id, t])),
);

// The 7 legacy ids, in their original order — used by the scanner to preserve the legacy
// `threats[].type` surface and by tests asserting the superset relationship.
export const LEGACY_CATEGORY_IDS = Object.freeze([
  'CREDENTIAL_ACCESS',
  'NETWORK_EXFILTRATION',
  'PATH_TRAVERSAL',
  'PROMPT_INJECTION',
  'OBFUSCATION',
  'SUPPLY_CHAIN',
  'HARDCODED_SECRETS',
]);

export function severityWeight(severity) {
  return SEVERITY_SCORE[severity] ?? 0;
}

export function isKnownCategory(id) {
  return Object.prototype.hasOwnProperty.call(TAXONOMY_BY_ID, id);
}

// Self-check when run directly: print the taxonomy size + a superset assertion.
if (import.meta.url === `file://${process.argv[1]}`) {
  const missing = LEGACY_CATEGORY_IDS.filter((id) => !isKnownCategory(id));
  if (missing.length) {
    process.stderr.write(`taxonomy: MISSING legacy categories: ${missing.join(', ')}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `corpus-threat-taxonomy: ${THREAT_TAXONOMY.length} categories (${LEGACY_CATEGORY_IDS.length} legacy + ${THREAT_TAXONOMY.length - LEGACY_CATEGORY_IDS.length} additive)\n`,
  );
}
