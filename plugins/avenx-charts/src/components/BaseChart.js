/**
 * Base Chart Component for Avenx Charts
 * @module plugins/avenx-charts/src/components/BaseChart
 */

import { AvenxComponent } from '../runtime.js';
import { createLinearScale, createPointScale, getExtent } from '../core/scales.js';
import { generateGridLines } from '../core/shapes.js';
import { resolveTheme, formatValue } from '../core/theme.js';
import { normalizeSeries, renderLegendHtml } from '../core/legend.js';
import { findNearestIndex, renderTooltipContent, calculateTooltipPosition } from '../core/tooltip.js';

/**
 * Base class for all Avenx chart components.
 * Manages responsive layout, coordinate scales, gridlines, axes, legends, and tooltips.
 */
export class BaseChart extends AvenxComponent {
  /**
   * @param {object} [bridges] - External bridges.
   * @param {object} [props] - Component properties.
   */
  constructor(bridges, props = {}) {
    super(
      {
        activePointIndex: -1,
        tooltipVisible: false,
        tooltipX: 0,
        tooltipY: 0,
        containerWidth: 600,
        containerHeight: 320,
        hiddenSeries: {},
      },
      {},
      bridges,
      `
      <div class="ax-chart-wrapper" data-ax-ref="wrapper" style="position: relative; width: 100%; display: flex; flex-direction: column; box-sizing: border-box; user-select: none;">
        <div class="ax-chart-legend-container" data-ax-ref="legend"></div>
        <div class="ax-chart-svg-container" data-ax-ref="svgContainer" style="position: relative; width: 100%; flex: 1 1 auto; min-height: 150px;">
          <svg class="ax-chart-svg" data-ax-ref="svg" style="display: block; width: 100%; height: 100%; overflow: visible;"></svg>
          <div class="ax-chart-tooltip" data-ax-ref="tooltip" style="display: none; position: absolute; pointer-events: none; z-index: 50; padding: 8px 12px; border-radius: 8px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15); backdrop-filter: blur(8px); transition: opacity 0.15s ease, transform 0.1s ease;"></div>
        </div>
      </div>
      `,
      {},
      props,
    );

    /** @type {ResizeObserver|null} */
    this.resizeObserver = null;
    /** Cached calculated plot points for hit-testing @type {any[]} */
    this.plotData = [];
    /** Current normalized series configurations @type {any[]} */
    this.seriesList = [];
    /** Current active theme @type {object} */
    this.activeTheme = {};

    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.onLegendClick = this.onLegendClick.bind(this);
  }

  /**
   * Component mount lifecycle hook.
   */
  onMount() {
    this.initResizeObserver();
    this.attachEventListeners();
    this.renderChart();
  }

  /**
   * Component update lifecycle hook (called when props or state change).
   */
  onUpdate() {
    this.renderChart();
  }

