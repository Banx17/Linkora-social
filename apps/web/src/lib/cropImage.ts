import type { PixelCrop } from "react-image-crop";

const OUTPUT_TYPE = "image/jpeg";
const OUTPUT_QUALITY = 0.92;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas produced an empty image"))),
      type,
      quality
    );
  });
}

function notEmpty(value: number | undefined, fallback: number): number {
  return value && value > 0 ? value : fallback;
}

/**
 * Render a crop selection to a square-corrected blob.
 *
 * `Crop` reports width/height in *displayed* pixels; the returned image is
 * scaled back to the source's natural resolution so the exported file keeps
 * its detail regardless of how the crop was zoomed on screen.
 */
export async function cropImageToBlob(
  imageSrc: string,
  crop: PixelCrop,
  naturalWidth: number,
  naturalHeight: number,
  mimeType = OUTPUT_TYPE,
  quality = OUTPUT_QUALITY
): Promise<Blob> {
  const image = await loadImage(imageSrc);

  const scaleX = notEmpty(image.naturalWidth, naturalWidth) / notEmpty(naturalWidth, 1);
  const scaleY = notEmpty(image.naturalHeight, naturalHeight) / notEmpty(naturalHeight, 1);

  const sourceX = Math.round(crop.x * scaleX);
  const sourceY = Math.round(crop.y * scaleY);
  const sourceWidth = Math.round(crop.width * scaleX);
  const sourceHeight = Math.round(crop.height * scaleY);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sourceWidth);
  canvas.height = Math.max(1, sourceHeight);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return toBlob(canvas, mimeType, quality);
}

/** Extracts PNG bytes embedded in a data URL, or null when it is not one. */
export function dataUrlToPngBytes(dataUrl: string): Uint8Array | null {
  const marker = ";base64,";
  const index = dataUrl.indexOf(marker);
  if (!dataUrl.startsWith("data:") || index === -1) return null;

  const binary = atob(dataUrl.slice(index + marker.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
