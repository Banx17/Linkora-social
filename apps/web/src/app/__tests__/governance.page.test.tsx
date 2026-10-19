import { fireEvent, render, screen } from "@testing-library/react";
import GovernancePage from "../governance/page";
import { useProposalList } from "@/hooks/useGovernance";
import { getSampleProposals } from "@/lib/governance";

jest.mock("@/hooks/useGovernance", () => ({
  useProposalList: jest.fn(),
}));

const mockList = useProposalList as jest.Mock;

function listState(overrides: Record<string, unknown> = {}) {
  return {
    proposals: getSampleProposals(),
    loading: false,
    error: null,
    page: 1,
    hasNext: true,
    hasPrev: false,
    next: jest.fn(),
    previous: jest.fn(),
    refresh: jest.fn(),
    ...overrides,
  };
}

describe("GovernancePage", () => {
  beforeEach(() => {
    mockList.mockReturnValue(listState());
  });

  afterEach(() => jest.clearAllMocks());

  it("renders proposals with status badges and a create link", () => {
    render(<GovernancePage />);

    expect(screen.getByRole("heading", { name: "Governance" })).toBeInTheDocument();
    expect(screen.getAllByTestId("proposal-card")).toHaveLength(getSampleProposals().length);
    expect(screen.getAllByTestId("status-active").length).toBeGreaterThan(0);
    expect(screen.getByTestId("status-executed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create proposal/i })).toHaveAttribute(
      "href",
      "/governance/new"
    );
  });

  it("paginates through the proposal list", () => {
    const next = jest.fn();
    mockList.mockReturnValue(listState({ next }));

    render(<GovernancePage />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("shows an error with a retry action", () => {
    const refresh = jest.fn();
    mockList.mockReturnValue(listState({ proposals: [], error: "RPC unavailable", refresh }));

    render(<GovernancePage />);

    expect(screen.getByRole("alert")).toHaveTextContent("RPC unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when no proposals exist", () => {
    mockList.mockReturnValue(listState({ proposals: [], hasNext: false }));

    render(<GovernancePage />);

    expect(screen.getByText(/No proposals have been created yet/i)).toBeInTheDocument();
  });
});
