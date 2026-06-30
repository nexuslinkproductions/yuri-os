# MURE — Mechanismus-Karte (Energy Gate × Memory × Governance × Company/Quad-Fleet)

> Deliberator-Tiefanalyse (AMS-2026, D1). Auf Deutsch. Evidenz-gebunden, jede Behauptung mit `datei:zeile` verankert. Ehrliche Lückenliste: **shipped vs geplant**.
> Status-Symbole: 🟢 SHIPPED-LIVE · 🟡 SHIPPED-DISARMED (Code vorhanden, Gating aus) · ⚪ DOCTRINE-ONLY (Doktrin, kein Code) · 🁢 DECORATIVE (Code vorhanden, kein Live-Verbraucher) · 🔴 PLANNED (kein Code)

---

## 0. TL;DR — Das federierte System

Die vier Subsysteme sind **stark einzeln, föderiert gekoppelt, nicht geschlossen integriert.** Die echte Integration passiert an **einem** Punkt: der **MURE Company** als Orchestrierungs-Hülle. Sie instanziiert Governance (live), stellt Math-Bridge bereit (Energy + Sims verfügbar), und dispatcht den Quad-Fleet.

**Die harte, ehrliche Aussage in einem Satz:**
> *MURE ist heute **ARMED** (reale Swarm-Lanes), läuft aber operativ mit **nur einer einzigen Live-Sicherheits-Schicht** — der Governance. Energy-Gate beobachtet live, blockt aber nicht (Enforce DISARMED); Memory adaptiert nicht (FSRS-Demote ist Dry-Run). „Defense in Depth" ist architektonisch vorhanden, operativ heute einschichtig.*

Das ist kein Fake — jedes Subsystem ist echt shipped. Aber der *geschlossene adaptive Loop* (Energy → Governance → Memory → Rückwirkung) ist **teilweise realisiert**: real auf der Lese-/Orchestrierungs-Seite, geparkt auf der Enforce-/Adapt-Seite.

---

## 1. Energy Gate (`computeU` / ΔU)

### Mechanismus
- **ΔU = computeU(after) − computeU(before)** — gewichtete Summe aus **11 Termen**, echte Mathematik, keine Stube. `_SYSTEM/Scripts/math/yuri-energy.mjs:617-722`.
- Terme & Gewichte (`DEFAULT_WEIGHTS :82-94`): entropy 1.0 · wasserstein-1 **2.0** · overconfidenceDrift 0.5 · logLoss 1.0 · brier 1.0 · repeatedFailure **5.0** · malformedForecast **50.0** (fail-closed) · informationGain **−1.0** (senkt U) · staleness 0.5 · **protectedPathViolations η=100** (katastrophal) · **promotionLadderInversions θ=10** (strukturell) · verifiedEvidenceCredit −0.1 (gesättigt, gedeckelt bei count=50).
- Gewichte sind **hand-getuned, nicht gelernt** (`advisory_only:true :719`).
- **Verdict-Chain:** `gateProposal` → Veto-Flags (`protectedPathVeto :838` / `structuralFloorVeto :882` / `maxSeverityVeto :900` / `gateErrorVeto`) → `isCatastrophic` (`energy-breaker.mjs:112-114`) → Breaker `OPEN/CLOSED/HALF_OPEN`.
- **Katastrophal vs weich:** katastrophal **nur** bei gesetztem Veto-Flag. Eine weiche ΔU-Steigung (z.B. scheiternder Bash-Befehl hebt γ+δ) ergibt `accept:false` aber **kein** Veto → Breaker bleibt ZU → nur advisory `steer`. (`feedback-enforce-block-is-breaker-not-soft-reject` bestätigt.)
- **Live-Feed:** `energy-tick-core.mjs:312-461` (`evaluateTransition`, `tickAndTrace`) — echte before/after Control-Plane-State-Paare aus echten PostToolUse-Events. Trace-File **754 MB** beweist Firings.

