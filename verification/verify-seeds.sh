#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Mahjongg Contributors
# SPDX-License-Identifier: GPL-3.0-or-later
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="$root_dir/original/gnome-mahjongg-main"
build_dir="$(mktemp -d)"
trap 'rm -rf "$build_dir"' EXIT

glib-compile-resources \
  "$source_dir/tests/maps.gresource.xml" \
  --sourcedir="$source_dir/tests" \
  --target="$build_dir/maps.c" \
  --generate-source 2>/dev/null

valac \
  --pkg gio-2.0 \
  -X -w \
  -X '-DGETTEXT_PACKAGE="gnome-mahjongg"' \
  --output="$build_dir/reference-seeds" \
  "$source_dir/src/map.vala" \
  "$source_dir/src/game-save.vala" \
  "$source_dir/src/game.vala" \
  "$build_dir/maps.c" \
  "$root_dir/verification/reference-seeds.vala"

"$build_dir/reference-seeds" > "$build_dir/reference-seeds.json"
cd "$root_dir"
MAHJONGG_REFERENCE_FILE="$build_dir/reference-seeds.json" \
  pnpm exec vitest run src/core/reference-seeds.test.ts
