# MWSTG / MWSTV — key articles (verbatim)

Primary-source pack for CGS (Spatz Custom Gear Solutions, sole proprietorship, CHE-442.561.192): MWST registration planned from 01/01/2027, effective Abrechnungsmethode. Fetched 24/10/2026. The German text is quoted verbatim from Fedlex; the notes labelled "CGS relevance" are the English commentary of the research lane, not law. Absatz numbers (superscript in the original) are shown in bold; footnote markers appear as [fnN] with the footnote text under each article. This file is not tax advice.

## Sources

Method: the official Fedlex ELI pages (https://www.fedlex.admin.ch/eli/cc/2009/615/de and .../2009/828/de) return only a JavaScript shell (HTTP 200, 77 151 bytes, no law text; WebFetch returned only the "JavaScript required" notice). The law text was therefore taken from the static HTML rendition of the SAME consolidated versions that Fedlex serves from its filestore, and the existence of newer consolidations was checked against the Fedlex SPARQL endpoint.

| # | URL | HTTP | Stand / note |
|---|-----|------|--------------|
| 1 | https://www.fedlex.admin.ch/eli/cc/2009/615/de | 200 (JS shell only, no text) | MWSTG landing page; not usable as a text source |
| 2 | https://www.fedlex.admin.ch/eli/cc/2009/828/de | not fetched separately (same SPA pattern as #1) | MWSTV landing page |
| 3 | https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/2009/615/20250331/de/html/fedlex-data-admin-ch-eli-cc-2009-615-20250331-de-html.html | 200, 300 530 bytes | MWSTG vom 12. Juni 2009, Stand am 31. März 2025 = latest consolidation on Fedlex at fetch time. USED for all MWSTG text |
| 4 | https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/2009/615/20250101/de/html/fedlex-data-admin-ch-eli-cc-2009-615-20250101-de-html.html | 200, 299 721 bytes | MWSTG Stand am 1. Januar 2025; compared with #3: only Art. 18, 21 and 23 differ, and only by editorial footnotes (Berichtigungen of the Italian text) |
| 5 | same filestore pattern for MWSTG 20260101 and 20270101 | 200 but returns the SPA shell (77 151 bytes) | confirms no MWSTG consolidation after 31 March 2025 exists |
| 6 | https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/2009/828/20270101/de/html/fedlex-data-admin-ch-eli-cc-2009-828-20270101-de-html.html | 200, 310 263 bytes | MWSTV Stand am 1. Januar 2027 (already published; applies from the registration date 01/01/2027). USED for all MWSTV text |
| 7 | https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/2009/828/20250101/de/html/fedlex-data-admin-ch-eli-cc-2009-828-20250101-de-html.html | 200, 273 902 bytes | MWSTV Stand am 1. Januar 2025 (the version in force today, 24/10/2026); compared with #6, see "MWSTV version note" |
| 8 | https://fedlex.data.admin.ch/sparqlendpoint (consolidation dates of eli/cc/2009/615 and eli/cc/2009/828) | 200 | MWSTG consolidations: 2025-03-31, 2025-02-27, 2025-01-01, 2024-01-01 ...; MWSTV: 2027-01-01, 2025-01-01, 2024-07-01 ... |
| 9 | https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/2025/564/20260101/de/html/fedlex-data-admin-ch-eli-cc-2025-564-20260101-de-html.html | 200, 37 403 bytes | SR 631.014 Zinssatzverordnung EFD vom 10. September 2025, Stand am 1. Januar 2026 |
| 10 | https://www.estv.admin.ch/de/newnsb/bCxrY5LSQCuF | 200 (via WebFetch) | ESTV press release of 22/09/2026: interest rates unchanged for 2027 |

### MWSTV version note

Two MWSTV consolidations were fetched. The 2027-01-01 consolidation is quoted below because CGS registers on 01/01/2027. It is textually identical to the 2025-01-01 consolidation for every quoted article EXCEPT: Art. 106 Abs. 3 and Art. 127 Abs. 1 lit. g (cross-reference corrected from "Art. 81 Abs. 6" to "Abs. 5" / "Abs. 4 und 5") and Art. 123 Abs. 2 (lit. a, c, d, f - group taxation, SSS, flat-rate method, deregistration - empty in the 2025 consolidation, in force from 01/01/2027). Footnote numbering differs between the two files. The task brief cited MWSTV Art. 45-46 for Einlageentsteuerung and Art. 59-66 for Vorsteuer; in the current numbering Einlageentsteuerung is MWSTV Art. 72-74, Eigenverbrauch Art. 69-71, Vorsteuer Art. 58-68, and Art. 45/46 deal with foreign currency and credit-card commissions. The sections below follow the current numbering.

### Not-in-force flags

- MWSTG Art. 34 Abs. 3 (fiscal year as Steuerperiode): footnote 101 "Noch nicht in Kraft".
- MWSTV Art. 76: Fedlex shows only "Tritt zu einem späteren Zeitpunkt in Kraft" (no text).

## MWSTG Art. 1 — Gegenstand und Grundsätze

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_1 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Der Bund erhebt eine allgemeine Verbrauchssteuer nach dem System der Netto-Allphasensteuer mit Vorsteuerabzug (Mehrwertsteuer). Die Steuer bezweckt die Besteuerung des nicht unternehmerischen Endverbrauchs im Inland.
**2** Als Mehrwertsteuer erhebt er:

 - a. eine Steuer auf den im Inland von steuerpflichtigen Personen gegen Entgelt erbrachten Leistungen (Inlandsteuer);
 - b.[fn3] eine Steuer auf dem Bezug von Leistungen im Inland, die von Unternehmen mit Sitz im Ausland erbracht werden, sowie auf dem Erwerb von Emissionsrechten und ähnlichen Rechten (Bezugsteuer);
 - c. eine Steuer auf der Einfuhr von Gegenständen (Einfuhrsteuer).
**3** Die Erhebung erfolgt nach den Grundsätzen:

 - a. der Wettbewerbsneutralität;
 - b. der Wirtschaftlichkeit der Entrichtung und der Erhebung;
 - c. der Überwälzbarkeit.

Footnotes as printed by Fedlex (amendment provenance):
- fn3: Fassung gemäss Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).

**CGS relevance:** Scope clause: the Act levies Inlandsteuer (supplies in CH), Bezugsteuer (services bought from unregistered foreign suppliers) and Einfuhrsteuer (imports). Those are the three VAT touchpoints for CGS: CH sales and exports, foreign service purchases, Holstersmith/UPS imports.

## MWSTG Art. 3 — Begriffe

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_3 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

Im Sinne dieses Gesetzes bedeuten:

 - a. Inland: das schweizerische Staatsgebiet mit den Zollanschlussgebieten nach Artikel 3 Absatz 2 des Zollgesetzes vom 18. März 2005[fn4] (ZG);
 - b. Gegenstände: bewegliche und unbewegliche Sachen sowie Elektrizität, Gas, Wärme, Kälte und Ähnliches;
 - c. Leistung: die Einräumung eines verbrauchsfähigen wirtschaftlichen Wertes an eine Drittperson in Erwartung eines Entgelts, auch wenn sie von Gesetzes wegen oder aufgrund behördlicher Anordnung erfolgt;
 - d. Lieferung:

 - 1. Verschaffen der Befähigung, im eigenen Namen über einen Gegenstand wirtschaftlich zu verfügen,
 - 2. Abliefern eines Gegenstandes, an dem Arbeiten besorgt worden sind, auch wenn dieser Gegenstand dadurch nicht verändert, sondern bloss geprüft, geeicht, reguliert, in der Funktion kontrolliert oder in anderer Weise behandelt worden ist,
 - 3. Überlassen eines Gegenstandes zum Gebrauch oder zur Nutzung;
 - e. Dienstleistung: jede Leistung, die keine Lieferung ist; eine Dienstleistung liegt auch vor, wenn:

 - 1. immaterielle Werte und Rechte überlassen werden,
 - 2. eine Handlung unterlassen oder eine Handlung beziehungsweise ein Zustand geduldet wird;
 - f. Entgelt: Vermögenswert, den der Empfänger oder die Empfängerin oder an seiner oder ihrer Stelle eine Drittperson für den Erhalt einer Leistung aufwendet;
 - g.[fn5] hoheitliche Tätigkeit: Tätigkeit eines Gemeinwesens oder einer von einem Gemeinwesen eingesetzten Person oder Organisation, die nicht unternehmerischer Natur ist, namentlich nicht marktfähig ist und nicht im Wettbewerb mit Tätigkeiten privater Anbieter steht, selbst wenn für die Tätigkeit Gebühren, Beiträge oder sonstige Abgaben erhoben werden;
 - h.[fn6] eng verbundene Personen:

 - 1. die Inhaber und Inhaberinnen von mindestens 20 Prozent des Stamm- oder Grundkapitals eines Unternehmens oder von einer entsprechenden Beteiligung an einer Personengesellschaft oder ihnen nahestehende Personen,
 - 2. Stiftungen und Vereine, zu denen eine besonders enge wirtschaftliche, vertragliche oder personelle Beziehung besteht; nicht als eng verbundene Personen gelten Vorsorgeeinrichtungen;
 - i.[fn7] Spende: freiwillige Zuwendung in der Absicht, den Empfänger oder die Empfängerin zu bereichern ohne Erwartung einer Gegenleistung im mehrwertsteuerlichen Sinne; eine Zuwendung gilt auch dann als Spende, wenn:

 - 1. die Zuwendung in einer Publikation in neutraler Form einmalig oder mehrmalig erwähnt wird, selbst wenn dabei die Firma oder das Logo des Spenders oder der Spenderin verwendet wird,
 - 2. es sich um Beiträge von Passivmitgliedern sowie von Gönnern und Gönnerinnen an Vereine oder an gemeinnützige Organisationen handelt; Beiträge von Gönnern und Gönnerinnen an gemeinnützige Organisationen gelten auch dann als Spende, wenn die gemeinnützige Organisation ihren Gönnern und Gönnerinnen freiwillig Vorteile im Rahmen des statutarischen Zwecks gewährt, sofern sie dem Gönner oder der Gönnerin mitteilt, dass kein Anspruch auf die Vorteile besteht;
 - j. gemeinnützige Organisation: Organisation, die die Voraussetzungen erfüllt, welche gemäss Artikel 56 Buchstabe g DBG für die direkte Bundessteuer gelten;
 - k. Rechnung: jedes Dokument, mit dem gegenüber einer Drittperson über das Entgelt für eine Leistung abgerechnet wird, gleichgültig, wie dieses Dokument im Geschäftsverkehr bezeichnet wird;
 - l.[fn8] elektronische Plattform: elektronische Schnittstelle, die online direkte Kontakte zwischen mehreren Personen ermöglicht mit dem Ziel, eine Lieferung oder eine Dienstleistung zu erbringen.

Footnotes as printed by Fedlex (amendment provenance):
- fn4: SR 631.0
- fn5: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn6: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn7: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn8: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).

**CGS relevance:** Lit. d defines Lieferung (Ziff. 1 = sale of a holster; Ziff. 2 = delivery of an object on which work was done, relevant if CGS ever works on customer-supplied items). Lit. k defines what counts as a Rechnung; lit. l defines 'elektronische Plattform' (used by Art. 20a).

## MWSTG Art. 7 — Ort der Lieferung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_7 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Als Ort einer Lieferung gilt der Ort, an dem:

 - a. sich der Gegenstand zum Zeitpunkt der Verschaffung der Befähigung, über ihn wirtschaftlich zu verfügen, der Ablieferung oder der Überlassung zum Gebrauch oder zur Nutzung befindet;
 - b. die Beförderung oder Versendung des Gegenstandes zum Abnehmer oder zur Abnehmerin oder in dessen oder deren Auftrag zu einer Drittperson beginnt.
**2** Als Ort der Lieferung von Elektrizität in Leitungen, Gas über das Erdgasverteilnetz und Fernwärme gilt der Ort, an dem der Empfänger oder die Empfängerin der Lieferung den Sitz der wirtschaftlichen Tätigkeit oder eine Betriebsstätte hat, für welche die Lieferung erbracht wird, oder in Ermangelung eines solchen Sitzes oder einer solchen Betriebsstätte der Ort, an dem die Elektrizität, das Gas oder die Fernwärme tatsächlich genutzt oder verbraucht wird.[fn13]
**3** Bei der Lieferung eines Gegenstands vom Ausland ins Inland gilt der Ort der Lieferung als im Inland gelegen, sofern der Leistungserbringer oder die Leistungserbringerin:

 - a. über eine Bewilligung der Eidgenössischen Steuerverwaltung (ESTV) verfügt, die Einfuhr im eigenen Namen vorzunehmen (Unterstellungserklärung), und im Zeitpunkt der Einfuhr nicht darauf verzichtet; oder
 - b. mit Gegenständen, die nach Artikel 53 Absatz 1 Buchstabe a aufgrund des geringfügigen Steuerbetrags von der Einfuhrsteuer befreit sind, Lieferungen nach Absatz 1 Buchstabe b des vorliegenden Artikels erbringt und daraus mindestens einen Umsatz von 100 000 Franken pro Jahr erzielt.[fn14]

Footnotes as printed by Fedlex (amendment provenance):
- fn13: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn14: Eingefügt durch Ziff. I des BG vom 30. Sept. 2016, Bst. a in Kraft seit 1. Jan. 2018 und Bst. b in Kraft seit 1. Jan. 2019 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** Place of supply: where the object is when the buyer obtains the power of disposal, or where transport/dispatch to the buyer begins (Abs. 1). A holster shipped from the CGS workshop starts its journey in CH, so the supply is located in CH and is then relieved by Art. 23 if exported. Abs. 3 (foreign sender delivering into CH) concerns foreign sellers, not CGS.

## MWSTG Art. 10 — Grundsatz

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_10 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Steuerpflichtig ist, wer unabhängig von Rechtsform, Zweck und Gewinnabsicht ein Unternehmen betreibt und:

 - a. mit diesem Unternehmen Leistungen im Inland erbringt; oder
 - b. Sitz, Wohnsitz oder Betriebsstätte im Inland hat.[fn17]
**1bis** Ein Unternehmen betreibt, wer:

 - a. eine auf die nachhaltige Erzielung von Einnahmen aus Leistungen ausgerichtete berufliche oder gewerbliche Tätigkeit selbstständig ausübt, unabhängig von der Höhe des Zuflusses von Mitteln, die nach Artikel 18 Absatz 2 nicht als Entgelt gelten; und
 - b. unter eigenem Namen nach aussen auftritt.[fn18]
**1ter** Das Erwerben, Halten und Veräussern von Beteiligungen nach Artikel 29 Absätze 2 und 3 stellt eine unternehmerische Tätigkeit dar.[fn19]
**2** Von der Steuerpflicht ist befreit, wer:

 - a. innerhalb eines Jahres im In- und Ausland weniger als 100 000 Franken Umsatz aus Leistungen erzielt, die nicht nach Artikel 21 Absatz 2 von der Steuer ausgenommen sind;
 - b. ein Unternehmen mit Sitz, Wohnsitz oder Betriebsstätte im Ausland betreibt, das im Inland, unabhängig vom Umsatz, ausschliesslich eine oder mehrere der folgenden Leistungsarten erbringt:[fn20]

 - 1. von der Steuer befreite Leistungen,
 - 1bis.[fn21] von der Steuer ausgenommene Leistungen,
 - 2. Dienstleistungen, deren Ort sich nach Artikel 8 Absatz 1 im Inland befindet; nicht von der Steuerpflicht befreit ist jedoch, wer Telekommunikations- oder elektronische Dienstleistungen an nicht steuerpflichtige Empfänger und Empfängerinnen erbringt,
 - 3. Lieferung von Elektrizität in Leitungen, Gas über das Erdgasverteilnetz und Fernwärme an steuerpflichtige Personen im Inland;
 - c.[fn22] als nicht gewinnstrebiger, ehrenamtlich geführter Sport- oder Kulturverein oder als gemeinnützige Organisation innerhalb eines Jahres im In- und Ausland weniger als 250 000 Franken Umsatz aus Leistungen erzielt, die nicht nach Artikel 21 Absatz 2 von der Steuer ausgenommen sind;
 - d.[fn23] ein Unternehmen mit Sitz, Wohnsitz oder Betriebsstätte im Inland betreibt, das im Inland ausschliesslich von der Steuer ausgenommene Leistungen erbringt.[fn24]
**2bis** Der Umsatz berechnet sich nach den vereinbarten Entgelten ohne die Steuer.[fn25]
**3** Der Sitz im Inland sowie alle inländischen Betriebsstätten bilden zusammen ein Steuersubjekt.

Footnotes as printed by Fedlex (amendment provenance):
- fn17: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn18: Eingefügt durch Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn19: Eingefügt durch Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn20: Fassung gemäss Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).
- fn21: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).
- fn22: Fassung gemäss Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).
- fn23: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).
- fn24: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn25: Eingefügt durch Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** Core registration test: liability at CHF 100'000 worldwide turnover per year from non-exempt supplies (Abs. 2 lit. a); turnover is measured on agreed prices excluding VAT (Abs. 2bis). Exports under Art. 23 count toward the CHF 100'000 because only Art. 21 Abs. 2 supplies are excluded. Sole proprietors qualify as 'Unternehmen' (Abs. 1, 1bis).

## MWSTG Art. 11 — Verzicht auf die Befreiung von der Steuerpflicht

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_11 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Wer ein Unternehmen betreibt und nach Artikel 10 Absatz 2 oder 12 Absatz 3 von der Steuerpflicht befreit ist, hat das Recht, auf die Befreiung von der Steuerpflicht zu verzichten.
**2** Auf die Befreiung von der Steuerpflicht muss mindestens während einer Steuerperiode verzichtet werden.

**CGS relevance:** Voluntary registration: a business below the threshold may waive the exemption and become liable; the waiver binds for at least one Steuerperiode (Abs. 2). Relevant if CGS wants input-tax refunds before the threshold forces registration.

## MWSTG Art. 14 — Beginn und Ende der Steuerpflicht und der Befreiung von der Steuerpflicht

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_14 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die Steuerpflicht beginnt:

 - a. für Unternehmen mit Sitz, Wohnsitz oder Betriebsstätte im Inland: mit der Aufnahme der unternehmerischen Tätigkeit;
 - b. für alle anderen Unternehmen: mit dem erstmaligen Erbringen einer Leistung im Inland.[fn28]
**2** Die Steuerpflicht endet:

 - a. für Unternehmen mit Sitz, Wohnsitz oder Betriebsstätte im Inland:

 - 1. mit der Beendigung der unternehmerischen Tätigkeit,
 - 2. bei Vermögensliquidation: mit Abschluss des Liquidationsverfahrens;
 - b. für alle anderen Unternehmen: am Schluss des Kalenderjahres, in dem letztmals eine Leistung im Inland erbracht wird.[fn29]
**3** Die Befreiung von der Steuerpflicht endet, sobald das Total der im letzten Geschäftsjahr erzielten Umsätze die Grenze von Artikel 10 Absatz 2 Buchstabe a oder c oder 12 Absatz 3 erreicht hat oder absehbar ist, dass diese Grenze innerhalb von 12 Monaten nach der Aufnahme oder Ausweitung der unternehmerischen Tätigkeit überschritten wird.
**4** Der Verzicht auf die Befreiung von der Steuerpflicht kann frühestens auf den Beginn der laufenden Steuerperiode erklärt werden.
**5** Unterschreitet der massgebende Umsatz der steuerpflichtigen Person die Umsatzgrenze nach Artikel 10 Absatz 2 Buchstabe a oder c oder 12 Absatz 3 und ist zu erwarten, dass der massgebende Umsatz auch in der folgenden Steuerperiode nicht mehr erreicht wird, so muss sich die steuerpflichtige Person abmelden. Die Abmeldung ist frühestens möglich auf das Ende der Steuerperiode, in der der massgebende Umsatz nicht erreicht worden ist. Die Nichtabmeldung gilt als Verzicht auf die Befreiung von der Steuerpflicht nach Artikel 11. Der Verzicht gilt ab Beginn der folgenden Steuerperiode.

Footnotes as printed by Fedlex (amendment provenance):
- fn28: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn29: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** Abs. 1 lit. a: liability of a domestic business begins on starting the business activity. Abs. 3: the exemption ends as soon as turnover of the last Geschäftsjahr reaches the limit, or if exceeding it within 12 months of start/expansion is foreseeable. Abs. 4: a waiver takes effect from the start of the current Steuerperiode at the earliest. MWSTV Art. 9 adds the operative timing (exemption of an existing exempt business ends after the Geschäftsjahr in which the limit is reached). This article does not itself fix a calendar date; read with MWSTV Art. 9 and MWSTG Art. 66 Abs. 1 (30-day registration).

## MWSTG Art. 18 — Grundsatz

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_18 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Der Inlandsteuer unterliegen die im Inland durch steuerpflichtige Personen gegen Entgelt erbrachten Leistungen; sie sind steuerbar, soweit dieses Gesetz keine Ausnahme vorsieht.
**2** Mangels Leistung gelten namentlich die folgenden Mittelflüsse nicht als Entgelt:

 - a. Subventionen und andere öffentlich-rechtliche Beiträge, auch wenn sie gestützt auf einen Leistungsauftrag oder eine Programmvereinbarung gemäss Artikel 46 Absatz 2 der Bundesverfassung ausgerichtet werden;
 - b. Gelder, die Kur- und Verkehrsvereine ausschliesslich aus öffentlich-rechtlichen Tourismusabgaben erhalten und die sie im Auftrag von Gemeinwesen zugunsten der Allgemeinheit einsetzen;
 - c. Beiträge aus kantonalen Wasser-, Abwasser- oder Abfallfonds an Entsorgungsanstalten oder Wasserwerke;
 - d. Spenden;
 - e. Einlagen in Unternehmen, insbesondere zinslose Darlehen, Sanierungsleistungen und Forderungsverzichte;
 - f. Dividenden und andere Gewinnanteile;
 - g. vertraglich oder gesetzlich geregelte Kostenausgleichszahlungen, die durch eine Organisationseinheit, namentlich durch einen Fonds, an Akteure und Akteurinnen innerhalb einer Branche geleistet werden;
 - h. Pfandgelder, namentlich auf Umschliessungen und Gebinden;
 - i. Zahlungen für Schadenersatz, Genugtuung und dergleichen;
 - j. Entschädigungen für unselbstständig ausgeübte Tätigkeiten wie Verwaltungsrats- und Stiftungsratshonorare, Behördenentschädigungen oder Sold;
 - k. Erstattungen, Beiträge und Beihilfen bei Lieferungen ins Ausland, die nach Artikel 23 Absatz 2 Ziffer 1 von der Steuer befreit sind;
 - l. Gebühren, Beiträge oder sonstige Zahlungen, die für hoheitliche Tätigkeiten empfangen werden.
**3** Bezeichnet ein Gemeinwesen von ihm ausgerichtete Mittel gegenüber dem Empfänger oder der Empfängerin ausdrücklich als Subvention oder als anderen öffentlich-rechtlichen Beitrag, so gelten diese Mittel als Subvention oder als anderer öffentlich-rechtlicher Beitrag im Sinne von Absatz 2 Buchstabe a.[fn35]

Footnotes as printed by Fedlex (amendment provenance):
- fn35: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363). Die Berichtigung der RedK der BVers vom 19. Febr. 2025, veröffentlicht am 27. Febr. 2025 betrifft nur den italienischen Text (AS 2025 135).

**CGS relevance:** Abs. 2 lists money flows that are not Entgelt (e.g. subsidies, donations, public-law fees), so they are outside taxable turnover; relevant to the turnover test and, via Art. 33, to possible input-tax reduction. Abs. 1 states the Leistungsverhältnis (supply against consideration).

## MWSTG Art. 20a — Zuordnung von Leistungen bei Lieferungen über elektronische Plattformen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_20_a (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Wer mit Hilfe einer elektronischen Plattform eine Lieferung nach Artikel 3 Buchstabe d Ziffer 1 ermöglicht, indem er oder sie Verkäufer und Verkäuferinnen mit Käufern und Käuferinnen zu einem Vertragsabschluss auf der Plattform zusammenbringt, gilt gegenüber dem Käufer oder der Käuferin als Leistungserbringer oder Leistungserbringerin. In diesem Fall liegt sowohl zwischen dieser Person und dem Verkäufer oder der Verkäuferin als auch zwischen dieser Person und dem Käufer oder der Käuferin eine Lieferung vor.
**2** Nicht als Leistungserbringer oder Leistungserbringerin gilt, wer eine oder mehrere der nachfolgenden Bedingungen erfüllt:

 - a. Er oder sie ist weder unmittelbar noch mittelbar am Bestellvorgang beteiligt.
 - b. Er oder sie erzielt keinen Umsatz, der unmittelbar mit dem Geschäft zusammenhängt.
 - c. Er oder sie nimmt lediglich die Zahlungsabwicklung im Zusammenhang mit der Lieferung vor.
 - d. Er oder sie stellt lediglich Platz für Anzeigen zur Verfügung.
 - e. Er oder sie erbringt lediglich Werbeleistungen.
 - f. Er oder sie leitet lediglich Käufer und Käuferinnen auf andere elektronische Plattformen um oder weiter.

Footnotes as printed by Fedlex (amendment provenance):
- fn36: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).

