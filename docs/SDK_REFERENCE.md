# Linkora TypeScript SDK Reference

This is the standalone reference for the public `linkora-sdk` package. The
examples use the SDK's exported TypeScript types and the Stellar SDK. Replace
example addresses and contract IDs with valid values for the selected network.

## Installation

Install the SDK from the repository workspace:

```bash
pnpm --filter linkora-sdk build
```

In a consuming project, install the published `linkora-sdk` package and its
peer dependencies if using hardware-wallet signers:

```bash
npm install linkora-sdk @stellar/stellar-sdk
```

The package requires Node.js 20 or later. It ships ESM and CommonJS builds with
declaration files. Browser and React Native applications can use the same
typed client; provide a compatible wallet signer for transaction signing.

## Initialization and network selection

`LinkoraClient` requires a deployed Linkora contract ID and a Soroban RPC URL.
The default network passphrase is Testnet. Specify all three network settings
explicitly in deployed applications:

| Network | RPC URL | Network passphrase | Horizon URL |
| --- | --- | --- | --- |
| Testnet | `https://soroban-testnet.stellar.org` | `Test SDF Network ; September 2015` | `https://horizon-testnet.stellar.org` |
| Mainnet | `https://soroban-rpc.mainnet.stellar.org` | `Public Global Stellar Network ; September 2015` | `https://horizon.stellar.org` |
| Futurenet | `https://rpc-futurenet.stellar.org` | `Test SDF Future Network ; October 2022` | `https://horizon-futurenet.stellar.org` |

RPC and Horizon endpoints can change or be unavailable; they are configurable
so you can supply a provider endpoint. For custom Stellar networks, provide
both the exact network passphrase and `horizonUrl`; the SDK cannot infer a
Horizon endpoint from an arbitrary passphrase. `allowHttp` is disabled by
default. Set it to `true` only for local development RPCs; non-loopback
plaintext HTTP is rejected.

```ts
import { LinkoraClient } from "linkora-sdk";

const client = new LinkoraClient({
  contractId: process.env.LINKORA_CONTRACT_ID!,
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  horizonUrl: "https://horizon-testnet.stellar.org",
  timeoutMs: 30_000,
  healthCheck: { autoStart: true, intervalMs: 30_000 },
});

const profile = await client.getProfile("G...");
console.log(profile?.username ?? "No profile");
client.stopHealthChecks();
```

### `ClientConfig`

| Property | Type | Default / meaning |
| --- | --- | --- |
| `contractId` | `string` | Required Linkora contract address. |
| `rpcUrl` | `string` | Required Soroban RPC endpoint. |
| `networkPassphrase` | `string` | Testnet passphrase if omitted. |
| `tokenFactoryId` | `string` | Optional token-factory contract address. Required for creator-token helpers. |
| `horizonUrl` | `string` | Optional Horizon endpoint for sequence/account queries. |
| `timeoutMs` | `number` | HTTP timeout in milliseconds; defaults to `30_000`. |
| `allowHttp` | `boolean` | Explicit opt-in for local plaintext HTTP RPC. |
| `healthCheck` | `HealthCheckConfig & { autoStart?: boolean }` | Optional periodic RPC monitoring; `autoStart` is false by default. |

## Transaction model

Most synchronous write methods (for example `createPost`, `follow`, or
`setProfile`) return a base64 XDR operation envelope built using a temporary
source account. It is **not ready for wallet signing or network submission**.
Use the corresponding `prepare*Tx` method for a wallet-ready transaction.
Those helpers fetch the actual source account sequence from Horizon, simulate
the operation and return an unsigned base64 transaction envelope ready to sign.

For multi-operation transactions, use `buildMultiOpTx` with an actual Stellar
`Account`. Alternatively, pass a prepared transaction to `submitTransaction`
or a `TransactionQueue` configured with a signer. Transaction amounts and
contract integer identifiers are represented as `bigint` wherever possible;
pass literals such as `100n` to preserve integer precision.

## `LinkoraClient` API

Unless stated otherwise, write-builder methods below return `string` (base64
XDR) and **only prepare** an operation; they do not broadcast it. For each
write builder the example shows the typed call. Use the corresponding prepared
transaction helper when an actual wallet transaction is needed.

### Connection, transaction and simulation methods

