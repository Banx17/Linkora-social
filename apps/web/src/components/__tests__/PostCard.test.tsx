import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostCard, type Post, getPostExcerpt, getPostUrl } from "../PostCard";

const mockPost: Post = {
  id: "post-123",
  author: "GALICE1234567890",
  content: "This is a great update on Linkora!",
  like_count: 5,
  tip_total: 10,
};

const longContent =
  "This is a very long post content that exceeds the one hundred character threshold to ensure that text excerpting properly truncates with an ellipsis and does not overflow social share payloads.";

const mockLongPost: Post = {
  id: 456,
  author: "GBOB9876543210",
  content: longContent,
};

describe("PostCard Share Functionality", () => {
  const originalNavigator = { ...global.navigator };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    // Restore navigator properties
    Object.defineProperty(global, "navigator", {
      value: { ...originalNavigator },
      configurable: true,
      writable: true,
    });
  });

  it("renders Share button with aria-label='Share post'", () => {
    render(<PostCard post={mockPost} />);

    const shareButton = screen.getByRole("button", { name: "Share post" });
    expect(shareButton).toBeInTheDocument();
    expect(shareButton).toHaveAttribute("aria-expanded", "false");
    expect(shareButton).toHaveAttribute("aria-haspopup", "menu");
  });

  it("when navigator.share is available, clicking calls navigator.share with the correct payload", async () => {
    const mockShare = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "share", {
      value: mockShare,
      configurable: true,
      writable: true,
    });

    render(<PostCard post={mockPost} baseUrl="https://linkora.social" />);

    const shareButton = screen.getByRole("button", { name: "Share post" });
    await act(async () => {
      fireEvent.click(shareButton);
    });

    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith({
      title: expect.stringContaining("GALICE"),
      text: "This is a great update on Linkora!",
      url: "https://linkora.social/post/post-123",
    });

    // Share menu dropdown should NOT open when native share is used
    expect(screen.queryByRole("menu", { name: "Share options" })).not.toBeInTheDocument();
  });

  it("handles navigator.share abort/cancel gracefully without throwing uncaught errors", async () => {
    const abortError = new Error("Abort");
    abortError.name = "AbortError";
    const mockShare = jest.fn().mockRejectedValue(abortError);

    Object.defineProperty(global.navigator, "share", {
      value: mockShare,
      configurable: true,
      writable: true,
    });

    render(<PostCard post={mockPost} baseUrl="https://linkora.social" />);

    const shareButton = screen.getByRole("button", { name: "Share post" });

    // Should not throw
    await act(async () => {
      fireEvent.click(shareButton);
    });

    expect(mockShare).toHaveBeenCalled();
  });

  it("when navigator.share is unavailable, clicking opens the share menu with Copy Link and Share to X options", async () => {
    // Ensure navigator.share is undefined
    Object.defineProperty(global.navigator, "share", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    render(<PostCard post={mockPost} baseUrl="https://linkora.social" />);

    const shareButton = screen.getByRole("button", { name: "Share post" });
    expect(screen.queryByRole("menu", { name: "Share options" })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(shareButton);
    });

    expect(shareButton).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Share options" });
    expect(menu).toBeInTheDocument();

    const copyLinkItem = screen.getByRole("menuitem", { name: /copy link/i });
    expect(copyLinkItem).toBeInTheDocument();

    const shareXItem = screen.getByRole("menuitem", { name: /share to x/i });
    expect(shareXItem).toBeInTheDocument();
  });

  it("clicking 'Copy Link' calls clipboard.writeText with ${baseUrl}/post/${id} and displays 'Copied!' for 2 seconds", async () => {
    Object.defineProperty(global.navigator, "share", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const mockWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "clipboard", {
      value: { writeText: mockWriteText },
      configurable: true,
      writable: true,
    });

    render(<PostCard post={mockPost} baseUrl="https://linkora.social" />);

    // Open menu
    const shareButton = screen.getByRole("button", { name: "Share post" });
    await act(async () => {
      fireEvent.click(shareButton);
    });

    const copyButton = screen.getByRole("menuitem", { name: /copy link/i });

    // Click copy link
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(mockWriteText).toHaveBeenCalledWith("https://linkora.social/post/post-123");
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    // Advance 1.9 seconds: should still say "Copied!"
    act(() => {
      jest.advanceTimersByTime(1900);
    });
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    // Advance remaining 100ms (total 2 seconds): should revert to "Copy Link"
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
    expect(screen.getByText("Copy Link")).toBeInTheDocument();
  });

  it("clicking 'Share to X' targets the correctly formatted intent URL with encoded post URL and text excerpt", async () => {
    Object.defineProperty(global.navigator, "share", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    render(<PostCard post={mockPost} baseUrl="https://linkora.social" />);

    // Open share menu
    const shareButton = screen.getByRole("button", { name: "Share post" });
    await act(async () => {
      fireEvent.click(shareButton);
    });

    const shareXLink = screen.getByRole("menuitem", { name: /share to x/i });
    const expectedExcerpt = encodeURIComponent("This is a great update on Linkora!");
    const expectedUrl = encodeURIComponent("https://linkora.social/post/post-123");
    const expectedIntent = `https://twitter.com/intent/tweet?text=${expectedExcerpt}&url=${expectedUrl}`;

    expect(shareXLink).toHaveAttribute("href", expectedIntent);
    expect(shareXLink).toHaveAttribute("target", "_blank");
    expect(shareXLink).toHaveAttribute("rel", "noopener noreferrer");

    // Clicking Share to X closes the menu
    await act(async () => {
      fireEvent.click(shareXLink);
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("cleanly truncates and URI-encodes long excerpts in Share to X intent URL", async () => {
    Object.defineProperty(global.navigator, "share", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    render(<PostCard post={mockLongPost} baseUrl="https://linkora.social" />);

    // Open share menu
    const shareButton = screen.getByRole("button", { name: "Share post" });
    await act(async () => {
      fireEvent.click(shareButton);
    });

    const shareXLink = screen.getByRole("menuitem", { name: /share to x/i });
    const excerpt = getPostExcerpt(mockLongPost.content, 100);
    expect(excerpt).toHaveLength(103); // 100 chars + "..."
    expect(excerpt.endsWith("...")).toBe(true);

    const expectedExcerpt = encodeURIComponent(excerpt);
    const expectedUrl = encodeURIComponent("https://linkora.social/post/456");
    const expectedIntent = `https://twitter.com/intent/tweet?text=${expectedExcerpt}&url=${expectedUrl}`;

    expect(shareXLink).toHaveAttribute("href", expectedIntent);
  });

  it("supports keyboard interactions: Enter/Space to open, Space to trigger item, Escape to close and refocus", async () => {
    Object.defineProperty(global.navigator, "share", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    render(<PostCard post={mockPost} baseUrl="https://linkora.social" />);

    const shareButton = screen.getByRole("button", { name: "Share post" });
    shareButton.focus();
    expect(shareButton).toHaveFocus();

    // Trigger open via Enter key
    await act(async () => {
      fireEvent.keyDown(shareButton, { key: "Enter" });
      fireEvent.click(shareButton);
    });

    expect(screen.getByRole("menu", { name: "Share options" })).toBeInTheDocument();

    // Pressing Escape closes menu and restores focus to Share button
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(screen.queryByRole("menu", { name: "Share options" })).not.toBeInTheDocument();
    expect(shareButton).toHaveFocus();

    // Trigger open via Space key
    await act(async () => {
      fireEvent.keyDown(shareButton, { key: " " });
      fireEvent.click(shareButton);
    });

    expect(screen.getByRole("menu", { name: "Share options" })).toBeInTheDocument();

    // Escape from inside the menu element
    const menu = screen.getByRole("menu", { name: "Share options" });
    await act(async () => {
      fireEvent.keyDown(menu, { key: "Escape" });
    });

    expect(screen.queryByRole("menu", { name: "Share options" })).not.toBeInTheDocument();
    expect(shareButton).toHaveFocus();
  });

  it("closes the share menu when clicking outside", async () => {
    Object.defineProperty(global.navigator, "share", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    render(
      <div>
        <div data-testid="outside">Outside area</div>
        <PostCard post={mockPost} />
      </div>
    );

    const shareButton = screen.getByRole("button", { name: "Share post" });
    await act(async () => {
      fireEvent.click(shareButton);
    });

    expect(screen.getByRole("menu")).toBeInTheDocument();

    await act(async () => {
      fireEvent.mouseDown(screen.getByTestId("outside"));
    });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("falls back gracefully when navigator.clipboard is unavailable", async () => {
    Object.defineProperty(global.navigator, "share", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(global.navigator, "clipboard", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    document.execCommand = jest.fn().mockReturnValue(true);

    render(<PostCard post={mockPost} baseUrl="https://linkora.social" />);

    const shareButton = screen.getByRole("button", { name: "Share post" });
    await act(async () => {
      fireEvent.click(shareButton);
    });

    const copyButton = screen.getByRole("menuitem", { name: /copy link/i });
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });
});
