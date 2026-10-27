// SPDX-FileCopyrightText: 2010-2026 Mahjongg Contributors
// SPDX-FileCopyrightText: 2010-2013 Robert Ancell
// SPDX-License-Identifier: GPL-3.0-or-later

import type { LayoutDefinition } from './layout';

export class Slot {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly layer: number,
  ) {}

  equals(other: Slot): boolean {
    return this.x === other.x && this.y === other.y && this.layer === other.layer;
  }
}

export class GameMap {
  readonly slots: Slot[] = [];
  hOverhang = 0;
  vOverhang = 0;
  /** IndexedDB id of an imported layout; null for the built-in layouts. */
  customLayoutId: string | null = null;
  /** The layout definition this map was built from, used for JSON export. */
  layout: LayoutDefinition | null = null;

  constructor(
    public readonly name: string,
    public readonly scoreName: string,
  ) {}

  get nSlots(): number {
    return this.slots.length;
  }

  get width(): number {
    let x = 0;
    let layer = 0;
    for (const slot of this.slots) {
      if (slot.x >= x && slot.layer >= layer) {
        x = slot.x;
        layer = slot.layer;
      }
    }
    this.hOverhang = layer;
    return x + 2;
  }

  get height(): number {
    let y = 0;
    let layer = 0;
    for (const slot of this.slots) {
      if (slot.y > y) {
        y = slot.y;
      } else if (slot.y === 0 && slot.layer > layer) {
        layer = slot.layer;
      }
    }
    this.vOverhang = layer;
    return y + 2;
  }

  addSlot(slot: Slot): void {
    this.slots.push(slot);
    this.slots.sort(compareSlots);
  }
}

function compareSlots(a: Slot, b: Slot): number {
  const layerDifference = a.layer - b.layer;
  if (layerDifference !== 0) {
    return layerDifference;
  }

  const dx = a.x - b.x;
  const dy = a.y - b.y;
  if (dx > dy) {
    return -1;
  }
  if (dx < dy) {
    return 1;
  }
  return dx;
}

export function getMapByName(maps: readonly GameMap[], name: string): GameMap | undefined {
  return maps.find((map) => map.name === name);
}

export function getMapDisplayName(maps: readonly GameMap[], scoreName: string): string {
  return maps.find((map) => map.scoreName === scoreName)?.name ?? scoreName;
}

export function getMapAtPosition(maps: readonly GameMap[], position: number): GameMap | undefined {
  return maps[position];
}

export function getNextMap(maps: readonly GameMap[], map: GameMap): GameMap {
  if (maps.length === 0) {
    throw new RangeError('Cannot select a map from an empty map set.');
  }
  const currentIndex = maps.indexOf(map);
  const nextIndex = (Math.max(currentIndex, 0) + 1) % maps.length;
  return maps[nextIndex]!;
}

export function getRandomMap(maps: readonly GameMap[], random: { intRange(begin: number, end: number): number }): GameMap {
  if (maps.length === 0) {
    throw new RangeError('Cannot select a map from an empty map set.');
  }
  return maps[random.intRange(0, maps.length)]!;
}
