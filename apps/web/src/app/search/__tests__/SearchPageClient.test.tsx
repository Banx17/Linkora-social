/**
 * @jest-environment jsdom
 *
 * Search results rendering for #1747 (non-blocking results via useTransition)
 * and #1748 (priority / lazy images in the result list).
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SearchPageClient } from "../SearchPageClient";

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockParams = new URLSearchParams("q=stellar");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: jest.fn() }),
  usePathname: () => "/search",
  useSearchParams: () => mockParams,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const makePost = (index: number) => ({
  id: `p${index}`,
  author: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  content: `stellar post ${index}`,
  timestamp: 1_700_000_000 + index,
  imageUrl: `/media/p${index}.png`,
});

beforeEach(() => {
  mockParams = new URLSearchParams("q=stellar");
  mockReplace.mockReset();
  mockPush.mockReset();
  mockFetch.mockReset();
  localStorage.clear();
});

describe("SearchPageClient", () => {
  it("renders fetched results and clears the busy state (#1747)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ posts: [1, 2, 3, 4, 5].map(makePost) }),
    });

    render(<SearchPageClient />);

    const results = screen.getByTestId("search-results");
    expect(results).toHaveAttribute("aria-busy", "true");

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(5));
    expect(results).toHaveAttribute("aria-busy", "false");
    expect(results).not.toHaveAttribute("data-pending");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/search?q=stellar"),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("keeps the search input interactive while results are loading (#1747)", async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<SearchPageClient />);

    const input = screen.getByRole("textbox", { name: "Search posts and profiles" });
    fireEvent.change(input, { target: { value: "stellar wave" } });

    expect(input).toHaveValue("stellar wave");
    expect(screen.getByTestId("search-results")).toHaveAttribute("aria-busy", "true");
  });

  it("updates sort through a transition-wrapped navigation (#1747)", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ posts: [makePost(1)] }) });

    render(<SearchPageClient />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));

    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "recent" } });

    expect(mockReplace).toHaveBeenCalledWith("/search?q=stellar&sort=recent", { scroll: false });
  });

  it("prioritises only the first three result images (#1748)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ posts: [1, 2, 3, 4, 5].map(makePost) }),
    });

    const { container } = render(<SearchPageClient />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(5));

    const images = Array.from(container.querySelectorAll("article img"));
    expect(images).toHaveLength(5);
    images.slice(0, 3).forEach((img) => expect(img).toHaveAttribute("fetchpriority", "high"));
    images.slice(3).forEach((img) => expect(img).toHaveAttribute("loading", "lazy"));
    images.forEach((img) => expect(img).toHaveAttribute("sizes"));
  });

  it("shows the request error and drops stale results", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    render(<SearchPageClient />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Search request failed.");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByTestId("search-results")).toHaveAttribute("aria-busy", "false");
  });
});
