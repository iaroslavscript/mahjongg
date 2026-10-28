// SPDX-FileCopyrightText: 2010-2026 Mahjongg Contributors
// SPDX-FileCopyrightText: 2010-2013 Robert Ancell
// SPDX-License-Identifier: GPL-3.0-or-later

// Port of the application flow in gnome-mahjongg.vala and window.vala.

import { loadBuiltInMaps } from '../core/builtin-layouts';
import { Game } from '../core/game';
import { History } from '../core/history';
import { getNextMap, type GameMap } from '../core/map';
import {
  deleteGameSave,
  exportGameSave,
  importGameSave,
  loadGameSave,
  restoreGame,
  saveGame,
} from '../core/save';
import { LayoutLibrary } from '../layouts';
import type { InstallApp } from '../pwa';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from '../settings';
import { ThemeLibrary, type ImportedTheme } from '../themes';
import { chooseAlert } from './alert-dialog';
import { BoardView } from './board-view';
import { downloadFile, element, pickFile } from './dom';
import { icon } from './icons';
import { LayoutPicker } from './layout-picker';
import { MainMenu } from './main-menu';
import { PauseOverlay } from './pause-overlay';
import { PreferencesDialog } from './prefs';
import { createAboutDialog, RulesDialog } from './rules';
import { ScoresDialog } from './scores-dialog';
import { createShortcutsDialog, shortcutForEvent } from './shortcuts';
import { TileOrderDialog } from './tile-order-dialog';
import { ToastHost } from './toast';

const FIRST_RUN_TIP = 'Match pairs of identical free tiles to clear the board.';
const FIRST_RUN_KEY = 'mahjongg-first-run-tip';

export class AppShell {
  /** Built-in layouts followed by imported ones; shared with the dialogs and updated in place. */
  private readonly maps: GameMap[] = loadBuiltInMaps();
  private readonly history = new History();
  private readonly themes = new ThemeLibrary();
  private readonly layouts = new LayoutLibrary();
  private readonly pauseOverlay = new PauseOverlay();
  private readonly preferences: PreferencesDialog;
  private readonly scores: ScoresDialog;
  private readonly rules = new RulesDialog();
  private readonly tileOrder: TileOrderDialog;
  private readonly shortcutsDialog = createShortcutsDialog();
  private readonly aboutDialog = createAboutDialog({
    version: __APP_VERSION__,
    commit: __APP_COMMIT__,
    commitDirty: __APP_COMMIT_DIRTY__,
  });
  private readonly toasts = new ToastHost();
  private readonly menu = new MainMenu();
  private readonly layoutPicker: LayoutPicker;
  private readonly clockLabel: HTMLElement;
  private readonly tilesLabel: HTMLElement;
  private readonly movesLabel: HTMLElement;
  private readonly finishChip: HTMLButtonElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly importInput: HTMLInputElement;
  private themeCleanup: (() => void) | undefined;
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private game!: Game;
  private board!: BoardView;
  private updateHandler: ((reloadPage?: boolean) => Promise<void>) | undefined;
  private installHandler: InstallApp | null = null;
  private timer = 0;
  private handledGame: Game | null = null;
  /** True while the game is paused only because a dialog is visible (window.vala). */
  private pausedForDialog = false;

