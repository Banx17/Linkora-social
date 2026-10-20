"use client";

/**
 * Tip form backed by a Server Action (issue #1738).
 *
 * Validating the amount/token happens on the server; the assembled envelope it
 * returns is signed by the wallet in {@link useSignedAction} and submitted back
 * to the server, which returns the transaction hash.
 */

import { useActionState } from "react";
import { sendTipAction } from "@/app/actions/tip";
import { initialActionState } from "@/app/actions/types";
import { useSignedAction } from "@/hooks/useSignedAction";
import { SubmitButton } from "./SubmitButton";

interface TipServerFormProps {
  postId: string | number;
  /** Connected wallet address; tipping is blocked while it is unknown. */
  tipper: string | null;
  /** SEP-41 token address used to pay the tip. */
  token: string;
  decimals?: number;
}

export function TipServerForm({ postId, tipper, token, decimals = 7 }: TipServerFormProps) {
  const [state, formAction, pending] = useActionState(sendTipAction, initialActionState);
  const { result, signing } = useSignedAction(state.xdr);

  const busy = pending || signing;

  return (
    <form
      action={formAction}
      aria-label={`Tip post ${postId}`}
      className="flex flex-col gap-3"
    >
      <label htmlFor={`server-tip-amount-${postId}`} className="text-sm font-medium">
        Tip amount
      </label>

      <input
        id={`server-tip-amount-${postId}`}
        name="amount"
        type="number"
        inputMode="decimal"
        min="0.0000001"
        step="any"
        required
        disabled={busy}
        placeholder="0.00"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
      />

      <input type="hidden" name="tipper" defaultValue={tipper ?? ""} />
      <input type="hidden" name="token" defaultValue={token} />
      <input type="hidden" name="postId" defaultValue={String(postId)} />
      <input type="hidden" name="decimals" defaultValue={String(decimals)} />

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      {state.status === "idle" && state.xdr && <p className="text-sm">{state.message}</p>}

      {result.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {result.message}
        </p>
      )}

      {result.status === "success" && (
        <p role="status" className="text-sm text-emerald-600">
          {result.message}
          {result.txHash ? ` ${result.txHash}` : ""}
        </p>
      )}

      <SubmitButton pendingLabel="Preparing…" disabled={!tipper}>
        Send Tip
      </SubmitButton>
    </form>
  );
}
