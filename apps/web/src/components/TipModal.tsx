"use client";

/**
 * TipModal — three-step XLM tipping flow (issue #1728).
 *
 * Step 1 – Amount  : token selector, numeric input with USD conversion,
 *                    quick-select (1 / 5 / 10 XLM), Max button.
 * Step 2 – Preview : shows recipient, amount, estimated fee (1 %, 100 BPS),
 *                    creator payout, XLM → USD total.
 * Step 3 – Confirm : calls useTip(), shows tx hash linkable to Stellar Expert.
 *
 * Accessibility: focus-trap, live-region step announcements, ARIA labels.
 */

import React, { useState, useEffect, useMemo, useId, useRef, useCallback } from "react";
import { stellarAssetContractId } from "linkora-sdk";
import { useTip } from "@/hooks/useTip";
import { useTokenBalances, type TokenWithPrice } from "@/hooks/useTokenBalances";
import { useWalletContext } from "@/components/WalletProvider";
import { config } from "@/config";
import {
  CLASSIC_ASSET_DECIMALS,
  toBaseUnits,
  trimAmount as trimBalance,
  validateTipAmount,
} from "@/lib/tipValidation";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROTOCOL_FEE_BPS = 100n; // 1 %
const QUICK_AMOUNTS = [1, 5, 10] as const;
const STELLAR_EXPERT_BASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE?.includes("Public")
  ? "https://stellar.expert/explorer/public/tx"
  : "https://stellar.expert/explorer/testnet/tx";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TipModalProps {
  postId: number;
  authorName: string;
  onClose: () => void;
}

