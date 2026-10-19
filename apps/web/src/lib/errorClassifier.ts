import {
  SimulationError,
  ContractErrorCode,
  NetworkError,
  InvalidInputError,
  ValidationError,
} from "linkora-sdk";

export type ErrorCategory = "network" | "contract" | "general";

/** Keywords that indicate a network / connectivity problem. */
const NETWORK_PATTERNS: RegExp[] = [
  /fetch/i,
  /network/i,
  /timeout/i,
  /connection/i,
  /ECONNREFUSED/,
  /failed to fetch/i,
  /ERR_NETWORK/i,
  /net::ERR_/i,
  /load failed/i,
];

/**
 * Keywords that indicate a blockchain / contract / wallet problem.
 * We check for Stellar / Soroban / Freighter terminology as well as
 * generic Web3 terms so the boundary works for any future chain.
 */
const CONTRACT_PATTERNS: RegExp[] = [
  /contract/i,
  /transaction/i,
  /blockchain/i,
  /wallet/i,
  /provider/i,
  /stellar/i,
  /soroban/i,
  /freighter/i,
  /simulation/i,
  /invoke/i,
  /XDR/i,
  /rpc/i,
  /account sequence/i,
];

/** Mappings for Soroban host error trap codes. */
const TRAP_MAPPINGS: Record<string, string> = {
  ARITH_COUNT: "An arithmetic calculation error occurred during contract execution.",
  MEM_LIMIT_EXCEEDED: "Transaction memory limit exceeded during contract execution.",
  CONTRACT_RECURSION: "Contract execution exceeded maximum recursion depth.",
};