  constructor(private readonly root: HTMLElement) {
    if (this.maps.length !== 10) {
      throw new Error(`Expected 10 built-in layouts, found ${this.maps.length}.`);
    }
    root.innerHTML = `
      <div class="app-shell">
        <div id="update-banner" class="update-banner" role="status" hidden>
          <span>A new version is ready.</span>
          <button data-action="pwa-update">Update now</button>
          <button data-action="dismiss-update">Later</button>
        </div>
        <header class="app-header">
          <h1 class="visually-hidden">Mahjongg</h1>
          <button class="layout-button" data-action="layouts" aria-haspopup="dialog" title="Choose Layout">
            <span class="visually-hidden">Layout: </span><span id="layout-name"></span>${icon('chevron-down')}
          </button>
          <div class="game-stats">
            <span class="stat" title="Elapsed time">${icon('timer')}<strong id="clock">00:00</strong></span>
            <span class="stat" title="Tiles left">${icon('layers')}<strong id="tiles-left">0</strong><span class="stat-label">tiles</span></span>
            <span class="stat" title="Moves left">${icon('copy')}<strong id="moves-left">0</strong><span class="stat-label">moves</span></span>
          </div>
          <nav class="header-actions" aria-label="Game controls">
            <button class="icon-button" data-action="undo" aria-label="Undo" title="Undo (Ctrl+Z)">${icon('undo-2')}</button>
            <button class="icon-button" data-action="redo" aria-label="Redo" title="Redo (Shift+Ctrl+Z)">${icon('redo-2')}</button>
            <button class="icon-button" data-action="hint" aria-label="Hint" title="Show Hint (Ctrl+H)">${icon('lightbulb')}</button>
            <button class="icon-button" data-action="pause" aria-label="Pause" title="Pause Game (Esc)">${icon('pause')}</button>
          </nav>
        </header>
        <main class="game-main">
          <div class="board-frame">
            <canvas id="board" aria-label="Mahjongg game board"></canvas>
            <button class="finish-chip" data-action="autoplay" title="Remove the remaining pairs automatically (or double-click the board)" hidden>${icon('sparkles')}<span>Auto-finish</span></button>
          </div>
        </main>
        <input id="import-input" type="file" accept=".xml,application/xml,text/xml" hidden />
      </div>
    `;

    const shell = element<HTMLElement>(root, '.app-shell');
    this.tileOrder = new TileOrderDialog(this.themes, {
      present: this.present,
      onChanged: this.onTileOrderChanged,
      onError: this.showError,
    });
    this.preferences = new PreferencesDialog(this.maps, this.themes, this.layouts, {
      present: this.present,
      onSave: (settings) => void this.applyPreferences(settings).catch(this.showError),
      onThemeImported: (theme) => void this.onThemeImported(theme).catch(this.showError),
      onEditTileOrder: (id) => void this.tileOrder.open(id).catch(this.showError),
      onThemeDeleted: (id) => void this.onThemeDeleted(id).catch(this.showError),
      onLayoutsImported: this.onLayoutsImported,
      onLayoutDeleted: (map) => void this.onLayoutDeleted(map).catch(this.showError),
      onError: this.showError,
    });
    this.scores = new ScoresDialog(this.maps, this.history, {
      present: this.present,
      onNewGame: () => void this.newGame().catch(this.showError),
      onChangeLayout: () => this.layoutPicker.show(this.settings.mapset),
      onPlayerRenamed: (player) => {
        this.settings.playerName = player;
        saveSettings(this.settings);
      },
      onError: this.showError,
    });
    this.layoutPicker = new LayoutPicker(this.maps, this.history, {
      present: this.present,
      onSelect: (scoreName) => void this.selectLayout(scoreName).catch(this.showError),
    });
    element(root, '.board-frame').append(this.pauseOverlay.element);
    element(root, '.header-actions').append(this.menu.element);
    shell.append(
      this.toasts.element,
      this.layoutPicker.dialog,
      this.preferences.dialog,
      this.scores.dialog,
      this.rules.dialog,
      this.tileOrder.dialog,
      this.shortcutsDialog,
      this.aboutDialog,
    );

    this.clockLabel = element(root, '#clock');
    this.tilesLabel = element(root, '#tiles-left');
    this.movesLabel = element(root, '#moves-left');
    this.finishChip = element(root, '.finish-chip');
    this.canvas = element(root, '#board');
    this.importInput = element(root, '#import-input');

    root.addEventListener('click', this.onClick);
    this.importInput.addEventListener('change', this.onImportInput);
    window.addEventListener('keydown', this.onShortcut);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  setUpdateHandler(handler: (reloadPage?: boolean) => Promise<void>): void {
    this.updateHandler = handler;
  }

  /** Shows the "Install App" menu entry while the browser allows installing from the page. */
  setInstallHandler(handler: InstallApp | null): void {
    this.installHandler = handler;
    this.menu.item('install').hidden = handler === null;
  }

  notifyUpdateAvailable(): void {
    element<HTMLElement>(this.root, '#update-banner').hidden = false;
  }

  notifyOfflineReady(): void {
    this.toasts.show('Mahjongg is ready to play offline.');
  }

  async start(): Promise<void> {
    try {
      this.settings = loadSettings();
    } catch (error) {
      this.showError(error);
      this.settings = { ...DEFAULT_SETTINGS };
      saveSettings(this.settings);
    }
    await this.history.load();
    this.maps.push(...await this.layouts.loadMaps(this.showError));
    const themes = await this.preferences.refreshThemes(this.settings.tileset);
    if (!themes.some((theme) => theme.id === this.settings.tileset)) {
      this.showError(new Error(`Saved tileset "${this.settings.tileset}" is unavailable; using Postmodern.`));
      this.settings.tileset = 'postmodern';
      saveSettings(this.settings);
    }
    this.applyBackground();

    let saved = null;
    try {
      saved = await loadGameSave(this.maps);
    } catch (error) {
      this.showError(error);
      await deleteGameSave();
    }

    if (saved) {
      const map = this.maps.find((candidate) => candidate.name === saved.mapName)!;
      this.setMapset(map);
      const game = new Game(map);
      restoreGame(game, saved);
      await this.setGame(game);
      this.toasts.show('Saved game restored and paused.', { id: 'restored' });
    } else {
      await this.newGame(this.settings.mapRotation === 'random', false);
      this.showFirstRunTip();
    }
    this.timer = window.setInterval(this.updateClock, 500);
  }

  dispose(): void {
    this.board?.dispose();
    this.themeCleanup?.();
    window.clearInterval(this.timer);
    this.menu.dispose();
    this.root.removeEventListener('click', this.onClick);
    this.importInput.removeEventListener('change', this.onImportInput);
    window.removeEventListener('keydown', this.onShortcut);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Mahjongg.new_game (): always discards the save and picks the next layout. */
  private async newGame(rotateMap = true, deleteSave = true): Promise<void> {
    if (deleteSave) {
      await deleteGameSave();
    }
    const game = new Game(this.nextMap(rotateMap));
    game.generate();
    await this.setGame(game);
  }

  /** Replaces the original permanent status line with a one-time tip. */
  private showFirstRunTip(): void {
    try {
      if (localStorage.getItem(FIRST_RUN_KEY)) {
        return;
      }
      localStorage.setItem(FIRST_RUN_KEY, '1');
    } catch {
      return;
    }
    this.toasts.show(FIRST_RUN_TIP, { duration: 6000 });
  }

  /** Mahjongg.next_map (). */
  private nextMap(rotateMap: boolean): GameMap {
    let map = this.maps.find((candidate) => candidate.scoreName === this.settings.mapset) ?? this.maps[0]!;
    if (rotateMap) {
      if (this.settings.mapRotation === 'sequential') {
        map = getNextMap(this.maps, map);
      } else if (this.settings.mapRotation === 'random') {
        map = this.maps[crypto.getRandomValues(new Uint32Array(1))[0]! % this.maps.length]!;
      }
    }
    this.setMapset(map);
    return map;
  }

  private onLayoutsImported = (maps: GameMap[]): void => {
    this.maps.push(...maps);
    this.toasts.show(maps.length === 1 ? `Loaded layout ${maps[0]!.name}.` : `Loaded ${maps.length} layouts.`);
  };

  private async onLayoutDeleted(map: GameMap): Promise<void> {
    this.maps.splice(this.maps.indexOf(map), 1);
    if (this.settings.mapset === map.scoreName) {
      this.settings.mapset = this.maps[0]!.scoreName;
      saveSettings(this.settings);
    }
    if (this.game.map === map) {
      await this.newGame(false);
    }
    this.toasts.show(`Deleted layout ${map.name}.`);
  }

  private setMapset(map: GameMap): void {
    if (this.settings.mapset !== map.scoreName) {
      this.settings.mapset = map.scoreName;
      saveSettings(this.settings);
    }
  }

  private async setGame(game: Game): Promise<void> {
    this.board?.dispose();
    this.game = game;
    this.handledGame = null;
    this.pausedForDialog = false;
    this.toasts.dismiss('no-moves');
    this.board = new BoardView(this.canvas, game, {
      onChange: this.refresh,
      onMoved: this.onMoved,
      attemptMove: this.attemptMove,
    });
    for (const dialog of this.root.querySelectorAll<HTMLDialogElement>('dialog[open]')) {
      dialog.close();
    }
    this.canvas.focus({ preventScroll: true });
    this.refresh();
    await this.applyTheme();
  }

  private async applyTheme(): Promise<void> {
    const targetBoard = this.board;
    const theme = await this.themes.load(this.settings.tileset);
    try {
      await targetBoard.setTheme(theme.url, theme.tileOrder);
      if (targetBoard !== this.board) {
        theme.release?.();
        return;
      }
      this.rules.setTileset(theme.url, theme.name, theme.tileOrder);
      this.themeCleanup?.();
      this.themeCleanup = theme.release;
    } catch (error) {
      theme.release?.();
      throw error;
    }
  }

  private applyBackground(): void {
    element<HTMLElement>(this.root, '.app-shell').dataset.background = this.settings.backgroundColor;
  }

  /** Mahjongg.attempt_move_cb (): a click on a paused board resumes the game. */
  private attemptMove = (): boolean => {
    if (this.game.paused) {
      this.pausedForDialog = false;
      this.game.setPaused(false);
      this.refresh();
      return false;
    }
    return true;
  };

  /** Mahjongg.moved_cb (). */
  private onMoved = (): void => {
    this.refresh();
    if (this.game.complete) {
      if (this.handledGame !== this.game) {
        this.handledGame = this.game;
        void this.recordWin().catch(this.showError);
      }
      return;
    }
    if (this.game.inspecting || this.game.canMove) {
      this.toasts.dismiss('no-moves');
      return;
    }
    this.showNoMovesLeft();
  };

  private async recordWin(): Promise<void> {
    const duration = Math.floor(this.game.elapsed);
    const entry = await this.history.add(new Date(), this.game.map.scoreName, duration, this.settings.playerName);
    await deleteGameSave();
    this.scores.show(entry.name, entry);
  }

  /** The original "No Moves Left" alert, as a non-blocking toast with the same choices. */
  private showNoMovesLeft(): void {
    const game = this.game;
    this.toasts.show('No moves left.', {
      id: 'no-moves',
      actions: [
        ...(game.canShuffle ? [{ label: 'Shuffle', action: 'shuffle' }] : []),
        ...(game.canUndo ? [{ label: 'Undo', action: 'undo' }] : []),
        { label: 'New Game', action: 'new' },
      ],
    });
  }

  private shuffle(): void {
    this.game.shuffleRemaining();
    this.board.render();
    this.onMoved();
  }

  /** Shows a modal dialog, pausing the game while it is visible as window.vala does. */
  private present = (dialog: HTMLDialogElement): void => {
    if (dialog.open) {
      return;
    }
    if (this.game && !this.pauseOverlay.visible && !this.game.paused) {
      this.game.setPaused(true);
      this.pausedForDialog = this.game.paused;
    }
    dialog.addEventListener('close', this.onDialogClosed, { once: true });
    dialog.showModal();
    this.refresh();
  };

  private onDialogClosed = (): void => {
    if (this.root.querySelector('dialog[open]')) {
      return;
    }
    if (this.pausedForDialog) {
      this.pausedForDialog = false;
      this.game.setPaused(false);
    }
    this.refresh();
    if (!this.menu.isOpen) {
      this.canvas.focus({ preventScroll: true });
    }
  };

  private onClick = (event: MouseEvent): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-action]');
    if (!button?.dataset.action || button.disabled) {
      return;
    }
    const fromMenu = button.getAttribute('role') === 'menuitem';
    void this.performAction(button.dataset.action)
      .catch(this.showError)
      .finally(() => {
        if (fromMenu && !this.menu.isOpen && !this.root.querySelector('dialog[open]')) {
          this.canvas.focus({ preventScroll: true });
        }
      });
  };

