# Charts example — a line chart that reacts to state

A complete Avenx application, compiled with the Avenx CLI, showing
`@avenx/charts` rendering one reactive chart:

- **[`src/pages/dashboard.page.js`](src/pages/dashboard.page.js)** — a page
  with a `sales` array in `<state>` and a `<ChartLine :data="sales" ... />`
  bound to it. Two actions change `sales`; the chart redraws on its own because
  its `data` prop is a reactive binding.
- **[`src/main.app.js`](src/main.app.js)** — installs the plugin with
  `app.use(AvenxCharts.avenxCharts)`, which registers the chart components
  (`ChartLine` among them). It also imports `avenx-core/runtime/string-renderer`
  — see the note at the end for why.
- **One chart type, one page.** The point is something you can build and open
  in under a minute, not a gallery.

## Running it

The example loads the plugin's standalone bundle from `../dist/`, so build that
once first:

```bash
npm run build --prefix ..
```

Then, from this directory, build the application:

```bash
node ../../../bin/avenx.js build
```

Serve the **plugin** directory (one level up), because `index.html` loads the
plugin bundle from `../dist/`:

```bash
python3 -m http.server 8000 --directory ..
```

and open <http://localhost:8000/example/>.

## Things to try

1. **Click "Add a point."** A new month appears and the line extends to it. The
   action assigns `sales` a new array; the chart's `:data` binding sees the new
   value and redraws.
2. **Click it a few more times, then "Reset."** The chart snaps back to the
   four months it started with.
3. **Hover the line.** `tooltip` is on, so a crosshair follows the pointer and a
   card shows the nearest point's value.
4. **Open [`dashboard.page.js`](src/pages/dashboard.page.js) and change the
   chart props.** Drop `fill`, or set `curve="linear"`, rebuild, and reload to
   see the difference.

## The `<ChartLine>` tag and the `<chart.line>` shorthand

This page writes the chart as a plain component tag:

```html
<ChartLine :data="sales" x="month" y="value" grid dots fill legend tooltip />
```

`:data="sales"` is a bound (reactive) prop; `x` and `y` name the dataset keys
to plot; `grid dots fill legend tooltip` are boolean props. The Avenx CLI
compiles every one of these into the bundle, so the production build carries no
expression interpreter.

`@avenx/charts` also ships a `<chart.line data={sales} ... />` shorthand that a
template preprocessor expands into the same component. That preprocessor runs
under a bundler — see [`@avenx/vite`](../../avenx-vite) — so this CLI example
uses the plain tag and no preprocessor.

## `warnings.AVX_W46`

[`avenx.config.json`](avenx.config.json) turns off one warning:

```json
{ "warnings": { "AVX_W46": "off" } }
```

`ChartLine` is registered at runtime by the plugin, not by a file under `src/`,
so the compiler — which only reads your source — cannot see it and would report
`<ChartLine>` as an unresolved component. The props are still compiled; the tag
still resolves at runtime. Silencing the one code is the documented way to tell
the compiler a name is provided by a plugin.

## Why the plugin is loaded from a `<script>` tag

The Avenx CLI compiles an application into one self-contained bundle that
already contains the runtime, so a plugin reaches that runtime through a global
rather than an import — which is what [`index.html`](index.html) sets up, and
why `main.app.js` says `app.use(AvenxCharts.avenxCharts)`.

The plugin bundle loads **before** the application bundle so `AvenxCharts`
exists when `main.app.js` installs it. The chart classes resolve the runtime
lazily, on the first chart they build, which is after the application bundle has
published it — so that order is safe.

With a bundler (Vite, Rollup, webpack) none of that applies: drop the script tag
and `import { avenxCharts } from '@avenx/charts'`.

## Why `main.app.js` imports the string renderer

The chart components come from the plugin, compiled by the plugin's own build —
not from this project's `src/`, where the Avenx compiler would lower their
templates. So they render through Avenx's string renderer at runtime, and a
compiled application drops that renderer unless something asks for it. The line

```javascript
import 'avenx-core/runtime/string-renderer';
```

is that request. An application whose own templates all compile does not need
it; one that mounts a plugin-provided component like this chart does.
