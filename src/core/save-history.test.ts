// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game';
import { History } from './history';
import { loadBuiltInMaps } from './builtin-layouts';
import { deleteGameSave, exportGameSave, importGameSave, loadGameSave, restoreGame, saveGame } from './save';

const maps = loadBuiltInMaps();
const map = maps[0]!;

beforeEach(async () => {
  await deleteGameSave();
  await new History().clear();
});

describe('game save and history', () => {
  it('round-trips the original XML save fields in IndexedDB', async () => {
    const game = new Game(map);
    game.generate(123456);
    const hint = game.nextHint()!;
    game.removePair(hint.tile0, hint.tile1);

    await saveGame(game);
    const saved = await loadGameSave(maps);
    expect(saved).not.toBeNull();
    expect(saved?.mapName).toBe('Turtle');
    expect(saved?.seed).toBe(123456);
    expect(saved?.move).toBe(2);
    expect(saved?.tiles).toHaveLength(144);

    const restored = new Game(map);
    restoreGame(restored, saved!);
    expect(restored.paused).toBe(true);
    expect(restored.currentMove).toBe(2);
    expect(restored.tiles.map((tile) => tile.number)).toEqual(game.tiles.map((tile) => tile.number));
    expect(restored.tiles.map((tile) => tile.visible)).toEqual(game.tiles.map((tile) => tile.visible));
  });

  it('exports and imports validated XML saves', async () => {
    const game = new Game(map);
    game.generate(123456);
    const match = game.nextHint()!;
    game.removePair(match.tile0, match.tile1);
    const xml = await exportGameSave(game).text();
    expect(xml).toContain('<game map="Turtle" seed="123456"');
    const imported = await importGameSave(xml, maps);
    expect(imported.tiles).toHaveLength(144);
    expect(await loadGameSave(maps)).toEqual(imported);
  });

  it('rejects malformed saves and mismatched layouts', async () => {
    await expect(importGameSave('<game/>', maps)).rejects.toThrow();
    expect(() => restoreGame(new Game(maps[1]!), {
      mapName: map.name,
      seed: 123,
      clock: 0,
      move: 1,
      tiles: [],
    })).toThrow(/does not match/);
  });

  it('ranks scores like the original dialog: duration, newest date, then player', async () => {
    const history = new History();
    await history.load();
    await history.add(new Date('2025-02-01T00:00:00.000Z'), 'easy', 75, 'A');
    await history.add(new Date('2025-01-01T00:00:00.000Z'), 'easy', 50, 'B');
    await history.add(new Date('2025-01-01T00:00:00.000Z'), 'easy', 50, 'A');
    await history.add(new Date('2025-03-01T00:00:00.000Z'), 'easy', 50, 'C');
    await history.add(new Date('2025-01-01T00:00:00.000Z'), 'hard', 1, 'C');
    expect(history.getRanked('easy').map(({ player, rank }) => [player, rank])).toEqual([
      ['C', 1], ['A', 2], ['B', 3], ['A', 4],
    ]);

    const loaded = new History();
    await loaded.load();
    expect(loaded.length).toBe(5);
    expect(loaded.getRanked('easy')[0]?.duration).toBe(50);
  });
});
