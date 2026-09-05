# RPC Budget

RPC_BUDGET_REVISION: 28eb1edff5412dc076d3eed63d0e98265bfa8043
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

Exact-release Chrome E2E used production deployment `dpl_G5nm17NsT4wxzi7gi8dGiX5Q1XA1` and fresh create transaction `0x4943a59de5f247e039aa8940082ab6c97f130c8314f6e679b8eb0f7dcade60f1`. The shipped frontend queried the GenLayer transaction object until `statusName=FINALIZED`; independent readback showed `result_name=MAJORITY_AGREE` and both leader receipts had `execution_result=SUCCESS`. Only then did the UI enter authoritative readback and display `[SUCCESS]`. The shared case-insensitive helper used `get_trigger_count`, the bounded latest `get_triggers_page`, and `get_trigger`; it immediately resolved `trg-0004` for the lower-case EIP-1193 account without `RECONCILIATION_REQUIRED`, reload, or a second signature. UI read-call counter was `7` with one cache hit; GenLayer status polling is outside that contract-read counter and remained bounded by the documented 10-minute deadline. Reload showed no pending status, used zero writes, and displayed exactly four triggers including `trg-0004` as `CUUR0000SA0`, `M08 2024`, threshold `314.500`, `DRAFT`, zero vintages.

## Closure

- One shared read/GenLayer-status client; provider-bound clients exist only for writes.
- Polling is bounded and pauses while the document is hidden.
- `429` read retries are bounded; active transaction polling never submits again.
- A returned transaction hash survives timeout/reload and remains locked until verified success or confirmed failure.
- `SUCCESS` requires finality, execution success, and method-specific authoritative readback.
