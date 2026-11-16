# Live layer upgrades and remerging

Diagnosis of the late re-rendering of the "Lost Plants" panel, and of a whole-tree cascade at reveal, on
saanich-peninsula-flora's story page (2026-11-16), and discussion of whether a first write to a member could avoid
remerging its component.

## Diagnosis

The late Lost Plants re-render comes from an Infusion issue, `fluid.pathToLive`, and so does a larger whole-tree
cascade about a second later. The first time a component writes to one of its members, Infusion re-merges that whole
component. When the component is the root, the entire tree is re-merged.

This was measured in a 4×-throttled browser run of Saanich's story, from a copy of the test root with the bagatelle
edits of the time reverted, since saanich's vendored Infusion is older.

### What happens

| Time | Event | Cause |
|---|---|---|
| 0.93 s | The three pane SFCs are parsed | — |
| 5.5–5.7 s | The pane sections are built | Their markup has arrived |
| 5.88 s | `lostPlants`, `traces` and `protectedAreas` are first built (181 scope ticks) | Their layers are defined only now (see below) |
| 8.53 s | **`lostPlants` is re-merged and rebuilt** | Its first write to `cards`, in `bioreportr-lostPlantsPane.vue:199`/`259` |
| 9.52 s | **The root `story` is rebuilt, and every component re-merges (312 scope ticks)** | The root's first write to `revealed`, in `story.js:161` |

### The Infusion cause: `fluid.pathToLive` (`FluidIL.js:1106`)

- A component's live layer holds a signal only for paths that have already been written. On the first write to any
  other path, `pathToLive` creates the signal and then calls `shadow.potentia.set(Object.assign({}, …))`
  ("Remerge … Could be much more efficient").
- That potentia reset makes `flatMergedComputer` re-run for the whole component. The component is then rebuilt, along
  with everything under it.
- Declaring the member doesn't prevent this. Both `cards: {}` and `revealed: false` are declared, and the live signal
  is still only created on the first write.
- The cost depends on where in the tree the component sits:
  - On a leaf it's small. `curationForm.draft` at 5.9 s and `iNatPanels.0.view.vTree` at 7.2 s are the same
    mechanism, at negligible cost.
  - On `lostPlants` it re-renders that panel.
  - On the root, the reveal itself (`that.revealed = true`) re-merges the whole story page at the point it's revealed.

An earlier session attributed the late event to the excluded-taxa CSV and to the pane section's markup arriving.
Those happen around the same time but are not the trigger.

### How it could be fixed in Infusion

1. **Upgrade without re-merging:** raise a path into the live layer without resetting potentia. The merge would then
   read that member's live signal directly, so adding one key only invalidates that member, not the whole component.
2. **Create the signals up front:** create live-layer signals for a component's plain-valued members when the
   component is built. A later first write is then just `set` on an existing cell. This is simpler, but it allocates
   cells nobody may write to.

There's also a stopgap on the saanich side: write `revealed` and `cards` once at startup, while the tree is still
small. That's a workaround, not a fix.

### A separate delay

`bioreportr.lostPlants`, `bioreportr.traces` and `bioreportr.protectedAreas` are defined as secondary layers inside
`bioreportr-*Pane.vue`. Infusion injects an imported SFC's scripts only when a component asks for the layer named
after its file (`fluid.ensureImportsLoaded`, `FluidView.js:1954`). Here that means the `*Pane` layer, which is only
asked for once the pane sections are built at about 5.6 s. So all six layers stay undefined from 0.93 s, when they're
parsed, until 5.86 s, and their components are then built together in one burst.

Either of these would bring that forward by about 5 s:

- give each of these layers its own file;
- import the SFC by naming the layer, `<fluid-import … layer="…">`.

## Question: is upgrade without remerging coherent?

