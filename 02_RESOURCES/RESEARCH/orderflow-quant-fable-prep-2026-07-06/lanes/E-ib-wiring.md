# Lane E — IBKR Paper Wiring + Multi-Asset Instrument Runbook

**Date:** 2026-07-06 · **Author:** Yuri (Claude lane, recon) · **Audience:** Fable 5 (build reference)
**Method:** structure-first scrape of `nautechsystems/nautilus_trader` (`develop` branch, tree already
cached at `_SYSTEM/state/gh-raw-cache/`) + `gnzsnz/ib-gateway-docker` (`master`) via
`node _SYSTEM/Scripts/gh-raw.mjs` — no path-guessing, every path below traces to a confirmed tree
listing or a file actually fetched in this session. Web-verified against ≥2 primary/near-primary
sources for CME contract specs and Databento OPRA/greeks claims per the online-verification layer.

Sibling docs (do not duplicate): `B-reuse-surfaces.md` (YURI code reuse), `C-data-stack.md`
(Databento pricing/free-tier).

---

## 1. Dockerized IB Gateway

**Image (CONFIRMED, primary source, two independent references):**

```
ghcr.io/gnzsnz/ib-gateway:stable
```

- This is nautilus's own hardcoded default: `crates/adapters/interactive_brokers/src/config.rs:328`
  (Rust `DockerizedIBGatewayConfig.container_image` builder default) and
  `nautilus_trader/adapters/interactive_brokers/config.py` (`container_image: str = "ghcr.io/gnzsnz/ib-gateway:stable"`).
- Upstream repo: `github.com/gnzsnz/ib-gateway-docker` (`stable/Dockerfile`, `stable/` tag lineage vs
  `latest/Dockerfile`). This wraps IBC (IBController, `IbcAlpha/IBC`) around IB's actual Gateway
  binary for headless/scripted login — nautilus does not reimplement the login flow, it drives this
  container's env-var contract.

**Ports (CONFIRMED — both the nautilus Rust source and the upstream compose file agree):**

| Trading mode | Container-internal port | Host-mapped port (docs table) |
|---|---|---|
| Paper | `4004` | **4002** |
| Live  | `4003` | **4001** |
| VNC (remote desktop into the gateway UI, for 2FA/manual steps) | `5900` | `5900` |

Source: `crates/adapters/interactive_brokers/src/gateway/dockerized.rs` —
`HOST_PORTS = [("Paper", 4002), ("Live", 4001)]`, `CONTAINER_PORTS = [("Paper", 4004), ("Live", 4003)]`,
`VNC_PORT_INTERNAL = 5900`. Confirmed independently against `gnzsnz/ib-gateway-docker/docker-compose.yml`
port mappings `4001:4003` / `4002:4004` / `5900:5900`. **Also confirmed** in
`docs/integrations/ib.md`'s plain-English port table: IB Gateway paper=4002, live=4001 (TWS is
different: paper=7497, live=7496 — do not confuse if Fable ever falls back to TWS instead of Gateway).

**IBC (IBController) auto-login:** handled entirely inside the `gnzsnz/ib-gateway-docker` image —
its `image-files/config/ibc/config.ini.tmpl` is templated from env vars at container start
(`image-files/scripts/run.sh`). Fable does not touch IBC directly; the env vars below are the
IBC-facing contract.

