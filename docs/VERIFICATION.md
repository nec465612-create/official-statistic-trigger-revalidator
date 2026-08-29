# Official Statistic Trigger Revalidator — Studionet Verification

Current checkpoint: `POST_DEPLOY_TEST`. This document is the consolidated reviewer-facing record for the deployed revision and its live Studionet matrix.

## Locked revision and deployment

- Deployed contract: `0x96B2F4DFB02B4727401fBb1CFF18f3Ed98CBFdee`
- Explorer: https://explorer-studio.genlayer.com/address/0x96B2F4DFB02B4727401fBb1CFF18f3Ed98CBFdee
- Network: GenLayer Studionet, chain `61999`, RPC `https://studio.genlayer.com/api`
- Deployed source commit: `abdcc2036115e7c0ff7713830ae596b658616998`
- Deployed contract source SHA-256: `83D140EEF1702A0553EFF8F8422E25649CDBA0357623FD616BC18DB9BFEEC3FD`
- Locked deployer/upgrader: `0x34b92E6553eaCA11A00A9d86d75d8a7881779D78`
- `get_upgrader([])` readback: `0x34b92e6553eaca11a00a9d86d75d8a7881779d78`
- Deployment transaction: `0x431444bb4b10236ef8b71c887a4eeaa57efe33b981f71589f432ea893861b596` (`FINALIZED`, `MAJORITY_AGREE`)
- Deployment source parity: transaction data decodes to 48,571 bytes and the SHA-256 above.

## Local verification

- `genvm-lint`: pass
- Contract tests: `39 passed` (live BLS test separately `1 passed` with `RUN_LIVE_TESTS=1`)
- Frontend Vitest: `30 passed`
- Frontend `tsc --noEmit`: pass
- Frontend production Vite build: pass

## Live Studionet transaction matrix

All rows below were checked for receipt finality, GenVM/semantic result, sender, and authoritative readback. `FINALIZED` alone is not treated as success.

