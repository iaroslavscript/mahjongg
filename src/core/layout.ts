// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// JSON (canonical) and YAML layout documents; see docs/map-format.md.

import { GameMap, Slot } from './map';

export const LAYOUT_FORMAT_VERSION = 1;
export const MAX_LAYOUT_TILES = 144;
export const MAX_COORDINATE = 100;
export const MAX_LAYER = 31;
export const MAX_LAYOUTS_PER_DOCUMENT = 50;
export const MAX_NAME_LENGTH = 80;
export const SCORE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export interface LayoutRow {
  y: number;
  left: number;
  right: number;
}

export interface LayoutColumn {
  x: number;
  top: number;
  bottom: number;
}

export interface LayoutBlock {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface LayoutTile {
  x: number;
  y: number;
}

export interface LayoutLayer {
  z: number;
  rows?: LayoutRow[];
  columns?: LayoutColumn[];
  blocks?: LayoutBlock[];
  tiles?: LayoutTile[];
}

export interface LayoutDefinition {
  name: string;
  scoreName: string;
  layers: LayoutLayer[];
}

export interface LayoutDocument {
  version: typeof LAYOUT_FORMAT_VERSION;
  layouts: LayoutDefinition[];
}

export type LayoutFileFormat = 'json' | 'yaml';

export class LayoutFormatError extends Error {
  override name = 'LayoutFormatError';
}

function fail(path: string, message: string): never {
  throw new LayoutFormatError(path ? `${path}: ${message}` : message);
}

function expectObject(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'must be an object');
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!required.includes(key) && !optional.includes(key)) {
      fail(path, `unknown property "${key}"`);
    }
  }
  for (const key of required) {
    if (!(key in record)) {
      fail(path, `missing required property "${key}"`);
    }
  }
  return record;
}

function expectArray(value: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value)) {
    fail(path, 'must be an array');
  }
  if (value.length < minimum || value.length > maximum) {
    fail(path, minimum === maximum
      ? `must contain exactly ${minimum} entries`
      : `must contain between ${minimum} and ${maximum} entries`);
  }
  return value;
}

function expectCoordinate(record: Record<string, unknown>, key: string, path: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value * 2) ||
      value < 0 || value > MAX_COORDINATE) {
    fail(`${path}.${key}`, `must be a multiple of 0.5 between 0 and ${MAX_COORDINATE}`);
  }
  return value;
}

function expectRange(record: Record<string, unknown>, from: string, to: string, path: string): [number, number] {
  const start = expectCoordinate(record, from, path);
  const end = expectCoordinate(record, to, path);
  if (end < start) {
    fail(path, `"${to}" must not be less than "${from}"`);
  }
  return [start, end];
}

function expectName(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 ||
      value.length > MAX_NAME_LENGTH || /\p{Cc}/u.test(value)) {
    fail(path, `must be a non-empty string of at most ${MAX_NAME_LENGTH} characters without surrounding spaces`);
  }
  return value;
}

/** Derives the default score name: lower case, runs of other characters become "-". */
export function defaultScoreName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');
}

function validateLayer(value: unknown, path: string): LayoutLayer {
  const record = expectObject(value, path, ['z'], ['rows', 'columns', 'blocks', 'tiles']);
  const z = record.z;
  if (typeof z !== 'number' || !Number.isInteger(z) || z < 0 || z > MAX_LAYER) {
    fail(`${path}.z`, `must be an integer between 0 and ${MAX_LAYER}`);
  }
  const layer: LayoutLayer = { z };
  const list = (key: string) => record[key] === undefined
    ? []
    : expectArray(record[key], `${path}.${key}`, 0, MAX_LAYOUT_TILES);

  const rows = list('rows').map((row, i) => {
    const itemPath = `${path}.rows[${i}]`;
    const item = expectObject(row, itemPath, ['y', 'left', 'right']);
    const [left, right] = expectRange(item, 'left', 'right', itemPath);
    return { y: expectCoordinate(item, 'y', itemPath), left, right };
  });
  const columns = list('columns').map((column, i) => {
    const itemPath = `${path}.columns[${i}]`;
    const item = expectObject(column, itemPath, ['x', 'top', 'bottom']);
    const [top, bottom] = expectRange(item, 'top', 'bottom', itemPath);
    return { x: expectCoordinate(item, 'x', itemPath), top, bottom };
  });
  const blocks = list('blocks').map((block, i) => {
    const itemPath = `${path}.blocks[${i}]`;
    const item = expectObject(block, itemPath, ['left', 'right', 'top', 'bottom']);
    const [left, right] = expectRange(item, 'left', 'right', itemPath);
    const [top, bottom] = expectRange(item, 'top', 'bottom', itemPath);
    return { left, right, top, bottom };
  });
  const tiles = list('tiles').map((tile, i) => {
    const itemPath = `${path}.tiles[${i}]`;
    const item = expectObject(tile, itemPath, ['x', 'y']);
    return { x: expectCoordinate(item, 'x', itemPath), y: expectCoordinate(item, 'y', itemPath) };
  });

  if (rows.length + columns.length + blocks.length + tiles.length === 0) {
    fail(path, 'must contain at least one row, column, block or tile');
  }
  if (rows.length > 0) layer.rows = rows;
  if (columns.length > 0) layer.columns = columns;
  if (blocks.length > 0) layer.blocks = blocks;
  if (tiles.length > 0) layer.tiles = tiles;
  return layer;
}

