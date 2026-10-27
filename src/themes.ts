// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { get, set } from 'idb-keyval';
import educationalUrl from './assets/themes/educational.png?url';
import postmodernUrl from './assets/themes/postmodern.svg?url';
import smoothUrl from './assets/themes/smooth.png?url';
import { DEFAULT_TILE_ORDER, parseTileOrder, type TileOrderId } from './tile-order';

const THEMES_KEY = 'mahjongg-custom-themes';
const MAX_THEME_SIZE = 10 * 1024 * 1024;
const EXPECTED_TILE_ASPECT = 64 / 88;
const ASPECT_TOLERANCE = 0.01;

export interface ThemeDescriptor {
  id: string;
  name: string;
  builtIn: boolean;
  /** Which sheet column holds which tile face. */
  tileOrder: TileOrderId;
}

export interface ImportedTheme extends ThemeDescriptor {
  /** The order an SVG declared with `data-tile-order` on its root element, if any. */
  declaredTileOrder: TileOrderId | null;
}

export interface LoadedTheme extends ThemeDescriptor {
  url: string;
  release?: () => void;
}

interface StoredTheme extends Omit<ThemeDescriptor, 'tileOrder'> {
  builtIn: false;
  /** Missing on tilesets imported before tile orders existed; those used the GNOME order. */
  tileOrder?: TileOrderId;
  mimeType: 'image/svg+xml' | 'image/png';
  data: string | ArrayBuffer;
}

const BUILT_IN_THEMES: ReadonlyArray<ThemeDescriptor & { url: string }> = [
  { id: 'postmodern', name: 'Postmodern', builtIn: true, tileOrder: 'gnome', url: postmodernUrl },
  { id: 'smooth', name: 'Smooth', builtIn: true, tileOrder: 'gnome', url: smoothUrl },
  { id: 'educational', name: 'Educational', builtIn: true, tileOrder: 'gnome', url: educationalUrl },
];

function describe(theme: StoredTheme): ThemeDescriptor {
  return { id: theme.id, name: theme.name, builtIn: false, tileOrder: theme.tileOrder ?? 'gnome' };
}

export function isValidSpriteSheet(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  const tileAspect = (width / 43) / (height / 2);
  return Math.abs(tileAspect - EXPECTED_TILE_ASPECT) / EXPECTED_TILE_ASPECT <= ASPECT_TOLERANCE;
}

export class ThemeLibrary {
  async list(): Promise<ThemeDescriptor[]> {
    return [
      ...BUILT_IN_THEMES.map(({ id, name, builtIn, tileOrder }) => ({ id, name, builtIn, tileOrder })),
      ...(await this.getStoredThemes()).map(describe),
    ];
  }

  async load(id: string): Promise<LoadedTheme> {
    const builtIn = BUILT_IN_THEMES.find((theme) => theme.id === id);
    if (builtIn) {
      return { id: builtIn.id, name: builtIn.name, builtIn: true, tileOrder: builtIn.tileOrder, url: builtIn.url };
    }
    const stored = (await this.getStoredThemes()).find((theme) => theme.id === id);
    if (!stored) {
      throw new Error(`Tileset "${id}" is not available.`);
    }
    const blob = new Blob([stored.data], { type: stored.mimeType });
    const url = URL.createObjectURL(blob);
    return {
      ...describe(stored),
      url,
      release: () => URL.revokeObjectURL(url),
    };
  }

  /** Stores a tileset in the order it declares, or else the standard order. */
  async importFile(file: File): Promise<ImportedTheme> {
    if (file.size <= 0 || file.size > MAX_THEME_SIZE) {
      throw new RangeError('Theme files must be smaller than 10 MiB and cannot be empty.');
    }

    const extension = file.name.split('.').at(-1)?.toLowerCase();
    const mimeType = file.type || (extension === 'svg' ? 'image/svg+xml' : extension === 'png' ? 'image/png' : '');
    if (mimeType !== 'image/svg+xml' && mimeType !== 'image/png') {
      throw new Error('Theme files must be SVG or PNG images.');
    }
    if ((mimeType === 'image/svg+xml' && extension !== 'svg') ||
        (mimeType === 'image/png' && extension !== 'png')) {
      throw new Error('The theme file extension and image type do not match.');
    }

    let data: string | ArrayBuffer;
    let declaredTileOrder: TileOrderId | null = null;
    if (mimeType === 'image/svg+xml') {
      const source = await file.text();
      const sanitized = sanitizeSvg(source);
      const dimensions = getSvgDimensions(sanitized);
      if (!isValidSpriteSheet(dimensions.width, dimensions.height)) {
        throw new Error('Theme SVG must use the GNOME Mahjongg 43-by-2 sprite-sheet aspect ratio.');
      }
      declaredTileOrder = getSvgTileOrder(sanitized);
      data = sanitized;
    } else {
      const png = await file.arrayBuffer();
      const dimensions = getPngDimensions(png);
      if (!isValidSpriteSheet(dimensions.width, dimensions.height)) {
        throw new Error('Theme PNG must use the GNOME Mahjongg 43-by-2 sprite-sheet aspect ratio.');
      }
      data = png;
    }

    const name = file.name.replace(/\.(svg|png)$/i, '').trim();
    if (!name || name.length > 120) {
      throw new Error('Theme filename must contain between 1 and 120 characters.');
    }
    const record: StoredTheme = {
      id: `custom:${crypto.randomUUID()}`,
      name,
      builtIn: false,
      tileOrder: declaredTileOrder ?? DEFAULT_TILE_ORDER,
      mimeType,
      data,
    };
    const themes = await this.getStoredThemes();
    themes.push(record);
    await set(THEMES_KEY, themes);
    return { ...describe(record), declaredTileOrder };
  }

