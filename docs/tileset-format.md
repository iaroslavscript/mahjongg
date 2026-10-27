<!-- SPDX-FileCopyrightText: 2026 Mahjongg Contributors
     SPDX-License-Identifier: GPL-3.0-or-later -->

# Tileset (theme) file format

A tileset is a single image — a **sprite sheet** — that holds the picture of
every tile face. You can draw your own (cats, dogs, flags, anything you like),
load it under **☰ → Preferences → Load Theme from File…** and play with it right
away. Tilesets made for GNOME Mahjongg work too.

Every face sits in a fixed **column** of the sheet, and the column decides how
the tile behaves in the game. In the standard order, a picture in column 3 is
always "Dots 4": it pairs only with the other three copies of itself. A picture
in column 38 is always "Spring": it pairs with any of the four seasons. The
[column reference](#column-reference) below lists every column. In the app,
**☰ → Rules → Tile groups** shows the faces of the current tileset grouped this
way, and tapping a face highlights the faces it pairs with.

## The sprite sheet at a glance

The sheet is a grid of **43 columns × 2 rows** of equally sized cells:

- **Row 1** holds the normal faces.
- **Row 2** holds the same faces in their **highlighted** look, drawn while a
  tile is selected and in the Rules dialog. Make it clearly different from
  row 1 (for example tinted, brighter or outlined), otherwise players cannot
  see which tile they selected.
- **Columns 0–41** are the 42 different faces, in one of two
  [tile orders](#tile-orders); see the [column reference](#column-reference).
- **Column 42** is a blank tile. It is shown instead of the faces while the
  game is paused.

## Size and proportions

Each cell has a width-to-height ratio of **64 : 88**, so the whole sheet has a
ratio of **2752 : 176** (43 × 64 by 2 × 88). The app checks this ratio when the
file is loaded and accepts at most 1% deviation. The absolute size is up to you:

| Sheet size  | Cell size | Notes                                               |
| ----------- | --------- | --------------------------------------------------- |
| 2752 × 176  | 64 × 88   | Smallest sensible PNG; looks soft on large screens. |
| 5504 × 352  | 128 × 176 | Good PNG size; sharp on phones and HiDPI screens.   |
| 10750 × 688 | 250 × 344 | Very sharp; the built-in Smooth theme uses this.    |
| any, as SVG | —         | Use `viewBox="0 0 2752 176"`; scales to any size.   |

## Drawing a cell

Each cell contains the whole tile, including its 3D edge, not just the face.
Tiles on higher layers are drawn shifted up and to the right, so the edge is on
the **left** and at the **bottom** of the tile, and the face fills the
top-right part of the cell. In a 64 × 88 cell, the built-in themes use about:

```text
 0       9                       64
 +-------+------------------------+  0
 |       |                        |
 | edge  |       tile face        |
 |       |        ~55 × 79        |
 |       |                        |
 |       +------------------------+  79
 |              bottom edge       |
 +--------------------------------+  88
```

- The game places neighbouring tiles about 7/8 of a cell apart horizontally
  and 10/11 of a cell vertically, so the edge strips of one tile overlap its
  neighbours. Keep everything outside the tile shape **transparent**.
- Keep the edge the same width in every cell, otherwise the board looks
  uneven.
- Keep important details away from the edges of the face: on a phone a tile
  can be only 30–40 pixels wide.

## Tile orders

Sheets come in two column orders. Both use the same cells and file format; they
only differ in which column holds which face:

- **Standard** (the default for new tilesets) — the suits in order: dots,
  bamboo, characters, winds, the three dragons, flowers and seasons.
- **GNOME Mahjongg** — the order of GNOME Mahjongg themes, including the three
  built-in ones. Its suits are mixed up a little, and the White Dragon sits
  between the flowers and the seasons, apart from the other two dragons.

Draw new tilesets in the standard order. When a tileset is loaded, the app asks
which order it uses and shows a live preview of the tile groups, so a wrong
choice is easy to spot: a flower appears among the dragons, or the dragons are
split up. You can change the order later; see
[Using tilesets in the app](#using-tilesets-in-the-app).

An SVG sheet can declare its order on the root element; the app then
preselects it:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2752 176" data-tile-order="gnome">
```

The values are `standard` and `gnome`. Without the attribute, and for PNG
sheets, the app preselects the standard order.

## Column reference

Tiles pair either with an **identical** face (34 faces, 4 copies of each in a
game) or with **any face of their group** (flowers and seasons, 1 copy of each).
When you design a custom set, use the identical columns for pictures that should
only pair with themselves, and the flower and season columns for two families
of four pictures that belong together — for example four cat breeds and four
dog breeds.

The **Standard** and **GNOME** columns give the sheet column of each face in
the two [tile orders](#tile-orders); the "Pairs with" ranges use standard
columns.

| Standard | GNOME | Tile          | Group      | Pairs with         |
| -------- | ----- | ------------- | ---------- | ------------------ |
| 0        | 0     | Dots 1        | Dots       | an identical tile  |
| 1        | 1     | Dots 2        | Dots       | an identical tile  |
| 2        | 2     | Dots 3        | Dots       | an identical tile  |
| 3        | 3     | Dots 4        | Dots       | an identical tile  |
| 4        | 4     | Dots 5        | Dots       | an identical tile  |
| 5        | 5     | Dots 6        | Dots       | an identical tile  |
| 6        | 6     | Dots 7        | Dots       | an identical tile  |
| 7        | 7     | Dots 8        | Dots       | an identical tile  |
| 8        | 8     | Dots 9        | Dots       | an identical tile  |
| 9        | 24    | Bamboo 1      | Bamboo     | an identical tile  |
| 10       | 25    | Bamboo 2      | Bamboo     | an identical tile  |
| 11       | 26    | Bamboo 3      | Bamboo     | an identical tile  |
| 12       | 27    | Bamboo 4      | Bamboo     | an identical tile  |
| 13       | 28    | Bamboo 5      | Bamboo     | an identical tile  |
| 14       | 29    | Bamboo 6      | Bamboo     | an identical tile  |
| 15       | 30    | Bamboo 7      | Bamboo     | an identical tile  |
| 16       | 31    | Bamboo 8      | Bamboo     | an identical tile  |
| 17       | 32    | Bamboo 9      | Bamboo     | an identical tile  |
| 18       | 15    | Characters 1  | Characters | an identical tile  |
| 19       | 16    | Characters 2  | Characters | an identical tile  |
| 20       | 17    | Characters 3  | Characters | an identical tile  |
| 21       | 18    | Characters 4  | Characters | an identical tile  |
| 22       | 19    | Characters 5  | Characters | an identical tile  |
| 23       | 20    | Characters 6  | Characters | an identical tile  |
| 24       | 21    | Characters 7  | Characters | an identical tile  |
| 25       | 22    | Characters 8  | Characters | an identical tile  |
| 26       | 23    | Characters 9  | Characters | an identical tile  |
| 27       | 12    | East Wind     | Winds      | an identical tile  |
| 28       | 11    | South Wind    | Winds      | an identical tile  |
| 29       | 10    | West Wind     | Winds      | an identical tile  |
| 30       | 9     | North Wind    | Winds      | an identical tile  |
| 31       | 13    | Red Dragon    | Dragons    | an identical tile  |
| 32       | 14    | Green Dragon  | Dragons    | an identical tile  |
| 33       | 37    | White Dragon  | Dragons    | an identical tile  |
| 34       | 35    | Plum          | Flowers    | any flower (34–37) |
| 35       | 33    | Orchid        | Flowers    | any flower (34–37) |
| 36       | 34    | Chrysanthemum | Flowers    | any flower (34–37) |
| 37       | 36    | Bamboo Flower | Flowers    | any flower (34–37) |
| 38       | 38    | Spring        | Seasons    | any season (38–41) |
| 39       | 39    | Summer        | Seasons    | any season (38–41) |
| 40       | 40    | Autumn        | Seasons    | any season (38–41) |
| 41       | 41    | Winter        | Seasons    | any season (38–41) |
| 42       | 42    | Blank         | —          | shown while paused |

## File requirements

| Rule      | Requirement                                                         |
| --------- | ------------------------------------------------------------------- |
| Type      | PNG (`.png`) or SVG (`.svg`); the extension must match the content. |
| File size | Larger than 0 bytes and at most 10 MiB.                             |
| Ratio     | 2752 : 176 (43 × 2 cells of 64 : 88), within 1%.                    |
| Name      | Taken from the file name without extension; 1–120 characters.       |

An SVG sheet gets its size from a four-value `viewBox`, or otherwise from
`width` and `height` given as plain numbers or in `px`. For safety, SVG files
are rejected when they contain:

- a `<!DOCTYPE …>` or `<!ENTITY …>` declaration;
- `<script>`, `<foreignObject>`, `<iframe>`, `<object>`, `<embed>`, `<audio>`
  or `<video>` elements;
- event handler attributes such as `onload`;
- links or `url(…)` references to anything other than an element in the same
  file (`#id`) or an embedded `data:image/png`, `data:image/jpeg` or
  `data:image/webp` base64 image, and `@import` in style sheets.

External files cannot be loaded, so embed any bitmaps in the SVG and convert
text to paths.

## Using tilesets in the app

- **Load:** **☰ → Preferences → Load Theme from File…** checks the file, stores
  it in the browser (so it also works offline) and switches to it. The **Tile
  Order** dialog then opens, so you can confirm the
  [tile order](#tile-orders) against the preview.
- **Choose:** pick any built-in or loaded tileset in the **Theme** list of the
  Preferences.
- **Check:** open **☰ → Rules** and look at **Tile groups** to see every face of
  the current tileset and what it pairs with.
- **Fix the order:** select a loaded tileset in Preferences and use **Tile
  Order…**. Built-in tilesets always use the GNOME order. Tilesets loaded
  before tile orders existed keep the GNOME order they were drawn for.
- **Delete:** select the tileset in Preferences and use **Delete Selected
  Theme**. Built-in tilesets cannot be deleted.

## Starting from a built-in tileset

The built-in sheets live in [`src/assets/themes`](../src/assets/themes) and are
good templates: `postmodern.svg` (vector, `viewBox="0 0 2752 176"`),
`educational.png` (4128 × 264, cells of 96 × 132) and `smooth.png`
(10750 × 688, cells of 250 × 344). They are licensed under GPL-3.0-or-later, so
tilesets derived from them must be shared under the same license.

The built-in sheets use the **GNOME** order. Either keep that order and add
`data-tile-order="gnome"` (SVG) or choose **GNOME Mahjongg** in the Tile Order
dialog, or move the cells into the standard order. `postmodern.svg` also starts
with a `<!DOCTYPE …>` line; delete that line before loading an edited copy, or
the file is rejected.
