/**
 * Optimistic post like — the heart and the counter must flip before the
 * transaction resolves, and a failure must restore both plus a toast.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { useLikeMutation } from "../useLikeMutation";
import { queryKeys } from "@/lib/queryKeys";
import { resetToasts } from "@/lib/toast";
import { OptimisticStore } from "@/lib/optimisticStore";
import { Toaster } from "@/components/ui/Toaster";
import { createTestQueryClient, deferred } from "./optimisticTestUtils";

const USER = "GLIKERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const POST_ID = 42;

function LikeHarness({
  submitLike,
  initialLikeCount = 5,
}: {
  submitLike: (user: string, postId: string | number) => Promise<unknown>;
  initialLikeCount?: number;
}) {
  const like = useLikeMutation({
    postId: POST_ID,
    user: USER,
    initialLikeCount,
    submitLike,
  });

  return (
    <div>
      <button
        data-testid="like-btn"
        onClick={() => {
          void like.like();
        }}
        aria-pressed={like.liked}
      >
        {like.liked ? "Unlike" : "Like"}
      </button>
      <span data-testid="like-count">{like.likeCount}</span>
      <Toaster />
    </div>
  );
}

function renderHarness(props: React.ComponentProps<typeof LikeHarness>) {
  const client = createTestQueryClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <LikeHarness {...props} />
    </QueryClientProvider>
  );
  return { ...utils, client };
}

beforeEach(() => {
  resetToasts();
});

afterEach(() => {
  OptimisticStore.clearLikeState(`${USER}:${POST_ID}`);
  OptimisticStore.clearLikeState(`null:${POST_ID}`);
  resetToasts();
});

describe("useLikeMutation — optimistic like", () => {
  it("increments the counter and marks the post liked before the transaction resolves", async () => {
    const tx = deferred();
    const submitLike = jest.fn(() => tx.promise);
    const { client } = renderHarness({ submitLike });

    expect(screen.getByTestId("like-count")).toHaveTextContent("5");

    fireEvent.click(screen.getByTestId("like-btn"));

    await waitFor(() => expect(screen.getByTestId("like-count")).toHaveTextContent("6"));
    expect(screen.getByTestId("like-btn")).toHaveAttribute("aria-pressed", "true");
    expect(submitLike).toHaveBeenCalledWith(USER, POST_ID);
    expect(client.getQueryData(queryKeys.postLike(USER, POST_ID))).toEqual({
      isLiked: true,
      likeCount: 6,
    });

    tx.resolve();
    await waitFor(() =>
      expect(screen.getByTestId("like-btn")).toHaveAttribute("aria-pressed", "true")
    );
    expect(screen.getByTestId("like-count")).toHaveTextContent("6");
  });

  it("rolls the like back and shows a toast when the transaction fails", async () => {
    const tx = deferred();
    const submitLike = jest.fn(() => tx.promise);
    const { client } = renderHarness({ submitLike });

    fireEvent.click(screen.getByTestId("like-btn"));
    await waitFor(() => expect(screen.getByTestId("like-count")).toHaveTextContent("6"));

    tx.reject(new Error("Insufficient balance"));

    await waitFor(() => expect(screen.getByTestId("like-count")).toHaveTextContent("5"));
    expect(screen.getByTestId("like-btn")).toHaveAttribute("aria-pressed", "false");
    expect(client.getQueryData(queryKeys.postLike(USER, POST_ID))).toMatchObject({
      isLiked: false,
      likeCount: 5,
    });

    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent(/Like didn't go through/i);
    expect(toast).toHaveTextContent(/rolled back/i);
  });

  it("ignores repeat clicks while the like is in flight", async () => {
    const tx = deferred();
    const submitLike = jest.fn(() => tx.promise);
    renderHarness({ submitLike });

    fireEvent.click(screen.getByTestId("like-btn"));
    await waitFor(() => expect(screen.getByTestId("like-count")).toHaveTextContent("6"));
    fireEvent.click(screen.getByTestId("like-btn"));

    expect(submitLike).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("like-count")).toHaveTextContent("6");

    tx.resolve();
    await waitFor(() => expect(screen.getByTestId("like-count")).toHaveTextContent("6"));
  });
});
