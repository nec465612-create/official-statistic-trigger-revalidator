# Studionet Deployment & Verification Guide

Current checkpoint: `PRE_DEPLOY`. No deployment or contract write has been sent. The locked deployer/upgrader and recovery plan are recorded in `docs/DEPLOYMENT-MANIFEST.md`.

---

## 1. Pre-Deployment Verification

Verify that all local lints, contract test suites, and frontend builds pass with zero errors:

```bash
# 1. Verify contract syntax and storage invariants
PYTHONUTF8=1 genvm-lint check contracts/official_statistic_trigger_revalidator.py

# 2. Run the deterministic contract test suite (39 tests)
PYTHONIOENCODING=utf-8 pytest tests/test_official_statistic_trigger_revalidator.py -v

# 3. Verify frontend test suite (30 tests)
cd frontend
npm test

# 4. Verify frontend TypeScript compilation and Vite build
npm run build
```

---

## 2. Deployment to GenLayer Studionet

1. Deploy the contract located at `contracts/official_statistic_trigger_revalidator.py` to GenLayer Studionet (`https://studio.genlayer.com/api`, Chain ID `61999`) using the GenLayer Studio or CLI.
2. Record the deployed contract address:
   ```
   CONTRACT_ADDRESS = 0x...
   ```
3. Update `frontend/.env`:
   ```bash
   VITE_GENLAYER_RPC_URL=https://studio.genlayer.com/api
   VITE_GENLAYER_CHAIN_ID=61999
   VITE_CONTRACT_ADDRESS=0x<YOUR_DEPLOYED_CONTRACT_ADDRESS>
   ```

---

## 3. Initial State Verification

Verify that the newly deployed contract initializes with an empty trigger registry:

| View Method | Arguments | Expected Output |
|---|---|---|
| `get_trigger_count` | `[]` | `0` |
| `get_triggers_page` | `[0, 20]` | `"[]"` |
| `get_upgrader` | `[]` | Deployer Address |

---

## 4. End-to-End User Journey Verification

### Journey 1: Policy Owner (Trigger Creation & Freeze)

1. Connect an approved Web3 wallet (MetaMask, OKX Wallet, or Rabby) to the frontend.
2. Navigate to **Tab 2: Policy Owner**.
3. Fill in the trigger creation form:
   - **BLS Series:** `CUSR0000SA0` (CPI-U Seasonally Adjusted)
   - **Target Year:** `2024`
   - **Target Period:** `M05` (May)
   - **Comparison Operator:** `GE` ($\ge$)
   - **Threshold Value:** `314.069`
   - **Auto-Freeze:** Checked
4. Submit the transaction.
5. **Expected Outcome:**
   - Transaction stages progress: `PRE_SIGN` $\rightarrow$ `SIGNING` $\rightarrow$ `SUBMITTED` $\rightarrow$ `FINALIZING` $\rightarrow$ `READBACK` $\rightarrow$ `SUCCESS`.
   - Contract creates a new trigger with `state: "FROZEN"` and `threshold_scaled: 314069`.
   - `get_trigger_count` increments to `1`.

### Journey 2: Permissionless Refresher (Initial Observation & Consensus)

1. Navigate to **Tab 3: Permissionless Refresher**.
2. Enter `trg-0001` and click **Lookup Trigger**.
3. Verify current state is `FROZEN` with `0 / 5` vintages.
4. Click **Observe Initial Release (observe_initial)**.
5. **Expected Outcome:**
   - Validators independently fetch the BLS API endpoint `https://api.bls.gov/publicAPI/v2/timeseries/data/CUSR0000SA0?startyear=2024&endyear=2024` and public metadata report `https://data.bls.gov/timeseries/CUSR0000SA0`.
   - Validators extract the exact observation and deterministic bounded excerpts around the six required metadata labels (128 KB response cap; 6 KB excerpt cap), compute the SHA-256 evidence fingerprint, and run metadata-only comparability assessment. Missing, oversized, or invalid metadata must produce `UNKNOWN/HOLD`.
   - Trigger state transitions to `CONFIRMED_ACTIVE` (`threshold_met: true`).
   - Vintage #1 is recorded with exact raw value and evidence hash.

### Journey 3: Downstream Consumer (Subscription & Consequence Query)

1. Navigate to **Tab 4: Downstream Consumer**.
2. Under **Register Downstream Consumer Binding**:
   - **Trigger ID:** `trg-0001`
   - **Downstream Namespace:** `benefit-sim-ns-01`
   - Click **Bind Consumer (bind_consumer)**.
3. Verify binding confirmation displays `trigger_id: "trg-0001"` and active status.
4. Under **Authoritative Consequence Query**:
   - Click **Query Effective State for trg-0001**.
   - **Expected Outcome:** Consequence Status displays **ACTIVE (TRUE)** with reason confirming fresh observation and condition met (`get_effective_trigger_state`).

### Journey 4: Auditor & Forensic Timeline (Evidence Verification)

1. Navigate to **Tab 5: Auditor & Forensic**.
2. Enter `trg-0001` and click **Audit Vintage Ledger**.
3. **Expected Outcome:**
   - On-chain root and nonce invariants are displayed.
   - Vintage #1 details:
     - Raw Decimal Value: `314.069`
     - Fixed-Scale Integer: `314069`
     - SHA-256 Evidence Hash matches canonical payload fingerprint.
     - Comparability Status: `COMPARABLE`.

---

## 5. Security & Edge Case Checklist

- [x] **Arithmetic Precision:** Non-decimal or exponent values (`314e2`, `314.0695`, `abc`) are rejected by both contract and frontend validation.
- [x] **Strict Allowlist:** Non-allowlisted series (e.g. `WPU00000000`) are rejected on creation.
- [x] **Duplicate Prevention:** Re-creating an active trigger with the same series, year, period, operator, and threshold reverts with active canonical key collision.
- [x] **TTL Stale Enforcement:** Observations older than 30 days evaluate to `is_effective_active == false` and display `STALE` badge.
- [x] **Material Definition Change (HOLD):** BLS series revisions flagged with material definition changes put the trigger into `HOLD`, locking downstream consequence to `false`.
- [x] **Bounded Storage:** Attempting to record more than 5 vintages reverts with `Maximum 5 vintages reached`.
- [x] **3-Wallet Gate:** Only MetaMask, OKX Wallet, and Rabby are discovered and allowed by the EIP-6963 provider gate.
- [x] **Single-Flight Queue:** Attempting to trigger a transaction while one is in flight throws an immediate local error.
- [x] **RPC Budget Management:** 10-second client-side cache prevents excessive Studionet RPC calls and handles rate limits with exponential backoff.
- [x] **HOLD Recovery Lookback:** Revalidation after an outage or HOLD vintage compares against the latest prior successful comparable vintage without triggering false revisions.
- [x] **Canonical Key Release:** Closing a trigger frees its active canonical key in contract storage.
