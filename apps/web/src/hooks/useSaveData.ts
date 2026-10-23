"use client";

/**
 * Whether the user asked the browser to reduce data usage (#1748).
 *
 * True when either `navigator.connection.saveData` is on or the middleware saw
 * a `Save-Data: on` request header (mirrored into a cookie). Re-renders when
 * the Network Information API fires `change`, e.g. the user toggles Lite mode.
 *
 * Unlike `useSlowConnection`, a 2g connection alone does not count: image
 * quality follows the user's explicit preference, not a network estimate.
 */

import { useSyncExternalStore } from "react";

import { getConnection } from "@/hooks/useSlowConnection";
import { hasSaveDataCookie } from "@/lib/saveData";

function subscribe(onStoreChange: () => void): () => void {
  const connection = getConnection();
  if (!connection?.addEventListener) return () => {};

  connection.addEventListener("change", onStoreChange);

  return () => {
    connection.removeEventListener?.("change", onStoreChange);
  };
}

export function readSaveData(): boolean {
  if (getConnection()?.saveData) return true;
  if (typeof document === "undefined") return false;
  return hasSaveDataCookie(document.cookie);
}

// The server render cannot know the client's preference, so both sides start
// from full quality and the client corrects itself right after hydration.
function getServerSnapshot(): boolean {
  return false;
}

export function useSaveData(): boolean {
  return useSyncExternalStore(subscribe, readSaveData, getServerSnapshot);
}
