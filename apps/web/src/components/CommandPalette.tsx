"use client";

/**
 * CommandPalette.tsx
 *
 * Global keyboard-navigable command palette (⌘K / Ctrl+K) for Linkora.
 *
 * Features:
 * - Global shortcut trigger (⌘K on macOS / Ctrl+K on Windows/Linux)
 * - Radix UI Dialog shell with Framer Motion spring physics
 * - Fuzzy search across Navigation, Actions, Profiles, and Posts via Fuse.js
 * - Keyboard navigation (ArrowUp, ArrowDown, Enter, Esc, Home, End)
 * - 100ms debounced search input with immediate local state
 * - Recent items persisted across reloads in localStorage
 * - Fully accessible: role="combobox", aria-activedescendant, focus trap, jest-axe compliant
 * - Responsive: full-screen on mobile, centered dialog on desktop
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, type ReactElement } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useKeyboardShortcutsContext } from "@/contexts/KeyboardShortcutsContext";
import { useWallet } from "@/hooks/useWallet";
import { useCommandPaletteRecents } from "@/hooks/useCommandPaletteRecents";
import {
  CommandItem,
  CommandCategory,
  STATIC_COMMANDS,
  createCommandSearchIndex,
  formatProfileCommand,
  formatPostSearchCommand,
} from "@/lib/commandPaletteData";
import {
  getStoredThemePreference,
  storeThemePreference,
  type ThemePreference,
} from "@/components/ThemeBootstrap";

const INDEXER_API_URL = process.env.NEXT_PUBLIC_INDEXER_API_URL ?? "";

// ─── Icons ───────────────────────────────────────────────────────────────────

function CommandIcon({
  name,
  className = "w-4 h-4",
}: {
  name?: string;
  className?: string;
}): ReactElement {
  switch (name) {
    case "feed":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
          />
        </svg>
      );
    case "explore":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      );
    case "analytics":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      );
    case "governance":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
          />
        </svg>
      );
    case "pools":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
          />
        </svg>
      );
    case "notifications":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
      );
    case "profile":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      );
    case "settings":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      );
    case "compose":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      );
    case "wallet":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
          />
        </svg>
      );
    case "theme":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      );
    case "help":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case "copy":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      );
    case "clock":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case "search":
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      );
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CommandPalette() {
  const router = useRouter();
  const { address, connect } = useWallet();
  const { isCommandPaletteOpen, closeCommandPalette, openHelpModal, onOpenCompose, onOpenWallet } =
    useKeyboardShortcutsContext();

  const { recentItems, addRecentItem, removeRecentItem } = useCommandPaletteRecents();

  // Local state
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [profileSuggestions, setProfileSuggestions] = useState<CommandItem[]>([]);
  const [isSearchingProfiles, setIsSearchingProfiles] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize Fuse instance
  const fuseIndex = useMemo(() => createCommandSearchIndex(), []);

  // 100ms debouncing for query input
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!val.trim()) {
      setDebouncedQuery("");
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(val.trim());
    }, 100);
  };

  // Reset query and selection when modal opens/closes
  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery("");
      setDebouncedQuery("");
      setActiveIndex(0);
      setProfileSuggestions([]);
      // Ensure input receives focus after mount
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [isCommandPaletteOpen]);

  // Clean up debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Async profile search via indexer when user types >= 2 characters
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < 2) {
      setProfileSuggestions([]);
      setIsSearchingProfiles(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsSearchingProfiles(true);

    const fetchProfiles = async () => {
      try {
        const res = await fetch(
          `${INDEXER_API_URL}/api/profiles/search?q=${encodeURIComponent(trimmed)}&limit=3`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        const profiles = Array.isArray(data) ? data : data.profiles || [];
        const items = profiles.map((p: any) =>
          formatProfileCommand({
            address: p.address,
            username: p.username,
            displayName: p.display_name,
          })
        );
        if (!controller.signal.aborted) {
          setProfileSuggestions(items);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          // Gracefully fallback to empty profiles without crashing
          setProfileSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingProfiles(false);
        }
      }
    };

    fetchProfiles();
  }, [debouncedQuery]);

  // Compute matched items
  const { flattenedItems, groupedItems } = useMemo(() => {
    const trimmed = debouncedQuery.trim();

    // ── CASE 1: Query is empty ──
    if (!trimmed) {
      const groups: { category: CommandCategory; items: CommandItem[] }[] = [];

      // 1. Recent Items
      if (recentItems.length > 0) {
        groups.push({
          category: "Recent",
          items: recentItems,
        });
      }

      // 2. Actions
      const actions = STATIC_COMMANDS.filter((c) => c.category === "Actions");
      groups.push({
        category: "Actions",
        items: actions,
      });

      // 3. Navigation
      const nav = STATIC_COMMANDS.filter((c) => c.category === "Navigation");
      groups.push({
        category: "Navigation",
        items: nav,
      });

      // 4. Posts
      const posts = STATIC_COMMANDS.filter((c) => c.category === "Posts");
      if (posts.length > 0) {
        groups.push({
          category: "Posts",
          items: posts,
        });
      }

      const flattened = groups.flatMap((g) => g.items);
      return { flattenedItems: flattened, groupedItems: groups };
    }

    // ── CASE 2: Query is non-empty (Fuzzy Search via Fuse.js) ──
    const searchResults = fuseIndex.search(trimmed);
    const matchedStatic = searchResults.map((result) => result.item);

    const groupsMap = new Map<CommandCategory, CommandItem[]>();

    // Add static matches by category
    for (const item of matchedStatic) {
      const cat = item.category;
      if (!groupsMap.has(cat)) {
        groupsMap.set(cat, []);
      }
      groupsMap.get(cat)!.push(item);
    }

    // Add dynamic profile suggestions
    if (profileSuggestions.length > 0) {
      groupsMap.set("Profiles", profileSuggestions);
    }

    // Add dynamic post search action if query is a reasonable search query (up to 12 chars or has spaces)
    if (trimmed.length > 0 && (trimmed.length <= 12 || trimmed.includes(" "))) {
      const postSearchCommand = formatPostSearchCommand(trimmed);
      if (!groupsMap.has("Posts")) {
        groupsMap.set("Posts", []);
      }
      groupsMap.get("Posts")!.push(postSearchCommand);
    }

    // Order categories nicely
    const orderedCategories: CommandCategory[] = ["Actions", "Navigation", "Profiles", "Posts"];

    const groups: { category: CommandCategory; items: CommandItem[] }[] = [];
    for (const cat of orderedCategories) {
      const items = groupsMap.get(cat);
      if (items && items.length > 0) {
        groups.push({ category: cat, items });
      }
    }

    const flattened = groups.flatMap((g) => g.items);
    return { flattenedItems: flattened, groupedItems: groups };
  }, [debouncedQuery, recentItems, fuseIndex, profileSuggestions]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery]);

  // Keep active index in bounds
  useEffect(() => {
    setActiveIndex((prev) => {
      if (flattenedItems.length === 0) return -1;
      if (prev >= flattenedItems.length || prev < 0) return 0;
      return prev;
    });
  }, [flattenedItems]);

  // Scroll active item into view during keyboard navigation
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeElement = listRef.current.querySelector(
        `[data-cmd-index="${activeIndex}"]`
      ) as HTMLElement | null;
      if (activeElement && typeof activeElement.scrollIntoView === "function") {
        activeElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [activeIndex]);

  // Execute selected command
  const executeCommand = useCallback(
    async (item: CommandItem) => {
      // 1. Persist to recents (except search-posts which is ad-hoc query)
      if (item.category !== "Posts") {
        addRecentItem(item);
      }

      // 2. Close modal
      closeCommandPalette();

      // 3. Navigation
      if (item.href) {
        router.push(item.href);
        return;
      }

      // 4. Custom Actions
      if (item.actionId) {
        switch (item.actionId) {
          case "new-post":
            onOpenCompose?.();
            break;
          case "wallet":
            if (onOpenWallet) {
              onOpenWallet();
            } else {
              try {
                await connect();
              } catch (e) {
                console.error("Wallet connect failed:", e);
              }
            }
            break;
          case "settings":
            router.push("/settings");
            break;
          case "shortcuts-help":
            openHelpModal();
            break;
          case "toggle-theme": {
            const current = getStoredThemePreference();
            const next: ThemePreference = current === "light" ? "dark" : "light";
            storeThemePreference(next);
            document.documentElement.dataset.theme = next;
            break;
          }
          case "copy-address":
            if (address && typeof navigator !== "undefined" && navigator.clipboard) {
              navigator.clipboard.writeText(address);
            }
            break;
        }
      }
    },
    [
      addRecentItem,
      closeCommandPalette,
      router,
      onOpenCompose,
      onOpenWallet,
      connect,
      openHelpModal,
      address,
    ]
  );

  // Keyboard navigation within the palette
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flattenedItems.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev < flattenedItems.length - 1 ? prev + 1 : 0));
        break;

      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : flattenedItems.length - 1));
        break;

      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;

      case "End":
        e.preventDefault();
        setActiveIndex(flattenedItems.length - 1);
        break;

      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < flattenedItems.length) {
          executeCommand(flattenedItems[activeIndex]);
        }
        break;

      case "Escape":
        e.preventDefault();
        closeCommandPalette();
        break;

      default:
        break;
    }
  };

  const activeItem = activeIndex >= 0 ? flattenedItems[activeIndex] : null;
  const activeDescendantId = activeItem ? `cmd-item-${activeItem.id}` : undefined;

  return (
    <Dialog.Root
      open={isCommandPaletteOpen}
      onOpenChange={(open) => {
        if (!open) closeCommandPalette();
      }}
    >
      <AnimatePresence>
        {isCommandPaletteOpen && (
          <Dialog.Portal forceMount>
            {/* Backdrop */}
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
                onClick={closeCommandPalette}
                data-testid="cmd-palette-backdrop"
              />
            </Dialog.Overlay>

            {/* Modal Dialog Content */}
            <div
              className="fixed inset-0 z-[101] flex items-center justify-center p-0 sm:p-4 pointer-events-none"
              data-testid="cmd-palette-container"
            >
              <Dialog.Content asChild>
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: -16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -16 }}
                  transition={{ type: "spring", damping: 28, stiffness: 350 }}
                  className="pointer-events-auto flex flex-col w-full h-[100dvh] sm:h-auto sm:max-h-[82vh] sm:max-w-xl sm:rounded-2xl border border-[var(--border,#e5e7eb)] bg-[var(--card,#ffffff)] text-[var(--foreground,#111827)] shadow-2xl overflow-hidden"
                  data-testid="cmd-palette-dialog"
                  aria-labelledby="cmd-palette-title"
                  aria-describedby="cmd-palette-description"
                >
                  {/* Visually Hidden Accessible Headers for Screen Readers */}
                  <Dialog.Title id="cmd-palette-title" className="sr-only">
                    Command Palette
                  </Dialog.Title>
                  <Dialog.Description id="cmd-palette-description" className="sr-only">
                    Search commands, routes, actions, and profiles. Use arrow keys to navigate and
                    Enter to select.
                  </Dialog.Description>

                  {/* Accessible live status region for screen readers */}
                  <div role="status" aria-live="polite" className="sr-only">
                    {debouncedQuery.trim()
                      ? `${flattenedItems.length} command results available.`
                      : "Search or navigate Linkora."}
                  </div>

                  {/* Header & Search Input */}
                  <div className="relative flex items-center border-b border-[var(--border,#e5e7eb)] px-4 py-3 sm:py-3.5 gap-3">
                    <span className="text-[var(--text-muted,#6b7280)] shrink-0">
                      <CommandIcon name="search" className="w-5 h-5 text-violet-500" />
                    </span>

                    <input
                      ref={inputRef}
                      type="text"
                      role="combobox"
                      aria-expanded="true"
                      aria-controls="command-palette-listbox"
                      aria-autocomplete="list"
                      aria-activedescendant={activeDescendantId}
                      aria-label="Command search input"
                      placeholder="Type a command or search..."
                      value={query}
                      onChange={handleQueryChange}
                      onKeyDown={handleKeyDown}
                      className="w-full bg-transparent text-base sm:text-sm text-[var(--foreground,#111827)] placeholder:text-[var(--text-muted,#9ca3af)] focus:outline-none"
                      data-testid="cmd-palette-input"
                    />

                    {/* Right side controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {query && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setDebouncedQuery("");
                            inputRef.current?.focus();
                          }}
                          className="p-1 rounded text-[var(--text-muted,#9ca3af)] hover:text-[var(--foreground,#111827)] hover:bg-[var(--muted,#f3f4f6)] transition-colors"
                          aria-label="Clear input"
                          tabIndex={-1}
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                      <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono bg-[var(--muted,#f3f4f6)] text-[var(--text-muted,#6b7280)] border border-[var(--border,#e5e7eb)]">
                        ESC
                      </kbd>
                    </div>
                  </div>

                  {/* Results List */}
                  <div
                    ref={listRef}
                    id="command-palette-listbox"
                    role="listbox"
                    aria-label="Commands and suggestions"
                    className="flex-1 overflow-y-auto px-2 py-2 sm:py-3 space-y-4 focus:outline-none"
                    tabIndex={-1}
                  >
                    {/* Empty State */}
                    {flattenedItems.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <div className="w-10 h-10 rounded-full bg-[var(--muted,#f3f4f6)] flex items-center justify-center text-[var(--text-muted,#9ca3af)] mb-3">
                          <CommandIcon name="search" className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-semibold text-[var(--foreground,#111827)]">
                          No results found
                        </p>
                        <p className="text-xs text-[var(--text-muted,#6b7280)] mt-1 max-w-xs">
                          We couldn&apos;t find anything matching &quot;{query}&quot;. Try searching
                          for a different action or page.
                        </p>
                      </div>
                    )}

                    {/* Grouped Commands */}
                    {groupedItems.map((group) => {
                      return (
                        <div key={group.category} className="space-y-1">
                          {/* Group Category Header */}
                          <div
                            role="presentation"
                            className="flex items-center justify-between px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted,#6b7280)] select-none"
                          >
                            <span>{group.category}</span>
                            {group.category === "Recent" && (
                              <span className="text-[10px] font-normal lowercase tracking-normal opacity-75">
                                recent actions
                              </span>
                            )}
                          </div>

                          {/* Items in this Category */}
                          {group.items.map((item) => {
                            const itemIndex = flattenedItems.findIndex((fi) => fi.id === item.id);
                            const isSelected = itemIndex === activeIndex;

                            return (
                              <div
                                key={item.id}
                                id={`cmd-item-${item.id}`}
                                role="option"
                                aria-selected={isSelected}
                                data-cmd-index={itemIndex}
                                onClick={() => executeCommand(item)}
                                onMouseEnter={() => setActiveIndex(itemIndex)}
                                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer select-none transition-colors ${
                                  isSelected
                                    ? "bg-violet-600 text-white"
                                    : "text-[var(--foreground,#111827)] hover:bg-[var(--muted,#f3f4f6)]"
                                }`}
                                data-testid={`cmd-option-${item.id}`}
                              >
                                {/* Left icon & label */}
                                <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                                  <div
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                      isSelected
                                        ? "bg-white/20 text-white"
                                        : "bg-[var(--muted,#f3f4f6)] text-[var(--text-muted,#6b7280)] group-hover:text-violet-600"
                                    }`}
                                  >
                                    <CommandIcon name={item.icon} className="w-4 h-4" />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span
                                      className={`text-sm font-medium truncate ${
                                        isSelected
                                          ? "text-white"
                                          : "text-[var(--foreground,#111827)]"
                                      }`}
                                    >
                                      {item.title}
                                    </span>
                                    {item.subtitle && (
                                      <span
                                        className={`text-xs truncate ${
                                          isSelected
                                            ? "text-white/80"
                                            : "text-[var(--text-muted,#6b7280)]"
                                        }`}
                                      >
                                        {item.subtitle}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Right badge / action indicator */}
                                <div className="flex items-center gap-2 shrink-0">
                                  {group.category === "Recent" && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeRecentItem(item.id);
                                      }}
                                      aria-label={`Remove ${item.title} from recents`}
                                      tabIndex={-1}
                                      className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                                        isSelected
                                          ? "text-white/80 hover:text-white"
                                          : "text-[var(--text-muted,#9ca3af)] hover:text-red-500"
                                      }`}
                                    >
                                      <svg
                                        className="w-3.5 h-3.5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M6 18L18 6M6 6l12 12"
                                        />
                                      </svg>
                                    </button>
                                  )}
                                  {item.badge && (
                                    <kbd
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono border transition-colors ${
                                        isSelected
                                          ? "bg-white/20 border-white/30 text-white"
                                          : "bg-[var(--muted,#f3f4f6)] border-[var(--border,#e5e7eb)] text-[var(--text-muted,#6b7280)]"
                                      }`}
                                    >
                                      {item.badge}
                                    </kbd>
                                  )}
                                  <svg
                                    className={`w-4 h-4 transition-transform ${
                                      isSelected
                                        ? "opacity-100 translate-x-0.5 text-white"
                                        : "opacity-0 text-[var(--text-muted,#9ca3af)]"
                                    }`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 5l7 7-7 7"
                                    />
                                  </svg>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer / Shortcut Navigation Hints */}
                  <div className="flex items-center justify-between border-t border-[var(--border,#e5e7eb)] px-4 py-2.5 text-xs text-[var(--text-muted,#6b7280)] bg-[var(--muted,#f9fafb)]/50">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <kbd className="px-1 py-0.5 rounded text-[10px] font-mono bg-[var(--card,#ffffff)] border border-[var(--border,#e5e7eb)] shadow-xs">
                          ↑
                        </kbd>
                        <kbd className="px-1 py-0.5 rounded text-[10px] font-mono bg-[var(--card,#ffffff)] border border-[var(--border,#e5e7eb)] shadow-xs">
                          ↓
                        </kbd>
                        <span className="text-[11px] ml-1">Navigate</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--card,#ffffff)] border border-[var(--border,#e5e7eb)] shadow-xs">
                          ↵
                        </kbd>
                        <span className="text-[11px] ml-1">Select</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px]">
                      <span>⌘K / Ctrl+K</span>
                    </div>
                  </div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
export default CommandPalette;
