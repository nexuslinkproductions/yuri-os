# 00 — Dokumentarchitektur AMS-2026 (DE)

> **Rolle:** Architekt (MURE) · **Substrat:** glm-max · **Task:** WS-AMS-A1
> **Mission:** Kapitelstruktur, Querverweise und Investoren-Narrativbogen für `01-INTEGRITAET`, `02-VISION`, `03-BUSINESSPLAN` definieren. **Nur Skelett** — der Inhalt wird von Synthesist (Y1), Chronicler (C1/B1) gefüllt.
> **Quellen:** `MASTER-BRIEF-DE.md`, `investor-deck-plan.json` (layers/organs/financial/token_savings), `mure-ams-vision-de-gesamt.json` (Dispatch-Graph), `_SYSTEM/yuri-origin.md`.
> **Selbsteinordnung:** Architektur-Claim. Behauptungen hier sind meta (Struktur, nicht Produkt) und trotzdem getaggt.

---

## 1. Architektur-Prinzipien (bindend für alle drei Dokumente)

| # | Prinzip | Bedeutung für die Kapitel |
|---|---------|---------------------------|
| P1 | **Ehrlichkeit > Hype** | Jedes produktive Kapitel trägt mind. eine `TEILWEISE`/`ZIEL`-Markierung. Ein reines `BELEGT`-Dokument ist verdächtig (over-claim). |
| P2 | **Beleg-Pflicht** | Keine substanzhaltige Behauptung ohne Tag (`[BELEGT]`/`[TEILWEISE]`/`[ZIEL]`). Adjudicator (J1) weist ungetagte Behauptungen zurück. |
| P3 | **Tragende vs. dekorative Claims** | Tragende Behauptungen (§9) müssen `BELEGT` sein oder das Narrativ kollabiert. Dekorative dürfen `ZIEL` sein. |
| P4 | **Eine Through-Line** | Alle drei Dokumente hängen an einem einzigen Narrativbogen (§4). Kapitel, die den Bogen nicht bedienen, werden gekürzt. |
| P5 | **Komposition vor Neubau** | Kapitel referenzieren bestehende `sections/` und `research/`-Artefakte statt Inhalt zu duplizieren (§8, §9). |
| P6 | **PDF-Tauglichkeit** | Kapitelgrenzen = Seitengrenzen-Kandidaten für `04-PRAESENTATION-DE.html` (Engineer N1). Jedes Kapitel muss als eigenes Folien-Set stehen können. |

---

## 2. Integritäts-Tag-Konvention (Interface-Vertrag)

Dies ist die **einzige verbindliche Konvention**. Alle nachgelagerten Rollen (Y1, C1, B1, J1, L1) konsumieren sie identisch.

### 2.1 Behauptungs-Tags

| Tag | Definition | Beleg-Standard |
|-----|------------|----------------|
| `[BELEGT]` | Im Repo/`Live-Nachweis` verifizierbar. | Dateipfad + Zeile/Commit, oder laufender Dienst-Endpunkt. |
| `[TEILWEISE]` | Mechanismus existiert, aber Anwendung/Skalierung/Integration offen. | Pfad zur Implementierung + benannte Lücke. |
| `[ZIEL]` | Absichtserklärung, noch nicht implementiert. | Referenz auf Plan/Roadmap (`*.md`/Plan-Handle). |

### 2.2 Stabile Anker-IDs (Querverweis-Basis)

Format: `<DOC>/<kebab-slug>`. Beispiel: `01-INTEG/layer-energy-math`.

- `<DOC>` ∈ {`01-INTEG`, `02-VIS`, `03-BP`}.
- Slug = kleinbuchstaben, Bindestrich, sprechend (nicht nummeriert — Nummern drift-en).
- Markdown-Anker im Dokument: `## 2.1 Energy & Math` → ID `#21-energy--math`; **Querverweise nutzen den logischen Anker** (`→ 01-INTEG/layer-energy-math`), Engineer (N1) mappt logisch→HTML.

### 2.3 Beleg-Fußnote

Jedes Kapitel endet mit einem `**Belege:**`-Block: Liste der Pfade/Endpunkte, die die Tags in diesem Kapitel stützen. Leerer Beleg-Block bei `BELEGT`-Behauptung = Adjudicator-FAIL.

