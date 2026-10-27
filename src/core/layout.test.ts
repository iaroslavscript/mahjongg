// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import 'fake-indexeddb/auto';
import { del } from 'idb-keyval';
import { beforeEach, describe, expect, it } from 'vitest';
import formatDocs from '../../docs/map-format.md?raw';
import exampleJson from '../../docs/examples/little-pyramid.json?raw';
import exampleYaml from '../../docs/examples/little-pyramid.yaml?raw';
import builtInJson from '../data/layouts.json?raw';
import { layoutExportDocument, LayoutLibrary } from '../layouts';
import { loadBuiltInMaps } from './builtin-layouts';
import { Game } from './game';
import {
  buildMap,
  buildMaps,
  defaultScoreName,
  formatLayoutDocument,
  layoutFileFormat,
  parseLayoutJson,
  parseLayoutText,
  parseLayoutYaml,
  type LayoutDefinition,
} from './layout';

function documentWith(layout: Partial<LayoutDefinition> & Record<string, unknown>): string {
  return JSON.stringify({ version: 1, layouts: [{ name: 'Test', layers: [{ z: 0, rows: [{ y: 0, left: 0, right: 1 }] }], ...layout }] });
}

const slotsOf = (text: string) => buildMaps(parseLayoutJson(text))[0]!.slots.map(({ x, y, layer }) => [x, y, layer]);

beforeEach(async () => {
  await del('mahjongg-custom-layouts');
});

