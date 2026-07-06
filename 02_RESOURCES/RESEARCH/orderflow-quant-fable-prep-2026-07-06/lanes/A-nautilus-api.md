# nautilus_trader v2 API Surface — Fable Build Reference

Recon lane A. Structure-first repo scrape (`nautechsystems/nautilus_trader`, default branch
`develop`, HEAD `v1.231.0` on `develop` / **`v2.0.0rc1`** pre-release live on PyPI + Nautech
package index as of 2026-06-29). Every signature below is verbatim from the source file cited.
Anything not directly confirmed is marked `UNVERIFIED`.

Source provenance: `mcp__zread__get_repo_structure` (root + subdirs) run first per
`.claude/rules/zread-repo-scrape.md`; no path was guessed — every `read_file` call traced to a
structure listing. Zero `code 1015` hits this pass.

---

## 0. INSTALL (macOS arm64)

Officially supported platform: **macOS 15.0+, ARM64 only** (Linux x86_64/ARM64 and Windows
x86_64 also supported). Source: `docs/getting_started/installation.md`.

### Option A — stable v1 line (PyPI, no Rust needed)

```bash
uv pip install nautilus_trader
# with IB + Docker extras:
uv pip install "nautilus_trader[ib,docker]"
```

### Option B — v2 development wheel (what the packet asked for: v2.0.0rc1 line)

```bash
uv pip install --pre --index-url=https://packages.nautechsystems.io/v2/simple/ nautilus-trader
```

- `--pre` is REQUIRED (v2 wheels are pre-release).
- Installed import name is still `nautilus_trader` (no import path change).
- Run this OUTSIDE a nautilus_trader source checkout — the repo's own `uv` `exclude-newer`
  policy can filter out newly published v2 wheels inside a checkout.
- v2 dev wheels target **Python 3.12–3.14**. Officially supported Python range for the
  project overall: `>=3.12,<3.15` (confirmed in `pyproject.toml`).
- **No Rust toolchain needed for this path** — confirmed: this is a pre-built binary wheel
  install. Rust/`rustup`/`clang`/`cargo` are only required for the "From source" build path
  (`docs/getting_started/installation.md` section "From source", steps 1–8), NOT for the
  `uv pip install --pre` wheel path above.
- If a v2 wheel isn't published yet for macOS ARM64 on the v2 index (dev-wheel platform
  coverage varies — nightly wheels cover macOS ARM64, `develop`-branch dev wheels currently
  publish **Linux x86_64 only** per the same doc), the fallback is
  `make build-debug-v2` from a source checkout, which DOES require Rust + `uv sync`.
  **UNVERIFIED**: whether packages.nautechsystems.io/v2/simple currently has a macOS
  arm64 `.whl` published — the doc doesn't enumerate per-platform v2 wheel availability;
  check `curl -s https://packages.nautechsystems.io/v2/simple/nautilus-trader/index.html`
  before committing to this path.

### Version pin used by Fable

Target `nautilus-trader==2.0.0rc1` (or whatever is latest on the v2 index at build time —
the v2 index is a moving pre-release channel, not a fixed tag). Confirmed real via
`zread search_doc`: "a **2.0.0rc1 pre-release** appeared on PyPI on June 29" — this is a
genuine release, not a hallucinated version.

### Extras relevant to this build

