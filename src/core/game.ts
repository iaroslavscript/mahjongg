// SPDX-FileCopyrightText: 2010-2026 Mahjongg Contributors
// SPDX-FileCopyrightText: 2010-2013 Robert Ancell
// SPDX-License-Identifier: GPL-3.0-or-later

import { GRand } from './grand';
import type { GameMap, Slot } from './map';

export interface RestoredTile {
  number: number;
  visible: boolean;
  move: number;
  slot: Slot;
}

export interface GameRestoreState {
  seed: number;
  move: number;
  clock: number;
  tiles: readonly RestoredTile[];
}

export class Tile {
  number = -1;
  visible = true;
  highlighted = false;
  move = 0;
  shaking = false;
  shakeOffset = 0;

  readonly left: Tile[] = [];
  readonly right: Tile[] = [];
  readonly above: Tile[] = [];

  constructor(readonly slot: Slot) {}

  get selectable(): boolean {
    if (!this.visible) {
      return false;
    }
    const leftBlocked = this.left.some((tile) => tile.visible);
    const rightBlocked = this.right.some((tile) => tile.visible);
    if (leftBlocked && rightBlocked) {
      return false;
    }
    return !this.above.some((tile) => tile.visible);
  }

  matches(other: Tile): boolean {
    return Math.trunc(this.number / 4) === Math.trunc(other.number / 4);
  }
}

export class Match {
  constructor(
    readonly tile0: Tile,
    readonly tile1: Tile,
  ) {}
}

export const HINT_BLINK_COUNT = 6;
export const HINT_BLINK_INTERVAL_MS = 250;
export const AUTOPLAY_INTERVAL_MS = 500;

/** Mirrors a GLib GTimer: created on first use, then stopped and continued. */
interface ClockTimer {
  accumulated: number;
  startedAt: number | null;
}

export class Game {
  readonly tiles: Tile[];
  seed = -1;
  inspecting = false;
  currentMove = 1;
  selectedTile: Tile | null = null;
  hintMatch: Match | null = null;
  hintBlinkCounter = 0;

  private pausedValue = false;
  private random = new GRand(0);
  private hintMatches: Match[] = [];
  private hintMatchIndex = 0;
  private clockElapsed = 0;
  private clock: ClockTimer | null = null;

  constructor(readonly map: GameMap) {
    this.tiles = map.slots.map((slot) => new Tile(slot));
    this.createTileRelationships();
  }

  get started(): boolean {
    return this.clock !== null;
  }

  get elapsed(): number {
    if (!this.clock) {
      return 0;
    }
    const running = this.clock.startedAt === null ? 0 : (performance.now() - this.clock.startedAt) / 1000;
    return this.clockElapsed + this.clock.accumulated + running;
  }

  get paused(): boolean {
    return this.pausedValue;
  }

  setPaused(value: boolean): void {
    if (value === this.pausedValue) {
      return;
    }
    if (!this.started || this.inspecting || this.complete) {
      return;
    }
    this.pausedValue = value;
    if (value) {
      this.stopClock();
    } else {
      this.continueClock();
    }
    this.setSelectedTile(null);
    this.setHint(null);
  }

  pause(): void {
    this.setPaused(true);
  }

  resume(): void {
    this.setPaused(false);
  }

  get nTiles(): number {
    return this.tiles.length;
  }

  get complete(): boolean {
    return this.tiles.every((tile) => !tile.visible);
  }

  get movesLeft(): number {
    return this.findMatches().length;
  }

  get canMove(): boolean {
    return this.movesLeft !== 0;
  }

  get canShuffle(): boolean {
    let selectableTiles = 0;
    for (const tile of this.tiles) {
      if (tile.selectable && ++selectableTiles === 2) {
        return true;
      }
    }
    return false;
  }

  get canUndo(): boolean {
    return this.currentMove > 1;
  }

  get canRedo(): boolean {
    return this.tiles.some((tile) => tile.move >= this.currentMove);
  }

  get canSave(): boolean {
    return this.started && this.canMove && !this.inspecting;
  }

  get allTilesUnblocked(): boolean {
    return this.tiles.every((tile) => !tile.visible || tile.selectable);
  }

  setSelectedTile(tile: Tile | null): void {
    if (this.selectedTile) {
      this.selectedTile.highlighted = false;
    }
    this.selectedTile = tile;
    if (tile) {
      tile.highlighted = true;
    }
    this.hintMatches = [];
  }

