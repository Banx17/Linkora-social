"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWalletContext } from "@/components/WalletProvider";
import { useNotificationsContext } from "@/contexts/NotificationsContext";
import type { Notification } from "@/contexts/NotificationsContext";

export type { NotificationType, Notification } from "@/contexts/NotificationsContext";

const LS_NOTIFICATIONS_KEY = "linkora:notifications:items";
const PAGE_SIZE = 10;

function loadStored(address: string): Notification[] {
  try {
    const raw = localStorage.getItem(`${LS_NOTIFICATIONS_KEY}:${address}`);
    if (!raw) return [];
    return JSON.parse(raw) as Notification[];
  } catch {
    return [];
  }
}

function persist(address: string, items: Notification[]): void {
  localStorage.setItem(`${LS_NOTIFICATIONS_KEY}:${address}`, JSON.stringify(items));
}

/**
 * Consumer over the canonical NotificationsProvider for the global unread
 * badge, while owning a local inbox feed for the connected wallet.
 *
 * Real-time notifications and WebSocket lifecycle are owned exclusively by
 * NotificationsProvider (contexts/NotificationsContext) to prevent duplicate
 * connections, redundant HTTP requests, and double-counted unread badges.
 */
export function useNotifications() {
  const { address } = useWalletContext();
  const {
    incrementUnread,
    decrementUnread,
    resetUnread,
    notifications: contextNotifications,
  } = useNotificationsContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [page, setPage] = useState(1);
  const addressRef = useRef<string | null>(null);

  useEffect(() => {
    if (!address) {
      setNotifications([]);
      return;
    }
    setNotifications(loadStored(address));
    addressRef.current = address;
  }, [address]);

  // Synchronize when the canonical NotificationsProvider receives new live events
  useEffect(() => {
    if (contextNotifications && contextNotifications.length > 0) {
      setNotifications(contextNotifications);
    }
  }, [contextNotifications]);

  const markAllRead = useCallback(() => {
    if (!addressRef.current) return;
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      persist(addressRef.current!, next);
      return next;
    });
    resetUnread();
  }, [resetUnread]);

  /**
   * Mark a single notification as read and keep the global unread counter in
   * sync. Unread state is preserved until the user explicitly reads an item
   * (or uses "Mark all read"); it is never cleared just by visiting the page.
   */
  const markRead = useCallback(
    (id: string) => {
      if (!addressRef.current) return;
      const target = notifications.find((n) => n.id === id);
      if (target?.read) return;

      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
        persist(addressRef.current!, next);
        return next;
      });
      decrementUnread();
    },
    [decrementUnread, notifications]
  );

  const loadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const visibleNotifications = notifications.slice(0, page * PAGE_SIZE);
  const hasMore = notifications.length > page * PAGE_SIZE;
  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications: visibleNotifications,
    hasMore,
    unreadCount,
    markAllRead,
    markRead,
    loadMore,
  };
}