  private async performAction(action: string): Promise<void> {
    switch (action) {
      case 'new':
        await this.newGame();
        break;
      case 'restart':
        this.game.restart();
        this.handledGame = null;
        this.pausedForDialog = false;
        await deleteGameSave();
        this.toasts.dismiss('no-moves');
        this.toasts.show('Game restarted.');
        this.board.render();
        this.refresh();
        break;
      case 'undo':
        if (!this.game.paused) {
          this.game.undo();
          this.onMoved();
        }
        break;
      case 'redo':
        if (!this.game.paused) {
          this.game.redo();
          this.onMoved();
        }
        break;
      case 'hint':
        if (!this.game.paused && this.game.movesLeft > 0) {
          this.board.showHint();
        }
        break;
      case 'shuffle':
        if (!this.game.paused) {
          this.shuffle();
        }
        break;
      case 'pause':
        if (this.game.started) {
          this.pausedForDialog = false;
          this.game.setPaused(!this.game.paused);
          this.board.render();
          this.refresh();
        }
        break;
      case 'resume':
        this.pausedForDialog = false;
        this.game.setPaused(false);
        this.board.render();
        this.refresh();
        break;
      case 'autoplay':
        if (!this.game.paused) {
          this.board.autoplay();
        }
        break;
      case 'export':
        this.downloadSave();
        break;
      case 'import': {
        const file = await pickFile(this.importInput, 'Mahjongg saved game', {
          'application/xml': ['.xml'],
        });
        if (file) {
          await this.importSave(file);
        }
        break;
      }
      case 'layouts':
        this.layoutPicker.show(this.settings.mapset);
        break;
      case 'scores':
        this.scores.show(this.game.map.scoreName);
        break;
      case 'preferences':
        await this.preferences.open({ ...this.settings });
        break;
      case 'rules':
        this.present(this.rules.dialog);
        break;
      case 'shortcuts':
        this.present(this.shortcutsDialog);
        break;
      case 'about':
        this.present(this.aboutDialog);
        break;
      case 'menu':
        this.menu.toggle();
        break;
      case 'pwa-update':
        if (!this.updateHandler) {
          throw new Error('The service worker update handler is unavailable.');
        }
        await this.updateHandler(true);
        break;
      case 'install':
        if (this.installHandler && await this.installHandler()) {
          this.toasts.show('Mahjongg is being installed.');
        }
        break;
      case 'dismiss-update':
        element<HTMLElement>(this.root, '#update-banner').hidden = true;
        break;
      default:
        throw new Error(`Unknown game action "${action}".`);
    }
  }

