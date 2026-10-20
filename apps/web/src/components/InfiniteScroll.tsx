"use client";

/**
 * Infinite-scroll sentinel for cursor-paginated lists (issue #1724).
 *
 * Behaviour:
 *  - observes a 1px sentinel and calls `onLoadMore` when it enters the
 *    viewport, prefetching 400px early so the next page usually lands before
 *    the user reaches the bottom;
 *  - fires at most once per intersection (a re-entry after the list grows
 *    is required for the next call), and never while a request is in flight,
 *    when there is no next page, or after an error;
 *  - reserves space for the skeleton so appending the page does not shift the
 *    content above it (CLS);
 *  - degrades to a "Load more" button when IntersectionObserver is missing
 *    or when the caller forces `manual` (slow connection);
 *  - shows an inline retry after an error instead of retrying in a loop.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { PostCardSkeleton } from "@/components/PostCard";

export interface InfiniteScrollProps {
  /** Requests the next page. Must be stable (useCallback) to avoid re-observing. */
  onLoadMore: () => void;
  /** Whether a cursor for another page exists. */
  hasMore: boolean;
  /** True while the next page is being fetched. */
  isLoading?: boolean;
  /** Disables automatic loading (e.g. a wallet gate is showing). */
  disabled?: boolean;
  /** Forces the manual button, regardless of observer support. */
  manual?: boolean;
  /** True when the last page request failed. */
  error?: boolean;
  /** Retries the failed page. */
  onRetry?: () => void;
  /** Skeleton rendered while the next page loads. */
  skeleton?: ReactNode;
  loadMoreLabel?: string;
  retryLabel?: string;
}

// Prefetch roughly two post cards ahead of the viewport. Enough runway to hide
// a typical indexer round trip without fetching pages the user never reaches.
const ROOT_MARGIN = "400px 0px";

export function InfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading = false,
  disabled = false,
  manual = false,
  error = false,
  onRetry,
  skeleton,
  loadMoreLabel = "Load more",
  retryLabel = "Try again",
}: InfiniteScrollProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);

  // Assume support during render (the server cannot know) and correct after
  // mount. Rendering the manual button before hydration would mismatch SSR.
  const [observerSupported, setObserverSupported] = useState(true);

  // Refs mirror the latest props for the observer callback, so a prop change
  // does not tear down and recreate the observer on every render.
  const stateRef = useRef({ onLoadMore, hasMore, disabled, error });
  stateRef.current = { onLoadMore, hasMore, disabled, error };

  const loadingRef = useRef(isLoading);
  loadingRef.current = isLoading;

  // Set once the sentinel fires; reset when it leaves the viewport so the next
  // intersection can load the following page.
  const triggeredRef = useRef(false);

  // Keep keyboard focus on the manual button after the page it requested lands.
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    setObserverSupported(typeof IntersectionObserver !== "undefined");
  }, []);

  useEffect(() => {
    if (
      !observerSupported ||
      manual ||
      !hasMore ||
      disabled ||
      error ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    triggeredRef.current = false;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            triggeredRef.current = false;
            continue;
          }

          if (triggeredRef.current || loadingRef.current) continue;

          const state = stateRef.current;
          if (!state.hasMore || state.disabled || state.error) continue;

          triggeredRef.current = true;
          state.onLoadMore();
        }
      },
      { rootMargin: ROOT_MARGIN, threshold: 0 }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [observerSupported, manual, hasMore, disabled, error]);

  useEffect(() => {
    if (isLoading || !restoreFocusRef.current) return;

    restoreFocusRef.current = false;
    loadMoreButtonRef.current?.focus({ preventScroll: true });
  }, [isLoading]);

  const handleManualLoadMore = useCallback(() => {
    restoreFocusRef.current = true;
    onLoadMore();
  }, [onLoadMore]);

  const showManualButton = hasMore && !error && (manual || !observerSupported);

  return (
    <div className="w-full" data-testid="infinite-scroll">
      <div
        ref={sentinelRef}
        data-testid="infinite-scroll-sentinel"
        aria-hidden="true"
        className="h-px w-full"
      />

      {/* Reserved height keeps the button/skeleton swap from shifting layout. */}
      <div
        data-testid="infinite-scroll-region"
        aria-busy={isLoading}
        className="flex min-h-[12rem] w-full flex-col items-center justify-start gap-4 pt-4"
      >
        {isLoading ? (
          <div data-testid="infinite-scroll-skeleton" className="w-full space-y-4">
            {skeleton ?? <PostCardSkeleton />}
          </div>
        ) : null}

        {error && hasMore ? (
          <div
            data-testid="infinite-scroll-error"
            role="alert"
            className="w-full rounded-lg border border-red-200 bg-red-50 p-4 text-center"
          >
            <p className="mb-3 text-sm text-red-800">Couldn&apos;t load more posts.</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                data-testid="infinite-scroll-retry"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              >
                {retryLabel}
              </button>
            ) : null}
          </div>
        ) : null}

        {showManualButton ? (
          <button
            ref={loadMoreButtonRef}
            type="button"
            onClick={handleManualLoadMore}
            disabled={isLoading}
            data-testid="load-more"
            className="rounded-lg border border-[var(--border)] bg-[var(--color-surface-1)] px-5 py-2.5 text-sm font-semibold text-[var(--foreground)] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {isLoading ? "Loading…" : loadMoreLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
