// SPDX-FileCopyrightText: 2025-2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Port of original/gnome-mahjongg-main/tests/test-game.vala.

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { loadBuiltInMaps } from './builtin-layouts';
import { getMapAtPosition, type GameMap } from './map';
import {
  NEXT_HINT_PAIRS,
  PLAYTHROUGH_PAIRS,
  TAIPEI_SNAPSHOT,
  TURTLE_SNAPSHOT,
} from './original-test-data';

function generateGame(map: GameMap | null = null, seed = 123456): Game {
  const game = new Game(map ?? getMapAtPosition(loadBuiltInMaps(), 0)!);
  game.generate(seed);
  return game;
}

function verifyTiles(game: Game, expectedLayout: typeof TURTLE_SNAPSHOT): void {
  expectedLayout.forEach(([number, selectable, x, y, layer], i) => {
    const tile = game.getTile(i)!;
    expect(tile.visible).toBe(true);
    expect(tile.highlighted).toBe(false);
    expect(tile.move).toBe(0);
    expect([tile.number, tile.selectable, tile.slot.x, tile.slot.y, tile.slot.layer])
      .toEqual([number, Boolean(selectable), x, y, layer]);
  });
}

describe('game (test-game.vala)', () => {
  it('/game/tile_highlighted', () => {
    const game = generateGame();
    const match = game.nextHint();
    expect(match).not.toBeNull();
    const tile = match!.tile0;

    game.setSelectedTile(tile);
    expect(tile.highlighted).toBe(true);

    game.setSelectedTile(null);
    expect(tile.highlighted).toBe(false);
  });

  it('/game/remove_invalid_pair', () => {
    const game = generateGame();
    const tileA = game.getTile(0)!;
    const tileB = game.getTile(1)!;
    game.setSelectedTile(tileA);

    expect(tileA.matches(tileB)).toBe(false);
    expect(tileA.visible).toBe(true);
    expect(tileA.highlighted).toBe(true);
    expect(tileB.visible).toBe(true);
    expect(tileB.highlighted).toBe(false);

    expect(game.removePair(tileA, tileA)).toBe(false);
    expect(tileA.visible).toBe(true);
    expect(tileA.highlighted).toBe(true);

    expect(game.removePair(tileA, tileB)).toBe(false);
    expect(tileA.visible).toBe(true);
    expect(tileA.highlighted).toBe(true);
    expect(tileB.visible).toBe(true);
    expect(tileB.highlighted).toBe(false);
  });

  it('/game/remove_valid_pair', () => {
    const game = generateGame();
    const match = game.nextHint()!;
    game.setSelectedTile(match.tile0);

    expect(match).not.toBeNull();
    expect(match.tile0.matches(match.tile1)).toBe(true);
    expect(match.tile0.visible).toBe(true);
    expect(match.tile0.highlighted).toBe(true);
    expect(match.tile1.visible).toBe(true);
    expect(match.tile1.highlighted).toBe(false);

    expect(game.removePair(match.tile0, match.tile1)).toBe(true);
    expect(match.tile0.visible).toBe(false);
    expect(match.tile0.highlighted).toBe(false);
    expect(match.tile1.visible).toBe(false);
    expect(match.tile1.highlighted).toBe(false);

    expect(game.removePair(match.tile0, match.tile1)).toBe(false);
    expect(match.tile0.visible).toBe(false);
    expect(match.tile0.highlighted).toBe(false);
    expect(match.tile1.visible).toBe(false);
    expect(match.tile1.highlighted).toBe(false);
  });

  it('/game/next_hint', () => {
    const game = generateGame();
    for (const [expected0, expected1] of NEXT_HINT_PAIRS) {
      const match = game.nextHint();
      expect(match).not.toBeNull();
      expect(match!.tile0).not.toBe(match!.tile1);
      expect(match!.tile0.visible).toBe(true);
      expect(match!.tile1.visible).toBe(true);
      expect(match!.tile0.selectable).toBe(true);
      expect(match!.tile1.selectable).toBe(true);
      expect(match!.tile0.matches(match!.tile1)).toBe(true);
      expect([match!.tile0.number, match!.tile1.number]).toEqual([expected0, expected1]);
    }
  });

  it('/game/shuffle_remaining', () => {
    const game = generateGame();
    const tileNumber = game.getTile(0)!.number;

    game.shuffleRemaining();
    expect(game.getTile(0)!.number).not.toBe(tileNumber);
  });

  it('/game/undo_redo', () => {
    const game = generateGame();

    expect(game.canUndo).toBe(false);
    expect(game.canRedo).toBe(false);

    const firstMatch = game.nextHint()!;
    game.removePair(firstMatch.tile0, firstMatch.tile1);
    const secondMatch = game.nextHint()!;
    game.removePair(secondMatch.tile0, secondMatch.tile1);

    expect(game.canUndo).toBe(true);
    expect(game.canRedo).toBe(false);
    expect([firstMatch.tile0.move, firstMatch.tile1.move]).toEqual([1, 1]);
    expect([secondMatch.tile0.move, secondMatch.tile1.move]).toEqual([2, 2]);

    game.undo();
    expect(game.canUndo).toBe(true);
    expect(game.canRedo).toBe(true);

    game.redo();
    expect(game.canUndo).toBe(true);
    expect(game.canRedo).toBe(false);

    game.undo();
    expect(game.canUndo).toBe(true);
    expect(game.canRedo).toBe(true);

    game.undo();
    expect(game.canUndo).toBe(false);
    expect(game.canRedo).toBe(true);
    expect([firstMatch.tile0.move, firstMatch.tile1.move]).toEqual([1, 1]);
    expect([secondMatch.tile0.move, secondMatch.tile1.move]).toEqual([2, 2]);

    const thirdMatch = game.nextHint()!;
    game.removePair(thirdMatch.tile0, thirdMatch.tile1);

    expect(game.canUndo).toBe(true);
    expect(game.canRedo).toBe(false);
    expect([firstMatch.tile0.move, firstMatch.tile1.move]).toEqual([0, 0]);
    expect([secondMatch.tile0.move, secondMatch.tile1.move]).toEqual([0, 0]);
    expect([thirdMatch.tile0.move, thirdMatch.tile1.move]).toEqual([1, 1]);
  });

  it('/game/undo_redo_no_moves', () => {
    const game = generateGame();

    expect(game.canUndo).toBe(false);
    expect(game.canRedo).toBe(false);

    game.undo();
    game.redo();

    expect(game.canUndo).toBe(false);
    expect(game.canRedo).toBe(false);
  });

  it('/game/pause', () => {
    const game = generateGame();

    expect(game.paused).toBe(false);
    expect(game.started).toBe(false);
    expect(game.elapsed).toBe(0);

    game.setPaused(true);
    expect(game.paused).toBe(false);
    expect(game.started).toBe(false);
    expect(game.elapsed).toBe(0);

    const match = game.nextHint()!;
    game.removePair(match.tile0, match.tile1);
    expect(game.started).toBe(true);

    const secondMatch = game.nextHint()!;
    game.setSelectedTile(secondMatch.tile0);
    expect(game.selectedTile).not.toBeNull();

    game.setPaused(true);
    expect(game.paused).toBe(true);
    expect(game.started).toBe(true);
    expect(game.selectedTile).toBeNull();

    game.setPaused(false);
    expect(game.paused).toBe(false);
    expect(game.started).toBe(true);
    expect(game.selectedTile).toBeNull();

    game.setPaused(true);
    expect(game.paused).toBe(true);
    expect(game.started).toBe(true);
    expect(game.elapsed).toBeGreaterThan(0);
    expect(game.selectedTile).toBeNull();

    game.restart();
    expect(game.paused).toBe(false);
    expect(game.started).toBe(false);
    expect(game.elapsed).toBe(0);

    while (!game.complete) {
      if (!game.canMove) {
        game.shuffleRemaining();
      }
      const nextMatch = game.nextHint()!;
      game.removePair(nextMatch.tile0, nextMatch.tile1);
      expect(game.started).toBe(true);
    }

    game.setPaused(true);
    expect(game.paused).toBe(false);
    expect(game.started).toBe(true);
    expect(game.elapsed).toBeGreaterThan(0);
  });

  it('/game/seed_reproducibility', () => {
    const game1 = generateGame();
    const game2 = generateGame();

    expect(game1.nTiles).toBe(game2.nTiles);
    for (let i = 0; i < game1.nTiles; i++) {
      const tile1 = game1.getTile(i)!;
      const tile2 = game2.getTile(i)!;
      expect(tile1.number).toBe(tile2.number);
      expect(tile1.slot.x).toBe(tile2.slot.x);
      expect(tile1.slot.y).toBe(tile2.slot.y);
      expect(tile1.slot.layer).toBe(tile2.slot.layer);
    }
  });

  it('/game/seed_difference', () => {
    const game1 = generateGame(null, 123456789);
    const game2 = generateGame(null, 987654321);

    const foundDifference = game1.tiles.some((tile1, i) => {
      const tile2 = game2.getTile(i)!;
      return tile1.number !== tile2.number ||
        tile1.slot.x !== tile2.slot.x ||
        tile1.slot.y !== tile2.slot.y ||
        tile1.slot.layer !== tile2.slot.layer;
    });
    expect(foundDifference).toBe(true);
  });

  it('/game/seed_snapshot_turtle', () => {
    verifyTiles(generateGame(), TURTLE_SNAPSHOT);
  });

  it('/game/seed_snapshot_taipei', () => {
    const maps = loadBuiltInMaps();
    expect(maps.length).toBeGreaterThanOrEqual(1);
    verifyTiles(generateGame(getMapAtPosition(maps, maps.length - 1)!), TAIPEI_SNAPSHOT);
  });

  it('/game/game_init', () => {
    const game = generateGame();

    expect(game.map).not.toBeNull();
    expect(game.nTiles).toBe(144);
    expect(game.started).toBe(false);
    expect(game.elapsed).toBe(0);
    expect(game.paused).toBe(false);
    expect(game.selectedTile).toBeNull();
    expect(game.movesLeft).toBeGreaterThan(0);
    expect(game.complete).toBe(false);
    expect(game.canMove).toBe(true);
    expect(game.canShuffle).toBe(true);
    expect(game.canUndo).toBe(false);
    expect(game.canRedo).toBe(false);
    expect(game.allTilesUnblocked).toBe(false);

    for (const tile of game.tiles) {
      expect(tile.visible).toBe(true);
      expect(tile.highlighted).toBe(false);
      expect(tile.move).toBe(0);
    }
  });

  it('/game/game_restart', () => {
    const game = generateGame();
    expect(game.movesLeft).toBe(17);

    const match = game.nextHint()!;
    game.removePair(match.tile0, match.tile1);
    expect(match.tile0.visible).toBe(false);
    expect(match.tile1.visible).toBe(false);
    expect(game.movesLeft).toBe(15);

    const secondMatch = game.nextHint()!;
    game.setSelectedTile(secondMatch.tile0);
    expect(game.selectedTile).not.toBeNull();

    game.restart();
    expect(match.tile0.visible).toBe(true);
    expect(match.tile1.visible).toBe(true);
    expect(game.tiles.every((tile) => tile.visible)).toBe(true);
    expect(game.selectedTile).toBeNull();
    expect(game.movesLeft).toBe(17);
  });

  it('/game/game_playthrough', () => {
    const game = generateGame();

    expect(game.started).toBe(false);
    expect(game.elapsed).toBe(0);

    let expectedMove = 0;
    let numMoves = 0;
    let numReshuffles = 0;

    while (!game.complete) {
      expect(game.complete).toBe(false);
      expect(game.paused).toBe(false);
      expect(numMoves).toBeLessThan(PLAYTHROUGH_PAIRS.length);

      if (!game.canMove) {
        game.shuffleRemaining();
        expectedMove = 0;
        numReshuffles++;
      }

      const match = game.nextHint()!;
      expect(match).not.toBeNull();
      expect(match.tile0.selectable && match.tile1.selectable).toBe(true);
      expect(match.tile0.visible && match.tile1.visible).toBe(true);
      expect(match.tile0).not.toBe(match.tile1);
      expect(game.inspecting).toBe(false);

      game.removePair(match.tile0, match.tile1);
      expect([match.tile0.number, match.tile1.number]).toEqual(PLAYTHROUGH_PAIRS[numMoves]);
      expect(game.started).toBe(true);

      expectedMove++;
      numMoves++;

      expect(match.tile0.selectable || match.tile1.selectable).toBe(false);
      expect(match.tile0.visible || match.tile1.visible).toBe(false);
      expect(match.tile0.move).toBe(expectedMove);
      expect(match.tile1.move).toBe(expectedMove);
      expect(game.canUndo).toBe(true);
      expect(game.canRedo).toBe(false);
    }

    expect(game.complete).toBe(true);
    expect(game.elapsed).toBeGreaterThan(0);
    expect(game.movesLeft).toBe(0);
    expect(game.nextHint()).toBeNull();
    expect(game.inspecting).toBe(true);
    expect(game.paused).toBe(false);
    expect(game.canMove).toBe(false);
    expect(game.canShuffle).toBe(false);
    expect(game.canUndo).toBe(true);
    expect(game.canRedo).toBe(false);
    expect(game.allTilesUnblocked).toBe(true);

    expect(expectedMove).toBe(16);
    expect(numMoves).toBe(72);
    expect(numReshuffles).toBe(1);
  });
});

