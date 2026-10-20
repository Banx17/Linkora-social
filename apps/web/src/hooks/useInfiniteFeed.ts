"use client";

/**
 * Cursor-paginated "infinite query" hook for the feed.
 *
 * The repository does not ship TanStack Query and issue #1724 explicitly
 * forbids adding third-party libraries (the IntersectionObserver work must not
 * pull in a dependency), so this hook provides the small subset of
 * `useInfiniteQuery` behaviour the feed needs:
 *
 *  - keeps an ordered array of pages (cursor in / cursor out),
 *  - exposes `fetchNextPage`, `hasNextPage` and `isFetchingNextPage`,
 *  - resets and refetches when the query key or `enabled` flag changes,
 *  - never allows two requests for the same generation in flight,
 *  - flattens pages and de-duplicates items by id (cursor pagination can
 *    overlap when new posts arrive between page requests).
 *
 * The API mirrors TanStack Query closely so it can be swapped for the real
 * `useInfiniteQuery` later without touching the feed page's rendering code.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface CursorPage<T> {
  items: T[];
  /** Cursor for the next page, or null when the indexer has no more pages. */
  nextCursor: string | null;
}

export interface UseInfiniteFeedOptions<T extends { id: string | number }> {
  /** Stable identity of the query. Changing it resets pagination. */
  queryKey: readonly unknown[];
  /** Fetches one page. Receives the cursor returned by the previous page. */
  queryFn: (cursor: string | null) => Promise<CursorPage<T>>;
  /** When false the query is idle and nothing is fetched. */
  enabled?: boolean;
  /** Optional id accessor; defaults to `item.id`. */
  getItemId?: (item: T) => string | number;
}

export interface UseInfiniteFeedResult<T extends { id: string | number }> {
  pages: CursorPage<T>[];
  /** Flattened, de-duplicated items across all loaded pages. */
  items: T[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  error: Error | null;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  /** Retries the page that failed (does not reset already loaded pages). */
  retry: () => void;
  /** Discards every page and loads the first page again. */
  refetch: () => void;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error("Failed to load feed.");
}

export function useInfiniteFeed<T extends { id: string | number }>({
  queryKey,
  queryFn,
  enabled = true,
  getItemId,
}: UseInfiniteFeedOptions<T>): UseInfiniteFeedResult<T> {
  // Serialising the key keeps the reset effect stable even when callers pass a
  // fresh array literal on every render.
  const queryKeyString = JSON.stringify(queryKey);

  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;
  const getItemIdRef = useRef(getItemId);
  getItemIdRef.current = getItemId;

  const [pages, setPages] = useState<CursorPage<T>[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Incremented whenever the query is reset, so late responses from an old
  // query/tab/unmount are ignored instead of writing into fresh state.
  const generationRef = useRef(0);
  // Generation that currently has a request in flight (null when idle).
  const inFlightRef = useRef<number | null>(null);

  const run = useCallback(
    async (cursor: string | null, mode: "initial" | "next", generation: number) => {
      if (inFlightRef.current === generation) return;
      inFlightRef.current = generation;

      if (mode === "initial") {
        setIsLoading(true);
        setPages([]);
      } else {
        setIsFetchingNextPage(true);
      }
      setError(null);

      try {
        const page = await queryFnRef.current(cursor);
        if (generation !== generationRef.current) return;

        setPages((previous) => (mode === "initial" ? [page] : [...previous, page]));
      } catch (caught) {
        if (generation !== generationRef.current) return;
        setError(toError(caught));
      } finally {
        if (generation === generationRef.current) {
          setIsLoading(false);
          setIsFetchingNextPage(false);
        }
        if (inFlightRef.current === generation) {
          inFlightRef.current = null;
        }
      }
    },
    []
  );

  // Reset + initial load whenever the key or enabled flag changes.
  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    inFlightRef.current = null;

    setPages([]);
    setError(null);
    setIsFetchingNextPage(false);

    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void run(null, "initial", generation);

    return () => {
      // Invalidate in-flight work belonging to this generation when the key
      // changes or the component unmounts.
      if (generationRef.current === generation) {
        generationRef.current += 1;
      }
    };
    // queryKeyString is the serialised form of queryKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKeyString, enabled, run]);

  const items = useMemo(() => {
    const resolveId = getItemIdRef.current;
    const seen = new Set<string | number>();
    const flattened: T[] = [];

    for (const page of pages) {
      for (const item of page.items) {
        const id = resolveId ? resolveId(item) : item.id;
        if (seen.has(id)) continue;
        seen.add(id);
        flattened.push(item);
      }
    }

    return flattened;
  }, [pages]);

  const lastPage = pages[pages.length - 1];
  const hasNextPage = Boolean(lastPage && lastPage.nextCursor && lastPage.items.length > 0);

  const fetchNextPage = useCallback(() => {
    if (!enabled || inFlightRef.current !== null || error) return;
    if (!lastPage || !lastPage.nextCursor || lastPage.items.length === 0) {
      return;
    }

    void run(lastPage.nextCursor, "next", generationRef.current);
  }, [enabled, error, lastPage, run]);

  const retry = useCallback(() => {
    if (!enabled || inFlightRef.current !== null) return;

    setError(null);
    if (lastPage && lastPage.nextCursor) {
      void run(lastPage.nextCursor, "next", generationRef.current);
      return;
    }
    void run(null, "initial", generationRef.current);
  }, [enabled, lastPage, run]);

  const refetch = useCallback(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    inFlightRef.current = null;

    setPages([]);
    setError(null);
    setIsFetchingNextPage(false);

    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void run(null, "initial", generation);
  }, [enabled, run]);

  return {
    pages,
    items,
    // A tab that just became enabled renders once before its reset effect
    // runs. Treating "enabled, no pages, no error" as loading avoids a flash
    // of the empty state between the tab click and the fetch starting.
    isLoading: isLoading || (enabled && pages.length === 0 && error === null),
    isFetchingNextPage,
    isError: error !== null,
    error,
    hasNextPage,
    fetchNextPage,
    retry,
    refetch,
  };
}
