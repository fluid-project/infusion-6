# Use of cell names in debugging

How the names given to cells on construction were used when diagnosing the late re-rendering of the "Lost Plants"
panel and the whole-tree cascade at reveal in saanich-peninsula-flora's story page (2026-11-16). Every probe wrapped
`fluid.cell.update` in the browser, and the name was the only way to tell what a cell was. There were three stages.

## 1. Profiling: which kinds of cell take the time

This was `cellPlan.json` from the earlier session, which was reused:

```js
const orig = fluid.cell.update;
fluid.cell.update = function (cell, inEdge) {
    const start = performance.now();
    try { return orig.apply(this, arguments); }
    finally {
        // Mask instance numbers so that every pane's section, etc., aggregates under one key
        const name = String(cell.name || "?").replace(/\d+/g, "#");
        const rec = __cells.get(name) || [0, 0];
        rec[0] += performance.now() - start; rec[1] += 1;
        __cells.set(name, rec);
    }
};
// → "885 ms  3 runs  $effect at path renderView of component at path story-#.checklist.tree.view"
```

The name served as a grouping key. Masking the digits is what makes the aggregation work, because
`story-6.storyPanes.3.section` and `…4.section` then count as one thing.

## 2. Timing: when specific events happen

Name patterns were matched and timestamps recorded:

```js
const m = /^(availableInstance|computeInstance|flatMergedComputer) for path story-\d+\.(lostPlants|traces|protectedAreas)$/.exec(cell.name);
if (m) { __inst.push([performance.now(), m[1], m[2]]); }
if (/scopeTick/.test(cell.name)) { /* bucket counts per 250 ms */ }
```

This relied on the naming convention `<role> for path <component path>`. It gave both the role, such as merge,
instance or availability, and the component, without access to the shadow objects.

## 3. Attribution: which input caused a re-run

When a `flatMergedComputer` for one of the target components ran, the sources on its incoming edges were checked:
each one's `_value` was compared with the value seen last time, and the names of the sources that had changed were
reported:

```js
if (/^flatMergedComputer for path story-\d+\.(lostPlants|traces)$/.test(n)) {
    const srcs = cell._inEdges.flatMap(e => e.sources || []);
    const changed = srcs.filter(s => seen.has(s) && seen.get(s) !== s._value).map(s => s.name);
    srcs.forEach(s => seen.set(s, s._value));
}
// → [5879, "lostPlants", ["Layer store signal for layer bioreportr.lostPlants", …]]
// → [8859, "lostPlants", ["potentia for path story-6.lostPlants"]]
// → [9786, "traces",     ["computeInstance for path story-6"]]
```

This was the decisive step. The source names told directly which of three mechanisms was involved: a layer
definition, the component's own potentia, or the parent's instance.

## Where the names ran out

"potentia for path story-6.lostPlants" tells *what* changed, not *who* changed it. The probe then had to drop down to
wrapping `fluid.pathToLive` and capturing a stack. Even that only got as far as the generic `setForComponent` proxy
handler at `FluidIL.js:3736`; the path argument (`cards`, `revealed`) was needed to identify the writer.

Two things would have let names alone answer the whole question:

- a record of the cause on each cell, i.e. which source or write last changed it;
- for live-layer upgrades, putting the written path into the change, e.g. "potentia reset by first write to
  `revealed`".
