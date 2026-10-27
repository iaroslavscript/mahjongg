// SPDX-FileCopyrightText: 2010-2026 Mahjongg Contributors
// SPDX-FileCopyrightText: 2010-2013 Robert Ancell
// SPDX-License-Identifier: GPL-3.0-or-later

// Reader for the original GNOME Mahjongg XML map format (Maps in map.vala).
// The app ships JSON layouts; this reader is kept to verify them against
// original/gnome-mahjongg-main/data/maps/mahjongg.map.

import { GameMap, Slot } from './map';

function attribute(element: Element, name: string, fallback = 0): number {
  const value = element.getAttribute(name);
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric map attribute "${name}": ${value}`);
  }
  return parsed;
}

function scaled(element: Element, name: string, fallback = 0): number {
  return Math.trunc(attribute(element, name, fallback) * 2);
}

function parseElement(map: GameMap, element: Element, defaultLayer: number): void {
  const tag = element.tagName.toLowerCase();
  const layer = Math.trunc(attribute(element, 'z', defaultLayer));
  switch (tag) {
    case 'layer': {
      const z = Math.trunc(attribute(element, 'z'));
      for (const child of Array.from(element.children)) {
        parseElement(map, child, z);
      }
      break;
    }
    case 'row': {
      const y = scaled(element, 'y');
      const left = scaled(element, 'left');
      const right = scaled(element, 'right');
      for (let x = left; x <= right; x += 2) {
        map.addSlot(new Slot(x, y, layer));
      }
      break;
    }
    case 'column': {
      const x = scaled(element, 'x');
      const top = scaled(element, 'top');
      const bottom = scaled(element, 'bottom');
      for (let y = top; y <= bottom; y += 2) {
        map.addSlot(new Slot(x, y, layer));
      }
      break;
    }
    case 'block': {
      const left = scaled(element, 'left');
      const right = scaled(element, 'right');
      const top = scaled(element, 'top');
      const bottom = scaled(element, 'bottom');
      for (let x = left; x <= right; x += 2) {
        for (let y = top; y <= bottom; y += 2) {
          map.addSlot(new Slot(x, y, layer));
        }
      }
      break;
    }
    case 'tile':
      map.addSlot(new Slot(scaled(element, 'x'), scaled(element, 'y'), layer));
      break;
  }
}

export function parseXmlMaps(xml: string): GameMap[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = document.querySelector('parsererror');
  if (parserError) {
    throw new Error(`Could not parse map XML: ${parserError.textContent ?? 'unknown XML error'}`);
  }

  const maps: GameMap[] = [];
  for (const element of Array.from(document.getElementsByTagName('map'))) {
    const map = new GameMap(element.getAttribute('name') ?? '', element.getAttribute('scorename') ?? '');
    for (const child of Array.from(element.children)) {
      parseElement(map, child, 0);
    }
    if (map.nSlots > 0 && map.nSlots <= 144 && map.nSlots % 2 === 0) {
      maps.push(map);
    }
  }
  return maps;
}