**UTC timezone requirement (CONFIRMED, load-bearing, do not skip):**
`docs/integrations/ib.md`: *"Configure TWS or IB Gateway to return market data timestamps in UTC
before connecting NautilusTrader. This setting must be enabled by the user in TWS/IB Gateway, as
NautilusTrader is designed to work with UTC timestamps."* In the dockerized path this is the
`TIME_ZONE` / `TZ` env var on the container — set both to `Etc/UTC` (the compose file's own default
is `Etc/UTC` unless overridden; the `.env-dist` template in the upstream repo defaults to a
non-UTC example (`Europe/Zurich`) as a *user-fill-in-your-own* placeholder — **override it to
`Etc/UTC` explicitly**, do not leave it at the template's example value).

**Credentials + trading-mode env vars (CONFIRMED from nautilus source + upstream `.env-dist`):**

| Var | Source | Notes |
|---|---|---|
| `TWS_USERNAME` | nautilus `DockerizedIBGateway` reads this if `username` not passed in config | nautilus-side var name |
| `TWS_PASSWORD` | same, for `password` | nautilus-side var name |
| `TWS_ACCOUNT` | fallback for `account_id` in exec-client config | nautilus-side var name |
| `TWS_USERID` | upstream `gnzsnz/ib-gateway-docker` container's own var name for the IBKR username | **note the name mismatch**: nautilus's Python `DockerizedIBGateway.start()` sets container env `TWS_USERID`/`TWS_PASSWORD`/`TRADING_MODE`/`READ_ONLY_API`/`EXISTING_SESSION_DETECTED_ACTION` directly when it launches the container itself — so when nautilus manages the container lifecycle you only ever set `TWS_USERNAME`/`TWS_PASSWORD` on nautilus's config object, and nautilus translates to `TWS_USERID` internally. Only set `TWS_USERID` yourself if running `docker-compose` standalone (Fable's dockerized path, see snippet below) rather than letting nautilus's Python `DockerizedIBGateway.start()` spin the container. |
| `TRADING_MODE` | `paper` \| `live` \| `both` (upstream supports parallel live+paper via `TWS_USERID_PAPER`/`TWS_PASSWORD_PAPER`) | |
| `READ_ONLY_API` | `yes`/`no` (nautilus) or `no`/`yes` (upstream) — **verify casing per path**; nautilus's own config field is `read_only_api: bool` defaulting `True` (safe default, blocks order execution) | |
| `VNC_SERVER_PASSWORD` | upstream only, for the optional VNC/2FA remote-desktop access | required if `vnc_port` is set |
| `TWOFA_TIMEOUT_ACTION` | upstream IBC setting, default `exit`/`restart` depending on template | relevant if account has 2FA enabled (IBKR mobile push) |

**Two distinct ways to run the container — pick ONE, don't mix:**

