// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { getSheetColumn, SHEET_COLUMNS, TILE_GROUPS, type TileGroup, type TileMatchRule, type TileOrderId } from '../tile-order';

const RULE_TEXT: Record<TileMatchRule, { badge: string; title: string }> = {
  identical: { badge: '=', title: 'Pairs only with an identical tile' },
  group: { badge: 'any', title: 'Any two tiles of this group pair' },
};

const DEFAULT_HELP = 'Tap a tile to highlight the tiles it pairs with.';

function matchHelp(group: TileGroup, name: string): string {
  if (group.rule === 'identical') {
    return `${name} pairs only with another ${name}.`;
  }
  return `${name} pairs with any of the ${group.name.toLowerCase()}: ${group.tiles.map((tile) => tile.name).join(', ')}.`;
}

interface TileButton {
  button: HTMLButtonElement;
  group: TileGroup;
  face: number;
  name: string;
}

/**
 * Every tile face of a tileset, grouped by suit with its matching rule. Tapping (or hovering)
 * a face highlights the faces it pairs with. Place it inside an element that sets
 * `--tileset-image` (see `tilesetImage`).
 */
export class TileGroupsView {
  readonly element: HTMLElement;
  private readonly help: HTMLElement;
  private readonly buttons: TileButton[] = [];
  private pinned: HTMLButtonElement | null = null;

  constructor(labelledBy: string) {
    this.element = document.createElement('div');
    this.element.className = 'tile-groups-view';
    this.help = document.createElement('p');
    this.help.className = 'tile-groups-help';
    this.help.setAttribute('aria-live', 'polite');
    this.help.textContent = DEFAULT_HELP;

    const groups = document.createElement('div');
    groups.className = 'tile-groups';
    groups.setAttribute('role', 'group');
    groups.setAttribute('aria-labelledby', labelledBy);
    groups.append(...TILE_GROUPS.map((group) => this.createGroup(group)));
    groups.addEventListener('pointerleave', () => this.showMatches(this.pinned));
    this.element.append(this.help, groups);
    this.setTileOrder('standard');
  }

  setTileOrder(order: TileOrderId): void {
    for (const { button, face } of this.buttons) {
      button.style.setProperty('--sprite-x', `${(getSheetColumn(face, order) * 100) / (SHEET_COLUMNS - 1)}%`);
    }
  }

  /** Clears the highlight. */
  reset(): void {
    this.pin(null);
  }

  private createGroup(group: TileGroup): HTMLElement {
    const section = document.createElement('section');
    section.className = 'tile-group';
    section.dataset.rule = group.rule;
    section.setAttribute('aria-label', `${group.name}: ${RULE_TEXT[group.rule].title.toLowerCase()}`);

    const header = document.createElement('div');
    header.className = 'tile-group-header';
    const badge = document.createElement('span');
    badge.className = 'tile-group-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = RULE_TEXT[group.rule].badge;
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = RULE_TEXT[group.rule].title;
    const subtitle = document.createElement('span');
    subtitle.textContent = `${group.name} · ${group.copies} of each`;
    text.append(title, subtitle);
    header.append(badge, text);

    const grid = document.createElement('div');
    grid.className = 'tile-grid';
    for (const tile of group.tiles) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tile-face';
      button.title = tile.name;
      button.setAttribute('aria-label', tile.name);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => this.pin(this.pinned === button ? null : button));
      button.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse') {
          this.showMatches(button);
        }
      });
      this.buttons.push({ button, group, ...tile });
      grid.append(button);
    }
    section.append(header, grid);
    return section;
  }

  private pin(button: HTMLButtonElement | null): void {
    this.pinned = button;
    for (const entry of this.buttons) {
      entry.button.setAttribute('aria-pressed', String(entry.button === button));
    }
    this.showMatches(button);
  }

  /** Highlights `active` and every tile it pairs with, dimming the rest; null clears the highlight. */
  private showMatches(active: HTMLButtonElement | null): void {
    const source = this.buttons.find((entry) => entry.button === active);
    this.element.classList.toggle('has-tile-highlight', source !== undefined);
    for (const entry of this.buttons) {
      const matches = source !== undefined &&
        (source.group.rule === 'group' ? entry.group === source.group : entry.face === source.face);
      entry.button.classList.toggle('matches', matches);
    }
    this.help.textContent = source ? matchHelp(source.group, source.name) : DEFAULT_HELP;
  }
}

/** CSS value for `--tileset-image`; `url` must stay valid while it is shown. */
export function tilesetImage(url: string): string {
  return `url("${url.replaceAll('"', '%22')}")`;
}