/** Mappings for Linkora ContractErrorCode variants. */
const CONTRACT_ERROR_MAPPINGS: Record<string | number, string> = {
  [ContractErrorCode.AlreadyInitialized]: "Contract is already initialized.",
  AlreadyInitialized: "Contract is already initialized.",

  [ContractErrorCode.UsernameTaken]: "That username is already taken. Please choose another.",
  UsernameTaken: "That username is already taken. Please choose another.",

  [ContractErrorCode.UsernameTooLong]: "Username exceeds the maximum allowed length.",
  UsernameTooLong: "Username exceeds the maximum allowed length.",

  [ContractErrorCode.NotAdmin]: "Admin authorization is required for this operation.",
  NotAdmin: "Admin authorization is required for this operation.",

  [ContractErrorCode.OnlyAuthor]: "Only the original author can perform this operation.",
  OnlyAuthor: "Only the original author can perform this operation.",

  [ContractErrorCode.Blocked]: "Operation rejected because the user is blocked.",
  Blocked: "Operation rejected because the user is blocked.",

  [ContractErrorCode.InsufficientAllowance]:
    "Insufficient token allowance. Please approve the required allowance.",
  InsufficientAllowance:
    "Insufficient token allowance. Please approve the required allowance.",

  [ContractErrorCode.InsufficientBalance]:
    "Insufficient token or account balance to complete this transaction.",
  InsufficientBalance:
    "Insufficient token or account balance to complete this transaction.",

  [ContractErrorCode.CooldownActive]:
    "Tipping cooldown period is active. Please wait before trying again.",
  CooldownActive:
    "Tipping cooldown period is active. Please wait before trying again.",

  [ContractErrorCode.NotFound]: "The requested resource or record was not found.",
  NotFound: "The requested resource or record was not found.",

  [ContractErrorCode.PostTooLong]: "Post content exceeds the maximum allowed length.",
  PostTooLong: "Post content exceeds the maximum allowed length.",

  [ContractErrorCode.InvalidInput]: "Invalid input parameter provided.",
  InvalidInput: "Invalid input parameter provided.",

  [ContractErrorCode.SimulationFailed]: "Contract transaction simulation failed.",
  SimulationFailed: "Contract transaction simulation failed.",

  [ContractErrorCode.NotInitialized]: "Contract has not been initialized yet.",
  NotInitialized: "Contract has not been initialized yet.",

  [ContractErrorCode.UsernameTooShort]: "Username must be at least 3 characters.",
  UsernameTooShort: "Username must be at least 3 characters.",

  [ContractErrorCode.ContentTooLong]: "Post content exceeds the 280-character limit.",
  ContentTooLong: "Post content exceeds the 280-character limit.",

  [ContractErrorCode.ContentEmpty]: "Post content cannot be empty.",
  ContentEmpty: "Post content cannot be empty.",

  [ContractErrorCode.NotBlocked]: "This user is not blocked.",
  NotBlocked: "This user is not blocked.",

  [ContractErrorCode.Unauthorized]: "You do not have permission to perform this action.",
  Unauthorized: "You do not have permission to perform this action.",

  [ContractErrorCode.PostNotFound]: "Post not found.",
  PostNotFound: "Post not found.",

  [ContractErrorCode.ProfileNotFound]: "Profile not found.",
  ProfileNotFound: "Profile not found.",

  [ContractErrorCode.PoolNotFound]: "Pool not found.",
  PoolNotFound: "Pool not found.",

  [ContractErrorCode.PoolExists]: "A pool with this name already exists.",
  PoolExists: "A pool with this name already exists.",

  [ContractErrorCode.InvalidThreshold]: "Invalid threshold value for pool signing.",
  InvalidThreshold: "Invalid threshold value for pool signing.",

  [ContractErrorCode.InsufficientSigners]: "Not enough signers to reach the required threshold.",
  InsufficientSigners: "Not enough signers to reach the required threshold.",

  [ContractErrorCode.UnauthorizedSigner]: "Signer is not authorized for this pool.",
  UnauthorizedSigner: "Signer is not authorized for this pool.",

  [ContractErrorCode.LowBalance]: "Pool balance is insufficient for this withdrawal.",
  LowBalance: "Pool balance is insufficient for this withdrawal.",

  [ContractErrorCode.WrongToken]: "Wrong token for this pool.",
  WrongToken: "Wrong token for this pool.",

  [ContractErrorCode.AlreadyPaused]: "Module is already paused.",
  AlreadyPaused: "Module is already paused.",

  [ContractErrorCode.NotPaused]: "Module is not paused.",
  NotPaused: "Module is not paused.",

  [ContractErrorCode.ContractPaused]: "This contract is currently paused.",
  ContractPaused: "This contract is currently paused.",

  [ContractErrorCode.AlreadyFollowing]: "You already follow this user.",
  AlreadyFollowing: "You already follow this user.",

  [ContractErrorCode.NotFollowing]: "You do not follow this user.",
  NotFollowing: "You do not follow this user.",

  [ContractErrorCode.SelfInteractionNotAllowed]: "You cannot perform this action on your own content.",
  SelfInteractionNotAllowed: "You cannot perform this action on your own content.",

  [ContractErrorCode.InvalidAmount]: "Invalid amount. Must be positive and within limits.",
  InvalidAmount: "Invalid amount. Must be positive and within limits.",

  [ContractErrorCode.TipCooldownActive]: "Tipping cooldown period is active. Please wait before trying again.",
  TipCooldownActive: "Tipping cooldown period is active. Please wait before trying again.",

  [ContractErrorCode.InvalidCooldown]: "Invalid cooldown window.",
  InvalidCooldown: "Invalid cooldown window.",

  [ContractErrorCode.GraphEntryExpired]: "Your follow graph entry has expired. Please pay rent first.",
  GraphEntryExpired: "Your follow graph entry has expired. Please pay rent first.",

  [ContractErrorCode.UnauthorizedRole]: "You do not have the required role for this operation.",
  UnauthorizedRole: "You do not have the required role for this operation.",

  [ContractErrorCode.PoolAdminNotFound]: "Address is not a pool admin.",
  PoolAdminNotFound: "Address is not a pool admin.",

  [ContractErrorCode.PoolAdminExists]: "Address is already a pool admin.",
  PoolAdminExists: "Address is already a pool admin.",

  [ContractErrorCode.ProposalNotFound]: "Proposal not found.",
  ProposalNotFound: "Proposal not found.",

  [ContractErrorCode.ProposalExpired]: "Proposal voting period has ended.",
  ProposalExpired: "Proposal voting period has ended.",

  [ContractErrorCode.TimeLockNotExpired]: "Proposal execution time lock has not expired yet.",
  TimeLockNotExpired: "Proposal execution time lock has not expired yet.",

  [ContractErrorCode.QuorumNotMet]: "Proposal did not reach quorum.",
  QuorumNotMet: "Proposal did not reach quorum.",

  [ContractErrorCode.AlreadyVoted]: "You have already voted on this proposal.",
  AlreadyVoted: "You have already voted on this proposal.",

  [ContractErrorCode.ReportNotFound]: "Report not found.",
  ReportNotFound: "Report not found.",

  [ContractErrorCode.InvalidVerdict]: "Invalid moderation verdict.",
  InvalidVerdict: "Invalid moderation verdict.",

  [ContractErrorCode.InvalidPostId]: "Invalid post ID.",
  InvalidPostId: "Invalid post ID.",

  [ContractErrorCode.ZeroAddress]: "Invalid address.",
  ZeroAddress: "Invalid address.",

  [ContractErrorCode.CannotRemoveLastAdmin]: "Cannot remove the last admin.",
  CannotRemoveLastAdmin: "Cannot remove the last admin.",

  [ContractErrorCode.CannotRemoveLastUpgrader]: "Cannot remove the last upgrader.",
  CannotRemoveLastUpgrader: "Cannot remove the last upgrader.",

  [ContractErrorCode.MathOverflow]: "Arithmetic overflow occurred.",
  MathOverflow: "Arithmetic overflow occurred.",
};

