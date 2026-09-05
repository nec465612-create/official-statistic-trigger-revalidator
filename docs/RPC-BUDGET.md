# RPC Budget

RPC_BUDGET_REVISION: e6d55f5f0ed6f3ac8723551b80ff3b7d312d67bf
OFFICIAL_DOCS_CHECKED: https://docs.genlayer.com/developers/decentralized-applications/querying-a-transaction and https://docs.genlayer.com/developers/decentralized-applications/writing-data (2026-09-05)
STUDIO_SCOPE: NOT_APPLICABLE: this remediation changes only frontend recovery; contract source, address, deployment, and Studio state are unchanged
FRONTEND_SCOPE: APPLICABLE

## STUDIO RPC BUDGET MATRIX

STUDIO_MATRIX_STATUS: NOT_APPLICABLE

No Studio transaction or probe is required for this frontend-only correction. Existing deployment evidence remains in `VERIFICATION.md`.

## STUDIO RPC BUDGET EVIDENCE

STUDIO_EVIDENCE_STATUS: NOT_APPLICABLE

No Studio RPC request or transaction is attributed to this remediation.

## FRONTEND RPC BUDGET MATRIX

FRONTEND_MATRIX_STATUS: COMPLETE
MULTI_CLIENT_JUSTIFICATION: one shared account-free client performs reads/receipts; one short-lived provider-bound client is required for each explicitly authorized wallet write

| Screen/workflow | Request source | RPC method | Trigger | Cache / dedupe | Polling / retry | Planned maximum | Transactions | Terminal condition |
|---|---|---|---|---|---|---:|---:|---|
| Reload recovery | saved pending hash | receipt, then method-specific read | page load | reads bypass stale cache; shared in-flight dedupe | one attempt | 4 calls | 0 | success, confirmed failure, or reconciliation required |
| Continue verification | saved pending hash | receipt, then method-specific read | explicit button | same | one attempt per click | 4 calls | 0 | same; never resubmits |
| Active write | wallet intent | write, bounded receipt polling, readback | explicit action | single-flight lock | 2.5–10 s, 10-minute deadline | bounded by deadline | 1 | finality + execution + readback, failure, or timeout |
| Recovered refresh | successful recovery | registry/detail reads | verified success | invalidate once, then shared cache/dedupe | no retry loop | existing screen budget | 0 | refreshed contract state displayed |
| Deliberate retry | confirmed failed entry | normal active write path | user clears failure and retries | failed entry no longer blocks | same active-write budget | bounded by deadline | 1 | one new terminal transaction |

## FRONTEND RPC BUDGET EVIDENCE

FRONTEND_EVIDENCE_STATUS: COMPLETE

Exact-release Chrome E2E used production deployment `dpl_25FBnJZzDxqQ8xmRi36kUYvVYMqW` and saved transaction `0x42930b867f3fa4099260ba69727fb85ba4a3910b764de77e7764ab06833e04d1`. The initial write produced `trg-0003` and then surfaced `RECONCILIATION_REQUIRED`; repeated verification retained the same hash and produced zero additional writes. On reload of application revision `e6d55f5f0ed6f3ac8723551b80ff3b7d312d67bf`, recovery completed without reconnecting the wallet: one receipt plus `get_trigger_count`, `get_triggers_page`, and `get_trigger` proved the saved nonce/owner and exact `DRAFT` state. The concurrently loaded registry added its normal two reads, so the UI counter displayed `Calls: 5` (receipt calls are not included in that client-read counter); total page-load RPC traffic was six requests and zero transactions. The final UI displayed `[SUCCESS]`, the registry contained exactly three triggers, and `trg-0003` was `CUUR0000SA0`, `M06 2024`, threshold `314.175`, state `DRAFT`, vintage count `0`.

## Closure

- One shared read/receipt client; provider-bound clients exist only for writes.
- Polling is bounded and pauses while the document is hidden.
- `429` read retries are bounded; active transaction polling never submits again.
- A returned transaction hash survives timeout/reload and remains locked until verified success or confirmed failure.
- `SUCCESS` requires finality, execution success, and method-specific authoritative readback.