  generate(seed = -1): void {
    this.seed = seed === -1
      ? crypto.getRandomValues(new Uint32Array(1))[0]! % 0x7fffffff
      : seed;
    const pairNumbers = Array.from({ length: this.tiles.length / 2 }, (_, i) => i * 2);

    this.pausedValue = false;
    this.resetClock();
    this.setSelectedTile(null);
    this.setHint(null);
    this.currentMove = 1;
    this.inspecting = false;
    for (const tile of this.tiles) {
      tile.number = -1;
      tile.visible = true;
      tile.move = 0;
      tile.highlighted = false;
    }

    this.random = new GRand(this.seed);
    this.chooseTilePairs(this.shufflePairNumbers(pairNumbers));
    for (const tile of this.tiles) {
      tile.visible = true;
      tile.move = 0;
    }
  }

  restart(): void {
    for (const tile of this.tiles) {
      tile.number = -1;
      tile.visible = true;
    }
    this.generate(this.seed);
  }

  getTile(position: number): Tile | undefined {
    return this.tiles[position];
  }

  removePair(tile0: Tile, tile1: Tile): boolean {
    if (!tile0.visible || !tile1.visible || tile0 === tile1 || !tile0.matches(tile1)) {
      return false;
    }

    this.setSelectedTile(null);
    this.setHint(null);
    for (const tile of this.tiles) {
      if (tile.move >= this.currentMove) {
        tile.move = 0;
      }
    }
    tile0.visible = false;
    tile0.move = this.currentMove;
    tile1.visible = false;
    tile1.move = this.currentMove;
    this.currentMove++;

    if (this.complete) {
      this.stopClock();
      this.inspecting = true;
    } else {
      this.startClock();
    }
    return true;
  }

  shuffleRemaining(): void {
    if (!this.canShuffle) {
      return;
    }

    const removedFaces = new Set<number>();
    const pairNumbers = new Set<number>();
    const tilesToShuffle: Tile[] = [];
    this.currentMove = 1;

    for (const tile of this.tiles) {
      tile.move = 0;
      if (tile.visible) {
        tilesToShuffle.push(tile);
      } else {
        removedFaces.add(Math.floor(tile.number / 4));
      }
    }

    for (const tile of tilesToShuffle) {
      const face = Math.floor(tile.number / 4);
      let pairNumber = tile.number - (tile.number % 2);
      tile.number = -1;
      if (removedFaces.has(face)) {
        pairNumber = face * 4;
      }
      pairNumbers.add(pairNumber);
    }

    this.chooseTilePairs(this.shufflePairNumbers([...pairNumbers]));
    for (const tile of tilesToShuffle) {
      tile.visible = true;
    }
    this.startClock();
    this.clockElapsed += 60;
  }

  undo(): void {
    if (!this.canUndo) {
      return;
    }
    this.setSelectedTile(null);
    this.setHint(null);
    this.currentMove--;
    for (const tile of this.tiles) {
      if (tile.move === this.currentMove) {
        tile.visible = true;
      }
    }
  }

  redo(): void {
    if (!this.canRedo) {
      return;
    }
    this.setSelectedTile(null);
    this.setHint(null);
    for (const tile of this.tiles) {
      if (tile.move === this.currentMove) {
        tile.visible = false;
      }
    }
    this.currentMove++;
  }

  nextHint(): Match | null {
    if (this.hintMatches.length === 0) {
      this.hintMatches = this.findMatchesForTile(this.selectedTile);
      if (this.hintMatches.length === 0) {
        this.hintMatches = this.findMatches();
      }
      if (this.hintMatches.length === 0) {
        return null;
      }
      this.hintMatchIndex = this.random.intRange(0, this.hintMatches.length);
    }

    this.hintMatchIndex++;
    if (this.hintMatchIndex >= this.hintMatches.length) {
      this.hintMatchIndex = 0;
    }
    return this.hintMatches[this.hintMatchIndex]!;
  }

  /** Shows the next hint; the caller drives blinking with `hintTick` every HINT_BLINK_INTERVAL_MS. */
  showHint(): Match | null {
    const match = this.nextHint();
    this.setHint(match);
    return match;
  }

  /** Advances the hint blink; returns false once blinking has finished. */
  hintTick(): boolean {
    if (this.hintBlinkCounter === 0) {
      this.removeHintBlink();
      return false;
    }
    this.hintBlinkCounter--;
    this.redrawHintMatch();
    return true;
  }

  /** Removes one pair as the original autoplay timer does; returns false when nothing is left. */
  autoplayStep(): boolean {
    const match = this.nextHint();
    if (!match) {
      return false;
    }
    this.removePair(match.tile0, match.tile1);
    return true;
  }

  restore(state: GameRestoreState): void {
    if (state.tiles.length !== this.tiles.length) {
      throw new Error('Saved game does not match the selected map.');
    }
    for (const tile of this.tiles) {
      const savedTile = state.tiles.find((candidate) => candidate.slot.equals(tile.slot));
      if (!savedTile) {
        throw new Error('Saved game does not contain every map tile.');
      }
      tile.number = savedTile.number;
      tile.visible = savedTile.visible;
      tile.move = savedTile.move;
      tile.highlighted = false;
    }
    this.seed = state.seed;
    this.currentMove = state.move;
    this.random = new GRand(state.seed);
    this.clock = { accumulated: 0, startedAt: null };
    this.clockElapsed = state.clock;
    this.setPaused(true);
  }

