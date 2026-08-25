# Draft Studionet Deployment Manifest

Status: `PRE_DEPLOY` — no signature, deployment transaction, or contract write has been sent.

## Locked deployment identity

- Classification: `UPGRADABLE`
- Network: GenLayer Studionet
- Chain ID: `61999`
- RPC: `https://studio.genlayer.com/api`
- Contract source: `contracts/official_statistic_trigger_revalidator.py`
- Contract source SHA-256: `83D140EEF1702A0553EFF8F8422E25649CDBA0357623FD616BC18DB9BFEEC3FD`
- Constructor arguments: none
- Locked Studio deployer/upgrader: `0x34b92E6553eaCA11A00A9d86d75d8a7881779D78`
- Role: deployer and sole initial upgrader
- Linked contracts: none
- Configuration transactions: none
- Contract address, deployment transaction, Explorer URL, and exact deployed commit: pending deployment

The constructor records `gl.message.sender_address` in both the contract's `upgrader` field and `gl.storage.Root.get().upgraders`. The public `upgrade(new_code: bytes)` method additionally requires the recorded upgrader. Upgrades must preserve the existing storage field order and types; any migration requires a separately reviewed plan.

## Recovery limits and runbook

- If Studio UI data resets while Studionet state and the locked account remain available, import the contract by its recorded address, load the exact source from the recorded commit, verify `get_upgrader`, then perform only an approved upgrade if needed.
- If the locked Studio account becomes unavailable, upgrade authority for the old deployment is lost. The old contract may remain readable, but recovery must not be claimed. Deploy a replacement from the recorded source and constructor manifest, rerun the complete live matrix, then update the frontend and evidence.
- If Studionet state resets, the old address and state cannot be recovered. Redeploy from the recorded revision, rerun the complete live matrix, then update every address and evidence link.
- No private key, seed phrase, credential, or other secret belongs in this repository.

After deployment this manifest must be updated with the exact commit, contract address, deployment transaction, Explorer link, final source-parity evidence, and safe upgrade-rehearsal evidence.
