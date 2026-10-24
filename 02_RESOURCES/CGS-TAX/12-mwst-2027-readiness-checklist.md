# CGS — MWST readiness checklist for 01/01/2027

Owner: René Spatz (Einzelunternehmen, CHE-442.561.192). Prepared by the CFO lane 24/10/2026.
Every item cites its legal basis in `sources/01-mwstg-mwstv-key-articles.md` (verbatim Fedlex text) or
`sources/02-estv-mwst-praxis.md` / `sources/03-platforms-tooling-facts.md`. Items marked **[Treuhänder]**
need the licensed person's sign-off; items marked **[A]** carry an assumption to confirm. Dates dd/mm/yyyy.
Nothing here is filed or changed by Claude — René or the Treuhänder clicks.

## 0. Why 2027 (verified)

- Exempt while worldwide turnover < CHF 100'000/yr — Art. 10 Abs. 2 lit. a MWSTG.
- The exemption ends once the turnover of the last Geschäftsjahr reaches the limit — Art. 14 Abs. 3; MWSTV
  Art. 9 Abs. 3 makes it explicit: "endet die Befreiung … nach Ablauf des Geschäftsjahres, in dem die
  Umsatzgrenze erreicht wird". The
  2026 revenue (88'979–98'057 by 24/10, Erfolgsrechnung 85'396 realised) crosses it → **steuerpflichtig ab
  01/01/2027**. [A] Confirm with the Treuhänder that the 2026 close will indeed be ≥ 100'000 realised; if it
  ends just below, registration is voluntary (Art. 11) and the whole timeline is a choice, not a duty.

## 1. Decide the method — BEFORE registering (the one decision that locks)

| | Effektiv (Art. 36) | Saldosteuersatz (Art. 37) |
|---|---|---|
| Eligibility | always | turnover ≤ 5'024'000 AND tax ≤ 108'000 — Art. 37 Abs. 1 ✔ CGS |
| How tax is computed | output 8.1 % − Vorsteuer (Art. 28) | SSS × gross turnover incl. VAT — Art. 37 Abs. 2; max 2 rates (MWSTV Art. 86–89) |
| Filing | quarterly — Art. 35 Abs. 1; annual on request ≤ 5'005'000 — Art. 35 Abs. 1bis lit. b | half-yearly — Art. 35 Abs. 1; annual on request |
| Opt-in deadline | default | notify ESTV within **60 days after the MWST number arrives** — MWSTV Art. 78 Abs. 1 |
| Lock-in | **3 full Steuerperioden** before Saldo is possible — Art. 37 Abs. 4, MWSTV Art. 78 Abs. 3 | min. 1 Steuerperiode — Art. 37 Abs. 4; then Effektiv any year-start, notify within 60 days — MWSTV Art. 81 Abs. 1 |
| Opening stock / machines | Einlageentsteuerung on Zeitwert — Art. 32, MWSTV Art. 72–73 (≈ 1'700 one-off, see calc) | **none** — MWSTV Art. 78 Abs. 5 (recovered later on switch to Effektiv, on the then-Zeitwert — MWSTV Art. 81 Abs. 4) |
| Bezugsteuer on foreign services (Shapr3D, Cults, Etsy fees, SaaS) | declared AND deducted → neutral — Art. 45, 28 | declared and PAID at 8.1 % — MWSTV Art. 91 |
| Einfuhrsteuer on US hardware | deductible with the BAZG eVV — Art. 28 Abs. 1 lit. c, MWSTV Art. 59 (practice: `sources/02 §6`) | dead cost (priced into the SSS) |
| Recurring cost (2026 annualised, calc) | ≈ 3'900/yr | 2.1 % → 2'300 · 2.9 % → 3'100 · 3.7 % → 4'000 · 4.5 % → 4'800 |

**The rates (ESTV Verordnung SR 641.202.62, Stand 01/01/2025, `sources/02 §3`):** there is no "holster"
row. Candidates: **Kunststoffe/Kunststoffwaren: Herstellung 3,7 %** (= Sattlerei 3,7 %) — the natural fit
for vacuum-formed Kydex; generic "Herstellung von zum Normalsatz steuerbaren Gegenständen" **4,5 %** (the
ESTV fallback if it rejects the plastics row); **Handel 2,1 %** (Waffen: Handel / Lederwaren: Handel) as a
SECOND rate for resold accessories — granted per activity above 10 % of turnover, number of rates no longer
capped since 01/01/2025 (MI12 §15.1, MWSTV Art. 84), revenue per rate booked separately.

**Result (2026 annualised, `11-effektiv-vs-saldo-calc.md`):**

| | prices unchanged | prices +8.1 % |
|---|---|---|
| Effektiv | 3'908 | 4'532 |
| Saldo 3,7 % | 3'961 | 4'269 |
| Saldo 4,5 % | 4'783 | 5'158 |
| Saldo blended 3,7/2,1 (15 % traded goods [A]) | 3'715 | 4'003 |

At 3,7 % the recurring year is a **wash (±50–260 CHF)**. What actually decides it:
- **For Effektiv:** Einlageentsteuerung ≈ 1'700 one-off on 01/01/2027 (Saldo: none, MWSTV Art. 78 Abs. 5);
  every future machine purchase recovers 8.1 % (a CHF 15'000 CNC = 1'124); Bezugsteuer neutral; import VAT
  recovered. Cost: quarterly (or annual+Akonto) filing with Vorsteuer bookkeeping and an eVV per import.
- **For Saldo:** half-yearly or annual filing, no Vorsteuer accounting, no eVV chase; reversible after one
  year (Effektiv locks you out of Saldo for 3 years); the accessories second rate adds ~250–500/yr saving.
  Cost: if the ESTV assigns 4,5 % instead of 3,7 %, Saldo loses ~800/yr for the lock-in year.
- **CFO lane recommendation (advisory):** Effektiv — because CGS keeps buying machines (CNC 2025, two lasers
  2025/26) and the cockpit already tracks every import, so the eVV discipline is cheap; combine it with
  **annual reporting + 3 Akonto** (MWSTV Art. 76a, Art. 86a) to remove the quarterly burden. Choose Saldo
  only if no investment ≥ CHF 5'000 is planned for 2027–2029 and admin minimalism outweighs ~1'700 + future
  investment VAT. Either way the Treuhänder decides on this calc. **[Treuhänder]**

- [ ] 1.1 Treuhänder: which row would the ESTV grant (3,7 % plastics vs 4,5 % generic) and is a 2,1 % second rate for resold accessories defensible (accessories ≈ 20 % of 2025 revenue, but part is self-made)?
- [ ] 1.2 Confirm [A] items in `10-cgs-figures-2025-2026.md §C3` (CKK VAT status, rent opted?, Post split, asset list).
- [ ] 1.3 List 2027 investment plans with amounts (changes the answer).
- [ ] 1.4 Rerun the calc, bring it to the Treuhänder, decide. Record the decision in `_SYSTEM/memory` (Track A).

## 2. Price policy — decide with the method

- Consumer prices must be shown VAT-inclusive (Preisbekanntgabeverordnung — `sources/02 §9`). Two options:
  (a) keep today's gross prices (margin absorbs 7.49 %), (b) raise prices 8.1 % (customer pays, net unchanged).
  The calc shows both columns.
- [ ] 2.1 Decide absorb vs pass-through (or a mix per product line).
- [ ] 2.2 Shipping charges follow the main supply's rate (8.1 %) — `sources/02 §9`.
- [ ] 2.3 Exports: 0 % only with the Ausfuhrnachweis — Art. 23 Abs. 2 Ziff. 1 + practice `sources/02 §5`; keep the Swiss Post / UPS export proof per order.

## 3. Register (01/01/2027 → by 31/01/2027)

- Anmeldung unaufgefordert within **30 days after liability begins** — Art. 66 Abs. 1 → **deadline 31/01/2027**, electronically — MWSTV Art. 123 Abs. 2. Failing = Verfahrenspflichtverletzung Art. 98 lit. a.
- [ ] 3.1 ESTV ePortal account (AGOV login) — `sources/02 §1`. Documents: UID, Handelsregister/none for EU, bank, expected turnover.
- [ ] 3.2 Choose on the form: method (Saldo must be requested here or within 60 days of the number — MWSTV Art. 78 Abs. 1), Abrechnungsart **vereinnahmt** (cash basis — Art. 39 Abs. 2; matches cgs-books' Zahlungseingang realisation), and whether to request **annual reporting** (MWSTV Art. 76a: within 60 days of the number; Raten per Art. 86a — Effektiv: ¼ at days 150/240/330; Saldo: ½ at day 240).
- [ ] 3.3 Once the number arrives: UID becomes `CHE-442.561.192 MWST` on every invoice — Art. 26 Abs. 2 lit. a.

## 4. Switch the systems on 01/01/2027 (same day, all of them)

- [ ] 4.1 cgs-books: `Einstellungen → MwSt-pflichtig ab = 01/01/2027` + method + (Saldo rate) — René clicks; VAT is double-gated on date AND setting (`cgs-books` skill, SHARP EDGES). Do NOT re-date old entries across the boundary.
- [ ] 4.2 cgs-books Kontenrahmen: 1170 Vorsteuer Material/Waren/DL, 1171 Vorsteuer Investitionen, 2200 Geschuldete MWST, 2201 Abrechnungskonto — `sources/03 §8`. (Cash-basis Milchbüechli still allowed under OR 957 Abs. 2, but Art. 70 Abs. 1 MWSTG requires Umsatz + Vorsteuer traceability — `sources/02 §11`.)
- [ ] 4.3 WooCommerce: prices-include-tax, CH standard 8.1 %, shipping tax class, 0 % for non-CH destinations, PDF-Invoices fields (UID MWST, rate, VAT amount). Germanized's small-business toggle is German §19 UStG — it switches tax OFF, do not use it; WCPA add-on tax mode needs a live test on staging — `sources/03 §3`.
- [ ] 4.4 Etsy: as of 23/10/2026 Etsy is NOT on the ESTV's published platform-operator list (eBay, Amazon EU, Zalando are), and the Art. 23 Abs. 2 Ziff. 13 exemption needs a registered platform (MWST-Branchen-Info 27) → Etsy sales to CH buyers are ordinary 8.1 % CGS sales unless Etsy turns up registered; Etsy itself collects Swiss VAT on CH-bound orders and charges 8.1 % on its fees — how the two interact on your Abrechnung is the Treuhänder's call. Re-check the ESTV list in December. `sources/02 §8`, `sources/03 §1`. **[Treuhänder]**
- [ ] 4.5 Quotes/Angebote (cockpit) + Etsy listings + invoice templates: "inkl. 8.1 % MWST" wording.
- [ ] 4.6 Invoices (Art. 26 Abs. 2): name+UID MWST, customer, date, description, Entgelt, rate + tax amount (or "inkl. 8.1 %").

## 5. Einlageentsteuerung on 01/01/2027 (Effektiv only) **[Treuhänder]**

- Legal: Art. 32 Abs. 1–2 (Zeitwert: −1/5 per elapsed year for movables), MWSTV Art. 72 (unused goods in full; self-made goods +33 % surcharge on material input tax; advice/bookkeeping/advertising services presumed consumed), Art. 73 (acquisition price basis, first year counts fully).
- [ ] 5.1 Stocktake 31/12/2026: Kydex, HDPE, hardware, finished holsters (material + 33 %), packaging — with purchase invoices / eVVs showing the tax.
- [ ] 5.2 Asset list: Sorotec CNC (2025, DE import — Einfuhrsteuer on the eVV), Atomstack (2025), Commarker (2026), vacuum press, Bambu P2S, compressor, Schallschutzkabine, tools > CHF 500 — invoice + Zeitwert each.
- [ ] 5.3 Claim in the **Q1/2027** return — Ziffer 405 (investments) / 400 (material); the eCH-0217 XML upload carries no Einlageentsteuerung list, so keep the asset list as the working paper (`sources/03 §7`).
- Calc estimate: ≈ 1'700 (see `11-effektiv-vs-saldo-calc.md`); real number comes from the invoices.

## 6. Running the tax (from 2027)

| When | What | Basis |
|---|---|---|
| 60 days after each quarter (Effektiv) / half-year (Saldo) | file the Abrechnung in ePortal | Art. 71 Abs. 1 |
| same 60 days | pay | Art. 86 Abs. 1; Verzugszins 4.0 % (SR 631.014, `sources/01` Sources) |
| every import | obtain the **eVV Import** (Veranlagungsverfügung) in CGS's name via BAZG Chartera Output or the carrier's declaration number + access code → Vorsteuer (UPS invoice alone is not enough, MWST-Info 09) | Art. 28 Abs. 1 lit. c, `sources/02 §6`, `sources/03 §6` |
| every foreign service invoice | Bezugsteuer **Ziffer 383** (382 was the pre-2024 rate line) + Ziffer 400 deduction under Effektiv — only for suppliers NOT in the Swiss MWST register (check uid.admin.ch; Etsy CHE-373.086.513 and WooPayments charge 8.1 % on fees themselves — `sources/03 §1, §4`) | Art. 45 Abs. 1 lit. a, MWSTV Art. 91 |
| every export | keep the Ausfuhrnachweis with the order — up to CHF 1'000 the Swiss Post Aufgabequittung/Aufgabeverzeichnis + order/invoice/payment proof `[secondary: Post FAQ]`; above, the export declaration + eVV Export (post.ch/evd); ESTV prefers the BAZG Veranlagungsverfügung, free evaluation of evidence Art. 81 Abs. 3 | Art. 23 Abs. 2 Ziff. 1, `sources/02 §5`, `sources/03 §5` |
| by the return containing day 180 after year-end (FY2027 → 28/06/2028 falls in Q2 → due 29/08/2028); ESTV treats it as finalised after day 240 | Finalisierung / Umsatzabstimmung — correct errors | Art. 72 Abs. 1, MI15 §7 |
| 10 years | keep records (Belege-ZIPs in cgs-books) | Art. 70 Abs. 2, OR 958f |

The CFO lane prepares each return's Ziffern table from cgs-books (`cgs-cfo` skill → ROUTINES). René types it
into ePortal.

## 7. Before 31/12/2026 — the actual to-do order

1. [ ] Confirm the [A] items + 2027 investment plans (10 min, René) → rerun calc.
2. [ ] Read the Branchen-SSS (`sources/02 §3`) → method decision with the Treuhänder (one meeting, bring `11-…calc.md`).
3. [ ] Decide price policy; prepare Woo/Etsy/invoice changes in a staging checklist (do NOT switch early — charging VAT before liability = Art. 27 unberechtigter Steuerausweis).
4. [ ] Ask the landlord whether rent is opted (one email).
5. [ ] Collect eVVs for every 2025–2026 import still in use (UPS/FedEx/BAZG ePortal) — needed for item 5.2 anyway.
6. [ ] 31/12/2026 stocktake (item 5.1).
7. [ ] 01/01/2027: switch systems (section 4). By 31/01/2027: Anmeldung (section 3). Within 60 days of the number: Saldo and/or annual-reporting request if chosen.
