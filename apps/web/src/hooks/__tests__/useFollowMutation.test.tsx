/**
 * Optimistic follow / unfollow — acceptance coverage.
 *
 * The transaction promise is controlled by the test so assertions can run
 * while it is still in flight: the button and follower count must already
 * reflect the click, and a rejection must restore both plus raise a toast.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { useFollowMutation } from "../useFollowMutation";
import type { FollowTransactionInput } from "@/lib/followTransaction";
import { queryKeys } from "@/lib/queryKeys";
import { resetToasts } from "@/lib/toast";
import { OptimisticStore } from "@/lib/optimisticStore";
import { Toaster } from "@/components/ui/Toaster";
import { createTestQueryClient, deferred } from "./optimisticTestUtils";

const FOLLOWER = "GFOLLOWERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const FOLLOWEE = "GPROFILEBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

function FollowHarness({
  submitFollow,
  initialIsFollowing = false,
  initialFollowersCount = 10,
}: {
  submitFollow: (input: FollowTransactionInput) => Promise<unknown>;
  initialIsFollowing?: boolean;
  initialFollowersCount?: number;
}) {
  const follow = useFollowMutation({
    follower: FOLLOWER,
    followee: FOLLOWEE,
    initialIsFollowing,
    initialFollowersCount,
    initialFollowingCount: 3,
    submitFollow,
  });

  return (
    <div>
      <button onClick={() => follow.toggle()} disabled={follow.isPending}>
        {follow.isFollowing ? "Following" : "Follow"}
      </button>
      <span data-testid="followers">{follow.followersCount}</span>
      <Toaster />
    </div>
  );
}

function renderHarness(props: React.ComponentProps<typeof FollowHarness>) {
  const client = createTestQueryClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <FollowHarness {...props} />
    </QueryClientProvider>
  );
  return { ...utils, client };
}

beforeEach(() => {
  resetToasts();
});

afterEach(() => {
  // The optimistic store is module-level and intentionally survives unmounts
  // in the app, so tests must clear the entries they touched.
  OptimisticStore.clearFollowState(`${FOLLOWER}:${FOLLOWEE}`);
  OptimisticStore.clearFollowState(`null:${FOLLOWEE}`);
  resetToasts();
});

describe("useFollowMutation — optimistic follow", () => {
  it("toggles the button and increments the follower count before the transaction resolves", async () => {
    const tx = deferred();
    const submitFollow = jest.fn(() => tx.promise);
    const { client } = renderHarness({ submitFollow });

    expect(screen.getByRole("button")).toHaveTextContent("Follow");
    expect(screen.getByTestId("followers")).toHaveTextContent("10");

    fireEvent.click(screen.getByRole("button"));

    // The write is still pending — the UI must already show the follow.
    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("Following");
    });
    expect(screen.getByTestId("followers")).toHaveTextContent("11");
    expect(submitFollow).toHaveBeenCalledWith({
      follower: FOLLOWER,
      followee: FOLLOWEE,
      isFollowing: true,
    });
    expect(client.getQueryData(queryKeys.followState(FOLLOWER, FOLLOWEE))).toEqual({
      isFollowing: true,
      followersCount: 11,
      followingCount: 3,
    });

    tx.resolve();
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    expect(screen.getByTestId("followers")).toHaveTextContent("11");
  });

  it("optimistically decrements the count when unfollowing", async () => {
    const tx = deferred();
    const submitFollow = jest.fn(() => tx.promise);
    renderHarness({ submitFollow, initialIsFollowing: true });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Follow"));
    expect(screen.getByTestId("followers")).toHaveTextContent("9");

    tx.resolve();
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
  });

  it("rolls back the optimistic state and raises a descriptive toast when the transaction fails", async () => {
    const tx = deferred();
    const submitFollow = jest.fn(() => tx.promise);
    const { client } = renderHarness({ submitFollow });

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByTestId("followers")).toHaveTextContent("11"));

    tx.reject(new Error("Transaction rejected by wallet"));

    // Button and count snap back to the pre-click values.
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Follow"));
    expect(screen.getByTestId("followers")).toHaveTextContent("10");
    expect(client.getQueryData(queryKeys.followState(FOLLOWER, FOLLOWEE))).toMatchObject({
      isFollowing: false,
      followersCount: 10,
    });

    // A descriptive error toast explains the rollback.
    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent(/Follow didn't go through/i);
    expect(toast).toHaveTextContent(/Transaction rejected by wallet/i);
    expect(toast).toHaveTextContent(/restored/i);
  });

  it("does not optimistically toggle when no wallet is connected", async () => {
    const submitFollow = jest.fn();
    renderHarnessToNullWallet({ submitFollow });

    fireEvent.click(screen.getByRole("button"));

    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent(/Wallet not connected/i);
    expect(submitFollow).not.toHaveBeenCalled();
    expect(screen.getByTestId("followers")).toHaveTextContent("10");
  });
});

function renderHarnessToNullWallet({ submitFollow }: { submitFollow: jest.Mock }) {
  const client = createTestQueryClient();

  function NoWalletHarness() {
    const follow = useFollowMutation({
      follower: null,
      followee: FOLLOWEE,
      initialFollowersCount: 10,
      submitFollow,
    });

    return (
      <div>
        <button onClick={() => follow.toggle()}>
          {follow.isFollowing ? "Following" : "Follow"}
        </button>
        <span data-testid="followers">{follow.followersCount}</span>
        <Toaster />
      </div>
    );
  }

  return render(
    <QueryClientProvider client={client}>
      <NoWalletHarness />
    </QueryClientProvider>
  );
}
