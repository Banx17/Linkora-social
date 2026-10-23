"use client";

/**
 * Backwards-compatible like button hook.
 *
 * The optimistic lifecycle lives in `useLikeMutation` (TanStack Query
 * `useMutation` + `onMutate`/`onError` rollback). This wrapper keeps the
 * original `useLike` API used by older components.
 */

import type { LikeState } from "@/lib/optimisticStore";
import { submitLikeTransaction } from "@/lib/likeTransaction";
import { useLikeMutation } from "./useLikeMutation";

export interface UseLikeOptions {
  postId: number;
  /** Whether the connected user has already liked this post, from `has_liked`. */
  initialHasLiked?: boolean;
  /** The post's current like count, used to seed the optimistic counter. */
  initialLikeCount: number;
  /** Injected submitter, primarily for tests. */
  submitLike?: (user: string, postId: string | number) => Promise<unknown>;
  onConfirmed?: (state: LikeState) => void;
}

export interface UseLikeResult {
  liked: boolean;
  likeCount: number;
  /** True while a like request is in flight. */
  pending: boolean;
  error: string | null;
  /**
   * Like the post once. Optimistically bumps the count, rolls back on failure,
   * and is a no-op when already liked or a request is in flight (idempotent).
   * Resolves to `true` only when the like was committed.
   */
  like: () => Promise<boolean>;
}

export function useLike({
  postId,
  initialHasLiked = false,
  initialLikeCount,
  submitLike,
  onConfirmed,
}: UseLikeOptions): UseLikeResult {
  const mutation = useLikeMutation({
    postId,
    initialHasLiked,
    initialLikeCount,
    submitLike,
    onConfirmed,
  });

  return {
    liked: mutation.liked,
    likeCount: mutation.likeCount,
    pending: mutation.pending,
    error: mutation.error,
    like: mutation.like,
  };
}

/** @deprecated use `submitLikeTransaction` from `@/lib/likeTransaction`. */
export const contractLikePost = submitLikeTransaction;
