// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Tile faces and the column orders of tileset sprite sheets; see docs/tileset-format.md.

/** Number of cells in each row of a sprite sheet. */
export const SHEET_COLUMNS = 43;
/** Face shown instead of the tile pictures, e.g. while the game is paused. */
export const BLANK_FACE = 42;

export type TileOrderId = 'standard' | 'gnome';

/** `identical`: a face pairs only with its own copies; `group`: any two faces of the group pair. */
export type TileMatchRule = 'identical' | 'group';

export interface TileGroup {
  name: string;
  rule: TileMatchRule;
  /** Copies of each face in a full 144-tile game. */
  copies: number;
  /** `face` is the face index, which equals the face's column in the standard order. */
  tiles: ReadonlyArray<{ face: number; name: string }>;
}

function faces(firstFace: number, names: readonly string[]): Array<{ face: number; name: string }> {
  return names.map((name, index) => ({ face: firstFace + index, name }));
}

function numbered(suit: string, firstFace: number): Array<{ face: number; name: string }> {
  return faces(firstFace, Array.from({ length: 9 }, (_, index) => `${suit} ${index + 1}`));
}

/** Every tile face, grouped by suit, in the standard order. */
export const TILE_GROUPS: readonly TileGroup[] = [
  { name: 'Dots', rule: 'identical', copies: 4, tiles: numbered('Dots', 0) },
  { name: 'Bamboo', rule: 'identical', copies: 4, tiles: numbered('Bamboo', 9) },
  { name: 'Characters', rule: 'identical', copies: 4, tiles: numbered('Characters', 18) },
  { name: 'Winds', rule: 'identical', copies: 4, tiles: faces(27, ['East Wind', 'South Wind', 'West Wind', 'North Wind']) },
  { name: 'Dragons', rule: 'identical', copies: 4, tiles: faces(31, ['Red Dragon', 'Green Dragon', 'White Dragon']) },
  { name: 'Flowers', rule: 'group', copies: 1, tiles: faces(34, ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo Flower']) },
  { name: 'Seasons', rule: 'group', copies: 1, tiles: faces(38, ['Spring', 'Summer', 'Autumn', 'Winter']) },
];

const range = (first: number, count: number): number[] => Array.from({ length: count }, (_, index) => first + index);

/** GNOME Mahjongg sheet column of every face (game-view.vala get_image_offset ()). */
const GNOME_COLUMNS: readonly number[] = [
  ...range(0, 9), // Dots
  ...range(24, 9), // Bamboo
  ...range(15, 9), // Characters
  12, 11, 10, 9, // East, South, West, North
  13, 14, 37, // Red, Green, White ("in-between the bonus tiles just to be confusing")
  35, 33, 34, 36, // Plum, Orchid, Chrysanthemum, Bamboo
  ...range(38, 4), // Seasons
  BLANK_FACE,
];

export interface TileOrder {
  id: TileOrderId;
  label: string;
  description: string;
  /** Sheet column of every face. */
  columns: readonly number[];
}

export const TILE_ORDERS: Readonly<Record<TileOrderId, TileOrder>> = {
  standard: {
    id: 'standard',
    label: 'Standard',
    description: 'Suits in order, all three dragons together',
    columns: range(0, SHEET_COLUMNS),
  },
  gnome: {
    id: 'gnome',
    label: 'GNOME Mahjongg',
    description: 'For tilesets made for GNOME Mahjongg',
    columns: GNOME_COLUMNS,
  },
};

export const DEFAULT_TILE_ORDER: TileOrderId = 'standard';

export function parseTileOrder(value: unknown): TileOrderId | null {
  return value === 'standard' || value === 'gnome' ? value : null;
}

const FACE_BY_GNOME_COLUMN = GNOME_COLUMNS.reduce<number[]>((byColumn, column, face) => {
  byColumn[column] = face;
  return byColumn;
}, []);

/** Face of a dealt tile number; numbers that share `number / 4` pair (Tile.matches). */
export function getTileFace(number: number): number {
  const set = Math.floor(number / 4);
  if (number < 0 || set >= 36) {
    return BLANK_FACE;
  }
  // Game sets follow the GNOME columns except for the bonus tiles and the white dragons.
  let column = set;
  if (set === 33) {
    column = 33 + number % 4;
  } else if (set === 34) {
    column = 37;
  } else if (set === 35) {
    column = 38 + number % 4;
  }
  return FACE_BY_GNOME_COLUMN[column]!;
}

export function getSheetColumn(face: number, order: TileOrderId): number {
  return TILE_ORDERS[order].columns[face] ?? BLANK_FACE;
}
