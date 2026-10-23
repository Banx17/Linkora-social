"use client";

/**
 * useCommandPaletteRecents.ts
 *
 * Persists and retrieves recently used Command Palette items in localStorage.
 * Ensures hydration safety by initializing after mount and handles deduplication.
 */

import { useState, useEffect, useCallback } from "react";
import { CommandItem } from "@/lib/commandPaletteData";

const RECENT_COMMANDS_KEY = "linkora_command_palette_recent";
const MAX_RECENT_ITEMS = 6;

export function useCommandPaletteRecents(maxItems = MAX_RECENT_ITEMS) {
  const [recentItems, setRecentItems] = useState<CommandItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_COMMANDS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Normalize category to "Recent" for display
          const normalized = parsed.map((item: CommandItem) => ({
            ...item,
            category: "Recent" as const,
          }));
          setRecentItems(normalized.slice(0, maxItems));
        }
      }
    } catch (err) {
      console.error("Failed to load recent command palette items:", err);
    } finally {
      setIsLoaded(true);
    }
  }, [maxItems]);

  // Add an item to recent items
  const addRecentItem = useCallback(
    (item: CommandItem) => {
      setRecentItems((prev) => {
        // Exclude the item if it already exists, then place at front
        const filtered = prev.filter((existing) => existing.id !== item.id);
        const itemAsRecent: CommandItem = {
          ...item,
          category: "Recent",
        };
        const updated = [itemAsRecent, ...filtered].slice(0, maxItems);

        try {
          localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(updated));
        } catch (err) {
          console.error("Failed to persist recent command item:", err);
        }

        return updated;
      });
    },
    [maxItems]
  );

  // Remove a specific recent item
  const removeRecentItem = useCallback((id: string) => {
    setRecentItems((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error("Failed to update recent commands in localStorage:", err);
      }
      return updated;
    });
  }, []);

  // Clear all recent items
  const clearRecentItems = useCallback(() => {
    setRecentItems([]);
    try {
      localStorage.removeItem(RECENT_COMMANDS_KEY);
    } catch (err) {
      console.error("Failed to clear recent commands in localStorage:", err);
    }
  }, []);

  return {
    recentItems,
    isLoaded,
    addRecentItem,
    removeRecentItem,
    clearRecentItems,
  };
}
