# PRISM Workbench v1 — Handoff Bundle Manifest

Created: 2026-05-14T14:34:23Z
Source repo: /Users/marcelspatz/NUDIMMUD (commit efabba28)

## Summary
| Category | Count | Total lines |
|---|---:|---:|
| Backend TS | 5 | 4494 |
| Frontend | 6 | 4417 |
| Scripts mjs | 7 | 3120 |
| Campaign docs | 21 | 3331 |
| Memory | 1 | 24 |

## File Inventory

### backend/services/
| File | Lines | Purpose |
|---|---:|---|
| coldAcquisitionService.ts | 2559 | Core PRISM engine - source pipeline + quality scoring + compliance |
| coldAcquisitionService.test.ts | 518 | Service regression tests |
| coldAcquisitionCrmService.ts | 880 | CRM sync service |

### backend/routes/
| File | Lines | Purpose |
|---|---:|---|
| coldAcquisitionRoutes.ts | 154 | Acquisition API routes |
| coldAcquisitionCrmRoutes.ts | 383 | CRM API routes |

### frontend/
| File | Lines | Purpose |
|---|---:|---|
| AcquisitionApp.tsx | 2196 | Acquisition app shell |
| acquisition.css | 2159 | Acquisition UI styles |
| main.tsx | 14 | Frontend bootstrap |
| index.html | 12 | Vite entry HTML |
| tsconfig.json | 20 | TypeScript config |
| vite.config.mts | 16 | Vite config |

### scripts/
| File | Lines | Purpose |
|---|---:|---|
| cold-acquisition-real-feed.mjs | 839 | Real-feed acquisition script |
| cold-acquisition-wko-scraper.mjs | 735 | WKO scraper script |
| prism-source-api-check.mjs | 60 | Source API verification script |

### scripts/tests/
| File | Lines | Purpose |
|---|---:|---|
| cold-acquisition-routes.test.mjs | 292 | Routes test harness |
| cold-acquisition-crm-routes.test.mjs | 1028 | CRM routes test harness |
| cold-acquisition-ui.test.mjs | 3 | UI test harness |
| cold-acquisition-crm-ui.test.mjs | 163 | CRM UI test harness |

### docs/
| File | Lines | Purpose |
|---|---:|---|
| 00-questionnaire.md | 48 | Campaign doc |
| 01-answers.md | 82 | Campaign doc |
| 02-decisions.md | 108 | Campaign doc |
| 03-execution-plan.md | 96 | Campaign doc |
| 04-acceptance-checklist.md | 56 | Campaign doc |
| 05-postmortem.md | 35 | Campaign doc |
| 06-outreach-draft-doctrine.md | 190 | Campaign doc |
| 07-claude-next-slice-handoff.md | 539 | Campaign doc |
| 08-codex-slice-a-source-pipeline.md | 156 | Campaign doc |
| 09-codex-slice-b-next-lead-quality-engine.md | 194 | Campaign doc |
| 10-codex-slice-c-send-reply-loop.md | 179 | Campaign doc |
| 11-codex-slice-d-evidence-enrichment.md | 99 | Campaign doc |
| 12-codex-slice-e-wko-scraper.md | 127 | Campaign doc |
| 13-codex-slice-f-url-health-check.md | 74 | Campaign doc |
| 14-codex-slice-g-draft-overhaul.md | 133 | Campaign doc |
| 15-codex-slice-h-clean-template-leakage.md | 156 | Campaign doc |
| 16-codex-slice-i-profiler-draft-rebuild.md | 426 | Campaign doc |
| 17-coldreach-body-instruction.md | 210 | Campaign doc |
| 18-profiler-prompt-header.md | 77 | Campaign doc |
| 19-codex-slice-j-doctrine-rewrite.md | 271 | Campaign doc |
| 20-codex-slice-j-test-fix.md | 75 | Campaign doc |

### memory/
| File | Lines | Purpose |
|---|---:|---|
| project_c2moviez.md | 24 | Project memory snapshot |

## SHA256 Checksums

