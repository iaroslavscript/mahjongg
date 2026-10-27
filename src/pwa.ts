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
