/**
 * Page-shell coverage for the feed (issues #1580 / #1724).
 *
 * `FeedStream` suspends through React 19's `use()`, which the Jest/jsdom
 * renderer used by this repo cannot resolve, so it is replaced with a stub
 * here. The data and pagination behaviour is covered by `FeedList.test.tsx`
 * (unit) and `tests/e2e/feed-infinite-scroll.spec.ts` (browser, real `use()`).
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import FeedPage from "./page";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => "/feed",
  useSearchParams: () => new URLSearchParams(),
}));

const mockUseWallet = jest.fn();
jest.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockUseWallet(),
}));

jest.mock("./FeedStream", () => ({
  FeedStream: (props: { tab: string; address: string | null }) => (
    <div data-testid="feed-stream" data-tab={props.tab} data-address={props.address ?? "none"} />
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FeedPage (#1580)", () => {
  it('renders the "For You" tab by default', () => {
    mockUseWallet.mockReturnValue({ address: null });

    render(<FeedPage />);

    expect(screen.getByTestId("tab-for-you")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("tab-following")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("tabpanel-for-you")).toBeInTheDocument();
    expect(screen.getByTestId("feed-stream")).toHaveAttribute("data-tab", "for-you");
  });

  it('switches to the "Following" tab and passes the connected wallet', () => {
    const address = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    mockUseWallet.mockReturnValue({ address });

    render(<FeedPage />);
    fireEvent.click(screen.getByTestId("tab-following"));

    expect(screen.getByTestId("tab-following")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("tabpanel-following")).toBeInTheDocument();

    const stream = screen.getByTestId("feed-stream");
    expect(stream).toHaveAttribute("data-tab", "following");
    expect(stream).toHaveAttribute("data-address", address);
  });

  it("renders the Following tab without a wallet address", () => {
    mockUseWallet.mockReturnValue({ address: null });

    render(<FeedPage />);
    fireEvent.click(screen.getByTestId("tab-following"));

    expect(screen.getByTestId("feed-stream")).toHaveAttribute("data-address", "none");
  });

  it("exposes a focusable feed container for the return-to-top FAB", () => {
    mockUseWallet.mockReturnValue({ address: null });

    render(<FeedPage />);

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "feed-top");
    expect(main).toHaveAttribute("tabindex", "-1");
  });
});
