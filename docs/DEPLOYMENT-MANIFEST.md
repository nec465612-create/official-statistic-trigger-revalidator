# Studionet Deployment Manifest

Status: `POST_DEPLOY_TEST` — main deployment and live verification are complete; GitHub/Vercel publication remains gated on account/team selection.

## Locked deployment identity

- Classification: `UPGRADABLE`
- Network: GenLayer Studionet
- Chain ID: `61999`
- RPC: `https://studio.genlayer.com/api`
- Contract source: `contracts/official_statistic_trigger_revalidator.py`
- Deployed source commit: `abdcc2036115e7c0ff7713830ae596b658616998`
- Contract source SHA-256: `83D140EEF1702A0553EFF8F8422E25649CDBA0357623FD616BC18DB9BFEEC3FD`
- Constructor arguments: none
- Locked Studio deployer/upgrader: `0x34b92E6553eaCA11A00A9d86d75d8a7881779D78`
- Role: deployer and sole initial upgrader
- Linked contracts: none
- Configuration transactions: none

## Main deployment

- Address: `0x96B2F4DFB02B4727401fBb1CFF18f3Ed98CBFdee`
- Explorer: https://explorer-studio.genlayer.com/address/0x96B2F4DFB02B4727401fBb1CFF18f3Ed98CBFdee
- Deployment transaction: `0x431444bb4b10236ef8b71c887a4eeaa57efe33b981f71589f432ea893861b596`
- Deployment status: `FINALIZED`, `MAJORITY_AGREE`
- Source parity: embedded deployment source is 48,571 bytes and hashes to the locked SHA-256.
- `get_upgrader` readback: locked owner address.

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
