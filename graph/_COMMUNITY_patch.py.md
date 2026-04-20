---
type: community
cohesion: 0.03
members: 113
---

# patch.py

**Cohesion:** 0.03 - loosely connected
**Members:** 113 nodes

## Members
- [[4-level degrading search for a line pattern inside lines.      Returns the 0-b]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[A single change block inside an Update File hunk.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Anchor on firstlast lines (trimmed) and use Levenshtein on middles.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[Apply chunks to original_content and return the new content.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Apply SEARCHREPLACE blocks to a file on disk.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Apply SEARCHREPLACE blocks to a single file's content.      Uses the 6-level fu]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Apply multi-file FULL format to a skill directory.      For each file in the par]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Apply pre-sorted replacements in reverse order to avoid index shift.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Attempt to find pattern inside lines using compare.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Auto-detect the patch format from LLM output.      Detection uses structural m]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Check text against safety rules, return list of triggered flag names.      Ret]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Collect ``+``-prefixed lines for an Add File hunk.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Collect all text files in a directory (recursive).      Excludes the ``.skill_id]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Collect all text files in a skill directory.      Returns ``{relative_path cont]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Compare all files in two skill directories, return combined diff.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Compute (start, old_count, new_lines) replacement tuples.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Compute combined unified diff from two snapshot dicts.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Compute the Levenshtein edit distance between two strings.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[Create a brand-new skill directory (for CAPTURED).      Args         target_dir]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Derive a new skill from one or more existing skills.      Single parent (``s]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Extract ``CHANGE_SUMMARY`` from LLM output.      Returns ``(clean_content, chang]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Extract a single field value from YAML frontmatter.      Returns ``None`` if the]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Fuzzy match for error reporting.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Fuzzy matching chain for SEARCHREPLACE edits.  The chain degrades gracefully]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[In-place repair of an existing skill directory.      Applies the LLM output to t]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Locate find in content using the replacer chain.      Returns ``(matched_tex]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[Match by trimming each line, then yield the original substring.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[One file-level operation inside a patch.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Parse YAML frontmatter into a flat dict.      Simple line-by-line parser (no PyY]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Parse `` Begin Files`` format into ``{relative_path content}``.      Falls b]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Parse ``@@``-delimited change chunks for an Update File hunk.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Parse a `` AddDeleteUpdate File`` header line.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Parse a `` Begin Patch``  `` End Patch`` block.      Ported from ShinkaEv]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Parse and apply a `` Begin Patch`` block to a skill directory.      Two-phase]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Parsed representation of a `` Begin Patch`` block.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[PatchError]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[PatchHunk]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[PatchParseError]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[PatchResult]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Quote a YAML scalar value if it contains special characters.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Raised when a patch cannot be applied.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Raised when the patch text cannot be parsed.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Re-quote SKILL.md frontmatter in-place so values are valid YAML.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Re-serialize frontmatter with proper YAML quoting.      Parses the existing fron]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Remove YAML frontmatter from markdown content.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Remove surrounding markdown code fences if present.      Handles common LLM wrap]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Remove the common leading indentation and compare blocks.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[Replace old_string with new_string in content.      Walks the chain until]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[Return True if flags contain no blocking flag.      ``suspicious.`` flags are]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Set (or insert) a field in YAML frontmatter.      Values containing YAML special]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Shared utility functions for the skill engine.  Provides   - YAML frontmatter p]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Strip surrounding quotes and unescape a YAML scalar value.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Trim the entire find block, then search.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[Truncate text to max_chars with an ellipsis marker.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Unified diff (git diff format) between two strings.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[UpdateChunk]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[Validate a skill directory after edit application.      Returns None if valid, o]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[Yield find unconditionally; the caller verifies via ``str.find``.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[_apply_multi_file_full()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_apply_multi_file_patch()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_apply_replacements()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_apply_search_replace_to_file()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_collect_files()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_compute_files_diff()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_compute_replacements()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_find_similar_lines()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_normalize_skill_frontmatter()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_normalize_unicode()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_parse_add_file_content()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_parse_patch_header()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_parse_update_chunks()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_strip_trailing_ws()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_try_match()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[_yaml_quote()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[_yaml_unquote()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[apply_search_replace()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[apply_update_chunks()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[block_anchor_replacer()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[check_skill_safety()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[collect_skill_snapshot()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[compute_skill_diff()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[compute_unified_diff()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[create_skill()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[derive_skill()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[detect_patch_type()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[extract_change_summary()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[fix_skill()_1]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[fuzzy_find_match()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[fuzzy_match.py]] - code - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[fuzzy_replace()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[get_frontmatter_field()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[indentation_flexible_replacer()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[is_skill_safe()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[levenshtein()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[line_trimmed_replacer()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[normalize_frontmatter()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[ok()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[parse_frontmatter()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[parse_multi_file_full()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[parse_patch()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[patch — Multi-file patch application and diff generation for Skills.  A skill is]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[patch.py]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[rNormalize whitespace (``s+`` - single space) before comparing.]] - rationale - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[seek_sequence()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/patch.py
- [[set_frontmatter_field()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[simple_replacer()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[skill_utils.py]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[strip_frontmatter()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[strip_markdown_fences()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[trimmed_boundary_replacer()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py
- [[truncate()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[validate_skill_dir()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/skill_utils.py
- [[whitespace_normalized_replacer()]] - code - 01_PROJECTS/openspace/openspace/skill_engine/fuzzy_match.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/patch.py
SORT file.name ASC
```

## Connections to other communities
- 60 edges to [[_COMMUNITY_Logger]]
- 15 edges to [[_COMMUNITY_EvolutionSuggestion]]
- 1 edge to [[_COMMUNITY_config.ts]]
- 1 edge to [[_COMMUNITY_SkillRanker]]

## Top bridge nodes
- [[skill_utils.py]] - degree 17, connects to 2 communities
- [[PatchError]] - degree 9, connects to 2 communities
- [[patch.py]] - degree 41, connects to 1 community
- [[derive_skill()]] - degree 11, connects to 1 community
- [[fix_skill()_1]] - degree 11, connects to 1 community