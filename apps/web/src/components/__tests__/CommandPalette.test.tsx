import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { axe } from "jest-axe";
import { CommandPalette } from "../CommandPalette";
import {
  KeyboardShortcutsProvider,
  useKeyboardShortcutsContext,
} from "@/contexts/KeyboardShortcutsContext";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

const mockConnect = jest.fn();
jest.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({
    address: "GABCDEF1234567890STEL",
    connected: true,
    network: "testnet",
    connect: mockConnect,
    disconnect: jest.fn(),
    isConnecting: false,
  }),
}));

function TestApp({
  onMount,
  children,
}: {
  onMount?: (ctx: ReturnType<typeof useKeyboardShortcutsContext>) => void;
  children?: React.ReactNode;
}) {
  return (
    <KeyboardShortcutsProvider>
      <TestAppInner onMount={onMount}>{children}</TestAppInner>
    </KeyboardShortcutsProvider>
  );
}

function TestAppInner({
  onMount,
  children,
}: {
  onMount?: (ctx: ReturnType<typeof useKeyboardShortcutsContext>) => void;
  children?: React.ReactNode;
}) {
  const ctx = useKeyboardShortcutsContext();

  React.useEffect(() => {
    onMount?.(ctx);
  }, [ctx, onMount]);

  return (
    <div>
      <button onClick={ctx.openCommandPalette} data-testid="open-cmd-button">
        Open Palette
      </button>
      <input data-testid="dummy-input" placeholder="Type here..." />
      <CommandPalette />
      {children}
    </div>
  );
}

