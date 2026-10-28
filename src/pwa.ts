// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { registerSW } from 'virtual:pwa-register';

export function registerPwa(
  onUpdateAvailable: () => void,
  onOfflineReady: () => void,
): (reloadPage?: boolean) => Promise<void> {
  return registerSW({
    onNeedRefresh: onUpdateAvailable,
    onOfflineReady,
  });
}

/** Chromium-only event; not in the standard DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallApp = () => Promise<boolean>;

/**
 * Reports when the browser allows installing the app from inside the page
 * (`install`) and when that is no longer possible (`null`).
 */
export function watchInstallPrompt(onChange: (install: InstallApp | null) => void): () => void {
  const onBeforeInstallPrompt = (event: Event): void => {
    // Keep the browser's own prompt from appearing so the menu entry can trigger it later.
    event.preventDefault();
    const prompt = event as BeforeInstallPromptEvent;
    onChange(async () => {
      onChange(null);
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      return outcome === 'accepted';
    });
  };
  const onInstalled = (): void => onChange(null);
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}
