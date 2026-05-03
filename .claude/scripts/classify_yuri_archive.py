#!/usr/bin/env python3
import json
import os
from pathlib import Path
from collections import defaultdict
from datetime import datetime

MANIFEST_PATH = "/Users/marcelspatz/NUDIMMUD/_SYSTEM/yuri-history-archive/manifest_2026-05-03_30.json"
RAW_DIR = "/Users/marcelspatz/NUDIMMUD/_SYSTEM/yuri-history-archive/raw_2026-05-03_30"
OUTPUT_JSON = "/Users/marcelspatz/NUDIMMUD/_SYSTEM/yuri-history-archive/classification_2026-05-03_30.json"
OUTPUT_MD = "/Users/marcelspatz/NUDIMMUD/_SYSTEM/yuri-history-archive/classification_2026-05-03_30.md"

CATEGORY_MAP = [
    ("LOCAL_CLAIM_VERIFIER", "local_claim_verifier"),
    ("WEBSEARCH", "websearch_executor_hud"),
    ("QUERY_HARDENING", "query_hardening_handoff"),
    ("RAG_INGEST", "rag_ingest_handoff"),
    ("DEEPSEEK_TOKENOPS", "deepseek_tokenops"),
    ("CROSS_SESSION_SOURCE_CONTEXT", "cross_session_source_context"),
    ("GPT_SESSION_ARCHIVE", "gpt_session_archive"),
    ("SESSION_CONTEXT_EXTRACT", "session_context_extract"),
    ("SESSION_HANDOFF", "session_handoff"),
    ("SESSION_CONTINUATION", "session_continuity"),
    ("SESSION_CONTINUITY", "session_continuity"),
    ("CONTINUITY", "session_continuity"),
    ("HANDOFF", "session_handoff"),
    ("HUD", "hud_continuation"),
]

def classify_file(basename, sha256):
    """Classify a file based on its name."""
    upper_name = basename.upper()

    for key, category in CATEGORY_MAP:
        if key in upper_name:
            return category

    return "unknown"

def extract_date_hint(basename):
    """Extract date from filename if present."""
    import re
    match = re.search(r'(\d{4}-\d{2}-\d{2})', basename)
    return match.group(1) if match else None

def get_file_stats(filepath):
    """Get file size and line count."""
    if not os.path.exists(filepath):
        return 0, 0

    size = os.path.getsize(filepath)
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = len(f.readlines())
        return size, lines
    except:
        return size, 0

def main():
    with open(MANIFEST_PATH, 'r') as f:
        manifest = json.load(f)

    files_data = manifest.get('files', {})
    file_count = len(files_data)

    classifications = []
    category_counts = defaultdict(int)
    duplicate_hash_groups = defaultdict(list)

    # First pass: classify and collect duplicates
    for basename, meta in files_data.items():
        sha = meta['sha256']
        category = classify_file(basename, sha)
        date_hint = extract_date_hint(basename)

        filepath = os.path.join(RAW_DIR, basename)
        size, lines = get_file_stats(filepath)

        # Extract heading from filename
        heading = basename.replace('.md', '').replace('_', ' ')

        classifications.append({
            'basename': basename,
            'category': category,
            'date_hint': date_hint,
            'heading': heading,
            'size_bytes': size,
            'line_count': lines,
            'word_count': int(lines * 15),  # Estimate
            'sha256': sha,
            'trust_status': 'historical',
            'recommended_next_use': f"verify in repo truth; {category} context"
        })

        category_counts[category] += 1
        duplicate_hash_groups[sha].append(basename)

    # Filter duplicate groups
    duplicate_groups = {sha: names for sha, names in duplicate_hash_groups.items() if len(names) > 1}

    # Sort by basename
    classifications.sort(key=lambda x: x['basename'])

    # Generate JSON output
    output_json = {
        'version': '2026-05-03_30',
        'generated_at': datetime.now().isoformat(),
        'source_manifest': MANIFEST_PATH,
        'file_count': file_count,
        'category_counts': dict(category_counts),
        'duplicate_hash_groups': duplicate_groups,
        'files': classifications
    }

    with open(OUTPUT_JSON, 'w') as f:
        json.dump(output_json, f, indent=2)

    # Generate MD output
    md_lines = [
        "# Yuri Archive Classification Report",
        "",
        "**Generated:** 2026-05-03T13:40:00Z",
        "**Source:** `/Users/marcelspatz/NUDIMMUD/_SYSTEM/yuri-history-archive/manifest_2026-05-03_30.json`",
        "**Files analyzed:** 30",
        "",
        "## Purpose",
        "",
        "Classify 30 historical session archives into operational categories for rapid session recovery, continuity mapping, and evidence lookup.",
        "",
        "## Category Summary",
        "",
    ]

    for category, count in sorted(category_counts.items()):
        md_lines.append(f"- **{category}**: {count} file(s)")

    md_lines.extend([
        "",
        "## Duplicate Hash Groups",
        "",
    ])

    if duplicate_groups:
        for sha, files in duplicate_groups.items():
            md_lines.append(f"### {sha[:16]}... ({len(files)} copies)")
            for f in files:
                md_lines.append(f"  - {f}")
            md_lines.append("")
    else:
        md_lines.append("*No exact duplicates found.*")
        md_lines.append("")

    md_lines.extend([
        "## Warnings",
        "",
        "⚠️ **Archive is historical, not current truth.** Verify all claims against repo state.",
        "⚠️ **Not ingested into RAG.** Use for session recovery and evidence lookup only.",
        "⚠️ **Dates are hints only.** Cross-check with git timestamps.",
        "",
        "## Next Steps",
        "",
        "1. **Continuity Recovery:** Use SESSION_CONTINUITY and SESSION_HANDOFF for session recovery.",
        "2. **Context Extraction:** Use SESSION_CONTEXT_EXTRACT for multi-session narrative.",
        "3. **Source Verification:** Use CROSS_SESSION_SOURCE_CONTEXT to trace original decisions.",
        "4. **Tokenops Audits:** Use DEEPSEEK_TOKENOPS for cost and efficiency retrospectives.",
        "",
    ])

    with open(OUTPUT_MD, 'w') as f:
        f.write('\n'.join(md_lines))

    print(f"✓ Classification complete")
    print(f"  JSON: {OUTPUT_JSON}")
    print(f"  MD:   {OUTPUT_MD}")
    print(f"  Files: {file_count}")
    print(f"  Categories: {len(category_counts)}")
    print(f"  Duplicates: {len(duplicate_groups)}")

if __name__ == '__main__':
    main()