| File | SHA256 |
|---|---|
| backend/services/coldAcquisitionService.ts | e1b80106eaefbc0c3b6f3cf8cbf9e4735c06f3c9a6deb649481c8e14b9ea2cbd |
| backend/services/coldAcquisitionService.test.ts | b03edaec8a39c48210dba0e3e34c52669ec5ee53a161c6f26df5a5f522397c74 |
| backend/services/coldAcquisitionCrmService.ts | ffd60cf8da9101ebc4e97c79974623cfe31f29a541febe429b47b1e4ccbc13ca |
| backend/routes/coldAcquisitionRoutes.ts | 7275f6f0be7dacf30bc3262efc71778447db724f0aff6bd2e6343b76bf569794 |
| backend/routes/coldAcquisitionCrmRoutes.ts | a5eb7e5f7f9998a805eb6b64a64d3ebf9fe131d043acff8fd312dcd27e497437 |
| frontend/AcquisitionApp.tsx | 1548441d369211f9fb3f88dae0f6940299468e947ece74fc6fc735c88f2bd526 |
| frontend/acquisition.css | f4cb9a76f1297a399d19165037b75d5535822984b09990b8f69444ee13120da0 |
| frontend/main.tsx | 035cd5f604bd1cfee9b5c1a5abc0684765ee1384ff1c331202ac4c36dd4ab1e7 |
| frontend/index.html | 25f4bc1eaacdc689afa79caf086f559db21c6123d7d169e8a879026e354deade |
| frontend/tsconfig.json | 15c35a34715ae9a9c5fb7c7df7c3414293e296cd46a5686e62c49e75a5f8a1f0 |
| frontend/vite.config.mts | ddb2462847ea63c48c095becbc8537b713ad206ecedf799ed63396d6e9f6bb85 |
| scripts/cold-acquisition-real-feed.mjs | fca9f9b82af446afaf49ad3bec50919291ecd92e76e5011b5931e0a5ebe50475 |
| scripts/cold-acquisition-wko-scraper.mjs | 9ac427fa3b5b6568a8b3d45353392bfaf68191fb41d9fa5727abdad73967eb0f |
| scripts/prism-source-api-check.mjs | 671e286bc6950781e68335cc093bd261c42dd028fd96a5aafa1f47988d917072 |
| scripts/tests/cold-acquisition-routes.test.mjs | b6f13adbd8d1799b2b6e3b43ba032505a254a26c05b85635addab2df5c7b9cec |
| scripts/tests/cold-acquisition-crm-routes.test.mjs | 8632c38f0a540e87b4190dc29ccdb3d64165eeeb19ccfe097230315ea7f0ab31 |
| scripts/tests/cold-acquisition-ui.test.mjs | 3325b7063e712b51b5772fff99d69519691fd82848055d13bdcc67552078a08a |
| scripts/tests/cold-acquisition-crm-ui.test.mjs | ad55b48bf85b1ebfa85b9538ce14c9aeb6d3e54c56d1b053552eaad09fc4b03b |
| docs/00-questionnaire.md | 429fc05ca90ccaeaa14b09652c69183612a4754a55d913703b44c63b6ee86220 |
| docs/01-answers.md | 6401c73d1692a51841d306dd1050b341f8d1cbd45ef92fcfc3dc0c37c1c6b37a |
| docs/02-decisions.md | b45bfabdcd34056710972d84f72b427358fb2abf89da1c29320a65221c2ba3b2 |
| docs/03-execution-plan.md | 767e66a531b5025e0545ce2d090820680dcc7e27bbb05bdf7442fb21f6d15526 |
| docs/04-acceptance-checklist.md | 57311063ceebd76023fb2787c962aa6441db413fa4f81d24c7b2510047ffd8ca |
| docs/05-postmortem.md | 25b9ac3e464b6e2f05eed50b7a0754aeaed1675dc82bae2a47776fd4a5400374 |
| docs/06-outreach-draft-doctrine.md | a590af5e1179fefe2264604a7f3c670efee91f6af0d3df6d836dd25c19a6d8d1 |
| docs/07-claude-next-slice-handoff.md | 17f355e75955c18c47ba4bcb88c243bbc2e57c9c3fd04cb0090aa90e2fc91bdc |
| docs/08-codex-slice-a-source-pipeline.md | 13de6407f42b9d2125f2ab357e72c13254f3647aace3a4b6491dfca6215a4385 |
| docs/09-codex-slice-b-next-lead-quality-engine.md | 647e0aca50529ce5c1751931599fdaa849bd773213b168d3ddfffcbfbfdb6e09 |
| docs/10-codex-slice-c-send-reply-loop.md | 19d889dd7cfd097329b6d108c5fa9e1702dee8ebb651bbf9eb2760b7879283ef |
| docs/11-codex-slice-d-evidence-enrichment.md | 7e27675a347efb682ae9b62adb7b69d39667f94d5c9e02c160814fc65923cbec |
| docs/12-codex-slice-e-wko-scraper.md | 51b923c50ab3e1fb15cff09a0a1c3beabee8fef6309e2bb40a24b3d04a5b0924 |
| docs/13-codex-slice-f-url-health-check.md | dd01cf9c7c169394fba00a00c6059df007c6350684142142b532db74020b099f |
| docs/14-codex-slice-g-draft-overhaul.md | 22a034ca0e3b24bdb7f9a0478cd839d499049e28326cb16d87953b295bbc38f3 |
| docs/15-codex-slice-h-clean-template-leakage.md | 58a168ea50ef9bc6a17617731a4d499d29f344983d0984db926f13ba64ef3820 |
| docs/16-codex-slice-i-profiler-draft-rebuild.md | 55fa2296a0d7423fbde2cfefbd33ae7862f816568e349a50556e17835733b6ca |
| docs/17-coldreach-body-instruction.md | cb894f80f7bc9195f5d7011d3847dd9361392a932e6348b9c3827a14cd39b452 |
| docs/18-profiler-prompt-header.md | 958784d5076b8aff18c7911df057891196aa7be55ac5ee9ebd656436332eebac |
| docs/19-codex-slice-j-doctrine-rewrite.md | 07e0866c19b428d56fe0ff4cc49cb561bbe5e748f8b538761da569a815a8e568 |
| docs/20-codex-slice-j-test-fix.md | 477e8b1f9eca2049c676c2bc98c5c3f6b9a08c4406d0bef9ff58beb45d77a005 |
| memory/project_c2moviez.md | c4062e784fcde8b9e7b3a62a8f0649c298f60cdbcabef7980cde9ecd99b39a4a |
