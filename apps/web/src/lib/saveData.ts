/**
 * Save-Data signal helpers (#1748), shared by the middleware and the
 * `useSaveData` hook.
 *
 * Browsers expose the user's "reduce data usage" preference two ways:
 *  - the `Save-Data: on` request header, visible only on the server;
 *  - `navigator.connection.saveData`, visible only to client JS (Chromium).
 *
 * The middleware mirrors the header into a readable cookie so client
 * components also see it when the Network Information API is missing.
 */

export const SAVE_DATA_HEADER = "save-data";
export const SAVE_DATA_COOKIE = "linkora-save-data";

/** The header's only defined token is `on` (case-insensitive). */
export function isSaveDataHeader(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === "on";
}

/** Reads the mirrored cookie from a `document.cookie`-style string. */
export function hasSaveDataCookie(cookieString: string | null | undefined): boolean {
  if (!cookieString) return false;
  return cookieString.split(";").some((part) => part.trim() === `${SAVE_DATA_COOKIE}=1`);
}

export type SaveDataCookieAction = "set" | "delete" | null;

/**
 * What the middleware should do with the mirrored cookie for a request:
 * write it when the header appears, delete it when the header goes away, and
 * otherwise leave the response alone (no `Set-Cookie` on ordinary requests).
 */
export function getSaveDataCookieAction(
  headerValue: string | null | undefined,
  cookieValue: string | null | undefined
): SaveDataCookieAction {
  const wantsSaveData = isSaveDataHeader(headerValue);
  const hasCookie = cookieValue === "1";

  if (wantsSaveData && !hasCookie) return "set";
  if (!wantsSaveData && hasCookie) return "delete";
  return null;
}
