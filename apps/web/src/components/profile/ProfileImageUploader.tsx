"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import "@/styles/profile-uploader.css";
import { Loader2, ImagePlus, X } from "lucide-react";
import { uploadMediaFileWithProgress } from "@/lib/api";
import { fileToDataURL, validateImageFile } from "@/lib/media";
import { cropImageToBlob } from "@/lib/cropImage";

export type ProfileImageKind = "avatar" | "cover";

export interface ProfileImageUploaderProps {
  /** Which image slot this uploader edits. Drives the aspect ratio and copy. */
  kind: ProfileImageKind;
  /** Existing (already uploaded) image URL, if any. */
  value?: string | null;
  /** Receives the uploaded image URL once the upload succeeds, or null on remove. */
  onChange: (url: string | null) => void;
  /** Server-reported upload budget in bytes. Falls back to the local 5MB cap. */
  maxUploadBytes?: number;
  /** Rendered alt text for the previews. */
  alt?: string;
  disabled?: boolean;
  className?: string;
}

const ASPECT_RATIO: Record<ProfileImageKind, number> = {
  avatar: 1,
  cover: 3,
};

const TOOL_LABEL: Record<ProfileImageKind, string> = {
  avatar: "profile photo",
  cover: "cover image",
};

const MAX_DISPLAY_HEIGHT = 420;

/** Pick a reasonable on-screen width so tall images stay inside the dialog. */
function initialImageWidth(image: HTMLImageElement): number {
  const naturalW = image.naturalWidth || image.width || 1;
  const naturalH = image.naturalHeight || image.height || 1;
  if (naturalH <= MAX_DISPLAY_HEIGHT) return naturalW;
  return Math.round((naturalW * MAX_DISPLAY_HEIGHT) / naturalH);
}

