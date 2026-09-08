# -*- coding: utf-8 -*-
"""
Phase 3 — generate the 14 remaining gun-model landing pages.

Template = the owner-approved CZ Shadow 2 draft (page id 813336), section order and
verbatim blocks per memory `cgs-holster-copy-rules`.
Fitment = wcpa-forms-lists-export-01-08-2026.json (verified, not assumed).

Output: gunpages.json  ->  [{slug, title, content}]  for POST /wp-json/wp/v2/pages (status=draft)
"""
import json, io, os

HUB = "/kydex-holster/"

TABLE = """<h2>Welches Holster für die {gun}?</h2>
<table>
<thead><tr><th>Holster</th><th>Trageweise</th><th>Preis</th></tr></thead>
<tbody>
<tr><td><a href="/artikel/ipsc_idpa_holster/">IPSC &amp; IDPA „PRIMUS“</a></td><td>Aussenbund</td><td>ab CHF 75.–</td></tr>
<tr><td><a href="/artikel/owb-holster/">OWB „CITADEL“</a></td><td>Aussenbund</td><td>ab CHF 75.–</td></tr>
<tr><td><a href="/artikel/pancake-holster/">Pancake „ARX“</a></td><td>Aussenbund, verdecktes Tragen</td><td>ab CHF 95.–</td></tr>
<tr><td><a href="/artikel/iwb-holster/">IWB „UMBRA“</a></td><td>Innenbund, verdecktes Tragen</td><td>ab CHF 75.–</td></tr>
<tr><td><a href="/artikel/sidecar-holster/">Sidecar „GEMINI“</a></td><td>AIWB mit Magazinhalter, verdecktes Tragen</td><td>ab CHF 120.–</td></tr>
</tbody></table>
<p>Alle fünf Holstertypen fertigen wir für die {gun}.</p>"""

CNC = ("<p>Unsere Formen konstruieren wir selbst im CAD und fräsen sie auf unserer eigenen CNC. "
       "Auch der Konturschnitt der Holsterschalen läuft bei uns über die CNC. So entsteht für jedes "
       "Modell eine eigene, passgenaue Schale – kein Universalholster, keine angenäherte Passform.</p>")

RETENTION = """<h2>Retention (Zugfestigkeit)</h2>
<p>Die Zugfestigkeit wird bei Holstern immer über Schrauben eingestellt. In der Regel sind das zwei Schrauben. Bei IWB- und Sidecar-Holstern sind es meist drei, beim Pancake immer eine. So lässt sich die Zugfestigkeit nachträglich an deine Bedürfnisse anpassen.</p>
<p>Davon zu unterscheiden ist die <strong>Bügelsicherung (Level 2)</strong>: Das ist eine zusätzliche <em>Sicherung</em> und hat mit der Zugfestigkeit nichts zu tun. Sie ist für das OWB-Holster erhältlich.</p>"""

LAMPE = """<h2>Mit Lampe oder Laser</h2>
<p>Jedes Holster kann für eine Waffenlampe gefertigt werden. Hersteller und Modell wählst du im Konfigurator separat zur Waffe. Aktuell verfügbar sind unter anderem <strong>Streamlight</strong> (TLR-1, TLR-2, TLR-7, TLR-8 inkl. HL-X), <strong>SureFire</strong> (X300U, X400 Ultra), <strong>Olight</strong> (PL-Serie, Baldr Pro-R) sowie Nightstick und Glock.</p>
<p>Auch hier wird das Sortiment laufend erweitert. Ist deine Lampe nicht dabei? <a href="/kontakt/">Schreib uns</a> – wir schauen es uns an.</p>"""

HAND = """<h2>Rechts- oder Linkshänder</h2>
<p>Alle Holster fertigen wir für Rechts- <em>und</em> Linkshänder. Die Auswahl triffst du direkt im Konfigurator.</p>"""

