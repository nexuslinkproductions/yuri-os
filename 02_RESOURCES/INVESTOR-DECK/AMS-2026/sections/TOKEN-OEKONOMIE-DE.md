# Token-Ökonomie (K1) — Verifizierte Einsparungen, Jahresprojektion, Skalierung

> **Rolle:** Kernelsmith (K1) · **Substrat:** Claude/Opus · **Task:** WS-AMS-K1
> **Mission:** Token-Einsparungen belegen, die `TBD`-Jahresprojektionen aus `investor-deck-plan.json.token_savings` mit Zahlen **und** Annahmen füllen, Skalierung (×100/×1000/×10000 Nutzer) rechnen.
> **Quellen:** `02_RESOURCES/INVESTOR-DECK/investor-deck-plan.json` (`.token_savings`), `_SYSTEM/token-audit.md` (Primär-Audit 2026-04-17), `_SYSTEM/token-regulation-policy.md`, `_SYSTEM/Scripts/token-ledger.mjs`.
> **Selbsteinordnung:** Kostenskill. Tragende Behauptungen (`38 %`, `8.4M/Jahr`) sind `BELEGT` bzw. als Band `TEILWEISE`. Keine USD-Zahl ohne benannte Annahme.
> **Interface:** Verbraucht von `03-BUSINESSPLAN-DE.md` §6 (`03-BP/token`). Anker-Querverweis: `→ sections/TOKEN-OEKONOMIE-DE.md (K1)`.

---

## 1. Kernelsmith-Verdict (TL;DR)

- **38 % Session-Kostenreduktion ist verifiziert** (`45K → 28K` Tokens/Session). `[BELEGT]`
- **Jahresprojektion ist ein BAND, kein Punkt:** `4.08M` (Audit, 20 Sessions/Monat) bis `8.4M` (Plan, 40 Sessions/Monat) Tokens/Jahr pro Operator. Swing-Faktor = Session-Frequenz. `[TEILWEISE]`
- **Dollar-Ersparnis ist REGIME-abhängig, nicht automatisch:** Auf einer **flachen Claude-Max-Flatrate** konvertieren Token-Ersparnisse **nicht** direkt in USD — sie kaufen *Mehr-Arbeit im Kontingent*. In USD lösen sie sich nur auf **API-metered** (Enterprise BYO-Key) und **SLM-served** (Phase 1–2) Workloads ein. Diese Unterscheidung ist die ehrliche Investor-Schnittstelle.
- **Skalierung trägt erst im Metered/Served-Regime:** ~`$5,5K` (×100) bis ~`$554K`/Jahr (×10 000) pro Operator-Basis-Spanne bei Sonnet-API-Pricing; **5× höher bei Opus-Tier** (Model-Wahl = Hebel). `[TEILWEISE]`

---

## 2. Verifizierte Session-Daten (`BELEGT`)

Sechs Kategorien aus `plan.json.token_savings.verified_data`, kreuzgeprüft gegen `_SYSTEM/token-audit.md`. Alle sechs Zahlen decken sich mit dem Primär-Audit (gleiche Erhebung 2026-04-17).

| Kategorie | Vorher | Nachher | Ersparnis | Audit-Kreuzcheck |
|-----------|--------|---------|-----------|------------------|
| **Session-Kosten** | ~45K | ~28K | **38 %** | Audit Part 5: `17K/Session (38 %)` ✓ |
| **Vault-Navigation** | 8K | 2K | 70–80 % | Audit Part 1: Palace `10K→2K = 80 %` ✓ |
| **MCP/Skill-Loading** | 6–12K | 0–3K | 50–100 % | Audit Part 2: `6–12K → 0–3K` ✓ |
| **Context-Blöcke** | 8–15K | 3–8K | 40–60 % | Audit Part 1 / Regulation 2 ✓ |
| **Baseline-Session-Load** | 13.5K | 2K | 69–85 % | Audit Part 2: `13.5K→2K = 85 %` (Text); Reg.Pol.: `6.5K→2K = 69 %` ✓ |
| **Monthly Burn** | ~1.8M | ~1.1M | ~700K/Monat | Audit Exec-Summary ✓ |

**Tag:** `[BELEGT]` — jede Zeile in `_SYSTEM/token-audit.md` nachvollziehbar (Datumsbeleg 2026-04-17, Report-Periode 2026-04-01→04-17). Die `38 %` sind **kein Forecast, sondern eine gemessene Session-Differenz**.

**Woher die Zahlen stammen (Mechanismen-Zuschreibung):**

