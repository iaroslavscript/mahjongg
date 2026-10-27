// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';

describe('application scaffold', () => {
  it('provides a document root for the app', () => {
    document.body.innerHTML = '<div id="app"></div>';
    expect(document.querySelector('#app')).not.toBeNull();
  });
});
