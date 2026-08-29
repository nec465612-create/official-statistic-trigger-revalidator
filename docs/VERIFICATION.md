# Official Statistic Trigger Revalidator — Studionet Verification

Current checkpoint: `POST_DEPLOY_TEST` — candidate deployment and production E2E are complete; evidence reconciliation is recorded below and anonymous re-review remains required before final release approval.

## Parent baseline deployment (historical)

- Deployed contract: `0x96B2F4DFB02B4727401fBb1CFF18f3Ed98CBFdee`
- Explorer: https://explorer-studio.genlayer.com/address/0x96B2F4DFB02B4727401fBb1CFF18f3Ed98CBFdee
- Network: GenLayer Studionet, chain `61999`, RPC `https://studio.genlayer.com/api`
- Deployed source commit: `abdcc2036115e7c0ff7713830ae596b658616998`
- Deployed contract source SHA-256: `83D140EEF1702A0553EFF8F8422E25649CDBA0357623FD616BC18DB9BFEEC3FD`
- Locked deployer/upgrader: `0x34b92E6553eaCA11A00A9d86d75d8a7881779D78`
- `get_upgrader([])` readback: `0x34b92e6553eaca11a00a9d86d75d8a7881779d78`
- Deployment transaction: `0x431444bb4b10236ef8b71c887a4eeaa57efe33b981f71589f432ea893861b596` (`FINALIZED`, `MAJORITY_AGREE`)
- Deployment source parity: transaction data decodes to 48,571 bytes and the SHA-256 above.

## Candidate deployment and live gate evidence

The PRE_DEPLOY-approved candidate is source commit `218f969234afef728551dba1b6d086a579304188`, with source SHA-256 `5F1004D30D9B8348F27CEC388972A6DFF1F3C24A9A89C655926DE4DC9D75F9F6`. It was deployed as a new instance; parent deployment evidence is not reused.

