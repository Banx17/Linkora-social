/**
 * Shared policy for data-aware responsive images (#1748).
 *
 * `ResponsiveImage` reads these values so every `next/image` call site picks
 * the same quality, placeholder and above-the-fold rules.
 *
 * Keep `DEFAULT_IMAGE_QUALITY` / `SAVE_DATA_IMAGE_QUALITY` in sync with
 * `images.qualities` in `next.config.mjs`.
 */

/** Quality used for regular connections (next/image's own default). */
export const DEFAULT_IMAGE_QUALITY = 75;

/** Quality used when the user asked the browser to save data. */
export const SAVE_DATA_IMAGE_QUALITY = 40;

/** How many leading feed posts count as above the fold and get `priority`. */
export const ABOVE_THE_FOLD_POST_COUNT = 3;

/**
 * Tiny, network-free blurred placeholder (an SVG gradient run through a
 * gaussian blur). Used as next/image's `blurDataURL` and as the background of
 * the deferred image placeholder in save-data mode.
 */
const BLUR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9" preserveAspectRatio="none">' +
  '<filter id="b"><feGaussianBlur stdDeviation="1.5"/></filter><g filter="url(#b)">' +
  '<rect width="16" height="9" fill="#27272a"/>' +
  '<circle cx="4" cy="3" r="4" fill="#6d28d9" fill-opacity=".45"/>' +
  '<circle cx="12" cy="6" r="4" fill="#0891b2" fill-opacity=".35"/></g></svg>';

// Base64 rather than percent-encoding: next/image nests `blurDataURL` inside
// its own percent-encoded SVG, where a decoded `<` would break the markup.
export const BLUR_DATA_URL = `data:image/svg+xml;base64,${btoa(BLUR_SVG)}`;

export function getImageQuality(saveData: boolean): number {
  return saveData ? SAVE_DATA_IMAGE_QUALITY : DEFAULT_IMAGE_QUALITY;
}

export function isAboveTheFold(index: number, count = ABOVE_THE_FOLD_POST_COUNT): boolean {
  return index >= 0 && index < count;
}

/**
 * Hostnames the Next.js image optimizer is allowed to fetch from. Mirrors the
 * `images.remotePatterns` built in `next.config.mjs` from the same env vars:
 *  - the indexer host (`NEXT_PUBLIC_INDEXER_API_URL`), which serves uploads;
 *  - any extra hosts in `NEXT_PUBLIC_IMAGE_HOSTS` (comma separated).
 */
export function getOptimizableImageHosts(
  env: { indexerUrl?: string; extraHosts?: string } = {
    indexerUrl: process.env.NEXT_PUBLIC_INDEXER_API_URL,
    extraHosts: process.env.NEXT_PUBLIC_IMAGE_HOSTS,
  }
): string[] {
  const hosts = new Set<string>();

  if (env.indexerUrl) {
    try {
      hosts.add(new URL(env.indexerUrl).hostname);
    } catch {
      /* relative or malformed indexer URL: nothing to allow */
    }
  }

  for (const host of (env.extraHosts ?? "").split(",")) {
    const trimmed = host.trim();
    if (trimmed) hosts.add(trimmed);
  }

  return [...hosts];
}

/**
 * Whether next/image can route `src` through the optimizer (and therefore
 * honour `quality`). Same-origin paths always can; remote URLs only when their
 * host is configured, otherwise the default loader would throw, so callers
 * fall back to `unoptimized`. `data:`, `blob:` and `.svg` sources are
 * unoptimized by next/image itself.
 */
export function canOptimizeImage(src: string, hosts = getOptimizableImageHosts()): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;

  try {
    const url = new URL(src);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return hosts.includes(url.hostname);
  } catch {
    return false;
  }
}
