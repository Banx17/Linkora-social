"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  children: ReactNode;
  /** Label shown while the surrounding <form> action is pending. */
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Submit button wired to React 19's `useFormStatus`.
 *
 * `useFormStatus` only reports the state of the *closest* `<form>`, so this
 * has to live in its own child component rather than in the form itself.
 */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
  className,
  disabled = false,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={
        className ??
        "self-end rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
