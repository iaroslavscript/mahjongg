// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function git(args: string): string | undefined {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

const commit = git('rev-parse HEAD') ?? process.env.GITHUB_SHA ?? '';
// Uncommitted changes to tracked files mean the build does not match `commit` exactly.
const commitDirty = commit !== '' && (git('status --porcelain --untracked-files=no') ?? '') !== '';

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_COMMIT_DIRTY__: JSON.stringify(commitDirty),
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      manifest: {
        id: './',
        name: 'Mahjongg',
        short_name: 'Mahjongg',
        description: 'Play Mahjongg offline.',
        display: 'standalone',
        start_url: './',
        scope: './',
        theme_color: '#263b32',
        background_color: '#263b32',
        icons: [
          { src: './icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: './icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: './icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Shown by Chrome's richer install dialog; not precached since they are only needed online.
        screenshots: [
          { src: './screenshots/wide.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'Mahjongg on a desktop' },
          { src: './screenshots/narrow.png', sizes: '824x1830', type: 'image/png', form_factor: 'narrow', label: 'Mahjongg on a phone' },
        ],
      },
      includeAssets: ['icons/*.png'],
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{html,js,css,svg,png,webmanifest}'],
        globIgnores: ['screenshots/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
