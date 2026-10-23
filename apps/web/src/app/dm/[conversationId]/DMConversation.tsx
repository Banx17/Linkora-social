"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import {
  generateDmKeypair,
  encryptDirectMessage,
  decryptDirectMessage,
  base64ToBytes,
  DecryptionError,
} from "@/lib/dm/crypto";
import { hasDmKeypair, storeDmKeypair, loadDmKeypair } from "@/lib/dm/storage";
import {
  sendRelayMessage,
  fetchRelayMessages,
  connectRelayWs,
  onRelayMessage,
  sendTypingStatus,
  type RelayMessage,
} from "@/lib/dm/relay";
import { getDmKey, publishDmKey } from "@/lib/dm/contract";
import { X, Loader2 } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DecryptedMessage extends RelayMessage {
  content: string;
  decryptionFailed: boolean;
}

interface StreamedMessages {
  messages: DecryptedMessage[];
  hasMore: boolean;
  nextCursor?: string;
}

// ─── Client Component ──────────────────────────────────────────────────────────

export function DMConversation({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { address: myAddress, connected } = useWallet();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [keysReady, setKeysReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [sending, setSending] = useState(false);
  const [publishingKeys, setPublishingKeys] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipientHasKeys, setRecipientHasKeys] = useState<boolean | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  // ── Key initialisation ────────────────────────────────────────────────────

  useEffect(() => {
    if (!myAddress) return;
    setKeysReady(hasDmKeypair(myAddress));
    setLoading(false);
  }, [myAddress]);

  // Clean up typing timeout
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // ── Message decryption helper ─────────────────────────────────────────────

  const decryptMessages = useCallback(
    async (raw: RelayMessage[], recipientPubKey: Uint8Array): Promise<DecryptedMessage[]> => {
      if (!myAddress) return [];
      const keypair = await loadDmKeypair(myAddress);
      if (!keypair) return [];

      return raw.map((msg): DecryptedMessage => {
        try {
          const content = decryptDirectMessage(
            keypair.privateKey,
            recipientPubKey,
            myAddress,
            conversationId,
            base64ToBytes(msg.ciphertext_b64),
            msg.message_index
          );
          return { ...msg, content, decryptionFailed: false };
        } catch (err) {
          if (err instanceof DecryptionError) {
            return { ...msg, content: "[Message could not be decrypted]", decryptionFailed: true };
          }
          throw err;
        }
      });
    },
    [myAddress, conversationId]
  );

  // ── Load initial conversation (latest 50) ────────────────────────────────────

  const loadInitialMessages = useCallback(async () => {
    if (!myAddress || !keysReady) return;

    try {
      const recipientPubKey = await getDmKey(conversationId);
      setRecipientHasKeys(recipientPubKey !== null);

      if (!recipientPubKey) return;

      const raw = await fetchRelayMessages(myAddress, conversationId, { limit: 50 });
      const decrypted = await decryptMessages(raw, recipientPubKey);
      setMessages(decrypted);

      // Check if there are more messages
      if (raw.length >= 50) {
        setHasMore(true);
        setNextCursor(raw[raw.length - 1]?.message_index?.toString());
      } else {
        setHasMore(false);
      }
    } catch (err) {
      setError(`Failed to load messages: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [myAddress, conversationId, keysReady, decryptMessages]);

  // ── Stream older messages on scroll-up ──────────────────────────────────────

  const streamOlderMessages = useCallback(async () => {
    if (!myAddress || !keysReady || streaming || !hasMore) return;

    setStreaming(true);
    try {
      const recipientPubKey = await getDmKey(conversationId);
      if (!recipientPubKey) return;

      const raw = await fetchRelayMessages(myAddress, conversationId, {
        limit: 50,
        before: nextCursor,
      });

      if (raw.length === 0) {
        setHasMore(false);
        setStreaming(false);
        return;
      }

      const decrypted = await decryptMessages(raw, recipientPubKey);
      setMessages((prev) => [...decrypted, ...prev]);

      if (raw.length >= 50) {
        setNextCursor(raw[raw.length - 1]?.message_index?.toString());
      } else {
        setHasMore(false);
      }
    } catch (err) {
      setError(`Failed to load older messages: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setStreaming(false);
    }
  }, [myAddress, conversationId, keysReady, streaming, hasMore, nextCursor, decryptMessages]);

  // ── Intersection Observer for scroll-up streaming ──────────────────────────

  useEffect(() => {
    if (!sentinelRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !streaming) {
          streamOlderMessages();
        }
      },
      { rootMargin: "100px" }
    );

    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, streaming, streamOlderMessages]);

  // ── Real-time WebSocket connection ──────────────────────────────────────────

  useEffect(() => {
    if (keysReady && myAddress) {
      connectRelayWs(myAddress);

      const unsubscribe = onRelayMessage((payload: any) => {
        if (payload.type === "new_message" && payload.sender === conversationId) {
          loadInitialMessages();
        } else if (payload.type === "typing_status" && payload.sender === conversationId) {
          setIsTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
          }, 5000);
        }
      });

      loadInitialMessages();

      return () => unsubscribe();
    }
  }, [keysReady, myAddress, conversationId, loadInitialMessages]);

  // Auto-scroll when messages change (only for new messages at bottom)
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  useEffect(() => {
    if (!userScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, userScrolledUp]);

  // ── Key generation + publish ────────────────────────────────────────────────

  const handleEnableDMs = async () => {
    if (!myAddress) return;
    setPublishingKeys(true);
    setError(null);

    try {
      const keypair = generateDmKeypair();
      await publishDmKey(myAddress, keypair.publicKey);
      await storeDmKeypair(myAddress, keypair);
      setKeysReady(true);
      await loadInitialMessages();
    } catch (err) {
      setError(
        `Could not enable direct messages: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setPublishingKeys(false);
    }
  };

  // ── Send message ────────────────────────────────────────────────────────────

  const handleSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = newMessage.trim();
      if (!myAddress || !trimmed || sending) return;

      const keypair = await loadDmKeypair(myAddress);
      if (!keypair) return;

      setSending(true);
      setError(null);

      try {
        const recipientPubKey = await getDmKey(conversationId);
        if (!recipientPubKey) {
          throw new Error("Recipient has not enabled direct messages yet.");
        }

        const messageIndex = Date.now();
        const ciphertext = encryptDirectMessage(
          keypair.privateKey,
          recipientPubKey,
          myAddress,
          conversationId,
          trimmed,
          messageIndex
        );

        await sendRelayMessage(myAddress, conversationId, ciphertext, messageIndex);
        setNewMessage("");
        await loadInitialMessages();
      } catch (err) {
        setError(`Failed to send: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSending(false);
      }
    },
    [myAddress, newMessage, conversationId, sending, loadInitialMessages]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as React.FormEvent);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    if (!myAddress || !conversationId) return;

    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      sendTypingStatus(conversationId);
      lastTypingSentRef.current = now;
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    if (target.scrollTop === 0) {
      setUserScrolledUp(true);
    } else if (target.scrollTop + target.clientHeight >= target.scrollHeight - 50) {
      setUserScrolledUp(false);
    }
  };

  // ── Wallet not connected ──────────────────────────────────────────────────

  if (!connected || !myAddress) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <p className="text-center text-[var(--text-muted)]">
          Connect your Freighter wallet to use direct messages.
        </p>
      </div>
    );
  }

  // ── Key setup prompt ──────────────────────────────────────────────────────

  if (!loading && !keysReady) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-8 shadow-xl">
          <div className="mb-6 text-center">
            <span className="text-5xl" aria-hidden>
              🔐
            </span>
            <h2 className="mt-3 text-xl font-semibold text-[var(--foreground)]">
              Enable Direct Messages
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              Linkora DMs are end-to-end encrypted with X25519 key agreement and ChaCha20-Poly1305.
              Your encryption keys are generated in the browser and your public key is published to
              the Linkora smart contract so others can message you securely. Your private key never
              leaves your device.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-400" role="alert">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => router.back()}
              className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:border-violet-500/60 hover:text-[var(--foreground)]"
            >
              Cancel
            </button>
            <button
              onClick={handleEnableDMs}
              disabled={publishingKeys}
              className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishingKeys ? "Publishing keys…" : "Enable DMs"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main chat UI ──────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <button
          onClick={() => router.back()}
          className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
          aria-label="Go back"
        >
          ← Back
        </button>

        <div className="flex-1 overflow-hidden">
          <h1 className="truncate font-semibold text-[var(--foreground)]">Direct Message</h1>
          <p
            className="truncate font-mono text-xs text-[var(--text-muted)]"
            title={conversationId}
          >
            {conversationId.slice(0, 10)}…{conversationId.slice(-8)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-green-800/50 bg-green-900/30 px-2.5 py-1 text-xs font-medium text-green-400">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" aria-hidden />
          E2E Encrypted
        </div>
      </header>

      {/* ── Typing Indicator ──────────────────────────────────────────────── */}
      {isTyping && (
        <div className="shrink-0 bg-violet-500/10 px-4 py-1.5 text-xs font-medium italic text-violet-600 dark:text-violet-400">
          {conversationId.slice(0, 8)}… is typing…
        </div>
      )}

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div className="flex shrink-0 items-center justify-between border-b border-red-700/50 bg-red-900/20 px-4 py-2 text-sm text-red-400" role="alert">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-4 shrink-0 text-xs underline underline-offset-2"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Recipient notice (no DM keys) ────────────────────────────────── */}
      {recipientHasKeys === false && (
        <div className="shrink-0 border-b border-yellow-700/50 bg-yellow-900/20 px-4 py-2 text-sm text-yellow-400">
          This address has not published DM keys yet. Ask them to enable direct messages on Linkora
          first.
        </div>
      )}

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        onScroll={handleScroll}
        ref={sentinelRef}
      >
        {/* Sentinel for intersection observer (at top for loading older messages) */}
        <div ref={sentinelRef} style={{ height: "1px" }} aria-hidden />

        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-[var(--text-muted)]">
              <span className="text-3xl" aria-hidden>
                💬
              </span>
              <p className="mt-2 text-sm">No messages yet — say hello!</p>
            </div>
          </div>
        ) : (
          <>
            {streaming && (
              <div className="flex justify-center py-2 text-xs text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading older messages…
              </div>
            )}
            <ul className="space-y-3" aria-label="Messages" role="log" aria-live="polite">
              {messages.map((msg, idx) => {
                const isMe = msg.sender === myAddress;
                return (
                  <li
                    key={`${msg.id}-${idx}`}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={[
                        "max-w-xs rounded-2xl px-4 py-2.5 lg:max-w-md",
                        isMe
                          ? "rounded-br-sm bg-violet-600 text-white"
                          : "rounded-bl-sm border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]",
                        msg.decryptionFailed ? "opacity-50" : "",
                      ].join(" ")}
                    >
                      <p className="break-words text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>
                      <p
                        className={`mt-1 text-right text-xs ${
                          isMe ? "text-violet-200" : "text-[var(--text-muted)]"
                        }`}
                      >
                        {new Date(msg.timestamp * 1000).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div ref={messagesEndRef} aria-hidden />
      </div>

      {/* ── Input ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-[var(--border)] p-4">
        <form onSubmit={handleSend} className="flex gap-2">
          <textarea
            value={newMessage}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
            disabled={sending || !keysReady || recipientHasKeys === false}
            maxLength={500}
            rows={1}
            aria-label="Message input"
            className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--muted)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--text-muted)] transition-colors focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
            style={{ minHeight: "2.75rem", maxHeight: "8rem" }}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending || !keysReady || recipientHasKeys === false}
            aria-label="Send message"
            className="shrink-0 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "…" : "Send"}
          </button>
        </form>
        <p className="mt-1.5 text-center text-xs text-[var(--text-muted)]">
          Messages are end-to-end encrypted — only you and the recipient can read them.
        </p>
      </div>
    </div>
  );
}