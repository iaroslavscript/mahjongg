// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it } from 'vitest';
import { createAboutDialog, LICENSE_URL, RulesDialog, SOURCE_URL } from './rules';

afterEach(() => {
  document.body.replaceChildren();
});

describe('about dialog', () => {
  const commit = '0123456789abcdef0123456789abcdef01234567';

  it('credits the port first, then the original authors, with build, license and source links', () => {
    const dialog = createAboutDialog({ version: '1.2.3', commit, commitDirty: false });
    const paragraphs = [...dialog.querySelectorAll('p')].map((p) => p.textContent);
    expect(paragraphs[0]).toBe('Web port of GNOME Mahjongg by Iaroslav Akimov, co-authored with Claude Opus 5.5.');
    expect([...dialog.querySelectorAll('h3')].map((h) => h.textContent))
      .toEqual(['Original GNOME Mahjongg authors', 'Build', 'License']);
    expect(dialog.textContent).toContain('Developers: Francisco Bustamante');
    expect(dialog.textContent).toContain('Version 1.2.3, built from commit 0123456.');

    const links = [...dialog.querySelectorAll('a')].map((a) => [a.textContent, a.href]);
    expect(links).toEqual([
      ['0123456', `${SOURCE_URL}/tree/${commit}`],
      ['GNU General Public License, version 3 or later', LICENSE_URL],
      [SOURCE_URL, SOURCE_URL],
    ]);
  });

  it('flags uncommitted changes and omits the commit when unknown', () => {
    expect(createAboutDialog({ version: '1.2.3', commit, commitDirty: true }).textContent)
      .toContain('built from commit 0123456 with uncommitted changes.');
    const unknown = createAboutDialog({ version: '1.2.3', commit: '', commitDirty: false });
    expect(unknown.textContent).toContain('Version 1.2.3.');
    expect(unknown.querySelector(`a[href*="/tree/"]`)).toBeNull();
  });
});

describe('rules dialog', () => {
  function tile(dialog: RulesDialog, name: string): HTMLButtonElement {
    return dialog.dialog.querySelector<HTMLButtonElement>(`.tile-face[aria-label="${name}"]`)!;
  }

  function highlighted(dialog: RulesDialog): string[] {
    return [...dialog.dialog.querySelectorAll('.tile-face.matches')].map((button) => button.getAttribute('aria-label')!);
  }

  const columnOf = (button: HTMLButtonElement): number =>
    Math.round(Number.parseFloat(button.style.getPropertyValue('--sprite-x')) * 42 / 100);

  it('renders the tileset faces grouped with their matching rule, in the tileset order', () => {
    const rules = new RulesDialog();
    rules.setTileset('blob:tiles"1', 'Cats', 'standard');
    expect(rules.dialog.querySelectorAll('.tile-group')).toHaveLength(7);
    expect(rules.dialog.querySelectorAll('.tile-face')).toHaveLength(42);
    expect(rules.dialog.style.getPropertyValue('--tileset-image')).toBe('url("blob:tiles%221")');
    expect(rules.dialog.textContent).toContain('Tileset: Cats');
    expect(rules.dialog.querySelector('.tile-group[aria-label^="Seasons"]')!.textContent)
      .toContain('Any two tiles of this group pair');
    expect([columnOf(tile(rules, 'Bamboo 3')), columnOf(tile(rules, 'White Dragon'))]).toEqual([11, 33]);

    rules.setTileset('blob:tiles2', 'Postmodern', 'gnome');
    expect([columnOf(tile(rules, 'Bamboo 3')), columnOf(tile(rules, 'White Dragon'))]).toEqual([26, 37]);
  });

  it('highlights the tiles a tapped tile pairs with and clears on a second tap or close', () => {
    const rules = new RulesDialog();
    document.body.append(rules.dialog);
    const help = rules.dialog.querySelector('.tile-groups-help')!;

    tile(rules, 'Summer').click();
    expect(highlighted(rules)).toEqual(['Spring', 'Summer', 'Autumn', 'Winter']);
    expect(tile(rules, 'Summer').getAttribute('aria-pressed')).toBe('true');
    expect(rules.dialog.querySelector('.has-tile-highlight')).not.toBeNull();
    expect(help.textContent).toContain('Summer pairs with any of the seasons');

    tile(rules, 'Dots 5').click();
    expect(highlighted(rules)).toEqual(['Dots 5']);
    expect(tile(rules, 'Summer').getAttribute('aria-pressed')).toBe('false');
    expect(help.textContent).toBe('Dots 5 pairs only with another Dots 5.');

    tile(rules, 'Dots 5').click();
    expect(highlighted(rules)).toEqual([]);
    expect(rules.dialog.querySelector('.has-tile-highlight')).toBeNull();

    tile(rules, 'Plum').click();
    rules.dialog.dispatchEvent(new Event('close'));
    expect(highlighted(rules)).toEqual([]);
  });
});
