/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { VerificationBadge } from "../VerificationBadge";
import { PostCard } from "../PostCard";
import { ProfileCard } from "../ProfileCard";

describe("VerificationBadge", () => {
  it("renders the lucide BadgeCheck icon as an accessible image", () => {
    const { getByTestId } = render(<VerificationBadge subject="alice" />);

    const badge = getByTestId("verification-badge");
    const icon = badge.querySelector('[role="img"]');

    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-label", expect.stringContaining("alice"));
    expect(icon).toHaveAttribute("data-verification-level", "identity");
  });

  it("explains verification provenance via tooltip and sr-only text", () => {
    const { getByTestId } = render(<VerificationBadge level="identity" subject="alice" />);

    const provenance = "Identity verified via Stellar attestation";
    const icon = getByTestId("verification-badge").querySelector('[role="img"]');

    expect(icon).toHaveAttribute("title", provenance);
    expect(screen.getByText(new RegExp(provenance))).toBeInTheDocument();
  });

  it("conveys verification without relying on colour alone", () => {
    const { getByTestId } = render(<VerificationBadge subject="bob" />);
    // The icon carries a text alternative + a visible-in-DOM sr-only label.
    const icon = getByTestId("verification-badge").querySelector('[role="img"]');
    expect(icon?.getAttribute("aria-label")?.length).toBeGreaterThan(0);
  });

  it.each(["identity", "credential", "attested"] as const)(
    "supports the %s verification level",
    (level) => {
      const { getByTestId } = render(<VerificationBadge level={level} />);
      const icon = getByTestId("verification-badge").querySelector('[role="img"]');
      expect(icon).toHaveAttribute("data-verification-level", level);
      expect(icon?.getAttribute("title")).toMatch(/verified/i);
    }
  );

  it("uses theme tokens rather than hardcoded palette colours", () => {
    const { container } = render(<VerificationBadge />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/text-(gray|indigo|blue)-\d00/);
    expect(html).toContain("var(--accent)");
  });

  it("has no axe violations", async () => {
    const { container } = render(<VerificationBadge subject="alice" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("PostCard author byline", () => {
  const basePost = {
    id: "1",
    author: "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV",
    username: "alice",
    content: "hello world",
    created_at: "2024-01-01T00:00:00Z",
  };

  it("shows the verification badge when the author is verified", () => {
    render(<PostCard post={{ ...basePost, isVerified: true, verificationLevel: "identity" }} />);
    expect(screen.getByTestId("verification-badge")).toBeInTheDocument();
  });

  it("omits the verification badge for unverified authors", () => {
    render(<PostCard post={basePost} />);
    expect(screen.queryByTestId("verification-badge")).toBeNull();
  });

  it("has no axe violations with a verified author", async () => {
    const { container } = render(<PostCard post={{ ...basePost, isVerified: true }} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ProfileCard (search results)", () => {
  it("shows the verification badge when the profile is verified", () => {
    render(<ProfileCard profile={{ address: "GABC1234", username: "alice", isVerified: true }} />);
    expect(screen.getByTestId("verification-badge")).toBeInTheDocument();
  });

  it("accepts the snake_case verified flag from the indexer", () => {
    render(
      <ProfileCard profile={{ address: "GABC1234", username: "alice", is_verified: true }} />
    );
    expect(screen.getByTestId("verification-badge")).toBeInTheDocument();
  });

  it("omits the verification badge for unverified profiles", () => {
    render(<ProfileCard profile={{ address: "GABC1234", username: "alice" }} />);
    expect(screen.queryByTestId("verification-badge")).toBeNull();
  });

  it("has no axe violations with a verified profile", async () => {
    const { container } = render(
      <ProfileCard profile={{ address: "GABC1234", username: "alice", isVerified: true }} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