- `ib`: Interactive Brokers adapter deps (`nautilus-ibapi==10.45.1` pinned, `defusedxml`, `protobuf==5.29.6`).
- `docker`: needed for `DockerizedIBGateway`.
- No `databento` extra exists — **Databento support ships in core, no extra needed**
  (confirmed: `docs/integrations/databento.md` — "You do not need to install `databento`
  separately. The adapter compiles as a static library and links automatically during the
  build.") The packet's assumed `nautilus_trader[databento]` extra does **NOT exist** —
  correction, not a gap.

---

## 1. ORDER BOOK MODEL

File: `nautilus_trader/model/book.pyx` (OrderBook, BookLevel) +
`nautilus_trader/model/data.pyx` (BookOrder, OrderBookDelta, OrderBookDeltas, OrderBookDepth10).
Rust backing: `crates/model/src/orderbook/{book,ladder,level,analysis,aggregation}.rs` (not
read this pass — Python/Cython layer is what a Fable strategy/actor touches directly).

### `BookOrder` — `nautilus_trader/model/data.pyx:2198`

```python
class BookOrder:
    def __init__(
        self,
        side: OrderSide,        # BUY | SELL
        price: Price,
        size: Quantity,
        order_id: int,          # uint64_t
    ) -> None: ...

    # properties: .price -> Price, .size -> Quantity, .side -> OrderSide, .order_id -> int
    def exposure(self) -> float: ...      # price * size
    def signed_size(self) -> float: ...   # negative for SELL
    @staticmethod
    def from_raw(side, price_raw, price_prec, size_raw, size_prec, order_id) -> BookOrder: ...
```

### `OrderBookDelta` — `nautilus_trader/model/data.pyx:2456`

```python
class OrderBookDelta(Data):
    def __init__(
        self,
        instrument_id: InstrumentId,
        action: BookAction,           # ADD | UPDATE | DELETE | CLEAR
        order: BookOrder | None,      # None only valid for CLEAR
        flags: int,                   # uint8_t — record flags bit field (end-of-event, etc.)
        sequence: int,                # uint64_t — 0 if source has no sequence numbers
        ts_event: int,                # uint64_t ns
        ts_init: int,                 # uint64_t ns
    ) -> None: ...
```
Raises `ValueError` if `action` is `ADD`/`UPDATE` and `order.size` is not positive.
Property `.action`, `.order`, `.instrument_id`, `.flags`, `.sequence`, `.ts_event`, `.ts_init`.

### `OrderBookDeltas` — `nautilus_trader/model/data.pyx:3083`

```python
class OrderBookDeltas(Data):
    def __init__(
        self,
        instrument_id: InstrumentId,
        deltas: list[OrderBookDelta],   # must be non-empty
    ) -> None: ...
    # properties: .instrument_id, .deltas -> list[OrderBookDelta], .is_snapshot, .sequence,
    #             .ts_event, .ts_init
```
This is the batch container the message bus hands to `on_order_book_deltas` — a snapshot
(is_snapshot=True) followed by incremental delta batches.

### `OrderBookDepth10` — `nautilus_trader/model/data.pyx:3445`

```python
class OrderBookDepth10(Data):
    def __init__(
        self,
        instrument_id: InstrumentId,
        bids: list[BookOrder],       # max len 10, padded with NULL_ORDER if shorter
        asks: list[BookOrder],       # max len 10
        bid_counts: list[int],       # uint32_t per level, 0 if unknown
        ask_counts: list[int],       # uint32_t per level
        flags: int,                  # uint8_t
        sequence: int,               # uint64_t
        ts_event: int,               # uint64_t ns
        ts_init: int,                # uint64_t ns
    ) -> None: ...
```
Raises `ValueError` if `bids`/`asks`/`bid_counts`/`ask_counts` lengths exceed 10 or are unequal.
This is exactly Databento's MBP-10 shape — 10 fixed levels/side + per-level order counts. Fable's
OBI (order book imbalance) computation over depth-10 reads `.bids`/`.asks` (each a
`list[BookOrder]`, size-ordered) directly off this object; no extra parsing needed.

### `OrderBook` — `nautilus_trader/model/book.pyx:~108`

```python
class OrderBook(Data):
    def __init__(self, instrument_id: InstrumentId, book_type: BookType) -> None: ...
    # BookType enum: L1_MBP | L2_MBP | L3_MBO

    def reset(self) -> None: ...
    def add(self, order: BookOrder, ts_event: int, flags: int = 0, sequence: int = 0) -> None: ...
    def update(self, order: BookOrder, ts_event: int, flags: int = 0, sequence: int = 0) -> None: ...
    def delete(self, order: BookOrder, ts_event: int, flags: int = 0, sequence: int = 0) -> None: ...
    def clear(self, ts_event: int, sequence: int = 0) -> None: ...
    def apply_delta(self, delta: OrderBookDelta) -> None: ...
    def apply_deltas(self, deltas: OrderBookDeltas) -> None: ...
    def apply_depth(self, depth: OrderBookDepth10) -> None: ...
    def apply(self, data: Data) -> None: ...   # dispatches to apply_delta/apply_deltas/apply_depth by type

    def bids(self) -> list[BookLevel]: ...   # descending price order
    def asks(self) -> list[BookLevel]: ...   # ascending price order
    def best_bid_price(self) -> Price | None: ...
    def best_ask_price(self) -> Price | None: ...
    def best_bid_size(self) -> Quantity | None: ...
    def best_ask_size(self) -> Quantity | None: ...
    def spread(self) -> float | None: ...
    def midpoint(self) -> float | None: ...
    def get_avg_px_for_quantity(self, quantity: Quantity, order_side: OrderSide) -> float: ...
    def get_quantity_for_price(self, price: Price, order_side: OrderSide) -> float: ...
    def get_quantity_at_level(self, price: Price, order_side: OrderSide, size_precision: int) -> Quantity: ...
    def check_integrity(self) -> None: ...   # raises RuntimeError if bid >= ask (crossed book)
    def pprint(self, num_levels: int = 3) -> str: ...
    @property
    def sequence, ts_event, ts_init, ts_last, update_count, instrument_id, book_type
```

`BookLevel` (read-only, from `book.bids()`/`book.asks()`): `.side`, `.price -> Price`,
`.orders() -> list[BookOrder]`, `.size() -> float`, `.exposure() -> float` (price*volume).

**How Fable ports OFI/OBI**: maintain `book = OrderBook(instrument_id, BookType.L2_MBP)` (or
`L3_MBO` for Databento MBO), call `book.apply(data)` inside `on_order_book_deltas`/
`on_order_book_depth`, read `book.bids()[0].size()` / `book.asks()[0].size()` per update for
OBI, and diff level-price/size across updates for OFI. `OrderBookDepth10` already gives fixed
top-10 levels per side without needing a live `OrderBook` — cheaper path for OBI-only strategies
that don't need full L3 reconstruction.

---

## 2. DATABENTO ADAPTER

File: `nautilus_trader/adapters/databento/{config,data,factories,loaders,providers}.py`.
Doc: `docs/integrations/databento.md` (full file read, 100% covered).

### Schema → Nautilus type map (confirmed table)

| Databento schema | Nautilus type | Nautilus subscription method (default schema) |
|---|---|---|
| `mbo` | `OrderBookDelta` (buffered into `OrderBookDeltas` on `F_LAST` flag) | `subscribe_order_book_deltas(book_type=BookType.L3_MBO)` |
| `mbp-10` | `OrderBookDepth10` | `subscribe_order_book_depth(depth=10)` — **depth MUST be 10**, Databento only supports depth=10 |
| `mbp-1` / `bbo-1s` / `bbo-1m` / `cmbp-1` / `cbbo-1s` / `cbbo-1m` / `tbbo` / `tcbbo` | `QuoteTick` (+ `TradeTick` for trade-carrying schemas) | `subscribe_quote_ticks(params={"schema": "..."})` |
| `trades` | `TradeTick` | `subscribe_trade_ticks()` |
| `ohlcv-1s/1m/1h/1d` | `Bar` | `subscribe_bars(bar_type=...)` |
| `definition` | `Instrument` (Equity/FuturesContract/OptionContract/FuturesSpread/OptionSpread/CurrencyPair) | auto via instrument provider |
| `imbalance` | `DatabentoImbalance` (adapter-specific, no built-in Nautilus type) | `subscribe_data(DataType(DatabentoImbalance, metadata={...}))` |
| `statistics` | `DatabentoStatistics` (adapter-specific) | `subscribe_data(DataType(DatabentoStatistics, metadata={...}))` |
| `status` | `InstrumentStatus` | `subscribe_instrument_status(instrument_id, client_id=DATABENTO_CLIENT_ID)` |

Instrument class → Nautilus type (from doc, DEFINITION schema decode):

| Databento class code | Nautilus type |
|---|---|
| `K` Stock | `Equity` |
| `F` Future | `FuturesContract` |
| `C`/`P` Call/Put | `OptionContract` |
| `S` Future spread | `FuturesSpread` |
| `T`/`M` Option/Mixed spread | `OptionSpread` |
| `X` FX spot | `CurrencyPair` |
| `I` Index, `B` Bond | not yet supported (skipped with warning) |

### Config class

```python
from nautilus_trader.adapters.databento import DATABENTO
from nautilus_trader.config import InstrumentProviderConfig, TradingNodeConfig
from nautilus_trader.model.identifiers import InstrumentId

instrument_ids = [InstrumentId.from_str("ESZ6.XCME")]   # GLBX.MDP3 = CME Globex

config = TradingNodeConfig(
    data_clients={
        DATABENTO: {
            "api_key": None,               # falls back to DATABENTO_API_KEY env var
            "http_gateway": None,          # historical HTTP override, mainly for tests
            "live_gateway": None,          # live TCP override, mainly for tests
            "instrument_provider": InstrumentProviderConfig(load_ids=frozenset(instrument_ids)),
            "instrument_ids": instrument_ids,
            "parent_symbols": {"GLBX.MDP3": {"ES.FUT"}},   # optional parent-symbol trees
        },
    },
)
```
Config fields (full table, `docs/integrations/databento.md`): `use_exchange_as_venue`
(default `True`), `timeout_initial_load` (15.0s), `mbo_subscriptions_delay` (3.0s — MBO
subscriptions must be made at node startup only, late subscriptions are logged as errors and
ignored), `bars_timestamp_on_close` (True), `reconnect_timeout_mins` (10), `venue_dataset_map`.

**No `load_all=True` support** — Databento datasets can have millions of definitions; must
specify `load_ids` or `parent_symbols` explicitly. Register factory:

```python
from nautilus_trader.adapters.databento.factories import DatabentoLiveDataClientFactory
node = TradingNode(config=config)
node.add_data_client_factory(DATABENTO, DatabentoLiveDataClientFactory)
node.build()
```

### Live subscription calls (inside a `Strategy`/`Actor`)

```python
# MBO -> full L3 book (order book deltas)
self.subscribe_order_book_deltas(instrument_id=instrument_id, book_type=BookType.L3_MBO)

# MBP-10 -> OrderBookDepth10 (depth param auto-selects mbp-10 schema; must be 10)
self.subscribe_order_book_depth(instrument_id=instrument_id, depth=10)

# Explicit schema override example (1s BBO instead of default mbp-1)
self.subscribe_quote_ticks(instrument_id=instrument_id, params={"schema": "bbo-1s"}, client_id=DATABENTO_CLIENT_ID)
```

### Dataset gotcha for ES futures + SPX/SPY options (relevant to Fable's target instruments)

- `GLBX.MDP3` (CME Globex MDP 3.0): covers CME/CBOT/NYMEX/COMEX futures + options on futures +
  spreads. Supports MBO, MBP-1, MBP-10, TBBO, trades, BBO intervals, OHLCV, definitions,
  statistics, status. **This is the dataset for ES futures.**
- SPX/SPY options are NOT CME products (SPX = CBOE index options, SPY = NYSE Arca ETF options)
  — **GLBX.MDP3 does not cover them.** `docs/integrations/databento.md` names `OPRA.PILLAR` as
  the relevant OPRA options dataset (referenced in the "Option expiration correction" section
  for OPRA/SPX/SPXW-specific expiration-time handling), but the doc's "two common evaluation
  datasets" callout only fully details `GLBX.MDP3` and `EQUS.MINI` (US equities, MBP-1/TBBO/
  trades/OHLCV/definitions only — **no MBO, no MBP-10** for EQUS.MINI, so no full book depth
  for SPY via this dataset). **UNVERIFIED**: exact `OPRA.PILLAR` schema support matrix (does it
  carry `mbp-10` for SPX/SPY options?) — the doc confirms OPRA.PILLAR exists and has a documented
  expiration-time quirk but does not enumerate its full schema table the way it does for
  GLBX.MDP3/EQUS.MINI. Fable should hit Databento's `metadata.list_schemas?dataset=OPRA.PILLAR`
  before assuming depth-10 book data is available for 0DTE SPX/SPY options.