| Method / signature | Return type | Typed example |
| --- | --- | --- |
| `rpcServer` property | `rpc.Server` | `const server: rpc.Server = client.rpcServer;` |
| `createRpcServer()` | `rpc.Server` | `const server: rpc.Server = client.createRpcServer();` |
| `createRpcClient()` | `RpcClient` | `const rpcClient: RpcClient = client.createRpcClient();` |
| `submitTransaction(xdrOrTx: string \| Transaction, signer: QueueSigner, opts?: RunOptions)` | `Promise<string>` transaction hash | `const hash: string = await client.submitTransaction(txXdr, signer, { skipSimulation: false });` |
| `healthCheck()` | `Promise<boolean>` | `const reachable: boolean = await client.healthCheck();` |
| `getHealthResult()` | `Promise<RpcHealthResult>` | `const health: RpcHealthResult = await client.getHealthResult();` |
| `onConnectionStatusChange(callback: ConnectionStatusCallback)` | `() => void` unsubscribe | `const unsubscribe: () => void = client.onConnectionStatusChange((status: ConnectionStatus) => console.log(status));` |
| `stopHealthChecks()` | `void` | `client.stopHealthChecks();` |
| `simulate(method: string, ...args: Array<xdr.ScVal \| Account>)` | `Promise<SimulationResult>` | `const result: SimulationResult = await client.simulate("create_post", nativeToScVal("G...", { type: "address" }), nativeToScVal("Hello"));` |
| `prepareTransaction(method: string, sourceAccount: Account, ...args: xdr.ScVal[])` | `Promise<Transaction>` | `const tx: Transaction = await client.prepareTransaction("follow", account, nativeToScVal("G...", { type: "address" }), nativeToScVal("G...", { type: "address" }));` |
| `buildMultiOpTx(sourceAccount: Account, ops: Array<{ method: string; args: xdr.ScVal[] }>)` | `Promise<Transaction>` | `const tx: Transaction = await client.buildMultiOpTx(account, [{ method: "follow", args: [nativeToScVal("G...", { type: "address" }), nativeToScVal("G...", { type: "address" })] }]);` |
| `batchSimulate(ops: Array<{ contractId?: string; method: string; args: xdr.ScVal[] }>)` | `Promise<Array<xdr.ScVal \| null>>` | `const results: Array<xdr.ScVal \| null> = await client.batchSimulate([{ method: "get_profile", args: [nativeToScVal("G...", { type: "address" })] }]);` |
| `executeReadResult<T>(fn: () => Promise<T \| null>)` | `Promise<ReadResult<T>>` | `const result: ReadResult<Profile> = await client.executeReadResult(() => client.getProfile("G..."));` |

The `simulate` example requires:

```ts
import { Account, nativeToScVal, rpc, Transaction } from "@stellar/stellar-sdk";
import type { xdr } from "@stellar/stellar-sdk";
import type {
  ConnectionStatus, LinkoraClient, QueueSigner, ReadResult, RpcClient,
  RpcHealthResult, SimulationResult,
} from "linkora-sdk";
```

### Read methods

All `bigint` and `number` values in signatures below are accepted exactly as
shown. Most missing entity reads resolve to `null`; list/count getters return
empty/zero values when the contract response is empty. Network and contract
errors still reject the promise.