  /** Mahjongg._layout_cb (): confirm before abandoning a started game. */
  private async changeLayout(scoreName: string): Promise<boolean> {
    if (scoreName === this.settings.mapset) {
      return true;
    }
    if (this.game.started && !this.game.inspecting) {
      const response = await chooseAlert(
        element(this.root, '.app-shell'),
        this.present,
        'Change Layout?',
        'This will end your current game.',
        [
          { id: 'cancel', label: 'Cancel' },
          { id: 'change_layout', label: 'Change Layout', destructive: true },
        ],
        'cancel',
      );
      if (response !== 'change_layout') {
        return false;
      }
    }
    this.settings.mapset = scoreName;
    saveSettings(this.settings);
    await this.newGame(false);
    return true;
  }

  /** A layout card was chosen; starting the new game closes the picker. */
  private async selectLayout(scoreName: string): Promise<void> {
    if (scoreName === this.settings.mapset) {
      this.layoutPicker.dialog.close();
      return;
    }
    await this.changeLayout(scoreName);
  }

  private async applyPreferences(next: AppSettings): Promise<void> {
    const layout = next.mapset;
    this.settings = { ...next, mapset: this.settings.mapset };
    saveSettings(this.settings);
    this.applyBackground();
    await this.applyTheme();
    await this.changeLayout(layout);
  }

