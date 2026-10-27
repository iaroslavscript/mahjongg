// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it } from 'vitest';
import { RulesDialog } from './rules';

afterEach(() => {
  document.body.replaceChildren();
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