describe('game behaviour beyond test-game.vala', () => {
  it('charges hint and shuffle penalties and blinks hints like the original', () => {
    const game = generateGame();
    const match = game.showHint()!;
    expect(game.started).toBe(true);
    expect(game.elapsed).toBeGreaterThanOrEqual(30);
    expect(game.hintBlinkCounter).toBe(5);
    expect(match.tile0.highlighted && match.tile1.highlighted).toBe(true);

    const states: boolean[] = [];
    while (game.hintTick()) {
      states.push(match.tile0.highlighted);
    }
    expect(states).toEqual([false, true, false, true, false]);
    expect(match.tile0.highlighted || match.tile1.highlighted).toBe(false);

    game.shuffleRemaining();
    expect(game.elapsed).toBeGreaterThanOrEqual(90);
  });

  it('clears an active hint when a move is made', () => {
    const game = generateGame();
    const hinted = game.showHint()!;
    const other = game.tiles.find((tile) => tile !== hinted.tile0 && tile !== hinted.tile1 &&
      tile.selectable && game.tiles.some((t) => t !== tile && t.selectable && t.matches(tile) &&
        t !== hinted.tile0 && t !== hinted.tile1))!;
    const partner = game.tiles.find((t) => t !== other && t.selectable && t.matches(other))!;
    game.removePair(other, partner);
    expect(hinted.tile0.highlighted || hinted.tile1.highlighted).toBe(false);
    expect(game.hintTick()).toBe(false);
  });

  it('keeps a stopped clock stopped after completion, as GTimer does', () => {
    const game = generateGame();
    while (!game.complete) {
      if (!game.canMove) {
        game.shuffleRemaining();
      }
      const match = game.nextHint()!;
      game.removePair(match.tile0, match.tile1);
    }
    const finished = game.elapsed;
    game.undo();
    const match = game.nextHint()!;
    game.removePair(match.tile0, match.tile1);
    expect(game.elapsed).toBe(finished);
  });

  it('autoplays one pair per step once every tile is unblocked', () => {
    const game = generateGame();
    for (const tile of game.tiles) {
      tile.above.splice(0);
      tile.left.splice(0);
      tile.right.splice(0);
    }
    expect(game.allTilesUnblocked).toBe(true);
    let steps = 0;
    while (game.autoplayStep()) {
      steps++;
    }
    expect(steps).toBe(72);
    expect(game.complete).toBe(true);
  });
});
