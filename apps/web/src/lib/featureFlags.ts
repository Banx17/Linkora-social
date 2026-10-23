/**
 * featureFlags.ts
 *
 * Edge Config-backed feature flag system for A/B testing without server
 * round-trips.
 *
 * Architecture
 * ────────────
 * • `getFlag(key)`       — server-side helper (Node / Edge Runtime). Reads from
 *                          Vercel Edge Config first; falls back to the
 *                          `FEATURE_FLAG_<KEY>` environment variable; then to
 *                          the hard-coded default in FLAG_DEFAULTS.
 *
 * • `useFeatureFlag(key)` — client React hook that hits /api/flags/<key> and
 *                           hydrates from the same defaults, ensuring the UI
 *                           never blocks on a network request that hasn't
 *                           resolved yet.
 *
 * Adding a new flag
 * ─────────────────
 * 1. Add its key to `FeatureFlagKey` union.
 * 2. Add a default value to `FLAG_DEFAULTS`.
 * 3. Optionally set `FEATURE_FLAG_<KEY>=true|false` in .env.local for local
 *    overrides, or update the Edge Config store via the admin action.
 *
 * Environment variables (all optional)
 * ─────────────────────────────────────
 * EDGE_CONFIG              — Vercel Edge Config connection string.
 *                            Required in production; absent → falls back silently.
 * FEATURE_FLAG_<KEY>       — Per-flag env-var override (true | false | 1 | 0).
 *                            Key is uppercased + hyphens replaced with underscores.
 * FLAGS_ADMIN_SECRET       — Shared secret that guards the admin update action.
 *                            Must be set in production.
 */

import { useEffect, useState } from "react";

// ─── Flag registry ────────────────────────────────────────────────────────────

/**
 * All recognised feature flag keys.
 * Extend this union when adding new flags.
 */
export type FeatureFlagKey =
  | "dark-mode-toggle"
  | "infinite-scroll"
  | "command-palette";

/** Hard-coded defaults used when Edge Config and env vars are both absent. */
export const FLAG_DEFAULTS: Record<FeatureFlagKey, boolean> = {
  "dark-mode-toggle": true,
  "infinite-scroll": true,
  "command-palette": true,
};

// ─── Server helper ────────────────────────────────────────────────────────────

/**
 * Read a feature flag value. Runs on the server (Node or Edge Runtime).
 *
 * Resolution order:
 *   1. Vercel Edge Config  (requires EDGE_CONFIG env var)
 *   2. `FEATURE_FLAG_<KEY>` environment variable
 *   3. Hard-coded default from FLAG_DEFAULTS
 *
 * Guaranteed to never throw — any Edge Config error is caught and the
 * fallback chain continues.
 *
 * @param key  The flag key (e.g. "dark-mode-toggle")
 * @returns    Resolved boolean value
 */
export async function getFlag(key: FeatureFlagKey): Promise<boolean> {
  // ── 1. Edge Config ────────────────────────────────────────────────────────
  if (process.env.EDGE_CONFIG) {
    try {
      // Lazy import so the module is only loaded on the server and doesn't
      // inflate the client bundle.
      const { get } = await import("@vercel/edge-config");
      const value = await get<boolean>(key);
      if (typeof value === "boolean") return value;
      // Edge Config may store "true"/"false" strings
      if (value === ("true" as unknown) || value === ("1" as unknown)) return true;
      if (value === ("false" as unknown) || value === ("0" as unknown)) return false;
      // Key missing from Edge Config → fall through
    } catch {
      // Edge Config unavailable (misconfigured, rate-limited, network error)
      // → fall through to env var / default
    }
  }

  // ── 2. Environment variable override ─────────────────────────────────────
  const envKey = `FEATURE_FLAG_${key.toUpperCase().replace(/-/g, "_")}`;
  const envValue = process.env[envKey];
  if (envValue !== undefined) {
    return envValue === "true" || envValue === "1";
  }

  // ── 3. Hard-coded default ─────────────────────────────────────────────────
  return FLAG_DEFAULTS[key] ?? false;
}

// ─── Client hook ─────────────────────────────────────────────────────────────

/**
 * React hook for reading a feature flag in client components.
 *
 * Hydrates immediately with the hard-coded default so there is never a
 * flash of disabled content. The true server value is fetched from
 * `/api/flags/<key>` and applied asynchronously.
 *
 * Usage:
 * ```tsx
 * const darkModeEnabled = useFeatureFlag("dark-mode-toggle");
 * if (!darkModeEnabled) return null;
 * ```
 *
 * @param key  The flag key to read
 * @returns    The resolved flag value (starts as the default, updates after fetch)
 */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const [value, setValue] = useState<boolean>(FLAG_DEFAULTS[key] ?? false);

  useEffect(() => {
    let cancelled = false;

    async function fetchFlag() {
      try {
        const res = await fetch(`/api/flags/${encodeURIComponent(key)}`, {
          // Cache for 60 s so repeated renders don't hammer the route
          next: { revalidate: 60 },
        } as RequestInit);

        if (!res.ok) return; // leave value at default on non-2xx

        const json = (await res.json()) as { enabled: boolean };
        if (!cancelled && typeof json.enabled === "boolean") {
          setValue(json.enabled);
        }
      } catch {
        // Network error → keep the default value
      }
    }

    fetchFlag();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return value;
}
