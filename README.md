# Mahjongg

An installable, offline-capable Mahjongg web app. The game can be installed
from a supported browser, and its app shell and built-in themes are cached for
offline play.

## Play online

**▶ <https://iaroslavscript.github.io/mahjongg/>**

The game is hosted on GitHub Pages and runs directly in the browser on
desktop, phone and tablet. **There is no need to build anything unless you
are a developer** — just open the link. To keep it like an app (and play
offline), choose **Install App** in the game's main menu (shown when the
browser supports it), or use your browser's *Install* / *Add to Home Screen*
option — in Chrome that is the install icon in the address bar on desktop, or
**⋮ → Add to Home screen** on Android.

## Origin

This is a TypeScript web port of
[GNOME Mahjongg](https://gitlab.gnome.org/GNOME/gnome-mahjongg)
**version 51.1** (Vala/GTK4). The original sources used as the reference are
not stored in this repository; `pnpm original:fetch` (run automatically by
`pnpm test` and `pnpm verify:seeds`) clones tag `51.1` into
`original/gnome-mahjongg-main`.
The game logic — board generation, tile matching, hints, shuffling, the ten
built-in layouts and the three tile themes — is ported 1:1, and seeded boards
are verified against the original Vala code (`pnpm verify:seeds`).

## Differences from GNOME Mahjongg

- **Runs in the browser:** no installation or Linux/GTK needed; installable
  as a PWA and playable offline.
- **Touch and mobile support:** layouts for phone (portrait/landscape) and
  tablet, pinch or Ctrl+scroll zoom with panning, double-tap to zoom out.
- **Auto-finish:** once every remaining tile is free, one button (or a
  double-click on the board) clears the rest.
- **Saved games:** besides automatic save/restore, a game can be exported to
  a file and imported again, e.g. to move it to another device.
- **Custom layouts:** load your own board shapes from JSON or YAML files and
  export any layout as JSON (GNOME Mahjongg only reads its bundled XML
  `.map` file). See [docs/map-format.md](docs/map-format.md).
- **Custom tilesets:** load your own PNG/SVG sprite sheets; a **Tile Order**
  dialog switches between a standard order and the GNOME order, so GNOME
  tilesets keep working. See [docs/tileset-format.md](docs/tileset-format.md).
- **Rules → Tile groups:** shows which tiles of the current tileset match each
  other.
- **Storage:** settings, scores and saved games are stored in the browser
  instead of GSettings and local files; the *System* background option was
  replaced by explicit *Light* and *Dark*.

## Playing

- **Header:** the layout name on the left opens the layout picker; the middle
  shows the time, tiles left and available moves; the icons on the right are
  Undo, Redo, Hint and Pause, followed by the **☰** main menu (New Game,
  Restart, Scores, Preferences, saved-game import/export, Rules, Keyboard
  Shortcuts and About).
- **Saving:** the game is saved automatically whenever the page is hidden or
  closed, and restored (paused) on the next visit.
- **Contextual actions:** when no moves are left, a notification offers
  Shuffle, Undo or New Game; once every remaining tile is free, an
  **Auto-finish** button clears the board.
- **Zoom:** pinch (or Ctrl+scroll) to zoom into the board and drag to pan;
  double-tap an empty spot to zoom back out.

## Development

Requirements: Node.js 24 or newer and pnpm 12.10.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Vite prints the local URL in the terminal (usually
`http://localhost:5173`). In a dev container or Codespace, forward port 5173
to open the app in your browser.

To run the production build locally:

```sh
pnpm build
pnpm preview
```

The preview server prints its URL (usually `http://localhost:4173`). Use this
to check the production build, including offline/PWA behavior.

Useful checks:

```sh
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm verify:seeds
```

`pnpm test:e2e` runs the browser checks against a local production preview in
Chromium, Firefox and WebKit on desktop, phone and tablet viewports; run
`pnpm build` first and install the browsers with
`pnpm exec playwright install`. `pnpm verify:seeds` compiles the Vala
reference generator and compares seeded boards with the TypeScript
implementation; it additionally requires `valac` and GLib development files.

## Custom layouts

Besides the ten built-in layouts, you can play your own board shapes. Write a
layout in JSON (the default) or YAML and load it under **☰ → Preferences →
Load Layout from File…**; any layout can also be exported as JSON. The file format,
coordinate system, validation rules and examples are described in
[docs/map-format.md](docs/map-format.md).

## Custom tilesets

You can also replace the tile pictures with your own — cats, dogs or anything
else. Draw a PNG or SVG sprite sheet and load it under **☰ → Preferences →
Load Theme from File…**; **☰ → Rules → Tile groups** then shows which of your
tiles pair with which. New tilesets use a standard tile order, and tilesets
made for GNOME Mahjongg keep working: the **Tile Order** dialog shown after
loading (and under **Preferences → Tile Order…**) switches between the two with
a live preview. The sheet layout, the meaning of every column and the
file requirements are described in
[docs/tileset-format.md](docs/tileset-format.md).

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs lint, unit tests, and a
production build on pushes to `main`. It deploys the build to GitHub Pages only
from `main`; manual runs on other branches build and validate without deploying.

To enable Pages, open the repository's **Settings → Pages** and choose
**GitHub Actions** as the deployment source. After reviewing and merging this
workflow into `main`, pushes to `main` will publish the `dist/` artifact. The
maintainer controls when changes are merged and deployed.

## License

GNOME Mahjongg (see [Origin](#origin)) is licensed under the GNU General Public
License, version 3 or (at your option) any later version (GPL-3.0-or-later),
and this project is distributed under the same license. Copyright and license
notices applicable to reused code and other third-party materials are
preserved in the relevant source files and accompanying `.license` files. See [COPYING](COPYING) for the license text.

The interface icons in `src/ui/icons.ts` come from [Lucide](https://lucide.dev)
(ISC; a few derived from Feather, MIT) and carry their license notices in that
file.

## Acknowledgments

This project was co-authored with assistance from Claude Opus 5.5.
