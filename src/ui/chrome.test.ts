// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBuiltInMaps } from '../core/builtin-layouts';
import { createLayoutThumbnail } from './layout-picker';
import { MainMenu } from './main-menu';
import { ToastHost } from './toast';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('toast host', () => {
  it('hides informational toasts after a while and keeps toasts with actions', () => {
    vi.useFakeTimers();
    const host = new ToastHost();
    host.show('Saved.');
    host.show('No moves left.', { id: 'no-moves', actions: [{ label: 'Shuffle', action: 'shuffle' }] });
    expect(host.element.querySelectorAll('.toast')).toHaveLength(2);
    vi.advanceTimersByTime(10_000);
    expect(host.element.querySelectorAll('.toast')).toHaveLength(1);
    expect(host.has('no-moves')).toBe(true);
    expect(host.element.querySelector<HTMLButtonElement>('.toast-action')!.dataset.action).toBe('shuffle');
  });

  it('replaces toasts with the same id, dismisses them on click and reports errors as alerts', () => {
    const host = new ToastHost();
    host.show('First', { id: 'status' });
    host.show('Second', { id: 'status' });
    expect([...host.element.querySelectorAll('.toast')].map((toast) => toast.textContent)).toEqual(['Second']);
    host.element.querySelector<HTMLButtonElement>('.toast-close')!.click();
    expect(host.has('status')).toBe(false);
    expect(host.show('Broken', { variant: 'error' }).getAttribute('role')).toBe('alert');
  });
});

describe('main menu', () => {
  it('opens on the first item, moves with the arrow keys and closes on Escape', () => {
    const menu = new MainMenu();
    document.body.append(menu.element);
    const button = menu.element.querySelector<HTMLButtonElement>('[data-action="menu"]')!;
    menu.open();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(menu.item('new'));

    menu.item('restart').disabled = true;
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(menu.item('scores'));
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(menu.item('about'));

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(menu.isOpen).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('has no Save item because games are saved automatically', () => {
    const menu = new MainMenu();
    expect(() => menu.item('save')).toThrow();
    expect(menu.item('export').textContent).toContain('Export Saved Game');
  });
});

describe('layout thumbnails', () => {
  it('draws every slot once, one path per layer in stacking order', () => {
    const map = loadBuiltInMaps()[0]!;
    const svg = createLayoutThumbnail(map);
    const paths = [...svg.querySelectorAll('path')];
    const layers = [...new Set(map.slots.map((slot) => slot.layer))].sort((a, b) => a - b);
    expect(paths).toHaveLength(layers.length);
    expect(paths.map((path) => Number(path.style.getPropertyValue('--layer'))))
      .toEqual(layers.map((layer) => layer / layers.at(-1)!));
    const tiles = paths.flatMap((path) => path.getAttribute('d')!.match(/M[^M]+/g)!);
    expect(tiles).toHaveLength(map.nSlots);

    const [x, y, width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
    for (const tile of tiles) {
      const [startX, startY] = tile.slice(1).split(/[ h]/).map(Number) as [number, number];
      expect(startX).toBeGreaterThan(x);
      expect(startX).toBeLessThan(x + width);
      expect(startY).toBeGreaterThan(y);
      expect(startY).toBeLessThan(y + height);
    }
  });
});
