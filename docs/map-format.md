<!-- SPDX-FileCopyrightText: 2026 Mahjongg Contributors
     SPDX-License-Identifier: GPL-3.0-or-later -->

# Layout (map) file format

A layout describes where the 144 or fewer tiles of a game sit: their
horizontal and vertical position and the layer they are stacked on. It does not
say which faces the tiles show — faces are dealt when a game starts.

Layouts are written in **JSON** (the canonical, default format) or **YAML**.
Both describe exactly the same document. The ten built-in layouts live in
[`src/data/layouts.json`](../src/data/layouts.json) in this format; they were
converted from the original GNOME Mahjongg XML file and a test checks that both
produce identical boards.

| Format | File extensions | Notes                                                      |
| ------ | --------------- | ---------------------------------------------------------- |
| JSON   | `.json`         | Default. Used for built-in layouts and for every export.   |
| YAML   | `.yaml`, `.yml` | Accepted on import. Core schema only; anchors are limited. |

## A first example

This 40-tile pyramid is [`examples/little-pyramid.json`](examples/little-pyramid.json):

<!-- prettier-ignore -->
```json
{
  "version": 1,
  "layouts": [
    {
      "name": "Little Pyramid",
      "scoreName": "little-pyramid",
      "layers": [
        {
          "z": 0,
          "blocks": [
            { "left": 1, "right": 6, "top": 0, "bottom": 3 }
          ],
          "tiles": [
            { "x": 0, "y": 1.5 },
            { "x": 7, "y": 1.5 }
          ]
        },
        {
          "z": 1,
          "blocks": [
            { "left": 2, "right": 5, "top": 0.5, "bottom": 2.5 }
          ]
        },
        {
          "z": 2,
          "rows": [
            { "y": 1.5, "left": 3, "right": 4 }
          ]
        }
      ]
    }
  ]
}
```

The same layout in YAML is [`examples/little-pyramid.yaml`](examples/little-pyramid.yaml):

```yaml
version: 1
layouts:
  - name: Little Pyramid
    scoreName: little-pyramid
    layers:
      - z: 0
        blocks:
          - { left: 1, right: 6, top: 0, bottom: 3 }
        tiles:
          - { x: 0, y: 1.5 }
          - { x: 7, y: 1.5 }
      - z: 1
        blocks:
          - { left: 2, right: 5, top: 0.5, bottom: 2.5 }
      - z: 2
        rows:
          - { y: 1.5, left: 3, right: 4 }
```

Both example files are loaded by the unit tests, so they are always valid.

## Document structure

### Root

| Property  | Type   | Required | Description                                           |
| --------- | ------ | -------- | ----------------------------------------------------- |
| `version` | number | yes      | Format version. Must be `1`.                          |
| `layouts` | array  | yes      | 1–50 layout objects. A file may hold several layouts. |

### Layout

