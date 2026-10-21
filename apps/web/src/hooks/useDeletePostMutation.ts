"use client";

/**
 * Optimistic post deletion.
 *
 * `onMutate` removes the post from every cached feed immediately. If the
 * delete request fails, `onError` restores the exact previous cache snapshot
 * and shows a toast so the post does not silently reappear.
 */

import { useCallback } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "@/lib/toast";
import { classifyError } from "./usePoolContract";

export interface UseDeletePostMutationOptions {
  /** Cache entry that holds the rendered posts. Defaults to `queryKeys.posts`. */
  queryKey?: QueryKey;
  /** Injected request (tests use a controllable promise). */
  deletePost?: (postId: string | number) => Promise<unknown>;
  /** Called after the delete is confirmed so callers can refetch if needed. */
  onConfirmed?: (postId: string | number) => void;
  /** Called after a failed delete, once the cache has been restored. */
  onError?: (error: Error, postId: string | number) => void;
  /**
   * Called when the optimistic removal is applied. Components that own their
   * own list (e.g. the paginated feed) use this to hide the post immediately.
   */
  onOptimisticRemove?: (postId: string | number) => void;
  /** Called when a failed delete must put the post back on screen. */
  onRestore?: (postId: string | number) => void;
}

interface DeleteContext {
  previous: unknown;
  postId: string | number;
}

interface PostPageLike {
  posts?: unknown;
  [key: string]: unknown;
}

/**
 * Removes one post from a cache entry. Supports both a bare array (feed cache)
 * and a paginated `{ posts: [...] }` response.
 */
export function removePostFromCache<T>(cache: T, postId: string | number): T {
  if (Array.isArray(cache)) {
    return cache.filter((post) => !matchesPostId(post, postId)) as unknown as T;
  }

  if (cache && typeof cache === "object" && Array.isArray((cache as PostPageLike).posts)) {
    const page = cache as PostPageLike;
    return {
      ...page,
      posts: (page.posts as unknown[]).filter((post) => !matchesPostId(post, postId)),
    } as unknown as T;
  }

  return cache;
}

function matchesPostId(post: unknown, postId: string | number): boolean {
  if (!post || typeof post !== "object" || !("id" in post)) return false;
  return String((post as { id: unknown }).id) === String(postId);
}

/** Default delete request used by the app. */
export async function requestDeletePost(postId: string | number): Promise<void> {
  const response = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`The server rejected the delete request (HTTP ${response.status}).`);
  }
}

export function useDeletePostMutation({
  queryKey = queryKeys.posts,
  deletePost,
  onConfirmed,
  onError,
  onOptimisticRemove,
  onRestore,
}: UseDeletePostMutationOptions = {}) {
  const queryClient = useQueryClient();

  const mutation = useMutation<unknown, Error, string | number, DeleteContext>({
    mutationFn: async (postId) => {
      const remove = deletePost ?? requestDeletePost;
      return remove(postId);
    },

    onMutate: async (postId) => {
      // Stop an in-flight refetch from re-adding the post after we remove it.
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData(queryKey);
      if (previous !== undefined) {
        queryClient.setQueryData(queryKey, removePostFromCache(previous, postId));
      }

      onOptimisticRemove?.(postId);

      return { previous, postId };
    },

    onError: (error, postId, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      } else {
        // No snapshot to restore — force a refetch so the list is truthful.
        void queryClient.invalidateQueries({ queryKey });
      }

      toast.error({
        title: "Couldn't delete post",
        description: `${classifyError(error)}. The post was restored.`,
      });

      onRestore?.(postId);
      onError?.(error, postId);
    },

    onSuccess: (_result, postId) => {
      onConfirmed?.(postId);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
    },
  });

  const deletePostById = useCallback(
    (postId: string | number) => mutation.mutate(postId),
    [mutation]
  );

  const deletePostAsync = useCallback(
    (postId: string | number) => mutation.mutateAsync(postId),
    [mutation]
  );

  return {
    deletePost: deletePostById,
    deletePostAsync,
    isPending: mutation.isPending,
    /** Post currently being deleted, or `null` when idle. */
    pendingPostId: mutation.isPending ? mutation.variables : null,
    error: mutation.error ? classifyError(mutation.error) : null,
    reset: mutation.reset,
  };
}
