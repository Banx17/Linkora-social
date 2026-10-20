import { GovParameter } from "linkora-sdk";
import type { GovConfig, GovProposal, LinkoraClient as LinkoraClientType } from "linkora-sdk";
import { LinkoraClient } from "linkora-sdk";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { config } from "@/config";
import { buildSignAndSubmit, type TransactionConfig } from "./tx";

export const GOVERNANCE_PAGE_SIZE = 8;

/** Approximate ledger close time used for countdown estimates. */
export const LEDGER_SECONDS = 5;

export const GOVERNANCE_PARAMETERS = Object.values(GovParameter) as GovParameter[];

export type GovernanceStatus = "Active" | "Passed" | "Failed" | "Executed" | "Vetoed";
export type VoteChoice = "for" | "against" | "abstain";

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  rationale: string | null;
  proposer: string;
  parameter: GovParameter;
  newValue: bigint;
  newAddress: string | null;
  status: GovernanceStatus;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  effectiveQuorum: number;
  createdLedger: number;
  deadlineLedger: number;
  /** Wall-clock estimate of the vote deadline (ms since epoch). */
  deadlineAt: number;
  timeLockLedgers: number;
  expiryLedgers: number;
}

export interface GovernanceConfig {
  quorum: number;
  voteWindowLedgers: number;
  timeLockLedgers: number;
  expiryLedgers: number;
}

