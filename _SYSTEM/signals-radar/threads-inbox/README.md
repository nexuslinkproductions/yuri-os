# threads-inbox/ — browser-bridge drop zone

`research_signals.py` reads one JSON file per watched Threads account from this
folder. Files are written by the October browser bridge (a browser-wired agent
using the logged-in Threads session — no credentials stored anywhere in YURI).

## Contract

One file per account, named `<handle>.json` (handle without `@`, dots kept):

```json
{
  "account": "rowancheung",
  "captured_at": "2026-07-29T10:00:00",
  "posts": [
    {
      "id": "shortcode-or-ordinal",
      "text": "full post text",
      "url": "https://www.threads.com/@rowancheung/post/...",
      "likes": 0,
      "replies": 0,
      "reposts": 0,
      "posted": "2026-07-28"
    }
  ]
}
```

Rules:
- English-language content only (operator does not read CJK; VPN is set to
  Japan so feeds surface Japanese lettering — filter it out at capture time).
- Files older than 3 days are ignored by the radar (stale ≠ signal).
- Watched accounts live in `../signals-watchlist.yaml` under `threads_accounts`.
- Capture is read-only. Posting is a separate, human-approved step — every
  post (Threads AND LinkedIn) is draft-only until Marcel approves it.
