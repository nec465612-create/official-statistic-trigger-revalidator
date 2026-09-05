# Official Statistic Trigger Revalidator

GenLayer `PROJECT` submission. Judge-remediation application revision: `c0bc4e85adfe0017b2fbd6f2d0c906850efae43a`; the evidence-only release commit is identified by its exact GitHub link in the final review package.

An **Intelligent Contract** on the GenLayer blockchain that automates on-chain policy and benefit simulation triggers tied to official statistics published by the **U.S. Bureau of Labor Statistics (BLS)**.

The contract autonomously fetches, parses, cryptographically fingerprints, validates metadata comparability using validator LLM consensus, and deterministically evaluates policy trigger conditions across historical preliminary releases and subsequent data revisions.

---

## Key Features

1. **Strict Series Allowlist:**
   - `CUSR0000SA0`: Consumer Price Index for All Urban Consumers (CPI-U), All Items, U.S. City Average, **Seasonally Adjusted**.
   - `CUUR0000SA0`: Consumer Price Index for All Urban Consumers (CPI-U), All Items, U.S. City Average, **Not Seasonally Adjusted**.

2. **Fixed-Scale Integer Decimal Arithmetic (`SCALE = 1000`):**
   - Eliminates floating-point non-determinism across validators by normalizing all decimal statistics (e.g. `314.069` $\rightarrow$ `314069`).
   - Strict format validation rejecting exponents, ambiguous signs, whitespace, or precision exceeding 3 decimal places.

3. **Dual-Phase Non-Deterministic Consensus & Evidence Bounding:**
   - **Phase 1 (Data Acquisition):** Leader queries the official BLS API v2 endpoint (`api.bls.gov`).
   - **Phase 2 (Validator Consensus):** Validators independently refetch the anonymous BLS JSON API for the exact value and the public BLS series-report page for secret-free authoritative metadata. They verify response identity, extract the single target period, deterministically select bounded snippets around six required metadata labels from a response capped at 128 KB, and pass at most 6 KB to metadata-only LLM consensus. Missing, unavailable, oversized, mismatched, or malformed metadata becomes `UNKNOWN/HOLD`; it never defaults to `COMPARABLE`.

4. **Deterministic Trigger Lifecycle & 30-Day TTL:**
   - Complete state machine: `DRAFT` $\rightarrow$ `FROZEN` $\rightarrow$ `PROVISIONAL` $\rightarrow$ `CONFIRMED_ACTIVE` / `CONFIRMED_INACTIVE` / `RECONFIRMED` / `RECONFIRMED_INACTIVE` / `REVERSED_BY_REVISION` / `ACTIVATED_BY_REVISION` / `HOLD` / `CLOSED`.
   - Any observation older than 30 days transitions the effective state to `STALE`, setting downstream consequence to `FALSE` until revalidated.

5. **Bounded Immutable Vintage Ledger & Prior Successful Lookback:**
   - Stores up to 5 immutable vintages per trigger, capturing raw value, scaled integer value, BLS footnotes, SHA-256 evidence hash, comparability status, and LLM reasoning.
   - Outage/HOLD recovery searches backwards for the latest prior successful comparable vintage to evaluate revisions without false triggers.

6. **Downstream Namespace Consumer Binding Registry:**
   - Enables downstream policy simulation contracts and namespace consumers to bind subscriptions via `bind_consumer(namespace, trigger_id)` and query authoritative effective trigger state via `get_effective_trigger_state(trigger_id)`.

7. **Production Web3 Frontend:**
   - Built with React 19, TypeScript, and Vite.
   - Supports 5 user journeys (Public Reader, Policy Owner, Permissionless Refresher, Downstream Consumer, Auditor).
   - EIP-6963 multi-wallet discovery gated strictly to MetaMask, OKX Wallet, and Rabby.
   - Single-flight write queue with dedicated provider routing, fail-closed localStorage journaling, persistent transaction hash, bounded finality checks, manual `Continue verification`, authoritative method-specific readback, and deliberate retry only after confirmed failure.
   - RPC Budget Manager with 10-second caching, in-flight request deduplication, and exponential backoff on HTTP 429 rate limits.

---

## Contract ABI Specification (17 Methods)

