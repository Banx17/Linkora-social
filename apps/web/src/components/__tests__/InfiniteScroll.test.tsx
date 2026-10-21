/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { InfiniteScroll, type InfiniteScrollProps } from "../InfiniteScroll";

// ---------------------------------------------------------------------------
// Controllable IntersectionObserver
// ---------------------------------------------------------------------------

type ObserverCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver
) => void;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  callback: ObserverCallback;
  options?: IntersectionObserverInit;

  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn(() => []);

  constructor(callback: ObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }

  trigger(isIntersecting: boolean) {
    act(() => {
      this.callback(
        [{ isIntersecting } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    });
  }
}

const originalIntersectionObserver = global.IntersectionObserver;

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  global.IntersectionObserver = originalIntersectionObserver;
});

function renderInfiniteScroll(overrides: Partial<InfiniteScrollProps> = {}) {
  const props: InfiniteScrollProps = {
    onLoadMore: jest.fn(),
    hasMore: true,
    ...overrides,
  };

  const view = render(<InfiniteScroll {...props} />);
  return { ...view, props };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InfiniteScroll (#1724)", () => {
  it("observes the sentinel with a 400px prefetch margin", () => {
    renderInfiniteScroll();

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    const observer = MockIntersectionObserver.instances[0];
    expect(observer.options?.rootMargin).toBe("400px 0px");
    expect(observer.observe).toHaveBeenCalledWith(screen.getByTestId("infinite-scroll-sentinel"));
  });

  it("calls onLoadMore at most once per intersection", () => {
    const { props } = renderInfiniteScroll();
    const observer = MockIntersectionObserver.instances[0];

    observer.trigger(true);
    observer.trigger(true);
    observer.trigger(true);

    expect(props.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("can load another page after the sentinel leaves and re-enters the viewport", () => {
    const { props } = renderInfiniteScroll();
    const observer = MockIntersectionObserver.instances[0];

    observer.trigger(true);
    observer.trigger(false);
    observer.trigger(true);

    expect(props.onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("does not call onLoadMore while a page is already loading", () => {
    const onLoadMore = jest.fn();
    const { rerender } = renderInfiniteScroll({ onLoadMore });

    rerender(<InfiniteScroll onLoadMore={onLoadMore} hasMore isLoading />);
    MockIntersectionObserver.instances[0].trigger(true);

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("does not observe when there is no next page", () => {
    renderInfiniteScroll({ hasMore: false });

    expect(MockIntersectionObserver.instances).toHaveLength(0);
    expect(screen.queryByTestId("load-more")).not.toBeInTheDocument();
  });

  it("does not observe when disabled", () => {
    renderInfiniteScroll({ disabled: true });

    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = renderInfiniteScroll();
    const observer = MockIntersectionObserver.instances[0];

    unmount();

    expect(observer.disconnect).toHaveBeenCalled();
  });
});

describe("InfiniteScroll fallbacks (#1724)", () => {
  it("falls back to a manual button when IntersectionObserver is unavailable", () => {
    delete (global as { IntersectionObserver?: unknown }).IntersectionObserver;

    const onLoadMore = jest.fn();
    renderInfiniteScroll({ onLoadMore });

    expect(MockIntersectionObserver.instances).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("forces the manual button for slow connections", () => {
    renderInfiniteScroll({ manual: true });

    expect(MockIntersectionObserver.instances).toHaveLength(0);
    expect(screen.getByTestId("load-more")).toBeInTheDocument();
  });

  it("shows a skeleton while the next page loads", () => {
    renderInfiniteScroll({ isLoading: true });

    expect(screen.getByTestId("infinite-scroll-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("infinite-scroll-region")).toHaveAttribute("aria-busy", "true");
  });

  it("shows an inline retry after an error and never auto-loads", () => {
    const onRetry = jest.fn();
    renderInfiniteScroll({ error: true, onRetry });

    expect(MockIntersectionObserver.instances).toHaveLength(0);
    expect(screen.queryByTestId("load-more")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("infinite-scroll-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the manual button after the page lands", () => {
    const onLoadMore = jest.fn();
    const { rerender } = renderInfiniteScroll({ manual: true, onLoadMore });

    fireEvent.click(screen.getByTestId("load-more"));
    rerender(<InfiniteScroll manual hasMore onLoadMore={onLoadMore} isLoading />);
    rerender(<InfiniteScroll manual hasMore onLoadMore={onLoadMore} isLoading={false} />);

    expect(document.activeElement).toBe(screen.getByTestId("load-more"));
  });
});