ZUBEHOER = """<h2>Befestigung und Zubehör</h2>
<p>Für die Montage stehen diverse <a href="/product-category/zubehor/gurtsteg/">Gurtstege</a>, <a href="/product-category/zubehor/guertelclip/">Gürtelclips</a>, <a href="/product-category/zubehor/holster-clips/">Holster Clips</a>, <a href="/product-category/zubehor/soft-loop-stege/">Soft Loops</a> und <a href="/product-category/zubehor/ulticlip/">UltiClip</a> zur Verfügung.</p>
<p>Für die OWB-Montage lässt sich der <a href="/artikel/bladetech-duty-drop/">Bladetech Duty Drop</a> mit dem <a href="/artikel/elastischer-oberschenkelgurt/">elastischen Oberschenkelgurt</a> kombinieren.</p>"""

RABATT = """<h2>Rabatt für Behörden/Berufswaffenträger</h2>
<p>Behörden, Sicherheitsdienstleister und Berufswaffenträger erhalten bei uns einen <a href="/behoerdenrabatt-antrag/">Behördenrabatt</a>.</p>"""

FAQ_GENERIC = """<h3>Wie stelle ich die Zugfestigkeit ein?</h3>
<p>Über die Schrauben. Je nach Holstertyp sind das eine bis drei Schrauben – anziehen erhöht die Zugfestigkeit, lösen verringert sie.</p>
<h3>Was ist der Unterschied zwischen Zugfestigkeit und Bügelsicherung?</h3>
<p>Die Zugfestigkeit ergibt sich aus der passgenauen Form und wird über Schrauben feinjustiert. Die Bügelsicherung (Level 2) ist eine zusätzliche mechanische <em>Sicherung</em> – ein separates Bauteil, das die Waffe zusätzlich hält.</p>
<h3>Wie lange dauert die Fertigung?</h3>
<p>Jedes Holster entsteht in Handarbeit auf Bestellung. Die aktuelle Lieferzeit findest du auf der jeweiligen Produktseite.</p>"""

# Brand ranges — VERBATIM from the WCPA export, rendered readable.
RANGE = {
 "GLOCK": ("Glock", "Glock 17, Glock 19 / 19x / 45, Glock 26, Glock 34, Glock 42, Glock 43, "
           "Glock 43x MOS (43 und 43x), Glock 45, Glock 47, Glock 48, Glock 48 MOS und Glock 49"),
 "SIG":   ("SIG-Sauer", "SIG P211 GTO, P220 (Pist 75), P220 Legion, P226 (MK25), P226 X5 Legion, "
           "P229, P239, P320 Compact, P320 Full Size, P320 M17, P320 VTAC, P320 X-Carry, "
           "P320 X-Compact, P320 X-Five, P320 XFive Legion, P320 DH3 (X5 Legion), P365, P365 Fuse, "
           "P365 SAS, P365 X, P365 XL und SP2022 Gen2"),
 "WALTHER": ("Walther", "Walther P99, F-Series 3.5 Zoll, F-Series 4 Zoll, PDP Compact 4 Zoll, "
           "PDP Compact 5 Zoll, PDP Full Size 4 Zoll, PDP Full Size 4.5 Zoll, PDP Full Size 5 Zoll, "
           "PDP Steel Frame 5 Zoll, PPQ M1 4 Zoll, PPQ M2 5 Zoll, Q5 Match M2 und Q5 Match Steel Frame"),
 "HK":    ("Heckler-&-Koch", "H&amp;K P30, SFP9 CC (VP9 CC), SFP9 (VP9), SFP9-L (VP9-L), USP 9, "
           "USP 40 und 45 / 45 Tactical"),
 "SPHINX": ("Sphinx", "Sphinx SDP Compact und SDP Standard"),
 "SPRINGFIELD": ("Springfield", "Springfield Echelon 4.5F, Echelon 4.0FC, Echelon 4.0C und Hellcat Pro"),
}