1. **Nautilus-managed (recommended for Fable's automated P1 build).** Don't hand-write a
   `docker run`/`docker-compose` at all — pass a `DockerizedIBGatewayConfig` into
   `InteractiveBrokersDataClientConfig(dockerized_gateway=...)` /
   `InteractiveBrokersExecClientConfig(dockerized_gateway=...)`; nautilus's Python
   `DockerizedIBGateway` class (`nautilus_trader/adapters/interactive_brokers/gateway.py`) calls the
   `docker` Python SDK directly (`docker.from_env()`, `containers.run(...)`) to create/start/stop the
   `nautilus-ib-gateway-paper` (or `-live`) container itself, no compose file needed. Requires
   `pip install "nautilus_trader[ib,docker]"` (or `uv pip install "nautilus_trader[ib,docker]"`) so the
   `docker` Python package + `ibapi` (repackaged as `nautilus-ibapi` on PyPI) are present, and requires
   a running local Docker daemon (`Docker.connect_with_local_defaults()` / `docker.from_env()` — will
   raise if the socket isn't reachable).

2. **Standalone compose (useful for manual testing / running the gateway independent of a nautilus
   process, e.g. persistent gateway + multiple nautilus client_ids attaching to it).** Copy-ready
   compose block (adapted verbatim from `gnzsnz/ib-gateway-docker/docker-compose.yml`, trimmed to the
   fields that matter for paper trading; the upstream file exposes ~30 more optional IBC/SSH/VNC vars
   — see the full `.env-dist` if Fable needs 2FA/SSH-tunnel/custom-JTS-settings):

```yaml
# docker-compose.yml
name: fable-ib-gateway
services:
  ib-gateway:
    image: ghcr.io/gnzsnz/ib-gateway:stable
    restart: unless-stopped
    environment:
      TWS_USERID: ${TWS_USERID}
      TWS_PASSWORD: ${TWS_PASSWORD}
      TRADING_MODE: paper                 # paper | live | both
      READ_ONLY_API: "no"                 # "no" allows order routing; "yes" = data-only, safest default
      TIME_ZONE: Etc/UTC                  # MANDATORY — see UTC requirement above
      TZ: Etc/UTC
      EXISTING_SESSION_DETECTED_ACTION: primary
      TWOFA_TIMEOUT_ACTION: restart
      VNC_SERVER_PASSWORD: ${VNC_SERVER_PASSWORD}   # only needed if you expose 5900 for manual 2FA
    ports:
      - "127.0.0.1:4002:4004"   # paper: host 4002 -> container 4004
      - "127.0.0.1:4001:4003"   # live:  host 4001 -> container 4003 (only if TRADING_MODE=both)
      - "127.0.0.1:5900:5900"   # optional VNC for interactive 2FA approval
```

```bash
# .env (do NOT commit — paper creds still IBKR-account creds)
TWS_USERID=your_ibkr_username
TWS_PASSWORD=your_ibkr_password
VNC_SERVER_PASSWORD=changeme
```

```bash
docker compose up -d
# readiness check: nautilus polls container logs for one of
#   "Login has completed" | "Configuration tasks completed" | "Logged in to" | "Login successful"
docker compose logs -f ib-gateway
```

**Bind to `127.0.0.1` only** (both snippets above do this) — the gateway holds live brokerage
session state; do not expose 4001/4002/5900 beyond localhost without a VPN/SSH-tunnel layer (upstream
repo does support an `SSH_TUNNEL` env-var path for remote-host deployments, out of scope here).

---

## 2. Nautilus IB Adapter Config

Three config classes, all in `nautilus_trader.adapters.interactive_brokers.config`
(source: `nautilus_trader/adapters/interactive_brokers/config.py`):

### `DockerizedIBGatewayConfig` (only needed if nautilus manages the container itself — path 1 above)
```python
DockerizedIBGatewayConfig(
    username=None,          # or TWS_USERNAME env
    password=None,          # or TWS_PASSWORD env
    trading_mode="paper",   # "paper" | "live"
    read_only_api=True,     # False to allow live order execution
    timeout=300,            # seconds to wait for container ready
    container_image="ghcr.io/gnzsnz/ib-gateway:stable",  # default, rarely overridden
    vnc_port=None,           # e.g. 5900 to enable VNC (2FA)
)
```

### `InteractiveBrokersInstrumentProviderConfig`
Key fields for Fable's multi-asset use case:
```python
InteractiveBrokersInstrumentProviderConfig(
    symbology_method=SymbologyMethod.IB_SIMPLIFIED,  # default; IB_RAW for edge-case symbols
    load_ids=frozenset([...]),        # explicit InstrumentIds to preload, e.g. "ESM6.CME"
    load_contracts=frozenset([...]),  # IBContract objects — needed for chains (see §3/§4)
    build_futures_chain=False,        # per-contract override via IBContract, or global here
    build_options_chain=False,        # ditto
    min_expiry_days=None,
    max_expiry_days=None,
    convert_exchange_to_mic_venue=False,   # True -> "CME" becomes "XCME" etc.
    symbol_to_mic_venue={},                # e.g. {"SPX": "XCBO", "ES": "XCME", "SPY": "ARCX"}
    filter_sec_types=frozenset(),          # skip unsupported IB secTypes (e.g. "WAR", "IOPT")
)
```

### `InteractiveBrokersDataClientConfig`
```python
InteractiveBrokersDataClientConfig(
    ibg_host="127.0.0.1",
    ibg_port=None,                 # None + dockerized_gateway set -> auto (4002 paper / 4001 live)
    ibg_client_id=1,               # MUST be unique per concurrent connection to the same gateway
    use_regular_trading_hours=True,
    market_data_type=IBMarketDataTypeEnum.REALTIME,  # or DELAYED_FROZEN — see §4 subscription note
    dockerized_gateway=dockerized_gateway_config_or_None,
    instrument_provider=instrument_provider_config,
    connection_timeout=300,
    request_timeout_secs=60,        # bump this for large options-chain contract-detail requests
)
```

### `InteractiveBrokersExecClientConfig`
```python
InteractiveBrokersExecClientConfig(
    ibg_host="127.0.0.1",
    ibg_port=None,
    ibg_client_id=1,                # use a DIFFERENT client_id than the data client
    account_id=None,                # falls back to TWS_ACCOUNT env if None
    dockerized_gateway=dockerized_gateway_config_or_None,
    instrument_provider=instrument_provider_config,
    fetch_all_open_orders=False,
    track_option_exercise_from_position_update=False,
)
```

**How nautilus connects to the dockerized gateway, end to end:** when `dockerized_gateway` is set on
either client config, `ibg_host`/`ibg_port` are NOT required — nautilus's `DockerizedIBGateway` (invoked
internally by the client factories) starts/attaches to the `nautilus-ib-gateway-{paper|live}` container,
resolves the host port (4002/4001) itself, and the `InteractiveBrokersClient` connects over that
socket using the `ibapi` (TWS API) wire protocol — the SAME protocol used against real TWS/Gateway
installs. If Fable instead runs the standalone compose (path 2), skip `dockerized_gateway` entirely and
just set `ibg_host="127.0.0.1"`, `ibg_port=4002` (paper) directly — functionally identical from
nautilus's point of view, since the dockerized-gateway class is just a lifecycle-management
convenience wrapper around the same socket connection.

**`market_data_type` — DELAYED vs REALTIME (load-bearing for cost/no-subscription-needed decisions):**
`IBMarketDataTypeEnum` (from `ibapi.common.MarketDataTypeEnum`, re-exported by nautilus) has at least
`REALTIME` (default) and `DELAYED_FROZEN` (seen used in nautilus's own example scripts, e.g.
`connect_with_dockerized_gateway.py` sets `market_data_type=IBMarketDataTypeEnum.DELAYED_FROZEN` with
the comment *"If unset default is REALTIME"*). **`DELAYED_FROZEN` requires NO IBKR market-data
subscription** — use it for a from-scratch paper-account dev loop where no live data entitlements are
purchased yet. `REALTIME` requires the underlying exchange's live market-data subscription to be
active on the account (billed separately by IBKR per exchange/dataset — this is the standard IBKR
market-data-subscription reality, not a nautilus limitation) — **without a real-time subscription,
requesting `REALTIME` on IBKR paper accounts either errors or silently falls back to delayed/frozen
depending on account entitlements; do not assume paper-trading gives free real-time data.**
UNVERIFIED: the exact fallback behavior (hard error vs silent delayed) was not confirmed from a
primary IBKR doc in this pass — Fable should test this directly against the paper account before
relying on it.

---

## 3. CME Futures Instrument Defs — coding table

**How the front-month contract is requested via the IB adapter:** use `secType="CONTFUT"` (IB's
"continuous future" pseudo-contract) with `build_futures_chain=True` in an `IBContract`, e.g.:
```python
IBContract(secType="CONTFUT", exchange="CME", symbol="ES", build_futures_chain=True)
```
This resolves to nautilus's front-month rolling continuous-future symbology `ES.CME` (see §Symbology
below) — it auto-rolls, no manual month-code tracking needed for a continuous series. For a SPECIFIC
expiry contract instead, use `secType="FUT"` with an explicit `localSymbol` (e.g. `localSymbol="CLV7"`
for October-2027 crude — verbatim example from nautilus's own
`examples/live/interactive_brokers/connect_with_dockerized_gateway.py`).