| Hebel | Token-Wirkung | Status |
|-------|---------------|--------|
| **Zone-A Stable Caching** (byte-identische Preamble → Prompt-Cache-Reuse) | senkt *wiederholte* Input-Kosten pro Session | `[BELEGT]` (CLAUDE.md: "stable parts stay byte-identical for prompt-cache reuse") |
| **Selective Activation** (MCP/Skill nur on-demand) | `6.5K → 2K` Baseline, einzelner größter Hebel laut Audit | `[TEILWEISE]` (Policy existiert in `token-regulation-policy.md` Reg.1; Voll-Enforcement ist `ZIEL`) |
| **Context-Kompression** (Regeln konsolidiert, Memory lazy-load) | `4.3K → 3.5K` + Memory `1.5K → 0.3K` | `[TEILWEISE]` (Reg.2 formuliert; kontinuierliche Umsetzung) |
| **Energy Gate** (stoppt Tokens für regressierende Aktionen) | **nicht quantifiziert** im Audit | `[ZIEL]` — logisch plausibel (ΔU-Veto bricht nutzlose Tool-Ketten ab), aber *keine* isolierte Messung vorhanden. Nicht als `BELEGT` ausweisen. |

> **Ehrlichkeits-Note (P1):** Das `key_insight`-Feld in `plan.json` listet das Energy Gate als Token-Treiber. Das ist eine *behauptete*, nicht *gemessene* Ersparnis. Bleibt `ZIEL`, bis ein A/B (mit/ohne Gate-Arm) die Differenz misst. → offener Punkt **K-1** (§9).

---

## 3. Jahresprojektion (die `TBD`-Felder gefüllt)

`plan.json.annual_projection` liefert Token-Zahlen, aber drei Dollar-Felder sind `TBD`: `cost_saved_per_year_usd`, `multiplied_by_100_users`, `multiplied_by_1000_users`. Hier die Berechnung — **jede Zahl mit benannter Annahme**.

### 3.1 Token-Band (Session-Frequenz = Swing-Faktor)

Zwei konsistente, aber unterschiedliche Annahmen in den Quellen:

| Quelle | Sessions/Monat | Token-Ersparnis/Session | **Tokens/Jahr/Operator** |
|--------|----------------|-------------------------|--------------------------|
| `_SYSTEM/token-audit.md` Part 5 (Audit) | 20 | 17K | **4.08M** (Floor) |
| `investor-deck-plan.json` (Plan) | 40 | 17.5K | **8.4M** (Ceiling) |

Beide sind **intern konsistent** (`4.08M = 17K × 20 × 12`; `8.4M = 700K/Monat × 12`). Der Unterschied ist ausschließlich die **Session-Frequenz** (20 vs 40/Monat), nicht die Pro-Session-Effizienz.

**Verbindliche Band-Angabe für Investoren:** `4.08M–8.4M Tokens/Jahr/Operator` `[TEILWEISE]`. Schließt Architekt-Offenen-Punkt **O-3** ("Jahresprojektion = TBD").

### 3.2 Blended-API-Preis (Modell-Tier-Annahme)

`plan.json` nennt `$3/MTok Input + $15/MTok Output` (Claude-Sonnet-List-Pricing). Eine Ersparnis in USD braucht einen **Input/Output-Mix**, weil Input und Output unterschiedlich bepreist werden.

| Mix-Annahme | Input-Anteil | Blended $/MTok | Charakter |
|-------------|--------------|----------------|-----------|
| Output-lastig (50/50) | 50 % | **$9.0** | konservativ (weniger Ersparnis) |
| **Basis (70/30)** | 70 % | **$6.6** | agentic Coding-realistisch (Context dominiert) |
| Input-lastig (80/20) | 80 % | **$5.4** | optimistisch |

Berechnung Basis: `0.7 × $3 + 0.3 × $15 = $2.1 + $4.5 = $6.6/MTok`.

> **Annahme-Note:** Der 70/30-Mix reflektiert, dass eine Coding-Session massiv Context lädt (System-Prompt, Tools, File-Reads = Input) und vergleichsweise wenig generiert. Output-Lastigkeit (50/50) ist die vorsichtige Gegenannahme.

### 3.3 Dollar-Ersparnis pro Operator/Jahr (Sonnet-API-metered)

| Token-Band | @ $9.0/MTok (kons.) | @ $6.6/MTok (Basis) | @ $5.4/MTok (opt.) |
|------------|---------------------|---------------------|---------------------|
| **Floor 4.08M** | $36.7 | $26.9 | $22.0 |
| **Ceiling 8.4M** | $75.6 | **$55.4** | $45.4 |

**Pro-Operator-Band: ~$22–$76/Jahr** bei Sonnet-API-Metering. `[TEILWEISE]` —small per Kopf, aber linear skalierbar (§4).

### 3.4 Warum die Pro-Operator-Zahl klein ist — und warum das OK ist

`$55/Jahr` klingt unspektakulär, weil es **ein einzelner Operator auf API-Metering** ist. Die drei Hebel, die das investoren-relevant machen:

1. **Flatrate-Regime:** Auf Claude Max 20x (`$200/Monat`) ist die Token-Ersparnis *keine* USD-Ersparnis — sie ist **Kapazität** (mehr Arbeit im Flat-Contingent). Die Ersparnis zählt hier in *durchgeführten Tasks*, nicht Dollar.
2. **Metered/Served-Regime:** Bei API-Preis (Enterprise BYO-Key) oder **SLM-Serving** (Phase 1–2) wird jedes gesparte Token zu USD. Hier greift §4.
3. **Modell-Tier-Hebel:** Dieselben Tokens sind **5× mehr wert bei Opus** (`$15/$75`). Siehe §4.2.

---

## 4. Skalierung (×100 / ×1000 / ×10000 Nutzer)

### 4.1 Basisfall — Sonnet-API-Pricing (`$6.6/MTok`, Ceiling `8.4M`/Jahr)

| Nutzer | Token-Ersparnis/Jahr | USD-Ersparnis/Jahr |
|--------|----------------------|--------------------|
| ×1 | 8.4M | $55 |
| ×100 | 840M | **$5,5K** |
| ×1 000 | 8.4B | **$55K** |
| ×10 000 | 84B | **$554K** |

Füllt `multiplied_by_100_users` und `multiplied_by_1000_users` aus `plan.json`. `[TEILWEISE]` — linear-skalierte Hochrechnung, keine gesonderte Enterprise-Messung.

### 4.2 Modell-Tier-Sensitivität (der echte Hebel)

Token-Effizienz ist **in der Währung denominiert, in der der Kunde rechnet**. Je teurer das Modell, desto größer die USD-Ersparnis bei identischer Token-Reduktion.

| Modell-Tier | Blended $/MTok (70/30) | ×1 000 Nutzer/Jahr (8.4M) | ×10 000 Nutzer/Jahr |
|-------------|------------------------|---------------------------|---------------------|
| Haiku (`$0.25/$1.25`) | $0.55 | $4.6K | $46K |
| **Sonnet (`$3/$15`)** — Basis | **$6.6** | **$55K** | **$554K** |
| Opus (`$15/$75`) | $33.0 | **$277K** | **$2.77M** |

**Investor-Punchline:** Dieselbe `38 %`-Effizienz ist bei Opus-Metering **5× wertvoller** als bei Sonnet. Kunden, die auf teuren Modellen fahren (regulierte Industrie, komplexe Synthese), sehen die größte USD-Hebelwirkung — und genau das ist YURIs Zielmarkt (EU AI Act, Finanzen, Legal). `[TEILWEISE]` — Pricing-Tiers sind 2026-List-Preise, verifizieren vor Vertragsabschluss.

### 4.3 SLM-Hebel (Phase 1–2) — der zweite, größere Kostensprung

Token-Effizienz (oben) ist die *Wrapping*-Ersparnis. Der **SLM-Pfad** (`plan.json.slm_development`) öffnet einen zweiten, strukturell größeren Hebel:

- `60B YURI-SLM verbraucht 10–50× weniger Strom als ein 400B+ LLM` (`plan.json.slm_development.why_slm`).
- Das ist eine **Energie/Infra-Kosten**-Aussage, keine API-Token-Aussage — sauber zu trennen.
- Lokale Deployment = **kein API-Dependency**, keine Datenausfuhr → Kostensenkung bewegt sich von *pro-Token* zu *pro-Watt/pro-Gerät*.

**Tag:** `[TEILWEISE]` (Architektur & Methode spezifiziert in `plan.json`; lauffähiger 60B-SLM ist `ZIEL`, Phasen 1–3). Für den Investor: Token-Ökonomie (Wrapping, **jetzt**) + SLM-Ökonomie (native, **Phase 1–2**) = zweistufige Kostenkurve.

---

## 5. Die zwei Regime — die ehrliche Schnittstelle

| Regime | Wo Token-Ersparnis landet | USD-wirksam? |
|--------|---------------------------|--------------|
| **Flat-Subscription** (Claude Max, Copilot-Seat) | Mehr Arbeit im Flat-Contingent; längerer Context-Headroom | ❌ nicht direkt (Kapazität, nicht Cash) |
| **API-metered** (Enterprise BYO-Key) | Pro-Token-Abrechnung sinkt linear | ✅ §4.1/4.2 |
| **SLM-served** (eigenes Modell, Phase 1–2) | Serving-Kosten (GPU/Strom) sinken | ✅ §4.3, größerer Hebel |

**Pflicht-Aussage für `03-BP/token`:** Die `38 %` sind **immer** wahr (gemessen). Die **USD-Übersetzung** gilt nur in den unteren beiden Regimen. Ein Investor, der YURI auf einer Flatrate betreibt, profitiert über *Durchsatz/Qualität*, nicht über *Cash*. Diese Unterscheidung offen zu legen ist P1 (Ehrlichkeit > Hype).

