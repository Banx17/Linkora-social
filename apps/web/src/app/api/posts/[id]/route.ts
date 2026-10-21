import { NextResponse } from "next/server";
import { mockPosts } from "../store";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/posts/[id]
 *
 * Removes a post from the demo store. The client removes it optimistically
 * first and calls this endpoint in the background; a failure here rolls the
 * post back into the feed and raises a toast.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const index = mockPosts.findIndex((post) => post.id === id);
  if (index === -1) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  mockPosts.splice(index, 1);
  return NextResponse.json({ success: true, id });
}
