/**
 * Avenx Charts Plugin Definition
 * @module plugins/avenx-charts/src/plugin
 */

import { ChartLine } from './components/ChartLine.js';
import { BaseChart } from './components/BaseChart.js';
import { ensureRuntime } from './runtime.js';

/**
 * Registry of available chart types mapped to their component classes.
 * Easily extensible for future chart types (chart.bar, chart.area, chart.pie, etc.).
 */
export const CHART_TYPES = {
  line: ChartLine,
};

/**
 * Official Avenx Charts plugin.
 * Usage:
 * ```javascript
 * import { avenxCharts } from '@avenx/charts';
 * app.use(avenxCharts);
 * ```
 */
export const avenxCharts = {
  /**
   * Installs the chart plugin on an AvenxApp instance.
   * @param {import('avenx-core/runtime').AvenxApp} app - Avenx application instance.
   * @param {object} [options] - Global chart configuration options.
   */
  install(app, options = {}) {
    if (!app || typeof app.register !== 'function') {
      throw new Error('[avenx-charts] Invalid AvenxApp instance passed to plugin install().');
    }

    // In the standalone browser build the chart classes extend a lazy
    // placeholder; this binds it to the runtime the page published before
    // app.register() validates that the classes extend AvenxComponent. A no-op
    // in the module build, where the base is already the real class.
    ensureRuntime();

    this.options = options;

    // Register all standard chart types under multiple aliases for flexibility
    for (const [typeName, CompClass] of Object.entries(CHART_TYPES)) {
      const dottedName = `chart.${typeName}`;
      const pascalName = `Chart${typeName.charAt(0).toUpperCase() + typeName.slice(1)}`;
      const hyphenName = `chart-${typeName}`;

      // Register dotted tag: <chart.line> / data-avenx-comp="chart.line"
      if (!app.components.has(dottedName)) {
        app.register(dottedName, CompClass);
      }

      // Register PascalCase tag: <ChartLine> / data-avenx-comp="ChartLine"
      if (!app.components.has(pascalName)) {
        app.register(pascalName, CompClass);
      }

      // Register hyphen tag: <chart-line> / data-avenx-comp="chart-line"
      if (!app.components.has(hyphenName)) {
        app.register(hyphenName, CompClass);
      }
    }

    // Register BaseChart if users wish to extend custom chart types
    if (!app.components.has('BaseChart')) {
      app.register('BaseChart', BaseChart);
    }
  },
};

/**
 * Functional plugin alias for app.use(createAvenxCharts(options)).
 * @param {object} [options]
 * @returns {typeof avenxCharts}
 */
export function createAvenxCharts(options = {}) {
  return {
    install(app) {
      avenxCharts.install(app, options);
    },
  };
}

export default avenxCharts;
