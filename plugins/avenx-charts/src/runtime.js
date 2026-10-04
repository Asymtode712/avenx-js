/**
 * Resolves the Avenx runtime once for the whole plugin.
 *
 * A published plugin imports `avenx-core/runtime`. Inside this repository that
 * specifier does not resolve — the nearest package.json is the plugin's own —
 * so the checked-out runtime is used instead. Doing it here, rather than in
 * every component, keeps the fallback to a single place and gives the
 * standalone browser build one module to swap (see `runtime.global.js`).
 * @module @avenx/charts/runtime
 */

let core;
try {
  core = await import('avenx-core/runtime');
} catch {
  core = await import('../../../lib/core/index.js');
}

export const { AvenxComponent } = core;

/**
 * No-op in the module build: `AvenxComponent` above is already the real base
 * class, so there is nothing to resolve. The standalone browser build replaces
 * this module with one whose `ensureRuntime` relinks a lazy placeholder (see
 * `runtime.global.js`); keeping the same export here lets `plugin.js` call it
 * unconditionally.
 */
export function ensureRuntime() {}
