/**
 * In-memory post store backing the demo API routes.
 *
 * Shared between `GET/POST /api/posts` and `DELETE /api/posts/[id]` so an
 * optimistic delete in the UI is reflected by the server response instead of
 * always failing with a 404.
 */

export interface PostPayload {
  id?: string | number;
  content: string;
  author?: string;
  images?: string[];
  linkUrl?: string;
}

export interface Post {
  id: string;
  author: string;
  username: string;
  content: string;
  images?: string[];
  linkUrl?: string;
  tip_total: number;
  like_count: number;
  created_at: string;
  timestamp: number;
}

export const mockPosts: Post[] = [
  {
    id: "post-1",
    author: "GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    username: "stellar_dev",
    content: "Just deployed my first smart contract on Stellar! 🚀",
    tip_total: 100,
    like_count: 5,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    timestamp: Math.floor(Date.now() / 1000) - 3600,
  },
  {
    id: "post-2",
    author: "GXYZ9876543210ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    username: "crypto_enthusiast",
    content: "The SocialFi ecosystem is growing fast. Excited to be part of it!",
    tip_total: 50,
    like_count: 3,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    timestamp: Math.floor(Date.now() / 1000) - 7200,
  },
];
