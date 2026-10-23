/**
 * commandPaletteData.ts
 *
 * Central data registry and Fuse.js search configuration for the Command Palette (⌘K / Ctrl+K).
 * Defines all available navigation destinations, system actions, dynamic entity schemas,
 * and fuzzy-search scoring weights.
 */

import Fuse, { type IFuseOptions } from "fuse.js";

export type CommandCategory = "Recent" | "Navigation" | "Actions" | "Profiles" | "Posts";

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: CommandCategory;
  keywords?: string[];
  icon?:
    | "feed"
    | "explore"
    | "analytics"
    | "governance"
    | "pools"
    | "notifications"
    | "settings"
    | "profile"
    | "compose"
    | "wallet"
    | "theme"
    | "help"
    | "copy"
    | "search"
    | "clock";
  href?: string;
  actionId?:
    | "new-post"
    | "wallet"
    | "settings"
    | "toggle-theme"
    | "shortcuts-help"
    | "copy-address";
  badge?: string;
  metadata?: Record<string, unknown>;
}

export const STATIC_COMMANDS: readonly CommandItem[] = [
  // ── Actions ────────────────────────────────────────────────────────────────
  {
    id: "action-new-post",
    title: "Create New Post",
    subtitle: "Draft and broadcast a new message to the network",
    category: "Actions",
    keywords: ["compose", "post", "write", "publish", "draft", "message", "new"],
    icon: "compose",
    actionId: "new-post",
    badge: "N",
  },
  {
    id: "action-wallet",
    title: "Wallet Details / Connect",
    subtitle: "Manage Freighter wallet, view address and balances",
    category: "Actions",
    keywords: ["wallet", "stellar", "freighter", "connect", "disconnect", "balance", "xlm"],
    icon: "wallet",
    actionId: "wallet",
  },
  {
    id: "action-settings",
    title: "Open Settings",
    subtitle: "Configure notification preferences, profile, and security",
    category: "Actions",
    keywords: ["settings", "preferences", "config", "options", "account"],
    icon: "settings",
    actionId: "settings",
  },
  {
    id: "action-toggle-theme",
    title: "Toggle Theme",
    subtitle: "Switch between dark and light color modes",
    category: "Actions",
    keywords: ["theme", "dark", "light", "mode", "toggle", "appearance", "color"],
    icon: "theme",
    actionId: "toggle-theme",
  },
  {
    id: "action-shortcuts-help",
    title: "Keyboard Shortcuts",
    subtitle: "View the full cheatsheet of keyboard shortcuts",
    category: "Actions",
    keywords: ["keyboard", "shortcuts", "help", "hotkeys", "keybinds", "?"],
    icon: "help",
    actionId: "shortcuts-help",
    badge: "?",
  },
  {
    id: "action-copy-address",
    title: "Copy Wallet Address",
    subtitle: "Copy your active Stellar address to clipboard",
    category: "Actions",
    keywords: ["copy", "address", "public key", "stellar", "account"],
    icon: "copy",
    actionId: "copy-address",
  },

  // ── Navigation ─────────────────────────────────────────────────────────────
  {
    id: "nav-feed",
    title: "Feed",
    subtitle: "Your personal decentralized social timeline",
    category: "Navigation",
    keywords: ["home", "feed", "timeline", "posts", "stream"],
    icon: "feed",
    href: "/feed",
    badge: "G F",
  },
  {
    id: "nav-explore",
    title: "Explore",
    subtitle: "Discover trending topics, popular posts, and creators",
    category: "Navigation",
    keywords: ["explore", "discover", "trending", "popular", "tags", "topics"],
    icon: "explore",
    href: "/explore",
  },
  {
    id: "nav-analytics",
    title: "Analytics",
    subtitle: "View engagement statistics, reach, and performance",
    category: "Navigation",
    keywords: ["analytics", "metrics", "stats", "insights", "reach", "growth"],
    icon: "analytics",
    href: "/analytics",
  },
  {
    id: "nav-governance",
    title: "Governance",
    subtitle: "Participate in DAO proposals, voting, and protocol governance",
    category: "Navigation",
    keywords: ["governance", "dao", "vote", "proposals", "voting", "stellar"],
    icon: "governance",
    href: "/governance",
  },
  {
    id: "nav-pools",
    title: "Liquidity Pools",
    subtitle: "Explore Stellar AMM pools, deposit, and earn yield",
    category: "Navigation",
    keywords: ["pools", "liquidity", "amm", "swap", "yield", "defi", "stellar"],
    icon: "pools",
    href: "/pools",
  },
  {
    id: "nav-notifications",
    title: "Notifications",
    subtitle: "Check mentions, reactions, tips, and replies",
    category: "Navigation",
    keywords: ["notifications", "alerts", "inbox", "mentions", "activity"],
    icon: "notifications",
    href: "/notifications",
  },
  {
    id: "nav-profile",
    title: "Profile",
    subtitle: "View your user profile, followers, and posted content",
    category: "Navigation",
    keywords: ["profile", "user", "me", "account", "posts"],
    icon: "profile",
    href: "/profile",
    badge: "G P",
  },
  {
    id: "nav-settings",
    title: "Settings",
    subtitle: "App preferences, shortcuts, and account settings",
    category: "Navigation",
    keywords: ["settings", "preferences", "config", "account"],
    icon: "settings",
    href: "/settings",
    badge: "G S",
  },

  // ── Posts ──────────────────────────────────────────────────────────────────
  {
    id: "posts-search",
    title: "Search Posts",
    subtitle: "Search posts, hashtags, and discussions across the network",
    category: "Posts",
    keywords: ["posts", "search", "discussions", "feed", "hashtags"],
    icon: "search",
    href: "/search",
  },
];

export const FUSE_OPTIONS: IFuseOptions<CommandItem> = {
  keys: [
    { name: "title", weight: 0.5 },
    { name: "keywords", weight: 0.3 },
    { name: "subtitle", weight: 0.15 },
    { name: "category", weight: 0.05 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
  minMatchCharLength: 1,
};

/**
 * Initializes a Fuse index for fast in-memory search across commands.
 */
export function createCommandSearchIndex(items: CommandItem[] = [...STATIC_COMMANDS]) {
  return new Fuse(items, FUSE_OPTIONS);
}

/**
 * Creates dynamic profile suggestions formatted as CommandItems.
 */
export function formatProfileCommand(profile: {
  address: string;
  username?: string;
  displayName?: string;
}): CommandItem {
  const name = profile.displayName || profile.username || profile.address;
  const shortAddr = `${profile.address.slice(0, 4)}…${profile.address.slice(-4)}`;
  return {
    id: `profile-${profile.address}`,
    title: name,
    subtitle: profile.username ? `@${profile.username} (${shortAddr})` : shortAddr,
    category: "Profiles",
    keywords: [name, profile.username || "", profile.address, "profile", "creator"],
    icon: "profile",
    href: `/profile/${profile.address}`,
  };
}

/**
 * Creates a dynamic post search command formatted as CommandItem.
 */
export function formatPostSearchCommand(query: string): CommandItem {
  const clean = query.trim();
  return {
    id: `search-posts-${clean}`,
    title: `Search posts for "${clean}"`,
    subtitle: `Find all posts and discussions mentioning "${clean}"`,
    category: "Posts",
    keywords: ["search", "posts", clean],
    icon: "search",
    href: `/search?q=${encodeURIComponent(clean)}`,
  };
}
