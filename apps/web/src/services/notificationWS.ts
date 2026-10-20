/**
 * WebSocket service for real-time notifications from the Linkora Indexer (#1725).
 *
 * Connects to the indexer WebSocket gateway, manages subscription state,
 * handles exponential backoff reconnections, and triggers callbacks/toasts
 * for incoming real-time notifications (e.g. tips above a threshold).
 */

import { INDEXER_URL } from "@/config";
import type { Notification } from "@/contexts/NotificationsContext";

export interface TipToastEvent {
  id: string;
  tipper: string;
  amountXlm: number;
  postId?: string;
  excerpt?: string;
  timestamp: string;
}

export type NotificationWSListener = (notification: Notification) => void;
export type TipToastListener = (event: TipToastEvent) => void;
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";
export type StatusChangeListener = (status: ConnectionStatus) => void;

export interface NotificationWSOptions {
  url?: string;
  address?: string | null;
  tipThresholdXlm?: number;
  maxReconnectAttempts?: number;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

const DEFAULT_INDEXER_WS_URL = (INDEXER_URL || "http://localhost:3001").replace(/^http/, "ws") + "/ws";
const DEFAULT_TIP_THRESHOLD_XLM = 10;
const DEFAULT_MAX_DELAY_MS = 30000;
const DEFAULT_BASE_DELAY_MS = 1000;

function stroopsToXlm(stroops: string | number): number {
  const n = typeof stroops === "string" ? parseInt(stroops, 10) : stroops;
  return isNaN(n) ? 0 : n / 10_000_000;
}

export class NotificationWSService {
  private ws: WebSocket | null = null;
  private url: string;
  private address: string | null = null;
  private tipThresholdXlm: number;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;
  private status: ConnectionStatus = "disconnected";

  private notificationListeners = new Set<NotificationWSListener>();
  private tipToastListeners = new Set<TipToastListener>();
  private statusListeners = new Set<StatusChangeListener>();

  constructor(options: NotificationWSOptions = {}) {
    this.url = options.url || DEFAULT_INDEXER_WS_URL;
    this.address = options.address || null;
    this.tipThresholdXlm = options.tipThresholdXlm ?? DEFAULT_TIP_THRESHOLD_XLM;
  }

  public setAddress(address: string | null): void {
    if (this.address === address) return;
    this.address = address;
    if (this.status === "connected") {
      this.resubscribe();
    }
  }

  public setTipThreshold(thresholdXlm: number): void {
    this.tipThresholdXlm = Math.max(0, thresholdXlm);
  }

  public getTipThreshold(): number {
    return this.tipThresholdXlm;
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public onNotification(listener: NotificationWSListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  public onTipToast(listener: TipToastListener): () => void {
    this.tipToastListeners.add(listener);
    return () => this.tipToastListeners.delete(listener);
  }

  public onStatusChange(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((fn) => {
      try {
        fn(status);
      } catch (err) {
        console.error("Error in status change listener:", err);
      }
    });
  }

  public connect(): void {
    if (this.isDisposed || this.ws) return;

    this.setConnectionStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      console.error("Failed to construct Notification WebSocket:", err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setConnectionStatus("connected");
      this.resubscribe();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data);
    };

    this.ws.onerror = (err) => {
      console.warn("Notification WebSocket warning/error:", err);
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.isDisposed) {
        this.setConnectionStatus("disconnected");
        this.scheduleReconnect();
      }
    };
  }

  private resubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(
        JSON.stringify({
          action: "subscribe",
          types: ["follow", "like", "tip", "gov_proposal_created", "gov_proposal_executed"],
          address: this.address,
        })
      );
    } catch (err) {
      console.error("Failed to send subscription packet:", err);
    }
  }

  private handleMessage(rawData: any): void {
    try {
      const parsed = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
      const { type, payload } = parsed;
      if (!payload || !payload.data) return;

      const data = payload.data;
      const timestamp = data.ledgerClosedAt ?? new Date().toISOString();
      const eventId = data.pagingToken ?? `${type}-${Date.now()}`;

      let notification: Notification | null = null;

      if (type === "follow") {
        if (!this.address || data.followee === this.address) {
          notification = {
            id: `follow:${data.follower}`,
            type: "follow",
            actor: data.follower,
            timestamp,
            read: false,
          };
        }
      } else if (type === "like") {
        if (!this.address || data.user !== this.address) {
          notification = {
            id: `like:${data.post_id}:${data.user}`,
            type: "like",
            actor: data.user,
            postId: data.post_id,
            excerpt: data.excerpt,
            timestamp,
            read: false,
          };
        }
      } else if (type === "tip") {
        if (!this.address || data.tipper !== this.address) {
          const amountXlm = stroopsToXlm(data.amount);
          notification = {
            id: data.txHash ? `tip:${data.txHash}` : eventId,
            type: "tip",
            actor: data.tipper,
            postId: data.post_id,
            amountXlm,
            excerpt: data.excerpt,
            timestamp,
            read: false,
          };

          // High-priority tip event triggering toast
          if (amountXlm >= this.tipThresholdXlm) {
            this.tipToastListeners.forEach((fn) => {
              try {
                fn({
                  id: notification!.id,
                  tipper: data.tipper,
                  amountXlm,
                  postId: data.post_id,
                  excerpt: data.excerpt,
                  timestamp,
                });
              } catch (err) {
                console.error("Error in tip toast listener:", err);
              }
            });
          }
        }
      } else if (type === "gov_proposal_created") {
        notification = {
          id: eventId,
          type: "governance",
          actor: data.proposer ?? "System",
          proposalId: data.proposal_id,
          parameter: data.parameter,
          excerpt: "A new governance proposal was created",
          timestamp,
          read: false,
        };
      } else if (type === "gov_proposal_executed") {
        notification = {
          id: eventId,
          type: "governance",
          actor: "System",
          proposalId: data.proposal_id,
          parameter: data.parameter,
          excerpt: "A governance proposal was executed",
          timestamp,
          read: false,
        };
      }

      if (notification) {
        this.notificationListeners.forEach((fn) => {
          try {
            fn(notification!);
          } catch (err) {
            console.error("Error in notification listener:", err);
          }
        });
      }
    } catch (err) {
      console.warn("Failed to parse incoming WebSocket notification:", err);
    }
  }

  private scheduleReconnect(): void {
    if (this.isDisposed || this.reconnectTimeout) return;

    // Exponential backoff with ceiling: 1s, 2s, 4s, 8s, 16s... up to 30s
    const delay = Math.min(
      DEFAULT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      DEFAULT_MAX_DELAY_MS
    );
    this.reconnectAttempts++;
    this.setConnectionStatus("reconnecting");

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  public disconnect(): void {
    this.isDisposed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.setConnectionStatus("disconnected");
  }
}

// Global default instance for convenience
let defaultService: NotificationWSService | null = null;

export function getNotificationWSService(): NotificationWSService {
  if (!defaultService) {
    defaultService = new NotificationWSService();
  }
  return defaultService;
}
