"use client";

/**
 * Pool deposit with an optimistic "pending" marker.
 *
 * A deposit needs an allowance approval plus the `pool_deposit` call, so it
 * can take several seconds after the user confirms. `onMutate` records the
 * in-flight amount in the query cache (and the hook exposes it as
 * `pendingDeposit`) so the UI can show a pending badge immediately. Failure
 * removes the badge and raises a toast; success leaves a confirmed marker.
 */

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  classifyError,
  submitPoolDeposit,
  type PoolDepositParams,
  type TxResult,
  type TxStatus,
} from "./usePoolContract";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "@/lib/toast";

export interface PoolDepositMarker {
  status: "pending" | "confirmed";
  poolId: string;
  /** Amount exactly as the user entered it. */
  amount: string;
}

export interface UsePoolDepositMutationOptions {
  poolId: string;
  /** Injected submitter (tests use a controllable promise). */
  submit?: (params: PoolDepositParams, onPhase?: (phase: TxStatus) => void) => Promise<TxResult>;
  onConfirmed?: (result: TxResult, params: PoolDepositParams) => void;
}

interface DepositContext {
  previous: PoolDepositMarker | undefined;
}

export function usePoolDepositMutation({
  poolId,
  submit = submitPoolDeposit,
  onConfirmed,
}: UsePoolDepositMutationOptions) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.poolDeposit(poolId);

  // Local phase mirrors the transaction journey for the status banner.
  const [phase, setPhase] = useState<TxStatus>("idle");
  const [result, setResult] = useState<TxResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation<TxResult, Error, PoolDepositParams, DepositContext>({
    mutationFn: async (params) => {
      setResult(null);
      setError(null);
      setPhase("approving");

      return submit(params, (next) => setPhase(next));
    },

    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<PoolDepositMarker>(queryKey);
      queryClient.setQueryData<PoolDepositMarker>(queryKey, {
        status: "pending",
        poolId,
        amount: params.amountRaw,
      });

      return { previous };
    },

    onError: (err, params, context) => {
      // Roll the marker back: the deposit did not happen.
      if (context?.previous) {
        queryClient.setQueryData<PoolDepositMarker>(queryKey, context.previous);
      } else {
        queryClient.removeQueries({ queryKey, exact: true });
      }

      const message = classifyError(err);
      setError(message);
      setPhase("error");

      toast.error({
        title: "Deposit wasn't confirmed",
        description: `${message}. No funds left your wallet${params.amountRaw ? ` for the ${params.amountRaw} deposit` : ""}.`,
      });
    },

    onSuccess: (tx, params) => {
      setResult(tx);
      setPhase("success");
      queryClient.setQueryData<PoolDepositMarker>(queryKey, {
        status: "confirmed",
        poolId,
        amount: params.amountRaw,
      });
      onConfirmed?.(tx, params);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
    },
  });

  const deposit = useCallback(
    async (params: PoolDepositParams): Promise<TxResult | undefined> => {
      try {
        return await mutation.mutateAsync(params);
      } catch {
        // onError already restored the marker and surfaced a toast.
        return undefined;
      }
    },
    [mutation]
  );

  const reset = useCallback(() => {
    mutation.reset();
    setPhase("idle");
    setResult(null);
    setError(null);
  }, [mutation]);

  const pendingDeposit: PoolDepositMarker | null = mutation.isPending
    ? {
        status: "pending",
        poolId,
        amount: mutation.variables?.amountRaw ?? "",
      }
    : null;

  return {
    status: phase,
    result,
    error,
    isPending: mutation.isPending,
    /** Non-null while a deposit is in flight — drives the pending badge. */
    pendingDeposit,
    deposit,
    reset,
  };
}
