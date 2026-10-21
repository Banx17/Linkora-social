# Pool Withdrawal Slippage Protection

`pool_withdraw` accepts two optional guard parameters:

```rust
pub fn pool_withdraw(
    env: Env,
    signers: Vec<Address>,
    pool_id: Symbol,
    amount: i128,
    recipient: Address,
    min_out_amount: Option<i128>,
    deadline: Option<u64>,
);
```

Both parameters are `Option`s, so existing callers (and existing clients) keep
working: omitting them preserves the previous behaviour.

## Slippage formula

The amount actually delivered to `recipient` is:

```
received = requested - requested * withdrawal_fee_bps / 10_000
```

`withdrawal_fee_bps` is currently `0` — pools are multisig treasuries that
move tokens 1:1, so a withdrawal carries no price impact and no fee (the
protocol fee only applies to tips). The fee term is kept explicit, and is
subtracted in exactly one place (`pool_withdraw_received_amount` in
`packages/contracts/contracts/linkora-contracts/src/lib.rs`), so the tiered
pool fee model can plug its rate in without touching the guard below.

The withdrawal reverts with `"slippage exceeded"` when:

```
received < min_out_amount
```

`min_out_amount` is therefore the *minimum received*, not the requested
amount. With today's fee-free pools `received == requested`, so the guard
rejects a withdrawal whose floor cannot be met; once withdrawal fees exist it
automatically accounts for them.

## Deadline

`deadline` is a Unix timestamp. The withdrawal reverts with
`"deadline expired"` when:

```
ledger.timestamp > deadline
```

The deadline is checked before the pool is loaded and before the admin
signatures are collected, so a stale transaction fails fast instead of
prompting for signatures that can no longer be used.

## Revert messages

| Condition | Panic message |
| --- | --- |
| `received < min_out_amount` | `slippage exceeded` |
| `ledger.timestamp > deadline` | `deadline expired` |

## `withdrawal_slippage_exceeded` event

The failing withdrawal publishes the event before reverting:

```rust
#[contractevent(topics = ["withdrawal_slippage_exceeded"])]
pub struct WithdrawalSlippageExceededEvent {
    #[topic]
    pub version: u32,
    #[topic]
    pub pool_id: Symbol,
    pub requested_amount: i128,
    pub received_amount: i128,
    pub min_out_amount: i128,
}
```

Soroban rolls the events of a failed invocation back with the invocation, so
this event is **not** part of the committed ledger events of a reverted
transaction. It is observable in the failed-call diagnostics (simulation
output, RPC error diagnostics) and in tests through the host event buffer.
Indexers that watch committed events will not see it.

## SDK

```ts
// Slippage protection: the withdrawal fails if the pool would deliver less
// than 495 tokens, and only before the given Unix timestamp.
const tx = client.poolWithdraw(
  ["GBFOY...", "GCO23..."],
  "my-pool-1",
  500n,
  "GDX...",
  { minOut: 495n, deadline: 1700000000 }
);

// No guard: behaves exactly like the previous signature.
const txNoGuard = client.poolWithdraw(["GBFOY...", "GCO23..."], "my-pool-1", 500n, "GDX...");
```

`minOut` is encoded as `Option<i128>` and `deadline` as `Option<u64>`: `None`
is sent as `ScVal::Void`, `Some(x)` as the bare value.
