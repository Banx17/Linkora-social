/**
 * Feed data-access for the `/feed` page.
 *
 * Issue #1736 renders the feed with React 19's `use()` hook so the first paint
 * streams in behind a `<Suspense>` boundary instead of blocking the whole page
 * on the indexer round-trip. To make that safe, the promise factories in this
 * module **never reject**: failures are encoded in the resolved snapshot, so a
 * flaky indexer degrades to an inline error instead of tearing down the tree
 * through an error boundary.
 */

import type { Post } from "@/components/PostCard";

export const FEED_PAGE_SIZE = 20;

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";

export type FeedTab = "for-you" | "following";

export interface FeedSnapshot {
  posts: Post[];
  cursor: string | null;
  hasMore: boolean;
  error: string | null;
  /** True for the server prerender pass, where the indexer is unreachable. */
  pending: boolean;
}

export const EMPTY_SNAPSHOT: FeedSnapshot = {
  posts: [],
  cursor: null,
  hasMore: false,
  error: null,
  pending: false,
};

export const WALLET_REQUIRED_MESSAGE = "Connect your wallet to see your Following feed.";

interface FeedPage {
  posts: Post[];
  nextCursor: string | null;
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Failed to load feed. Please try again.";
}

/** Fetch the global / "For You" feed from the indexer. */
async function fetchForYouPage(cursor: string | null): Promise<FeedPage> {
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  const res = await fetch(`${INDEXER_URL}/api/posts?limit=${FEED_PAGE_SIZE}${cursorQuery}`);
  if (!res.ok) throw new Error(`Indexer returned ${res.status}`);
  const data = await res.json();
  const posts: Post[] = data.posts ?? [];
  return { posts, nextCursor: data.cursor ?? null };
}

/**
 * Fetch the Following feed for a given user address.
 *
 * Primary path: one indexer call returns the merged, pre-sorted page, so the
 * number of requests stays bounded no matter how many accounts the user
 * follows (the N+1 fan-out was fixed in #1296 and is guarded by an E2E
 * request-count regression test).
 *
 * Legacy fallback: deployments that only return a `following` address list are
 * still supported by fanning out per followee, as the previous implementation
 * did.
 */
async function fetchFollowingPage(userAddress: string, cursor: string | null): Promise<FeedPage> {
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  const res = await fetch(
    `${INDEXER_URL}/api/feed/following/${encodeURIComponent(userAddress)}?limit=${FEED_PAGE_SIZE}${cursorQuery}`
  );
  if (!res.ok) throw new Error("Failed to fetch following list");
  const data = await res.json();

  if (Array.isArray(data.posts)) {
    return { posts: data.posts as Post[], nextCursor: data.cursor ?? null };
  }

  const followingList: string[] = data.following ?? [];
  const nextCursor: string | null = data.cursor ?? null;

  if (followingList.length === 0) {
    return { posts: [], nextCursor: null };
  }

  const postsArrays = await Promise.all(
    followingList.map(async (addr) => {
      const postsRes = await fetch(
        `${INDEXER_URL}/api/posts?author=${encodeURIComponent(addr)}&limit=${FEED_PAGE_SIZE}`
      );
      if (!postsRes.ok) return [] as Post[];
      const postsData = await postsRes.json();
      return (postsData.posts ?? []) as Post[];
    })
  );

  const merged = postsArrays
    .flat()
    .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
    .slice(0, FEED_PAGE_SIZE);

  return { posts: merged, nextCursor };
}

/**
 * Resolve a feed snapshot for one page. Never rejects.
 */
export async function fetchFeedSnapshot(
  tab: FeedTab,
  address: string | null,
  options: { cursor?: string | null } = {}
): Promise<FeedSnapshot> {
  const cursor = options.cursor ?? null;

  if (tab === "following" && !address) {
    return { ...EMPTY_SNAPSHOT, error: WALLET_REQUIRED_MESSAGE };
  }

  try {
    const { posts, nextCursor } =
      tab === "for-you"
        ? await fetchForYouPage(cursor)
        : await fetchFollowingPage(address as string, cursor);

    return {
      posts,
      cursor: nextCursor,
      hasMore: posts.length >= FEED_PAGE_SIZE,
      error: null,
      pending: false,
    };
  } catch (err) {
    return { ...EMPTY_SNAPSHOT, error: toErrorMessage(err) };
  }
}

/**
 * Promise factory consumed by `use()`.
 *
 * During the server prerender pass (and at build time) the indexer is not
 * reachable, so we hand back an immediately resolved "pending" snapshot and let
 * the client do the real fetch after hydration. Without this guard `next build`
 * would block on a localhost connection that never answers.
 */
export function getFeedSnapshotPromise(tab: FeedTab, address: string | null): Promise<FeedSnapshot> {
  if (typeof window === "undefined") {
    return Promise.resolve({ ...EMPTY_SNAPSHOT, pending: true });
  }
  return fetchFeedSnapshot(tab, address);
}
