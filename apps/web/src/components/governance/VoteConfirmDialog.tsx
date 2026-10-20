"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  formatParameterValue,
  truncateAddress,
  type GovernanceProposal,
  type VoteChoice,
} from "@/lib/governance";

const CHOICE_LABEL: Record<VoteChoice, string> = {
  for: "For",
  against: "Against",
  abstain: "Abstain",
};

interface VoteConfirmDialogProps {
  open: boolean;
  proposal: GovernanceProposal;
  choice: VoteChoice;
  voter: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Transaction preview shown before the wallet prompt. Voting is irreversible, so
 * the user sees the proposal, their choice and the resulting on-chain call first.
 */
export function VoteConfirmDialog({
  open,
  proposal,
  choice,
  voter,
  busy,
  error,
  onConfirm,
  onCancel,
}: VoteConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-slate-950/60" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[1001] flex w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-2xl"
          aria-describedby="vote-preview-description"
        >
          <div>
            <Dialog.Title className="text-lg font-bold text-[var(--foreground)]">
              Confirm vote
            </Dialog.Title>
            <Dialog.Description
              id="vote-preview-description"
              className="mt-1 text-sm text-[var(--text-muted)]"
            >
              Review the transaction before signing. Your wallet will ask for confirmation next.
            </Dialog.Description>
          </div>

          <dl className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-muted)]">Proposal</dt>
              <dd className="text-right font-medium text-[var(--foreground)]">
                #{proposal.id} · {proposal.title}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-muted)]">Your vote</dt>
              <dd
                className={`font-semibold ${
                  choice === "for"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : choice === "against"
                      ? "text-red-600 dark:text-red-400"
                      : "text-[var(--foreground)]"
                }`}
              >
                {CHOICE_LABEL[choice]}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-muted)]">Parameter</dt>
              <dd className="text-right font-medium text-[var(--foreground)]">
                {formatParameterValue(proposal)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-muted)]">Voting power</dt>
              <dd className="text-right font-medium text-[var(--foreground)]">1 address = 1 vote</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-muted)]">Signer</dt>
              <dd className="font-mono text-xs text-[var(--foreground)]">
                {truncateAddress(voter)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-muted)]">Network fee</dt>
              <dd className="text-right text-[var(--foreground)]">Estimated during simulation</dd>
            </div>
          </dl>

          <p className="text-xs text-[var(--text-muted)]">
            On-chain votes are final and cannot be changed or withdrawn.
          </p>

          {error && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              autoFocus
              className="inline-flex min-h-11 items-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Submitting…" : `Vote ${CHOICE_LABEL[choice]}`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
