# Options targeted at an injected site refine its target

**Built 2026-11-20**, with any reach, and refinements ordered by the paths of their injecting sites: `fluid.collectComponentRecords`
and `fluid.refinedReferenceRecord` (Fluid.js); `fluid.refinedReferenceExpanderRecord`, `fluid.globaliseRefinement`,
`fluid.distributeRefinements`, `fluid.retractRefinements`, `fluid.distributedMergeRecords` and the shadow's
`distributedMergeRecords` cell (FluidIL.js); tests 1-6 below in FluidILTests.js ("Options targeted at an injected site ...").
`fluid.tldraw.hostPotentiaFor` now always targets `view`, and `writeShapeConfig` writes at that one path, moving any
configuration persisted at the subcomponent lending a view. Test 7 is "Options refining a borrowed view transmitted and
reconstructed" in FluidPTFTests.js, and a creator function's `container` refining a borrowed view is tested in
FluidViewTests.js. The rule is documented in ponder's content/docs/fluid-integration-language.md, under "Refining an
injected component", with the `distribution` precedence in "Merging and precedence".

A sketch of how Infusion 6 can treat merging into an injected site as merging into the component injected there -
the facility intended for Infusion 4's distributions. Motivated by `fluid.tldraw.hostPotentiaFor`, which steers a
host's potentia past a borrowed view (`view: "{first}.view"`) by matching reference strings with regexes and reading
merge internals.

## The principle

A member holding a reference to a component is an *injected site*: the component appears there, as if constructed
there. Reads at the site already read the target, and writes at the site already write the target ("follow the fish
upstream"). Merging is the one operation which does not: a stronger `$component` record at the site displaces the
reference, and constructs an empty component in its place. The rule proposed:

> A contribution at an injected site which is a `$component` record **naming no `$layers`** *refines* the component
> injected there - it is merged into that component, rather than displacing the reference. A record naming `$layers`
> constructs a fresh component, displacing the reference, as now.

This is the rule which already governs plain subcomponents: a stronger `$component` record without `$layers`
accumulates onto the subcomponent which weaker records define (`fluid.pushSubcomponentPotentia` unions their layers),
and one with `$layers` names what is to be constructed. So the host's `view: {$component: {container}}` means the same
thing whether the view is constructed at the site or injected there - and `fluid.upgradeFreeComponentArgs`'s
forwarding of `container`, the standard argument, simply works for a widget whose view is borrowed.

## Where it is built

### 1. Merging - `fluid.collectComponentRecords` (Fluid.js)

Today a record stronger than a reference sets `reference = undefined`, discarding it. Instead, a record without
`$layers` following a reference is kept as a *refinement* of it: the reference stays the strongest value at the path,
and the refinements travel beside it in the layer map, at `[...segs, key, $m, "refinements"]` - the channel through which
`fluid.referenceFallback` already passes the weaker material a reference overrides. A later reference discards them, as
it discards any weaker contribution; a later record naming `$layers` discards the reference and its refinements, as now.

Whether the reference designates a component can't be known at merge time - this is why the reference simply overrides
everything today - so the decision to refine is the merge's, by the shape of the record, and its effect is the
expansion's, once the reference resolves.

### 2. Expansion - `fluid.expandReferenceRecord` (FluidIL.js)

The member reference already builds an `InjectionRecord` and an *injector* effect which registers the target with its
new parent (`fluid.registerInjectedComponent`) and withdraws it (`fluid.withdrawInjectedComponent`). It reads the
refinements from the layer map, as `fluid.expandFallbackReference` reads the fallback, and holds them on the injection.
Registering the target also *distributes* the refinements to it; withdrawing - the reference retargeting, or the
injecting component destroyed - retracts them. A reference resolving to something other than a component, with
refinements, is unavailable: "options at path ... cannot refine ..., which is not a component".

### 3. The target's merge - FluidIL.js, where `allMergeRecords` is formed (~3440)

Each shadow gains a cell of the merge records distributed to it, keyed by the path of the injecting site:

    const allMergeRecords = [...mergeRecords, ...Object.values(shadow.distributedMergeRecords.get()), dynamicMergeRecord];

Each is `{mergeRecordType: "distribution", mergeRecordName: "distribution from <injecting path>", layer}`, at the
reserved priority of `fluid.mergeRecordTypes.distribution` (300): stronger than the target's own definition, its
parent's subcomponent records and its own user potentia, and weaker than template entries, dynamic layers and live writes -
where Infusion 4 placed distributions. Several injecting sites distribute in a deterministic order, e.g. by path, with
names which say where each came from in a layer map. The merge reads the cell, so the target remerges as refinements
come and go, and turnover of the target is the usual turnover.

### 4. The subtle part - the scope of references within a refinement

A refinement is written at the injecting site, so a reference within it - e.g. `{umbrella}.selection` - must resolve as
it would there, not from the target, whose scope may hold no `umbrella`, or a different one. Before distributing, the
contextual references within a refinement are rendered as global references from the injecting site, as `$for` already
does for `valueAs` ("express a sited value as a global reference to it so that it stays live") - a rewrite of the
record's IL references against the injecting shadow's scope. `{self}` within the record designates the target, as it
does within any `$component` record. This also keeps the distributed record meaningful in a layer map, a trace and PTF.

## Semantics to settle

- **Sharing.** The target is one component, wherever it appears: a refinement through one site is seen through every
  site, and at the target's own. This is the principle's consequence, and is what borrowing a view means - but it makes a
  refinement an act on a component owned elsewhere. Should a site be able to refine only a target beneath the same
  widget, or any? Infusion 4 allowed distributions only downward; a reference may reach sideways or upward.
- **Conflicts** between sites refining the same member are settled by their order - is order by path adequate, or
  should a refinement carry a priority as distributions did?
- **`$layers` in a refinement.** Excluded above, to keep the replace/refine distinction syntactic. Distributing layers
  (Infusion 4's `distributeOptions` with `record` of grades) could later be an explicit `$refine: true` record.
- **Removal.** `null` at an injected site still removes it, refinements and all.
- **PTF.** The injecting component's potentia, e.g. a host's container at the root, stay where they were written, and
  are reapplied as refinements on reconstruction - nothing is written into the target's own parts.

## What it retires

`fluid.tldraw.hostPotentiaFor` and its regexes become `{view: {$component: {container, shapeId, shape}}}`, for every
widget; `fluid.tldraw.writeShapeConfig` edits one fixed path. No special context such as `{hosting}` is needed.

## Tests (FluidILTests)

1. A record without `$layers` at an injected site reaches the target - `umbrella.view: "{first}.view"` with potentia
   `view.$component.container`, rendered into by `first.view`.
2. A record naming `$layers` still displaces the reference.
3. Retargeting the reference, or destroying the injecting component, retracts the refinement, and the target remerges.
4. A reference within a refinement resolves in the injecting site's scope.
5. Two sites refining one target, in a deterministic order; a refinement against the target's own user potentia and its
   live writes, at the distribution priority.
6. A reference with refinements resolving to a non-component is unavailable, and diagnosed.
7. A PTF round trip of an umbrella whose borrowed view is refined.