| Path | Sender | Transaction | Result | Readback / consequence |
|---|---|---|---|---|
| Deploy | locked owner | [0x431444…861b596](https://explorer-studio.genlayer.com/tx/0x431444bb4b10236ef8b71c887a4eeaa57efe33b981f71589f432ea893861b596) | `FINALIZED`, `MAJORITY_AGREE` | Main address and source parity verified |
| Create `trg-0001` | locked owner | [0xce1e9f…b34e2ed](https://explorer-studio.genlayer.com/tx/0xce1e9fcef1d10e625569f71b5705d61bbdfd868e3c506d362e34a03cbb34e2ed) | `FINALIZED`, `MAJORITY_AGREE` | `trg-0001`, `DRAFT`, scaled threshold `313175` |
| Freeze `trg-0001` | locked owner | [0xeb67e8…33e1f](https://explorer-studio.genlayer.com/tx/0xeb67e8dc404127938c60a5e32878ee9495bf1b77d4d2f40fdd6ab3ee53f33e1f) | `FINALIZED`, `SUCCESS` | `FROZEN` |
| Malformed observe attempt | bystander `0x22A290…F22FB1` | [0x20c7e6…55cd0](https://explorer-studio.genlayer.com/tx/0x20c7e64d434154c1ce6bb78b6a5a12a9c9d5447ebe97ca33620547994e855cd0) | `FINALIZED`, `ERROR` | `Trigger not found`; no state change |
| `observe_initial` | bystander `0x22A290…F22FB1` | [0x49f752…494c863](https://explorer-studio.genlayer.com/tx/0x49f7527c07c7861fc3338703047f4c34696617cd45afc251b6a4fd299494c863) | `FINALIZED`, `MAJORITY_AGREE`, leader `SUCCESS` | `CONFIRMED_ACTIVE`, vintage `0`, BLS value `313.175` / scaled `313175` |
| `revalidate_trigger` | bystander `0x22A290…F22FB1` | [0x1ae59e…bad91f5](https://explorer-studio.genlayer.com/tx/0x1ae59e32084ee31f4d0a2b7565936c0ae8fcf0b06364efd911947deefbad91f5) | `FINALIZED`, `MAJORITY_AGREE`; semantic `UNRESOLVED` | BLS `REQUEST_NOT_PROCESSED`; `HOLD`, vintage `1` |
| HOLD retry | bystander `0x22A290…F22FB1` | [0x410a99…cb6504](https://explorer-studio.genlayer.com/tx/0x410a99551d9031a8363cf4f671f3f82dc4839d445d374056c06f8d5bd2cb6504) | `FINALIZED`, `SUCCESS`; semantic `UNRESOLVED` | BLS still unavailable; `HOLD`, vintage `2`; prior successful vintage preserved, no false revision |
| Bind consumer (first) | bystander `0x22A290…F22FB1` | [0x0ce850…8954e1](https://explorer-studio.genlayer.com/tx/0x0ce85041f842529111e1635480141eaafa61fdbec742eb7bcced58d1858954e1) | `FINALIZED`, `SUCCESS` | Binding persisted |
| Bind consumer (duplicate idempotent attempt) | bystander `0x22A290…F22FB1` | [0xbe22ab…5655fa](https://explorer-studio.genlayer.com/tx/0xbe22ab7937552edd1656c5ad75246f78d438ee14e284850f2a224123875655fa) | `FINALIZED`, `SUCCESS` | `get_consumer_binding(bystander, benefit-sim-studio) = trg-0001`; duplicate recorded, not hidden |
| Unauthorized close | bystander `0x22A290…F22FB1` | [0xbc21d8…36f2d0](https://explorer-studio.genlayer.com/tx/0xbc21d86928c13607b8a73eb2fd77fb7bc49dc11c9ae439011a0355b75736f2d0) | `FINALIZED`, `ERROR` | `Only the trigger owner may close`; state protected |
| Authorized close | locked owner | [0xf20df0…d96c4ee](https://explorer-studio.genlayer.com/tx/0xf20df093cc98c53a2d4781a34c04f17354e3a8009566a4d78bd88f2d8d96c4ee) | `FINALIZED`, `SUCCESS` | `trg-0001` readback `CLOSED`; canonical key released |
| Create after close (`trg-0002`) | locked owner | [0xde91e4…b253044](https://explorer-studio.genlayer.com/tx/0xde91e481014f6751e3861af034b75925c472701e6d7418af5781635ddb253044) | `FINALIZED`, `SUCCESS` | Same canonical key recreated; count readback `2` |
| Same nonce replay | locked owner | [0x229fa2…3f0fef](https://explorer-studio.genlayer.com/tx/0x229fa2d3f7f757af7e0774ab5471ac8ee33f760c69678d7de280489fe03f0fef) | `FINALIZED`, `ERROR` | Replay rejected; count remained `2`; `trg-0002` unchanged |

The live BLS endpoint returned `REQUEST_NOT_PROCESSED` during revalidation and retry. The contract therefore failed closed to `HOLD`; this is an observed safe outcome, not a claimed successful recovery. Local regression coverage verifies backward lookback to the prior successful comparable vintage when the source becomes available again.

## Disposable upgrade rehearsal

The main deployment was not upgraded. A separate disposable instance was used because the public contract is classified `UPGRADABLE`:

- Disposable address: `0x75a8764821EAfFF5ce68b0f141B2562A415e5ca6`
- Deploy transaction: [0x62117c…e5430f](https://explorer-studio.genlayer.com/tx/0x62117c1e42d5b7eb8fb6ba66e5b0d56a59d2acd4f274ebb10100e24c69e5430f) (`FINALIZED`, constructor `SUCCESS`)
- No-op upgrade transaction: [0x08ee86…72fdc9](https://explorer-studio.genlayer.com/tx/0x08ee867fe9a139805ffe727d93c8d1d0cea9f5bddb0e0d85c18a22b0f472fdc9) (`FINALIZED`)
- Disposable `get_upgrader([])` readback: locked owner address
- Upgrade payload: exact deployed source; main source hash remains unchanged.

## Frontend acceptance scope

The production frontend is configured for the deployed main address through `VITE_CONTRACT_ADDRESS`, uses dedicated Studionet write clients, supports MetaMask/OKX/Rabby via EIP-6963, and does not depend on a Studio wallet. The browser E2E acceptance step must be run by the user on the exact Vercel release after GitHub/Vercel publication.

## Security and invariants verified

- Exact 17-method ABI parity between contract and frontend.
- Decimal fixed-scale arithmetic and strict M01–M12 period validation.
- Bounded catalog/footnote metadata and bounded response handling.
- Receipt classification distinguishes non-terminal, finalized success/failure, and terminal ambiguous outcomes.
- Unauthorized close rejected; authorized close releases canonical key.
- Nonce replay rejected without increasing trigger count.
- Permissionless bystander observation and binding work on Studionet.
- Evidence failure fails closed to `HOLD` and preserves the prior successful vintage.
- Wallet provider routing, listener cleanup, focus trap, and intent journaling are covered by frontend tests.