  private createTileRelationships(): void {
    for (const tile of this.tiles) {
      for (const other of this.tiles) {
        if (other === tile || other.slot.y < tile.slot.y - 1 || other.slot.y > tile.slot.y + 1) {
          continue;
        }
        if (other.slot.layer === tile.slot.layer) {
          if (other.slot.x === tile.slot.x - 2) {
            tile.left.push(other);
          }
          if (other.slot.x === tile.slot.x + 2) {
            tile.right.push(other);
          }
        } else if (other.slot.layer > tile.slot.layer &&
                   other.slot.x >= tile.slot.x - 1 && other.slot.x <= tile.slot.x + 1) {
          tile.above.push(other);
        }
      }
    }
  }

  private shufflePairNumbers(pairNumbers: number[]): number[] {
    for (let i = 0; i < pairNumbers.length; i++) {
      const n = this.random.intRange(i, pairNumbers.length);
      [pairNumbers[i], pairNumbers[n]] = [pairNumbers[n]!, pairNumbers[i]!];
    }
    return pairNumbers;
  }

  private chooseTilePairs(pairNumbers: number[], depth = 0, checkSelectable = true): boolean {
    if (depth === pairNumbers.length) {
      return true;
    }

    const matches = this.findMatches(checkSelectable);
    if (matches.length === 0) {
      return false;
    }

    const startIndex = this.random.intRange(0, matches.length);
    for (let i = 0; i < matches.length; i++) {
      const match = matches[(startIndex + i) % matches.length]!;
      match.tile0.visible = false;
      match.tile1.visible = false;

      if (this.chooseTilePairs(pairNumbers, depth + 1, checkSelectable)) {
        const number = pairNumbers[depth]!;
        match.tile0.number = number;
        match.tile1.number = number + 1;
        return true;
      }

      if (checkSelectable && depth === 0 && i === matches.length - 1) {
        checkSelectable = false;
        i--;
      }
      match.tile0.visible = true;
      match.tile1.visible = true;
    }
    return false;
  }

  private findMatches(checkSelectable = true): Match[] {
    const matches: Match[] = [];
    const processedTiles: Tile[] = [];
    for (const tile of this.tiles) {
      const submatches = this.findMatchesForTile(tile, processedTiles, checkSelectable);
      matches.push(...submatches);
      if (submatches.length > 0) {
        processedTiles.push(tile);
      }
    }
    return matches;
  }

  private findMatchesForTile(
    tile: Tile | null,
    ignoredTiles: readonly Tile[] = [],
    checkSelectable = true,
  ): Match[] {
    if (!tile || !tile.visible || (checkSelectable && !tile.selectable)) {
      return [];
    }
    const matches: Match[] = [];
    for (const other of this.tiles) {
      if (other === tile || !other.visible || !other.matches(tile)) {
        continue;
      }
      if ((!checkSelectable || other.selectable) && !ignoredTiles.includes(other)) {
        matches.push(new Match(other, tile));
      }
    }
    return matches;
  }

  private setHint(match: Match | null): void {
    this.removeHintBlink();
    if (!match) {
      this.hintMatch = null;
      this.hintMatches = [];
      return;
    }

    this.hintMatch = match;
    this.hintBlinkCounter = HINT_BLINK_COUNT;
    this.hintTick();
    if (this.inspecting) {
      return;
    }
    this.startClock();
    this.clockElapsed += 30;
  }

  private removeHintBlink(): void {
    this.hintBlinkCounter = 0;
    this.redrawHintMatch();
  }

  private redrawHintMatch(): void {
    const match = this.hintMatch;
    if (!match) {
      return;
    }
    const blinkOn = this.hintBlinkCounter % 2 !== 0;
    match.tile0.highlighted = blinkOn || match.tile0 === this.selectedTile;
    match.tile1.highlighted = blinkOn || match.tile1 === this.selectedTile;
  }

  private startClock(): void {
    if (this.clock) {
      return;
    }
    this.clock = { accumulated: 0, startedAt: performance.now() };
  }

  private stopClock(): void {
    if (this.clock?.startedAt != null) {
      this.clock.accumulated += (performance.now() - this.clock.startedAt) / 1000;
      this.clock.startedAt = null;
    }
  }

  private continueClock(): void {
    if (!this.clock) {
      this.clock = { accumulated: 0, startedAt: performance.now() };
    } else if (this.clock.startedAt === null) {
      this.clock.startedAt = performance.now();
    }
  }

  private resetClock(): void {
    this.stopClock();
    this.clock = null;
    this.clockElapsed = 0;
  }
}
