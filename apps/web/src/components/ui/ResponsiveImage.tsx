"use client";

/**
 * Data-aware wrapper around `next/image` (#1748).
 *
 *  - `quality` drops from 75 to 40 when the user has Save-Data on.
 *  - `priority` marks above-the-fold images (profile avatar/cover, the first
 *    feed posts); everything else is explicitly `loading="lazy"`.
 *  - `sizes` is required so the browser never picks a larger `srcset`
 *    candidate than the slot it renders into.
 *  - In save-data mode a blurred placeholder is shown while the image loads,
 *    and content images opted in with `deferOnSaveData` are not fetched at all
 *    until the user taps "Load image".
 */

import { useState, type CSSProperties } from "react";
import Image, { type ImageProps } from "next/image";

import { useSaveData } from "@/hooks/useSaveData";
import { BLUR_DATA_URL, canOptimizeImage, getImageQuality } from "@/lib/responsiveImage";

// next/image warns about blur placeholders on images smaller than this.
const MIN_BLUR_SIZE = 40;

export type ResponsiveImageProps = Omit<
  ImageProps,
  "quality" | "placeholder" | "blurDataURL" | "loading" | "priority" | "sizes"
> & {
  /** Rendered slot width per breakpoint, e.g. `"(min-width: 768px) 672px, 100vw"`. */
  sizes: string;
  /** Above-the-fold image: preload it instead of lazy loading. */
  priority?: boolean;
  /** In save-data mode, show a placeholder and only fetch the image on demand. */
  deferOnSaveData?: boolean;
};

function toNumber(value: number | `${number}` | undefined): number {
  return value === undefined ? 0 : Number(value);
}

export function ResponsiveImage({
  src,
  alt,
  sizes,
  priority = false,
  deferOnSaveData = false,
  unoptimized,
  className,
  style,
  ...rest
}: ResponsiveImageProps) {
  const saveData = useSaveData();
  const [revealed, setRevealed] = useState(false);

  const optimizable = typeof src === "string" ? canOptimizeImage(src) : true;
  const blurEligible =
    rest.fill === true ||
    (toNumber(rest.width) >= MIN_BLUR_SIZE && toNumber(rest.height) >= MIN_BLUR_SIZE);

  if (saveData && deferOnSaveData && !revealed) {
    const placeholderStyle: CSSProperties = {
      backgroundImage: `url("${BLUR_DATA_URL}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      ...(rest.fill
        ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
        : { width: toNumber(rest.width) || undefined, height: toNumber(rest.height) || undefined }),
    };

    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className={`flex items-center justify-center text-xs font-semibold text-white/90 ${className ?? ""}`}
        style={{ ...style, ...placeholderStyle }}
        aria-label={alt ? `Load image: ${alt}` : "Load image"}
        data-testid="save-data-placeholder"
      >
        <span className="rounded-full bg-black/50 px-3 py-1">Tap to load image</span>
      </button>
    );
  }

  return (
    <Image
      {...rest}
      src={src}
      alt={alt}
      sizes={sizes}
      className={className}
      style={style}
      quality={getImageQuality(saveData)}
      unoptimized={unoptimized ?? !optimizable}
      // `priority` and `loading` are mutually exclusive in next/image.
      priority={priority}
      fetchPriority={priority ? "high" : undefined}
      loading={priority ? undefined : "lazy"}
      placeholder={saveData && blurEligible ? "blur" : "empty"}
      blurDataURL={saveData && blurEligible ? BLUR_DATA_URL : undefined}
    />
  );
}