| Method | Type | Parameters | Return Type | Description |
|---|---|---|---|---|
| `create_trigger` | Write | `client_nonce: str, series: str, year: str, period: str, operator: str, threshold_decimal: str` | `str` (Trigger ID) | Creates a new trigger in `DRAFT` state with client nonce deduplication. |
| `freeze_trigger` | Write | `trigger_id: str` | `str` ("FROZEN") | Locks trigger specification for observation (owner only). |
| `observe_initial` | Write | `trigger_id: str` | `str` (Outcome) | Performs initial BLS observation on a FROZEN/PROVISIONAL trigger. |
| `revalidate_trigger` | Write | `trigger_id: str` | `str` (Outcome) | Re-observes BLS series to evaluate revisions and update lifecycle. |
| `close_trigger` | Write | `trigger_id: str` | `str` ("CLOSED") | Permanently closes trigger and releases canonical key (owner only). |
| `bind_consumer` | Write | `namespace: str, trigger_id: str` | `str` (Binding Key) | Binds caller address + namespace to a target trigger ID. |
| `get_trigger_count` | View | None | `u32` | Returns total number of registered triggers (max 64). |
| `get_trigger` | View | `trigger_id: str` | `str` (JSON) | Returns trigger specification and state. |
| `get_triggers_page` | View | `offset: u32, limit: u32` | `str` (JSON Array) | Returns paginated list of triggers (max 20 per page). |
| `get_vintage_count` | View | `trigger_id: str` | `u32` | Returns number of vintages recorded for trigger (0–5). |
| `get_vintage` | View | `trigger_id: str, index: u32` | `str` (JSON) | Returns specific vintage record by index. |
| `get_vintages_page` | View | `trigger_id: str, offset: u32, limit: u32` | `str` (JSON Array) | Returns paginated vintage records for trigger. |
| `get_effective_trigger_state`| View | `trigger_id: str` | `str` (JSON) | Evaluates effective trigger state and boolean active status with 30d TTL. |
| `get_consumer_binding` | View | `consumer_address: str, namespace: str` | `str` (Trigger ID) | Queries trigger ID bound to consumer address and namespace. |
| `get_owner_nonce_trigger` | View | `owner_address: str, client_nonce: str` | `str` (Trigger ID) | Queries trigger ID associated with owner address and client nonce. |
| `get_upgrader` | View | None | `Address` | Returns address authorized to upgrade the contract. |
| `upgrade` | Write | `new_code: bytes` | `None` | Replaces contract code in storage (upgrader only). |

---

## Contract State Machine

| State | Description | Downstream Consequence |
|---|---|---|
| `DRAFT` | Initial mutable configuration state | `FALSE` |
| `FROZEN` | Specification locked; ready for validator observation | `FALSE` |
| `PROVISIONAL` | Preliminary observation recorded; awaiting confirmation/revision | Condition-dependent (`TRUE` if threshold met) |
| `CONFIRMED_ACTIVE` | Observed value meets threshold condition ($\ge$ or $\le$) | `TRUE` |
| `CONFIRMED_INACTIVE` | Observed value does not meet threshold condition | `FALSE` |
| `RECONFIRMED` | Revised or repeated observation remains active | `TRUE` |
| `RECONFIRMED_INACTIVE`| Revised or repeated observation remains inactive | `FALSE` |
| `REVERSED_BY_REVISION` | Subsequent BLS revision dropped value below active threshold | `FALSE` |
| `ACTIVATED_BY_REVISION`| Subsequent BLS revision pushed value above active threshold | `TRUE` |
| `HOLD` | BLS altered series definition or returned unresolvable metadata | `FALSE` |
| `STALE` | Derived state when observation is $> 30$ days old | `FALSE` |
| `CLOSED` | Policy trigger permanently terminated by owner | `FALSE` |

---

## Local Development & Testing

### 1. Python Environment & Contract Tests

```bash
# Activate virtual environment
source .venv/bin/activate  # or .venv\Scripts\activate on Windows

# Run contract linting
PYTHONUTF8=1 genvm-lint check contracts/official_statistic_trigger_revalidator.py

    # Run contract deterministic test suite (41 tests)
PYTHONIOENCODING=utf-8 pytest tests/test_official_statistic_trigger_revalidator.py -v

# Run opt-in live BLS API test (requires network access)
PYTHONIOENCODING=utf-8 pytest tests/test_live_bls_read.py -m live -v
```

### 2. Frontend Development & Build

```bash
cd frontend

# Install pinned dependencies
npm install

# Run frontend test suite (45 tests)
npm test

# Verify TypeScript typechecking and production bundle build
npm run build

# Start local development server
npm run dev
```

---

## Deployment to GenLayer Studionet

1. Deploy `contracts/official_statistic_trigger_revalidator.py` to GenLayer Studionet (Chain ID `61999`) using the GenLayer Studio or CLI.
2. Note the deployed contract address (e.g. `0x...`).
3. Set the environment variable in `frontend/.env`:
   ```bash
   VITE_GENLAYER_RPC_URL=https://studio.genlayer.com/api
   VITE_GENLAYER_CHAIN_ID=61999
   VITE_CONTRACT_ADDRESS=0x<DEPLOYED_CONTRACT_ADDRESS>
   ```
4. Build and deploy the frontend:
   ```bash
   cd frontend
   npm run build
   ```

---

## Disclosures & Disclaimer

- **Simulation Only:** This project is a research prototype demonstrating automated official statistic policy revalidation. It does not provide real-world financial benefits, legal contracts, or social security payments.
- **No Economic Advice:** BLS CPI data and revalidated triggers are for testing purposes only. Do not make investment or economic decisions based on this application.
- **Official Allowlist:** Restricted strictly to official Bureau of Labor Statistics CPI series: `CUSR0000SA0` and `CUUR0000SA0`.
