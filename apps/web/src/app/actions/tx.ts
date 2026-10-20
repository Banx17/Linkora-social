"use server";

/**
 * Server Action that submits a wallet-signed envelope and returns the
 * transaction hash (issue #1738).
 *
 * `useActionState` requires an `(state, formData)` signature, so the signed
 * envelope travels in the form data.
 */

import { sorobanConfigFromEnv, submitSignedXdr } from "@/lib/soroban";
import type { ActionState } from "./types";

export async function submitSignedXdrAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const signedXdr = String(formData.get("signedXdr") ?? "").trim();

  if (!signedXdr) {
    return { status: "error", message: "Missing signed transaction." };
  }

  try {
    const { hash, status } = await submitSignedXdr(signedXdr, sorobanConfigFromEnv());
    return {
      status: "success",
      message: `Transaction ${status.toLowerCase()}.`,
      txHash: hash,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return { status: "error", message: `Transaction failed: ${detail}` };
  }
}
