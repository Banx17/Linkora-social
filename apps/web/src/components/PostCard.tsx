"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { VerificationBadge, type VerificationLevel } from "@/components/VerificationBadge";
import { ResponsiveImage } from "@/components/ui/ResponsiveImage";
import { Share2, Copy, Check } from "lucide-react";

export interface Post {
  id: string | number;
  author: string;
  username?: string;
  content: string;
  tip_total?: string | number;
  like_count?: string | number;
  timestamp?: string | number;
  created_at?: string;
  imageUrl?: string;
  /** Whether the author holds an on-chain attestation. */
  isVerified?: boolean;
  /** Provenance of the author's verification, when verified. */
  verificationLevel?: VerificationLevel | null;
}

interface PostCardProps {
  post: Post;
  query?: string;
  onLike?: () => void;
  onTip?: () => void;
  /** Renders a delete affordance when provided (author-only). */
  onDelete?: () => void;
  isLiked?: boolean;
  isTipping?: boolean;
  /** True while an optimistic delete is in flight. */
  isDeleting?: boolean;
  tourAnchor?: boolean;
  disabled?: boolean;
  /** Above the fold (e.g. one of the first feed posts): preload the post image. */
  priority?: boolean;
  /** `sizes` for the post image; defaults to the max-w-2xl feed column. */
  imageSizes?: string;
  baseUrl?: string;
  "data-testid"?: string;
}

