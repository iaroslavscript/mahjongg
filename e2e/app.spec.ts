// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test, type Page } from '@playwright/test';

async function openMenuItem(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.getByRole('menuitem', { name }).click();
}

function toast(page: Page, text: string) {
  return page.locator('.toast', { hasText: text });
}

test('starts a playable board and exposes game controls', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Mahjongg' })).toBeVisible();
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#moves-left')).not.toHaveText('0');
  await expect(page.locator('#tiles-left')).toHaveText('144');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(page.locator('#status')).toHaveCount(0);

  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.getByRole('button', { name: 'Resume Game' }).click();
  await expect(page.locator('#pause-overlay')).toBeHidden();

  await openMenuItem(page, 'Rules');
  const rules = page.getByRole('dialog', { name: 'Game Rules' });
  await expect(rules).toBeVisible();
  await expect(rules.getByText('Tileset: Postmodern')).toBeVisible();
  await expect(rules.locator('.tile-face')).toHaveCount(42);
  await rules.getByRole('button', { name: 'Winter' }).click();
  await expect(rules.locator('.tile-face.matches')).toHaveCount(4);
  await expect(rules.getByText('Winter pairs with any of the seasons')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await openMenuItem(page, 'Preferences');
  await page.locator('#preferences-rotation').selectOption('sequential');
  await page.locator('#preferences-player').fill('Test Player');
  await page.getByRole('button', { name: 'Save Preferences' }).click();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('mahjongg-settings') ?? '{}').mapRotation,
  )).toBe('sequential');

  await openMenuItem(page, 'Preferences');
  await page.locator('#theme-file').setInputFiles({
    name: 'Imported tiles.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2752" height="176" viewBox="0 0 2752 176"><rect width="64" height="88" fill="#fff"/></svg>',
    ),
  });
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('mahjongg-settings') ?? '{}').tileset,
  )).toMatch(/^custom:/);
  const tileOrder = page.getByRole('dialog', { name: 'Tile Order — Imported tiles' });
  await expect(tileOrder).toBeVisible();
  await expect(tileOrder.getByRole('radio', { name: /Standard/ })).toBeChecked();
  await tileOrder.getByText('GNOME Mahjongg', { exact: true }).click();
  await expect(tileOrder.getByRole('radio', { name: /GNOME Mahjongg/ })).toBeChecked();
  await tileOrder.getByRole('button', { name: 'Done' }).click();
  await expect(tileOrder).toBeHidden();
  await page.getByRole('button', { name: 'Tile Order…' }).click();
  await expect(tileOrder.getByRole('radio', { name: /GNOME Mahjongg/ })).toBeChecked();
  await tileOrder.getByRole('button', { name: 'Done' }).click();
  await page.locator('#preferences-theme').selectOption('postmodern');
  await expect(page.getByRole('button', { name: 'Tile Order…' })).toBeDisabled();
  await page.locator('#preferences-theme').selectOption({ label: 'Imported tiles' });
  await page.getByRole('button', { name: 'Delete Selected Theme' }).click();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('mahjongg-settings') ?? '{}').tileset,
  )).toBe('postmodern');

  expect(pageErrors).toEqual([]);
});

