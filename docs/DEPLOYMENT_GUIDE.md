# Linkora Contract Deployment Guide

This guide covers the end-to-end workflow for deploying, initializing, verifying, and
upgrading the Linkora Soroban smart contract on Stellar **Testnet** and **Futurenet**. For
backend service deployment (indexer, DM relay, analytics oracle) see
[`docs/deployment.md`](./deployment.md).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Contract Architecture Overview](#2-contract-architecture-overview)
3. [Generating and Funding a Deployer Key](#3-generating-and-funding-a-deployer-key)
4. [Building the Contract WASM](#4-building-the-contract-wasm)
5. [Deploying to Testnet](#5-deploying-to-testnet)
   - [Using the deploy script](#51-using-the-deploy-script)
   - [Step-by-step with stellar-cli](#52-step-by-step-with-stellar-cli)
6. [Deploying to Futurenet](#6-deploying-to-futurenet)
7. [Verifying the WASM Hash](#7-verifying-the-wasm-hash)
8. [Updating SDK and Frontend Config](#8-updating-sdk-and-frontend-config)
9. [Contract Upgrade Patterns](#9-contract-upgrade-patterns)
10. [Makefile Targets Reference](#10-makefile-targets-reference)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

| Tool              | Minimum Version | Install                                              |
| ----------------- | --------------- | ---------------------------------------------------- |
| Rust + Cargo      | stable          | `curl https://sh.rustup.rs -sSf \| sh`               |
| wasm32v1-none target | —            | `rustup target add wasm32v1-none`                    |
| stellar-cli       | latest          | `cargo install --locked stellar-cli`                 |
| Node.js           | 18+             | [nodejs.org](https://nodejs.org) or `.node-version`  |
| pnpm              | 9+              | `npm install -g pnpm`                                |

Verify your setup:

```bash
cargo --version
stellar --version
```

> **Tip:** The project root contains a `.node-version` file pinning the required Node.js
> version. Use `fnm` or `nvm` to automatically select it.

---

## 2. Contract Architecture Overview

Linkora deploys a **single unified Soroban WASM** (`linkora_contracts.wasm`) that contains
all protocol modules. There is no multi-contract deployment step — one `stellar contract
deploy` call deploys the entire protocol.

The contract modules embedded in the WASM are:

| Module             | Responsibility                                                |
| ------------------ | ------------------------------------------------------------- |
| **Profiles**       | On-chain user profiles, usernames, DM key registry           |
| **Social Graph**   | Follow/unfollow, block/unblock, follow suggestions            |
| **Posts**          | Create, like, delete posts; content-hash anchoring            |
| **Tips**           | Token tipping with protocol fee, cooldown window              |
| **Pools**          | Multi-sig community pools, deposits, withdrawals              |
| **Governance**     | On-chain proposals, voting, delegation, execution             |
| **Moderation**     | Report posts, review reports, reputation, appeal workflow     |
| **Analytics Oracle** | Register oracles, verify Ed25519 attestations              |
| **Upgrade**        | Admin-controlled WASM hash upgrade with guardian hardening    |
| **Rent**           | Storage rent payment, grace period, expiry                    |

**WASM path after build:**

```
packages/contracts/contracts/linkora-contracts/target/wasm32v1-none/release/linkora_contracts.wasm
```

---

## 3. Generating and Funding a Deployer Key

You need a Stellar keypair whose secret key you will pass as `ADMIN_SECRET`. This account
becomes the contract admin and must have sufficient XLM to pay transaction fees and the
contract storage deposit.

### Generate a new keypair

```bash
stellar keys generate linkora_deployer --network testnet
stellar keys address linkora_deployer     # prints the G... public key
stellar keys show linkora_deployer        # prints the S... secret key — keep this safe
```

### Fund on Testnet (Friendbot)

```bash
ADMIN_ADDRESS=$(stellar keys address linkora_deployer)
curl "https://friendbot.stellar.org/?addr=$ADMIN_ADDRESS"
```

Verify the balance:

```bash
stellar account info --network testnet "$ADMIN_ADDRESS"
```

You need at least **2 XLM** for the deployment transaction plus contract storage reserve.
Fund with additional XLM if the contract storage reserve requirement is higher.

### Fund on Futurenet (Friendbot)

```bash
curl "https://friendbot-futurenet.stellar.org/?addr=$ADMIN_ADDRESS"
```

---

## 4. Building the Contract WASM

Build from the workspace root:

```bash
# Via the root Makefile (recommended)
make build

# Or directly in the contracts package
cd packages/contracts
cargo build --release --target wasm32v1-none \
  --manifest-path contracts/linkora-contracts/Cargo.toml
```

The built artifact lands at:

```
packages/contracts/contracts/linkora-contracts/target/wasm32v1-none/release/linkora_contracts.wasm
```

Confirm the file exists and is non-zero:

```bash
ls -lh packages/contracts/contracts/linkora-contracts/target/wasm32v1-none/release/linkora_contracts.wasm
```

You can also use the contract-level Makefile:

```bash
cd packages/contracts/contracts/linkora-contracts
make build   # runs `stellar contract build` and prints WASM sizes
```

---

## 5. Deploying to Testnet

### 5.1 Using the deploy script

The canonical deployment path is `scripts/deploy_testnet.sh`. It handles building, deploying,
and initializing in one command.

**Required environment variables:**

| Variable           | Description                                                |
| ------------------ | ---------------------------------------------------------- |
| `ADMIN_SECRET`     | Secret key (`S…`) of the deployer / contract admin account |
| `TREASURY_ADDRESS` | Public address (`G…`) that receives protocol fees         |
| `FEE_BPS`          | Protocol fee in basis points (0–10000). Defaults to `0`    |

**Optional variables:**

| Variable      | Description                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| `NETWORK`     | Stellar network to deploy to. Defaults to `testnet`                                  |
| `CONTRACT_ID` | If set, skips deployment and uses this existing contract ID (re-initialize only)     |

**Run a dry-run first:**

```bash
ADMIN_SECRET=S... \
TREASURY_ADDRESS=G... \
FEE_BPS=250 \
./scripts/deploy_testnet.sh --dry-run
```

The dry run checks that all required environment variables are set and that `stellar-cli` and
`cargo` are available, but makes no network calls.

**Deploy:**

```bash
ADMIN_SECRET=S... \
TREASURY_ADDRESS=G... \
FEE_BPS=250 \
./scripts/deploy_testnet.sh
```

On success, the script prints a deployment summary:

```
╔══════════════════════════════════════════════════════════════╗
║               Deployment Summary                            ║
╠══════════════════════════════════════════════════════════════╣
║  network:             testnet                               ║
║  contract_id:         C...                                  ║
║  admin:               G...                                  ║
║  treasury:            G...                                  ║
║  fee_bps:             250                                   ║
╚══════════════════════════════════════════════════════════════╝
```

Save the `contract_id` — you need it to configure the indexer and frontend.

### 5.2 Step-by-step with stellar-cli

If you prefer to run each step manually:

**Step 1 — Import your deployer key:**

```bash
stellar keys add linkora_deployer --secret-key "$ADMIN_SECRET"
```

**Step 2 — Build the WASM:**

```bash
cd packages/contracts/contracts/linkora-contracts
stellar contract build
```

**Step 3 — Deploy the WASM:**

```bash
CONTRACT_ID=$(stellar contract deploy \
  --network testnet \
  --source-account linkora_deployer \
  --wasm target/wasm32v1-none/release/linkora_contracts.wasm)

echo "CONTRACT_ID=$CONTRACT_ID"
```

**Step 4 — Initialize the contract:**

```bash
stellar contract invoke \
  --network testnet \
  --source-account linkora_deployer \
  --id "$CONTRACT_ID" \
  -- initialize \
    --admin "$ADMIN_ADDRESS" \
    --treasury "$TREASURY_ADDRESS" \
    --fee-bps 250
```

`initialize` must be called exactly once. Calling it a second time will fail with
`AlreadyInitialized`.

---

## 6. Deploying to Futurenet

Futurenet is Stellar's bleeding-edge preview network. Use the same script with `NETWORK=futurenet`:

```bash
NETWORK=futurenet \
ADMIN_SECRET=S... \
TREASURY_ADDRESS=G... \
FEE_BPS=0 \
./scripts/deploy_testnet.sh
```

The stellar-cli uses the futurenet RPC endpoint automatically when `--network futurenet` is
passed. Ensure your deployer account is funded via the futurenet Friendbot (see §3).

> **Note:** Futurenet is reset periodically. Do not use futurenet `CONTRACT_ID` values in
> production or long-lived staging environments.

---

## 7. Verifying the WASM Hash

After deployment, verify that the on-chain WASM hash matches your local build to confirm no
tampering occurred during upload.

**Get the local WASM hash:**

```bash
stellar contract hash \
  --wasm packages/contracts/contracts/linkora-contracts/target/wasm32v1-none/release/linkora_contracts.wasm
```

**Get the on-chain WASM hash:**

```bash
stellar contract info \
  --network testnet \
  --id "$CONTRACT_ID"
```

The `wasm_hash` field in the output must match the local hash exactly. Any discrepancy means
the deployed WASM does not match the source you built — investigate before proceeding.

---

## 8. Updating SDK and Frontend Config

After a successful deployment, propagate the new `CONTRACT_ID` to the SDK and frontend.

### SDK / codegen

The `pnpm codegen` command regenerates typed bindings from the live contract ABI:

```bash
CONTRACT_ID=C... \
NEXT_PUBLIC_CONTRACT_ID=C... \
pnpm codegen
```

This updates `packages/sdk/src/generated/` with current types.

### Indexer

Edit `services/indexer/.env` (or your deployment environment secrets):

```dotenv
CONTRACT_ID=C...                          # new contract ID
START_LEDGER=<deployment_ledger_number>   # ledger at which the contract was deployed
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
```

The `START_LEDGER` value should be the ledger sequence number at deployment time (visible in
Stellar Explorer or the stellar-cli deploy output). Setting it higher than the actual
deployment ledger causes the indexer to miss early events.

### Web frontend

Update the contract ID in `apps/web`:

```dotenv
# apps/web/.env.local
NEXT_PUBLIC_CONTRACT_ID=C...
NEXT_PUBLIC_NETWORK=testnet
```

### Mobile app

Update the contract ID in `apps/mobile`:

```dotenv
# apps/mobile/.env
EXPO_PUBLIC_CONTRACT_ID=C...
EXPO_PUBLIC_NETWORK=testnet
```

---

## 9. Contract Upgrade Patterns

The Linkora contract supports in-place WASM upgrades via the `upgrade` function. This
replaces the bytecode at the existing `CONTRACT_ID` without changing the contract address.

### Workflow

**Step 1 — Build the new WASM:**

```bash
make build
```

**Step 2 — Upload the new WASM to the network (get its hash):**

```bash
NEW_WASM_HASH=$(stellar contract upload \
  --network testnet \
  --source-account linkora_deployer \
  --wasm packages/contracts/contracts/linkora-contracts/target/wasm32v1-none/release/linkora_contracts.wasm)

echo "NEW_WASM_HASH=$NEW_WASM_HASH"
```

**Step 3 — Call `upgrade` on the live contract:**

```bash
stellar contract invoke \
  --network testnet \
  --source-account linkora_deployer \
  --id "$CONTRACT_ID" \
  -- upgrade \
    --upgrader "$ADMIN_ADDRESS" \
    --new-wasm-hash "$NEW_WASM_HASH"
```

The `upgrade` function checks that `upgrader` has the admin role and that the new WASM hash
is non-zero. It records the hash transition in contract storage for auditability.

### Upgrade checklist

- [ ] Run `make test` against the new code before uploading
- [ ] Verify WASM hash matches local build after upload (§7)
- [ ] Review storage layout changes — adding new keys is safe; removing or renaming existing
      keys requires a migration
- [ ] Update `START_LEDGER` in the indexer if the upgrade emits new event types that need
      backfilling
- [ ] Re-run `pnpm codegen` after upgrade if the ABI changed
- [ ] Announce the upgrade ledger to community integrators

> **Re-deploy vs. upgrade:** Upgrading preserves the `CONTRACT_ID` and all existing state.
> Re-deploying (running `deploy_testnet.sh` without `CONTRACT_ID`) creates a new contract at
> a new address — all existing state is abandoned. Prefer upgrade unless a complete state
> reset is intentional.

---

## 10. Makefile Targets Reference

Run all targets from the repository root.

| Target  | Command       | Description                                              |
| ------- | ------------- | -------------------------------------------------------- |
| `dev`   | `make dev`    | Start all packages in development watch mode             |
| `build` | `make build`  | Build all packages including the contract WASM           |
| `lint`  | `make lint`   | Run ESLint and `cargo clippy` across all packages        |
| `test`  | `make test`   | Run all unit tests (Rust + TypeScript)                   |
| `format`| `make format` | Auto-format all code with Prettier and `cargo fmt`       |
| `labels`| `make labels` | Sync GitHub labels from `.github/labels.yml` (needs `GITHUB_TOKEN`) |

For contract-specific targets, use the inner Makefile:

```bash
cd packages/contracts/contracts/linkora-contracts
make build   # stellar contract build + print WASM sizes
make test    # cargo test
make fmt     # cargo fmt --all
make clean   # cargo clean
```

### CI deployment

The GitHub Actions workflow `.github/workflows/deploy-testnet.yml` runs automatically on
pushes to `main` when `ADMIN_SECRET` and `TREASURY_ADDRESS` repository secrets are
configured. It builds, deploys, runs codegen, builds the SDK, and publishes a canary SDK
version to npm.

---

## 11. Troubleshooting

### `stellar-cli` not found

```
warning: stellar-cli is not installed, skipping deployment
  Install with: cargo install --locked stellar-cli
```

Install stellar-cli:

```bash
cargo install --locked stellar-cli
```

Then confirm: `stellar --version`

---

### WASM artifact not found

```
error: WASM artifact not found at .../linkora_contracts.wasm
```

The contract must be built before deploying. Run:

```bash
make build
# or
cd packages/contracts/contracts/linkora-contracts && stellar contract build
```

---

### `FEE_BPS` validation error

```
error: FEE_BPS must be an integer between 0 and 10000 (got '...')
```

`FEE_BPS` must be a whole number between 0 and 10000 (representing 0%–100% in basis
points). A value of 250 means 2.5%.

---

### `AlreadyInitialized` error on `initialize`

The `initialize` function can only be called once. If you see this error, the contract has
already been initialized. To re-initialize with different parameters you must deploy a fresh
contract (omit `CONTRACT_ID` from the environment).

---

### Insufficient XLM balance

```
error: transaction failed: TRANSACTION_FAILED (fee_charged exceeds balance)
```

Fund the deployer account via Friendbot (testnet/futurenet) or transfer XLM. The minimum
balance for contract deployment is approximately 2 XLM plus the contract storage reserve
(typically 5–10 XLM depending on initial storage use).

---

### Contract not found / wrong network

```
error: HostError: Error(Value, InvalidInput)
```

Verify that `CONTRACT_ID` and `NETWORK` refer to the same network. A testnet contract ID
will not be found on futurenet and vice versa.

---

### Stellar RPC timeouts

If `stellar-cli` commands time out, check the status of the Stellar RPC endpoint:

- Testnet: <https://soroban-testnet.stellar.org>
- Futurenet: <https://rpc-futurenet.stellar.org>

You can point at a different RPC by passing `--rpc-url <url>` to any `stellar contract`
command. The stellar-cli also accepts a `SOROBAN_RPC_URL` environment variable.