---

## 3. Lieferumfang & Datei-Vertrag (Architekt-Vorgabe)

| Datei | Produziert von | Input (erwartet) | Output (versprochen) |
|-------|----------------|------------------|----------------------|
| `01-INTEGRITAET-YURI-DE.md` | Y1 (Synthesist) | `research/SCOUT-*`, `research/DELIBERATOR-*` | Vollständige Integritätskarte (§5) |
| `02-VISION-DE.md` | C1 (Chronicler) | `investor-deck-plan.json`, `nexus-link-investor-deck-v2.html` | Ideologie + Differenzierung (§6) |
| `03-BUSINESSPLAN-DE.md` | B1 (Chronicler) | `02-VISION`, `sections/FINANZEN`, `sections/TOKEN-OEKONOMIE`, `sections/GOVERNANCE` | Vollständiger Businessplan (§7) |
| `04-PRAESENTATION-DE.html` | N1 (Engineer) | 01 + 02 + 03 | Druckfähiges DE-Deck |
| `NEXUS-LINK-YURI-AMS-DE.pdf` | M1 (Mechanic) | `04-PRAESENTATION-DE.html` | Finale PDF |

**Schnittstellen-Disziplin:** B1 darf erst starten, wenn `02-VISION` + die drei `sections/` vorliegen (→ §10 Abhängigkeitsgraph). C1 wartet auf keine Integritäts-Inputs (parallelisierbar zu Y1).

---

## 4. Investoren-Narrativbogen (die Through-Line)

Vier-Akt-Bogen, abgeleitet aus dem AMS-Kontext ("Tiefe + Ehrlichkeit > Hype"). Jedes der drei Dokumente bedient eine Teilstrecke.

```
AKT 1 — VERTRAUEN          AKT 2 — SUBSTANZ          AKT 3 — WERTSCHÖPFUNG      AKT 4 — ENTSCHEIDUNG
(Wer seht ihr?)            (Was ist wirklich da?)     (Warum zahlt sich das aus?) (Was kostet der Einstieg?)
     │                           │                          │                          │
  02-VISION ─────────────► 01-INTEGRITAET ─────────► 03-BUSINESSPLAN ──────────► 03-BP / Finanzen
  (Öffner, Tone)          (Beweis-Last)             (Markt+Modell)             (Ask, Use-of-Funds)
```

| Akt | Frage des Investors | Bedient durch | Emotionaler Vertrag |
|-----|---------------------|---------------|---------------------|
| **1 Vertrauen** | "Kann ich diesen Leuten glauben?" | `02-VISION` Eröffnung | Ehrliche Tone-Setzung; kein Hype-Versprechen. |
| **2 Substanz** | "Ist das echt oder Vaporware?" | `01-INTEGRITAET` (Hauptlast) | Beleg-dichte Karte; `TEILWEISE`/`ZIEL` zeigen Reife. |
| **3 Wertschöpfung** | "Wo ist der Hebel, der skaliert?" | `03-BP` Markt + Modell + Token-Ökonomie | Mechanismus → Geld-Übersetzung. |
| **4 Entscheidung** | "Was müsst ihr, und was kriege ich?" | `03-BP` Finanzen + Roadmap | Konkrete EUR-Zahlen, Phasen, Meilensteine. |

**Wichtig:** Die Lese-Reihenfolge (02→01→03) ist **nicht** die Deck-Reihenfolge. Das finale Deck (`04`) darf umsortieren; die *logische* Beweis-Kette bleibt: Vision öffnet → Integrität beweist → Businessplan monetarisiert. Engineer (N1) erhält Freiheit für die Folien-Ordnung unter Wahrung der Bogen-Last.

---

## 5. Dokument `01-INTEGRITAET-YURI-DE.md` — Kapitelstruktur

**Besitzer:** Y1 (Synthesist). **Ziel:** Beweis-Dichte. **Länge:** 8–12 Seiten-Äquivalent.