**CGS relevance:** Platform rule (in force 01/01/2025): a platform that brings seller and buyer together on the platform and is involved in the order process (not merely payment, ads or redirecting, Abs. 2) is deemed the supplier toward the buyer, creating a Lieferung seller->platform and platform->buyer. Whether a marketplace CGS sells through (e.g. Etsy) falls under it is a separate factual question; CGS's own WooCommerce shop does not (CGS is the seller). Implementing rules: MWSTV Art. 43a, 63 Abs. 5, 77 Abs. 2 lit. g, 111b, 118 Abs. 1bis.

## MWSTG Art. 21 — Von der Steuer ausgenommene Leistungen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_21 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Eine Leistung, die von der Steuer ausgenommen ist und für deren Versteuerung nicht nach Artikel 22 optiert wird, ist nicht steuerbar.
**2** Von der Steuer ausgenommen sind:
 - 21. die Überlassung von Grundstücken und Grundstücksteilen zum Gebrauch oder zur Nutzung; steuerbar sind jedoch:

 - a. die Vermietung von Wohn- und Schlafräumen zur Beherbergung von Gästen sowie die Vermietung von Sälen im Hotel- und Gastgewerbe,
 - b. die Vermietung von Campingplätzen,
 - c. die Vermietung von nicht im Gemeingebrauch stehenden Plätzen für das Abstellen von Fahrzeugen, ausser es handle sich um eine unselbstständige Nebenleistung zu einer von der Steuer ausgenommenen Immobilienvermietung,
 - d. die Vermietung und Verpachtung von fest eingebauten Vorrichtungen und Maschinen, die zu einer Betriebsanlage, nicht jedoch zu einer Sportanlage gehören,
 - e. die Vermietung von Schliessfächern,
 - f. die Vermietung von Messestandflächen und einzelner Räume in Messe- und Kongressgebäuden;
 - 22. die Lieferung von im Inland gültigen Postwertzeichen und sonstigen amtlichen Wertzeichen höchstens zum aufgedruckten Wert;
 - 24. die Lieferung gebrauchter beweglicher Gegenstände, die ausschliesslich zur Erbringung von nach diesem Artikel von der Steuer ausgenommenen Leistungen verwendet wurden;

> [Excerpt only - remaining Absaetze/Ziffern omitted on instruction; the text above is verbatim.]

**CGS relevance:** Exempt-without-input-credit list. Per instruction only Abs. 1, the Abs. 2 lead-in and the items that can touch a goods retailer are quoted: Ziff. 21 (leasing of real estate; relevant to a workshop lease, taxable only if the landlord opts under Art. 22), Ziff. 22 (face-value postage stamps) and Ziff. 24 (used movables used exclusively for exempt activities). No item covers Kydex holster or accessory sales; CGS supplies are taxable (8.1%) or exempt-with-credit exports (Art. 23).

## MWSTG Art. 23 — Von der Steuer befreite Leistungen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_23 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Ist eine Leistung nach diesem Artikel von der Steuer befreit, so ist auf dieser Leistung keine Inlandsteuer geschuldet.
**2** Von der Steuer sind befreit:

 - 1. die Lieferung von Gegenständen mit Ausnahme der Überlassung zum Gebrauch oder zur Nutzung, die direkt ins Ausland befördert oder versendet werden;
 - 2.[fn70] die Überlassung zum Gebrauch oder zur Nutzung, namentlich die Vermietung und Vercharterung, von Gegenständen, sofern die Gegenstände vom Lieferungsempfänger oder von der Lieferungsempfängerin selbst überwiegend im Ausland genutzt werden;
 - 3.[fn71] die Lieferung von Gegenständen, die im Rahmen eines Transitverfahrens (Art. 49 ZG[^72]), Zolllagerverfahrens (Art. 50–57 ZG), Zollverfahrens der vorübergehenden Verwendung (Art. 58 ZG) oder der aktiven Veredelung (Art. 59 ZG) nachweislich im Inland unter Zollüberwachung standen, sofern das Verfahren ordnungsgemäss oder mit nachträglicher Bewilligung des Bundesamtes für Zoll und Grenzsicherheit (BAZG) abgeschlossen wurde;
 - 3bis.[fn73]die Lieferung von Gegenständen, die wegen Einlagerung in einem Zollfreilager (Art. 62–66 ZG) nachweislich im Inland unter Zollüberwachung standen und diesen Zollstatus nicht rückwirkend verloren haben;
 - 4. das Verbringen oder Verbringenlassen von Gegenständen ins Ausland, das nicht im Zusammenhang mit einer Lieferung steht;
 - 5. das mit der Einfuhr von Gegenständen im Zusammenhang stehende Befördern oder Versenden von Gegenständen und alle damit zusammenhängenden Leistungen bis zum Bestimmungsort, an den die Gegenstände im Zeitpunkt der Entstehung der Steuerschuld nach Artikel 56 zu befördern sind; entsteht keine Steuerschuld, so gilt für den massgebenden Zeitpunkt Artikel 69 ZG sinngemäss;
 - 6. das mit der Ausfuhr von Gegenständen des zollrechtlich freien Verkehrs im Zusammenhang stehende Befördern oder Versenden von Gegenständen und alle damit zusammenhängenden Leistungen;
 - 7.[fn74] Beförderungsleistungen und Nebentätigkeiten des Logistikgewerbes wie Beladen, Entladen, Umschlagen, Abfertigen oder Zwischenlagern:

 - a. bei denen der Ort der Dienstleistung nach Artikel 8 Absatz 1 im Inland liegt, die Dienstleistung selbst aber ausschliesslich im Ausland ausgeführt wird, oder
 - b. die im Zusammenhang mit Gegenständen unter Zollüberwachung erbracht werden;
 - 8. die Lieferung von Luftfahrzeugen an Luftverkehrsunternehmen, die gewerbsmässige Luftfahrt im Beförderungs- oder Charterverkehr betreiben und deren Umsätze aus internationalen Flügen jene aus dem Binnenluftverkehr übertreffen; Umbauten, Instandsetzungen und Wartungen an Luftfahrzeugen, die solche Luftverkehrsunternehmen im Rahmen einer Lieferung erworben haben; Lieferungen, Instandsetzungen und Wartungen der in diese Luftfahrzeuge eingebauten Gegenstände oder der Gegenstände für ihren Betrieb; Lieferungen von Gegenständen zur Versorgung dieser Luftfahrzeuge sowie Dienstleistungen, die für den unmittelbaren Bedarf dieser Luftfahrzeuge und ihrer Ladungen bestimmt sind;
 - 9. die Dienstleistungen von ausdrücklich in fremdem Namen und für fremde Rechnung handelnden Vermittlern und Vermittlerinnen, wenn die vermittelte Leistung entweder nach diesem Artikel von der Steuer befreit ist oder ausschliesslich im Ausland bewirkt wird; wird die vermittelte Leistung sowohl im Inland als auch im Ausland bewirkt, so ist nur der Teil der Vermittlung von der Steuer befreit, der auf Leistungen im Ausland oder auf Leistungen, die nach diesem Artikel von der Steuer befreit sind, entfällt;
 - 10. in eigenem Namen erbrachte Dienstleistungen von Reisebüros und Organisatoren von Veranstaltungen, soweit sie Lieferungen und Dienstleistungen Dritter in Anspruch nehmen, die von diesen im Ausland bewirkt werden; werden diese Leistungen Dritter sowohl im Inland als auch im Ausland erbracht, so ist nur der Teil der Dienstleistung des Reisebüros oder des Organisators von der Steuer befreit, der auf Leistungen im Ausland entfällt;
 - 11.[fn75] die Lieferung von Gegenständen nach Artikel 17 Absatz 1bis ZG an ins Ausland abfliegende oder aus dem Ausland ankommende Reisende;
 - 12.[fn76] die Umsätze, die mit Gold und Legierungen von Gold der folgenden Form erzielt werden:

 - a. staatlich geprägte Goldmünzen der Zolltarifnummern 7118.9010, 9705.3100 und 9705.3900[fn77],
 - b. Gold zu Anlagezwecken mit einem Mindestfeingehalt von 995 Tausendsteln, in Form von:

 - – gegossenen Barren, versehen mit der Angabe des Feingehalts und dem Stempelzeichen eines anerkannten Prüfer-Schmelzers oder
 - – gestanzten Plättchen, versehen mit der Angabe des Feingehalts und dem Stempelzeichen eines anerkannten Prüfer-Schmelzers oder einer in der Schweiz registrierten Verantwortlichkeitsmarke,
 - c. Gold in Form von Granalien mit einem Mindestfeingehalt von 995 Tausendsteln, die von einem anerkannten Prüfer-Schmelzer verpackt und versiegelt wurden,
 - d. Gold in Rohform oder in Form von Halbzeug, das zur Raffination oder Rückgewinnung bestimmt ist, sowie Gold in Form von Abfällen und Schrott,
 - e. Legierungen von Gold nach Buchstabe d, sofern sie zwei oder mehr Gewichtsprozent Gold oder, wenn Platin enthaltend, mehr Gold als Platin aufweisen;
 - 13.[fn78] die Lieferung von Gegenständen durch einen Verkäufer oder eine Verkäuferin, die mit Hilfe einer elektronischen Plattform ermöglicht wird, sofern die Person, die die Lieferung ermöglicht hat, nach Artikel 20a als Leistungserbringerin gilt und im Register der steuerpflichtigen Personen eingetragen ist.
**3** Direkte Ausfuhr nach Absatz 2 Ziffer 1 liegt vor, wenn der Gegenstand der Lieferung ohne Ingebrauchnahme im Inland ins Ausland ausgeführt oder in ein offenes Zolllager oder Zollfreilager ausgeführt wird. Bei Reihengeschäften erstreckt sich die direkte Ausfuhr auf alle beteiligten Lieferanten und Lieferantinnen. Der Gegenstand der Lieferung kann vor der Ausfuhr durch Beauftragte des nicht steuerpflichtigen Abnehmers oder der nicht steuerpflichtigen Abnehmerin bearbeitet oder verarbeitet werden.
**4** Der Bundesrat kann zur Wahrung der Wettbewerbsneutralität Beförderungen im grenzüberschreitenden Luft-, Eisenbahn- und Busverkehr von der Steuer befreien.
**5** Das Eidgenössische Finanzdepartement (EFD) regelt die Bedingungen, unter denen Inlandlieferungen zwecks Ausfuhr im Reiseverkehr von der Steuer befreit sind, und legt die hierfür erforderlichen Nachweise fest. Die Nachweise können in elektronischer Form erbracht werden.[fn79]

Footnotes as printed by Fedlex (amendment provenance):
- fn70: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn71: Fassung gemäss Ziff. I 18 der V vom 12. Juni 2020 über die Anpassung von Gesetzen infolge der Änderung der Bezeichnung der Eidgenössischen Zollverwaltung im Rahmen von deren Weiterentwicklung, in Kraft seit 1. Jan. 2022 (AS 2020 2743).
- fn72: SR 631.0
- fn73: Eingefügt durch Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn74: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn75: Eingefügt durch Ziff. I 2 des BG vom 17. Dez. 2010 über den Einkauf von Waren in Zoll-freiläden auf Flughäfen, in Kraft seit 1. Juni 2011 (AS 2011 1743; BBl 2010 2169).
- fn76: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).
- fn77: SR 632.10 Anhang
- fn78: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).
- fn79: Zweiter Satz eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).

**CGS relevance:** Exports are exempt: Abs. 2 Ziff. 1 covers goods transported or shipped directly abroad. Abs. 3 defines 'direkte Ausfuhr': object leaves CH without being used in CH; the non-taxable foreign buyer's agents may process it first. Exempt supplies under Art. 23 do NOT exclude input-tax deduction (Art. 29 only excludes Art. 21 supplies). The documentary proof (Nachweis) of export is not detailed here; see gaps.

## MWSTG Art. 24 — Bemessungsgrundlage

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_24 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die Steuer wird vom tatsächlich empfangenen Entgelt berechnet. Zum Entgelt gehören namentlich auch der Ersatz aller Kosten, selbst wenn diese gesondert in Rechnung gestellt werden, sowie die von der steuerpflichtigen Person geschuldeten öffentlich-rechtlichen Abgaben. Die Absätze 2 und 6 bleiben vorbehalten.
**2** Bei Leistungen an eng verbundene Personen (Art. 3 Bst. h) gilt als Entgelt der Wert, der unter unabhängigen Dritten vereinbart würde.
**3** Bei Tauschverhältnissen gilt der Marktwert jeder Leistung als Entgelt für die andere Leistung.
**4** Bei Austauschreparaturen umfasst das Entgelt lediglich den Werklohn für die ausgeführte Arbeit.
**5** Bei Leistungen an Zahlungs statt gilt als Entgelt der Betrag, der dadurch ausgeglichen wird.
**5bis** Gilt eine Person als Leistungserbringerin nach Artikel 20a, so entspricht das Entgelt für die Lieferung, die sie ermöglicht hat, dem Wert, den sie dem Käufer oder der Käuferin des Gegenstandes mitgeteilt hat.[fn80]
**6** Nicht in die Bemessungsgrundlage einbezogen werden:

 - a. Billettsteuern, Handänderungssteuern sowie die auf der Leistung geschuldete Mehrwertsteuer selbst;
 - b. Beträge, welche die steuerpflichtige Person von der die Leistung empfangenden Person als Erstattung der in deren Namen und für deren Rechnung getätigten Auslagen erhält, sofern sie diese gesondert ausweist (durchlaufende Posten);
 - c. der Anteil des Entgelts, der bei der Veräusserung eines unbeweglichen Gegenstandes auf den Wert des Bodens entfällt;
 - d. die im Preis für Entsorgungs- und Versorgungsleistungen eingeschlossenen kantonalen Abgaben an Wasser-, Abwasser- oder Abfallfonds, soweit diese Fonds daraus an Entsorgungsanstalten oder Wasserwerke Beiträge ausrichten.

Footnotes as printed by Fedlex (amendment provenance):
- fn80: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).

**CGS relevance:** Tax base is consideration actually received, including all costs even if invoiced separately (e.g. shipping and packaging billed to the customer, Abs. 1), excluding the VAT itself and genuine pass-through items (Abs. 6 lit. b). Affects how CGS treats shipping lines on invoices.

## MWSTG Art. 25 — Steuersätze

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_25 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die Steuer beträgt 8,1 Prozent (Normalsatz); vorbehalten bleiben die Absätze 2 und 3.[fn82]
**2** Der reduzierte Steuersatz von 2,6 Prozent findet Anwendung:[fn83]

 - a. auf der Lieferung folgender Gegenstände:

 - 1. Wasser in Leitungen,
 - 2.[fn84] Lebensmittel nach dem Lebensmittelgesetz vom 20. Juni 2014[fn85], mit Ausnahme alkoholischer Getränke,
 - 3. Vieh, Geflügel, Fische,
 - 4. Getreide,
 - 5. Sämereien, Setzknollen und -zwiebeln, lebende Pflanzen, Stecklinge, Pfropfreiser sowie Schnittblumen und Zweige, auch zu Arrangements, Sträussen, Kränzen und dergleichen veredelt; gesonderte Rechnungsstellung vorausgesetzt, unterliegt die Lieferung dieser Gegenstände auch dann dem reduzierten Steuersatz, wenn sie in Kombination mit einer zum Normalsatz steuerbaren Leistung erbracht wird,
 - 6. Futtermittel, Silagesäuren, Streumittel für Tiere,
 - 7. Dünger, Pflanzenschutzmittel, Mulch und anderes pflanzliches Abdeckmaterial,
 - 8. Medikamente,
 - 9. Zeitungen, Zeitschriften, Bücher und andere Druckerzeugnisse ohne Reklamecharakter der vom Bundesrat zu bestimmenden Arten,
 - 10.[fn86] Produkte für die Monatshygiene;
 - abis.[fn87] auf elektronische Zeitungen, Zeitschriften und Bücher ohne Reklamecharakter der vom Bundesrat zu bestimmenden Arten;
 - b. auf den Dienstleistungen der Radio- und Fernsehgesellschaften, mit Ausnahme der Dienstleistungen mit gewerblichem Charakter;
 - c. auf den Leistungen nach Artikel 21 Absatz 2 Ziffern 14–16;
 - d. auf den Leistungen im Bereich der Landwirtschaft, die in einer mit der Urproduktion in unmittelbarem Zusammenhang stehenden Bearbeitung des Bodens oder Bearbeitung von mit dem Boden verbundenen Erzeugnissen der Urproduktion bestehen.
**3** Für Lebensmittel, die im Rahmen von gastgewerblichen Leistungen abgegeben werden, gilt der Normalsatz. Als gastgewerbliche Leistung gilt die Abgabe von Lebensmitteln, wenn die steuerpflichtige Person sie beim Kunden oder bei der Kundin zubereitet beziehungsweise serviert oder wenn sie für deren Konsum an Ort und Stelle besondere Vorrichtungen bereithält. Sind Lebensmittel, mit Ausnahme alkoholischer Getränke, zum Mitnehmen oder zur Auslieferung bestimmt, so findet der reduzierte Steuersatz Anwendung, sofern geeignete organisatorische Massnahmen zur Abgrenzung dieser Leistungen von den gastgewerblichen Leistungen getroffen worden sind; andernfalls gilt der Normalsatz. Werden Lebensmittel, mit Ausnahme alkoholischer Getränke, in Verpflegungsautomaten angeboten, so findet der reduzierte Steuersatz Anwendung.[fn88]
**4** Die Steuer auf Beherbergungsleistungen beträgt 3,8 Prozent (Sondersatz).[fn89] Der Sondersatz gilt bis zum 31. Dezember 2020 oder, sofern die Frist nach Artikel 196 Ziffer 14 Absatz 1 Bundesverfassung verlängert wird, bis längstens zum 31. Dezember 2027. Als Beherbergungsleistung gilt die Gewährung von Unterkunft einschliesslich der Abgabe eines Frühstücks, auch wenn dieses separat berechnet wird.[fn90]
**5** Der Bundesrat bestimmt die in Absatz 2 bezeichneten Gegenstände und Dienstleistungen näher; dabei beachtet er das Gebot der Wettbewerbsneutralität.

Footnotes as printed by Fedlex (amendment provenance):
- fn82: Fassung gemäss Ziff. I der V vom 9. Dez. 2022 über die Anhebung der Mehrwertsteuer- sätze zur Zusatzfinanzierung der AHV, in Kraft seit 1. Jan. 2024 (AS 2022 863).
- fn83: Fassung gemäss Ziff. I der V vom 9. Dez. 2022 über die Anhebung der Mehrwertsteuer- sätze zur Zusatzfinanzierung der AHV, in Kraft seit 1. Jan. 2024 (AS 2022 863).
- fn84: Fassung gemäss Anhang Ziff. II 3 des Lebensmittelgesetzes vom 20. Juni 2014, in Kraft seit 1. Mai 2017 (AS 2017 249; BBl 2011 5571).
- fn85: SR 817.0
- fn86: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).
- fn87: Eingefügt durch Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn88: Fassung gemäss Ziff. IV des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn89: Fassung gemäss Ziff. I der V vom 9. Dez. 2022 über die Anhebung der Mehrwertsteuer- sätze zur Zusatzfinanzierung der AHV, in Kraft seit 1. Jan. 2024 (AS 2022 863).
- fn90: Fassung gemäss Ziff. II 1 des BG vom 16. Juni 2017, in Kraft seit 1. Jan. 2018 (AS 2017 7667; BBl 2017 3429, 3443).

**CGS relevance:** Rates in force: normal 8.1%, reduced 2.6% (food, books, medication etc.), accommodation 3.8% (special rate only until 31/12/2027 at the latest). Holsters, Kydex goods and accessories are not in the Abs. 2 list, so 8.1% applies. The rate rise effective 01/01/2024 is documented in footnote 82.

## MWSTG Art. 26 — Rechnung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_26 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Der Leistungserbringer oder die Leistungserbringerin hat dem Leistungsempfänger oder der Leistungsempfängerin auf Verlangen eine Rechnung auszustellen, die den Anforderungen nach den Absätzen 2 und 3 genügt.
**2** Die Rechnung muss den Leistungserbringer oder die Leistungserbringerin, den Leistungsempfänger oder die Leistungsempfängerin und die Art der Leistung eindeutig identifizieren und in der Regel folgende Elemente enthalten:

 - a.[fn91] den Namen und den Ort des Leistungserbringers oder der Leistungserbringerin, wie er oder sie im Geschäftsverkehr auftritt, den Hinweis, dass er oder sie im Register der steuerpflichtigen Personen eingetragen ist, sowie die Nummer, unter der er oder sie eingetragen ist;
 - b. den Namen und den Ort des Leistungsempfängers oder der Leistungsempfängerin, wie er oder sie im Geschäftsverkehr auftritt;
 - c. Datum oder Zeitraum der Leistungserbringung, soweit diese nicht mit dem Rechnungsdatum übereinstimmen;
 - d. Art, Gegenstand und Umfang der Leistung;
 - e. das Entgelt für die Leistung;
 - f. den anwendbaren Steuersatz und den vom Entgelt geschuldeten Steuerbetrag; schliesst das Entgelt die Steuer ein, so genügt die Angabe des anwendbaren Steuersatzes.
**3** Bei Rechnungen, die von automatisierten Kassen ausgestellt werden (Kassenzettel), müssen die Angaben über den Leistungsempfänger oder die Leistungsempfängerin nicht aufgeführt sein, sofern das auf dem Beleg ausgewiesene Entgelt einen vom Bundesrat festzusetzenden Betrag nicht übersteigt.

Footnotes as printed by Fedlex (amendment provenance):
- fn91: Fassung gemäss Anhang Ziff. 2 des BG vom 18. Juni 2010 über die Unternehmens-Identifikationsnummer, in Kraft seit 1. Jan. 2011 (AS 2010 4989; BBl 2009 7855).

**CGS relevance:** Invoice content (Abs. 2): supplier name and place, statement that it is registered plus its registration number, customer name and place, date/period of supply if different from the invoice date, nature and scope of supply, consideration, applicable rate and tax amount (rate alone suffices if the price includes VAT). Applies to CGS invoices from registration (01/01/2027). Cash-register receipts up to the amount fixed by the Federal Council (MWSTV Art. 57: CHF 400) need no recipient data (Abs. 3).

## MWSTG Art. 27 — Unrichtiger oder unberechtigter Steuerausweis

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_27 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Wer nicht im Register der steuerpflichtigen Personen eingetragen ist oder wer das Meldeverfahren nach Artikel 38 anwendet, darf in Rechnungen nicht auf die Steuer hinweisen.
**2** Wer in einer Rechnung eine Steuer ausweist, obwohl er zu deren Ausweis nicht berechtigt ist, oder wer für eine Leistung eine zu hohe Steuer ausweist, schuldet die ausgewiesene Steuer, es sei denn:

 - a. es erfolgt eine Korrektur der Rechnung nach Absatz 4; oder
 - b.[fn92] er oder sie macht glaubhaft, dass dem Bund kein Steuerausfall entstanden ist; kein Steuerausfall entsteht namentlich, wenn der Rechnungsempfänger oder die Rechnungsempfängerin keinen Vorsteuerabzug vorgenommen hat oder die geltend gemachte Vorsteuer dem Bund zurückerstattet worden ist.
**3** Die Rechtsfolgen von Absatz 2 treten auch bei Gutschriften ein, soweit der Gutschriftsempfänger oder die Gutschriftsempfängerin einer unberechtigt ausgewiesenen Steuer oder einem zu hohen Steuerbetrag nicht schriftlich widerspricht.[fn93]
**4** Die nachträgliche Korrektur einer Rechnung kann innerhalb des handelsrechtlich Zulässigen durch ein empfangsbedürftiges Dokument erfolgen, das auf die ursprüngliche Rechnung verweist und diese widerruft.

Footnotes as printed by Fedlex (amendment provenance):
- fn92: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn93: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** While not on the register (i.e. before 01/01/2027) CGS may not show VAT on invoices (Abs. 1). Showing VAT without entitlement, or too much, makes the issuer owe the stated tax unless the invoice is corrected (Abs. 2, 4). Practical consequence: no VAT line on any invoice dated before the registration date.

## MWSTG Art. 28 — Grundsatz

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_28 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die steuerpflichtige Person kann im Rahmen ihrer unternehmerischen Tätigkeit, unter Vorbehalt der Artikel 29 und 33, die folgenden Vorsteuern abziehen:

 - a. die ihr in Rechnung gestellte Inlandsteuer;
 - b. die von ihr deklarierte Bezugsteuer (Art. 45–49);
 - c. die von ihr entrichtete oder zu entrichtende Einfuhrsteuer, die mit unbedingter Forderung veranlagt wurde oder die mit bedingter Forderung veranlagt wurde und fällig geworden ist, sowie die von ihr für die Einfuhr von Gegenständen deklarierte Steuer (Art. 52 und 63).
**2** Hat die steuerpflichtige Person bei nicht steuerpflichtigen Landwirten und Landwirtinnen, Forstwirten und Forstwirtinnen, Gärtnern und Gärtnerinnen, Viehhändlern und Viehhändlerinnen und Milchsammelstellen Erzeugnisse der Landwirtschaft, der Forstwirtschaft, der Gärtnerei, Vieh oder Milch im Rahmen ihrer zum Vorsteuerabzug berechtigenden unternehmerischen Tätigkeit bezogen, so kann sie als Vorsteuer 2,6 Prozent des ihr in Rechnung gestellten Betrags abziehen.[fn94]
**3** Der Abzug der Vorsteuer nach Absatz 1 ist zulässig, wenn die steuerpflichtige Person nachweist, dass sie die Vorsteuer bezahlt hat.[fn95]

