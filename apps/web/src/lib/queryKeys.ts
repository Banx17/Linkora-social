/**
 * Central registry of TanStack Query cache keys.
 *
 * Keeping the keys in one module makes it impossible for an optimistic
 * `onMutate` handler to update a key that a consuming component is not
 * subscribed to.
 */

export const queryKeys = {
  /** Feed posts, including optimistic creations and deletions. */
  posts: ["posts"] as const,

  /** Whether `follower` follows `followee`, plus the follower counts shown on
   * the profile header. */
  followState: (follower: string | null, followee: string) =>
    ["follow-state", follower ?? "anonymous", followee] as const,

  /** Optimistic like state for one post by one user. */
  postLike: (user: string | null, postId: string | number) =>
    ["post-like", user ?? "anonymous", String(postId)] as const,

  /** In-flight pool deposit marker used to render the "pending" badge. */
  poolDeposit: (poolId: string) => ["pool-deposit", poolId] as const,
} as const;
