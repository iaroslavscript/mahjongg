// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import layoutsJson from '../data/layouts.json?raw';
import { buildMaps, parseLayoutJson } from './layout';
import type { GameMap } from './map';

/** Returns fresh GameMap objects for the 10 layouts of the original game. */
export function loadBuiltInMaps(): GameMap[] {
  return buildMaps(parseLayoutJson(layoutsJson));
}