---

## 3. INTERACTIVE BROKERS ADAPTER

File: `nautilus_trader/adapters/interactive_brokers/{config,gateway,client/*}.py`.
Doc: `docs/integrations/ib.md` (2099 lines full text captured; read via saved-file unescape,
100% of file retrieved).

### Install

```bash
uv pip install "nautilus_trader[ib,docker]"
```
IB does not ship pip wheels for `ibapi`; Nautech repackages it as `nautilus-ibapi==10.45.1` on
PyPI (pulled automatically via the `ib` extra).

### Default ports

| Application | Paper | Live |
|---|---|---|
| TWS | 7497 | 7496 |
| IB Gateway | 4002 | 4001 |

### Config classes — verbatim import + usage

```python
from nautilus_trader.adapters.interactive_brokers.config import (
    InteractiveBrokersDataClientConfig,
    InteractiveBrokersExecClientConfig,
    DockerizedIBGatewayConfig,
    IBMarketDataTypeEnum,
)
from nautilus_trader.adapters.interactive_brokers.gateway import DockerizedIBGateway

# --- Connect to an existing TWS/Gateway instance ---
data_config = InteractiveBrokersDataClientConfig(
    ibg_host="127.0.0.1",
    ibg_port=7497,          # TWS paper trading port
    ibg_client_id=1,
    use_regular_trading_hours=True,
    market_data_type=IBMarketDataTypeEnum.DELAYED_FROZEN,   # or REALTIME/DELAYED/FROZEN
    ignore_quote_tick_size_updates=False,
    connection_timeout=300,
    request_timeout_secs=60,
)

exec_config = InteractiveBrokersExecClientConfig(
    ibg_host="127.0.0.1",
    ibg_port=7497,
    ibg_client_id=1,
    account_id="DU123456",   # paper trading account ID; falls back to TWS_ACCOUNT env var
    routing=RoutingConfig(default=True),   # from nautilus_trader.config
)

# --- Dockerized IB Gateway (recommended for automated / DISARMED-paper deployments) ---
gateway_config = DockerizedIBGatewayConfig(
    username="your_username",   # or TWS_USERNAME env var
    password="your_password",   # or TWS_PASSWORD env var
    trading_mode="paper",       # "paper" | "live"
    read_only_api=True,         # False to allow order execution
    timeout=300,
)
gateway = DockerizedIBGateway(config=gateway_config)
gateway.start()
print(gateway.is_logged_in(gateway.container))
```

