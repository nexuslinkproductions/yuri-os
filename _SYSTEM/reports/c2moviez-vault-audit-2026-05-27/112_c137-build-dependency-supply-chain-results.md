# C-137 Build, Dependency, And Supply-Chain Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target source files mutated. No installs. No target scripts executed. `npm audit` was run against package-lock data to query current npm advisory metadata; `npm ci --dry-run --ignore-scripts --no-audit --no-fund` was used once to validate clean-install reproducibility without installing.

## Scope

This shard inspects the repo's build and supply-chain truth:

```text
package manifests / lockfiles / Node and Python versions / deployment scripts
  -> clean install reproducibility
  -> scheduler/deployment package dialects
  -> dependency advisory exposure
  -> install scripts and AI-package supply chain
  -> LLM navigationability for "how do I build and deploy this?"
```

The high-level conclusion is sharp: the repo contains useful lockfiles and several private-package markers, but it does not yet provide a single deterministic build story. The dashboard clean install fails from the tracked files, the deployment scripts still point at a `netlify/functions` layout that is absent from the clone, Node versions are split between Node 20 package requirements and Node 18 runtime launchers, and the privileged MCP/RAG dependency graph includes untriaged advisories and install-script-heavy AI packages.

## Findings

### R112-F01 - Dashboard Clean Install Is Broken Because `package.json` And `package-lock.json` Are Out Of Sync

Severity: Critical build reproducibility risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/package.json:26-31` declares runtime dependencies including `express`.
- `Dashboard-v2/package-lock.json:10-15` lists root runtime dependencies but omits `express`.
- `Dashboard-v2/production-server.js:5` imports `express`.
- `Dashboard-v2/server/index.js:8` also imports `express`.
- A read-only validation command, `npm ci --dry-run --ignore-scripts --no-audit --no-fund`, failed with npm `EUSAGE`, stating that `package.json` and `package-lock.json` are not in sync and that `express@4.22.2` plus its transitive dependencies are missing from the lockfile.

Impact:

A clean deploy that uses `npm ci` cannot be reproduced from the GitHub clone. A deploy that uses `npm install` can paper over the break by rewriting dependency resolution at deploy time, but that means production no longer matches a reviewed lockfile. This is a major "vibe-coded" fragility point because it makes local success, server success, and repo truth diverge.

Required remediation direction:

- Regenerate `Dashboard-v2/package-lock.json` from the intended `package.json`.
- Require `npm ci --ignore-scripts` in CI before deployment.
- Treat lockfile drift as a release blocker.

### R112-F02 - Deployment Scripts Still Target A Missing `netlify/functions` Layout

Severity: Critical deployment and navigationability risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/server/deploy.sh:12-18` syncs `Dashboard-v2/` to `/opt/nex/app`, then runs `npm install` in `$REMOTE/netlify/functions`.
- The tracked directory inventory has `Dashboard-v2/functions` but no `Dashboard-v2/netlify` directory.
- `Dashboard-v2/server/index.js:9` requires `./netlify-adapter`, while the tracked `Dashboard-v2/server/` inventory does not provide that adapter.
- `Dashboard-v2/server/index.js:40-82` routes physical handlers from `../netlify/functions/...`.
- `Dashboard-v2/production-server.js:35-42` dynamically loads functions from `netlify/functions`.
- `CLAUDE.md:320-327` also instructs syncing `Dashboard-v2/netlify/functions/` and restarting PM2 `ops-dashboard`.

Impact:

An LLM or human operator following tracked deployment instructions is pointed at a directory layout that does not exist in the clone. This can explain why dashboards or automations appear "deployed" in docs while the actual backend functions are missing, stale, or copied by an untracked local step.

Required remediation direction:

- Choose one function directory dialect: `Dashboard-v2/functions` or `Dashboard-v2/netlify/functions`.
- Generate server route tables, PM2 deploy scripts, and docs from that one location.
- Add a deploy preflight that fails if the expected function directory, adapter, package manifest, and route table do not match.

### R112-F03 - Node Runtime Truth Is Split Between Node 20 Package Requirements And Node 18 Launchers

