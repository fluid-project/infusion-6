# Requirements of the IMERSS visualisations on Infusion 6

This report inventories the framework features used by the IMERSS biodiversity visualisations, so that they can be
ported from Infusion 4 to Infusion 6. It records how each feature maps onto Infusion 6, and which gaps remain. Two
code bases are covered:

- **bagatelle** (imerss-bioinfo), in particular the BBEA driver `indexBeasBCBA.html` and its scripts
  `src/client/js/new/fluidNew.js`, `imerss-new.js`, `filters.js`, `newChecklist.js`, `polygon-draw.js`,
  `dual-range-input.js`, `imerss-bbea.js` and `src/client/js/autocomplete.js`. This is about 6,000 lines.
- **howe-sound-mapping-2026**, whose local "reknitr" framework is the list of files in `copyFrameworkOut.sh`. Its
  client runtime is `static/js/reknit-client.js`, `imerss-viz-reknit.js`, `paneHandlers.js` and `solowControls.js`,
  about 2,500 lines. It also consumes the bagatelle bundles `imerss-viz-new-core.js`, `imerss-viz-new.js`,
  `imerss-viz.js`, `imerss-blitz.js` and `imerss-plants.js` through its `copyJobs`. These add `taxonDisplay.js`,
  `data-table.js`, `resize-bar.js` and the "standard" viz loader to the inventory.

