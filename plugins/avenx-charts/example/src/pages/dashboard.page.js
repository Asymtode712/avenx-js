<state
    sales="[
        { month: 'Jan', value: 120 },
        { month: 'Feb', value: 240 },
        { month: 'Mar', value: 180 },
        { month: 'Apr', value: 410 }
    ]"
    next="5"
/>

<!--
  Add a point. Assigning a new array (rather than pushing into the old one)
  gives `sales` a new value, which is what the chart's `data` binding watches —
  so the chart redraws with the extra point on its own.
-->
<action name="addPoint">
    const month = 'M' + next;
    const value = 80 + Math.round(Math.random() * 420);
    sales = [...sales, { month, value }];
    next = next + 1;
</action>

<action name="reset">
    sales = [
        { month: 'Jan', value: 120 },
        { month: 'Feb', value: 240 },
        { month: 'Mar', value: 180 },
        { month: 'Apr', value: 410 }
    ];
    next = 5;
</action>

<div @css page>
    <@css card />

    <header @css head>
        <h1 @css title>Monthly sales</h1>
        <p @css hint>{{ sales.length }} points. Add one and watch the line redraw.</p>
    </header>

    <!--
      The chart. `:data="sales"` is a reactive binding: when an action gives
      `sales` a new value the compiled prop re-evaluates and the chart redraws.
      The other attributes are plain props — `x`/`y` name the keys to plot, and
      `grid dots fill legend tooltip` turn features on.

      The plugin registers this component at runtime under the name `ChartLine`,
      so the compiler cannot see it while it reads the source — that is the one
      warning avenx.config.json silences (AVX_W46).

      The plugin also ships a `<chart.line data={sales} .../>` shorthand for the
      same thing, expanded by the charts preprocessor under a bundler (see
      @avenx/vite). This page uses the plain component tag so it builds with the
      Avenx CLI and no preprocessor.
    -->
    <div @css chart>
        <ChartLine :data="sales" x="month" y="value" grid dots fill legend tooltip />
    </div>

    <div @css row>
        <button @css primary @click="addPoint()">Add a point</button>
        <button @css ghost @click="reset()">Reset</button>
    </div>
</div>