### Data client config fields (full table, doc line ~1051)

| Field | Default | Notes |
|---|---|---|
| `instrument_provider` | `InteractiveBrokersInstrumentProviderConfig()` | which contracts load at startup |
| `ibg_host` | `127.0.0.1` | |
| `ibg_port` | `None` | required |
| `ibg_client_id` | `1` | |
| `use_regular_trading_hours` | `True` | RTH-only bars for stocks |
| `market_data_type` | `REALTIME` | `REALTIME`/`DELAYED`/`DELAYED_FROZEN`/`FROZEN` |
| `ignore_quote_tick_size_updates` | `False` | |
| `handle_revised_bars` | `False` | |
| `dockerized_gateway` | `None` | |
| `connection_timeout` | `300` | seconds |
| `request_timeout_secs` | `60` | seconds |

Exec client config adds: `account_id` (falls back to `TWS_ACCOUNT` env var),
`fetch_all_open_orders` (default `False`), `track_option_exercise_from_position_update`
(default `False`).

### UTC config requirement (explicit warning from doc)

> Configure TWS or IB Gateway to return market data timestamps in UTC before connecting
> NautilusTrader. This setting must be enabled by the user in TWS/IB Gateway, as
> NautilusTrader is designed to work with UTC timestamps.

This is a manual TWS/Gateway UI setting, not a config field on the Python side — confirm it's
set before first connect or timestamps will misalign.

