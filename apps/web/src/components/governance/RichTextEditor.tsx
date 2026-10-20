"use client";

import { useRef } from "react";

interface RichTextEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
}

/**
 * Lightweight Markdown editor. Formatting is inserted as portable Markdown so
 * the saved proposal description stays a plain string in contract metadata and
 * is rendered safely by `ProposalDescription`.
 */
export function RichTextEditor({
  id,
  value,
  onChange,
  maxLength = 1000,
  placeholder,
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function replaceSelection(prefix: string, suffix = prefix, fallback = "text") {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    onChange(next);

    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursorStart = start + prefix.length;
      textarea.setSelectionRange(cursorStart, cursorStart + selected.length);
    });
  }

  function prefixLines(prefix: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", end);
    const sliceEnd = lineEnd === -1 ? value.length : lineEnd;
    const selectedBlock = value.slice(lineStart, sliceEnd) || "List item";
    const nextBlock = selectedBlock
      .split("\n")
      .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
      .join("\n");
    const next = `${value.slice(0, lineStart)}${nextBlock}${value.slice(sliceEnd)}`;
    onChange(next);

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart, lineStart + nextBlock.length);
    });
  }

  function insertLink() {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const label = value.slice(start, end) || "link text";
    const markdown = `[${label}](https://)`;
    onChange(`${value.slice(0, start)}${markdown}${value.slice(end)}`);

    window.requestAnimationFrame(() => {
      textarea?.focus();
      const urlStart = start + label.length + 3;
      textarea?.setSelectionRange(urlStart, urlStart + "https://".length);
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)] focus-within:ring-2 focus-within:ring-violet-500/50">
      <div
        role="toolbar"
        aria-label="Description formatting"
        aria-controls={id}
        className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] bg-[var(--muted)]/40 px-2 py-1.5"
      >
        <button
          type="button"
          onClick={() => replaceSelection("**")}
          aria-label="Bold"
          className="min-h-9 rounded px-2 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => replaceSelection("*")}
          aria-label="Italic"
          className="min-h-9 rounded px-2 text-sm italic text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => prefixLines("- ")}
          aria-label="Bulleted list"
          className="min-h-9 rounded px-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          • List
        </button>
        <button
          type="button"
          onClick={insertLink}
          aria-label="Insert link"
          className="min-h-9 rounded px-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          Link
        </button>
      </div>
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        rows={8}
        placeholder={placeholder}
        aria-describedby={`${id}-hint`}
        className="block w-full resize-y bg-transparent px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--text-muted)]"
      />
      <p
        id={`${id}-hint`}
        className="border-t border-[var(--border)] px-3 py-1.5 text-right text-xs text-[var(--text-muted)]"
      >
        {value.length}/{maxLength} characters · Markdown supported
      </p>
    </div>
  );
}