Each claim about Infusion 6 behaviour marked **(probed)** was checked by running a small script against the working
tree at commit `fc1f099`. The probes are listed in the [appendix](#appendix-probes).

## Starting point: a half-way house

The code is not plain Infusion 4. Since 2024 it has run on a hybrid. Infusion 4.6 supplies the component tree, IoC,
options merging, invokers, events and DOM binder. The patch file `fluidNew.js` adds preact-signals-core, with
`fluid.computed`, `fluid.effect`, `fluid.unavailable`, `fluid.fetch*`, `fluid.derefSignal`, `fluid.delegatedSignal` and
a string-template rendering view. Nearly all state is already held in signals declared as `members` via
`"@expand:signal()"` and `"@expand:fluid.computed(...)"`. The old model system (`model`, `modelListeners`,
`modelRelay`, the applier) survives only in the howe-sound story page and its HashManager, plus one disused grade in
`tabs.js`.

As a result, most of the port is mechanical. The work concentrates on the places where the hybrid had to cheat:

- side channels written from inside computations;
- `fluid.invokeLater` used to break cycles;
- `peek()` used to hide dependencies;
- volatile hashes standing in for multiple return values.

The two tricky corners called out for the port, the checklist/interaction dataflow diamond and the map's `onLoad`
sequence, are exactly where these cheats cluster.

## Inventory

Numbers are occurrences across the files surveyed.

### Component structure

| Infusion 4 feature | Use | Infusion 6 equivalent | Status |
|---|---|---|---|
| `fluid.defaults(name, {gradeNames})` | 160 | `fluid.def(name, {$layers})`, with C3 linearisation | Direct |
| `gradeNames` added in subcomponent options, e.g. `"hortis.checklist.withOBA"` | many | `$layers` in the `$component` record. Arrays replace rather than concatenate, so the full list must be written | Idiom change |
| `"{vizLoader}.options.mapGrades"` as `gradeNames` | 2 | Dynamic layer name `$layers: ["hortis.libreMap", "{vizLoader}.mapGrades"]` | Direct |
| `components: {x: {type, options}}` | many | `x: {$component: {$layers, ...}}`. Nested overrides merge into `$component` records **(probed)** | Direct |
| Injected components, e.g. `filterRoot: "{vizLoader}"`, `taxonNameLookup: "{withSearch}.taxonNameLookup"` | 6 | Top-level member reference injection | Direct |
| `fluid.emptySubcomponent` to configure away a child | 2 | `$if` false, or override the member with `null` | Direct |
| `options.x` / `{that}.options.x` | many | Every option is a plain member, `{self}.x` | Mechanical |
| `distributeOptions` from a driver to a known path, e.g. `ecofield` → `{that regionFilter}.options.leadingFields` | 1 | A user layer with a nested `$component` override, or better a top-level integration member referenced by the filter | Idiom change |
| `distributeOptions` to every matching descendant, e.g. howe.js `countTransform` → `{that hortis.libreMap.withObsGrid}` | 3 | `$linkage` with an output layer carrying the value, or a reference from the map to a value on the story page | Idiom change - see [G7](#g7-broadcast-of-configuration-to-matching-descendants) |
| `dynamicComponents` with `sources`, `type: "{source}.type"`, `options: "{source}.options"` (pane handlers, widgets) | 2 | `$for`, but the members' layers and configuration come from data | **Gap** - see [G6](#g6-for-members-configured-from-data) |
| `"{sourcePath}"` as `paneKey` / `widgetKey` | 2 | `keyAs` in `$for` | Direct |
| `fluid.queryIoCSelector(root, grade)` | 8 | Selector reference `"{self hortis.obsFilter}"`, or `fluid.liveQueryILSelector` | Direct, with caveats - see [G3](#g3-selector-references-with-a-path-fail) and [G4](#g4-selector-results-are-redelivered-whenever-the-tree-turns-over) |
| `fluid.getForComponent(that, path)` | 6 | Proxy reads, or `fluid.getForComponent` on the shadow | Direct |

### Reactivity

| Infusion 4 feature | Use | Infusion 6 equivalent | Status |
|---|---|---|---|
| `"@expand:signal(v)"` | 115 | A plain member value `v`, writable through the proxy, or `{$reactiveRoot: v}` for structured state | Mechanical |
| `"@expand:fluid.computed(fn, args)"` | 70 | `"$compute:fn(args)"` | Mechanical |
| `"@expand:fluid.effect(fn, args)"` | 60 | `"$effect:fn(args)"` | Mechanical |
| Undefined-or-unavailable argument short-circuiting in `fluid.processSignalArgs` | everywhere | Native: unavailable arguments suppress `$compute` and `$effect` | Direct |
| `fluid.derefSignal(sig, path)` | 6 | A path reference `"{vizLoader}.taxaFromObs.pollRowFocus"` **(probed)** | Direct |
| Multiple results from one computation, faked with volatile members such as `idToEntry`, `plantCounts` and `finalFilteredObs` written by `invokeLater` | 4 | Return a record from `$compute` and expose its parts by path references **(probed)** | Direct, removes hacks |
| `fluid.delegatedSignal` - a value defaulting to another until written, then resettable | 2 | A `$reactiveRoot` member linked by reference: it tracks the reference until written, and is overwritten when the reference next changes. "Reset to the default" needs an explicit write of the default | Idiom change |
| `batch(...)` | 4 | Unneeded: writes are deferred to the next stabilization | Delete |
| `.peek()` to read without subscribing | 7 | `fluid.cell.untracked(...)`. Most uses only existed to suppress cycles and disappear with the redesigns below | Mostly delete |
| `fluid.invokeLater` to break cycles | 4 | Should not be needed. Each use is redesigned below | Delete |
| `excludeSource: "init"` on model listeners | 3 | No direct equivalent. Make the effect idempotent against the world's current state | Idiom change - see [G9](#g9-no-analogue-of-excludesource-init) |
| `modelListeners` / `modelRelay` / `applier.change` / `fluid.replaceModelValue` (story page, pane handlers, HashManager) | 17 | Plain members and `$compute`s, writes through the proxy, `$effect`s | Mechanical, see [HashManager](#hashmanager) |
| `fluid.globalInstantiator.hashSource` flag to tell hash-driven updates apart | 1 | Source tracking with `withAmbientSource("hash", ...)` and `excludeSource: "hash"` - **currently broken** | **Gap** - see [G2](#g2-excludesource-sticks-to-a-cell-after-one-excluded-update) |
| `fluid.fetchJSON(url)` returning a signal | 1 | `fluid.fetchJSON` exists in Fluid.js and returns a cell. A `$compute` returning a cell is seen through **(probed)** | Direct |
| Async loading: `hortis.csvReader` with `completionPromise`, `Promise.all` in `bindResources` | 3 | A `$compute` returning a cell which the loader sets, or a `$bindable` whose binder returns one | Idiom change - see [G1](#g1-async-compute-is-documented-but-not-implemented) |
| `resources` / `fluid.resourceLoader` (story page `plotlyReady`, `storyVizPane` templates, `iNatComponentsPaneHandler`) | 3 | A `$compute` over `fluid.fetchText(url)`, or a binder returning a cell set by `HTMLWidgets.addPostRenderHandler` | Idiom change |

### Behaviour and events

| Infusion 4 feature | Use | Infusion 6 equivalent | Status |
|---|---|---|---|
| `invokers` | 45 | `$method` | Mechanical |
| `listeners: {"onCreate.x": ...}` binding DOM handlers | 50 | Template `@on...` bindings where the markup is ours. Otherwise a `$bindable` binding the handler to `{self}.view.renderedContainer`, with an `unbind`, since `$effect` has no cleanup | Idiom change |
| `events` fired by components (`onConfirm` of autocomplete, `taxonSelect`, `onResourcesLoaded`, `onRendered`) | 6 | A `$method` on the receiver called by the sender, or a value written by the sender and observed by `$effect` | Idiom change |
| Priority-ordered listeners on one event: `bindWidget` with `"first"`, `"before:impl"`, `"after:impl"` | 5 | No event system | **Gap** - see [G5](#g5-no-ordered-multi-party-event) |
| `fluid.promise.fireTransformEvent(onLoad)` with a `priority: "last"` listener sequencing map setup | 1 | Chain of bindables - see [The map's onLoad sequence](#the-maps-onload-sequence) | Redesign |

### Views and the DOM

| Infusion 4 feature | Use | Infusion 6 equivalent | Status |
|---|---|---|---|
| `fluid.viewComponent` with `container` supplied from a parent's DOM binder, e.g. `"{that}.dom.filters"` | many | The view's `container`, supplied by `@id` in the parent's template | Idiom change |
| Containers found in **page-owned markup** by selector, e.g. `.imerss-map`, `.mf-pane-views`, `.imerss-pollinators` | ~25 | Either make the page the root template (`fluid.selfTemplateRootViewComponent`) and mark containers with `@id`, or bind `container` to `fluid.liveQuerySelector(selector)` | **Gap in idiom** - see [G8](#g8-no-dom-binder-for-page-owned-markup) |
| `selectors` + `that.locate(name)` / `that.dom.x` inside a component's own markup | 110 | Template bindings (`@{...}`, `@class`, bound attributes) where the markup is ours. Otherwise `renderedContainer.querySelector` | Mechanical, but large |
| `fluid.stringTemplateRenderingView` with `markup.container` and `%term` interpolation | 25 | `fluid.templateViewComponent` with `@{...}` bindings | Mechanical |
| Repeating rows rendered as strings (`hortis.rowCheckbox`, `renderRow`, region groups, phenology months) | 6 | `$for` subcomponents for short static lists, or a computed vTree | Idiom change |
| The checklist trees rendered as one HTML string, with checkbox state patched by hand through `idToNode` | 1 | A computed vTree of plain VNodes, reconciled by position - see [The checklist trees](#the-checklist-trees-as-vnodes) | Redesign |
| `fluid.containerRenderingView` (data table, Solow radius) | 2 | `fluid.templateViewComponent` or a computed vTree | Mechanical |
| Delegated jQuery handlers `container.on("click", ".sel", fn)` | 30 | `@on...` on the template root of a computed tree, dispatching on `event.target.closest(...)`, as `fluid.substrateTree` does | Direct |
| jQuery UI tooltip (`hortis.withTooltip`, `hortis.clearAllTooltips`) | 6 | Not part of either framework. Keep jQuery and jQuery UI as plain libraries for now, or port to `fluid-tooltip.vue` | Library, not framework |
| External widgets: maplibre Map, MapboxDraw, accessible-autocomplete, DualRangeInput, d3 bipartite, Plotly, CodeMirror-style ownership of DOM | 7 | `$bindable` with `onceOnly: true`, plus `fluid.disableRendering`, as documented for `fluid.codemirror` | Direct |
| `ResizeObserver` width signals (`hortis.widthSignal`, `bipartite.listenWidth`) | 2 | A `$bindable` whose binder returns a cell, with an unbinder disconnecting the observer | Direct |

## The tricky corners

### The map's onLoad sequence

In Infusion 4, `hortis.libreMap` orchestrates map start-up through a chain of events:

1. `map` is created at once with a blank style, since fill patterns must be loaded as images before a style
   referring to them can be interpreted.
2. The maplibre `load` event fires the Infusion transforming promise event `onLoad`. Listeners such as
   `loadFillPatterns` return promises, which the event chains.
3. The listener `onLoad.setStyle`, at `priority: "last"`, calls `map.setStyle` and waits for `styledata` before
   writing `mapLoaded.value = 1`.
4. Every effect touching the style is gated on that signal as a throwaway argument: `addTiles`, `updateObsGrid`,
   `zoomToObsBoundsEffect`, `updateActiveMapPane` and `relayRegionsToLegend`.
5. Click and hover handlers are bound at `onCreate` directly on the map instance.

A separate wrinkle: `hortis.libreMap.withFillPatterns` listens to `"load.loadFillPatterns"`, an event the grade never
declares. Its intent is clearly `onLoad`.

In Infusion 6, this becomes a chain of stages. Each stage holds the map once a further stage of readiness is reached,
and is unavailable until then, so ordering falls out of availability rather than listener priorities:

```js
fluid.def("hortis.libreMap", {
    $layers: "fluid.component",
    // Constructed exactly once on the rendered container - rebuilding the map would lose its camera and sources
    map: {
        $bindable: {
            bind: "hortis.libreMap.make({self}.mapContainer, {self}.mapOptions)",
            unbind: "hortis.libreMap.destroy({boundValue})",
            onceOnly: true
        }
    },
    // A cell holding the map once maplibre's "load" has fired, and unavailable before then
    loadedMap: {$bindable: {bind: "hortis.libreMap.whenLoaded({self}.map)"}},
    // Holds true once every fill pattern image has been added to the map
    fillPatternsLoaded: {$bindable: {bind: "hortis.libreMap.loadFillPatterns({self}.loadedMap, {self}.fillPatternPath, {self}.fillPatterns)"}},
    // Holds the map once the real style has been applied and "styledata" received
    styledMap: {$bindable: {bind: "hortis.libreMap.applyStyle({self}.loadedMap, {self}.style, {self}.fillPatternsLoaded)"}},
    addTiles: "$effect:hortis.libreMap.addTileLayers({self}.styledMap, {self}.tileSets)"
});
```

Every former `mapLoaded` gate becomes a plain dependency on `{self}.styledMap`. Each binder returns a cell which it
sets when the maplibre event arrives, and readers see through it **(probed for a binder returning a cell)**. Writes
from maplibre callbacks need no manual stabilization, since deferred auto-stabilization is on by default
(fluid-project/infusion-6#17). Handlers bound to the map, such as click dispatch and grid hover, become bindables over
`{self}.map` whose unbinders call `map.off`.

Three points need care:

- `applyStyle` is a binding rather than a `$compute`, because it acts on the world. It must be `onceOnly`, since
  applying the style again would remove every source and layer the effects have added. The story map's panes only
  change paint properties, so they don't need it to rebind.
- maplibre diffs `setStyle` against the current style. A style identical to the blank start-up style, which is the
  BBEA case since all its layers are added later, is diffed to nothing and fires no `styledata` at all. The binder
  must pass `{diff: false}`, and also resolve at once if `isStyleLoaded()` is already true. This was found when the
  port was run in Chromium against the real data.
- `sortLayers` reaches into maplibre's private `style._order`. It runs from each effect which adds layers. That is
  idempotent, so the undefined order of effects doesn't matter.

**Feasibility:** confirmed. Implemented as `src/client/js/i6/libreMap.js` in bagatelle. A node test against a fake
maplibre checks the ordering: nothing touches the style before `load`; fill patterns are added before `setStyle`;
tiles, grid and `fitBounds` come only after `styledata`; the style is applied once; the map is removed on
destruction. In Chromium against the BCBA data, it adds the street map and ecoregion tiles and a 65-cell grid, and
zooms to the observations. Nothing here needed a framework change.

### The checklist dataflow diamond

The BBEA tool filters observations by eight filters. The surviving observations then determine which taxa are shown in
two checklists, bees and plants. The selections in those checklists filter the observations once more, to produce the
interaction counts and every downstream view:

```
obsRows ──► filters.allOutput = filteredObs ──────────────────────────────────┐
                  │                                                           ▼
                  └─► taxaFromObs ─► rowFocus ─► rootEntry ─► idToState ─► rowSelection ─► interactions
                                     (×2 checklists)                                       │
                                                                                           ▼
                                                    finalFilteredObs ─► map grid, record count, lists, charts
```

`filteredObs` reaches `interactions` along two paths: directly, and through each checklist. Under preact-signals this
needed a series of workarounds, all visible in `newChecklist.js` and `imerss-bbea.js`:

- **Telling inputs apart.** `hortis.checklist.idToState` must keep the user's selections when `rowFocus` changes, but
  regenerate from scratch when the tree changes. preact can't report which dependency changed, so it compares its
  `idToStateUI` input against a cached `idToStateOld`.
- **A cycle through rendering.** `idToState` asks for a render with `fluid.invokeLater(() => scheduleRender.value =
  true)`, and the `generate` effect writes the rendered state back into `idToStateUI`. That passes through `idToState`
  again on its "UI-driven" branch.
- **Side channels.** `computeRootEntry` fills the volatile hash `idToEntry` as a side effect, and the search component
  depends on it through a "throwaway dependency" on `rootEntry`. `interactions.count` writes `plantCounts` and
  `pollCounts` onto the component, and posts `finalFilteredObs` by `invokeLater`. `drawInteractions.render` writes
  `bipartiteRows`, which the bipartite view reads alongside `peek()`ed selections "so we don't get an extra
  notification".
- **Startup guards.** `interactions.count` skips counting until both selections are non-empty, because "we get several
  notifications during startup". `hortis.checklist.searchSelect` guards against "duff notifications from
  preact-signals".

Infusion 6 removes every one of these:

1. **Glitch freedom.** `fluid.cell` evaluates a diamond once, with consistent inputs. In the probe, changing the
   source of `source → left → right` and `source → joined ← right` produced exactly one evaluation of `joined`, with
   both arguments up to date **(probed)**.
2. **Default state plus user overlay.** As in the editor's `fluid.substrateTree`, the checklist's state is split:
   - `defaultFolds`, a `$compute` from the filtered tree, which is itself computed from `rowFocus`;
   - `userState`, a `$reactiveRoot` holding only what the user has done - the set of selected ids, and fold overrides;
   - `idToState`, a `$compute` merging the two.

   No computation needs to know which input changed. Selections survive refocusing automatically. Parents'
   indeterminate states are recomputed from the selection set rather than stored, so they stay correct when the
   focus changes.
3. **Multiple results by path.** `entries` returns `{rootEntry, idToEntry}`, and `interactions` returns
   `{crossTable, plantCounts, pollCounts, finalFilteredObs}`. Consumers refer to `"{interactions}.result.crossTable"`,
   and the loader's `finalFilteredObs` becomes the reference `"{interactions}.result.finalFilteredObs"`.
4. **Rendering as a computation.** The checklist's view computes its vTree from `rootEntry` and `idToState`, so no
   render has to be scheduled - see [the next section](#the-checklist-trees-as-vnodes).

The filter pipeline (`hortis.filters`) currently sequences itself with an `idle` signal and `setTimeout(…, 1)`, so that
the loading indicator gets painted before a filter pass over tens of thousands of rows. In Infusion 6, `allOutput`
becomes a `$compute` folding `doFilter` over `"{filterRoot hortis.obsFilter}"`. In the probe, calls to each filter's
`$method` from inside the computation were tracked, and a change to any filter's state re-ran the fold **(probed)**.
The loading indicator can be driven from `fluid.unavailableComponents`.

**Feasibility:** confirmed, and the result is simpler than the original. A node test over a miniature dataset checks
that a filter change reaching `interactions` along both arms of the diamond evaluates it exactly once. It also checks
that a checklist selection survives filtering its rows out of focus and back, and that indeterminate states are
rendered. One caveat: [G4](#g4-selector-results-are-redelivered-whenever-the-tree-turns-over) made the fold run repeatedly, with
identical results. The port stabilises its output: when the surviving rows are the same as last time, it returns the
previous array, so nothing downstream is notified.

### The checklist trees as VNodes

A checklist holds up to several thousand rows. Each row has a fold control, a checkbox with three states, names, and
a nested list, so a component per row is ruled out. The existing renderer builds one HTML string from `idToState` and
the entry tree. After every render it records `idToNode` so that a later checkbox change can be patched in by hand,
without a full render.

In Infusion 6 the view computes its tree directly. The docs' "Generating a vTree by hand" supports
`{tag, attrs, children}` / `{text}` nodes whose attributes use the full binding syntax:

```js
view: {
    $component: {
        $layers: "fluid.viewComponent",
        templateTree: "$compute:hortis.checklist.renderTree({$parent}, {$parent}.rootEntry, {$parent}.idToState)"
    }
}
```

- **Events.** A single `@onclick` on the root, in the manner of `fluid.substrateTree`'s `domListeners`, dispatches on
  `event.target.closest("[data-row-id]")` to `check` or `toggleFold`.
- **Checkbox state.** `checked` and `indeterminate` are written as literal attributes on each `<input>`. Since the user
  can change `checked`, the vnode must be patched from state on every change, which happens because each click
  writes `userState` and recomputes the tree.
- **Cost.** Reconciliation is by position (`fluid.patchChildren`), so folding a family re-creates the nodes after the
  fold point within that `<ul>`, but no others. A full recompute of a vTree over a few thousand rows is cheap
  compared with today's `innerHTML` reparse.

**Feasibility:** confirmed. In Chromium against the BCBA data, the bee checklist renders its seven family-level rows
and the plant checklist its 23. Checking a family filters the 2,538 records to 235.

### HashManager

`reknitr.hashManager` is a `fluid.modelComponent` whose model mirrors the URL hash, e.g. `#pane:History&taxon:Bombus
mixtus&region:BEC`:

- `applyHash` parses `location.hash` into the model with `fluid.replaceModelValue`. It runs on `hashchange`, on
  `popstate`, and once more after resources are loaded.
- A model listener with `excludeSource: "init"` pushes each model change to the hash with `history.pushState`.
- `fluid.globalInstantiator.hashSource` is set while applying, so that `reknitr.updatePaneHash` doesn't blank the
  `taxon` component of the hash it is in the middle of applying. Its comment notes that transaction globbing
  (FLUID-5498) was never implemented.
- Three consumers listen to `{hashManager}.model.pane`, `.region` and the whole model. Three producers write `region`,
  `taxon`, and `{pane, taxon: null}`.

In Infusion 6:

```js
fluid.def("reknitr.hashManager", {
    $layers: "fluid.component",
    hash: {$reactiveRoot: {}},
    // Listens to hashchange and popstate, writing the parsed hash with source "hash"
    hashListener: {
        $bindable: {
            bind: "reknitr.hashManager.listen({self}, {global}.window)",
            unbind: "reknitr.hashManager.unlisten({boundValue})"
        }
    },
    pushState: {
        $effect: {
            func: "reknitr.hashManager.pushState",
            args: ["{self}.hash", "{global}.window"],
            excludeSource: "hash"
        }
    }
});
```

The initial hash is read in as the root's initial value, so it needs no delayed `applyHashOnResources`. Consumers
become references or `$effect`s, e.g. `paneHandler.selectedTaxonId` derived from `"{hashManager}.hash.taxon"`.
Producers write `hashManager.hash.region = …`.

Two refinements are needed, because of framework gaps:

- **No `excludeSource: "init"`.** `pushState` must compare the hash it would write against `location.hash` and do
  nothing if they agree. This covers both the first run and the echo of a hash-sourced change.
- **`excludeSource` is broken.** As written, `excludeSource: "hash"` is unusable today because of
  [G2](#g2-excludesource-sticks-to-a-cell-after-one-excluded-update): after one excluded update, the effect never sees
  another. The idempotent comparison makes `excludeSource` unnecessary for the HashManager itself. But
  `updatePaneHash`'s need to tell a user's pane change from a hash-driven one does depend on source tracking.

**Feasibility:** confirmed for the HashManager itself. It is implemented as `hortis.hashManager` in bagatelle's
`src/client/js/i6/hashManager.js`, and tested against a fake window:

- the initial hash is read without being pushed back;
- model changes are pushed;
- navigation is read but not echoed;
- listeners are removed on destruction.

The story page's use of it awaits the howe-sound stage of the port, which needs G2 fixed, or an explicit "applying
hash" flag in place of the `hashSource` global.

## Gaps

### G1: async `$compute` is documented but not implemented

The IL documentation says that a `$compute` function "may be async (returning a Promise or async iterator, as for
asyncComputed); the value is pending until it settles". FluidIL.js never creates an async edge. A `$compute` returning
a Promise delivers the Promise itself as the value: in the probe, `count: "$compute:p.count({self}.rows)"` over an async
`rows` computed `undefined` **(probed)**.

**Workaround:** return a cell from the `$compute` (as `fluid.fetch` does) or from a `$bindable`'s binder. Both are seen
through **(probed)**.

**Fix:** either make `$compute` detect a Promise or async iterator result and use `asyncComputed`, or correct the
documentation.

### G2: `excludeSource` sticks to a cell after one excluded update

After a write made under `fluid.cell.withAmbientSource("hash", …)` has been excluded from an effect with
`excludeSource: "hash"`, later writes with no source are also never delivered to that effect **(probed, raw cells and
IL)**:

```js
const B = fluid.cell("a"), runs = [];
fluid.cell.effect(v => runs.push(v), [B], {excludeSource: "hash"});
fluid.cell.stabilize();                                            // runs: ["a"]
fluid.cell.withAmbientSource("hash", () => B.set("b"))(); fluid.cell.stabilize();   // runs: ["a"] - correct
B.set("c"); fluid.cell.stabilize();                                // runs: ["a"] - should be ["a", "c"]
```

The likely cause is in `fluid.cell.endFits`. It ends only those fits whose consumed targets have no pending effects,
and an effect whose notification was skipped seems to stay pending. The fit therefore stays active on the cell, and
`set` keeps adding to its `sources`, which still include `"hash"`.

A second, smaller discrepancy: the signals documentation gives `Cell.set(newValue, [source])` with a string, but the
implementation reads `options.source`. `A.set("b", "hash")` is not excluded **(probed)**.

This blocks every use of source tracking in the port: the HashManager, the story page's pane/hash interplay, and
external widgets such as the dual range input and the autocomplete.

### G3: selector references with a path fail

`"{self p.filter}"` resolves to the list of matching components **(probed)**. But `"{self p.filter}.filterState"`, which
the IL docs describe as yielding "the array of values at that path in each match", throws `TypeError:
{(intermediate value)}.computed is not a function` **(probed)**.

**Workaround:** select the components and read their members inside the `$compute`.

### G4: selector results are redelivered whenever the tree turns over

A `$compute` over `"{self p.filter}"` first runs with only the filters instantiated so far. In the probe its effect saw
the output of one filter before the full chain of two **(probed)**.

The port showed this is broader than growth during start-up. The selector's cell is redelivered as a fresh array, with
the same members, whenever any component beneath its root turns over. In the BBEA tree:

- the filter fold ran 13 times during start-up;
- it then ran three times for one click on a phenology month, because writing a `$for` source turns over the
  `$for`'s members;
- each run produced a fresh output array, so the checklists, the interactions table and every view downstream
  recomputed as well. Interactions were evaluated three times, with identical inputs each time.

None of this is a glitch in the reactive sense, but each run is a pass over every observation.

**Workaround, used by the port:** stabilise the output of the computation over the selector. `hortis.filters.evaluate`
keeps its previous output in a cache returned by a `$compute` with no arguments, and returns it again if the surviving
rows are identical. Since cells compare by identity, nothing downstream is notified. With this in place, the test
"evaluated once for the change" passes.

**Fix:** the selector's cell should not deliver a new value when its list of matched components is unchanged, e.g.
by comparing it element-wise before setting. Then only a genuine change in the matched set would reach consumers.

### G5: no ordered multi-party event

The howe-sound `reknitr.htmlWidget` grades rely on Infusion 4's event system to compose behaviour from independent
grades on one occurrence. When a Plotly widget is found, `bindWidget` fires. Then, in order:

- `bindFirst` (priority `"first"`) records the element and moves data-pane widgets;
- `regionSelectionBar.hoist` (`"before:impl"`) moves the element;
- each grade's `impl` binds Plotly handlers;
- `withSliderAnimation` (`"after:impl"`) starts a timer;
- `withResizableWidth` and `withResizableHeight` add resize handlers.

Infusion 6 has no events. The data flow can be reworked: each grade can contribute a `$bindable` over a shared
`element` member, which is written once the widget is found. But the *ordering* constraints (hoist before binding,
animation after binding) then have to be expressed as data dependencies between the bindables. For example,
`impl`'s bindable takes `{self}.hoisted` as an argument. That is workable but loses the open-endedness of named
priorities: a new grade can't insert itself "before:impl" without the `impl` grade knowing about it.

**Proposal:** an ordered bindable list, analogous to `$linkage`, keyed by namespace with the same `before:`/`after:`
priority grammar.

### G6: `$for` members configured from data

The story page creates one pane handler per section from `reknitr.rawPaneHandlers`, a record written into the page by
the build. Each entry gives a `type` and arbitrary options, e.g. `widgets`, `maxObsCountOverride` and `regionField`.
The handlers' widgets are created the same way. In Infusion 4 this is `dynamicComponents` with
`type: "{source}.type", options: "{source}.options"`.

In Infusion 6, `$for` gives each member its source element at `valueAs`, and `$layers` can name `"{self}.record.type"`
as a dynamic layer. But there is no way to merge the rest of the record into the member as configuration. It can only
be read through `{self}.record.x`, so every pane handler layer would need rewriting to read its options through that
indirection.

**Workaround:** at start-up, `fluid.def` an anonymous layer per pane (`reknitr.pane.History` etc.) from the record,
and have the `$for` member's `$layers` refer to it.

**Fix:** a `$for` option such as `layerAs` / `mergeValue`, merging the source element as a layer at `variables`
precedence.

### G7: broadcast of configuration to matching descendants

howe.js distributes `countTransform` and `inverseCountTransform` to `"{that hortis.libreMap.withObsGrid}"`, wherever that
map is in the tree. `hortis.libreMap.inStoryPage` uses `distributeOptions` to override a member which a base grade would
otherwise win. The second use is a workaround for Infusion 4's merging order and disappears under C3. The first can
be expressed with a `$linkage` whose output layer refers back to the story page's values. Linkages are global, though
(item 5 of the fresh limitations in `a-scratch/limitations-2.md`), so with two story pages on one page this would
leak. Low priority: there is one map per page.

### G8: no DOM binder for page-owned markup

The BBEA page supplies almost all of its markup statically: the shell, the filter concertina, the view tabs and their
panels. Its components find their containers in it by class selectors, through the DOM binder of an ancestor whose
container is `.imerss-container`. Infusion 6 has no DOM binder. Its two idiomatic routes both have costs:

- **The page as template.** Make the root view a `fluid.selfTemplateRootViewComponent` on `.imerss-container`, and mark
  each container in the HTML with `@id`. This is the most declarative option, and lets static controls such as the
  concertina heads and the tab strip carry their own `@onclick` and bound `aria-expanded`/`hidden`. But every driver's
  HTML must be rewritten, and any attribute changed imperatively but not bound would be reverted when the root
  re-renders.
- **A container per selector.** Bind each view's container to `fluid.liveQuerySelector(selector, root)`. This keeps the
  HTML intact and is closest to the existing code, but every component carries a selector string.

**Recommendation:** use the second route for the first stage of the port, which keeps the drivers' HTML unchanged. Then
move driver by driver to the first. A small framework helper layer `fluid.selectorContainerView` would make the second
route tidy.

### G9: no analogue of `excludeSource: "init"`

Infusion 4 could exclude an initial value from a listener. An Infusion 6 `$effect` always runs once its arguments are
first available. That is usually right, but effects which write to the world, such as `pushState` or `scrollIntoView`
in `updateSectionNav`, must therefore be idempotent against the world's current state. This is a pattern rather than a
gap, but the docs should say so, since `excludeSource: "init"` was common in Infusion 4 code.

### G10: packaging

npm's `infusion-6@6.1.0` predates the fixes this port depends on, such as live state attributes (#14), deferred
auto-stabilization (#17) and bindable unbinding (#21). Until a new release, the bagatelle port refers to a sibling
checkout `../fluid-infusion-6`, as ponder-infusion does. Its drivers must therefore be served from the parent
directory, and its node tests require the checkout by path.

### G11: template write-back through a `$for` variable is not sited

The docs say that when a `$for` source is sited, "a write beneath the variable, e.g. `self.todo.completed = true`, is
applied to the original element of the source". That holds for writes through the proxy **(probed)**. But a template's
live-state write-back to the same path, e.g. `<input type="checkbox" checked="@{range.checked}"/>` in a member's
template, writes only to the member. The member sees the new value, but the source does not **(probed)**. This came up
in the phenology filter, whose twelve month rows are `$for` members over the filter's `$reactiveRoot` array.

**Workaround, used by the port:** bind the attribute to a read-only copy, `isChecked:
"$compute:fluid.identity({self}.range.checked)"`, which suppresses write-back. Then write the user's change through
the proxy from an `@onchange` method: `self.range.checked = event.target.checked`.

**Fix:** `fluid.writeableAttrSite` should resolve a site beneath an iteration variable through the variable's lens, as
the proxy does.

### G12: smaller items

- `FluidView-browser.js` calls `fluid.ptf.withinGesture` in every event handler, so `FluidPTF.js` must be loaded even
  by pages that make no use of PTF. Without it, every `@on...` handler throws. The core script list in the docs and
  demos should include it, or the call should be guarded.
- A destroyed component's bindables are unbound at the next stabilization rather than at once. That is reasonable,
  but the docs' "Destruction disposes all of the component's effects, bindables and subcomponents" reads as
  immediate.
- `{global}.Name` for a global which doesn't exist yields an *error* unavailable value ("Path ResizeObserver was not
  found"). The IL docs say a path running off the end of plain data yields `undefined`. So an optional library can't
  be passed as `{global}.Popper` with a fallback in the function. The port passes `{global}` whole and looks the
  library up inside the function.
- Under Infusion 6, `fluid.transform` applied to an array doesn't return an array. Shared Infusion 4 code calling
  `.join` or similar on the result breaks; `colour.js` had two such calls, now replaced by `Array.prototype.map`.
- Markup written with `innerHTML` into an element which belongs to a view's template is liable to be cleared when
  the view reconciles. This is expected given the design, but easy to fall into when porting Infusion 4 code that
  rendered a string template and then filled in parts of it. Markup inside a view's own tree should be part of the
  computed tree, as the port's interaction matrix now is. Page-owned containers outside any template are safe.

## Not framework concerns

These need porting effort but no framework support:

- jQuery and jQuery UI tooltips can stay as plain libraries for the first stage.
- d3 (bipartite), canvas (interaction matrix), Papa Parse, pako, MapboxDraw, accessible-autocomplete and
  DualRangeInput are wrapped by `$bindable` or called from `$effect`s.
- Side-effecting caches on rows (`row.month`, `row[hortis.cellIdSymbol]`, `row[hortis.pointSymbol]`, elevation coerced
  to a number), marked "OCTOPOKHO" in the source, still work. They are cleaner as `$compute`s returning parallel
  arrays or `Map`s.
- The `Reset` button's trawl of every filter and checklist with `fluid.queryIoCSelector` becomes a `$method` over
  `"{vizLoader hortis.filter}"` and `"{vizLoader hortis.checklist}"`.

## Verdict

The port is feasible. Of the two tricky corners, the dataflow diamond becomes markedly simpler. The map's `onLoad`
sequence maps onto a chain of bindables without loss. The checklist trees fit the computed-vTree route that
`fluid.substrateTree` already uses.

Only G2 blocks part of the port outright: correct exclusion of hash-sourced updates in howe-sound. The idempotent
`pushState` covers the HashManager meanwhile. G1, G3, G4 and G11 have local workarounds, which the port uses. G5 and
G6 affect only the howe-sound story page, and can be worked around with data dependencies and per-pane layers. G8 is
a choice of idiom.

Suggested order:

1. **Core data path.** `csvReader`, `vizLoader` and `taxa`, filters, checklists, interactions and the record
   reporter, with node tests over synthetic data. This covers the diamond and the VNode checklist.
2. **The map.** `libreMap` as a chain of bindables, the observation grid and its filter, tiles, polygon drawing.
   Browser-only.
3. **The BBEA views.** Shell, concertina, tabs, lists, abundance, seed mix, bipartite, matrix, fullscreen, collector
   reports, dual range, autocomplete.
4. **The standard loader and howe-sound.** Taxon display, data table, resize bars, then the story page, pane
   handlers, HashManager and Solow controls. This needs G2 fixed, and G5/G6 worked around or fixed.

## Progress of the port

The port is in bagatelle on the branch `infusion-6-port`. The new code sits alongside the Infusion 4 code, in
`src/client/js/i6/`, so that the existing drivers keep working until it is complete. Stage 1 is recorded in
bagatelle's `stage1-port-report.md`. Stage 2 completed the BBEA visualisation, apart from howe-sound.

| File | Holds |
|---|---|
| `imerss-core.js` | Utilities, DOM listener and width helpers, `hortis.csvReader` (a `$compute` returning a cell), `hortis.vizLoader`, `hortis.taxa`, `hortis.selectorContainerView` (G8), `hortis.recordReporter` |
| `tooltip.js` | `hortis.withTooltip`, placed by Popper lite against a virtual element at the pointer - replaces jQuery UI tooltips, so the port has no jQuery dependency |
| `filters.js` | Filter bases, `hortis.filters` fold with stabilised output (G4), sex and phenology filters (G11), grouped region filter (computed tree with two-way search), collector filter, elevation filter, accessible-autocomplete wrapper, reset control |
| `dualRangeInput.js` | The dual range widget, with its range held as a `$reactiveRoot` whose members track the data's bounds |
| `checklist.js` | `hortis.checklist` with default state plus user overlay, computed VNode tree, taxon tooltips, rank fold controls, search |
| `libreMap.js` | Map start-up as a chain of bindables, tiles, observation grid with tooltip, grid selection filter, fit to bounds |
| `polygonDraw.js` | MapboxDraw polygon filter, bound to the styled map |
| `shell.js` | Pane grips, filter concertina with summary badges, view tabs, view download, fullscreen control, collector report links |
| `views.js` | Interaction matrix (computed tree plus canvas), bipartite network, bee and plant lists, bee abundance, seed mix evaluator |
| `hashManager.js` | `hortis.hashManager` |
| `imerss-bbea.js` | `hortis.beaVizLoader` wiring, `hortis.interactions` |

- **Driver.** `indexBeasBCBA-6.html` renders the complete BCBA page. It loads Infusion 6 from `../fluid-infusion-6`
  (G10), so it must be served from the parent of the bagatelle checkout. It no longer loads jQuery, jQuery UI or any
  Infusion 4 asset.
- **Checked in Chromium against the BCBA data.** All six filter sections open and work. Taxon tooltips are placed
  by Popper. Choosing an ecoprovince filters to 13 records and badges its section. All six view tabs render: the
  network's bars, the matrix's shaded cells and labels, the lists, the abundance charts, and the seed mix with its
  established plants. The only failed requests are US ecoregion tiles beyond their coverage, which the Infusion 4
  page requests too.
- **Tests.** Run from bagatelle with:

  ```
  node ../fluid-infusion-6/tests/test-core/qunit/js/fqunit-cli.js test/i6/html/BbeaCoreTests.html test/i6/html/BbeaMapTests.html test/i6/html/BbeaViewsTests.html test/i6/html/HashManagerTests.html
  ```

  This runs 147 tests. The views suite renders against the BCBA page's own markup.

**Still to port:** the howe-sound story map (stage 4). It needs G2 fixed, and G5 and G6 worked around or fixed. The
standard viz loader, taxon display, data table and resize bars it consumes from bagatelle are part of that stage.

## Appendix: probes

The probe scripts were run with node 18 against `require("../fluid-infusion-6")`:

| Probe | Result |
|---|---|
| `$compute` over an async function | Value is the Promise itself, so `rows.length` is `undefined` (G1) |
| `$compute` returning a cell, and `$bindable` returning a cell | Seen through; dependants receive the value once the cell is set |
| User layer overriding `filters.$component.region.$component.leading` | Merged: `leading` overridden, sibling `other` kept |
| Diamond `source → left → right`, `join(source, right)` | One evaluation per change, consistent arguments |
| `"{self p.filter}"` | Two matches, nested included, once stabilized |
| `"{self p.filter}.filterState"` | Throws `.computed is not a function` (G3) |
| `$compute` folding `comp.doFilter` over selected components | Re-runs on any filter's state change; first run sees a partial list (G4) |
| `$effect` with `excludeSource: "hash"` over a `$reactiveRoot` | Hash-sourced write excluded, then later unsourced writes also lost (G2) |
| `Cell.set(v, "hash")` with a string source | Not excluded - the implementation reads `options.source` (G2) |
| `$compute` returning `{a, b}` read as `"{self}.res.a"` | Tracks recomputation |
| Proxy write `row.range.checked = true` to a `$for` member over a sited `$reactiveRoot` array | Reaches the source |
| Template binding `checked="@{range.checked}"` in the same member, changed by the user | Member updated, source not (G11) |
| Selector over BBEA's filters, one click on a phenology month | Fold re-run three times with identical results (G4) |
