# Options for structural lenses, second version

This revises [options-for-structural-lenses.md](options-for-structural-lenses.md) in the light of the trajectory set out in `a-scratch/chats/fds.md`, from "Could there even be some route to doing without "public zebras"" onwards. That trajectory has three parts:
- a component's data held as plain JSON, written through one write gateway;
- reactivity kept in side records (the shadowMap and its siblings), keyed by address;
- nodes of several kinds, with multi-edge cells a rare kind of their own.

Part 1 is the assessment that prompted this version. Part 2 restates the three views of the first report (`FluidSignals.js`, the IL, `hortis.elevationFilter`) for the revised design. Part 3 takes up a case Part 1 passed over: one piece of state synced to several stores at once. That case corrects one of Part 1's claims.

---

## Part 1. Assessment

Option A can credibly be the beginning of that rework, but only its contract, not the implementation I sketched in the report. Option B would make the rewrite harder, because it is itself the pattern you want to remove. This partly revises the report's recommendation.

### Option B builds public zebras

A cell record is exactly a "public zebra": a record whose members are cells, with values inside them. To make it usable it needs:
- a new kind of reactive root;
- references that stop partway at a member cell;
- writes that tell a whole-record write from a member write;
- a proxy that presents cells as plain members.

All of that is the machinery the fds chat wants gone. B looks gentler only in `FluidSignals.js`. At the IL level it spreads the zebra into reference resolution, writes and proxies, and every piece would have to be taken out again in a rewrite.

### Option A's meaning matches the trajectory

A path edge means "this relation owns the value at address P in some data; writing it preserves the siblings; an asynchronous result lands against the data as it then stands." That is the write gateway from the chat almost word for word: mutate at P, and leave everything else alone.

Each part of option A has a counterpart in the side-table design:

