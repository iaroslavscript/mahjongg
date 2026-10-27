// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

describe('settings', () => {
  beforeEach(() => localStorage.clear());

  it('provides defaults and persists validated settings', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    const settings = { ...DEFAULT_SETTINGS, mapset: 'taipei', mapRotation: 'sequential' as const };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it('migrates the removed system background to the default', () => {
    localStorage.setItem('mahjongg-settings', JSON.stringify({ ...DEFAULT_SETTINGS, backgroundColor: 'system' }));
    expect(loadSettings().backgroundColor).toBe('dark');
  });

  it('reports malformed or unsupported stored values', () => {
    localStorage.setItem('mahjongg-settings', '{bad');
    expect(() => loadSettings()).toThrow(/not valid JSON/);
    localStorage.setItem('mahjongg-settings', JSON.stringify({ mapRotation: 'around' }));
    expect(() => loadSettings()).toThrow(/unsupported values/);
  });
});
