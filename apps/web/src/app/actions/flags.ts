"use server";

/**
 * Server Action: updateFlag
 *
 * Writes a feature flag value to Vercel Edge Config via the Edge Config
 * REST API. Requires:
 *   - EDGE_CONFIG_ID        — the Edge Config store ID (from the Vercel dashboard)
 *   - VERCEL_API_TOKEN      — a Vercel personal access token with write access
 *   - FLAGS_ADMIN_SECRET    — a shared secret that callers must supply
 *
 * The action validates the admin secret before touching Edge Config so it
 * can safely be called from a UI without exposing write credentials to the
 * client.
 *
 * Usage (from a server component or form action):
 * ```ts
 * import { updateFlag } from "@/app/actions/flags";
 * await updateFlag({ key: "dark-mode-toggle", enabled: false, adminSecret: "…" });
 * ```
 */

import { FLAG_DEFAULTS, type FeatureFlagKey } from "@/lib/featureFlags";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpdateFlagInput {
  key: FeatureFlagKey;
  enabled: boolean;
  /** Must match the FLAGS_ADMIN_SECRET environment variable. */
  adminSecret: string;
}

export interface UpdateFlagResult {
  success: boolean;
  message: string;
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function updateFlag(input: UpdateFlagInput): Promise<UpdateFlagResult> {
  const { key, enabled, adminSecret } = input;

  // ── Auth check ────────────────────────────────────────────────────────────
  const expectedSecret = process.env.FLAGS_ADMIN_SECRET;
  if (!expectedSecret) {
    return {
      success: false,
      message: "FLAGS_ADMIN_SECRET is not configured on the server.",
    };
  }
  if (adminSecret !== expectedSecret) {
    return { success: false, message: "Unauthorized: invalid admin secret." };
  }

  // ── Validate the flag key ─────────────────────────────────────────────────
  if (!(key in FLAG_DEFAULTS)) {
    return { success: false, message: `Unknown flag key: "${key}".` };
  }

  // ── Edge Config credentials ───────────────────────────────────────────────
  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const vercelToken = process.env.VERCEL_API_TOKEN;

  if (!edgeConfigId || !vercelToken) {
    return {
      success: false,
      message:
        "Edge Config is not configured. Set EDGE_CONFIG_ID and VERCEL_API_TOKEN environment variables.",
    };
  }

  // ── Write to Edge Config via the Vercel REST API ──────────────────────────
  try {
    const url = `https://api.vercel.com/v1/edge-config/${encodeURIComponent(edgeConfigId)}/items`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            operation: "upsert",
            key,
            value: enabled,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        message: `Edge Config API error (${response.status}): ${body}`,
      };
    }

    return {
      success: true,
      message: `Flag "${key}" set to ${String(enabled)}.`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to update flag: ${detail}` };
  }
}