  /**
   * Component destroy lifecycle hook.
   */
  onDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.detachEventListeners();
  }

  /**
   * Initializes ResizeObserver to adapt chart layout to container size changes.
   */
  initResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;

    const target = this.$refs.svgContainer || this._getElement();
    if (!target) return;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && Math.abs(width - this.state.containerWidth) > 2) {
          this.state.containerWidth = Math.round(width);
          if (height > 0) {
            this.state.containerHeight = Math.round(height);
          }
          this.renderChart();
        }
      }
    });

    this.resizeObserver.observe(target);
  }

  /**
   * Attaches pointer and legend interaction listeners.
   */
  attachEventListeners() {
    if (this.$refs.svgContainer) {
      this.$refs.svgContainer.addEventListener('mousemove', this.onPointerMove);
      this.$refs.svgContainer.addEventListener('mouseleave', this.onPointerLeave);
      this.$refs.svgContainer.addEventListener('touchstart', this.onPointerMove, { passive: true });
      this.$refs.svgContainer.addEventListener('touchmove', this.onPointerMove, { passive: true });
      this.$refs.svgContainer.addEventListener('touchend', this.onPointerLeave);
    }
    if (this.$refs.legend) {
      this.$refs.legend.addEventListener('click', this.onLegendClick);
    }
  }

  /**
   * Detaches interaction listeners.
   */
  detachEventListeners() {
    if (this.$refs.svgContainer) {
      this.$refs.svgContainer.removeEventListener('mousemove', this.onPointerMove);
      this.$refs.svgContainer.removeEventListener('mouseleave', this.onPointerLeave);
      this.$refs.svgContainer.removeEventListener('touchstart', this.onPointerMove);
      this.$refs.svgContainer.removeEventListener('touchmove', this.onPointerMove);
      this.$refs.svgContainer.removeEventListener('touchend', this.onPointerLeave);
    }
    if (this.$refs.legend) {
      this.$refs.legend.removeEventListener('click', this.onLegendClick);
    }
  }

  /**
   * Handles pointer movements over the chart area for tooltip tracking and crosshairs.
   * @param {MouseEvent|TouchEvent} event
   */
  onPointerMove(event) {
    const isTooltipEnabled = this.isPropTrue('tooltip');
    if (!isTooltipEnabled || !this.plotData || this.plotData.length === 0) {
      return;
    }

    const svgEl = this.$refs.svg;
    if (!svgEl) return;

    const rect = svgEl.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;

    const svgX = ((clientX - rect.left) / rect.width) * this.viewBoxWidth;

    const nearestIdx = findNearestIndex(svgX, this.plotData);
    if (nearestIdx >= 0 && nearestIdx !== this.state.activePointIndex) {
      this.state.activePointIndex = nearestIdx;
      this.state.tooltipVisible = true;
      this.state.tooltipX = clientX - rect.left;
      this.state.tooltipY = clientY - rect.top;

      const activeItem = this.plotData[nearestIdx];
      this.$emit('hover', {
        index: nearestIdx,
        data: activeItem.raw,
        x: activeItem.xVal,
      });

      this.updateTooltipDOM(activeItem, clientX - rect.left, clientY - rect.top);
      this.updateInteractiveOverlay();
    }
  }

  /**
   * Handles pointer leaving the chart area.
   */
  onPointerLeave() {
    this.state.activePointIndex = -1;
    this.state.tooltipVisible = false;

    if (this.$refs.tooltip) {
      this.$refs.tooltip.style.display = 'none';
    }
    this.updateInteractiveOverlay();
    this.$emit('leave', {});
  }

  /**
   * Handles legend item clicks to toggle series visibility.
   * @param {MouseEvent} event
   */
  onLegendClick(event) {
    const itemEl = event.target.closest('.ax-chart-legend-item');
    if (!itemEl) return;

    const idxStr = itemEl.getAttribute('data-series-idx');
    const idx = parseInt(idxStr, 10);
    if (isNaN(idx) || !this.seriesList[idx]) return;

    const seriesKey = this.seriesList[idx].key;
    const currentHidden = !!this.state.hiddenSeries[seriesKey];
    this.state.hiddenSeries[seriesKey] = !currentHidden;

    this.renderChart();
    this.$emit('series-toggle', {
      key: seriesKey,
      hidden: !currentHidden,
    });
  }

  /**
   * Helper to check if a boolean-style prop is true (supports true, 'true', '', 1).
   * @param {string} propName
   * @returns {boolean}
   */
  isPropTrue(propName) {
    const val = this.props[propName];
    return val === true || val === 'true' || val === '' || val === 1 || val === '1';
  }

  /**
   * Unwraps reactive data into a plain array.
   * @returns {any[]}
   */
  getData() {
    let raw = this.props.data;
    if (raw && typeof raw === 'object' && raw[Symbol.for('rawTarget')]) {
      raw = raw[Symbol.for('rawTarget')];
    }
    if (Array.isArray(raw)) {
      return raw;
    }
    return [];
  }

  /**
   * Calculates chart layout dimensions, viewbox, and margins.
   */
  getLayout() {
    const width = Number(this.props.width) || this.state.containerWidth || 600;
    const height = Number(this.props.height) || Number(this.props['height']) || 320;

    const defaultMargin = { top: 24, right: 24, bottom: 38, left: 52 };
    const margin =
      typeof this.props.margin === 'object' && this.props.margin !== null
        ? { ...defaultMargin, ...this.props.margin }
        : defaultMargin;

    const plotWidth = Math.max(10, width - margin.left - margin.right);
    const plotHeight = Math.max(10, height - margin.top - margin.bottom);

    return {
      width,
      height,
      margin,
      plotWidth,
      plotHeight,
      plotLeft: margin.left,
      plotRight: width - margin.right,
      plotTop: margin.top,
      plotBottom: height - margin.bottom,
    };
  }

  /**
   * Main render method. Assembles SVG elements, axes, grid, plot layer, legend, and tooltip.
   */
  renderChart() {
    const svgEl = this.$refs.svg;
    if (!svgEl) return;

    const data = this.getData();
    const layout = this.getLayout();
    this.viewBoxWidth = layout.width;
    this.viewBoxHeight = layout.height;

    this.activeTheme = resolveTheme(this.props.theme || 'light');
    const colors = this.props.colors || this.props.color || 'default';

    // Normalize series
    const rawY = this.props.y || this.props.series || 'value';
    this.seriesList = normalizeSeries(rawY, colors).map((s) => ({
      ...s,
      hidden: !!this.state.hiddenSeries[s.key],
    }));

    // Update legend DOM
    if (this.isPropTrue('legend') && this.$refs.legend) {
      this.$refs.legend.innerHTML = renderLegendHtml(this.seriesList, this.activeTheme);
      this.$refs.legend.style.display = 'block';
    } else if (this.$refs.legend) {
      this.$refs.legend.style.display = 'none';
      this.$refs.legend.innerHTML = '';
    }

    if (data.length === 0) {
      svgEl.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
      svgEl.innerHTML = `
        <text x="${layout.width / 2}" y="${layout.height / 2}" text-anchor="middle" fill="${this.activeTheme.textMuted}" font-family="${this.activeTheme.fontFamily}" font-size="13">
          No data available
        </text>
      `;
      return;
    }

    // Compute scales
    const xKey = this.props.x || 'x';
    const xCategories = data.map((d, i) => (d[xKey] !== undefined ? String(d[xKey]) : `Point ${i + 1}`));

    const xScale = createPointScale(xCategories, [layout.plotLeft, layout.plotRight], { padding: 0.3 });

    const activeSeriesKeys = this.seriesList.filter((s) => !s.hidden).map((s) => s.key);
    const [yMin, yMax] = getExtent(data, activeSeriesKeys.length > 0 ? activeSeriesKeys : ['value'], {
      includeZero: this.props.zero !== false && this.props.zero !== 'false',
    });

    const yScale = createLinearScale([yMin, yMax], [layout.plotBottom, layout.plotTop], {
      nice: true,
      tickCount: 5,
    });

    // Compute plot coordinates for all points
    this.plotData = data.map((d, idx) => {
      const xVal = d[xKey] !== undefined ? String(d[xKey]) : `Point ${idx + 1}`;
      const xCoord = xScale(xVal);
      const seriesCoords = {};

      for (const s of this.seriesList) {
        const val = d[s.key] !== undefined ? Number(d[s.key]) : 0;
        seriesCoords[s.key] = {
          value: val,
          yCoord: yScale(val),
        };
      }

      return {
        raw: d,
        index: idx,
        xVal,
        xCoord,
        seriesCoords,
      };
    });

    // Generate SVG layers
    let svgMarkup = '';

    // 1. Defs (gradients and filters)
    svgMarkup += this.renderDefs(layout, this.seriesList);

    // 2. Gridlines
    if (this.isPropTrue('grid')) {
      const yTicks = yScale.ticks(5).map((t) => yScale(t));
      const gridD = generateGridLines(
        [],
        yTicks,
        [layout.plotLeft, layout.plotRight],
        [layout.plotTop, layout.plotBottom],
        {
          horizontal: true,
          vertical: false,
        },
      );
      svgMarkup += `
        <g class="ax-chart-grid" opacity="1">
          <path d="${gridD}" stroke="${this.activeTheme.gridColor}" stroke-width="1" stroke-dasharray="3,3" fill="none" shape-rendering="crispEdges" />
        </g>
      `;
    }

    // 3. Axes
    svgMarkup += this.renderAxes(layout, xScale, yScale, xCategories);

    // 4. Subclass specific plot layer (e.g. lines, bars, areas)
    svgMarkup += `
      <g class="ax-chart-plot" data-ax-ref="plotLayer">
        ${this.renderPlot(layout, xScale, yScale)}
      </g>
    `;

    // 5. Interactive overlay layer (crosshair and active points)
    svgMarkup += `
      <g class="ax-chart-overlay" data-ax-ref="overlayLayer">
        ${this.renderInteractiveOverlayMarkup(layout)}
      </g>
    `;

    svgEl.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svgEl.innerHTML = svgMarkup;
  }

  /**
   * Renders SVG defs (gradient fills, shadows).
   * @param {object} layout
   * @param {any[]} seriesList
   * @returns {string} SVG defs markup.
   */
  renderDefs(layout, seriesList) {
    let defs = '<defs>';
    seriesList.forEach((s, idx) => {
      defs += `
        <linearGradient id="ax-grad-${idx}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${s.color}" stop-opacity="0.35" />
          <stop offset="100%" stop-color="${s.color}" stop-opacity="0.0" />
        </linearGradient>
      `;
    });
    defs += '</defs>';
    return defs;
  }

  /**
   * Renders SVG X and Y axes, tick marks, and labels.
   * @param {object} layout
   * @param {Function} xScale
   * @param {Function} yScale
   * @param {string[]} xCategories
   * @returns {string} SVG axes markup.
   */
  renderAxes(layout, xScale, yScale, xCategories) {
    const { fontFamily, fontSize, textMuted, axisColor } = this.activeTheme;
    let markup = '<g class="ax-chart-axes">';

    // Y Axis ticks & labels
    const yTicks = yScale.ticks(5);
    for (const tickVal of yTicks) {
      const yPos = yScale(tickVal);
      const formatted = formatValue(tickVal);
      markup += `
        <text x="${layout.plotLeft - 10}" y="${yPos + 4}" text-anchor="end" fill="${textMuted}" font-family="${fontFamily}" font-size="${fontSize}">
          ${formatted}
        </text>
      `;
    }

    // X Axis ticks & labels
    // Sample labels if too many to avoid overlapping
    const maxLabels = Math.floor(layout.plotWidth / 55);
    const step = Math.ceil(xCategories.length / maxLabels);

    xCategories.forEach((cat, idx) => {
      if (idx % step === 0 || idx === xCategories.length - 1) {
        const xPos = xScale(cat);
        markup += `
          <text x="${xPos}" y="${layout.plotBottom + 18}" text-anchor="middle" fill="${textMuted}" font-family="${fontFamily}" font-size="${fontSize}">
            ${cat}
          </text>
        `;
      }
    });

    // Bottom baseline axis line
    markup += `
      <line x1="${layout.plotLeft}" y1="${layout.plotBottom}" x2="${layout.plotRight}" y2="${layout.plotBottom}" stroke="${axisColor}" stroke-width="1" shape-rendering="crispEdges" />
    `;

    markup += '</g>';
    return markup;
  }

  /**
   * Abstract plot renderer. Overridden by specific chart components (ChartLine, etc.).
   * @returns {string} SVG plot markup.
   */
  renderPlot() {
    return '';
  }

  /**
   * Renders interactive crosshair and highlight markers inside SVG.
   * @param {object} layout
   * @returns {string}
   */
  renderInteractiveOverlayMarkup(layout) {
    if (this.state.activePointIndex < 0 || !this.plotData[this.state.activePointIndex]) {
      return '';
    }

    const activeItem = this.plotData[this.state.activePointIndex];
    const x = activeItem.xCoord;
    let markup = `
      <line x1="${x}" y1="${layout.plotTop}" x2="${x}" y2="${layout.plotBottom}" stroke="${this.activeTheme.crosshairColor}" stroke-width="1.5" stroke-dasharray="3,3" shape-rendering="crispEdges" />
    `;

    for (const s of this.seriesList) {
      if (s.hidden) continue;
      const point = activeItem.seriesCoords[s.key];
      if (!point) continue;

      markup += `
        <circle cx="${x}" cy="${point.yCoord}" r="5.5" fill="${s.color}" stroke="${this.activeTheme.tooltipBg}" stroke-width="2.5" />
      `;
    }

    return markup;
  }

  /**
   * Updates interactive overlay without full re-render for maximum 60fps smoothness.
   */
  updateInteractiveOverlay() {
    const overlayGroup = this.$refs.svg ? this.$refs.svg.querySelector('.ax-chart-overlay') : null;
    if (overlayGroup) {
      overlayGroup.innerHTML = this.renderInteractiveOverlayMarkup(this.getLayout());
    }
  }

  /**
   * Updates tooltip DOM element content and position.
   * @param {object} activeItem
   * @param {number} mouseX
   * @param {number} mouseY
   */
  updateTooltipDOM(activeItem, mouseX, mouseY) {
    const tooltipEl = this.$refs.tooltip;
    const containerEl = this.$refs.svgContainer;
    if (!tooltipEl || !containerEl) return;

    const visibleItems = this.seriesList
      .filter((s) => !s.hidden)
      .map((s) => ({
        name: s.name,
        value: activeItem.raw[s.key],
        color: s.color,
      }));

    tooltipEl.innerHTML = renderTooltipContent(
      {
        title: activeItem.xVal,
        items: visibleItems,
      },
      this.activeTheme,
    );

    tooltipEl.style.background = this.activeTheme.tooltipBg;
    tooltipEl.style.border = `1px solid ${this.activeTheme.tooltipBorder}`;
    tooltipEl.style.display = 'block';

    const pos = calculateTooltipPosition(
      mouseX,
      mouseY,
      containerEl.clientWidth || 600,
      containerEl.clientHeight || 300,
      140,
      70,
    );

    tooltipEl.style.left = `${pos.left}px`;
    tooltipEl.style.top = `${pos.top}px`;
  }
}
