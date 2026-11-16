# Strategies for `fluid.liveQueryILSelector`

Analysis of the cost of live IL selector queries on saanich-peninsula-flora's story page (2026-11-16), and two ways of
reducing it: sharing one traversal per head component, and maintaining matches incrementally. Follows the work
described in [live-layer-remerging.md](live-layer-remerging.md).

## The cost as measured

Whole startup of Saanich's story, CPU slowed 4×, with the stable slot records, `pushPotentia` guard and scope-tick
gate in place:

| Head :: selector | Runs | Time | Components visited per run |
|---|---|---|---|
| `story` :: `hortis.obsFilter` | 75 | 124 ms | 403 |
| `story` :: `hortis.checklist` | 46 | 65 ms | 520 |
| `story` :: `hortis.filter` | 46 | 61 ms | 520 |
| `story.solowTaxa` :: `hortis.taxaFilter` | 33 | 15 ms | 117 |
| `story.map` :: `hortis.libreMap.clickHandler` | 4 | 1 ms | 7 |

- **Only 5 query cells exist, one per (head, selector).** `fluid.liveQueryILSelector` already keeps them in the head's
  `shadow.queryILMap`, keyed by selector. It also already returns the previous array when the matched components are
  unchanged, so consumers are cut off. Caching further by arguments would not reduce the runs.
- **Each run re-traverses everything below the head,** 400–520 components for the root's queries. A run is triggered
  by a scope tick of *any* component in that subtree. The recorded causes are scope ticks of `solowTaxonPanel`,
  `obsTable`, `map`, `checklist.search` and others: components appearing during startup. Each appearance re-walks the
  whole tree.
- **The three root queries walk the same tree separately,** usually on the same tick, since their causes match. That
  is about 250 ms of the ~266 ms total.

## Option 1: share one traversal per head

Each head component keeps **one** traversal of its subtree, shared by all its live queries. Each query then only
filters that traversal's entries with its own selector. Semantically nothing changes: it's the same traversal, the
same matcher and the same dependencies, just done once per head rather than once per selector.

**Size:** about 60 lines of code plus ~25 of JSDoc in `FluidIL.js`, and ~60 lines of tests.

### Data structures

| Structure | Where | Contents |
|---|---|---|
| `shadow.queryIndexMap` | the head's shadow, beside the existing `queryILMap` | up to two index cells, keyed `""` for a deep traversal and `"!"` for a flat one |
| index cell | per head and flat flag | computed by one `fluid.visitComponentsForMatching` walk, so it keeps today's dependencies on every visited component's `scopeTick` and `availableInstance`. Its value is `{entries: [{shadow, shadowStack, scopes}], unavailable}`: the visited components in traversal order with copies of their stacks, plus the merged unavailable value if any visited component is unavailable |
| live query cell (existing, in `queryILMap`) | per head and selector, unchanged in identity | now computed from the index cell alone. It returns `unavailable` if set, and otherwise filters `entries` with `fluid.matchILSelector`. It keeps the existing `previous`/`arrayEqual` cut-off |

The stacks must be copied: the walk reuses its `shadowStack` and `scopes` arrays, which are documented as not
writeable. Each copy has one element per level of depth, about 6 here, so for ~520 components that's around 6,000
array slots per index rebuild.

### Operations, and where they hook

1. **`fluid.queryIndexFor(shadow, flat)`, new.** It finds or allocates the head's index cell. The traversal is the
   body of the former `fluid.queryILSelector`, minus the matching.
2. **`fluid.liveQueryILSelector`** filters the index instead of calling `fluid.queryILSelector`.
3. **`fluid.queryILSelector`, the non-live one-off,** stays as it is.
4. **Disposal:** index cells live and die with the head's shadow, as `queryILMap` already does.

No hooks are needed in `scopeEffect`, destruction or availability.

### Risks

Low. The results are identical by construction: the same walk in the same order, the same skips (inert components, no
`that`, `visited` by `$id`), and the same matcher. A query that runs while the index is being recomputed can't see a
half-built index, since the index is an ordinary computed cell, read only when complete.

### Expected gain

The three root queries cost 250 ms over 75 + 46 + 46 runs, about 1.4–1.65 ms per run. With a shared index:

- **The index rebuilds once per subtree change,** about 75–80 times, at roughly the cost of one query's run (~1.3 ms):
  **~100–110 ms**.
- **Each query's filter** is a pass over ~520 entries with `matchILSelector`, without the cell reads the traversal
  makes, guessed at ~0.1–0.2 ms per query per rebuild: **~25–45 ms** for three queries.

So about **130–150 ms** in total, a saving of roughly **100–120 ms**. The figure depends on how a run's time splits
between visiting and matching, which was not measured beforehand.

## Option 2: maintain matches incrementally

### What a match depends on

- **`fluid.matchILSelector`** tests each selector element against the **own** scope of a component on the chain from
  the head down to the candidate: `scopes[thatpos]` is an `ownScope`, checked with `hasOwnProperty`. It ignores the
  head itself (`i = 1`) and everything above it. So a component's match depends only on the applied contexts of itself
  and its ancestors below the head.
- **A query also reports unavailability.** If *any* component in the subtree is unavailable, the result is
  unavailable, whether or not that component would match. So availability is a second input.
- **Results come in pre-order traversal order,** following each `childComponents` in insertion order. Consumers such
  as `filterComps` may depend on that order.
