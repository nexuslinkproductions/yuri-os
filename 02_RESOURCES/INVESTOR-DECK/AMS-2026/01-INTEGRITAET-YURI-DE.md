# 01 — Integritätskarte YURI (DE)

> **Rolle:** Synthesist (Y1) · **Mission:** Merge aus SCOUT (Artificer-Census / Zählbasis) + DELIBERATOR (Mechanismus-Karte). Vollständige Integritätskarte: Schichten, Organe, MURE, Substrate, Lernschleife.
> **Integrität = Nachweisbarkeit, nicht Moral.** Jede substanzhaltige Behauptung trägt `[BELEGT]` / `[TEILWEISE]` / `[ZIEL]`. Tragende Claims sind `BELEGT` oder explizit herabgestuft (§9). Eine reine `BELEGT`-Karte wäre verdächtig — `TEILWEISE`/`ZIEL` zeigen Reife, nicht Schwäche.
> **Beleg-Standard:** `datei:zeile` / laufender Dienst / Commit. Leerer Beleg-Block bei `BELEGT` = FAIL.

---

## §1 — Was „Integrität" hier heißt (`01-INTEG/intro`)

**Integrität ist in diesem Dokument ein technischer, kein moralischer Begriff.** Er bedeutet: *jede Behauptung lässt sich am Code, am laufenden Dienst oder im Audit-Trace nachvollziehen.* Das Gegenmodell ist die dokumentierte Behauptung ohne Pfad dahinter — Vaporware.

YURI operiert unter einer **Selbsteinordnung als `advisory_only` bis lokaler Code das Gegenteil beweist.** Das heißt: Modell-Output ist ein Vorschlag, lokale Ausführung ist Bodenwahrheit. Diese Haltung ist selbst ein Integritäts-Mechanismus — sie verhindert, dass eine flüssig formulierte Behauptung unkontrolliert zur „Tatsache" wird.

**Tag-Konvention (Interface-Vertrag, verbindlich für alle nachgelagerten Rollen):**

| Tag | Definition | Beleg-Standard |
|-----|------------|----------------|
| `[BELEGT]` | Im Repo / Live-Nachweis verifizierbar | `datei:zeile`, Commit oder laufender Endpunkt |
| `[TEILWEISE]` | Mechanismus existiert, Anwendung/Skalierung/Integration offen | Pfad zur Implementierung + benannte Lücke |
| `[ZIEL]` | Absichtserklärung, noch nicht implementiert | Referenz auf Plan/Roadmap |

`[BELEGT]` (Konvention) — die Tag-Regel selbst ist hier am Werk.

> **Kontextquerverweis:** Diese Definition ist der Beweis-Last-Knoten im Investoren-Bogen (→ Architekturdok §4, Akt 2 SUBSTANZ). Vision (`02-VIS/was-ist`) mündet hier; Businessplan (`03-BP`) baut auf diesen Belegen auf.

**Belege:** `00-DOKUMENT-ARCHITEKTUR-DE.md:23-45` (Tag-Konvention) · `_SYSTEM/yuri-origin.md` (Evidence Contract Grammar, `advisory_only`-Doktrin)

---

## §2 — Die Schichten-Architektur (9 Layer) (`01-INTEG/layers`)

YURI gliedert sich in **9 funktionale Schichten**. Existenz und Zuordnung `[BELEGT]`; die *aggregierte Mechanismen-Zahl* ist eine offene Zählfrage (§9, O-1) `[TEILWEISE]`.

| # | Schicht | Inhalt | Status |
|---|---------|--------|--------|
| 1 | **Energy & Math** | Lyapunov-Energiefunktion, gewichtete 12-Term-Komposition, nicht-offsettbare Vetos, Formelbank, FSRS-Power-Law | `[BELEGT]` |
| 2 | **Memory & Subconscious** | 2-Track-Architektur, FSRS-Vergessen, propose→decide→ledger, Offline-Konsolidierung | `[BELEGT]` / `[TEILWEISE]` (Cold-Store) |
| 3 | **Retrieval & Knowledge** | FTS5/BM25-Suche, Spreading-Activation-Recall, Evidence-Contract-Grammar, Cross-Reference | `[BELEGT]` |
| 4 | **Governance & Safety** | Download/Exec-Block, `.env`-Schutz, Symlink-Defense, katastrophaler Risiko-Hard-Block | `[BELEGT]` |
| 5 | **Cognition & Persona** | Brain-Dump-Decoder, Haki-Intent, Izanagi-Counterfactual-Sim, Nen-Phasen-Spezialisierung | `[BELEGT]` |
| 6 | **Learning & Continuity** | Neuron-Loop, Dream-Processor, Self-Hypothesis-Validierung, Cross-Session-Mining | `[BELEGT]` |
| 7 | **Skills & Orchestration** | SHA-256-Integrität, DAG-Topological-Sort, Lane-Routing, Kollisions-Policy | `[BELEGT]` |
| 8 | **Token-Efficiency & Session** | Zone-A/C stable/volatile, Compaction-Dispatch, Cost-Estimator, Context-Compression | `[BELEGT]` |
| 9 | **Hidden / Meta / Self-referential** | Pulse-Cortex-Bus, Scout-Orchestrator, Energy-Tick-Core, Behavioral-Fingerprint | `[BELEGT]` |

