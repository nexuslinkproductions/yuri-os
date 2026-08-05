| F-008 | medium | static | adw-gate.mjs new Function(config-as-code) L26/30; agent_wrap.sh eval L20 | true |
| F-009 | medium | data | .claude/memory-bus.json tracked in git (auto-rewritten by hook) | true |
| F-010 | medium | live | Voice surfaces: yuri-z-brain.py reads Keychain (security find-generic-password); voice-ptt.py clipboard r/w +  | true |
| F-011 | medium | auth | CORS: chrome-extension any origin; x-forwarded-host trust; COLD_ACQ_ALLOW_TRYCLOUDFLARE wildcard option | true |
| F-016 | medium | live | 12 com.yuri-os-musubi launchd agents incl task-queue-runner + yuri-sentinel (2 undiscovered earlier) — repo-sc | unverified |
| F-018 | medium | live | Design-assistant WS (/api/design-assistant/live) streams activeTab, latestSelection, pendingRequests to ANY co | true |
| F-019 | medium | voice | yuri-z-brain.py is a FULL-authority voice agent (read/write/edit/ANY shell) gated only by deny-list regexes +  | true |
| F-021 | medium | live | whatsapp-mcp-server (~/whatsapp-mcp, 6 python processes) — undiscovered MCP surface; harness registration + au | true |
| F-009u | low | data | F-009 update: memory-bus.json tracked content is METADATA ONLY (sequence/lastWrite/writerSession/file names, a | unverified |
| F-012 | low | hygiene | 0644 world-readable files in protected-adjacent dirs; literal ~ and 'bash:cd ~' dirs; /tmp predictable logs | unverified |
| F-013 | low | hygiene | tracked research .log files (clean); stale vscode-merge-base origin/nudimmud | unverified |
| F-020 | low | supply-chain | October app asar extract/patch dirs in /tmp (october-asar-extract*, october-app.unpacked.PRE-WRITE, october-wr | true |
| F-022 | low | config | All 10 .claude/worktrees/.mcp.json carry absolute paths + sh -c launch — F-006 pattern replicated at scale | true |
| F-036 | low | governance | OBSERVATION: .agents/skills projections OVERWRITTEN with full standalone skill bodies (git-guardrails-claude-c | unverified |
| F-034 | info | cycle2 | CYCLE-2 PASS-1 DRIFT: HEAD unchanged 0158a8fd; uncommitted mods to 3 tracked skill files (git-guardrails-claud | unverified |
| F-005 | high | auth | Nexus Link server.listen() no host arg = all interfaces; GET APIs unauthenticated; mutations app-policy-only | true |
| F-006 | high | config | MCP/hook servers launched via sh -c $(git rev-parse --show-toplevel) — untrusted-repo code exec on harness aut | true |
| F-007 | high | live | PTY WS server (agent-native) dev-mode authCheck=undefined; /agent-native/agent-terminal-info publishes wsPort | true |
| F-015 | high | history | ~4.7GB total of runtime state/log blobs in git history (energy-gate-trace 1984+724MB, kagami log 83MB, observa | unverified |
| F-023 | high | deps | npm audit root: 27 vulns (3 crit/17 high). Direct high/crit: swiper(critical), vite(high), @openai/codex-secur | true |
| F-024 | high | deps | npm audit _SYSTEM/backend: 13 vulns (10 high/0 crit). Direct high: axios, multer, ws (WS lib used by /ws/shell | true |
| F-025 | high | live | whatsapp-mcp registered in ~/.cursor/mcp.json — FULL WhatsApp tool suite (search_contacts, list_messages, list | true |
| F-001 | critical | live | Unauthenticated WS shell bridge ws://127.0.0.1:3004/ws/shell — any local process or any visited webpage can se | true |
| F-002 | critical | auth | /api/auth/bootstrap returns runtime API key under localOnly only; isLocalRequest trusts ANY chrome-extension:  | true |
| F-003 | critical | live | LAN-exposed unauth servers: 8471 http.server (worktree docs), 8472 Nexus Link app data API, 8777 http.server ( | true |
| F-004 | critical | history | 51,834,880-byte (49.4 MiB) backend DB blob nudimmud.db.corrupt.1777988703 in git history — blob 2b4c602e, sha2 | true |
| F-014 | critical | history | 21MB Claude session tool-results file from .claude/projects (NUDIMMUD) committed to git history — protected su | unverified |
| F-017 | low | deps | Direct-dep postinstall scripts all legitimate (esbuild/gitnexus/onnxruntime/protobufjs) | clean |
| F-026 | info | history | H1 full-history secret scan CLEAN — 15 raw hits all placeholder/skill-corpus text (AKIAEXPOSEDKEY123456, 'BEGI | clean |
| F-027 | info | static | S3 bash AST CLEAN — zero real curl|sh in active YURI scripts (hits were pipe-to-jq/python3 false positives or  | clean |
| F-028 | info | static | S8 path-traversal scan CLEAN — no request-derived fs paths in backend src | clean |
| F-029 | info | live | F8 october bridge CLEAN — loopback bind, digit-validated port, stdio MCP | clean |
| F-030 | info | live | F9 observatory proxy CLEAN — 127.0.0.1:4243 only | clean |
| F-031 | info | control | F3 POSITIVE CONTROL — nexus policy deny-by-default action registry + hash-chained audit.jsonl + cross-process  | clean |
| F-032 | info | static | S9 dist + dist-observatory CLEAN — no eval/new Function/execSync/shell:true in built bundles | clean |
| F-033 | info | control | C2 ADEQUATE — agent-native auth context (userEmail/orgId/authContextAccessed) + 401 enforcement present (agent | clean |
| F-035 | info | convergence | CONVERGENCE CANDIDATE — 2 clean cycles (pass-2 + pass-3): zero new findings, listeners stable (37/37), LAN exp | clean |
| F-037 | info | convergence | CYCLE-3 CLEAN (third consecutive): HEAD 0/0, zero exec files changed, listeners 41 (+4 codex ephemeral, non-ep | clean |