| Method / signature | Return type | Typed example |
| --- | --- | --- |
| `getProfile(address: string)` | `Promise<Profile \| null>` | `const v: Profile \| null = await client.getProfile("G...");` |
| `getProfileCount()` | `Promise<bigint>` | `const v: bigint = await client.getProfileCount();` |
| `getAddressByUsername(username: string)` | `Promise<string \| null>` | `const v: string \| null = await client.getAddressByUsername("alice");` |
| `getPost(postId: number \| bigint)` | `Promise<Post \| null>` | `const v: Post \| null = await client.getPost(12n);` |
| `getPostCount()` | `Promise<bigint>` | `const v: bigint = await client.getPostCount();` |
| `getMaxPostContentLen()` | `Promise<number>` | `const v: number = await client.getMaxPostContentLen();` |
| `getLikeCount(postId: number \| bigint)` | `Promise<bigint>` | `const v: bigint = await client.getLikeCount(12n);` |
| `hasLiked(user: string, post_id: bigint)` | `Promise<boolean>` | `const v: boolean = await client.hasLiked("G...", 12n);` |
| `getPool(poolId: string)` | `Promise<Pool \| null>` | `const v: Pool \| null = await client.getPool("community");` |
| `getPoolAdmins(pool_id: string)` | `Promise<string[] \| null>` | `const v: string[] \| null = await client.getPoolAdmins("community");` |
| `getFollowers(user: string, offset: number, limit: number)` | `Promise<string[]>` | `const v: string[] = await client.getFollowers("G...", 0, 50);` |
| `getFollowing(user: string, offset: number, limit: number)` | `Promise<string[]>` | `const v: string[] = await client.getFollowing("G...", 0, 50);` |
| `getPostsByAuthor(author: string, offset: number, limit: number)` | `Promise<bigint[]>` | `const v: bigint[] = await client.getPostsByAuthor("G...", 0, 50);` |
| `fetchFollowersPage(user: string, opts?: { cursor?: string; pageSize?: number })` | `Promise<Page<string>>` | `const v: Page<string> = await client.fetchFollowersPage("G...", { pageSize: 50 });` |
| `fetchFollowingPage(user: string, opts?: { cursor?: string; pageSize?: number })` | `Promise<Page<string>>` | `const v: Page<string> = await client.fetchFollowingPage("G...", { pageSize: 50 });` |
| `fetchPostsByAuthorPage(author: string, opts?: { cursor?: string; pageSize?: number })` | `Promise<Page<bigint>>` | `const v: Page<bigint> = await client.fetchPostsByAuthorPage("G...", { pageSize: 50 });` |
| `iterateFollowers(user: string, opts?: PaginationOptions)` | `AsyncGenerator<string, void, unknown>` | `for await (const user: string of client.iterateFollowers("G...", { pageSize: 50 })) console.log(user);` |
| `iterateFollowing(user: string, opts?: PaginationOptions)` | `AsyncGenerator<string, void, unknown>` | `for await (const user: string of client.iterateFollowing("G...")) console.log(user);` |
| `iteratePostsByAuthor(author: string, opts?: PaginationOptions)` | `AsyncGenerator<bigint, void, unknown>` | `for await (const id: bigint of client.iteratePostsByAuthor("G...")) console.log(id);` |
| `getTreasury()` | `Promise<string \| null>` | `const v: string \| null = await client.getTreasury();` |
| `getFeeBps()` | `Promise<number>` | `const v: number = await client.getFeeBps();` |
| `getTipCooldownWindow()` | `Promise<number>` | `const v: number = await client.getTipCooldownWindow();` |
| `getContractVersion()` | `Promise<string>` | `const v: string = await client.getContractVersion();` |
| `verifyContractVersion(expectedVersion: string)` | `Promise<boolean>` | `const v: boolean = await client.verifyContractVersion("1");` |
| `getContractState()` | `Promise<ContractState>` | `const v: ContractState = await client.getContractState();` |
| `isPaused()` | `Promise<boolean>` | `const v: boolean = await client.isPaused();` |
| `govGetConfig()` | `Promise<GovConfig>` | `const v: GovConfig = await client.govGetConfig();` |
| `govGetProposal(proposalId: number \| bigint)` | `Promise<GovProposal>` | `const v: GovProposal = await client.govGetProposal(1n);` |
| `effectiveQuorum(proposalId: number \| bigint)` | `Promise<number>` | `const v: number = await client.effectiveQuorum(1n);` |
| `getDmKey(address: string)` | `Promise<Uint8Array \| null>` | `const v: Uint8Array \| null = await client.getDmKey("G...");` |
| `getClassicAccountBalances(address: string)` | `Promise<ClassicBalance[]>` | `const v: ClassicBalance[] = await client.getClassicAccountBalances("G...");` |
| `getClassicAccountTrustlines(address: string)` | `Promise<ClassicBalance[]>` | `const v: ClassicBalance[] = await client.getClassicAccountTrustlines("G...");` |
| `getRentExpiry(user: string)` | `Promise<number>` | `const v: number = await client.getRentExpiry("G...");` |
| `getRentRateBps()` | `Promise<number>` | `const v: number = await client.getRentRateBps();` |
| `getReportCount()` | `Promise<bigint>` | `const v: bigint = await client.getReportCount();` |
| `getReport(report_id: bigint)` | `Promise<Report \| null>` | `const v: Report \| null = await client.getReport(1n);` |

### Write-operation builders

These inherited or overridden methods produce an XDR string; they do not submit
the transaction. Bind the result to a `string` to see the intended type.

