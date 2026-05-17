# Jake Van Clief — Ingestion Report
**Date:** 2026-05-05T17:42:55.600Z  
**Source Channel:** @JEVanClief (YouTube)

---

## Summary

| Metric | Value |
|--------|-------|
| Total transcripts | 30 |
| Total characters | 280,568 |
| Analysis file | Found ✓ (content-analysis.json) |
| Backend status | ❌ NOT RUNNING (127.0.0.1:3004) |
| Ingest manifest | Created ✓ |
| Videos ingested | 0 (backend unavailable) |

---

## Category Coverage

| Category | Videos |
|----------|--------|
| COMPOUND | 29 |
| PREDICTION | 27 |
| RESEARCH | 26 |
| EXECUTION | 24 |
| MARKET_STRUCTURE | 24 |
| RISK | 18 |
| MARKET_SCAN | 15 |
| PSYCHOLOGY | 9 |

---

## Top Concepts

| Concept | Frequency |
|---------|-----------|
| Claude Code | 9 |
| Alan Turing | 4 |
| Marine Corps | 3 |
| Semantic Kernel | 3 |
| Tik Tok | 3 |
| And Claude | 3 |
| Cloud Code | 3 |

---

## Video Detail (30 videos)

| # | Video ID | Categories | Concepts | Transcript |
|---|----------|------------|----------|------------|
| 1 | 0fCQ-4J_jzk | MARKET_SCAN, RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE, PSYCHOLOGY | 20 | 53,494 chars |
| 2 | 5B6W2OGfxq0 | PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE | 9 | 11,460 chars |
| 3 | 6hF2K4YGZbY | MARKET_SCAN, RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE, PSYCHOLOGY | 10 | 30,781 chars |
| 4 | AZ1l-oaD3tk | MARKET_SCAN, RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE | 20 | 56,088 chars |
| 5 | AjzBaEkWkNA | MARKET_SCAN, RESEARCH, PREDICTION, COMPOUND | 2 | 10,339 chars |
| 6 | DbIjTB-kh8E | RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE, PSYCHOLOGY | 20 | 23,707 chars |
| 7 | I-enT6szVQQ | RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND | 1 | 13,126 chars |
| 8 | J2GLzkaUrBc | RESEARCH, EXECUTION, COMPOUND, MARKET_STRUCTURE | 2 | 5,275 chars |
| 9 | KC0VEZuo4OI | RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE | 3 | 16,166 chars |
| 10 | MkN-ss2Nl10 | MARKET_SCAN, RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE | 2 | 23,653 chars |
| 11 | PN9OzUNCBKE | MARKET_SCAN, RESEARCH, PREDICTION, COMPOUND | 1 | 3,741 chars |
| 12 | RZ0AcCLVPFA | RESEARCH, PREDICTION, EXECUTION, COMPOUND, MARKET_STRUCTURE | 9 | 21,441 chars |
| 13 | S3fXSc5z2n4 | RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE, PSYCHOLOGY | 7 | 14,443 chars |
| 14 | SjlCJIU9ODs | MARKET_SCAN, RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE, PSYCHOLOGY | 0 | 14,235 chars |
| 15 | UGyTimVObus | MARKET_SCAN, RESEARCH, PREDICTION, EXECUTION, COMPOUND, MARKET_STRUCTURE | 1 | 14,057 chars |
| 16 | Wtf6E-fwuwI | RESEARCH, PREDICTION, EXECUTION, COMPOUND | 2 | 9,355 chars |
| 17 | ZMDXs59Ntjc | MARKET_SCAN, RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE | 13 | 47,685 chars |
| 18 | _rtyhVD4v4A | RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE | 6 | 27,767 chars |
| 19 | bQXi5Nd8c40 | MARKET_SCAN, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE | 2 | 12,700 chars |
| 20 | hALln9wrrQo | RESEARCH, PREDICTION, RISK, COMPOUND, MARKET_STRUCTURE | 3 | 14,417 chars |
| 21 | izMBiWG3L24 | RESEARCH, MARKET_STRUCTURE, PSYCHOLOGY | 2 | 12,188 chars |
| 22 | jjV1ckgPzI0 | MARKET_SCAN, RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE | 16 | 36,467 chars |
| 23 | oQ6tsBFJZzk | MARKET_SCAN, RESEARCH, PREDICTION, EXECUTION, COMPOUND, MARKET_STRUCTURE | 15 | 11,517 chars |
| 24 | ozkx_eUfjY0 | RESEARCH, PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE | 8 | 34,567 chars |
| 25 | pdoSAWWCDO8 | MARKET_SCAN, RESEARCH, PREDICTION, EXECUTION, COMPOUND, MARKET_STRUCTURE, PSYCHOLOGY | 14 | 45,310 chars |
| 26 | rHDA0WMXzy4 | PREDICTION, RISK, EXECUTION, COMPOUND, MARKET_STRUCTURE | 8 | 26,542 chars |
| 27 | tQ6rQMW7vo8 | MARKET_SCAN, RESEARCH, PREDICTION, COMPOUND | 1 | 3,746 chars |
| 28 | v2UnNFmkia0 | PREDICTION, EXECUTION, COMPOUND | 2 | 8,451 chars |
| 29 | vyN7ITKcGXU | RESEARCH, PREDICTION, RISK, COMPOUND, MARKET_STRUCTURE, PSYCHOLOGY | 4 | 22,791 chars |
| 30 | yEa6dgh7wuc | MARKET_SCAN, RESEARCH, EXECUTION, COMPOUND, MARKET_STRUCTURE, PSYCHOLOGY | 13 | 13,912 chars |

---

## Files Created

| File | Path |
|------|------|
| Ingest manifest | `RESEARCH/jake-van-klief/ingest/ingest-manifest.json` |
| Ingestion results | `RESEARCH/jake-van-klief/ingest/ingestion-results.json` |
| This report | `RESEARCH/jake-van-klief/ingest/ingestion-report.md` |

---

## Next Steps

1. **Start the RAG backend** on port 3004, then re-run ingestion:
   ```bash
   curl -s http://127.0.0.1:3004/api/status  # verify it's up
   ```
2. **Re-run the ingest script** from the task description to POST each transcript to `/api/vault/ingest`
3. **Add to OS kernel memory** once backend confirms ingestion:
   ```bash
   cd /Users/marcelspatz/NUDIMMUD && node _SYSTEM/OS_KERNEL/memory.db.js add "jake-van-clief-youtube" "30 videos ingested into RAG backend"
   ```

---

## Error Summary

- **Backend at 127.0.0.1:3004** — connection refused (curl exit code 7)
- All 30 transcripts ready, manifest prepared, waiting for backend to start
