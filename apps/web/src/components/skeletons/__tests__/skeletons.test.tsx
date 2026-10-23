import { render } from "@testing-library/react";
import {
  Skeleton,
  PostCardSkeleton,
  FeedSkeleton,
  ProfileHeaderSkeleton,
  PoolCardSkeleton,
  ExploreGridSkeleton,
  NotificationItemSkeleton,
} from "@/components/skeletons";

describe("skeleton primitives", () => {
  it("applies the token-driven shimmer class and is aria-hidden", () => {
    const { container } = render(<Skeleton width="2rem" height="1rem" />);
    const el = container.querySelector(".skeleton") as HTMLElement;

    expect(el).not.toBeNull();
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el.style.width).toBe("2rem");
    expect(el.style.height).toBe("1rem");
  });
});

describe("skeleton variants", () => {
  it("renders a PostCardSkeleton matching the post card test id", () => {
    const { getByTestId } = render(<PostCardSkeleton />);
    expect(getByTestId("post-card-skeleton")).toBeInTheDocument();
  });

  it("renders a FeedSkeleton with 3 post placeholders by default", () => {
    const { getByTestId, getAllByTestId } = render(<FeedSkeleton />);
    expect(getByTestId("feed-skeleton")).toHaveAttribute("aria-busy", "true");
    expect(getAllByTestId("post-card-skeleton")).toHaveLength(3);
  });

  it("clamps FeedSkeleton count to the 3–5 range", () => {
    const { getAllByTestId, rerender } = render(<FeedSkeleton count={99} />);
    expect(getAllByTestId("post-card-skeleton")).toHaveLength(5);

    rerender(<FeedSkeleton count={1} />);
    expect(getAllByTestId("post-card-skeleton")).toHaveLength(3);
  });

  it("renders an accessible ProfileHeaderSkeleton", () => {
    const { getByTestId } = render(<ProfileHeaderSkeleton />);
    const el = getByTestId("profile-header-skeleton");
    expect(el).toHaveAttribute("aria-busy", "true");
    expect(el).toHaveAttribute("aria-label", "Loading profile header");
  });

  it("renders a PoolCardSkeleton", () => {
    const { getByTestId } = render(<PoolCardSkeleton />);
    expect(getByTestId("pool-card-skeleton")).toBeInTheDocument();
  });

  it("renders an ExploreGridSkeleton with the requested count", () => {
    const { getByTestId } = render(<ExploreGridSkeleton count={6} />);
    const grid = getByTestId("explore-grid-skeleton");
    expect(grid).toHaveAttribute("aria-busy", "true");
    expect(grid.children).toHaveLength(6);
  });

  it("renders a NotificationItemSkeleton as a list item", () => {
    const { getByTestId } = render(
      <ul>
        <NotificationItemSkeleton />
      </ul>
    );
    expect(getByTestId("notification-item-skeleton").tagName).toBe("LI");
  });
});