Footnotes as printed by Fedlex (amendment provenance):
- fn94: Fassung gemäss Ziff. I der V vom 9. Dez. 2022 über die Anhebung der Mehrwertsteuer- sätze zur Zusatzfinanzierung der AHV, in Kraft seit 1. Jan. 2024 (AS 2022 863).
- fn95: Ursprünglich: Abs. 4. Ursprünglicher Abs. 3 aufgehoben durch Ziff. I des BG vom 30. Sept. 2016, mit Wirkung seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** Input-tax deduction: invoiced domestic VAT, self-declared Bezugsteuer, and import VAT paid or owed (Abs. 1 lit. a-c); deduction requires proof the input tax was paid (Abs. 3). Import VAT on Holstersmith parcels is deductible once CGS is registered; the timing rule is Art. 40 Abs. 4.

## MWSTG Art. 28a — Abzug fiktiver Vorsteuer

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_28_a (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die steuerpflichtige Person kann eine fiktive Vorsteuer abziehen, wenn:

 - a. sie im Rahmen ihrer zum Vorsteuerabzug berechtigenden unternehmerischen Tätigkeit einen individualisierbaren beweglichen Gegenstand bezieht; und
 - b. ihr beim Bezug des Gegenstands keine Mehrwertsteuer offen überwälzt wird.
**2** Die fiktive Vorsteuer wird auf dem von der steuerpflichtigen Person bezahlten Betrag berechnet. Der von ihr bezahlte Betrag versteht sich inklusive Steuer zu dem im Zeitpunkt des Bezugs anwendbaren Steuersatz.
**3** Für Gegenstände, die der Margenbesteuerung nach Artikel 24a unterliegen, können keine fiktiven Vorsteuern abgezogen werden.

Footnotes as printed by Fedlex (amendment provenance):
- fn96: Eingefügt durch Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** Fictitious input tax for individualisable movable goods bought without VAT being charged (e.g. from private persons or unregistered sellers), computed on the amount paid including tax (Abs. 2). Excluded for goods under margin taxation (Abs. 3). Not central to CGS's normal purchases.

## MWSTG Art. 29 — Ausschluss des Anspruchs auf Vorsteuerabzug

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_29 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Kein Anspruch auf Vorsteuerabzug besteht bei Leistungen und bei der Einfuhr von Gegenständen, die für die Erbringung von Leistungen, die von der Steuer ausgenommen sind und für deren Versteuerung nicht optiert wurde, verwendet werden.
**1bis** Der Vorsteuerabzug für Leistungen, die im Ausland erbracht wurden, ist im selben Umfang möglich, wie wenn sie im Inland erbracht worden wären und nach Artikel 22 für deren Versteuerung hätte optiert werden können.[fn97]
**1ter** Der Vorsteuerabzug für von Reisebüros weiterverkauften Reiseleistungen und die damit zusammenhängenden Dienstleistungen der Reisebüros ist möglich, sofern sie im Ausland bewirkt oder genutzt werden.[fn98]
**2** Ungeachtet von Absatz 1 besteht ein Anspruch auf Vorsteuerabzug im Rahmen der zum Vorsteuerabzug berechtigenden unternehmerischen Tätigkeit für das Erwerben, Halten und Veräussern von Beteiligungen sowie für Umstrukturierungen im Sinne von Artikel 19 oder 61 des BG vom 14. Dezember 1990[fn99] über die direkte Bundessteuer (DBG).
**3** Beteiligungen sind Anteile am Kapital anderer Unternehmen, die mit der Absicht dauernder Anlage gehalten werden und einen massgeblichen Einfluss vermitteln. Anteile von mindestens 10 Prozent am Kapital gelten als Beteiligung.
**4** Holdinggesellschaften können zur Ermittlung der abziehbaren Vorsteuer auf die zum Vorsteuerabzug berechtigende unternehmerische Tätigkeit der von ihnen gehaltenen Unternehmen abstellen.[fn100]

Footnotes as printed by Fedlex (amendment provenance):
- fn97: Eingefügt durch Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn98: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).
- fn99: SR 642.11
- fn100: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** Deduction is excluded only for inputs used for Art. 21 exempt supplies without option. CGS's taxable supplies and Art. 23 exports therefore carry full deduction rights (subject to the private-use correction under Art. 30).

## MWSTG Art. 30 — Gemischte Verwendung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_30 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Verwendet die steuerpflichtige Person Gegenstände, Teile davon oder Dienstleistungen auch ausserhalb ihrer unternehmerischen Tätigkeit oder innerhalb ihrer unternehmerischen Tätigkeit sowohl für Leistungen, die zum Vorsteuerabzug berechtigen, als auch für Leistungen, die vom Vorsteuerabzug ausgeschlossen sind, so hat sie den Vorsteuerabzug nach dem Verhältnis der Verwendung zu korrigieren.
**2** Wird eine solche Vorleistung zu einem überwiegenden Teil im Rahmen der unternehmerischen Tätigkeit verwendet für Leistungen, die zum Vorsteuerabzug berechtigen, so kann die Vorsteuer ungekürzt abgezogen und am Ende der Steuerperiode korrigiert werden (Art. 31).

**CGS relevance:** Mixed private/business use, or mixed taxable/non-deductible use, requires a proportional correction. Relevant for a sole proprietor using shared assets (vehicle, workshop, tools) partly privately.

## MWSTG Art. 31 — Eigenverbrauch

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_31 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Fallen die Voraussetzungen des Vorsteuerabzugs nachträglich weg (Eigenverbrauch), so ist der Vorsteuerabzug in demjenigen Zeitpunkt zu korrigieren, in welchem die Voraussetzungen hierfür weggefallen sind. Die früher in Abzug gebrachte Vorsteuer, einschliesslich ihrer als Einlageentsteuerung korrigierten Anteile, muss zurückerstattet werden.
**2** Eigenverbrauch liegt namentlich vor, wenn die steuerpflichtige Person aus ihrem Unternehmen Gegenstände oder Dienstleistungen dauernd oder vorübergehend entnimmt, sofern sie beim Bezug oder der Einlage des Ganzen oder seiner Bestandteile einen Vorsteuerabzug vorgenommen hat oder die Gegenstände oder Dienstleistungen im Rahmen des Meldeverfahrens nach Artikel 38 bezogen hat, und die:

 - a. sie ausserhalb ihrer unternehmerischen Tätigkeit, insbesondere für private Zwecke, verwendet;
 - b. sie für eine unternehmerische Tätigkeit verwendet, die nach Artikel 29 Absatz 1 nicht zum Vorsteuerabzug berechtigt;
 - c. sie unentgeltlich abgibt, ohne dass ein unternehmerischer Grund besteht; bei Geschenken bis 500 Franken pro Person und Jahr sowie bei Werbegeschenken und Warenmustern zur Erzielung steuerbarer oder von der Steuer befreiter Umsätze wird der unternehmerische Grund ohne weiteres vermutet;
 - d. sich bei Wegfall der Steuerpflicht noch in ihrer Verfügungsmacht befinden.
**3** Wurde der Gegenstand oder die Dienstleistung in der Zeit zwischen dem Empfang der Leistung und dem Wegfall der Voraussetzungen für den Vorsteuerabzug in Gebrauch genommen, so ist der Vorsteuerabzug im Umfang des Zeitwerts des Gegenstandes oder der Dienstleistung zu korrigieren. Zur Ermittlung des Zeitwertes wird der Vorsteuerbetrag linear für jedes abgelaufene Jahr bei beweglichen Gegenständen und bei Dienstleistungen um einen Fünftel, bei unbeweglichen Gegenständen um einen Zwanzigstel reduziert. Die buchmässige Behandlung ist nicht von Bedeutung. Der Bundesrat kann in begründeten Fällen Abweichungen von den Abschreibungsvorschriften festlegen.
**4** Wird ein Gegenstand nur vorübergehend ausserhalb der unternehmerischen Tätigkeit oder für eine nicht zum Vorsteuerabzug berechtigende unternehmerische Tätigkeit verwendet, so ist der Vorsteuerabzug im Umfang der Steuer, die auf einer einer unabhängigen Drittperson dafür in Rechnung gestellten Miete anfallen würde, zu korrigieren.

**CGS relevance:** Eigenverbrauch: input tax must be repaid when goods are withdrawn for private use (Abs. 2 lit. a) or given away without a business reason (lit. c). Gifts up to CHF 500 per person per year and promotional gifts/samples are presumed to have a business reason. Abs. 3: used items are corrected at Zeitwert (1/5 per elapsed year for movables).

## MWSTG Art. 32 — Einlageentsteuerung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_32 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Treten die Voraussetzungen des Vorsteuerabzugs nachträglich ein (Einlageentsteuerung), so kann der Vorsteuerabzug in der Abrechnungsperiode vorgenommen werden, in der die Voraussetzungen hierfür eingetreten sind. Die früher nicht in Abzug gebrachte Vorsteuer, einschliesslich ihrer als Eigenverbrauch korrigierten Anteile, kann abgezogen werden.
**2** Wurde der Gegenstand oder die Dienstleistung in der Zeit zwischen dem Empfang der Leistung oder der Einfuhr und dem Eintritt der Voraussetzungen für den Vorsteuerabzug in Gebrauch genommen, so beschränkt sich die abziehbare Vorsteuer auf den Zeitwert des Gegenstandes oder der Dienstleistung. Zur Ermittlung des Zeitwertes wird der Vorsteuerbetrag linear für jedes abgelaufene Jahr bei beweglichen Gegenständen und bei Dienstleistungen um einen Fünftel, bei unbeweglichen Gegenständen um einen Zwanzigstel reduziert. Die buchmässige Behandlung ist nicht von Bedeutung. Der Bundesrat kann in begründeten Fällen Abweichungen von den Abschreibungsvorschriften festlegen.
**3** Wird ein Gegenstand nur vorübergehend für eine zum Vorsteuerabzug berechtigende unternehmerische Tätigkeit verwendet, so kann der Vorsteuerabzug im Umfang der Steuer, die auf einer einer unabhängigen Drittperson dafür in Rechnung gestellten Miete anfallen würde, geltend gemacht werden.

**CGS relevance:** CRITICAL (Einlageentsteuerung): when the conditions for input-tax deduction arise later (e.g. at the start of liability), input tax not previously deducted can be deducted in the period they arise (Abs. 1). Items already in use are limited to their Zeitwert, reduced linearly by 1/5 per elapsed year for movables and services and 1/20 for immovables (Abs. 2). MWSTV Art. 72 adds: unused goods/services are fully correctable; 33% infrastructure surcharge on self-made goods; advice, bookkeeping, recruiting, management and advertising services are presumed consumed. Under the Saldosteuersatz method no Einlageentsteuerung is possible (MWSTV Art. 78 Abs. 5). ESTV practice on documenting opening stock is not part of this pack.

## MWSTG Art. 33 — Kürzung des Vorsteuerabzugs

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_33 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Mittelflüsse, die nicht als Entgelte gelten (Art. 18 Abs. 2), führen unter Vorbehalt von Absatz 2 zu keiner Kürzung des Vorsteuerabzugs.
**2** Die steuerpflichtige Person hat ihren Vorsteuerabzug verhältnismässig zu kürzen, wenn sie Gelder nach Artikel 18 Absatz 2 Buchstaben a–c erhält.

**CGS relevance:** Input-tax reduction only applies when subsidies or similar flows under Art. 18 Abs. 2 lit. a-c are received. Not relevant unless CGS receives such funding.

## MWSTG Art. 34 — Steuerperiode

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_34 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die Steuer wird je Steuerperiode erhoben.
**2** Als Steuerperiode gilt das Kalenderjahr.
**3** Die ESTV gestattet der steuerpflichtigen Person auf Antrag, das Geschäftsjahr als Steuerperiode heranzuziehen.[fn101]

Footnotes as printed by Fedlex (amendment provenance):
- fn101: Noch nicht in Kraft (AS 2009 5203).

**CGS relevance:** Steuerperiode = calendar year (Abs. 2). Abs. 3 (fiscal year as Steuerperiode) carries footnote 101 'Noch nicht in Kraft', so the calendar year is the only period today.

## MWSTG Art. 35 — Abrechnungsperiode

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_35 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Innerhalb der Steuerperiode erfolgt die Abrechnung der Steuer vierteljährlich. Bei der Abrechnung nach Saldosteuersätzen (Art. 37 Abs. 1 und 2) erfolgt die Abrechnung halbjährlich.[fn102]
**1bis** Auf Antrag der steuerpflichtigen Person erfolgt die Abrechnung:

 - a. bei regelmässigem Vorsteuerüberschuss: monatlich;
 - b. bei einem Umsatz von nicht mehr als 5 005 000 Franken pro Jahr aus steuerbaren Leistungen: jährlich.[fn103]
**2** Auf Antrag gestattet die ESTV in begründeten Fällen andere Abrechnungsperioden und setzt die Bedingungen dafür fest.

Footnotes as printed by Fedlex (amendment provenance):
- fn102: Fassung gemäss Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).
- fn103: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).

**CGS relevance:** Standard Abrechnungsperiode is quarterly (half-yearly under Saldosteuersatz). On request: monthly if regular input-tax surplus (Abs. 1bis lit. a), or ANNUAL if turnover from taxable supplies is not more than CHF 5'005'000 per year (lit. b, in force since 01/01/2025). Applies to CGS under the effective method; conditions in Art. 35a and MWSTV Art. 76a-76d; instalments in Art. 86a.

## MWSTG Art. 35a — Jährliche Abrechnung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_35_a (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die ESTV kann steuerpflichtigen Personen, die ihren Abrechnungs- und Zahlungspflichten nicht oder nur teilweise nachkommen, die Genehmigung zur Anwendung der jährlichen Abrechnung verweigern oder deren Genehmigung widerrufen.
**2** Die jährliche Abrechnung muss während mindestens einer ganzen Steuerperiode beibehalten werden.
**3** Wer von der jährlichen zur monatlichen, vierteljährlichen oder halbjährlichen Abrechnung wechselt, kann frühestens nach drei Steuerperioden wieder zur jährlichen Abrechnung wechseln.
**4** Wechsel sind jeweils auf den Beginn einer Steuerperiode möglich.

Footnotes as printed by Fedlex (amendment provenance):
- fn104: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).

**CGS relevance:** Annual reporting conditions: ESTV may refuse or revoke if filing/payment duties are not met (Abs. 1); must be kept for at least one full Steuerperiode (Abs. 2); after switching away, a return to annual reporting is possible only after three Steuerperioden (Abs. 3); changes only at the start of a Steuerperiode (Abs. 4). Application deadline for new registrants: MWSTV Art. 76a (60 days after receiving the VAT number).

## MWSTG Art. 36 — Effektive Abrechnungsmethode

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_36 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Grundsätzlich ist nach der effektiven Abrechnungsmethode abzurechnen.
**2** Bei Anwendung der effektiven Abrechnungsmethode berechnet sich die Steuerforderung nach der Differenz zwischen der geschuldeten Inlandsteuer, der Bezugsteuer (Art. 45) sowie der im Verlagerungsverfahren deklarierten Einfuhrsteuer (Art. 63) und dem Vorsteuerguthaben der entsprechenden Abrechnungsperiode.

**CGS relevance:** The effective method is the default (Abs. 1): payable tax = domestic tax + Bezugsteuer + deferred import tax minus the input-tax credit of the period (Abs. 2). This is the method CGS intends to use.

## MWSTG Art. 37 — Abrechnung nach Saldo- und nach Pauschalsteuersätzen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_37 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Wer als steuerpflichtige Person jährlich nicht mehr als 5 024 000 Franken Umsatz aus steuerbaren Leistungen erzielt und im gleichen Zeitraum nicht mehr als 108 000 Franken Steuern, berechnet nach dem für sie massgebenden Saldosteuersatz, zu bezahlen hat, kann nach der Saldosteuersatzmethode abrechnen.[fn105]
**2** Bei Anwendung der Saldosteuersatzmethode wird die Steuerforderung durch Multiplikation des Totals aller in einer Abrechnungsperiode erzielten steuerbaren Entgelte, einschliesslich Steuer, mit dem von der ESTV bewilligten Saldosteuersatz ermittelt.
**3** Die Saldosteuersätze berücksichtigen die branchenübliche Vorsteuerquote. Sie werden von der ESTV nach Konsultation der betroffenen Branchenverbände festgelegt.[fn106]
**4** Die Abrechnung nach der Saldosteuersatzmethode ist bei der ESTV zu beantragen und muss während mindestens einer Steuerperiode beibehalten werden. Entscheidet sich die steuerpflichtige Person für die effektive Abrechnungsmethode, so kann sie frühestens nach drei Jahren zur Saldosteuersatzmethode wechseln. Wechsel sind jeweils auf Beginn einer Steuerperiode möglich.
**5** Gemeinwesen und verwandte Einrichtungen, namentlich private Spitäler und Schulen oder konzessionierte Transportunternehmungen, sowie Vereine und Stiftungen können nach der Pauschalsteuersatzmethode abrechnen. Der Bundesrat regelt die Einzelheiten.

Footnotes as printed by Fedlex (amendment provenance):
- fn105: Fassung gemäss Ziff. I der V vom 9. Dez. 2022 über die Anhebung der Mehrwertsteuer- sätze zur Zusatzfinanzierung der AHV, in Kraft seit 1. Jan. 2024 (AS 2022 863).
- fn106: Fassung des zweiten Satzes gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** Saldosteuersatz (SSS) limits: at most CHF 5'024'000 turnover from taxable supplies AND at most CHF 108'000 tax at the applicable SSS rate per year (Abs. 1). SSS must be applied for and kept for at least one Steuerperiode; someone who chose the effective method can move to SSS at the earliest after three years; switches only at the start of a Steuerperiode (Abs. 4). Implementation: MWSTV Art. 77-96; the waiting periods were restarted on 01/01/2025 (MWSTV Art. 166e). This is the alternative CGS is NOT choosing. Note MWSTV Art. 78 Abs. 3: missing the 60-day notice at the start forces at least three full periods of effective accounting before SSS is possible.

## MWSTG Art. 38 — Meldeverfahren

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_38 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Übersteigt die auf dem Veräusserungspreis zum gesetzlichen Satz berechnete Steuer 10 000 Franken oder erfolgt die Veräusserung an eine eng verbundene Person, so hat die steuerpflichtige Person ihre Abrechnungs- und Steuerentrichtungspflicht in den folgenden Fällen durch Meldung zu erfüllen:

 - a.[fn107] bei Umstrukturierungen nach Artikel 19 oder 61 DBG[fn108];
 - b.[fn109] bei anderen Übertragungen eines Gesamt- oder eines Teilvermögens auf eine andere steuerpflichtige Person im Rahmen einer Gründung, einer Liquidation, einer Umstrukturierung, einer Geschäftsveräusserung oder eines im Fusionsgesetz vom 3. Oktober 2003[fn110] geregelten Rechtsgeschäfts.
**2** Der Bundesrat kann bestimmen, in welchen anderen Fällen das Meldeverfahren anzuwenden ist oder angewendet werden kann.
**3** Die Meldungen sind im Rahmen der ordentlichen Abrechnung vorzunehmen.
**4** Durch die Anwendung des Meldeverfahrens übernimmt der Erwerber oder die Erwerberin für die übertragenen Vermögenswerte die Bemessungsgrundlage und den zum Vorsteuerabzug berechtigenden Verwendungsgrad des Veräusserers oder der Veräussererin.
**5** Wurde in den Fällen von Absatz 1 das Meldeverfahren nicht angewendet und ist die Steuerforderung gesichert, so kann das Meldeverfahren nicht mehr angeordnet werden.

Footnotes as printed by Fedlex (amendment provenance):
- fn107: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn108: SR 642.11
- fn109: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn110: SR 221.301

**CGS relevance:** Notification procedure for transfers of a business or parts of it between registered persons without paying tax on the transfer. Relevant only if the sole proprietorship is later transferred to a company.

## MWSTG Art. 39 — Abrechnungsart

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_39 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Über die Steuer wird nach vereinbarten Entgelten abgerechnet.
**2** Die ESTV gestattet der steuerpflichtigen Person auf Antrag, über die Steuer nach vereinnahmten Entgelten abzurechnen.
**3** Die gewählte Abrechnungsart muss während mindestens einer Steuerperiode beibehalten werden.
**4** Die ESTV kann die steuerpflichtige Person verpflichten, nach vereinnahmten Entgelten abzurechnen, wenn:

 - a. diese zu einem erheblichen Teil Entgelte erhält, bevor sie die Leistung ausführt oder darüber Rechnung stellt; oder
 - b. der begründete Verdacht besteht, dass die steuerpflichtige Person die Abrechnung nach vereinbarten Entgelten missbraucht, um sich oder einer Drittperson einen unrechtmässigen Vorteil zu verschaffen.

**CGS relevance:** Default is accrual basis (vereinbarte Entgelte); cash basis (vereinnahmte Entgelte) on application; the chosen basis must be kept for at least one Steuerperiode (Abs. 3). ESTV can force cash basis in the cases of Abs. 4. Not requested by number but needed to read Art. 40.

## MWSTG Art. 40 — Entstehung der Steuerforderung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_40 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Im Falle der Abrechnung nach vereinbarten Entgelten entsteht der Anspruch auf Vorsteuerabzug im Zeitpunkt des Empfangs der Rechnung. Die Umsatzsteuerschuld entsteht:

 - a. mit der Rechnungsstellung;
 - b. mit der Ausgabe der Teilrechnung oder mit der Vereinnahmung der Teilzahlung, wenn die Leistungen zu aufeinander folgenden Teilrechnungen oder Teilzahlungen Anlass geben;
 - c. mit der Vereinnahmung des Entgelts bei Vorauszahlungen für nicht von der Steuer befreite Leistungen sowie bei Leistungen ohne Rechnungsstellung.
**2** Im Falle der Abrechnung nach vereinnahmten Entgelten entsteht der Anspruch auf Vorsteuerabzug im Zeitpunkt der Bezahlung. Die Umsatzsteuerschuld entsteht mit der Vereinnahmung des Entgelts.
**3** Der Anspruch auf Vorsteuerabzug aufgrund der Bezugsteuer entsteht im Zeitpunkt der Abrechnung über diese Bezugsteuer (Art. 48).[fn111]
**4** Der Anspruch auf Vorsteuerabzug aufgrund der Einfuhrsteuer entsteht am Ende der Abrechnungsperiode, in der die Steuer festgesetzt wurde.

Footnotes as printed by Fedlex (amendment provenance):
- fn111: Fassung gemäss Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).

**CGS relevance:** Timing: under accrual accounting (vereinbart) the input-tax claim arises on receipt of the invoice and output tax on invoicing (Abs. 1; for prepayments on receipt of payment); under cash accounting (vereinnahmt) both arise on payment/receipt (Abs. 2). Import-VAT deduction arises at the end of the Abrechnungsperiode in which the tax was assessed (Abs. 4). Bezugsteuer deduction arises at the Bezugsteuer settlement (Abs. 3).

## MWSTG Art. 41 — Nachträgliche Änderung der Umsatzsteuerschuld und des Vorsteuerabzugs

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_41 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Wird das vom Leistungsempfänger oder der Leistungsempfängerin bezahlte oder mit ihm oder ihr vereinbarte Entgelt korrigiert, so ist im Zeitpunkt, in dem die Korrektur verbucht oder das korrigierte Entgelt vereinnahmt wird, eine Anpassung der Umsatzsteuerschuld vorzunehmen.
**2** Wird das von der steuerpflichtigen Person aufgewendete Entgelt korrigiert, so ist im Zeitpunkt, in dem die Korrektur verbucht oder das korrigierte Entgelt bezahlt wird, eine Anpassung des Vorsteuerabzuges vorzunehmen.

**CGS relevance:** Price reductions, credit notes and similar corrections adjust output tax (Abs. 1) or input tax (Abs. 2) in the period the correction is booked or paid. Not requested by number; included next to Art. 40.

## MWSTG Art. 42 — Festsetzungsverjährung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_42 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Das Recht, eine Steuerforderung festzusetzen, verjährt fünf Jahre nach Ablauf der Steuerperiode, in der die Steuerforderung entstanden ist.
**2** Die Verjährung wird durch eine auf Festsetzung oder Korrektur der Steuerforderung gerichtete empfangsbedürftige schriftliche Erklärung, eine Verfügung, einen Einspracheentscheid oder ein Urteil unterbrochen. Zu einer entsprechenden Unterbrechung der Verjährung führen auch die Ankündigung einer Kontrolle nach Artikel 78 Absatz 3 oder der Beginn einer unangekündigten Kontrolle.
**3** Wird die Verjährung durch die ESTV oder eine Rechtsmittelinstanz unterbrochen, so beginnt die Verjährungsfrist neu zu laufen. Sie beträgt neu zwei Jahre.
**4** Die Verjährung steht still, solange für die entsprechende Steuerperiode ein Steuerstrafverfahren nach diesem Gesetz durchgeführt wird und der zahlungspflichtigen Person dies mitgeteilt worden ist (Art. 104 Abs. 4).
**5** Unterbrechung und Stillstand wirken gegenüber allen zahlungspflichtigen Personen.
**6** Das Recht, die Steuerforderung festzusetzen, verjährt in jedem Fall zehn Jahre nach Ablauf der Steuerperiode, in der die Steuerforderung entstanden ist.

