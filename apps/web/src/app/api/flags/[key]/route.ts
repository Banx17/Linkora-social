/**
 * GET /api/flags/[key]
 *
 * Edge-compatible route that serves individual feature flag values to client
 * components. Responses are cached for 60 seconds at the edge.
 *
 * Response: { "enabled": true }
 */

import { NextRequest, NextResponse } from "next/server";
import { getFlag, FLAG_DEFAULTS, type FeatureFlagKey } from "@/lib/featureFlags";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;

  // Validate the key is known before reading Edge Config
  if (!(key in FLAG_DEFAULTS)) {
    return NextResponse.json(
      { error: `Unknown flag key: ${key}` },
      { status: 404 }
    );
  }

  const enabled = await getFlag(key as FeatureFlagKey);

  return NextResponse.json(
    { enabled },
    {
      headers: {
        // Cache at the edge for 60 s, stale-while-revalidate for another 60 s
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
      },
    }
  );
}
