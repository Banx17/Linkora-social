"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

interface InstallPromptContextType {
  promptEvent: BeforeInstallPromptEvent | null;
  isInstallable: boolean;
  dismissed: boolean;
  interactionCount: number;
  showPrompt: boolean;
  handleUserInteraction: () => void;
  dismissPrompt: () => void;
  acceptPrompt: () => Promise<void>;
}

const InstallPromptContext = createContext<InstallPromptContextType | null>(null);

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPromptProvider({ children }: { children: ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [interactionCount, setInteractionCount] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);

  const isInstallable = !!promptEvent && !dismissed && interactionCount >= 2;

  // Listen for beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setPromptEvent(null);
      setShowPrompt(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Check if already dismissed (stored for 7 days)
    const dismissedUntil = localStorage.getItem("linkora-install-dismissed-until");
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
      setDismissed(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Update showPrompt when conditions change
  useEffect(() => {
    setShowPrompt(!!promptEvent && !dismissed && interactionCount >= 2);
  }, [promptEvent, dismissed, interactionCount]);

  const handleUserInteraction = useCallback(() => {
    setInteractionCount((prev) => {
      const next = prev + 1;
      return next;
    });
  }, []);

  const dismissPrompt = useCallback(() => {
    setDismissed(true);
    setShowPrompt(false);
    // Store dismissal for 7 days
    localStorage.setItem("linkora-install-dismissed-until", String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  }, []);

  const acceptPrompt = useCallback(async () => {
    if (!promptEvent) return;
    
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    
    if (outcome === "accepted") {
      setPromptEvent(null);
      setShowPrompt(false);
    } else {
      // User dismissed the native prompt, don't show our banner again for 7 days
      dismissPrompt();
    }
  }, [promptEvent, dismissPrompt]);

  return (
    <InstallPromptContext.Provider
      value={{
        promptEvent,
        isInstallable,
        dismissed,
        interactionCount,
        showPrompt,
        handleUserInteraction,
        dismissPrompt,
        acceptPrompt,
      }}
    >
      {children}
    </InstallPromptContext.Provider>
  );
}

export function useInstallPrompt() {
  const context = useContext(InstallPromptContext);
  if (!context) {
    throw new Error("useInstallPrompt must be used within an InstallPromptProvider");
  }
  return context;
}