/** Validates a parsed document, filling in default score names; every layout must also build. */
export function validateLayoutDocument(value: unknown): LayoutDocument {
  const root = expectObject(value, '', ['version', 'layouts']);
  if (root.version !== LAYOUT_FORMAT_VERSION) {
    fail('version', `must be ${LAYOUT_FORMAT_VERSION}`);
  }
  const names = new Set<string>();
  const scoreNames = new Set<string>();
  const layouts = expectArray(root.layouts, 'layouts', 1, MAX_LAYOUTS_PER_DOCUMENT).map((entry, i) => {
    const path = `layouts[${i}]`;
    const record = expectObject(entry, path, ['name', 'layers'], ['scoreName']);
    const name = expectName(record.name, `${path}.name`);
    const scoreName = record.scoreName === undefined ? defaultScoreName(name) : record.scoreName;
    if (typeof scoreName !== 'string' || !SCORE_NAME_PATTERN.test(scoreName)) {
      fail(`${path}.scoreName`, record.scoreName === undefined
        ? 'cannot be derived from the name; set it explicitly'
        : 'must be 1-64 lower-case letters, digits, "-" or "_", starting with a letter or digit');
    }
    if (names.has(name)) {
      fail(`${path}.name`, `"${name}" is used by another layout in this file`);
    }
    if (scoreNames.has(scoreName)) {
      fail(`${path}.scoreName`, `"${scoreName}" is used by another layout in this file`);
    }
    names.add(name);
    scoreNames.add(scoreName);
    const layers = expectArray(record.layers, `${path}.layers`, 1, MAX_LAYER + 1)
      .map((layer, j) => validateLayer(layer, `${path}.layers[${j}]`));
    const layout: LayoutDefinition = { name, scoreName, layers };
    buildMap(layout, path);
    return layout;
  });
  return { version: LAYOUT_FORMAT_VERSION, layouts };
}

function* layerSlots(layer: LayoutLayer): Generator<Slot> {
  const z = layer.z;
  for (const { y, left, right } of layer.rows ?? []) {
    for (let x = left * 2; x <= right * 2; x += 2) yield new Slot(x, y * 2, z);
  }
  for (const { x, top, bottom } of layer.columns ?? []) {
    for (let y = top * 2; y <= bottom * 2; y += 2) yield new Slot(x * 2, y, z);
  }
  for (const { left, right, top, bottom } of layer.blocks ?? []) {
    for (let x = left * 2; x <= right * 2; x += 2) {
      for (let y = top * 2; y <= bottom * 2; y += 2) yield new Slot(x, y, z);
    }
  }
  for (const { x, y } of layer.tiles ?? []) {
    yield new Slot(x * 2, y * 2, z);
  }
}

/** Expands a layout into a GameMap; slots are kept in map.vala order by GameMap.addSlot. */
export function buildMap(layout: LayoutDefinition, path = layout.name): GameMap {
  const map = new GameMap(layout.name, layout.scoreName);
  const placed: Slot[] = [];
  for (const layer of layout.layers) {
    for (const slot of layerSlots(layer)) {
      if (placed.length === MAX_LAYOUT_TILES) {
        fail(path, `has more than ${MAX_LAYOUT_TILES} tiles`);
      }
      const clash = placed.find((other) => other.layer === slot.layer &&
        Math.abs(other.x - slot.x) < 2 && Math.abs(other.y - slot.y) < 2);
      if (clash) {
        const at = (s: Slot) => `(x ${s.x / 2}, y ${s.y / 2}, z ${s.layer})`;
        fail(path, clash.equals(slot)
          ? `has two tiles at ${at(slot)}`
          : `tile at ${at(slot)} overlaps the tile at ${at(clash)}`);
      }
      placed.push(slot);
      map.addSlot(slot);
    }
  }
  if (placed.length % 2 !== 0) {
    fail(path, `has ${placed.length} tiles; tiles are removed in pairs, so the count must be even`);
  }
  map.layout = layout;
  return map;
}

export function buildMaps(document: LayoutDocument): GameMap[] {
  return document.layouts.map((layout, i) => buildMap(layout, `layouts[${i}]`));
}

export function layoutFileFormat(fileName: string): LayoutFileFormat | null {
  const extension = fileName.split('.').at(-1)?.toLowerCase();
  if (extension === 'json') {
    return 'json';
  }
  return extension === 'yaml' || extension === 'yml' ? 'yaml' : null;
}

export function parseLayoutJson(text: string): LayoutDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new LayoutFormatError(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateLayoutDocument(value);
}

export async function parseLayoutYaml(text: string): Promise<LayoutDocument> {
  // Loaded on demand; the chunk is still precached for offline use.
  const { parse } = await import('yaml');
  let value: unknown;
  try {
    value = parse(text, { schema: 'core', uniqueKeys: true, maxAliasCount: 100, prettyErrors: true });
  } catch (error) {
    throw new LayoutFormatError(`Invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateLayoutDocument(value);
}

export async function parseLayoutText(text: string, format: LayoutFileFormat = 'json'): Promise<LayoutDocument> {
  return format === 'yaml' ? parseLayoutYaml(text) : parseLayoutJson(text);
}

function formatJsonValue(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const inner = indent + '  ';
    return `[\n${value.map((item) => inner + formatJsonValue(item, inner)).join(',\n')}\n${indent}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (entries.every(([, item]) => typeof item !== 'object' || item === null)) {
      return `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${JSON.stringify(item)}`).join(', ')} }`;
    }
    const inner = indent + '  ';
    return `{\n${entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${formatJsonValue(item, inner)}`)
      .join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/** Canonical JSON: objects holding only numbers or strings stay on one line. */
export function formatLayoutDocument(document: LayoutDocument): string {
  return `${formatJsonValue(document, '')}\n`;
}
