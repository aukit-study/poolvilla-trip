"use client";

import { useEffect } from "react";

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __tripInstallPrompt?: InstallPromptEvent;
  }
}

export function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      window.__tripInstallPrompt = event as InstallPromptEvent;
      window.dispatchEvent(new Event("trip-install-available"));
    };
    const onInstalled = () => {
      window.__tripInstallPrompt = undefined;
      window.dispatchEvent(new Event("trip-app-installed"));
    };
    const answerInstallQuery = () => window.dispatchEvent(new Event("trip-install-available"));
    const answerStatusQuery = () => {
      const installed = window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
      window.dispatchEvent(new CustomEvent("trip-app-status", { detail: { installed } }));
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("trip-install-query", answerInstallQuery);
    window.addEventListener("trip-status-query", answerStatusQuery);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("trip-install-query", answerInstallQuery);
      window.removeEventListener("trip-status-query", answerStatusQuery);
    };
  }, []);

  return null;
}
