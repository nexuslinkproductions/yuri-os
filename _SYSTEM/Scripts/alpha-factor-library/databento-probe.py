#!/usr/bin/env python3
# @capability: databento-cost-probe
# @serves: databento cost estimate | how much does a databento pull cost | price ES MBP-10 before download | budget-safe first pull | $125 credit measure GB per dollar
# @does: prices a GLBX.MDP3 ES MBP-10 pull via metadata.get_cost + get_billable_size BEFORE spending; optional guarded tiny --pull writes a real DBN slice to data/databento/
# @use: run this FIRST after exporting DATABENTO_API_KEY, before any real historical backfill — it estimates $/GB and how many ES session-days the $125 credit buys, spending $0
# @exports: main
#
# ORDERFLOW-QUANT P1 — Databento ingestion probe (money-safe).
#
# THE POINT: recon left ONE number unmeasured — exact byte-cost of ES MBP-10.
# This probe answers it by calling Databento's own cost-estimation endpoints
# (metadata.get_cost -> USD, metadata.get_billable_size -> bytes) which cost
# NOTHING to call. Default run = estimate only, spends $0. You only touch the
# $125 credit when you pass --pull, and even then it refuses above --max-cost.
#
# KEY NEVER TOUCHES DISK VIA THIS SCRIPT: it is read from the DATABENTO_API_KEY
# environment variable by db.Historical() (SDK-native). Nothing here writes,
# logs, or echoes the key.
#
# USAGE (from repo root):
#   export DATABENTO_API_KEY='db-XXXXXXXXXXXXXXXX'     # ephemeral; dies with the shell
#   ~/.venvs/nautilus-v2/bin/python \
#     _SYSTEM/Scripts/alpha-factor-library/databento-probe.py            # estimate only ($0)
#   ... same ... --pull                                                  # tiny real slice, guarded
#
# Or via the wrapper: _SYSTEM/Scripts/alpha-factor-library/databento-probe.sh
#
# VERIFIED API SURFACE (databento-python main, 2026-07-06):
#   Historical() reads DATABENTO_API_KEY env when no key arg is passed (README).
#   metadata.get_cost(dataset,start,end,symbols,schema,stype_in,limit) -> float (USD).
#   metadata.get_billable_size(...) -> int (bytes).
#   timeseries.get_range(...,path=) -> DBNStore, streams DBN(zstd) to path.

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

DATASET = "GLBX.MDP3"   # CME Globex MDP 3.0 — ES/NQ/CL/GC futures
SCHEMA = "mbp-10"       # market-by-price, 10 depth levels — the orderflow wedge
SYMBOLS = "ES.c.0"      # continuous front-month ES
STYPE = "continuous"

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "databento")


def _fmt_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:,.2f} {unit}"
        n /= 1024
    return f"{n:,.2f} TB"


