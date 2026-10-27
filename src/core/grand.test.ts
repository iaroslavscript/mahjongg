// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { GRand } from './grand';

describe('GRand', () => {
  it.each([
    [0, [2357136044, 2546248239, 3071714933, 3626093760, 2588848963]],
    [1, [1791095845, 4282876139, 3093770124, 4005303368, 491263]],
    [123456, [545331265, 2211535594, 4152021490, 3857419313, 1118735928]],
    [0xffffffff, [419326371, 479346978, 3918654476, 2416749639, 3388880820]],
  ])('matches GLib g_rand_int vectors for seed %s', (seed, expected) => {
    const random = new GRand(seed);
    expect(expected.map(() => random.int())).toEqual(expected);
  });

  it('matches GLib g_rand_int_range vectors', () => {
    const random = new GRand(123456);
    expect(Array.from({ length: 8 }, () => random.intRange(0, 144)))
      .toEqual([97, 10, 82, 17, 72, 27, 95, 107]);
  });

  it('rejects biased values exactly like g_rand_int_range', () => {
    // Vectors from GLib 2.84 g_rand_int_range; seed 42 rejects draws 2, 3 and 6.
    const wide = new GRand(42);
    expect(Array.from({ length: 12 }, () => wide.intRange(0, 0x60000000))).toEqual([
      1608637542, 787846414, 1533277290, 960605884, 952839188, 670094950,
      304224377, 669991378, 429389014, 249467210, 361846218, 1433267572,
    ]);
    const nearlyFull = new GRand(7);
    expect(Array.from({ length: 12 }, () => nearlyFull.intRange(0, 0x7fffffff))).toEqual([
      327741615, 976413892, 1202242074, 1369975286, 1882953283, 2053951700,
      959775640, 1956722279, 2052949341, 1322904761, 165338511, 1133316631,
    ]);
  });

  it('treats signed seeds as their unsigned 32-bit equivalents', () => {
    expect(new GRand(-1).int()).toBe(new GRand(0xffffffff).int());
  });

  it('rejects invalid ranges', () => {
    expect(() => new GRand(1).intRange(3, 3)).toThrow(RangeError);
  });
});
