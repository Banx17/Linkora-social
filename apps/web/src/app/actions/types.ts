/**
 * Shared state shape for every Server Action in the app.
 *
 * The `(state, formData)` signature is what React 19's `useActionState` expects,
 * so client forms can render validation errors and progress without any
 * client-side fetch wiring.
 */

export type ActionStatus = "idle" | "success" | "error";

export interface ActionState {
  status: ActionStatus;
  message: string;
  postId?: string;
  txHash?: string;
  /** Assembled (unsigned) envelope awaiting a wallet signature. */
  xdr?: string;
}

export const initialActionState: ActionState = { status: "idle", message: "" };