export interface ProposalPage {
  proposals: GovernanceProposal[];
  page: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ProposalDraft {
  title: string;
  description: string;
  parameter: GovParameter;
  newValue: string;
  newAddress: string;
}

interface ChainProposalMetadata {
  title?: string;
  description?: string;
  rationale?: string | null;
}

type ChainProposal = GovProposal & {
  metadata?: ChainProposalMetadata | null;
  time_lock_ledgers?: number;
  expiry_ledgers?: number;
};

type ChainConfig = GovConfig & { proposal_expiry_ledgers?: number };

// ── Client / configuration ───────────────────────────────────────────────────

let cachedClient: LinkoraClient | null = null;

export function getGovernanceClient(): LinkoraClient {
  if (!cachedClient) {
    cachedClient = new LinkoraClient({
      contractId: config.contractId,
      rpcUrl: config.sorobanRpcUrl,
      networkPassphrase: config.networkPassphrase,
    });
  }
  return cachedClient;
}

/**
 * The default config module ships a clearly fake `CXXXX…` fallback. Treat that
 * (and obviously malformed values) as "no contract configured" so preview
 * environments render the sample proposals instead of silently fetching from
 * an invalid contract.
 */
export function isGovernanceConfigured(): boolean {
  const id = config.contractId;
  if (!id || id.startsWith("CXXX") || id === "CDUMMY") return false;
  return /^C[A-Z2-7]{55}$/.test(id);
}

export function governanceTxConfig(): TransactionConfig {
  return {
    contractId: config.contractId,
    rpcUrl: config.sorobanRpcUrl,
    networkPassphrase: config.networkPassphrase,
  };
}

// ── Formatting / pure helpers ────────────────────────────────────────────────

export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function statusFromChain(status: string): GovernanceStatus {
  switch (status) {
    case "Passed":
      return "Passed";
    case "Failed":
      return "Failed";
    case "Executed":
      return "Executed";
    case "Vetoed":
      return "Vetoed";
    default:
      return "Active";
  }
}

export function parameterLabel(parameter: GovParameter): string {
  switch (parameter) {
    case GovParameter.FeeBps:
      return "Platform fee";
    case GovParameter.Treasury:
      return "Treasury address";
    case GovParameter.TipCooldownWindow:
      return "Tip cooldown";
    case GovParameter.GovQuorum:
      return "Governance quorum";
    case GovParameter.GovTimeLock:
      return "Governance time lock";
    case GovParameter.GovVoteWindow:
      return "Governance vote window";
    case GovParameter.ModerationSlashBps:
      return "Moderation slash";
    default:
      return parameter;
  }
}

export function formatParameterValue(proposal: Pick<GovernanceProposal, "parameter" | "newValue" | "newAddress">): string {
  const value = proposal.newValue.toString();
  switch (proposal.parameter) {
    case GovParameter.FeeBps:
    case GovParameter.ModerationSlashBps:
      return `${Number(proposal.newValue) / 100}%`;
    case GovParameter.Treasury:
      return proposal.newAddress ? truncateAddress(proposal.newAddress) : "—";
    case GovParameter.TipCooldownWindow:
    case GovParameter.GovTimeLock:
    case GovParameter.GovVoteWindow:
      return `${value} ledgers`;
    case GovParameter.GovQuorum:
      return `${value}%`;
    default:
      return value;
  }
}

export function proposalTitle(parameter: GovParameter, newValue: bigint, newAddress: string | null): string {
  switch (parameter) {
    case GovParameter.FeeBps:
      return `Update platform fee to ${Number(newValue) / 100}%`;
    case GovParameter.Treasury:
      return newAddress ? `Update treasury to ${truncateAddress(newAddress)}` : "Update treasury address";
    case GovParameter.TipCooldownWindow:
      return `Set tip cooldown to ${newValue.toString()} ledgers`;
    case GovParameter.GovQuorum:
      return `Set governance quorum to ${newValue.toString()}%`;
    case GovParameter.GovTimeLock:
      return `Set governance time lock to ${newValue.toString()} ledgers`;
    case GovParameter.GovVoteWindow:
      return `Set governance vote window to ${newValue.toString()} ledgers`;
    case GovParameter.ModerationSlashBps:
      return `Set moderation slash to ${Number(newValue) / 100}%`;
    default:
      return `Update ${parameter}`;
  }
}

export function formatCountdown(deadlineAt: number, now: number = Date.now()): string {
  const diff = deadlineAt - now;
  if (diff <= 0) return "Voting ended";

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m ${seconds}s left`;
  return `${seconds}s left`;
}

export function votePercentages(proposal: Pick<GovernanceProposal, "votesFor" | "votesAgainst" | "votesAbstain">) {
  const total = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;
  if (total === 0) return { for: 0, against: 0, abstain: 0, total: 0 };
  return {
    for: Math.round((proposal.votesFor / total) * 100),
    against: Math.round((proposal.votesAgainst / total) * 100),
    abstain: Math.round((proposal.votesAbstain / total) * 100),
    total,
  };
}

export function buildCalldataPreview(
  parameter: GovParameter,
  newValue: string,
  newAddress: string
): string {
  const value = newValue.trim() || "0";
  switch (parameter) {
    case GovParameter.FeeBps:
      return `set_fee(${value})`;
    case GovParameter.Treasury:
      return `set_treasury(${newAddress.trim() || "ADDRESS"})`;
    case GovParameter.TipCooldownWindow:
      return `set_tip_cooldown_window(${value})`;
    case GovParameter.GovQuorum:
      return `gov_set_config(quorum=${value})`;
    case GovParameter.GovTimeLock:
      return `gov_set_config(time_lock_ledgers=${value})`;
    case GovParameter.GovVoteWindow:
      return `gov_set_config(vote_window_ledgers=${value})`;
    case GovParameter.ModerationSlashBps:
      return `set_moderation_slash_bps(${value})`;
    default:
      return `gov_execute(${value})`;
  }
}

export function validateProposalDraft(draft: ProposalDraft): string | null {
  const title = draft.title.trim();
  const description = draft.description.trim();

  if (title.length < 1 || title.length > 100) {
    return "Title must be between 1 and 100 characters.";
  }
  if (description.length < 1 || description.length > 1000) {
    return "Description must be between 1 and 1000 characters.";
  }
  if (!/^\d+$/.test(draft.newValue.trim())) {
    return "New value must be a whole number.";
  }

  const value = BigInt(draft.newValue.trim());
  switch (draft.parameter) {
    case GovParameter.FeeBps:
    case GovParameter.ModerationSlashBps:
      if (value > 10_000n) return "Basis points must be between 0 and 10000.";
      break;
    case GovParameter.GovQuorum:
      if (value < 1n || value > 100n) return "Quorum must be between 1 and 100.";
      break;
    case GovParameter.TipCooldownWindow:
    case GovParameter.GovTimeLock:
    case GovParameter.GovVoteWindow:
      if (value < 1n || value > 4_294_967_295n) {
        return "Value must be between 1 and 4294967295 ledgers.";
      }
      break;
    case GovParameter.Treasury:
      if (!/^[GC][A-Z2-7]{55}$/.test(draft.newAddress.trim())) {
        return "Enter a valid Stellar account (G…) or contract (C…) address.";
      }
      break;
  }

  return null;
}

// ── "Your vote" cache ────────────────────────────────────────────────────────
// The contract stores votes under (proposal_id, voter) but exposes no getter, so
// we remember votes cast from this browser. This is a cache, not a second
// source of truth: on-chain tallies always come from the SDK.

const LOCAL_VOTES_KEY = "linkora_governance_votes";

type LocalVoteMap = Record<string, VoteChoice>;

function readLocalVotes(): LocalVoteMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_VOTES_KEY);
    return raw ? (JSON.parse(raw) as LocalVoteMap) : {};
  } catch {
    return {};
  }
}

export function getLocalVote(address: string | null, proposalId: string): VoteChoice | null {
  if (!address) return null;
  return readLocalVotes()[`${address}:${proposalId}`] ?? null;
}

export function saveLocalVote(address: string, proposalId: string, choice: VoteChoice): void {
  if (typeof window === "undefined") return;
  try {
    const votes = readLocalVotes();
    votes[`${address}:${proposalId}`] = choice;
    window.localStorage.setItem(LOCAL_VOTES_KEY, JSON.stringify(votes));
  } catch {
    // Storage can be unavailable (private mode / quota). The on-chain vote has
    // already succeeded, so failing to cache it must not surface an error.
  }
}

// ── Sample data ──────────────────────────────────────────────────────────────
// Used only when no contract is configured (local preview / tests). Mirrors the
// shape returned by the live SDK so every screen exercises the same rendering.

export const SAMPLE_GOVERNANCE_CONFIG: GovernanceConfig = {
  quorum: 30,
  voteWindowLedgers: 17_280,
  timeLockLedgers: 720,
  expiryLedgers: 0,
};

export function getSampleProposals(now: number = Date.now()): GovernanceProposal[] {
  const base = {
    proposer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    effectiveQuorum: 30,
    createdLedger: 1000,
    deadlineLedger: 18280,
    timeLockLedgers: 720,
    expiryLedgers: 0,
  };

  return [
    {
      ...base,
      id: "6",
      title: "Reduce the platform fee to 2.5%",
      description:
        "Lower the protocol fee from **3% to 2.5%** to make tipping more attractive.\n\n- Applies to new tips only\n- Treasury allocation is unchanged",
      rationale: "Lower fees improve creator payouts while keeping the treasury funded.",
      parameter: GovParameter.FeeBps,
      newValue: 250n,
      newAddress: null,
      status: "Active",
      votesFor: 1250,
      votesAgainst: 430,
      deadlineAt: now + 2 * 86_400_000,
    },
    {
      ...base,
      id: "5",
      title: "Raise governance quorum to 40%",
      description:
        "Increase the quorum required for parameter changes so that more voices are heard before execution.",
      rationale: null,
      parameter: GovParameter.GovQuorum,
      newValue: 40n,
      newAddress: null,
      status: "Active",
      votesFor: 860,
      votesAgainst: 210,
      deadlineAt: now + 6 * 3_600_000,
    },
    {
      ...base,
      id: "4",
      title: "Rotate the treasury to a new multisig",
      description:
        "Move the protocol treasury to the community-controlled multisig reviewed in the forum thread.",
      rationale: "The new multisig has a 3-of-5 threshold and publicly documented signers.",
      parameter: GovParameter.Treasury,
      newValue: 0n,
      newAddress: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ",
      status: "Passed",
      votesFor: 2100,
      votesAgainst: 320,
      deadlineAt: now - 3_600_000,
    },
    {
      ...base,
      id: "3",
      title: "Set tip cooldown to 1,200 ledgers",
      description: "Reduce spam by increasing the tip cooldown window.",
      rationale: null,
      parameter: GovParameter.TipCooldownWindow,
      newValue: 1200n,
      newAddress: null,
      status: "Executed",
      votesFor: 1800,
      votesAgainst: 90,
      deadlineAt: now - 7 * 86_400_000,
    },
    {
      ...base,
      id: "2",
      title: "Double the moderation slash",
      description: "Increase the slash applied to upheld moderation reports from 25% to 50%.",
      rationale: "The current slash was not deterring repeated abuse.",
      parameter: GovParameter.ModerationSlashBps,
      newValue: 5000n,
      newAddress: null,
      status: "Failed",
      votesFor: 220,
      votesAgainst: 640,
      deadlineAt: now - 9 * 86_400_000,
    },
    {
      ...base,
      id: "1",
      title: "Extend the governance vote window",
      description: "Extend the voting window from one day to two days.",
      rationale: null,
      parameter: GovParameter.GovVoteWindow,
      newValue: 34560n,
      newAddress: null,
      status: "Vetoed",
      votesFor: 410,
      votesAgainst: 110,
      deadlineAt: now - 12 * 86_400_000,
    },
  ];
}

function samplePage(page: number, pageSize: number): ProposalPage {
  const all = getSampleProposals();
  const start = (page - 1) * pageSize;
  return {
    proposals: all.slice(start, start + pageSize),
    page,
    hasNext: start + pageSize < all.length,
    hasPrev: page > 1,
  };
}

// ── Chain reads ──────────────────────────────────────────────────────────────

async function getCurrentLedger(client: LinkoraClientType): Promise<number | null> {
  try {
    const latest = await client.createRpcServer().getLatestLedger();
    return latest.sequence;
  } catch {
    return null;
  }
}

function toGovernanceConfig(chain: ChainConfig): GovernanceConfig {
  return {
    quorum: chain.quorum,
    voteWindowLedgers: chain.vote_window_ledgers,
    timeLockLedgers: chain.time_lock_ledgers,
    expiryLedgers: chain.proposal_expiry_ledgers ?? 0,
  };
}

function toGovernanceProposal(
  proposal: ChainProposal,
  config: GovernanceConfig,
  effectiveQuorum: number,
  currentLedger: number | null
): GovernanceProposal {
  const deadlineLedger = proposal.created_ledger + config.voteWindowLedgers;
  const ledgersRemaining =
    currentLedger === null ? config.voteWindowLedgers : Math.max(0, deadlineLedger - currentLedger);
  const metadata = proposal.metadata ?? null;

  return {
    id: proposal.id.toString(),
    title:
      metadata?.title?.trim() ||
      proposalTitle(proposal.parameter, proposal.new_value, proposal.new_address ?? null),
    description:
      metadata?.description?.trim() ||
      `Update ${parameterLabel(proposal.parameter)} to ${formatParameterValue({
        parameter: proposal.parameter,
        newValue: proposal.new_value,
        newAddress: proposal.new_address ?? null,
      })}.`,
    rationale: metadata?.rationale ?? null,
    proposer: proposal.proposer,
    parameter: proposal.parameter,
    newValue: proposal.new_value,
    newAddress: proposal.new_address ?? null,
    status: statusFromChain(proposal.status),
    votesFor: proposal.votes_for,
    votesAgainst: proposal.votes_against,
    votesAbstain: 0,
    effectiveQuorum,
    createdLedger: proposal.created_ledger,
    deadlineLedger,
    deadlineAt: Date.now() + ledgersRemaining * LEDGER_SECONDS * 1000,
    timeLockLedgers: proposal.time_lock_ledgers ?? config.timeLockLedgers,
    expiryLedgers: proposal.expiry_ledgers ?? config.expiryLedgers,
  };
}

export async function fetchGovernanceConfig(): Promise<GovernanceConfig> {
  if (!isGovernanceConfigured()) return SAMPLE_GOVERNANCE_CONFIG;
  const chain = (await getGovernanceClient().govGetConfig()) as ChainConfig;
  return toGovernanceConfig(chain);
}

export async function fetchProposalPage(
  page: number,
  pageSize: number = GOVERNANCE_PAGE_SIZE
): Promise<ProposalPage> {
  if (!isGovernanceConfigured()) return samplePage(page, pageSize);

  const client = getGovernanceClient();
  const [config, currentLedger] = await Promise.all([
    fetchGovernanceConfig(),
    getCurrentLedger(client),
  ]);

  const start = (page - 1) * pageSize + 1;
  const proposals: GovernanceProposal[] = [];
  let reachedEnd = false;

  for (let index = 0; index < pageSize; index += 1) {
    const id = BigInt(start + index);
    try {
      const [proposal, quorum] = await Promise.all([
        client.govGetProposal(id) as Promise<ChainProposal>,
        client.effectiveQuorum(id).catch(() => config.quorum),
      ]);
      proposals.push(toGovernanceProposal(proposal, config, quorum, currentLedger));
    } catch {
      // Proposal ids are sequential, so the first miss marks the end of the list.
      reachedEnd = true;
      break;
    }
  }

  return {
    proposals,
    page,
    hasNext: !reachedEnd && proposals.length === pageSize,
    hasPrev: page > 1,
  };
}

export async function fetchProposal(id: string): Promise<GovernanceProposal> {
  if (!isGovernanceConfigured()) {
    const proposal = getSampleProposals().find((candidate) => candidate.id === id);
    if (!proposal) throw new Error(`Proposal #${id} was not found.`);
    return proposal;
  }

