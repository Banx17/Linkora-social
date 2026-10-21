/**
 * ProfileForm tests — React 19 useActionState/useFormStatus edition.
 *
 * What we test:
 *  1. Renders all fields and the submit button
 *  2. Populates inputs from initialValues via defaultValue
 *  3. Shows inline field errors returned by the Server Action (fieldErrors)
 *  4. Shows the success banner on status === "success"
 *  5. Shows a general error banner when status === "error" with no fieldErrors
 *  6. SubmitButton renders pending label while the action is in-flight
 *  7. Hidden address input carries the wallet address
 *
 * Mocking strategy
 * ────────────────
 * The Server Action is mocked at the module level so we never hit the network.
 * `useActionState` is patched to immediately return the mock state we inject,
 * letting us test every status without async drama.
 */

import { render, screen } from "@testing-library/react";
import { ProfileForm } from "./ProfileForm";
import {
  initialProfileActionState,
  type ProfileActionState,
} from "@/app/actions/profile";

// ── Mock useActionState ───────────────────────────────────────────────────────
// We control the returned state so each test can simulate any action outcome.

let mockState: ProfileActionState = initialProfileActionState;
// formAction is a no-op; individual tests set mockState before rendering.
const mockFormAction = jest.fn();

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: (_action: unknown, _initial: unknown) => [mockState, mockFormAction],
  };
});

// ── Mock useFormStatus ────────────────────────────────────────────────────────
let mockPending = false;

jest.mock("react-dom", () => {
  const actual = jest.requireActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormStatus: () => ({ pending: mockPending }),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderForm(
  overrides: Partial<React.ComponentProps<typeof ProfileForm>> = {}
) {
  return render(
    <ProfileForm address="GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQ" {...overrides} />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockState = initialProfileActionState;
  mockPending = false;
  mockFormAction.mockClear();
});

describe("ProfileForm rendering", () => {
  it("renders the username and creator token fields", () => {
    renderForm();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/creator token address/i)).toBeInTheDocument();
  });

  it("renders the submit button with default label", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /save profile/i })).toBeInTheDocument();
  });

  it("includes a hidden address input with the wallet address", () => {
    renderForm({ address: "GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOP" });
    const hidden = document.querySelector('input[name="address"]') as HTMLInputElement;
    expect(hidden).not.toBeNull();
    expect(hidden.value).toBe("GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOP");
  });

  it("pre-populates fields from initialValues", () => {
    renderForm({ initialValues: { username: "alice_stellar", creatorToken: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQ" } });
    expect(screen.getByLabelText(/username/i)).toHaveValue("alice_stellar");
    expect(screen.getByLabelText(/creator token address/i)).toHaveValue(
      "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQ"
    );
  });
});

describe("ProfileForm — success state", () => {
  it("shows the success banner when status is 'success'", () => {
    mockState = { status: "success", message: "Profile saved successfully." };
    renderForm();
    expect(screen.getByRole("status")).toHaveTextContent("Profile saved successfully.");
  });

  it("does not show an error banner on success", () => {
    mockState = { status: "success", message: "Profile saved successfully." };
    renderForm();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ProfileForm — error state with fieldErrors", () => {
  it("shows inline username error from fieldErrors", () => {
    mockState = {
      status: "error",
      message: "Please fix the errors below.",
      fieldErrors: { username: "Username must be at least 3 characters." },
    };
    renderForm();
    expect(screen.getByText("Username must be at least 3 characters.")).toBeInTheDocument();
  });

  it("marks the username input as aria-invalid when there is a field error", () => {
    mockState = {
      status: "error",
      message: "Please fix the errors below.",
      fieldErrors: { username: "Username is required." },
    };
    renderForm();
    expect(screen.getByLabelText(/username/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("shows inline creatorToken error from fieldErrors", () => {
    mockState = {
      status: "error",
      message: "Please fix the errors below.",
      fieldErrors: { creatorToken: "Enter a valid Stellar address." },
    };
    renderForm();
    expect(screen.getByText("Enter a valid Stellar address.")).toBeInTheDocument();
  });

  it("does not show a top-level error banner when fieldErrors are present", () => {
    mockState = {
      status: "error",
      message: "Please fix the errors below.",
      fieldErrors: { username: "Username is required." },
    };
    renderForm();
    // The general error banner only appears when there are no fieldErrors
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ProfileForm — general error (no fieldErrors)", () => {
  it("shows the top-level error banner", () => {
    mockState = {
      status: "error",
      message: "Wallet address is missing. Connect your wallet and try again.",
    };
    renderForm();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Wallet address is missing. Connect your wallet and try again."
    );
  });
});

describe("ProfileForm — pending state (useFormStatus)", () => {
  it("shows the pending label on the submit button while submitting", () => {
    mockPending = true;
    renderForm();
    expect(screen.getByRole("button", { name: /saving…/i })).toBeInTheDocument();
  });

  it("disables the submit button while pending", () => {
    mockPending = true;
    renderForm();
    expect(screen.getByRole("button", { name: /saving…/i })).toBeDisabled();
  });
});

describe("ProfileForm — idle state", () => {
  it("shows no banner on idle", () => {
    renderForm();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("submit button is enabled on idle", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /save profile/i })).not.toBeDisabled();
  });
});
