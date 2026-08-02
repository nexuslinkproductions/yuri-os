# Loop Candidates — wiederholbare, skalierbare Engineering-Loops

Stand: 2026-07-29 · Zweck: Inventar der Loops, die nach Loop Discipline
(`_SYSTEM/yuri-origin.md`) tatsächlich betrieben werden können. Eine Loop ist
nur dann betreibbar, wenn sie einen **unveränderlichen Scorer** hat. Ohne
gefrorenen Scorer: erst Benchmark bauen, dann loopen.

Bewertungsraster je Kandidat: Ziel · Scorer (existiert/zu bauen) ·
Mutationsraum (was pro Iteration geändert wird) · Evidence (woher wir wissen,
dass der Loop etwas bringt) · Status.

---

## L1 · Freshness Cascade (betriebsbereit, bereits zweimal live bewiesen)

- **Ziel:** Kein Artefakt im System bleibt stale: nach jeder Änderung stimmen
  Registry, Manifeste und Scans wieder überein.
- **Scorer:** Pre-Commit-Gates selbst (deterministische Exit-Codes:
  skill registry, capability registry, root architecture, persona contract).
- **Mutationsraum:** Welche Artefakte auto-healbar sind (sicher regenerierbar)
  vs. nur meldepflichtig.
- **Evidence:** 2026-07-29, zwei reale Kaskaden in einer Session geheilt:
  skill-hash-registry (drift=1, unregistered=3 -> 0/0) kaskadierte in
  capabilities.json (289 caps stale -> regeneriert) -> voller Gate-Lauf `pass`.
- **Loop-Form:** Detect (staleness scan) -> Klassifizieren (auto-healbar?
  geteilt mit paralleler Session?) -> Regenerieren oder melden -> Gate grün.
- **Status:** BETRIEBSBEREIT. Nächster Schritt: periodischer Detect-Lauf
  (cron/widget task) statt Entdeckung bei Commit-Zeit.

## L2 · Persona/Instruction Behavioral Loop (dieser PR seedet den Scorer)

- **Ziel:** Instruktionsänderungen (Kürzung, Umstellung, neue Regeln) werden an
  Verhaltens-Output gemessen statt am Bauchgefühl.
- **Scorer:** `_SYSTEM/Scripts/eval/persona-behavioral/` (Rubric 1.0.0,
  40 Cases, 6 Dimensionen, Selftest 40/40 diskriminierend). GT-Ratification
  durch Owner ausstehend.
- **Mutationsraum:** persona.md-Arme (voll/komprimiert), Adapter-Texte,
  Prompt-Assemblies. Single-Knob pro Iteration.
- **Evidence:** Arm-A/B/C-Vergleiche im append-only Log; Score = Pass-Rate
  gesamt + je Dimension.
- **Status:** SCORER GEBAUT (draft). Fehlt: Owner-Ratification, Baselines.

## L3 · Skill-Recall Quality Loop

- **Ziel:** `skill-recall.mjs` findet fuer eine Aufgabe die richtigen Skills —
  Top-N-Praezision steigt ueber Iterationen.
- **Scorer (zu bauen):** Query->Expected-Skill-Set (Owner-GT, ~50 Anfragen),
  Metrik: Recall@5 / MRR.
- **Mutationsraum:** Ranking-Gewichte, Index-Felder, Trigger-Tabellen.
- **Evidence:** aktuell kein Mass; tool laeuft (Verifikation 2026-07-29 nach
  Registry-Heilung).
- **Status:** BENCHMARK FEHLT. Erst GT-Set, dann loop-improvable.

## L4 · Energy-Gate Calibration Loop

- **Ziel:** Die Kalibrierung der Energy-/Routing-Prognosen verbessert sich
  messbar (Brier sinkt gegenueber Baseline).
- **Scorer:** Prediction-Ledger + Brier-Score (existiert bereits;
  Referenzwert intern: 0,17 vs. Baseline 0,43).
- **Mutationsraum:** Gewichte der Energy-Terme (12 Terme), Schwellenwerte —
  aber NIE die Ledger-Auswertung selbst (frozen).
- **Evidence:** Live-Trace (Energy-Trace pro Gate-Entscheidung).
- **Status:** SCORER EXISTIERT. Loop selbst noch nicht formal beschrieben;
  Risiko: Term-Gewichte sind zugleich Governance-Oberflaeche -> Owner-Gate
  pro Iteration.

## L5 · xref Navigation Quality Loop

- **Ziel:** `xref-query.mjs` liefert fuer bekannte Fragen die richtigen Pfade
  in den Top-Ergebnissen.
- **Scorer (zu bauen):** Known-Answer-Set (Frage -> erwartete Pfade,
  Owner-GT), Metrik: Hit@k.
- **Mutationsraum:** Provenance-Gewichte, FTS-Felder, Spectrum-Mischung.
- **Evidence:** taeglich genutzt; Fehlerfaelle sichtbar, wenn Agenten
  "nichts finden".
- **Status:** BENCHMARK FEHLT.

## L6 · Lane Canary / Provider Route Health Loop

- **Ziel:** Route-Registry spiegelt echte Verfuegbarkeit: Canary-proven bleibt
  wahr, quota-blocked wird schnell erkannt und gehoben, sobald frei.
- **Scorer:** Canary-Pass-Rate je Route (Registry hat Canary-Infrastruktur).
- **Mutationsraum:** Canary-Frequenz, Retry-/Backoff-Policy,
  Re-Admission-Kriterien.
- **Evidence:** Terra quota-blocked (Dokumentation), DeepSeek-Runner
  retired-til-proven; Health-Status zeigt 20 Lanes, 0 aktive Crash-Zaehler
  (2026-07-28).
- **Status:** TEILWEISE BETRIEBSBEREIT (Scorer via Canary), Formalisierung fehlt.

---

## Prioritaet (Empfehlung)

1. **L2 abschliessen** (Ratification + drei Baselines): hoechster Hebel,
   weil jede weitere Instruktionsarbeit sonst ungemessen bleibt.
2. **L1 periodisieren**: billig, sofort nutzbar, verhindert Drift wie den
   geheilten vom 2026-07-29 strukturell statt zufaellig.
3. **L3/L5 GT-Sets**: je eine halbe Session Owner-Zeit; danach zwei weitere
   Subsysteme loop-faehig.
4. **L4/L6 formalisieren**, sobald L2 bewiesen hat, dass das Protokoll traegt.

Jeder Loop, der produktiv geht, bekommt einen eigenen PR mit: Scorer-Verweis,
Baseline, Iterationslog-Adresse, Owner-Gate-Definition. Nichts davon laeuft
auf main; alles auf Scratch-Branches mit append-only Logs.
