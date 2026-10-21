"use client";

import { useInstallPrompt } from "@/contexts/InstallPromptContext";
import { X } from "lucide-react";

export function InstallPromptBanner() {
  const { showPrompt, dismissPrompt, acceptPrompt, isInstallable } = useInstallPrompt();

  if (!showPrompt || !isInstallable) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:bottom-4 md:w-96 z-50 animate-slide-up"
      role="dialog"
      aria-label="Install Linkora"
      aria-describedby="install-prompt-description"
    >
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-4 shadow-2xl flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center text-white font-bold text-lg">
            🔗
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[var(--foreground)]">Install Linkora</h3>
            <p id="install-prompt-description" className="text-sm text-[var(--text-muted)]">
              Add Linkora to your home screen for faster access and offline support.
            </p>
          </div>
          <button
            onClick={dismissPrompt}
            className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors p-1 rounded-lg hover:bg-[var(--accent)]/10"
            aria-label="Dismiss install prompt"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={acceptPrompt}
            className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
          >
            Install
          </button>
          <button
            onClick={dismissPrompt}
            className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:border-violet-500/60 hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
          >
            Not Now
          </button>
        </div>
      </div>
      <style jsx>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
      `}</style>
    </div>
  );
}