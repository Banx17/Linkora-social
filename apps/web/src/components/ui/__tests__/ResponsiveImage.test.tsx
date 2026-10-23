/**
 * @jest-environment jsdom
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { ResponsiveImage } from "../ResponsiveImage";
import { PostCard } from "@/components/PostCard";

function setSaveData(saveData: boolean) {
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: {
      effectiveType: "4g",
      saveData,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  });
}

afterEach(() => {
  delete (navigator as Navigator & { connection?: unknown }).connection;
});

describe("ResponsiveImage (#1748)", () => {
  it("lazy loads below-the-fold images and forwards sizes", () => {
    render(
      <ResponsiveImage src="/media/post.png" alt="post" width={640} height={360} sizes="640px" />
    );

    const img = screen.getByAltText("post");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("sizes", "640px");
    expect(img).not.toHaveAttribute("fetchpriority");
  });

  it("preloads above-the-fold images with priority instead of lazy loading", () => {
    render(
      <ResponsiveImage
        src="/media/avatar.png"
        alt="avatar"
        width={96}
        height={96}
        sizes="96px"
        priority
      />
    );

    const img = screen.getByAltText("avatar");
    expect(img).toHaveAttribute("fetchpriority", "high");
    expect(img).not.toHaveAttribute("loading", "lazy");
  });

  it("requests the default quality on a normal connection", () => {
    render(
      <ResponsiveImage src="/media/post.png" alt="post" width={640} height={360} sizes="640px" />
    );

    const img = screen.getByAltText("post");
    expect(img.getAttribute("src")).toContain("q=75");
    // next/image only adds background styles when a placeholder is rendered.
    expect(img.getAttribute("style") ?? "").not.toContain("background-size");
  });

  it("lowers quality and shows a blurred placeholder when Save-Data is on", () => {
    setSaveData(true);
    render(
      <ResponsiveImage src="/media/post.png" alt="post" width={640} height={360} sizes="640px" />
    );

    const img = screen.getByAltText("post");
    expect(img.getAttribute("src")).toContain("q=40");
    expect(img.getAttribute("srcset")).toContain("q=40");
    expect(img.getAttribute("style")).toContain("background-size: cover");
  });

  it("does not fetch deferred content images in save-data mode until requested", () => {
    setSaveData(true);
    render(
      <ResponsiveImage
        src="/media/post.png"
        alt="post"
        width={640}
        height={360}
        sizes="640px"
        deferOnSaveData
      />
    );

    expect(screen.queryByAltText("post")).not.toBeInTheDocument();
    const placeholder = screen.getByTestId("save-data-placeholder");
    expect(placeholder).toHaveAccessibleName("Load image: post");

    fireEvent.click(placeholder);

    expect(screen.getByAltText("post").getAttribute("src")).toContain("q=40");
  });

  it("falls back to unoptimized for hosts the optimizer is not configured for", () => {
    render(
      <ResponsiveImage
        src="https://unknown.example/a.png"
        alt="remote"
        width={640}
        height={360}
        sizes="640px"
      />
    );

    expect(screen.getByAltText("remote")).toHaveAttribute("src", "https://unknown.example/a.png");
  });
});

describe("PostCard image (#1748)", () => {
  const post = {
    id: 1,
    author: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    content: "hello",
    imageUrl: "/media/post.png",
  };

  it("renders no image when the post has none", () => {
    const { container } = render(<PostCard post={{ ...post, imageUrl: undefined }} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("marks the post image as priority when above the fold", () => {
    const { container } = render(<PostCard post={post} priority />);
    expect(container.querySelector("img")).toHaveAttribute("fetchpriority", "high");
  });

  it("lazy loads the post image with feed sizes by default", () => {
    const { container } = render(<PostCard post={post} />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("sizes", "(min-width: 672px) 640px, 100vw");
  });
});
