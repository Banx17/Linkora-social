"use client";

/**
 * /feed — main feed page with "For You" and "Following" tabs.
 *
 * Fix for issue #1580:
 *  - Removed the broken Server Component shell that referenced undeclared
 *    identifiers (followingRes, allFetchedPosts) and non-existent modules
 *    (@/lib/auth, @/lib/persist, @/lib/posts, @/lib/following, @/constants,
 *    @/config.indexerUrl).
 *  - Replaced with a client component that owns both feed tabs and performs
 *    the fan-out fetch correctly (Promise.all awaited and consumed).
 *  - setPosts / persistFeed called exactly once per successful fetch.
 *  - Cursor is kept independently per tab so switching tabs does not reset
 *    the other tab's pagination state.
 *
 * Issue #1724 adds:
 *  - IntersectionObserver-driven infinite scroll (with a manual button
 *    fallback for slow connections and browsers without the observer),
 *  - skeletons for the next page that reserve layout space (no CLS),
 *  - a "Return to top" FAB,
 *  - polite aria-live announcements for appended pages.
 *
 * Pagination state lives in `useInfiniteFeed`, a local cursor-based hook. The
 * repo has no TanStack Query provider and the issue forbids new dependencies,
 * so the hook intentionally mirrors `useInfiniteQuery`'s API.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { PostCard, type Post } from "@/components/PostCard";
import { PostCardSkeleton } from "@/components/PostCard";
import { InfiniteScroll } from "@/components/InfiniteScroll";
import { ReturnToTop } from "@/components/ReturnToTop";
import { useInfiniteFeed, type CursorPage } from "@/hooks/useInfiniteFeed";
import { useSlowConnection } from "@/hooks/useSlowConnection";

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";
const PAGE_SIZE = 20;

type FeedTab = "for-you" | "following";

// Stable identity functions so page de-duplication does not re-run needlessly.
const getPostId = (post: Post) => post.id;

// ---------------------------------------------------------------------------
// Data-fetching helpers
// ---------------------------------------------------------------------------

/** Fetch the global / "For You" feed from the indexer. */
async function fetchForYouPage(cursor: string | null): Promise<{
  posts: Post[];
  nextCursor: string | null;
}> {
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  const res = await fetch(`${INDEXER_URL}/api/posts?limit=${PAGE_SIZE}${cursorQuery}`);
  if (!res.ok) throw new Error(`Indexer returned ${res.status}`);
  const data = await res.json();
  const posts: Post[] = data.posts ?? [];
  return { posts, nextCursor: data.cursor ?? null };
}

/**
 * Fetch the Following feed for a given user address.
 *
 * Strategy:
 *  1. Fetch the user's following list (paginated by cursor).
 *  2. Fan out one GET /api/posts?author=<addr> per followee in parallel.
 *  3. Merge, sort by timestamp desc, return the first PAGE_SIZE entries.
 */