/**
 * Returns a human-readable message for a SimulationError.
 * Prefers mapped hostError messages over raw error strings.
 * Falls back to raw `error` string if hostError is unmapped or absent.
 */
export function simulationMessage(error: SimulationError): string {
  const hostErr = error.hostError;

  if (hostErr !== undefined && hostErr !== null) {
    const key = String(hostErr).trim();
    if (TRAP_MAPPINGS[key]) {
      return TRAP_MAPPINGS[key];
    }
    if (CONTRACT_ERROR_MAPPINGS[key]) {
      return CONTRACT_ERROR_MAPPINGS[key];
    }
    const numKey = Number(key);
    if (!isNaN(numKey) && CONTRACT_ERROR_MAPPINGS[numKey]) {
      return CONTRACT_ERROR_MAPPINGS[numKey];
    }
  }

  const rawError = error.error || error.message;
  return rawError || "Transaction simulation failed.";
}

export function networkMessage(error: NetworkError): string {
  return error.message || "A network error occurred. Please check your connection.";
}

export function validationMessage(error: ValidationError | InvalidInputError): string {
  return error.message || "Invalid input provided.";
}

/**
 * Maps any thrown error to a user-facing error message string.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof SimulationError) {
    return simulationMessage(error);
  }
  if (error instanceof NetworkError) {
    return networkMessage(error);
  }
  if (error instanceof ValidationError || error instanceof InvalidInputError) {
    return validationMessage(error);
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong";
}

/**
 * Returns the display category for a given Error.
 *
 * Matching priority: SimulationError -> network > contract > general.
 */
export function classifyError(error: Error): ErrorCategory {
  if (error instanceof SimulationError) {
    return "contract";
  }

  const haystack = `${error.name} ${error.message}`;

  if (NETWORK_PATTERNS.some((re) => re.test(haystack))) {
    return "network";
  }

  if (CONTRACT_PATTERNS.some((re) => re.test(haystack))) {
    return "contract";
  }

  return "general";
}
