// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { PresentDialog } from './dom';

export interface AlertResponse {
  id: string;
  label: string;
  destructive?: boolean;
}

/** Equivalent of Adw.AlertDialog.choose (): resolves with the chosen response id. */
export function chooseAlert(
  host: HTMLElement,
  present: PresentDialog,
  heading: string,
  body: string,
  responses: readonly AlertResponse[],
  defaultResponse: string,
): Promise<string> {
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog alert-dialog';
  dialog.setAttribute('role', 'alertdialog');
  const form = document.createElement('form');
  form.method = 'dialog';
  const title = document.createElement('h2');
  title.textContent = heading;
  title.id = `alert-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', title.id);
  const text = document.createElement('p');
  text.textContent = body;
  const menu = document.createElement('menu');
  for (const response of responses) {
    const button = document.createElement('button');
    button.value = response.id;
    button.textContent = response.label;
    if (response.destructive) {
      button.classList.add('destructive');
    }
    if (response.id === defaultResponse) {
      button.autofocus = true;
    }
    menu.append(button);
  }
  form.append(title, text, menu);
  dialog.append(form);
  host.append(dialog);

  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const choice = responses.some((response) => response.id === dialog.returnValue)
        ? dialog.returnValue
        : defaultResponse;
      dialog.remove();
      resolve(choice);
    }, { once: true });
    present(dialog);
  });
}
