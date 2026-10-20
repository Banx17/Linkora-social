"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Countdown } from "@/components/governance/Countdown";
import { ProposalDescription } from "@/components/governance/ProposalDescription";
import { StatusBadge } from "@/components/governance/StatusBadge";
import { VotePanel } from "@/components/governance/VotePanel";
import { useProposal } from "@/hooks/useGovernance";
import { useWallet } from "@/hooks/useWallet";
import {
  castVote,
  executeProposal,
  formatParameterValue,
  getLocalVote,
  parameterLabel,
  truncateAddress,
  votePercentages,
  type VoteChoice,
} from "@/lib/governance";

export default function ProposalDetailPage() {
  const params = useParams<{ id: string }>();
  const proposalId =
    typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : null;
  const { proposal, loading, error, refresh } = useProposal(proposalId);
  const { address, connected } = useWallet();
  const [yourVote, setYourVote] = useState<VoteChoice | null>(null);
  const [executing, setExecuting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setYourVote(proposal ? getLocalVote(address, proposal.id) : null);
  }, [address, proposal]);

  async function handleVote(choice: VoteChoice) {
    if (!proposal || !address) return;
    setActionError(null);
    await castVote({ proposal, choice, voter: address });
    setYourVote(choice);
    await refresh();
  }

  async function handleExecute() {
    if (!proposal || !address) return;
    setExecuting(true);
    setActionError(null);
    try {
      await executeProposal(proposal.id, address);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to execute proposal.");
    } finally {
      setExecuting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8" aria-busy="true">
        <div className="h-8 w-40 animate-pulse rounded bg-[var(--muted)]" />
        <div className="mt-4 h-64 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--muted)]/50" />
      </main>
    );
  }

  if (error || !proposal) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/governance" className="text-sm font-medium text-violet-600 dark:text-violet-400">
          ← Back to governance
        </Link>
        <div role="alert" className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-6">
          <p className="text-red-600 dark:text-red-400">{error ?? "Proposal not found."}</p>
          {proposalId && (
            <button
              type="button"
              onClick={refresh}
              className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-current px-4 text-sm font-medium text-red-600 dark:text-red-400"
            >
              Retry
            </button>
          )}
        </div>
      </main>
    );
  }

  const percentages = votePercentages(proposal);
  const canExecute = proposal.status === "Active" && proposal.deadlineAt <= Date.now();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/governance" className="text-sm font-medium text-violet-600 dark:text-violet-400">
        ← Back to governance
      </Link>

      <article className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Proposal #{proposal.id}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--foreground)]">{proposal.title}</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Proposed by{" "}
              <span className="font-mono" title={proposal.proposer}>
                {truncateAddress(proposal.proposer)}
              </span>
            </p>
          </div>
          <StatusBadge status={proposal.status} />
        </div>

        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-4">
          <ProposalDescription text={proposal.description} className="text-sm text-[var(--foreground)]" />
          {proposal.rationale && (
            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Rationale
              </h2>
              <ProposalDescription text={proposal.rationale} className="mt-1 text-sm text-[var(--foreground)]" />
            </div>
          )}
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] p-4">
            <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Proposal action
            </dt>
            <dd className="mt-1 font-semibold text-[var(--foreground)]">
              {parameterLabel(proposal.parameter)}
            </dd>
            <dd className="text-sm text-[var(--text-muted)]">{formatParameterValue(proposal)}</dd>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4">
            <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Deadline</dt>
            <dd className="mt-1 font-semibold text-[var(--foreground)]">
              <Countdown deadlineAt={proposal.deadlineAt} />
            </dd>
            <dd className="text-sm text-[var(--text-muted)]">
              {new Date(proposal.deadlineAt).toLocaleString()}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4">
            <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Effective quorum
            </dt>
            <dd className="mt-1 font-semibold text-[var(--foreground)]">
              {proposal.effectiveQuorum}% approval
            </dd>
            <dd className="text-sm text-[var(--text-muted)]">
              Vote window {proposal.deadlineLedger - proposal.createdLedger} ledgers
            </dd>
          </div>
        </dl>

        <section aria-labelledby="results-heading" className="mt-6">
          <h2 id="results-heading" className="text-lg font-bold text-[var(--foreground)]">
            Results
          </h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <dt className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                For
              </dt>
              <dd className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                {proposal.votesFor.toLocaleString()}
              </dd>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
              <dt className="text-xs uppercase tracking-wide text-red-700 dark:text-red-400">
                Against
              </dt>
              <dd className="text-xl font-bold text-red-700 dark:text-red-400">
                {proposal.votesAgainst.toLocaleString()}
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-3">
              <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Abstain</dt>
              <dd className="text-xl font-bold text-[var(--foreground)]">
                {proposal.votesAbstain.toLocaleString()}
              </dd>
            </div>
          </dl>
          <div
            className="mt-3 flex h-2 overflow-hidden rounded-full bg-[var(--muted)]"
            role="img"
            aria-label={`${percentages.for}% for, ${percentages.against}% against, ${percentages.abstain}% abstain`}
          >
            <span className="bg-emerald-500" style={{ width: `${percentages.for}%` }} />
            <span className="bg-red-500" style={{ width: `${percentages.against}%` }} />
            <span className="bg-slate-400" style={{ width: `${percentages.abstain}%` }} />
          </div>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Your vote:{" "}
            <span className="font-medium text-[var(--foreground)]">
              {yourVote
                ? yourVote === "for"
                  ? "For"
                  : yourVote === "against"
                    ? "Against"
                    : "Abstain"
                : "Not detected in this browser"}
            </span>
          </p>
        </section>

        <div className="mt-6">
          <VotePanel
            proposal={proposal}
            address={address}
            connected={connected}
            yourVote={yourVote}
            onVote={handleVote}
          />
        </div>

        {canExecute && connected && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--text-muted)]">
              Voting has ended. Execute the proposal to apply the change on-chain.
            </p>
            <button
              type="button"
              onClick={handleExecute}
              disabled={executing}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {executing ? "Executing…" : "Execute proposal"}
            </button>
          </div>
        )}

        {actionError && (
          <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {actionError}
          </p>
        )}
      </article>
    </main>
  );
}
