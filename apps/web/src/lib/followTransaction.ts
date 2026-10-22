import { Address } from "@stellar/stellar-sdk";
import { config } from "@/config";
import { buildSignAndSubmit, type TransactionConfig } from "./tx";

export interface FollowTransactionInput {
  follower: string;
  followee: string;
  /** `true` submits `follow`, `false` submits `unfollow`. */
  isFollowing: boolean;
}

export interface FollowTransactionOverrides extends Partial<TransactionConfig> {
  /** Maximum time to wait for on-chain confirmation, in ms. */
  timeout?: number;
}

/**
 * Builds, signs and submits the on-chain `follow` / `unfollow` contract call.
 *
 * Kept separate from the mutation hook so the optimistic-update logic can be
 * unit tested with an injected submit function, and so the profile page and
 * the follow list share one transaction path.
 */
export async function submitFollowTransaction(
  { follower, followee, isFollowing }: FollowTransactionInput,
  overrides: FollowTransactionOverrides = {}
) {
  return buildSignAndSubmit(
    isFollowing ? "follow" : "unfollow",
    [Address.fromString(follower).toScVal(), Address.fromString(followee).toScVal()],
    follower,
    {
      contractId: overrides.contractId ?? config.contractId,
      rpcUrl: overrides.rpcUrl ?? config.sorobanRpcUrl,
      networkPassphrase: overrides.networkPassphrase ?? config.networkPassphrase,
    },
    overrides.timeout
  );
}