/** A wallet balance the contract's `tip` can be called with. */
export interface TipToken {
  /** Stable key: `XLM` or `CODE:ISSUER`. */
  key: string;
  symbol: string;
  issuer: string | null;
  /** Stellar Asset Contract address passed to `tip`. */
  contractId: string;
  balance: string;
  decimals: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps Horizon balances to tippable tokens, skipping assets without a SAC. */
export function toTipTokens(tokens: TokenWithPrice[], networkPassphrase: string): TipToken[] {
  return tokens.flatMap((t) => {
    const contractId = stellarAssetContractId(t, networkPassphrase);
    if (!contractId) return [];
    const symbol = t.asset_type === "native" ? "XLM" : (t.asset_code ?? "");
    return [
      {
        key: t.asset_type === "native" ? "XLM" : `${t.asset_code}:${t.asset_issuer}`,
        symbol,
        issuer: t.asset_type === "native" ? null : (t.asset_issuer ?? null),
        contractId,
        balance: t.balance,
        decimals: CLASSIC_ASSET_DECIMALS,
      },
    ];
  });
}

function shortIssuer(issuer: string): string {
  return `${issuer.slice(0, 4)}…${issuer.slice(-4)}`;
}

function formatUnitsValue(units: bigint, decimals: number): string {
  return (Number(units) / 10 ** decimals).toFixed(4);
}

/** Returns USD string or empty string if price unavailable. */
function toUsd(amount: string, xlmPrice: number | null): string {
  if (!xlmPrice || !amount || amount === "0") return "";
  const num = parseFloat(amount);
  if (!Number.isFinite(num) || num <= 0) return "";
  return `≈ $${(num * xlmPrice).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Step indicator (self-contained, no onboarding dependency)
// ---------------------------------------------------------------------------

type TipStep = 1 | 2 | 3;

const STEP_LABELS: Record<TipStep, string> = {
  1: "Amount",
  2: "Preview",
  3: "Confirm",
};

interface StepIndicatorProps {
  current: TipStep;
}

function TipStepIndicator({ current }: StepIndicatorProps) {
  return (
    <div
      className="flex items-center justify-center w-full mb-6"
      role="group"
      aria-label="Tip flow progress"
    >
      {([1, 2, 3] as TipStep[]).map((step, i) => {
        const done = step < current;
        const active = step === current;
        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center">
              <div
                className={[
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                  done
                    ? "bg-violet-600 border-violet-600 text-white"
                    : active
                      ? "border-violet-500 text-violet-400 bg-transparent"
                      : "border-slate-700 text-slate-500 bg-transparent",
                ].join(" ")}
                aria-current={active ? "step" : undefined}
              >
                {done ? "✓" : step}
              </div>
              <span
                className={[
                  "text-xs mt-1 font-medium",
                  active ? "text-violet-400" : done ? "text-violet-500" : "text-slate-500",
                ].join(" ")}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
            {i < 2 && (
              <div
                className={[
                  "h-0.5 flex-1 mx-1 mb-5 transition-colors",
                  done ? "bg-violet-600" : "bg-slate-700",
                ].join(" ")}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Focus-trap hook
// ---------------------------------------------------------------------------

function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active || !containerRef.current) return;
      if (e.key !== "Tab") return;

      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null); // visible only

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [active]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Auto-focus first focusable element when trap activates.
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const first = containerRef.current.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    );
    first?.focus();
  }, [active]);

  return containerRef;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TipModal({ postId, authorName, onClose }: TipModalProps) {
  const { address } = useWalletContext();
  const { tokens: balances, isLoading, error: balancesError, refresh } = useTokenBalances(address);
  const { status, result, error: tipError, tip, reset } = useTip();

  // Step state
  const [step, setStep] = useState<TipStep>(1);

  // Step 1 — amount
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [tokenKey, setTokenKey] = useState<string | null>(null);

  // Live region message for step announcements
  const [announcement, setAnnouncement] = useState("");

  const amountId = useId();
  const amountErrorId = useId();
  const liveRegionId = useId();

  const trapRef = useFocusTrap(true);

  // Derived token data
  const tokens = useMemo(() => toTipTokens(balances, config.networkPassphrase), [balances]);
  const selectedToken = tokens.find((t) => t.key === tokenKey) ?? null;

  // Default to the first token once balances load (or if the selection disappears).
  useEffect(() => {
    if (tokens.length > 0 && !tokens.some((t) => t.key === tokenKey)) {
      setTokenKey(tokens[0].key);
    }
  }, [tokens, tokenKey]);

  // XLM USD price (from the token list — useTokenBalances already fetches it)
  const xlmPrice = balances.find((b) => b.asset_type === "native")?.usdPrice ?? null;

  // Fee maths
  const amountError = validateTipAmount(amount, selectedToken);
  const showAmountError = Boolean(amountError) && (touched || amount !== "");
  const busy = status !== "idle" && status !== "error";
  const canSubmit = !amountError && !busy && Boolean(address);

  const decimals = selectedToken?.decimals ?? CLASSIC_ASSET_DECIMALS;
  const amountUnits = (!amountError && toBaseUnits(amount, decimals)) || 0n;
  const feeUnits = (amountUnits * PROTOCOL_FEE_BPS) / 10_000n;
  const payoutUnits = amountUnits - feeUnits;
  const protocolFeePercent = Number(PROTOCOL_FEE_BPS) / 100;

  const symbol = selectedToken?.symbol ?? "";

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Announce step changes to screen readers
  useEffect(() => {
    if (status === "success") {
      setAnnouncement("Transaction successful! Tip sent.");
      return;
    }
    setAnnouncement(`Step ${step} of 3: ${STEP_LABELS[step]}`);
  }, [step, status]);

  // Keyboard: Escape closes modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }); // intentional: re-binds on each render to capture fresh handleClose

  // Handlers
  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAmountNext = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setStep(2);
  };

  const handleConfirm = async () => {
    if (!canSubmit || !selectedToken || !address) return;
    await tip(
      address,
      BigInt(postId),
      selectedToken.contractId,
      amount.trim(),
      selectedToken.decimals,
      config.contractId
    );
    setStep(3);
  };

  const handleQuickAmount = (xlm: number) => {
    setAmount(String(xlm));
    setTouched(true);
  };

  const handleMax = () => {
    if (!selectedToken) return;
    setAmount(trimBalance(selectedToken.balance));
    setTouched(true);
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderStep1 = () => (
    <form onSubmit={handleAmountNext} noValidate>
      {/* Recipient banner */}
      <div className="mb-5 rounded-xl border border-violet-800/40 bg-violet-900/20 px-4 py-3 text-center text-sm text-violet-300">
        Tipping <strong className="font-semibold text-violet-200">@{authorName}</strong> for Post #
        {postId}
      </div>

      {/* Token selector */}
      <fieldset className="mb-5" disabled={busy}>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Token
        </legend>
        {isLoading && tokens.length === 0 ? (
          <p className="text-sm text-slate-400" role="status">
            Loading your balances…
          </p>
        ) : balancesError && tokens.length === 0 ? (
          <div
            className="flex items-center justify-between gap-2 rounded-lg border border-red-800/40 bg-red-900/20 px-3 py-2 text-sm text-red-400"
            role="alert"
          >
            <span>Could not load balances: {balancesError}</span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="text-violet-400 underline hover:text-violet-300"
            >
              Retry
            </button>
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-slate-400" role="status">
            No tippable tokens. Fund your wallet with XLM to tip.
          </p>
        ) : (
          <div role="radiogroup" aria-label="Token" className="flex flex-col gap-2">
            {tokens.map((token) => {
              const checked = token.key === tokenKey;
              return (
                <label
                  key={token.key}
                  className={[
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
                    "min-h-[44px]",
                    checked
                      ? "border-violet-600 bg-violet-900/25 shadow-[0_0_10px_rgba(124,58,237,0.2)]"
                      : "border-slate-800 bg-slate-900/60 hover:border-slate-600",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="tip-token"
                    value={token.key}
                    checked={checked}
                    onChange={() => {
                      setTokenKey(token.key);
                      setAmount("");
                      setTouched(false);
                    }}
                    className="accent-violet-600"
                  />
                  <span className="font-bold text-slate-100">{token.symbol}</span>
                  {token.issuer && (
                    <span className="font-mono text-xs text-slate-500" title={token.issuer}>
                      {shortIssuer(token.issuer)}
                    </span>
                  )}
                  <span className="ml-auto text-sm text-slate-400">
                    {trimBalance(token.balance)} available
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      {/* Quick-select amounts (XLM-only for now) */}
      {selectedToken?.symbol === "XLM" && (
        <div className="mb-4 flex gap-2" aria-label="Quick tip amounts">
          {QUICK_AMOUNTS.map((xlm) => (
            <button
              key={xlm}
              type="button"
              onClick={() => handleQuickAmount(xlm)}
              disabled={busy || !selectedToken}
              className={[
                "flex-1 rounded-lg border py-2 text-sm font-semibold transition-all",
                "min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                amount === String(xlm)
                  ? "border-violet-600 bg-violet-800/40 text-violet-200"
                  : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-violet-700 hover:text-slate-200",
                "disabled:cursor-not-allowed disabled:opacity-50",
              ].join(" ")}
            >
              {xlm} XLM
            </button>
          ))}
        </div>
      )}

      {/* Amount input */}
      <div className="mb-5 flex flex-col gap-1.5">
        <label
          htmlFor={amountId}
          className="text-xs font-semibold uppercase tracking-widest text-slate-400"
        >
          Amount
        </label>
        <div className="relative flex items-center">
          <input
            id={amountId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="0.00"
            disabled={busy || !selectedToken}
            aria-invalid={showAmountError}
            aria-describedby={showAmountError ? amountErrorId : undefined}
            className={[
              "w-full rounded-xl border bg-slate-950 px-4 py-3 pr-20 text-lg font-medium text-slate-100",
              "placeholder:text-slate-600 outline-none transition-all min-h-[44px]",
              "focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50",
              showAmountError
                ? "border-red-600/60 ring-1 ring-red-600/30"
                : "border-slate-800 focus:border-violet-600",
            ].join(" ")}
          />
          <span className="absolute right-4 font-bold text-slate-400">{symbol}</span>
        </div>

        {/* USD equivalent */}
        {symbol === "XLM" && amount && !amountError && (
          <p className="text-xs text-slate-500" aria-live="polite">
            {toUsd(amount, xlmPrice)}
          </p>
        )}

        {/* Max button */}
        {selectedToken && (
          <button
            type="button"
            onClick={handleMax}
            disabled={busy}
            className="self-start text-xs text-violet-400 underline hover:text-violet-300 disabled:opacity-50"
          >
            Max: {trimBalance(selectedToken.balance)} {symbol}
          </button>
        )}

        {/* Validation error */}
        {showAmountError && (
          <p id={amountErrorId} className="mt-1 text-sm text-red-400" role="alert">
            {amountError}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleClose}
          className="flex-1 min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 font-semibold text-slate-200 transition-colors hover:bg-slate-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className={[
            "flex-1 min-h-[44px] rounded-xl font-semibold text-white transition-all",
            canSubmit
              ? "bg-violet-700 hover:bg-violet-600"
              : "cursor-not-allowed bg-violet-900 opacity-50",
          ].join(" ")}
        >
          Review →
        </button>
      </div>
    </form>
  );

  const renderStep2 = () => (
    <div>
      {/* Summary rows */}
      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm">
        <Row label="Recipient" value={`@${authorName}`} />
        <Row label="Post" value={`#${postId}`} />
        <Row
          label="Amount"
          value={`${formatUnitsValue(amountUnits, decimals)} ${symbol}`}
          sub={toUsd(amount, xlmPrice)}
        />
        <Row
          label={`Protocol Fee (${protocolFeePercent.toFixed(1)}%)`}
          value={`${formatUnitsValue(feeUnits, decimals)} ${symbol}`}
        />
        <div className="border-t border-slate-800 pt-3">
          <Row
            label="Creator receives"
            value={`${formatUnitsValue(payoutUnits, decimals)} ${symbol}`}
            highlight
          />
        </div>
      </div>

      <p className="mb-5 text-xs text-slate-500">
        Fee covers protocol maintenance. Your Freighter wallet will prompt for approval before
        submission.
      </p>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setStep(1)}
          className="flex-1 min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 font-semibold text-slate-200 hover:bg-slate-700"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={busy}
          className={[
            "flex-1 min-h-[44px] rounded-xl font-semibold text-white transition-all",
            busy
              ? "cursor-not-allowed bg-violet-900 opacity-60"
              : "bg-violet-700 hover:bg-violet-600",
          ].join(" ")}
        >
          {busy ? "Sending…" : "Confirm & Send"}
        </button>
      </div>