### Ehrliche Tabelle
| Baustein | Status | Beweis |
|---|---|---|
| ΔU-Berechnung (11-Term) | 🟢 SHIPPED-LIVE | `yuri-energy.mjs:617-722`; 754 MB Trace |
| Verdict-Chain (Veto→isCatastrophic→Breaker) | 🟢 SHIPPED-LIVE | `:838-912`, `energy-breaker.mjs:112-150` |
| **Enforce-Block (PreToolUse deny)** | 🟡 **DISARMED** | `.claude/hooks/energy-enforce.mjs`: Code komplett, aber `YURI_ENERGY_ENFORCE` **unset** + Flag-File **fehlt** (verifiziert). Nur `would_deny`-Audit. |
| Outcome-Backfill / Learn-Loop | 🟡 DISARMED | `energy-outcome-backfill.mjs:190` shadow-only, Signals-Modul fehlt → stubs all-false, schreibt nie live `prediction-ledger`. „DERIVES 0" stimmt. |
| Drift-Tracking (weights-drift) | 🟢 SHIPPED (test-only) | `energy-weights-drift.test.mjs` — Drift-Gate, kein Runtime-Tracker |
| CUSUM/Kalman Shadow-Trend | 🁢 DECORATIVE | `energy-tick-core.mjs:192-234`, explizit „ADVISORY ONLY — NEVER consumed" |
| `gateClaimTransition` (Swap-Immunity) | 🁢 DECORATIVE | `claim-cortex.mjs:942-1053`, „no runtime caller" |
| Jeffrey-Posterior-Conditioning | 🁢 DECORATIVE | `claim-cortex.mjs:419-436`, default-off |

### Gap
- Behauptung „YURI_ENERGY_ENFORCE=1 already env-set" (`feedback-enforce-block...md`, CLAUDE.md) ist **falsch** — verifiziert unset. Gate ist **metrics-only**. Die Gedächtnis-Eigenbemerkung „(illusory)" ist korrekt; jede Aussage „der Gate blockt heute" ist unrichtig.

---

## 2. Memory — 2-Track + FSRS + Canonical Convergence

### Track A (YURI kanonisch) — 🟢 SHIPPED-LIVE
`memory-kernel.mjs`. Pipeline: **propose** (`:403`) → **decide** (`:505`, keep/rewrite/reject/defer) → **promote** (`:571`, owner-gated) → **append** (`:319`, fsync-durable, dedup-Window 50) → **recall** (`:130`, lexical/embedding/MSA). Store `_SYSTEM/OS_KERNEL/memory.db` (181 MB, **4324 Zeilen**).

