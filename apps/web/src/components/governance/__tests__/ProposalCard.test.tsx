import { render, screen } from "@testing-library/react";
import { ProposalCard } from "../ProposalCard";
import { getSampleProposals } from "@/lib/governance";

describe("ProposalCard", () => {
  it("renders the proposal, status badge, vote counts and detail link", () => {
    const proposal = getSampleProposals()[0];
    render(<ProposalCard proposal={proposal} />);

    expect(screen.getByText(proposal.title)).toBeInTheDocument();
    expect(screen.getByTestId("status-active")).toHaveTextContent("Active");
    expect(screen.getByText("1,250")).toBeInTheDocument();
    expect(screen.getByText("430")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View & vote/i })).toHaveAttribute(
      "href",
      `/governance/${proposal.id}`
    );
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("renders each status variant", () => {
    const proposals = getSampleProposals();
    for (const proposal of proposals) {
      const { unmount } = render(<ProposalCard proposal={proposal} />);
      expect(screen.getByTestId(`status-${proposal.status.toLowerCase()}`)).toBeInTheDocument();
      unmount();
    }
  });
});
