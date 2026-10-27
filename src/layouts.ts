// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { get, set } from 'idb-keyval';
import {
  buildMap,
  LAYOUT_FORMAT_VERSION,
  layoutFileFormat,
  LayoutFormatError,
  parseLayoutText,
  type LayoutDefinition,
  type LayoutDocument,
} from './core/layout';
import type { GameMap } from './core/map';

const LAYOUTS_KEY = 'mahjongg-custom-layouts';
export const MAX_LAYOUT_FILE_SIZE = 1024 * 1024;

interface StoredLayout {
  id: string;
  layout: LayoutDefinition;
}

/** Custom layouts imported from JSON or YAML files, stored in IndexedDB. */
export class LayoutLibrary {
  /** Builds the stored layouts; entries that no longer validate are skipped and reported. */
  async loadMaps(onInvalid: (error: Error) => void = () => {}): Promise<GameMap[]> {
    const maps: GameMap[] = [];
    for (const stored of await this.getStoredLayouts()) {
      try {
        const map = buildMap(stored.layout);
        map.customLayoutId = stored.id;
        maps.push(map);
      } catch (error) {
        onInvalid(new Error(`Stored layout "${stored.layout.name}" is invalid and was skipped.`, { cause: error }));
      }
    }
    return maps;
  }

  /** Imports every layout in the file; names must not clash with any installed layout. */
  async importFile(file: File, installed: readonly GameMap[]): Promise<GameMap[]> {
    if (file.size <= 0 || file.size > MAX_LAYOUT_FILE_SIZE) {
      throw new RangeError('Layout files must be smaller than 1 MiB and cannot be empty.');
    }
    const format = layoutFileFormat(file.name);
    if (!format) {
      throw new LayoutFormatError('Layout files must be JSON (.json) or YAML (.yaml, .yml).');
    }
    const document = await parseLayoutText(await file.text(), format);
    for (const layout of document.layouts) {
      if (installed.some((map) => map.name === layout.name)) {
        throw new LayoutFormatError(`A layout named "${layout.name}" is already installed.`);
      }
      if (installed.some((map) => map.scoreName === layout.scoreName)) {
        throw new LayoutFormatError(`The score name "${layout.scoreName}" is already used by another layout.`);
      }
    }

    const records = document.layouts.map((layout) => ({ id: `custom:${crypto.randomUUID()}`, layout }));
    await set(LAYOUTS_KEY, [...await this.getStoredLayouts(), ...records]);
    return records.map(({ id, layout }) => {
      const map = buildMap(layout);
      map.customLayoutId = id;
      return map;
    });
  }

  async delete(id: string): Promise<void> {
    const layouts = await this.getStoredLayouts();
    const remaining = layouts.filter((stored) => stored.id !== id);
    if (remaining.length === layouts.length) {
      throw new Error(`Custom layout "${id}" was not found.`);
    }
    await set(LAYOUTS_KEY, remaining);
  }

  private async getStoredLayouts(): Promise<StoredLayout[]> {
    const stored = await get<unknown>(LAYOUTS_KEY);
    if (stored === undefined) {
      return [];
    }
    if (!Array.isArray(stored)) {
      throw new Error('Stored custom layouts are corrupted.');
    }
    return stored.filter((entry): entry is StoredLayout =>
      typeof entry === 'object' && entry !== null &&
      typeof (entry as StoredLayout).id === 'string' &&
      typeof (entry as StoredLayout).layout === 'object');
  }
}

/** A single-layout document for export; JSON is the canonical format. */
export function layoutExportDocument(map: GameMap): LayoutDocument {
  if (!map.layout) {
    throw new Error(`Layout "${map.name}" has no definition to export.`);
  }
  return { version: LAYOUT_FORMAT_VERSION, layouts: [map.layout] };
}