| Method / signature | Typed example |
| --- | --- |
| `setProfile(user: string, username: string, creatorToken: string)` | `const xdr: string = client.setProfile("G...", "alice", "C...");` |
| `deleteProfile(user: string)` | `const xdr: string = client.deleteProfile("G...");` |
| `createPost(author: string, content: string)` | `const xdr: string = client.createPost("G...", "Hello");` |
| `deletePost(author: string, postId: number \| bigint)` | `const xdr: string = client.deletePost("G...", 1n);` |
| `commitPost(author: string, contentHash: Uint8Array, revealTime: number \| bigint)` | `const xdr: string = client.commitPost("G...", new Uint8Array(32), 1700000000n);` |
| `revealPost(author: string, postId: number \| bigint, content: string)` | `const xdr: string = client.revealPost("G...", 1n, "the real content");` |
| `follow(follower: string, followee: string)` | `const xdr: string = client.follow("G...", "G...");` |
| `unfollow(follower: string, followee: string)` | `const xdr: string = client.unfollow("G...", "G...");` |
| `blockUser(blocker: string, blocked: string)` | `const xdr: string = client.blockUser("G...", "G...");` |
| `unblockUser(blocker: string, blocked: string)` | `const xdr: string = client.unblockUser("G...", "G...");` |
| `likePost(user: string, postId: number \| bigint)` | `const xdr: string = client.likePost("G...", 1n);` |
| `tip(tipper: string, postId: number \| bigint, token: string, amount: number \| bigint)` | `const xdr: string = client.tip("G...", 1n, "C...", 100n);` |
| `publishDmKey(user: string, x25519PubKey: Uint8Array)` | `const xdr: string = client.publishDmKey("G...", new Uint8Array(32));` |
| `createPool(admin: string, poolId: string, token: string, initialAdmins: string[], threshold: number \| bigint)` | `const xdr: string = client.createPool("G...", "community", "C...", ["G..."], 1);` |
| `poolDeposit(depositor: string, poolId: string, token: string, amount: number \| bigint)` | `const xdr: string = client.poolDeposit("G...", "community", "C...", 100n);` |
| `poolWithdraw(signers: string[], poolId: string, amount: number \| bigint, recipient: string, options?: { minOut?: number \| bigint; deadline?: number \| bigint })` | `const xdr: string = client.poolWithdraw(["G..."], "community", 100n, "G...", { minOut: 95n, deadline: 1700000000 });` |
| `addPoolAdmin(signers: string[], poolId: string, newAdmin: string)` | `const xdr: string = client.addPoolAdmin(["G..."], "community", "G...");` |
| `removePoolAdmin(signers: string[], poolId: string, admin: string)` | `const xdr: string = client.removePoolAdmin(["G..."], "community", "G...");` |
| `updatePoolThreshold(signers: string[], poolId: string, threshold: number \| bigint)` | `const xdr: string = client.updatePoolThreshold(["G..."], "community", 2);` |
| `setFee(feeBps: number \| bigint)` | `const xdr: string = client.setFee(100);` |
| `setTreasury(treasury: string)` | `const xdr: string = client.setTreasury("G...");` |
| `setTipCooldownWindow(cooldownLedgers: number \| bigint)` | `const xdr: string = client.setTipCooldownWindow(100n);` |
| `govPropose(proposer: string, parameter: GovParameter, newValue: number \| bigint, newAddress: string \| null)` | `const xdr: string = client.govPropose("G...", GovParameter.FeeBps, 100, null);` |
| `govVote(voter: string, proposalId: number \| bigint, support: boolean)` | `const xdr: string = client.govVote("G...", 1n, true);` |
| `govExecute(proposalId: number \| bigint)` | `const xdr: string = client.govExecute(1n);` |
| `govVeto(signers: string[], poolId: string, proposalId: number \| bigint)` | `const xdr: string = client.govVeto(["G..."], "community", 1n);` |
| `upgrade(newWasmHash: Uint8Array)` | `const xdr: string = client.upgrade(new Uint8Array(32));` |
| `initialize(admin: string, treasury: string, feeBps: number)` | `const xdr: string = client.initialize("G...", "G...", 100);` |
| `govInitConfig(quorum: number, timeLockLedgers: number, voteWindowLedgers: number, quorumDecayRateBps: number, quorumFloor: number)` | `const xdr: string = client.govInitConfig(10, 100, 500, 100, 5);` |
| `payRent(renter: string, amount: bigint)` | `const xdr: string = client.payRent("G...", 100n);` |
| `reportPost(reporter: string, postId: bigint, reason: string)` | `const xdr: string = client.reportPost("G...", 1n, "spam");` |
| `reviewReport(admin: string, reportId: bigint, decision: boolean)` | `const xdr: string = client.reviewReport("G...", 1n, true);` |
| `registerOracle(admin: string, oracle: string)` | `const xdr: string = client.registerOracle("G...", "G...");` |
| `setRentRateBps(admin: string, bps: number)` | `const xdr: string = client.setRentRateBps("G...", 100);` |
| `batchBumpUserGraph(admin: string, users: string[])` | `const xdr: string = client.batchBumpUserGraph("G...", ["G..."]);` |
| `migrateFollowGraph(users: string[])` | `const xdr: string = client.migrateFollowGraph(["G..."]);` |
| `verifyAnalyticsAttestation(oracleName: string, reportCbor: Uint8Array, signature: Uint8Array, creator: string, windowStart: number \| bigint, windowEnd: number \| bigint)` | `const xdr: string = client.verifyAnalyticsAttestation("ORACLE", new Uint8Array(), new Uint8Array(), "G...", 1n, 2n);` |
| `deployCreatorToken(params: DeployCreatorTokenParams, sourceAccount?: Account)` | `const xdr: string = client.deployCreatorToken({ deployer: "G...", name: "Alice Token", symbol: "ALC", decimals: 7, initialSupply: 1_000_000n });` |
| `setProfileWithNewToken(params: SetProfileWithNewTokenParams, sourceAccount?: Account)` | `const result: [string, string] = await client.setProfileWithNewToken({ user: "G...", username: "alice", tokenParams: { name: "Alice Token", symbol: "ALC", decimals: 7, initialSupply: 1_000_000n } });` |
| `simulateDeployCreatorToken(params: DeployCreatorTokenParams)` | `const id: string \| null = await client.simulateDeployCreatorToken({ deployer: "G...", name: "Alice Token", symbol: "ALC", decimals: 7, initialSupply: 1_000_000n });` |

