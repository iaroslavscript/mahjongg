// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { icon } from './icons';

export type PresentDialog = (dialog: HTMLDialogElement) => void;

export function element<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) {
    throw new Error(`Required interface element "${selector}" was not found.`);
  }
  return found;
}

export function makeOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

export function makeButton(label: string, action?: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (action) {
    button.dataset.action = action;
  }
  return button;
}

/** Creates a modal dialog with a heading and a close button; content goes into `body`. */
export function createDialog(id: string, title: string): { dialog: HTMLDialogElement; body: HTMLFormElement; heading: HTMLHeadingElement } {
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'app-dialog';
  dialog.setAttribute('aria-labelledby', `${id}-title`);

  const body = document.createElement('form');
  body.method = 'dialog';
  const header = document.createElement('header');
  const heading = document.createElement('h2');
  heading.id = `${id}-title`;
  heading.textContent = title;
  const close = document.createElement('button');
  close.className = 'close-button icon-button';
  close.value = 'close';
  close.formNoValidate = true;
  close.setAttribute('aria-label', 'Close');
  close.title = 'Close';
  close.innerHTML = icon('x');
  header.append(heading, close);
  body.append(header);
  dialog.append(body);
  return { dialog, body, heading };
}

export function downloadFile(contents: string | Blob, fileName: string, type: string): void {
  const blob = contents instanceof Blob ? contents : new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface FilePickerWindow {
  showOpenFilePicker?: (options: {
    types: Array<{ description: string; accept: Record<string, string[]> }>;
    excludeAcceptAllOption: boolean;
    multiple: boolean;
  }) => Promise<Array<{ getFile(): Promise<File> }>>;
}

/**
 * Opens a file with the File System Access API where available, falling back to the
 * given `<input type="file">` (whose own change handler then receives the file).
 * Resolves with the picked file, or null if the fallback input was used or the user cancelled.
 */
export async function pickFile(
  fallbackInput: HTMLInputElement,
  description: string,
  accept: Record<string, string[]>,
): Promise<File | null> {
  const picker = (window as FilePickerWindow).showOpenFilePicker;
  if (!picker) {
    fallbackInput.click();
    return null;
  }
  try {
    const [handle] = await picker({ types: [{ description, accept }], excludeAcceptAllOption: true, multiple: false });
    return handle ? await handle.getFile() : null;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    throw error;
  }
}
