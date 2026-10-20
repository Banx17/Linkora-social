"use client";

/**
 * Follow / unfollow button backed by Server Actions (issue #1738).
 *
 * The server assembles the `follow`/`unfollow` contract call, the wallet signs
 * it, and the server submits it — so the button keeps working even if the
 * client-side RPC helpers change.
 */

import { useActionState } from "react";
import { followAction, unfollowAction } from "@/app/actions/follow";
import { initialActionState } from "@/app/actions/types";
import { useSignedAction } from "@/hooks/useSignedAction";
import { SubmitButton } from "@/components/forms/SubmitButton";

interface FollowServerButtonProps {
  follower: string | null;
  followee: string;
  isFollowing: boolean;
}

export function FollowServerButton({ follower, followee, isFollowing }: FollowServerButtonProps) {
  const action = isFollowing ? unfollowAction : followAction;
  const [state, formAction] = useActionState(action, initialActionState);
  const { result } = useSignedAction(state.xdr);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="follower" defaultValue={follower ?? ""} />
      <input type="hidden" name="followee" defaultValue={followee} />

      {state.status === "error" && (
        <span role="alert" className="text-xs text-red-600">
          {state.message}
        </span>
      )}

      {result.status === "success" && (
        <span role="status" className="text-xs text-emerald-600">
          {isFollowing ? "Unfollowed" : "Followed"}
        </span>
      )}

      <SubmitButton
        pendingLabel="Confirm in wallet…"
        disabled={!follower || follower === followee}
      >
        {isFollowing ? "Following" : "Follow"}
      </SubmitButton>
    </form>
  );
}
