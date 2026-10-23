import { NextRequest, NextResponse } from "next/server";
import { removeComment } from "@/lib/commentStore";

/**
 * DELETE /api/posts/[id]/comments/[commentId]
 *
 * Deletes a specific comment. Returns 204 on success.
 * Idempotent: deleting a comment that does not exist returns 204 as well.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; commentId: string } }
): Promise<NextResponse> {
  const { id: postId, commentId } = params;

  if (!postId || !commentId) {
    return NextResponse.json({ error: "Missing post ID or comment ID" }, { status: 400 });
  }

  // removeComment returns false if not found — idempotent, still 204.
  removeComment(postId, commentId);

  return new NextResponse(null, { status: 204 });
}