> Is layer upgrade without re-merging coherent? I guess in a certain moral sense it is because the whole invariant
> supported by "pathToLive" is that the upgraded live value is initially indistinguishable from the flat one. But I'm
> concerned about breaking what has previous been an invariant, that any update to layer complement must cause
> re-merging and instance turnover. But I guess a further get-out is that morally, the live layer is "always" present
> and so this doesn't necessarily represent a complement change. Nonetheless the layer shape has changed and this also
> gives rise to a necessary update in the provenance map held in the shadow. Are you proposing to honour these by
> naive mutation? Could you sketch out in more detail exactly which invariants we are proposing to bend and what the
> consequences of them could be for different observers?

It is coherent, but only under a stronger reading of the "the live layer is always present" escape clause. Under that
reading, naive mutation isn't enough.

### What the upgrade relies on today

In `fluid.pathToLive`, the live layer object is already mutated naively by `fluid.set(shadow.liveLayer, segs, cell)`.
The potentia copy then forces three things:

1. **A cache miss in the merge.** `flatMergedComputer` keys its memo `shadow.lastMerge` on
   `[potentia, dynamicMergeRecord, resolved.mergeRecords]` by identity. A fresh potentia object is what defeats the
   memo.
2. **A fresh merge product.** `mergeLayerRecords` produces a new `flatMerged`, which now holds the cell at that path,
   and a new `layerMap`, whose `[$m].source` at that path is now the `live` record.
3. **Instance turnover.** `computeInstance` builds a new instance, re-runs `transferShadowMap` and `expandLayer`, which
   runs `markSignalised` for the new cell, disposes the layer's effects, and increments `instanceId`.

### The invariants involved

**I1. Merge products are immutable values of their inputs.**

- `lastMerge` hands back `previous.flatMerged` on a memo hit.
- `expandLayer` puts merged sub-objects into the instance by identity (the "keeps its identity" branch,
  `FluidIL.js:3052`).

So `flatMerged` and `layerMap` are, in effect, shared and frozen.

**I2. An instance's shape is fixed for its `instanceId`.** Which members are signals and which are plain values, and
the `shadowMap` marks derived from that, are computed once per turnover. The marks are `signalised`,
`hasSignalChild` and reactive roots.

**I3. A plain member changes only through instance turnover.** This is the one everything else rests on.

- A reader of a member gets a `$sitedRef` from `fluid.getForComponent`, computed by
  `getThroughSignals(shadow.computer, segs)`.
- If the value at that site is plain, the reader's only dependency is `shadow.computer`.
- Proxy reads of plain members work the same way.

So any reader may treat a plain member as a constant for the lifetime of the instance.

**I4. Provenance is correct.** `layerMap[…][$m].source` answers "which layer supplies this site". It is read by:

- `fluid.layerForSite`, used by the editor;
- `fluid.renderSite`, whose result `setForComponentImpl` records as `layerName` in history entries;
- the `reactiveLiterals` and `fallback` lookups.

**I5. A change in what the merge is fed causes re-merging and turnover.** There is already a precedent for an
exception: once a path is live, writes change its value by `cell.set` without any re-merge. So in practice I5 holds
only for the live layer's *shape*, not its values.

The moral argument is that the live layer is notionally total. Every member has a latent cell holding its merged
value, and the upgrade only *materialises* one. Materialisation is harmless only if no observer can tell it happened.
The value is identical at that instant, which is what `pathToLive` ensures, but that is not enough. **I3** is where it
would show: every existing reader is bound to the old value as a constant, and would never see the writes that follow.

### Consequences for each observer, if the re-merge is skipped

