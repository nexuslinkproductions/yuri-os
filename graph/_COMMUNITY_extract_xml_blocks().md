---
type: community
cohesion: 0.50
members: 5
---

# extract_xml_blocks()

**Cohesion:** 0.50 - moderately connected
**Members:** 5 nodes

## Members
- [[Extract complete XML blocks from text]] - rationale - 01_PROJECTS/claude-mem/scripts/extraction/extract-all-xml.py
- [[Process a single transcript file and extract XML with timestamps]] - rationale - 01_PROJECTS/claude-mem/scripts/extraction/extract-all-xml.py
- [[extract-all-xml.py]] - code - 01_PROJECTS/claude-mem/scripts/extraction/extract-all-xml.py
- [[extract_xml_blocks()]] - code - 01_PROJECTS/claude-mem/scripts/extraction/extract-all-xml.py
- [[process_transcript_file()]] - code - 01_PROJECTS/claude-mem/scripts/extraction/extract-all-xml.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/extract_xml_blocks()
SORT file.name ASC
```