| Property    | Type   | Required | Description                                                                                                                                                                                                                                                                                                   |
| ----------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`      | string | yes      | Name shown in the app, 1–80 characters, no leading or trailing spaces. Must be unique among installed layouts. Saved games refer to the layout by this name.                                                                                                                                                  |
| `scoreName` | string | no       | Identifier under which scores are kept: 1–64 characters of `a`–`z`, `0`–`9`, `-`, `_`, starting with a letter or digit. Must be unique among installed layouts. Defaults to the name in lower case with accents removed and every other run of characters replaced by `-` (`"Café Royal!"` → `"cafe-royal"`). |
| `layers`    | array  | yes      | 1–32 layer objects.                                                                                                                                                                                                                                                                                           |

### Layer

| Property  | Type    | Required | Description                                                                      |
| --------- | ------- | -------- | -------------------------------------------------------------------------------- |
| `z`       | integer | yes      | Height of the layer, `0` (table) to `31`. Several layer objects may share a `z`. |
| `rows`    | array   | no       | Horizontal lines of tiles.                                                       |
| `columns` | array   | no       | Vertical lines of tiles.                                                         |
| `blocks`  | array   | no       | Rectangles of tiles.                                                             |
| `tiles`   | array   | no       | Single tiles.                                                                    |

A layer must contain at least one row, column, block or tile. Unknown properties
are rejected everywhere, so a typo such as `"row"` instead of `"rows"` is reported
instead of silently ignored.

### Shapes

All ranges are inclusive and step by one tile.

| Shape  | Properties                       | Tiles placed                                   |
| ------ | -------------------------------- | ---------------------------------------------- |
| row    | `y`, `left`, `right`             | at `x = left, left + 1, …, right`, all at `y`  |
| column | `x`, `top`, `bottom`             | at `y = top, top + 1, …, bottom`, all at `x`   |
| block  | `left`, `right`, `top`, `bottom` | every combination of the row and column ranges |
| tile   | `x`, `y`                         | one tile                                       |

## Coordinates

- The origin is the top-left corner; `x` grows to the right, `y` grows downwards
  and `z` grows towards the player.
- One unit is one tile: `x` is measured in tile widths, `y` in tile heights. A
  tile at `(x, y)` covers `x … x + 1` and `y … y + 1`.
- Coordinates are numbers from `0` to `100` in steps of `0.5`. Half steps place
  a tile half a tile off the grid — for example the single tiles at `y: 1.5`
  above, centred against a block that spans rows `0` to `3`.
- Higher layers are drawn slightly up and to the right, so a stack looks
  three-dimensional. The board is scaled to fit the window automatically.

Internally (and in saved games) positions are stored in half-tile units, that
is, each coordinate multiplied by two — the same as the original game.

## Which tiles can be played

The rules come straight from the original game and are worth keeping in mind
when designing a layout. A tile is **free** when both of the following hold:

1. **Nothing lies on top of it.** A tile on any higher layer covers it when the
   two are at most half a tile apart horizontally and vertically.
2. **One long side is open.** A tile is blocked on the left by a tile on the
   same layer exactly one tile to the left and at most half a tile up or down;
   likewise on the right. It is free if at least one side is not blocked.

Tiles that are more than one tile apart (for example `x: 0` and `x: 1.5`) leave
a gap and do not block each other.

Faces are dealt by playing the layout backwards from an empty board, so most
layouts start with a solvable deal. Layouts with tall, narrow stacks can still
run out of moves; the game then offers to reshuffle.

## Validation rules

A file is rejected with a message naming the offending property, such as
`layouts[0].layers[1].rows[2].left: must be a multiple of 0.5 between 0 and 100`.
Each layout must:

- have between 2 and 144 tiles, and an **even** number of them, because tiles
  are removed in pairs;
- not place two tiles on the same spot, and not let two tiles on the same layer
  overlap (less than one tile apart in both directions);
- use names and score names that are unique within the file and among the
  installed layouts;
- keep `right ≥ left` and `bottom ≥ top`.

Files must be smaller than 1 MiB.

## Using layouts in the app

Open **Preferences**. Under **Game → Layout**:

- **Load Layout from File…** imports every layout in a `.json`, `.yaml` or
  `.yml` file. Imported layouts are stored on this device (IndexedDB) and work
  offline. The first one is selected; press **Save Preferences** to play it.
- **Export Layout (JSON)** downloads the selected layout — built-in or
  imported — as a JSON file containing one layout. This is a good starting point
  for a new design: export a built-in layout, edit it and import it under a new
  name and score name.
- **Delete Selected Layout** removes an imported layout. Scores are kept. If the
  deleted layout is being played, a new game starts on the first layout.

Imported layouts take part in layout progression, the layout menu and the
scores dialog like built-in ones. Scores are stored under the `scoreName`, so
importing a layout again with the same `scoreName` brings its scores back. A
saved or exported game can only be restored while a layout with the same `name`
is installed.

## Converting original XML maps

The original GNOME Mahjongg reads `.map` files in XML. Each XML construct has a
direct JSON equivalent:

| XML (`mahjongg.map`)                             | JSON                                                           |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `<mahjongg> … </mahjongg>`                       | `{ "version": 1, "layouts": [ … ] }`                           |
| `<map name="…" scorename="…">`                   | `{ "name": "…", "scoreName": "…", "layers": [ … ] }`           |
| `<layer z="2"> … </layer>`                       | `{ "z": 2, … }`                                                |
| `<row y="0" left="1" right="12"/>`               | `"rows": [{ "y": 0, "left": 1, "right": 12 }]`                 |
| `<column x="0" top="1" bottom="6"/>`             | `"columns": [{ "x": 0, "top": 1, "bottom": 6 }]`               |
| `<block left="4" right="9" top="1" bottom="6"/>` | `"blocks": [{ "left": 4, "right": 9, "top": 1, "bottom": 6 }]` |
| `<tile x="0" y="3.5"/>`                          | `"tiles": [{ "x": 0, "y": 3.5 }]`                              |
| `z="1"` on a single element                      | put the element into a layer with `"z": 1`                     |

Missing XML attributes default to `0`; in JSON every property of a shape must
be given.