**CGS relevance:** Assessment limitation: 5 years after the end of the Steuerperiode in which the claim arose (Abs. 1), interrupted by ESTV actions (new period of 2 years, Abs. 3), absolute limit 10 years (Abs. 6). Abs. 6 sets the record-retention horizon in Art. 70 Abs. 2.

## MWSTG Art. 45 — Bezugsteuerpflicht

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_45 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Der Bezugsteuer unterliegen:

 - a.[fn113] Dienstleistungen, deren Ort sich nach Artikel 8 Absatz 1 im Inland befindet und die erbracht werden durch Unternehmen mit Sitz im Ausland, die nicht im Register der steuerpflichtigen Personen eingetragen sind, mit Ausnahme von Telekommunikations- oder elektronischen Dienstleistungen an nicht steuerpflichtige Empfänger und Empfängerinnen;
 - b. die Einfuhr von Datenträgern ohne Marktwert mit den darin enthaltenen Dienstleistungen und Rechten (Art. 52 Abs. 2);
 - c.[fn114] die Lieferung von unbeweglichen Gegenständen im Inland, die nicht der Einfuhrsteuer unterliegt und die erbracht wird durch Unternehmen mit Sitz im Ausland, die nicht im Register der steuerpflichtigen Personen eingetragen sind, mit Ausnahme des Überlassens solcher Gegenstände zum Gebrauch oder zur Nutzung;
 - d.[fn115] die Lieferung von Elektrizität in Leitungen, Gas über das Erdgasverteilnetz und Fernwärme durch Unternehmen mit Sitz im Ausland an steuerpflichtige Personen im Inland;
 - e.[fn116] die Übertragung von Emissionsrechten, Zertifikaten und Bescheinigungen für Emissionsverminderungen, Herkunftsnachweisen für Elektrizität und ähnlichen Rechten, Bescheinigungen und Zertifikaten durch Unternehmen mit Sitz, Wohnsitz oder Betriebsstätte im Ausland oder Inland, die nicht nach Artikel 21 Absatz 2 Ziffer 19 Buchstabe e von der Inlandsteuer ausgenommen ist.
**2** Steuerpflichtig für Leistungen nach Absatz 1 ist deren Empfänger oder Empfängerin, sofern er oder sie:[fn117]

 - a. nach Artikel 10 steuerpflichtig ist; oder
 - b.[fn118] im Kalenderjahr solche Leistungen für mehr als 10 000 Franken bezieht.

Footnotes as printed by Fedlex (amendment provenance):
- fn113: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn114: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn115: Eingefügt durch Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn116: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).
- fn117: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn118: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** Bezugsteuer (reverse charge): services from foreign suppliers not on the Swiss register are taxed at the recipient (Abs. 1 lit. a). A registered person always owes it; an unregistered recipient only above CHF 10'000 of such purchases per calendar year (Abs. 2). Under the effective method CGS can deduct the Bezugsteuer as input tax (Art. 28 Abs. 1 lit. b). Examples: foreign software subscriptions, advertising, design or CAM services bought from abroad.

## MWSTG Art. 45a — Nicht der Bezugsteuer unterliegende Leistungen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_45_a (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

Nicht der Bezugsteuer unterliegen Leistungen, die nach Artikel 21 von der Inland-steuer ausgenommen oder nach Artikel 23 von der Inlandsteuer befreit sind.

Footnotes as printed by Fedlex (amendment provenance):
- fn119: Eingefügt durch Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** Exempt (Art. 21) and export-exempt (Art. 23) services are not subject to Bezugsteuer.

## MWSTG Art. 46 — Steuerbemessung und Steuersätze

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_46 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

Für die Steuerbemessung und die Steuersätze gelten die Bestimmungen der Artikel 24 und 25.

**CGS relevance:** Bezugsteuer uses the Art. 24 base and Art. 25 rates (8.1% normal rate).

## MWSTG Art. 47 — Steuer- und Abrechnungsperiode

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_47 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Für steuerpflichtige Personen nach Artikel 45 Absatz 2 Buchstabe a gelten die gleichen Steuer- und Abrechnungsperioden wie für die Inlandsteuer (Art. 34 und 35).
**2** Als Steuer- und Abrechnungsperiode für steuerpflichtige Personen nach Artikel 45 Absatz 2 Buchstabe b gilt das Kalenderjahr.

**CGS relevance:** Bezugsteuer period equals the normal Steuer- and Abrechnungsperiode for registered persons (Abs. 1).

## MWSTG Art. 48 — Entstehung und Festsetzungsverjährung der Bezugsteuerschuld

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_48 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die Bezugsteuerschuld entsteht:

 - a. mit der Zahlung des Entgelts für die Leistung;
 - b. bei steuerpflichtigen Personen nach Artikel 45 Absatz 2 Buchstabe a, die nach vereinbarten Entgelten (Art. 40 Abs. 1) abrechnen: im Zeitpunkt des Empfangs der Rechnung sowie bei Leistungen ohne Rechnungsstellung mit der Zahlung des Entgelts.
**2** Festsetzungsverjährung und Rechtskraft richten sich nach den Artikeln 42 und 43.

**CGS relevance:** Bezugsteuer arises on payment of the consideration or, for accrual-basis registered persons, on receipt of the invoice (Abs. 1 lit. b). Limitation per Art. 42/43.

## MWSTG Art. 49 — Mithaftung, Steuernachfolge und Substitution

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_49 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

Für die Mithaftung, die Steuernachfolge und die Substitution gelten die Bestimmungen der Artikel 15–17.

**CGS relevance:** Joint liability, succession and substitution follow Art. 15-17.

## MWSTG Art. 50 — Anwendbares Recht

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_50 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

Für die Steuer auf der Einfuhr von Gegenständen gilt die Zollgesetzgebung, soweit die nachfolgenden Bestimmungen nichts anderes anordnen.

**CGS relevance:** Import tax follows customs legislation unless the VAT Act says otherwise.

## MWSTG Art. 51 — Steuerpflicht

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_51 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Steuerpflichtig ist, wer nach Artikel 70 Absätze 2 und 3 ZG[fn120] Zollschuldner oder Zollschuldnerin ist.
**2** Die Solidarhaftung nach Artikel 70 Absatz 3 ZG ist für Personen, die gewerbsmässig Zollanmeldungen ausstellen (Art. 109 ZG), aufgehoben, wenn der Importeur oder die Importeurin:

 - a. zum Vorsteuerabzug (Art. 28) berechtigt ist;
 - b.[fn121] die Einfuhrsteuerschuld über das Konto des zentralisierten Abrechnungsverfahrens des BAZG[fn122] (ZAZ) belastet erhält; und
 - c. der Person, die gewerbsmässig Zollanmeldungen ausstellt, einen Auftrag zur direkten Stellvertretung erteilt hat.
**3** Das BAZG kann von der Person, die gewerbsmässig Zollanmeldungen ausstellt, den Nachweis für ihre Vertretungsbefugnis verlangen.[fn123]

Footnotes as printed by Fedlex (amendment provenance):
- fn120: SR 631.0
- fn121: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn122: Ausdruck gemäss Ziff. I 18 der V vom 12. Juni 2020 über die Anpassung von Gesetzen infolge der Änderung der Bezeichnung der Eidgenössischen Zollverwaltung im Rahmen von deren Weiterentwicklung, in Kraft seit 1. Jan. 2022 (AS 2020 2743). Diese Änd. wurde im ganzen Erlass berücksichtigt.
- fn123: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** Import-tax debtor is the customs debtor (importer). The customs broker's joint liability is lifted if the importer is entitled to input-tax deduction, pays via the ZAZ account and gave direct representation (Abs. 2). Relevant to Holstersmith/UPS parcels once CGS is registered.

## MWSTG Art. 52 — Steuerobjekt

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_52 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Der Steuer unterliegen:

 - a. die Einfuhr von Gegenständen einschliesslich der darin enthaltenen Dienstleistungen und Rechte;
 - b. das Überführen von Gegenständen nach Artikel 17 Absatz 1bis ZG[fn124] in den zollrechtlich freien Verkehr durch Reisende, die im Flugverkehr aus dem Ausland ankommen.[fn125]
**2** Lässt sich bei der Einfuhr von Datenträgern kein Marktwert feststellen und ist die Einfuhr nicht nach Artikel 53 von der Steuer befreit, so ist hierauf keine Einfuhrsteuer geschuldet und die Bestimmungen über die Bezugsteuer (Art. 45–49) sind anwendbar.[fn126]
**3** Bei einer Mehrheit von Leistungen gelten die Bestimmungen von Artikel 19.

Footnotes as printed by Fedlex (amendment provenance):
- fn124: SR 631.0
- fn125: Fassung gemäss Ziff. I 2 des BG vom 17. Dez. 2010 über den Einkauf von Waren in Zoll-freiläden auf Flughäfen, in Kraft seit 1. Juni 2011 (AS 2011 1743; BBl 2010 2169).
- fn126: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** Object of import tax: import of goods including contained services and rights. Data carriers without market value fall under Bezugsteuer instead (Abs. 2).

## MWSTG Art. 53 — Steuerbefreite Einfuhren

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_53 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Von der Steuer befreit ist die Einfuhr von:

 - a. Gegenständen in kleinen Mengen, von unbedeutendem Wert oder mit geringfügigem Steuerbetrag; das EFD erlässt die näheren Bestimmungen;
 - b. menschlichen Organen durch medizinisch anerkannte Institutionen und Spitäler sowie von menschlichem Vollblut durch Inhaber und Inhaberinnen einer hierzu erforderlichen Bewilligung;
 - c. Kunstwerken, die von Kunstmalern und Kunstmalerinnen oder Bildhauern und Bildhauerinnen persönlich geschaffen wurden und von ihnen selbst oder in ihrem Auftrag ins Inland verbracht werden, unter Vorbehalt von Artikel 54 Absatz 1 Buchstabe c;
 - d. Gegenständen, die nach Artikel 8 Absatz 2 Buchstaben b–d, g und i–l ZG[fn127] zollfrei sind;
 - e. Gegenständen nach Artikel 23 Absatz 2 Ziffer 8, die im Rahmen einer Lieferung von Luftverkehrsunternehmen nach Artikel 23 Absatz 2 Ziffer 8 eingeführt oder die von solchen Luftverkehrsunternehmen ins Inland verbracht werden, sofern diese die Gegenstände vor der Einfuhr im Rahmen einer Lieferung bezogen haben und nach der Einfuhr für eigene zum Vorsteuerabzug berechtigende unternehmerische Tätigkeiten (Art. 28) verwenden;
 - f. Gegenständen, die nach dem Ausfuhrverfahren (Art. 61 ZG) veranlagt worden sind und unverändert an den Absender oder die Absenderin im Inland zurückgesandt werden, sofern sie nicht wegen der Ausfuhr von der Steuer befreit worden sind; ist die Steuer beachtlich, so erfolgt die Steuerbefreiung durch Rückerstattung; die Bestimmungen von Artikel 59 gelten sinngemäss;
 - g.[fn128] Elektrizität in Leitungen, Gas über das Erdgasverteilnetz und Fernwärme;
 - h. Gegenständen, die in völkerrechtlichen Verträgen für steuerfrei erklärt werden;
 - i. Gegenständen, die nach den Artikeln 9 und 58 ZG zur vorübergehenden Verwendung oder nach den Artikeln 12 und 59 ZG zur aktiven Veredelung nach dem Verfahren mit Rückerstattungsanspruch ins Inland eingeführt werden, unter Vorbehalt von Artikel 54 Absatz 1 Buchstabe d;
 - j. Gegenständen, die zur Lohnveredelung im Rahmen eines Werkvertrags von einer im Inland als steuerpflichtig eingetragenen Person vorübergehend ins Inland eingeführt und nach dem Verfahren der aktiven Veredelung mit bedingter Zahlungspflicht (Nichterhebungsverfahren) veranlagt werden (Art. 12 und 59 ZG);
 - k. Gegenständen, die nach den Artikeln 9 und 58 ZG zur vorübergehenden Verwendung oder nach den Artikeln 13 und 60 ZG zur passiven Lohnveredelung im Rahmen eines Werkvertrages aus dem Inland ausgeführt und an den Absender oder die Absenderin im Inland zurückgesandt werden, unter Vorbehalt von Artikel 54 Absatz 1 Buchstabe e;
 - l. Gegenständen, die zur Lohnveredelung im Rahmen eines Werkvertrags nach dem Ausfuhrverfahren (Art. 61 ZG) ins Ausland verbracht worden sind und an den Absender oder die Absenderin im Inland zurückgesandt werden, unter Vorbehalt von Artikel 54 Absatz 1 Buchstabe f;
 - m.[fn129] Gold und Legierungen von Gold nach Artikel 23 Absatz 2 Ziffer 12.
**2** Der Bundesrat kann Gegenstände, die er nach Artikel 8 Absatz 2 Buchstabe a ZG für zollfrei erklärt, von der Einfuhrsteuer befreien.

Footnotes as printed by Fedlex (amendment provenance):
- fn127: SR 631.0
- fn128: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn129: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).

**CGS relevance:** Exempt imports. Lit. a (small quantities, insignificant value or minimal tax amount; details by EFD ordinance) is the one that can matter for small parcels; lit. f (re-import of goods previously exported under the export procedure) is relevant to returned exports. The EFD ordinance with the actual thresholds is not part of this pack.

## MWSTG Art. 54 — Bemessungsgrundlage

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_54 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die Steuer wird berechnet:

 - a. auf dem Entgelt, wenn die Gegenstände in Erfüllung eines Veräusserungs- oder Kommissionsgeschäfts eingeführt werden;
 - b. auf dem Entgelt für werkvertragliche Lieferungen oder Arbeiten im Sinne von Artikel 3 Buchstabe d Ziffer 2, die unter Verwendung von in den zollrechtlich freien Verkehr übergeführten Gegenständen besorgt (Art. 48 ZG[fn131]) und durch eine im Inland nicht als steuerpflichtig eingetragene Person ausgeführt werden;
 - c. auf dem Entgelt für die im Auftrag von Kunstmalern und Kunstmalerinnen sowie Bildhauern und Bildhauerinnen an ihren eigenen Kunstwerken im Ausland besorgten Arbeiten (Art. 3 Bst. d Ziff. 2), sofern die Kunstwerke von ihnen selbst oder in ihrem Auftrag ins Inland verbracht wurden;
 - d. auf dem Entgelt für den Gebrauch von Gegenständen, die nach den Artikeln 9 und 58 ZG zur vorübergehenden Verwendung eingeführt wurden, sofern die Steuer auf diesem Entgelt beachtlich ist; wird für den vorübergehenden Gebrauch kein oder ein ermässigtes Entgelt gefordert, so ist das Entgelt massgebend, das einer unabhängigen Drittperson berechnet würde;
 - e. auf dem Entgelt für die im Ausland besorgten Arbeiten an Gegenständen (Art. 3 Bst. d Ziff. 2), die nach den Artikeln 9 und 58 ZG zur vorübergehenden Verwendung oder die nach den Artikeln 13 und 60 ZG zur passiven Lohnveredelung im Rahmen eines Werkvertrags ausgeführt wurden und an den Absender oder die Absenderin im Inland zurückgesandt werden;
 - f. auf dem Entgelt für die im Ausland besorgten Arbeiten an Gegenständen (Art. 3 Bst. d Ziff. 2), sofern diese zur Lohnveredlung im Rahmen eines Werkvertrags nach dem Ausfuhrverfahren (Art. 61 ZG) ins Ausland verbracht worden sind und an den Absender oder die Absenderin im Inland zurückgesandt werden;
 - g.[fn132] auf dem Marktwert in den übrigen Fällen; als Marktwert gilt, was der Importeur oder die Importeurin auf der Stufe, auf der die Einfuhr bewirkt wird, an einen selbstständigen Lieferanten oder eine selbständige Lieferantin im Herkunftsland der Gegenstände zum Zeitpunkt der Entstehung der Einfuhrsteuerschuld nach Artikel 56 unter den Bedingungen des freien Wettbewerbs zahlen müsste, um die gleichen Gegenstände zu erhalten.
**2** Richtet sich die Steuerberechnung nach dem Entgelt, so ist das vom Importeur oder der Importeurin oder an seiner oder ihrer Stelle von einer Drittperson entrichtete oder zu entrichtende Entgelt nach Artikel 24 massgebend, unter Vorbehalt von Artikel 18 Absatz 2 Buchstabe h. Bei einer nachträglichen Änderung dieses Entgelts gilt Artikel 41 sinngemäss.
**3** In die Bemessungsgrundlage sind einzubeziehen, soweit nicht bereits darin enthalten:

 - a. die ausserhalb des Inlands sowie aufgrund der Einfuhr geschuldeten Steuern, Zölle und sonstigen Abgaben, mit Ausnahme der zu erhebenden Mehrwertsteuer;
 - b.[fn133] die Kosten für das Befördern oder Versenden und alle damit zusammenhängenden Leistungen bis zum Bestimmungsort im Inland, an den die Gegenstände zum Zeitpunkt der Entstehung der Einfuhrsteuerschuld nach Artikel 56 zu befördern sind; ist dieser Ort unbekannt, so gilt als Bestimmungsort der Ort, an dem das Umladen nach Entstehung der Einfuhrsteuerschuld im Inland erfolgt.
**4** Bestehen Zweifel an der Richtigkeit der Zollanmeldung oder fehlen Wertangaben, so kann das BAZG die Steuerbemessungsgrundlage nach pflichtgemässem Ermessen schätzen.
**5** Für die Ermittlung der Bemessungsgrundlage herangezogene Preis- oder Wertangaben in ausländischer Währung sind nach dem am letzten Börsentag vor der Entstehung der Einfuhrsteuerschuld nach Artikel 56 notierten Devisenkurs (Verkauf) in Schweizerfranken umzurechnen.

Footnotes as printed by Fedlex (amendment provenance):
- fn130: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn131: SR 631.0
- fn132: Die Berichtigung der RedK der BVers vom 28. April 2016, veröffentlicht am 10. Mai 2016, betrifft nur den französischen Text (AS 2016 1357).
- fn133: Die Berichtigung der RedK der BVers vom 28. April 2016, veröffentlicht am 10. Mai 2016, betrifft nur den französischen Text (AS 2016 1357).

**CGS relevance:** Import tax base: the consideration (supply price) plus foreign taxes, duties and costs up to the destination in CH (Abs. 2-3); foreign currency is converted at the selling rate of the last stock-exchange day before the debt arises (Abs. 5). Determines the import VAT CGS can later deduct on Holstersmith purchases.

## MWSTG Art. 55 — Steuersätze

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_55 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die Steuer auf der Einfuhr von Gegenständen beträgt 8,1 Prozent; vorbehalten bleibt Absatz 2.
**2** Auf der Einfuhr von Gegenständen nach Artikel 25 Absatz 2 Buchstaben a und abis beträgt die Steuer 2,6 Prozent.

Footnotes as printed by Fedlex (amendment provenance):
- fn134: Fassung gemäss Ziff. I der V vom 9. Dez. 2022 über die Anhebung der Mehrwertsteuer- sätze zur Zusatzfinanzierung der AHV, in Kraft seit 1. Jan. 2024 (AS 2022 863).

**CGS relevance:** Import tax rates: 8.1% normal, 2.6% for the Art. 25 Abs. 2 lit. a and abis goods. Not requested by number; included next to Art. 54.

## MWSTG Art. 56 — Entstehung, Verjährung und Entrichtung der Einfuhrsteuerschuld

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_56 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die Einfuhrsteuerschuld entsteht zur gleichen Zeit wie die Zollschuld (Art. 69 ZG[fn135]).
**2** Der steuerpflichtigen Person nach Artikel 51, welche die Einfuhrsteuerschuld über das ZAZ begleicht, steht für die Bezahlung eine Frist von 60 Tagen nach Ausstellung der Rechnung zu; ausgenommen sind Einfuhren im Reiseverkehr, die mündlich zur Zollveranlagung angemeldet werden.
**3** Hinsichtlich der Sicherstellung können Erleichterungen gewährt werden, wenn dadurch der Steuereinzug nicht gefährdet wird.
**4** Die Einfuhrsteuerschuld verjährt zur gleichen Zeit wie die Zollschuld (Art. 75 ZG). Die Verjährung steht still, solange ein Steuerstrafverfahren nach diesem Gesetz durchgeführt wird und der zahlungspflichtigen Person dies mitgeteilt worden ist (Art. 104 Abs. 4).
**5** Ändert sich die Einfuhrsteuerschuld wegen nachträglicher Anpassung des Entgelts, namentlich aufgrund von Vertragsänderungen oder wegen Preisanpassungen zwischen verbundenen Unternehmen aufgrund anerkannter Richtlinien, so muss die zu niedrig bemessene Steuer innert 30 Tagen nach dieser Anpassung dem BAZG angezeigt werden. Die Meldung sowie die Anpassung der Steuerveranlagung können unterbleiben, wenn die nachzuentrichtende Steuer als Vorsteuer nach Artikel 28 abgezogen werden könnte.

Footnotes as printed by Fedlex (amendment provenance):
- fn135: SR 631.0

**CGS relevance:** Import tax debt arises with the customs debt. Payers via the ZAZ account get 60 days after invoice issue (Abs. 2). Limitation follows customs law (Abs. 4). Later price adjustments must be reported to BAZG within 30 days unless the extra tax would be deductible anyway (Abs. 5).

## MWSTG Art. 57 — Verzugszins

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_57 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Wird die Einfuhrsteuerschuld nicht fristgerecht bezahlt, so ist ein Verzugszins geschuldet.
**2** Die Verzugszinspflicht beginnt:

 - a. bei Bezahlung über das ZAZ: mit dem Ablauf der eingeräumten Zahlungsfrist;
 - b. bei Erhebung der Steuer auf dem Entgelt nach Artikel 54 Absatz 1 Buchstabe d: mit dem Ablauf der eingeräumten Zahlungsfrist;
 - c. bei nachträglicher Erhebung einer zu Unrecht erwirkten Rückerstattung von Steuern: mit dem Datum der Auszahlung;
 - d. in den übrigen Fällen: mit der Entstehung der Einfuhrsteuerschuld nach Artikel 56.
**3** Die Verzugszinspflicht besteht auch während eines Rechtsmittelverfahrens und bei Ratenzahlungen.

**CGS relevance:** Default interest on import tax runs from the end of the ZAZ payment period (Abs. 2 lit. a), also during appeals and instalments (Abs. 3). Rate: SR 631.014, see the section below.