def _last_weekday_utc(days_back: int) -> datetime:
    """A recent, comfortably-available, weekday UTC midnight (historical lags ~T+1)."""
    d = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    d -= timedelta(days=days_back)
    while d.weekday() >= 5:  # Sat=5, Sun=6
        d -= timedelta(days=1)
    return d


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Databento money-safe cost probe for ES MBP-10 (GLBX.MDP3)."
    )
    ap.add_argument("--dataset", default=DATASET)
    ap.add_argument("--schema", default=SCHEMA)
    ap.add_argument("--symbols", default=SYMBOLS)
    ap.add_argument("--stype", default=STYPE, help="input symbology type (continuous|raw_symbol|...)")
    ap.add_argument("--start", default=None, help="explicit ISO start (UTC). Overrides --days-back.")
    ap.add_argument("--end", default=None, help="explicit ISO end (UTC).")
    ap.add_argument("--days-back", type=int, default=3,
                    help="estimate window = one full weekday this many days back (default 3).")
    ap.add_argument("--pull", action="store_true",
                    help="ACTUALLY download a tiny slice (spends credit, guarded by --max-cost).")
    ap.add_argument("--minutes", type=int, default=5, help="--pull slice length in minutes (default 5).")
    ap.add_argument("--max-cost", type=float, default=0.50,
                    help="refuse --pull if estimated cost exceeds this USD (default 0.50).")
    args = ap.parse_args()

    if not os.environ.get("DATABENTO_API_KEY"):
        print("ERROR: DATABENTO_API_KEY is not set.\n"
              "  export DATABENTO_API_KEY='db-XXXXXXXX'   then re-run.\n"
              "  (the key is read from the env; this script never stores it.)",
              file=sys.stderr)
        return 2

    try:
        import databento as db
    except ImportError:
        print("ERROR: databento SDK not installed in this interpreter.\n"
              "  uv pip install --python ~/.venvs/nautilus-v2/bin/python databento",
              file=sys.stderr)
        return 3

    client = db.Historical()  # reads DATABENTO_API_KEY from env

    # ---- estimate window ----
    if args.start:
        start = args.start
        end = args.end or _iso(datetime.fromisoformat(args.start) + timedelta(days=1))
        win_desc = f"{start} -> {end} (explicit)"
    else:
        day = _last_weekday_utc(args.days_back)
        start = _iso(day)
        end = _iso(day + timedelta(days=1))
        win_desc = f"{start} -> {end} (1 full weekday, {args.days_back}d back)"

    print("=" * 66)
    print("DATABENTO PROBE — ES MBP-10 orderflow wedge (cost-first, $0 by default)")
    print("=" * 66)
    print(f"  dataset : {args.dataset}")
    print(f"  schema  : {args.schema}")
    print(f"  symbols : {args.symbols}  (stype_in={args.stype})")
    print(f"  window  : {win_desc}")
    print("-" * 66)

    # availability (best-effort; never fatal)
    try:
        rng = client.metadata.get_dataset_range(args.dataset)
        rng_end = rng.get("end") if isinstance(rng, dict) else rng
        rng_start = rng.get("start") if isinstance(rng, dict) else None
        print(f"  dataset available : {rng_start}  ->  {rng_end}")
    except Exception as e:  # noqa: BLE001
        print(f"  dataset available : (range lookup skipped: {str(e).splitlines()[0]})")

    common = dict(dataset=args.dataset, start=start, end=end,
                  symbols=args.symbols, schema=args.schema, stype_in=args.stype)

    # ---- the two free calls that answer the money question ----
    try:
        cost = client.metadata.get_cost(**common)          # USD, $0 to ask
        size = client.metadata.get_billable_size(**common)  # bytes, $0 to ask
    except Exception as e:  # noqa: BLE001 — surface the common first-run failure cleanly
        msg = str(e)
        if "auth" in msg.lower() or "401" in msg:
            print("\nERROR: Databento rejected the key (auth failed).\n"
                  "  Check DATABENTO_API_KEY is your real key from "
                  "https://databento.com/portal/keys\n"
                  "  (starts with 'db-'; no quotes/spaces baked into the value).",
                  file=sys.stderr)
            return 5
        print(f"\nERROR from Databento: {msg}", file=sys.stderr)
        return 6

    print("-" * 66)
    print(f"  ESTIMATED COST (1 session-day) : ${cost:,.4f} USD")
    print(f"  BILLABLE SIZE  (1 session-day) : {_fmt_bytes(size)}  ({size:,} bytes)")
    if size > 0:
        per_gb = cost / (size / 1e9)
        print(f"  IMPLIED RATE                   : ${per_gb:,.4f} / GB")
    print("-" * 66)
    if cost > 0:
        sessions = 125.0 / cost
        print(f"  $125 CREDIT BUYS  ~{sessions:,.1f} ES session-days of MBP-10 depth")
        print(f"    ~1 month  (21 sessions) would cost  ~${cost * 21:,.2f}")
        print(f"    ~3 months (63 sessions) would cost  ~${cost * 63:,.2f}")
    else:
        print("  cost is $0 for this window (likely a near-empty/holiday session) —")
        print("  re-run with --days-back pointing at an active trading day for a real rate.")
    print("=" * 66)

    if not args.pull:
        print("ESTIMATE-ONLY run complete. $0 spent. Add --pull for a tiny real slice.")
        return 0

    # ---- guarded real pull ----
    p_end_dt = datetime.fromisoformat(end.replace("Z", "")) if "T" in end else _last_weekday_utc(args.days_back) + timedelta(days=1)
    p_start_dt = p_end_dt - timedelta(minutes=args.minutes)
    p_start, p_end = _iso(p_start_dt), _iso(p_end_dt)
    pull_common = dict(common, start=p_start, end=p_end)

    pull_cost = client.metadata.get_cost(**pull_common)
    print(f"\n--pull window : {p_start} -> {p_end} ({args.minutes} min)")
    print(f"--pull estimated cost : ${pull_cost:,.4f} USD (ceiling ${args.max_cost:,.2f})")
    if pull_cost > args.max_cost:
        print(f"REFUSED: estimate ${pull_cost:,.4f} exceeds --max-cost ${args.max_cost:,.2f}. "
              f"Lower --minutes or raise --max-cost.", file=sys.stderr)
        return 4

    os.makedirs(OUT_DIR, exist_ok=True)
    stamp = p_end_dt.strftime("%Y%m%d")
    outfile = os.path.join(OUT_DIR, f"ES.c.0_mbp-10_{stamp}_{args.minutes}min.dbn.zst")
    print(f"downloading -> {outfile}")
    store = client.timeseries.get_range(**pull_common, path=outfile)

    actual = os.path.getsize(outfile)
    print(f"DONE. on-disk: {_fmt_bytes(actual)}  ({actual:,} bytes)")
    try:
        df = store.to_df()
        print(f"decoded rows: {len(df):,}")
        if len(df):
            cols = [c for c in ("ts_event", "action", "side", "price", "size", "bid_px_00", "ask_px_00") if c in df.columns]
            print(df[cols].head(3).to_string() if cols else df.head(3).to_string())
    except Exception as e:  # noqa: BLE001
        print(f"(decode preview skipped: {e})")
    print("Tape is real and decodes. Next: wire the recorder loop + IC spine on this slice.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
