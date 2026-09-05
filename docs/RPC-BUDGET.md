# RPC Budget

RPC_BUDGET_REVISION: 4bd114d92428b7cc8f0e7f88e95b99e9389c5b18
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
MULTI_CLIENT_JUSTIFICATION: one shared account-free client performs contract reads and GenLayer transaction-status queries; one short-lived provider-bound client is required for each explicitly authorized wallet write

| Screen/workflow | Request source | RPC method | Trigger | Cache / dedupe | Polling / retry | Planned maximum | Transactions | Terminal condition |
|---|---|---|---|---|---|---:|---:|---|
| Reload recovery | saved pending hash | GenLayer transaction status, then method-specific reads | page load | reads bypass stale cache; shared in-flight dedupe | one attempt | 4 calls | 0 | finality + semantic execution + readback, confirmed failure, or reconciliation required |
| Continue verification | saved pending hash | GenLayer transaction status, then method-specific reads | explicit button | same | one attempt per click | 4 calls | 0 | same; never resubmits |
| Active write | wallet intent | write, bounded GenLayer transaction polling, readback | explicit action | single-flight lock | 2.5–10 s, 10-minute deadline | bounded by deadline | 1 | GenLayer FINALIZED + semantic execution success + readback, failure, or timeout |
| Recovered refresh | successful recovery | registry/detail reads | verified success | invalidate once, then shared cache/dedupe | no retry loop | existing screen budget | 0 | refreshed contract state displayed |
| Deliberate retry | confirmed failed entry | normal active write path | user clears failure and retries | failed entry no longer blocks | same active-write budget | bounded by deadline | 1 | one new terminal transaction |

## FRONTEND RPC BUDGET EVIDENCE

FRONTEND_EVIDENCE_STATUS: COMPLETE

Exact-release Chrome E2E used production deployment `dpl_EP7YeHtpmxU36xee33KdTCrqhbvr`. Create hash `0xd087ee514811a72afac612e919dc89a1f0da466ac1d7bef2ecdafb6e1fb01a2e` remained in `RECONCILIATION_REQUIRED` while semantic receipt data was incomplete, with no component-level failure banner and no duplicate write. `Continue verification` reused that hash after `FINALIZED`, `MAJORITY_AGREE`, and successful leader execution, then bounded authoritative reads opened `trg-0012` in `DRAFT`. Freeze hash `0x4d70ea57231c6c4d207bb45fda4b6e071dd2b4b12790b534d823d460000e28b5` followed the same recovery path. After finality and authoritative readback, the already-open detail panel refreshed immediately to `FROZEN` and removed the Freeze control. A clean reload started disconnected with no pending stage and showed exactly one `trg-0012` among twelve registry rows. Raw bounded GenLayer status queries remain outside the displayed read counter.

## Closure

- One shared read/GenLayer-status client; provider-bound clients exist only for writes.
- Polling is bounded and pauses while the document is hidden.
- `429` read retries are bounded; active transaction polling never submits again.
- A returned transaction hash survives timeout/reload and remains locked until verified success or confirmed failure.
- `SUCCESS` requires finality, execution success, and method-specific authoritative readback.
