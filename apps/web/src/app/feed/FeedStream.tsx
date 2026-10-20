"use client";

/**
 * Streams the first page of one feed tab (issue #1736).
 *
 * The snapshot promise is owned by `FeedPage`, not created here: a component
 * that suspends has its in-progress state discarded, so a promise created in
 * this render would be recreated on every retry and the feed would never
 * resolve. Receiving it as a prop keeps it stable across retries.
 *
 * Pagination and the infinite-scroll UI live in `FeedList`, which receives the
 * streamed snapshot as its first page.
 */

import { use } from "react";

import { FeedList } from "./FeedList";
import type { FeedSnapshot, FeedTab } from "@/services/feed";

export interface FeedStreamProps {
  tab: FeedTab;
  address: string | null;
  promise: Promise<FeedSnapshot>;
}

export function FeedStream({ tab, address, promise }: FeedStreamProps) {
  const initial = use(promise);

  return <FeedList tab={tab} address={address} initial={initial} />;
}
