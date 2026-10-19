"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GovParameter } from "linkora-sdk";
import { RichTextEditor } from "@/components/governance/RichTextEditor";
import { useGovernanceConfig } from "@/hooks/useGovernance";
import { useWallet } from "@/hooks/useWallet";
import { config as appConfig } from "@/config";
import {
  buildCalldataPreview,
  createProposal,
  GOVERNANCE_PARAMETERS,
  isGovernanceConfigured,
  parameterLabel,
  truncateAddress,
  validateProposalDraft,
} from "@/lib/governance";

export default function CreateProposalPage() {
  const router = useRouter();
  const { address, connected, connect, isConnecting } = useWallet();
  const { config, error: configError } = useGovernanceConfig();
  const configured = isGovernanceConfigured();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parameter, setParameter] = useState<GovParameter>(GovParameter.FeeBps);
  const [newValue, setNewValue] = useState("0");
  const [newAddress, setNewAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const draft = { title, description, parameter, newValue, newAddress };
  const calldata = buildCalldataPreview(parameter, newValue, newAddress);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!address) {
      setError("Connect your wallet before creating a proposal.");
      return;
    }
    if (!configured) {
      setError("Governance contract is not configured for this environment.");
      return;
    }

    const validationError = validateProposalDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await createProposal({ ...draft, proposer: address });
      setSuccess("Proposal submitted. It will appear in the list after the transaction confirms.");
      router.push("/governance");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the proposal.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/governance" className="text-sm font-medium text-violet-600 dark:text-violet-400">
        ← Back to governance
      </Link>

      <header className="mt-4">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Create a proposal</h1>
        <p className="mt-1 text-[var(--text-muted)]">
          Describe the change, pick the parameter, and submit it for an on-chain vote.
        </p>
      </header>

      {!configured && (
        <p
          role="note"
          className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300"
        >
          No governance contract is configured for this environment, so proposal creation is
          disabled.
        </p>
      )}

      {!connected && (
        <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/30 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--text-muted)]">
            Connect a wallet to sign the proposal transaction.
          </p>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={isConnecting}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {isConnecting ? "Connecting…" : "Connect wallet"}
          </button>
        </section>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
        <div>
          <label htmlFor="proposal-title" className="block text-sm font-medium text-[var(--foreground)]">
            Title
          </label>
          <input
            id="proposal-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            required
            placeholder="Short, specific summary of the change"
            aria-describedby="proposal-title-hint"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
          <p id="proposal-title-hint" className="mt-1 text-right text-xs text-[var(--text-muted)]">
            {title.length}/100 characters
          </p>
        </div>

        <div>
          <label htmlFor="proposal-description" className="block text-sm font-medium text-[var(--foreground)]">
            Description
          </label>
          <div className="mt-1">
            <RichTextEditor
              id="proposal-description"
              value={description}
              onChange={setDescription}
              placeholder="Explain what should change and why. Markdown formatting is supported."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="proposal-parameter" className="block text-sm font-medium text-[var(--foreground)]">
              Parameter
            </label>
            <select
              id="proposal-parameter"
              value={parameter}
              onChange={(event) => setParameter(event.target.value as GovParameter)}
              className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            >
              {GOVERNANCE_PARAMETERS.map((option) => (
                <option key={option} value={option}>
                  {parameterLabel(option)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="proposal-value" className="block text-sm font-medium text-[var(--foreground)]">
              New value
            </label>
            <input
              id="proposal-value"
              type="number"
              min={0}
              step={1}
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              required
              aria-describedby="proposal-value-hint"
              className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
            <p id="proposal-value-hint" className="mt-1 text-xs text-[var(--text-muted)]">
              {parameter === GovParameter.Treasury
                ? "Treasury proposals use the address below; this value can stay 0."
                : "Whole number encoded as u64 by the governance contract."}
            </p>
          </div>
        </div>

        {parameter === GovParameter.Treasury && (
          <div>
            <label htmlFor="proposal-address" className="block text-sm font-medium text-[var(--foreground)]">
              New treasury address
            </label>
            <input
              id="proposal-address"
              type="text"
              value={newAddress}
              onChange={(event) => setNewAddress(event.target.value)}
              required
              placeholder="G… or C…"
              className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 font-mono text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
        )}

        <section
          aria-labelledby="execution-preview-heading"
          className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/30 p-4"
        >
          <h2 id="execution-preview-heading" className="text-sm font-bold text-[var(--foreground)]">
            Transaction preview
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <dt className="text-[var(--text-muted)]">Target contract</dt>
              <dd className="break-all font-mono text-xs text-[var(--foreground)]">
                {configured ? appConfig.contractId : "Not configured"}
              </dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <dt className="text-[var(--text-muted)]">Calldata</dt>
              <dd className="break-all font-mono text-xs text-[var(--foreground)]">{calldata}</dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <dt className="text-[var(--text-muted)]">Minimum stake</dt>
              <dd className="text-[var(--foreground)]">
                0 XLM <span className="text-[var(--text-muted)]">(no stake required)</span>
              </dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <dt className="text-[var(--text-muted)]">Vote window</dt>
              <dd className="text-[var(--foreground)]">
                {config ? `${config.voteWindowLedgers.toLocaleString()} ledgers` : "Loading…"}
              </dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <dt className="text-[var(--text-muted)]">Time lock</dt>
              <dd className="text-[var(--foreground)]">
                {config ? `${config.timeLockLedgers.toLocaleString()} ledgers` : "Loading…"}
              </dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <dt className="text-[var(--text-muted)]">Effective quorum</dt>
              <dd className="text-[var(--foreground)]">
                {config ? `${config.quorum}% approval` : "Loading…"}
              </dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <dt className="text-[var(--text-muted)]">Signer</dt>
              <dd className="font-mono text-xs text-[var(--foreground)]">
                {address ? truncateAddress(address) : "Not connected"}
              </dd>
            </div>
          </dl>
        </section>

        {configError && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            Could not load governance parameters: {configError}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {success && (
          <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !connected || !configured}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting proposal…" : "Submit proposal"}
        </button>
      </form>
    </main>
  );
}