**Nautilus symbology (`docs/integrations/ib.md`, `IB_SIMPLIFIED` — the default):**
- Continuous futures: `{symbol}.{exchange}` → e.g. `ES.CME`, `CL.NYMEX`
- Specific-month futures: `{localSymbol}.{exchange}`, single-digit year → e.g. `ESM4.CME`, `CLZ7.NYMEX`
- Options on futures (FOP): `{localSymbol}.{exchange}`, format `{symbol}{month}{year} {right}{strike}`
  → e.g. `ESM4 C4200.CME`
- Standard equity options: `{localSymbol}.{exchange}`, all spaces stripped →
  `AAPL230217P00155000.SMART`
- Indices (SPX): `^{localSymbol}.{exchange}` → `^SPX.CBOE`

**Futures month codes (CONFIRMED, `docs/integrations/ib.md`):**

| Month | Code | Month | Code |
|---|---|---|---|
| Jan | F | Jul | N |
| Feb | G | Aug | Q |
| Mar | H | Sep | U |
| Apr | J | Oct | V |
| May | K | Nov | X |
| Jun | M | Dec | Z |

**Instrument spec table — Fable can code directly from this** (CONFIRMED against ≥2 independent
sources: CME-adjacent broker contract-spec pages (AMP Futures, Ironbeam, QuantVPS) cross-checked
against each other; exact CME.com product-spec pages were JS-rendered and did not return text via
WebFetch in this pass — treat multiplier/tick numbers as vendor-corroborated, not CME.com-primary-
fetched, and have Fable spot-check once against `cmegroup.com` product pages before hardcoding into a
production risk system):