test('blurs the board behind dialogs even before the game is started', async ({ page }) => {
  await page.goto('/');
  const board = page.locator('#board');
  await expect(board).toHaveCSS('filter', 'none');
  await openMenuItem(page, 'Preferences');
  await expect(page.getByRole('dialog', { name: 'Preferences' })).toBeVisible();
  await expect(page.locator('#preferences-background option')).toHaveText(['Light', 'Dark']);
  await expect(board).toHaveCSS('filter', /blur/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Preferences' })).toBeHidden();
  await expect(board).toHaveCSS('filter', 'none');
});

test('serves its install manifest and app shell from cache while offline', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    null,
    { timeout: 15000 },
  );

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link?.href) {
      throw new Error('Web app manifest link is missing.');
    }
    const response = await fetch(link.href);
    if (!response.ok) {
      throw new Error(`Manifest request failed with ${response.status}.`);
    }
    return response.json() as Promise<{
      name: string;
      display: string;
      icons: Array<{ src: string; purpose?: string }>;
    }>;
  });
  expect(manifest.name).toBe('Mahjongg');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const available = await page.evaluate(async (src) => {
      const response = await fetch(new URL(src, document.querySelector('link[rel="manifest"]')!.href));
      return response.ok;
    }, icon.src);
    expect(available).toBe(true);
  }

  try {
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mahjongg' })).toBeVisible();
    await expect(page.locator('#board')).toBeVisible();
  } finally {
    await page.context().setOffline(false);
  }
});

test('autosaves and pauses the active game when the document is hidden', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(toast(page, 'Game saved on this device.')).toBeVisible();
  await expect(page.locator('#pause-overlay')).toBeVisible();

  await page.reload();
  await expect(toast(page, 'Saved game restored and paused.')).toBeVisible();
  await expect(page.locator('#pause-overlay')).toBeVisible();

  await page.getByRole('button', { name: 'Restart Game' }).click();
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await page.reload();
  await expect(page.locator('#board')).toBeVisible();
  await expect(toast(page, 'Saved game restored and paused.')).toHaveCount(0);
});

test('uses the original keyboard accelerators and resumes when the paused board is clicked', async ({ page }) => {
  await page.goto('/');
  await page.locator('#board').focus();

  await page.keyboard.press('ControlOrMeta+H');
  await expect(page.locator('#clock')).not.toHaveText('00:00');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();

  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hint' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();

  await page.locator('#board').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#pause-overlay')).toBeHidden();

  await page.keyboard.press('F1');
  await expect(page.getByRole('dialog', { name: 'Game Rules' })).toBeVisible();
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Game Rules' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+Shift+?');
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toContainText('Ctrl+N');
  await page.keyboard.press('Escape');

  // F10 opens the main menu; Escape closes it without pausing the game.
  await page.keyboard.press('F10');
  await expect(page.getByRole('menuitem', { name: 'New Game' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Restart Game' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(page.locator('#pause-overlay')).toBeHidden();
});

test('asks before changing the layout of a started game', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Hint' }).click();

  const picker = page.getByRole('dialog', { name: 'Choose Layout' });
  await page.locator('.layout-button').click();
  await expect(picker.locator('.layout-card')).toHaveCount(10);
  await expect(picker.locator('[aria-current="true"]')).toHaveAttribute('data-layout', 'easy');
  await picker.locator('[data-layout="difficult"]').click();
  const alert = page.getByRole('alertdialog', { name: 'Change Layout?' });
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#layout-name')).toHaveText('Turtle');
  await expect(picker).toBeVisible();

  await picker.locator('[data-layout="difficult"]').click();
  await page.getByRole('alertdialog', { name: 'Change Layout?' }).getByRole('button', { name: 'Change Layout' }).click();
  await expect(picker).toBeHidden();
  await expect(page.locator('#layout-name')).toHaveText('Taipei');
  await expect(page.locator('#clock')).toHaveText('00:00');
});

test('imports, exports and deletes custom JSON and YAML layouts', async ({ page }) => {
  await page.goto('/');
  await openMenuItem(page, 'Preferences');
  await page.locator('#layout-file').setInputFiles('docs/examples/little-pyramid.json');
  await expect(page.locator('#preferences-layout')).toHaveValue('little-pyramid');
  await page.getByRole('button', { name: 'Save Preferences' }).click();
  await expect(page.locator('#layout-name')).toHaveText('Little Pyramid');
  await page.locator('.layout-button').click();
  await expect(page.locator('.layout-card')).toHaveCount(11);
  await expect(page.locator('[data-layout="little-pyramid"]')).toContainText('Custom');
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.locator('#layout-name')).toHaveText('Little Pyramid');

  await openMenuItem(page, 'Preferences');
  await page.locator('#layout-file').setInputFiles({
    name: 'tiny-square.yaml',
    mimeType: 'application/yaml',
    buffer: Buffer.from('version: 1\nlayouts:\n  - name: Tiny Square\n    layers:\n      - z: 0\n        blocks:\n          - { left: 0, right: 1, top: 0, bottom: 1 }\n'),
  });
  await expect(page.locator('#preferences-layout')).toHaveValue('tiny-square');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Layout (JSON)' }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe('tiny-square.json');
  const exportedText = await (await exported.createReadStream()).toArray();
  expect(JSON.parse(Buffer.concat(exportedText).toString('utf8'))).toEqual({
    version: 1,
    layouts: [{ name: 'Tiny Square', scoreName: 'tiny-square', layers: [{ z: 0, blocks: [{ left: 0, right: 1, top: 0, bottom: 1 }] }] }],
  });

  await page.locator('#layout-file').setInputFiles({
    name: 'odd.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":1,"layouts":[{"name":"Odd","layers":[{"z":0,"rows":[{"y":0,"left":0,"right":2}]}]}]}'),
  });
  await expect(page.locator('.toast-error')).toContainText('has 3 tiles');

  await page.locator('#preferences-layout').selectOption('little-pyramid');
  await page.getByRole('button', { name: 'Delete Selected Layout' }).click();
  await page.getByRole('alertdialog', { name: 'Delete Layout?' }).getByRole('button', { name: 'Delete' }).click();
  // Deleting the layout in play starts a new game, which closes open dialogs like the original.
  await expect(page.getByRole('dialog', { name: 'Preferences' })).toBeHidden();
  await expect(page.locator('#layout-name')).toHaveText('Turtle');
  await expect(toast(page, 'Deleted layout Little Pyramid.')).toBeVisible();
  await page.locator('.layout-button').click();
  await expect(page.locator('.layout-card')).toHaveCount(11);
  await expect(page.locator('.layout-card', { hasText: 'Tiny Square' })).toHaveCount(1);
});

