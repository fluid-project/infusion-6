# Options for structural lenses

Today's `$lens` behaves correctly but isn't symmetric. Its forward arc is a computed cell. Its backward arc isn't an edge at all: `fluid.setForComponent` intercepts a write, and `fluid.putThroughLens` turns it into a write at the end of the source's chain of references. The goal is to express both arcs as ordinary edges in the signals graph. That is "following fish upstream" through a relation as well as through a reference.

A prototype (`biarc.js`, `biarc2.js` in the session scratchpad) shows how far the signals layer already gets:

- **Two plain cells:** a pair of whole-cell edges between them works today. This is the slider range ↔ filter state.
- **A chain of three:** it also works along a chain, provided each arc writes a whole cell by itself.
- **What fails:** the arc from the filter's state back into the URL hash. That arc can't write the whole hash without first reading it to keep the other keys. The edge then lists the hash as both its source and its target. The fit, the record of which way an update is travelling, treats that as the reverse of the arc just travelled and drops the update. In the prototype a write to the slider reached the state and stopped there.

Stable edge identity, keyed by the path of the site in the component tree, is now in place (`fluid.siteEdgeKey`, `fluid.attachSiteEdge`). Either option below builds on it: every backward edge is attached on behalf of the lens's site, replaced when that site turns over, and removed when its component is destroyed.

The two options:

- **A. Path edges:** an edge may target a path within a cell rather than the whole cell.
- **B. Cell records:** a reactive record holds a cell per member, so a member can be targeted as a whole cell.

Each is described below at three levels: `FluidSignals.js`, the integration language, and `hortis.elevationFilter`.

---

## Option A — Path edges

### i) FluidSignals.js

**The edge record** gains one field:

```js
/**
 * @typedef {Object} ComputedProps
 * ...
 * @property {String[]} [path] - If supplied, the relation computes the value held at this path within the cell's
 * value, rather than the whole of it - the rest of the value is preserved
 */
inEdge.path = props?.path || null;
```

`computed(fn, sources, {key, path})` sets up a path edge. A cell may hold any number of path edges beside at most one whole-value edge, or a plain value set with `set`.

**Committing a result.** `fluid.cell.update` currently ends in `fluid.cell.updateComplete(result, cell)`, which commits `result` as the value. For a path edge, the result is applied to the cell's current value instead:

```js
const committed = inEdge.path === null ? result : fluid.cell.applyAtPath(cell._value, inEdge.path, result);

fluid.cell.applyAtPath = function (value, path, result) {
    const base = fluid.isUnavailable(value) ? value.staleValue : value;
    return result === fluid.cell.deleteMarker ? fluid.cell.deleteImmutable(base, path) : fluid.setImmutable(base, path, result);
};
```

- **Removing a member** needs a distinct result, `fluid.cell.deleteMarker` (or `undefined`, if the convention is that a path edge never stores `undefined`). Without it, an edge couldn't take `elevation` out of the hash.
- **An unavailable target:** a path edge into a cell whose value is unavailable is itself unavailable. It waits, as an edge with an unavailable source does today. Under hydration the hash is `fluid.hashManager.noUrl`, so such an edge never fires. The linkage's `$if` excludes it there anyway.
- **Asynchronous results** need nothing new: the path is applied when the promise settles, against the value current *at that moment*. That is the point of a path edge. A concurrent write to another member isn't lost, which a whole-value edge holding a stale copy of the record would do.

**Choosing among edges.** `fluid.cell.findDirtyEdge` picks one edge to run. That rule is wrong for path edges, since several can be pending at once: one for `elevation` from the slider and one for `bees` from the checklist, both in one update. The new rule is:

1. If the whole-value edge, or a `set`, is dirty, run or keep it first. It sets the base value.
2. Then run every dirty path edge in turn, each applied to the value the previous one left.