`tokenFactoryId` must be present in the client configuration for creator-token
methods. The deployment helper produces an operation envelope; only use
`prepare*Tx` helpers or otherwise construct the transaction with the correct
source and sequence when signing and submitting it.

### Classic-account helper (`client.classic`)

The `classic` property is a `ClassicAccountClient` for direct Horizon queries.
`LinkoraClient.getClassicAccountBalances` and
`LinkoraClient.getClassicAccountTrustlines` are convenience wrappers.

| Method / signature | Return type | Typed example |
| --- | --- | --- |
| `getHorizonUrl()` | `string` | `const url: string = client.classic.getHorizonUrl();` |
| `getAccount(address: string)` | `Promise<ClassicAccountInfo>` | `const account: ClassicAccountInfo = await client.classic.getAccount("G...");` |
| `getAccountBalances(address: string)` | `Promise<ClassicBalance[]>` | `const balances: ClassicBalance[] = await client.classic.getAccountBalances("G...");` |
| `getAccountTrustlines(address: string)` | `Promise<ClassicBalance[]>` | `const trustlines: ClassicBalance[] = await client.classic.getAccountTrustlines("G...");` |

### Prepared, wallet-signable transaction helpers

Each helper returns `Promise<string>` containing an unsigned transaction
envelope with the actual account sequence and simulated Soroban resources. The
optional `horizonUrl` overrides the configured Horizon endpoint:

```ts
const xdr: string = await client.prepareCreatePostTx("G...", "Hello");
const signedXdr = await wallet.signTransaction(xdr);
const hash = await client.submitTransaction(signedXdr, wallet);
```

| Method / signature | Typed example |
| --- | --- |
| `prepareCreatePostTx(author: string, content: string, horizonUrl?: string)` | `const xdr: string = await client.prepareCreatePostTx("G...", "Hello");` |
| `prepareSetProfileTx(user: string, username: string, creatorToken: string, horizonUrl?: string)` | `const xdr: string = await client.prepareSetProfileTx("G...", "alice", "C...");` |
| `prepareDeletePostTx(author: string, postId: number \| bigint, horizonUrl?: string)` | `const xdr: string = await client.prepareDeletePostTx("G...", 1n);` |
| `prepareFollowTx(follower: string, followee: string, horizonUrl?: string)` | `const xdr: string = await client.prepareFollowTx("G...", "G...");` |
| `prepareUnfollowTx(follower: string, followee: string, horizonUrl?: string)` | `const xdr: string = await client.prepareUnfollowTx("G...", "G...");` |
| `prepareBlockUserTx(blocker: string, blocked: string, horizonUrl?: string)` | `const xdr: string = await client.prepareBlockUserTx("G...", "G...");` |
| `prepareUnblockUserTx(blocker: string, blocked: string, horizonUrl?: string)` | `const xdr: string = await client.prepareUnblockUserTx("G...", "G...");` |
| `prepareLikePostTx(user: string, postId: number \| bigint, horizonUrl?: string)` | `const xdr: string = await client.prepareLikePostTx("G...", 1n);` |
| `prepareTipTx(tipper: string, postId: number \| bigint, token: string, amount: number \| bigint, horizonUrl?: string)` | `const xdr: string = await client.prepareTipTx("G...", 1n, "C...", 100n);` |
| `prepareCreatePoolTx(admin: string, poolId: string, token: string, initialAdmins: string[], threshold: number \| bigint, horizonUrl?: string)` | `const xdr: string = await client.prepareCreatePoolTx("G...", "community", "C...", ["G..."], 1);` |
| `preparePoolDepositTx(depositor: string, poolId: string, token: string, amount: number \| bigint, horizonUrl?: string)` | `const xdr: string = await client.preparePoolDepositTx("G...", "community", "C...", 100n);` |
| `prepareIncreaseAllowanceTx(depositor: string, token: string, spender: string, amount: number \| bigint, horizonUrl?: string)` | `const xdr: string = await client.prepareIncreaseAllowanceTx("G...", "C...", "C...", 100n);` |
| `preparePoolWithdrawTx(signers: string[], poolId: string, amount: number \| bigint, recipient: string, horizonUrl?: string)` | `const xdr: string = await client.preparePoolWithdrawTx(["G..."], "community", 100n, "G...");` |
| `prepareCommitPostTx(author: string, contentHash: Uint8Array, revealTime: number \| bigint, horizonUrl?: string)` | `const xdr: string = await client.prepareCommitPostTx("G...", new Uint8Array(32), 1700000000n);` |
| `prepareRevealPostTx(author: string, postId: number \| bigint, content: string, horizonUrl?: string)` | `const xdr: string = await client.prepareRevealPostTx("G...", 1n, "the real content");` |
| `prepareAddPoolAdminTx(signers: string[], poolId: string, newAdmin: string, horizonUrl?: string)` | `const xdr: string = await client.prepareAddPoolAdminTx(["G..."], "community", "G...");` |
| `prepareRemovePoolAdminTx(signers: string[], poolId: string, admin: string, horizonUrl?: string)` | `const xdr: string = await client.prepareRemovePoolAdminTx(["G..."], "community", "G...");` |
| `prepareUpdatePoolThresholdTx(signers: string[], poolId: string, threshold: number \| bigint, horizonUrl?: string)` | `const xdr: string = await client.prepareUpdatePoolThresholdTx(["G..."], "community", 2);` |
| `prepareDmKeyTx(userAddress: string, x25519PubKey: Uint8Array, horizonUrl?: string)` | `const xdr: string = await client.prepareDmKeyTx("G...", new Uint8Array(32));` |
| `feeBumpTransaction(innerTx: Transaction \| string, feePayer: Keypair \| string, fee: string)` | `const bumped: FeeBumpTransaction = client.feeBumpTransaction(signedXdr, feePayer, "1000");` |
| `bumpSequence(source: string, bumpTo: string \| number \| bigint, horizonUrl?: string, fee?: string)` | `const tx: Transaction = await client.bumpSequence("G...", 123n);` |