async function fetchFollowingPage(
  userAddress: string,
  cursor: string | null
): Promise<{ posts: Post[]; nextCursor: string | null }> {
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  const followingRes = await fetch(
    `${INDEXER_URL}/api/feed/following/${userAddress}?limit=${PAGE_SIZE}${cursorQuery}`
  );
  if (!followingRes.ok) throw new Error("Failed to fetch following list");
  const followingData = await followingRes.json();
  const followingList: string[] = followingData.following ?? [];
  const nextCursor: string | null = followingData.cursor ?? null;

  if (followingList.length === 0) {
    return { posts: [], nextCursor: null };
  }

  // Fan out in parallel — await the full array.
  const postsArrays = await Promise.all(
    followingList.map(async (addr) => {
      const postsRes = await fetch(
        `${INDEXER_URL}/api/posts?author=${encodeURIComponent(addr)}&limit=${PAGE_SIZE}`
      );
      if (!postsRes.ok) return [] as Post[];
      const data = await postsRes.json();
      return (data.posts ?? []) as Post[];
    })
  );

  const allPosts = postsArrays
    .flat()
    .sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))
    .slice(0, PAGE_SIZE);

  return { posts: allPosts, nextCursor };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function FeedPage() {
  const { address: userAddress } = useWallet();
  const [activeTab, setActiveTab] = useState<FeedTab>("for-you");
  const isSlowConnection = useSlowConnection();

  // Announced by a visually hidden aria-live region after a page is appended.
  const [announcement, setAnnouncement] = useState("");
  // Item count before the in-flight "next page" request; null when idle.
  const announceBaselineRef = useRef<number | null>(null);
  // Focus target for the return-to-top FAB.
  const topRef = useRef<HTMLElement>(null);

  const forYouQuery = useInfiniteFeed<Post>({
    queryKey: ["feed", "for-you"],
    queryFn: async (cursor): Promise<CursorPage<Post>> => {
      const { posts, nextCursor } = await fetchForYouPage(cursor);
      return { items: posts, nextCursor };
    },
    getItemId: getPostId,
  });

  const followingNeedsWallet = activeTab === "following" && !userAddress;

  const followingQuery = useInfiniteFeed<Post>({
    queryKey: ["feed", "following", userAddress ?? "disconnected"],
    queryFn: async (cursor): Promise<CursorPage<Post>> => {
      if (!userAddress) return { items: [], nextCursor: null };
      const { posts, nextCursor } = await fetchFollowingPage(userAddress, cursor);
      return { items: posts, nextCursor };
    },
    enabled: activeTab === "following" && Boolean(userAddress),
    getItemId: getPostId,
  });

  const feed = activeTab === "for-you" ? forYouQuery : followingQuery;
  const { items, isFetchingNextPage, hasNextPage, fetchNextPage, retry } = feed;

  const handleLoadMore = useCallback(() => {
    if (isFetchingNextPage || !hasNextPage || feed.isError) return;

    announceBaselineRef.current = items.length;
    fetchNextPage();
  }, [feed.isError, fetchNextPage, hasNextPage, isFetchingNextPage, items.length]);

  const handleRetry = useCallback(() => {
    if (isFetchingNextPage) return;

    announceBaselineRef.current = items.length;
    retry();
  }, [isFetchingNextPage, items.length, retry]);

  // Announce only appended pages: never the initial page, never a page twice,
  // and not a failed request (the inline retry describes the failure itself).
  useEffect(() => {
    const baseline = announceBaselineRef.current;
    if (baseline === null || isFetchingNextPage) return;

    announceBaselineRef.current = null;

    if (feed.isError || items.length <= baseline) return;
    const added = items.length - baseline;
    setAnnouncement(`${added} more ${added === 1 ? "post" : "posts"} loaded`);
  }, [feed.isError, isFetchingNextPage, items.length]);

  const handleTabChange = (tab: FeedTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setAnnouncement("");
    announceBaselineRef.current = null;
  };

  const feedErrorMessage = followingNeedsWallet
    ? "Connect your wallet to see your Following feed."
    : feed.isError && items.length === 0
      ? (feed.error?.message ?? "Failed to load feed. Please try again.")
      : null;

  const showInitialSkeleton = feed.isLoading && items.length === 0;
  const showEmptyState = !showInitialSkeleton && items.length === 0 && !feedErrorMessage;

  return (
    <>
      <main
        ref={topRef}
        id="feed-top"
        tabIndex={-1}
        aria-label="Feed"
        className="mx-auto max-w-2xl px-4 py-6 pb-24 md:pb-6"
      >
        {/*
          Visually hidden live region. The initial page is never announced;
          only appended pages write text here.
        */}
        <div
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="feed-announcer"
        >
          {announcement}
        </div>

        {/* Tab switcher */}
        <div
          role="tablist"
          aria-label="Feed tabs"
          className="mb-6 flex border-b border-[var(--border)]"
        >
          {(["for-you", "following"] as FeedTab[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`tabpanel-${tab}`}
              id={`tab-${tab}`}
              onClick={() => handleTabChange(tab)}
              className={[
                "px-5 py-2.5 text-sm font-semibold capitalize transition-colors",
                "border-b-2 -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                activeTab === tab
                  ? "border-violet-500 text-violet-400"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]",
              ].join(" ")}
              data-testid={`tab-${tab}`}
            >
              {tab === "for-you" ? "For You" : "Following"}
            </button>
          ))}
        </div>

        {/* Tab panel */}
        <section
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          data-testid={`tabpanel-${activeTab}`}
        >
          {feedErrorMessage && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400"
              data-testid="feed-error"
            >
              {feedErrorMessage}
            </div>
          )}

          {showInitialSkeleton ? (
            <div data-testid="loading-indicator" className="space-y-4">
              <PostCardSkeleton />
              <PostCardSkeleton />
              <PostCardSkeleton />
            </div>
          ) : showEmptyState ? (
            <div className="py-16 text-center text-[var(--text-muted)]" data-testid="empty-feed">
              {activeTab === "following"
                ? "Follow some accounts to see their posts here."
                : "No posts yet. Be the first to share something!"}
            </div>
          ) : (
            <div className="space-y-4" data-testid="post-list">
              {items.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}

              <InfiniteScroll
                key="infinite-scroll"
                onLoadMore={handleLoadMore}
                onRetry={handleRetry}
                hasMore={hasNextPage && !followingNeedsWallet}
                isLoading={isFetchingNextPage}
                disabled={followingNeedsWallet}
                manual={isSlowConnection}
                error={feed.isError}
                skeleton={<PostCardSkeleton />}
              />
            </div>
          )}
        </section>
      </main>

      <ReturnToTop targetRef={topRef} />
    </>
  );
}