### Paper-login shape

- Env vars: `TWS_USERNAME`, `TWS_PASSWORD`, `TWS_ACCOUNT` (account ID fallback for `account_id`).
- `trading_mode="paper"` in `DockerizedIBGatewayConfig` + paper port (7497 TWS / 4002 Gateway).
- `read_only_api=True` by default — set `False` explicitly to allow order execution (needed
  even in paper mode to actually submit orders, not just stream data).

### Symbology for ES futures + SPX (relevant to Fable's target instruments)

`IB_SIMPLIFIED` (default): continuous futures `ES.CME`; individual contract `ESM4.CME`.
Index options: `^{localSymbol}.{exchange}` e.g. `^SPX.CBOE`. `symbol_to_mic_venue` config
override lets you map `"SPX": "XCBO"` and `"ES": "XCME"` for alignment with Databento-style
instrument IDs — directly useful if Fable cross-references IB execution against
Databento market data for the same underlying.

### Market depth / order book via IB — GAP FLAGGED

The doc lists "Market Depth: Level 2 order book data (where available)" as a market-data
capability of `InteractiveBrokersClientMarketDataMixin`, but **does not show a
`subscribe_order_book_*` code example for the IB adapter** anywhere in the 2099-line doc (grep
for "subscribe_order_book" and "smart_depth" returned zero hits). **UNVERIFIED**: whether IB's
market depth reaches Nautilus as `OrderBookDeltas`/`OrderBookDepth10` the same way Databento's
does, or requires a different mechanism/is limited to specific exchanges. Given the build's
architecture (Databento = market data / OFI-OBI signal, IB = execution only, per the mission's
own framing — "Databento is a market data provider only... you can also match Databento data
with Interactive Brokers execution"), Fable should NOT rely on IB for order-book depth; use
Databento GLBX.MDP3 for ES book data and route only order execution through IB.

---

## 4. INSTRUMENT MODEL

Files: `nautilus_trader/model/instruments/{equity,futures_contract,option_contract}.pyx`.
All three constructors read in full.

### `Equity` — `nautilus_trader/model/instruments/equity.pyx`

```python
class Equity(Instrument):
    def __init__(
        self,
        instrument_id: InstrumentId,
        raw_symbol: Symbol,
        currency: Currency,
        price_precision: int,
        price_increment: Price,      # tick size
        lot_size: Quantity,
        ts_event: int,
        ts_init: int,
        max_quantity: Quantity | None = None,
        min_quantity: Quantity | None = None,
        margin_init: Decimal | None = None,
        margin_maint: Decimal | None = None,
        maker_fee: Decimal | None = None,
        taker_fee: Decimal | None = None,
        isin: str | None = None,
        tick_scheme_name: str | None = None,
        info: dict | None = None,
    ) -> None: ...
```
Sets `asset_class=AssetClass.EQUITY`, `instrument_class=InstrumentClass.SPOT`,
`size_precision=0`, `multiplier=Quantity.from_int_c(1)` internally.

### `FuturesContract` — `nautilus_trader/model/instruments/futures_contract.pyx`

```python
class FuturesContract(Instrument):
    def __init__(
        self,
        instrument_id: InstrumentId,
        raw_symbol: Symbol,
        asset_class: AssetClass,
        currency: Currency,
        price_precision: int,
        price_increment: Price,       # tick size
        multiplier: Quantity,          # contract multiplier (e.g. 50 for ES)
        lot_size: Quantity,
        underlying: str,
        activation_ns: int,            # uint64_t
        expiration_ns: int,            # uint64_t
        ts_event: int,
        ts_init: int,
        margin_init: Decimal | None = None,
        margin_maint: Decimal | None = None,
        maker_fee: Decimal | None = None,
        taker_fee: Decimal | None = None,
        exchange: str | None = None,   # ISO 10383 MIC, e.g. "XCME"
        tick_scheme_name: str | None = None,
        info: dict | None = None,
    ) -> None: ...
```
Sets `instrument_class=InstrumentClass.FUTURE`, `size_precision=0`,
`size_increment=Quantity.from_int_c(1)`, `min_quantity=Quantity.from_int_c(1)` internally.
Properties `.activation_utc`, `.expiration_utc` (both `pd.Timestamp`, tz=UTC, derived from
the `_ns` fields).

### `OptionContract` — `nautilus_trader/model/instruments/option_contract.pyx`

```python
class OptionContract(Instrument):
    def __init__(
        self,
        instrument_id: InstrumentId,
        raw_symbol: Symbol,
        asset_class: AssetClass,
        currency: Currency,
        price_precision: int,
        price_increment: Price,
        multiplier: Quantity,
        lot_size: Quantity,
        underlying: str,
        option_kind: OptionKind,        # PUT | CALL
        strike_price: Price,
        activation_ns: int,
        expiration_ns: int,
        ts_event: int,
        ts_init: int,
        margin_init: Decimal | None = None,
        margin_maint: Decimal | None = None,
        maker_fee: Decimal | None = None,
        taker_fee: Decimal | None = None,
        exchange: str | None = None,
        tick_scheme_name: str | None = None,
        info: dict | None = None,
    ) -> None: ...
```
Sets `instrument_class=InstrumentClass.OPTION`, `size_precision=0` internally. Note: the class
name is `OptionContract`, NOT `OptionsContract` as the mission packet's item 5 alternately named
it — `OptionsContract` does not exist in the codebase (confirmed via directory listing of
`nautilus_trader/model/instruments/`: `option_contract.pyx`/`.pxd` only).

For SPX/SPY 0DTE options specifically: `expiration_ns` needs exact intraday precision — see
Databento section's note on OPRA midnight-UTC expiration correction (`OPRA.PILLAR` dataset
zeroes time-of-day on raw expiration; the DBN loader corrects to 16:00 New York by default,
configurable via `expiration_overrides` per-underlying, e.g. `{"SPX": "09:30"}` for AM-settled
SPX vs PM-settled SPXW).

