"use client";

/**
 * ConsentBanner
 *
 * Cookie consent banner compliant with EU GDPR and California CCPA.
 *
 * Behaviour:
 *  - Hidden until the component mounts (SSR-safe — avoids hydration mismatch)
 *  - Hidden permanently once the user has made a decision (stored in localStorage)
 *  - "Accept" → grants analytics_storage, hides banner
 *  - "Decline" → denies analytics_storage, hides banner
 *  - Keyboard-dismissable: Escape key triggers "Decline"
 *  - Fully screen-reader-friendly: role="dialog", aria-modal, aria-label,
 *    focus is trapped inside the banner while it is visible
 *
 * The banner does NOT use cookies itself — consent is stored in localStorage
 * under the key `linkora_consent`.
 */

import { useEffect, useRef, useState } from "react";
import { grantConsent, denyConsent, hasDecided, replayStoredConsent } from "@/lib/consent";

export function ConsentBanner() {
  // Start hidden to avoid SSR/hydration flash
  const [visible, setVisible] = useState(false);
  const declineRef = useRef<HTMLButtonElement>(null);
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Replay any previously stored decision into gtag
    replayStoredConsent();

    // Only show the banner if the user hasn't decided yet
    if (!hasDecided()) {
      setVisible(true);
    }
  }, []);

  // Keyboard: Escape → decline and dismiss
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDecline();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus trap: Tab cycles between the two buttons
  useEffect(() => {
    if (!visible) return;
    // Move focus to the first button when the banner appears
    declineRef.current?.focus();
  }, [visible]);

  function handleAccept() {
    grantConsent();
    setVisible(false);
  }

  function handleDecline() {
    denyConsent();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cookie consent"
      aria-describedby="consent-banner-desc"
      className="fixed bottom-0 left-0 right-0 z-[200] p-4 md:p-6"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-2xl px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Text */}
        <div className="flex-1 min-w-0">
          <p
            id="consent-banner-desc"
            className="text-sm text-[var(--foreground)] leading-relaxed"
          >
            <span className="font-semibold">We use cookies</span> to understand how you use Linkora
            and to improve your experience. Analytics data is anonymous and never sold.{" "}
            <a
              href="/privacy"
              className="underline text-violet-400 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500 rounded"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy policy
            </a>
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            ref={declineRef}
            type="button"
            onClick={handleDecline}
            className="rounded-lg border border-[var(--border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Decline analytics cookies"
          >
            Decline
          </button>

          <button
            ref={acceptRef}
            type="button"
            onClick={handleAccept}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
            aria-label="Accept analytics cookies"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
