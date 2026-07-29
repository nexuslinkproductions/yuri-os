#!/usr/bin/env python3
"""Signals Radar — the scraper (standalone starter).

This is the little script from the reel. Every other morning it sweeps five
AI sources, reads the best items in full, and drops the results into a dated
folder your dashboard reads. It's deterministic plumbing — scrape, dedup,
deep-read, save. No AI runs in here and no "understanding" happens; the
thinking is you (and Claude) reading the dashboard afterwards.

What it costs to run: $0. No API keys, no metered spend, no subscription. The
deep-reads use the free r.jina.ai reader (no key). The only source that needs
setup is X — see the README and the scrape_x() note below; the other four run
with zero login.

The five sources:
    • GitHub Trending  — repos by stars gained today, filtered to AI/automation
    • Reddit           — top posts of the day across your subreddits (public RSS)
    • YouTube          — latest uploads per channel + their caption transcripts
    • MCP registry     — newly listed MCP servers (awesome-mcp-servers README)
    • X / Twitter      — your watchlist (needs your own login; off by default)

Setup (one-time):
    pip install requests beautifulsoup4 defusedxml pyyaml
    pip install yt-dlp        # optional — only needed for the YouTube source

Run (from this folder):
    python3 research_signals.py                 # one sweep (self-gates to every 2nd day)
    python3 research_signals.py --force         # run now, ignore the 2-day gate
    python3 research_signals.py --print-only     # show what it'd grab, write nothing
    python3 research_signals.py --no-youtube     # skip a source (any --no-<source>)
    python3 research_signals.py --hours 168      # GitHub weekly window instead of daily

Each run writes into  signals/YYYY-MM-DD/ :
    • signals.json          — the structured feed your dashboard reads
    • web-*.md / yt-*.md    — one markdown note per item that got a full read
Then tell Claude: "Build the dashboard following DASHBOARD-SPEC.md."
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import date, datetime, timedelta
from pathlib import Path

try:
    import requests
    import yaml
    from bs4 import BeautifulSoup
    # defusedxml (not the stdlib parser) hardens the untrusted Reddit RSS parse
    # against XXE / billion-laughs attacks — required, not optional.
    import defusedxml.ElementTree as ET
except ImportError as e:
    missing = getattr(e, "name", "a package")
    sys.exit(f"Missing {missing} — run: pip install requests beautifulsoup4 defusedxml pyyaml")

ROOT = Path(__file__).resolve().parent
WATCHLIST = ROOT / "signals-watchlist.yaml"
SIGNALS_DIR = ROOT / "signals"
STAMP = ROOT / ".last-sweep"          # epoch seconds of the last real sweep (the every-2nd-day gate)
ITEM_CHAR_CAP = 20_000                # cap per note/full_text so one huge page can't bloat the folder
SOURCE_CHANNELS = ("github", "mcp", "reddit", "x", "youtube", "threads")
THREADS_INBOX = ROOT / "threads-inbox"  # JSON drops from the October browser bridge

# A browser-like User-Agent is REQUIRED for Reddit RSS (a "bot" UA gets a 429);
# github and raw.githubusercontent serve fine to it too, so we use one everywhere.
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
}
ATOM = {"a": "http://www.w3.org/2005/Atom"}

# Fallback config, used when signals-watchlist.yaml is missing a key. GitHub +
# Reddit + MCP run fine on these alone; X and YouTube need your own lists.
DEFAULT_SUBREDDITS = [
    "ClaudeAI", "AI_Agents", "automation", "Entrepreneur",
    "smallbusiness", "SaaS", "SideProject", "artificial",
]
DEFAULT_KEYWORDS = [
    "mcp", "cli", "agent", "automation", "workflow", "scraper", "bot",
    "pipeline", "n8n", "zapier", "make", "langchain", "llm", "gpt", "claude",
    "openai", "assistant", "rag", "voice", "email", "crm", "lead",
]


# ── Watchlist ───────────────────────────────────────────────────────────────
def load_watchlist(path: Path = WATCHLIST) -> dict:
    """signals-watchlist.yaml -> config dict. Missing file or missing keys fall
    back to sensible defaults so the radar always has something to scrape."""
    defaults = {
        "x_accounts": [], "youtube_channels": [], "subreddits": DEFAULT_SUBREDDITS,
        "github_keywords": DEFAULT_KEYWORDS, "deep_read_top_n": 10,
        "x_posts_per_account": 10, "youtube_latest_per_channel": 3,
        "threads_accounts": [], "threads_posts_per_account": 8,
    }
    merged = dict(defaults)
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if isinstance(data, dict):
            merged.update({k: v for k, v in data.items() if v is not None})
    except (OSError, yaml.YAMLError):
        pass  # no watchlist yet — run on defaults
    return merged


# ── Sources ─────────────────────────────────────────────────────────────────
def scrape_github_trending(period: str, keywords: list[str]) -> list[dict]:
    """github.com/trending — repos by stars gained in `period` (daily/weekly),
    kept only if the name/description/topics mention one of your keywords. No key."""
    resp = requests.get(f"https://github.com/trending?since={period}", headers=HEADERS, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    kw = {k.lower() for k in keywords}

    repos: list[dict] = []
    for article in soup.select("article.Box-row"):
        name_el = article.select_one("h2 a")
        if not name_el:
            continue
        full_name = name_el.get_text(strip=True).replace("\n", "").replace(" ", "")
        repo_url = f"https://github.com{name_el.get('href', '')}"

        desc_el = article.select_one("p")
        description = desc_el.get_text(strip=True) if desc_el else ""

        delta_el = article.select_one("span.d-inline-block.float-sm-right")
        delta_text = delta_el.get_text(strip=True) if delta_el else ""
        m = re.search(r"([\d,]+)\s+stars?\s+today", delta_text)
        stars_today = int(m.group(1).replace(",", "")) if m else 0

        lang_el = article.select_one("span[itemprop='programmingLanguage']")
        language = lang_el.get_text(strip=True) if lang_el else ""
        topics = [t.get_text(strip=True) for t in article.select("a.topic-tag")]

        blob = (full_name + " " + description + " " + " ".join(topics)).lower()
        if kw and not any(k in blob for k in kw):
            continue

        repos.append({
            "source": "GitHub Trending", "type": "github",
            "title": full_name, "url": repo_url, "summary": description,
            "language": language, "signal": stars_today,
            "signal_label": f"{stars_today:,} stars today",
            "item_id": full_name.replace("/", "-"),
            "scraped_date": date.today().isoformat(),
        })
    return repos


def scrape_mcp(limit: int) -> list[dict]:
    """Newly listed MCP servers from the awesome-mcp-servers raw README.

    Robust by design: a regex over the raw markdown, not fragile GitHub-search
    HTML selectors. The list is roughly newest-first per category; take the top N.
    """
    url = "https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md"
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()

    line_re = re.compile(r"^[\-\*]\s*\[([^\]]+)\]\((https://github\.com[^\)]+)\)(.*)$")
    out: list[dict] = []
    seen: set[str] = set()
    for raw in resp.text.splitlines():
        m = line_re.match(raw.strip())
        if not m:
            continue
        name, link, rest = m.group(1).strip(), m.group(2).strip(), m.group(3)
        if link in seen:
            continue
        seen.add(link)
        # Scrub nested markdown: IMAGES/badges first (need the leading `!`), THEN
        # links — otherwise a badge like [![alt](img)](href) lets the link regex
        # swallow the outer bracket. A few passes handle the nesting.
        for _ in range(3):
            rest = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", rest)
            rest = re.sub(r"\[[^\]]*\]\([^)]*\)", "", rest)
        rest = html.unescape(re.sub(r"<[^>]+>", "", rest)).strip()
        parts = re.split(r"\s[-–—]\s", rest, maxsplit=1)
        desc = (parts[1] if len(parts) == 2 else parts[0]).strip()
        desc = re.sub(r"^[\s\-–—:|·>]+", "", desc).strip()
        out.append({
            "source": "MCP registry", "type": "mcp",
            "title": name, "url": link, "summary": desc[:200],
            "signal": 0, "signal_label": "new server",
            "item_id": name, "scraped_date": date.today().isoformat(),
        })
        if len(out) >= limit:
            break
    return out


def scrape_reddit(subreddits: list[str], window: str, limit: int) -> list[dict]:
    """Top posts across your subs via Reddit's public RSS (atom).

    Reddit 403-blocks the `.json` endpoints for bot/datacenter clients and
    rate-limits rapid RSS hits, so we make ONE combined request —
    r/a+b+c/top/.rss?t=<window> — Reddit's own cross-sub top-of-window ranking.
    RSS carries no score, so we lean on that ranking; each entry's <category>
    tags its source sub. Returns up to `limit` posts.
    """
    if not subreddits:
        return []
    url = f"https://www.reddit.com/r/{'+'.join(subreddits)}/top/.rss?t={window}"
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)

    out: list[dict] = []
    for entry in root.findall("a:entry", ATOM):
        t_el = entry.find("a:title", ATOM)
        l_el = entry.find("a:link", ATOM)
        u_el = entry.find("a:updated", ATOM)
        c_el = entry.find("a:content", ATOM)
        cat_el = entry.find("a:category", ATOM)
        title = (t_el.text or "").strip() if t_el is not None else ""
        link = l_el.get("href") if l_el is not None else ""
        if not title or not link:
            continue
        sub = cat_el.get("term") if cat_el is not None else "reddit"
        updated = (u_el.text or "").strip() if u_el is not None else ""
        summary = ""
        if c_el is not None and c_el.text:
            # unescape FIRST — Reddit pads the boilerplate with &#32; entities
            # that would otherwise dodge the "submitted by" strip below.
            summary = html.unescape(c_el.text)
            summary = re.sub(r"<[^>]+>", " ", summary)
            summary = re.sub(r"\s+", " ", summary).strip()
            summary = re.split(r"submitted by\s+/u/", summary)[0].strip()
        out.append({
            "source": f"r/{sub}", "type": "reddit",
            "title": title, "url": link, "summary": summary[:240],
            "signal": 0, "signal_label": f"top/{window}",
            "item_id": link.rstrip("/").split("/")[-1] or title[:40],
            "scraped_date": updated or date.today().isoformat(),
        })
        if len(out) >= limit:
            break
    return out


def parse_ytdlp_flat(raw: str) -> list[dict]:
    """yt-dlp --flat-playlist --dump-json output (one JSON object per line)."""
    vids = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            v = json.loads(line)
        except json.JSONDecodeError:
            continue
        vid = v.get("id")
        if not vid:
            continue
        vids.append({"id": vid, "title": v.get("title") or vid,
                     "url": v.get("url") or v.get("webpage_url") or f"https://www.youtube.com/watch?v={vid}"})
    return vids


_VTT_TAG = re.compile(r"<[^>]+>")


def vtt_to_text(vtt: str) -> str:
    """VTT captions -> plain transcript. Auto-captions repeat lines across cues,
    so collapse consecutive duplicates."""
    out: list[str] = []
    for line in vtt.splitlines():
        line = _VTT_TAG.sub("", line).strip()
        if (not line or "-->" in line or line == "WEBVTT"
                or line.startswith(("Kind:", "Language:", "NOTE", "STYLE", "::cue"))
                or line.isdigit()):
            continue
        if out and out[-1] == line:
            continue
        out.append(line)
    return "\n".join(out)


def seen_video_ids(signals_root: Path) -> set[str]:
    """Video ids already captured by a prior sweep (so we don't re-fetch them)."""
    seen = set()
    for f in signals_root.glob("*/yt-*.md"):
        m = re.search(r"^item_id:\s*(\S+)", f.read_text(encoding="utf-8", errors="ignore")[:500], re.M)
        if m:
            seen.add(m.group(1))
    return seen


def pick_vtt(paths: list[Path]) -> Path | None:
    """Prefer the plain English track: en.vtt beats en-orig.vtt beats longer names."""
    if not paths:
        return None
    return sorted(paths, key=lambda p: ("orig" in p.name, len(p.name), p.name))[0]


def scrape_youtube(channels: list[str], latest_n: int, seen: set[str],
                   ytdlp_bin: str | None) -> tuple[list[dict], tuple[str, str]]:
    """Latest uploads per @handle -> caption transcripts. $0: captions only, no
    Whisper. Caption-less videos are still listed (marked transcript_skipped)."""
    if not channels:
        return [], ("down", "no youtube_channels in your watchlist")
    if not ytdlp_bin:
        return [], ("down", "yt-dlp not found — run: pip install yt-dlp")
    items, errors = [], []
    today = date.today().isoformat()
    for ch in channels:
        try:
            proc = subprocess.run(
                [ytdlp_bin, "--flat-playlist", "--playlist-end", str(latest_n),
                 "--dump-json", f"https://www.youtube.com/{ch}/videos"],
                capture_output=True, text=True, timeout=120)
        except (subprocess.TimeoutExpired, OSError) as e:
            errors.append(f"{ch}: {type(e).__name__}")
            continue
        if getattr(proc, "returncode", 1) != 0:
            errors.append(f"{ch}: {(proc.stderr or proc.stdout or 'error')[:80]}")
            continue
        for vid in parse_ytdlp_flat(proc.stdout):
            if vid["id"] in seen:
                continue
            item = {"source": f"youtube/{ch}", "type": "youtube", "title": vid["title"],
                    "url": vid["url"], "summary": vid["title"], "item_id": vid["id"],
                    "signal": 0, "signal_label": "new upload", "scraped_date": today}
            with tempfile.TemporaryDirectory() as td:
                try:
                    subprocess.run(
                        [ytdlp_bin, "--write-sub", "--write-auto-sub", "--sub-lang", "en.*,en",
                         "--skip-download", "-o", f"{td}/%(id)s", vid["url"]],
                        capture_output=True, text=True, timeout=180)
                except (subprocess.TimeoutExpired, OSError):
                    pass
                vtt = pick_vtt(sorted(Path(td).glob(f"{vid['id']}*.vtt")))
                if vtt is not None:
                    item["full_text"] = vtt_to_text(vtt.read_text(encoding="utf-8", errors="ignore"))
                else:
                    item["transcript_skipped"] = True
            items.append(item)
    if not items and errors:
        return [], ("down", "; ".join(errors[:3]))
    return items, ("ok", f"{len(items)} new videos" + (f" ({len(errors)} channel errors)" if errors else ""))


def scrape_x(accounts: list[str], per_account: int) -> tuple[list[dict], tuple[str, str]]:
    """X / Twitter watchlist — the ONE source that needs your own login.

    X has no free public API and no public RSS, so unlike the other four this
    can't run with zero setup. By default it returns nothing and a friendly note,
    and your radar is still great on GitHub + Reddit + YouTube + MCP without it.

    Want X in your radar? Wire your own authenticated fetch in HERE — anything
    that reads your logged-in session and returns a list of item dicts shaped
    like the other sources:

        {"source": f"x/@{acct}", "type": "x", "title": text[:100],
         "url": f"https://x.com/{acct}/status/{tweet_id}",
         "summary": text[:300], "full_text": text, "item_id": str(tweet_id),
         "signal": likes, "signal_label": f"{likes} likes",
         "scraped_date": date.today().isoformat()}

    Keep your credentials in your own environment — this starter ships none and
    asks for none. Return ([...], ("ok", "...")) once it's wired.
    """
    if not accounts:
        return [], ("down", "no x_accounts in your watchlist (fine — the other four run without it)")
    return [], ("down", "X needs your own login — see the README + the scrape_x() note. "
                        "The other four sources run with zero setup.")


def scrape_threads(accounts: list[str], per_account: int) -> tuple[list[dict], tuple[str, str]]:
    """Threads watchlist — via the October browser bridge (YURI addition).

    Threads has no public API/RSS, so scraping runs through the logged-in
    browser session October already holds. A browser-wired agent visits each
    watched profile and drops one JSON file per account into threads-inbox/:

        {"account": "handle", "captured_at": "ISO-8601",
         "posts": [{"id": "shortcode-or-ordinal", "text": "...",
                    "url": "https://www.threads.com/@handle/post/...",
                    "likes": 0, "replies": 0, "reposts": 0,
                    "posted": "ISO-8601 or relative label"}]}

    No credentials live here — the bridge uses the live session. Files older
    than 3 days are ignored so stale captures can't masquerade as fresh
    signal. Returns item dicts shaped like the other sources.
    """
    if not accounts:
        return [], ("down", "no threads_accounts in your watchlist")
    if not THREADS_INBOX.is_dir():
        return [], ("down", f"threads-inbox/ missing — run the browser bridge "
                            f"for {len(accounts)} watched accounts first")
    items: list[dict] = []
    captured: set[str] = set()
    cutoff = time.time() - 3 * 86_400
    for f in sorted(THREADS_INBOX.glob("*.json")):
        if f.stat().st_mtime < cutoff:
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        acct = str(data.get("account", f.stem)).lstrip("@")
        if acct not in accounts:
            continue
        captured.add(acct)
        for post in (data.get("posts") or [])[:per_account]:
            text = str(post.get("text", "")).strip()
            if not text:
                continue
            pid = re.sub(r"[^A-Za-z0-9_-]", "", str(post.get("id", "0"))) or "0"
            likes = int(post.get("likes") or 0)
            items.append({
                "source": f"threads/@{acct}", "type": "threads",
                "title": text[:100], "url": post.get("url") or f"https://www.threads.com/@{acct}",
                "summary": text[:300], "full_text": text,
                "item_id": f"{acct}-{pid}", "signal": likes,
                "signal_label": f"{likes} likes",
                "scraped_date": str(post.get("posted") or date.today().isoformat()),
            })
    missing = [a for a in accounts if a not in captured]
    if not items:
        return [], ("down", f"no fresh captures in threads-inbox/ ({len(missing)} accounts pending)")
    note = f"{len(items)} posts from {len(captured)} accounts"
    if missing:
        note += f" (pending: {', '.join(missing[:3])}{'…' if len(missing) > 3 else ''})"
    return items, ("ok", note)


# ── Deep read ────────────────────────────────────────────────────────────────
def pick_deep_read_candidates(items: list[dict], n: int) -> list[dict]:
    """Top-n GitHub/Reddit items by signal to pull full text for."""
    pool = [i for i in items
            if i.get("type") in ("github", "reddit")
            and str(i.get("url", "")).startswith("http")
            and "full_text" not in i]
    return sorted(pool, key=lambda i: i.get("signal", 0), reverse=True)[:n]


def fetch_jina(url: str) -> str:
    """Free Jina Reader (r.jina.ai prefix, no key) -> readable plain text."""
    resp = requests.get(f"https://r.jina.ai/{url}",
                        headers={**HEADERS, "Accept": "text/plain"}, timeout=30)
    resp.raise_for_status()
    return resp.text


def deep_read_items(candidates: list[dict], fetch=None) -> tuple[int, tuple[str, str]]:
    """Attach full_text to each candidate in place; per-URL failures are skipped."""
    fetch = fetch or fetch_jina
    ok = 0
    for item in candidates:
        try:
            item["full_text"] = fetch(item["url"])
            ok += 1
        except Exception:
            continue
    if candidates and ok == 0:
        return 0, ("down", f"all {len(candidates)} deep-reads failed (r.jina.ai unreachable?)")
    return ok, ("ok", f"{ok}/{len(candidates)} deep-reads")


# ── Pipeline helpers ─────────────────────────────────────────────────────────
def deduplicate(items: list[dict]) -> list[dict]:
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    out: list[dict] = []
    for it in items:
        u = it.get("url", "").rstrip("/").lower()
        t = it.get("title", "").lower()[:80]
        if u in seen_urls or (t and t in seen_titles):
            continue
        seen_urls.add(u)
        seen_titles.add(t)
        out.append(it)
    return out


def who(item: dict) -> str:
    """Short source attribution: @handle / owner-repo / subreddit."""
    src = item.get("source", "")
    if "/@" in src:                       # youtube/@handle
        return src.split("/")[-1]
    if item["type"] == "github":
        return item["title"]              # owner/repo
    if item["type"] == "reddit":
        m = re.search(r"reddit\.com/(r/[^/]+)/", item["url"] + "/")
        return m.group(1) if m else src
    if item["type"] == "x":
        m = re.search(r"(?:x|twitter)\.com/([^/]+)/", item["url"] + "/")
        return "@" + m.group(1) if m else ""
    if item["type"] == "threads":
        m = re.search(r"threads\.com/@([^/]+)", item["url"] + "/")
        return "@" + m.group(1) if m else src.split("/")[-1]
    return src


def slugify(s: str, max_len: int = 60) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:max_len].rstrip("-") or "item"