`feeBumpTransaction` wraps an already signed transaction and still requires the
fee payer signature. `bumpSequence` returns an unsigned transaction. Account
sequence-sensitive writes should not be prepared concurrently from the same
stale account sequence.

### Public generated methods available through inheritance

The generated base client supplies these additional contract reads and writes;
they are public on `LinkoraClient`. Read methods return `Promise` values, while
write methods return operation XDR strings. The examples below use the base
class's exact argument and result types.

| Method | Return type | Typed example |
| --- | --- | --- |
| `isBlocked(blocker: string, blocked: string)` | `Promise<boolean>` | `const v: boolean = await client.isBlocked("G...", "G...");` |
| `getRentExpiry(user: string)` | `Promise<number>` | `const v: number = await client.getRentExpiry("G...");` |
| `getRentRateBps()` | `Promise<number>` | `const v: number = await client.getRentRateBps();` |
| `getReportCount()` | `Promise<bigint>` | `const v: bigint = await client.getReportCount();` |
| `getReport(report_id: bigint)` | `Promise<Report \| null>` | `const v: Report \| null = await client.getReport(1n);` |

The preceding read table already documents all other inherited getters. The
following inherited operation builders are not wrapped with prepared
transaction helpers; prepare a suitable source-account transaction yourself
before signing:

```ts
const operationXdr: string = client.initialize("G...", "G...", 100);
```

The operation list in the write-builder table includes both inherited and
overridden methods.

## `TransactionQueue`

`TransactionQueue` signs, simulates, submits and confirms queued transactions
in order. On a later-step failure it invokes earlier rollback callbacks in
reverse order (best effort). A queue run consumes its enqueued steps.

### Construction and lifecycle

```ts
import {
  TransactionQueue, createRpcClient, type QueueSigner, type TxStatusEvent,
} from "linkora-sdk";

const signer: QueueSigner = {
  async signTransaction(unsignedXdr: string): Promise<string> {
    return wallet.signTransaction(unsignedXdr);
  },
};
const queue = new TransactionQueue({
  signer,
  rpc: createRpcClient(rpcUrl, networkPassphrase),
  networkPassphrase,
  pollIntervalMs: 2_000,
  maxPollAttempts: 30,
  rpcTimeoutMs: 10_000,
  stepTimeoutMs: 60_000,
});

queue.on("status", (event: TxStatusEvent) => console.log(event.index, event.status));
queue.enqueue(preparedXdr, () => console.log("Compensate a previous step"));
await queue.run();
console.log(queue.submittedHashes);
```

### Queue API

| API | Signature and behavior | Typed example |
| --- | --- | --- |
| Constructor | `new TransactionQueue(config: TransactionQueueConfig)` | `const queue: TransactionQueue = new TransactionQueue({ signer, rpc });` |
| `on` | `on("status", listener: TxStatusListener): this` | `queue.on("status", (event: TxStatusEvent) => console.log(event.status));` |
| `enqueue` | `enqueue(xdr: string, rollback?: () => Promise<void> \| void, stepTimeoutMs?: number): this` | `queue.enqueue(txXdr, async () => { await undoStep(); }, 15_000);` |
| `run` | `run(opts?: RunOptions): Promise<void>` | `await queue.run({ dryRun: true, stepTimeoutMs: 15_000 });` |
| `resume` | `resume(opts?: RunOptions): Promise<number>`; reload persisted state, reconcile submitted work, return count requeued | `const resumed: number = await queue.resume();` |
| `isCircuitOpen` | `boolean` getter | `const open: boolean = queue.isCircuitOpen;` |
| `submittedHashes` | `readonly string[]` getter, in order for the most recent run | `const hashes: readonly string[] = queue.submittedHashes;` |