Severity: High runtime reproducibility risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/package.json:7-9` requires Node `>=20.10.0`.
- `Scripts/nex-rvf/package.json:20-21` requires Node `>=20.10.0`.
- `Scripts/ai:26-28` explicitly switches to and prioritizes Node `18.20.8`.
- `Scripts/nex-rvf/refresh.sh:56` prepends `/Users/ic2m/.nvm/versions/node/v18.20.8/bin`.
- `Scripts/launchagents-staged/com.c2moviez.nex-registry-scan.plist:11-12` launches RVF registry code with Node `18.20.8`.
- A source search found many staged LaunchAgents and shell wrappers hard-coding Node `18.20.8`, while the dashboard and RVF package manifests declare Node 20-plus.

Impact:

The repo cannot tell an operator which Node version is authoritative. Modern dependency graphs can work during manual testing on Node 20 and then behave differently under LaunchAgent wrappers pinned to Node 18. This is especially risky around ESM/CommonJS boundaries, MCP SDK changes, fetch/crypto APIs, and package `engines` constraints.

Required remediation direction:

- Add one repo-level `.node-version` or runtime manifest.
- Make LaunchAgents and shell wrappers source that version instead of hard-coding local nvm paths.
- Add a preflight that checks every package `engines.node` against every runtime wrapper.

### R112-F04 - Current npm Advisory Sweep Shows Untriaged Vulnerabilities In Deployed Or Privileged Dependency Graphs

Severity: High supply-chain risk  
Status: `C137_VERIFIED_WITH_CURRENT_NPM_AUDIT`

Evidence:

Read-only `npm audit --json --omit=dev` results on 2026-05-27:

- `Dashboard-v2`: 9 total vulnerabilities: 1 high, 7 moderate, 1 low. Notable reported families include `devalue` high-severity DoS, Svelte SSR/XSS advisories, SvelteKit query cross-talk, Vite/esbuild dev-server exposure, and `ws`.
- `Scripts/nex-rvf`: 12 total vulnerabilities: 4 high, 8 moderate. Notable reported families include `agentic-flow`, `agentdb`, OpenTelemetry Prometheus crash, `@xenova/transformers`/ONNX/protobuf chains, `qs`, and `ws`.
- `Scripts/finance-mcp`: 6 total vulnerabilities: 2 high, 4 moderate. Notable reported families include `fast-uri`, `fast-xml-builder`, `hono`, `ip-address`, and `qs`.
- `Scripts/telegram-mcp`: 5 total vulnerabilities: 1 high, 4 moderate. Notable reported families include `fast-uri`, `hono`, `ip-address`, and `qs`.
- `Scripts/team-bots`: 1 moderate `ws` advisory.
- `Scripts`: 1 moderate `ws` advisory.
- `Dashboard-v2/functions`: 0 reported vulnerabilities.

Impact:

This does not prove every advisory is exploitable in Claudio's actual deployment. It does prove the repo has no visible triage trail for current advisories in privileged surfaces: dashboard SSR, MCP servers, local RAG, finance MCP, Telegram MCP, and team bots. Because those components sit near secrets, local files, provider APIs, and AI tool calls, advisory triage should be mandatory.

Required remediation direction:

- Add `npm audit --omit=dev --audit-level=moderate` to CI for deployed packages.
- Create an advisory ledger with `reachable`, `not_reachable`, `dev_only`, `accepted_until`, and `patched_in` dispositions.
- Prioritize high findings in public dashboard/runtime-facing and privileged MCP packages before low-salience docs or UI polish.

### R112-F05 - Deploy Uses Floating `npm install`, While Manifests Use Wide Semver Ranges

Severity: High reproducibility and supply-chain drift risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/server/deploy.sh:16-18` runs `npm install` on the server, not `npm ci`.
- `Dashboard-v2/package.json:17-31` uses caret ranges for SvelteKit, Vite, Svelte, Supabase, adapter packages, `dotenv`, and `express`.
- `Scripts/telegram-mcp/package.json:8-10` requests `@modelcontextprotocol/sdk` `^1.12.1`, but `Scripts/telegram-mcp/package-lock.json:26-29` resolves `1.29.0`.
- `Scripts/finance-mcp/package.json:15-18` requests `@modelcontextprotocol/sdk` `^1.0.4`, but `Scripts/finance-mcp/package-lock.json:31-34` resolves `1.29.0`.
- `Scripts/nex-rvf/package.json:13-18` uses alpha and broad AI dependency ranges.

Impact:

Production dependency resolution can change without a reviewed source commit. This is especially dangerous for MCP servers because a package-level behavior change can alter exposed tools, transports, schemas, auth behavior, or transitive server dependencies.

Required remediation direction:

- Deploy with `npm ci`, not `npm install`.
- Pin critical MCP, auth, routing, and AI-runtime dependencies more tightly.
- Run a dependency diff as part of every deployment and store it in the audit log.

### R112-F06 - RVF Pulls An Alpha, Install-Script-Heavy AI Dependency Graph Into A Privileged Local MCP Server