def item_filename(item: dict) -> str:
    """Per-item note name: yt-<channel>-<id>.md / x-<acct>-<id>.md / web-<slug>-<hash>.md"""
    typ = item["type"]
    iid = re.sub(r"[^A-Za-z0-9_-]", "", str(item.get("item_id", "0"))) or "0"
    if typ == "x":
        return f"x-{slugify(item['source'].split('@')[-1], 30)}-{iid}.md"
    if typ == "youtube":
        return f"yt-{slugify(item['source'].split('/')[-1], 30)}-{iid}.md"
    h = hashlib.sha1(item["url"].encode("utf-8")).hexdigest()[:8]
    return f"web-{slugify(item['title'])}-{h}.md"


def cap(text: str, url: str) -> str:
    if len(text) > ITEM_CHAR_CAP:
        return text[:ITEM_CHAR_CAP] + f"\n\n> [truncated at {ITEM_CHAR_CAP} chars — full source: {url}]"
    return text


def render_item(item: dict) -> str:
    """One captured item -> a readable markdown note (frontmatter + full text)."""
    title_line = yaml.safe_dump({"title": item["title"][:120]}, allow_unicode=True, width=1000).strip()
    lines = ["---", "type: signal-item", f"channel: {item['type']}", f"source: {item['source']}",
             title_line, f"url: {item['url']}", f"item_id: {item.get('item_id', '')}",
             f"date: {item['scraped_date']}", f"signal: \"{item.get('signal_label', '')}\"",
             "tags: [signals]", "---", "", f"# {item['title']}", "",
             cap(item.get("full_text") or "", item["url"])]
    return "\n".join(lines)


