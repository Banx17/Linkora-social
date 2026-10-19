"use client";

/**
 * Drives the wallet-signing half of a Server Action flow (issue #1738).
 *
 * A Server Action builds and simulates the transaction, but only the user's
 * wallet can sign it. This hook watches the prepared envelope produced by an
 * action, asks Freighter to sign it, then hands the signature back to
 * `submitSignedXdrAction` and exposes the resulting transaction hash.
 */

import { useEffect, useState } from "react";
import { signTransaction } from "@stellar/freighter-api";
import { submitSignedXdrAction } from "@/app/actions/tx";
import { initialActionState, type ActionState } from "@/app/actions/types";

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

export interface UseSignedActionResult {
  /** Outcome of the submit step (transaction hash on success). */
  result: ActionState;
  /** True while the wallet prompt is open or the transaction is submitting. */
  signing: boolean;
}

export function useSignedAction(xdr: string | undefined): UseSignedActionResult {
  const [result, setResult] = useState<ActionState>(initialActionState);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (!xdr) return;
    const envelope = xdr;
    let cancelled = false;

    setSigning(true);
    void (async () => {
      try {
        const signed = await signTransaction(envelope, {
          networkPassphrase: NETWORK_PASSPHRASE,
        });
        const data = new FormData();
        data.set("signedXdr", signed);
        const submitted = await submitSignedXdrAction(initialActionState, data);
        if (!cancelled) setResult(submitted);
      } catch (error) {
        if (!cancelled) {
          setResult({
            status: "error",
            message: error instanceof Error ? error.message : "Wallet signature rejected.",
          });
        }
      } finally {
        if (!cancelled) setSigning(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [xdr]);

  return { result, signing };
}