Path edges with disjoint paths commute. Path edges with overlapping paths (`["a"]` and `["a", "b"]`) run in a fixed order, shortest path first, so the more specific write wins. The current scoring, which prefers the edge the cell was dirtied from, survives as the rule for choosing the whole-value edge.

`fluid.cell.update` is currently called once per updated cell; it would loop over the chosen path edges. Each call already does its own tracking, but it would also need the cell's value to be committed between the edges.

**Path-aware fits.** The forward arc of a lens reads `hash.elevation`, and its backward arc writes `hash` at `["elevation"]`. That makes a two-way pair whose two ends name different granularities of the same cell. Two cases matter:

- **Stopping the echo.** When the backward arc writes `hash`, the forward arc must not be re-run in the same fit. That is already true: the hash is recorded as consumed, and the forward edge's only source is the hash.
- **Spurious wakes.** A write to `hash.bees` dirties every forward lens reading the hash, `elevation` among them. Equality cuts these off: `hortis.urlMappedFilter.decode` returns an equal value and propagation stops. But every URL-mapped filter would re-decode on every change to the hash. It is cheap, and the same as today. A refinement is to record, on an edge reading a path, the path it reads (the flattened-argument cells of `fluid.flattenedArgCells` already isolate a path read into its own cell). `markStale` could then skip a reader whose path is disjoint from a path edge's path. This is an optimisation and isn't needed for correctness.

**The self-loop disappears.** The backward edge's only source is the filter's state. Its target is the hash at a path. So `fluid.cell.needsFit`'s `hasReverseArc` sees an ordinary two-way pair, and the forward and backward arcs travel in opposite fits as in the two-cell case that already works.

**Settled cells.** As with any edge, a path edge attached to a cell that already holds a value is trusted and isn't run until a source changes. For a backward arc that is the right default: on boot the URL's value for `elevation` must win over the slider's default range.

**Size of change.** Roughly the following, plus tests for ordering, deletion, async settling and fits:

| Change | Lines |
|---|---|
| Edge field and `applyAtPath` | ~20 |
| `findDirtyEdge` rule | ~40 |
| The `update` loop | ~30 |

The path-aware `markStale` refinement would be separate.

### ii) The integration language

**Expanding `$lens`.** The record syntax stays as it is, so authors see no change:

```js
range: {$lens: {source: "{elevationFilter}.filterState", forward: "...", backward: "..."}}
```

But `fluid.expandLensRecord` would produce two edges instead of a cell with an attached `backward` method:

- **Forward:** the lens's site holds a cell computed from `source` via `forward`, as today.
- **Backward:** an edge onto the **terminal cell of the source**, attached via `fluid.attachSiteEdge(shadow, segs, terminal, backwardFn, [lensCell], {path})`.
  - The terminal cell is the cell of the last `$sitedRef` in the source's chain (today's `fluid.terminalSiteOf`), plus the path within that cell's value at which the sited reference reads.
  - If that path is empty, the edge is a whole-value edge. Otherwise it is a path edge at that path.
  - A sited reference already knows its cell and path (`fluid.upstreamSite` resolves the same thing for a write to a reference). It would expose them as a `(cell, path)` pair for this purpose.

**What goes away:**
- the intercept in `fluid.setForComponent` (`fluid.findLensSite`);
- `fluid.putThroughLens`;
- the `isMatForming` special case for lens sites.

**What a write becomes.** A write to the lens's site, `that.dualRangeInput.range = {...}`, becomes an ordinary write to the lens cell's live-layer value. That needs the lens site to be writable as a cell in its own right, as a `$reactiveRoot` is. The write sets the lens cell, whose backward edge then carries the value upstream.

**A write beneath the lens.** A write such as `range.min = 3` becomes a write at a path within the lens cell's value, as for any reactive root. Today `putThroughLens` handles this explicitly with `setImmutable`; here it falls out of the ordinary handling of writes to reactive data.

**What the backward function receives.** `backward` no longer receives the source's other members, because it no longer needs to. It maps the lens value to the value *at the source's path*:

- For the hash, `backward(state) → "100,950"`, not a whole new hash.
- `hortis.urlMappedFilter.encode` loses its `{hashManager}.hash` argument, and its merge and delete logic moves into the signals layer (`deleteMarker`).

**Edge identity.** The backward edge is keyed by `fluid.siteEdgeKey(shadow, segs)` of the lens's site. If `elevationFilter` turns over and allocates a fresh lens cell, the new backward edge replaces the old one on the hash rather than standing beside it. Destroying the filter removes it.

**Linkages.** `hortis.urlMappedFilter.linked` is unchanged in form: `filterState` becomes a `$lens` whose source is `{hashManager}.hash` at the filter's `urlKey`. The source becomes a path rather than a whole record:

```js
filterState: {$lens: {
    source: "{hashManager}.hash.{self}.urlKey",          // or a computed path segment
    forward: "hortis.urlMappedFilter.decode({0}, {self}.urlCodec)",
    backward: "hortis.urlMappedFilter.encode({0}, {self}.urlCodec)"
}}
```

The reference here has a computed final segment. Either the IL learns a computed path segment in references, or the lens record grows a `path` member alongside `source`.

**Chains.** `range` is a lens over `filterState`, which is itself a lens over `hash.elevation`. With edges this is two pairs:

- `range` and `filterState`: whole-cell edges, a case that already works.
- `filterState` and `hash`: a path edge.

`fluid.terminalSiteOf` is still used once, at expansion, to find the target of each backward edge. It no longer runs on every write.

### iii) From the point of view of elevationFilter

**The SFC itself doesn't change:**

```js
filterState: null,
dualRangeInput: {
    $component: {
        $layers: "hortis.dualRangeInput",
        range: {$lens: {
            source: "{elevationFilter}.filterState",
            forward: "hortis.elevationFilter.toRange({0}, {self}.minRange, {self}.maxRange)",
            backward: "hortis.elevationFilter.toState({0}, {self}.minRange, {self}.maxRange)"
        }}
    }
}
```

**What happens differently:**

- **Without a hash manager,** `filterState` is a plain cell. Dragging the slider writes `range`, and its backward edge recomputes `filterState` from it. A `reset` writes `filterState = null`, and the forward edge recomputes `range`. This is the two-cell case and already works with plain edges.
- **With a hash manager,** the linkage turns `filterState` into a lens over `hash.elevation`:
  - Dragging the slider writes `range`. Its backward edge writes `filterState`, whose own backward path edge writes `"lower,upper"` into `hash` at `["elevation"]`, leaving `bees` and `sex` untouched.
  - The hash manager's `pushState` effect then pushes the URL.
  - Navigating back sets `hash` as a whole from the listener. The forward edges carry `elevation` to `filterState` and then to `range`, so the slider moves.
  - Moving the slider to the full range makes `toState` return null, and `encode` returns the delete marker, so `elevation` leaves the URL.
- **Ownership:** no filter refers to the hash manager, and `elevationFilter` doesn't know whether its state is held locally or in the URL. That is the same as today.
- **Debugging:** the graph now shows the real relations. Inspecting the hash cell's `_inEdges` lists one path edge per URL-mapped filter, each keyed by its site, e.g. `bcba-6.elevationFacet.body.elevationFilter:filterState`.
- **What goes:** `encode`'s `{hashManager}.hash` argument and its merging code.

---

## Option B — Cell records

### i) FluidSignals.js

Nothing changes in the edge machinery. Option B instead adds a *container* to the signals layer: a record whose members are cells, created on demand.

```js
/**
 * A reactive record holding a cell for each of its members, created on first read or write
 * @param {Object} initial - The record's initial members
 * @param {String} name - A name for its cells
 * @return {CellRecord} The record, with methods `member(key)`, returning the cell holding a member, and `keys`, a cell
 * holding the array of the record's keys
 */
fluid.cellRecord = function (initial, name) { ... };
```

**`member(key)`** returns the cell for that key, creating it, holding `undefined`, if it doesn't exist.