- Candidate contract: `0x3440B6d69E80C00B64CBfC7DEB524fD7Ff50Fb6D`
- Explorer: https://explorer-studio.genlayer.com/address/0x3440B6d69E80C00B64CBfC7DEB524fD7Ff50Fb6D
- Deploy transaction: [0x72bec4…34b82c8](https://explorer-studio.genlayer.com/tx/0x72bec408cb8f2a8d591b554840e94f7360a66758795a6a1b75fc8fe7834b82c8) — `FINALIZED`, consensus `ACCEPTED`
- `gen_getContractCode` readback: 51,587 bytes; SHA-256 exactly `5F1004D30D9B8348F27CEC388972A6DFF1F3C24A9A89C655926DE4DC9D75F9F6`
- Candidate owner/upgrader: `0x34b92E6553eaCA11A00A9d86d75d8a7881779D78`

### Candidate live transaction matrix

| Path | Transaction | Result | Authoritative evidence |
|---|---|---|---|
| Candidate deploy | [0x72bec4…34b82c8](https://explorer-studio.genlayer.com/tx/0x72bec408cb8f2a8d591b554840e94f7360a66758795a6a1b75fc8fe7834b82c8) | `FINALIZED`, consensus `ACCEPTED` | Candidate address and exact source parity verified |
| Create `trg-0001` | [0x1f5a24…f8c361](https://explorer-studio.genlayer.com/tx/0x1f5a249886637374449cf6e1e1d95087b7eca2764da135e021fb91fb52f8c361) | `FINALIZED`, `SUCCESS` | Owner `0x34b9…79D78`; trigger count `1`; canonical key `CUSR0000SA0:2024:M07:GE:0` |
| Freeze `trg-0001` | [0x527b9f…ca562e](https://explorer-studio.genlayer.com/tx/0x527b9fe88e6a3834892ef3fe22a3ce42829d870ba08b8b76e5779136a7ca562e) | `FINALIZED`, `SUCCESS` | Precondition accepted; trigger entered `FROZEN` |
| `observe_initial` | [0x845962…4b8f038](https://explorer-studio.genlayer.com/tx/0x845962dba3da200db99276bdaa59a37f988bed295572953d0656042244b8f038) | `FINALIZED`, result `SUCCESS`, consensus reached after leader rotation | Output `UNCHANGED_ABOVE`; leader equivalence output `REQUEST_SUCCEEDED`, `COMPARABLE`, raw `313.569`, scaled `313569`; authoritative post-state `CONFIRMED_ACTIVE`, vintage count `1` |
| Unchanged `revalidate_trigger` | [0x8f9ea8…cd1417](https://explorer-studio.genlayer.com/tx/0x8f9ea8a349feb059f06ec3639ebd5f3291933648f5908f8892004e950bcd1417) | `FINALIZED`, result `SUCCESS`, consensus reached | Output `UNCHANGED_ABOVE`; leader/validator successful semantic execution; same fingerprint `6470a4cc2278c65adff0286bed2c4f7f09a6cbd50297a6ed0b064d310005b612`; authoritative post-state `CONFIRMED_ACTIVE`, latest vintage index `0`, vintage count `1` |

Pre-revalidation authoritative readback was `trg-0001.state=CONFIRMED_ACTIVE`, `latest_vintage_index=0`, `vintage_count=1`, with vintage `raw_value=313.569`, `value_scaled=313569`, `source_status=REQUEST_SUCCEEDED`, `comparability=COMPARABLE`, and the same fingerprint. Post-readback preserved those values and refreshed `latest_observed_at`, proving the unchanged branch without creating a false revision.

### Final production E2E evidence reconciliation

The earlier final-E2E note stating vintage count `2` was a point-in-time read immediately after transaction `0x004be7…253225`, before the auditor lookup was refreshed. The authoritative current state is vintage index `2`, count `3`. The complete candidate timeline is:

| Time (UTC) | Transaction | Action and authoritative state | Vintage effect |
|---|---|---|---|
| 2026-08-29 18:51:58 | [0x845962…4b8f038](https://explorer-studio.genlayer.com/tx/0x845962dba3da200db99276bdaa59a37f988bed295572953d0656042244b8f038) | Initial observation finalized with `UNCHANGED_ABOVE`; `CONFIRMED_ACTIVE`, latest index `0`, count `1`, value `313.569` | Created index `0` |
| 2026-08-29 18:55:32 | [0x8f9ea8…cd1417](https://explorer-studio.genlayer.com/tx/0x8f9ea8a349feb059f06ec3639ebd5f3291933648f5908f8892004e950bcd1417) | Owner revalidation finalized with `UNCHANGED_ABOVE`; same fingerprint; count remained `1` | No new vintage |
| 2026-08-29 19:54:39 | [0xe7444c…515dd](https://explorer-studio.genlayer.com/tx/0xe7444c6c9c1c6f7d09c4afd586c10917abcb2d009a92b3fadd9881fbe2e515dd) | OKX revalidation finalized `MAJORITY_AGREE`; pre-state index `0`/count `1`, post-state index `1`/count `2`; value remained `313.569`, outcome `UNCHANGED_ABOVE` | Created index `1`; fingerprint `2c8f334ac377ca00dc589a129ddcb209cb2a9b6f742a0b7ef22e8aac76f92c15c55` |
| 2026-08-29 19:56:17 | [0xfedd82…98c264](https://explorer-studio.genlayer.com/tx/0xfedd825af7fd1b6401dd8dd17ec6d4b036d395389d6748ef105978c85698c264) | OKX consumer binding finalized `MAJORITY_AGREE`; binding readback persisted; vintage count unchanged at `2` | No new vintage |
| 2026-08-29 20:04:27 | [0x004be7…253225](https://explorer-studio.genlayer.com/tx/0x004be7feea0479f9171f406eba0894324060be1b15fc15b125b6b71260253225) | Final-release OKX revalidation finalized `MAJORITY_AGREE`; pre-state index `1`/count `2`, post-state index `2`/count `3`; value remained `313.569`, outcome `UNCHANGED_ABOVE`, UI readback `RECONFIRMED` | Created index `2`; fingerprint `6470a4cc2278c65adff0286bed2c4f7f09a6cbd50297a6ed0b064d310005b612` |
| 2026-08-29 20:05:12 | [0x77fbd4…2ba7a7](https://explorer-studio.genlayer.com/tx/0x77fbd490d3973617e54b9a0462c0e8afc14cc94611ab735f249cc3e110da7ba7) | Final-release OKX consumer binding finalized `MAJORITY_AGREE`; direct readback `get_consumer_binding(wallet, vercel-okx-e2e-final) = trg-0001` | No new vintage |

Current authoritative readback from the exact candidate contract is `get_vintage_count(trg-0001)=3`, `latest_vintage_index=2`, `effective_state=RECONFIRMED`, `is_effective_active=true`, and latest value `313.569` / `313569`. All three vintages are comparable and above threshold; the count discrepancy was an omitted intervening revalidation, not an unrecorded revision or state loss.

## Final submission category and scorecard

Category: `PROJECT`
Validity gate: `PASS`

| Axis | Score | Evidence | Weakness/blocker |
|---|---:|---|---|
| GenLayer fit | 5/5 | Live candidate transactions use validator consensus for official BLS acquisition, metadata comparability, and trigger outcome; fallback remains consensus-critical and fail-closed. | Studionet is a test network, not production infrastructure. |
| Contract quality | 5/5 | Exact 17-method ABI, bounded evidence, fixed-scale arithmetic, lifecycle authorization, replay protection, HOLD recovery, and `41 passed, 1 skipped`; live finalized/readback matrix above. | A live revision-to-different-value branch is not claimed. |
| Engineering | 4/5 | Exact source/bytecode parity, reproducible Git history, verification manifest, `genvm-lint`, frontend tests, typecheck, build, and clean diff. | No external CI workflow is part of this submission. |
| Frontend / UX | 4/5 | Five real journeys, EIP-6963 wallet selection, dedicated write routing, fail-closed journaling, and OKX E2E on the exact Vercel release with authoritative readback. | User wallet confirmation remains required for writes. |

Overall evidence-based assessment: `18/20`; the contract, frontend, deployment, and production E2E are materially integrated and reviewer-verifiable.

Submission recommendation: `READY` after the final anonymous checkpoint is recorded.

## Reviewer-feedback closure matrix

| Reviewer request | Root cause / prior gap | Correction and closure evidence |
|---|---|---|
| Add live unchanged revalidation on exact candidate | Parent package lacked a successful live revalidation branch | Candidate `0x3440…Fb6D` has finalized initial observation `0x845962…f038` and unchanged revalidation `0x8f9ea8…1417`, with leader success, consensus, same fingerprint, and authoritative pre/post readback. |
| Provide final-release live evidence | Earlier package did not bind final Vercel actions to the final release | OKX final-release revalidation `0x004be7…3225` and binding `0x77fbd4…ba7a7` are finalized with consensus; production UI/readback is recorded above. |
| Reconcile vintage count `2` versus authoritative `3` | The earlier report omitted an intervening OKX revalidation | Transaction `0xe7444c…15dd` created index `1` (count `2`); final revalidation created index `2` (count `3`); binding transactions did not mutate vintages. Full timeline and current readback are recorded above. |
| Record final hashes and production results in verification document | Final-release transactions were previously only in the run report | This document and `DEPLOYMENT-MANIFEST.md` now include exact implementation/evidence HEADs, GitHub/Vercel targets, both final-release hashes, HTTP `200`, wallet, state, and readbacks. |

## Local verification

- `genvm-lint`: pass
- Contract tests: `41 passed, 1 skipped` (opt-in external BLS test skipped)
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
| `trg-0002` correct-owner freeze | locked owner | [0xf008d6…bc7c80](https://explorer-studio.genlayer.com/tx/0xf008d695300d21da85e1dd182184fd16a84686b56fb3a28236fcaf688abc7c80) | `FINALIZED`, `SUCCESS` | `trg-0002` readback `FROZEN` |
| `trg-0002` isolated observe | locked owner | [0xd55618…9fabd16](https://explorer-studio.genlayer.com/tx/0xd556182e39a7c45c1dafacb44f1d683744ab3ddb462aa5914bfdaafe19fabd16) | `FINALIZED`, `MAJORITY_AGREE`; semantic `UNRESOLVED` | BLS `REQUEST_NOT_PROCESSED`; pre-state `FROZEN`, post-state `HOLD`, vintage count `1` |
| `trg-0002` isolated revalidation attempt | locked owner | [0xaf57bd…657b46](https://explorer-studio.genlayer.com/tx/0xaf57bd23ca8ce8a822c2abf800a0fa925a436c9c02ba6a774c0ce63900657b46) | `FINALIZED`, `MAJORITY_AGREE`; semantic `UNRESOLVED` | Pre-state `HOLD`, vintage count `1`; post-state `HOLD`, latest vintage `1`, count `2` |
| `trg-0002` live retry | locked owner | [0x1ed0ad…d8010](https://explorer-studio.genlayer.com/tx/0x1ed0ad997a32efdfb24606a180f015c9e8d0e35788f00aeb14613cd33c1d8010) | `FINALIZED`, `MAJORITY_AGREE`; semantic `UNRESOLVED` | Pre-state `HOLD`, latest vintage `1`, count `2`; post-state `HOLD`, latest vintage `2`, count `3`; BLS still `REQUEST_NOT_PROCESSED` |
| `trg-0003` CUUR isolated observe | locked owner | [0x8cf41d…1a4a475](https://explorer-studio.genlayer.com/tx/0x8cf41dbabecb1daa712c153e6e73f9e0dfa7e29ec4e0a5ad243b16bad1a4a475) | `FINALIZED`, `MAJORITY_AGREE`; semantic `UNRESOLVED` | Post-state `HOLD`, latest vintage `0`, count `1` |
| `trg-0003` CUUR revalidation | locked owner | [0xe90570…05b9be0](https://explorer-studio.genlayer.com/tx/0xe90570f4c1a78948de795a2ee05cd1c60090bf8c03b073f6a28a0aa8405b9be0) | `FINALIZED`, `MAJORITY_AGREE`; semantic `UNRESOLVED` | Post-state `HOLD`, latest vintage `0`, count `1`; no successful baseline established |
| `trg-0004` CUSR M06 observe | locked owner | [0x5fd4e6…5ba695](https://explorer-studio.genlayer.com/tx/0x5fd4e681e80a540a8c5a324e6020e8bf3e0b75bd5c2c234f4e40a3c2315ba695) | `FINALIZED`, `MAJORITY_AGREE`; semantic `UNRESOLVED` | Post-state `HOLD`, latest vintage `0`, count `1`; leader reason `REQUEST_NOT_PROCESSED` |
| Create isolated `trg-0005` (CUSR M07) | locked owner | [0x8f0fbc…6a551](https://explorer-studio.genlayer.com/tx/0x8f0fbc8c41cb1eddf53b063a6590b67453f56f52351023c2c4c46b5daf96a551) | `FINALIZED`, `SUCCESS` | `trg-0005`, `DRAFT`, canonical key `CUSR0000SA0:2024:M07:GE:313569` |
| Freeze isolated `trg-0005` | locked owner | [0x8cc614…b76d](https://explorer-studio.genlayer.com/tx/0x8cc614b3073395625204c71e46f47bd32f5209f51d4f4469c063fbad7a9bb76d) | `FINALIZED`, `SUCCESS` | `FROZEN` |
| `trg-0005` isolated observe | locked owner | [0x03a225…5cd04](https://explorer-studio.genlayer.com/tx/0x03a225ddcaf70718a730206c94f865ae1dd4757d58aba1d6fbac29001855cd04) | `FINALIZED`, `MAJORITY_AGREE`; semantic `UNRESOLVED` | Post-state `HOLD`, latest vintage `0`, count `1`; leader reason `REQUEST_NOT_PROCESSED` |
| `trg-0005` recovery revalidation attempt | locked owner | [0x6376ef…859a3](https://explorer-studio.genlayer.com/tx/0x6376ef85ce9729d81ea540f63309ac6eddd6590369000c7a1e80b0b1c4a859a3) | `FINALIZED`, `MAJORITY_AGREE`; semantic `UNRESOLVED` | Pre-state `HOLD`, latest vintage `0`, count `1`; post-state `HOLD`, latest vintage `1`, count `2`; BLS still `REQUEST_NOT_PROCESSED` |

The parent deployment had one blocking gap: Stage 2 requires live unchanged revalidation and a live-supported revision branch with `FINALIZED`, leader `SUCCESS`, consensus, and authoritative pre/post readback. The candidate deployment above closes the live unchanged branch using the approved API-to-official-series-page fallback. A live revision branch remains a separate optional path; no revision is inferred from unchanged data.

## Live probe optimization checkpoint

- Official BLS guidance documents an anonymous daily limit of 25 queries and a rate limit of 50 queries per 10 seconds: https://www.bls.gov/developers/api_faqs.htm
- A single nondeterministic observation/revalidation is independently evaluated by the leader and validators, so repeated live probes consume the upstream anonymous quota faster than the transaction count suggests.
- Direct BLS probe at `2026-08-29T18:24:25Z` returned HTTP `200`, `REQUEST_SUCCEEDED`, `M05=313.175`, and `M07=313.569`; the same exact URLs in Studionet continued to return `REQUEST_NOT_PROCESSED`.
- The candidate run used one isolated trigger and the minimum successful sequence; no extra live probes were sent after the required unchanged branch finalized.

## Disposable upgrade rehearsal

The main deployment was not upgraded. A separate disposable instance was used because the public contract is classified `UPGRADABLE`:

- Disposable address: `0x75a8764821EAfFF5ce68b0f141B2562A415e5ca6`
- Deploy transaction: [0x62117c…e5430f](https://explorer-studio.genlayer.com/tx/0x62117c1e42d5b7eb8fb6ba66e5b0d56a59d2acd4f274ebb10100e24c69e5430f) (`FINALIZED`, constructor `SUCCESS`)
- No-op upgrade transaction: [0x08ee86…72fdc9](https://explorer-studio.genlayer.com/tx/0x08ee867fe9a139805ffe727d93c8d1d0cea9f5bddb0e0d85c18a22b0f472fdc9) (`FINALIZED`)
- Disposable `get_upgrader([])` readback: locked owner address
- Upgrade payload: exact deployed source; main source hash remains unchanged.

## Frontend acceptance scope

The production frontend must use the candidate address through `VITE_CONTRACT_ADDRESS`, uses dedicated Studionet write clients, supports MetaMask/OKX/Rabby via EIP-6963, and does not depend on a Studio wallet. The browser E2E acceptance step must be run by the user on the exact Vercel release after GitHub/Vercel publication.

### Production Vercel release

- GitHub repository: https://github.com/nec465612-create/official-statistic-trigger-revalidator
- Final implementation commit under review: `b2f5ad6ff0cc576eb9f53b92db860139a93552a7`
- Evidence reconciliation commit: `b549897876a2f3891efcd5cb0bb025f1fa323d80`
- Final evidence package HEAD: `8f514fbe6b0710d3d5ac062f5efc095a4dfccfdf`
- Production URL: https://official-statistic-trigger-revalida.vercel.app/
- Vercel project: https://vercel.com/nec10/official-statistic-trigger-revalidator
- HTTP status: `200`; chain displayed by the production UI: Studionet `61999`
- Wallet E2E: OKX connected; final-release revalidation `0x004be7…253225` and binding `0x77fbd4…2ba7a7` both finalized with consensus and successful execution; reload/journal recovery preserved the binding without a second signature.
- Production UI readbacks: `RECONFIRMED`, `TRUE (Active)`, three comparable vintages, latest `313.569`, no HOLD.

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
