/**
 * commentStore.ts
 *
 * Module-level singleton for the in-memory comment store used by the
 * /api/posts/[id]/comments route handlers.
 *
 * Next.js keeps a single instance of each module alive for the lifetime of
 * the server process, so both route files share the same Map when they import
 * from this module.
 *
 * In production, replace this with a database call (e.g. Postgres via Prisma).
 */

export interface StoredComment {
  id: string;
  postId: string;
  author: string;
  content: string;
  createdAt: string;
}

const commentsByPost = new Map<string, StoredComment[]>();

export function getComments(postId: string): StoredComment[] {
  return commentsByPost.get(postId) ?? [];
}

export function addComment(postId: string, comment: StoredComment): void {
  const existing = commentsByPost.get(postId) ?? [];
  commentsByPost.set(postId, [comment, ...existing]);
}

export function removeComment(postId: string, commentId: string): boolean {
  const existing = commentsByPost.get(postId) ?? [];
  const index = existing.findIndex((c) => c.id === commentId);
  if (index === -1) return false;
  commentsByPost.set(postId, [
    ...existing.slice(0, index),
    ...existing.slice(index + 1),
  ]);
  return true;
}