`TransactionQueueConfig` takes `signer` and `rpc` plus optional
`networkPassphrase`, `pollIntervalMs` (2,000), `maxPollAttempts` (30),
`rpcTimeoutMs` (10,000), `stepTimeoutMs`, `dryRun`, `retry`, `logger`,
`random` (for jitter injection), and `persistence`. `RunOptions` can override
`dryRun` and `stepTimeoutMs`, and accepts `skipSimulation`; simulation is
always performed in dry-run mode.

Status events have `index`, `xdr`, and `status`, and may include `hash`,
`error`, `resourceFee`, or `dryRun`. Status is one of `pending`, `simulated`,
`submitted`, `confirmed`, `failed`, `unconfirmed`, or `lost`. A dry-run emits
`confirmed` with `dryRun: true` and no transaction hash; do not interpret it as
an on-chain confirmation.

Retry defaults are configurable via `retry` or environment variables:
`TX_RETRY_MAX_ATTEMPTS` (5), `TX_RETRY_BASE_DELAY_MS` (1000),
`TX_RETRY_MAX_DELAY_MS` (30000), `TX_RETRY_JITTER_FACTOR` (0.5),
`TX_RETRY_CIRCUIT_BREAKER_THRESHOLD` (5). A circuit breaker pauses
submissions after repeated retryable failures; use `queue.isCircuitOpen` and
the optional retry `logger` to report health.

For restart recovery, implement `QueuePersistence` with `save(state)`,
`load()`, and `clear()`, then pass it as `persistence`. Persisted entries
contain transaction XDR, status, optional hash/resource fee/step timeout, and a
save timestamp. Rollback functions cannot be restored after restart.

## Event subscription API

`LinkoraEventSubscriber` reads contract events from Soroban RPC polling or an
optional WebSocket endpoint. Handlers receive a discriminated `LinkoraEvent`
union and therefore narrow payload types from the event's `type` field.

```ts
import {
  LinkoraEventSubscriber, MemoryCursorStore, type LinkoraEvent,
} from "linkora-sdk";

const subscriber = new LinkoraEventSubscriber({
  rpcUrl,
  contractId,
  cursorStore: new MemoryCursorStore(),
  startLedger: 0,
});

const unsubscribe = subscriber.subscribe({
  post_created: async (event) => {
    const created: LinkoraEvent = event;
    console.log(created.id, created.author);
  },
  like: (event) => console.log(event.user, event.post_id),
});

await subscriber.start();
// Later:
unsubscribe();
await subscriber.stop();
```

`LinkoraEventSubscriberConfig` requires `rpcUrl` and `contractId`; optionally
specify `cursorStore`, `cursorKeyOrPath`, `startLedger`, `pageLimit` (100),
`minPollIntervalMs` (100), `maxPollIntervalMs` (5000), `webSocketUrl`,
`webSocketFactory`, and `timeoutMs` (30,000). `subscribe(handlers)` returns an
unsubscribe function, `start(fromCursor?)` starts the background loop,
`stop()` stops it and waits for cleanup, and `destroy()` also clears handler
and cursor state; after `destroy`, do not restart the instance.

Cursor store exports are `CursorStore`, `MemoryCursorStore`,
`LocalStorageCursorStore`, `SecureStoreCursorStore`, `FileCursorStore`,
`SecureStoreAdapter`, and `createDefaultCursorStore(keyOrPath?)`. The default
store selects browser local storage, available Expo SecureStore, Node file
storage, or memory storage.

For raw event payloads, `parseEvent(raw, { tokenFactoryId? })` and
`parseContractEvent(raw, tokenFactoryId?)` return `LinkoraEvent | null`.
`eventSource(raw, tokenFactoryId?)` resolves the emitting contract. Use the
`LinkoraEvent` discriminant and `meta` (ledger, contract, transaction hash,
cursor and raw event) to process the typed events.

## Error handling

SDK methods reject promises for failures; catch errors at application
boundaries. SDK errors extend `LinkoraError`, which includes `code`,
optional `details`, and `originalError`. `mapError(error)` maps transport and
contract failures to SDK errors.

```ts
import {
  LinkoraError, NetworkError, NotFoundError, SimulationError, ValidationError,
  mapError,
} from "linkora-sdk";

try {
  const post = await client.getPost(123n);
  if (post === null) console.info("Post does not exist");
} catch (error: unknown) {
  const mapped = error instanceof LinkoraError ? error : mapError(error);
  if (mapped instanceof NetworkError) {
    console.error("RPC/Horizon unavailable:", mapped.message, mapped.details);
  } else if (mapped instanceof SimulationError) {
    console.error("Contract simulation failed:", mapped.message, mapped.eventLog);
  } else if (mapped instanceof ValidationError) {
    console.error("Invalid input:", mapped.details);
  } else if (mapped instanceof NotFoundError) {
    console.info("Resource not found");
  } else {
    throw mapped;
  }
}
```