  const client = getGovernanceClient();
  const [config, currentLedger] = await Promise.all([
    fetchGovernanceConfig(),
    getCurrentLedger(client),
  ]);
  const [proposal, quorum] = await Promise.all([
    client.govGetProposal(BigInt(id)) as Promise<ChainProposal>,
    client.effectiveQuorum(BigInt(id)).catch(() => config.quorum),
  ]);

  return toGovernanceProposal(proposal, config, quorum, currentLedger);
}

// ── Writes ───────────────────────────────────────────────────────────────────

export class GovernanceUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GovernanceUnsupportedError";
  }
}

function optionAddressScVal(address: string | null): xdr.ScVal {
  return address ? nativeToScVal(address, { type: "address" }) : xdr.ScVal.scvVoid();
}

function metadataScVal(title: string, description: string, rationale: string | null): xdr.ScVal {
  // Soroban maps must be canonically ordered by key. Struct fields are encoded
  // as a symbol-keyed map, so sort by the field name (alphabetical).
  const fields: Array<[string, xdr.ScVal]> = [
    ["description", nativeToScVal(description, { type: "string" })],
    ["rationale", rationale ? nativeToScVal(rationale, { type: "string" }) : xdr.ScVal.scvVoid()],
    ["title", nativeToScVal(title, { type: "string" })],
  ];
  return xdr.ScVal.scvMap(
    fields.map(
      ([key, val]) =>
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol(key),
          val,
        })
    )
  );
}

