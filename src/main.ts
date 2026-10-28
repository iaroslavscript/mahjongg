// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import './style.css';
import { registerPwa, watchInstallPrompt } from './pwa';
import { AppShell } from './ui/app-shell';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root element was not found.');
}

const shell = new AppShell(app);
shell.setUpdateHandler(registerPwa(
  () => shell.notifyUpdateAvailable(),
  () => shell.notifyOfflineReady(),
));
watchInstallPrompt((install) => shell.setInstallHandler(install));
void shell.start().catch((error: unknown) => {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.className = 'fatal-error';
  message.textContent = error instanceof Error ? error.message : String(error);
  app.replaceChildren(message);
});