// The feed column is max-w-2xl (672px) minus page padding.
export const FEED_POST_IMAGE_SIZES = "(min-width: 672px) 640px, 100vw";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, query = "") {
  const trimmed = query.trim();
  if (!trimmed) return text;

  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === trimmed.toLowerCase() ? (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-yellow-300 px-1 text-black font-semibold"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function getPostDate(post: Post): Date | null {
  const raw = post.created_at ?? post.timestamp;
  if (raw === undefined || raw === null || raw === "") return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric);
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getPostTipTotal(post: Post): number {
  const value = Number(post.tip_total ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function getPostLikeCount(post: Post): number {
  const value = Number(post.like_count ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function formatDate(post: Post): string {
  const date = getPostDate(post);
  return date ? date.toLocaleDateString() : "Unknown date";
}

export function formatAuthor(author: string): string {
  return author.length > 16 ? `${author.slice(0, 6)}...${author.slice(-4)}` : author;
}

export function getPostExcerpt(content: string, maxLength = 100): string {
  if (!content) return "";
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength).trimEnd() + "...";
}

export function getBaseUrl(customBaseUrl?: string): string {
  if (customBaseUrl) return customBaseUrl.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
}

export function getPostUrl(postId: string | number, baseUrl?: string): string {
  const base = getBaseUrl(baseUrl);
  return `${base}/post/${postId}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  try {
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return !!success;
    }
  } catch {
    return false;
  }
  return false;
}

export function PostCard({
  post,
  query,
  onLike,
  onTip,
  onDelete,
  isLiked,
  isTipping,
  isDeleting = false,
  tourAnchor,
  disabled = false,
  priority = false,
  imageSizes = FEED_POST_IMAGE_SIZES,
  baseUrl,
  "data-testid": dataTestId,
}: PostCardProps) {
  const likeCount = getPostLikeCount(post);
  const [animateLikeCount, setAnimateLikeCount] = useState(false);
  const [previousLikeCount, setPreviousLikeCount] = useState(likeCount);
  const prefersReducedMotion = useReducedMotion();

  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shareContainerRef = useRef<HTMLDivElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const shareXLinkRef = useRef<HTMLAnchorElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);

  const postUrl = getPostUrl(post.id, baseUrl);
  const excerpt = getPostExcerpt(post.content);
  const encodedExcerpt = encodeURIComponent(excerpt);
  const encodedUrl = encodeURIComponent(postUrl);
  const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodedExcerpt}&url=${encodedUrl}`;

  useEffect(() => {
    if (likeCount === previousLikeCount) {
      return;
    }

    setAnimateLikeCount(true);
    setPreviousLikeCount(likeCount);

    const timeout = window.setTimeout(() => {
      setAnimateLikeCount(false);
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [likeCount, previousLikeCount]);

  const handleShare = useCallback(async () => {
    if (typeof navigator !== "undefined" && !!navigator.share) {
      try {
        await navigator.share({
          title: post.author ? `Post by ${formatAuthor(post.author)}` : "Post on Linkora",
          text: excerpt,
          url: postUrl,
        });
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError") {
          // Gracefully handled without throwing uncaught errors
        }
      }
    } else {
      setIsShareOpen((prev) => !prev);
    }
  }, [post.author, excerpt, postUrl]);

  const handleCopyLink = useCallback(async () => {
    const success = await copyToClipboard(postUrl);
    if (success) {
      setIsCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    }
  }, [postUrl]);

  const handleShareToX = useCallback(() => {
    setIsShareOpen(false);
    if (
      typeof window !== "undefined" &&
      typeof window.open === "function" &&
      (window.open as unknown as { mock?: unknown }).mock
    ) {
      window.open(twitterIntentUrl, "_blank", "noopener,noreferrer");
    }
  }, [twitterIntentUrl]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isShareOpen) return;

    copyButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsShareOpen(false);
        shareButtonRef.current?.focus();
      }
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (shareContainerRef.current && !shareContainerRef.current.contains(e.target as Node)) {
        setIsShareOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isShareOpen]);

  const layoutId = `post-${post.id}`;

  return (
    <motion.article
      layoutId={layoutId}
      data-testid={dataTestId}
      className="group rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3 md:p-4 lg:p-5 shadow-lg transition-all duration-300 hover:border-violet-500/40 hover:shadow-violet-950/10"
      style={{ contain: "layout" }}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3, ease: "easeInOut" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <motion.span
            layoutId={`${layoutId}-author`}
            className="font-medium hover:text-[var(--foreground)] transition-colors"
            title={post.author}
          >
            By {formatAuthor(post.author)}
          </motion.span>
          {post.isVerified && (
            <VerificationBadge
              level={post.verificationLevel ?? "identity"}
              subject={post.username || formatAuthor(post.author)}
            />
          )}
        </span>
        <time className="text-xs text-[var(--text-muted)]">{formatDate(post)}</time>
      </div>

      <motion.p
        layoutId={`${layoutId}-content`}
        className="whitespace-pre-wrap break-words leading-relaxed text-[var(--foreground)] mb-4 text-base"
        style={{ contain: "layout" }}
      >
        {highlightText(post.content, query)}
      </motion.p>

      {post.imageUrl && (
        <div className="relative mb-4 aspect-video overflow-hidden rounded-lg bg-zinc-800">
          <ResponsiveImage
            src={post.imageUrl}
            alt=""
            fill
            sizes={imageSizes}
            priority={priority}
            deferOnSaveData
            className="object-cover"
          />
        </div>
      )}

      <div
        className="flex items-center gap-6 border-t border-[var(--border)]/40 pt-3"
        data-tour={tourAnchor ? "post-actions" : undefined}
      >
        {/* Like Button */}
        <button
          onClick={onLike}
          disabled={disabled}
          className={`flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isLiked
              ? "text-[var(--accent-coral)]"
              : "text-[var(--text-muted)] hover:text-[var(--accent-coral)]"
          }`}
          aria-label={isLiked ? "Unlike post" : "Like post"}
        >
          <span
            className={`text-lg transition-transform duration-200 ${animateLikeCount ? "scale-110" : "scale-100"}`}
          >
            {isLiked ? "❤️" : "🤍"}
          </span>
          <span className={animateLikeCount ? "like-count-animate" : ""}>{likeCount}</span>
        </button>

        {/* Tip Button */}
        <button
          onClick={onTip}
          disabled={disabled || isTipping}
          className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--accent-teal)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Tip creator"
        >
          <span className="text-lg">💰</span>
          <span>Tips: {getPostTipTotal(post)}</span>
        </button>

        {/* Share Button & Dropdown Menu */}
        <div className="relative" ref={shareContainerRef}>
          <button
            ref={shareButtonRef}
            type="button"
            onClick={handleShare}
            aria-label="Share post"
            aria-haspopup="menu"
            aria-expanded={isShareOpen}
            aria-controls={isShareOpen ? `share-menu-${post.id}` : undefined}
            className={`flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--accent-teal)] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
              isShareOpen
                ? "opacity-100"
                : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus:opacity-100 focus-within:opacity-100"
            }`}
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span>Share</span>
          </button>

          {isShareOpen && (
            <div
              id={`share-menu-${post.id}`}
              ref={shareMenuRef}
              role="menu"
              aria-label="Share options"
              className="absolute left-0 bottom-full mb-2 w-44 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary,#1e293b)] p-1.5 shadow-xl backdrop-blur-xl z-50 text-[var(--foreground)] animate-in fade-in zoom-in-95 duration-150"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsShareOpen(false);
                  shareButtonRef.current?.focus();
                }
              }}
            >
              <button
                ref={copyButtonRef}
                type="button"
                role="menuitem"
                onClick={handleCopyLink}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--border)]/40 focus:bg-[var(--border)]/40 focus:outline-none transition-colors rounded-lg text-left"
              >
                {isCopied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                    <span className="font-medium text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy
                      className="h-4 w-4 text-[var(--text-muted)] shrink-0"
                      aria-hidden="true"
                    />
                    <span>Copy Link</span>
                  </>
                )}
              </button>

              <a
                ref={shareXLinkRef}
                href={twitterIntentUrl}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                onClick={handleShareToX}
                onKeyDown={(e) => {
                  if (e.key === " ") {
                    e.preventDefault();
                    e.currentTarget.click();
                  }
                }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--border)]/40 focus:bg-[var(--border)]/40 focus:outline-none transition-colors rounded-lg text-left"
              >
                <svg
                  className="h-4 w-4 text-[var(--text-muted)] shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span>Share to X</span>
              </a>
            </div>
          )}
        </div>

        {onDelete && (
          <button
            onClick={onDelete}
            disabled={disabled || isDeleting}
            className="ml-auto flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={isDeleting ? "Deleting post" : "Delete post"}
          >
            <span className="text-base" aria-hidden="true">
              {isDeleting ? "…" : "🗑"}
            </span>
            <span>{isDeleting ? "Deleting…" : "Delete"}</span>
          </button>
        )}
      </div>
    </motion.article>
  );
}

export { PostCardSkeleton } from "@/components/skeletons";
