import { ImageResponse } from "next/og";

/**
 * Dynamic Open Graph card for a single post (issue #1737).
 *
 * Generated on demand with `next/og` in the Edge runtime, then cached for an
 * hour so social crawlers get a fast (and stale-while-revalidate'able) response.
 */

export const alt = "Post on Linkora";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "edge";

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";

/** Generated images are cached and served stale-while-revalidate. */
const CACHE_SECONDS = 3600;

interface IndexerPost {
  content?: string;
  author?: string;
  username?: string;
  tip_total?: string | number;
  like_count?: string | number;
}

interface OpenGraphImageProps {
  /**
   * Next 15 hands over a plain object while newer versions pass a promise;
   * `await` copes with both.
   */
  params: { id: string };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

async function loadPost(id: string): Promise<IndexerPost | null> {
  try {
    const response = await fetch(`${INDEXER_URL}/api/posts/${encodeURIComponent(id)}`, {
      next: { revalidate: CACHE_SECONDS },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data?.post ?? data) as IndexerPost;
  } catch {
    // A crawler should still get a branded card when the indexer is down.
    return null;
  }
}

export default async function Image({ params }: OpenGraphImageProps) {
  const { id } = await params;
  const post = await loadPost(id);

  const content = truncate(post?.content?.trim() || "A post on Linkora", 220);
  const author = post?.username?.trim() || (post?.author ? shortAddress(post.author) : "Linkora");
  const tips = Number(post?.tip_total ?? 0) || 0;
  const likes = Number(post?.like_count ?? 0) || 0;

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
          background: "linear-gradient(135deg, #0f172a 0%, #3b0764 55%, #7c2d12 100%)",
          color: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "72px",
              height: "72px",
              borderRadius: "24px",
              background: "#7c3aed",
              fontSize: "40px",
              fontWeight: 700,
            }}
          >
            L
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: "34px", fontWeight: 700 }}>Linkora</div>
            <div style={{ display: "flex", fontSize: "24px", color: "#c4b5fd" }}>
              @{author}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: content.length > 140 ? "44px" : "56px",
            lineHeight: 1.25,
            fontWeight: 600,
          }}
        >
          {content}
        </div>

        <div style={{ display: "flex", gap: "40px", fontSize: "28px", color: "#e9d5ff" }}>
          <div style={{ display: "flex" }}>{tips.toLocaleString()} tips</div>
          <div style={{ display: "flex" }}>{likes.toLocaleString()} likes</div>
          <div style={{ display: "flex" }}>Post #{id}</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
