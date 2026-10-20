"use client";

import { useState } from "react";
import { VoteConfirmDialog } from "./VoteConfirmDialog";
import type { GovernanceProposal, VoteChoice } from "@/lib/governance";

const VOTE_LABEL: Record<VoteChoice, string> = {
  for: "For",
  against: "Against",
  abstain: "Abstain",
};

interface VotePanelProps {
  proposal: GovernanceProposal;
  address: string | null;
  connected: boolean;
  yourVote: VoteChoice | null;
  onVote: (choice: VoteChoice) => Promise<void>;
}

export function VotePanel({ proposal, address, connected, yourVote, onVote }: VotePanelProps) {
  const [choice, setChoice] = useState<VoteChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = proposal.status === "Active";

  async function confirmVote() {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      await onVote(choice);
      setChoice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit your vote.");
    } finally {
      setBusy(false);
    }
  }

  if (!connected || !address) {
    return (
      <section
        aria-labelledby="vote-panel-title"
        className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5"
      >
        <h2 id="vote-panel-title" className="text-lg font-bold text-[var(--foreground)]">
          Cast your vote
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Connect your wallet from the top navigation to vote on this proposal.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="vote-panel-title"
      className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="vote-panel-title" className="text-lg font-bold text-[var(--foreground)]">
            Cast your vote
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            One address has one vote. On-chain votes cannot be changed.
          </p>
        </div>
        {yourVote && (
          <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
            You voted {VOTE_LABEL[yourVote]}
          </span>
        )}
      </div>

      {!isActive && (
        <p role="status" className="mt-4 rounded-lg bg-[var(--muted)]/60 px-3 py-2 text-sm text-[var(--text-muted)]">
          Voting is closed for this proposal.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setChoice("for")}
          disabled={!isActive}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-400"
        >
          Vote For
        </button>
        <button
          type="button"
          onClick={() => setChoice("against")}
          disabled={!isActive}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-red-500/50 bg-red-500/10 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
        >
          Vote Against
        </button>
        <button
          type="button"
          disabled
          aria-describedby="abstain-note"
          title="The current governance contract does not record abstain votes"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 text-sm font-semibold text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Abstain
        </button>
      </div>

      <p id="abstain-note" className="mt-2 text-xs text-[var(--text-muted)]">
        Abstain is unavailable: the current governance contract records only For and Against votes.
      </p>

      {error && !choice && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {choice && (
        <VoteConfirmDialog
          open
          proposal={proposal}
          choice={choice}
          voter={address}
          busy={busy}
          error={error}
          onConfirm={confirmVote}
          onCancel={() => {
            if (!busy) {
              setChoice(null);
              setError(null);
            }
          }}
        />
      )}
    </section>
  );
}