  async setTileOrder(id: string, tileOrder: TileOrderId): Promise<void> {
    if (BUILT_IN_THEMES.some((theme) => theme.id === id)) {
      throw new Error('The tile order of built-in themes cannot be changed.');
    }
    const themes = await this.getStoredThemes();
    const theme = themes.find((candidate) => candidate.id === id);
    if (!theme) {
      throw new Error(`Custom tileset "${id}" was not found.`);
    }
    theme.tileOrder = tileOrder;
    await set(THEMES_KEY, themes);
  }

  async delete(id: string): Promise<void> {
    if (BUILT_IN_THEMES.some((theme) => theme.id === id)) {
      throw new Error('Built-in themes cannot be deleted.');
    }
    const themes = await this.getStoredThemes();
    const updated = themes.filter((theme) => theme.id !== id);
    if (updated.length === themes.length) {
      throw new Error(`Custom tileset "${id}" was not found.`);
    }
    await set(THEMES_KEY, updated);
  }

  private async getStoredThemes(): Promise<StoredTheme[]> {
    const value = await get<unknown>(THEMES_KEY);
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new Error('Stored custom tilesets are invalid.');
    }
    return value.map((entry) => {
      if (!isStoredTheme(entry)) {
        throw new Error('A stored custom tileset is invalid.');
      }
      return entry;
    });
  }
}

function sanitizeSvg(source: string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new Error('Theme SVG must not declare entities or external document types.');
  }
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') {
    throw new Error('Theme file is not a valid SVG document.');
  }
  const blockedTags = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video']);
  for (const element of [document.documentElement, ...Array.from(document.documentElement.querySelectorAll('*'))]) {
    if (blockedTags.has(element.localName.toLowerCase())) {
      throw new Error(`Theme SVG contains unsupported <${element.localName}> content.`);
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) {
        throw new Error('Theme SVG event handlers are not allowed.');
      }
      if ((name === 'href' || name.endsWith(':href')) && !isLocalReference(value)) {
        throw new Error('Theme SVG external image references are not allowed.');
      }
      if (containsExternalUrl(value)) {
        throw new Error('Theme SVG external resource references are not allowed.');
      }
    }
    if (element.localName.toLowerCase() === 'style' &&
        (/@import/i.test(element.textContent ?? '') || containsExternalUrl(element.textContent ?? ''))) {
      throw new Error('Theme SVG external stylesheets are not allowed.');
    }
  }
  return new XMLSerializer().serializeToString(document.documentElement);
}

function getSvgTileOrder(svg: string): TileOrderId | null {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  return parseTileOrder(root.getAttribute('data-tile-order')?.trim().toLowerCase());
}

function getSvgDimensions(svg: string): { width: number; height: number } {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (viewBox && viewBox.length === 4 && viewBox.every(Number.isFinite)) {
    return { width: viewBox[2]!, height: viewBox[3]! };
  }
  const width = parseSvgLength(root.getAttribute('width'));
  const height = parseSvgLength(root.getAttribute('height'));
  if (width === null || height === null) {
    throw new Error('Theme SVG must declare dimensions or a four-value viewBox.');
  }
  return { width, height };
}

function parseSvgLength(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = /^(\d+(?:\.\d+)?)(?:px)?$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

function getPngDimensions(data: ArrayBuffer): { width: number; height: number } {
  const bytes = new Uint8Array(data);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((byte, index) => bytes[index] === byte)) {
    throw new Error('Theme file is not a valid PNG image.');
  }
  const view = new DataView(data);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function isLocalReference(value: string): boolean {
  return value.startsWith('#') || /^data:image\/(?:png|jpeg|webp);base64,/i.test(value);
}

function containsExternalUrl(value: string): boolean {
  for (const match of value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    if (!isLocalReference(match[2]!.trim())) {
      return true;
    }
  }
  return false;
}

function isStoredTheme(value: unknown): value is StoredTheme {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const theme = value as Record<string, unknown>;
  return typeof theme.id === 'string' &&
    theme.id.startsWith('custom:') &&
    typeof theme.name === 'string' &&
    theme.builtIn === false &&
    (theme.tileOrder === undefined || parseTileOrder(theme.tileOrder) !== null) &&
  ((theme.mimeType === 'image/svg+xml' && typeof theme.data === 'string') ||
    (theme.mimeType === 'image/png' && theme.data instanceof ArrayBuffer));
}
