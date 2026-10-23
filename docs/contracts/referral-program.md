# Referral Program

Issue: #1773

On-chain referral program with a configurable reward split. Users register a
referral code, new wallets attribute themselves to a code once, and the
referrer receives a configurable share (default 10%) of the referred user's
first tip.

The program lives in its own contract:
`packages/contracts/contracts/linkora-referral` (`LinkoraReferral`).

## Flow

1. A user registers a referral code: `register_code(user, code)`.
2. A new wallet attributes itself to that code: `register_with_code(user, code)`.
3. When the referred wallet earns its first tip, the referrer is paid:
   `claim_reward(referred, tip_amount)`.

## Contract API

| Entrypoint | Arguments | Notes |
| --- | --- | --- |
| `initialize` | `admin: Address, token: Address` | Sets the governance admin and the SEP-41 token used for rewards. Default rate: 1000 bps (10%). |
| `register_code` | `user: Address, code: String` | Registers a unique code (3-32 chars). One code per wallet. |
| `register_with_code` | `user: Address, code: String` | Attributes `user` to the code owner. One use per wallet, ever. |
| `claim_reward` | `referred: Address, tip_amount: i128` | Pays `tip_amount * rate_bps / 10_000` from the referred wallet to the referrer. First tip only. |
| `set_referral_rate` | `new_rate_bps: u32` | Governance/admin only. Max 10_000 bps (100%). |
| `get_referral_rate` | — | Current rate in basis points. |
| `get_code_owner` | `code: String` | Owner of a code, or `None`. |
| `get_code_of` | `user: Address` | Code registered by a wallet, or `None`. |
| `get_referrer` | `user: Address` | Referrer of a wallet, or `None`. |
| `get_rewarded` | `user: Address` | Whether the first-tip reward was already paid. |
| `referral_reward_amount` | `tip_amount: i128, rate_bps: u32` | Pure helper for the reward split. |

## Reward split

```
reward_amount = tip_amount * rate_bps / 10_000
```

With the default rate of 1000 bps, a 1_000 token tip pays 100 tokens to the
referrer.

## Revert conditions

| Message | Cause |
| --- | --- |
| `already initialized` | `initialize` called twice. |
| `code must not be empty` | Empty referral code. |
| `code must be 3-32 characters` | Referral code outside the allowed length. |
| `code already registered` | The code is owned by another wallet. |
| `user already registered a code` | The wallet already owns a code. |
| `referral code not found` | The used code does not exist. |
| `user already has a referrer` | The wallet already used a code (anti-abuse). |
| `cannot refer yourself` | Self-attribution. |
| `user has no referrer` | `claim_reward` for a wallet without attribution. |
| `referral reward already paid` | The first-tip reward was already paid (anti-abuse). |
| `referral reward is zero` | The computed reward rounds down to zero. |
| `tip amount must be positive` | Non-positive tip amount. |
| `referral rate must be at most 10000 bps` | Rate above 100%. |

## Events

| Event | Topics | Data |
| --- | --- | --- |
| `referral_registered` | version, user, code | referred |
| `referral_reward_paid` | version, referrer, referred | tip_amount, reward_amount, rate_bps |
| `referral_rate_updated` | version | old_rate_bps, new_rate_bps |

`referral_registered` is emitted both when a code is registered (`referred` is
the code owner) and when a wallet attributes itself to a code (`user` is the
code owner, `referred` is the attributed wallet).

## Anti-abuse

- A wallet can only use one referral code, ever (`register_with_code` reverts
  on a second attempt).
- A wallet cannot refer itself.
- Only the first tip of a referred wallet is eligible for the reward
  (`referral reward already paid`).
- Codes are unique and a wallet owns at most one code.

## Tests

`packages/contracts/contracts/linkora-referral/src/test.rs` covers code
registration and uniqueness, attribution, one-use-per-wallet, self-referral
rejection, the basis-point reward split, first-tip-only rewards, the
governance rate update and the emitted events.
