// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { formatLayoutDocument } from '../core/layout';
import type { GameMap } from '../core/map';
import { layoutExportDocument, type LayoutLibrary } from '../layouts';
import type { AppSettings, BackgroundColor, MapRotation } from '../settings';
import type { ImportedTheme, ThemeDescriptor, ThemeLibrary } from '../themes';
import { chooseAlert } from './alert-dialog';
import { createDialog, downloadFile, element, makeButton, makeOption, pickFile, type PresentDialog } from './dom';

export interface PreferencesHandlers {
  present: PresentDialog;
  onSave: (settings: AppSettings) => void;
  onThemeImported: (theme: ImportedTheme) => void;
  onEditTileOrder: (themeId: string) => void;
  onThemeDeleted: (id: string) => void;
  onLayoutsImported: (maps: GameMap[]) => void;
  onLayoutDeleted: (map: GameMap) => void;
  onError: (error: unknown) => void;
}

const ROTATIONS: ReadonlyArray<[MapRotation, string]> = [
  ['single', 'No Progression'],
  ['sequential', 'Sequential'],
  ['random', 'Random'],
];

const BACKGROUNDS: ReadonlyArray<[BackgroundColor, string]> = [
  ['light', 'Light'],
  ['dark', 'Dark'],
];

/** Layout, layout progression and appearance settings from the original main menu. */
export class PreferencesDialog {
  readonly dialog: HTMLDialogElement;
  private readonly layout: HTMLSelectElement;
  private readonly rotation: HTMLSelectElement;
  private readonly background: HTMLSelectElement;
  private readonly theme: HTMLSelectElement;
  private readonly themeInput: HTMLInputElement;
  private readonly deleteTheme: HTMLButtonElement;
  private readonly tileOrder: HTMLButtonElement;
  private readonly layoutInput: HTMLInputElement;
  private readonly deleteLayout: HTMLButtonElement;
  private readonly player: HTMLInputElement;
  private settings: AppSettings | null = null;

  constructor(
    private readonly maps: readonly GameMap[],
    private readonly themes: ThemeLibrary,
    private readonly layouts: LayoutLibrary,
    private readonly handlers: PreferencesHandlers,
  ) {
    const { dialog, body } = createDialog('preferences-dialog', 'Preferences');
    this.dialog = dialog;
    body.id = 'preferences-form';
    body.insertAdjacentHTML('beforeend', `
      <fieldset>
        <legend>Game</legend>
        <label>Layout <select id="preferences-layout"></select></label>
        <div class="layout-actions">
          <input id="layout-file" type="file" accept=".json,.yaml,.yml,application/json,application/yaml" hidden />
        </div>
        <label>Layout Progression <select id="preferences-rotation"></select></label>
        <label>Player name <input id="preferences-player" maxlength="80" required /></label>
      </fieldset>
      <fieldset>
        <legend>Appearance</legend>
        <label>Background <select id="preferences-background"></select></label>
        <label>Theme <select id="preferences-theme"></select></label>
        <div class="theme-actions">
          <input id="theme-file" type="file" accept=".svg,image/svg+xml,.png,image/png" hidden />
        </div>
      </fieldset>
      <menu><button value="cancel" formnovalidate>Cancel</button><button id="save-preferences" value="save">Save Preferences</button></menu>
    `);
    this.layout = element(body, '#preferences-layout');
    this.rotation = element(body, '#preferences-rotation');
    this.background = element(body, '#preferences-background');
    this.theme = element(body, '#preferences-theme');
    this.themeInput = element(body, '#theme-file');
    this.player = element(body, '#preferences-player');
    this.layoutInput = element(body, '#layout-file');
    for (const [value, label] of ROTATIONS) {
      this.rotation.append(makeOption(value, label));
    }
    for (const [value, label] of BACKGROUNDS) {
      this.background.append(makeOption(value, label));
    }

    const loadTheme = makeButton('Load Theme from File…');
    loadTheme.id = 'load-theme';
    this.tileOrder = makeButton('Tile Order…');
    this.tileOrder.id = 'theme-tile-order';
    this.tileOrder.title = 'Choose which tile is where in the selected custom theme';
    this.deleteTheme = makeButton('Delete Selected Theme');
    this.deleteTheme.id = 'delete-theme';
    element(body, '.theme-actions').append(loadTheme, this.tileOrder, this.deleteTheme);

    const loadLayout = makeButton('Load Layout from File…');
    loadLayout.id = 'load-layout';
    const exportLayout = makeButton('Export Layout (JSON)');
    exportLayout.id = 'export-layout';
    this.deleteLayout = makeButton('Delete Selected Layout');
    this.deleteLayout.id = 'delete-layout';
    element(body, '.layout-actions').append(loadLayout, exportLayout, this.deleteLayout);

    loadLayout.addEventListener('click', () => {
      void pickFile(this.layoutInput, 'Mahjongg layout', {
        'application/json': ['.json'],
        'application/yaml': ['.yaml', '.yml'],
      })
        .then((file) => file && this.importLayouts(file))
        .catch(handlers.onError);
    });
    this.layoutInput.addEventListener('change', () => {
      const file = this.layoutInput.files?.[0];
      this.layoutInput.value = '';
      if (file) {
        void this.importLayouts(file);
      }
    });
    exportLayout.addEventListener('click', () => {
      try {
        const map = this.selectedMap();
        downloadFile(
          formatLayoutDocument(layoutExportDocument(map)),
          `${map.scoreName}.json`,
          'application/json',
        );
      } catch (error) {
        handlers.onError(error);
      }
    });
    this.layout.addEventListener('change', () => this.updateDeleteButton());
    this.deleteLayout.addEventListener('click', () => {
      void this.removeLayout().catch(handlers.onError);
    });

    loadTheme.addEventListener('click', () => {
      void pickFile(this.themeInput, 'Mahjongg tile theme', {
        'image/svg+xml': ['.svg'],
        'image/png': ['.png'],
      })
        .then((file) => file && this.importTheme(file))
        .catch(handlers.onError);
    });
    this.themeInput.addEventListener('change', () => {
      const file = this.themeInput.files?.[0];
      this.themeInput.value = '';
      if (file) {
        void this.importTheme(file);
      }
    });
    this.theme.addEventListener('change', () => this.updateDeleteButton());
    this.tileOrder.addEventListener('click', () => handlers.onEditTileOrder(this.theme.value));
    this.deleteTheme.addEventListener('click', () => {
      const id = this.theme.value;
      void this.themes.delete(id)
        .then(async () => {
          await this.refreshThemes('postmodern');
          handlers.onThemeDeleted(id);
        })
        .catch(handlers.onError);
    });
    body.addEventListener('submit', this.onSubmit);
    this.refreshLayouts(maps[0]?.scoreName ?? '');
  }

