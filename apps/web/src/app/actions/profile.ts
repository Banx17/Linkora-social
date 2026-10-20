"use server";

/**
 * Server Action: updateProfileAction
 *
 * Handles the profile editor form submission with React 19's
 * `useActionState` signature: `(prevState, formData) => Promise<ProfileActionState>`.
 *
 * Responsibilities:
 *  1. Parse + validate fields via the shared Zod profileSchema
 *  2. Return per-field errors immediately without a round-trip when invalid
 *  3. Call the indexer API to persist the profile
 *  4. Revalidate `/profile/[address]` so the updated data is served fresh
 */

import { revalidatePath } from "next/cache";
import { profileSchema, type ProfileFieldErrors } from "@/lib/schemas/profile";

// ─── State shape ──────────────────────────────────────────────────────────────

export type ProfileActionStatus = "idle" | "pending" | "success" | "error";

export interface ProfileActionState {
  status: ProfileActionStatus;
  /** Top-level message (success confirmation or general error). */
  message: string;
  /** Per-field validation errors to display inline next to inputs. */
  fieldErrors?: ProfileFieldErrors;
}

export const initialProfileActionState: ProfileActionState = {
  status: "idle",
  message: "",
};

// ─── Action ───────────────────────────────────────────────────────────────────

const INDEXER_API_URL =
  process.env.NEXT_PUBLIC_INDEXER_API_URL ??
  process.env.NEXT_PUBLIC_INDEXER_URL ??
  "http://localhost:3001";

export async function updateProfileAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  // ── 1. Extract raw values ────────────────────────────────────────────────
  const raw = {
    username: String(formData.get("username") ?? "").trim(),
    creatorToken: String(formData.get("creatorToken") ?? "").trim() || undefined,
  };

  // Address is passed as a hidden field so the action stays wallet-agnostic
  const address = String(formData.get("address") ?? "").trim();

  if (!address) {
    return {
      status: "error",
      message: "Wallet address is missing. Connect your wallet and try again.",
    };
  }

  // ── 2. Zod validation ────────────────────────────────────────────────────
  const parsed = profileSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: ProfileFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof ProfileFieldErrors;
      if (field && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return {
      status: "error",
      message: "Please fix the errors below.",
      fieldErrors,
    };
  }

  const { username, creatorToken } = parsed.data;

  // ── 3. Persist via indexer API ───────────────────────────────────────────
  try {
    const response = await fetch(`${INDEXER_API_URL}/api/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        username,
        creatorToken: creatorToken ?? address,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      return {
        status: "error",
        message: `Failed to save profile: ${text}`,
      };
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return { status: "error", message: `Failed to save profile: ${detail}` };
  }

  // ── 4. Revalidate profile page ───────────────────────────────────────────
  try {
    revalidatePath(`/profile/${address}`);
  } catch {
    // Revalidation is best-effort outside a request context
  }

  return {
    status: "success",
    message: "Profile saved successfully.",
  };
}
