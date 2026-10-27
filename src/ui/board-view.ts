// SPDX-FileCopyrightText: 2010-2026 Mahjongg Contributors
// SPDX-FileCopyrightText: 2010-2013 Robert Ancell
// SPDX-License-Identifier: GPL-3.0-or-later

import postmodernUrl from '../assets/themes/postmodern.svg?url';
import { AUTOPLAY_INTERVAL_MS, HINT_BLINK_INTERVAL_MS, type Game, type Match, type Tile } from '../core/game';
import type { GameMap } from '../core/map';
import { BLANK_FACE, getSheetColumn, getTileFace, type TileOrderId } from '../tile-order';

export interface BoardLayout {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  tileWidth: number;
  tileHeight: number;
  layerOffsetX: number;
  layerOffsetY: number;
  patternWidth: number;
  patternHeight: number;
  renderedThemeWidth: number;
  renderedThemeHeight: number;
}

export interface TileBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardViewOptions {
  themeUrl?: string;
  /** Called after any visible state change (selection, hint blink, pause). */
  onChange?: () => void;
  /** Called after a pair was removed, like the original `moved` signal. */
  onMoved?: () => void;
  /** Equivalent of the original `attempt_move` signal; return false to swallow the click. */
  attemptMove?: () => boolean;
}

const TILE_SHAKE_DURATION_MS = 250;
const TILE_SHAKE_FREQUENCY = 6;
const MIN_TILE_SHAKE_AMPLITUDE = 3;
const TILE_SHAKE_SCALE_FACTOR = 0.04;
const TILE_FADE_DURATION_MS = 280;
const HINT_PULSE_PERIOD_MS = 2 * HINT_BLINK_INTERVAL_MS;
const MAX_ZOOM = 4;
const DRAG_THRESHOLD_PX = 8;
const DOUBLE_TAP_MS = 350;

