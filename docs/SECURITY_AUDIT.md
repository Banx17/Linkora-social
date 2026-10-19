# Linkora Security Audit Reference

This document provides the threat model, pre-deployment security checklist, post-deployment
monitoring recommendations, and incident response runbook for the Linkora SocialFi protocol.

For vulnerability disclosure instructions, see [`SECURITY.md`](../SECURITY.md).

---

## Table of Contents

1. [Threat Model](#1-threat-model)
   - [1.1 Smart Contract Layer](#11-smart-contract-layer)
   - [1.2 Indexer](#12-indexer)
   - [1.3 DM Relay](#13-dm-relay)
   - [1.4 Frontend (Web + Mobile)](#14-frontend-web--mobile)
2. [Pre-Deployment Security Checklist](#2-pre-deployment-security-checklist)
3. [Post-Deployment Monitoring](#3-post-deployment-monitoring)
4. [Incident Response Runbook](#4-incident-response-runbook)

---

## 1. Threat Model

Linkora is analysed using the **STRIDE** framework (Spoofing, Tampering, Repudiation,
Information Disclosure, Denial of Service, Elevation of Privilege) across four layers.

---

### 1.1 Smart Contract Layer

The Linkora Soroban contract (`packages/contracts`) is the trust root of the protocol.
All fund flows and state transitions ultimately settle here.

#### Assets

- User funds locked in pools and tips
- Protocol treasury (fee accumulation)
- Admin keypair (controls upgrade, fee, and treasury settings)
- User profiles, follow graphs, governance votes

#### Threat catalogue

| STRIDE category          | Threat                                    | Attack vector                                                                            | Soroban mitigations                                                                           | Residual risk |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------- |
| **Spoofing**             | Caller impersonation                      | Attacker calls a privileged function pretending to be admin or pool signer               | `Address::require_auth()` enforces Ed25519 signature checks at the SDK level; no forgeability | Low           |
| **Tampering**            | Storage key collision                     | Two modules write to the same `DataKey` variant                                          | Namespace all storage keys by module prefix; audit `DataKey` enum for collisions              | Low           |
| **Tampering**            | Integer overflow in fee/tip calculation   | Overflow causes fee bypass or incorrect fund transfer                                    | `overflow-checks = true` in `Cargo.toml` `[profile.release]`; arithmetic uses `checked_*`    | Low           |
| **Tampering**            | Malicious WASM upgrade                    | Admin key compromise allows attacker to replace contract logic                           | `upgrade` checks caller role; guardian hardening in `upgrade_hardening.rs`; time-lock recommended | Medium    |
| **Repudiation**          | Governance vote manipulation              | Voter denies casting a vote or claims a proposal was never executed                      | All votes and executions emit on-chain events with signer address; ledger provides immutable log | Very Low   |
| **Information Disclosure** | Profile / follow-graph enumeration      | Off-chain attacker walks the contract storage to build a social graph                    | Soroban storage is public by design; sensitive data should not be stored on-chain             | Accepted      |
| **Denial of Service**    | Storage exhaustion via spam profiles/posts | Attacker creates millions of profiles to exhaust contract storage budget                 | Rent mechanism (`pay_rent`) enforces storage fees; archival/tombstone removes expired entries | Medium        |
| **Denial of Service**    | Governance proposal spam                 | Attacker creates unlimited governance proposals to block legitimate ones                 | `gov_init_config` sets minimum quorum and voting period; proposal deposit recommended         | Medium        |
| **Elevation of Privilege** | Role escalation                         | Non-admin caller gains `Admin` or `Guardian` role                                        | `grant_role` / `revoke_role` gate on current admin auth; roles checked on every privileged call | Low         |
| **Elevation of Privilege** | Pool admin key rotation via threshold bypass | Attacker submits a pool admin change with fewer signers than the pool threshold        | `add_pool_admin` validates `signers.len() >= threshold`                                       | Low           |

#### Key invariants to verify in each audit

- `initialize` can only succeed once (guard on `AdminKey` existence)
- Every state-mutating function calls `Address::require_auth()` on at least the acting address
- `upgrade` is only callable by an account with the `Admin` or `Upgrader` role
- All arithmetic on balances is checked (no wrapping, no silent truncation)
- `FEE_BPS` is validated to be ≤ 10000 before storage
- Pool multi-sig threshold is always ≥ 1 and ≤ pool admin count

---

### 1.2 Indexer

The indexer (`services/indexer`) processes Soroban events and exposes a REST/WebSocket API.
It is the primary data layer for the frontend and SDK in read-heavy flows.

#### Assets

- PostgreSQL database containing indexed events, profiles, posts, follow graphs
- Stellar RPC credentials (endpoint URL)
- API authentication tokens (Stellar signed requests)

#### Threat catalogue

| STRIDE category          | Threat                             | Attack vector                                                                            | Mitigations in place                                                                        | Residual risk |
| ------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------- |
| **Spoofing**             | Forged Stellar auth header         | Attacker replays a captured `Authorization` header on a different endpoint               | Auth scheme binds to `METHOD:path:address:timestamp:bodyHash`; 30 s timestamp window        | Low           |
| **Tampering**            | SQL injection via query parameters | Attacker passes malicious SQL in filter params                                           | All DB queries use parameterised statements via the ORM; no raw string interpolation        | Low           |
| **Tampering**            | Event spoofing                     | Attacker submits fake Soroban events to poison the index                                 | Events are fetched directly from the Stellar RPC and verified by ledger sequence            | Low           |
| **Information Disclosure** | Excessive data exposure in API   | API returns internal fields (DB IDs, raw keys) not intended for public consumption       | Response DTOs are explicit allowlists; no `SELECT *` in public-facing queries               | Medium        |
| **Information Disclosure** | Timing attacks on auth            | Attacker measures response time to determine if a Stellar address is registered          | Constant-time signature verification; uniform error responses                              | Low           |
| **Denial of Service**    | Unbounded query result sets        | Client requests millions of rows without pagination                                      | All list endpoints enforce `limit` with a hard cap; cursor pagination required              | Low           |
| **Denial of Service**    | RPC request flooding               | Attacker triggers backfill to saturate the Stellar RPC allowance                         | `RPC_RATE_LIMIT_PER_SEC` token bucket; circuit breaker on consecutive RPC failures         | Low           |
| **Denial of Service**    | Rate-limit bypass across replicas  | Attacker spreads requests across load-balanced replicas to exceed per-IP limits          | Redis-backed shared rate limiter required in production (`REDIS_URL`)                       | Low           |
| **Elevation of Privilege** | Admin endpoint exposure          | Unauthenticated access to internal admin routes                                          | Admin routes require bearer token; not exposed in public network policy                     | Medium        |

#### Key checks before each release

- All new query parameters are parameterised, never interpolated into SQL strings
- New API endpoints declare explicit response schemas; no passthrough of raw DB rows
- `REDIS_URL` is set in all production deployments
- Rate-limit values have been reviewed for the expected traffic level

---

### 1.3 DM Relay

The DM relay (`services/dm-relay`) is a transport-only relay for end-to-end encrypted
direct messages. It stores ciphertext only — it never has access to plaintext.

#### Assets

- Encrypted message ciphertext (stored temporarily, purged after `MESSAGE_TTL_DAYS`)
- Message metadata: sender address, recipient address, timestamp, conversation ID
- PostgreSQL database

#### Threat catalogue

| STRIDE category          | Threat                              | Attack vector                                                                            | Mitigations in place                                                                         | Residual risk |
| ------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------- |
| **Spoofing**             | Sender address impersonation        | Attacker sends a message claiming to be from a different Stellar address                 | Stellar auth header binds to the sender address; server rejects mismatched claims            | Low           |
| **Tampering**            | Ciphertext substitution             | Attacker with DB access replaces stored ciphertext with a forged message                 | Recipients verify message integrity via X25519/ChaCha20-Poly1305 MAC; substitution is detected | Low         |
| **Information Disclosure** | Metadata analysis                 | Adversary with network access observes message frequency and conversation patterns       | Metadata (sender, recipient, timestamps) is stored in the DB; considered public-ish by design | Accepted    |
| **Information Disclosure** | E2EE key recovery                  | Attacker compromises the recipient's X25519 private key (stored in the mobile device)   | DM keys are stored in `Expo SecureStore` / OS keychain; never transmitted                   | Medium        |
| **Information Disclosure** | Key registry on-chain              | Attacker queries `get_dm_key` to learn a user's X25519 public key                       | DM public keys are intentionally public (needed for senders to encrypt); design choice       | Accepted      |
| **Denial of Service**    | Message flood                       | Attacker sends thousands of messages to fill storage                                     | Per-conversation rate limiting; `MESSAGE_TTL_DAYS` purges old messages automatically        | Low           |
| **Denial of Service**    | WebSocket connection exhaustion     | Attacker opens thousands of WebSocket connections                                        | `WS_RATE_LIMIT_MAX` caps connection attempts per IP per minute                              | Low           |
| **Repudiation**          | Sender denies sending a message     | Sender claims they never authored a message                                              | Stellar auth binds the Stellar address to the send action; ledger provides non-repudiation  | Low           |
| **Elevation of Privilege** | Unauthorized read of another's DMs | Attacker reads messages addressed to a different recipient                               | Fetch endpoints validate that the authenticated address is the conversation participant      | Low           |

#### Threat model limitations

The DM relay is transport-only. The following threats are **accepted by design**:

- Traffic analysis: message metadata (who talks to whom, how often) is not hidden
- Forward secrecy: the current design does not implement a double-ratchet; key compromise
  exposes all past messages encrypted to that key
- Relay availability: a DoS attack on the relay silences communication even though
  ciphertext integrity is unaffected

---

### 1.4 Frontend (Web + Mobile)

The web (`apps/web`) and mobile (`apps/mobile`) apps are the user-facing surfaces. They
have no privileged access to protocol funds but are the primary vector for social
engineering and wallet-draining attacks.

#### Assets

- User's Stellar wallet connection and signing capability
- User's session (authenticated Stellar address)
- User-generated content rendered in the browser / app
- Link previews fetched server-side

#### Threat catalogue

| STRIDE category          | Threat                             | Attack vector                                                                            | Mitigations in place                                                                        | Residual risk |
| ------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------- |
| **Spoofing**             | Phishing / fake Linkora site       | Attacker clones the UI and tricks users into connecting their wallet                     | HTTPS enforced; strict CSP headers; wallet providers show domain in signing dialogs         | Medium        |
| **Tampering**            | XSS via user-generated content     | Attacker injects `<script>` via a post or username rendered in the UI                    | All user content is escaped via React's JSX rendering; `dangerouslySetInnerHTML` banned     | Low           |
| **Tampering**            | SSRF via link preview              | Attacker supplies a crafted URL that causes the server to make internal network requests | Link-preview URLs are validated against an allowlist / blocklist of private IP ranges       | Low           |
| **Tampering**            | Supply chain attack on npm deps    | Malicious package version poisons the build                                              | Lockfile committed; Dependabot monitors for vulnerable versions; npm provenance recommended | Medium        |
| **Information Disclosure** | Wallet private key exposure      | Key stored insecurely in `localStorage` or logged in telemetry                          | Wallet keys never leave the wallet provider; app only holds session tokens                  | Low           |
| **Denial of Service**    | Wallet drain via malicious dApp    | User is tricked into signing a transaction that drains their account                     | Wallet signing dialogs show full transaction details; no blind-signing patterns in SDK       | Medium        |
| **Denial of Service**    | Uncontrolled re-renders / loops    | Malicious content causes the page to hang or crash                                       | Content size limits enforced at contract and indexer layer                                   | Low           |
| **Elevation of Privilege** | Admin UI exposed to non-admins   | Admin-only routes accessible without a role check                                        | Admin routes gated by `has_role` check against the connected wallet address                 | Low           |

#### Wallet security best practices for users

- Connect only on `https://linkora.social` or the official mobile app
- Always review the full transaction payload in your wallet before signing
- Never share your secret key (`S…`) with any site or application
- Use a hardware wallet (Ledger) for high-value accounts
- Revoke wallet connections from apps you no longer use

---

## 2. Pre-Deployment Security Checklist

Run this checklist before every contract deployment and every backend service release.

### 2.1 Smart contract

- [ ] `cargo test` passes with zero failures in `packages/contracts`
- [ ] `cargo clippy -- -D warnings` produces no warnings
- [ ] All new arithmetic operations use checked arithmetic (`checked_add`, `checked_mul`, etc.)
- [ ] Every state-mutating public function calls `require_auth()` on the acting address
- [ ] `DataKey` enum has no duplicate variants across modules
- [ ] Storage layout changes are documented; removed/renamed keys have migration paths
- [ ] `initialize` guard prevents double-initialization
- [ ] `FEE_BPS` is validated ≤ 10000 before writing to storage
- [ ] WASM hash verified post-deployment (see [Deployment Guide §7](./DEPLOYMENT_GUIDE.md#7-verifying-the-wasm-hash))
- [ ] `upgrade` path tested on a throwaway testnet deployment before production

### 2.2 Indexer

- [ ] No raw SQL string interpolation; all queries use parameterised statements
- [ ] New endpoints have rate-limit middleware applied
- [ ] `REDIS_URL` is set in all production replica deployments
- [ ] Response DTOs do not leak internal DB fields
- [ ] Database migrations are reversible; rollback tested locally
- [ ] `pnpm audit` shows no high/critical vulnerabilities
- [ ] Auth timestamp window (`MAX_TIMESTAMP_SKEW`) is ≤ 60 s

### 2.3 DM relay

- [ ] `pnpm audit` shows no high/critical vulnerabilities
- [ ] Per-conversation rate limits reviewed against expected traffic
- [ ] `MESSAGE_TTL_DAYS` is set to a value appropriate for the deployment
- [ ] Recipient auth check present on all message-fetch endpoints
- [ ] `NODE_ENV=production` set; `REDIS_URL` configured for multi-replica deployments

### 2.4 Frontend (web + mobile)

- [ ] `pnpm audit` shows no high/critical vulnerabilities in `apps/web` and `apps/mobile`
- [ ] No `dangerouslySetInnerHTML` usage with user-provided content
- [ ] Link-preview SSRF blocklist covers all RFC 1918 / link-local ranges
- [ ] Content Security Policy headers set in `next.config.mjs`
- [ ] All wallet-signing flows show the full transaction payload to the user
- [ ] `NEXT_PUBLIC_CONTRACT_ID` points to the correct, verified contract address
- [ ] No secrets or private keys committed to source or bundled in the app

### 2.5 CI/CD

- [ ] Repository secrets (`ADMIN_SECRET`, `TREASURY_ADDRESS`, `NPM_TOKEN`) rotated at
      least every 90 days
- [ ] No workflow uses `pull_request_target` with untrusted code checkout
- [ ] Third-party Actions are pinned to a specific commit SHA, not a mutable tag
- [ ] Dependabot is enabled and PRs are reviewed promptly

---

## 3. Post-Deployment Monitoring

### 3.1 Contract monitoring

- **WASM hash integrity:** periodically query `stellar contract info --id $CONTRACT_ID
  --network $NETWORK` and alert if `wasm_hash` changes unexpectedly
- **Admin key rotation events:** index `RoleGranted` / `RoleRevoked` events; alert on any
  admin change not initiated by a known team key
- **Fee parameter changes:** monitor `set_fee` and `set_treasury` invocations; changes
  should match planned governance decisions
- **Pool large withdrawals:** alert on single pool withdrawals exceeding a configurable
  threshold (e.g., 10% of total pool balance)

### 3.2 Indexer monitoring

- **Lag metric:** alert when the indexer falls more than 500 ledgers behind the chain tip
- **Dead-letter queue depth:** alert when DLQ message count exceeds 100; indicates repeated
  event-processing failures
- **Error rate:** alert when HTTP 5xx rate exceeds 1% over a 5-minute window
- **Slow queries:** alert on PostgreSQL queries exceeding `SLOW_QUERY_THRESHOLD_MS`
- **RPC circuit breaker:** alert when the circuit breaker trips; indicates Stellar RPC
  instability

### 3.3 DM relay monitoring

- **Message delivery lag:** alert when average message delivery time exceeds 5 s
- **TTL purge job failures:** alert if the cleanup cron job has not run within
  `MESSAGE_TTL_DAYS + 1` days
- **Auth rejection spike:** alert if the 401 rate spikes above 5% over 5 minutes (may
  indicate a replay or credential stuffing attack)

### 3.4 Frontend monitoring

- **CSP violation reports:** configure `report-uri` to collect CSP violation reports; alert
  on spikes that may indicate an injection attempt
- **Wallet signing error rate:** alert on unusual spikes in transaction submission failures
- **Dependency audit in CI:** `pnpm audit` runs on every PR; block merges on new
  high/critical findings

---

## 4. Incident Response Runbook

### 4.1 Severity levels

| Level    | Definition                                                                              | Examples                                              |
| -------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| SEV-1 🔴 | Active exploitation or imminent fund loss; protocol must be paused immediately          | Contract drain in progress; admin key compromised     |
| SEV-2 🟠 | Confirmed vulnerability with high exploit probability; patch within 24 hours           | Auth bypass discovered; SQL injection confirmed       |
| SEV-3 🟡 | Vulnerability confirmed but no active exploitation; patch within 7 days               | SSRF in link preview; XSS in low-traffic component    |
| SEV-4 🟢 | Low-severity finding; schedule for next release                                        | Informational disclosure; deprecated dependency       |

### 4.2 Contact tree

| Role                  | Contact                       | Escalate if unreachable after |
| --------------------- | ----------------------------- | ----------------------------- |
| Security Lead         | `security@linkora.social`     | 30 minutes (SEV-1), 4 hours (SEV-2+) |
| Protocol Maintainer   | GitHub `@Epta-Node` org owners | 1 hour (SEV-1), 8 hours (SEV-2+) |
| Infrastructure        | On-call rotation (internal)   | 30 minutes (SEV-1)            |

For SEV-1, all three contacts should be notified simultaneously.

### 4.3 SEV-1 response procedure

The following steps apply to an active SEV-1 incident (e.g., contract drain in progress or
admin key compromised).

**Immediate actions (within 30 minutes):**

1. **Alert all contacts** in the contact tree simultaneously.
2. **Pause the contract** if a per-module pause is available:
   ```bash
   stellar contract invoke \
     --network $NETWORK \
     --source-account emergency_admin \
     --id $CONTRACT_ID \
     -- pause_module --module <module_name>
   ```
3. **Rotate the compromised admin key** using a guardian recovery path if available:
   ```bash
   # Use the guardian key to call grant_role for a new admin address,
   # then revoke the compromised key.
   stellar contract invoke ... -- grant_role --admin $GUARDIAN_ADDRESS \
     --account $NEW_ADMIN_ADDRESS --role Admin
   stellar contract invoke ... -- revoke_role --admin $GUARDIAN_ADDRESS \
     --account $COMPROMISED_ADDRESS --role Admin
   ```
4. **Revoke CI/CD secrets** that may be exposed: rotate `ADMIN_SECRET`,
   `TREASURY_ADDRESS`, `NPM_TOKEN` in GitHub repository settings.
5. **Take a snapshot** of the current contract state and indexer DB for forensics before
   any further changes.

**Investigation (within 2 hours):**

6. Identify the attack vector: review transaction history on Stellar Explorer, indexer
   event logs, and service access logs.
7. Determine the blast radius: which accounts / funds are affected.
8. Draft a timeline of events for the post-mortem.

**Remediation (within the patch target for the severity):**

9. Deploy a patched WASM via the upgrade path (see
   [Deployment Guide §9](./DEPLOYMENT_GUIDE.md#9-contract-upgrade-patterns)).
10. Verify the patch resolves the root cause on a testnet fork before mainnet.
11. Re-enable paused modules one at a time and monitor for anomalies.

**Communication:**

12. Publish a security advisory via GitHub Security Advisories once the patch is live.
13. Notify affected users if funds or personal data were at risk.
14. Publish a post-mortem within 14 days covering root cause, timeline, and remediation.

### 4.4 SEV-2 / SEV-3 response procedure

1. Acknowledge the report within the target window (see §Reporting in `SECURITY.md`).
2. Reproduce the issue in an isolated environment (local or testnet).
3. Assign an owner and open a private tracking issue.
4. Develop and test a fix; obtain code review from at least one other maintainer.
5. Deploy the fix to testnet; verify resolution.
6. Deploy to production and monitor.
7. Close the private issue and publish a security advisory after the patch is live.

### 4.5 Post-incident review

After every SEV-1 and SEV-2 incident, hold a blameless post-mortem within 14 days covering:

- **What happened** — timeline of events
- **Root cause** — technical and process failures
- **Impact** — users affected, funds at risk, data exposure
- **Detection** — how it was found and how long it went undetected
- **Response** — what worked, what could have been faster
- **Action items** — concrete improvements to code, monitoring, or process with owners and deadlines
