# cgs-books → ESTV MWST-Abrechnung (eCH-0217 V2.0.0) — Plan

**Stand 11/11/2026 (Abend): Schritte 1–3 GEBAUT + deployed (cgs-books `1eff0b2`, v36).** Migration 012 live angewendet + verifiziert (Totale unverändert, Live-XML XSD-gültig). Offen:
Schritt 4 (Einlageentsteuerung = manuelles Feld 410,
Betrag aus Inventur 31/12/2026). Ursprünglicher Plan unten.

Stand 11/11/2026. Nur Plan, nichts gebaut. Ziel: books liefert pro Quartal die Ziffern des ESTV-Formulars
und eine XML, die das ePortal («Abrechnungsdaten importieren») annimmt. Erste Abrechnung: Q1/2027,
fällig 31/05/2027.

## Quellen (lokal abgelegt, primär)

- Schema: `sources/ech-0217-v2/eCH-0217-2-0-0.xsd` (ech.ch, Beilage zu V2.0.0)
- Spezifikation: `sources/ech-0217-v2/eCH-0217_V2.0.0_E-MWST.pdf` (+ `spec.txt`), Status «Genehmigt 2025-09-08»
- ESTV-Bestätigung 06/11/2026: Quartal, vereinnahmt, effektiv, CHE-442.561.192 MWST
- books-Code gelesen: `cgs-books/src/controllers/reports_controller.php` (report_vat_data, Z. 133),
  `db/migrations/001_init.sql`, `002_accounts_vat.sql`; Live-Kontenplan via API (23 aktive Konten)

## Ist-Zustand books (gemessen)

| Punkt | Befund |
|---|---|
| eCH-0217 / XML-Export | nicht vorhanden (0 Treffer im Code) |
| MWST-Bericht Periodenzuordnung | `e.entry_date BETWEEN` — **Rechnungsdatum**, nicht Zahlung. Passt NICHT zu «vereinnahmt». `book_date_expr()` existiert und wird von ER/Jahresabschluss genutzt, hier nicht |
| Unbezahlte Einnahmen | werden im MWST-Bericht mitgezählt |
| Ziffern | keine; nur Summen pro Steuersatz |
| Vorsteuer 400 vs 405 | keine Trennung; Konto-Flag `vorsteuer` ist nur ja/nein |
| Exporte (220) | keine Kennzeichnung; ein 0 %-Ertrag ist nicht von «ausgenommen» (230) unterscheidbar |
| Bezugsteuer (383) | keine Kennzeichnung für Dienstleistungen aus dem Ausland |
| Einlageentsteuerung (410) | kein Feld |
| Anlagekonto (Maschinen) | kein Konto der Klasse 1 aktiv |

## XML-Inhalt für CGS (aus XSD + Spez. Tab. 5/6)

`VATDeclaration`
- `generalInformation`: uid (CHE-442.561.192), organisationName, generationTime, reportingPeriodFrom/Till,
  typeOfSubmission (1 Ersteinreichung · 2 Korrektur · 3 Jahresabstimmung), formOfReporting **2 = vereinnahmt**,
  businessReferenceId, sendingApplication (eCH-0058)
- `turnoverComputation`: totalConsideration (**200**), suppliesToForeignCountries (**220**), suppliesAbroad (221),
  suppliesExemptFromTax (230), reductionOfConsideration (235), variousDeduction (280)
- `effectiveReportingMethod`: grossOrNet (**1 = Netto**, ESTV-Empfehlung), suppliesPerTaxRate (**303** u.a.,
  Satz + Umsatz), acquisitionTax (**383**, immer netto), inputTaxMaterialAndServices (**400**),
  inputTaxInvestments (**405**), subsequentInputTaxDeduction (**410**), inputTaxCorrections (415),
  inputTaxReductions (420)
- `payableTax` (**500/510**), `otherFlowsOfFunds` (900/910) optional
- Beträge: decimal, 2 Nachkommastellen. Die Einlageentsteuerungs-LISTE geht nicht in die XML — separat im Portal hochladen.

## Schritte

**1. MWST-Bericht auf «vereinnahmt» umstellen** (Pflicht, vor 31/03/2027)
- report_vat_data: `book_date_expr('e')` statt `e.entry_date`; nur Buchungen mit Zahlungseingang/-ausgang
- Test: Rechnung 12/2026 bezahlt 01/2027 → zählt in Q1/2027; unbezahlte Rechnung → zählt nicht

**2. Ziffern-Zuordnung** (Pflicht für ein korrektes Formular, auch bei Handeingabe)
- Konto bekommt eine Vorsteuer-Ziffer: 400 (Klasse 4) oder 405 (Klasse 6 + Investitionen)
- Buchung bekommt eine Kennzeichnung: normal · Export (220) · Bezugsteuer (383) · Einlageentsteuerung (410)
- Neues Konto für Maschinen/Investitionen (Klasse 1, z.B. 1500) — René entscheidet
- books zeigt pro Quartal eine Ansicht «ESTV-Formular» mit allen Ziffern

