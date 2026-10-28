// SPDX-FileCopyrightText: 2025-2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { TileOrderId } from '../tile-order';
import { createDialog } from './dom';
import { TileGroupsView, tilesetImage } from './tile-groups';

/** Rules from data/ui/rules-dialog.ui. */
export const GAME_RULES: ReadonlyArray<{ title: string; subtitle?: string }> = [
  {
    title: 'Clear the board by matching pairs of tiles',
    subtitle: 'Most tiles pair only with an identical tile; any two flowers or any two seasons also match',
  },
  { title: 'Only uncovered tiles with a free long edge can be selected' },
  { title: 'Rounds are scored based on completion time' },
  { title: 'You can pause the game', subtitle: 'Tile faces will be hidden' },
  { title: 'You can undo or redo a move', subtitle: 'No time penalty is added' },
  { title: 'You can use hints to reveal matching tiles', subtitle: 'Adds a 30-second time penalty' },
  { title: 'You can shuffle tiles when no moves are left', subtitle: 'Adds a 60-second time penalty' },
];

export class RulesDialog {
  readonly dialog: HTMLDialogElement;
  private readonly tilesetLabel: HTMLElement;
  private readonly tiles: TileGroupsView;

  constructor() {
    const { dialog, body } = createDialog('rules-dialog', 'Game Rules');
    this.dialog = dialog;

    const list = document.createElement('ul');
    list.className = 'rule-list';
    for (const rule of GAME_RULES) {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = rule.title;
      item.append(title);
      if (rule.subtitle) {
        const subtitle = document.createElement('span');
        subtitle.textContent = rule.subtitle;
        item.append(subtitle);
      }
      list.append(item);
    }

    const tilesHeading = document.createElement('h3');
    tilesHeading.id = 'rules-tiles-title';
    tilesHeading.textContent = 'Tile groups';
    this.tilesetLabel = document.createElement('p');
    this.tilesetLabel.className = 'tile-groups-tileset';
    this.tiles = new TileGroupsView(tilesHeading.id);

    body.append(list, tilesHeading, this.tilesetLabel, this.tiles.element);
    dialog.addEventListener('close', () => this.tiles.reset());
  }

  /** Shows the faces of the active tileset; `url` must stay valid until the next call. */
  setTileset(url: string, name: string, tileOrder: TileOrderId): void {
    this.dialog.style.setProperty('--tileset-image', tilesetImage(url));
    this.tiles.setTileOrder(tileOrder);
    this.tilesetLabel.textContent = `Tileset: ${name}`;
  }
}

export const SOURCE_URL = 'https://github.com/iaroslavscript/mahjongg';
export const LICENSE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';

export interface BuildInfo {
  version: string;
  /** Full git commit hash, or '' when unknown. */
  commit: string;
  commitDirty: boolean;
}

function link(href: string, text: string): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.textContent = text;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
}

function paragraph(...parts: Array<string | Node>): HTMLParagraphElement {
  const p = document.createElement('p');
  p.append(...parts);
  return p;
}

function strong(text: string): HTMLElement {
  const element = document.createElement('strong');
  element.textContent = text;
  return element;
}

function heading(text: string): HTMLHeadingElement {
  const element = document.createElement('h3');
  element.textContent = text;
  return element;
}

/** Port credits, then the original credits from Mahjongg.about_cb (), then build and license details. */
export function createAboutDialog({ version, commit, commitDirty }: BuildInfo): HTMLDialogElement {
  const { dialog, body } = createDialog('about-dialog', 'About Mahjongg');
  const originalSections: Array<[string, string[]]> = [
    ['Developers', [
      'Francisco Bustamante', 'Max Watson', 'Heinz Hempe', 'Michael Meeks', 'Philippe Chavin',
      'Callum McKenzie', 'Robert Ancell', 'Michael Catanzaro', 'Mario Wenzel', 'Arnaud Bonatti',
      'Jeremy Bicha', 'Alberto Ruiz', 'Günther Wagner', 'Mathias Bonn', 'K Davis', 'François Godin',
    ]],
    ['Artists', [
      'Jonathan Buzzard', 'Jaye Evins', 'Richard Hoelscher', 'Gonzalo Odiard', 'Max Watson',
      'Jakub Steiner', 'Rossano Rossi', 'Tobias Bernard',
    ]],
    ['Documenters', ['Tiffany Antopolski', 'Chris Beiser', 'Andre Klapper']],
    ['Layouts by', ['Rexford Newbould', 'Krzysztof Foltman', 'Sapphire Becker']],
  ];

  const credit = paragraph(
    'Web port of GNOME Mahjongg by ', strong('Iaroslav Akimov'),
    ', co-authored with ', strong('Claude Opus 5.5'), '.',
  );
  credit.className = 'about-credit';
  body.append(
    credit,
    paragraph('A disassembly game: clear the board by matching pairs of tiles.'),
    heading('Original GNOME Mahjongg authors'),
  );
  for (const [title, names] of originalSections) {
    body.append(paragraph(strong(`${title}: `), names.join(', ')));
  }

  const build = commit
    ? [', built from commit ', link(`${SOURCE_URL}/tree/${commit}`, commit.slice(0, 7)),
      commitDirty ? ' with uncommitted changes' : '']
    : [];
  body.append(
    heading('Build'),
    paragraph(`Version ${version}`, ...build, '.'),
    heading('License'),
    paragraph(
      'Copyright © 1998–2026 Mahjongg Contributors. ',
      'Copyright © 1998–2008 Free Software Foundation, Inc.',
    ),
    paragraph(
      'This program is free software, licensed under the ',
      link(LICENSE_URL, 'GNU General Public License, version 3 or later'),
      ' (GPL-3.0-or-later). It comes with absolutely no warranty.',
    ),
    paragraph('Source code: ', link(SOURCE_URL, SOURCE_URL)),
  );
  return dialog;
}
