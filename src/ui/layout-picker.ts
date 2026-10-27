// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { History } from '../core/history';
import type { GameMap } from '../core/map';
import { createDialog, type PresentDialog } from './dom';
import { formatScoreTime } from './scores-dialog';

export interface LayoutPickerHandlers {
  present: PresentDialog;
  /** Called with the chosen layout; the dialog stays open until a new game starts. */
  onSelect: (scoreName: string) => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Height of a map unit relative to its width, from the 64x88 tile faces of the themes. */
const UNIT_ASPECT = 88 / 64;
const LAYER_SHIFT = 0.3;

const TILE_INSET = 0.08;
const TILE_RADIUS = 0.3;

function roundedRectPath(x: number, y: number, width: number, height: number, r: number): string {
  const f = (value: number) => Number(value.toFixed(3));
  return `M${f(x + r)} ${f(y)}h${f(width - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${f(height - 2 * r)}` +
    `a${r} ${r} 0 0 1 ${-r} ${r}h${f(2 * r - width)}a${r} ${r} 0 0 1 ${-r} ${-r}v${f(2 * r - height)}` +
    `a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

/**
 * Draws a map's slots as rounded tiles. Slots are sorted by layer, so one path per layer
 * keeps the board's stacking order while keeping the SVG small.
 */
export function createLayoutThumbnail(map: GameMap): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'layout-thumbnail');
  svg.setAttribute('aria-hidden', 'true');
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const layers = new Map<number, string[]>();
  for (const slot of map.slots) {
    const x = slot.x + slot.layer * LAYER_SHIFT;
    const y = slot.y * UNIT_ASPECT - slot.layer * LAYER_SHIFT;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + 2);
    maxY = Math.max(maxY, y + 2 * UNIT_ASPECT);
    const tiles = layers.get(slot.layer) ?? [];
    tiles.push(roundedRectPath(
      x + TILE_INSET,
      y + TILE_INSET,
      2 - 2 * TILE_INSET,
      2 * UNIT_ASPECT - 2 * TILE_INSET,
      TILE_RADIUS,
    ));
    layers.set(slot.layer, tiles);
  }
  const maxLayer = Math.max(0, ...layers.keys());
  for (const [layer, tiles] of [...layers].sort(([a], [b]) => a - b)) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', tiles.join(''));
    path.setAttribute('class', 'thumb-tile');
    path.style.setProperty('--layer', String(maxLayer === 0 ? 0 : layer / maxLayer));
    svg.append(path);
  }
  if (map.slots.length === 0) {
    minX = minY = 0;
    maxX = maxY = 1;
  }
  const pad = 0.5;
  svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`);
  return svg;
}

/** Visual replacement for the original layout drop-down. */
export class LayoutPicker {
  readonly dialog: HTMLDialogElement;
  private readonly grid: HTMLElement;
  private readonly thumbnails = new WeakMap<GameMap, SVGSVGElement>();

  constructor(
    private readonly maps: readonly GameMap[],
    private readonly history: History,
    private readonly handlers: LayoutPickerHandlers,
  ) {
    const { dialog, body } = createDialog('layout-dialog', 'Choose Layout');
    this.dialog = dialog;
    dialog.classList.add('layout-dialog');
    this.grid = document.createElement('div');
    this.grid.className = 'layout-grid';
    this.grid.setAttribute('role', 'list');
    body.append(this.grid);
    this.grid.addEventListener('click', (event) => {
      const card = (event.target as Element | null)?.closest<HTMLButtonElement>('.layout-card');
      if (card?.dataset.layout) {
        event.preventDefault();
        handlers.onSelect(card.dataset.layout);
      }
    });
  }

  show(current: string): void {
    this.grid.replaceChildren(...this.maps.map((map) => this.createCard(map, map.scoreName === current)));
    this.handlers.present(this.dialog);
    this.grid.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
  }

  private createCard(map: GameMap, current: boolean): HTMLElement {
    const item = document.createElement('div');
    item.setAttribute('role', 'listitem');
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'layout-card';
    card.dataset.layout = map.scoreName;
    card.setAttribute('aria-current', String(current));
    let thumbnail = this.thumbnails.get(map);
    if (!thumbnail) {
      thumbnail = createLayoutThumbnail(map);
      this.thumbnails.set(map, thumbnail);
    }
    const name = document.createElement('strong');
    name.className = 'layout-card-name';
    name.textContent = map.name;
    const details = document.createElement('span');
    details.className = 'layout-card-details';
    const best = this.history.getRanked(map.scoreName)[0];
    details.textContent = `${map.nSlots} tiles` + (best ? ` · Best ${formatScoreTime(best.duration)}` : '') +
      (map.customLayoutId ? ' · Custom' : '');
    card.append(thumbnail, name, details);
    item.append(card);
    return item;
  }
}