  async open(settings: AppSettings): Promise<void> {
    this.settings = settings;
    this.refreshLayouts(settings.mapset);
    this.rotation.value = settings.mapRotation;
    this.background.value = settings.backgroundColor;
    this.player.value = settings.playerName;
    await this.refreshThemes(settings.tileset);
    this.handlers.present(this.dialog);
  }

  /** Rebuilds the layout list from the shared, possibly updated, map list. */
  refreshLayouts(selected: string): void {
    this.layout.replaceChildren(...this.maps.map((map) => makeOption(map.scoreName, map.name)));
    this.layout.value = this.maps.some((map) => map.scoreName === selected) ? selected : this.maps[0]?.scoreName ?? '';
    this.updateDeleteButton();
  }

  async refreshThemes(selected: string): Promise<ThemeDescriptor[]> {
    const options = await this.themes.list();
    this.theme.replaceChildren(...options.map((theme) => makeOption(theme.id, theme.name)));
    this.theme.value = options.some((theme) => theme.id === selected) ? selected : 'postmodern';
    this.updateDeleteButton();
    return options;
  }

  private updateDeleteButton(): void {
    this.deleteTheme.disabled = !this.theme.value.startsWith('custom:');
    this.tileOrder.disabled = this.deleteTheme.disabled;
    this.deleteLayout.disabled = !this.maps.find((map) => map.scoreName === this.layout.value)?.customLayoutId;
  }

  private selectedMap(): GameMap {
    const map = this.maps.find((candidate) => candidate.scoreName === this.layout.value);
    if (!map) {
      throw new Error('Select a layout first.');
    }
    return map;
  }

  private async importLayouts(file: File): Promise<void> {
    try {
      const imported = await this.layouts.importFile(file, this.maps);
      this.handlers.onLayoutsImported(imported);
      this.refreshLayouts(imported[0]!.scoreName);
    } catch (error) {
      this.handlers.onError(error);
    }
  }

  private async removeLayout(): Promise<void> {
    const map = this.selectedMap();
    if (!map.customLayoutId) {
      return;
    }
    const response = await chooseAlert(
      this.dialog.parentElement ?? document.body,
      this.handlers.present,
      'Delete Layout?',
      `"${map.name}" will be removed from this device. Its scores are kept.`,
      [
        { id: 'cancel', label: 'Cancel' },
        { id: 'delete', label: 'Delete', destructive: true },
      ],
      'cancel',
    );
    if (response !== 'delete') {
      return;
    }
    await this.layouts.delete(map.customLayoutId);
    this.handlers.onLayoutDeleted(map);
    this.refreshLayouts(this.settings?.mapset ?? '');
  }

  private async importTheme(file: File): Promise<void> {
    try {
      const theme = await this.themes.importFile(file);
      await this.refreshThemes(theme.id);
      this.handlers.onThemeImported(theme);
    } catch (error) {
      this.handlers.onError(error);
    }
  }

  private onSubmit = (event: SubmitEvent): void => {
    const submitter = event.submitter as HTMLButtonElement | null;
    if (submitter?.value !== 'save' || !this.settings) {
      return;
    }
    event.preventDefault();
    const playerName = this.player.value.trim();
    if (!playerName) {
      this.handlers.onError(new Error('Player name cannot be empty.'));
      return;
    }
    const rotation = this.rotation.value as MapRotation;
    const background = this.background.value as BackgroundColor;
    if (!ROTATIONS.some(([value]) => value === rotation) || !BACKGROUNDS.some(([value]) => value === background)) {
      this.handlers.onError(new Error('Preferences contain an unsupported option.'));
      return;
    }
    this.dialog.close('save');
    this.handlers.onSave({
      mapset: this.layout.value,
      mapRotation: rotation,
      backgroundColor: background,
      tileset: this.theme.value,
      playerName,
    });
  };
}
