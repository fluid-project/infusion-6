# Why a chain of layer definitions is not premerged into a single layer

When we optimised the merging of layers for the ponder build, one option was to merge each chain of layer definitions
once into a single layer. Each component's own records would then be merged over that one layer. This option was
rejected. A per-key cache of members merged from the chain was implemented instead, in `fluid.mergeRootLayers` in
`src/framework/core/js/Fluid.js`.

The premerge only gives the right answer if merging is associative, that is, if merging the definitions first and the
component's records afterwards matches merging all the layers at once. Infusion's merge is not associative, and there
are two further reasons. Both failures below were reproduced against the current `fluid.mergeLayers`.

## 1. Merging is not associative

`fluid.mergeLayerKey` decides what to do at each key by looking only at the strongest value there:

- If more than one layer has the key, and the strongest value is a plain object, it merges every layer's value at that
  key.
- At the next level down, layers whose value is not a plain object are skipped (`plainLayers`).
- Otherwise the strongest value simply wins.

So a plain value in a middle layer stops a weaker object from reaching the result only when it is the strongest value
merged at that point. Grouping the layers changes which value is strongest at that point:

```js
const A = {x: {p: 1}}, B = {x: 5}, C = {x: {q: 2}};   // weakest first

merge([A, B, C])          // → {x: {p: 1, q: 2}}
merge([merge([A, B]), C]) // → {x: {q: 2}}
```

- **All at once:** C's object is the strongest value. The merge goes down into `x` and merges `{p: 1}`, `5` and
  `{q: 2}`. It skips the `5`, so A's `p` survives.
- **A and B first:** `5` is the strongest value in that step. `A⊕B` is `{x: 5}`, and `{p: 1}` is gone before C is
  merged.

In practice, A and B would be two definitions in a chain: a base layer that sets `x` to an object, and a derived layer
that overrides it with a plain value. C would be a component's own record that sets `x` to an object again. The single
premerged layer would quietly lose `p` in that case. No ponder layer is known to do this, but the semantics would
change, and nothing would report it.

Subcomponent records and IL references follow the same kind of strongest-value rule, so they would be at risk too.

## 2. Subcomponent records cannot be merged twice

`fluid.collectComponentRecords` deliberately does not merge `$component` records (the FLUID-5614 behaviour). Instead it
keeps a `fluid.componentRecords` holding one contribution per layer. Each contribution keeps its own merge-record name,
and the subcomponent later resolves them as separate merge records with their own priorities.

A premerged layer would therefore already contain a `fluid.componentRecords` object. Merging it again fails, because
that object is not the plain `{$component: {...}}` form the function expects:

```
merge([D, E]).sub.$component.contributions  → names ["L0", "L1"]
merge([merge([D]), E])                       → ASSERTION FAILED: Cannot merge value {"$component":{"contributions":[...]}} at path sub ...
```

Making this work would mean teaching the merge to splice contribution lists. Even then, every contribution from the
definitions would be attributed to the premerged layer, not to the definition that wrote it.

## 3. Provenance and the record of merged material would change

- **Provenance:** the layer map records the merge-record name of the winning layer at every path (`$m.source`). Error
  messages, layer-provenance tooling and the AI layers' provenance work all read it. With a premerged layer, every value
  from the definitions would be attributed to that one layer. Getting the real names back would mean keeping a second
  layer map alongside it, which is effectively the per-key cache that was implemented.
- **Merged material:** each merged object records the material it was merged from (`$m.contributions`), and
  `fluid.isSameSignalRecord` compares it to recognise a fresh merge of the same material as equivalent. Over a premerged
  layer, that list would be `[premerged, own]` where the current merge gives `[def1, def2, …, own]`. After a
  redefinition or a change of live layers, the equality check could then fail and recreate signals that are currently
  kept.

## Why the per-key cache avoids all of this

The cache in `fluid.mergeRootLayers` never changes how layers are grouped. A member is shared only if none of the
component's own records touch it. In that case, merging all the layers at that key is exactly the same work as merging
only the definitions: the same layers and merge-record names, in the same order. The cached result is that same
computation done once, not a regrouping.

The cache also keeps everything above:

- each definition's own merge-record name, both in subcomponent contributions and in the provenance copied into each
  component's layer map;
- the record of merged material;
- error behaviour.

Any key a component's own records touch is merged from all the layers as before, so the `A, B, C` case gives
`{p: 1, q: 2}` exactly as it would without the cache.

## Test

The test "Member of a user record merged over a chain whose definitions do not associate", in
`tests/framework-tests/core/js/FluidILTests.js`, covers this case:

- With `fluid.mergeLayers` directly, it checks that `[A, B, C]` merges to `{p: 1, q: 2}` and that `[A⊕B, C]` merges to
  `{q: 2}`.
- Through the chain cache, it uses definitions `fluid.tests.assocBase` (`shape: {p: 1}`) and `fluid.tests.assocDerived`
  (`shape: 5`). A plain instance has `shape` equal to `5`. An instance given the user record `{shape: {q: 2}}` has
  `shape` equal to `{p: 1, q: 2}`, as if all the layers were merged together.