---

## 6. Kernelsmith-Hinweis — native Konsolidierung (Rust/Mojo)

Mein Lane-Kommentar, bewusst **nicht** als Token-Ersparnis ausgewiesen:

Die Token-Effizienz-Mechanismen laufen **pro Session, pro Tool-Call** — sie sind Hot-Paths. Kandidaten für native Delivery (JS-Referenz + Rust/Mojo-Kernel) zur **Latenz-/CPU-Senkung** (nicht API-Token-Senkung):

- `_SYSTEM/Scripts/token-ledger.mjs` (Per-Call-Aggregation)
- `capability-scan.mjs` / `capability-recall.mjs` (BM25-Recall pro Navigation)
- `xref-query.mjs` / `propagation-scan.mjs` (FTS5 + Graph-Traversal je Task)

**Ehrliche Einordnung:** Native Konsolidierung senkt *lokale Rechenzeit* und *Batterie/Strom*, was den SLM-Serving-Hebel (§4.3) verstärkt. Sie erhöht **nicht** die API-Token-Ersparnis der §2-Zahlen. Bleibt daher getrennt ausgewiesen und im Businessplan als *Infra-Effizienz*, nicht als *Token-Ökonomie*. `[ZIEL]` — Konsolidierungs-Roadmap siehe `proj-language-consolidation-priorities`.

---

## 7. Risiko & Annahmen (Pflicht-Kapitel)

| # | Annahme / Risiko | Status | Sensitivität |
|---|------------------|--------|--------------|
| **K-1** | Energy-Gate-Token-Ersparnis **nicht isoliert gemessen** | `ZIEL` | Hebel plausibel, aber nicht in §2-Zahlen enthalten → keine Doppelzählung |
| **K-2** | Session-Frequenz **20 vs 40/Monat** → 4.08M vs 8.4M | `TEILWEISE` | Band ausgewiesen; Investor kann eigene Frequenz ansetzen |
| **K-3** | API-Pricing **$3/$15 (Sonnet, 2026-List)** | `TEILWEISE` | Tier-Sensitivität §4.2 (Haiku↔Opus = 60×-Spanne in USD) |
| **K-4** | Input/Output-Mix **70/30** | `TEILWEISE` | 50/50–80/20-Band in §3.2 |
| **K-5** | Selective-Activation-**Voll-Enforcement** noch `ZIEL` | `TEILWEISE` | `6.5K→2K`-Hebel hängt an Umsetzung der `token-regulation-policy.md` Reg.1 |
| **K-6** | Skalierung ×1000+ ist **lineare Hochrechnung**, keine Enterprise-Messung | `TEILWEISE` | Reale Enterprise-Profile (Mix aus Flat/Metered) weichen ab |

---

## 8. Offene Punkte (für Adjudicator / Calibrator / Quartermaster)

- **K-1** → Energy-Gate-A/B messen (mit/ohne Gate-Arm) → isolierte Token-Differenz. *Calibrator.*
- **K-3** → Verbindliches Pricing-Tier pro Zielkunden-Segment festlegen (regulierte Industrie = Opus-lastig → höherer USD-Hebel). *Quartermaster (Q1).*
- **K-6** → Enterprise-Pilot-Daten (Phase 2) nachliefern, um lineare Hochrechnung durch Messung zu ersetzen. *B1.*

---

**Belege (K1):**
- `investor-deck-plan.json` → `.token_savings.verified_data` (6 Kategorien), `.token_savings.annual_projection` (40 Sessions/Monat, `$3/$15`), `.token_savings.key_insight`, `.slm_development.why_slm` (10–50× Strom)
- `_SYSTEM/token-audit.md` → Exec-Summary, Part 1 (Vault/Palace), Part 2 (MCP/Skill), Part 5 (Jahresprojektion 4.08M @ 20/Monat)
- `_SYSTEM/token-regulation-policy.md` → Reg.1 (Selective Activation `6.5K→2K`), Reg.2 (Context-Kompression)
- `_SYSTEM/Scripts/token-ledger.mjs` → Per-Session-Token-Erfassung (Mess-Infrastruktur)
- `00-DOKUMENT-ARCHITEKTUR-DE.md` → §9 (tragende Claims, `38 % = BELEGT`), §12 O-3 (Jahresprojektion `TBD` → hier gefüllt)

**Restrisiko:** §2-Zahlen sind audit-verifiziert (`BELEGT`); §3–§4 sind **Annahmen-gestützte Projektionen** (`TEILWEISE`), jede mit benannter Sensitivität. Keine Zahl ohne Herleitung. Energy-Gate-Beitrag bewusst nicht in die `BELEGT`-Summe eingerechnet (Vermeidung von Over-Claim).