test('offers Auto-finish only once every tile is free and celebrates the win', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.finish-chip')).toBeHidden();
  await openMenuItem(page, 'Preferences');
  await page.locator('#layout-file').setInputFiles({
    name: 'four.yaml',
    mimeType: 'application/yaml',
    buffer: Buffer.from('version: 1\nlayouts:\n  - name: Four Free\n    layers:\n      - z: 0\n        blocks:\n          - { left: 0, right: 1, top: 0, bottom: 1 }\n'),
  });
  await page.getByRole('button', { name: 'Save Preferences' }).click();
  await expect(page.locator('#layout-name')).toHaveText('Four Free');
  await expect(page.locator('#tiles-left')).toHaveText('4');

  await page.getByRole('button', { name: 'Auto-finish' }).click();
  const win = page.getByRole('dialog', { name: 'Game Completed' });
  await expect(win).toBeVisible();
  await expect(win.locator('.win-details')).toHaveText('Four Free · Rank 1 of 1');
  await expect(win.getByRole('button', { name: 'Clear Scores…' })).toBeHidden();
  await win.getByRole('button', { name: 'Change Layout' }).click();
  await expect(page.getByRole('dialog', { name: 'Choose Layout' })).toBeVisible();
});

test('shrinks the board with the window so no tile rows are clipped', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Viewport resizing is a desktop scenario.');
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/');
  await expect(page.locator('#board')).toBeVisible();

  for (const [width, height] of [[1400, 600], [1000, 500], [1400, 900]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => {
      const frame = document.querySelector('.board-frame')!.getBoundingClientRect();
      const board = document.querySelector('#board')!.getBoundingClientRect();
      return board.bottom <= frame.bottom && board.right <= frame.right && board.height > 0;
    })).toBe(true);
  }
});