Common exported errors include `NotFoundError`, `UnauthorizedError`,
`InsufficientBalanceError`, `CooldownError`, `InvalidManifestError`,
`SimulationError`, `ValidationError`, `InvalidInputError` (deprecated),
`NetworkError`, `SigningError`, `TimeoutError`, `RetryExhaustedError`,
`ContractError`, `CircuitBreakerError`, `VersionMismatchError`, and
`InvalidSignedTransactionError`. Reads such as `getProfile`, `getPost`,
`getPool`, `getDmKey`, `getTreasury`, and `getReport` represent absence with
`null`; use `executeReadResult` for an explicit `{ ok, value/error, absent }`
result instead of exception-based handling.

## TypeScript exports

Import public API values and types from `linkora-sdk`; the package root
re-exports generated contract types, client, errors, queue, event,
pagination, configuration, health, validation, signer, transaction, and
direct-message APIs. Key types and exports include:

- Client/config: `LinkoraClient`, `ClientConfig`, `DeployCreatorTokenParams`,
  `SetProfileWithNewTokenParams`, `ClassicAccountClient`, `ClassicAccountInfo`,
  `ClassicBalance`, `ClassicAccountConfig`.
- Contract data: `Profile`, `Post`, `Pool`, `Proposal`, `GovConfig`,
  `GovProposal`, `GovParameter`, `GovStatus`, `Report`, `ReportStatus`,
  `ProposalStatus`, `StorageKey`, `ContractState`.
- Queue/submission: `TransactionQueue`, `TransactionQueueConfig`,
  `RunOptions`, `QueueStep`, `QueueSigner`, `RpcClient`, `SimulationResult`,
  `TxStatus`, `TxStatusEvent`, `TxStatusListener`, `QueuePersistence`,
  `PersistedQueueState`, `PersistedQueueStep`, `createRpcClient`,
  `createRpcClientAdapter`, `submitTransaction`.
- Events: `LinkoraEventSubscriber`, `LinkoraEventSubscriberConfig`,
  `LinkoraEventHandlers`, `LinkoraEvent`, `SorobanEvent`, `EventSource`,
  `EventParserOptions`, `parseEvent`, `parseContractEvent`, `eventSource`.
- Pagination/cursors: `Page<T>`, `PaginationOptions`, `encodeCursor`,
  `decodeCursor`, `paginateList`, `fetchPageWithCursor`, `CursorStore`,
  `createDefaultCursorStore`.
- Errors and utilities: `LinkoraError`, `ReadResult<T>`, all error classes
  listed above, `ContractErrorCode`, `RetryConfig`, `DEFAULT_RETRY_CONFIG`,
  `loadRetryConfig`, `resolveRetryConfig`, `ConnectionHealthMonitor`,
  `ConnectionStatus`, `ConnectionStatusCallback`, `RpcHealthResult`,
  `Signer`, and `TransactionLike`.

For a complete version-specific declaration surface, use the installed
package's `.d.ts` files; generated contract types are derived from the
deployed contract ABI and can evolve between releases.

## Migration guide

When upgrading from older SDK integrations, check these breaking-behavior
changes and migrate call sites accordingly:

1. **Use prepared transaction helpers for wallet submission.** Base write
   builders produce placeholder-source XDR and are intended for operation
   composition, not direct signing/submission. Replace direct calls such as
   `client.createPost(...)` with `await client.prepareCreatePostTx(...)`,
   then sign and submit the prepared envelope.
2. **Use `bigint` for contract-sized integers.** IDs and token amounts may
   exceed JavaScript's safe integer range. Pass `bigint` (for example `42n`)
   and convert to display strings with `.toString()`.
3. **Handle missing reads as nullable values.** Methods for optional entities
   resolve `null` rather than requiring callers to interpret thrown
   `NotFoundError`; update strict TypeScript checks before dereferencing.
4. **Choose network configuration explicitly.** The client defaults to
   Testnet when the passphrase is omitted. Set the RPC URL, exact passphrase,
   and Horizon URL together when changing networks; custom networks require
   an explicit Horizon endpoint.
5. **Account for dry-run queue status semantics.** A dry-run may emit a
   `confirmed` status, but it has `dryRun: true` and no hash. Check this flag
   before treating a step as broadcast or confirmed on-chain.
6. **Update retry and HTTP security configuration.** Retry tunables now use
   `retry`/the documented `TX_RETRY_*` variables. Plain HTTP is off by default;
   set `allowHttp: true` only for loopback development RPC endpoints.
7. **Use typed event names and lifecycle cleanup.** Subscribe by event
   discriminant, keep the unsubscribe callback, then `await subscriber.stop()`
   during shutdown. For durable cursors, configure an explicit cursor store.

Review the changelog and the installed package declarations for the release
being upgraded; this guide describes current behavior, not a guarantee that
every past release introduced every item above.