| Option A in the report | The side-table design in the chat |
|---|---|
| `applyAtPath` with `setImmutable` | Mutate in place at P and bump P's revisions. The contract is the same; only the clone-to-root goes. |
| Path edges kept beside the whole-value edge | Several writers, each owning a different address within one plain structure. |
| Path-aware `markStale` (the optional refinement) | The own and subtree revisions: a reader of `hash.elevation` depends on own at that path, `pushState` on subtree at `hash`. |
| A computed final segment in the source (`hash.{self}.urlKey`) | A sited reference reduced to a path plus a revision lookup. |
| `fluid.siteEdgeKey` | Nodes identified by their address (Nominal Adapton, Salsa's tracked structs). The relation's identity is where it was declared, so it needs no object until something refers to it. |

So the abstraction A introduces, a relation targeting an address within plain data, outlives the cell representation. That is what makes it a credible first step.

### But the report puts A's implementation in the wrong place

The report places path edges inside `fluid.cell`'s multi-edge machinery: a new rule in `findDirtyEdge` for choosing edges, an `update` that loops over several edges, and fits that track paths. In the chat you said that machinery is "hugely wasteful": thousands of `_inEdges` arrays with one entry and perhaps none that validly has more. The suggested order of work was to move multi-edge support out into a rare node kind. The report would make that machinery more complicated, and make the hash cell the system's first heavy user of it.

The cleaner version of A doesn't put the backward arc in the cell graph at all. It becomes a declared writer at an address:
- recorded in the side table under its site key;
- scheduled like any computation, carrying the provenance of what it read;
- committing through the write gateway at its path.

Today's `putThroughLens` is already most of this. It reads the lens's value, applies `backward`, and writes at the source's terminal site through `setForComponent`. It is a sanctioned write from a computation into owned state, the "blessed cod reactivity" of the chat. Measured against the chat's protocol, it lacks only three things:
1. **Staging:** the write should be queued for the scheduler rather than applied inline.
2. **Reads:** it should record what it read, so that a missed wake can be detected.
3. **Identity:** it should be registered by its address, which `fluid.siteEdgeKey` now provides.

The forward arc is then an ordinary single-updater reader of `hash.elevation`.

The echo the fits were preventing is handled by provenance: the backward write carries its source, as `excludeSource` already does for `pushState`. No cell needs two in-edges, so this relation needs no bidirectional node kind at all. That suggests even your rare bidirectional cases may often be a pair of address writers rather than a multi-edge cell.

### How I'd revise the plan

- **Keep A's contract:**
  - a relation targets an address within plain data;
  - a delete result to remove a member;
  - async results applied against the data as it then stands;
  - a computed final segment in the source;
  - backward arcs that receive only their own slot, so `encode` loses the hash argument.
- **Implement it beside the cell graph, not in it.**
  - Lens expansion registers the backward arc as an address writer under its site key, which reuses `attachSiteEdge`'s bookkeeping.
  - The writer commits through `setForComponent`.
  - `findDirtyEdge` and the fits stay untouched, ready to be moved out later.
- **Use it as the protocol's first test.** It needs to answer "what's your key?", "what did you read?" and "who must be woken?" (readers of `hash` and its subtree). This is the step the chat's order of work calls "convert one subsystem to address-keyed nodes and see whether the bookkeeping disappears or just moves". It is a small, contained relation where that can be measured.
- **The one real gap is "who read me?".** While `hash` remains a cell, a write at `hash.elevation` replaces the whole cell value and wakes every reader of it. That is coarse but correct, and it is the "revision per region" minimum the chat names. Fine-grained own revisions arrive only when the data under `hash` becomes plain, mutated in place with the revisions kept beside it. That step needs no change to the lens contract, which is the sense in which A is a beginning rather than a dead end.

**One caution from the chat:** path keying is unstable for array members (the `$for` index problem). A site key such as `…elevationFilter:filterState` is stable because it is a component path, and hash members are named keys. But a lens targeting an element of a list would need the identity anchor plus relative path from the chat, e.g. `todos#t42.selection`, not a positional path. Option A's contract should name its target in that form from the start, even if only named keys are supported at first.

---

## Part 2. The revised design in three views

### i) FluidSignals.js

**Almost nothing changes, which is the point.**

- **None of the first report's option A changes are needed:**
  - no `path` field on edges;
  - no new rule in `findDirtyEdge`;
  - no loop over several edges in `update`;
  - no path-aware fits.
- **Explicit edge keys and the duplicate-edge fix stay.** `fluid.cell.edgeKey` and the fix to `computed` are correct whatever happens, and keys remain useful for any cell that does keep several in-edges.
- **Echo suppression uses what exists.** A writer commits inside `fluid.cell.withAmbientSource(key, ...)`, as the hash manager's listener does. Readers that must not see their own writes come back declare `excludeSource`. The fit then carries the provenance, rather than a fit recording a traversal of an edge.
- **A fit could start before the write.** `fluid.cell.prototype.set` starts a fit only when there is a source marker to carry. An address writer always has one, its key, so every lens write begins a fit. That is cheap. It also turns the fit into the record of "which writer started this change", which the analysis described in the chat needs anyway.
- **Later, with fully deferred stabilisation (FDS),** the writer's commit becomes a staged write queued for the next stratum, rather than an inline `set`. That change lives in the scheduler, not in cells, and needs no change to the lens contract.

The real work is elsewhere: in the IL, and in the side records.

### ii) The integration language

**Syntax stays as it is:**

```js
range: {$lens: {source: "{elevationFilter}.filterState", forward: "...", backward: "..."}}
```

**Expansion.** `fluid.expandLensRecord` produces two things:

- **Forward:** a computed cell at the lens's site, reading the source, as today.
- **Backward:** an **address writer**, registered in the component's side records under `fluid.siteEdgeKey(shadow, segs)`. It generalises `fluid.attachSiteEdge`, which records an edge on another cell, into a record held only by its owner:

```js
/**
 * @typedef {Object} AddressWriter
 * @property {String} key - The site key of the writer, e.g. "bcba-6.elevationFacet.body.elevationFilter:filterState"
 * @property {Function} target - Resolves the address written: the shadow and path of the source's terminal site,
 * resolved afresh on each write, so that a target which turns over is followed - see fluid.terminalSiteOf
 * @property {Function} backward - Maps the value written at the lens to the value for the target address alone
 * @property {Object[]} [reads] - What the last write read, recorded for provenance
 */
```

**A write at the lens site** is still caught in `fluid.setForComponent` (`fluid.findLensSite`). The writer then:

1. applies the write to the lens's value (`setImmutable` today, in place later);
2. passes the result through `backward`, which returns only the value for the target address;
3. commits it through `fluid.setForComponent` at the target address, inside `withAmbientSource(key)`.

This is `putThroughLens` with three changes:
- **Register it by key.** The writer is a record in `shadow.frameworkEffects` (or its successor), not a property of the lens cell. It is replaced when the site turns over and removed with its component, by the same bookkeeping as `attachSiteEdge`.
- **Record what it read:** the lens value and the target's current value. That makes it a participant in the chat's protocol rather than an invisible write.
- **Write at the target's path, not its root.** `backward` no longer merges into the whole hash; the gateway preserves the siblings.

**The gateway's new duty: deletion.** `setForComponent` with `fluid.deleteMarker` (or a declared convention for `undefined`) removes the member at the path from the live layer. That is how `hash.elevation` leaves the URL when the slider returns to the full range.

**The source names a path, with a computed segment.** The linkage's layer becomes:

```js
fluid.def("hortis.urlMappedFilter.linked", {
    filterState: {$lens: {
        source: "{hashManager}.hash.{self}.urlKey",
        forward: "hortis.urlMappedFilter.decode({0}, {self}.urlCodec)",
        backward: "hortis.urlMappedFilter.encode({0}, {self}.urlCodec)"
    }}
});
```

That needs either a computed segment in context references, or a `path` member in the lens record. The target is then addressed as anchor plus relative path: the hash manager's `hash` site, then `elevation`. That is the identity-anchored form the chat proposes for list members, so it extends to them later.

**What goes:**
- `fluid.terminalSiteOf` stops running on every write and is used only to resolve a writer's target. It goes entirely once sited references reduce to a path plus a revision.
- `isMatForming`'s lens special case stays for as long as lens sites are caught through the proxy.

### iii) From the point of view of elevationFilter

**The SFC is unchanged:** `filterState: null`, with the slider's `range` a `$lens` over it.

**What happens:**

- **The slider writes `range`.** Its writer, keyed by `…dualRangeInput:range`, writes `filterState` through the gateway.
- **With a hash manager,** `filterState` is itself a lens. Its writer, keyed by `…elevationFilter:filterState`, writes `"lower,upper"` at `hash.elevation`, leaving `bees` and `sex` alone.
- **Back navigation** sets `hash` from the listener. The forward computeds carry the value to `filterState` and then to `range`.
- **`encode`** shrinks to `codec.encode(state)` and returns the delete marker at the full range.
- **Debugging:** no cell in the chain holds more than one in-edge. The relations are visible as writer records, each keyed by its site, with what it last read, rather than as edges on the hash cell.

---

## Part 3. Star shapes: one state, many stores

### The case

Suppose the design, with a wider scope of state, is also stored in an Automerge document alongside the URL. Then `elevationFilter.filterState` is synced with:

1. the slider's `range`: a view, with no persistence;
2. the URL's `hash.elevation`: one store;
3. an Automerge document at, say, `doc.filters.elevation`: a second store.

It could be any number of further stores: local storage, a server session, a collaborator's cursor.

**The essential shape.** We want `filterState`'s own definition to stay as plain as possible, `filterState: null`, while an open-ended set of schemes competes to sync with it. The state is the hub of a star, and each scheme is a spoke. Each spoke has an inward arc (store to state) and an outward arc (state to store). So the hub has a growing set of incoming writers. That contradicts Part 1's "no cell needs two in-edges".

### What Part 1 got right, and what it got wrong

The lens chain of Part 2 is a line: slider, state, URL. Each node has one upstream definition, and only the writers go against the grain. A star is different. The hub has no single upstream. Each store is as entitled to define the state as any other, and the one that changed most recently should prevail.

That is what the multi-edge cell was built for. `fluid.cell.findDirtyEdge` gives an edge score 2 when its source is the one the cell was dirtied from (`_dirtyFrom`). That makes the cell a **last-writer-wins register** across its in-edges, and the fits stop a write from echoing back along the arc it came in by.

So the original reasoning, that user bidirectionality and substrate cycles call for one shared mechanism, wasn't mistaken about the need. It was mistaken about where the need occurs and how it should be represented:

| | Computed cell | Hub of a star |
|---|---|---|
| Value | Derived: some function of sources | Held: plain state, written by whoever changed last |
| In-edges | One updater, almost always | Many writers, open-ended |
| Choosing among in-edges | Not a question | The register's policy: last writer wins, with priorities at boot |
| Echo | Not a question | Provenance: don't send a write back to the store it came from |

The thousands of one-entry `_inEdges` arrays are computed cells paying for a capability that only hubs need. **The corrected claim: no *computed* cell needs two in-edges, and state hubs need many writers.**

### Why the hub fits the plain-data trajectory better than cells do

A hub is plain state, which is exactly what the trajectory keeps as plain JSON. Its writers and readers don't need to be edges on the hub at all:

- **Inward arc of a spoke:** a writer at the hub's address, like the lens writer in Part 2. It is triggered when the store changes (URL listener, Automerge change event) and commits through the gateway with its spoke's key as provenance.
- **Outward arc:** a reader of the hub's address, an effect, which writes into its store. It declares `excludeSource` on its own spoke's key, so a value that arrived from the URL isn't written back to the URL. But it still flows out to Automerge and on to the slider.

The hub then holds:
- no in-edge list, because writers are recorded in their owners' side records under their site keys;
- no observer list beyond what any address has, because readers depend on its revision.

"A growing set of in-edges" becomes "a growing set of registered writers to one address", and the write gateway accommodates any number of those with no bookkeeping on the hub. The register semantics (last write wins) fall out of the gateway: the value at the address is whatever was last committed. **So the star shape is evidence for the trajectory, not against it:** the one structure that needs many writers is the one where cells are least needed.

What is left is policy, which has to be stated, not discovered.

### The policy a hub needs

1. **Precedence at boot.** On load, the URL has a value, the Automerge document has another, and the slider has its default. Which wins?
   - The settled-cell rule ("trust the existing value") answers by accident of attachment order.
   - Instead, each spoke should declare a role:
     - **authority:** the store's value wins at boot (the URL, for a shared link);
     - **follower:** the store adopts the hub's value at boot;
     - **view:** no persistence at all (the slider).
   - Several authorities need a rank, e.g. URL above document above local storage. The rank says that a link someone sent should override what their document last held.
2. **Simultaneous writes.** Two stores can change in one stabilisation, e.g. a remote Automerge change arriving during a back navigation.
   - Under inline commit, the later write simply wins. That is arbitrary but harmless.
   - Under fully deferred stabilisation, writes are staged per stratum, so two writes to one address in one stratum are *visible as a conflict*. The register resolves them by rank and can report the loser. This is the "late-scheduling glitches" the chat mentions, turned into something the scheduler can see.
3. **Asynchronous arrival.** The Automerge document may load after the page has booted and the URL has set the state.
   - Does the late value override the URL? By the authority rank, no. The spoke must then write the hub's value into the document instead, acting as a follower once it has lost.
   - This is risk 6 of the chat: a pending value must be stamped with the coordinate it was produced at, so that a late arrival is recognised as the completion of a boot-time read, not a fresh change.
4. **Fan-out policy.** Should a back navigation write the restored range into the shared document? Through the hub, a URL change reaches every other spoke. That is right for a mirror and wrong for a document shared with others, where browsing history shouldn't leak into collaborators' state.
   - A spoke needs to declare which origins it accepts: e.g. "user writes only" (the slider, or a reset) rather than "any".
   - Provenance makes this a filter on the outward effect's `excludeSource`/`includeSource`, which `fluid.cell.update` already supports.
5. **Stores with their own merging.** Automerge resolves concurrent edits between collaborators by its own merge rules. The hub doesn't, and shouldn't, model that: the spoke delivers the document's merged result as one write. The hub's last-writer-wins applies only between stores, not within one.

### How the spokes are declared

Today a spoke is a `$lens` laid at the hub's site by a linkage (`hortis.urlMappedFilter.linked`). That doesn't scale to a star:
- a second linkage laying another `$lens` at `filterState` would conflict in the merge;
- the stronger layer would win;
- the URL spoke would disappear.

That is the non-associative merging problem of `non-associative-merging.md`, and here it would be silent.

So spokes have to *accumulate* at the hub's site rather than compete there. Two forms fit the trajectory:

- **Declared at the hub as a collection,** e.g. a `$sync` member whose contributions from several layers are kept side by side, each keyed by its contributing layer:

  ```js
  fluid.def("hortis.urlMappedFilter.linked", {
      filterState: {$sync: {url: {store: "{hashManager}.hash.{self}.urlKey", role: "authority", rank: 10,
          inward: "hortis.urlMappedFilter.decode({0}, {self}.urlCodec)",
          outward: "hortis.urlMappedFilter.encode({0}, {self}.urlCodec)"}}}
  });
  fluid.def("hortis.documentMappedFilter.linked", {
      filterState: {$sync: {document: {store: "{designDocument}.doc.filters.{self}.urlKey", role: "authority", rank: 5,
          accepts: "user", inward: "...", outward: "..."}}}
  });
  ```

  The keys within `$sync` (`url`, `document`) merge like any plain record, so the spokes coexist. `filterState` itself stays `null` in the filter's own definition.
- **Declared at the store,** with the store's component naming the hubs it mirrors. That keeps hubs entirely unaware, but scatters a hub's spokes across the tree, which makes the boot precedence harder to see in one place.

The first form is better: the hub's site is where policy has to be resolved, and it gathers that policy in one place while the hub's own definition stays plain.

**The slider is a view spoke too.** It is the existing `range` lens, seen from the hub: role `view`, no rank, accepting all origins. The single `$lens` at a non-hub site stays as the degenerate case: a hub with one spoke, which is a line.

### What this means for the trajectory

1. **The protocol table in the chat needs a fourth node kind:** the synced register.
   - Its key is its address.
   - Its value is plain state.
   - Its "updater" is a set of registered writers with a declared policy (role, rank, accepted origins).
   - Its wake list is the readers of its address, as for any address.

   It replaces the bidirectional cell as the place where "apparent bidirectionality" lives. The rare multi-edge cell becomes rarer still, perhaps needed only for genuinely computed cycles, if there are any.
2. **Provenance is required.** In a line, echo suppression is a convenience. In a star it is the whole of the semantics: which spokes a write reaches is decided entirely by where it came from. So every write through the gateway must carry its writer's key. That is the same recording that missed-wake detection and effect explanation need, so this requirement adds nothing new.
3. **Boot and asynchronous arrival are where the design will be tested.** The steady state (last writer wins, fan out except to the origin) is easy. The hard cases are the ones the chat lists as risks: pending values crossing iteration coordinates, and attachment order deciding precedence. A star with one asynchronous authority (Automerge) and one synchronous authority (the URL) is a small, realistic test bed for both.
4. **The order of work changes slightly.**
   1. Part 2's address writer for the lens line, as before.
   2. The gateway carries the writer's key as provenance on every write.
   3. `$sync` as an accumulating declaration, with roles and ranks, with the URL as its first spoke, replacing `hortis.urlMappedFilter.linked`'s `$lens`.
   4. A second spoke: local storage as a stand-in, before Automerge, since it is synchronous and has no merge rules of its own.
   5. Automerge, which brings asynchronous arrival and origin filtering for shared state.
   6. Only then, the scheduler's staging of writes per stratum, at which point simultaneous writes to a hub become reportable conflicts.

   Each step keeps `filterState: null` as the filter's whole definition of its state.

---

## Part 4. The exchange that prompted Part 3

> Write a second version of the report alongside the first one, updated for these thoughts. Start the report with a GFM formatted rendering of your last response. However also consider with respect to "No cell needs two in-edges" - imagine our current use case elaborated with a 2nd source of persistence for the elevation filter's state alongside the URL, say the design (with a wider scope for state) being stored in an AutoMerge document. It seems that a big case for "apparent bidirectionality" emerges through "star shapes" - a piece of apparently plain state such as elevationFilter.filterState, whose definition itself we want to be as plain as possible, competing to be synced to an open-ended range of persistence schemes of which the URL is just one. This then seems to position this node as something with a growing set of in-edges. What does this mean for our trajectory?

The reply, in summary:

- **It corrects Part 1.** Its claim becomes: no *computed* cell needs two in-edges, but a piece of held state at the centre of a star needs many writers. The existing multi-edge cell is already a last-writer-wins register: `findDirtyEdge` prefers the edge from the cell it was dirtied from. So the need was real; it was represented in the wrong place.
- **The star suits plain data better than cells.** Each store's inward arc is a writer at the state's address, and its outward arc is a reader that excludes writes from its own store. No list of in-edges builds up on the state.
- **What's left is policy that must be declared:**
  - which store wins at boot, by role and rank;
  - what happens when two stores change in one stabilisation;
  - an Automerge document that loads after the URL has already set the state;
  - whether a back navigation should reach a shared document.
- **The current declaration can't scale.** A second linkage laying its own `$lens` on `filterState` would lose silently in the merge. An accumulating `$sync` declaration would keep `filterState: null` as the filter's whole definition. It adds a fourth node kind to the chat's protocol table, the "synced register", and a revised order of work that tries local storage as a second store before Automerge.

---

## Part 5. Implementation of the revised contract

Step 1 of the order of work in Part 3, together with step 2 as far as lens writes go, is implemented. That covers Part 2's design for the lens line only: `$sync` and the star are not attempted.

### Infusion

**`Fluid.js`.**
- **`fluid.deleteMarker`** is new. Written at a path through `fluid.setImmutable`, it removes the member there instead of holding a value.
- **The write gateway handles deletion.** `fluid.setForComponent` writes beneath a reactive root with `setImmutable`, so it needs no change of its own.

**`FluidIL.js`.**
- **`$lens` takes an optional `path`:** a String, an Array of segments, or a reference resolving to either, e.g. `"{self}.urlKey"`.
  - **Forward:** the forward arc's `{0}` is the value at that address within the source.
  - **Backward:** the backward arc returns the value for that address alone, or the delete marker.
  - **No path:** the address is the whole source, so existing lenses are unchanged.
- **Address writers.** `fluid.expandLensRecord` registers the backward arc with the lens's component, under `fluid.siteEdgeKey` of the lens's site (`fluid.registerSiteWriter`). It is held in `shadow.siteWriters`:
  - a lens allocated afresh at the same site replaces it;
  - it is discarded with its shadow;
  - `fluid.siteWriterOf(shadow, segs)` finds it.

  It is not an edge on any cell, so `findDirtyEdge` and the fits are untouched.
- **`fluid.putThroughLens` is now the writer.** It:
  1. applies the write to the lens's value and passes it through `backward`;
  2. resolves the source's terminal site and appends the lens's address;
  3. commits through `fluid.setForComponent` inside `fluid.cell.withAmbientSource(writer.key)`, so the write carries the writer's key as its source marker;
  4. records `{lensValue, address, value}` as the writer's `lastWrite`, for explanation.
- **Not done:**
  - **Staging:** the commit is still inline, not queued for a later stratum.
  - **Reads:** the writer records its write, but not yet the set of what it read.
  - **Granularity:** a reader of the source still depends on the whole cell.

**Tests.** "A lens with a path owns only its address, and writes through its registered address writer" covers:
- viewing an address;
- writing beneath it, which leaves the store's other members as they were;
- the source marker carried by the write, seen by an effect on the store;
- `lastWrite`;
- deletion through the marker;
- a write to the store seen through the lens.

The two earlier lens tests pass unchanged: no `path`, and a backward arc that returns the whole source.

**Docs.** The `$lens` section of ponder's `fluid-integration-language.md` describes `path`, the delete marker and address writers.

### bagatelle

**`hortis.urlMappedFilter.linked`** now owns only its entry in the hash:

```js
filterState: {$lens: {
    source: "{hashManager}.hash",
    path: "{self}.urlKey",
    forward: "hortis.urlMappedFilter.decode({0}, {self}.urlCodec)",
    backward: "hortis.urlMappedFilter.encode({0}, {self}.urlCodec)"
}}
```

**The codecs** see only their own slot:
- `decode(text, urlCodec)` receives the filter's entry;
- `encode(filterState, urlCodec)` returns the entry, or `fluid.deleteMarker` for an empty state;
- the hash argument and the merge-and-delete code are gone.

Using `path` instead of a computed final segment in the reference avoids a change to context references. A computed segment remains possible later and would be equivalent.

### Verification

- **Suites:** every suite passes.

  | Suite | Result |
  |---|---|
  | Infusion | 2229/2229 |
  | copyout-test, hydrate-roundtrip-test | pass |
  | Lint, both projects | ok |
  | bagatelle QUnit | 89, 25, 49, 26 |
  | BBEA, standard and both story round trips | pass |
  | storyNavigation | pass |

- **Browser checks** on `indexBeasBCBA-6.html`:
  - **URL restore:** `#elevation:200,900&phenology:6,7&sex:female` restores all three filters (400 of 2,538 records).
  - **Writing the URL:** unchecking female removes only `sex` from the hash.
  - **Back:** Back restores it.
  - **Polygon filter:** polygons restore, redraw on Back and clear with the hash.
- **Bundle:** `dist/fluid.boot.min.js` has been rebuilt.

### What this leaves for the next steps

1. **Provenance on every gateway write,** not only lens writes. Step 2 proper: the hash manager's listener already marks its writes, but other writes through `setForComponent` carry no key.
2. **`$sync`, with roles and ranks,** with the URL as its first spoke. Its spokes are declared side by side at the hub's site, replacing the single `$lens` laid there by `hortis.urlMappedFilter.linked`.
3. **A second, synchronous spoke** (local storage), then Automerge.
4. **Staged writes and recorded reads,** once the scheduler is ready to receive them.
