/**
 * On-chain like submission.
 *
 * Liking is idempotent on-chain: a second call by the same liker is rejected,
 * which is why the UI disables the button after the first like.
 *
 * Replace the body with the generated SDK call once the client is wired up
 * (`client.like_post({ liker, post_id })`).
 */
export async function submitLikeTransaction(
  _liker: string,
  _postId: string | number
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 600));
}
