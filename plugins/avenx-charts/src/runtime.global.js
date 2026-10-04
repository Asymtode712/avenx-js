/**
 * The runtime resolver used by the standalone browser build.
 *
 * A `<script>`-tag deployment has no module resolution, so the plugin reaches
 * the runtime the same way a compiled Avenx application does: through the
 * namespace the runtime bundle publishes on the global object. The build
 * substitutes this module for `runtime.js`, which keeps `avenx-core` out of
 * the standalone bundle — a page must only ever have one runtime on it.
 *
 * ## The load-order knot this unties
 *
 * `BaseChart extends AvenxComponent`, and an `extends` clause is evaluated the
 * moment the class is defined — while this bundle is parsed. But a compiled
 * Avenx application is one file that publishes the runtime *and then* installs
 * the plugin, so neither load order gives us the runtime at parse time:
 *
 * - plugin first: the application has not run, so `globalThis.Avenx` is empty.
 * - application first: `app.use(avenxCharts)` runs before the plugin bundle
 *   has defined `avenxCharts`.
 *
 * So the base cannot be resolved when the class is defined. Instead this
 * exports a hollow placeholder class that `BaseChart` extends immediately, and
 * {@link bindRuntime} splices the real `AvenxComponent` in underneath it the
 * first time a chart is constructed — by which point the application bundle
 * has published the runtime. Relinking the prototype rather than returning a
 * foreign instance keeps `BaseChart`'s own methods on the chain.
 * @module @avenx/charts/runtime.global
 */

/**
 * Reads the Avenx runtime namespace off the page.
 * @returns {object} The `Avenx` global.
 */
function core() {
  const namespace = typeof globalThis !== 'undefined' ? globalThis.Avenx : undefined;
  if (!namespace || !namespace.AvenxComponent) {
    throw new Error(
      '[avenx-charts] The Avenx runtime was not found on the page. Load the compiled Avenx application bundle alongside avenx-charts.global.js.',
    );
  }
  return namespace;
}

let bound = false;

/**
 * Splices the real `AvenxComponent` under the placeholder, once.
 *
 * Instance methods, statics and `instanceof` are all reached through the
 * prototype chain, so pointing the placeholder's prototype at the runtime
 * class's prototype is what makes `ChartLine.prototype instanceof
 * AvenxComponent` true and inherited methods resolve. This has to happen
 * before `app.register` validates the chart classes, which is why `plugin.js`
 * calls {@link ensureRuntime} at the top of `install()` — by then the
 * application bundle has published the runtime.
 */
export function ensureRuntime() {
  if (bound) return;
  const Real = core().AvenxComponent;
  Object.setPrototypeOf(AvenxComponent.prototype, Real.prototype);
  Object.setPrototypeOf(AvenxComponent, Real);
  bound = true;
}

/**
 * Placeholder base the chart classes extend at definition time.
 *
 * It is a base class (it extends nothing), so a subclass's `super()` lands
 * here. By the time any chart is constructed the runtime has been bound (see
 * {@link ensureRuntime}); the constructor binds defensively in case something
 * constructs a chart before `install()` ran, then builds the instance with
 * `Reflect.construct` so the runtime's constructor runs while the instance
 * keeps the subclass's prototype (`ChartLine`/`BaseChart`), not the
 * placeholder's. Returning that object from a base constructor replaces the
 * `this` the subclass would otherwise get.
 */
export class AvenxComponent {
  /**
   * @param {...any} args - Forwarded to the runtime's AvenxComponent.
   * @returns {object} A runtime component instance with the subclass prototype.
   */
  constructor(...args) {
    ensureRuntime();
    return Reflect.construct(core().AvenxComponent, args, new.target);
  }
}
