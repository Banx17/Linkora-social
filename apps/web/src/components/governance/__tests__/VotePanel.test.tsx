import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { VotePanel } from "../VotePanel";
import { getSampleProposals } from "@/lib/governance";

const proposal = getSampleProposals()[0];
const address = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("VotePanel", () => {
  it("prompts disconnected users to connect a wallet", () => {
    render(
      <VotePanel
        proposal={proposal}
        address={null}
        connected={false}
        yourVote={null}
        onVote={jest.fn()}
      />
    );

    expect(screen.getByText(/Connect your wallet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vote For" })).not.toBeInTheDocument();
  });

  it("shows a transaction preview before submitting a vote", async () => {
    const onVote = jest.fn().mockResolvedValue(undefined);
    render(
      <VotePanel
        proposal={proposal}
        address={address}
        connected
        yourVote={null}
        onVote={onVote}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Vote For" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/On-chain votes are final/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /Vote For/i }));

    await waitFor(() => expect(onVote).toHaveBeenCalledWith("for"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("explains that abstain is unavailable on the current contract", () => {
    render(
      <VotePanel
        proposal={proposal}
        address={address}
        connected
        yourVote={null}
        onVote={jest.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Abstain" })).toBeDisabled();
    expect(screen.getByText(/records only For and Against/i)).toBeInTheDocument();
  });

  it("disables voting when the proposal is no longer active", () => {
    const passed = getSampleProposals().find((candidate) => candidate.status === "Passed")!;
    render(
      <VotePanel
        proposal={passed}
        address={address}
        connected
        yourVote={null}
        onVote={jest.fn()}
      />
    );

    expect(screen.getByText(/Voting is closed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vote For" })).toBeDisabled();
  });
});
