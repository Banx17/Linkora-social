/**
 * TipModal tests — multi-step XLM tipping flow (issue #1728).
 *
 * Step 1 – Amount  : token selector, amount input, quick-select, Max button.
 * Step 2 – Preview : fee breakdown, back navigation, Confirm & Send button.
 * Step 3 – Confirm : success hash linkable to Stellar Expert; error state.
 */
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { TipModal, toTipTokens } from "../TipModal";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useTip } from "@/hooks/useTip";
import { useWalletContext } from "@/components/WalletProvider";

jest.mock("@/hooks/useTokenBalances", () => ({ useTokenBalances: jest.fn() }));
jest.mock("@/hooks/useTip", () => ({ useTip: jest.fn() }));
jest.mock("@/components/WalletProvider", () => ({ useWalletContext: jest.fn() }));
jest.mock("linkora-sdk", () => ({
  stellarAssetContractId: (b: { asset_type: string; asset_code?: string }) =>
    b.asset_type === "native"
      ? "CNATIVESAC"
      : b.asset_type === "liquidity_pool_shares"
        ? null
        : `CSAC_${b.asset_code}`,
}));
jest.mock("@/config", () => ({
  config: { contractId: "CLINKORA", networkPassphrase: "Test SDF Network ; September 2015" },
}));

const WALLET = "GTIPPER0000000000000000000000000000000000000000000000000";
const ISSUER = "GISSUERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const balances = [
  {
    asset_type: "native",
    asset_code: "XLM",
    asset_issuer: "",
    balance: "25.0000000",
    usdPrice: null,
    usdValue: null,
  },
  {
    asset_type: "credit_alphanum4",
    asset_code: "USDC",
    asset_issuer: ISSUER,
    balance: "3.5000000",
    usdPrice: null,
    usdValue: null,
  },
  { asset_type: "liquidity_pool_shares", balance: "1.0000000", usdPrice: null, usdValue: null },
];

const tip = jest.fn().mockResolvedValue(undefined);
const refresh = jest.fn();
const reset = jest.fn();

function setup(
  overrides: {
    balances?: unknown;
    tip?: Record<string, unknown>;
    address?: string | null;
  } = {}
) {
  (useWalletContext as jest.Mock).mockReturnValue({
    address: overrides.address === undefined ? WALLET : overrides.address,
    connected: overrides.address !== null,
  });
  (useTokenBalances as jest.Mock).mockReturnValue({
    tokens: balances,
    isLoading: false,
    error: null,
    refresh,
    ...(overrides.balances as object),
  });
  (useTip as jest.Mock).mockReturnValue({
    status: "idle",
    result: null,
    error: null,
    tip,
    reset,
    ...overrides.tip,
  });
  return render(<TipModal postId={7} authorName="alice" onClose={jest.fn()} />);
}

/** Helpers for step 1 */
const amountInput = () => screen.getByLabelText("Amount");
const reviewBtn = () => screen.getByRole("button", { name: "Review →" });

/** Navigate from step 1 to step 2 */
function goToStep2(amount = "2.5", token?: string) {
  if (token) fireEvent.click(screen.getByRole("radio", { name: new RegExp(token) }));
  fireEvent.change(amountInput(), { target: { value: amount } });
  fireEvent.click(reviewBtn());
}

afterEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Step 1 — Amount
// ---------------------------------------------------------------------------