interface PinchGesture {
  distance: number;
  midX: number;
  midY: number;
  zoom: number;
  panX: number;
  panY: number;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function calculateBoardLayout(
  map: GameMap,
  width: number,
  height: number,
  themeWidth: number,
  themeHeight: number,
): BoardLayout {
  if (![width, height, themeWidth, themeHeight].every(Number.isFinite) ||
      width <= 0 || height <= 0 || themeWidth <= 0 || themeHeight <= 0) {
    throw new RangeError('Board and theme dimensions must be positive finite values.');
  }

  const aspect = (themeHeight / 2) / (themeWidth / 43);
  const horizontalBorder = width / 220;
  const verticalBorder = height / 560;
  // The width/height getters compute the overhangs, as in map.vala, so read them first.
  const mapUnitsWide = map.width;
  const mapUnitsHigh = map.height;
  // game-view.vala divides the overhangs with integer arithmetic.
  const hOverhangUnits = Math.trunc(map.hOverhang / 4);
  const vOverhangUnits = Math.trunc(map.vOverhang / 4);
  const mapWidth = mapUnitsWide + hOverhangUnits + horizontalBorder;
  const mapHeight = (mapUnitsHigh + vOverhangUnits + verticalBorder) * aspect;
  const unitWidth = Math.floor(Math.min(width / mapWidth, height / mapHeight));
  const unitHeight = Math.floor(unitWidth * aspect);
  const tileWidth = unitWidth * 2;
  const tileHeight = unitHeight * 2;
  const layerOffsetX = Math.floor(tileWidth / 7);
  const layerOffsetY = Math.floor(tileHeight / 10);
  const patternWidth = tileWidth + layerOffsetX;
  const patternHeight = tileHeight + layerOffsetY;

  return {
    width,
    height,
    offsetX: Math.trunc(Math.trunc(width - (mapUnitsWide + hOverhangUnits) * unitWidth) / 2),
    offsetY: Math.trunc(
      Math.trunc(height - (mapUnitsHigh * unitHeight - Math.trunc(map.vOverhang * unitHeight / 8))) / 2,
    ),
    tileWidth,
    tileHeight,
    layerOffsetX,
    layerOffsetY,
    patternWidth,
    patternHeight,
    renderedThemeWidth: patternWidth * 43,
    renderedThemeHeight: patternHeight * 2,
  };
}

export function getTileBounds(tile: Tile, layout: BoardLayout): TileBounds {
  return {
    x: layout.offsetX + tile.slot.x * layout.tileWidth / 2 + tile.slot.layer * layout.layerOffsetX,
    y: layout.offsetY + tile.slot.y * layout.tileHeight / 2 - tile.slot.layer * layout.layerOffsetY,
    width: layout.patternWidth,
    height: layout.patternHeight,
  };
}

export function hitTestTile(
  game: Game,
  layout: BoardLayout,
  x: number,
  y: number,
): Tile | null {
  let topmost: Tile | null = null;
  for (const tile of game.tiles) {
    if (!tile.visible) {
      continue;
    }
    const bounds = getTileBounds(tile, layout);
    if (x >= bounds.x && x <= bounds.x + bounds.width &&
        y >= bounds.y && y <= bounds.y + bounds.height) {
      topmost = tile;
    }
  }
  return topmost;
}

/** Sheet column of a dealt tile number in a tileset with the given tile order. */
export function getSpriteIndex(number: number, order: TileOrderId): number {
  return getSheetColumn(getTileFace(number), order);
}

export class BoardView {
  private readonly context: CanvasRenderingContext2D;
  private readonly image = new Image();
  /** The built-in default sheet uses the GNOME Mahjongg order. */
  private tileOrder: TileOrderId = 'gnome';
  private readonly resizeObserver: ResizeObserver;
  private readonly onChange: () => void;
  private readonly onMoved: () => void;
  private readonly attemptMove: () => boolean;
  private layout: BoardLayout | null = null;
  private animationFrame = 0;
  private hintInterval = 0;
  private autoplayInterval = 0;
  private effectFrame = 0;
  private disposed = false;
  /** Tiles drawn in the previous frame, used to start the fade-out of removed pairs. */
  private readonly shownTiles = new Set<Tile>();
  private readonly fadingTiles = new Map<Tile, number>();
  private hintStart = 0;
  private tileCache: HTMLCanvasElement | null = null;
  private tileCacheValid = false;
  private cssWidth = 0;
  private cssHeight = 0;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: PinchGesture | null = null;
  private drag: { x: number; y: number; panX: number; panY: number; moved: boolean } | null = null;
  private suppressClick = false;
  private lastEmptyClick = -Infinity;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly game: Game,
    options: BoardViewOptions = {},
  ) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D rendering is unavailable.');
    }
    this.context = context;
    this.onChange = options.onChange ?? (() => {});
    this.onMoved = options.onMoved ?? (() => {});
    this.attemptMove = options.attemptMove ?? (() => true);
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'Mahjongg game board');
    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('keydown', this.onKeyDown);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    for (const tile of game.tiles) {
      if (tile.visible) {
        this.shownTiles.add(tile);
      }
    }

    this.image.addEventListener('load', this.resize);
    this.image.src = options.themeUrl ?? postmodernUrl;
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  async setTheme(themeUrl: string, tileOrder: TileOrderId): Promise<void> {
    const image = new Image();
    image.src = themeUrl;
    await image.decode();
    const tileAspect = (image.naturalWidth / 43) / (image.naturalHeight / 2);
    if (Math.abs(tileAspect - 64 / 88) / (64 / 88) > 0.01) {
      throw new Error('Theme sprite sheets must use the GNOME Mahjongg aspect ratio.');
    }
    this.image.src = themeUrl;
    await this.image.decode();
    this.tileOrder = tileOrder;
    this.resize();
  }

  render = (): void => {
    this.draw(false);
  };

  /** Draws the board; `reuseTiles` repaints only the glows over the cached tiles of the last full draw. */
  private draw(reuseTiles: boolean): void {
    if (this.disposed) {
      return;
    }
    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const now = performance.now();
    const reducedMotion = prefersReducedMotion();
    if (!reuseTiles) {
      this.trackRemovedTiles(now, reducedMotion);
    }
    if (!this.layout || !this.image.complete || this.image.naturalWidth === 0) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const paused = this.game.paused;
    const hint = !paused && this.game.hintBlinkCounter > 0 ? this.game.hintMatch : null;
    const selected = this.game.selectedTile;
    const pulsing = hint !== null && !reducedMotion;
    if (reuseTiles && this.tileCache) {
      context.drawImage(this.tileCache, 0, 0);
      context.setTransform(ratio * this.zoom, 0, 0, ratio * this.zoom, ratio * this.panX, ratio * this.panY);
    } else {
      context.setTransform(ratio * this.zoom, 0, 0, ratio * this.zoom, ratio * this.panX, ratio * this.panY);
      this.drawTiles(now, hint, selected);
      this.tileCacheValid = pulsing && this.fadingTiles.size === 0 && this.cacheTiles();
    }

    if (!paused) {
      if (selected?.visible) {
        this.drawGlow(selected, 1);
      }
      if (hint) {
        const pulse = reducedMotion
          ? 1
          : 0.5 - 0.5 * Math.cos(2 * Math.PI * (now - this.hintStart) / HINT_PULSE_PERIOD_MS);
        for (const tile of [hint.tile0, hint.tile1]) {
          if (tile !== selected && tile.visible) {
            this.drawGlow(tile, 0.25 + 0.75 * pulse);
          }
        }
      }
    }
    if (this.fadingTiles.size > 0 || pulsing) {
      this.scheduleEffectFrame();
    }
  }

  private drawTiles(now: number, hint: Match | null, selected: Tile | null): void {
    const context = this.context;
    const layout = this.layout!;
    const paused = this.game.paused;
    const sourceWidth = this.image.naturalWidth / 43;
    const sourceHeight = this.image.naturalHeight / 2;
    for (const tile of this.game.tiles) {
      const fadeStart = this.fadingTiles.get(tile);
      if (!tile.visible && fadeStart === undefined) {
        continue;
      }
      const bounds = getTileBounds(tile, layout);
      const sprite = paused ? getSheetColumn(BLANK_FACE, this.tileOrder) : getSpriteIndex(tile.number, this.tileOrder);
      // Hint tiles pulse through their glow instead of blinking the highlighted sprite.
      const isHint = hint !== null && (tile === hint.tile0 || tile === hint.tile1);
      const highlighted = isHint ? tile === selected : tile.highlighted;
      context.save();
      if (fadeStart !== undefined) {
        const progress = Math.min(1, (now - fadeStart) / TILE_FADE_DURATION_MS);
        const scale = 1 - 0.25 * progress;
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        context.globalAlpha = 1 - progress;
        context.translate(centerX, centerY);
        context.scale(scale, scale);
        context.translate(-centerX, -centerY);
      }
      context.drawImage(
        this.image,
        sprite * sourceWidth,
        (highlighted ? 1 : 0) * sourceHeight,
        sourceWidth,
        sourceHeight,
        bounds.x + tile.shakeOffset,
        bounds.y,
        bounds.width,
        bounds.height,
      );
      context.restore();
    }
  }

  /** Copies the freshly drawn tiles so hint pulse frames do not redraw the whole board. */
  private cacheTiles(): boolean {
    this.tileCache ??= document.createElement('canvas');
    const cache = this.tileCache;
    if (cache.width !== this.canvas.width || cache.height !== this.canvas.height) {
      cache.width = this.canvas.width;
      cache.height = this.canvas.height;
    }
    const context = cache.getContext('2d');
    if (!context) {
      return false;
    }
    context.clearRect(0, 0, cache.width, cache.height);
    context.drawImage(this.canvas, 0, 0);
    return true;
  }

  /** True when the board is zoomed in by a pinch or Ctrl+wheel gesture. */
  get zoomed(): boolean {
    return this.zoom > 1;
  }

  get autoplaying(): boolean {
    return this.autoplayInterval !== 0;
  }

  resetZoom(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.render();
  }

  private trackRemovedTiles(now: number, reducedMotion: boolean): void {
    const animate = !reducedMotion && !this.game.paused;
    for (const tile of this.game.tiles) {
      if (tile.visible) {
        this.shownTiles.add(tile);
        this.fadingTiles.delete(tile);
      } else if (this.shownTiles.delete(tile) && animate) {
        this.fadingTiles.set(tile, now);
      }
    }
    for (const [tile, start] of this.fadingTiles) {
      if (now - start >= TILE_FADE_DURATION_MS) {
        this.fadingTiles.delete(tile);
      }
    }
  }

  /** Draws a soft glowing outline around the face of a tile. */
  private drawGlow(tile: Tile, strength: number): void {
    const layout = this.layout!;
    const bounds = getTileBounds(tile, layout);
    const x = bounds.x + layout.layerOffsetX + tile.shakeOffset;
    const width = layout.tileWidth;
    const height = layout.tileHeight;
    const radius = width * 0.12;
    const context = this.context;
    const lineWidth = Math.max(2, width * 0.05);
    context.save();
    context.beginPath();
    if (typeof context.roundRect === 'function') {
      context.roundRect(x, bounds.y, width, height, radius);
    } else {
      context.rect(x, bounds.y, width, height);
    }
    // Layered translucent strokes give a soft glow far more cheaply than shadowBlur.
    for (const [scale, alpha] of [[5, 0.12], [3, 0.25], [1, 1]] as const) {
      context.globalAlpha = strength * alpha;
      context.strokeStyle = '#ffcf4a';
      context.lineWidth = lineWidth * scale;
      context.stroke();
    }
    context.restore();
  }

  private scheduleEffectFrame(): void {
    if (this.effectFrame === 0 && !this.disposed) {
      this.effectFrame = requestAnimationFrame(() => {
        this.effectFrame = 0;
        this.draw(this.tileCacheValid && this.fadingTiles.size === 0);
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.image.removeEventListener('load', this.resize);
    if (this.animationFrame !== 0) {
      cancelAnimationFrame(this.animationFrame);
    }
    if (this.effectFrame !== 0) {
      cancelAnimationFrame(this.effectFrame);
    }
    this.stopHintBlink();
    this.stopAutoplay();
  }

  private resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || this.canvas.clientWidth;
    const height = rect.height || this.canvas.clientHeight;
    if (width <= 0 || height <= 0) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.cssWidth = width;
    this.cssHeight = height;
    this.tileCacheValid = false;
    this.clampPan();
    this.layout = calculateBoardLayout(
      this.game.map,
      width,
      height,
      this.image.naturalWidth || 43,
      this.image.naturalHeight || 2,
    );
    this.render();
  };

  private onClick = (event: MouseEvent): void => {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    if (this.game.inspecting || !this.attemptMove() || this.game.paused) {
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const tile = this.layout
      ? hitTestTile(
        this.game,
        this.layout,
        (event.clientX - rect.left - this.panX) / this.zoom,
        (event.clientY - rect.top - this.panY) / this.zoom,
      )
      : null;
    if (!tile) {
      // Touch browsers do not always report a double tap through `detail`.
      const doubleTap = event.detail === 2 || event.timeStamp - this.lastEmptyClick < DOUBLE_TAP_MS;
      this.lastEmptyClick = doubleTap ? -Infinity : event.timeStamp;
      if (doubleTap) {
        if (this.game.allTilesUnblocked) {
          this.autoplay();
        } else if (this.zoomed) {
          this.resetZoom();
        }
      }
      return;
    }
    this.selectTile(tile);
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (this.pointers.size === 0) {
      this.suppressClick = false;
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already released pointers cannot be captured; tracking still works.
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const rect = this.canvas.getBoundingClientRect();
      this.pinch = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        midX: (a.x + b.x) / 2 - rect.left,
        midY: (a.y + b.y) / 2 - rect.top,
        zoom: this.zoom,
        panX: this.panX,
        panY: this.panY,
      };
      this.drag = null;
      this.suppressClick = true;
    } else if (this.pointers.size === 1) {
      this.drag = { x: event.clientX, y: event.clientY, panX: this.panX, panY: this.panY, moved: false };
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) {
      return;
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const rect = this.canvas.getBoundingClientRect();
      const zoom = Math.min(MAX_ZOOM, Math.max(1,
        this.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.distance));
      // Keep the board point that started under the fingers' midpoint under the current midpoint.
      const boardX = (this.pinch.midX - this.pinch.panX) / this.pinch.zoom;
      const boardY = (this.pinch.midY - this.pinch.panY) / this.pinch.zoom;
      this.zoom = zoom;
      this.panX = (a.x + b.x) / 2 - rect.left - boardX * zoom;
      this.panY = (a.y + b.y) / 2 - rect.top - boardY * zoom;
      this.clampPan();
      this.render();
      return;
    }
    const drag = this.drag;
    if (!drag || this.zoom <= 1) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
      return;
    }
    drag.moved = true;
    this.suppressClick = true;
    this.panX = drag.panX + dx;
    this.panY = drag.panY + dy;
    this.clampPan();
    this.render();
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) {
      this.pinch = null;
    }
    const remaining = [...this.pointers.values()][0];
    // Continue panning with the finger left after a pinch without jumping.
    this.drag = remaining && this.pointers.size === 1
      ? { x: remaining.x, y: remaining.y, panX: this.panX, panY: this.panY, moved: true }
      : null;
  };

  /** Ctrl+wheel, which is also how touchpads report pinch gestures. */
  private onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const zoom = Math.min(MAX_ZOOM, Math.max(1, this.zoom * Math.exp(-event.deltaY * 0.01)));
    this.panX = x - (x - this.panX) * zoom / this.zoom;
    this.panY = y - (y - this.panY) * zoom / this.zoom;
    this.zoom = zoom;
    this.clampPan();
    this.render();
  };

  private clampPan(): void {
    this.panX = Math.min(0, Math.max(this.cssWidth * (1 - this.zoom), this.panX));
    this.panY = Math.min(0, Math.max(this.cssHeight * (1 - this.zoom), this.panY));
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.game.paused || this.game.inspecting) {
      return;
    }
    if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const selectable = this.game.tiles.filter((tile) => tile.visible && tile.selectable);
      if (selectable.length === 0) {
        return;
      }
      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const currentIndex = selectable.indexOf(this.game.selectedTile!);
      const nextIndex = currentIndex < 0
        ? (direction > 0 ? 0 : selectable.length - 1)
        : (currentIndex + direction + selectable.length) % selectable.length;
      this.game.setSelectedTile(selectable[nextIndex]!);
      this.render();
      this.onChange();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (this.game.selectedTile) {
        this.selectTile(this.game.selectedTile);
        event.preventDefault();
      }
    }
  };

  private selectTile(tile: Tile): void {
    if (!tile.selectable) {
      this.shake(tile);
      return;
    }
    const selected = this.game.selectedTile;
    let moved = false;
    if (!selected || selected === tile) {
      this.game.setSelectedTile(selected === tile ? null : tile);
    } else if (selected.matches(tile)) {
      moved = this.game.removePair(selected, tile);
    } else {
      this.game.setSelectedTile(tile);
    }
    this.render();
    this.onChange();
    if (moved) {
      this.onMoved();
    }
  }

  private shake(tile: Tile): void {
    if (this.animationFrame !== 0) {
      return;
    }
    tile.shaking = true;
    const start = performance.now();
    const animate = (now: number): void => {
      const elapsed = now - start;
      if (elapsed > TILE_SHAKE_DURATION_MS) {
        tile.shaking = false;
        tile.shakeOffset = 0;
        this.animationFrame = 0;
        this.render();
        return;
      }
      const amplitude = Math.max(MIN_TILE_SHAKE_AMPLITUDE, (this.layout?.tileWidth ?? 0) * TILE_SHAKE_SCALE_FACTOR);
      tile.shakeOffset = Math.trunc(amplitude * Math.sin(2 * Math.PI * TILE_SHAKE_FREQUENCY * elapsed / 1000));
      this.render();
      this.animationFrame = requestAnimationFrame(animate);
    };
    this.animationFrame = requestAnimationFrame(animate);
  }

  showHint(): void {
    this.game.showHint();
    this.hintStart = performance.now();
    this.stopHintBlink();
    if (this.game.hintBlinkCounter > 0) {
      this.hintInterval = window.setInterval(() => {
        if (!this.game.hintTick()) {
          this.stopHintBlink();
        }
        this.render();
      }, HINT_BLINK_INTERVAL_MS);
    }
    this.render();
    this.onChange();
  }

  /** Port of Game.autoplay_end_game (): removes one pair now and one every 500 ms. */
  autoplay(): void {
    if (!this.game.allTilesUnblocked || this.autoplayInterval !== 0) {
      return;
    }
    if (!this.autoplayStep()) {
      return;
    }
    this.autoplayInterval = window.setInterval(() => {
      if (!this.autoplayStep()) {
        this.stopAutoplay();
      }
    }, AUTOPLAY_INTERVAL_MS);
  }

  private autoplayStep(): boolean {
    const moved = this.game.autoplayStep();
    this.render();
    this.onChange();
    if (moved) {
      this.onMoved();
    }
    return moved;
  }

  private stopHintBlink(): void {
    if (this.hintInterval !== 0) {
      window.clearInterval(this.hintInterval);
      this.hintInterval = 0;
    }
  }

  private stopAutoplay(): void {
    if (this.autoplayInterval !== 0) {
      window.clearInterval(this.autoplayInterval);
      this.autoplayInterval = 0;
    }
  }
}
