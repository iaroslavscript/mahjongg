// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      manifest: {
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
      },
      includeAssets: ['icons/*.png'],
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{html,js,css,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