GUNS = [
 dict(slug="walther-pdp", gun="Walther PDP", brand="WALTHER",
   intro=["Die <strong>Walther PDP</strong> gibt es nicht in einer Grösse, sondern in einer ganzen "
          "Reihe von Varianten – Compact und Full Size, mit Lauflängen von 4 bis 5 Zoll, dazu die "
          "Steel-Frame-Version. Für ein Kydex-Holster ist das der entscheidende Punkt: Jede Kombination "
          "aus Griffstück und Lauflänge braucht eine eigene Schale.",
          "Deshalb führen wir die PDP-Varianten im Konfigurator einzeln auf. Du wählst genau deine "
          "Ausführung, und wir fertigen die dazu passende Schale – nichts wird angenähert."],
   faq=[("Welche PDP-Variante muss ich auswählen?",
         "Die Variante entscheidet sich aus Griffstück und Lauflänge. Im Konfigurator stehen PDP Compact "
         "4 und 5 Zoll, PDP Full Size 4, 4.5 und 5 Zoll sowie PDP Steel Frame 5 Zoll zur Auswahl. "
         "Wenn du unsicher bist, welche Ausführung du hast, <a href=\"/kontakt/\">melde dich</a> – wir helfen beim Bestimmen.")]),

 dict(slug="sig-p220", gun="SIG P220 (Pist 75)", brand="SIG",
   intro=["Die <strong>SIG P220</strong> ist als <strong>Pistole 75</strong> die Ordonnanzwaffe der "
          "Schweizer Armee und damit die wohl am weitesten verbreitete Pistole des Landes. Entsprechend "
          "oft wird sie im Sport, im Training und auf dem Schiessstand eingesetzt – und entsprechend oft "
          "wird ein passendes Holster dafür gesucht.",
          "Wir fertigen für die P220 (Pist 75) wie auch für die P220 Legion eigene Schalen. Beide "
          "Ausführungen stehen im Konfigurator separat zur Wahl."],
   faq=[("Ist die Pist 75 dasselbe wie die SIG P220?",
         "Ja – „Pistole 75“ ist die Schweizer Ordonnanzbezeichnung für die SIG P220. Im Konfigurator "
         "findest du sie unter <em>P220 (PIST 75)</em>.")]),

 dict(slug="hk-sfp9", gun="H&amp;K SFP9 (VP9)", brand="HK",
   intro=["Die <strong>H&amp;K SFP9</strong> – ausserhalb Europas als <strong>VP9</strong> bekannt – ist "
          "eine der meistgenutzten Dienstpistolen im deutschsprachigen Raum und bei Behörden, "
          "Sicherheitsdienstleistern und Berufswaffenträgern breit im Einsatz.",
          "Die SFP9 existiert in mehreren Ausführungen, und die unterscheiden sich in der Länge deutlich. "
          "Wir führen die <strong>SFP9 (VP9)</strong>, die längere <strong>SFP9-L (VP9-L)</strong> und die "
          "kompakte <strong>SFP9 CC (VP9 CC)</strong> im Konfigurator einzeln – jede mit ihrer eigenen Schale."],
   faq=[("Welche SFP9-Ausführung wähle ich?",
         "Massgebend ist die Länge: SFP9 (VP9) als Standardausführung, SFP9-L (VP9-L) mit längerem Lauf "
         "und Schlitten, SFP9 CC (VP9 CC) als kompakte Version. Alle drei stehen im Konfigurator zur Auswahl.")]),

 dict(slug="glock-45", gun="Glock 45", brand="GLOCK",
   intro=["Die <strong>Glock 45</strong> ist eine Dienstpistole im Compact-Crossover-Format und wird "
          "häufig mit Waffenlampe eingesetzt. Genau diese Kombination bestimmt die Form des Holsters: "
          "Die Schale muss Waffe <em>und</em> Lampe gemeinsam aufnehmen.",
          "Im Konfigurator ist die Glock 45 unter der Option <strong>19 / 19x / 45</strong> geführt – so, "
          "wie wir sie führen. Die Lampe wählst du getrennt davon aus; die Schale wird auf die "
          "Kombination gefertigt."],
   faq=[("Warum steht die Glock 45 zusammen mit 19 und 19x in einer Option?",
         "Weil wir diese Auswahl im Konfigurator so führen. Du wählst <em>19 / 19x / 45</em> und "
         "anschliessend deine Lampe – gefertigt wird die dazu passende Schale.")]),

 dict(slug="glock-19", gun="Glock 19", brand="GLOCK",
   intro=["Die <strong>Glock 19</strong> ist die weltweit meistverbreitete Dienstpistole im "
          "Compact-Format und damit auch bei uns das meistgefragte Modell. Für sie fertigen wir alle "
          "fünf Holstertypen.",
          "Im Konfigurator ist die Glock 19 unter der Option <strong>19 / 19x / 45</strong> geführt. "
          "Ob mit oder ohne Lampe, rechts oder links, Aussenbund oder Innenbund – die Schale entsteht "
          "auf die von dir gewählte Kombination."],
   faq=[("Welche Holstertypen gibt es für die Glock 19?",
         "Alle fünf: IPSC/IDPA „PRIMUS“, OWB „CITADEL“, Pancake „ARX“, IWB „UMBRA“ und Sidecar „GEMINI“ – "
         "jeweils für Rechts- und Linkshänder.")]),

 dict(slug="walther-ppq", gun="Walther PPQ", brand="WALTHER",
   intro=["Die <strong>Walther PPQ</strong> ist zwar vom neueren PDP-System abgelöst worden, aber "
          "unverändert weit verbreitet – und wer eine PPQ hat, findet dafür deutlich weniger Auswahl "
          "an passgenauen Holstern als für aktuelle Modelle.",
          "Wir fertigen weiterhin für die <strong>PPQ M1 (4 Zoll)</strong> und die "
          "<strong>PPQ M2 (5 Zoll)</strong>. Die beiden unterscheiden sich in der Magazinentriegelung "
          "und in der Lauflänge und werden im Konfigurator getrennt geführt."],
   faq=[("Was ist der Unterschied zwischen PPQ M1 und M2?",
         "Die M1 hat den Abzugsbügel-Magazinhalter, die M2 den seitlichen Magazinknopf; dazu kommt die "
         "unterschiedliche Lauflänge. Im Konfigurator wählst du PPQ M1 4 Zoll oder PPQ M2 5 Zoll.")]),

 dict(slug="sphinx-sdp", gun="Sphinx SDP", brand="SPHINX",
   intro=["Die <strong>Sphinx SDP</strong> kommt aus Tiefenau im Kanton Bern – eine Schweizer Pistole, "
          "die im Sport und bei Behörden geschätzt wird. Das Holster dazu entsteht bei uns in der "
          "Zentralschweiz.",
          "Wir fertigen für die <strong>SDP Compact</strong> und die <strong>SDP Standard</strong>. "
          "Beide Ausführungen stehen im Konfigurator separat zur Wahl."],
   faq=[("Fertigt ihr für SDP Compact und SDP Standard?",
         "Ja, für beide. Sie werden im Konfigurator getrennt geführt, weil jede ihre eigene Schale braucht.")]),

 dict(slug="glock-17", gun="Glock 17", brand="GLOCK",
   intro=["Die <strong>Glock 17</strong> ist der Standard im Behörden- und Dienstbereich und zugleich "
          "eine der meistgenutzten Sportpistolen. Für den dienstlichen Einsatz ist häufig eine "
          "zusätzliche Sicherung gefragt.",
          "Für das OWB-Holster „CITADEL“ bieten wir dafür die <strong>Bügelsicherung (Level 2)</strong> "
          "an – ein separates mechanisches Bauteil, das die Waffe zusätzlich hält. Mit der Zugfestigkeit "
          "hat sie nichts zu tun; die wird unabhängig davon über die Schrauben eingestellt."],
   faq=[("Gibt es für die Glock 17 eine Level-2-Sicherung?",
         "Ja, als Bügelsicherung für das OWB-Holster „CITADEL“. Sie ist eine zusätzliche mechanische "
         "Sicherung und nicht mit der Zugfestigkeit zu verwechseln.")]),

 dict(slug="sig-p320", gun="SIG P320", brand="SIG",
   intro=["Kaum eine Pistole hat so viele Ausführungen wie die <strong>SIG P320</strong>. Allein in "
          "unserem Konfigurator stehen <strong>neun</strong> P320-Varianten zur Auswahl: Compact, "
          "Full Size, M17, VTAC, X-Carry, X-Compact, X-Five, XFive Legion und DH3.",
          "Für ein Kydex-Holster ist das kein Detail, sondern der ganze Punkt: Griffmodul und "
          "Schlittenlänge bestimmen die Schale. Deshalb führen wir jede Variante einzeln, statt eine "
          "Schale für alle zu verkaufen."],
   faq=[("Welche P320-Varianten fertigt ihr?",
         "P320 Compact, Full Size, M17, VTAC, X-Carry, X-Compact, X-Five, XFive Legion und DH3. "
         "Die XFive Legion ist im Konfigurator mit dem Hinweis geführt, dass sie auch für die DH3 passt.")]),

 dict(slug="springfield-echelon", gun="Springfield Echelon", brand="SPRINGFIELD",
   intro=["Die <strong>Springfield Echelon</strong> ist eine junge Plattform – und genau deshalb gibt es "
          "dafür bisher wenig passgenaues Zubehör. Wer eine Echelon hat, kennt das Problem: Universal- "
          "oder angenäherte Holster sind schnell gefunden, eine echte Passform nicht.",
          "Wir fertigen für die <strong>Echelon 4.5F</strong>, die <strong>4.0FC</strong> und die "
          "<strong>4.0C</strong>. Die 4.5F ist im Konfigurator mit dem Hinweis geführt, dass sie auch "
          "für die 4.0FC passt."],
   faq=[("Welche Echelon-Grössen fertigt ihr?",
         "Echelon 4.5F, 4.0FC und 4.0C. Die Auswahl triffst du direkt im Konfigurator.")]),

 dict(slug="sig-p226", gun="SIG P226", brand="SIG",
   intro=["Die <strong>SIG P226</strong> ist ein Klassiker im Dienst- und Sportbereich und seit "
          "Jahrzehnten im Einsatz. Entsprechend viele Ausführungen sind im Umlauf.",
          "Wir fertigen für die <strong>P226 (MK25)</strong> und für die <strong>P226 X5 Legion</strong>. "
          "Die beiden unterscheiden sich in Schlitten und Griff deutlich und werden im Konfigurator "
          "getrennt geführt."],
   faq=[("Welche P226-Ausführungen fertigt ihr?",
         "Die P226 (MK25) und die P226 X5 Legion. Findest du deine Ausführung nicht, "
         "<a href=\"/kontakt/\">melde dich</a> – wir prüfen, ob wir sie aufnehmen.")]),

 dict(slug="sig-p365", gun="SIG P365", brand="SIG",
   intro=["Die <strong>SIG P365</strong> gehört zu den kleinsten Pistolen, für die wir Schalen fertigen – "
          "und je kleiner die Waffe, desto weniger Fläche steht der Schale zur Verfügung. Die Passform "
          "muss hier besonders exakt sitzen.",
          "Wir führen die <strong>P365</strong>, die <strong>P365 X</strong>, die "
          "<strong>P365 XL</strong>, die <strong>P365 Fuse</strong> und die <strong>P365 SAS</strong> "
          "im Konfigurator einzeln auf."],
   faq=[("Welche P365-Varianten fertigt ihr?",
         "P365, P365 X, P365 XL, P365 Fuse und P365 SAS – jede mit eigener Schale.")]),

 dict(slug="walther-q5-match", gun="Walther Q5 Match", brand="WALTHER",
   intro=["Die <strong>Walther Q5 Match</strong> ist eine reine Sportpistole – langer Schlitten, "
          "optikfertig, in der Steel-Frame-Version zudem deutlich schwerer als eine Polymerpistole. "
          "Für IPSC und IDPA ist sie eine der gefragtesten Waffen im Feld.",
          "Wir fertigen für die <strong>Q5 Match M2</strong> und die <strong>Q5 Match Steel Frame</strong>. "
          "Für den Wettkampf ist das Aussenbund-Holster die übliche Bauform – IPSC/IDPA „PRIMUS“ oder "
          "OWB „CITADEL“."],
   faq=[("Fertigt ihr auch für die Q5 Match Steel Frame?",
         "Ja. Q5 Match M2 und Q5 Match Steel Frame stehen im Konfigurator getrennt zur Auswahl, weil das "
         "Griffstück unterschiedlich ist.")]),

 dict(slug="glock-43x", gun="Glock 43X", brand="GLOCK",
   intro=["Die <strong>Glock 43X</strong> ist Glocks schlanke Single-Stack-Plattform: schmaler Schlitten, "
          "längerer Griff als die 43. Für die Schale heisst das eine sehr flache Bauform mit wenig "
          "Materialfläche – die Passform muss dementsprechend genau stimmen.",
          "Im Konfigurator ist sie unter <strong>43x MOS (43 + 43x)</strong> geführt. Zusätzlich "
          "fertigen wir für die <strong>Glock 43</strong>, die <strong>48</strong> und die "
          "<strong>48 MOS</strong> aus der schlanken Baureihe."],
   faq=[("Was bedeutet die Option „43x MOS (43 + 43x)“?",
         "So führen wir diese Auswahl im Konfigurator. Du wählst diese Option und danach deine "
         "restlichen Konfigurationsschritte.")]),
]