export function ProfileImageUploader({
  kind,
  value = null,
  onChange,
  maxUploadBytes,
  alt,
  disabled = false,
  className = "",
}: ProfileImageUploaderProps) {
  const aspect = ASPECT_RATIO[kind];
  const label = TOOL_LABEL[kind];
  const errorId = useId();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [source, setSource] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const generatePreview = useCallback(async (image: HTMLImageElement, pixelCrop: PixelCrop) => {
    try {
      const blob = await cropImageToBlob(image.src, pixelCrop, image.width, image.height);
      const url = URL.createObjectURL(blob);
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    } catch {
      // Preview is best-effort; the crop itself still works.
    }
  }, []);

  const resetCropState = useCallback(() => {
    setSource(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setUploadError(null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const cleanupPreview = useCallback(() => {
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }, []);

  // Revoke the last preview blob URL on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aspectFor = useCallback(() => aspect, [aspect]);

  const onImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget;
      const { width, height } = image;
      const initial = centerCrop(
        makeAspectCrop({ unit: "%", width: 100 }, aspect, width, height),
        width,
        height
      );
      setCrop(initial);
      setCompletedCrop(
        initial.unit === "%"
          ? {
              unit: "px",
              x: (initial.x / 100) * width,
              y: (initial.y / 100) * height,
              width: (initial.width / 100) * width,
              height: (initial.height / 100) * height,
            }
          : (initial as PixelCrop)
      );
      void generatePreview(image, completedCropFromCrop(initial, width, height));
    },
    [aspect, generatePreview]
  );

  const onCropChange = useCallback(
    (next: Crop, percentCrop: Crop) => {
      setCrop(percentCrop);
      const image = imageRef.current;
      if (!image) return;
      const pixel = completedCropFromCrop(next, image.width, image.height);
      setCompletedCrop(pixel);
      void generatePreview(image, pixel);
    },
    [generatePreview]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[] | null | undefined) => {
      if (!files || files.length === 0) return;
      const file = files[0];

      setValidationError(null);
      setUploadError(null);

      const budget = maxUploadBytes && maxUploadBytes > 0 ? maxUploadBytes : undefined;
      const result = validateImageFile(file, budget);
      if (!result.valid) {
        setValidationError(result.error ?? "Invalid image file.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      try {
        const dataUrl = await fileToDataURL(file);
        cleanupPreview();
        setSource(dataUrl);
      } catch {
        setValidationError("Could not read that file. Please try another image.");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [cleanupPreview, maxUploadBytes]
  );

  const openFilePicker = useCallback(() => {
    if (disabled || uploading) return;
    fileInputRef.current?.click();
  }, [disabled, uploading]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragActive(false);
      if (disabled || uploading) return;
      void handleFiles(event.dataTransfer?.files);
    },
    [disabled, handleFiles, uploading]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDropzoneKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openFilePicker();
      }
    },
    [openFilePicker]
  );

  const handleConfirm = useCallback(async () => {
    const image = imageRef.current;
    if (!source || !completedCrop || !image) return;

    setUploadError(null);
    setUploading(true);
    setProgress(0);

    try {
      const blob = await cropImageToBlob(source, completedCrop, image.width, image.height);
      const file = new File([blob], `${kind}-${Date.now()}.jpg`, {
        type: blob.type || "image/jpeg",
      });
      const { url } = await uploadMediaFileWithProgress(file, setProgress);
      onChange(url);
      resetCropState();
      cleanupPreview();
    } catch (error) {
      setUploading(false);
      setUploadError(error instanceof Error ? error.message : "Upload failed. Please try again.");
    }
  }, [cleanupPreview, completedCrop, kind, onChange, resetCropState, source]);

  const handleRemove = useCallback(() => {
    if (disabled || uploading) return;
    onChange(null);
  }, [disabled, onChange, uploading]);

  const message = validationError ?? uploadError;
  const previewSrc = previewUrl ?? source;
  const isCover = kind === "cover";
  const previewShape = isCover ? "w-full aspect-[3/1] rounded-xl" : "w-24 h-24 rounded-full";

  return (
    <div className={`space-y-3 ${className}`}>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => void handleFiles(event.target.files)}
        className="hidden"
        aria-label={`Choose a ${label} file`}
        data-testid={`${kind}-input`}
      />

      <div className="flex items-center gap-4">
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={`Upload ${label}. Drag and drop an image or press Enter to browse files.`}
          aria-describedby={message ? errorId : undefined}
          aria-disabled={disabled || uploading}
          onClick={openFilePicker}
          onKeyDown={handleDropzoneKeyDown}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative flex flex-1 cursor-pointer select-none items-center gap-3 rounded-xl border-2 border-dashed p-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
            dragActive
              ? "border-violet-500 bg-violet-50"
              : "border-[#E5E7EB] bg-white hover:border-violet-400"
          } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          data-testid={`${kind}-dropzone`}
        >
          <span
            className={`relative shrink-0 overflow-hidden border border-gray-200 bg-gray-100 ${previewShape}`}
          >
            {value || previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewSrc ?? value ?? ""}
                alt={alt ?? `${label} preview`}
                className="h-full w-full object-cover"
                data-testid={`${kind}-preview`}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-gray-400">
                <ImagePlus className="h-6 w-6" aria-hidden="true" />
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
              </span>
            )}
          </span>

          <span className="min-w-0">
            <span className="block font-medium text-gray-800">
              {dragActive ? "Drop to upload" : "Drag & drop or click to browse"}
            </span>
            <span className="block text-xs text-gray-500">
              {isCover
                ? "16:9 / 3:1 crop · JPG, PNG or WebP · max 5MB"
                : "1:1 crop · JPG, PNG or WebP · max 5MB"}
            </span>
          </span>
        </div>

        {value && !uploading && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            aria-label={`Remove ${label}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {uploading && (
        <div
          className="space-y-1"
          role="progressbar"
          aria-label={`Uploading ${label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          data-testid={`${kind}-progress`}
        >
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-violet-600 transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">{progress}% uploaded</p>
        </div>
      )}

      {message && (
        <p
          id={errorId}
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600"
          data-testid={`${kind}-error`}
        >
          {message}
        </p>
      )}

      <Dialog.Root
        open={source !== null}
        onOpenChange={(open) => {
          if (!open && !uploading) {
            resetCropState();
            cleanupPreview();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[1000] bg-slate-900/60" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[1001] max-h-[90vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-[var(--color-border,#e5e7eb)] bg-white p-6 shadow-xl"
            aria-describedby={undefined}
          >
            <Dialog.Title className="text-lg font-bold text-gray-900">Crop {label}</Dialog.Title>

            <p className="mt-1 text-sm text-gray-500">
              {isCover
                ? "Drag to reposition and resize the 3:1 selection."
                : "Drag to reposition and resize the 1:1 selection."}
            </p>

            <div className="mt-4 flex justify-center">
              {source && (
                <ReactCrop
                  crop={crop}
                  onChange={onCropChange}
                  aspect={aspectFor()}
                  keepSelection
                  className="ProfileImageUploader-crop max-h-[420px]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imageRef}
                    src={source}
                    alt={`${label} to crop`}
                    onLoad={onImageLoad}
                    style={{ maxHeight: MAX_DISPLAY_HEIGHT }}
                  />
                </ReactCrop>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={uploading}
                  className="min-h-[44px] flex-1 rounded-lg border border-[#E5E7EB] bg-white font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={uploading || !completedCrop}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid={`${kind}-confirm`}
              >
                {uploading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {uploading ? `Uploading ${progress}%` : "Save image"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/** Convert a (possibly percent-unit) crop to pixel coordinates. */
function completedCropFromCrop(crop: Crop, displayWidth: number, displayHeight: number): PixelCrop {
  if (crop.unit === "px") {
    return crop as PixelCrop;
  }
  return {
    unit: "px",
    x: (crop.x / 100) * displayWidth,
    y: (crop.y / 100) * displayHeight,
    width: (crop.width / 100) * displayWidth,
    height: (crop.height / 100) * displayHeight,
  };
}
