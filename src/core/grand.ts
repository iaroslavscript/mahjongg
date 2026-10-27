// SPDX-FileCopyrightText: 1995-1997 Peter Mattis, Spencer Kimball and Josh MacDonald
// SPDX-FileCopyrightText: 1997-2000 The GLib Team
// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Port of GRand from GLib's glib/grand.c (LGPL-2.1-or-later, used here under
// GPL-3.0-or-later as permitted by section 3 of the LGPL). The Mersenne Twister
// was originally developed by Makoto Matsumoto and Takuji Nishimura.

const STATE_SIZE = 624;
const PERIOD_OFFSET = 397;

export class GRand {
  private readonly state = new Uint32Array(STATE_SIZE);
  private index = STATE_SIZE;

  constructor(seed: number) {
    if (!Number.isInteger(seed)) {
      throw new TypeError('GRand seed must be an integer.');
    }

    this.state[0] = seed >>> 0;
    for (let i = 1; i < STATE_SIZE; i++) {
      const previous = this.state[i - 1]!;
      this.state[i] = (Math.imul(1812433253, previous ^ (previous >>> 30)) + i) >>> 0;
    }
  }

  int(): number {
    if (this.index >= STATE_SIZE) {
      this.twist();
    }

    let value = this.state[this.index++]!;
    value ^= value >>> 11;
    value ^= (value << 7) & 0x9d2c5680;
    value ^= (value << 15) & 0xefc60000;
    value ^= value >>> 18;
    return value >>> 0;
  }

  intRange(begin: number, end: number): number {
    if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < -0x80000000 ||
        end > 0x7fffffff || end <= begin) {
      throw new RangeError('GRand range must be an increasing signed 32-bit interval.');
    }

    // g_rand_int_range (GRand version 2.2): reject values above the greatest
    // multiple of the distance that fits into 2^32 to avoid modulo bias.
    const distance = (end - begin) >>> 0;
    let maxValue: number;
    if (distance <= 0x80000000) {
      let leftover = ((0x80000000 % distance) * 2) >>> 0;
      if (leftover >= distance) {
        leftover -= distance;
      }
      maxValue = 0xffffffff - leftover;
    } else {
      maxValue = distance - 1;
    }

    let random: number;
    do {
      random = this.int();
    } while (random > maxValue);
    return begin + (random % distance);
  }

  private twist(): void {
    for (let i = 0; i < STATE_SIZE; i++) {
      const combined = (this.state[i]! & 0x80000000) |
        (this.state[(i + 1) % STATE_SIZE]! & 0x7fffffff);
      const next = this.state[(i + PERIOD_OFFSET) % STATE_SIZE]! ^ (combined >>> 1);
      this.state[i] = (combined & 1) !== 0 ? next ^ 0x9908b0df : next;
    }
    this.index = 0;
  }
}

export function gRandNewWithSeed(seed: number): GRand {
  return new GRand(seed);
}
