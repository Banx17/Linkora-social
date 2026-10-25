/**
 * Pool deposits are slow (allowance approval + deposit). The pending badge and
 * optimistic marker must appear immediately, then either settle to confirmed
 * or roll back with a toast.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { usePoolDepositMutation } from "../usePoolDepositMutation";
import type { PoolDepositParams, TxResult, TxStatus } from "../usePoolContract";
import { queryKeys } from "@/lib/queryKeys";
import { resetToasts } from "@/lib/toast";
import { Toaster } from "@/components/ui/Toaster";
import { createTestQueryClient, deferred } from "./optimisticTestUtils";

const POOL_ID = "pool-1";
const PARAMS: PoolDepositParams = {
  depositor: "GDEPOSITORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  poolId: POOL_ID,
  token: "GTOKENAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  amountRaw: "25",
  decimals: 7,
  contractAddress: "CCONTRACTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};

type Submit = (params: PoolDepositParams, onPhase?: (phase: TxStatus) => void) => Promise<TxResult>;

function DepositHarness({ submit }: { submit: Submit }) {
  const deposit = usePoolDepositMutation({ poolId: POOL_ID, submit });

  return (
    <div>
      <button onClick={() => void deposit.deposit(PARAMS)}>Deposit</button>
      <span data-testid="status">{deposit.status}</span>
      {deposit.isPending && deposit.pendingDeposit && (
        <span role="status" data-testid="pending-badge">
          Pending {deposit.pendingDeposit.amount}
        </span>
      )}
      <Toaster />
    </div>
  );
}

function renderHarness(submit: Submit) {
  const client = createTestQueryClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <DepositHarness submit={submit} />
    </QueryClientProvider>
  );
  return { ...utils, client };
}

beforeEach(() => {
  resetToasts();
});

describe("usePoolDepositMutation — pending confirmation", () => {
  it("shows the pending badge and cache marker before the deposit resolves", async () => {
    const tx = deferred<TxResult>();
    const submit = jest.fn(() => tx.promise);
    const { client } = renderHarness(submit);

    expect(screen.queryByTestId("pending-badge")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Deposit" }));

    await waitFor(() => expect(screen.getByTestId("pending-badge")).toBeInTheDocument());
    expect(screen.getByTestId("pending-badge")).toHaveTextContent("Pending 25");
    expect(client.getQueryData(queryKeys.poolDeposit(POOL_ID))).toMatchObject({
      status: "pending",
      poolId: POOL_ID,
      amount: "25",
    });

    tx.resolve({ hash: "abc123" });

    await waitFor(() => expect(screen.queryByTestId("pending-badge")).not.toBeInTheDocument());
    expect(screen.getByTestId("status")).toHaveTextContent("success");
    expect(client.getQueryData(queryKeys.poolDeposit(POOL_ID))).toMatchObject({
      status: "confirmed",
      amount: "25",
    });
  });

  it("removes the pending badge, clears the marker and toasts when the deposit fails", async () => {
    const tx = deferred<TxResult>();
    const submit = jest.fn(() => tx.promise);
    const { client } = renderHarness(submit);

    fireEvent.click(screen.getByRole("button", { name: "Deposit" }));
    await waitFor(() => expect(screen.getByTestId("pending-badge")).toBeInTheDocument());

    tx.reject(new Error("Transaction rejected by wallet"));

    await waitFor(() => expect(screen.queryByTestId("pending-badge")).not.toBeInTheDocument());
    expect(screen.getByTestId("status")).toHaveTextContent("error");
    expect(client.getQueryData(queryKeys.poolDeposit(POOL_ID))).toBeUndefined();

    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent(/Deposit wasn't confirmed/i);
    expect(toast).toHaveTextContent(/Transaction rejected by wallet/i);
  });
});