  private async onThemeImported(theme: ImportedTheme): Promise<void> {
    this.settings.tileset = theme.id;
    saveSettings(this.settings);
    await this.applyTheme();
    this.toasts.show(`Loaded ${theme.name} theme.`);
    await this.tileOrder.open(theme.id, theme.declaredTileOrder);
  }

  private onTileOrderChanged = (id: string): void => {
    if (this.settings.tileset === id) {
      void this.applyTheme().catch(this.showError);
    }
  };

  private async onThemeDeleted(id: string): Promise<void> {
    if (this.settings.tileset === id) {
      this.settings.tileset = 'postmodern';
      saveSettings(this.settings);
      await this.applyTheme();
    }
  }

  private onImportInput = (): void => {
    const file = this.importInput.files?.[0];
    this.importInput.value = '';
    if (file) {
      void this.importSave(file).catch(this.showError);
    }
  };

  private async importSave(file: File): Promise<void> {
    const save = await importGameSave(await file.text(), this.maps);
    const map = this.maps.find((candidate) => candidate.name === save.mapName)!;
    this.setMapset(map);
    const game = new Game(map);
    restoreGame(game, save);
    await this.setGame(game);
    this.toasts.show('Imported game restored and paused.');
  }

  private onShortcut = (event: KeyboardEvent): void => {
    if (this.root.querySelector('dialog[open]')) {
      return;
    }
    const target = event.target;
    if ((target instanceof HTMLInputElement || target instanceof HTMLSelectElement ||
         target instanceof HTMLTextAreaElement) && event.key !== 'F1') {
      return;
    }
    const action = shortcutForEvent(event);
    if (action) {
      event.preventDefault();
      void this.performAction(action).catch(this.showError);
    }
  };

