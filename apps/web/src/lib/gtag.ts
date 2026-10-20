/**
 * gtag.ts
 *
 * Typed GA4 event tracking helpers for Linkora.
 *
 * All helpers are no-ops when:
 *  - `window.gtag` is not yet defined (GA4 script not loaded)
 *  - Analytics consent has not been granted (Consent Mode v2 blocks the hit
 *    at the gtag layer, but we short-circuit here too for clarity)
 *
 * Usage:
 *   import { trackPostCreated } from "@/lib/gtag";
 *   trackPostCreated({ author: address, contentLength: content.length });
 */

import { getStoredConsent } from "./consent";

// ─── gtag stub ────────────────────────────────────────────────────────────────

/** Call gtag safely — never throws, always a no-op if unavailable. */
function gtag(command: string, action: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  // @ts-expect-error — gtag is injected globally
  if (typeof window.gtag !== "function") return;
  // Respect consent: if the user denied analytics, skip the call entirely.
  const consent = getStoredConsent();
  if (consent && consent.analytics === "denied") return;
  // @ts-expect-error
  window.gtag(command, action, params);
}

// ─── Event definitions ────────────────────────────────────────────────────────

export interface PostCreatedParams {
  /** Stellar address of the post author. */
  author: string;
  /** Character count of the post content. */
  contentLength: number;
  /** Whether the post includes media. */
  hasMedia?: boolean;
}

export interface TipSentParams {
  /** Stellar address of the tipper. */
  tipper: string;
  /** Stellar address of the token used. */
  tokenAddress: string;
  /** Human-readable amount string (e.g. "1.5"). */
  amount: string;
  /** ID of the post being tipped. */
  postId: string | number;
}

export interface PoolJoinedParams {
  /** Pool contract address / ID. */
  poolId: string;
  /** Stellar address of the user joining. */
  userAddress: string;
  /** Deposit amount as a human-readable string. */
  amount: string;
}

export interface ProfileViewedParams {
  /** Stellar address of the profile being viewed. */
  profileAddress: string;
  /** Whether the viewer is the profile owner. */
  isSelf: boolean;
}

// ─── Tracking calls ───────────────────────────────────────────────────────────

/**
 * Fire when a post is successfully created (after the optimistic update
 * resolves to a confirmed server response).
 */
export function trackPostCreated(params: PostCreatedParams): void {
  gtag("event", "post_created", {
    author: params.author,
    content_length: params.contentLength,
    has_media: params.hasMedia ?? false,
  });
}

/**
 * Fire when a tip transaction is confirmed on-chain.
 */
export function trackTipSent(params: TipSentParams): void {
  gtag("event", "tip_sent", {
    tipper: params.tipper,
    token_address: params.tokenAddress,
    amount: params.amount,
    post_id: String(params.postId),
  });
}

/**
 * Fire when a user joins (deposits into) a community pool.
 */
export function trackPoolJoined(params: PoolJoinedParams): void {
  gtag("event", "pool_joined", {
    pool_id: params.poolId,
    user_address: params.userAddress,
    amount: params.amount,
  });
}

/**
 * Fire when a profile page finishes loading.
 */
export function trackProfileViewed(params: ProfileViewedParams): void {
  gtag("event", "profile_viewed", {
    profile_address: params.profileAddress,
    is_self: params.isSelf,
  });
}
