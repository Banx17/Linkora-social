/**
 * consent.ts
 *
 * Cookie consent storage and Consent Mode v2 gtag wiring.
 *
 * Resolution order on load:
 *  1. Read stored preference from localStorage (`linkora_consent`)
 *  2. If found, immediately update gtag consent state
 *  3. If not found, leave the default-deny state set by the inline script
 *     in layout.tsx — the ConsentBanner will fire one of the helpers below
 *     once the user makes a choice.
 *
 * Consent Mode v2 signals used:
 *  - analytics_storage   — GA4 / measurement cookies
 *  - ad_storage          — advertising cookies (denied by default, not used)
 *  - ad_user_data        — user data for advertising (denied, not used)
 *  - ad_personalization  — personalisation (denied, not used)
 */

export type ConsentChoice = "granted" | "denied";

export interface ConsentState {
  analytics: ConsentChoice;
  /** Timestamp (ms) when the user last made a choice. */
  decidedAt: number;
}

const STORAGE_KEY = "linkora_consent";

// ─── Storage helpers ──────────────────────────────────────────────────────────

/** Read the persisted consent state, or null if the user has not decided yet. */
export function getStoredConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConsentState;
  } catch {
    return null;
  }
}

/** Persist the consent decision to localStorage. */
function storeConsent(state: ConsentState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable in private-browsing — fail silently.
  }
}

// ─── gtag consent helpers ─────────────────────────────────────────────────────

/**
 * Push a gtag consent update. Safe to call before GA4 loads because
 * the inline script in layout.tsx initialises `window.dataLayer` and the
 * `gtag` stub synchronously.
 */
function updateGtagConsent(analytics: ConsentChoice): void {
  if (typeof window === "undefined") return;
  // @ts-expect-error — gtag is injected by the inline bootstrap script
  if (typeof window.gtag === "function") {
    // @ts-expect-error
    window.gtag("consent", "update", {
      analytics_storage: analytics,
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call once on app mount to replay a previously stored consent choice into
 * the gtag consent state.  If no choice was stored, the default-deny from
 * the layout inline script stays in effect.
 */
export function replayStoredConsent(): void {
  const stored = getStoredConsent();
  if (stored) {
    updateGtagConsent(stored.analytics);
  }
}

/** User clicked "Accept" — grant analytics, persist, update gtag. */
export function grantConsent(): void {
  const state: ConsentState = { analytics: "granted", decidedAt: Date.now() };
  storeConsent(state);
  updateGtagConsent("granted");
}

/** User clicked "Decline" — deny analytics, persist, update gtag. */
export function denyConsent(): void {
  const state: ConsentState = { analytics: "denied", decidedAt: Date.now() };
  storeConsent(state);
  updateGtagConsent("denied");
}

/** True when the user has already made a consent decision (banner should hide). */
export function hasDecided(): boolean {
  return getStoredConsent() !== null;
}