  /** Pause and autosave when the page is hidden, like window suspension and shutdown. */
  private onVisibilityChange = (): void => {
    if (document.visibilityState !== 'hidden' || !this.game) {
      return;
    }
    if (!this.game.paused) {
      this.game.setPaused(true);
      this.pausedForDialog = false;
      this.board.render();
      this.refresh();
    }
    if (this.game.canSave) {
      void saveGame(this.game)
        .then(() => {
          this.toasts.show('Game saved on this device.', { id: 'autosave' });
        })
        .catch(this.showError);
    }
  };

  private refresh = (): void => {
    if (!this.game) {
      return;
    }
    const game = this.game;
    const button = (action: string) =>
      element<HTMLButtonElement>(this.root, `.header-actions [data-action="${action}"]`);
    this.movesLabel.textContent = String(game.movesLeft);
    this.tilesLabel.textContent = String(game.tiles.filter((tile) => tile.visible).length);
    element<HTMLElement>(this.root, '#layout-name').textContent = game.map.name;
    button('undo').disabled = game.paused || !game.canUndo;
    button('redo').disabled = game.paused || !game.canRedo;
    button('hint').disabled = game.paused || game.movesLeft === 0;
    const pause = button('pause');
    pause.disabled = !game.started || game.inspecting;
    const pauseState = game.paused ? 'paused' : 'running';
    if (pause.dataset.state !== pauseState) {
      pause.dataset.state = pauseState;
      pause.innerHTML = icon(game.paused ? 'play' : 'pause');
      pause.setAttribute('aria-label', game.paused ? 'Resume' : 'Pause');
      pause.title = game.paused ? 'Resume Game (Esc)' : 'Pause Game (Esc)';
    }
    this.finishChip.hidden = game.paused || game.complete || !game.allTilesUnblocked || this.board.autoplaying;
    this.menu.item('export').disabled = !game.canSave;
    if (game.paused && !this.pausedForDialog) {
      this.pauseOverlay.show();
    } else {
      this.pauseOverlay.hide();
    }
    this.root.querySelector('.board-frame')?.classList.toggle('paused', game.paused);
    this.board.render();
    this.updateClock();
  };

  private updateClock = (): void => {
    if (this.game) {
      this.clockLabel.textContent = formatClock(Math.floor(this.game.elapsed));
    }
  };

  private downloadSave(): void {
    downloadFile(exportGameSave(this.game), 'mahjongg-save.xml', 'application/xml');
  }

  private showError = (error: unknown): void => {
    this.toasts.show(error instanceof Error ? error.message : String(error), { variant: 'error' });
  };
}

/** Clock format from MahjonggWindow.tick_cb (). */
export function formatClock(elapsed: number): string {
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed - hours * 3600) / 60);
  const seconds = elapsed - hours * 3600 - minutes * 60;
  const two = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${two(hours)}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}
