/**
 * Optimistic post delete: the post disappears from the cached feed on click,
 * and a failed delete restores it with a toast.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useQuery, QueryClientProvider } from "@tanstack/react-query";

import { useDeletePostMutation } from "../useDeletePostMutation";
import { queryKeys } from "@/lib/queryKeys";
import { resetToasts } from "@/lib/toast";
import { Toaster } from "@/components/ui/Toaster";
import { createTestQueryClient, deferred } from "./optimisticTestUtils";

interface TestPost {
  id: number;
  title: string;
}

const POSTS: TestPost[] = [
  { id: 1, title: "First post" },
  { id: 2, title: "Second post" },
];

function PostsHarness({
  deletePost,
}: {
  deletePost: (postId: string | number) => Promise<unknown>;
}) {
  // Reads the same cache entry the mutation updates, so the assertions exercise
  // the real optimistic cache write rather than local component state.
  const { data = [] } = useQuery<TestPost[]>({
    queryKey: queryKeys.posts,
    queryFn: () => POSTS,
  });
  const { deletePost: remove, isPending } = useDeletePostMutation({ deletePost });

  return (
    <div>
      <ul>
        {data.map((post) => (
          <li key={post.id}>
            {post.title}
            <button onClick={() => remove(post.id)} disabled={isPending}>
              Delete {post.title}
            </button>
          </li>
        ))}
      </ul>
      <Toaster />
    </div>
  );
}

function renderHarness(deletePost: (postId: string | number) => Promise<unknown>) {
  const client = createTestQueryClient();
  client.setQueryData<TestPost[]>(queryKeys.posts, POSTS);

  const utils = render(
    <QueryClientProvider client={client}>
      <PostsHarness deletePost={deletePost} />
    </QueryClientProvider>
  );

  return { ...utils, client };
}

beforeEach(() => {
  resetToasts();
});

describe("useDeletePostMutation — optimistic delete", () => {
  it("removes the post immediately, before the delete request resolves", async () => {
    const tx = deferred();
    const deletePost = jest.fn(() => tx.promise);
    const { client } = renderHarness(deletePost);

    expect(screen.getByText("Second post")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Second post" }));

    await waitFor(() => expect(screen.queryByText("Second post")).not.toBeInTheDocument());
    expect(screen.getByText("First post")).toBeInTheDocument();
    expect(deletePost).toHaveBeenCalledWith(2);
    expect(client.getQueryData<TestPost[]>(queryKeys.posts)?.map((post) => post.id)).toEqual([1]);

    tx.resolve();
    await waitFor(() => expect(screen.queryByText("Second post")).not.toBeInTheDocument());
  });

  it("restores the post and shows a toast when the delete fails", async () => {
    const tx = deferred();
    const deletePost = jest.fn(() => tx.promise);
    const { client } = renderHarness(deletePost);

    fireEvent.click(screen.getByRole("button", { name: "Delete Second post" }));
    await waitFor(() => expect(screen.queryByText("Second post")).not.toBeInTheDocument());

    tx.reject(new Error("Network error"));

    await waitFor(() => expect(screen.getByText("Second post")).toBeInTheDocument());
    expect(screen.getByText("First post")).toBeInTheDocument();
    expect(client.getQueryData<TestPost[]>(queryKeys.posts)).toEqual(POSTS);

    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent(/Couldn't delete post/i);
    expect(toast).toHaveTextContent(/restored/i);
  });
});
