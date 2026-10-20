import { ImageResponse } from "next/og";

/**
 * Dynamic Open Graph card for a profile (issue #1737).
 *
 * Generated on demand with `next/og` in the Edge runtime, then cached for an
 * hour so social crawlers get a fast (and stale-while-revalidate'able) response.
 */

export const alt = "Profile on Linkora";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "edge";

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";

/** Generated images are cached and served stale-while-revalidate. */
const CACHE_SECONDS = 3600;

interface IndexerProfile {
  username?: string;
  bio?: string;
  followers_count?: string | number;
  following_count?: string | number;
}

interface OpenGraphImageProps {
  /**
   * Next 15 hands over a plain object while newer versions pass a promise;
   * `await` copes with both.
   */
  params: { address: string };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

async function loadProfile(address: string): Promise<IndexerProfile | null> {
  try {
    const response = await fetch(`${INDEXER_URL}/api/profiles/${encodeURIComponent(address)}`, {
      next: { revalidate: CACHE_SECONDS },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data?.profile ?? data) as IndexerProfile;
  } catch {
    // A crawler should still get a branded card when the indexer is down.
    return null;
  }
}

export default async function Image({ params }: OpenGraphImageProps) {
  const { address } = await params;
  const profile = await loadProfile(address);

  const username = truncate(profile?.username?.trim() || shortAddress(address), 28);
  const bio = truncate(
    profile?.bio?.trim() || "Building a social economy on Stellar with Linkora.",
    160
  );
  const followers = Number(profile?.followers_count ?? 0) || 0;
  const following = Number(profile?.following_count ?? 0) || 0;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
          width: "100%",
          padding: "72px",
          background: "linear-gradient(135deg, #0b1120 0%, #1e3a8a 60%, #0f766e 100%)",
          color: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "160px",
              height: "160px",
              borderRadius: "80px",
              background: "#0ea5e9",
              fontSize: "64px",
              fontWeight: 700,
            }}
          >
            {username.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: "56px", fontWeight: 700 }}>
              {username}
            </div>
            <div style={{ display: "flex", fontSize: "26px", color: "#bae6fd" }}>
              {shortAddress(address)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", fontSize: "34px", lineHeight: 1.4, color: "#e2e8f0" }}>
          {bio}
        </div>

        <div style={{ display: "flex", gap: "48px", fontSize: "30px", color: "#cffafe" }}>
          <div style={{ display: "flex" }}>{followers.toLocaleString()} followers</div>
          <div style={{ display: "flex" }}>{following.toLocaleString()} following</div>
          <div style={{ display: "flex" }}>Linkora</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
