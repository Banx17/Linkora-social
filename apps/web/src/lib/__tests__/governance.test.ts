import { GovParameter } from "linkora-sdk";
import {
  buildCalldataPreview,
  formatCountdown,
  getSampleProposals,
  statusFromChain,
  validateProposalDraft,
  votePercentages,
} from "../governance";

describe("governance helpers", () => {
  it("maps every chain status to a display status", () => {
    expect(statusFromChain("Active")).toBe("Active");
    expect(statusFromChain("Passed")).toBe("Passed");
    expect(statusFromChain("Failed")).toBe("Failed");
    expect(statusFromChain("Executed")).toBe("Executed");
    expect(statusFromChain("Vetoed")).toBe("Vetoed");
    expect(statusFromChain("something-new")).toBe("Active");
  });

  it("formats deadlines at useful resolutions", () => {
    const now = 1_000_000;
    expect(formatCountdown(now - 1, now)).toBe("Voting ended");
    expect(formatCountdown(now + 2 * 86_400_000 + 3 * 3_600_000, now)).toBe("2d 3h left");
    expect(formatCountdown(now + 3 * 3_600_000 + 12 * 60_000, now)).toBe("3h 12m left");
    expect(formatCountdown(now + 5 * 60_000 + 20_000, now)).toBe("5m 20s left");
    expect(formatCountdown(now + 15_000, now)).toBe("15s left");
  });

  it("computes vote percentages including abstain", () => {
    expect(votePercentages({ votesFor: 50, votesAgainst: 30, votesAbstain: 20 })).toEqual({
      for: 50,
      against: 30,
      abstain: 20,
      total: 100,
    });
    expect(votePercentages({ votesFor: 0, votesAgainst: 0, votesAbstain: 0 })).toEqual({
      for: 0,
      against: 0,
      abstain: 0,
      total: 0,
    });
  });

  it("validates proposal drafts against contract bounds", () => {
    const base = {
      title: "Update the fee",
      description: "A valid description",
      parameter: GovParameter.FeeBps,
      newValue: "250",
      newAddress: "",
    };

    expect(validateProposalDraft(base)).toBeNull();
    expect(validateProposalDraft({ ...base, title: "" })).toMatch(/Title/);
    expect(validateProposalDraft({ ...base, newValue: "10001" })).toMatch(/Basis points/);
    expect(
      validateProposalDraft({ ...base, parameter: GovParameter.GovQuorum, newValue: "0" })
    ).toMatch(/Quorum/);
    expect(
      validateProposalDraft({
        ...base,
        parameter: GovParameter.Treasury,
        newValue: "0",
        newAddress: "not-an-address",
      })
    ).toMatch(/valid Stellar/);
  });

  it("previews the calldata for the selected parameter", () => {
    expect(buildCalldataPreview(GovParameter.FeeBps, "250", "")).toBe("set_fee(250)");
    expect(buildCalldataPreview(GovParameter.GovQuorum, "40", "")).toBe(
      "gov_set_config(quorum=40)"
    );
    expect(buildCalldataPreview(GovParameter.Treasury, "0", "GABC")).toBe(
      "set_treasury(GABC)"
    );
  });

  it("ships representative sample proposals for previews", () => {
    const proposals = getSampleProposals(0);
    expect(proposals.length).toBeGreaterThan(0);
    expect(new Set(proposals.map((proposal) => proposal.status))).toEqual(
      new Set(["Active", "Passed", "Executed", "Failed", "Vetoed"])
    );
  });
});
