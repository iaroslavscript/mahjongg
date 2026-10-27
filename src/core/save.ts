// SPDX-FileCopyrightText: 2010-2026 Mahjongg Contributors
// SPDX-FileCopyrightText: 2010-2013 Robert Ancell
// SPDX-License-Identifier: GPL-3.0-or-later

import { del, get, set } from 'idb-keyval';
import { Game, type GameRestoreState, type RestoredTile } from './game';
import { Slot, type GameMap } from './map';

const SAVE_KEY = 'mahjongg-game-save';

export interface GameSave extends GameRestoreState {
  mapName: string;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll("'", '&apos;');
}

export function serializeGameSave(game: Game): string {
  if (!game.canSave) {
    throw new Error('The current game cannot be saved.');
  }

  const lines = [
    `<game map="${escapeAttribute(game.map.name)}" seed="${game.seed}" clock="${game.elapsed}" move="${game.currentMove}">`,
    '\t<tiles>',
  ];
  for (const tile of game.tiles) {
    lines.push(
      `\t\t<tile number="${tile.number}" visible="${tile.visible}" move="${tile.move}" z="${tile.slot.layer}" x="${tile.slot.x}" y="${tile.slot.y}"/>`,
    );
  }
  lines.push('\t</tiles>', '</game>', '');
  return lines.join('\n');
}

function numericAttribute(element: Element, name: string): number {
  const rawValue = element.getAttribute(name);
  if (rawValue === null || rawValue.trim() === '') {
    throw new Error(`Saved game is missing "${name}".`);
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`Saved game has an invalid "${name}" value.`);
  }
  return value;
}

function integerAttribute(element: Element, name: string, minimum: number, maximum: number): number {
  const value = numericAttribute(element, name);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Saved game has an out-of-range "${name}" value.`);
  }
  return value;
}

export function parseGameSave(xml: string, maps: readonly GameMap[]): GameSave {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) {
    throw new Error('Could not parse saved game XML.');
  }
  const root = document.documentElement;
  if (root.tagName.toLowerCase() !== 'game') {
    throw new Error('Saved game root element must be <game>.');
  }

  const mapName = root.getAttribute('map');
  if (!mapName) {
    throw new Error('Saved game is missing its layout name.');
  }
  const map = maps.find((candidate) => candidate.name === mapName);
  if (!map) {
    throw new Error(`Saved game layout "${mapName ?? ''}" is not available.`);
  }
  const seed = integerAttribute(root, 'seed', -0x80000000, 0x7fffffff);
  const clock = numericAttribute(root, 'clock');
  if (clock < 0) {
    throw new Error('Saved game clock cannot be negative.');
  }
  const move = integerAttribute(root, 'move', 1, 73);
  const tileElements = Array.from(root.getElementsByTagName('tile'));
  if (tileElements.length !== map.nSlots) {
    throw new Error('Saved game does not contain the expected number of tiles.');
  }

  const seenSlots = new Set<string>();
  const tiles: RestoredTile[] = tileElements.map((element) => {
    const slot = new Slot(
      integerAttribute(element, 'x', 0, 10000),
      integerAttribute(element, 'y', 0, 10000),
      integerAttribute(element, 'z', 0, 10000),
    );
    const key = `${slot.x},${slot.y},${slot.layer}`;
    if (seenSlots.has(key) || !map.slots.some((candidate) => candidate.equals(slot))) {
      throw new Error('Saved game contains a duplicate or invalid tile position.');
    }
    seenSlots.add(key);

    const visibleValue = element.getAttribute('visible');
    if (visibleValue !== 'true' && visibleValue !== 'false') {
      throw new Error('Saved game has an invalid tile visibility value.');
    }
    return {
      number: integerAttribute(element, 'number', -1, 143),
      visible: visibleValue === 'true',
      move: integerAttribute(element, 'move', 0, 72),
      slot,
    };
  });

  return { mapName, seed, clock, move, tiles };
}

export async function saveGame(game: Game): Promise<void> {
  await set(SAVE_KEY, serializeGameSave(game));
}

export async function loadGameSave(maps: readonly GameMap[]): Promise<GameSave | null> {
  const xml = await get<string | undefined>(SAVE_KEY);
  return xml === undefined ? null : parseGameSave(xml, maps);
}

export async function deleteGameSave(): Promise<void> {
  await del(SAVE_KEY);
}

export async function importGameSave(xml: string, maps: readonly GameMap[]): Promise<GameSave> {
  const save = parseGameSave(xml, maps);
  await set(SAVE_KEY, xml);
  return save;
}

export function exportGameSave(game: Game): Blob {
  return new Blob([serializeGameSave(game)], { type: 'application/xml' });
}

export function restoreGame(game: Game, save: GameSave): void {
  if (game.map.name !== save.mapName) {
    throw new Error(`Saved layout "${save.mapName}" does not match "${game.map.name}".`);
  }
  game.restore(save);
}