---

## 5. STRATEGY / ACTOR BASE

Files: `nautilus_trader/trading/strategy.pyx` (`Strategy(Actor)`) +
`nautilus_trader/common/actor.pyx` (`Actor(Component)` — base class, owns ALL the
`subscribe_*`/`on_*` data methods; `Strategy` only adds order submission/management on top).

### Data subscription — `nautilus_trader/common/actor.pyx`

```python
class Actor(Component):
    def subscribe_order_book_deltas(
        self,
        instrument_id: InstrumentId,
        book_type: BookType = BookType.L2_MBP,
        depth: int = 0,             # 0 = max depth
        client_id: ClientId | None = None,
        managed: bool = True,        # DataEngine maintains the book from the feed
        pyo3_conversion: bool = False,
        params: dict | None = None,
    ) -> None: ...
    # forwards to self.on_order_book_deltas / self.handle_order_book_deltas

    def subscribe_order_book_depth(
        self,
        instrument_id: InstrumentId,
        book_type: BookType = BookType.L2_MBP,
        depth: int = 0,
        client_id: ClientId | None = None,
        managed: bool = True,
        pyo3_conversion: bool = False,
        update_catalog: bool = False,
        params: dict | None = None,
    ) -> None: ...
    # forwards to self.on_order_book_depth

    def subscribe_order_book_at_interval(
        self,
        instrument_id: InstrumentId,
        book_type: BookType = BookType.L2_MBP,
        depth: int = 0,
        interval_ms: int = 1000,     # < 100ms: use deltas instead, per doc warning
        client_id: ClientId | None = None,
        params: dict | None = None,
    ) -> None: ...
    # forwards a *snapshot* OrderBook to self.on_order_book at the given interval

    def subscribe_quote_ticks(self, instrument_id, client_id=None,
                               update_catalog=False, aggregate_spread_quotes=False,
                               params=None) -> None: ...
    def subscribe_trade_ticks(self, instrument_id, client_id=None, ...) -> None: ...
    def subscribe_bars(self, bar_type, ...) -> None: ...

    # --- handlers (override in subclass) ---
    def on_order_book(self, order_book: OrderBook) -> None: ...             # interval snapshots
    def on_order_book_deltas(self, deltas: OrderBookDeltas) -> None: ...     # snapshot+deltas stream
    def on_order_book_depth(self, depth: OrderBookDepth10) -> None: ...     # fixed depth-10 stream
```