**`keys`** is a cell holding the current key set. It changes when a member is first given a defined value or set to `undefined`.

**A whole-record view, `whole`,** is a computed cell, so readers that want the record as a value (the URL renderer) can still have it:

```js
record.whole = fluid.cell().computed(keys => Object.fromEntries(keys.map(key => [key, record.member(key).get()])), [record.keys]);
```

It reads its members dynamically, which the tracking in `fluid.cell.update` already supports.

**Writing the whole record** (the URL listener writes a freshly parsed record) is a method:

```js
record.setAll = function (value, options) {
    fluid.cell.batch(() => {
        Object.keys(value).forEach(key => record.member(key).set(value[key], options));
        // Members absent from the new value are cleared
        record.keys.get().filter(key => !(key in value)).forEach(key => record.member(key).set(undefined, options));
    });
};
```

It needs a batch, so that the `whole` view and its readers see one change rather than one per key. The signals layer has fits but no explicit batch API; it would need one, or `setAll` would start a fit itself.

**What is already enough.** A member cell is an ordinary cell. The backward arc from the elevation state is an ordinary whole-cell edge into `record.member("elevation")`, and it has no self-loop. Two-way pairs, fits, site-keyed identity and the settled-cell rule all work as they already do for two plain cells.

**What it costs:**
- Each member is a separate cell. The record's identity as a single value exists only through `whole`.
- Every reader of `whole` re-runs when any member changes, which is no better than path edges without the path-aware refinement.
- **Nesting:** a member that is itself a record (`hash.filters.elevation`) would need a cell record of its own. Either cell records nest on demand, or option B covers only flat records.

**Size of change.** Roughly 80–120 new lines, with nothing changed in the existing edge machinery.

### ii) The integration language

Option B touches the IL more, because the IL's notion of reactive data assumes one cell per root.

**Declaring a cell record.** It would be a new form of reactive root, or a flag on one:

```js
hash: {$reactiveRoot: {}, $cells: true}     // or $cellRecord: {}
```

`fluid.expandReactiveRecord` would build a `fluid.cellRecord` instead of a `fluid.cell`. The shadow map records the root as a cell record.

**Resolving references.** A reference `{hashManager}.hash.elevation` is currently a `$sitedRef` onto the root's single cell, which reads the path `["elevation"]` within its value (`getThroughSignals`). For a cell-record root:

- `fluid.fetchContextReference` / the sited-ref machinery would resolve the first segment beneath the root to `record.member("elevation")`, and read any further segments within that member's value as before.
- A reference to the root itself, `{hashManager}.hash`, resolves to `record.whole`.

**Writing through references.** `fluid.setForComponent` and `fluid.upstreamSite` would have to treat a cell-record root specially:

- A write to `hash.elevation` sets the member cell.
- A write to `hash` calls `setAll`.
- A write to `hash.elevation.x` sets a path within the member's value.

These are three new cases alongside the existing proxy and live-layer handling.

**Proxies.** The proxy over a component's reactive data (`fluid.isMatForming`, the proxy's get handler) would need to present a cell record as a plain object whose members read and write member cells. That is a new kind of proxy.

**Expanding `$lens`.** The lens expands into two whole-cell edges in all cases. The backward edge's target is the source's terminal cell, which for `{hashManager}.hash.elevation` is now `record.member("elevation")`, so it is never a path. There is no need for path edges, deletion markers or a new edge-choosing rule. `fluid.attachSiteEdge` handles identity exactly as it does now. As in option A, the intercept, `putThroughLens` and the `isMatForming` special case go away.

**The hash manager.**
- `fluid.hashManager.listen` calls `that.hash = parse(...)`, which reaches `setAll` through the new write path.
- `pushState` reads `{self}.hash`, which resolves to `whole`.
- Its code barely changes; the work is in the IL.

