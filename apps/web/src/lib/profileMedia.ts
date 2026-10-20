const AVATAR_PREFIX = "linkora:profile-avatar:";
const COVER_PREFIX = "linkora:profile-cover:";

function key(prefix: string, address: string): string {
  return `${prefix}${address}`;
}

/** Persist the uploaded avatar URL for a wallet address locally. */
export function saveProfileAvatar(address: string, url: string | null): void {
  if (typeof window === "undefined" || !address) return;
  try {
    if (url) window.localStorage.setItem(key(AVATAR_PREFIX, address), url);
    else window.localStorage.removeItem(key(AVATAR_PREFIX, address));
  } catch {
    /* storage can be unavailable (private mode) — preview still works in-session */
  }
}

export function getProfileAvatar(address: string): string | null {
  if (typeof window === "undefined" || !address) return null;
  try {
    return window.localStorage.getItem(key(AVATAR_PREFIX, address));
  } catch {
    return null;
  }
}

/** Persist the uploaded cover URL for a wallet address locally. */
export function saveProfileCover(address: string, url: string | null): void {
  if (typeof window === "undefined" || !address) return;
  try {
    if (url) window.localStorage.setItem(key(COVER_PREFIX, address), url);
    else window.localStorage.removeItem(key(COVER_PREFIX, address));
  } catch {
    /* storage can be unavailable (private mode) — preview still works in-session */
  }
}

export function getProfileCover(address: string): string | null {
  if (typeof window === "undefined" || !address) return null;
  try {
    return window.localStorage.getItem(key(COVER_PREFIX, address));
  } catch {
    return null;
  }
}