| Symbol | Exchange (IB `exchange` field) | Underlying | Multiplier / point value | Min tick (price increment) | Tick value ($) |
|---|---|---|---|---|---|
| ES (E-mini S&P 500) | CME | S&P 500 index | $50 × index | 0.25 | $12.50 |
| NQ (E-mini Nasdaq-100) | CME | Nasdaq-100 index | $20 × index | 0.25 | $5.00 |
| RTY (E-mini Russell 2000) | CME | Russell 2000 index | $50 × index | 0.10 | $5.00 |
| YM (E-mini Dow) | CBOT (IB `exchange="CBOT"`, not CME) | Dow Jones Industrial | $5 × index | 1.00 | $5.00 |
| CL (WTI Crude Oil) | NYMEX | 1,000 barrels WTI | 1,000 | 0.01 ($/bbl) | $10.00 |
| NG (Henry Hub Natural Gas) | NYMEX | 10,000 mmBtu | 10,000 | 0.001 ($/mmBtu) | $10.00 |

Notes for the table:
- **YM's IB `exchange` field is `CBOT`, not `CME`** — CME Group owns CBOT but IB's contract routing
  still uses the historical exchange code. Verify this exact string against a live `reqContractDetails`
  call before hardcoding (UNVERIFIED from this pass's primary sources — flagged, not CME/AMP-page
  confirmed for the IB-specific exchange string, only the economic-exchange grouping is confirmed).
- **Nautilus does not need Fable to hardcode multiplier/tick** for correctness — `parse_futures_contract`
  in `nautilus_trader/adapters/interactive_brokers/parsing/instruments.py` builds the nautilus
  `Instrument` directly from IB's own `contract_details.minTick` and
  `contract_details.contract.multiplier` returned live by `reqContractDetails` (source lines: `price_increment=Price(contract_details.minTick, ...)`, `multiplier=Quantity.from_str(contract_details.contract.multiplier)`). The table above is for Fable's OWN pre-flight validation / GEX-multiplier math / sanity-checking the live pull, not a hand-typed instrument registry nautilus depends on.
- Micro variants exist for all six (MES, MNQ, M2K, MYM, MCL, MNG) at 1/10 size if Fable wants
  lower-capital paper-testing increments — not in table above, out of scope unless requested.

---

## 4. Options (SPX / SPY) — IB representation + OPRA chain pull