- **The traversal skips some components:** those without `that`, inert ones (when the head isn't inert), and ones
  already visited by `$id`, which guards against cross-injection.

**Size:** roughly 200 lines of code plus ~70 of JSDoc in `FluidIL.js`, and ~150 lines of tests.

### Data structures

| Structure | Where | Contents |
|---|---|---|
| `shadow.liveQueries` | the head's shadow; it replaces the cached cells in `shadow.queryILMap` | `Map<key, LiveQueryRecord>`, with the key being selector plus flat flag |
| `LiveQueryRecord` | per query | `{parsed, flat, matches: Set<Shadow>, version: Cell<Number>, result: Cell}`. `result` is computed from `version`, sorts `matches` into traversal order, and has `equiv: fluid.equiv.elementwise` |
| `shadow.unavailableBelow` | the head's shadow | `Set<Shadow>` of the unavailable components in its subtree, shared by its queries |
| (no global registry) | — | a changed component finds its affected heads by walking up `parentShadow` and checking for `liveQueries`, at a cost of O(depth) |

### Operations, and where they hook

1. **Creating a query** (`fluid.liveQueryILSelector`): fill `matches` with one full traversal, and fill
   `unavailableBelow` the same way. *About 40 lines.*
2. **A component's contexts change** (`scopeEffect`, wherever the scope-tick gate finds `changed`): for each ancestor
   head with live queries, re-match the component, and also its descendants if any of that head's selectors has more
   than one element. Its stack and scopes are rebuilt by walking up to the head. Each matching query's `matches` gets
   the component added or removed, and its `version` is bumped. A newly appearing component arrives here through its
   first `scopeEffect` run, so attaching needs no hook of its own. *About 50 lines.*
3. **A component is destroyed or detached** (the `delete …childComponents[…]` sites): remove it and its descendants
   from the `matches` and `unavailableBelow` of each ancestor head, and bump the versions. *About 20 lines.*
4. **A component's availability changes** (the existing per-component `trackComponentAvailability` effect): add it to
   or remove it from `unavailableBelow` at each ancestor head, and bump that head's query versions when the set changes
   between empty and non-empty. *About 25 lines.*
5. **Producing the result:** a computed cell on `version`. It returns the merged unavailable value if
   `unavailableBelow` is non-empty. Otherwise it sorts `matches` with a tree-order comparator: compare the ancestor
   chains, then the positions of siblings in `Object.keys(parent.childComponents)`. Matches are few (tens), so sorting
   on demand is cheap. *About 35 lines, comparator included.*
6. **Skipped components:** an inert component is never added, mirroring the traversal. A subtree containing a
   cross-injected component makes its head's queries fall back to the full traversal, which keeps the `visited` and
   `$id` semantics without modelling injection. *About 20 lines.*
7. **Flat queries:** re-match only when the changed component is a direct child of the head.

### Correctness net

- **A debug cross-check:** with a flag on, each `result` recomputation also runs the full traversal and fails on any
  difference. Run the whole test suite and the demos with it on.
- **Tests (~150 lines):** a component appears, then is destroyed; an ancestor's contexts change, so a descendant
  selector matches or stops matching; availability goes to unavailable and back; result order after children are
  inserted out of order; a flat query; the fallback for cross-injection; inert subtrees; a randomised test that
  mutates a tree and compares against `fluid.queryILSelector` after each step.

### Expected gain

During saanich's startup, each change is a single component appearing, with little or nothing beneath it yet. So
maintenance per change becomes O(depth + queries at the affected heads), instead of a walk of 400–520 components for
each of the three root queries. The current ~266 ms would be expected to fall to the order of 10–20 ms, an estimate
from the structure.

### Risks

- **Order:** sibling order is that of `childComponents` keys, which is insertion order. That changes if a member is
  deleted and re-added. The comparator follows whatever order the traversal would see, so the two stay consistent,
  and the cross-check would catch any disagreement.
- **Timing:** a `scopeEffect` might run before the component is inserted into its parent's `childComponents`. The
  re-match then has to check that it is reachable, as the traversal's `that` check does.
- **Cross-injection** is handled only by falling back to the full traversal, so pages that use it gain nothing.

## Comparison

| | Shared traversal | Incremental |
|---|---|---|
| Code | ~60 lines (+25 JSDoc) | ~200 lines (+70 JSDoc) |
| Tests | ~60 lines | ~150 lines, plus a debug cross-check |
| Hooks outside the query code | none | `scopeEffect`, destruction, availability tracking |
| Risk | low: identical by construction | moderate: order, timing of attachment, a fallback for cross-injection |
| Estimated saving on saanich | ~100–120 ms | ~240–255 ms |
| Scaling | still O(subtree) per change, but once per head | O(depth + changed subtree) per change |

The shared index is only a partial step towards the incremental version: the per-head registry carries over, but the
index itself would be replaced by maintained match sets rather than extended.

The shared traversal was implemented first, as the cheap and safe win.

## Outcome of the shared traversal

Implemented as `fluid.queryIndexFor` in `FluidIL.js`, with `fluid.liveQueryILSelector` filtering the index. Measured
over the whole startup of Saanich's story (single runs, CPU slowed 4×):

| | Before (scope-tick gate only) | Shared traversal |
|---|---|---|
| Root traversals | three queries: 77 + 49 + 49 runs, 230 ms | one index: 76 runs, 133 ms |
| Filtering by selector | (included above) | 7 ms for all root queries |
| `story.solowTaxa` | 34 runs, 14 ms | index 34 runs, 14 ms; filter 1 ms |
| **Total** | **245 ms** | **156 ms** |

The saving is about 90 ms, a little under the estimate. Matching turned out to be very cheap (a few ms across all
queries), so nearly all the remaining cost is the traversal itself: the reads of each component's scope tick and
availability. Only the incremental algorithm, which avoids re-walking the tree, would remove that.
