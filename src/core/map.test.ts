// SPDX-FileCopyrightText: 2025-2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Port of original/gnome-mahjongg-main/tests/test-map.vala.

import { describe, expect, it } from 'vitest';
import originalMapXml from '../../original/gnome-mahjongg-main/data/maps/mahjongg.map?raw';
import { loadBuiltInMaps } from './builtin-layouts';
import {
  getMapAtPosition,
  getMapByName,
  getMapDisplayName,
  getNextMap,
  Slot,
  type GameMap,
} from './map';
import { parseXmlMaps } from './map-xml';
import { ORIGINAL_MAPS, type OriginalMapExpectation } from './original-test-data';

function verifySlots(map: GameMap, expected: OriginalMapExpectation['slots']): void {
  expect(map.nSlots).toBe(144);
  expect(map.slots.map(({ x, y, layer }) => [x, y, layer])).toEqual(expected);
}

describe('map (test-map.vala)', () => {
  it('/map/slot', () => {
    const x = 1;
    const y = 2;
    const layer = 3;
    const slotA = new Slot(x, y, layer);
    const slotB = new Slot(x, y, layer);
    const slotC = new Slot(x + 1, y, layer);

    expect(slotA.x).toBe(x);
    expect(slotA.y).toBe(y);
    expect(slotA.layer).toBe(layer);
    expect(slotA.equals(slotB)).toBe(true);
    expect(slotB.equals(slotC)).toBe(false);
  });

  it('/map/load_maps', () => {
    const maps = loadBuiltInMaps();
    expect(maps).toHaveLength(10);

    const scoreName = 'easy';
    const displayName = getMapDisplayName(maps, scoreName);
    let map = getMapByName(maps, displayName)!;
    const firstMap = map;
    expect(displayName).toBe('Turtle');

    for (const [index, expected] of ORIGINAL_MAPS.entries()) {
      if (index > 0) {
        map = getNextMap(maps, map);
      }
      expect(map.name).toBe(expected.name);
      expect(map.scoreName).toBe(expected.scoreName);
      expect(map.width).toBe(expected.width);
      expect(map.height).toBe(expected.height);
      expect(map.hOverhang).toBe(expected.hOverhang);
      expect(map.vOverhang).toBe(expected.vOverhang);
      verifySlots(map, expected.slots);
    }

    map = getNextMap(maps, map);
    expect(map).toBe(firstMap);
  });
});

describe('built-in JSON layouts', () => {
  it('match the original XML maps exactly', () => {
    const fromXml = parseXmlMaps(originalMapXml);
    const fromJson = loadBuiltInMaps();
    const summary = (map: GameMap) => ({
      name: map.name,
      scoreName: map.scoreName,
      width: map.width,
      height: map.height,
      hOverhang: map.hOverhang,
      vOverhang: map.vOverhang,
      slots: map.slots.map(({ x, y, layer }) => [x, y, layer]),
    });
    expect(fromJson).toHaveLength(10);
    expect(fromJson.map(summary)).toEqual(fromXml.map(summary));
  });
});

describe('map parsing edge cases', () => {
  it('resolves positions and display names like Maps', () => {
    const maps = loadBuiltInMaps();
    expect(getMapAtPosition(maps, -1)).toBeUndefined();
    expect(getMapAtPosition(maps, 10)).toBeUndefined();
    expect(getMapDisplayName(maps, 'unknown')).toBe('unknown');
  });

  it('rejects malformed XML and filters maps that violate the original tile count rules', () => {
    expect(() => parseXmlMaps('<mahjongg><map></mahjongg>')).toThrow(/Could not parse map XML/);
    expect(parseXmlMaps('<mahjongg><map name="invalid"><tile x="0" y="0"/></map></mahjongg>')).toEqual([]);
  });
});
