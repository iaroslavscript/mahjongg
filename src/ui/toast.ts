// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { icon } from './icons';

export interface ToastAction {
  label: string;
  /** `data-action` handled by the app shell's click handler. */
  action: string;
}

export interface ToastOptions {
  /** A toast with the same id replaces the previous one. */
  id?: string;
  variant?: 'info' | 'error';
  actions?: readonly ToastAction[];
  /** Milliseconds before the toast hides itself; 0 keeps it until dismissed. */
  duration?: number;
}

const INFO_DURATION_MS = 3500;
const ERROR_DURATION_MS = 8000;
const MAX_TOASTS = 3;

/** Transient notifications that replace the original status line. */
export class ToastHost {
  readonly element: HTMLElement;
  private readonly timers = new Map<HTMLElement, number>();

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'toast-region';
    this.element.setAttribute('aria-live', 'polite');
    this.element.addEventListener('click', this.onClick);
  }

  show(message: string, options: ToastOptions = {}): HTMLElement {
    const variant = options.variant ?? 'info';
    const actions = options.actions ?? [];
    if (options.id) {
      this.dismiss(options.id);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${variant}`;
    toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
    if (options.id) {
      toast.dataset.toastId = options.id;
    }
    const text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message;
    toast.append(text);
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast-action';
      button.dataset.action = action.action;
      button.textContent = action.label;
      toast.append(button);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close icon-button';
    close.setAttribute('aria-label', 'Dismiss');
    close.innerHTML = icon('x');
    toast.append(close);

    this.element.append(toast);
    while (this.element.children.length > MAX_TOASTS) {
      this.remove(this.element.firstElementChild as HTMLElement);
    }
    const duration = options.duration ??
      (actions.length > 0 ? 0 : variant === 'error' ? ERROR_DURATION_MS : INFO_DURATION_MS);
    if (duration > 0) {
      this.timers.set(toast, window.setTimeout(() => this.remove(toast), duration));
    }
    return toast;
  }

  dismiss(id: string): void {
    for (const toast of this.element.querySelectorAll<HTMLElement>('.toast')) {
      if (toast.dataset.toastId === id) {
        this.remove(toast);
      }
    }
  }

  has(id: string): boolean {
    return [...this.element.querySelectorAll<HTMLElement>('.toast')].some((toast) => toast.dataset.toastId === id);
  }

  private remove(toast: HTMLElement): void {
    window.clearTimeout(this.timers.get(toast));
    this.timers.delete(toast);
    toast.remove();
  }

  private onClick = (event: MouseEvent): void => {
    const button = (event.target as Element | null)?.closest('button');
    const toast = button?.closest<HTMLElement>('.toast');
    if (button && toast) {
      this.remove(toast);
    }
  };
}