**3. eCH-0217-Export**
- Generator nach XSD; Validierung gegen die abgelegte XSD vor jeder Ausgabe (Test im Repo)
- Download-Knopf pro Quartal; keine automatische Übermittlung — René lädt im ePortal hoch und prüft dort

**4. Einlageentsteuerung Q1/2027**
- Inventurliste 31/12/2026 + Maschinenliste mit Zeitwert → Betrag für Ziffer 410 + PDF-Liste zum Hochladen

## Entscheide René 11/11/2026

- Verkäufe ab 2027: **René bucht von Hand** in books (kein Cockpit-Import).
- Export: **Häkchen «Export» pro Buchung** → Ziffer 220.
- 400/405: René bat um Recherche → Empfehlung unten.

## Empfehlung 400 / 405 (belegt)

Quelle: Kontenrahmen KMU (veb.ch, `sources/03 §8`): 1170 = «Vorsteuer MWST Material, Waren, Dienstleistungen,
Energie» → Ziffer 400; 1171 = «Vorsteuer MWST Investitionen, übriger Betriebsaufwand» → Ziffer 405.
ESTV MWST-Info 15 §1.4 (`sources/02` Z. 221): 400 Material/Dienstleistung, 405 Investitionen/übriger Betriebsaufwand.

| Ziffer | books-Konten |
|---|---|
| 400 | 4000, 4200, 4400 (Material, Handelsware, Drittleistungen) + 6400 (Energie) |
| 405 | 6100, 6200, 6500, 6570, 6600, 6640, 6700 + neues Investitionskonto (Maschinen) |

Risiko klein: laut eCH-0217 Tab. 22 werden 400 und 405 beide gleich von der Steuer abgezogen — eine Fehlzuordnung
ändert den Zahlbetrag nicht, nur die Aufteilung auf dem Formular.

## Bezugsteuer-Kandidaten 2026 (aus books, Konten 6xxx, Dienstleistungen aus dem Ausland)

Geprüft 11/11/2026: Rechnung in books (Beleg angesehen) + uid.admin.ch (Namenssuche).

| Anbieter | Rechnungssteller laut Beleg | CH-MWST auf Beleg | UID-Register | Ergebnis ab 2027 |
|---|---|---|---|---|
| claude.ai | Anthropic, PBC, San Francisco (Beleg 16) | **ja, 8.1 % «VAT – Switzerland»**, aber **keine MWST-Nr. auf der Rechnung** | Anthropic PBC CHE-339.720.561 **inaktiv**; Anthropic Ireland CHE-492.539.177 MWST aktiv | keine Bezugsteuer (Steuer schon belastet). Vorsteuer nur mit Rechnung inkl. MWST-Nr. (Art. 26) → bei Anthropic anfragen / Treuhänder |
| Shapr3D | Shapr3D UK Limited, London (Beleg 137) | nein («outside the scope of UK VAT») | kein Treffer «Shapr3D» | **Bezugsteuer** |
| LightBurn | LightBurn Software (LLC), Dover DE, USA (Belege 107/190) | nein | nur «LightBurn Software AG», Schlieren (HR/MWST) — anderer Rechtsträger als der Rechnungssteller | **Bezugsteuer**, solange die US-Firma fakturiert |
| acowebs (WCPA) | Acodez IT Solutions Pvt Ltd, Calicut, Indien (Beleg 8) | nein | kein Treffer «Acodez» | **Bezugsteuer** |
| Kinguin / Adobe Acrobat | Kinguin-Bestellbestätigung, Verkäufer «OnlineKeys.eu» (Beleg 1786) — **keine Rechnung** | «Tax included CHF 0.00» | «OnlineKeys» kein Treffer; Kinguin Swiss GmbH nur HR, nicht MWST | **Bezugsteuer**; Beleg ist keine Rechnung |

Grundlage: MWSTG Art. 45 Abs. 1 lit. a + Abs. 2 lit. a (`sources/01`): ausländischer Anbieter, nicht im
CH-Register → steuerpflichtiger Empfänger schuldet Bezugsteuer (Ziffer 383) und zieht sie unter «Effektiv»
als Vorsteuer wieder ab (netto 0, aber deklarieren). Waren-Importe (HOLSTERSMITH, CKK, Bladetech …) sind
Einfuhrsteuer (eVV), nicht Bezugsteuer. Nur 2025/2026-Buchungen mit diesen Namen geprüft — andere ausländische
Dienstleister (z.B. in 6500/6600) nicht systematisch.

## Noch offen — Treuhänder

1. Etsy-Verkäufe: Behandlung offen (Checkliste 4.4).
2. claude.ai: reicht eine Rechnung ohne CH-MWST-Nr. für den Vorsteuerabzug? (sonst Anthropic um korrekte Rechnung bitten)
3. Kinguin/OnlineKeys: nur Bestellbestätigung — genügt das als Beleg für Bezugsteuer + Vorsteuer?
