import React from "react";
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import ProfilePage from "../src/app/profile/[address]/page";
import { QueryProvider } from "../src/contexts/QueryProvider";

expect.extend(toHaveNoViolations);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Mocks                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

jest.mock("next/navigation", () => ({
  useParams: () => ({ address: "GABC1234" }),
}));

jest.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({
    state: {
      status: "success",
      data: {
        profile: {
          address: "GABC1234",
          username: "testuser",
          creator_token: "GXYZ5678",
          bio: "Hello from the chain",
        },
        followersCount: 10,
        followingCount: 5,
        isFollowing: false,
        posts: [
          {
            id: "1",
            author: "GABC1234",
            deleted: false,
            tip_total: "500",
            like_count: "3",
            created_ledger: 11000,
            deleted_ledger: null,
          },
        ],
        postsTotal: 1,
        postsHasMore: false,
        creatorTokenBalance: "100",
        totalTipsReceived: 500,
        isVerified: true,
        verificationLevel: "identity",
      },
    },
    refetch: jest.fn(),
    fetchMorePosts: jest.fn(),
  }),
}));

jest.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({
    address: "GDEF5678",
    connected: true,
    network: "TESTNET",
  }),
}));

jest.mock("@/lib/optimisticStore", () => ({
  useOptimisticFollow: () => ({
    isFollowing: false,
    followersCount: 10,
    followingCount: 5,
  }),
  OptimisticStore: {
    setFollowState: jest.fn(),
    getFollowState: jest.fn(),
    clearFollowState: jest.fn(),
  },
}));

jest.mock("@/lib/LinkoraEventSubscriber", () => ({
  useLinkoraEvent: jest.fn(),
  useWatchAddress: jest.fn(),
  linkoraEventSubscriber: {
    on: jest.fn(() => jest.fn()),
    emit: jest.fn(),
    watch: jest.fn(),
    unwatch: jest.fn(),
    triggerMockEvent: jest.fn(),
  },
}));

// Mock the SDK import used inside the page for follow actions
jest.mock("linkora-sdk", () => ({
  LinkoraClient: jest.fn().mockImplementation(() => ({
    follow: jest.fn(() => "mock-xdr"),
    unfollow: jest.fn(() => "mock-xdr"),
    isBlocked: jest.fn().mockResolvedValue(false),
    blockUser: jest.fn().mockResolvedValue("mock-xdr"),
    unblockUser: jest.fn().mockResolvedValue("mock-xdr"),
  })),
}));

jest.mock("../../../packages/sdk/src/client", () => ({
  LinkoraClient: jest.fn().mockImplementation(() => ({
    follow: jest.fn(() => "mock-xdr"),
    unfollow: jest.fn(() => "mock-xdr"),
    isBlocked: jest.fn().mockResolvedValue(false),
    blockUser: jest.fn().mockResolvedValue("mock-xdr"),
    unblockUser: jest.fn().mockResolvedValue("mock-xdr"),
  })),
}));

/* ────────────────────────────────────────────────────────────────────────── */
/*  Tests                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

describe("ProfilePage Accessibility", () => {
  it("should have no critical or serious accessibility violations", async () => {
    const { container } = renderPage();

    const results = await axe(container, {
      rules: {
        // Ignore color-contrast in JSDOM since it can't compute rendered styles
        "color-contrast": { enabled: false },
      },
    });

    // Filter to only critical and serious (the acceptance criteria)
    const criticalOrSerious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(criticalOrSerious).toHaveLength(0);
  });

  it("Follow button has an appropriate aria-label", () => {
    const { getByRole } = renderPage();
    const followBtn = getByRole("button", { name: /follow testuser/i });
    expect(followBtn).toBeTruthy();
  });

  it("Follow button is inside an aria-live region", () => {
    const { container } = renderPage();
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeTruthy();
    // The follow button should be a descendant
    const followBtn = liveRegion?.querySelector("#follow-btn");
    expect(followBtn).toBeTruthy();
  });

  it("profile header section has an accessible label", () => {
    const { container } = renderPage();
    const section = container.querySelector('[aria-label="Profile header"]');
    expect(section).toBeTruthy();
  });

  it("shows a verification badge whose provenance is exposed to assistive tech", () => {
    const { getByTestId } = renderPage();
    const badge = getByTestId("verification-badge");
    expect(badge).toBeTruthy();

    const icon = badge.querySelector('[role="img"]');
    expect(icon).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Identity verified via Stellar attestation")
    );
    expect(icon).toHaveAttribute("title", "Identity verified via Stellar attestation");
  });
});

/**
 * The page now owns optimistic mutations (TanStack Query), so it must be
 * rendered inside the same provider the app mounts in `app/layout.tsx`.
 */
function renderPage() {
  return render(<ProfilePage />, {
    wrapper: ({ children }) => <QueryProvider>{children}</QueryProvider>,
  });
}
