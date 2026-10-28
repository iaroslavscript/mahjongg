// SPDX-FileCopyrightText: 2026 Mahjongg Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
/** Full git commit hash the build was made from, or '' when unknown. */
declare const __APP_COMMIT__: string;
/** True when the build included uncommitted changes to tracked files. */
declare const __APP_COMMIT_DIRTY__: boolean;
