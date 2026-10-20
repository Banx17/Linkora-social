"use client";

/**
 * "Return to top" floating action button (issue #1724).
 *
 *  - appears after the page is scrolled past `threshold` pixels,
 *  - scroll listener is passive and rAF-throttled (one state update per frame
 *    at most, and no work at all when a frame is already scheduled),
 *  - honours `prefers-reduced-motion` by jumping instead of smooth-scrolling,
 *  - moves focus to the feed's top container so keyboard and screen-reader
 *    users are not left at the bottom of the list,
 *  - sits above the mobile bottom navigation. It is `fixed`, so it must not
 *    overlap that nav's hit targets.
 *
 * The button is rendered into a portal on `document.body`: the root template
 * wraps every page in `.page-transition-shell`, which uses `transform` and
 * `will-change` for its fade-in. Those properties make the shell the containing
 * block for `position: fixed` descendants, so an inline button would scroll
 * away with the page instead of staying pinned to the viewport.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

export const RETURN_TO_TOP_THRESHOLD = 500;

export interface ReturnToTopProps {
  /** Scroll offset (px) after which the button appears. */
  threshold?: number;
  /** Element focused after returning to the top (typically the feed `<main>`). */
  targetRef?: RefObject<HTMLElement | null>;
  label?: string;
}

export function ReturnToTop({
  threshold = RETURN_TO_TOP_THRESHOLD,
  targetRef,
  label = "Return to top",
}: ReturnToTopProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);

  // Portals need a DOM node; resolving it after mount keeps SSR output (null)
  // identical to the first client render, so hydration stays clean.
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    let unmounted = false;

    const update = () => {
      frameRef.current = null;
      if (unmounted) return;
      setIsVisible(window.scrollY > threshold);
    };

    const requestFrame = (callback: FrameRequestCallback): number => {
      if (typeof window.requestAnimationFrame === "function") {
        return window.requestAnimationFrame(callback);
      }
      return window.setTimeout(() => callback(performance.now()), 16);
    };

    const onScroll = () => {
      if (frameRef.current !== null) return;
      frameRef.current = requestFrame(update);
    };

    // Sync once on mount: a refreshed page can already be scrolled.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      unmounted = true;
      window.removeEventListener("scroll", onScroll);
      if (frameRef.current !== null) {
        if (typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(frameRef.current);
        } else {
          window.clearTimeout(frameRef.current);
        }
        frameRef.current = null;
      }
    };
  }, [threshold]);

  const handleClick = useCallback(() => {
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });

    // `preventScroll` keeps the browser from cancelling the smooth scroll.
    targetRef?.current?.focus({ preventScroll: true });
  }, [targetRef]);

  if (!isVisible || !portalTarget) return null;

  return createPortal(
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      data-testid="return-to-top"
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--color-surface-1)] text-[var(--foreground)] shadow-lg transition-colors duration-200 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 motion-reduce:transition-none md:right-6 md:bottom-6"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>,
    portalTarget
  );
}