      {/* Transaction status */}
      <TxStatusMessage status={status} />

      {/* Tip error */}
      {tipError && (
        <p
          className="mt-3 rounded-lg border border-red-800/40 bg-red-900/20 px-3 py-2 text-sm text-red-400"
          role="alert"
        >
          {tipError}
        </p>
      )}
    </div>
  );

  const renderStep3 = () => {
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-600 bg-red-900/20 text-2xl text-red-400">
            ✕
          </div>
          <h3 className="text-lg font-bold text-slate-100">Transaction Failed</h3>
          {tipError && (
            <p className="text-sm text-red-400" role="alert">
              {tipError}
            </p>
          )}
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={() => {
                reset();
                setStep(2);
              }}
              className="flex-1 min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 font-semibold text-slate-200 hover:bg-slate-700"
            >
              ← Try Again
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 font-semibold text-slate-200 hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      );
    }

    // Success state
    if (status === "success" && result) {
      const explorerUrl = `${STELLAR_EXPERT_BASE}/${result.hash}`;
      return (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          {/* Success icon */}
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-900/20 text-2xl text-emerald-400"
            aria-hidden="true"
          >
            ✓
          </div>
          <h3 className="text-xl font-bold text-slate-100">Tip Sent! 🎉</h3>
          <p className="text-sm text-slate-400">
            You tipped <strong className="text-slate-200">@{authorName}</strong>{" "}
            <strong className="text-emerald-400">
              {formatUnitsValue(payoutUnits, decimals)} {symbol}
            </strong>
            {xlmPrice && symbol === "XLM"
              ? ` (${toUsd(formatUnitsValue(payoutUnits, decimals), xlmPrice)})`
              : ""}{" "}
            after fees.
          </p>

          {/* Transaction detail box */}
          <div className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-left text-sm">
            <TxRow label="Transaction Hash">
              <code className="break-all font-mono text-xs text-sky-400">{result.hash}</code>
            </TxRow>
            <TxRow label="Ledger">
              <span className="font-mono text-xs text-slate-300">{result.ledger}</span>
            </TxRow>
          </div>

          {/* Stellar Expert link */}
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-800/40 bg-sky-900/20 px-3 py-1.5 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-900/40"
          >
            View on Stellar Expert ↗
          </a>

          <button
            type="button"
            onClick={handleClose}
            className="mt-2 min-h-[44px] w-full rounded-xl bg-violet-700 font-semibold text-white hover:bg-violet-600"
          >
            Done
          </button>
        </div>
      );
    }

    // Pending / in-flight: show spinner
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-violet-500"
          aria-hidden="true"
        />
        <TxStatusMessage status={status} />
      </div>
    );
  };

  const renderNoWallet = () => (
    <p className="py-6 text-center text-sm text-slate-400" role="status">
      Connect your wallet to send a tip.
    </p>
  );

  // ---------------------------------------------------------------------------
  // Root render
  // ---------------------------------------------------------------------------

  const currentStepLabel =
    status === "success"
      ? "Transaction Successful"
      : status === "error"
        ? "Transaction Failed"
        : STEP_LABELS[step];

  return (
    /* Backdrop */
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000 }}
      className="flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="presentation"
      aria-label="Modal backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Live region — announces step changes */}
      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Modal card */}
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Send a tip — ${currentStepLabel}`}
        className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-base font-bold text-slate-100">Send Tip</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close tip modal"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            ✕
          </button>
        </header>

        <div className="px-6 py-5">
          {/* Step indicator — only for steps 1 and 2; hide on final step */}
          {step <= 2 && status !== "success" && status !== "error" && (
            <TipStepIndicator current={step} />
          )}

          {/* Content */}
          {!address
            ? renderNoWallet()
            : step === 1
              ? renderStep1()
              : step === 2 && status !== "success" && status !== "error"
                ? renderStep2()
                : renderStep3()}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

interface RowProps {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}

function Row({ label, value, sub, highlight }: RowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={highlight ? "font-semibold text-slate-100" : "text-slate-400"}>{label}</span>
      <div className="text-right">
        <span className={highlight ? "font-bold text-emerald-400" : "text-slate-200"}>{value}</span>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

interface TxRowProps {
  label: string;
  children: React.ReactNode;
}

function TxRow({ label, children }: TxRowProps) {
  return (
    <div className="mb-2 flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </div>
  );
}

interface TxStatusMessageProps {
  status: string;
}

function TxStatusMessage({ status }: TxStatusMessageProps) {
  const messages: Record<string, string> = {
    approving: "Approving token spending limit…",
    awaiting_sig: "Awaiting Freighter signature…",
    submitting: "Submitting to Stellar…",
  };
  const msg = messages[status];
  if (!msg) return null;
  return (
    <p className="mt-3 text-center text-sm text-slate-400" role="status" aria-live="polite">
      {msg}
    </p>
  );
}
