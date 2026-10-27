// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { loadBuiltInMaps } from './builtin-layouts';

interface ReferenceBoard {
  map: string;
  seed: number;
  tiles: number[][];
}

const referenceFile = process.env.MAHJONGG_REFERENCE_FILE;
if (!referenceFile) {
  it.skip('Vala board vectors run via pnpm verify:seeds', () => {});
} else {
  const references = JSON.parse(readFileSync(referenceFile, 'utf8')) as ReferenceBoard[];
  const maps = loadBuiltInMaps();

  describe('Vala board reference vectors', () => {
    it.each(references)('$map with seed $seed', ({ map: mapName, seed, tiles }) => {
      const map = maps.find((candidate) => candidate.name === mapName);
      expect(map).toBeDefined();

      const game = new Game(map!);
      game.generate(seed);
      expect(game.tiles.map((tile) => [
        tile.number,
        tile.selectable ? 1 : 0,
        tile.slot.x,
        tile.slot.y,
        tile.slot.layer,
      ])).toEqual(tiles);
    });
  });
}
