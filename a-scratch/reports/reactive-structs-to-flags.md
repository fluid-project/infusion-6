# Replacing traversal bookkeeping in `updateIfNecessary` with a per-cell flag

Both structures can go. A single boolean on each cell replaces them, and the result is faster than before this session, not just faster than the two-structure version. All suites still pass: node 2129/2129, Chromium 349/349, demos 34/34, bagatelle 151/151. The build has been rerun.

## What changed (`FluidSignals.js`)

- **`inProgress` → `_checking`.** A cell sets the flag on entry to `updateIfNecessary` and clears it on exit (in a `finally`). That gives constant-time membership with no allocation. An array would have been cheaper than a `Set` to create, but its membership test is a linear scan of the stack.
- **`visited` removed.** It predates this session, and its `includes` check was a linear scan for every source, so a traversal was quadratic. Once a source that has gone stale again gets re-checked, `visited` is redundant: a clean source needs no visit, and cycles are caught by the on-stack flag.
- **One test now decides recursion:** `fluid.cell.needsCheck(source)` recurses into a source only if it's not clean, not `_checking` and not mid-update. The `_trackingRecord` check stays, because `Cell.refresh` calls `update` directly, outside `updateIfNecessary`. This is close to Milo's original recursion on state alone, with a guard against cycles added.
- **`_checking` is initialised in the cell constructor,** so every cell keeps the same object shape.

```js
fluid.cell.needsCheck = function (source) {
    return source._state !== CacheClean && !source._checking && !source._trackingRecord;
};
```

## Benchmark

Two runs agreed to within a few percent; figures are ms per update.

| Graph | Pre-session (`visited` array) | Two structures (previous version) | Per-cell flag |
|---|---|---|---|
| Fan-in: 2000 sources into one sink | 5.5 | 6.2 | 3.5–4.1 |
| Lattice: 12 layers × 25, fully connected | 2.3–2.4 | 3.7 | 2.05 |
| Chain of 1500 | 2.5 | 3.0 | 2.2–2.3 |

The two-structure version had made traversal 15–60% slower than the pre-session code. The flag is 10–35% faster than the pre-session code and roughly 25–45% faster than the two-structure version.

## Still holds

- **The new traversal regression test passes.** It still fails without the repeat pass.
- **The full-untracked dispatch case:** temporarily swapping in the method dispatch that resolves arguments untracked still passes all 34 demo steps. That's the case that motivated the repeat pass.
- **The self-echo experiment report stays accurate.** It describes the fix as repeating the pass while a source has gone stale and isn't on the traversal stack, and the flag is how "on the stack" is now represented.
