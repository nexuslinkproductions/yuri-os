---
type: community
cohesion: 0.38
members: 7
---

# process_transcript_file()

**Cohesion:** 0.38 - loosely connected
**Members:** 7 nodes

## Members
- [[Check if XML block is an exampletemplate]] - rationale - 01_PROJECTS/claude-mem/scripts/extraction/filter-actual-xml.py
- [[Extract complete XML blocks from text_1]] - rationale - 01_PROJECTS/claude-mem/scripts/extraction/filter-actual-xml.py
- [[Process a single transcript file and extract only real XML from assistant respon]] - rationale - 01_PROJECTS/claude-mem/scripts/extraction/filter-actual-xml.py
- [[extract_xml_blocks()_1]] - code - 01_PROJECTS/claude-mem/scripts/extraction/filter-actual-xml.py
- [[filter-actual-xml.py]] - code - 01_PROJECTS/claude-mem/scripts/extraction/filter-actual-xml.py
- [[is_example_xml()]] - code - 01_PROJECTS/claude-mem/scripts/extraction/filter-actual-xml.py
- [[process_transcript_file()_1]] - code - 01_PROJECTS/claude-mem/scripts/extraction/filter-actual-xml.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/process_transcript_file()
SORT file.name ASC
```