**Important gotcha (verbatim from source comment, `subscribe_order_book_depth`/`_deltas`)**:
"The `DataEngine` will only maintain one order book for each instrument... the level, depth
and params for the stream will be set as per the LAST subscription request (this will also
affect all subscribers)." If Fable's strategy needs both raw MBO deltas AND periodic
depth-10 snapshots for the same instrument, be aware subscriptions are shared per-instrument
at the DataEngine level, not per-subscriber.

### Order submission — `nautilus_trader/trading/strategy.pyx:809`

```python
class Strategy(Actor):
    def submit_order(
        self,
        order: Order,
        position_id: PositionId | None = None,
        client_id: ClientId | None = None,
        params: dict | None = None,
    ) -> None: ...
    # Raises ValueError if order.status != INITIALIZED.
    # Routes to OrderEmulator / RiskEngine depending on emulation_trigger / exec_algorithm_id.

    def submit_order_list(self, order_list, ...) -> None: ...   # strategy.pyx:903
    def modify_order(self, order, ...) -> None: ...              # strategy.pyx:1015
    def cancel_order(self, order: Order, client_id=None, params=None) -> None: ...   # strategy.pyx:1093
    def cancel_orders(self, orders: list, client_id=None, params=None) -> None: ...  # strategy.pyx:1138
```

