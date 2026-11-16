# Inventory of file-global weak state in client code

An inventory (2026-11-16) of the file-global `WeakMap` and `WeakSet` uses in client code built on Infusion 6 — that is,
outside Infusion itself — each of which is a smell to be eliminated, with a route for each to a framework facility. It
covers bagatelle's client sources and saanich-peninsula-flora's story code. Howe Sound's copies of the shared
bioReportR files mirror saanich's. See [transient-state.md](transient-state.md) for the design of `$transient`, which
group D calls for.

There are 27 file-global uses: 6 in bagatelle and 21 in saanich. (A `WeakMap` at `libreMap.js:1291` is a member of a
local object, not file-global.) They fall into five groups:

- **Groups A and B** (8 uses) are the ones `equiv` and a repaired `$oldValue` would express directly.
- **Group C** (8 uses) is better served by the `$bindable` record Infusion already has.
- **Group D** (8 uses) needs a different facility: per-component state the reactive graph doesn't observe.
- **Group E** (3 uses) should be left alone: caches keyed by immutable data, not smells.

## A. Remembering a previous value to detect a change: a repaired `$oldValue` (7 uses)

Each of these keeps "what this input was last time" so an effect can act on a *transition*.

| Site | What it remembers, per key | The transition acted on |
|---|---|---|
| `bioreportr.storyPage.lastPaneKey` (`story.js:848`) | the last pane, per story page | the pane changed, so clear the record and plant |
| `bioreportr.protectedAreas.lastRegion` (`storyPageProtectedAreas.vue:56`) | the last region, per story page | the region changed within Protected, so clear the plant |
| `bioreportr.storyMap.mapWasShown` (`story.js:360`) | whether the previous pane showed the map, per map | the map was hidden and is now shown |
| `hortis.libreMap.wasFiltered` (`libreMap.js:989`) | whether the map was last fitted to filtered observations, per map | the filters were cleared, so return to the home camera |
| `bioreportr.storyMap.placed` (`story.js:266`) | whether the camera has been placed yet, per map | the first placement jumps; later ones fly |
| `saanich.topSpeciesSelected` (`saanich.js:116`) | whether the top species has been selected, per story page | do it once only |
| `bioreportr.storyPage.activatedRecords` (`story.js:188`) | the panes shown so far, per story page | accumulate them, keeping the identical object until a new pane appears |

**The route: make `$oldValue` work for `$compute`.**

- Today `{$oldValue}` resolves to the `fluid.OldValue` marker. Only the legacy `fluid.processSignalArgs` substitutes the
  old value for it; the modern path, `fluid.cell.mapSignalArgs`, ignores it.
- **The fix:** have `fluid.expandComputeRecord` substitute the cell's previous *available* value (`undefined` the first
  time) wherever `{$oldValue}` appears among the arguments. That's around 15 lines.
- **What it gives:** a *reducer*, a computation that builds on its own previous result:
  - `activatedPanes`: `(old, key) => old?.[key] ? old : {...old, [key]: true}`. It hands back `old` itself when nothing
    is new, so it cuts off without even needing an `equiv`.
  - The transitions: `paneTransition: (old, key) => ({from: old?.to, to: key})`, and the effect then acts when
    `from !== to`. The same shape covers `lastRegion`, `mapWasShown` and `wasFiltered`.
  - The once-only flags: `placed: (old, placedNow) => !!old || placedNow`, and likewise `topSpeciesSelected`.
- **Where the state lives:** in the computed cell, which is owned by its component and disposed with it. It is
  recomputed when a reducer's inputs change and keeps its value across a turnover, since `mountSignalRecord` reuses it.
- **A caveat:** a reducer's result depends on the order of its updates. That's fine for monotonic or "previous input"
  reducers like these, but it needs saying in the documentation.

## B. Identity-preserving recomputation: `equiv` (covered within A)

`activatedRecords` was really an emulation of `equiv`: it hands back the previous object when the new one would be
equal. With `$oldValue` the reducer gets identity for free. Without it, an `equiv` such as `fluid.equiv.elementwise` on
a plain recomputation would do the same. Either way, the `WeakMap` goes.

## C. Binding once per external target: the existing `$bindable` (8 uses)

These guard against attaching listeners, or building a widget, twice for the same map, document or story page.

