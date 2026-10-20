import { NextRequest, NextResponse } from "next/server";
import { getComments, addComment, type StoredComment } from "@/lib/commentStore";

// ─── GET /api/posts/[id]/comments ─────────────────────────────────────────────

/**
 * Returns all comments for a post, newest first.
 *
 * Response: { comments: StoredComment[] }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const postId = params.id;
  if (!postId) {
    return NextResponse.json({ error: "Missing post ID" }, { status: 400 });
  }
  const comments = getComments(postId);
  return NextResponse.json({ comments });
}

// ─── POST /api/posts/[id]/comments ────────────────────────────────────────────

/**
 * Creates a new comment on a post.
 *
 * Body:    { content: string, author?: string }
 * Success: 201 { comment: StoredComment }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const postId = params.id;
  if (!postId) {
    return NextResponse.json({ error: "Missing post ID" }, { status: 400 });
  }

  let body: { content?: string; author?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.content || !body.content.trim()) {
    return NextResponse.json({ error: "Comment content cannot be empty" }, { status: 400 });
  }

  const newComment: StoredComment = {
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    postId,
    author: body.author ?? "GUSER_ANONYMOUS",
    content: body.content.trim(),
    createdAt: new Date().toISOString(),
  };

  addComment(postId, newComment);

  return NextResponse.json({ comment: newComment }, { status: 201 });
}
