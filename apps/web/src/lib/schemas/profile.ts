/**
 * Shared Zod schema for profile form fields.
 *
 * Imported by both the Server Action (server-side validation) and the
 * ProfileForm component (client-side inline error display).  Keeping the
 * schema in one place ensures client and server stay in sync.
 *
 * Constants are re-exported so UI labels can reference them without
 * duplicating magic numbers.
 */

import { z } from "zod";

// ─── Constants ────────────────────────────────────────────────────────────────

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;

/** Stellar / Soroban public key: G… or C… followed by 55 base-32 chars */
const STELLAR_ADDRESS_RE = /^[GC][A-Z2-7]{55}$/;

// ─── Schema ───────────────────────────────────────────────────────────────────

export const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username is required.")
    .min(USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters.`)
    .max(USERNAME_MAX, `Username must be ${USERNAME_MAX} characters or fewer.`)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username may only contain letters, numbers, and underscores."
    ),

  creatorToken: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || STELLAR_ADDRESS_RE.test(val),
      "Enter a valid Stellar address (starts with G or C, 56 characters)."
    ),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

/**
 * Per-field validation errors returned by the Server Action and consumed by
 * ProfileForm to show inline messages.
 */
export type ProfileFieldErrors = Partial<Record<keyof ProfileFormValues, string>>;
