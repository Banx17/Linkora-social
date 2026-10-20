"use server";

/**
 * Server Actions that prepare the on-chain `follow` / `unfollow` calls
 * (issue #1738). The signed envelope is submitted by
 * `submitSignedXdrAction` once the wallet has approved it.
 */

import { addressToScVal, buildContractCallXdr, sorobanConfigFromEnv } from "@/lib/soroban";
import { validateStellarAddress } from "@/lib/validate";
import type { ActionState } from "./types";

async function buildFollowEnvelope(
  method: "follow" | "unfollow",
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  void prevState;

  const follower = String(formData.get("follower") ?? "").trim();
  const followee = String(formData.get("followee") ?? "").trim();

  const followerCheck = validateStellarAddress(follower);
  if (!followerCheck.valid) {
    return { status: "error", message: followerCheck.error ?? "A valid follower address is required." };
  }

  const followeeCheck = validateStellarAddress(followee);
  if (!followeeCheck.valid) {
    return { status: "error", message: followeeCheck.error ?? "A valid followee address is required." };
  }

  if (follower === followee) {
    return { status: "error", message: "You cannot follow yourself." };
  }

  try {
    const xdrString = await buildContractCallXdr(
      method,
      [addressToScVal(follower), addressToScVal(followee)],
      follower,
      sorobanConfigFromEnv()
    );

    return {
      status: "idle",
      message: `Transaction prepared — sign it in your wallet to ${method}.`,
      xdr: xdrString,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return { status: "error", message: `Failed to prepare ${method}: ${detail}` };
  }
}

export async function followAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  return buildFollowEnvelope("follow", prevState, formData);
}

export async function unfollowAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  return buildFollowEnvelope("unfollow", prevState, formData);
}
