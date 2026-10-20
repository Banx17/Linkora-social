"use client";

/**
 * Post composer backed by a Server Action (issue #1738).
 *
 * React 19's `useActionState` gives us `{ status, message, postId }` straight
 * from the server, and `useFormStatus` (inside <SubmitButton/>) disables the
 * form while the action is in flight. No client-side `fetch` is involved.
 */

import { useActionState } from "react";
import { createPostAction } from "@/app/actions/post";
import { initialActionState } from "@/app/actions/types";
import { POST_MAX_CHARS } from "@/lib/validate";
import { SubmitButton } from "./SubmitButton";

interface PostServerFormProps {
  /** Connected wallet address; posting is blocked while it is unknown. */
  author: string | null;
}

export function PostServerForm({ author }: PostServerFormProps) {
  const [state, formAction, pending] = useActionState(createPostAction, initialActionState);

  return (
    <form action={formAction} aria-label="Create post" className="flex flex-col gap-3">
      <label htmlFor="server-post-content" className="text-sm font-medium">
        What&apos;s on your mind?
      </label>

      <textarea
        id="server-post-content"
        name="content"
        rows={4}
        required
        maxLength={POST_MAX_CHARS}
        disabled={pending}
        placeholder="Share something with the Linkora community…"
        className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
      />

      <input type="hidden" name="author" defaultValue={author ?? ""} />

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      {state.status === "success" && (
        <p role="status" className="text-sm text-emerald-600">
          {state.message}
          {state.postId ? ` (#${state.postId})` : ""}
        </p>
      )}

      <SubmitButton pendingLabel="Posting…" disabled={!author}>
        Post
      </SubmitButton>
    </form>
  );
}