| § | Kapitel | Anker | Inhalt (Vorgabe) | Primär-Tag-Erwartung |
|---|---------|-------|------------------|----------------------|
| 1 | Einleitung: Was "Integrität" hier heißt | `01-INTEG/intro` | Definition: nicht Moral, sondern *Nachweisbarkeit*. Tag-System erklären. | `BELEGT` (Konvention) |
| 2 | Die Schichten-Architektur (9 Layer) | `01-INTEG/layers` | Pro Layer: Name + count + description + je 1–2 Beispiel-Mechanismen m. Pfad. Layer aus `plan.json.architecture.layers`. | `BELEGT` (Existenz) / `TEILWEISE` (Reifegrad pro Mechanismus) |
| 3 | Die Organe (Spine, Brain, Conscience, Memory) | `01-INTEG/organs` | Pro Organ: Beschreibung + `investor_value`. 4 Organe aus `plan.json.architecture.organs` (verifiziert): Spine, Brain, Conscience (Energy Instrument), Memory. | `BELEGT` |
| 4 | Das Energy Gate (Math-Beweis) | `01-INTEG/energy-gate` | Lyapunov-Energie, 9-Term-Komposition, nicht-offsettbare Vetos. *Das* Differenzierungs-Organ. | `BELEGT` (Funktion) / `ZIEL` (Live-Sizing in Produktion) |
| 5 | Gedächtnis (2-Track + FSRS) | `01-INTEG/memory` | Track A/B, propose→decide→ledger, FSRS-Vergessen, kanonischer Store. | `BELEGT` |
| 6 | MURE — die lebendige Company | `01-INTEG/mure` | 20 Rollen / 6 Gruppen, 6-Gate-Charter, Quad-Substrat-Fleet (zai/ollama/cline/native). **Live-Demo-Wert.** | `BELEGT` (Archetypen+Governance) / `TEILWEISE` (autonome Selbststeuerung) |
| 7 | Lernschleife (14 Schichten) | `01-INTEG/learn-loop` | Decoder→AFL_LEDGER→Reeval→Graduation. Verweis auf `_SYSTEM/reports/YURI_ACTIVE_LEARNING_MEMORY_2026-06-30.md`. | `BELEGT` |
| 8 | Governance & Sicherheit | `01-INTEG/governance` | Verweis auf `sections/GOVERNANCE-DE.md` (T1). Fail-closed, EU-AI-Act-Fit. | `BELEGT` |
| 9 | Ehrliche Lücken-Liste | `01-INTEG/gaps` | Was `ZIEL`/`TEILWEISE` ist und warum das OK ist. **Pflicht-Kapitel (P1).** | `ZIEL` / `TEILWEISE` |
| 10 | Belege-Index | `01-INTEG/proof` | Kumulierte Pfade/Endpunkte aller Kapitel. | — |

---

## 6. Dokument `02-VISION-DE.md` — Kapitelstruktur

**Besitzer:** C1 (Chronicler). **Ziel:** Tone + Differentiation. **Länge:** 4–6 Seiten-Äquivalent.

| § | Kapitel | Anker | Inhalt (Vorgabe) | Primär-Tag |
|---|---------|-------|------------------|------------|
| 1 | NEXUS LINK — die Ideologie | `02-VIS/ideologie` | Extension-not-competitor zu Anthropic/OpenAI/NVIDIA. Warum diese Positionierung. | `BELEGT` (Positionierung) |
| 2 | YURI in einem Satz | `02-VIS/one-liner` | Präziser, nicht-hypiger One-Liner. | `BELEGT` |
| 3 | YURI für einen Teenager erklärt | `02-VIS/teenager` | Accessible-Frame; ohne Fachjargon. | — (narrativ) |
| 4 | Was es NICHT ist | `02-VIS/was-nicht` | Abgrenzung: kein Frontend-Framework, kein Model-Training-Konkurrent, kein Chatbot. | `BELEGT` |
| 5 | Was es IST | `02-VIS/was-ist` | Das Betriebssystem für agentische Integrität. Verweis `→ 01-INTEG`. | `BELEGT` |
| 6 | Differenzierung vs. Wettbewerb | `02-VIS/diff` | Matrix: YURI vs. reine Agent-Frameworks vs. reine Model-Anbieter. | `TEILWEISE` (Reifegrad) |
| 7 | Wohin (Richtung, nicht Termin) | `02-VIS/richtung` | Visionär, aber datumsscheu. Verweis `→ 03-BP` Roadmap. | `ZIEL` |

