// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { History, HistoryEntry } from '../core/history';
import { getMapDisplayName, type GameMap } from '../core/map';
import { chooseAlert } from './alert-dialog';
import { createDialog, makeButton, makeOption, type PresentDialog } from './dom';
import { icon } from './icons';

export interface ScoresHandlers {
  present: PresentDialog;
  onNewGame: () => void;
  onChangeLayout: () => void;
  onPlayerRenamed: (player: string) => void;
  onError: (error: unknown) => void;
}

/** Same format as ScoreDialog.set_up_time_column (). */
export function formatScoreTime(duration: number): string {
  return duration >= 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`;
}

/** Port of ScoreDialog: per-layout ranking, completed-game view, and clearing scores. */
export class ScoresDialog {
  readonly dialog: HTMLDialogElement;
  private readonly heading: HTMLHeadingElement;
  private readonly hero: HTMLElement;
  private readonly layoutLabel: HTMLLabelElement;
  private readonly layout: HTMLSelectElement;
  private readonly content: HTMLDivElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly completedActions: HTMLElement;
  private completedEntry: HistoryEntry | null = null;
  private playerInput: HTMLInputElement | null = null;

  constructor(
    private readonly maps: readonly GameMap[],
    private readonly history: History,
    private readonly handlers: ScoresHandlers,
  ) {
    const { dialog, body, heading } = createDialog('scores-dialog', 'Scores');
    this.dialog = dialog;
    this.heading = heading;
    this.hero = document.createElement('div');
    this.hero.className = 'win-hero';
    this.layoutLabel = document.createElement('label');
    this.layoutLabel.textContent = 'Layout ';
    this.layout = document.createElement('select');
    this.layout.id = 'score-layout';
    this.layoutLabel.append(this.layout);
    this.content = document.createElement('div');
    this.content.id = 'scores-content';
    this.clearButton = makeButton('Clear Scores…');
    this.clearButton.id = 'clear-scores';
    this.completedActions = document.createElement('menu');
    const newGame = makeButton('New Game');
    newGame.classList.add('suggested');
    newGame.addEventListener('click', () => {
      this.dialog.close();
      handlers.onNewGame();
    });
    newGame.insertAdjacentHTML('afterbegin', icon('square-plus'));
    const changeLayout = makeButton('Change Layout');
    changeLayout.addEventListener('click', () => {
      this.dialog.close();
      handlers.onChangeLayout();
    });
    this.completedActions.append(changeLayout, newGame);
    body.append(this.hero, this.layoutLabel, this.content, this.clearButton, this.completedActions);

    this.layout.addEventListener('change', () => this.render());
    this.clearButton.addEventListener('click', () => {
      void this.clearScores().catch(handlers.onError);
    });
    dialog.addEventListener('close', () => {
      void this.savePlayerName().catch(handlers.onError);
    });
  }

  show(selectedLayout: string, completedEntry: HistoryEntry | null = null): void {
    this.completedEntry = completedEntry;
    this.heading.textContent = completedEntry ? 'Game Completed' : 'Scores';
    this.dialog.classList.toggle('win-dialog', Boolean(completedEntry));
    this.hero.hidden = !completedEntry;
    if (completedEntry) {
      this.renderHero(completedEntry);
    }
    this.layoutLabel.hidden = Boolean(completedEntry);
    this.clearButton.hidden = Boolean(completedEntry);
    this.clearButton.disabled = this.history.length === 0;
    this.completedActions.hidden = !completedEntry;

    const layouts: string[] = [];
    for (const name of [...this.maps.map((map) => map.scoreName), ...this.history.entries.map((entry) => entry.name)]) {
      if (!layouts.includes(name)) {
        layouts.push(name);
      }
    }
    this.layout.replaceChildren(...layouts.map((name) => makeOption(name, getMapDisplayName(this.maps, name))));
    this.layout.value = completedEntry?.name ?? (layouts.includes(selectedLayout) ? selectedLayout : layouts[0]!);
    this.render();
    this.handlers.present(this.dialog);
    this.playerInput?.focus();
    this.playerInput?.select();
  }

  private renderHero(entry: HistoryEntry): void {
    const ranked = this.history.getRanked(entry.name);
    const rank = ranked.find((candidate) => candidate.id === entry.id)?.rank;
    this.hero.innerHTML = `<span class="win-icon">${icon('trophy')}</span>` +
      '<strong class="win-time"></strong><span class="win-details"></span>';
    this.hero.querySelector('.win-time')!.textContent = formatScoreTime(entry.duration);
    const layout = getMapDisplayName(this.maps, entry.name);
    this.hero.querySelector('.win-details')!.textContent = rank === 1 && ranked.length > 1
      ? `New best time on ${layout}!`
      : rank ? `${layout} · Rank ${rank} of ${ranked.length}` : layout;
  }

  private render(): void {
    this.playerInput = null;
    const entries = this.history.getRanked(this.layout.value);
    if (entries.length === 0) {
      const title = document.createElement('h3');
      title.textContent = 'No Scores';
      const description = document.createElement('p');
      description.textContent = 'Finish a game to see scores';
      this.content.replaceChildren(title, description);
      return;
    }

    const table = document.createElement('table');
    const headRow = table.createTHead().insertRow();
    for (const heading of ['Rank', 'Time', 'Player']) {
      const cell = document.createElement('th');
      cell.textContent = heading;
      headRow.append(cell);
    }
    const tableBody = table.createTBody();
    for (const entry of entries) {
      const row = tableBody.insertRow();
      row.insertCell().textContent = String(entry.rank);
      row.insertCell().textContent = formatScoreTime(entry.duration);
      const playerCell = row.insertCell();
      if (entry.id === this.completedEntry?.id) {
        row.classList.add('completed-score');
        const input = document.createElement('input');
        input.value = entry.player;
        input.maxLength = 80;
        input.setAttribute('aria-label', 'Player name');
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            this.dialog.close();
            this.handlers.onNewGame();
          }
        });
        playerCell.append(input);
        this.playerInput = input;
      } else {
        playerCell.textContent = entry.player;
        playerCell.title = `${entry.player}\n${new Date(entry.date).toLocaleDateString()}`;
      }
    }
    this.content.replaceChildren(table);
  }

  private async savePlayerName(): Promise<void> {
    const entry = this.completedEntry;
    const input = this.playerInput;
    if (!entry || !input) {
      return;
    }
    const player = input.value.trim() || entry.player;
    if (player !== entry.player) {
      await this.history.setPlayer(entry.id, player);
      this.handlers.onPlayerRenamed(player);
    }
  }

  private async clearScores(): Promise<void> {
    const response = await chooseAlert(
      this.dialog.parentElement ?? document.body,
      this.handlers.present,
      'Clear All Scores?',
      'This will clear every score for every layout.',
      [
        { id: 'cancel', label: 'Cancel' },
        { id: 'clear', label: 'Clear All', destructive: true },
      ],
      'cancel',
    );
    if (response !== 'clear') {
      return;
    }
    this.completedEntry = null;
    this.completedActions.hidden = true;
    await this.history.clear();
    this.clearButton.disabled = true;
    this.render();
  }
}