| Site | Target |
|---|---|
| `bioreportr.remembering.boundMaps` | map |
| `bioreportr.protectedAreas.boundMaps` | map |
| `bioreportr.solowMapLayer.hoverBound` (stores the listeners too) | map |
| `bioreportr.protectedAreas.boundPages` | document |
| `bioreportr.lostPlants.boundDocuments` | document |
| `bioreportr.lostPlants.searchWidgets` (builds a widget once) | document |
| `bioreportr.atlas.rowClickBound` | story page |
| `bioreportr.inatSpecies.bound` | story page |

**The route:** `$bindable: {bind, unbind, onceOnly?}` (`fluid.expandBindableRecord`) already does this.

- It calls `bind` with the resolved target, keeps what `bind` returns, and calls `unbind` with `{boundValue}` when the
  target changes or the component is destroyed.
- `onceOnly` gives exactly the "build once" behaviour of `searchWidgets`.
- These guards also leak today: none ever unbinds, so a map or document re-bound to a new component keeps the old
  listeners. `$bindable` fixes that as well.
- **No framework work is needed;** these sites would just be rewritten to use it.

## D. Non-reactive per-component state: a new facility (8 uses)

These are mutable state in the middle of an interaction or an asynchronous process. Their own comments say they are
deliberately kept out of the graph ("no business of the reactive graph", "so that typing doesn't draw the gallery
afresh").

| Site | Key | State |
|---|---|---|
| `hortis.resizeBar.drags` | element | a drag in progress |
| `hortis.mfShell.presses` | element | a grip press in progress |
| `saanich.timePeriodFilter.timers` | component | a debounce timer |
| `bioreportr.traces.states` | component | the playback state of the timeline |
| `bioreportr.lostPlants.searches` | component | focus, caret and message of the search box |
| `bioreportr.lostPlants.runs` | component | the latest card-loading run, which supersedes earlier ones |
| `bioreportr.storyPage.keepRecord` | story page | a one-shot "keep this record across the pane change" |
| `bioreportr.storyPage.keepTaxon` | story page | a one-shot "keep this taxon across the pane change" |

Neither `equiv` nor `$oldValue` fits these: the values are written imperatively from event handlers, not computed.

**The route: a declared member the graph doesn't observe, held on the shadow and disposed with the component,** e.g.
`drag: {$transient: null}` — see [transient-state.md](transient-state.md).

- Reads and writes go straight to the shadow. They neither make a member live (no `pathToLive`, so no re-merge) nor
  notify anything.
- The keys of the element-keyed ones (`drags`, `presses`) become the owning component instead.
- **Alternatives for some:**
  - `timers` could become an `$effect` option such as `debounce: 400`.
  - `keepRecord` and `keepTaxon` are really intent carried with an action. The cleaner fix may be to have the
    navigation that changes the pane carry options, rather than leaving a flag for another effect to find. That would
    make them app-level changes.

## E. Caches keyed by immutable data: leave as they are (3 uses)

| Site | Key | What it caches |
|---|---|---|
| `qdl.derivedCache` (`qdl.js:25`) | table | derived columns, by the canonical text of their expression |
| `qdl.indexCache` (`qdl.js:27`) | package | indexes, e.g. of the taxonomy |
| `hortis.selectObs.memo` (`imerss-core.js:808`) | package | selections, by query key |

- These are memoisation over immutable data, in a library that deliberately doesn't depend on Infusion (`qdl.js`).
  They aren't component state, and a `WeakMap` keyed by the data is the right tool.
- At most, they could be hung on the package object, or folded into `hortis.queryCache`. Either would be tidying, not
  a framework concern.

## Summary

| Group | Uses | Route | Framework work |
|---|---|---|---|
| A. Previous value and transitions | 7 | `$oldValue` in `$compute`, as a reducer | ~15 lines, plus docs and tests |
| B. Identity-preserving recomputation | (in A) | `equiv`, or a reducer returning `old` | done |
| C. Binding once per target | 8 | existing `$bindable` | none; rewrite the sites |
| D. Non-reactive component state | 8 | a new `$transient` member (or `debounce`, or intent with navigation) | a few dozen lines, plus one design decision |
| E. Data caches | 3 | leave, or tidy | none |

Suggested order:

1. Repair `$oldValue` and port group A.
2. Rewrite group C onto `$bindable`. It needs no framework change, and it fixes real listener leaks.
3. Decide on `$transient` before touching group D.
