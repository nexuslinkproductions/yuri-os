// @capability: job-pool-seed
// @serves: seed jobs | initial job pool | company backlog | bootstrap jobs
// @does: the initial job-pool seed — the OS/infra improvement work the autonomous company should pick up
//   (wire gaps, arm-readiness, infra-building, freshness/chip-die, propagation, self-improvement research) plus
//   the owner-delegated high-priority Blender department job. Idempotent (stable ids); re-seed any time.
// @use: import { SEED_JOBS } from job-pool-seed.mjs; node job-pool.mjs --seed
// @exports: SEED_JOBS

export const SEED_JOBS = [
  {
    type: 'gap', title: 'Windows main-module guard — portable pathToFileURL across Scripts/*.mjs (issue #3)',
    detail: 'CGSSCHWEIZ reported github.com/nexuslinkproductions/yuri-os/issues/3: legacy `import.meta.url === file://${process.argv[1]}` silently no-ops on win32 (exit 0, no output). Blocks ai search/reindex/xref and ~159+ Scripts. Fix: pathToFileURL guard + CI check via fix-main-module-guard.mjs --check.',
    value: 0.95, risk: 0.15, priority: 'critical', source: 'owner',
    nextAction: 'Run fix-main-module-guard.mjs; verify yuri-search + xref-query on win32; add regression test; close issue #3.',
    closureCondition: 'fix-main-module-guard.mjs --check passes; CGSSCHWEIZ confirms ai search/reindex work on Windows.',
  },
  {
    type: 'gap', title: 'Wire the native-substrate execution seam (dispatchNative) end-to-end',
    detail: 'company.mjs emits nativeSpecs for native roles but native Claude Agents are only spawnable via the Agent tool from the Opus session — dispatchNative routes them through lane-dispatch (sonnet/haiku), which is UNVERIFIED live. Wire a real native execution path (Opus-driven spawn loop OR a verified lane), so MURE runs BOTH substrates end-to-end, not just GLM.',
    value: 0.9, risk: 0.5, priority: 'high', source: 'organ',
    nextAction: 'Design the Opus-top native spawn loop that consumes runCompany nativeSpecs; verify a native role completes a real subtask.',
    closureCondition: 'A MURE run dispatches a native role live + the result is verified; dispatchNative either proven or replaced.',
  },
  {
    type: 'arm', title: 'Arm-readiness assessment of all DISARMED gates',
    detail: 'Produce a finished ruling on which DISARMED flags are now safe to arm vs must stay gated: energy-enforce, nano-spawn recursion (Level-B), swarm-convergence, glm-fleet, mure, the new company cron, real-money trading. For each: reversibility, blast, what live behavior changes, recommendation. NEVER blindly flip live-money / energy-enforce.',
    value: 0.85, risk: 0.3, priority: 'high', source: 'organ',
    nextAction: 'Enumerate every arm flag + its guard; classify each per the self-governance charter; output an arm/hold table.',
    closureCondition: 'An arm-readiness table exists with a per-gate recommendation; owner confirms which to flip.',
  },
  {
    type: 'infra', title: 'Infrastructure-building capability — the company builds its own infra',
    detail: 'Formalize infra-building as a first-class company capability (DB → job pool → next). The company should detect missing infrastructure (storage, queues, dashboards, indexes, beats) and propose+build it, not just improve roles/skills. Establish the pattern + a kernelsmith/architect playbook.',
    value: 0.8, risk: 0.4, priority: 'high', source: 'recommender',
    nextAction: 'Catalog the OS infra surfaces; define an infra-gap detector + a build playbook the architect/kernelsmith roles run.',
    closureCondition: 'An infra-gap detector runs + at least one infra gap is auto-proposed as a job.',
  },
  {
    type: 'maintenance', title: 'Chip-die freshness — keep all registries + indexes never-stale',
    detail: 'Autonomously keep the OS never-stale: capability-scan, skill-hash registry, GitNexus graph, circuitry registry + propagation, search corpus (ai reindex), the manuals. Detect staleness, auto-heal the safe-to-regenerate artifacts, surface (never sweep) shared-state drift. The "chip die" regeneration.',
    value: 0.7, risk: 0.25, priority: 'medium', source: 'organ',
    nextAction: 'Wire a freshness sweep that runs the existing detectors (xref-drift-scan, capability-scan --check, skill --validate, gitnexus detect) + auto-heals.',
    closureCondition: 'A freshness beat detects + auto-heals safe artifacts and reports remaining drift.',
  },
  {
    type: 'infra', title: 'Propagate organs + active cross-referencing on change',
    detail: 'After any structural change, reconcile the OS organs: propagation-scan over circuitry, xref reconciliation, GitNexus impact. Active cross-referencing so the OS stays coherent as it grows.',
    value: 0.65, risk: 0.3, priority: 'medium', source: 'organ',
    nextAction: 'Run propagation-scan + xref-query after the job pool lands; wire it into the company cycle post-build.',
    closureCondition: 'Propagation + xref run automatically after a completed build job.',
  },
  {
    type: 'research', title: 'Self-improvement intelligence — research how global leaders build companies + OS',
    detail: 'Become smarter by outsourcing: research the web (≥2 primary sources, cited, captured + reindexed) on how elite labs/companies build + scale (org design, agent architectures, autonomous-improvement loops, infra patterns). Understand our own improvement pattern + where we are heading; feed findings into the recommender as concrete jobs.',
    value: 0.8, risk: 0.2, priority: 'high', source: 'recommender',
    nextAction: 'Run a scout/synthesist research wave (like the Sakana dive) on autonomous-company + self-improving-OS prior art; capture cited findings; emit improvement jobs.',
    closureCondition: 'A cited research brief exists + ≥3 concrete improvement jobs are recommended from it.',
  },
  {
    type: 'infra', title: 'Job-recommender loop — company proposes its own improvement jobs',
    detail: 'The company assesses the OS + itself (roles/skills/setup/infra) each cycle and generates NEW recommended jobs (gaps, arm-readiness, infra, research). The engine of compounding self-improvement. Recommendations land as state=recommended; owner promotes to open.',
    value: 0.85, risk: 0.35, priority: 'high', source: 'recommender',
    nextAction: 'Build the recommender pass in nexus-company.mjs: assess → propose jobs via recommendJob.',
    closureCondition: 'A company cycle emits ≥1 recommended job grounded in a real OS gap.',
  },
  {
    type: 'improvement', title: 'Dashboard upkeep — grow the NEXUS LINK view with the company',
    detail: 'Keep the dashboard reflecting the company as it grows: add the Job Pool view, build-report viewer, arm-state panel, and any new infra. The face of the company stays current.',
    value: 0.6, risk: 0.2, priority: 'medium', source: 'organ',
    nextAction: 'Add a Job Pool panel + build-report drawer to dashboard.html.',
    closureCondition: 'Dashboard shows the live job pool + lets you read build reports.',
  },
  {
    type: 'gap', title: 'Level-B recursion hardening — deep-arm nano-spawn / dispatchPool (depth ≤5)',
    detail: 'The deferred recursive substrate: drain-lease livelock backoff, lease-reclaim TOCTOU, dispatch idempotency, nano-spawn.mjs stub. Required before recursive depth-5 fan-out can arm safely.',
    value: 0.7, risk: 0.55, priority: 'medium', source: 'organ',
    nextAction: 'Audit the livelock/lease seams; add backoff + idempotency; fix the nano-spawn stub; test.',
    closureCondition: 'Recursion hardening tests pass; Level-B is arm-ready (owner-gated).',
  },
  {
    type: 'blender', title: 'BLENDER DEPARTMENT — automate René Spatz holster-blocking (HK_45) hours → minutes',
    detail: [
      'Owner-delegated, HIGH priority. Build a 3D department (3D architects, game-dev, model designers) operating Blender at elite level, and a workflow that collapses René Spatz\'s (custom-gear.ch / "Custom Gear Solutions") manual holster-blocking from hours/day to minutes, then make it ADAPTABLE across models.',
      '',
      'PACKAGE (currently at ~/Downloads/HK_45_TACTICAL_PACKAGE — relocate into the repo as step 1): 01 SCAN FULL GUN.stl (6MB), 02 STEP.step, 03 STL.stl (the finished blocked result), STEPS.docx (full workflow).',
      '',
      "RENÉ'S PROCESS (mapped from STEPS.docx): purpose = create a holster MOLD; block out every retention point (sights, slide serrations, buttons, levers) so the gun slides front→back. (1) import scanned STL into Blender; (2) Remesh modifier; (3) Decimate ratio 0.50 repeated → 115k-120k faces; (4) align to X/Y mass-center, Z=mass-center, export STL→CAD folder; (5) import to CAD (Shapr3D); (6) block out front→back = carve a channel along the holster length for all extrusions (good vs bad blocking criteria in the doc); (7) in CAD: export native .SHAPR, clone blocking, BOOLEAN-merge to one object, split center along Y into two halves, align halves on X/Y/Z mass-center, export final STEP+STL.",
      '',
      'OPTIMIZATION THESIS: the big time-sinks are the manual blocking + the Blender↔Shapr3D software switching. Research Blender bpy automation (remesh/decimate/align scripting), automated channel/blocking generation (shrinkwrap + solidify + boolean / geometry-nodes offset along the slide axis / convex-sweep), boolean + center-split + align scripting — to do the whole pipeline in Blender (or Blender + a Python-API CAD) with minimal human touch. Validate against René\'s finished 02/03 files (the ground-truth blocked result).',
      '',
      'DELIVERY: polished automated workflow for THIS exact model first, replicable; THEN generalize to other gun models (adaptable blocking that understands what must be blocked). Marcel delegates execution; this entry is the spec.',
    ].join('\n'),
    value: 1.0, risk: 0.5, priority: 'high', source: 'owner',
    nextAction: 'Relocate the HK_45 package into the repo; deep-research Blender bpy + automated blocking; reproduce René\'s pipeline as a script; validate vs the finished 02/03 files.',
    closureCondition: 'An automated Blender workflow reproduces René\'s blocked result for HK_45 in minutes, validated against 02/03, and is documented as adaptable.',
  },
];
