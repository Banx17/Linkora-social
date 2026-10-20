"use server";

/**
 * Server Action for creating a post (issue #1738).
 *
 * The browser never talks to the indexer directly: content is validated and
 * sanitised on the server, persisted from the server, and the feed is
 * revalidated so the new post shows up without a manual refresh.
 */

import { revalidatePath } from "next/cache";
import { sanitisePostContent, validatePostContent } from "@/lib/validate";
import type { ActionState } from "./types";

const INDEXER_API_URL =
  process.env.NEXT_PUBLIC_INDEXER_API_URL ??
  process.env.NEXT_PUBLIC_INDEXER_URL ??
  "http://localhost:3001";

export async function createPostAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const content = sanitisePostContent(String(formData.get("content") ?? ""));
  const author = String(formData.get("author") ?? "").trim();

  const validation = validatePostContent(content);
  if (!validation.valid) {
    return { status: "error", message: validation.error ?? "Post content is invalid." };
  }
  if (!author) {
    return { status: "error", message: "Connect your wallet before posting." };
  }

  try {
    const response = await fetch(`${INDEXER_API_URL}/api/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, author }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { status: "error", message: `Failed to submit post: ${response.statusText}` };
    }

    const data = await response.json();
    const postId = data?.id ?? data?.post?.id;

    try {
      revalidatePath("/feed");
    } catch {
      // Revalidation is best-effort: it is a no-op outside a request context.
    }

    return {
      status: "success",
      message: "Post published",
      postId: postId === undefined || postId === null ? undefined : String(postId),
      txHash: data?.transactionHash,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return { status: "error", message: `Failed to submit post: ${detail}` };
  }
}
