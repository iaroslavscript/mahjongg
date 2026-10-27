// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { icon, type IconName } from './icons';

interface MenuItem {
  action: string;
  label: string;
  icon: IconName;
  shortcut?: string;
}

/** Groups of the original primary menu; Save is gone because the game autosaves. */
const MENU_GROUPS: ReadonlyArray<readonly MenuItem[]> = [
  [
    { action: 'new', label: 'New Game', icon: 'square-plus', shortcut: 'Ctrl+N' },
    { action: 'restart', label: 'Restart Game', icon: 'rotate-ccw', shortcut: 'Ctrl+R' },
  ],
  [
    { action: 'scores', label: 'Scores', icon: 'trophy' },
    { action: 'preferences', label: 'Preferences', icon: 'settings' },
  ],
  [
    { action: 'import', label: 'Import Saved Game…', icon: 'upload' },
    { action: 'export', label: 'Export Saved Game', icon: 'download' },
  ],
  [
    { action: 'rules', label: 'Rules', icon: 'book-open', shortcut: 'F1' },
    { action: 'shortcuts', label: 'Keyboard Shortcuts', icon: 'keyboard', shortcut: 'Ctrl+?' },
    { action: 'about', label: 'About Mahjongg', icon: 'info' },
  ],
];

/** Hamburger menu button with a keyboard-navigable popup menu. */
export class MainMenu {
  readonly element: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly menu: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'main-menu';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'icon-button';
    this.button.dataset.action = 'menu';
    this.button.title = 'Main Menu (F10)';
    this.button.setAttribute('aria-label', 'Main Menu');
    this.button.setAttribute('aria-haspopup', 'menu');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-controls', 'main-menu-list');
    this.button.innerHTML = icon('menu');

    this.menu = document.createElement('div');
    this.menu.id = 'main-menu-list';
    this.menu.className = 'menu-popup';
    this.menu.setAttribute('role', 'menu');
    this.menu.setAttribute('aria-label', 'Main Menu');
    this.menu.hidden = true;
    MENU_GROUPS.forEach((group, index) => {
      if (index > 0) {
        const separator = document.createElement('div');
        separator.setAttribute('role', 'separator');
        this.menu.append(separator);
      }
      for (const item of group) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.dataset.action = item.action;
        button.innerHTML = `${icon(item.icon)}<span class="menu-label"></span>` +
          (item.shortcut ? `<kbd>${item.shortcut}</kbd>` : '');
        button.querySelector('.menu-label')!.textContent = item.label;
        this.menu.append(button);
      }
    });
    this.element.append(this.button, this.menu);
    this.menu.addEventListener('keydown', this.onKeyDown);
    this.menu.addEventListener('click', this.onMenuClick);
    this.menu.addEventListener('focusout', this.onFocusOut);
  }

  get isOpen(): boolean {
    return !this.menu.hidden;
  }

  item(action: string): HTMLButtonElement {
    const item = this.menu.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!item) {
      throw new Error(`Unknown menu item "${action}".`);
    }
    return item;
  }

  toggle(): void {
    if (this.isOpen) {
      this.close(true);
    } else {
      this.open();
    }
  }

  open(): void {
    this.menu.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', this.onOutsidePointer, true);
    this.items()[0]?.focus();
  }

  close(restoreFocus = false): void {
    if (!this.isOpen) {
      return;
    }
    this.menu.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this.onOutsidePointer, true);
    if (restoreFocus) {
      this.button.focus();
    }
  }

  dispose(): void {
    document.removeEventListener('pointerdown', this.onOutsidePointer, true);
  }

  private items(): HTMLButtonElement[] {
    return [...this.menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].filter((item) => !item.disabled);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const items = this.items();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = items[(index + 1) % items.length];
        break;
      case 'ArrowUp':
        next = items[(index - 1 + items.length) % items.length];
        break;
      case 'Home':
        next = items[0];
        break;
      case 'End':
        next = items.at(-1);
        break;
      case 'Escape':
      case 'F10':
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        return;
      default:
        return;
    }
    event.preventDefault();
    next?.focus();
  };

  private onMenuClick = (event: MouseEvent): void => {
    if ((event.target as Element | null)?.closest('[role="menuitem"]')) {
      this.close();
    }
  };

  private onFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    if (next && !this.element.contains(next)) {
      this.close();
    }
  };

  private onOutsidePointer = (event: PointerEvent): void => {
    if (!this.element.contains(event.target as Node)) {
      this.close();
    }
  };
}
