// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { LoadedTheme, ThemeLibrary } from '../themes';
import { TILE_ORDERS, type TileOrderId } from '../tile-order';
import { createDialog, type PresentDialog } from './dom';
import { TileGroupsView, tilesetImage } from './tile-groups';

export interface TileOrderHandlers {
  present: PresentDialog;
  onChanged: (themeId: string, tileOrder: TileOrderId) => void;
  onError: (error: unknown) => void;
}

/** Lets players pick which sheet column holds which tile face for a custom tileset, with a live preview. */
export class TileOrderDialog {
  readonly dialog: HTMLDialogElement;
  private readonly heading: HTMLHeadingElement;
  private readonly declared: HTMLElement;
  private readonly radios = new Map<TileOrderId, HTMLInputElement>();
  private readonly tiles: TileGroupsView;
  private theme: LoadedTheme | null = null;

  constructor(
    private readonly themes: ThemeLibrary,
    private readonly handlers: TileOrderHandlers,
  ) {
    const { dialog, body, heading } = createDialog('tile-order-dialog', 'Tile Order');
    this.dialog = dialog;
    this.heading = heading;

    const intro = document.createElement('p');
    intro.textContent = 'Tilesets made for GNOME Mahjongg place some tiles in other spots of the image. ' +
      'Pick the order that makes every group below look right — for example, with all three dragons together.';

    const options = document.createElement('fieldset');
    options.className = 'tile-order-options';
    const legend = document.createElement('legend');
    legend.className = 'visually-hidden';
    legend.textContent = 'Tile order';
    options.append(legend);
    for (const order of Object.values(TILE_ORDERS)) {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'tile-order';
      radio.value = order.id;
      radio.addEventListener('change', () => void this.select(order.id));
      const text = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = order.label;
      const description = document.createElement('small');
      description.textContent = order.description;
      text.append(title, description);
      label.append(radio, text);
      options.append(label);
      this.radios.set(order.id, radio);
    }

    this.declared = document.createElement('p');
    this.declared.className = 'tile-order-declared';
    this.declared.hidden = true;

    const previewHeading = document.createElement('h3');
    previewHeading.id = 'tile-order-preview-title';
    previewHeading.textContent = 'Preview';
    this.tiles = new TileGroupsView(previewHeading.id);

    const menu = document.createElement('menu');
    const done = document.createElement('button');
    done.className = 'suggested';
    done.value = 'done';
    done.textContent = 'Done';
    menu.append(done);

    body.append(intro, options, this.declared, previewHeading, this.tiles.element, menu);
    dialog.addEventListener('close', () => {
      this.tiles.reset();
      this.theme?.release?.();
      this.theme = null;
    });
  }

  /** Opens the dialog for a custom tileset; `declared` is the order the file itself declared, if any. */
  async open(themeId: string, declared: TileOrderId | null = null): Promise<void> {
    const theme = await this.themes.load(themeId);
    if (theme.builtIn) {
      theme.release?.();
      throw new Error('The tile order of built-in themes cannot be changed.');
    }
    this.theme?.release?.();
    this.theme = theme;
    this.heading.textContent = `Tile Order — ${theme.name}`;
    this.declared.hidden = declared === null;
    this.declared.textContent = declared ? `The file declares the ${TILE_ORDERS[declared].label} order.` : '';
    this.dialog.style.setProperty('--tileset-image', tilesetImage(theme.url));
    this.showOrder(theme.tileOrder);
    this.handlers.present(this.dialog);
  }

  private showOrder(order: TileOrderId): void {
    this.radios.get(order)!.checked = true;
    this.tiles.setTileOrder(order);
  }

  private async select(order: TileOrderId): Promise<void> {
    const theme = this.theme;
    if (!theme) {
      return;
    }
    this.tiles.setTileOrder(order);
    try {
      await this.themes.setTileOrder(theme.id, order);
      theme.tileOrder = order;
      this.handlers.onChanged(theme.id, order);
    } catch (error) {
      this.showOrder(theme.tileOrder);
      this.handlers.onError(error);
    }
  }
}