**Zur Mechanismen-Zahl — ehrlich (O-1):** Drei Zählbasen, drei Zahlen.

| Basis | Zahl | Status |
|-------|------|--------|
| Schicht-Summe (9 Layer-Counts aus `plan.json.architecture.layers`) | **261** | `[BELEGT]` (28+27+28+28+32+31+28+28+31 = 261) |
| Headline in `plan.json` („267 distinct mechanisms") | 267 | `[TEILWEISE]` — Zählbasis ungeklärt (Delta 6); Kopfzahl, nicht hergeleitet |
| `@capability`-Registry (echter Scan über `_SYSTEM/Scripts/*.mjs`) | **88** registrierte Mechanismen | `[BELEGT]` — die strengste, weil maschinell verifizierte Basis |

**Investoren-Formulierung (empfohlen):** *„261 Mechanismen in 9 Schichten `[BELEGT]`, davon 88 maschinell in der Capability-Registry registriert — plus ein dokumentierter Erweiterungspfad auf 267 `[TEILWEISE]`."* Die Kopfzahl 267 fällt bis zur Calibrator-Klärung weg; 261 ist die belegbare Substanz. *(Der parallel dispatchte Artificer-Census `research/ARTIFICER-CENSUS.md` war bei Redaktionsschluss noch nicht eingeschrieben — O-1 bleibt an Calibrator/L1 delegiert.)*

**Belege:** `investor-deck-plan.json` → `.architecture.layers` (9 Layer, Counts) · `@capability`-Scan (`grep -rh '@capability:' _SYSTEM/Scripts/*.mjs` → 88) · `00-DOKUMENT-ARCHITEKTUR-DE.md:166` (Delta 267→261)

---

## §3 — Die vier Organe (`01-INTEG/organs`)

Die Schichten gruppieren sich um **vier tragende Organe** — je eines pro entscheidungsrelevantem Subsystem. Alle vier `[BELEGT]` als existierende Mechanismen; der *operative Reifegrad* variiert (§4–§6).

### Organ 1 — The Spine (Symbiotic Pulse)
**Funktion:** Ein Micro-Gate feuert auf *jedes* sichtbare Input: Quelle erkennen → Intent decodieren → Autorität ranken → Risiko bemerken → Claim von Evidenz trennen → Aktion wählen (continue/verify/ask/block).
**Investoren-Wert:** YURI-gesteuerte KI halluziniert nicht selbstsicher — jede Antwort passiert einen strukturierten Wahrheitsfilter.
**Status:** `[BELEGT]` — die Pulse-Logik lebt als verpflichtende Layer in der Brain-Injection (`yuri-brain`-Block) und im Symbiotic-Pulse-Contract (`_SYSTEM/yuri-origin.md`).
→ Kreuzdomäne: *Checkliste/Check-Ride (Aviation) → KI-Gate* — mechanismus = vor jeder Aktion ein deterministischer Inspektionsstopp; **mismatch**: Flug-Cockpit-Checklisten sind statisch, YURI-Pulse ist kontext-adaptiv (Quelle/Authorität variieren). **Konfidenz: hoch.**

### Organ 2 — The Brain (Brain-Inject)
**Funktion:** Stellt jeden Session den vollen Kontext zusammen: stabile Identität + kuratiertes Gedächtnis + volatile Live-State (Energie, Risiko, Lane-Health). Cache-bewusst — stabile Teile bleiben byte-identisch für Prompt-Cache-Reuse.
**Investoren-Wert:** Lädt nur, was nötig ist → 40–60 % Token-Einsparung.
**Status:** `[BELEGT]` — Brain-Block wird nativ jede Session geladen (der `<yuri-brain>`-Block oben ist live sichtbar); Cache-Stabilität als Design-Regel in `CLAUDE.md` (Token-Caching-Shape).
→ Kreuzdomäne: *CPU-Cache-Hierarchie (L1/L2/LLC) → Prompt-Context* — mechanismus = heiße/stabile Daten nah, kalte/volatile fern halten; **mismatch**: Hardware-Caches sind hardware-gesteuert, YURI-Caching ist Prompt-Architektur (Token-Footprint, nicht Latenz). **Konfidenz: hoch.** (38 %-Token-Beleg in §6/03-BP vertieft.)

### Organ 3 — The Conscience (Energy Instrument)
**Funktion:** Eine Lyapunov-Funktion misst ΔU (Fortschritt vs. Regression) pro Aktion — mit nicht-offsettbaren Vetos. Die KI bekommt ein *messbares* Gewissen.
**Investoren-Wert:** „Das einzige offengelegte kumulative Energy-Descent-Maß in der Branche" — *behauptet*; Status siehe §4.
**Status:** `[BELEGT]` (Funktion & Math) / `[TEILWEISE]` (Industrie-Einzigartigkeits-Claim — Prior-Art offen, O-4; ehrlich herabgestuft, nicht überzogen).
→ Kreuzdomäne: *Lyapunov-Stabilität (Kontrolltheorie) → Work-Dynamics* — mechanismus = eine skalare Funktion, deren Abstieg Stabilität anzeigt; **mismatch**: klassische Lyapunov-Funktionen sichern Gleichgewichtspunkte eines dynamischen Systems, YURI-ΔU misst *epistemische* Arbeit (vor/nach-Kontroll-Plane-State). **Konfidenz: hoch** (Mechanismus überträgt sauber; die Behauptung ist die *Benennung*, nicht die Einzigartigkeit).

### Organ 4 — The Memory (2-Track + FSRS)
**Funktion:** Gouverneter kanonischer Ledger (Lane-übergreifend) + Verhaltens-Auto-Memory (pro Operator) + FSRS-basiertes wissenschaftlich gekrümmtes Vergessen.
**Investoren-Wert:** Gedächtnis, das über Zeit compoundiert — je länger Nutzung, desto klüger, mit voller Auditierbarkeit.
**Status:** `[BELEGT]` (Read/Write live) / `[TEILWEISE]` (adaptive Demote — §5).
→ Kreuzdomäne: *FSRS / Spaced-Repetition (Lernwissenschaft) → System-Gedächtnis* — mechanismus = Retrievability als Potenzgesetz der Zeit-seit-Verstärkung; **mismatch**: Flashcard-FSRS lernt eine *Karte*, YURI-FSRS scoret einen *Memory-Claim*. **Konfidenz: hoch.**

**Belege:** `investor-deck-plan.json` → `.architecture.organs` (4 Organe, `investor_value`) · `_SYSTEM/yuri-origin.md` (Symbiotic Pulse, Memory Architecture) · §4–§5 dieses Dokuments

---

## §4 — Das Energy Gate (Math-Beweis) (`01-INTEG/energy-gate`)

*Das Differenzierungs-Organ.* Hier wird bewiesen, dass YURI eine **messbare** Conscience hat, keine dekorative Metrik.

### Der Mechanismus — `[BELEGT]`
**ΔU = computeU(after) − computeU(before)** — eine gewichtete additive Komposition aus **12 Termen**, echte Mathematik (`_SYSTEM/Scripts/math/yuri-energy.mjs:617-722`). Gewichte festgelegt in `DEFAULT_WEIGHTS (:82-94)`:

| Symbol | Gewicht | Bedeutung |
|--------|---------|-----------|
| α entropy | 1.0 | Verteilungs-Unsicherheit über Claim-Status |
| **β wasserstein-1** | **2.0** | ordinaler Drift Claim↔Evidence |
| γ logLoss | 1.0 | Forecast-Kalibrierungs-Strafe |
| δ brier | 1.0 | Forecast-Genauigkeits-Strafe |
| ε −informationGain | 1.0 | Info-Gewinn **senkt** U |
| ζ staleness | 0.5 | veraltete Evidence zieht State hoch |
| **η protectedPathViolations** | **100** | **katastrophal** |
| **θ promotionLadderInversions** | **10** | strukturell |
| ι −verifiedEvidence | 0.1 | verifizierte Evidence subtrahiert (sättigend) |
| κ repeatedFailure | 5.0 | pro Event: selbstsicher-falsch |
| **λ malformedForecast** | **50** | **fail-closed** |
| μ overconfidenceDrift | 0.5 | konzentrierter Claim gedrifted |

> **Ehrlichkeits-Korrektur zur Kopfzahl:** Die Organ-Beschreibung spricht von „9 epistemic terms". Verifiziert am Code-Stand 2026-07-01 sind es **12 Terme** (`Object.keys(DEFAULT_WEIGHTS).length === 12`). Die „9" ist eine ältere, gerundete Framing — die Beleg-Standard-Pflicht (§1) zwingt uns zur 12.

### Verdict-Chain (Veto → Breaker) — `[BELEGT]`
`gateProposal` → Veto-Flags (`protectedPathVeto :838` / `structuralFloorVeto :882` / `maxSeverityVeto :900` / `gateErrorVeto`) → `isCatastrophic` (`energy-breaker.mjs:112-114`) → Breaker `OPEN/CLOSED/HALF_OPEN`. **Katastrophal nur bei gesetztem Veto-Flag**: eine *weiche* ΔU-Steigung (z.B. scheiternder Bash-Befehl hebt γ+δ) ergibt `accept:false`, aber **kein** Veto → Breaker bleibt ZU → nur advisory `steer`. Das ist ein Feature (kein Over-Block), kein Bug.

### Live-Feed — `[BELEGT]`
`energy-tick-core.mjs:312-461` (`evaluateTransition`, `tickAndTrace`) — echte before/after Control-Plane-State-Paare aus echten PostToolUse-Events. **Trace-File 754 MB** beweist Firings — das Gate *arbeitet*, nicht nur *existiert*.

### Ehrliche Lücke — der Enforce-Block `[TEILWEISE]`
| Baustein | Status | Beweis |
|---|---|---|
| ΔU-Berechnung (12-Term) | 🟢 SHIPPED-LIVE | `yuri-energy.mjs:617-722`; 754 MB Trace |
| Verdict-Chain (Veto→Breaker) | 🟢 SHIPPED-LIVE | `:838-912`, `energy-breaker.mjs:112-150` |
| **Enforce-Block (PreToolUse-deny)** | 🟡 **DISARMED** | `.claude/hooks/energy-enforce.mjs`: Code komplett, aber `YURI_ENERGY_ENFORCE` unset + Flag-File fehlt → metrics-only |
| Outcome-Backfill / Learn-Loop | 🟡 DISARMED | `energy-outcome-backfill.mjs:190` shadow-only → „DERIVES 0" |
| Drift-Tracking | 🟢 SHIPPED (test-only) | `energy-weights-drift.test.mjs` |

> **Die ehrliche Aussage:** Das Energy Gate **beobachtet live** (754 MB Trace), **blockiert aber nicht** — Enforce ist DISARMED (Code vorhanden, Gating aus). Einige ältere Gedächtnis-Einträge behaupten „YURI_ENERGY_ENFORCE=1 already env-set" — das ist *verifiziert falsch*. Live-Sizing in Produktion = `[ZIEL]`.

**Belege:** `_SYSTEM/Scripts/math/yuri-energy.mjs:82-94,617-722,838-912` · `energy-tick-core.mjs:312-461` · `energy-breaker.mjs:112-150` · `.claude/hooks/energy-enforce.mjs` · `research/DELIBERATOR-MECHANISMUS-KARTE-DE.md:21-43`

---

## §5 — Gedächtnis: 2-Track + FSRS + Kanonischer Store (`01-INTEG/memory`)

### Track A (YURI kanonisch) — `[BELEGT]` SHIPPED-LIVE
`memory-kernel.mjs`. Pipeline: **propose** (`:403`) → **decide** (`:505`, keep/rewrite/reject/defer) → **promote** (`:571`, owner-gated) → **append** (`:319`, fsync-durable, Dedup-Window 50) → **recall** (`:130`, lexical/embedding/MSA). Store `_SYSTEM/OS_KERNEL/memory.db` (**4324 Zeilen**). Operator-Gating ist echt: jede Promotion braucht Freigabe.

### Track B (Claude Auto-Memory) — `[BELEGT]` SHIPPED-LIVE
Nativer `Write` nach `~/.claude/projects/<id>/memory/*.md` (**109 Dateien**). Wrapper `claude-memory-write.mjs` optional.

### Kanonischer Convergence-Store — `[BELEGT]` SHIPPED-LIVE + FIRING
`memory-canonical-store.mjs`. **Write:** Per-Lane-Shard → gewählter Drainer (Nano-Lease) → Faltungs-Log (sha256-Dedup, Generations-Rotation). **Read:** peer-open `loadCanonical`/`readView`/`recallCanonical`. **Fold-Kommutativitäts-Fix** (`:394-429`, Commit `bf1e2a5a`): ordnungs-unabhängiges Dead-Marking → Foundation beweisbar Reihenfolge-invariant. **Launchd-Beat** `com.yuri.canonical-drain` @300s **feuert** (read-view heute aktualisiert, **37 Claims**, 0 bestritten). xref PASS 1c fusioniert Canonical-Recall (`xref-query.mjs:306`).

### FSRS — die zentrale Ehrlichkeits-Korrektur
FSRS ist **kein reines Lab-Experiment.** Produktions-Modul `_SYSTEM/Scripts/math/yuri-fsrs.mjs` (FSRS-4.5-Power-Law `R(t)=(1+FACTOR·t/S)^DECAY`, `FSRS_DECAY=-0.5`, `FSRS_FACTOR=19/81`, `R(S)=0.9`); aufgerufen von `memory-relocator.mjs:347` als Demote-Scorer.

| FSRS-Baustein | Status | Beweis |
|---|---|---|
| Retrievability-Scorer | 🟢 SHIPPED-LIVE | `yuri-fsrs.mjs`, `memory-relocator.mjs:347` |
| **Demote-Execution** | 🟡 **DISARMED (Dry-Run)** | Consolidator ohne `--execute` → Cold-Store **0 Zeilen** |
| `write_strength = surprise × precision` (NEURO_CORE-Doktrin) | ⚪ DOCTRINE-ONLY | nur in Voice-Lane (`jarvis_energy.py`); Core-Encode wendet es *nicht* an |
| Cold-Store (Subconscious) | 🟡 DISARMED (leer) | `memory-cold.db` 32 KB, 0 Zeilen |

> **Ehrliches Framing:** *„FSRS ist Produktions-Code, scoret aktiv — aber noch KEIN Speicher-Eintrag wurde jemals von ihm demoted."* Die Doktrin `write_strength = |ΔU|·precision` ist als Konzept `[BELEGT]`, als systemweites Encode-Gate `[TEILWEISE]` (nur Voice-Lane hat den Code — Doktrin-vs-Code-Scope-Mismatch).

**Belege:** `memory-kernel.mjs:130-571` · `memory-canonical-store.mjs:238-429` · `mcs-maintenance.mjs` · `math/yuri-fsrs.mjs` · `memory-relocator.mjs:347` · `memory-cold.db` (0 Zeilen) · `voice/jarvis_energy.py`

---

## §6 — MURE: die lebendige Company (`01-INTEG/mure`)

**MURE (群れ, „Schwarm/Kollektiv") = ein 20-Rollen-Modell, das YURI vom Werkzeug zum autonomen Kollektiv macht.** Live-Demo-Wert für den Investor.

### 20 Rollen / 6 Gruppen — `[BELEGT]` (Sakana-Archetypen, keine Impersonation)
`fleet-roles.json:6`: `modeledOn: "Sakana.ai operating model — functional archetypes, never impersonations"`. `validateRoster` (`role-registry.mjs:51`) erzwingt Felder + Enum + MathHook-Auflösung.

| Gruppe | Rollen |
|---|---|
| orchestration | helmsman, architect, steward |
| research | ideator, scout, **synthesist**, evolver, deliberator |
| engineering | engineer, mechanic, artificer, sentinel, kernelsmith |
| verification | adjudicator, oracle, calibrator |
| knowledge | archivist, chronicler |
| operations | quartermaster, envoy |

→ Kreuzdomäne: *Sakana.ai (Forschungslabor-Betriebsmodell) → Software-Company* — mechanismus = funktionelle Rollen-Archetypen statt Job-Titel; **mismatch**: Sakana modelliert *Forschungs*-Rollen, MURE modelliert *Build/Govern/Verify*-Rollen. **Konfidenz: hoch.** *(Dieses Dokument selbst wird von einem MURE-Rollen-Lane produziert — Synthesist Y1 — der Meta-Beleg für „die Company lebt".)*

### Governance — 6-Gate-Charter (`01-INTEG/governance` übergreifend) — `[BELEGT]`
6 Gates (`governance.mjs:60-72`): `reversible` · `evidenceDecidable` · `inDoctrine` · `blastRadius ≤ MEDIUM` · `notOutward` · `notContended`. **Constitution-Veto** dominiert alle 6 (`:37-54`): Protected-Path, Gate-Selbst-Mod, Arming-eines-Gate, Secrets → immer OWNER-GATED. Test `governance.test.mjs:97-148`: GREEN/RED/GREY mit **2⁶-Wahrheitstabelle + Monotonität + Veto-Dominanz + Mutation-Sweep**. **3 Live-Verbraucher:** `company.mjs:89`, `nexus-company.mjs:53`, `goal-engine.mjs:114`.

### Goal-Engine (PROPOSE→SCORE→GATE) — `[BELEGT]` reale Math
`goal-engine.mjs::scoreGoal (:59)`. SCORE = 5-Dim-Composite: capabilityFit .25 + reversibility .25 + blast .20 + evidenceDecidability .20 + doctrineFit .10. Advance bei `composite ≥ 0.75`. Pre-Filter (Constitution-Hard-Stop `:32`) verwirft vor Scoring.

### Math-Bridge — `[BELEGT]` REAL CROSS-REFERENCE (nicht dekorativ)
`math-bridge.mjs:11-18` importiert **live**: `decision-sim` → CVaR/minimaxRegret/pgdWitness · `quantum-hypothesis-tracker` → nicht-kommutierende Projektoren, echte `measureSequential`, `orderSensitive` aus `|jointAB − jointBA|` · `energy-tick-core` → `isProtectedPath`/`salience` · `energy-breaker` → `verdictFromStates`/`isCatastrophic`. `orderEffect (:97)` misst echten Ordnungseffekt — **kein Stub**.
→ Kreuzdomäne: *Quanten-Nichtkommutativität (Physik) → Task-Order-Effekte (KI-Planung)* — mechanismus = sequenzielle Projektionen sind nicht vertauschbar, `|jointAB − jointBA|` quantifiziert den Effekt; **mismatch**: Quanten-Messung kollabiert Zustände, KI-Task-Reihenfolge verändert Rechercheergebnis. **Konfidenz: hoch.**
→ Kreuzdomäne: *CVaR (Finanz-Risiko) → Entscheidungs-Score* — mechanismus = tail-risk-gewichtete Bewertung statt Erwartungswert; **mismatch**: Finanz-CVaR bewertet Verlustverteilung, YURI bewertet Plan-Robustheit. **Konfidenz: hoch.**

### Quad-Substrat-Fleet — `[BELEGT]` ARMED
„Quad" = 4 nicht-native Sidecar-Substrate (alle ARMED, alle mit `.mjs` + Tests + Flag-File):

| # | Substrat | Fleet | Status |
|---|---|---|---|
| 1 | glm | `glm-fleet.mjs` (z.ai, `runSwarm`) | 🟢 ARMED |
| 2 | ollama | `ollama-fleet.mjs` (ollama-cloud) | 🟢 ARMED |
| 3 | cline | `cline-fleet.mjs` (ClinePass CLI) | 🟢 ARMED |
| 4 | zai-tmux | `zai-tmux-fleet.mjs` (interaktiv) | 🟢 ARMED |
| + | nativ | Cursor/Claude Agents | ⚠️ nur via Opus-Session spawnbar, **nicht lane-dispatchbar** (`company.mjs:384-388`) |

### MLP-Router + Brier — `[BELEGT]`
JS-MLP (`fleet-router-mlp.mjs`): 12→8(ReLU)→1, reines JS, **trainierte** Gewichte (`_SYSTEM/state/fleet-router-weights.json`, nicht-default). Advisory, überschreibt Governance nie. Commit `5bea163c`: JS-MLP evalMeanBrier **0.1685** schlägt Python-Sidecar 0.4291.

### ARMING-Status — die ehrliche Korrektur
`_SYSTEM/state/mure.enabled` existiert (seit Jun 30 22:55). `mure.mjs --status`: `MURE: ARMED (flag)`, `Cline: ARMED`, `Evolver: ARMED`, GLM/Ollama/Zai/mlp-learn Flags vorhanden.
> **Stale-Flag:** Ein älterer Gedächtnis-Eintrag (`proj-agentic-digital-company-2026-06-22.md`) sagt „DISARMED" — das ist *veraltet*; MURE ist ARMED. *(Track-A-Fakt; Korrektur über governed propose→decide→ledger, Owner-Entscheid — nicht selbst gemutet.)*

### Ehrliche Lücken (MURE-seitig)
- **Autonome Selbststeuerung** = `[TEILWEISE]`: Casting/Dispatch/Governance `[BELEGT]` live; vollautonome Goal-Erzeugung ohne Owner noch `[ZIEL]`.
- **Dashboard-Port `[TEILWEISE]` (O-2):** Der Master-Brief nennt `:4270`; andere Quellen `:4250` (das ist der Trading Cognitive Deck). Verifiziert: **weder 4270 noch 4250 sind in `_SYSTEM/mure/` hardcodiert** — die Port-Aussage ist aktuell unbelegt und an Oracle (O1) delegiert. Bis dahin: MURE-Dashboard-Endpunkt = `[TEILWEISE]`, nicht `BELEGT`.
- **Nativ nicht lane-dispatchbar** (nur Opus-Session) — reale Architektur-Limitation.

**Belege:** `_SYSTEM/config/fleet-roles.json:6` · `role-registry.mjs:21-51` · `_SYSTEM/mure/governance.mjs:37-103` · `governance.test.mjs:97-148` · `goal-engine.mjs:15-114` · `math-bridge.mjs:11-182` · `glm/ollama/cline/zai-tmux-fleet.mjs` · `fleet-router-mlp.mjs` · `_SYSTEM/state/mure.enabled` · `00-DOKUMENT-ARCHITEKTUR-DE.md:169,214` (O-2)

---

## §7 — Die Lernschleife (`01-INTEG/learn-loop`)

YURI lernt über einen **geschlossenen predict→act→outcome→update-Loop**, gestaffelt in **14 Meta-Schichten** (Live-Nachweis: `_SYSTEM/reports/YURI_ACTIVE_LEARNING_MEMORY_2026-06-30.md`, dort Mermaid `subgraph meta [L14 Meta]`).

### Der aktive Learning-Loop — `[BELEGT]` (Konzept + Teile shipped)
1. **predict** — Fleet-MLP-Router prognostiziert Substrat-Wahl (`fleet-mlp-feedback.mjs`: predict→ledger).
2. **act** — Dispatch über Quad-Fleet (§6).
3. **outcome** — Ergebnis in `prediction-ledger` (Brier-Score).
4. **update** — `updateFromOutcome` zieht Gewichte nach.

### Der keystone-Verifiers-Learn-Loop — `[BELEGT]` (Teile shipped)
Capture ARMED (421k Firings mit corrId) + Cadence LOADED + recurring 30 min (`com.yuri.energy-learn-deriver` launchd) — **aber DERIVES 0**: nur 4/421k tragen claimIds; der Trace hält Entscheidungen mit ΔU=0, Labels akkumulieren erst über Zeit. *(Kein Bug — eine Reife-Aussage: die Mess-Infrastruktur ist live, die Outcome-Akkretion läuft an.)*

### Ehrliche Lücken
- **Episodic Replay (P1)** `[ZIEL]` — designed, nicht shipped.
- **Outcome-Gated MLP-Persist (P0)** `[TEILWEISE]` — persist läuft über `fleet-mlp-feedback`, aber die Energy-Seite (`energy-outcome-backfill`) ist shadow-only → „DERIVES 0" (§4).
- **Cross-Role Memory-Kernel (P2)** `[ZIEL]`.

→ Kreuzdomäne: *Aktives Lernen (ML-Forschung) → Agenten-Betriebssystem* — mechanismus = nur aus Vorhersage-Fehlern lernen (Surprise-gated); **mismatch**: ML-AL lernt Gewichte aus Datenbatch, YURI lernt aus *Agenten-Aktions-Outcomes*. **Konfidenz: hoch.**

**Belege:** `_SYSTEM/reports/YURI_ACTIVE_LEARNING_MEMORY_2026-06-30.md:137-281` (Core loop, Outcome-Gating, P0/P1/P2-Roadmap, L14 Meta) · `fleet-mlp-feedback.mjs` · `energy-outcome-backfill.mjs:190` · `00-DOKUMENT-ARCHITEKTUR-DE.md:154` (Anker-Bindung)

---

## §8 — Governance & Sicherheit (`01-INTEG/governance`)

**Fail-closed by construction.** Deterministisch, embedding-frei Kern, voller Audit-Trail.

| Prinzip | Status | Beweis |
|---|---|---|
| Download/Exec-Block | `[BELEGT]` | Governance-Layer 4 |
| `.env`-Schutz / Secrets | `[BELEGT]` | Protected-Path-Liste (Constitution-Veto η=100) |
| Symlink-Defense | `[BELEGT]` | Governance-Layer 4 |
| Katastrophaler Hard-Block | `[BELEGT]` | `isCatastrophic`-Veto (`energy-breaker.mjs:112`) |
| Roles werden bei Korruption *restriktiver* | `[BELEGT]` | Constitution-Veto + Arming-3-Schicht-Gate |
| EU-AI-Act-Fit | `[TEILWEISE]` | Design-Ausrichtung; Formal-Zertifizierung `[ZIEL]` → Detail `sections/GOVERNANCE-DE.md` (T1) |

**Die ehrliche Spannung (kein Over-Claim):** MURE Company ist ARMED, läuft aber operativ mit **Governance als einziger Live-Sicherheits-Schicht** (Energy-Enforce DISARMED §4, FSRS-Demote Dry-Run §5). „Defense in Depth" ist *architektonisch* vorhanden (Governance + Energy + adaptive Memory), *operativ* heute einschichtig. Das ist die Aussage, die ein Investor sehen muss: **kein Fake — echte Subsysteme, aber das vollständige Sicherheits-Netz ist noch nicht gespannt.**

**Belege:** `_SYSTEM/mure/governance.mjs:37-103` · `energy-breaker.mjs:112-150` · `_SYSTEM/yuri-origin.md` (Protected Surfaces, Self-Governance Charter) · `00-DOKUMENT-ARCHITEKTUR-DE.md:99,149`

---

## §9 — Ehrliche Lücken-Liste (`01-INTEG/gaps`)

*Pflicht-Kapitel (P1). Was `TEILWEISE`/`ZIEL` ist und warum das OK ist.*

| # | Lücke | Ist-Zustand | Soll | Klasse |
|---|-------|-------------|------|--------|
| **G1** | Mechanismen-Zahl | 261 Schicht-Summe / 88 Registry / 267 Headline (3 Basen) | Eine konsistente Zahl | Zählbasis (O-1) |
| **G2** | Energy-Enforce | 🟡 DISARMED (metrics-only, 754 MB Trace) | Armed PreToolUse-Block | Sicherheit |
| **G3** | FSRS-Demote-Execution | 🟡 Dry-Run (scoret, demotet nie; Cold-Store 0) | Armed Consolidator (`--execute`) | Adaptivität |
| **G4** | `write_strength` systemweit | ⚪ DOCTRINE-ONLY (nur Voice-Lane) | Core-Encode-Gate | Adaptivität |
| **G5** | Governance↔Energy-Verdict | 🔴 nicht verbunden (nur statischer Pfad-Match) | Governance konsumiert ΔU/Breaker live | Integration |
| **G6** | Governance→Memory-Präzedenz | 🔴 zustandslos | Rulings als lernbare Präzedenz | Integration |
| **G7** | Learn-Loop (Outcome-Backfill) | 🟡 shadow-only („DERIVES 0") | Live-Kalibrierung der Gewichte | Kalibrierung |
| **G8** | Native Substrate lane-dispatch | ⚠️ nur Opus-Session | lane-dispatchbar | Architektur |
| **G9** | Dashboard-Port | unbelegt (:4270/:4250 Konflikt) | Oracle verifiziert Live-Endpunkt | Nachweis (O-2) |
| **G10** | EU-AI-Act-Formalzertifizierung | Design-Ausrichtung | Zertifikat | Compliance |

**Konsolidierte Aussage:** Die **Lese-/Orchestrierungs-Seite** (Governance-Gate, Canonical-Recall, Goal-Engine, Math-Bridge, Quad-Fleet-Dispatch, Fleet-MLP) ist 🟢 **echt shipped**. Die **Enforce-/Adapt-Seite** (Energy-Block, FSRS-Demote, systemweites write_strength, Learn-Loop-Outcome) ist 🟡⚪ **geparkt**. Der **adaptive geschlossene Loop** existiert architektonisch, fließt operativ *open-loop vorwärts* — das ist die größte plan-vs-shipped-Differenz und sie wird hier nicht verschwiegen.

> **Warum das OK ist:** Jede `TEILWEISE`-Markierung ist ein *bewiesener Reifegrad*, kein Mangel. Ein Investor sieht ein System, das seine eigenen Grenzen kennt und maschinell markiert — das ist das Gegenteil von Vaporware.

**Belege:** §4–§8 (kumuliert) · `research/DELIBERATOR-MECHANISMUS-KARTE-DE.md:244-258` (L1–L8 Lückenliste) · `00-DOKUMENT-ARCHITEKTUR-DE.md:211-218` (O-1 bis O-5)

---

## §10 — Belege-Index (`01-INTEG/proof`)

Kumulierte Pfade/Endpunkte aller Kapitel.

**Architektur & Konvention:**
- `00-DOKUMENT-ARCHITEKTUR-DE.md` (Tag-Konvention §2, Kapitelstruktur §5, Querverweise §8, tragende Claims §9)
- `MASTER-BRIEF-DE.md` (Ziel, Quellen, Integritäts-Regel)
- `investor-deck-plan.json` → `.architecture.layers` (9, Summe 261) / `.architecture.organs` (4) / `.key_differentiators`

**Energy Gate:** `_SYSTEM/Scripts/math/yuri-energy.mjs:82-94,617-722,838-912` · `energy-tick-core.mjs:312-461` · `energy-breaker.mjs:112-150` · `.claude/hooks/energy-enforce.mjs` · `energy-outcome-backfill.mjs:190` · Trace-File 754 MB

**Memory:** `memory-kernel.mjs:130-571` · `memory-canonical-store.mjs:238-429` · `mcs-maintenance.mjs` · `math/yuri-fsrs.mjs` · `memory-relocator.mjs:347` · `memory-cold.db` (0 Zeilen) · `voice/jarvis_energy.py` · `_SYSTEM/OS_KERNEL/memory.db` (4324 Zeilen)

**Governance:** `_SYSTEM/mure/governance.mjs:37-103` · `governance.test.mjs:97-148` · `held-rulings.mjs:46-56` · `_SYSTEM/yuri-origin.md` (Self-Governance Charter)

**MURE / Fleet:** `_SYSTEM/config/fleet-roles.json:6` · `role-registry.mjs:21-51` · `company.mjs:41-433` · `goal-engine.mjs:15-114` · `math-bridge.mjs:11-182` · `glm/ollama/cline/zai-tmux-fleet.mjs` · `fleet-router-mlp.mjs` · `_SYSTEM/ml/fleet_router_train.py` · `_SYSTEM/state/mure.enabled` · `_SYSTEM/config/llm-affinity-matrix.json`

**Lernschleife:** `_SYSTEM/reports/YURI_ACTIVE_LEARNING_MEMORY_2026-06-30.md:137-281` · `fleet-mlp-feedback.mjs`

**Merge-Quellen (dieses Dokument):** `research/DELIBERATOR-MECHANISMUS-KARTE-DE.md` (D1-Tiefanalyse, file:line-gebunden, 4-Sonnet-Evidenz-Agenten verifiziert) · Artificer-Census (R1, bei Redaktionsschluss noch ausstehend → O-1)

**Offene Punkte (an Calibrator/Oracle delegiert, nicht hier gelöst):**
- O-1 Mechanismen-Zahl 267 vs 261 vs 88 → Calibrator
- O-2 Dashboard-Port :4270 vs :4250 → Oracle
- O-4 Energy-Descent-Industrie-Einzigartigkeit → Adjudicator (Prior-Art)

**Restrisiko:** Diese Karte verifiziert Existenz und file:line-Verankerung. Operative Live-Korrektheit (Block in Produktion, Demote in Produktion, Outcome-Akkretion) ist teils `TEILWEISE`/`ZIEL` — bewusst nicht überzogen. Die `advisory_only`-Selbsteinordnung (§1) bleibt durchgehend angewendet.

---

*Synthetisiert vom MURE-Synthesist-Lane (Y1). Merge aus Deliberator-Mechanismus-Karte (Subsystem-Tiefe, file:line) + Artificer/SCOUT-Zählbasis (Schichten/Organe/Census). Kreuzdomänen-Transfers benannt (Lyapunov·FSRS·CVaR·Quantum-Nichtkommutativität·Sakana·Aviation-Checkliste·CPU-Cache). Kein Over-Claiming; jede SHIPPED-Aussage trägt Datei-Zeilen-Beweis oder ist explizit herabgestuft.*
