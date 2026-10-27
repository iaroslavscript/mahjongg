// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { del, set } from 'idb-keyval';
import { isValidSpriteSheet, ThemeLibrary } from './themes';

const THEME_XML = `
  <svg xmlns="http://www.w3.org/2000/svg" width="2752" height="176" viewBox="0 0 2752 176">
    <rect width="64" height="88" fill="#fff"/>
  </svg>
`;

beforeEach(async () => {
  await del('mahjongg-custom-themes');
});

describe('theme library', () => {
  it('recognizes the original sprite-sheet aspect ratio', () => {
    expect(isValidSpriteSheet(5504, 352)).toBe(true);
    expect(isValidSpriteSheet(10750, 688)).toBe(true);
    expect(isValidSpriteSheet(1000, 1000)).toBe(false);
  });

  it('imports a valid SVG into IndexedDB and can load or delete it', async () => {
    const themes = new ThemeLibrary();
    const imported = await themes.importFile(new File([THEME_XML], 'custom.svg', { type: 'image/svg+xml' }));
    expect(imported).toMatchObject({ name: 'custom', builtIn: false });
    expect((await themes.list()).map(({ id }) => id)).toContain(imported.id);
    const loaded = await themes.load(imported.id);
    expect(loaded.url).toMatch(/^blob:/);
    loaded.release?.();
    await themes.delete(imported.id);
    await expect(themes.load(imported.id)).rejects.toThrow(/not available/);
  });

  it('rejects invalid aspect ratios, active content, and external references', async () => {
    const themes = new ThemeLibrary();
    await expect(themes.importFile(new File(
      ['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>'],
      'bad.svg',
      { type: 'image/svg+xml' },
    ))).rejects.toThrow(/aspect ratio/);
    await expect(themes.importFile(new File(
      [THEME_XML.replace('<rect', '<script>alert(1)</script><rect')],
      'script.svg',
      { type: 'image/svg+xml' },
    ))).rejects.toThrow(/unsupported <script>/);
    await expect(themes.importFile(new File(
      [THEME_XML.replace('<rect', '<image href="https://example.invalid/tile.png"/><rect')],
      'external.svg',
      { type: 'image/svg+xml' },
    ))).rejects.toThrow(/external image references/);
  });

  it('protects built-in entries from deletion', async () => {
    await expect(new ThemeLibrary().delete('postmodern')).rejects.toThrow(/cannot be deleted/);
  });

  it('imports tilesets in the standard order unless an SVG declares one, and stores changes', async () => {
    const themes = new ThemeLibrary();
    const plain = await themes.importFile(new File([THEME_XML], 'plain.svg', { type: 'image/svg+xml' }));
    expect(plain).toMatchObject({ tileOrder: 'standard', declaredTileOrder: null });
    const declared = await themes.importFile(new File(
      [THEME_XML.replace('<svg ', '<svg data-tile-order="GNOME" ')],
      'declared.svg',
      { type: 'image/svg+xml' },
    ));
    expect(declared).toMatchObject({ tileOrder: 'gnome', declaredTileOrder: 'gnome' });

    await themes.setTileOrder(plain.id, 'gnome');
    const loaded = await themes.load(plain.id);
    expect(loaded.tileOrder).toBe('gnome');
    loaded.release?.();
    expect((await themes.list()).find((theme) => theme.id === 'postmodern')?.tileOrder).toBe('gnome');
    await expect(themes.setTileOrder('postmodern', 'standard')).rejects.toThrow(/built-in/);
  });

  it('treats tilesets stored before tile orders existed as GNOME tilesets', async () => {
    await set('mahjongg-custom-themes', [
      { id: 'custom:old', name: 'Old', builtIn: false, mimeType: 'image/svg+xml', data: THEME_XML },
    ]);
    const old = await new ThemeLibrary().load('custom:old');
    expect(old.tileOrder).toBe('gnome');
    old.release?.();
  });
});
