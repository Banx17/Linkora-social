"use client";

/**
 * Detects a slow network using the Network Information API.
 *
 * The API is Chromium-only, so this intentionally treats "unknown" as "not
 * slow": the feed keeps its observer-driven infinite scroll instead of
 * degrading every browser that lacks `navigator.connection`.
 *
 * When a connection becomes slow (or `saveData` is on) the feed must not
 * prefetch, because each page costs a round trip the user did not ask for.
 */

import { useSyncExternalStore } from "react";

interface NetworkInformationLike {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
}

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
};

export function getConnection(): NetworkInformationLike | undefined {
  if (typeof navigator === "undefined") return undefined;

  const navigatorWithConnection = navigator as NavigatorWithConnection;
  return (
    navigatorWithConnection.connection ??
    navigatorWithConnection.mozConnection ??
    navigatorWithConnection.webkitConnection
  );
}

/**
 * Pure predicate, exported for tests and for callers that already have a
 * connection object.
 */
export function isSlowConnection(connection: NetworkInformationLike | undefined): boolean {
  if (!connection) return false;
  if (connection.saveData) return true;

  return connection.effectiveType === "slow-2g" || connection.effectiveType === "2g";
}

function subscribe(onStoreChange: () => void): () => void {
  const connection = getConnection();
  if (!connection?.addEventListener) return () => {};

  connection.addEventListener("change", onStoreChange);

  return () => {
    connection.removeEventListener?.("change", onStoreChange);
  };
}

function getSnapshot(): boolean {
  return isSlowConnection(getConnection());
}

// The server has no network information; rendering the manual fallback would
// then mismatch the client, so both start from "not slow".
function getServerSnapshot(): boolean {
  return false;
}

export function useSlowConnection(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export type { NetworkInformationLike };