---

## 7. Dokument `03-BUSINESSPLAN-DE.md` — Kapitelstruktur

**Besitzer:** B1 (Chronicler). **Ziel:** Monetarisierung + Ask. **Länge:** 15+ Seiten-Äquivalent.

| § | Kapitel | Anker | Inhalt (Vorgabe) | Primär-Tag |
|---|---------|-------|------------------|------------|
| 1 | Executive Summary | `03-BP/exec` | 1 Seite: Wer, Was, Wieviel, Warum-jetzt. Verweis auf 02+01. | `BELEGT` |
| 2 | Markt & Opportunity | `03-BP/markt` | TAM/SAM/SOM aus `plan.json.market`. DACH-Fokus (Nexus-Link-Vertrieb). | `TEILWEISE` (Marktdaten) |
| 3 | Geschäftsmodell | `03-BP/modell` | Wie Geld fließt. Verweis `→ sections/TOKEN-OEKONOMIE`. | `TEILWEISE` / `ZIEL` |
| 4 | Wettbewerb & Positionierung | `03-BP/wettbewerb` | Vertiefung von `02-VIS/diff` mit Business-Brille. | `TEILWEISE` |
| 5 | Go-to-Market & Vertrieb | `03-BP/gtm` | Atilla-Vertriebskanal (Nexus-Link), Mike-Partnership. | `ZIEL` (PARKED-Punkte klar markieren) |
| 6 | Token-Ökonomie (Kostenvorteil) | `03-BP/token` | Verweis `→ sections/TOKEN-OEKONOMIE-DE.md` (K1). 38% verifiziert. | `BELEGT` (38%) / `TEILWEISE` (Jahresprojektion) |
| 7 | Finanzen & Use-of-Funds | `03-BP/finanzen` | Verweis `→ sections/FINANZEN-DE.md` (Q1). EUR 250K, Phase 0–2. | `BELEGT` (Budget) / `ZIEL` (Returns) |
| 8 | Roadmap & Phasen | `03-BP/roadmap` | Phase 0 (45K) / 1 (100K) / 2 (105K) + Meilensteine. | `BELEGT` (Plan) / `ZIEL` (Ergebnisse) |
| 9 | Team & Governance | `03-BP/team` | Marcel + Mike, 6-Gate-Charter, EU-AI-Act-Fit. Verweis `→ sections/GOVERNANCE`. | `BELEGT` |
| 10 | Risiko & ehrliche Annahmen | `03-BP/risiko` | Pflicht-Kapitel (P1): Parked-Branches, Abhängigkeiten, Pricing-TBD. | `TEILWEISE` / `ZIEL` |
| 11 | Der Ask | `03-BP/ask` | Konkreter Bedarf, Gegenleistung, nächste Schritte. | `BELEGT` (Bedarf) |

---

## 8. Querverweis-Matrix

Logische Anker, die **muss-konsistent** zwischen Dokumenten sein. Adjudicator (J1) prüft diese Tabelle.

| Von | Nach | Zweck | Wann gesetzt |
|-----|------|-------|--------------|
| `02-VIS/was-ist` | `01-INTEG/intro` | Vision→Beweis-Übergang (Akt1→Akt2) | C1 setzt, Y1 bestätigt Anker |
| `01-INTEG/mure` | `03-BP/exec` | Live-Demo-Wert→Ask-Plausibilität | Y1 setzt |
| `01-INTEG/governance` | `sections/GOVERNANCE-DE.md` | Detail ausgelagert | Y1 referenziert |
| `03-BP/finanzen` | `sections/FINANZEN-DE.md` | Zahlen ausgelagert | B1 referenziert |
| `03-BP/token` | `sections/TOKEN-OEKONOMIE-DE.md` | Token-Detail ausgelagert | B1 referenziert |
| `02-VIS/diff` | `03-BP/wettbewerb` | Vision→Business-Vertiefung | C1 setzt, B1 aufnehmend |
| `02-VIS/richtung` | `03-BP/roadmap` | Vision→konkrete Roadmap | C1 setzt |
| `01-INTEG/learn-loop` | `_SYSTEM/reports/YURI_ACTIVE_LEARNING_MEMORY_2026-06-30.md` | Live-Nachweis 14 Schichten | Y1 referenziert |

