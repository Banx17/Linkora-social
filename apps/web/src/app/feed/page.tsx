"use client";

/**
 * /feed — main feed page with "For You" and "Following" tabs.
 *
 * Issue #1736: the first paint no longer blocks on the indexer. `FeedStream`
 * reads its snapshot with React 19's `use()` hook, so React renders the
 * `<Suspense>` fallback while the request is in flight and swaps in post cards
 * as soon as it resolves.
 *
 * Issue #1724 adds, on top of that streamed first page: cursor pagination with
 * IntersectionObserver-driven infinite scroll (and a manual "Load more"
 * fallback on slow connections), a "Return to top" FAB, and polite
 * announcements for appended pages. Those live in `FeedList`.
 *
 * Behaviour preserved from the #1580 rewrite:
 *  - Switching tabs shows only the active tab's posts.
 *  - A missing wallet address shows a helpful error on the Following tab.
 *  - Pagination ("Load more") appends to the current tab's list.
 */

import { Suspense, use, useCallback, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { PostCard, PostCardSkeleton, type Post } from "@/components/PostCard";
import { FeedSkeleton } from "@/components/skeletons";

/** Skeleton shown by the `<Suspense>` boundary while a tab streams in. */
function FeedSkeleton() {
  return (
    <div data-testid="loading-indicator" className="space-y-4">
      <PostCardSkeleton />
      <PostCardSkeleton />
      <PostCardSkeleton />
    </div>
  );
}

const ERROR_CLASS =
  "mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400";

interface LoadMoreState {
  posts: Post[];
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Streams a single feed tab.
 *
 * `useState` is used with a function initialiser so the snapshot promise has a
 * stable identity for the lifetime of the component — `use()` would otherwise
 * re-suspend on every render. The component is keyed by tab/address in the
 * parent, so changing either remounts it and fetches the new feed.
 */

import { Suspense, useEffect, useRef, useState } from "react";

import { useWallet } from "@/hooks/useWallet";
import { ReturnToTop } from "@/components/ReturnToTop";
import { FeedSkeleton } from "./FeedList";
import { FeedStream } from "./FeedStream";
import { getFeedSnapshotPromise, type FeedSnapshot, type FeedTab } from "@/services/feed";

interface FeedRequest {
  key: string;
  tab: FeedTab;
  address: string | null;
  promise: Promise<FeedSnapshot>;
}

export default function FeedPage() {
  const { address: userAddress } = useWallet();
  const [activeTab, setActiveTab] = useState<FeedTab>("for-you");
  // Focus target for the return-to-top FAB.
  const topRef = useRef<HTMLElement>(null);

  const requestKey = `${activeTab}:${userAddress ?? "anonymous"}`;

  /*
    The snapshot promise is created here (and owned by this committed state)
    rather than inside `FeedStream`. A component that suspends has its
    in-progress state discarded, so a promise created during that render would
    be recreated on every retry — an endless request loop. The page itself never
    suspends, so this promise survives the child's retries and is replaced when
    the tab or wallet changes.
  */
  const [request, setRequest] = useState<FeedRequest | null>(null);

  useEffect(() => {
    setRequest({
      key: requestKey,
      tab: activeTab,
      address: userAddress,
      promise: getFeedSnapshotPromise(activeTab, userAddress),
    });
  }, [requestKey, activeTab, userAddress]);

  const activeRequest = request?.key === requestKey ? request : null;

  const handleTabChange = (tab: FeedTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
  };

  return (
    <>
      <main
        ref={topRef}
        id="feed-top"
        tabIndex={-1}
        aria-label="Feed"
        className="mx-auto max-w-2xl px-4 py-6 pb-24 md:pb-6"
      >
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
        {state.error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400"
            data-testid="feed-error"
          >
            {state.error}
          </div>
        )}

        {state.loading && state.posts.length === 0 ? (
          <div data-testid="loading-indicator">
            <FeedSkeleton />
          </div>
        ) : state.posts.length === 0 && !state.loading ? (
          <div
            className="py-16 text-center text-[var(--text-muted)]"
            data-testid="empty-feed"
          >
            {activeTab === "following"
              ? "Follow some accounts to see their posts here."
              : "No posts yet. Be the first to share something!"}
          </div>
        ) : (
          <div className="space-y-4" data-testid="post-list">
            {state.posts.map((post) => (
              <PostCard key={post.id} post={post} data-testid="post-card" />
            ))}

            {state.loading && (
              <div data-testid="loading-more" className="space-y-4">
                <PostCardSkeleton />
              </div>
            )}

            {state.hasMore && !state.loading && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => loadFeed(activeTab, true)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-6 py-2 text-sm font-medium text-[var(--foreground)] hover:border-violet-500/50 transition-colors"
                  data-testid="load-more"
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