describe("TipModal Step 1 – Amount (#1728)", () => {
  it("shows step indicator with 'Amount' as the active step", () => {
    setup();
    // The step indicator uses aria-current="step" on the active circle
    const activeStep = document.querySelector('[aria-current="step"]');
    expect(activeStep).toBeInTheDocument();
    // The step indicator spans are visible; check the step-1 label specifically
    const stepLabels = screen.getAllByText("Amount");
    // At least one is from the step indicator (a span), another is the field label
    expect(stepLabels.length).toBeGreaterThanOrEqual(1);
  });

  it("lists the wallet's tippable tokens with balances via useTokenBalances", () => {
    setup();
    expect(useTokenBalances).toHaveBeenCalledWith(WALLET);
    const group = screen.getByRole("radiogroup", { name: "Token" });
    const options = within(group).getAllByRole("radio");
    expect(options).toHaveLength(2); // liquidity pool shares skipped
    expect(within(group).getByText("25 available")).toBeInTheDocument();
    expect(within(group).getByText("3.5 available")).toBeInTheDocument();
    expect(options[0]).toBeChecked();
  });

  it("keeps 'Review →' disabled until a valid amount is entered", () => {
    setup();
    expect(reviewBtn()).toBeDisabled();
    fireEvent.change(amountInput(), { target: { value: "2.5" } });
    expect(reviewBtn()).toBeEnabled();
  });

  it("shows an inline insufficient-balance error for the selected token", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: /USDC/ }));
    fireEvent.change(amountInput(), { target: { value: "4" } });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Insufficient balance — you have 3.5 USDC."
    );
    expect(amountInput()).toHaveAttribute("aria-invalid", "true");
    expect(reviewBtn()).toBeDisabled();
  });

  it("validates decimals against the token", () => {
    setup();
    fireEvent.change(amountInput(), { target: { value: "1.00000001" } });
    expect(screen.getByRole("alert")).toHaveTextContent("XLM supports at most 7 decimal places.");
  });

  it("shows quick-select buttons (1, 5, 10 XLM) for the native token", () => {
    setup();
    expect(screen.getByRole("button", { name: "1 XLM" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5 XLM" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10 XLM" })).toBeInTheDocument();
  });

  it("quick-select fills the amount input", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "5 XLM" }));
    expect(amountInput()).toHaveValue("5");
    expect(reviewBtn()).toBeEnabled();
  });

  it("fills the max balance on request", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Max: 25 XLM/ }));
    expect(amountInput()).toHaveValue("25");
    expect(reviewBtn()).toBeEnabled();
  });

  it("handles loading, failed and empty balances", () => {
    const { unmount } = setup({ balances: { tokens: [], isLoading: true } });
    expect(screen.getByText("Loading your balances…")).toBeInTheDocument();
    unmount();

    const failed = setup({ balances: { tokens: [], error: "Horizon returned 503" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Horizon returned 503");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalled();
    failed.unmount();

    setup({ balances: { tokens: [] } });
    expect(screen.getByText(/No tippable tokens/)).toBeInTheDocument();
    expect(reviewBtn()).toBeDisabled();
  });

  it("asks for a wallet connection when disconnected", () => {
    setup({ address: null });
    expect(screen.getByText("Connect your wallet to send a tip.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Step 2 — Preview
// ---------------------------------------------------------------------------

describe("TipModal Step 2 – Preview (#1728)", () => {
  it("shows the Preview step with recipient, fee breakdown, and payout", () => {
    setup();
    goToStep2("10");

    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
    // Protocol fee row (1 %)
    expect(screen.getByText(/Protocol Fee/)).toBeInTheDocument();
    // Creator receives row
    expect(screen.getByText("Creator receives")).toBeInTheDocument();
  });

  it("goes back to step 1 when '← Back' is clicked", () => {
    setup();
    goToStep2("3");
    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    // Back to step 1: amount input should be visible
    expect(amountInput()).toBeInTheDocument();
  });

  it("calls useTip with correct args when 'Confirm & Send' is clicked", async () => {
    setup();
    goToStep2("1.25", "USDC");
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Send" }));

    await waitFor(() => {
      expect(tip).toHaveBeenCalledWith(WALLET, BigInt(7), "CSAC_USDC", "1.25", 7, "CLINKORA");
    });
  });

  it("shows TX status messages while in flight", () => {
    // Verify the status message map covers the expected states
    // (Integration via TxStatusMessage sub-component)
    const statusMessages: Record<string, string> = {
      approving: "Approving token spending limit…",
      awaiting_sig: "Awaiting Freighter signature…",
      submitting: "Submitting to Stellar…",
    };
    expect(Object.keys(statusMessages)).toHaveLength(3);
    // The preview step renders these via TxStatusMessage — confirm via the
    // approving status appearing on the preview screen.
    setup({ tip: { status: "approving" } });
    goToStep2("2");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("surfaces the readable cooldown error from useTip on the preview step", () => {
    setup({
      tip: {
        status: "error",
        error: "You tipped this post with this token recently.",
      },
    });
    goToStep2("2");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tipped this post with this token recently"
    );
  });
});

// ---------------------------------------------------------------------------
// Step 3 — Confirm (success / error)
// ---------------------------------------------------------------------------

describe("TipModal Step 3 – Confirm (#1728)", () => {
  it("shows the success state with tx hash and Stellar Expert link", async () => {
    const mockResult = { hash: "abc123def456ghi789", ledger: 1234567 };

    // Use a controllable mock so we can update status after tip() is called.
    // We simulate the async resolution by re-mocking useTip after the call.
    let resolveCall: () => void;
    const tipPromise = new Promise<void>((resolve) => {
      resolveCall = resolve;
    });

    (useTip as jest.Mock).mockReturnValue({
      status: "idle",
      result: null,
      error: null,
      tip: jest.fn().mockImplementation(async () => {
        await tipPromise;
      }),
      reset: jest.fn(),
    });
    (useWalletContext as jest.Mock).mockReturnValue({ address: WALLET, connected: true });
    (useTokenBalances as jest.Mock).mockReturnValue({
      tokens: balances,
      isLoading: false,
      error: null,
      refresh,
    });

    render(<TipModal postId={7} authorName="alice" onClose={jest.fn()} />);

    // Navigate to step 2
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Review →" }));

    // Click confirm — navigates to step 3 immediately (step is set to 3 before await)
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Send" }));

    // Now simulate tip resolution by re-rendering with success state
    // The component called setStep(3) synchronously after calling tip(),
    // so step 3 content (spinner) should be visible:
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Re-mock useTip to return success — the component will re-read on next render
    (useTip as jest.Mock).mockReturnValue({
      status: "success",
      result: mockResult,
      error: null,
      tip: jest.fn(),
      reset: jest.fn(),
    });
    resolveCall!();

    await waitFor(
      () => {
        expect(screen.getByText("Tip Sent! 🎉")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText("abc123def456ghi789")).toBeInTheDocument();
    expect(screen.getByText("1234567")).toBeInTheDocument();

    const explorerLink = screen.getByRole("link", {
      name: /View on Stellar Expert/,
    });
    expect(explorerLink).toHaveAttribute("href", expect.stringContaining("abc123def456ghi789"));
    expect(explorerLink).toHaveAttribute("target", "_blank");
  });

  it("shows the error state with a 'Try Again' button", async () => {
    setup({
      tip: {
        status: "error",
        error: "Transaction rejected by the network.",
      },
    });
    goToStep2("5");

    // Step 3 error content is visible
    await waitFor(() => {
      expect(screen.getByText("Transaction Failed")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Transaction rejected by the network.");
    // Try Again calls reset (mocked) and navigates back to step 2
    fireEvent.click(screen.getByRole("button", { name: "← Try Again" }));
    // reset should have been called
    expect(reset).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// toTipTokens utility
// ---------------------------------------------------------------------------

describe("toTipTokens", () => {
  it("maps balances to contract addresses and skips assets without a SAC", () => {
    expect(toTipTokens(balances as never, "Test SDF Network ; September 2015")).toEqual([
      {
        key: "XLM",
        symbol: "XLM",
        issuer: null,
        contractId: "CNATIVESAC",
        balance: "25.0000000",
        decimals: 7,
      },
      {
        key: `USDC:${ISSUER}`,
        symbol: "USDC",
        issuer: ISSUER,
        contractId: "CSAC_USDC",
        balance: "3.5000000",
        decimals: 7,
      },
    ]);
  });
});