Order construction itself uses the order factory classes under `nautilus_trader/model/orders/`
(`MarketOrder`, `LimitOrder`, etc. — not read this pass, out of scope for the OFI/OBI signal
surface the mission targets; flag as a follow-up if Fable needs exact order-factory
constructor signatures for the execution leg).

---

## SUMMARY OF CORRECTIONS TO THE MISSION PACKET'S OWN ASSUMPTIONS

1. **v2.0.0rc1 is real** (confirmed via search, live on PyPI + Nautech package index since
   2026-06-29) — packet's version assumption holds. Default branch `develop` is currently
   staged at v1.231.0 (unreleased); v2 is a separate parallel pre-release line built from
   `python/` (PyO3 package), not a linear successor tag on `develop`.
2. **No Rust toolchain needed** for the wheel-install path — confirmed. Only needed for
   "from source" / `make build-debug-v2` fallback.
3. **No `nautilus_trader[databento]` extra exists** — Databento support is core, not an extra.
   Packet's phrasing implied it might be an extra; corrected.
4. **Class is `OptionContract`, not `OptionsContract`** — packet used both spellings; only
   `OptionContract` exists in source.
5. **IB market-depth/order-book subscription API is UNVERIFIED** — doc mentions the capability
   exists but shows no `subscribe_order_book_*` usage example for IB anywhere in the full
   2099-line integration doc. Recommend Databento-only for book data, IB for execution only.
6. **OPRA.PILLAR schema support matrix for SPX/SPY options depth data is UNVERIFIED** — doc
   confirms the dataset and its expiration-time quirk but doesn't enumerate schema coverage
   the way it does for GLBX.MDP3/EQUS.MINI. Needs a live `metadata.list_schemas` check before
   Fable assumes MBO/MBP-10 is available for options.
