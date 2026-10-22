import type { CSSProperties, HTMLAttributes } from "react";

export type SkeletonProps = HTMLAttributes<HTMLSpanElement> & {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
};

/**
 * Base placeholder block. Colours, shimmer gradient and animation are all
 * driven by the `--skeleton-*` custom properties (docs/design/tokens.css),
 * so the motion automatically pauses under `prefers-reduced-motion: reduce`.
 *
 * Pure markup only — no hooks or browser APIs — so it renders server-side
 * exactly as it does on the client (no hydration flicker).
 */
export function Skeleton({
  width,
  height,
  radius = "var(--radius-base)",
  className,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx("skeleton", className)}
      style={{ width, height, borderRadius: radius, ...style }}
      {...rest}
    />
  );
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