Severity: Medium-high supply-chain and local-execution risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/nex-rvf/package.json:13-18` depends on `@claude-flow/embeddings`, `@claude-flow/memory`, `agentic-flow`, and `@xenova/transformers`.
- `Scripts/nex-rvf/package-lock.json:21-29` includes a transitive `@anthropic-ai/claude-agent-sdk` package.
- `Scripts/nex-rvf/package-lock.json:156-170` includes `@google/genai` with `hasInstallScript: true` and Node `>=20.0.0`.
- `Scripts/nex-rvf/package-lock.json:3195-3208` includes `agentdb` alpha with `hasInstallScript: true` and additional MCP, OpenTelemetry, graph, JSON Web Token, and SQL dependencies.
- A lockfile scan found 12 `hasInstallScript` packages in `Scripts/nex-rvf/package-lock.json`, including native and AI runtime packages such as `agentic-flow`, `hnswlib-node`, `onnxruntime-node`, `sharp`, `better-sqlite3`, and `protobufjs`.

Impact:

Install scripts are not automatically bad, especially for native packages. But this is a privileged local MCP/RAG server that reads vault content, talks to Supabase, and participates in Claude's tool surface. The dependency graph deserves higher scrutiny than a normal web UI package, and it currently mixes alpha AI packages, native modules, telemetry packages, and multiple AI provider SDKs.

Required remediation direction:

- Add an RVF-specific supply-chain threat model.
- Use `npm ci --ignore-scripts` by default, then explicitly allow only reviewed native install scripts when necessary.
- Remove unused AI-provider SDKs and alpha packages from the privileged path or isolate them in a sandboxed experiment package.

### R112-F07 - Python Local-Model Dependencies And Model Downloads Are Unpinned

Severity: Medium-high reproducibility and model-supply-chain risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/nex-rvf/local-models/requirements.txt:9-16` uses lower-bound-only Python ranges for `mlx`, `mlx-lm`, `sentence-transformers`, `fastapi`, `uvicorn`, `pydantic`, `httpx`, and `huggingface-hub`.
- `Scripts/nex-rvf/local-models/install.sh:59-62` upgrades `pip` and installs requirements without a lockfile or hashes.
- `Scripts/nex-rvf/local-models/download.sh:10` notes Hugging Face models are cached under `~/.cache/huggingface/hub`.
- `Scripts/nex-rvf/local-models/download.sh:47-60` downloads/loads BGE, Qwen, and DeepSeek models by model id through Python libraries.

Impact:

Two machines can install different Python dependency versions and model revisions from the same GitHub clone. For an LLM audit/control-plane system, that matters: embeddings, tokenization, model output, memory use, and even vulnerability exposure can drift without source changes.

Required remediation direction:

- Add a locked Python environment file with hashes or a controlled `uv.lock`.
- Pin Hugging Face model revisions by commit hash.
- Store model provenance metadata in the local-model health endpoint.

### R112-F08 - Figma-Make Client App Has A Large Manifest But No Lockfile

Severity: Medium repository hygiene and client-delivery reproducibility risk  
Status: `C137_VERIFIED`

Evidence:

- `02 - Clients/SHI/SHIPSTER-C1-APR-JUN-figma-make/package.json:10-70` declares a broad React/MUI/Radix/Vite dependency set.
- The same package has no tracked lockfile at its package root.

Impact:

This may be a client artifact rather than a deployed ops backend, so it is not in the top risk tier. Still, it adds another package island that a future LLM can discover and attempt to build without deterministic dependency truth.

Required remediation direction:

- Add a lockfile if this client app is active.
- Otherwise archive it or mark it as non-runtime design export in the repo manifest.

### R112-F09 - `.gitignore` Contradicts The Tracked RVF Lockfile

Severity: Low-medium navigationability risk  
Status: `C137_VERIFIED`

Evidence:

- `.gitignore:39-45` describes RVF runtime artifacts and ignores `Scripts/nex-rvf/package-lock.json`.
- `Scripts/nex-rvf/package-lock.json` is nevertheless tracked in Git.
- `git check-ignore --no-index` confirms `.gitignore:45` would ignore that path for a new/untracked file.

Impact:

This is not a direct security vulnerability, but it damages repo truth. A maintainer can reasonably believe the RVF lockfile is intentionally ignored, while the current clone relies on it for reproducible install and audit data.

Required remediation direction:

- Remove `Scripts/nex-rvf/package-lock.json` from `.gitignore` if the lockfile is authoritative.
- Or remove the tracked lockfile and document why RVF is intentionally floating, which is not recommended for a privileged MCP server.

## Positive Controls

- Most active package islands have npm lockfiles with lockfile version 3.
- Packages that should not be published are mostly marked `private: true`.
- `.gitignore:47-50` excludes environment files.
- `Scripts/.env.example:1` contains only a placeholder value.
- `Dashboard-v2/functions` currently reports zero npm audit vulnerabilities from its tiny package graph.
- `Scripts/nex-rvf/local-models/install.sh:50-62` uses a local venv rather than global Python packages.

## Coverage Closure

This shard closes the first build/dependency/supply-chain pass for tracked source. It does not include live server package inventories, local `node_modules`, local Python venv contents, globally installed CLIs, Keychain state, or provider deployment dashboards.

For the GitHub-only audit, the conclusion is sufficient: the clone is not yet a deterministic build/deploy source of truth. That is a major blocker for Claudio's repo being efficiently and safely navigable by an LLM.