def public_item(item: dict) -> dict:
    """Shape one item for signals.json (the dashboard's data contract)."""
    ft = item.get("full_text") or ""
    return {
        "channel": item["type"],
        "title": item["title"],
        "url": item["url"],
        "summary": item.get("summary", ""),
        "signal": item.get("signal", 0),
        "signal_label": item.get("signal_label", ""),
        "source": item.get("source", ""),
        "who": who(item),
        "item_id": str(item.get("item_id", "")),
        "note_file": item_filename(item) if ft else "",
        "transcript_skipped": bool(item.get("transcript_skipped")),
        "full_text": cap(ft, item["url"]) if ft else "",
    }


def write_output(items: list[dict], status: dict, out_dir: Path, today: str) -> list[Path]:
    """Write per-item notes (for items with full text) + signals.json (the whole feed)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for item in items:
        if not item.get("full_text"):
            continue
        p = out_dir / item_filename(item)
        p.write_text(render_item(item), encoding="utf-8")
        written.append(p)
    payload = {
        "date": today,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "channels": {
            name: {"status": st, "detail": reason,
                   "count": sum(1 for i in items if i["type"] == name)}
            for name, (st, reason) in status.items() if name in SOURCE_CHANNELS
        },
        "items": [public_item(i) for i in items],
    }
    jpath = out_dir / "signals.json"
    jpath.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    written.append(jpath)
    return written


# ── Every-other-day gate ─────────────────────────────────────────────────────
def should_run(stamp: Path, now_ts: int, min_days: int = 2) -> bool:
    """True if it's been at least ~2 days since the last real sweep. The 1h slack
    lets a 7:30 launchd fire land even when the last run was a hair under 48h ago."""
    try:
        last = int(stamp.read_text().strip())
    except (OSError, ValueError):
        return True
    return (now_ts - last) >= (min_days * 86_400 - 3_600)


# ── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(
        description="Signals Radar — free every-other-morning AI signal sweep "
                    "(GitHub + Reddit + YouTube + MCP; X optional). $0, no API keys.")
    ap.add_argument("--force", action="store_true", help="run now, ignore the every-2nd-day gate")
    ap.add_argument("--print-only", action="store_true", help="print what it'd grab; write nothing, no gate touch")
    ap.add_argument("--hours", type=int, default=24, help="GitHub window: <=24 daily, else weekly (default 24)")
    ap.add_argument("--reddit-window", choices=["day", "week", "month"], default="day", help="Reddit top window")
    ap.add_argument("--reddit-limit", type=int, default=25, help="max Reddit posts (default 25)")
    ap.add_argument("--mcp-limit", type=int, default=10, help="max MCP servers (default 10)")
    ap.add_argument("--no-github", action="store_true")
    ap.add_argument("--no-reddit", action="store_true")
    ap.add_argument("--no-youtube", action="store_true")
    ap.add_argument("--no-mcp", action="store_true")
    ap.add_argument("--no-x", action="store_true")
    ap.add_argument("--no-threads", action="store_true")
    ap.add_argument("--no-deepread", action="store_true", help="skip the r.jina.ai full-text reads")
    args = ap.parse_args()

    now = int(time.time())
    if not args.force and not args.print_only and not should_run(STAMP, now):
        print("sweep: last run was <2 days ago — skipping (use --force to override)")
        return

    wl = load_watchlist()
    today = date.today().isoformat()
    items: list[dict] = []
    status: dict[str, tuple[str, str]] = {}

    def channel(name: str, enabled: bool, fn):
        """Per-channel isolation: one dead source never sinks the whole sweep."""
        if not enabled:
            status[name] = ("down", "disabled by flag")
            return
        try:
            got, st = fn()
            items.extend(got)
            status[name] = st
        except Exception as e:  # noqa: BLE001
            status[name] = ("down", f"{type(e).__name__}: {e}")

    print("sweeping…")
    channel("github", not args.no_github, lambda: (
        scrape_github_trending("daily" if args.hours <= 24 else "weekly", wl["github_keywords"]),
        ("ok", "trending scraped")))
    channel("mcp", not args.no_mcp, lambda: (scrape_mcp(args.mcp_limit), ("ok", "registry scraped")))
    channel("reddit", not args.no_reddit, lambda: (
        scrape_reddit(wl["subreddits"], args.reddit_window, args.reddit_limit), ("ok", "rss scraped")))
    ytdlp = shutil.which("yt-dlp")
    channel("youtube", not args.no_youtube, lambda: scrape_youtube(
        wl["youtube_channels"], wl["youtube_latest_per_channel"], seen_video_ids(SIGNALS_DIR), ytdlp))
    channel("x", not args.no_x, lambda: scrape_x(wl["x_accounts"], wl["x_posts_per_account"]))
    channel("threads", not args.no_threads, lambda: scrape_threads(
        wl["threads_accounts"], wl["threads_posts_per_account"]))

    items = deduplicate(items)
    channel("deepread", not args.no_deepread, lambda: (
        [], deep_read_items(pick_deep_read_candidates(items, wl["deep_read_top_n"]))[1]))

    # Report every channel's status
    print()
    for name, (st, reason) in sorted(status.items()):
        print(f"  {'OK  ' if st == 'ok' else 'DOWN'} {name:9s} — {reason}")

    if not any(status.get(c, ("down", ""))[0] == "ok" for c in SOURCE_CHANNELS):
        print("\nsweep: every source is down — nothing written.", file=sys.stderr)
        raise SystemExit(1)

    if args.print_only:
        ranked = sorted([i for i in items if i.get("signal", 0) > 0],
                        key=lambda i: i["signal"], reverse=True)[:15]
        print(f"\n{len(items)} items after dedup. Top by signal:")
        for i, it in enumerate(ranked, 1):
            print(f"  {i:2d}. {it['signal_label']:>18s}  {it['title'][:70]}")
        return

    out_dir = SIGNALS_DIR / today
    written = write_output(items, status, out_dir, today)
    STAMP.write_text(str(now), encoding="utf-8")
    print(f"\nwrote {len(written)} files -> signals/{today}/  ({len(items)} signals, "
          f"{sum(1 for i in items if i.get('full_text'))} with full text)")
    print('next: tell Claude — "Build the dashboard following DASHBOARD-SPEC.md"')


if __name__ == "__main__":
    main()
