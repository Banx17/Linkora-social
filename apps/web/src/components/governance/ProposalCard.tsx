import Link from "next/link";
import { Countdown } from "./Countdown";
import { StatusBadge } from "./StatusBadge";
import {
  formatParameterValue,
  parameterLabel,
  proposalTitle,
  truncateAddress,
  votePercentages,
  type GovernanceProposal,
} from "@/lib/governance";

function excerpt(text: string, max = 180): string {
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

export function ProposalCard({ proposal }: { proposal: GovernanceProposal }) {
  const percentages = votePercentages(proposal);
  const title = proposal.title || proposalTitle(proposal.parameter, proposal.newValue, proposal.newAddress);

  return (
    <article
      data-testid="proposal-card"
      className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-sm transition-colors hover:border-violet-400/60"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Proposal #{proposal.id}
          </p>
          <h2 className="mt-1 text-lg font-bold text-[var(--foreground)]">
            <Link
              href={`/governance/${proposal.id}`}
              className="rounded hover:text-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              {title}
            </Link>
          </h2>
        </div>
        <StatusBadge status={proposal.status} />
      </div>

      <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{excerpt(proposal.description)}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">For</dt>
          <dd className="font-semibold text-emerald-600 dark:text-emerald-400">
            {proposal.votesFor.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Against</dt>
          <dd className="font-semibold text-red-600 dark:text-red-400">
            {proposal.votesAgainst.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Abstain</dt>
          <dd className="font-semibold text-[var(--foreground)]">
            {proposal.votesAbstain.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Target</dt>
          <dd className="font-semibold text-[var(--foreground)]">
            {parameterLabel(proposal.parameter)}
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

      <div className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[var(--text-muted)]">
          <span className="font-medium text-[var(--foreground)]">
            {formatParameterValue(proposal)}
          </span>
          <span aria-hidden="true"> · </span>
          <Countdown deadlineAt={proposal.deadlineAt} />
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-xs text-[var(--text-muted)] sm:inline">
            by {truncateAddress(proposal.proposer)}
          </span>
          <Link
            href={`/governance/${proposal.id}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-violet-500/50 px-4 font-medium text-violet-600 transition-colors hover:bg-violet-500/10 dark:text-violet-400"
          >
            View &amp; vote
          </Link>
        </div>
      </div>
    </article>
  );
}