## MWSTG Art. 65a — Elektronische Verfahren

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_65_a (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Der Bundesrat kann die elektronische Durchführung von Verfahren nach diesem Gesetz vorschreiben. Dabei regelt er die Modalitäten der Durchführung.
**2** Die ESTV stellt bei der elektronischen Durchführung von Verfahren die Authentizität und Integrität der übermittelten Daten sicher.
**3** Sie kann bei der elektronischen Einreichung von Eingaben, deren Unterzeichnung gesetzlich vorgeschrieben ist, anstelle der qualifizierten elektronischen Signatur eine andere elektronische Bestätigung der Angaben durch die steuerpflichtige oder antragstellende Person anerkennen.

Footnotes as printed by Fedlex (amendment provenance):
- fn147: Eingefügt durch Ziff. I 2 des BG vom 18. Juni 2021 über elektronische Verfahren im Steuerbereich, in Kraft seit 1. Jan. 2022 (AS 2021 673; BBl 2020 4705).

**CGS relevance:** The Federal Council may mandate electronic procedures; MWSTV Art. 123 does so for registration, annual reporting, filing and correction of returns. Not requested by number but cited by the requested provisions.

## MWSTG Art. 66 — An- und Abmeldung als steuerpflichtige Person

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_66 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Personen, die nach Artikel 10 steuerpflichtig werden, haben sich unaufgefordert innert 30 Tagen nach Beginn ihrer Steuerpflicht bei der ESTV schriftlich anzumelden. Diese teilt ihnen eine nicht übertragbare Nummer nach den Vorgaben des Bundesgesetzes vom 18. Juni 2010[fn148] über die Unternehmens-Identifikationsnummer zu, die registriert wird.[fn149]
**2** Endet die Steuerpflicht nach Artikel 14 Absatz 2, so hat sich die steuerpflichtige Person innert 30 Tagen nach der Beendigung der unternehmerischen Tätigkeit, spätestens aber mit dem Abschluss des Liquidationsverfahrens bei der ESTV schriftlich abzumelden.
**3** Wer einzig aufgrund der Bezugsteuer steuerpflichtig wird (Art. 45 Abs. 2), hat sich innert 60 Tagen nach Ablauf des Kalenderjahres, für das er steuerpflichtig ist, schriftlich bei der ESTV anzumelden und gleichzeitig die bezogenen Leistungen zu deklarieren.

Footnotes as printed by Fedlex (amendment provenance):
- fn148: SR 431.03
- fn149: Fassung des zweiten Satzes gemäss Anhang Ziff. 2 des BG vom 18. Juni 2010 über die Unternehmens-Identifikationsnummer, in Kraft seit 1. Jan. 2011 (AS 2010 4989; BBl 2009 7855).

**CGS relevance:** Must register in writing with ESTV unprompted within 30 days after liability begins (Abs. 1); deregistration within 30 days after the activity ends (Abs. 2). Registration is electronic (MWSTV Art. 123 Abs. 2 lit. e). Failing to register is a procedural offence (Art. 98 lit. a).

## MWSTG Art. 68 — Auskunftspflicht

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_68 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die steuerpflichtige Person hat der ESTV über alle Tatsachen, die für die Steuerpflicht oder für die Steuerbemessung von Bedeutung sein können, nach bestem Wissen und Gewissen Auskunft zu erteilen und die erforderlichen Unterlagen einzureichen.
**2** Das gesetzlich geschützte Berufsgeheimnis bleibt vorbehalten. Träger und Trägerinnen des Berufsgeheimnisses sind zur Vorlage der Bücher oder Aufzeichnungen verpflichtet, dürfen aber Namen und Adresse, nicht jedoch den Wohnsitz oder den Sitz der Klienten und Klientinnen abdecken oder durch Codes ersetzen. In Zweifelsfällen werden auf Antrag der ESTV oder der steuerpflichtigen Person vom Präsidenten oder der Präsidentin der zuständigen Kammer des Bundesverwaltungsgerichts ernannte neutrale Sachverständige als Kontrollorgane eingesetzt.

**CGS relevance:** Duty to give ESTV all information and documents relevant to liability and tax base, to the best of knowledge.

## MWSTG Art. 70 — Buchführung und Aufbewahrung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_70 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die steuerpflichtige Person hat ihre Geschäftsbücher und Aufzeichnungen nach den handelsrechtlichen Grundsätzen zu führen. Die ESTV kann ausnahmsweise darüber hinausgehende Aufzeichnungspflichten erlassen, wenn dies für die ordnungsgemässe Erhebung der Mehrwertsteuer unerlässlich ist.
**2** Die steuerpflichtige Person hat ihre Geschäftsbücher, Belege, Geschäftspapiere und sonstigen Aufzeichnungen bis zum Eintritt der absoluten Verjährung der Steuerforderung (Art. 42 Abs. 6) ordnungsgemäss aufzubewahren. Artikel 958f des Obligationenrechts[fn152] bleibt vorbehalten.[fn153]
**3** Geschäftsunterlagen, die im Zusammenhang mit der Berechnung der Einlageentsteuerung und des Eigenverbrauchs von unbeweglichen Gegenständen benötigt werden, sind während 20 Jahren aufzubewahren (Art. 31 Abs. 3 und 32 Abs. 2).
**4** Der Bundesrat regelt die Voraussetzungen, unter welchen Belege, die nach diesem Gesetz für die Durchführung der Steuer nötig sind, papierlos übermittelt und aufbewahrt werden können.

Footnotes as printed by Fedlex (amendment provenance):
- fn152: SR 220
- fn153: Fassung des zweiten Satzes gemäss Anhang Ziff. 4 des BG vom 23. Dez. 2011 (Rechnungslegungsrecht), in Kraft seit 1. Jan. 2013 (AS 2012 6679; BBl 2008 1589).

**CGS relevance:** Books per commercial-law principles (Abs. 1). Records, vouchers and business papers must be kept until absolute limitation of the tax claim (Abs. 2), i.e. 10 years after the end of the Steuerperiode (Art. 42 Abs. 6), with OR Art. 958f reserved. 20 years for documents on Einlageentsteuerung/Eigenverbrauch of immovables (Abs. 3). Paperless records allowed under Federal Council rules (Abs. 4; MWSTV Art. 122).

## MWSTG Art. 71 — Einreichung der Abrechnung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_71 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die steuerpflichtige Person hat gegenüber der ESTV innert 60 Tagen nach Ablauf der Abrechnungsperiode unaufgefordert in der vorgeschriebenen Form über die Steuerforderung abzurechnen.
**2** Endet die Steuerpflicht, so läuft die Frist von diesem Zeitpunkt an.

**CGS relevance:** File the return unprompted within 60 days after the end of the Abrechnungsperiode, in the prescribed (electronic) form; if liability ends, the deadline runs from that moment (Abs. 2).

## MWSTG Art. 72 — Korrektur von Mängeln in der Abrechnung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_72 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Stellt die steuerpflichtige Person im Rahmen der Erstellung ihres Jahresabschlusses Mängel in ihren Steuerabrechnungen fest, so muss sie diese spätestens in der Abrechnung über jene Abrechnungsperiode korrigieren, in die der 180. Tag seit Ende des betreffenden Geschäftsjahres fällt.
**2** Die steuerpflichtige Person ist verpflichtet, erkannte Mängel in Abrechnungen über zurückliegende Steuerperioden nachträglich zu korrigieren, soweit die Steuerforderungen dieser Steuerperioden nicht in Rechtskraft erwachsen oder verjährt sind.
**3** Die nachträglichen Korrekturen der Abrechnungen haben in der von der ESTV vorgeschriebenen Form zu erfolgen.
**4** Bei schwierig ermittelbaren systematischen Fehlern kann die ESTV der steuerpflichtigen Person eine Erleichterung nach Artikel 80 gewähren.

**CGS relevance:** Errors found when preparing the annual accounts must be corrected at the latest in the return for the period containing day 180 after fiscal year-end (Abs. 1); known errors in past periods must be corrected unless the claim is final or time-barred (Abs. 2). Corrections use the prescribed form (Abs. 3; MWSTV Art. 129: separate from ordinary returns).

## MWSTG Art. 86 — Entrichtung der Steuer

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_86 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Innert 60 Tagen nach Ablauf der Abrechnungsperiode hat die steuerpflichtige Person die in diesem Zeitraum entstandene Steuerforderung zu begleichen.
**2** Erbringt die steuerpflichtige Person keine oder eine offensichtlich ungenügende Zahlung, so setzt die ESTV den für die jeweilige Abrechnungsperiode provisorisch geschuldeten Steuerbetrag nach vorgängiger Mahnung in Betreibung. Liegt keine oder eine offensichtlich ungenügende Abrechnung der steuerpflichtigen Person vor, so bestimmt die ESTV den provisorisch geschuldeten Steuerbetrag vorgängig nach pflichtgemässem Ermessen.
**3** Durch Rechtsvorschlag eröffnet die steuerpflichtige Person das Verfahren um Rechtsöffnung. Für die Beseitigung des Rechtsvorschlages ist die ESTV im Verfügungs- und Einspracheverfahren zuständig.
**4** Die Verfügung betreffend den Rechtsvorschlag kann innert 10 Tagen nach der Eröffnung mit Einsprache bei der ESTV angefochten werden. Der Einspracheentscheid ist unter Vorbehalt von Absatz 5 endgültig.
**5** Hat die ESTV den in Betreibung gesetzten provisorisch geschuldeten Steuerbetrag nach pflichtgemässem Ermessen bestimmt, so kann gegen den Einspracheentscheid beim Bundesverwaltungsgericht Beschwerde geführt werden. Die Beschwerde hat keine aufschiebende Wirkung, es sei denn, das Gericht ordne diese auf begründetes Ersuchen hin an. Das Bundesverwaltungsgericht entscheidet endgültig.
**6** Artikel 85a des Bundesgesetzes vom 11. April 1889[fn187] über Schuldbetreibung und Konkurs (SchKG) ist nicht anwendbar.
**7** Der Einzug eines Steuerbetrags nach Absatz 2 berührt die Festsetzung nach den Artikeln 72, 78 und 82 der endgültigen Steuerforderung nicht. Unterbleibt die Festsetzung der Steuerforderung wegen Untätigkeit der steuerpflichtigen Person, insbesondere weil diese weder Mängel nach Artikel 72 korrigiert noch eine Verfügung nach Artikel 82 verlangt, so gelten mit Eintritt der Festsetzungsverjährung auch die von der ESTV nach Absatz 2 bestimmten Steuerbeträge als Steuerforderung.[fn188]
**8** Anstelle einer Zahlung des Steuerbetrags kann die steuerpflichtige Person auch Sicherheiten gemäss Artikel 93 Absatz 7 leisten.
**9** Unmittelbar nach Eingang der Zahlung oder der Sicherheitsleistung zieht die ESTV die Betreibung zurück.
**10** Die Absätze 1–9 gelten unabhängig davon, welche Abrechnungsperiode gewählt wurde.[fn189]

Footnotes as printed by Fedlex (amendment provenance):
- fn187: SR 281.1
- fn188: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).
- fn189: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).

**CGS relevance:** Pay the tax within 60 days after the end of the Abrechnungsperiode (Abs. 1). No or manifestly insufficient payment leads to a reminder and then debt collection of a provisionally set amount (Abs. 2). Applies regardless of the Abrechnungsperiode chosen (Abs. 10).

## MWSTG Art. 86a — Provisorischer Steuerbezug bei jährlicher Abrechnung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_86_a (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Bei der jährlichen Abrechnung (Art. 35a) erfolgt ein provisorischer Steuerbezug mittels Raten, die von der ESTV festgelegt und in Rechnung gestellt werden.
**2** Massgebend für die Festlegung der Raten ist die Steuerforderung der letzten Steuerperiode. Ist sie noch nicht bekannt, so wird sie von der ESTV geschätzt. Bei neu steuerpflichtigen Personen ist die bis zum Ende der ersten Steuerperiode erwartete Steuerforderung massgebend.
**3** Bei Anwendung der effektiven Abrechnungsmethode (Art. 36) und bei Abrechnung nach Pauschalsteuersätzen (Art. 37 Abs. 5) beläuft sich eine Rate auf einen Viertel, bei Abrechnung nach Saldosteuersätzen (Art. 37 Abs. 1–4) auf die Hälfte der Steuerforderung nach Absatz 2.
**4** Es werden keine Kleinstbeträge in Rechnung gestellt.
**5** Erachtet die steuerpflichtige Person die Raten als zu hoch oder zu niedrig, so kann sie bei der ESTV eine Anpassung der Raten beantragen.
**6** Die Raten sind zu begleichen:

 - a. bei Anwendung der effektiven Abrechnungsmethode und bei Abrechnung nach Pauschalsteuersätzen: bis 150, 240 und 330 Tage nach Beginn der Steuerperiode;
 - b. bei Abrechnung nach Saldosteuersätzen: bis 240 Tage nach Beginn der Steuerperiode.
**7** Die bezahlten Raten werden an die Steuerforderung gemäss eingereichter Jahresabrechnung angerechnet.

Footnotes as printed by Fedlex (amendment provenance):
- fn190: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).

**CGS relevance:** Annual reporting uses ESTV-issued instalments. Effective method: each instalment is one quarter of the estimated annual tax, due by day 150, 240 and 330 after period start (Abs. 3, 6 lit. a). SSS: an instalment is half the tax, due by day 240 (Abs. 6 lit. b). Base: previous period's tax, or the expected first-year tax for new registrants (Abs. 2). Adjustment can be requested (Abs. 5; MWSTV Art. 76d: only before the due date). Late instalments bear default interest (Art. 87 Abs. 1bis).

## MWSTG Art. 87 — Verzugszins

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_87 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Bei verspäteter Zahlung wird ohne Mahnung ein Verzugszins geschuldet.
**1bis** Beim provisorischen Steuerbezug bei der jährlichen Abrechnung ist ohne Mahnung ein Verzugszins geschuldet, wenn die steuerpflichtige Person die Raten nach Ablauf der Frist oder nicht vollständig bezahlt.[fn191]
**2** Kein Verzugszins ist geschuldet bei einer Nachbelastung, wenn diese auf einem Fehler beruht, der bei richtiger Abwicklung beim Bund zu keinem Steuerausfall geführt hätte.

Footnotes as printed by Fedlex (amendment provenance):
- fn191: Eingefügt durch Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).

**CGS relevance:** Default interest is owed without reminder on late payment (Abs. 1), including late instalments under annual reporting (Abs. 1bis); none where an error would not have caused a loss to the Confederation (Abs. 2). Rate: SR 631.014, see the section below.

## MWSTG Art. 88 — Vergütungen an die steuerpflichtige Person

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_88 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Ergibt sich aus der Steuerabrechnung oder aus der Anrechnung der bezahlten Raten an die Steuerforderung ein Überschuss zugunsten der steuerpflichtigen Person, so wird ihr dieser ausbezahlt.[fn192]
**2** Vorbehalten bleiben:

 - a. die Verrechnung dieses Überschusses mit Einfuhrsteuerschulden, selbst wenn diese noch nicht fällig sind;
 - b. die Verwendung des Überschusses zur Steuersicherung nach Artikel 94 Absatz 1;
 - c. die Verwendung des Überschusses zur Verrechnung unter Bundesstellen.
**3** Die steuerpflichtige Person kann bezahlte, aber nicht geschuldete Steuern zurückfordern, sofern die Steuerforderung noch nicht rechtskräftig ist.[fn193]
**4** Erfolgt die Auszahlung des Überschusses nach Absatz 1 oder die Rückerstattung nach Absatz 3 später als 60 Tage nach Eintreffen der Steuerabrechnung beziehungsweise der schriftlichen Geltendmachung des Anspruches bei der ESTV, so wird für die Zeit vom 61. Tag bis zur Auszahlung oder Rückerstattung ein Vergütungszins ausgerichtet.

Footnotes as printed by Fedlex (amendment provenance):
- fn192: Fassung gemäss Ziff. I des BG vom 16. Juni 2023, in Kraft seit 1. Jan. 2025 (AS 2024 438; BBl 2021 2363).
- fn193: Fassung gemäss Ziff. I des BG vom 30. Sept. 2016, in Kraft seit 1. Jan. 2018 (AS 2017 3575; BBl 2015 2615).

**CGS relevance:** Credit surpluses are paid out (Abs. 1); if payout or refund comes later than 60 days after the return arrives, refund interest runs from day 61 (Abs. 4). Offsetting against import tax debts is reserved (Abs. 2 lit. a). Relevant for CGS: the first year can show input-tax surpluses (opening-stock deductions).

## MWSTG Art. 90 — Zahlungserleichterungen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_90 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Ist die Zahlung der Steuer, Zinsen und Kosten innert der vorgeschriebenen Frist für die zahlungspflichtige Person mit einer erheblichen Härte verbunden, so kann die ESTV mit der steuerpflichtigen Person die Erstreckung der Zahlungsfrist oder Ratenzahlungen vereinbaren.
**2** Zahlungserleichterungen können von einer angemessenen Sicherheitsleistung abhängig gemacht werden.
**3** Zahlungserleichterungen fallen dahin, wenn ihre Voraussetzungen wegfallen oder wenn die Bedingungen, an die sie geknüpft sind, nicht erfüllt werden.
**4** Die Einreichung eines Antrags um Vereinbarung von Zahlungserleichterung hemmt die Vollstreckung nicht.

**CGS relevance:** Payment facilitation (extension, instalments) possible on significant hardship, possibly against security (Abs. 1-2); an application does not stop enforcement (Abs. 4).

## MWSTG Art. 96 — Steuerhinterziehung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_96 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Mit Busse bis zu 400 000 Franken wird bestraft, wer vorsätzlich oder fahrlässig die Steuerforderung zulasten des Staates verkürzt, indem er:

 - a. in einer Steuerperiode nicht sämtliche Einnahmen, zu hohe Einnahmen aus von der Steuer befreiten Leistungen, nicht sämtliche der Bezugsteuer unterliegenden Ausgaben oder zu hohe zum Vorsteuerabzug berechtigende Ausgaben deklariert;
 - b. eine unrechtmässige Rückerstattung erwirkt; oder
 - c. einen ungerechtfertigten Steuererlass erwirkt.

> [Excerpt only - remaining Absaetze/Ziffern omitted on instruction; the text above is verbatim.]

**CGS relevance:** Tax evasion fines: up to CHF 400'000 (intent or negligence, Abs. 1), up to CHF 800'000 if the evaded tax was passed on in a deductible form (Abs. 2). Only Abs. 1 is quoted here per the instruction 'headlines only'.

## MWSTG Art. 97 — Strafzumessung und qualifizierte Steuerhinterziehung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_97 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

**1** Die Busse wird in Anwendung von Artikel 106 Absatz 3 des Strafgesetzbuches[fn203] (StGB) bemessen; dabei kann Artikel 34 StGB sinngemäss herangezogen werden. Sofern der durch die Tat erzielte Steuervorteil höher ist als die Strafdrohung, kann die Busse bei vorsätzlicher Begehung bis zum Doppelten des Steuervorteils erhöht werden.
**2** Bei erschwerenden Umständen wird das Höchstmass der angedrohten Busse um die Hälfte erhöht. Zugleich kann auf eine Freiheitsstrafe von bis zu zwei Jahren erkannt werden. Als erschwerende Umstände gelten:

 - a. das Anwerben einer oder mehrerer Personen für eine Widerhandlung gegen das Mehrwertsteuerrecht;
 - b. das gewerbsmässige Verüben von Widerhandlungen gegen das Mehrwertsteuerrecht.

Footnotes as printed by Fedlex (amendment provenance):
- fn203: SR 311.0

**CGS relevance:** Fine assessment and aggravated evasion (recruiting others or commercial commission: maximum fine raised by half and prison up to two years, Abs. 2).

## MWSTG Art. 98 — Verletzung von Verfahrenspflichten

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/615/de#art_98 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 31. März 2025 (Fedlex consolidation 2025-03-31)

Mit Busse wird bestraft, sofern die Tat nicht nach einer anderen Bestimmung mit höherer Strafe bedroht ist, wer vorsätzlich oder fahrlässig:

 - a. die Anmeldung als steuerpflichtige Person nicht vornimmt;
 - b. trotz Mahnung eine Steuerabrechnung nicht fristgerecht einreicht;
 - c. die Steuer nicht periodengerecht deklariert;
 - d. Sicherheiten nicht gehörig leistet;
 - e. Geschäftsbücher, Belege, Geschäftspapiere und sonstige Aufzeichnungen nicht ordnungsgemäss führt, ausfertigt, aufbewahrt oder vorlegt;
 - f. trotz Mahnung nicht oder nicht richtig Auskunft erteilt oder die für die Steuererhebung oder für die Überprüfung der Steuerpflicht massgebenden Daten und Gegenstände nicht oder nicht richtig deklariert;
 - g. in Rechnungen eine nicht oder nicht in dieser Höhe geschuldete Mehrwertsteuer ausweist;
 - h. durch Angabe einer Registernummer eine Eintragung im Register der steuerpflichtigen Personen vortäuscht;
 - i. trotz Mahnung die ordnungsgemässe Durchführung einer Kontrolle erschwert, behindert oder verunmöglicht.

**CGS relevance:** Procedural violations (fines): missing registration, late returns after reminder, improper books/records, showing VAT not owed, simulating a registration number, etc.

## MWSTV Art. 9 — Befreiung und Ende der Befreiung von der Steuerpflicht bei inländischen Unternehmen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_9 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 10 Abs. 2 Bst. a und c sowie 14 Abs. 1 Bst. a und 3 MWSTG)
**1** Unternehmen mit Sitz, Wohnsitz oder Betriebsstätte im Inland, die ihre Tätigkeit aufnehmen oder durch Geschäftsübernahme oder Eröffnung eines neuen Betriebszweiges ausweiten, sind von der Steuerpflicht befreit, wenn zu diesem Zeitpunkt nach den Umständen anzunehmen ist, dass innerhalb der folgenden zwölf Monate die Umsatzgrenze nach Artikel 10 Absatz 2 Buchstabe a oder c MWSTG aus Leistungen im In- und Ausland nicht erreicht wird. Kann zu diesem Zeitpunkt noch nicht beurteilt werden, ob die Umsatzgrenze erreicht wird, so ist spätestens nach drei Monaten eine erneute Beurteilung vorzunehmen.
**2** Ist aufgrund der erneuten Beurteilung anzunehmen, dass die Umsatzgrenze erreicht wird, so endet die Befreiung von der Steuerpflicht wahlweise auf den Zeitpunkt:

 - a. der Aufnahme oder der Ausweitung der Tätigkeit; oder
 - b. der erneuten Beurteilung, spätestens aber mit Beginn des vierten Monats.
**3** Bei bisher von der Steuerpflicht befreiten Unternehmen endet die Befreiung von der Steuerpflicht nach Ablauf des Geschäftsjahres, in dem die Umsatzgrenze erreicht wird. Wurde die für die Steuerpflicht massgebende Tätigkeit nicht während eines ganzen Jahres ausgeübt, so ist der Umsatz auf ein volles Jahr umzurechnen.

Footnotes as printed by Fedlex (amendment provenance):
- fn11: Fassung gemäss Ziff. I der V vom 18. Okt. 2017, in Kraft seit 1. Jan. 2018 (AS 2017 6307).

**CGS relevance:** Operative rule for CGS: a domestic business that is exempt stays exempt until the end of the Geschäftsjahr in which the CHF 100'000 limit is reached (Abs. 3); part-year turnover is annualised. For new or expanded activity the test looks 12 months ahead, with reassessment after three months (Abs. 1-2). Together with MWSTG Art. 14 and 66 this defines the registration-date mechanics.

## MWSTV Art. 43a — Verzicht auf steuerfreie Lieferung an Plattformen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_43_a (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 23 Abs. 2 Ziff. 13 MWSTG)
**1** Der Verkäufer oder die Verkäuferin kann die fingierte Lieferung von Gegenständen im Inland an einen Leistungserbringer oder eine Leistungserbringerin nach Artikel 20a MWSTG mit dessen oder deren Einverständnis mit Steuer in Rechnung stellen. Kein Einverständnis ist notwendig, wenn gegen den Leistungserbringer oder die Leistungserbringerin nach Artikel 20a MWSTG eine administrative Massnahme nach Artikel 79a MWSTG verfügt ist.
**2** Der Leistungserbringer oder die Leistungserbringerin nach Artikel 20a MWSTG kann die Steuer als Vorsteuer in Abzug bringen.

Footnotes as printed by Fedlex (amendment provenance):
- fn44: Eingefügt durch Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Seller may invoice the deemed supply to an Art. 20a platform with tax, with the platform's consent; the platform can deduct it as input tax (platform rule, in force since 01/01/2025).

## MWSTV Art. 45 — Entgelte in ausländischer Währung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_45 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 24 Abs. 1 MWSTG)
**1** Zur Berechnung der geschuldeten Mehrwertsteuer sind Entgelte in ausländischer Währung im Zeitpunkt der Entstehung der Steuerforderung in Landeswährung umzurechnen.
**2** Ein Entgelt in ausländischer Währung liegt vor, wenn die Rechnung oder Quittung in ausländischer Währung ausgestellt ist. Wird keine Rechnung oder Quittung ausgestellt, so ist die Verbuchung beim Leistungserbringer oder bei der Leistungserbringerin massgebend. Unerheblich ist, ob in Landes- oder in ausländischer Währung bezahlt wird und in welcher Währung das Retourgeld ausbezahlt wird.
**3** Die Umrechnung erfolgt nach dem von der ESTV veröffentlichten Wechselkurs, wobei wahlweise der Monatsmittelkurs oder der Tageskurs für den Verkauf von Devisen verwendet werden kann.[fn46]
**3bis** Bei ausländischen Währungen, für welche die ESTV keinen Kurs veröffentlicht, gilt der publizierte Tageskurs für den Verkauf von Devisen einer inländischen Bank.[fn47]
**4** Steuerpflichtige Personen, die Teil eines Konzerns sind, können für die Umrechnung ihren Konzernumrechnungskurs verwenden. Dieser ist sowohl für die Leistungen innerhalb des Konzerns als auch im Verhältnis zu Dritten anzuwenden.[fn48]
**5** Das gewählte Vorgehen (Monatsmittel-, Tages- oder Konzernkurs) ist während mindestens einer Steuerperiode beizubehalten.

Footnotes as printed by Fedlex (amendment provenance):
- fn46: Fassung gemäss Ziff. I der V vom 18. Okt. 2017, in Kraft seit 1. Jan. 2018 (AS 2017 6307).
- fn47: Eingefügt durch Ziff. I der V vom 18. Okt. 2017, in Kraft seit 1. Jan. 2018 (AS 2017 6307).
- fn48: Fassung gemäss Ziff. I der V vom 18. Okt. 2017, in Kraft seit 1. Jan. 2018 (AS 2017 6307).

**CGS relevance:** Foreign-currency consideration (e.g. USD invoices from Holstersmith, or sales invoiced in EUR/USD) is converted at the ESTV-published exchange rate (monthly average or daily selling rate, Abs. 3) at the moment the tax claim arises (Abs. 1). Art. 58 applies the same rule to input-tax deduction.

## MWSTV Art. 46 — Kreditkartenkommissionen und Scheckgebühren

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_46 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 24 Abs. 1 MWSTG)
Nicht als Entgeltsminderungen gelten Kreditkartenkommissionen, Scheckgebühren, WIR-Einschläge und dergleichen.

**CGS relevance:** Credit-card commissions and similar fees do not reduce the consideration: CGS owes output VAT on the gross price even though a payment provider keeps a fee.

## MWSTV Art. 48e — Margenbesteuerung für elektronische Plattformen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_48_e (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 24a MWSTG)
Wer als Leistungserbringer oder Leistungserbringerin nach Artikel 20a MWSTG gilt, kann die Margenbesteuerung nur anwenden, sofern der Verkäufer oder die Verkäuferin des Gegenstandes im Inland ansässig und nicht im Mehrwertsteuerregister eingetragen ist.

