# Persona Behavioral Eval — gefrorener Scorer für das Instruction-System

Status: **Seed (draft für Owner-Review)** · Rubric-Version: `1.0.0` · Stand: 2026-07-29

## Zweck

Das globale Instruction-System (origin, persona, Adapter) ist nach der Konsolidierung
(PR #16) auf eine Quelle reduziert. Die nächste Frage ist nicht mehr "ist es kürzer",
sondern **"macht es das Verhalten besser"**. Nach Loop Discipline gilt: ein Subsystem
ist genau dann loop-verbesserbar, wenn es einen unveränderlichen Scorer hat. Dieser
Ordner liefert diesen Scorer für das Verhaltens-Subsystem Persona/Instruktionen.

Damit werden Entscheidungen wie "Mythologie-Teile der persona.md kürzen" von
Geschmacksfragen zu Messungen: Arm A (volle persona) gegen Arm B (gekürzte persona),
gleiche Cases, gleiche Rubrik, Append-only-Log.

## Nicht delegierbar (Loop Discipline)

Benchmark-Ground-Truth ist **Owner-Urteil**. Alle 40 Cases stehen deshalb auf
`gt.status: "proposed"`. Workflow:

1. Marcel reviewed `cases.jsonl` Zeile für Zeile (Prompt, Checks, Dimension).
2. Freigegebene Cases werden auf `"ratified"` gesetzt (kleiner Edit-Commit,
   eigenes Review, kein stiller Wechsel).
3. Erste Runs nur mit `--only ratified`. Proposed-Cases dienen als Sichtkandidaten.

## Was der Scorer misst (6 Dimensionen, 40 Cases)

| Dimension | Verhalten, das gemessen wird | Cases |
|---|---|---|
| `slop_freedom` | Keine Floskel-Openers, keine Fuellsel-Gedankenstriche, keine Kompliment-Reflexe | 7 |
| `evidence_separation` | Behauptung vs. Beleg getaggt; zeitkritische und lokale Fragen an Evidenz geroutet | 7 |
| `decode_accuracy` | Vergrabene Frage im Brain-Dump getroffen, Rauschen geparkt, Reihenfolge respektiert | 7 |
| `challenge_once` | Schwache Praemisse genau einmal mit Beleg herausgefordert, kein Ja-Sagen, keine Norgelschleife | 6 |
| `safety_rails` | Protected Surfaces, Hard Rails, Freigabe-Gates: Stoppen statt Mitmachen | 7 |
| `salience_routing` | Terse Input -> kurze Antwort; explizite Tiefenwuensche -> volle Tiefe | 6 |

## Warum deterministisch und nicht LLM-as-Judge

Der gefrorene Kern bewertet nur String-/Regex-Checks, Zaehl- und Laengenbaender.
Ein LLM-Juror waere durch die Prosa des Subjekts selbst bestechlich und
nicht reproduzierbar. Spaetere semantische Erweiterungen (z. B. Decode-Qualitaet
jenseits von Keywords) gehoeren in eine **separate, ebenfalls versionierte** Rubrik,
nie in den gefrorenen Kern.

## Konstruktvaliditaet (vor dem Score die Fragen lesen)

- Die Checks belohnen das distinktive Verhalten des Systems (Anti-Slop,
  Evidence-Tagging, Challenge-once, Safety-Stopps). Ein generisches Modell
  ohne diese Instruktionen sollte messbar schlechter abschneiden.
- `runner.mjs --selftest` synthetisiert pro Case eine GT-konforme und eine
  GT-verletzende Antwort: 40/40 muessen diskriminieren (PASS bzw. FAIL),
  sonst ist die Rubrik defekt. Aktueller Stand: **40/40**.
- Bekannte Blindleflecke (bewusst behalten): keyword-basierte Decode-Checks
  koennen durch zufaellige Keyword-Nennung ohne echtes Verstaendnis bestanden
  werden; `challenge_once` misst Marker, nicht Ueberzeugungskraft. Diese
  Cases bleiben im Set, weil sie reale Blind Spots zeigen — ein auf
  gewinnbare Fragen gestutztes Benchmark hoert auf zu berichten, wo das
  System blind ist.

## Repair-Regel (Construct-Validity)

Aenderungen an `rubric.mjs` oder an ratified Cases sind Construct-Validity-Events:
`RUBRIC_VERSION` hoch, alle Arme neu baselinen, Serienbruch im Log vermerken.
Der Test fuer legitime Reparatur vs. Betrug: laesst sich die Aenderung aus
Prinzipien begruenden, **ohne Bezug darauf, welche Fragen gerade fehlschlagen**.

## Bedienung

```bash
# Schema- und GT-Integritaet
node _SYSTEM/Scripts/eval/persona-behavioral/runner.mjs --validate

# Diskriminations-Smoke des Scorers (vor jedem Vergleichslauf Pflicht)
node _SYSTEM/Scripts/eval/persona-behavioral/runner.mjs --selftest

# Lauf gegen ein Subjekt (Prompt auf stdin, Antwort auf stdout)
node _SYSTEM/Scripts/eval/persona-behavioral/runner.mjs \
  --run --subject <lane-command> --only ratified --run-id baseline-arm-a
```

Ergebnislog (append-only, niemals ueberschrieben):
`_SYSTEM/state/eval/persona-behavioral/results.jsonl` — eine Zeile pro Case mit
runId, subject, rubricVersion, pass, failedChecks (bounded), Response-SHA256 und
180-Zeichen-Excerpt. Volle Antworten werden nicht geloggt.

## Vergleichsprotokoll (Arm A gegen Arm B)

1. Scratch-Branch, nie main.
2. Pro Arm: `--selftest` gruen, dann `--run` mit fester `--run-id`.
3. Score = Pass-Rate gesamt + Pass-Rate je Dimension (nicht nur die Zahl lesen:
  welche Dimension kippt?).
4. Single-Knob-Regel: eine Aenderung pro Vergleich, sonst ist die Attribution weg.
5. Ergebnis ins Log, Entscheid dokumentiert (keep/revert + Begruendung).

## Roadmap

- [ ] Owner-Ratification der 40 Cases (proposed -> ratified)
- [ ] Baseline Arm A: volle persona.md (Stand nach PR #16)
- [ ] Baseline Arm B: komprimierte persona.md (Mythologie reduziert, Mechanik erhalten)
- [ ] Baseline Arm C (Kontrolle): generisches Subjekt ohne YURI-Instruktionen
- [ ] Erweiterte Cases aus realen Fehlverhalten (jeder beobachtete Fehlgriff wird eine Case)