export interface CastVoteInput {
  proposal: GovernanceProposal;
  choice: VoteChoice;
  voter: string;
}

/**
 * Cast an on-chain vote. The current governance contract exposes a boolean
 * `support` flag, so only "for"/"against" can be submitted. Abstain is kept in
 * the UI as an explicitly unavailable option rather than silently mis-recording
 * it as a rejection.
 */
export async function castVote({ proposal, choice, voter }: CastVoteInput): Promise<string> {
  if (choice === "abstain") {
    throw new GovernanceUnsupportedError(
      "Abstain votes are not supported by the current governance contract."
    );
  }
  if (!isGovernanceConfigured()) {
    throw new GovernanceUnsupportedError("Governance contract is not configured.");
  }

  const result = await buildSignAndSubmit(
    "gov_vote",
    [
      nativeToScVal(voter, { type: "address" }),
      nativeToScVal(BigInt(proposal.id), { type: "u64" }),
      nativeToScVal(choice === "for", { type: "bool" }),
    ],
    voter,
    governanceTxConfig()
  );

  saveLocalVote(voter, proposal.id, choice);
  return result.hash;
}

export interface CreateProposalInput extends ProposalDraft {
  proposer: string;
}

export async function createProposal(input: CreateProposalInput): Promise<string> {
  const validationError = validateProposalDraft(input);
  if (validationError) throw new Error(validationError);
  if (!isGovernanceConfigured()) {
    throw new GovernanceUnsupportedError("Governance contract is not configured.");
  }

  const description = input.description.trim();
  const newAddress = input.parameter === GovParameter.Treasury ? input.newAddress.trim() : null;

  const result = await buildSignAndSubmit(
    "gov_propose",
    [
      nativeToScVal(input.proposer, { type: "address" }),
      nativeToScVal(input.parameter),
      nativeToScVal(BigInt(input.newValue.trim()), { type: "u64" }),
      optionAddressScVal(newAddress),
      metadataScVal(input.title.trim(), description, null),
    ],
    input.proposer,
    governanceTxConfig()
  );

  return result.hash;
}

export async function executeProposal(proposalId: string, sourceAddress: string): Promise<string> {
  if (!isGovernanceConfigured()) {
    throw new GovernanceUnsupportedError("Governance contract is not configured.");
  }

  const result = await buildSignAndSubmit(
    "gov_execute",
    [nativeToScVal(BigInt(proposalId), { type: "u64" })],
    sourceAddress,
    governanceTxConfig()
  );

  return result.hash;
}