**Where else it applies.** Only roots declared as cell records benefit. A filter's own `filterState` (e.g. a checklist's `{id: true}` record) that wanted structural lenses beneath it would have to be declared as a cell record too. That choice is the author's, made up front.

### iii) From the point of view of elevationFilter

- **The SFC doesn't change,** and neither does `hortis.urlMappedFilter.linked`, except that its source names the member directly and `backward` loses its hash argument. That is the same simplification as in option A:

  ```js
  filterState: {$lens: {
      source: "{hashManager}.hash.{self}.urlKey",
      forward: "hortis.urlMappedFilter.decode({0}, {self}.urlCodec)",
      backward: "hortis.urlMappedFilter.encode({0}, {self}.urlCodec)"
  }}
  ```

  The computed final segment is needed here too.
- **The difference is in the hash manager.** Its `hash` member is declared as a cell record (`$cells: true`).
- **Behaviour** is the same as option A:
  - Dragging the slider writes `range`, then `filterState`, then `hash.member("elevation")`.
  - `whole` recomputes and `pushState` pushes the URL.
  - Back navigation calls `setAll`, and `elevation`'s member cell drives `filterState` and then `range`.
  - Returning `undefined` from `encode` clears the member, and `whole` drops it from the URL.
- **Debugging:** the elevation filter's backward edge sits on its own member cell, `hash.elevation`, and never shares a cell with another filter's. Each member cell carries at most one backward edge, so no edge-choosing rule is involved. Inspecting `hash.elevation._inEdges` shows only the elevation filter's edge, with its site key.

---

## Comparison

| | A. Path edges | B. Cell records |
|---|---|---|
| Changes to `FluidSignals.js` | Edge field, edge-choosing rule, `update` loop, delete marker | A new container, plus a batch API; edges unchanged |
| Changes to the IL | `$lens` expansion; sited refs expose (cell, path) | `$lens` expansion; a new kind of reactive root, with reference resolution, writes and proxies for it |
| Applies to | Any reactive data, at any depth, without declaration | Only roots declared as cell records; nesting needs further work |
| A record as a value | Native: one cell, one value | Assembled via `whole`; the record's identity is split across cells |
| Risk | The edge-choosing rule is new territory in `findDirtyEdge` and must be right under async and fits | Lower risk in signals; larger, wider changes to the IL's data model |
| elevationFilter | Unchanged | Unchanged |
| hortis.urlMappedFilter | `encode` simplifies | `encode` simplifies |
| Hash manager | Unchanged | Declares `hash` as a cell record |

## Recommendation

**Option A, path edges.** A write through a reference is already a write at a path within a cell (`fluid.upstreamSite`, `setImmutable`). Path edges make the signals graph express what the IL already does on writes, rather than introducing a second model of reactive data. They apply to any reactive root without the author anticipating it. That matters for checklist and region filters, whose state is a record that a future lens might well target beneath.

The risk is concentrated in one place, `findDirtyEdge` and `update`, and can be tested there in isolation. That includes the cases the prototype exercised: a two-way pair, a chain of three, and a path edge whose sibling member changes concurrently while the path edge's update is in flight.

Option B's smaller signals change is outweighed by the changes it forces on reference resolution, writes and proxies in the IL. Its gains don't reach data that wasn't declared as a cell record in advance.

## Shared prerequisites

Whichever option is chosen:

1. **A computed final segment in a lens source** (`{hashManager}.hash.{self}.urlKey`), or a `path` member in the `$lens` record. Today the codec's `decode` receives the whole hash and the key, which hides this.
2. **The lens site writable as a cell.** A write to `range` must set the lens cell itself rather than being intercepted, as a `$reactiveRoot` already is.
3. **Site-keyed identity for the backward edge.** Done: `fluid.attachSiteEdge`.
4. **A boot-time check** that the settled-cell rule gives the URL precedence. The prototype's step 5 showed a pair joined after both cells settled doesn't run. Lenses attached during instantiation, before either end settles, should be confirmed to pull the forward arc rather than run the backward one.
