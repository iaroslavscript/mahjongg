// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { makeButton } from './dom';
import { icon } from './icons';

/** Port of PauseOverlay (pause-overlay.ui); the web app has no Quit action. */
export class PauseOverlay {
  readonly element: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'pause-overlay';
    this.element.className = 'pause-overlay';
    this.element.hidden = true;
    const card = document.createElement('div');
    card.className = 'pause-card';
    const title = document.createElement('h2');
    title.textContent = 'Paused';
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Tile faces are hidden while the game is paused.';
    this.resumeButton = makeButton('Resume Game', 'resume');
    this.resumeButton.classList.add('suggested');
    this.resumeButton.insertAdjacentHTML('afterbegin', icon('play'));
    const restart = makeButton('Restart Game', 'restart');
    restart.insertAdjacentHTML('afterbegin', icon('rotate-ccw'));
    card.append(title, subtitle, this.resumeButton, restart);
    this.element.append(card);
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  show(): void {
    if (this.visible) {
      return;
    }
    this.element.hidden = false;
    this.resumeButton.focus({ preventScroll: true });
  }

  hide(): void {
    this.element.hidden = true;
  }
}
