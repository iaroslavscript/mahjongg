// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { createDialog } from './dom';

export type ShortcutAction =
  | 'new'
  | 'restart'
  | 'pause'
  | 'undo'
  | 'redo'
  | 'hint'
  | 'rules'
  | 'menu'
  | 'shortcuts';

interface ShortcutDescription {
  action: ShortcutAction;
  title: string;
  keys: string[];
}

/** Accelerators from Mahjongg.startup () and shortcuts-dialog.ui (Ctrl is Cmd on macOS). */
export const SHORTCUT_SECTIONS: ReadonlyArray<{ title: string; shortcuts: readonly ShortcutDescription[] }> = [
  {
    title: 'Game',
    shortcuts: [
      { action: 'new', title: 'New Game', keys: ['Ctrl+N'] },
      { action: 'restart', title: 'Restart Game', keys: ['Ctrl+R'] },
      { action: 'pause', title: 'Pause Game', keys: ['Esc', 'Pause', 'Ctrl+P'] },
      { action: 'undo', title: 'Undo', keys: ['Ctrl+Z'] },
      { action: 'redo', title: 'Redo', keys: ['Shift+Ctrl+Z'] },
      { action: 'hint', title: 'Show Hint', keys: ['Ctrl+H'] },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { action: 'rules', title: 'Show Game Rules', keys: ['F1'] },
      { action: 'menu', title: 'Show Main Menu', keys: ['F10'] },
      { action: 'shortcuts', title: 'Show Keyboard Shortcuts', keys: ['Ctrl+?'] },
    ],
  },
];

export function shortcutForEvent(event: KeyboardEvent): ShortcutAction | null {
  const primary = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (event.altKey) {
    return null;
  }
  if (!primary) {
    if (event.shiftKey) {
      return null;
    }
    switch (event.key) {
      case 'Escape':
      case 'Pause':
        return 'pause';
      case 'F1':
        return 'rules';
      case 'F10':
        return 'menu';
      default:
        return null;
    }
  }
  if (key === '?' || (key === '/' && event.shiftKey)) {
    return 'shortcuts';
  }
  if (key === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }
  if (event.shiftKey) {
    return null;
  }
  switch (key) {
    case 'n':
      return 'new';
    case 'r':
      return 'restart';
    case 'p':
      return 'pause';
    case 'h':
      return 'hint';
    default:
      return null;
  }
}

export function createShortcutsDialog(): HTMLDialogElement {
  const { dialog, body } = createDialog('shortcuts-dialog', 'Keyboard Shortcuts');
  for (const section of SHORTCUT_SECTIONS) {
    const heading = document.createElement('h3');
    heading.textContent = section.title;
    const list = document.createElement('dl');
    list.className = 'shortcuts-list';
    for (const shortcut of section.shortcuts) {
      const keys = document.createElement('dt');
      keys.textContent = shortcut.keys.join(' / ');
      const title = document.createElement('dd');
      title.textContent = shortcut.title;
      list.append(keys, title);
    }
    body.append(heading, list);
  }
  const boardHeading = document.createElement('h3');
  boardHeading.textContent = 'Board';
  const boardList = document.createElement('dl');
  boardList.className = 'shortcuts-list';
  for (const [keys, title] of [
    ['Arrow keys', 'Move between free tiles'],
    ['Enter / Space', 'Select the focused tile'],
  ]) {
    const dt = document.createElement('dt');
    dt.textContent = keys!;
    const dd = document.createElement('dd');
    dd.textContent = title!;
    boardList.append(dt, dd);
  }
  body.append(boardHeading, boardList);
  return dialog;
}
