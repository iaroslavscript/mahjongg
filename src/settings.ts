// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

export type MapRotation = 'single' | 'sequential' | 'random';
export type BackgroundColor = 'light' | 'dark';

export interface AppSettings {
  mapset: string;
  mapRotation: MapRotation;
  backgroundColor: BackgroundColor;
  tileset: string;
  playerName: string;
}

const STORAGE_KEY = 'mahjongg-settings';

export const DEFAULT_SETTINGS: AppSettings = {
  mapset: 'easy',
  mapRotation: 'single',
  backgroundColor: 'dark',
  tileset: 'postmodern',
  playerName: 'Player',
};

export function loadSettings(storage: Storage = localStorage): AppSettings {
  const value = storage.getItem(STORAGE_KEY);
  if (value === null) {
    return { ...DEFAULT_SETTINGS };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error('Saved settings are not valid JSON.', { cause: error });
  }
  // The former 'system' background option was removed; fall back to the default.
  if (typeof parsed === 'object' && parsed !== null && (parsed as Record<string, unknown>).backgroundColor === 'system') {
    parsed = { ...parsed, backgroundColor: DEFAULT_SETTINGS.backgroundColor };
  }
  if (!isAppSettings(parsed)) {
    throw new Error('Saved settings contain unsupported values.');
  }
  return parsed;
}

export function saveSettings(settings: AppSettings, storage: Storage = localStorage): void {
  if (!isAppSettings(settings)) {
    throw new Error('Cannot save invalid settings.');
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function isAppSettings(value: unknown): value is AppSettings {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const settings = value as Record<string, unknown>;
  return typeof settings.mapset === 'string' &&
    ['single', 'sequential', 'random'].includes(String(settings.mapRotation)) &&
    ['light', 'dark'].includes(String(settings.backgroundColor)) &&
    typeof settings.tileset === 'string' &&
    typeof settings.playerName === 'string' &&
    settings.playerName.trim().length > 0;
}
