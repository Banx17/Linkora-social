"use server";

/**
 * Server Action that prepares a `tip` contract call (issue #1738).
 *
 * Signing stays in the browser (the wallet owns the private key), so the server
 * does the expensive part — validation, account lookup, simulation and
 * assembly — and hands the assembled envelope back to the client, which signs
 * it and calls {@link submitSignedXdrAction}.
 */

import {
  addressToScVal,
  buildContractCallXdr,
  i128ToScVal,
  sorobanConfigFromEnv,
  toRawAmount,
  u64ToScVal,
} from "@/lib/soroban";
import { validateAmount, validateStellarAddress } from "@/lib/validate";
import type { ActionState } from "./types";

/** Stellar assets use 7 decimal places by default. */
const DEFAULT_DECIMALS = 7;

export async function sendTipAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tipper = String(formData.get("tipper") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  const postId = String(formData.get("postId") ?? "").trim();
  const decimals = Number(formData.get("decimals") ?? DEFAULT_DECIMALS);

  const tipperCheck = validateStellarAddress(tipper);
  if (!tipperCheck.valid) {
    return { status: "error", message: tipperCheck.error ?? "A valid tipper address is required." };
  }

  const tokenCheck = validateStellarAddress(token);
  if (!tokenCheck.valid) {
    return { status: "error", message: tokenCheck.error ?? "A valid token address is required." };
  }

  const amountCheck = validateAmount(amount);
  if (!amountCheck.valid) {
    return { status: "error", message: amountCheck.error ?? "A valid amount is required." };
  }

  const numericPostId = Number(postId);
  if (!Number.isInteger(numericPostId) || numericPostId <= 0) {
    return { status: "error", message: "Post id must be a positive integer." };
  }

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
    return { status: "error", message: "Token decimals must be an integer between 0 and 30." };
  }

  try {
    const xdrString = await buildContractCallXdr(
      "tip",
      [
        addressToScVal(tipper),
        u64ToScVal(numericPostId),
        addressToScVal(token),
        i128ToScVal(toRawAmount(amount, decimals)),
      ],
      tipper,
      sorobanConfigFromEnv()
    );

    return {
      status: "idle",
      message: "Transaction prepared — sign it in your wallet to send the tip.",
      xdr: xdrString,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return { status: "error", message: `Failed to prepare tip: ${detail}` };
  }
}