### Track B (Claude Auto-Memory) — 🟢 SHIPPED-LIVE
Native `Write` nach `~/.claude/projects/<id>/memory/*.md` (109 Dateien). Wrapper `claude-memory-write.mjs` **optional** (Validierung/Reindex).
- **STALE-CLAIM:** `MEMORY_ARCHITECTURE.md:35` („wrapper is the only door") ist veraltet — seit Protected-Path-Rescope (2026-06-02) ist nativer Write die Default-Tür.

### Canonical Convergence Store — 🟢 SHIPPED-LIVE + FIRING
`memory-canonical-store.mjs`. **Write:** per-Lane Shard → gewählter Drainer (Nano-Lease) → Faltungs-Log (sha256-Dedup, Generations-Rotation). **Read:** peer-open `loadCanonical`/`readView`/`recallCanonical`. **Fold-Kommutativitäts-Fix** (`:394-429`, Commit `bf1e2a5a`): ordnungs-unabhängiges Dead-Marking via `supersededIds` + deterministische Survivor-Wiederwahl. **Launchd-Beat** `com.yuri.canonical-drain` @300s **feuert** (read-view heute aktualisiert, **37 Claims**, 0 bestritten). Track-A→Canonical-Bridge SHIPPED. **xref PASS 1c** fusioniert Canonical-Recall (`xref-query.mjs:77,306`).

### FSRS — 🟡 SHIPPED-LIVE-Math, DISARMED-Execution ⚠️
**Die wichtigste Ehrlichkeits-Korrektur:** FSRS ist **NICHT** nur labs. Produktions-Modul `_SYSTEM/Scripts/math/yuri-fsrs.mjs` (167 Zeilen, FSRS-4.5 Power-Law `R(t)=(1+FACTOR·t/S)^DECAY`, `FSRS_DECAY=-0.5`, `FSRS_FACTOR=19/81`, `R(S)=0.9`). Aufgerufen von `memory-relocator.mjs:25,347` als Demote-Scorer. Config-Knobs in `_SYSTEM/SELF/energy-weights.json` (`fsrs:{}`).
- **ABER:** der Consolidator-Launchd läuft **ohne `--execute`** → **Dry-Run / proposal-only**. Cold-Store = **0 Zeilen**.
- **Ehrliches Framing:** *„FSRS ist Produktions-Code, scoret aktiv, aber noch KEIN Speicher-Eintrag wurde jemals von ihm demoted."* Die `_SYSTEM/labs/math/_test_fsrs.mjs` sind Demo-Harnesses, nicht der Produktions-Pfad.
- **`write_strength = surprise × precision`** (NEURO_CORE-Doktrin): ist **CODE** — aber **nur in der JARVIS-Voice-Lane** (`voice/jarvis_energy.py`, `base·(1+surprise)·precision`, 13 Tests grün). Das Core-Memory-Encode wendet es **nicht** an. **Doktrin-vs-Code-Scope-Mismatch.**

### Ehrliche Tabelle
| Baustein | Status | Beweis |
|---|---|---|
| Track A Pipeline | 🟢 SHIPPED-LIVE | `memory-kernel.mjs`, 4324 Zeilen, fsync |
| Track B nativer Write | 🟢 SHIPPED-LIVE | 109 Dateien |
| Canonical Store (write+read+fold) | 🟢 SHIPPED-LIVE | heute feuernd, 37 Claims |
| Canonical Launchd-Beat | 🟢 SHIPPED-ARMED | @300s, read-view heute aktualisiert |
| xref PASS 1c Canonical-Fusion | 🟢 SHIPPED-LIVE | `xref-query.mjs:306` |
| **FSRS Retrievability-Scorer** | 🟢 **SHIPPED-LIVE** | `yuri-fsrs.mjs`, `memory-relocator.mjs:347` |
| **FSRS Demote-Execution** | 🟡 **DISARMED (Dry-Run)** | Consolidator ohne `--execute`, Cold-Store 0 Zeilen |
| `write_strength` systemweit | ⚪ DOCTRINE-ONLY (Voice-Lane hat Code) | nur `jarvis_energy.py` |
| Cold-Store (Subconscious) | 🟡 DISARMED (leer) | `memory-cold.db` 32 KB, 0 Zeilen |
| Spreading-Activation-Graph | 🟢 SHIPPED (test-covered) | nicht bestätigt inprod-Recall fusioniert |

---

## 3. Governance (6-Gate Charter + Constitution-Veto)

### Die 6 Gates — 🟢 ALLE SHIPPED + code-enforced + getestet
`_SYSTEM/mure/governance.mjs:60-72` (`evaluateGates`). `SELF-GOVERNABLE` iff alle 6 pass **und** kein Constitution-Veto (`:78-103`).

| # | Gate | Prüfung |
|---|---|---|
| 1 | `reversible` | `reversible===true && !arming` |
| 2 | `evidenceDecidable` | `===true` (fehlend → fail) |
| 3 | `inDoctrine` | `===true` |
| 4 | `blastRadius` | `blastRank(blastRadius) ≤ MEDIUM` |
| 5 | `notOutward` | `!outwardFacing` |
| 6 | `notContended` | `!contended` |

**Constitution-Veto** (dominiert alle 6, `:37-54`): Protected-Path, Gate-Selbst-Mod, Arming-eines-Gate, Secrets → immer OWNER-GATED.
Test `governance.test.mjs:97-148`: GREEN/RED/GREY mit **2⁶-Wahrheitstabelle + Monotonität + Veto-Dominanz + Mutation-Sweep**.

### Self-Governance Charter (origin) → **CODE-erzwungen, nicht nur Doktrin**
Die 6 Kriterien aus `yuri-origin.md` mappen **1:1** auf die 6 Gates. `evaluateGovernance` ist die Classifier-Funktion. **3 Live-Verbraucher:** `company.mjs:89` (jeder Subtask), `nexus-company.mjs:53` (jeder Job-Pool-Kandidat), `goal-engine.mjs:114` (jedes Goal).

### Arming & HOLD — 🟢 SHIPPED, mehrschichtig
- **BUILD-DISARMED ist Default:** `isMureArmed()` (`company.mjs:41-44`) braucht `YURI_MURE_ARMED=1` ODER Flag `_SYSTEM/state/mure.enabled`; sonst `runCompany` = plan-only Dry-Run (`:413-417`). `opts.armed:true` allein **kann sich nicht selbst scharfschalten** (`:410-412`).
- **ARMING = 3-fach owner-gated:** (a) Constitution-Veto `arming-a-gate` (`:51`); (b) Goal-Engine Pre-Filter `arming-hard-stop` (`goal-engine.mjs:36`); (c) `runCompany`-Flag.
- **HOLD-for-confirm:** `held-rulings.mjs:46-56`, Owner-Clear via `held-rulings.json`. `finalize:true` **nie** automatisch clearbar. Kein Auto-Writer (Owner-Hand).
- **Evolver-Arm:** separates Flag `evolver.enabled`, hebt Rollenboden nur für self-governable Subtasks (`company.mjs:96-99`).

### Ehrliche Tabelle
| Mechanismus | Status | Beweis |
|---|---|---|
| 6 Gates + Constitution-Veto | 🟢 SHIPPED | `governance.mjs:37-72`, Test `:97-148` |
| Charter → Code-Classifier | 🟢 SHIPPED | `evaluateGovernance`, 3 Live-Verbraucher |
| BUILD-DISARMED Default | 🟢 SHIPPED | `company.mjs:41-44,413` |
| Arming = owner-gated (3-Schicht) | 🟢 SHIPPED | `:51`, `goal-engine.mjs:36`, `:410-412` |
| HOLD-for-confirm | 🟢 SHIPPED | `held-rulings.mjs:46-56` |
| **Governance liest Energy-ΔU/Breaker** | 🔴 **NICHT VERBUNDEN** | kein Caller von `breakerVerdict` in `mure/` |
| Governance liest Energy Protected-Path | 🟢 SHIPPED (statisch) | `math-bridge.mjs:145` → String-Match |
| **Governance → Memory (Präzedenz)** | ⚪ **DOCTRINE-ONLY** | zustandslos, schreibt nichts |

### Gap
- **Die „Energy-Cross-Reference" ist nominal.** `breakerVerdict` ist in `math-bridge.mjs:165-168` exportiert, aber **kein MURE-Modul ruft es auf** (Grep quer durch `mure/`: null). Governance konsumiert nur die *statische* Protected-Path-Liste, **nicht** den *dynamischen* ΔU/Catastrophic-Verdict. Energy importiert umgekehrt Governance **gar nicht**. → **Zwei parallele Gates mit dünnem Shared-Vocabulary-Touch (Pfad-Strings), keine gekoppelte Enforcement-Kette.**
- **Kein Präzedenz-Gedächtnis.** Jede `evaluateGovernance` ist zustandslose Pure Function, schreibt nichts. Held-Rulings sind lokaler State, nicht Memory-Kernel.

---

## 4. MURE Company (20 Rollen) + Quad-Fleet

### Die 20 Rollen — 🟢 SHIPPED, Sakana-Archetypen (keine Impersonation)
6 Gruppen, je nach Quelle (`fleet-roles.json`, `role-registry.mjs:21`):

| Gruppe | Rollen |
|---|---|
| orchestration | helmsman, architect, steward |
| research | ideator, scout, synthesist, evolver, **deliberator** |
| engineering | engineer, mechanic, artificer, sentinel, kernelsmith |
| verification | adjudicator, oracle, calibrator |
| knowledge | archivist, chronicler |
| operations | quartermaster, envoy |

`fleet-roles.json:6`: `modeledOn: "Sakana.ai operating model — functional archetypes, never impersonations"`. `validateRoster` (`role-registry.mjs:51`) erzwingt Felder + Enum + MathHook-Auflösung.

### Company-Casting — 🟢 SHIPPED (disarmed-safe planning)
`company.mjs::planCompany (:238)`: Task → Subtasks → `castRole` (`:219`) → Capability-Match → `resolveLane` → Governance-Ruling → Split `glmLeaves`/`nativeSpecs`/`inlineSpecs`/`held`. GLM-Dispatch via `runSwarm` (`:433`), nativ via `spawnNativeLoop` (`:397`). Arm-gated (`:407-417`).

### Goal-Engine (PROPOSE→SCORE→GATE) — 🟢 SHIPPED, reale Math
`goal-engine.mjs::scoreGoal (:59)`. SCORE = 5-Dim-Composite (`SCORE_WEIGHTS:15`): capabilityFit .25 + reversibility .25 + blast .20 + evidenceDecidability .20 + doctrineFit .10. Advance bei `composite ≥ 0.75`. Pre-Filter (Constitution-Hard-Stop `:32`) verwirft vor Scoring. **Reine Planung, führt nichts selbst aus** (`:8-10`).

### Math-Bridge — 🟢 REAL CROSS-REFERENCE (nicht dekorativ) ✅
**Headline-Ehrlichkeitscheck bestanden.** `math-bridge.mjs:11-18` importiert **live**:
- `decision-sim.mjs` → `robustScore`(CVaR), `minimaxRegret`, `pgdWitness`, `infoGapHorizon`
- `quantum-hypothesis-tracker.mjs` → nicht-kommutierende Projektoren, echte `measureSequential`, `orderSensitive` aus `|jointAB − jointBA|`
- `energy-tick-core.mjs` → `isProtectedPath`, `salience`, `TIER`
- `energy-breaker.mjs` → `verdictFromStates`, `isCatastrophic`

`orderEffect (:97)` misst echten Ordnungseffekt an nicht-kommutierenden Projektoren — **kein Stub**. Die GLM-5.2-Verifizierung aus der Gedächtnis-Behauptung **hält**.

### Quad-Fleet — 🟢 4 Sidecar-Substrate + nativ
„Quad" = die 4 nicht-nativen Sidecars (alle ARMED, alle mit `.mjs` + Tests + Flag-File):

| # | Substrat | Fleet | Status |
|---|---|---|---|
| 1 | glm | `glm-fleet.mjs` (z.ai, `runSwarm`) | 🟢 ARMED (`glm-fleet.enabled`) |
| 2 | ollama | `ollama-fleet.mjs` (ollama-cloud) | 🟢 ARMED (`ollama-fleet.enabled`) |
| 3 | cline | `cline-fleet.mjs` (ClinePass CLI) | 🟢 ARMED (`cline-fleet.enabled`) |
| 4 | zai-tmux | `zai-tmux-fleet.mjs` (interaktiv) | 🟢 ARMED (`zai-tmux-fleet.enabled`) |
| + | native | Cursor/Claude Agents | ⚠️ **nur via Opus-Session spawnbar, NICHT lane-dispatchbar** (`company.mjs:384-388`) |

`llm-affinity-matrix.json` → `applyAffinityMatrix` (`company.mjs:175`) live, **advisory** (Governance gewinnt).

### MLP-Router + Brier — 🟢 SHIPPED (JS-Autorität) + Python-Sidecar (advisory)
- **JS-MLP** (`fleet-router-mlp.mjs`): 12→8(ReLU)→1, reines JS, trainierte Gewichte (`_SYSTEM/state/fleet-router-weights.json`, 3271 B, **nicht-default**). Advisory, überschreibt Governance nie (`:11,304`). Learn-Loop `fleet-mlp-feedback.mjs`: predict→ledger→outcome→`updateFromOutcome`. MLP-Learn ARMED.
- **Python-Sidecar** `_SYSTEM/ml/fleet_router_train.py` (9115 B, numpy) — echt, trainiert logistisch + numpy-MLP, berechnet held-out **Brier nur zum Vergleich**, schreibt **nie** Gewichte. Commit `5bea163c`: JS-MLP evalMeanBrier **0.1685** schlägt Python 0.4291 (aktuelle Skalierung).

### ARMING — 🟢 MURE IST ARMED (Gedächtnis veraltet!)
`_SYSTEM/state/mure.enabled` existiert (seit Jun 30 22:55). `mure.mjs --status`: `MURE: ARMED (flag)`, `Cline: ARMED`, `Evolver: ARMED`, GLM/Ollama/Zai/mlp-learn Flags alle vorhanden.
- **STALE:** `proj-agentic-digital-company-2026-06-22.md` sagt „DISARMED" — das ist veraltet; Flag wurde nachträglich erzeugt.

### Ehrliche Tabelle
| Baustein | Status |
|---|---|
| 20-Rollen-Roster | 🟢 SHIPPED |
| Company-Casting (`planCompany`) | 🟢 SHIPPED |
| Goal-Engine (SCORE+GATE) | 🟢 SHIPPED |
| Math-Bridge (CVaR/Quantum/Energy/Brier) | 🟢 REAL |
| Governance 6-Gate | 🟢 SHIPPED |
| Quad-Fleet (4 Sidecars) | 🟢 ARMED |
| MLP-Router JS | 🟢 ARMED (trainiert) |
| MLP-Router Python-Sidecar | 🟢 advisory (Brier-only) |
| substrate-benchmark | 🟡 DISARMED (`YURI_BENCHMARK_ARMED=1`) |

### Gaps
- **Nativ ist nicht lane-dispatchbar.** Ohne Opus-Session kann MURE keine nativen Claude-Agent-Aufgaben ausführen (reale Architektur-Limitation).
- **Stale Docstring** `fleet-router-mlp.mjs:5` sagt „three execution substrates" — veraltet (Cline/Zai fehlen).

---

## 5. Die Kopplungs-Matrix — wie sie WIRKLICH zusammenhängen

| Von ↓ / Nach → | Energy Gate | Memory | Governance | MURE Company |
|---|---|---|---|---|
| **Energy Gate** | — | 🟢 **vorwärts**: Trace → FSRS `\|ΔU\|`-Stabilitätsweight (`yuri-fsrs.mjs:84-106`); Trace → JARVIS `write_strength` | 🔴 **keine**: Governance liest ΔU nicht | 🟡 verfügbar via `math-bridge.breakerVerdict`, **aber kein Live-Caller** |
| **Memory** | 🟡 indirekt: Prediction-Ledger-Brier → Homeostat (`yuri-homeostat.mjs:104-137`) | — | 🔴 keine (Governance zustandslos) | 🟢 Read: Canonical-Recall in xref PASS 1c; FSRS-Recall-Signal |
| **Governance** | 🟢 **statisch nur**: Protected-Path-String-Match (`math-bridge.mjs:145`) | 🔴 keine (schreibt nichts) | — | 🟢 **LIVE**: gate bei jedem Cast (`company.mjs:89`) |
| **MURE Company** | 🟡 exponiert Math-Bridge, konsumiert Energy-Verdict **nicht live** | 🟢 Lanes schreiben via Standard-Memory-Pfade | 🟢 **LIVE**: instanziiert Governance in Goal-Engine + Dispatch | — |

**Die echte Kopplung ist ONTOLOGISCH, nicht nur Call-Graph:**
1. **Geteilte Risiko-Dimensionen.** Governance-6-Gates (reversibel/evidence/doctrine/blast/notOutward/notContended) und Goal-Engine-SCORE (capabilityFit/reversibility/blast/evidenceDecidability/doctrineFit) sind **dieselbe Ontologie**. Energy-ΔU-Terme (protectedPath=100, ladderInversions=10) kodieren **dieselbe** Protected-Path/Structural-Floor-Doktrin. Die drei „Entscheidungs"-Systeme sprechen dieselbe Rischosprache — das ist die wahre Kopplung.
2. **MURE Company ist der Binder.** Ohne MURE sind die anderen 3 Einzel-Werkzeuge. Mit MURE werden sie ein (teil-armedes) autonomes Kollektiv. Company = einzige Stelle, die alle drei instanziiert.
3. **Der fehlende bidirektionale Loop** (das Geplante): Energy-ΔU → Governance-Blast ⛔; Governance-Rulings → Memory-Präzedenz ⛔; FSRS → Demote low-Value ⚠️(dry-run); Memory-Recall → Governance-Präzedenz ⛔. Der **geschlossene adaptive Loop existiert architektonisch, fließt operativ nur open-loop vorwärts.**

---

## 6. Der integrierte Pfad (Task → Dispatch, wer feuert wann)

```
Task-Eingang
   │
   ▼
[Goal-Engine] PROPOSE → SCORE(5-Dim) → preFilter(Constitution-Hard-Stop)
   │                    ▲ SCORE-Dims = Governance-Dims (geteilte Ontologie)
   │                    ⚠️ arming-Hard-Stop verwirft vor Scoring
   ▼
[Governance] evaluateGates(6) + Constitution-Veto   ← EINZIGE LIVE-SICHERHEIT HEUTE
   │   🟢 code-enforced, getestet (2⁶ + Mutation-Sweep)
   │   🔴 energy-BLIND (liest ΔU nicht)
   │   🔴 memory-LOS (zustandslos, kein Präzedenz)
   ├── SELF-GOVERNABLE → [Dispatch]
   └── sonst → [HOLD] held-rulings (Owner-Clear)
   ▼
[Company-Casting] planCompany → castRole → resolveLane
   │   🟢 applyAffinityMatrix (advisory) → Substrat-Wahl
   │   🟡 MLP-Router (trainiert, advisory, überschreibt nie Governance)
   ▼
[Quad-Fleet] 4 Sidecars ARMED (glm/ollama/cline/zai) + nativ (nur Opus-Session)
   │
   ▼ (parallele Ausführung)
[Energy Gate] beobachtet LIVE, ENFORCE DISARMED 🟡
   │   🟢 vorwärts: Trace → FSRS |ΔU| + JARVIS write_strength
   │   🟡 Enforce-Block: Code da, Gating aus → metrics-only
   ▼
[Memory] Track-A 🟢 LIVE · Canonical 🟢 LIVE+feuernd · FSRS 🟡 scoret, demotet nicht
```

---

## 7. Ehrliche Lückenliste (shipped vs geplant), priorisiert

| # | Lücke | Ist-Zustand | Soll (geplant) | Risiko/Klasse |
|---|---|---|---|---|
| **L1** | **Energy-Enforce** | 🟡 DISARMED (metrics-only) | Armed PreToolUse-Block bei katastrophalem Verdict | **Sicherheit — einsichtig heute** |
| **L2** | **Governance↔Energy-Verdict** | 🔴 nicht verbunden (nur statischer Pfad-Match) | Governance konsumiert ΔU/Breaker-Verdict live | Integration |
| **L3** | **FSRS-Demote-Execution** | 🟡 Dry-Run (scoret, demotet nie; Cold-Store leer) | Armed Consolidator (`--execute`) | Adaptivität |
| **L4** | **`write_strength` systemweit** | ⚪ DOCTRINE-ONLY (nur Voice-Lane hat Code) | Encode-Gate im Core-Memory-Pipeline | Adaptivität |
| **L5** | **Governance→Memory-Präzedenz** | 🔴 zustandslos | Rulings akkumulieren als lernbare Präzedenz | Integration |
| **L6** | **Learn-Loop (Outcome-Backfill)** | 🟡 shadow-only, „DERIVES 0" | Live-Kalibrierung der Gewichte aus Outcomes | Kalibrierung |
| **L7** | **Native Substrate lane-dispatch** | ⚠️ nur Opus-Session spawnbar | Lane-dispatchbar aus GLM-Only-Run | Architektur |
| **L8** | **CUSUM/Kalman, gateClaimTransition, Jeffrey** | 🁢 DECORATIVE (berechnet, unverbraucht) | Live-Verbraucher ODER ehrlich entfernen | Tech-Debt |

**Konsolidierte Aussage:** Die **Lese-/Orchestrierungs-Seite** (Governance-Gate, Canonical-Recall, Goal-Engine, Math-Bridge, Quad-Fleet-Dispatch) ist 🟢 **echt shipped**. Die **Enforce-/Adapt-Seite** (Energy-Block, FSRS-Demote, systemweites write_strength, Learn-Loop) ist 🟡⚪ **geparkt**. Der adaptive **geschlossene Loop** ist die größte plan-vs-shipped-Differenz.

---

## 8. Risiko-Postur — ARMED Company + DISARMED Safety (die ehrliche Spannung)

- **MURE Company ist ARMED** (reale Swarm-Dispatches über 4 Sidecar-Substrate).
- **Aber:** Energy-Enforce 🟡 DISARMED + FSRS-Demote 🟡 Dry-Run.
- **Konsequenz:** Das autonome Kollektiv läuft operativ mit **Governance als EINZIGER Live-Sicherheits-Schicht**.
- **Bewertung:** Governance ist stark (6 Gates, getestet, Constitution-Veto, mehrschichtiges Arming-Gate, HOLD-Mechanik) — aber sie ist **energy-blind und memory-los**. „Defense in Depth" (Governance + Energy + adaptive Memory) ist **architektonisch vorhanden, operativ heute einschichtig**. Das ist **die** Aussage, die ein Investor/evaluator sehen muss: kein Fake, echte Subsysteme, aber das vollständige Sicherheits-Netz ist noch nicht gespannt.

---

## 9. Evidenz-Quellen (file:line Anker)

- **Energy:** `_SYSTEM/Scripts/math/yuri-energy.mjs:617-722,838-912` · `energy-tick-core.mjs:312-461` · `energy-breaker.mjs:112-150` · `.claude/hooks/energy-enforce.mjs:44-119` · `energy-outcome-backfill.mjs:17-190`
- **Memory:** `memory-kernel.mjs:130-571` · `memory-canonical-store.mjs:238-429` · `mcs-maintenance.mjs` · `memory-kernel-canonical-bridge.mjs` · `math/yuri-fsrs.mjs` · `memory-relocator.mjs:25,347` · `voice/jarvis_energy.py`
- **Governance:** `_SYSTEM/mure/governance.mjs:37-103` · `governance.test.mjs:97-148` · `held-rulings.mjs:46-56` · `evolver-arm.mjs:16-19` · `_SYSTEM/yuri-origin.md` (Self-Governance Charter)
- **Company/Fleet:** `_SYSTEM/mure/company.mjs:41-433` · `goal-engine.mjs:15-114` · `math-bridge.mjs:11-182` · `role-registry.mjs:21-51` · `_SYSTEM/config/fleet-roles.json` · `_SYSTEM/config/llm-affinity-matrix.json` · `fleet-router-mlp.mjs` · `_SYSTEM/ml/fleet_router_train.py` · `glm/ollama/cline/zai-tmux-fleet.mjs`

*Verifiziert durch 4 parallele Sonnet-Evidenz-Agenten (MAX reasoning) gegen lokalen Code-Stand 2026-07-01. Kein Over-Claiming; jede SHIPPED-Aussage trägt Datei-Zeilen-Beweis.*