| Observer | With naive mutation (patch `flatMerged`, `layerMap` and the instance in place) | What would be needed instead |
|---|---|---|
| `$compute`/`$effect` arguments and template bindings that read the member through `{self}` or a context reference | **Silently stale.** They depend only on `shadow.computer`, which doesn't change, so `that.revealed = true` would never reach `@class="imerss-loading:!@{revealed}"` | A dependency per member: readers of a plain member also read a per-member "shape" cell, which the upgrade bumps. `sitedRefMap` already finds the `$sitedRef` for a site, its descendants and its ancestors; proxy reads would need the same hook |
| Readers of an **ancestor** path (e.g. `{self}.cards` while `cards.x` is upgraded) | They hold a plain object. After the upgrade the path is mat-forming (`hasSignalChild`) and should be proxied | `markSignalised` up the ancestor chain, and invalidation of the ancestors' `$sitedRef`s |
| `flatMergedComputer` memo (`lastMerge`) | **Lost writes.** A later re-evaluation with equal inputs, e.g. through the parent turning over, would return the old `flatMerged`, without the cell. The next instance would expand the member as plain, while writes keep going to the orphaned live cell. If the old `flatMerged` were patched in place instead, its sub-objects shared with the instance would change underneath readers | No in-place patching of memoised products. Add a "live shape" version to `mergeInputs`, so the next merge for any reason includes the cell and the cache can't resurrect the old shape |
| Provenance (`layerMap`, `renderSite`, `layerForSite`) | Without an update: history entries and the editor attribute the value to the authored layer. An undo of an "updateLayer" entry could write back into the authored layer's definition, which would be corruption. With an in-place update: correct for later reads, but anything holding the old answer isn't told | Update the provenance for the subtree at that path to the `live` record. Also make provenance observable, for example through a cell, so the editor's display is notified |
| Writers (`setHandler`'s `prop in shadow.liveLayer` upstream test, `findReactiveRoot`) | Correct immediately: they read `liveLayer` itself, which is already mutated | None |
| Effects and reactive links mounted at turnover (`disposeLayerEffects`, `transferShadowMap`) | Kept, which is the point of the change. A path under a reactive root already goes to the root's cell, so no link needs remounting | Check that no link is mounted on the strength of a member being plain |
| Children, and anything keyed on `instanceId` | Keep their identity and caches. This is the saving, e.g. the 312 scope ticks at reveal | None, unless a child captured the member as a constant through a context reference. That is the first row again |
| Availability (`unavailableLayerMap`) and the layer complement | Unchanged: the `live` record is always among the merge records, so this is not a complement change | None |

### Assessment

"Upgrade without re-merging" is coherent only as *unobservable materialisation*. That needs three new pieces:

- a dependency per member, so that I3 becomes "a plain member changes only through turnover **or its own shape
  cell**";
- a live-shape version among the merge inputs, so the memo can't revert the shape;
- provenance updated and made observable.

Doing the patching by naive mutation would break I3 and could break the memo, and either would show up as silently
stale bindings or lost writes. Those are exactly the failures turnover exists to prevent.

The alternative, option 2 above, bends **none** of these invariants: **create live cells at merge time for the
plain-valued top-level members of a component**. The shape is then fixed when the instance is created, the first
write is just `cell.set`, and provenance says `live` from the start. The cost is a cell for each such member whether
or not anything writes to it. That could be narrowed to members that are declared, or to user components. Option 2 is
recommended unless that cell cost proves significant. The finer-grained invalidation that option 1 needs is close to
making every member reactive anyway.

## Accounting: where the re-rendering cost is actually incurred

> Before we proceed, could you make a quick and rough accounting of the route through the "Lost Plants" re-rendering
> costs were actually incurred. How in detail does a scope tick cascade trigger re-rendering of entire hierarchy?

This accounting corrects two earlier claims: that the cost was mostly the scope cascade, and that children hit their
merge memo when their parent turns over.

### The `lostPlants.cards` upgrade (8,535 ms) costs almost nothing

- Over its window (to 9,478 ms) there were 370 updates and **58 ms** of self-time. That covers one re-merge and
  turnover of `lostPlants` and its scope effect, about 5 ms in all. The rest is unrelated work in that window, mostly a
  `dataPanes` content render (21 ms).
- "The late Lost Plants re-render", as such, is small. The expensive event is the **next** one.

### The root `story.revealed` upgrade (9,478 ms) costs about 674 ms

There were 6,324 updates in the following 0.9 s.

| Category | Self-time | Main items |
|---|---|---|
| **View re-rendering** (`renderView` effects, `vTree` computes) | **~486 ms** | `checklist.tree.view` 339 + 63 ms; `obsTable` 24 ms; `solowTaxa` tables ~21 ms; the root view ~8 ms |
| **Turnover itself** | ~90 ms | `flatMergedComputer` 33 ms ×189; `computeInstance` 24 ms ×89; effects re-run 14 ms ×91; argument flattening 15 ms ×670 |
| **`$sitedRef` re-evaluation** | ~20 ms | 2,848 runs, 1,691 of them the checklist's per-row `filterState.#` |
| **Scope machinery** | **~64 ms** | live IL selectors 30 ms ×19; `scopeEffect` 20 ms ×89; `fetchContextReference` 6 ms; `resolveContext` 5 ms; `scopeTick` 3 ms ×368 |
| Other | ~12 ms | |

**89 components were rebuilt**, so the children do *not* hit their merge memo.

### The route, traced on `checklist`

| Time | Cell that re-ran | Source that had changed |
|---|---|---|
| 9,478 | (first write to `revealed` on the root) | `pathToLive` resets the root's potentia |
| 9,795 | `flatMergedComputer for path story-#.checklist` | `computeInstance for path story-#` (the root's turnover); a memo hit |
| 9,805 | `flatMergedComputer for path story-#.checklist` | **`potentia for path story-#.checklist`**: a real re-merge |
| 9,825 | `computeInstance for path story-#.checklist` | its `flatMergedComputer` |
| 9,994 → 10,009 | `checklist.tree`: merge, then instance | **its potentia**, pushed by `checklist`'s turnover |
| 10,009 → 10,075 | `checklist.tree.view`: merge, then instance | its potentia, likewise |
| then | `$effect at path renderView of … checklist.tree.view` | the new instance: **339 ms** re-rendering 1,690 rows |

**How the cascade spreads:**

1. When a parent turns over, `expandLayer` re-expands each of its `$component` records and calls
   `fluid.pushSubcomponentPotentia` (`FluidIL.js:2306`), which calls `fluid.pushPotentia`.
2. `pushSubcomponentPotentia` builds fresh merge-record objects every time. `pushPotentia` then sets a **new potentia
   object** unconditionally (`FluidIL.js:3431`), even when it holds the same records.
3. The child's `lastMerge` memo compares potentia **by identity**, so it misses. The child is fully re-merged, gets a
   new `flatMerged`, and turns over.
4. That re-pushes the potentia of its own children, and so on down the whole tree.

So a turnover is never contained to the component that turned over. **Every turnover of a component rebuilds its
entire subtree.** This happens whatever the cause, not just for live upgrades.

### How the scope tick cascade relates to the re-rendering

In this trace, **the scope tick cascade doesn't trigger the re-rendering. It follows it.**

- Each `scopeEffect` re-runs because *its own* component's `computeInstance` changed, which is why there are 89 of
  them, one per rebuilt component.
- Those ticks re-run the context resolutions and live selectors, about 64 ms in total.
- The re-rendering comes from the views being rebuilt by the potentia cascade.

The trace therefore says:

- **Gating the scope ticks would save at most about 10%** (~64 ms of 674).
- **About 85% comes from subtree turnover driven by the potentia re-push,** and the re-rendering it causes.

### What this means for the proposals

- **The best place for `equiv` is the potentia cell.** If `pushPotentia` (or the potentia cell's own `equiv`)
  recognised an equal potentia (the same record types, names and priorities, the same layer names, and *the same layer
  material*) and kept the old object, a child's merge memo would hit and nothing below the upgraded component would
  turn over. That would cut off this cascade, and it would also contain *every* turnover, not only live upgrades.
- **The open question is whether the `expanded` material in those records keeps its identity** when the parent is
  re-merged. If it does, comparing records element by element is cheap and exact. If `mergeLayerRecords` builds fresh
  merged objects for subcomponent definitions, the comparison has to be structural, or the merge has to reuse
  unchanged merged subtrees. That's the next thing to measure before proposing code.
- **Scope gating** is still correct and cheap, but it's a minor gain.
- **`sameAsLast`** is the same disease at the application level, so the `equiv` design still covers it.

## Does the expanded material keep its identity, and what actually re-pushes potentia?

> Check whether the expanded material keeps its identity - and also consider whether there's a straightforward means
> of preventing all subcomponents in a tree from reinstantiating just because a parent turned over in a way which left
> all of their $component entries unchanged (if this is indeed what's responsible for the 85% that you describe)

The `expanded` material does keep its identity. So plain `$component` records are already contained, and the 85%
comes from a different route: the view renderer.

### 1. Plain `$component` records survive a parent's turnover

- `fluid.readerExpandLayer` caches its result in a WeakMap keyed by the record object.
- `fluid.mountSignalRecord` hands back the existing child computer when the signal record is the same.
- A node test confirms it. A parent was built whose children are declared in one layer, in two contributing layers,
  through a mixin, and one level further down. After a first write to a parent member, which turns the parent over,
  every child kept an identical potentia, merge-record layers, `flatMerged` and instance.

### 2. Two re-push routes in the renderer change potentia

Every `fluid.pushPotentia` into an existing component between 9.3 and 10.6 s of the saanich run was logged. There were
34, all with genuinely **new** layer objects:

| Count | Record | Pushed by | Example components |
|---|---|---|---|
| 24 | `template` | the renderer processing an `@id` slot (`FluidView.js:3182`–`3196` in the checkout) | `map`, `obsTable`, `taxonPanel`, resize bars, `solowRadius` |
| 10 | the unnamed `subcomponent` contribution to `X.view` | the re-merge of `X` after route 1 | `taxonPanel.view`, `map.view`, `solowTaxa.view`, the filters' views |

### 3. How the cascade arises

1. Each time a view's `vTree` is recomputed, `processVNode` meets every `@id` slot again.
2. For each slot it builds a fresh `templateRecord` holding a new `parentTemplate` cell and the new vnode's
   `elementSignal`. That really is different layer content, not just a fresh wrapper, so the child's potentia changes
   and the child re-merges and turns over.
3. The template record carries the child's `view: {$component: …}` (that's the unnamed contribution in route 2). So
   the child's view also turns over and runs `renderView` in full. For `checklist.tree.view` that was the 339 ms.
4. That view's own `@id` slots repeat the process, all the way down the tree.

The amplifier is the loop **re-render → re-push of a fresh template record → turnover → re-render**. The trigger is any
recomputation of a view's `vTree`. Here it was the root view's, after the root turned over on the `revealed` upgrade.

There is also a possible double turnover, not yet measured. Each slot's `allocateVNodeEffect` disposable pushes an
*empty* template record when the old vnode is disposed. If disposal of the old vnode comes before allocation of the new
one, each slot is pushed twice per re-render.

### 4. A straightforward way to stop it: make a slot's template record stable across re-renders

- **Cache one record per (view shadow, `@id`)**, held on the view's shadow. Its layer would be constant, holding
  **stable cells** for `container` and `parentTemplate`. On re-render, the renderer `set`s the new element and
  template into those cells instead of building a new record.
  - A changed element or an edited template still reaches the child through those cells, and only its view patches.
  - An unchanged slot then pushes nothing new, so the child doesn't turn over.
- **A guard in `fluid.pushPotentia`:** if every incoming record is identical to the existing record of the same type
  and name, and the layer names are unchanged, don't `set` the potentia at all. It's cheap and benefits every caller
  that reuses records, including this one once its record is cached.
- **Withdraw only when a slot is really gone.** Push the empty template record only if a slot isn't reclaimed in the
  same render. A dispose immediately followed by a re-allocation then wouldn't re-push the slot twice.
- **Give the template record a `mergeRecordName`,** e.g. that of the rendering view. Contributions are then
  attributable and comparable.

Even with all of these, the root's own turnover on the `revealed` upgrade would remain, along with its view's `vTree`
recomputation (about 10 ms). But neither would spread below the root, which should remove most of the 674 ms. This is
to be confirmed by re-running the same trace and counting `computeInstance` and `renderView` runs after the reveal.

## Implementation: stable slot records and the `pushPotentia` guard

The stable slot records and the `pushPotentia` guard are implemented in Infusion 6, and they remove the cascade. On
Saanich's story, the 0.9 s after the reveal now takes 43 ms instead of 639 ms, with nothing below the root rebuilt.

### What changed

- **`fluid.pushPotentia` (`FluidIL.js`) no longer sets the potentia when it would be equal.** Equal means each
  resulting merge record matches the existing one at the same position, with the same type, name, priority and the
  identical layer. The layer names must also be the same, and any iteration variables shallowly equal. Comparing
  records by contents rather than by object covers callers that wrap unchanged layers in fresh records, as
  `pushSubcomponentPotentia` does. The new helpers are `fluid.isSamePotentia` and `fluid.shallowEquals`.
- **Each `@id` slot now keeps the same template record across re-renders (`FluidView.js`).** The new
  `fluid.templateSlotRecord` holds one record per (scope component, `@id`) on the shadow, with a fixed layer and two
  cells:
  - `container` relays the element of the slot's current vnode, and is re-pointed at each new one;
  - `parentTemplate` holds the slot's markup, and is `set` only when that markup changes. The new `fluid.vTreeEquals`
    decides that.

  So a re-render that leaves a slot unchanged pushes the identical record, the guard drops it, and the child keeps its
  instance. A change to the element or the markup reaches the child through those cells, and only its view updates.
- **No double push:** the empty-record disposal suspected earlier never runs (`vnode.renderEffects` is never
  disposed), so there was nothing to fix there.
- **Not done:** the `mergeRecordName` on template records suggested earlier was not added. It isn't needed for the fix
  and could affect how records are named in diagnostics.

### Test

A new FluidView test, "Children designated by @id do not turn over when their parent rerenders its template":

- A parent with two `@id` children turns over on a first write to one of its members.
- Both children and their views keep their instances, and their DOM nodes are untouched.
- When the markup inside one slot changes, the new markup still renders, while the other child still doesn't turn
  over.
- With the guard disabled the test fails, at "The inner child did not turn over", so it does exercise the fix.

### Measured on Saanich's story

Served with the checkout Infusion and the current bagatelle client code, CPU slowed 4×. Same root, guard on against
guard disabled, over the 0.9 s after the root's `revealed` upgrade:

| | Guard disabled | With the fix |
|---|---|---|
| Self-time | 639 ms (5,417 updates) | **43 ms** (1,144 updates) |
| Components rebuilt (`computeInstance`) | 45 | **1** (the root) |
| `renderView` | 399 ms ×82 | **4 ms ×2** |
| `checklist.tree.view` re-render | 345 ms | **none** |

The reveal itself also came about 1.3 s earlier with the fix (8.4 s against 9.7 s). That's from a single run each, so
it is indicative only.

### Test results

- `npm test` passes 2324/2324.
- `hydrate-test`, `hydrate-roundtrip-test`, `copyout-test` and `output-documents-test` all pass.
- All 375 browser QUnit tests pass, and all 34 demo steps.
- The changed files lint clean.

The `lostPlants.cards` and root `revealed` upgrades still re-merge their own component, but that cost is now small.
Pre-creating live cells is no longer needed for performance, and the scope-tick gating and `equiv` work can be decided
on their merits.
