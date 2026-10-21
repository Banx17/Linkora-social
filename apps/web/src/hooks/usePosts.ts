"use client";

/**
 * usePosts — React 19 useOptimistic edition.
 *
 * State model
 * ───────────
 * `serverPosts`    — the canonical list fetched from the API (source of truth)
 * `optimisticPosts`— derived list with in-flight optimistic entries overlaid;
 *                    React reconciles this automatically via useOptimistic.
 *
 * Optimistic actions supported:
 *  • addPostOptimistic(postData)  — prepends a pending post, replaces with
 *                                   the confirmed post on success, rolls back
 *                                   and sets `postError` on failure.
 *  • deletePostOptimistic(postId) — marks a post as `isDeleting`, removes it
 *                                   on success, restores it on failure.
 *
 * The `isOptimistic` / `isPending` / `isDeleting` / `error` flags on each
 * OptimisticPost drive the visual indicators in FeedContainer.
 */

import { useCallback, useEffect, useOptimistic, useState, useTransition } from "react";
import { Post } from "@/components/PostCard";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OptimisticPost extends Post {
  /** True while the post is not yet confirmed server-side. */
  isOptimistic?: boolean;
  /** True specifically during the in-flight API call. */
  isPending?: boolean;
  /** True while a deletion is in-flight. */
  isDeleting?: boolean;
  /** Set when a creation or deletion fails (triggers rollback). */
  error?: string;
  images?: string[];
  linkUrl?: string;
}

type OptimisticAction =
  | { type: "add"; post: OptimisticPost }
  | { type: "confirm"; tempId: string; confirmed: OptimisticPost }
  | { type: "rollback_add"; tempId: string }
  | { type: "delete"; postId: string | number }
  | { type: "rollback_delete"; postId: string | number };

// ─── Reducer for useOptimistic ────────────────────────────────────────────────

function optimisticReducer(
  state: OptimisticPost[],
  action: OptimisticAction
): OptimisticPost[] {
  switch (action.type) {
    case "add":
      return [action.post, ...state];

    case "confirm":
      return state.map((p) =>
        p.id === action.tempId
          ? { ...action.confirmed, isOptimistic: false, isPending: false }
          : p
      );

    case "rollback_add":
      return state.filter((p) => p.id !== action.tempId);

    case "delete":
      return state.map((p) =>
        p.id === action.postId ? { ...p, isDeleting: true } : p
      );

    case "rollback_delete":
      return state.map((p) =>
        p.id === action.postId ? { ...p, isDeleting: false } : p
      );

    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePosts() {
  const [serverPosts, setServerPosts] = useState<OptimisticPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-post error shown as a toast (set on failed optimistic mutation)
  const [postError, setPostError] = useState<string | null>(null);

  // useOptimistic keeps `optimisticPosts` in sync with `serverPosts` while
  // allowing instant UI updates before the server responds.
  const [optimisticPosts, dispatchOptimistic] = useOptimistic<
    OptimisticPost[],
    OptimisticAction
  >(serverPosts, optimisticReducer);

  // useTransition keeps the UI responsive while async mutations run.
  const [, startTransition] = useTransition();

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/posts");
      if (res.ok) {
        const data = await res.json();
        setServerPosts(data.posts || []);
      } else {
        // Fallback seed data for development / demo
        setServerPosts([
          {
            id: 1,
            author: "GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            username: "stellar_dev",
            content: "Just deployed my first smart contract on Stellar! 🚀",
            tip_total: 100,
            like_count: 5,
            timestamp: Math.floor(Date.now() / 1000) - 3600,
          },
          {
            id: 2,
            author: "GXYZ9876543210ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            username: "crypto_enthusiast",
            content: "The SocialFi ecosystem is growing fast. Excited to be part of it!",
            tip_total: 50,
            like_count: 3,
            timestamp: Math.floor(Date.now() / 1000) - 7200,
          },
        ]);
      }
    } catch {
      setError("Failed to fetch posts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // ── Optimistic post creation ───────────────────────────────────────────────

  const addPostOptimistic = useCallback(
    async (postData: {
      content: string;
      author?: string;
      images?: string[];
      linkUrl?: string;
    }) => {
      const tempId = `temp-${Date.now()}`;
      const optimisticPost: OptimisticPost = {
        id: tempId,
        author: postData.author ?? "GUSER1234567890ANONYMOUS",
        username: "you",
        content: postData.content,
        images: postData.images ?? [],
        linkUrl: postData.linkUrl ?? "",
        like_count: 0,
        tip_total: 0,
        created_at: new Date().toISOString(),
        timestamp: Math.floor(Date.now() / 1000),
        isOptimistic: true,
        isPending: true,
      };

      // 1. Show the post immediately — React wraps this in a transition so
      //    it never blocks the main thread.
      startTransition(() => {
        dispatchOptimistic({ type: "add", post: optimisticPost });
      });

      try {
        // 2. Persist to server
        const response = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(postData),
        });

        if (!response.ok) throw new Error("Failed to publish post");

        const data = await response.json();
        const confirmedPost: OptimisticPost = data.post;

        // 3. Replace the optimistic entry with the confirmed server response
        setServerPosts((prev) =>
          prev.map((p) => (p.id === tempId ? confirmedPost : p))
        );
        // Also tell useOptimistic so the overlay stays consistent
        startTransition(() => {
          dispatchOptimistic({ type: "confirm", tempId, confirmed: confirmedPost });
        });

        return confirmedPost;
      } catch (err) {
        // 4. Rollback — remove the optimistic post
        startTransition(() => {
          dispatchOptimistic({ type: "rollback_add", tempId });
        });
        const message =
          err instanceof Error ? err.message : "Failed to publish post";
        setPostError(message);
        throw err;
      }
    },
    [dispatchOptimistic]
  );

  // ── Optimistic post deletion ───────────────────────────────────────────────

  const deletePostOptimistic = useCallback(
    async (postId: string | number) => {
      // 1. Mark as deleting immediately
      startTransition(() => {
        dispatchOptimistic({ type: "delete", postId });
      });

      try {
        const response = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Failed to delete post");

        // 2. Commit — remove from server state
        setServerPosts((prev) => prev.filter((p) => p.id !== postId));
      } catch (err) {
        // 3. Rollback — restore the post
        startTransition(() => {
          dispatchOptimistic({ type: "rollback_delete", postId });
        });
        const message = err instanceof Error ? err.message : "Failed to delete post";
        setPostError(message);
        throw err;
      }
    },
    [dispatchOptimistic]
  );

  // ── Clear post error ───────────────────────────────────────────────────────

  const clearPostError = useCallback(() => setPostError(null), []);

  return {
    posts: optimisticPosts,
    loading,
    error,
    postError,
    clearPostError,
    fetchPosts,
    addPostOptimistic,
    deletePostOptimistic,
  };
}