describe("CommandPalette Component (#1723)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    // Default fetch mock for profile searches
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes("/api/profiles/search")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                address: "GSTELLARCREATOR123",
                username: "stellarcreator",
                display_name: "Stellar Creator",
              },
            ]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── 1. Global Keyboard Triggers ──────────────────────────────────────────

  describe("Global Keyboard Shortcut Triggers", () => {
    it("is closed by default", () => {
      render(<TestApp />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens via ⌘K (metaKey + K) on macOS", () => {
      render(<TestApp />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: "k", metaKey: true });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Type a command or search/i)).toBeInTheDocument();
    });

    it("opens via Ctrl+K (ctrlKey + K) on Windows/Linux", () => {
      render(<TestApp />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Type a command or search/i)).toBeInTheDocument();
    });

    it("toggles closed when ⌘K is pressed while open", async () => {
      render(<TestApp />);
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "k", metaKey: true });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("triggers ⌘K globally even when focused inside an input/editable field", () => {
      render(<TestApp />);
      const input = screen.getByTestId("dummy-input");
      input.focus();

      fireEvent.keyDown(input, { key: "k", metaKey: true });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("closes when Escape key is pressed", async () => {
      render(<TestApp />);
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText(/Type a command or search/i);
      fireEvent.keyDown(searchInput, { key: "Escape" });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("closes when the backdrop is clicked", async () => {
      render(<TestApp />);
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      const backdrop = screen.getByTestId("cmd-palette-backdrop");
      fireEvent.click(backdrop);
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });

  // ─── 2. Sections & Default Rendering ─────────────────────────────────────

  describe("Sections & Command Registry", () => {
    it("renders default sections (Actions and Navigation) when query is empty", () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      expect(screen.getByText("Actions")).toBeInTheDocument();
      expect(screen.getByText("Navigation")).toBeInTheDocument();

      // Check key actions
      expect(screen.getByText("Create New Post")).toBeInTheDocument();
      expect(screen.getByText("Wallet Details / Connect")).toBeInTheDocument();
      expect(screen.getByText("Open Settings")).toBeInTheDocument();
      expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();

      // Check key navigation routes
      expect(screen.getByText("Feed")).toBeInTheDocument();
      expect(screen.getByText("Explore")).toBeInTheDocument();
      expect(screen.getByText("Analytics")).toBeInTheDocument();
      expect(screen.getByText("Governance")).toBeInTheDocument();
      expect(screen.getByText("Liquidity Pools")).toBeInTheDocument();
      expect(screen.getByText("Notifications")).toBeInTheDocument();
    });
  });

  // ─── 3. Fuzzy Search (Fuse.js) ───────────────────────────────────────────

  describe("Fuzzy Search Functionality", () => {
    it("fuzzy matches navigation routes and actions with 100ms debounce", async () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const searchInput = screen.getByPlaceholderText(/Type a command or search/i);

      // Search for "sett" (should match Settings)
      fireEvent.change(searchInput, { target: { value: "sett" } });

      await waitFor(
        () => {
          expect(screen.getByText("Open Settings")).toBeInTheDocument();
          expect(screen.queryByText("Liquidity Pools")).not.toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });

    it("fuzzy searches across keywords (e.g. 'dao' matches Governance)", async () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const searchInput = screen.getByPlaceholderText(/Type a command or search/i);
      fireEvent.change(searchInput, { target: { value: "dao" } });

      await waitFor(() => {
        expect(screen.getByText("Governance")).toBeInTheDocument();
        expect(screen.queryByText("Create New Post")).not.toBeInTheDocument();
      });
    });

    it("displays dynamic post search option in Posts section", async () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const searchInput = screen.getByPlaceholderText(/Type a command or search/i);
      fireEvent.change(searchInput, { target: { value: "soroban" } });

      await waitFor(() => {
        expect(screen.getByText("Posts")).toBeInTheDocument();
        expect(screen.getByText('Search posts for "soroban"')).toBeInTheDocument();
      });
    });

    it("displays dynamic profile search results in Profiles section", async () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const searchInput = screen.getByPlaceholderText(/Type a command or search/i);
      fireEvent.change(searchInput, { target: { value: "stellar" } });

      await waitFor(() => {
        expect(screen.getByText("Profiles")).toBeInTheDocument();
        expect(screen.getByText("Stellar Creator")).toBeInTheDocument();
      });
    });

    it("shows empty state when no commands or items match", async () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const searchInput = screen.getByPlaceholderText(/Type a command or search/i);
      fireEvent.change(searchInput, { target: { value: "zyxwvutsrqp12345" } });

      // Override fetch to return empty profiles
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await waitFor(() => {
        expect(screen.getByText("No results found")).toBeInTheDocument();
      });
    });

    it("clears input immediately via clear button", async () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const searchInput = screen.getByPlaceholderText(
        /Type a command or search/i
      ) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: "feed" } });
      expect(searchInput.value).toBe("feed");

      const clearBtn = screen.getByLabelText("Clear input");
      fireEvent.click(clearBtn);

      expect(searchInput.value).toBe("");
    });
  });

  // ─── 4. Keyboard Navigation (Arrow Keys & Enter) ──────────────────────────

  describe("Keyboard Navigation & Execution", () => {
    it("navigates options via ArrowDown and ArrowUp", () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const searchInput = screen.getByPlaceholderText(/Type a command or search/i);

      // Initially first item is selected
      const firstOption = screen.getByTestId("cmd-option-action-new-post");
      expect(firstOption).toHaveAttribute("aria-selected", "true");

      // Arrow down
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });
      const secondOption = screen.getByTestId("cmd-option-action-wallet");
      expect(secondOption).toHaveAttribute("aria-selected", "true");
      expect(firstOption).toHaveAttribute("aria-selected", "false");

      // Arrow up
      fireEvent.keyDown(searchInput, { key: "ArrowUp" });
      expect(firstOption).toHaveAttribute("aria-selected", "true");
    });

    it("navigates to top and bottom via Home and End keys", () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const searchInput = screen.getByPlaceholderText(/Type a command or search/i);

      fireEvent.keyDown(searchInput, { key: "End" });
      const lastOption = screen.getByTestId("cmd-option-posts-search");
      expect(lastOption).toHaveAttribute("aria-selected", "true");

      fireEvent.keyDown(searchInput, { key: "Home" });
      const firstOption = screen.getByTestId("cmd-option-action-new-post");
      expect(firstOption).toHaveAttribute("aria-selected", "true");
    });

    it("executes route command via Enter and calls router.push", async () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const searchInput = screen.getByPlaceholderText(/Type a command or search/i);
      fireEvent.change(searchInput, { target: { value: "feed" } });

      await waitFor(() => {
        expect(screen.queryByText("Actions")).not.toBeInTheDocument();
        expect(screen.getByText("Feed")).toBeInTheDocument();
      });

      // Press Enter on the selected item
      fireEvent.keyDown(searchInput, { key: "Enter" });

      expect(mockPush).toHaveBeenCalledWith("/feed");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("executes custom action (e.g. compose post) via Enter and closes dialog", async () => {
      const mockCompose = jest.fn();

      render(
        <TestApp
          onMount={(ctx) => {
            ctx.registerComposeHandler(mockCompose);
          }}
        />
      );

      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const searchInput = screen.getByPlaceholderText(/Type a command or search/i);
      // New Post is the first action
      fireEvent.keyDown(searchInput, { key: "Enter" });

      expect(mockCompose).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("executes custom action via click", async () => {
      const mockWallet = jest.fn();

      render(
        <TestApp
          onMount={(ctx) => {
            ctx.registerWalletHandler(mockWallet);
          }}
        />
      );

      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const walletOption = screen.getByTestId("cmd-option-action-wallet");
      fireEvent.click(walletOption);

      expect(mockWallet).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });

  // ─── 5. Recent Items & LocalStorage ───────────────────────────────────────

  describe("Recent Items Persistence", () => {
    it("persists executed commands in localStorage under linkora_command_palette_recent", async () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const exploreOption = screen.getByTestId("cmd-option-nav-explore");
      fireEvent.click(exploreOption);

      const stored = localStorage.getItem("linkora_command_palette_recent");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "nav-explore",
            title: "Explore",
          }),
        ])
      );
    });

    it("displays Recent section with previously used items across reloads", async () => {
      // Pre-seed localStorage
      localStorage.setItem(
        "linkora_command_palette_recent",
        JSON.stringify([
          {
            id: "nav-analytics",
            title: "Analytics",
            subtitle: "View engagement statistics",
            category: "Recent",
            icon: "analytics",
            href: "/analytics",
          },
        ])
      );

      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      expect(screen.getByText("Recent")).toBeInTheDocument();
      // Analytics should appear under Recent
      const recentAnalytics = screen.getAllByText("Analytics")[0];
      expect(recentAnalytics).toBeInTheDocument();
    });

    it("allows removing a recent item via delete button", async () => {
      localStorage.setItem(
        "linkora_command_palette_recent",
        JSON.stringify([
          {
            id: "nav-pools",
            title: "Liquidity Pools",
            category: "Recent",
            icon: "pools",
            href: "/pools",
          },
        ])
      );

      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      expect(screen.getByText("Recent")).toBeInTheDocument();
      const removeBtn = screen.getByLabelText("Remove Liquidity Pools from recents");
      fireEvent.click(removeBtn);

      const stored = JSON.parse(localStorage.getItem("linkora_command_palette_recent") || "[]");
      expect(stored).toEqual([]);
    });
  });

  // ─── 6. Accessibility & jest-axe Compliance ───────────────────────────────

  describe("Accessibility (jest-axe Audit & WAI-ARIA)", () => {
    it("meets WCAG accessibility standards (toHaveNoViolations)", async () => {
      const { container } = render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("properly exposes combobox, listbox, and option ARIA roles", () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const combobox = screen.getByRole("combobox");
      expect(combobox).toHaveAttribute("aria-expanded", "true");
      expect(combobox).toHaveAttribute("aria-autocomplete", "list");
      expect(combobox).toHaveAttribute("aria-controls", "command-palette-listbox");

      const listbox = screen.getByRole("listbox");
      expect(listbox).toHaveAttribute("aria-label", "Commands and suggestions");

      const options = screen.getAllByRole("option");
      expect(options.length).toBeGreaterThan(0);
    });

    it("updates aria-activedescendant as activeIndex changes", () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const combobox = screen.getByRole("combobox");
      expect(combobox).toHaveAttribute("aria-activedescendant", "cmd-item-action-new-post");

      fireEvent.keyDown(combobox, { key: "ArrowDown" });
      expect(combobox).toHaveAttribute("aria-activedescendant", "cmd-item-action-wallet");
    });
  });

  // ─── 7. Responsive Styling ────────────────────────────────────────────────

  describe("Responsive Presentation", () => {
    it("applies full-screen mobile and centered desktop styling classes", () => {
      render(<TestApp />);
      fireEvent.click(screen.getByTestId("open-cmd-button"));

      const dialog = screen.getByTestId("cmd-palette-dialog");
      // Assert mobile full screen and desktop centered max width
      expect(dialog).toHaveClass("h-[100dvh]");
      expect(dialog).toHaveClass("sm:h-auto");
      expect(dialog).toHaveClass("sm:max-w-xl");
      expect(dialog).toHaveClass("sm:rounded-2xl");
    });
  });
});