describe('layout documents', () => {
  it('keeps the built-in layouts in canonical JSON formatting', () => {
    expect(formatLayoutDocument(parseLayoutJson(builtInJson))).toBe(builtInJson);
  });

  it('reads the documented JSON and YAML examples as the same playable layout', async () => {
    const fromJson = buildMaps(parseLayoutJson(exampleJson))[0]!;
    const fromYaml = buildMaps(await parseLayoutYaml(exampleYaml))[0]!;
    expect(fromJson.name).toBe('Little Pyramid');
    expect(fromJson.nSlots).toBe(40);
    expect(fromYaml.slots).toEqual(fromJson.slots);
    expect(fromYaml.layout).toEqual(fromJson.layout);

    const game = new Game(fromJson);
    game.generate(123456);
    while (!game.complete) {
      if (!game.canMove) {
        game.shuffleRemaining();
      }
      const match = game.nextHint()!;
      expect(game.removePair(match.tile0, match.tile1)).toBe(true);
    }
  });

  it('documents exactly the example files in docs/map-format.md', async () => {
    const block = (language: string) => new RegExp('```' + language + '\\n([\\s\\S]*?)```').exec(formatDocs)![1]!;
    expect(block('json')).toBe(exampleJson);
    expect(formatLayoutDocument(parseLayoutJson(exampleJson))).toBe(exampleJson);
    expect(await parseLayoutYaml(block('yaml'))).toEqual(parseLayoutJson(exampleJson));
  });

  it('defaults to JSON and detects formats from file names', async () => {
    expect(layoutFileFormat('a.json')).toBe('json');
    expect(layoutFileFormat('a.YAML')).toBe('yaml');
    expect(layoutFileFormat('a.yml')).toBe('yaml');
    expect(layoutFileFormat('a.map')).toBeNull();
    await expect(parseLayoutText(exampleYaml)).rejects.toThrow(/Invalid JSON/);
    expect((await parseLayoutText(exampleJson)).layouts[0]!.name).toBe('Little Pyramid');
  });

  it('expands rows, columns, blocks and half-step tiles into the original slot units', () => {
    const bySlot = (a: number[], b: number[]) => a[2]! - b[2]! || a[0]! - b[0]! || a[1]! - b[1]!;
    expect(slotsOf(JSON.stringify({
      version: 1,
      layouts: [{
        name: 'Shapes',
        layers: [
          { z: 0, rows: [{ y: 0, left: 0, right: 1 }], columns: [{ x: 3, top: 0, bottom: 1 }] },
          { z: 1, blocks: [{ left: 0, right: 1, top: 0.5, bottom: 0.5 }], tiles: [{ x: 3, y: 0.5 }, { x: 5, y: 0.5 }] },
        ],
      }],
    })).sort(bySlot)).toEqual([
      [0, 0, 0], [2, 0, 0], [6, 0, 0], [6, 2, 0],
      [0, 1, 1], [2, 1, 1], [6, 1, 1], [10, 1, 1],
    ]);
  });

  it('derives a score name from the layout name when it is omitted', () => {
    expect(defaultScoreName('Pyramid\'s Walls')).toBe('pyramid-s-walls');
    expect(defaultScoreName('Café Étoile')).toBe('cafe-etoile');
    expect(parseLayoutJson(documentWith({ name: 'My Layout' })).layouts[0]!.scoreName).toBe('my-layout');
  });

  it.each([
    ['not JSON', '{', /Invalid JSON/],
    ['a wrong version', JSON.stringify({ version: 2, layouts: [] }), /^version: must be 1/],
    ['an unknown property', documentWith({ colour: 'red' }), /layouts\[0\]: unknown property "colour"/],
    ['a missing name', JSON.stringify({ version: 1, layouts: [{ layers: [] }] }), /missing required property "name"/],
    ['an invalid score name', documentWith({ scoreName: 'Has Spaces' }), /scoreName: must be/],
    ['an underivable score name', documentWith({ name: '!!!' }), /cannot be derived/],
    ['a non-half coordinate', documentWith({ layers: [{ z: 0, tiles: [{ x: 0.25, y: 0 }, { x: 4, y: 0 }] }] }),
      /tiles\[0\]\.x: must be a multiple of 0\.5/],
    ['a negative coordinate', documentWith({ layers: [{ z: 0, rows: [{ y: -1, left: 0, right: 1 }] }] }),
      /rows\[0\]\.y: must be a multiple/],
    ['a reversed range', documentWith({ layers: [{ z: 0, rows: [{ y: 0, left: 3, right: 1 }] }] }),
      /"right" must not be less than "left"/],
    ['a fractional layer', documentWith({ layers: [{ z: 0.5, rows: [{ y: 0, left: 0, right: 1 }] }] }),
      /layers\[0\]\.z: must be an integer/],
    ['an empty layer', documentWith({ layers: [{ z: 0 }] }), /must contain at least one row/],
    ['an odd tile count', documentWith({ layers: [{ z: 0, rows: [{ y: 0, left: 0, right: 2 }] }] }),
      /has 3 tiles; .* must be even/],
    ['duplicate tiles', documentWith({ layers: [{ z: 0, tiles: [{ x: 1, y: 1 }, { x: 1, y: 1 }] }] }),
      /has two tiles at \(x 1, y 1, z 0\)/],
    ['overlapping tiles', documentWith({ layers: [{ z: 0, tiles: [{ x: 1, y: 1 }, { x: 1.5, y: 1 }] }] }),
      /overlaps the tile at/],
    ['too many tiles', documentWith({ layers: [{ z: 0, blocks: [{ left: 0, right: 12, top: 0, bottom: 11 }] }] }),
      /has more than 144 tiles/],
    ['duplicate layout names', JSON.stringify({
      version: 1,
      layouts: [0, 1].map((i) => ({ name: 'Twin', scoreName: `twin-${i}`, layers: [{ z: 0, rows: [{ y: 0, left: 0, right: 1 }] }] })),
    }), /"Twin" is used by another layout/],
  ])('rejects %s with a precise message', (_, text, message) => {
    expect(() => parseLayoutJson(text)).toThrow(message);
  });

  it('rejects malformed YAML and YAML alias bombs', async () => {
    await expect(parseLayoutYaml('version: 1\nlayouts: [')).rejects.toThrow(/Invalid YAML/);
    const bomb = ['a: &a [x, x, x, x, x, x, x, x, x, x]',
      ...Array.from({ length: 8 }, (_, i) => `${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [${
        Array(10).fill(`*${String.fromCharCode(97 + i)}`).join(', ')}]`)].join('\n');
    await expect(parseLayoutYaml(bomb)).rejects.toThrow(/Invalid YAML/);
  });

  it('exports any layout as a single-layout JSON document that imports unchanged', () => {
    for (const map of loadBuiltInMaps()) {
      const exported = formatLayoutDocument(layoutExportDocument(map));
      const reimported = buildMap(parseLayoutJson(exported).layouts[0]!);
      expect(reimported.slots).toEqual(map.slots);
      expect([reimported.name, reimported.scoreName]).toEqual([map.name, map.scoreName]);
    }
  });
});

describe('custom layout library', () => {
  const file = (text: string, name: string) => new File([text], name);

  it('imports JSON and YAML files, rejects name clashes and deletes layouts', async () => {
    const library = new LayoutLibrary();
    const builtIn = loadBuiltInMaps();

    const [imported] = await library.importFile(file(exampleYaml, 'little-pyramid.yml'), builtIn);
    expect(imported!.customLayoutId).toMatch(/^custom:/);
    expect(imported!.name).toBe('Little Pyramid');

    const installed = [...builtIn, ...await library.loadMaps()];
    expect(installed.map((map) => map.name)).toContain('Little Pyramid');
    await expect(library.importFile(file(exampleJson, 'again.json'), installed)).rejects.toThrow(/already installed/);
    await expect(library.importFile(file(documentWith({ name: 'Other', scoreName: 'easy' }), 'o.json'), installed))
      .rejects.toThrow(/score name "easy" is already used/);
    await expect(library.importFile(file(exampleJson, 'layout.map'), installed)).rejects.toThrow(/JSON .* or YAML/);

    await library.delete(imported!.customLayoutId!);
    expect(await library.loadMaps()).toEqual([]);
    await expect(library.delete(imported!.customLayoutId!)).rejects.toThrow(/not found/);
  });
});