**Konflikt-Regel:** Bei Anker-Kollision entscheidet der **Inhalts-Produzent** (Y1/C1/B1), der Architekt nur bei Struktur-Bruch.

---

## 9. Tragende Behauptungen (Corner-Law-Audit)

Analog zur Corner-Law-Prüfung affine/simplex: welche Claims sind **tragend** — fällt einer aus, kollabiert der Bogen. Diese **müssen** `BELEGT` werden oder das Narrativ bricht. Calibrator (L1) priorisiert diese.

| Tragende Behauptung | Bogen-Akt | Beleg-Status lt. `plan.json` (Architekt-Lese) | Risiko |
|---------------------|-----------|-----------------------------------------------|--------|
| **"267 Mechanismen"** | 2 Substanz | Layer-Summe = 28+27+28+28+32+31+28+28+31 = **261**, nicht 267. | ⚠ Delta 6. Calibrator muss klären (Zählbasis: Layer vs. @capability-Tags). Bis dahin: **261–267 [TEILWEISE]**. |
| **38% Token-Einsparung** | 3 Wertschöpfung | `token_savings.verified_data`: ~45K→~28K = 38%. | ✅ `BELEGT` (Session). Jahresprojektion USD = `TBD` → `TEILWEISE`. |
| **Energy-Descent einzigartig** | 2 Substanz | Organ-3 `investor_value` behauptet Industrie-Einmaligkeit. | ⚠ "Einzige disclosed" — hart. Adressiert von Adjudicator (Prior-Art). Bis dahin `TEILWEISE`. |
| **MURE live** | 2/3 | 20 Rollen `BELEGT`; autonome Selbststeuerung `TEILWEISE`; Dashboard lt. Brief `:4270`. | ⚠ Dashboard-Port-Konflikt: Brief=`:4270`, sonstige Quellen `:4250` (Trading). **Oracle prüft, welcher gemeint.** |
| **Quad-Substrat-Fleet** | 2 Substanz | zai/ollama/cline/native. | ✅ `BELEGT` (lt. Session-Commits). |

> **Architekt-Empfehlung:** Die "267"-Zahl und das Dashboard-Port sind die zwei Klippen. Erstere auf "261+Mechanismen-in-9-Schichten [BELEGT] + Erweiterungspfad [TEILWEISE]" umformulieren; letztere von Oracle verifizieren lassen, bevor sie in den Businessplan wandert.

---

## 10. Kompositions- & Abhängigkeitsgraph

Welche MURE-Rolle speist welches Kapitel. **P5: Komposition vor Neubau.**

```
research/SCOUT-INTEGRITAET-ROHDATEN (S1)  ┐
research/DELIBERATOR-MECHANISMUS-KARTE(D1)┴─► 01-INTEGRITAET (Y1)
research/ARTIFICER-CENSUS (R1) ────────────► Calibrator (L1) für "267"
research/IDEATOR-WINKEL (I1) ──────────────► 02-VISION-Winkel (C1, optional)

sections/FINANZEN-DE (Q1)        ┐
sections/TOKEN-OEKONOMIE-DE (K1) ├─► 03-BUSINESSPLAN (B1)  [benötigt auch 02-VISION fertig]
sections/GOVERNANCE-DE (T1)      ┘

01 + 02 + 03 ─► 04-PRAESENTATION (N1) ─► PDF (M1)
alle ─► review/ADJUDICATOR (J1) ─► review/ORACLE (O1) ─► review/CALIBRATOR (L1) ─► INDEX (V1)
```

**Kritischer Pfad:** S1→D1→Y1 (`01-INTEGRITAET`) und Q1→B1 (`03-BP` nach C1). C1 (`02-VISION`) ist der freie Pfad — parallel, blockiert nichts.

---

## 11. Qualitätsbar & Abnahme-Gate

Oracle (O1) akzeptiert nur, wenn **alle** erfüllt:

1. **Existenz:** `01-INTEGRITAET`, `02-VISION`, `03-BUSINESSPLAN`, `04-PRAESENTATION-DE.html` vorhanden.
2. **Tag-Abdeckung:** Jedes substanzhaltige Kapitel trägt mind. ein Tag; jedes Dokument hat ≥1 `TEILWEISE`/`ZIEL` (P1).
3. **Anker-Konsistenz:** Alle Querverweise aus §8 resolve-en (Adjudicator).
4. **Tragende Claims:** §9-Liste ist `BELEGT` oder explizit herabgestuft (Calibrator).
5. **Beleg-Blöcke:** Kein leeres `**Belege:**` bei `BELEGT`.
6. **Sprache:** Deutsch, investoren-tauglich, kein unbelegtes Marketing-Blabla.

---

## 12. Offene Punkte (für Adjudicator / Calibrator / Oracle)

- **O-1** "267 vs 261 Mechanismen" — Zählbasis klären (Layer-Summe vs. @capability-Scan vs. `INDEX.md`). → Calibrator.
- **O-2** Dashboard-Port `:4270` (Brief) vs. `:4250` (sonst) — welches ist der Live-Nachweis? → Oracle.
- **O-3** Jahres-Token-Projektion USD = `TBD` im `plan.json` — für Investor zwingend; Q1/K1 muss Annahme treffen. → Quartermaster/Kernelsmith.
- **O-4** "Energy-Descent einzigartig in der Industrie" — Prior-Art-Check. → Adjudicator.
- **O-5** Nexus-Link-PARKED-Abhängigkeiten (Atilla-Inputs) — wie im Businessplan gehandhabt? → B1.

---

**Belege (Architekt):**
- `MASTER-BRIEF-DE.md` (Ziel, Deliverable-Tabelle, Integritäts-Regel, Quellen)
- `investor-deck-plan.json` → `.architecture.layers` (9 Layer, counts), `.architecture.organs` (≥5), `.financial` (EUR 250K, Phase 0–2), `.token_savings.verified_data` (38%)
- `mure-ams-vision-de-gesamt.json` (Rollen→Kapitel-Mapping, §10)

**Restrisiko:** Architektur-Blueprint; inhaltliche Korrektheit obliegt Y1/C1/B1. §9-Offene-Punkte sind ungelöste Beleg-Lücken, nicht Architektur-Fehler — sie sind explizit an Calibrator/Oracle delegiert.

## 13. Status-Update (2026-07-06)

**Verschoben:** `04-PRAESENTATION-DE.html` wurde nie in einem Repo committed (lag nur unter `~/Downloads`). Es lebt jetzt kanonisch in `YURI-BUSINESS/02_RESOURCES/INVESTOR-DECK/AMS-2026/04-PRAESENTATION-DE.html` (Branch `ai-business`, selbes zugrundeliegende Repo als Worktree). Diese Datei (`00-DOKUMENT-ARCHITEKTUR-DE.md`) sowie `01-INTEGRITAET-YURI-DE.md`, `research/DELIBERATOR-MECHANISMUS-KARTE-DE.md` und `sections/TOKEN-OEKONOMIE-DE.md` bleiben hier (main-Branch, YURI-OS-MUSUBI-Worktree).

**Nie produziert:** `02-VISION-DE.md`, `03-BUSINESSPLAN-DE.md`, `sections/FINANZEN-DE.md`, `sections/GOVERNANCE-DE.md`, `NEXUS-LINK-YURI-AMS-DE.pdf` existieren nicht — die Präsentation wurde direkt verfasst, nicht über die C1/B1-Rollenkette aus §7/§10 zusammengesetzt. Der Datei-Vertrag in §3 beschreibt damit die **Soll**-Architektur, nicht den tatsächlichen Bauweg dieses Dokuments.

**GTM-Erweiterung:** Ein neues Kapitel "Go-to-Market-Strategie" wird der Präsentation via Opus-Fleet-Dissektion + Fan-out-Synthese hinzugefügt (Vorbereitung für eine Fable-5-Ausbaupass). Siehe `YURI-BUSINESS/02_RESOURCES/INVESTOR-DECK/AMS-2026/` für den aktuellen Stand.

---

RESULT_LABEL: AMS_A1_DOK_ARCHitektur_X_PASS_COMMITTED
