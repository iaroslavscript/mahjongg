// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import formatDocs from '../docs/tileset-format.md?raw';
import { BLANK_FACE, getSheetColumn, getTileFace, parseTileOrder, SHEET_COLUMNS, TILE_GROUPS, TILE_ORDERS } from './tile-order';

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

describe('tile orders', () => {
  it('assign every face its own sheet column', () => {
    for (const order of Object.values(TILE_ORDERS)) {
      expect([...order.columns].sort((a, b) => a - b), order.id).toEqual(range(SHEET_COLUMNS));
      expect(order.columns[BLANK_FACE], order.id).toBe(42);
    }
    expect(TILE_ORDERS.standard.columns).toEqual(range(SHEET_COLUMNS));
  });

  it('keep the original GNOME Mahjongg sprite indices (game-view.vala get_image_offset ())', () => {
    const original = (number: number): number => {
      const set = Math.floor(number / 4);
      if (number < 0 || set >= 36) return 42;
      if (set === 33) return 33 + number % 4;
      if (set === 35) return 38 + number % 4;
      if (set === 34) return 37;
      return set;
    };
    for (let number = -1; number <= 144; number++) {
      expect(getSheetColumn(getTileFace(number), 'gnome'), String(number)).toBe(original(number));
    }
  });

  it('place the white dragon next to the other dragons in the standard order', () => {
    const dragons = TILE_GROUPS.find((group) => group.name === 'Dragons')!.tiles;
    expect(dragons.map((tile) => getSheetColumn(tile.face, 'standard'))).toEqual([31, 32, 33]);
    expect(dragons.map((tile) => getSheetColumn(tile.face, 'gnome'))).toEqual([13, 14, 37]);
  });

  it('parse stored or declared order names', () => {
    expect([parseTileOrder('standard'), parseTileOrder('gnome'), parseTileOrder('GNOME'), parseTileOrder(1)])
      .toEqual(['standard', 'gnome', null, null]);
  });
});

describe('tile groups', () => {
  it('list every face once, consistent with the matching rules', () => {
    const faces = TILE_GROUPS.flatMap((group) => group.tiles.map((tile) => tile.face));
    expect(faces).toEqual(range(42));

    // Tile numbers 0..143 pair when number / 4 is equal (Tile.matches).
    const numbersByFace = new Map<number, number[]>();
    for (let number = 0; number < 144; number++) {
      const face = getTileFace(number);
      numbersByFace.set(face, [...(numbersByFace.get(face) ?? []), number]);
    }
    const matchSet = (face: number): Set<number> => new Set(numbersByFace.get(face)!.map((n) => Math.trunc(n / 4)));

    for (const group of TILE_GROUPS) {
      for (const tile of group.tiles) {
        expect(numbersByFace.get(tile.face), tile.name).toHaveLength(group.copies);
        expect(matchSet(tile.face).size, tile.name).toBe(1);
      }
      const sets = new Set(group.tiles.map((tile) => [...matchSet(tile.face)][0]));
      expect(sets.size, group.name).toBe(group.rule === 'group' ? 1 : group.tiles.length);
    }
  });

  it('match the column reference in docs/tileset-format.md', () => {
    const row = /^\| (\d+) +\| (\d+) +\| ([^|]+?) +\| ([^|]+?) +\| ([^|]+?) +\|$/gm;
    const documented = [...formatDocs.matchAll(row)].map(([, standard, gnome, name, group, pairs]) =>
      [Number(standard), Number(gnome), name, group, pairs]);
    const expected = TILE_GROUPS.flatMap((group) => group.tiles.map((tile) => {
      const first = group.tiles[0]!.face;
      const pairs = group.rule === 'identical'
        ? 'an identical tile'
        : `any ${group.name.toLowerCase().replace(/s$/, '')} (${first}–${first + group.tiles.length - 1})`;
      return [tile.face, getSheetColumn(tile.face, 'gnome'), tile.name, group.name, pairs];
    }));
    expected.push([BLANK_FACE, BLANK_FACE, 'Blank', '—', 'shown while paused']);
    expect(documented).toEqual(expected);
  });
});
