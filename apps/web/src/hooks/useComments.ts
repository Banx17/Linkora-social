"use client";

/**
 * useComments — React 19 useOptimistic edition.
 *
 * State model
 * ───────────
 * `serverComments`    — the canonical list fetched from /api/posts/[id]/comments
 * `optimisticComments`— derived list with in-flight entries overlaid via
 *                       useOptimistic. React auto-reconciles on the next render
 *                       after serverComments updates.
 *
 * Optimistic actions:
 *  • addCommentOptimistic(content)  — prepends a pending comment, replaces it
 *                                     with the confirmed entry on success,
 *                                     rolls back and sets commentError on fail.
 *  • deleteCommentOptimistic(id)    — marks a comment isDeleting, removes it
 *                                     on success, restores it on failure.
 *
 * Visual flags on each OptimisticComment:
 *  isOptimistic — true while not yet confirmed server-side
 *  isPending    — true specifically during the in-flight API call
 *  isDeleting   — true while a deletion is in-flight
 *  error        — per-comment error string (not currently surfaced, reserved
 *                 for per-comment inline error display if needed)
 */

import { useCallback, useEffect, useOptimistic, useState, useTransition } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Comment {
  id: string | number;
  postId: string | number;
  author: string;
  content: string;
  createdAt: string;
}

export interface OptimisticComment extends Comment {
  /** True while the comment has not yet been confirmed server-side. */
  isOptimistic?: boolean;
  /** True specifically during the in-flight API call. */
  isPending?: boolean;
  /** True while a deletion is in-flight. */
  isDeleting?: boolean;
  /** Set when a creation or deletion fails (drives inline error). */
  error?: string;
}

type CommentAction =
  | { type: "add"; comment: OptimisticComment }
  | { type: "confirm"; tempId: string; confirmed: OptimisticComment }
  | { type: "rollback_add"; tempId: string }
  | { type: "delete"; commentId: string | number }
  | { type: "rollback_delete"; commentId: string | number };

// ─── Reducer for useOptimistic ────────────────────────────────────────────────

function commentReducer(
  state: OptimisticComment[],
  action: CommentAction
): OptimisticComment[] {
  switch (action.type) {
    case "add":
      return [action.comment, ...state];

    case "confirm":
      return state.map((c) =>
        c.id === action.tempId
          ? { ...action.confirmed, isOptimistic: false, isPending: false }
          : c
      );

    case "rollback_add":
      return state.filter((c) => c.id !== action.tempId);

    case "delete":
      return state.map((c) =>
        c.id === action.commentId ? { ...c, isDeleting: true } : c
      );

    case "rollback_delete":
      return state.map((c) =>
        c.id === action.commentId ? { ...c, isDeleting: false } : c
      );

    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useComments(postId: string | number | null) {
  const [serverComments, setServerComments] = useState<OptimisticComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Toast-level error shown when a mutation fails. */
  const [commentError, setCommentError] = useState<string | null>(null);

  const [optimisticComments, dispatchOptimistic] = useOptimistic<
    OptimisticComment[],
    CommentAction
  >(serverComments, commentReducer);

  const [, startTransition] = useTransition();

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchComments = useCallback(async () => {
    if (!postId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setServerComments(data.comments ?? []);
      } else if (res.status === 404) {
        setServerComments([]);
      } else {
        throw new Error(`Failed to fetch comments: ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comments");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // ── Optimistic comment creation ───────────────────────────────────────────

  const addCommentOptimistic = useCallback(
    async (content: string, author: string) => {
      if (!postId) return;

      const tempId = `temp-comment-${Date.now()}`;
      const optimisticComment: OptimisticComment = {
        id: tempId,
        postId,
        author,
        content: content.trim(),
        createdAt: new Date().toISOString(),
        isOptimistic: true,
        isPending: true,
      };

      // 1. Show instantly — wrapped in startTransition so it never blocks the UI.
      startTransition(() => {
        dispatchOptimistic({ type: "add", comment: optimisticComment });
      });

      try {
        // 2. Persist to server
        const res = await fetch(`/api/posts/${postId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: content.trim(), author }),
        });

        if (!res.ok) throw new Error("Failed to post comment");

        const data = await res.json();
        const confirmed: OptimisticComment = data.comment;

        // 3. Swap the temporary entry for the confirmed server record.
        setServerComments((prev) =>
          prev.map((c) => (c.id === tempId ? confirmed : c))
        );
        // Belt-and-suspenders: also update the optimistic overlay.
        startTransition(() => {
          dispatchOptimistic({ type: "confirm", tempId, confirmed });
        });

        return confirmed;
      } catch (err) {
        // 4. Rollback on failure — remove the ghost comment.
        startTransition(() => {
          dispatchOptimistic({ type: "rollback_add", tempId });
        });
        const message =
          err instanceof Error ? err.message : "Failed to post comment";
        setCommentError(message);
        throw err;
      }
    },
    [postId, dispatchOptimistic]
  );

  // ── Optimistic comment deletion ───────────────────────────────────────────

  const deleteCommentOptimistic = useCallback(
    async (commentId: string | number) => {
      // 1. Mark as deleting immediately.
      startTransition(() => {
        dispatchOptimistic({ type: "delete", commentId });
      });

      try {
        const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete comment");

        // 2. Commit — remove from server state.
        setServerComments((prev) => prev.filter((c) => c.id !== commentId));
      } catch (err) {
        // 3. Rollback — restore the comment.
        startTransition(() => {
          dispatchOptimistic({ type: "rollback_delete", commentId });
        });
        const message =
          err instanceof Error ? err.message : "Failed to delete comment";
        setCommentError(message);
        throw err;
      }
    },
    [postId, dispatchOptimistic]
  );

  const clearCommentError = useCallback(() => setCommentError(null), []);

  return {
    comments: optimisticComments,
    loading,
    error,
    commentError,
    clearCommentError,
    fetchComments,
    addCommentOptimistic,
    deleteCommentOptimistic,
  };
}
