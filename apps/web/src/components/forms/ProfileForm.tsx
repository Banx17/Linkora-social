"use client";

/**
 * ProfileForm — React 19 progressive-enhancement edition.
 *
 * Key design decisions
 * ────────────────────
 * • `useActionState` manages the full form lifecycle (idle → pending → success/error).
 *   No manual `useState` for individual fields — values live natively in the DOM
 *   and are read by the Server Action via `FormData`.
 *
 * • `useFormStatus` (inside `<SubmitButton>`) drives the submit button's
 *   pending state without any prop drilling.
 *
 * • Inline field errors come from `state.fieldErrors` populated by the
 *   Zod-validated Server Action, displayed via the existing `<FieldError>` component.
 *
 * • The form degrades gracefully without JavaScript: the `action` prop on
 *   `<form>` points directly to the Server Action so submission still works
 *   in environments where JS is unavailable.
 *
 * • `address` is passed as a hidden input so the Server Action stays
 *   wallet-agnostic (no direct Freighter access on the server).
 */

import { useActionState } from "react";
import { FieldError } from "./FieldError";
import { SubmitButton } from "./SubmitButton";
import {
  updateProfileAction,
  initialProfileActionState,
  type ProfileActionState,
} from "@/app/actions/profile";
import type { ProfileFormValues } from "@/lib/schemas/profile";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ProfileFormProps {
  /** Wallet address passed as a hidden field to the Server Action. */
  address: string;
  /** Pre-populate inputs with existing profile data. */
  initialValues?: Partial<ProfileFormValues>;
}

// Re-export so callers that used to import ProfileFormValues from here still work
export type { ProfileFormValues };

// ─── Component ───────────────────────────────────────────────────────────────

export function ProfileForm({ address, initialValues = {} }: ProfileFormProps) {
  const [state, formAction] = useActionState<ProfileActionState, FormData>(
    updateProfileAction,
    initialProfileActionState
  );

  const { fieldErrors } = state;

  return (
    <form
      action={formAction}
      aria-label="Edit profile"
      className="flex flex-col gap-4"
      noValidate
    >
      {/* Hidden wallet address — read by the Server Action */}
      <input type="hidden" name="address" value={address} />

      {/* ── Top-level status banner ───────────────────────────────────────── */}
      {state.status === "success" && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700"
        >
          {state.message}
        </div>
      )}
      {state.status === "error" && !state.fieldErrors && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {state.message}
        </div>
      )}

      {/* ── Username ─────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="profile-username" className="block text-sm font-medium mb-1">
          Username{" "}
          <span aria-hidden="true" className="text-red-500">
            *
          </span>
        </label>
        <input
          id="profile-username"
          name="username"
          type="text"
          defaultValue={initialValues.username ?? ""}
          required
          aria-required="true"
          aria-describedby={fieldErrors?.username ? "profile-username-error" : undefined}
          aria-invalid={!!fieldErrors?.username}
          placeholder="e.g. alice_stellar"
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 ${
            fieldErrors?.username ? "border-red-500" : "border-gray-300"
          }`}
        />
        <FieldError id="profile-username-error" message={fieldErrors?.username} />
      </div>

      {/* ── Creator Token ────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="profile-creator-token" className="block text-sm font-medium mb-1">
          Creator Token Address{" "}
          <span className="text-xs text-gray-500 font-normal">
            (optional — your SEP-41 token)
          </span>
        </label>
        <input
          id="profile-creator-token"
          name="creatorToken"
          type="text"
          defaultValue={initialValues.creatorToken ?? ""}
          aria-describedby={
            fieldErrors?.creatorToken
              ? "profile-creator-token-error"
              : "profile-creator-token-hint"
          }
          aria-invalid={!!fieldErrors?.creatorToken}
          placeholder="GABC…XYZ"
          className={`w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 ${
            fieldErrors?.creatorToken ? "border-red-500" : "border-gray-300"
          }`}
        />
        {!fieldErrors?.creatorToken && (
          <p id="profile-creator-token-hint" className="mt-1 text-xs text-gray-500">
            Starts with G or C, 56 characters. Leave blank to use your wallet address.
          </p>
        )}
        <FieldError id="profile-creator-token-error" message={fieldErrors?.creatorToken} />
      </div>

      {/* ── Submit ───────────────────────────────────────────────────────── */}
      <SubmitButton pendingLabel="Saving…">Save Profile</SubmitButton>
    </form>
  );
}
