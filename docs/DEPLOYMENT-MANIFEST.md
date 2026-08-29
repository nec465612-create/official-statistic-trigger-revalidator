# Studionet Deployment Manifest

Status: `POST_DEPLOY_TEST` — PRE_DEPLOY-approved candidate is deployed and its live unchanged revalidation is successful; post-deploy anonymous review and account/team selection still gate GitHub/Vercel publication.

## Locked deployment identity

- Classification: `UPGRADABLE`
- Network: GenLayer Studionet
- Chain ID: `61999`
- RPC: `https://studio.genlayer.com/api`
- Contract source: `contracts/official_statistic_trigger_revalidator.py`
- Candidate source commit: `218f969234afef728551dba1b6d086a579304188`
- Candidate contract source SHA-256: `5F1004D30D9B8348F27CEC388972A6DFF1F3C24A9A89C655926DE4DC9D75F9F6`
- Constructor arguments: none
- Locked Studio deployer/upgrader: `0x34b92E6553eaCA11A00A9d86d75d8a7881779D78`
- Role: deployer and sole initial upgrader
- Linked contracts: none
- Configuration transactions: none

## Parent baseline deployment

- Address: `0x96B2F4DFB02B4727401fBb1CFF18f3Ed98CBFdee`
- Explorer: https://explorer-studio.genlayer.com/address/0x96B2F4DFB02B4727401fBb1CFF18f3Ed98CBFdee
- Deployment transaction: `0x431444bb4b10236ef8b71c887a4eeaa57efe33b981f71589f432ea893861b596`
- Deployment status: `FINALIZED`, `MAJORITY_AGREE`
- Source parity: embedded deployment source is 48,571 bytes and hashes to the locked SHA-256.
- `get_upgrader` readback: locked owner address.

## Candidate deployment (current)

- Address: `0x3440B6d69E80C00B64CBfC7DEB524fD7Ff50Fb6D`
- Explorer: https://explorer-studio.genlayer.com/address/0x3440B6d69E80C00B64CBfC7DEB524fD7Ff50Fb6D
- Deployment transaction: `0x72bec408cb8f2a8d591b554840e94f7360a66758795a6a1b75fc8fe7834b82c8`
- Deployment status: `FINALIZED`, consensus `ACCEPTED`
- Source parity: `gen_getContractCode` returned 51,587 bytes and the exact candidate SHA-256 above.
- Live trigger: `trg-0001`, owner locked account, `CUSR0000SA0`, `2024 M07`, `GE`, threshold `0.000`.
- Create tx: `0x1f5a249886637374449cf6e1e1d95087b7eca2764da135e021fb91fb52f8c361` — `FINALIZED`, `SUCCESS`.
- Freeze tx: `0x527b9fe88e6a3834892ef3fe22a3ce42829d870ba08b8b76e5779136a7ca562e` — `FINALIZED`, `SUCCESS`.
- Initial observation tx: `0x845962dba3da200db99276bdaa59a37f988bed295572953d0656042244b8f038` — `FINALIZED`, `SUCCESS`, output `UNCHANGED_ABOVE`; semantic source `REQUEST_SUCCEEDED`, `COMPARABLE`, value `313.569` / `313569`.
- Unchanged revalidation tx: `0x8f9ea8a349feb059f06ec3639ebd5f3291933648f5908f8892004e950bcd1417` — `FINALIZED`, `SUCCESS`, output `UNCHANGED_ABOVE`; same fingerprint `6470a4cc2278c65adff0286bed2c4f7f09a6cbd50297a6ed0b064d310005b612`.
- Authoritative pre/post readback: `CONFIRMED_ACTIVE`, latest vintage index `0`, vintage count `1`; revalidation refreshed observation time without creating a new vintage.
- Evidence detail: see `docs/VERIFICATION.md` candidate matrix. Parent evidence is historical and is not reused for candidate deployment.

## Remaining release gate

- Candidate live unchanged revalidation is complete. A live revision branch is not inferred from unchanged data and remains optional separate evidence.
- The exact candidate source and deployment package require post-deploy anonymous approval before GitHub/Vercel publication.

## Disposable upgrade rehearsal

- Address: `0x75a8764821EAfFF5ce68b0f141B2562A415e5ca6`
- Explorer: https://explorer-studio.genlayer.com/address/0x75a8764821EAfFF5ce68b0f141B2562A415e5ca6
- Deploy transaction: `0x62117c1e42d5b7eb8fb6ba66e5b0d56a59d2acd4f274ebb10100e24c69e5430f`
- No-op upgrade transaction: `0x08ee867fe9a139805ffe727d93c8d1d0cea9f5bddb0e0d85c18a22b0f472fdc9`
- Both transactions: `FINALIZED`; upgrade used the exact deployed source and did not alter the main deployment.

## Recovery limits and runbook

- If Studio UI state resets while Studionet state and the locked account remain available, import the main contract by address, load the exact source from the recorded commit, verify `get_upgrader`, then perform only an approved upgrade.
- If the locked Studio account becomes unavailable, upgrade authority for the old deployment is lost. The old contract may remain readable, but recovery must not be claimed. Deploy a replacement from the recorded source, rerun the complete live matrix, then update the frontend and evidence.
- If Studionet state resets, the old address and state cannot be recovered. Redeploy from the recorded revision, rerun the complete live matrix, then update every address and evidence link.
- No private key, seed phrase, credential, or other secret belongs in this repository.
