// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import 'fake-indexeddb/auto';
import { del } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeLibrary } from '../themes';
import { TileOrderDialog } from './tile-order-dialog';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2752 176"><rect width="64" height="88"/></svg>';

beforeEach(async () => {
  await del('mahjongg-custom-themes');
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('tile order dialog', () => {
  it('previews and stores the chosen order of a custom tileset', async () => {
    const themes = new ThemeLibrary();
    const imported = await themes.importFile(new File([SVG], 'Cats.svg', { type: 'image/svg+xml' }));
    const present = vi.fn();
    const onChanged = vi.fn();
    const dialog = new TileOrderDialog(themes, { present, onChanged, onError: (error) => { throw error; } });
    document.body.append(dialog.dialog);

    await dialog.open(imported.id, 'gnome');
    expect(present).toHaveBeenCalledWith(dialog.dialog);
    expect(dialog.dialog.querySelector('h2')!.textContent).toBe('Tile Order — Cats');
    expect(dialog.dialog.textContent).toContain('The file declares the GNOME Mahjongg order.');
    const radio = (order: string) => dialog.dialog.querySelector<HTMLInputElement>(`input[value="${order}"]`)!;
    const whiteDragon = dialog.dialog.querySelector<HTMLElement>('.tile-face[aria-label="White Dragon"]')!;
    expect(radio('standard').checked).toBe(true);
    expect(whiteDragon.style.getPropertyValue('--sprite-x')).toBe(`${(33 * 100) / 42}%`);

    radio('gnome').checked = true;
    radio('gnome').dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledWith(imported.id, 'gnome'));
    expect(whiteDragon.style.getPropertyValue('--sprite-x')).toBe(`${(37 * 100) / 42}%`);
    const loaded = await themes.load(imported.id);
    expect(loaded.tileOrder).toBe('gnome');
    loaded.release?.();
  });

  it('refuses built-in tilesets', async () => {
    const dialog = new TileOrderDialog(new ThemeLibrary(), { present: vi.fn(), onChanged: vi.fn(), onError: vi.fn() });
    await expect(dialog.open('postmodern')).rejects.toThrow(/built-in/);
  });
});