Footnotes as printed by Fedlex (amendment provenance):
- fn51: Eingefügt durch Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Platform deemed suppliers may use margin taxation only for goods from domestic unregistered sellers (platform rule).

## MWSTV Art. 57 — (no heading in the Fedlex text)

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_57 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

Kassenzettel für Beträge bis 400 Franken müssen keine Angaben über den Leistungsempfänger oder die Leistungsempfängerin enthalten. Solche Kassenzettel berechtigen nicht zu einer Steuerrückerstattung im Vergütungsverfahren.

**CGS relevance:** Receipts up to CHF 400 need no recipient data and do not support a refund in the foreign-buyer reimbursement procedure.

## MWSTV Art. 58 — Vorsteuerabzug bei ausländischer Währung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_58 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 28 MWSTG)
Für die Berechnung der abziehbaren Vorsteuern gilt Artikel 45 sinngemäss.

**CGS relevance:** Foreign-currency purchases: input tax is computed with the Art. 45 conversion rules.

## MWSTV Art. 59 — Nachweis

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_59 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 28 Abs. 1 Bst. a MWSTG)
**1** Die Inlandsteuer gilt als in Rechnung gestellt, wenn der Leistungserbringer oder die Leistungserbringerin für den Leistungsempfänger oder die Leistungsempfängerin erkennbar von diesem oder dieser die Mehrwertsteuer eingefordert hat.
**2** Der Leistungsempfänger oder die Leistungsempfängerin muss nicht prüfen, ob die Mehrwertsteuer zu Recht eingefordert wurde. Weiss er oder sie aber, dass die Person, die die Mehrwertsteuer überwälzt hat, nicht als steuerpflichtige Person eingetragen ist, so ist der Vorsteuerabzug ausgeschlossen.

**CGS relevance:** Input tax counts as invoiced when the supplier visibly charged VAT; the recipient need not check whether it was rightly charged, but loses the deduction if they know the supplier is not registered (Abs. 2).

## MWSTV Art. 62 — Edelmetalle und Edelsteine

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_62 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 28a Abs. 1 Bst. a MWSTG)
Nicht als individualisierbare bewegliche Gegenstände gelten Edelmetalle der Zolltarifnummern 7106–7112[fn66] und Edelsteine der Zolltarifnummern 7102–7105.

Footnotes as printed by Fedlex (amendment provenance):
- fn66: SR 632.10 Anhang

**CGS relevance:** Precious metals and gemstones are not 'individualisable' movables for fictitious input tax purposes.

## MWSTV Art. 63 — Berechtigung zum Abzug der fiktiven Vorsteuer

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_63 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 28a Abs. 1 und 2 MWSTG)
**1** Werden ausschliesslich individualisierbare bewegliche Gegenstände zu einem Gesamtpreis erworben, so ist ein Abzug der fiktiven Vorsteuer zulässig.[fn67]
**2** Der Abzug der fiktiven Vorsteuer ist ausgeschlossen, wenn im Gesamtpreis Sammlerstücke (Art. 48a) oder nicht individualisierbare bewegliche Gegenstände enthalten sind und der Anteil am Ankaufspreis, der auf Gegenstände nach Artikel 28a MWSTG entfällt, nicht annährungsweise ermittelt werden kann.
**3** Der Abzug der fiktiven Vorsteuer ist ausgeschlossen, wenn:

 - a. beim Erwerb des Gegenstands das Meldeverfahren nach Artikel 38 MWSTG zur Anwendung kam;
 - b. die steuerpflichtige Person den Gegenstand eingeführt hat;
 - c.[fn68] Gegenstände nach Artikel 23 Absatz 2 Ziffer 12 MWSTG erworben wurden;
 - d. die steuerpflichtige Person weiss oder wissen müsste, dass der Gegenstand steuerbefreit eingeführt wurde;
 - e.[fn69] die steuerpflichtige Person den Gegenstand von einem Begünstigten oder einer Begünstigten nach Artikel 2 des Gaststaatgesetzes vom 22. Juni 2007[fn70] (GSG) bezogen hat.
**4** Bei Zahlungen im Rahmen der Schadenregulierung ist der Abzug der fiktiven Vorsteuer nur auf dem tatsächlichen Wert des Gegenstandes im Zeitpunkt der Übernahme zulässig.
**5** Wer als Leistungserbringer oder Leistungserbringerin nach Artikel 20a MWSTG gilt, kann den Abzug der fiktiven Vorsteuer nur anwenden, sofern der Verkäufer oder die Verkäuferin des Gegenstandes im Inland ansässig und nicht im Mehrwertsteuerregister eingetragen ist.[fn71]

Footnotes as printed by Fedlex (amendment provenance):
- fn67: Die Berichtigung vom 30. Jan. 2018 betrifft nur den italienischen Text (AS 2018 521).
- fn68: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).
- fn69: Eingefügt durch Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).
- fn70: SR 192.12
- fn71: Eingefügt durch Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Conditions for fictitious input tax (Art. 28a MWSTG), including exclusions (own import, notification procedure, Gaststaat beneficiaries) and the platform restriction in Abs. 5.

## MWSTV Art. 65 — Methoden zur Berechnung der Korrektur

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_65 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 30 MWSTG)
Die Korrektur des Vorsteuerabzugs kann berechnet werden:

 - a. nach dem effektiven Verwendungszweck;
 - b. anhand von Pauschalmethoden mit von der ESTV festgelegten Pauschalen;
 - c. gestützt auf eigene Berechnungen.

**CGS relevance:** Methods for correcting input-tax deduction under mixed use (Art. 30 MWSTG): actual use, ESTV flat rates, or own calculations.

## MWSTV Art. 66 — Pauschalmethoden

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_66 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 30 MWSTG)
Die ESTV legt namentlich Pauschalen fest für:

 - a. Tätigkeiten von Banken;
 - b. die Tätigkeit von Versicherungsgesellschaften;
 - c. Tätigkeiten von spezialfinanzierten Dienststellen von Gemeinwesen;
 - d. die Gewährung von Krediten sowie für Zinseinnahmen und Einnahmen aus dem Handel mit Wertpapieren;
 - e. die Verwaltung von eigenen Immobilien, für deren Versteuerung nicht nach Artikel 22 MWSTG optiert wird;
 - f. Transportunternehmen des öffentlichen Verkehrs.

**CGS relevance:** ESTV flat-rate methods (banks, insurers, real-estate management etc.); none aimed at manufacturing.

## MWSTV Art. 67 — Eigene Berechnungen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_67 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 30 MWSTG)
Stützt die steuerpflichtige Person die Korrektur des Vorsteuerabzugs auf eigene Berechnungen, so muss sie die Sachverhalte, die ihren Berechnungen zugrunde liegen, umfassend belegen sowie eine Plausibilitätsprüfung durchführen.

**CGS relevance:** Own calculations must be documented and plausibility-checked.

## MWSTV Art. 68 — Wahl der Methode

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_68 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 30 MWSTG)
**1** Die steuerpflichtige Person kann zur Berechnung der Korrektur des Vorsteuerabzugs eine oder mehrere Methoden anwenden, sofern dies zu einem sachgerechten Ergebnis führt.
**2** Als sachgerecht gilt jede Anwendung einer oder mehrerer Methoden, die den Grundsatz der Erhebungswirtschaftlichkeit berücksichtigt, betriebswirtschaftlich nachvollziehbar ist und die Vorsteuern nach Massgabe der Verwendung für eine bestimmte Tätigkeit zuteilt.

**CGS relevance:** Free choice of method as long as the result is reasonable, economical to administer and tied to actual use.

## MWSTV Art. 69 — Grundsätze

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_69 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 31 MWSTG)
**1** Der Vorsteuerabzug ist auf nicht in Gebrauch genommenen Gegenständen und Dienstleistungen vollumfänglich zu korrigieren.
**2** Der Vorsteuerabzug ist auf in Gebrauch genommenen Gegenständen und Dienstleistungen zu korrigieren, die im Zeitpunkt des Wegfalls der Voraussetzungen des Vorsteuerabzugs noch vorhanden sind und einen Zeitwert haben. Bei Dienstleistungen in den Bereichen Beratung, Buchführung, Personalbeschaffung, Management und Werbung wird vermutet, dass sie bereits im Zeitpunkt ihres Bezugs verbraucht und nicht mehr vorhanden sind.
**3** Bei selbst hergestellten Gegenständen ist für die Ingebrauchnahme der Infrastruktur ein Pauschalzuschlag von 33 Prozent auf den Vorsteuern auf Material und allfälligen Drittarbeiten bei Halbfabrikaten vorzunehmen. Vorbehalten bleibt der effektive Nachweis der Vorsteuern, die auf die Ingebrauchnahme der Infrastruktur entfallen.
**4** Fallen die Voraussetzungen des Vorsteuerabzugs nur teilweise weg, so ist die Korrektur im Ausmass der nicht mehr zum Vorsteuerabzug berechtigenden Nutzung vorzunehmen.

**CGS relevance:** Eigenverbrauch principles: unused goods/services are fully corrected, used ones at Zeitwert; 33% infrastructure surcharge on self-made goods unless proven otherwise.

## MWSTV Art. 70 — Ermittlung des Zeitwerts

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_70 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 31 Abs. 3 MWSTG)
**1** Zu berechnen ist der Zeitwert auf der Grundlage des Anschaffungspreises, bei Immobilien ohne Wert des Bodens, sowie der wertvermehrenden Aufwendungen. Nicht zu berücksichtigen sind die werterhaltenden Aufwendungen. Werterhaltende Aufwendungen sind solche, die lediglich dazu dienen, den Wert eines Gegenstands sowie seine Funktionsfähigkeit zu erhalten, namentlich Service-, Unterhalts-, Betriebs-, Reparatur- und Instandstellungskosten.
**2** Bei der Ermittlung des Zeitwerts von in Gebrauch genommenen Gegenständen und Dienstleistungen ist in der ersten Steuerperiode der Ingebrauchnahme der Wertverlust für die ganze Steuerperiode zu berücksichtigen. In der letzten noch nicht abgelaufenen Steuerperiode ist hingegen keine Abschreibung vorzunehmen, ausser die Nutzungsänderung tritt am letzten Tag der Steuerperiode ein.

**CGS relevance:** Zeitwert computation for Eigenverbrauch: acquisition price plus value-adding costs; maintenance and repair costs ignored; first-year loss of value counted for the whole Steuerperiode (Abs. 2).

## MWSTV Art. 71 — Grossrenovationen von Liegenschaften

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_71 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 31 MWSTG)
Übersteigen die Renovationskosten einer Bauphase insgesamt 5 Prozent des Gebäudeversicherungswerts vor der Renovation, so muss der Vorsteuerabzug um die gesamten Kosten korrigiert werden, unabhängig davon, ob es sich um Kosten für wertvermehrende oder für werterhaltende Aufwendungen handelt.

**CGS relevance:** Major renovation of real estate (above 5% of insured building value): not relevant to CGS's movable stock.

## MWSTV Art. 72 — Grundsätze

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_72 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 32 MWSTG)
**1** Der Vorsteuerabzug kann auf nicht in Gebrauch genommenen Gegenständen und Dienstleistungen vollumfänglich korrigiert werden.
**2** Der Vorsteuerabzug kann auf in Gebrauch genommenen Gegenständen und Dienstleistungen korrigiert werden, die im Zeitpunkt des Eintritts der Voraussetzungen des Vorsteuerabzugs noch vorhanden sind und einen Zeitwert haben. Bei Dienstleistungen in den Bereichen Beratung, Buchführung, Personalbeschaffung, Management und Werbung wird vermutet, dass sie bereits im Zeitpunkt ihres Bezugs verbraucht und nicht mehr vorhanden sind.
**3** Bei selbst hergestellten Gegenständen kann für die Ingebrauchnahme der Infrastruktur ein Pauschalzuschlag von 33 Prozent auf den Vorsteuern auf Material und allfälligen Drittarbeiten bei Halbfabrikaten vorgenommen werden. Vorbehalten bleibt der effektive Nachweis der Vorsteuern, die auf die Ingebrauchnahme der Infrastruktur entfallen.
**4** Treten die Voraussetzungen des Vorsteuerabzugs nur teilweise ein, so kann die Korrektur nur im Ausmass der nun zum Vorsteuerabzug berechtigenden Nutzung vorgenommen werden.

**CGS relevance:** CRITICAL for the opening position: input tax on goods/services not yet used can be corrected in full (Abs. 1); on used items still present and with a Zeitwert, only the Zeitwert share (Abs. 2). Advice, bookkeeping, recruiting, management and advertising services are presumed consumed at purchase and therefore NOT recoverable. For self-made goods a 33% surcharge on the input tax of material and third-party work for semi-finished goods may be claimed for use of the infrastructure, subject to proof of the actual infrastructure input tax (Abs. 3).

## MWSTV Art. 73 — Ermittlung des Zeitwerts

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_73 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 32 Abs. 2 MWSTG)
**1** Zu berechnen ist der Zeitwert auf der Grundlage des Anschaffungspreises, bei Immobilien ohne Wert des Bodens, sowie der wertvermehrenden Aufwendungen. Nicht zu berücksichtigen sind die werterhaltenden Aufwendungen. Werterhaltende Aufwendungen sind solche, die lediglich dazu dienen, den Wert eines Gegenstands sowie seine Funktionsfähigkeit zu erhalten, namentlich Service-, Unterhalts-, Betriebs-, Reparatur- und Instandstellungskosten.
**2** Bei der Ermittlung des Zeitwerts von in Gebrauch genommenen Gegenständen und Dienstleistungen ist in der ersten Steuerperiode der Ingebrauchnahme der Wertverlust für die ganze Steuerperiode zu berücksichtigen. In der letzten noch nicht abgelaufenen Steuerperiode ist hingegen keine Abschreibung vorzunehmen, ausser die Nutzungsänderung tritt am letzten Tag der Steuerperiode ein.

**CGS relevance:** Zeitwert basis: acquisition price (immovables without land) plus value-adding costs; service/maintenance/repair costs not counted; in the first year of use the loss of value for the whole Steuerperiode is considered; no write-down in the last, unfinished period (Abs. 2).

## MWSTV Art. 74 — Grossrenovationen von Liegenschaften

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_74 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 32 MWSTG)
Übersteigen die Renovationskosten einer Bauphase insgesamt 5 Prozent des Gebäudeversicherungswerts vor der Renovation, so kann der Vorsteuerabzug um die gesamten Kosten korrigiert werden, unabhängig davon, ob es sich um Kosten für wertvermehrende oder für werterhaltende Aufwendungen handelt.

**CGS relevance:** Major renovations above 5% of insured building value: whole cost correctable; not relevant to movable goods.

## MWSTV Art. 75 — (no heading in the Fedlex text)

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_75 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

**1** Keine Vorsteuerabzugskürzung ist vorzunehmen, soweit die Mittel nach Artikel 18 Absatz 2 Buchstaben a–c MWSTG einem Tätigkeitsbereich zuzuordnen sind, für den keine Vorsteuer anfällt oder für den kein Anspruch auf Vorsteuerabzug besteht.
**2** Soweit die Mittel nach Artikel 18 Absatz 2 Buchstaben a–c MWSTG einem bestimmten Tätigkeitsbereich zugeordnet werden können, ist nur die Vorsteuer auf den Aufwendungen für diesen Tätigkeitsbereich zu kürzen.
**3** Werden die Mittel nach Artikel 18 Absatz 2 Buchstaben a–c MWSTG zur Deckung eines Betriebsdefizits entrichtet, so ist die Vorsteuer gesamthaft im Verhältnis dieser Mittel zu den Gesamteinnahmen zu kürzen. Die Gesamteinnahmen setzen sich zusammen aus dem Total der Umsätze exklusive Mehrwertsteuer und den Einnahmen, die nicht zu den Entgelten zählen.[fn72]

Footnotes as printed by Fedlex (amendment provenance):
- fn72: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Reduction of deduction for subsidies and similar flows (Art. 33 MWSTG); not relevant unless CGS receives such funding.

## MWSTV Art. 76 — (no heading in the Fedlex text)

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_76 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

(Fedlex shows no text for this provision; see footnote)

Footnotes as printed by Fedlex (amendment provenance):
- fn73: Tritt zu einem späteren Zeitpunkt in Kraft.

**CGS relevance:** Placeholder: Fedlex states this article enters into force at a later date and shows no text.

## MWSTV Art. 76a — Jährliche Abrechnung bei Beginn der Steuerpflicht

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_76_a (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 35 Abs. 1bis Bst. b, 35a und 86a MWSTG)
**1** Neu im Mehrwertsteuerregister eingetragene Personen, welche die jährliche Abrechnung anwenden wollen, müssen dies bei der ESTV spätestens 60 Tage nach Zustellung der Mehrwertsteuernummer beantragen.
**2** Die ESTV bewilligt die Anwendung der jährlichen Abrechnung, wenn der in den ersten zwölf Monaten erwartete Umsatz mit Mehrwertsteuer die Grenze von Artikel 35 Absatz 1bis Buchstabe b MWSTG nicht überschreitet.
**3** Nach Ablauf der Frist von Absatz 1 kann die steuerpflichtige Person die jährliche Abrechnung frühestens nach einer Steuerperiode beantragen.

**CGS relevance:** New registrants who want annual reporting must apply to ESTV at the latest 60 days after delivery of the VAT number (Abs. 1). ESTV grants it if the expected turnover (with VAT) in the first twelve months does not exceed the Art. 35 Abs. 1bis lit. b limit (Abs. 2). After the deadline, application is possible after one full Steuerperiode (Abs. 3).

## MWSTV Art. 76b — Wechsel zur jährlichen Abrechnung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_76_b (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 35 Abs. 1bis Bst. b, 35a und 86a MWSTG)
**1** Steuerpflichtige Personen, die zur jährlichen Abrechnung wechseln wollen, müssen dies spätestens 60 Tage nach Beginn der Steuerperiode, ab welcher der Wechsel erfolgen soll, beantragen.
**2** Die ESTV bewilligt die jährliche Abrechnung, wenn die steuerpflichtige Person:

 - a. in der vorangegangenen Steuerperiode die Umsatzgrenze von Artikel 35 Absatz 1bis Buchstabe b MWSTG nicht überschritten hat; und
 - b. in den vorangegangenen drei Steuerperioden oder, wenn die Steuerpflicht weniger lang besteht, seit Beginn der Steuerpflicht alle Abrechnungen fristgerecht eingereicht und alle Steuerforderungen vollumfänglich und fristgerecht bezahlt hat.

**CGS relevance:** Switching to annual reporting: apply within 60 days after the start of the Steuerperiode; granted if the previous period was within the limit and returns/payments were punctual in the last three periods.

## MWSTV Art. 76c — Ende der jährlichen Abrechnung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_76_c (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 35 Abs. 1bis Bst. b, 35a, 86 Abs. 2 und 86a MWSTG)
**1** Steuerpflichtige Personen, welche die jährliche Abrechnung nicht mehr anwenden wollen, müssen dies der ESTV spätestens 60 Tage nach Beginn der Steuerperiode, ab welcher der Wechsel erfolgen soll, melden.
**2** Die ESTV widerruft die Genehmigung der jährlichen Abrechnung:

 - a. auf den Beginn der nächsten Steuerperiode, wenn die steuerpflichtige Person die in Artikel 35 Absatz 1bis Buchstabe b MWSTG festgelegte Umsatzgrenze in drei aufeinander folgenden Steuerperioden überschritten hat;
 - b. auf den Beginn der übernächsten Steuerperiode, wenn:

 - 1. die steuerpflichtige Person eine Herabsetzung der Raten beantragt hat, durch die in der laufenden Steuerperiode das Total der Raten im Verhältnis zum Steuerbetrag gemäss Abrechnung folgenden Wert unterschreitet:

 - – bei effektiver Abrechnung und bei Abrechnung mit Pauschalsteuersätzen: 50 Prozent
 - – bei Abrechnung mit Saldosteuersätzen: 35 Prozent,
 - 2. die ESTV wegen Nichteinreichens der Abrechnung den geschuldeten Steuerbetrag gestützt auf Artikel 86 Absatz 2 zweiter Satz MWSTG nach pflichtgemässem Ermessen bestimmt hat, oder
 - 3. die ESTV gestützt auf Artikel 86 Absatz 2 erster Satz Forderungen in Betreibung gesetzt hat.

**CGS relevance:** Ending annual reporting: notify within 60 days of period start. ESTV revokes after three consecutive periods over the limit, or two periods later where instalments were reduced below 50% (effective method) or 35% (SSS) of the final tax, ESTV had to assess discretionarily, or started debt collection.

## MWSTV Art. 76d — Anpassung der Raten

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_76_d (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 35 Abs. 1bis Bst. b, 35a und 86a MWSTG)
Eine Anpassung der Raten ist nur vor deren Fälligkeit möglich.

**CGS relevance:** Instalments can only be adjusted before they fall due.

## MWSTV Art. 77 — Grundsätze

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_77 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
**1** Bei der Abklärung, ob die Voraussetzungen nach Artikel 37 MWSTG erfüllt sind, sind die im Inland gegen Entgelt erbrachten steuerbaren Leistungen zu berücksichtigen.
**2** Die Saldosteuersatzmethode kann nicht gewählt werden von steuerpflichtigen Personen, die:

 - a. nach Artikel 37 Absatz 5 MWSTG nach der Pauschalsteuersatzmethode abrechnen können;
 - b. das Verlagerungsverfahren nach Artikel 63 MWSTG anwenden;
 - c. die Gruppenbesteuerung nach Artikel 13 MWSTG anwenden;
 - d. ihren Sitz oder eine Betriebsstätte in den Talschaften Samnaun oder Sampuoir haben;
 - e.[fn75] mehr als 50 Prozent ihres Umsatzes aus steuerbaren Leistungen an andere steuerpflichtige, nach der effektiven Abrechnungsmethode abrechnende Personen erzielen, sofern die beteiligten Personen unter einheitlicher Leitung stehen;
 - f.[fn76] gestützt auf Artikel 7 Absatz 3 MWSTG Lieferungen im Inland erbringen;
 - g.[fn77] als Leistungserbringer oder Leistungserbringerinnen nach Artikel 20a MWSTG gelten;
 - h.[fn78] ihren Sitz im Ausland haben.
**3** Steuerpflichtige Personen, die mit der Saldosteuersatzmethode abrechnen, können nicht für die Versteuerung von Leistungen nach Artikel 21 Absatz 2 Ziffern 1–24 und 27–31 MWSTG optieren. Wird die Steuer gleichwohl in Rechnung gestellt, so ist die ausgewiesene Steuer unter Vorbehalt von Artikel 27 Absatz 2 MWSTG der ESTV abzuliefern.[fn79]

Footnotes as printed by Fedlex (amendment provenance):
- fn75: Fassung gemäss Ziff. I der V vom 18. Okt. 2017, in Kraft seit 1. Jan. 2018 (AS 2017 6307).
- fn76: Eingefügt durch Ziff. I der V vom 15. Aug. 2018, in Kraft seit 1. Jan. 2019 (AS 2018 3143).
- fn77: Eingefügt durch Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).
- fn78: Eingefügt durch Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).
- fn79: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** SSS general: counts domestic taxable supplies against the Art. 37 limits (Abs. 1). Excluded from SSS: users of the deferral procedure (lit. b), group taxation, Samnaun/Sampuoir, platform deemed suppliers (lit. g), foreign-seated firms (lit. h), among others (Abs. 2). SSS users cannot opt to tax Art. 21 supplies (Abs. 3).

## MWSTV Art. 78 — Saldosteuersatzmethode bei Beginn der Steuerpflicht

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_78 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
**1** Neu ins Mehrwertsteuerregister eingetragene Personen, die sich der Saldosteuersatzmethode unterstellen wollen, müssen dies der ESTV innert 60 Tagen nach Zustellung der Mehrwertsteuernummer melden.
**2** Die ESTV bewilligt die Anwendung der Saldosteuersatzmethode, wenn in den ersten 12 Monaten sowohl der erwartete Umsatz als auch die erwarteten Steuern die Grenzen von Artikel 37 Absatz 1 MWSTG nicht überschreiten.
**3** Erfolgt keine Meldung innert der Frist von Absatz 1, so muss die steuerpflichtige Person mindestens drei ganze Steuerperioden nach der effektiven Abrechnungsmethode abrechnen, bevor sie sich der Saldosteuersatzmethode unterstellen kann. Ein früherer Wechsel ist bei jeder Anpassung des betreffenden Saldosteuersatzes möglich, die nicht auf eine Änderung der Steuersätze nach den Artikeln 25 und 55 MWSTG zurückzuführen ist.
**4** Die Absätze 1–3 gelten bei rückwirkenden Eintragungen sinngemäss.
**5** Die bei Beginn der Steuerpflicht auf Gegenständen und Dienstleistungen lastende Steuer wird mit der Anwendung der Saldosteuersatzmethode berücksichtigt. Eine Einlageentsteuerung kann nicht vorgenommen werden.

Footnotes as printed by Fedlex (amendment provenance):
- fn80: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** SSS at start of liability: report within 60 days after delivery of the VAT number (Abs. 1); ESTV approves if expected turnover and tax in the first 12 months stay within the Art. 37 limits (Abs. 2). If the notice is missed, at least three full Steuerperioden under the effective method come first (Abs. 3). Tax embedded in goods at the start is taken into account by the SSS itself and NO Einlageentsteuerung is possible (Abs. 5). This is why choosing SSS forfeits the opening-stock input-tax recovery that CGS wants under the effective method.