def build(g):
    brand_label, models = RANGE[g["brand"]]
    parts = []
    parts += ["<p>" + p + "</p>" for p in g["intro"]]
    parts.append(CNC)
    parts.append("")
    parts.append(TABLE.format(gun=g["gun"]))
    parts.append("")
    parts.append(RETENTION)
    parts.append("")
    parts.append("<h2>%s-Modelle in unserem aktuellen Sortiment</h2>" % brand_label)
    parts.append("<p>Aktuell fertigen wir für %s.</p>" % models)
    parts.append("<p>Unser Modellsortiment wird laufend erweitert. Findest du deine Waffe nicht im Shop? "
                 "<a href=\"/kontakt/\">Melde dich bei uns</a> – wir prüfen, ob wir das Modell in unser "
                 "Sortiment aufnehmen.</p>")
    parts.append("")
    parts.append(LAMPE)
    parts.append("")
    parts.append(HAND)
    parts.append("")
    parts.append(ZUBEHOER)
    parts.append("")
    parts.append(RABATT)
    parts.append("")
    parts.append("<h2>Häufige Fragen</h2>")
    for q, a in g["faq"]:
        parts.append("<h3>%s</h3>" % q)
        parts.append("<p>%s</p>" % a)
    parts.append(FAQ_GENERIC)
    parts.append("")
    parts.append('<p><a href="%s">&laquo; Alle Waffenmodelle im Überblick</a></p>' % HUB)
    return "\n".join(parts)


out = [dict(slug=g["slug"], title="Kydex Holster für " + g["gun"], content=build(g)) for g in GUNS]

here = os.path.dirname(os.path.abspath(__file__))
with io.open(os.path.join(here, "gunpages.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

for o in out:
    print(o["slug"], len(o["content"]))
