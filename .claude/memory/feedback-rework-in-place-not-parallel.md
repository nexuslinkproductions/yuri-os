---
name: feedback-rework-in-place-not-parallel
description: Rework existing artifacts IN PLACE or promote+replace; don't leave a parallel v2/preview file unless a side-by-side is explicitly wanted
metadata:
  type: feedback
  tier: semantic
  scope: claude
  trig: ["second document", "parallel file", "v2 preview", "update in place", "why new file", "rework existing"]
  refs: ["[[feedback-clean-structure-no-clutter]]", "[[feedback_read_source_before_spec]]"]
---

RULE: When reworking/redesigning an EXISTING page or artifact, update it IN PLACE — or build fresh then PROMOTE + replace the canonical file and remove the old one in the same flow. Do NOT silently leave a parallel "v2"/"-preview" second file unless Marcel explicitly wants a side-by-side comparison.
WHEN: any redesign/rework of an existing artifact (HTML, doc, page).
DO: transform the original directly; OR if a preview is genuinely safer (proud/high-stakes artifact at risk of an unverified overwrite), SAY SO up front and confirm the preview approach before creating a second file.
DONT: create a second document and leave both sitting there for Marcel to reconcile.
WHY: Marcel wants one canonical artifact, not duplicates; parallel files are exactly the clutter his clean-structure rule rejects. He was mildly annoyed when a v2 preview appeared instead of the original being updated.
SEE: [[feedback-clean-structure-no-clutter]], [[feedback_read_source_before_spec]]
