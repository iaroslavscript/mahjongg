// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { loadBuiltInMaps } from '../core/builtin-layouts';
import { calculateBoardLayout, getSpriteIndex, getTileBounds, hitTestTile } from './board-view';

const map = loadBuiltInMaps()[0]!;

describe('board layout and hit testing', () => {
  it('fits the board inside desktop and phone viewports', () => {
    const desktop = calculateBoardLayout(map, 1200, 800, 5504, 352);
    const phone = calculateBoardLayout(map, 360, 740, 5504, 352);
    expect(desktop.tileWidth).toBeGreaterThan(phone.tileWidth);
    expect(desktop.renderedThemeWidth).toBe(desktop.patternWidth * 43);
    expect(phone.renderedThemeHeight).toBe(phone.patternHeight * 2);
    expect(phone.offsetX).toBeGreaterThanOrEqual(0);
    expect(phone.offsetY).toBeGreaterThanOrEqual(0);
  });

  it('uses the integer arithmetic of GameView.update_dimensions for overhangs', () => {
    const pyramid = loadBuiltInMaps().find((candidate) => candidate.scoreName === 'pyramid')!;
    // Values computed by hand from game-view.vala for a 1000x700 view and a 128x176 tile theme.
    const layout = calculateBoardLayout(pyramid, 1000, 700, 5504, 352);
    expect([pyramid.width, pyramid.height, pyramid.hOverhang, pyramid.vOverhang]).toEqual([24, 14, 4, 6]);
    expect(layout).toMatchObject({
      tileWidth: 62,
      tileHeight: 84,
      layerOffsetX: 8,
      layerOffsetY: 8,
      offsetX: 112,
      offsetY: 71,
    });
  });

  it('hit-tests visible tiles in drawing order and ignores removed tiles', () => {
    const game = new Game(map);
    game.generate(123456);
    const layout = calculateBoardLayout(map, 1000, 700, 5504, 352);
    const tile = game.tiles[0]!;
    const bounds = getTileBounds(tile, layout);
    expect(hitTestTile(game, layout, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))
      .toBe(game.tiles.filter((candidate) => {
        const candidateBounds = getTileBounds(candidate, layout);
        return candidate.visible &&
          bounds.x + bounds.width / 2 >= candidateBounds.x &&
          bounds.x + bounds.width / 2 <= candidateBounds.x + candidateBounds.width &&
          bounds.y + bounds.height / 2 >= candidateBounds.y &&
          bounds.y + bounds.height / 2 <= candidateBounds.y + candidateBounds.height;
      }).at(-1));
    tile.visible = false;
    expect(hitTestTile(game, layout, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))
      .not.toBe(tile);
  });

  it('uses the original sprite indices for GNOME tilesets and regroups the dragons in the standard order', () => {
    const indices = (order: 'gnome' | 'standard') => [-1, 0, 132, 136, 140].map((number) => getSpriteIndex(number, order));
    expect(indices('gnome')).toEqual([42, 0, 33, 37, 38]);
    expect(indices('standard')).toEqual([42, 0, 35, 33, 38]);
  });
});
