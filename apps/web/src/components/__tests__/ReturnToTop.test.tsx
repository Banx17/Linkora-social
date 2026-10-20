/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ReturnToTop, RETURN_TO_TOP_THRESHOLD } from "../ReturnToTop";

// ---------------------------------------------------------------------------
// jsdom helpers
// ---------------------------------------------------------------------------

const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    writable: true,
    value,
  });
}

function scrollTo(value: number) {
  act(() => {
    setScrollY(value);
    fireEvent.scroll(window);
  });
}

function mockReducedMotion(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: matches && String(query).includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

beforeEach(() => {
  setScrollY(0);
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalScrollY) {
    Object.defineProperty(window, "scrollY", originalScrollY);
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReturnToTop (#1724)", () => {
  it("uses a 500px threshold", () => {
    expect(RETURN_TO_TOP_THRESHOLD).toBe(500);
  });

  it("is hidden at or below 500px and visible above it", async () => {
    render(<ReturnToTop />);

    expect(screen.queryByTestId("return-to-top")).not.toBeInTheDocument();

    scrollTo(500);
    await waitFor(() => expect(screen.queryByTestId("return-to-top")).not.toBeInTheDocument());

    scrollTo(501);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Return to top" })).toBeInTheDocument()
    );

    scrollTo(500);
    await waitFor(() => expect(screen.queryByTestId("return-to-top")).not.toBeInTheDocument());
  });

  it("appears immediately when mounted on an already scrolled page", async () => {
    setScrollY(900);

    render(<ReturnToTop />);

    await waitFor(() => expect(screen.getByTestId("return-to-top")).toBeInTheDocument());
  });

  it("scrolls to the top smoothly by default", async () => {
    const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
    mockReducedMotion(false);

    render(<ReturnToTop />);
    scrollTo(800);

    const button = await screen.findByTestId("return-to-top");
    fireEvent.click(button);

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  });

  it("jumps instantly when the user prefers reduced motion", async () => {
    const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
    mockReducedMotion(true);

    render(<ReturnToTop />);
    scrollTo(800);

    fireEvent.click(await screen.findByTestId("return-to-top"));

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });

  it("moves focus to the feed container after scrolling", async () => {
    jest.spyOn(window, "scrollTo").mockImplementation(() => {});
    const target = document.createElement("div");
    target.tabIndex = -1;
    document.body.appendChild(target);
    const targetRef = { current: target } as React.RefObject<HTMLElement>;

    render(<ReturnToTop targetRef={targetRef} />);
    scrollTo(800);
    fireEvent.click(await screen.findByTestId("return-to-top"));

    expect(document.activeElement).toBe(target);

    target.remove();
  });

  it("renders into a portal so fixed positioning ignores transformed ancestors", async () => {
    const { container } = render(
      <div data-testid="page-transition-shell" className="page-transition-shell">
        <ReturnToTop />
      </div>
    );

    scrollTo(600);

    const button = await screen.findByTestId("return-to-top");
    // `.page-transition-shell` uses transform/will-change, which would become
    // the containing block for `position: fixed` and drag the button away with
    // the scrolled page. The portal keeps it attached to <body>.
    expect(container.contains(button)).toBe(false);
    expect(button.parentElement).toBe(document.body);
    expect(screen.getByTestId("page-transition-shell").contains(button)).toBe(false);
  });

  it("removes its scroll listener on unmount", () => {
    const removeSpy = jest.spyOn(window, "removeEventListener");

    const { unmount } = render(<ReturnToTop />);
    unmount();

    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
