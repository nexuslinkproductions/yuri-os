# -*- coding: utf-8 -*-
"""Yoast title/description for the 14 Phase-3 gun pages. House style: title <=60, desc 110-155."""
import json, io, os

M = [
 ("walther-pdp", 813350, "Walther PDP",
  "Kydex Holster für die Walther PDP – Compact, Full Size und Steel Frame, jede Variante mit eigener Schale. OWB, IWB, Sidecar, Pancake, IPSC."),
 ("sig-p220", 813351, "SIG P220 (Pist 75)",
  "Kydex Holster für die SIG P220 / Pistole 75 – passgenau gefertigt in der Schweiz. OWB, IWB, Sidecar, Pancake und IPSC, rechts oder links."),
 ("hk-sfp9", 813352, "H&K SFP9 (VP9)",
  "Kydex Holster für die H&K SFP9 (VP9) – auch SFP9-L und SFP9 CC. Schweizer Handarbeit, mit oder ohne Waffenlampe, rechts oder links."),
 ("glock-45", 813353, "Glock 45",
  "Kydex Holster für die Glock 45 – mit oder ohne Waffenlampe, passgenau gefertigt. OWB, IWB, Sidecar, Pancake und IPSC aus Schweizer Handarbeit."),
 ("glock-19", 813354, "Glock 19",
  "Kydex Holster für die Glock 19 – alle fünf Bauformen, mit oder ohne Lampe, für Rechts- und Linkshänder. Schweizer Handarbeit, eigene Form."),
 ("walther-ppq", 813355, "Walther PPQ",
  "Kydex Holster für die Walther PPQ M1 und M2 – passgenaue Schalen aus Schweizer Handarbeit. OWB, IWB, Sidecar, Pancake und IPSC."),
 ("sphinx-sdp", 813356, "Sphinx SDP",
  "Kydex Holster für die Sphinx SDP Compact und SDP Standard – Schweizer Pistole, Schweizer Holster. OWB, IWB, Sidecar, Pancake und IPSC."),
 ("glock-17", 813357, "Glock 17",
  "Kydex Holster für die Glock 17 – OWB optional mit Bügelsicherung Level 2. Passgenaue Schalen aus Schweizer Handarbeit, rechts oder links."),
 ("sig-p320", 813358, "SIG P320",
  "Kydex Holster für die SIG P320 – neun Varianten von Compact bis X-Five, jede mit eigener Schale. Schweizer Handarbeit, rechts oder links."),
 ("springfield-echelon", 813359, "Springfield Echelon",
  "Kydex Holster für die Springfield Echelon 4.5F, 4.0FC und 4.0C – passgenau statt angenähert. Schweizer Handarbeit, OWB, IWB, Sidecar, IPSC."),
 ("sig-p226", 813360, "SIG P226",
  "Kydex Holster für die SIG P226 MK25 und P226 X5 Legion – passgenaue Schalen aus Schweizer Handarbeit. OWB, IWB, Sidecar, Pancake, IPSC."),
 ("sig-p365", 813361, "SIG P365",
  "Kydex Holster für die SIG P365, P365 X, XL, Fuse und SAS – jede Variante mit eigener Schale. Schweizer Handarbeit, rechts oder links."),
 ("walther-q5-match", 813362, "Walther Q5 Match",
  "Kydex Holster für die Walther Q5 Match M2 und Steel Frame – für IPSC und IDPA. Aussenbund und Innenbund, Schweizer Handarbeit."),
 ("glock-43x", 813363, "Glock 43X",
  "Kydex Holster für die Glock 43X – schlanke Bauform, passgenaue Schale aus Schweizer Handarbeit. OWB, IWB, Sidecar, Pancake und IPSC."),
]

out = []
bad = []
for slug, pid, gun, desc in M:
    title = "Kydex Holster für %s | Schweizer Handarbeit" % gun
    if len(title) > 60:
        bad.append(("TITLE", slug, len(title)))
    if not (110 <= len(desc) <= 155):
        bad.append(("DESC", slug, len(desc)))
    out.append(dict(slug=slug, id=pid, title=title, desc=desc, tlen=len(title), dlen=len(desc)))

seen = {}
for o in out:
    for k in ("title", "desc"):
        seen.setdefault(o[k], []).append(o["slug"])
dups = {k: v for k, v in seen.items() if len(v) > 1}

here = os.path.dirname(os.path.abspath(__file__))
with io.open(os.path.join(here, "gunmeta.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

for o in out:
    print("%-21s t=%2d d=%3d" % (o["slug"], o["tlen"], o["dlen"]))
print("VIOLATIONS:", bad or "none")
print("DUPLICATES:", dups or "none")
