/**
 * Shared verification provenance model.
 *
 * Kept framework-agnostic so both data-layer hooks and presentational
 * components can depend on it without importing each other.
 */
export type VerificationLevel = "identity" | "credential" | "attested";

/** Human-readable provenance copy shown in tooltips / screen-reader text. */
export const VERIFICATION_PROVENANCE: Record<VerificationLevel, string> = {
  identity: "Identity verified via Stellar attestation",
  credential: "Credential verified via on-chain proof",
  attested: "Verified via on-chain attestation",
};

/** Short accessible label for each verification level. */
export const VERIFICATION_LABEL: Record<VerificationLevel, string> = {
  identity: "Verified account",
  credential: "Credential-verified account",
  attested: "Verified account",
};