**How IB represents them:**
- **SPX** (cash-settled index option): `secType="IND"`/`OPT` on the underlying index `^SPX`, exchange
  `CBOE` (or `SMART`-routed with `symbol_to_mic_venue={"SPX": "XCBO"}` override per the adapter's MIC
  mapping — see `docs/integrations/ib.md` "Symbol-prefix to MIC venue overrides" section, explicitly
  gives `"SPX": "XCBO"` as the canonical example).
- **SPY** (ETF option, physically-settled-in-shares): `secType="OPT"` on the underlying `STK` `SPY`,
  `exchange="SMART"`, `primaryExchange="ARCA"` (verbatim from nautilus's own dockerized-gateway example:
  `IBContract(secType="STK", symbol="SPY", exchange="SMART", primaryExchange="ARCA", build_options_chain=True, min_expiry_days=7, max_expiry_days=14)`).
- **Requesting the chain:** set `build_options_chain=True` on the underlying's `IBContract`
  (`min_expiry_days`/`max_expiry_days` filter which expiries get pulled — omit and nautilus/IB will
  attempt the full chain, which for SPX/SPY is large; always bound this in a paper-dev loop to avoid a
  slow/rate-limited pull). IB's own contract-search backend does the chain expansion server-side; nautilus
  just issues the `reqSecDefOptParams`-equivalent call via `ibapi` and receives back the full set of
  strikes/expiries as contract-detail rows, which the adapter's `parse_option_contract` /
  `parse_option_contract` for FOPs (see `parsing/instruments.py` — separate parse functions for equity
  options vs futures-options, both driven by IB's own `contract_details.minTick`/`.multiplier`) converts
  to nautilus `OptionContract` instruments.
- Standard equity-option multiplier is 100 (shares/contract) — the adapter defaults to `"100"` if IB's
  own `contract.multiplier` field is empty (`parsing/instruments.py:714`:
  `multiplier = Quantity.from_str(contract_details.contract.multiplier or "100")`).

**OPRA chain via Databento (the recommended data path over IB's own live option-chain feed for volume
reasons — IB's per-strike market-data-line entitlement costs add up fast across a full SPX chain;
Databento's flat-rate OPRA subscription does not):**

- Dataset ID: **`OPRA.PILLAR`** (CONFIRMED, `docs/integrations/databento.md` +
  `databento.com/datasets/OPRA.PILLAR`) — consolidated trades + NBBO across all 17 US options
  exchanges.
- Two schemas carry the chain:
  - **`definition`** — static per-contract reference data: strike, expiry, right (call/put), the
    underlying, OSI-style symbol, `instrument_id`. Pull once (or on a slow refresh cadence) to build
    the chain's instrument universe.
  - **`trades`** / **`mbp-1`** (NBBO quotes, i.e. best-bid/best-offer for the IV solve's mid-mark) —
    the live/streaming leg. `mbp-1` gives `(QuoteTick, TradeTick|None)` per nautilus's schema table;
    use the quote mid `(bid+ask)/2` as the option's mark for the Newton solve in §5, since single-trade
    prints are noisy and often stale relative to the NBBO on illiquid strikes.
- **OPRA expiration correction gotcha (CONFIRMED, load-bearing):** OPRA option definitions carry
  expiration with date-level precision (`time-of-day zeroed to midnight UTC`), which for SPX
  specifically is corrected by nautilus to `09:30` local (vs the general default `16:00`) — per
  `docs/integrations/databento.md`: *"OPRA.PILLAR": {"default": "16:00", "SPX": "09:30"}*. This
  matters for exact time-to-expiry (`T` in Black-Scholes) — get this wrong and near-0DTE IV solves
  blow up. Nautilus's DBN loader applies this correction automatically; if Fable ever parses raw DBN
  OPRA definitions without going through the nautilus loader, replicate this correction manually.
- **`GLBX.MDP3`** (the CME futures dataset) does **NOT** carry OPRA — it's a separate dataset for
  futures/options-on-futures (CME/CBOT/NYMEX/COMEX). Options-on-futures (e.g. ES options) come from
  `GLBX.MDP3`, not `OPRA.PILLAR`. `OPRA.PILLAR` is equity/index (SPX/SPY) options only. Do not
  conflate the two when wiring the data-client config's dataset routing.

**Databento does NOT provide greeks (CONFIRMED, two independent sources):**
- Databento's own product-roadmap has an open, unfulfilled feature request: *"get options greek
  data"* (`roadmap.databento.com/b/n0o5prm6/feature-ideas/get-options-greek-data`) — i.e. it does not
  exist as a shipped feature as of this research pass.
- Databento's own blog (`databento.com/blog/option-greeks`, "Computing the option Greeks using Pathway
  and Databento") explicitly walks through calculating greeks FROM RAW `definition` + quote data
  externally — confirming the feed gives you the ingredients (strike, expiry, right, underlying,
  live NBBO) but not the derived greeks themselves. Rationale stated in the post: providers overlook
  firm-specific effects (early exercise, dividends), so serious desks compute their own anyway.
- **Conclusion for Fable: IV and all downstream greeks (delta, gamma for GEX) MUST be computed
  in-house** — this is not a Databento gap to work around later, it is the expected/standard path per
  Databento's own guidance. See §5.

---

## 5. IV / Greeks Model — the pragmatic build path

**Recommended approach: hand-roll Black-Scholes + a bisection/Newton IV solve.** Reasoning:
- **`vollib`/`py_vollib`** (MIT license, CONFIRMED via GitHub + `vollib.org`): actively maintained,
  the package was renamed from `py_vollib` to `vollib` at v1.0.7 (old `py_vollib` name still works as a
  deprecated compatibility shim). Built on Peter Jaeckel's "Let's Be Rational" algorithm — a
  closed-form-accurate (not iterative-Newton) implied-vol solver, meaning it's numerically more robust
  near-the-money and at very short DTE than a naive Newton solve that can fail to converge on flat
  vega. **Recommended if Fable wants a dependency** — MIT is permissive, actively maintained, fast
  (especially with the optional Numba-accelerated vectorized fork mentioned in the same ecosystem).
- **`mibian`**: GPLv3-licensed (per the community `MibianLib` fork) and less actively maintained —
  **flag: GPLv3 is copyleft; do NOT bundle/link it into a proprietary Fable build without checking
  Marcel's licensing posture for the trading stack** (nautilus itself is LGPL v3 — dynamic-linking-safe;
  GPLv3 mibian is a stricter, different license class). Prefer `vollib`/`py_vollib` (MIT) over
  `mibian` for this reason alone, independent of maintenance status.
- **Hand-rolled BS + bisection** is a legitimate ~50-100 line alternative if Fable wants zero
  third-party option-math dependencies — the formulas are below. Newton-Raphson is faster to converge
  than bisection but can diverge/oscillate near-the-money at very low vega (long-dated OTM, or exactly
  ATM at short DTE); a hybrid (Newton with a bisection fallback on non-convergence, or just start with
  vollib's Jaeckel-based solver which sidesteps the convergence issue entirely) is the robust choice.
  **Given the license/robustness tradeoff, default recommendation: use `vollib` (MIT) rather than
  reinvent the IV solver** — reserve hand-rolled BS for the GAMMA formula itself (trivial, closed-form,
  no solve required) even if IV comes from vollib.

**Black-Scholes IV solve — the mid-mark → per-strike gamma path (self-contained, for hand-rolled path
or to sanity-check vollib's output):**

Given: option mid-mark price `V_mkt = (bid+ask)/2` (from Databento `mbp-1` NBBO), spot `S`, strike `K`,
time-to-expiry `T` (years, correcting expiry-time per the SPX 09:30 rule above), risk-free rate `r`
(use SOFR or a short T-bill proxy), and (for equities, negligible for cash-settled SPX/index intraday)
dividend yield `q`:

```
d1 = [ln(S/K) + (r - q + 0.5*sigma^2)*T] / (sigma*sqrt(T))
d2 = d1 - sigma*sqrt(T)

Call price:  C = S*exp(-q*T)*N(d1) - K*exp(-r*T)*N(d2)
Put price:   P = K*exp(-r*T)*N(-d2) - S*exp(-q*T)*N(-d1)
```

**IV solve (Newton's method on sigma, or substitute vollib's `implied_volatility()` call):**
```
f(sigma)  = BS_price(sigma) - V_mkt         # root-find this
f'(sigma) = vega(sigma) = S*exp(-q*T)*phi(d1)*sqrt(T)   # phi = standard normal PDF

sigma_{n+1} = sigma_n - f(sigma_n) / f'(sigma_n)
```
Seed `sigma_0` at a reasonable prior (e.g. 0.20, or the previous solved IV for the adjacent strike —
"IV surface warm-start" reduces iteration count materially). Fall back to bisection (bracket
`[0.001, 5.0]`) if Newton fails to converge within ~50 iterations or vega is near-zero (deep OTM /
near-expiry — exactly where Newton is fragile and where Jaeckel's rational approximation in
vollib is the more robust choice).

**Gamma formula (the GEX-critical greek — no solve needed once IV is known, same for calls and puts):**
```
gamma = phi(d1) / (S * sigma * sqrt(T))

where phi(d1) = (1/sqrt(2*pi)) * exp(-d1^2/2)   # standard normal PDF
```

**GEX build (already captured in the sibling pivot doc, restated here for the direct pipeline
handoff):**
```
GEX = sum over all strikes/expiries of:  gamma_k * OI_k * multiplier * S^2 * 0.01 * sign_k
```
where `multiplier=100` for SPX/SPY, `sign_k = +1` for calls / `-1` for puts (naive dealer-sign
convention — an approximation, not signed trade-flow; see residual-risk note in the sibling pivot doc).
`OI_k` (open interest) comes from Databento's `statistics` schema (not `definition`, not OHLCV bars —
per `docs/integrations/databento.md`: *"Official settlement prices and open interest come from the
`statistics` schema, not OHLCV bars"*).

**Pipeline, end to end:** `OPRA.PILLAR definition` (strikes/expiries/rights, static) + `OPRA.PILLAR
mbp-1` (live NBBO mid-marks) → per-strike Newton/vollib IV solve → BS gamma formula → × OI (from
`statistics` schema) × multiplier × spot² × sign → sum = GEX curve. Every stage above is now traced to
a primary or near-primary source; the ONLY genuinely unverified numeric claims are flagged inline
(YM's IB exchange string, CME.com direct tick-size fetch, and the paper-account REALTIME-without-
subscription fallback behavior).

---

## UNVERIFIED flags (honest, per this lane's scrape)

- YM's exact IB `exchange` field string (`CBOT` assumed from economic/CME-Group-ownership grouping,
  not confirmed via a live `reqContractDetails` call or an IB-specific doc excerpt in this pass).
- Exact CME.com-primary tick-size/multiplier figures for ES/NQ/RTY/YM/CL/NG — WebFetch timed out on
  the JS-rendered `cmegroup.com` product-spec pages; the table in §3 is corroborated across 3
  independent broker/aggregator sources (AMP Futures, Ironbeam, QuantVPS) that agree with each other,
  but Fable should do one direct `cmegroup.com` spot-check (or a live IB `reqContractDetails` pull,
  which is authoritative regardless) before hardcoding these into risk-sizing code.
- Exact behavior when requesting `market_data_type=REALTIME` on an IBKR paper account without a live
  market-data subscription (hard error vs silent fallback to delayed) — not confirmed from a primary
  IBKR doc; test directly against the paper account.
- `TWS_USERID`-vs-`TWS_USERNAME` env-var precedence when BOTH the nautilus-managed path and a
  manually-run compose container could theoretically be present simultaneously — not a realistic
  Fable deployment shape (pick one management path), flagged for completeness only.