## MWSTV Art. 79 — Wechsel von der effektiven Abrechnungsmethode zur Saldosteuersatzmethode

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_79 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
**1** Steuerpflichtige Personen, die von der effektiven Abrechnungsmethode zur Saldosteuersatzmethode wechseln wollen, müssen dies der ESTV bis spätestens 60 Tage nach Beginn der Steuerperiode, ab welcher der Wechsel erfolgen soll, melden.
**2** Die ESTV bewilligt die Anwendung der Saldosteuersatzmethode, wenn in der vorangegangenen Steuerperiode keine der Grenzen von Artikel 37 Absatz 1 MWSTG überschritten wurde.
**3** Auf dem Zeitwert der Gegenstände und Dienstleistungen im Zeitpunkt des Wechsels ist die früher in Abzug gebrachte Vorsteuer einschliesslich ihrer als Einlageentsteuerung korrigierten Anteile an die ESTV zurückzuerstatten. Die Deklaration hat in der letzten Abrechnungsperiode vor dem Wechsel zu erfolgen. Artikel 31 Absatz 3 MWSTG und die Artikel 69 Absätze 1–3, 70 und 71 gelten sinngemäss.
**4** Wird gleichzeitig mit der Unterstellung unter die Saldosteuersatzmethode auch die Abrechnungsart nach Artikel 39 MWSTG geändert, so sind per Umstellungsdatum zusätzlich folgende Korrekturen vorzunehmen:

 - a. Wird von vereinbarten auf vereinnahmte Entgelte gewechselt, so hat die steuerpflichtige Person in der letzten Abrechnungsperiode vor dem Wechsel Folgendes rückgängig zu machen:

 - 1. die deklarierte Steuer auf den von ihr in Rechnung gestellten, aber noch nicht bezahlten steuerbaren Leistungen (Debitorenposten); und
 - 2. den Vorsteuerabzug auf den ihr in Rechnung gestellten, aber noch nicht bezahlten steuerbaren Leistungen (Kreditorenposten), sofern es sich dabei um Vorsteuern handelt, die nicht bereits aufgrund von Absatz 3 korrigiert werden müssen.
 - b. Wird von vereinnahmten auf vereinbarte Entgelte gewechselt, so hat die steuerpflichtige Person in der letzten Abrechnungsperiode vor dem Wechsel:

 - 1. die Steuer auf den bestehenden Debitorenposten zum entsprechenden gesetzlichen Steuersatz zu deklarieren; und
 - 2. die auf den Kreditorenposten lastende Steuer als Vorsteuer abzuziehen.

Footnotes as printed by Fedlex (amendment provenance):
- fn81: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Switching effective -> SSS: report within 60 days after period start; allowed if no Art. 37 limit was exceeded in the previous period (Abs. 1-2). On switching, previously deducted input tax on the Zeitwert of goods/services must be repaid in the last period before the switch (Abs. 3); accrual/cash basis changes require extra corrections (Abs. 4).

## MWSTV Art. 80 — Entzug der Bewilligung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_80 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
Steuerpflichtigen Personen, denen die Anwendung der Saldosteuersatzmethode aufgrund falscher Angaben gewährt wurde, kann die ESTV die Bewilligung rückwirkend bis auf den Zeitpunkt der Gewährung dieser Abrechnungsmethode entziehen.

**CGS relevance:** ESTV may withdraw SSS approval retroactively if it was granted on false information.

## MWSTV Art. 81 — Wechsel von der Saldosteuersatzmethode zur effektiven Abrechnungsmethode

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_81 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
**1** Steuerpflichtige Personen, die von der Saldosteuersatzmethode zur effektiven Abrechnungsmethode wechseln wollen, müssen dies der ESTV bis spätestens 60 Tage nach Beginn der Steuerperiode, ab welcher der Wechsel erfolgen soll, melden.
**2** Ein Wechsel ist vor Ablauf der ganzen Steuerperiode zulässig, wenn mit mindestens einem bewilligten Saldosteuersatz abgerechnet wird, den die ESTV angepasst hat, ohne dass die Anpassung auf eine Änderung der Steuersätze nach den Artikeln 25 und 55 MWSTG zurückzuführen ist. Der Wechsel erfolgt auf den Zeitpunkt der Änderung des Saldosteuersatzes.
**3** Wer eine oder beide der in Artikel 37 Absatz 1 MWSTG festgelegten Grenzen in drei aufeinander folgenden Steuerperioden überschreitet, muss auf den Beginn der folgenden Steuerperiode zur effektiven Abrechnungsmethode wechseln.
**4** Die im Zeitpunkt des Wechsels auf dem Zeitwert der Gegenstände und Dienstleistungen lastende Steuer kann in der ersten Abrechnungsperiode nach dem Wechsel als Vorsteuer abgezogen werden. Artikel 32 Absatz 2 MWSTG und die Artikel 72 Absätze 1–3, 73 und 74 gelten sinngemäss.
**5** Wird gleichzeitig mit dem Wechsel zur effektiven Abrechnungsmethode auch die Abrechnungsart nach Artikel 39 MWSTG geändert, so sind per Umstellungsdatum zusätzlich folgende Korrekturen vorzunehmen:

 - a. Wird von vereinbarten auf vereinnahmte Entgelte gewechselt, so muss die steuerpflichtige Person in der letzten Abrechnungsperiode vor dem Wechsel die Steuer abziehen, die sie auf den Debitorenposten deklariert hat; zusätzlich ist eine Belastung der Steuer auf den Kreditorenposten vorzunehmen, bei denen gestützt auf Absatz 4 eine Einlageentsteuerung möglich ist.
 - b. Wird von vereinnahmten auf vereinbarte Entgelte gewechselt, so muss die steuerpflichtige Person in der letzten Abrechnungsperiode vor dem Wechsel auf den Debitorenposten die Steuer zu den bewilligten Saldosteuersätzen deklarieren; auf den Kreditorenposten sind keine Korrekturen vorzunehmen.

Footnotes as printed by Fedlex (amendment provenance):
- fn82: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Switching SSS -> effective: report within 60 days after period start (Abs. 1); mandatory after exceeding a limit in three consecutive periods (Abs. 3). Input tax on the Zeitwert of goods/services held at the switch can be deducted in the first period after (Abs. 4; Einlageentsteuerung rules apply by analogy).

## MWSTV Art. 82 — Ende der Steuerpflicht

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_82 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
**1** Stellt eine nach der Saldosteuersatzmethode abrechnende steuerpflichtige Person ihre Geschäftstätigkeit ein oder wird sie infolge Unterschreitens der Umsatzgrenze von Artikel 10 Absatz 2 Buchstabe a MWSTG von der Steuerpflicht befreit, so sind die bis zur Löschung aus dem Mehrwertsteuerregister erzielten Umsätze, die angefangenen Arbeiten und bei Abrechnung nach vereinnahmten Entgelten auch die Debitorenposten mit den bewilligten Saldosteuersätzen abzurechnen.
**2** und 3 …[fn83]

Footnotes as printed by Fedlex (amendment provenance):
- fn83: Aufgehoben durch Ziff. I der V vom 21. Aug. 2024, mit Wirkung seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** End of liability under SSS: turnover until deregistration, work in progress and (cash basis) debtors are settled at the SSS rates.

## MWSTV Art. 83 — Übernahme von Vermögen im Meldeverfahren

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_83 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
**1** Übernimmt eine nach der Saldosteuersatzmethode abrechnende steuerpflichtige Person im Meldeverfahren nach Artikel 38 MWSTG ein Gesamt- oder Teilvermögen oder sonstige Vermögenswerte von einer effektiv abrechnenden Person, so ist eine Korrektur im Sinne von Artikel 79 Absatz 3 vorzunehmen; vorbehalten bleibt Absatz 2.
**2** Keine Korrektur ist vorzunehmen, wenn das Gesamt- oder Teilvermögen oder die sonstigen Vermögenswerte vom Veräusserer oder von der Veräusserin für eine nicht zum Vorsteuerabzug berechtigende Tätigkeit verwendet wurde.

Footnotes as printed by Fedlex (amendment provenance):
- fn84: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Takeover of assets in the notification procedure by an SSS user: correction as in Art. 79 Abs. 3.

## MWSTV Art. 84 — Abrechnung nach Saldosteuersätzen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_84 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
**1** Steuerpflichtige Personen müssen ihre Tätigkeiten zu den von der ESTV bewilligten Saldosteuersätzen abrechnen.
**2** Wird eine Tätigkeit aufgegeben oder eine neue aufgenommen oder verändern sich die Umsatzanteile der Tätigkeiten derart, dass eine Neuzuteilung der Saldosteuersätze notwendig wird, so muss sich die steuerpflichtige Person mit der ESTV in Verbindung setzen.
**3** Steuerpflichtige Personen, denen mehrere Saldosteuersätze bewilligt wurden, müssen die Erträge für jeden dieser Saldosteuersätze separat verbuchen.[fn85]

Footnotes as printed by Fedlex (amendment provenance):
- fn85: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** SSS users must account for their activities at the SSS rates approved by ESTV; changes in activity mix require contact with ESTV; separate booking per rate (Abs. 3).

## MWSTV Art. 85 — (no heading in the Fedlex text)

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_85 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

(Fedlex shows no text for this provision; see footnote)

Footnotes as printed by Fedlex (amendment provenance):
- fn86: Aufgehoben durch Ziff. I der V vom 21. Aug. 2024, mit Wirkung seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Repealed (01/01/2025).

## MWSTV Art. 86 — Bewilligung der Saldosteuersätze

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_86 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
**1** Für jede Tätigkeit, deren Anteil am Gesamtumsatz aus steuerbaren Leistungen mehr als 10 Prozent beträgt, wird der dafür festgelegte Saldosteuersatz bewilligt.
**2** Massgebend für die Abklärung, ob die 10-Prozent-Grenze überschritten ist, sind:

 - a. bei Personen, die neu steuerpflichtig werden, und bei steuerpflichtigen Personen, die eine neue Tätigkeit aufnehmen, die voraussichtlichen Umsätze in den ersten 12 Monaten;
 - b. bei den übrigen steuerpflichtigen Personen die in den drei vorangegangenen Steuerperioden erzielten Umsätze, wobei der Anteil der betreffenden Tätigkeit am Gesamtumsatz aus steuerbaren Leistungen in jeder dieser Steuerperioden mehr als 10 Prozent betragen haben muss.
**3** Die Umsätze von Tätigkeiten mit gleichem Saldosteuersatz sind bei der Abklärung, ob die 10-Prozent-Grenze überschritten wird, zusammenzuzählen.
**4** Überschreitet der Umsatz einer Tätigkeit oder der Umsatz mehrerer Tätigkeiten, für die der gleiche Saldosteuersatz festgelegt ist, während drei aufeinander folgenden Steuerperioden die 10-Prozent-Grenze nicht mehr, so fällt die Bewilligung zur Anwendung des betreffenden Saldosteuersatzes auf den Beginn der vierten Steuerperiode dahin.

Footnotes as printed by Fedlex (amendment provenance):
- fn87: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** An SSS rate is approved for each activity above 10% of taxable turnover (Abs. 1); based on expected 12-month turnover for new registrants, otherwise on the three prior periods (Abs. 2); approval lapses after three periods below 10% (Abs. 4).

## MWSTV Art. 87 — (no heading in the Fedlex text)

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_87 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

(Fedlex shows no text for this provision; see footnote)

Footnotes as printed by Fedlex (amendment provenance):
- fn88: Aufgehoben durch Ziff. I der V vom 21. Aug. 2024, mit Wirkung seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Repealed (01/01/2025).

## MWSTV Art. 88 — Versteuerung der einzelnen Tätigkeiten

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_88 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
**1** Die Umsätze aus Tätigkeiten der steuerpflichtigen Person, der mehr als ein Saldosteuersatz bewilligt worden ist, sind zum bewilligten Saldosteuersatz zu versteuern, der für die betreffende Tätigkeit festgelegt ist.
**2** Wurde für eine Tätigkeit der dafür festgelegte Saldosteuersatz nicht bewilligt, so sind die damit erzielten Umsätze wie folgt zu versteuern:

 - a. zum nächsttieferen bewilligten Saldosteuersatz, wenn kein höherer Satz bewilligt ist;
 - b. zum nächsthöheren bewilligten Saldosteuersatz in den übrigen Fällen.
**3** In den Fällen von Artikel 19 Absatz 2 MWSTG kann das Gesamtentgelt mit dem bewilligten Saldosteuersatz abgerechnet werden, der nach den Artikeln 84 und 86 sowie nach den Absätzen 1 und 2 für die überwiegende Leistung massgebend ist.
**4** Unterliegen die Leistungen alle dem gleichen Steuersatz nach Artikel 25 MWSTG, so sind die einzelnen Teilleistungen zu den hierfür bewilligten Saldosteuersätzen abzurechnen.
**5** Kann die steuerpflichtige Person nicht nachweisen, welche Anteile auf die einzelnen Teilleistungen entfallen, ist das Gesamtentgelt zum höchsten Saldosteuersatz abzurechnen, der für diese Leistungen bewilligt wurde.
**6** Die steuerpflichtige Person kann den gesamten Umsatz aus steuerbaren Leistungen freiwillig zum höchsten bewilligten Saldosteuersatz abrechnen.

Footnotes as printed by Fedlex (amendment provenance):
- fn89: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Multi-rate SSS: each activity at its approved rate; unapproved activities at the next lower approved rate if none is higher, otherwise the next higher (Abs. 2); combined supplies per Abs. 3-5; voluntary use of the highest approved rate for all turnover (Abs. 6).

## MWSTV Art. 89 — (no heading in the Fedlex text)

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_89 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

(Fedlex shows no text for this provision; see footnote)

Footnotes as printed by Fedlex (amendment provenance):
- fn90: Aufgehoben durch Ziff. I der V vom 21. Aug. 2024, mit Wirkung seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Repealed (01/01/2025).

## MWSTV Art. 90 — Besondere Verfahren

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_90 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
Die ESTV stellt Betrieben und Anlässen nach Artikel 55 Absatz 3 eine Pauschalregelung für die Aufteilung der Umsätze auf gastgewerbliche Leistungen und auf Verkäufe von zum Mitnehmen bestimmten Lebensmitteln nach Artikel 55 Absatz 2 zur Verfügung.

Footnotes as printed by Fedlex (amendment provenance):
- fn91: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Special flat-rate division procedure for catering businesses between on-site service and takeaway; not relevant to CGS.

## MWSTV Art. 91 — Abrechnung der Bezugsteuer

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_91 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
Nach der Saldosteuersatzmethode abrechnende steuerpflichtige Personen, die Leistungen nach Artikel 45 Absatz 1 MWSTG beziehen, müssen die Bezugsteuer in der entsprechenden Abrechnungsperiode zum hierfür geltenden gesetzlichen Steuersatz entrichten.

Footnotes as printed by Fedlex (amendment provenance):
- fn92: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** SSS users must still pay Bezugsteuer on foreign services at the statutory rate in the relevant period.

## MWSTV Art. 92 — Eigenverbrauch

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_92 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
Der Eigenverbrauch ist mit der Anwendung der Saldosteuersatzmethode berücksichtigt.

Footnotes as printed by Fedlex (amendment provenance):
- fn93: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Eigenverbrauch is already covered by the SSS rate (no separate correction).

## MWSTV Art. 93 — (no heading in the Fedlex text)

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_93 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

(Fedlex shows no text for this provision; see footnote)

Footnotes as printed by Fedlex (amendment provenance):
- fn94: Aufgehoben durch Ziff. I der V vom 21. Aug. 2024, mit Wirkung seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Repealed (01/01/2025).

## MWSTV Art. 94 — Leistungen an eng verbundene Personen und das Personal

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_94 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
**1** Leistungen an eng verbundene Personen und an das Personal sind mit dem nach den Artikeln 84, 86 und 88 für die betreffende Leistung massgebenden bewilligten Saldosteuersatz abzurechnen.
**2** Leistungen, die im Lohnausweis zuhanden der direkten Steuern aufgeführt werden müssen, gelten immer als entgeltlich erbracht. Die Steuer ist auf der Grundlage des Betrages zu berechnen, der auch für die direkten Steuern massgebend ist.

Footnotes as printed by Fedlex (amendment provenance):
- fn95: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Supplies to closely connected persons and staff are accounted at the approved SSS rate; items on the salary statement are always treated as paid supplies.

## MWSTV Art. 95 — Verkäufe von Betriebsmitteln, Anlagegütern und aktivierbaren Dienstleistungen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_95 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
Verkäufe von Betriebsmitteln, Anlagegütern und aktivierbaren Dienstleistungen, die nicht ausschliesslich zur Erbringung von Leistungen, die von der Steuer ausgenommen sind, eingesetzt wurden, sind mit dem nach den Artikeln 84, 86 und 88 für die betreffende Leistung massgebenden bewilligten Saldosteuersatz abzurechnen.

Footnotes as printed by Fedlex (amendment provenance):
- fn96: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Sales of operating assets, fixed assets and capitalisable services are accounted at the approved SSS rate (e.g. selling a used machine would be taxed at the SSS rate).

## MWSTV Art. 96 — Rechnungsstellung zu einem zu hohen Steuersatz

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_96 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 Abs. 1–4 MWSTG)
Stellt eine mit Saldosteuersätzen abrechnende steuerpflichtige Person eine Leistung zu einem zu hohen Steuersatz in Rechnung, so muss sie zusätzlich zu der mit dem Saldosteuersatz berechneten Mehrwertsteuer auch die Differenz zwischen der nach dem ausgewiesenen Steuersatz berechneten Steuer und der nach dem Steuersatz nach Artikel 25 MWSTG berechneten Steuer entrichten. Dabei wird das Entgelt als inklusive Mehrwertsteuer betrachtet.

**CGS relevance:** If an SSS user invoices at too high a rate, they owe the SSS-rate tax plus the difference between the invoiced rate and the Art. 25 rate.

## MWSTV Art. 106 — Wechsel der Abrechnungsart bei Abrechnung nach der effektiven Methode

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_106 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 39 MWSTG)
**1** Beim Wechsel von der Abrechnung nach vereinnahmten Entgelten zur Abrechnung nach vereinbarten Entgelten muss die steuerpflichtige Person in der auf den Wechsel folgenden Abrechnungsperiode:

 - a. die Steuer auf den im Zeitpunkt des Wechsels bestehenden Debitorenposten abrechnen; und
 - b. die Vorsteuern auf den im Zeitpunkt des Wechsels bestehenden Kreditorenposten im Rahmen der zum Vorsteuerabzug berechtigenden unternehmerischen Tätigkeit abziehen.
**2** Beim Wechsel von der Abrechnung nach vereinbarten Entgelten zur Abrechnung nach vereinnahmten Entgelten muss die steuerpflichtige Person in der auf den Wechsel folgenden Abrechnungsperiode:

 - a. die im Zeitpunkt des Wechsels bestehenden Debitorenposten von den in dieser Abrechnungsperiode vereinnahmten Entgelten abziehen; und
 - b. die Vorsteuern auf den im Zeitpunkt des Wechsels bestehenden Kreditorenposten von den in dieser Abrechnungsperiode bezahlten Vorsteuern abziehen.
**3** Wird gleichzeitig mit dem Wechsel der Abrechnungsart auch die Abrechnungsmethode nach den Artikeln 36 und 37 MWSTG geändert, so gilt Artikel 79 Absatz 4 beziehungsweise Artikel 81 Absatz 5[fn104] dieser Verordnung.

Footnotes as printed by Fedlex (amendment provenance):
- fn104: Der Verweis wurde in Anwendung von Art. 12 Abs. 2 des Publikationsgesetzes vom 18. Juni 2004 (SR 170.512) auf den 1. Jan. 2025 angepasst.

**CGS relevance:** Changing between accrual (vereinbart) and cash (vereinnahmt) basis under the effective method: opening debtors/creditors are declared or deducted in the period following the change. Compare Art. 39-40 MWSTG. Note: the 2025 consolidation cites 'Art. 81 Abs. 6' in Abs. 3; the 2027 consolidation corrects the cross-reference to Abs. 5.

## MWSTV Art. 111b — (no heading in the Fedlex text)

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_111_b (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

Das Versandhandelsunternehmen kann bei der Einfuhr von Gegenständen mit dem Leistungserbringer oder der Leistungserbringerin nach Artikel 20a MWSTG vereinbaren, dass es die Einfuhr im eigenen Namen vornimmt, sofern es mindestens eine der beiden Bedingungen von Artikel 7 Absatz 3 MWSTG erfüllt.

**CGS relevance:** A mail-order company can agree with an Art. 20a platform that it imports in its own name if it meets one of the Art. 7 Abs. 3 MWSTG conditions.

## MWSTV Art. 112 — Sachgesamtheiten und Leistungskombinationen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_112 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 52 Abs. 3 und 19 Abs. 2 MWSTG)
**1** Wird bei der Einfuhr die Veranlagung nach Artikel 19 Absatz 2 MWSTG verlangt, so muss im Zeitpunkt der Zollanmeldung eine Kostenkalkulation eingereicht werden.
**2** Aus der Kostenkalkulation müssen ersichtlich sein:

 - a. die Selbstkosten der einzelnen Leistungen;
 - b. das Gesamtentgelt.
**3** Kostenbestandteile, die den einzelnen Leistungen nicht vollständig zugeordnet werden können, wie Gemeinkosten, Gewinn oder Beförderungskosten, sind wertanteilig auf die einzelnen Leistungen aufzuteilen.
**4** Das Bundesamt für Zoll und Grenzsicherheit (BAZG)[fn113] kann im Einzelfall zur Überprüfung der Kalkulation weitere Unterlagen einfordern.

Footnotes as printed by Fedlex (amendment provenance):
- fn113: Die Bezeichnung der Verwaltungseinheit wurde in Anwendung von Art. 20 Abs. 2 der Publikationsverordnung vom 7. Okt. 2015 (AS 2015 3989) auf den 1. Jan. 2022 angepasst. Diese Anpassung wurde im ganzen Text vorgenommen.

**CGS relevance:** Combined supplies at import: a cost calculation must be filed with the customs declaration if Art. 19 Abs. 2 MWSTG treatment is requested.

## MWSTV Art. 117 — Verlagerung der Entrichtung der Einfuhrsteuer

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_117 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 63 MWSTG)
**1** Wer Steuern im Verlagerungsverfahren entrichten will, bedarf einer Bewilligung der ESTV.
**2** Bestehen Zweifel darüber, ob die Voraussetzungen für die Verlagerung der Einfuhrsteuer erfüllt sind, so erhebt das BAZG die Steuer.
**3** Die Verjährung der verlagerten Einfuhrsteuerschuld richtet sich nach Artikel 42 MWSTG.
**4** Die ESTV regelt den Vollzug im Einvernehmen mit dem BAZG.

**CGS relevance:** The deferral procedure (Verlagerungsverfahren, Art. 63 MWSTG) requires ESTV approval; BAZG levies the tax if the conditions are doubtful.

## MWSTV Art. 118 — Bewilligungsvoraussetzungen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_118 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 63 MWSTG)
**1** Die Bewilligung wird erteilt, wenn die steuerpflichtige Person:

 - a. die Mehrwertsteuer nach der effektiven Methode abrechnet;
 - b. im Rahmen ihrer unternehmerischen Tätigkeit regelmässig Gegenstände importiert und exportiert;
 - c. über diese Gegenstände eine detaillierte Einfuhr-, Lager- und Ausfuhrkontrolle führt;
 - d.[fn119] in ihren periodischen Steuerabrechnungen mit der ESTV regelmässig Vorsteuerüberschüsse aus Ein- und Ausfuhren von Gegenständen nach Buchstabe b von mehr als 10 000 Franken pro Jahr ausweist, die aus der Entrichtung der Einfuhrsteuer an das BAZG herrühren; und
 - e. Gewähr bietet für einen ordnungsgemässen Ablauf des Verfahrens.
**1bis** Leistungserbringern oder Leistungserbringerinnen nach Artikel 20a MWSTG, gegen die eine administrative Massnahme nach Artikel 79a MWSTG verfügt war, kann die Bewilligung für die Anwendung des Verlagerungsverfahrens auf Antrag hin ab dem Folgetag der Aufhebung der Verfügung erteilt werden.[fn120]
**2** Die Erteilung oder Aufrechterhaltung der Bewilligung kann von der Leistung von Sicherheiten in Höhe der mutmasslichen Ansprüche abhängig gemacht werden.

Footnotes as printed by Fedlex (amendment provenance):
- fn119: Fassung gemäss Ziff. I der V vom 18. Okt. 2017, in Kraft seit 1. Jan. 2018 (AS 2017 6307).
- fn120: Eingefügt durch Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Approval requires the effective method, regular import AND export of goods with detailed import/storage/export control, regular input-tax surpluses from import/export above CHF 10'000 per year, and orderly processing (Abs. 1). CGS import volumes are unlikely to meet lit. d, so import VAT will normally be paid via customs and deducted in the return.

## MWSTV Art. 119 — Wegfall der Bewilligungsvoraussetzungen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_119 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 63 MWSTG)
Fällt eine der Voraussetzungen der Bewilligung nach Artikel 118 Absatz 1 Buchstaben a–d weg, so muss die steuerpflichtige Person die ESTV unverzüglich schriftlich benachrichtigen.

