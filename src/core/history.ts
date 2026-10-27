// SPDX-FileCopyrightText: 2010-2026 Mahjongg Contributors
// SPDX-FileCopyrightText: 2010-2013 Robert Ancell
// SPDX-License-Identifier: GPL-3.0-or-later

import { get, set } from 'idb-keyval';

const HISTORY_KEY = 'mahjongg-score-history';

export interface HistoryEntry {
  id: string;
  date: string;
  name: string;
  duration: number;
  player: string;
  rank: number;
}

type StoredHistoryEntry = Omit<HistoryEntry, 'rank'>;

export class History {
  private entriesValue: StoredHistoryEntry[] = [];

  get entries(): readonly HistoryEntry[] {
    return this.entriesValue.map((entry) => ({ ...entry, rank: 0 }));
  }

  get length(): number {
    return this.entriesValue.length;
  }

  async load(): Promise<void> {
    const entries = await get<unknown[] | undefined>(HISTORY_KEY);
    this.entriesValue = (entries ?? []).filter(isStoredHistoryEntry).map((entry) => ({
      ...entry,
      id: typeof entry.id === 'string' && entry.id ? entry.id : crypto.randomUUID(),
    }));
  }

  async add(date: Date, name: string, duration: number, player: string): Promise<HistoryEntry> {
    if (!Number.isFinite(duration) || duration < 0 || !name || !player) {
      throw new Error('A score requires a layout, player, and non-negative duration.');
    }
    const stored: StoredHistoryEntry = {
      id: crypto.randomUUID(),
      date: date.toISOString(),
      name,
      duration: Math.floor(duration),
      player,
    };
    this.entriesValue.push(stored);
    await this.persist();
    const rank = this.rankedStoredEntries(name).indexOf(stored) + 1;
    return { ...stored, rank };
  }

  async setPlayer(id: string, player: string): Promise<void> {
    const entry = this.entriesValue.find((candidate) => candidate.id === id);
    if (!entry) {
      throw new Error('The score entry no longer exists.');
    }
    if (!player.trim()) {
      throw new Error('A score requires a player name.');
    }
    entry.player = player.trim();
    await this.persist();
  }

  async clear(): Promise<void> {
    this.entriesValue = [];
    await this.persist();
  }

  getRanked(name: string): HistoryEntry[] {
    return this.rankedStoredEntries(name).map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  /** Same order as ScoreDialog.layout_selected_cb: entries are prepended, then stably sorted. */
  private rankedStoredEntries(name: string): StoredHistoryEntry[] {
    return this.entriesValue
      .filter((entry) => entry.name === name)
      .reverse()
      .sort(compareEntries);
  }

  private async persist(): Promise<void> {
    await set(HISTORY_KEY, this.entriesValue);
  }
}

function compareEntries(a: StoredHistoryEntry, b: StoredHistoryEntry): number {
  return Math.sign(a.duration - b.duration) ||
    Math.sign(Date.parse(b.date) - Date.parse(a.date)) ||
    (a.player < b.player ? -1 : a.player > b.player ? 1 : 0);
}

function isStoredHistoryEntry(value: unknown): value is Omit<StoredHistoryEntry, 'id'> & { id?: unknown } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return typeof entry.date === 'string' &&
    !Number.isNaN(Date.parse(entry.date)) &&
    typeof entry.name === 'string' &&
    typeof entry.duration === 'number' &&
    Number.isInteger(entry.duration) &&
    entry.duration >= 0 &&
    typeof entry.player === 'string';
}
