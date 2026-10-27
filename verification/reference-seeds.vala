// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

public static int main () {
    var maps = new Maps ();
    if (!maps.load ())
        return 1;

    string[] map_names = { "Turtle", "Taipei" };
    int32[] seeds = { 0, 123456, 987654321 };
    stdout.printf ("[");
    var first = true;

    foreach (var map_name in map_names) {
        unowned var map = maps.get_map_by_name (map_name);
        if (map == null)
            return 1;

        foreach (var seed in seeds) {
            var game = new Game (map);
            game.generate (seed);

            if (!first)
                stdout.printf (",");
            first = false;
            stdout.printf ("{\"map\":\"%s\",\"seed\":%d,\"tiles\":[", map_name, seed);

            for (var i = 0; i < game.n_tiles; i++) {
                var tile = game.get_tile (i);
                if (tile == null)
                    return 1;
                if (i > 0)
                    stdout.printf (",");
                stdout.printf (
                    "[%d,%d,%d,%d,%d]",
                    tile.number,
                    tile.selectable ? 1 : 0,
                    tile.slot.x,
                    tile.slot.y,
                    tile.slot.layer
                );
            }
            stdout.printf ("]}");
        }
    }

    stdout.printf ("]\n");
    return 0;
}