**CGS relevance:** Lapse of the approval conditions; read with Art. 118.

## MWSTV Art. 122 — Papierlose Belege

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_122 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 70 Abs. 4 MWSTG)[fn125]
Für die Übermittlung und Aufbewahrung papierloser Belege gelten die Artikel 957–958f des Obligationenrechts[fn126] und die Geschäftsbücherverordnung vom 24. April 2002[fn127].

Footnotes as printed by Fedlex (amendment provenance):
- fn124: Fassung gemäss Ziff. I der V vom 18. Okt. 2017, in Kraft seit 1. Jan. 2018 (AS 2017 6307).
- fn125: Eingefügt durch Ziff. I der V vom 16. Juni 2023, in Kraft seit 1. Jan. 2024 (AS 2023 312).
- fn126: SR 220
- fn127: SR 221.431

**CGS relevance:** Paperless vouchers and records must follow OR Art. 957-958f and the Geschäftsbücherverordnung (SR 221.431).

## MWSTV Art. 123 — Elektronische Verfahren

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_123 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 65a MWSTG)
**1** Wird das elektronische Verfahren vorgeschrieben, so müssen sämtliche Eingaben an die ESTV elektronisch über das hierfür vorgesehene Portal erfolgen.
**2** Das elektronische Verfahren wird vorgeschrieben für:

 - a. die Gruppenbesteuerung (Art. 13 MWSTG);
 - b. die jährliche Abrechnung (Art. 35a und 86a MWSTG);
 - c. die Saldosteuersatzmethode (Art. 37 Abs. 1–4 MWSTG);
 - d. die Pauschalsteuersatzmethode (Art. 37 Abs. 5 MWSTG);
 - e. die Anmeldung als steuerpflichtige Person (Art. 66 Abs. 1 MWSTG);
 - f. die Abmeldung als steuerpflichtige Person (Art. 66 Abs. 2 MWSTG);
 - g. die Einreichung der Abrechnung (Art. 71 MWSTG);
 - h. die nachträglichen Korrekturen der Abrechnung (Art. 72 MWSTG).

Footnotes as printed by Fedlex (amendment provenance):
- fn128: Fassung gemäss Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025, Abs. 2 Bst. a, c, d und f in Kraft seit 1. Jan. 2027 in Kraft (AS 2024 485).

**CGS relevance:** Electronic procedures are mandatory via the ESTV portal for annual reporting (lit. b), registration (lit. e), deregistration (lit. f), filing of returns (lit. g) and corrections (lit. h); lit. a, c, d, f apply from 01/01/2027 (footnote). Relevant: CGS must file through the ESTV online portal.

## MWSTV Art. 124 und 125 — (no heading in the Fedlex text)

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_124_125 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

(Fedlex shows no text for this provision; see footnote)

Footnotes as printed by Fedlex (amendment provenance):
- fn129: Aufgehoben durch Ziff. I der V vom 18. Okt. 2017, mit Wirkung seit 1. Jan. 2018 (AS 2017 6307).

**CGS relevance:** Repealed; record-keeping detail sits in MWSTG Art. 70 and OR/GeBüV.

## MWSTV Art. 126 — Effektive Abrechnungsmethode

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_126 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 71 und 72 MWSTG)
**1** Bei der effektiven Abrechnungsmethode muss die steuerpflichtige Person für die Abrechnung mit der ESTV die folgenden Werte in geeigneter Weise festhalten:

 - a. das Total aller der Inlandsteuer unterliegenden Entgelte; dieses umfasst namentlich die Entgelte für:

 - 1. besteuerte Leistungen, aufgeteilt nach Steuersätzen,
 - 2. Leistungen, die nach Artikel 22 MWSTG freiwillig versteuert werden (Option),
 - 3. Leistungen, die nach Artikel 23 MWSTG von der Steuer befreit sind,
 - 4. Leistungen an Begünstigte nach Artikel 2 GSG[fn130], die nach Artikel 143 dieser Verordnung von der Mehrwertsteuer befreit sind,
 - 5. Leistungen, für die das Meldeverfahren nach Artikel 38 MWSTG angewendet wurde,
 - 6. Leistungen, die nach Artikel 21 MWSTG von der Steuer ausgenommen sind;
 - b. Minderungen des Entgelts bei Abrechnung nach vereinbarten Entgelten, soweit sie nicht in einer anderen Position berücksichtigt sind;
 - c. die nicht im Anwendungsbereich der Mehrwertsteuer liegenden:

 - 1. Entgelte aus Leistungen, deren Ort nach den Artikeln 7 und 8 MWSTG im Ausland liegt,
 - 2. nicht als Entgelte geltenden Mittelflüsse nach Artikel 18 Absatz 2 Buchstaben a–c MWSTG,
 - 3. anderen nicht als Entgelte geltenden Mittelflüsse nach Artikel 18 Absatz 2 Buchstaben d–l MWSTG;
 - d. das Total der Entgelte für der Bezugsteuer unterliegende Leistungen, aufgeteilt nach Steuersätzen;
 - e. das Total aller abziehbaren Vorsteuern, vor den Korrekturen und Kürzungen nach Buchstabe f, aufgeteilt in:

 - 1. Vorsteuer auf Material- und Dienstleistungsaufwand,
 - 2. Vorsteuer auf Investitionen und übrigem Betriebsaufwand,
 - 3. Einlageentsteuerung;
 - f. die Beträge, um die der Vorsteuerabzug korrigiert oder gekürzt werden muss infolge:

 - 1. gemischter Verwendung nach Artikel 30 MWSTG,
 - 2. Eigenverbrauchs nach Artikel 31 MWSTG,
 - 3. Erhalts von Mittelflüssen, die nicht als Entgelt gelten, nach Artikel 33 Absatz 2 MWSTG;
 - g. das Total der im Verlagerungsverfahren abgerechneten Einfuhrsteuer.
**2** Die ESTV kann mehrere Werte nach Absatz 1 unter einer Ziffer des Abrechnungsformulars zusammenfassen oder darauf verzichten, sie im Rahmen der periodischen Abrechnung zu verlangen.

Footnotes as printed by Fedlex (amendment provenance):
- fn130: SR 192.12

**CGS relevance:** Effective method: the list of figures CGS must be able to produce for each return (turnover by rate, exempt, exports, Bezugsteuer, input tax etc.); the bookkeeping must capture them.

## MWSTV Art. 127 — Abrechnung nach der Saldosteuersatz- oder der Pauschalsteuersatzmethode

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_127 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 71 und 72 MWSTG)
**1** Bei der Saldosteuersatz- und der Pauschalsteuersatzmethode muss die steuerpflichtige Person für die Abrechnung mit der ESTV die folgenden Werte in geeigneter Weise festhalten:

 - a. das Total aller der Inlandsteuer unterliegenden Entgelte; dieses umfasst namentlich die Entgelte für:

 - 1. besteuerte Leistungen, aufgeteilt nach Saldosteuersätzen beziehungsweise Pauschalsteuersätzen,
 - 2. Leistungen, die nach Artikel 23 MWSTG von der Steuer befreit sind,
 - 3. Leistungen an Begünstigte nach Artikel 2 GSG[fn131], die nach Artikel 143 dieser Verordnung von der Mehrwertsteuer befreit sind,
 - 4. Leistungen, für die das Meldeverfahren nach Artikel 38 MWSTG angewendet wurde,
 - 5. Leistungen, die nach Artikel 21 MWSTG von der Steuer ausgenommen sind;
 - b. Minderungen des Entgelts bei Abrechnung nach vereinbarten Entgelten, soweit sie nicht in einer anderen Position berücksichtigt sind;
 - c. die nicht im Anwendungsbereich der Mehrwertsteuer liegenden:

 - 1. Entgelte aus Leistungen, deren Ort nach den Artikeln 7 und 8 MWSTG im Ausland liegt,
 - 2. nicht als Entgelte geltenden Mittelflüsse nach Artikel 18 Absatz 2 Buchstaben a–c MWSTG,
 - 3. anderen nicht als Entgelte geltenden Mittelflüsse nach Artikel 18 Absatz 2 Buchstaben d–l MWSTG;
 - d. das Total der Entgelte für der Bezugsteuer unterliegende Leistungen, aufgeteilt nach Steuersätzen;
 - e. und f.[fn132] …
 - g.[fn133] die Korrekturen nach den Artikeln 79 Absätze 3 und 4, 81 Absätze 4 und 5[fn134] sowie 83 Absatz 1.
**2** Die ESTV kann mehrere Werte nach Absatz 1 unter einer Ziffer des Abrechnungsformulars zusammenfassen oder darauf verzichten, sie im Rahmen der periodischen Abrechnung zu verlangen.

Footnotes as printed by Fedlex (amendment provenance):
- fn131: SR 192.12
- fn132: Aufgehoben durch Ziff. I der V vom 21. Aug. 2024, mit Wirkung seit 1. Jan. 2025 (AS 2024 485).
- fn133: Eingefügt durch Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).
- fn134: Der Verweis wurde in Anwendung von Art. 12 Abs. 2 des Publikationsgesetzes vom 18. Juni 2004 (SR 170.512) angepasst.

**CGS relevance:** SSS/flat-rate counterpart of Art. 126, listed for completeness; the 2025 and 2027 consolidations differ only by a corrected cross-reference in lit. g.

## MWSTV Art. 128 — Zusätzliche Unterlagen

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_128 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 71 und 72 MWSTG)
**1** Die ESTV kann von der steuerpflichtigen Person die Einreichung namentlich folgender Unterlagen verlangen:

 - a. eine Zusammenfassung der in Artikel 126 beziehungsweise 127 genannten Angaben für die gesamte Steuerperiode (Deklaration für die Steuerperiode);
 - b. die rechtsgültig unterzeichnete Jahresrechnung oder, wenn die steuerpflichtige Person nicht buchführungspflichtig ist, eine Aufstellung über die Einnahmen und Ausgaben sowie über das Geschäftsvermögen zu Beginn und am Ende der Steuerperiode;
 - c. den Revisionsbericht, soweit für die steuerpflichtige Person ein solcher zu erstellen ist;
 - d. eine Umsatzabstimmung nach Absatz 2;
 - e. bei steuerpflichtigen Personen, die nach der effektiven Methode abrechnen, eine Vorsteuerabstimmung nach Absatz 3;
 - f. bei steuerpflichtigen Personen, die nach der effektiven Methode abrechnen, eine Aufstellung über die Berechnung der vorgenommenen Vorsteuerkorrekturen und -kürzungen, aus der die Vorsteuerkorrekturen nach Artikel 30 MWSTG, die Eigenverbrauchstatbestände nach Artikel 31 MWSTG und die Vorsteuerabzugskürzungen nach Artikel 33 Absatz 2 MWSTG ersichtlich sind.
**2** Aus der Umsatzabstimmung muss ersichtlich sein, wie die Deklaration für die Steuerperiode unter Berücksichtigung der verschiedenen Steuersätze beziehungsweise der Saldo- oder Pauschalsteuersätze mit dem Jahresabschluss in Übereinstimmung gebracht wird. Namentlich zu berücksichtigen sind:

 - a. der in der Jahresrechnung ausgewiesene Betriebsumsatz;
 - b. die Erträge, die auf Aufwandkonten verbucht wurden (Aufwandminderungen);
 - c. die konzerninternen Verrechnungen, die nicht im Betriebsumsatz enthalten sind;
 - d. die Verkäufe von Betriebsmitteln;
 - e. die Vorauszahlungen;
 - f. die übrigen Zahlungseingänge, die nicht im ausgewiesenen Betriebsumsatz enthalten sind;
 - g. die geldwerten Leistungen;
 - h. die Erlösminderungen;
 - i. die Debitorenverluste; und
 - j. die Abschlussbuchungen wie die zeitlichen Abgrenzungen, die Rückstellungen und internen Umbuchungen, die nicht umsatzrelevant sind.
**3** Aus der Vorsteuerabstimmung muss ersichtlich sein, dass die Vorsteuern gemäss Vorsteuerkonti oder sonstigen Aufzeichnungen mit den deklarierten Vorsteuern abgestimmt wurden.
**4** Die Einforderung zusätzlicher Unterlagen nach den Absätzen 1–3 stellt kein Einfordern von umfassenden Unterlagen im Sinn von Artikel 78 Absatz 2 MWSTG dar.

**CGS relevance:** ESTV may request supporting documents: period summary, signed annual accounts, auditor's report, turnover reconciliation, input-tax reconciliation (effective method) and more. Plan the bookkeeping so the Umsatzabstimmung and Vorsteuerabstimmung can be produced.

## MWSTV Art. 129 — Korrektur

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_129 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 72 MWSTG)
Die Korrektur von Mängeln in zurückliegenden Abrechnungen muss getrennt von den ordentlichen Abrechnungen erfolgen.

**CGS relevance:** Corrections of past returns must be submitted separately from ordinary returns.

## MWSTV Art. 165 — Einlageentsteuerung

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_165 (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 32 MWSTG)
Die Bestimmungen über die Einlageentsteuerung sind nicht anwendbar bei:

 - a.[fn184] nicht als Entgelt geltenden Mittelflüssen (Art. 18 Abs. 2 MWSTG), die mit Inkrafttreten des neuen Rechts nach Artikel 33 Absatz 1 MWSTG nicht mehr zu einer Kürzung des Vorsteuerabzugs führen;
 - b. im Rahmen des Baueigenverbrauchs nach Artikel 9 Absatz 2 des Mehrwertsteuergesetzes vom 2. September 1999[fn185] besteuerten Eigenleistungen.

Footnotes as printed by Fedlex (amendment provenance):
- fn184: Fassung gemäss Ziff. I der V vom 18. Juni 2010, in Kraft seit 1. Jan. 2010 (AS 2010 2833).
- fn185: [AS 2000 1300]

**CGS relevance:** Transitional provision from the 2010 law change (not relevant to a 2027 registration).

## MWSTV Art. 166c — Übergangsbestimmungen zur Änderung vom 16. Juni 2023

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_166_c (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 65a MWSTG und Art. 123 der vorliegenden Verordnung)
**1** Steuerpflichtige Personen, die die Abrechnungen vor dem Inkrafttreten der Änderung vom 16. Juni 2023 in Papierform eingereicht haben, können die Abrechnungen bis zum 31. Dezember 2024 weiterhin in Papierform einreichen.
**2** Korrekturen von Abrechnungen, die in Papierform eingereicht wurden, sind ebenfalls in Papierform einzureichen.

Footnotes as printed by Fedlex (amendment provenance):
- fn189: Eingefügt durch Ziff. I der V vom 16. Juni 2023, in Kraft seit 1. Jan. 2024 (AS 2023 312).

**CGS relevance:** Transitional rule for paper filing until 31/12/2024 (historical); electronic filing is now mandatory.

## MWSTV Art. 166d — Übergangsbestimmung zur Änderung vom 21. August 2024

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_166_d (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 35 Abs. 1bis Bst. b MWSTG)
Steuerpflichtige Personen, die im Zeitpunkt des Inkrafttretens der Änderung vom 21. August 2024 noch nicht ein ganzes Jahr im Mehrwertsteuerregister eingetragen sind, haben für die Abklärung, ob die Umsatzgrenze von Artikel 35 Absatz 1bis Buchstabe b MWSTG überschritten wird, ihren erzielten Umsatz auf ein volles Jahr umzurechnen.

Footnotes as printed by Fedlex (amendment provenance):
- fn190: Eingefügt durch Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** Annualisation of turnover for persons registered for less than a year when checking the Art. 35 Abs. 1bis lit. b limit at the 01/01/2025 change.

## MWSTV Art. 166e — Übergangsbestimmung zur Änderung vom 21. August 2024

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2009/828/de#art_166_e (text taken from the Fedlex filestore HTML of this version, see Sources)
- Stand am: 1. Januar 2027 (Fedlex consolidation 2027-01-01; applies from 01/01/2027, the registration date)

 (Art. 37 MWSTG)
**1** Die Fristen nach Artikel 37 Absatz 4 MWSTG für den Wechsel von der effektiven Abrechnungsmethode zur Saldosteuersatzmethode und umgekehrt beginnen mit Inkrafttreten der Änderung vom 21. August 2024 neu zu laufen.
**2** Die Fristen nach Artikel 98 Absatz 2 für den Wechsel von der effektiven Abrechnungsmethode zur Pauschalsteuersatzmethode und umgekehrt beginnen mit Inkrafttreten der Änderung vom 21. August 2024 neu zu laufen.

Footnotes as printed by Fedlex (amendment provenance):
- fn191: Eingefügt durch Ziff. I der V vom 21. Aug. 2024, in Kraft seit 1. Jan. 2025 (AS 2024 485).

**CGS relevance:** SSS/effective switching waiting periods restarted on 01/01/2025.

## SR 631.014 — Verzugs- und Vergütungszinssätze (Zinssatzverordnung EFD)

- Fedlex: https://www.fedlex.admin.ch/eli/cc/2025/564/de (text via filestore, Sources #9). Verordnung des EFD vom 10. September 2025 über die Verzugs- und die Vergütungszinssätze auf Abgaben, Steuern und Sanktionen (Zinssatzverordnung EFD), Stand am 1. Januar 2026. It replaced the Zinssatzverordnung EFD vom 25. Juni 2021 (AS 2021 432; 2024 535).

Art. 1 Gegenstand

Diese Verordnung legt für die folgenden vom Bund erhobenen Abgaben, Steuern und Sanktionen die Zinssätze für die Verzugszinsen und die Vergütungszinsen fest:

 - a. Zollabgaben;
 - b. leistungsabhängige Schwerverkehrsabgabe;
 - c. CO2-Abgabe;
 - d. Lenkungsabgabe auf flüchtigen organischen Verbindungen;
 - e. Mehrwertsteuer;
 - f. Tabaksteuer;
 - g. Biersteuer;
 - h. Automobilsteuer;
 - i. Mineralölsteuer;
 - j. Stempelabgaben;
 - k. direkte Bundessteuer;
 - l. Ergänzungssteuer zum Zweck der Mindestbesteuerung grosser multinationaler Unternehmensgruppen;
 - m. Verrechnungssteuer;
 - n. Steuer auf gebrannten Wassern;
 - o. Sanktionen nach der CO2-Gesetzgebung wegen:

 - 1. Überschreitung der individuellen Zielvorgabe,
 - 2. Nichteinhaltung der Pflicht zur Abgabe von Emissionsrechten,
 - 3. Nichterfüllung der Verminderungsverpflichtung und der Investitionspflicht,
 - 4. Nichterfüllung der Kompensationspflicht.

Art. 2 Festlegung der Zinssätze

**1** Die Zinssätze für Verzugs- und Vergütungszinsen auf den in Artikel 1 aufgeführten Abgaben, Steuern und Sanktionen werden pro Kalenderjahr festgelegt.
**2** Der Zinssatz für Vergütungszinsen auf Vorauszahlungen vor Eintritt der Fälligkeit basiert auf dem arithmetischen Mittel der Renditen der Bundesobligationen mit 1-, 2- und 3-jähriger Laufzeit gemäss Stand von Ende Juni des Vorjahres, wobei der Durchschnitt auf einen Viertelprozentpunkt gerundet wird. Er beträgt jedoch mindestens 0 Prozent und höchstens 5 Prozent.
**3** Die folgenden Zinssätze bestimmen sich durch einen Aufschlag auf dem Zinssatz für die Vergütungszinsen auf Vorauszahlungen vor Eintritt der Fälligkeit:

 - a. Zinssatz für Verzugszinsen;
 - b. Zinssatz für Vergütungszinsen auf Rückerstattungen;
 - c. Zinssatz für Vergütungszinsen auf Rückzahlungen für zu Unrecht erhobene Steuern und für zu Unrecht nicht zurückerstattete Steuern;
 - d. Zinssatz für Vergütungszinsen bei bedingter Zahlungspflicht.
**4** Die Höhe des Aufschlags wird nach Anhang 1 abhängig von der Höhe des Zinssatzes für Vergütungszinse festgelegt. Die Bandbreiten, innerhalb denen die Zinssätze nach Absatz 2 festgelegt werden, finden sich ebenfalls in Anhang 1.

Art. 3 Verzicht auf die Erhebung oder Ausrichtung

**1** Verzugszinsen und Vergütungszinsen auf den Abgaben und Steuern nach Artikel 1 Buchstaben a–i und n werden erst ab einem Zinsbetrag von 100 Franken erhoben oder ausgerichtet. Vorbehalten bleiben Verzugszinsen für Forderungen, die im Rahmen des Zwangsvollstreckungsverfahrens erhoben werden.
**2** Bei Nachforderungen der Einfuhrsteuer werden keine Verzugszinsen auf der Mehrwertsteuer erhoben, wenn der Importeur oder die Importeurin im Zeitpunkt der Einfuhr im Inland als steuerpflichtige Person eingetragen war und die Einfuhrsteuer als Vorsteuer hätte abziehen können.

Art. 4 Zinssätze

**1** Die Zinssätze sind in Anhang 2 aufgeführt.
**2** Die Zinssätze für das Kalenderjahr 2025 werden nach dem bisherigen Recht festgelegt.
**3** Die Zinssätze für die Kalenderjahre vor 2025 wurden nach dem damals gültigen Recht festgelegt.

Anhang 2 Ziff. 1 (Zinssätze ab dem Kalenderjahr 2022), reproduced from the Fedlex table:

| Kalenderjahr | Zinssatz für Vergütungszinsen auf Vorauszahlungen (%) | Zinssatz für Verzugszinsen (%) | Zinssatz für Vergütungszinsen auf Rückerstattungen, Rückzahlungen, bei bedingter Zahlungspflicht (%) |
|---|---|---|---|
| 2022 | 0,0 | 4,0 | 4,0 |
| 2023 | 0,0 | 4,0 | 4,0 |
| 2024 | 1,25 | 4,75 | 4,75 |
| 2025 | 0,75 | 4,5 | 4,5 |
| ab 2026 | 0,0 | 4,0 | 4,0 |

For 2027: ESTV press release "Keine Änderung der Vergütungs- und Verzugszinssätze für Bundessteuern, -abgaben und -sanktionen für 2027" (published 22/09/2026, https://www.estv.admin.ch/de/newnsb/bCxrY5LSQCuF): "Der Verzugszins und der Vergütungszins auf Rückerstattungen betragen weiterhin 4.00%." The 2027 figure rests on this press release, not on an amended consolidated Verordnung text.

**CGS relevance:** Late-payment interest on MWST (MWSTG Art. 87; import tax Art. 57) is 4.0% p.a. in 2026 and 2027; refund interest on MWST refunds (MWSTG Art. 88 Abs. 4, from day 61) is also 4.0%. Art. 3 Abs. 1 waives interest below CHF 100 only for the taxes in Art. 1 lit. a-i and n, and MWST is lit. e, so the waiver applies to MWST.

## Fetch failures / gaps

- The official ELI pages (https://www.fedlex.admin.ch/eli/cc/2009/615/de and .../2009/828/de) are JavaScript shells with no law text via plain HTTP or WebFetch; the text was taken from the Fedlex filestore HTML for the same consolidated versions. The ELI-fragment URLs given per article (...#art_N) were not verified in a browser.
- MWSTG: latest consolidation is Stand 31 March 2025. No consolidation for 2026/2027 exists on Fedlex (SPARQL plus filestore probes). Any amendment adopted but not yet consolidated would not appear here.
- MWSTG Art. 21 is quoted only in part (Abs. 1, Abs. 2 lead-in, Ziff. 21, 22, 24) as instructed; Art. 96 only Abs. 1 (headline-only instruction); Art. 97 and 98 in full because short.
- Not retrieved (not requested): MWSTG Art. 2, 4-6, 8-9, 12-13, 15-17, 19-20, 22, 24a, 43-44, 58-65, 67, 69, 73-85, 89, 91-95, 99-116; MWSTV Art. 1-8, 10-44, 47-56, 97-105, 107-116, 120-121, 130-164, 166-167. MWSTV Art. 97-105 (Pauschalsteuersatz, Meldeverfahren) were skipped.
- Detailed export-evidence rules (Nachweis der Ausfuhr) are NOT in MWSTG Art. 23 or in the MWSTV articles retrieved; they sit in ESTV practice (MWST-Info on Steuerbefreiung/Ausfuhr) and customs export declarations, which were not fetched.
- The EFD ordinance setting the small-consignment thresholds behind MWSTG Art. 53 Abs. 1 lit. a was not fetched.
- ESTV practice on Einlageentsteuerung at the start of liability (documentation of opening stock, which period to claim, treatment of pre-registration purchases) is NOT in this pack: only the statute (MWSTG Art. 32) and the ordinance text (MWSTV Art. 72-74) are quoted.
- Geschäftsbücherverordnung (SR 221.431) and OR Art. 957-958f (referenced by MWSTG Art. 70 Abs. 2 and MWSTV Art. 122) were not fetched. MWSTV Art. 124-125 (cited in the task brief for Buchführung/Aufbewahrung) are repealed since 01/01/2018.
- SR 631.014: the 2027 rate rests on an ESTV press release. SR 641.207.1 named in the task brief was not found; MWST interest rates are governed by SR 631.014 (Art. 1 lit. e).
- The "CGS relevance" notes are commentary by the research lane, not retrieved text, and have not been reviewed by a Swiss tax adviser.
