# `$transient`: non-reactive per-component state

A design sketch (2026-11-16) for a declared member holding state that belongs to one component instance but takes no
part in the reactive graph, and the alternatives to it. It arises from group D of
[weak-state-inventory.md](weak-state-inventory.md): state in the middle of an interaction or an asynchronous process,
currently kept in file-global `WeakMap`s.

Reading a `$transient` member creates no dependency, writing it notifies nothing, and it never upgrades a path to live,
so a write never re-merges the component.

## Configuration

The simplest form gives an initial value, which is copied for each instance:

```js
fluid.def("hortis.resizeBar", {
    $layers: "fluid.viewComponent",
    // The drag in progress, if any - no business of the reactive graph
    drag: {$transient: null},
    ...
});

hortis.resizeBar.start = function (that, bar, event) {
    that.drag = {...hortis.resizeBar.startSizes(that, bar), startPos: event.clientX};   // no remerge, no notification
};
hortis.resizeBar.move = function (that, event) {
    const drag = that.drag;          // read untracked
    if (drag) { ... }
};
```

An optional `dispose` releases what the state holds, both when the component is destroyed and when the value is
overwritten:

```js
fluid.def("saanich.timePeriodFilter", {
    // The timer applying the span once the handles have rested
    restTimer: {
        $transient: null,
        dispose: "window.clearTimeout"     // or a function; called with the outgoing value
    }
});
```

A structured scratch object can be mutated in place:

```js
fluid.def("bioreportr.lostPlants", {
    // Focus, caret, message and plant sought - kept apart from the signals so that typing doesn't redraw the gallery
    search: {$transient: {focused: false, caret: 0, message: null, sought: null}},
    // The latest card-loading run, superseding earlier ones
    run: {$transient: null}
});
// that.search.caret = 3 mutates the scratch object directly - it is handed out raw, never proxied
```

## Semantics

| Aspect | Behaviour |
|---|---|
| Read (`that.x`, or `{self}.x` in a record) | the current value, raw and untracked. Inside a `$compute`, this is almost certainly a mistake, so log a warning once per site: the computation won't re-run when the value changes |
| Write (`that.x = v`) | stored directly. It makes no live-layer upgrade, sends no notification and records nothing in the history. Any `dispose` is called on the outgoing value |
| Mutating in place (`that.x.y = v`) | allowed: the value is handed out unproxied |
| Turnover | **kept**. The holder belongs to the shadow, as the live layer does, so a re-merge doesn't lose an in-progress drag |
| Destruction | `dispose` is called on the current value, then the holder is dropped |
| Layer redefinition | the value is kept. The initial value is taken from the record only when the holder is first created |
| History, undo, hydration | excluded: it isn't serialised, isn't restored and isn't rendered |
| Merging | a stronger layer may replace `$transient` with a plain value, or the reverse. The strongest definition wins, as for `$reactiveRoot` |

## How the existing sites would look

| Current site | With `$transient` |
|---|---|
| `hortis.resizeBar.drags` (keyed by element) | `drag: {$transient: null}` on the bar component |
| `hortis.mfShell.presses` (keyed by grip element) | `press: {$transient: null}` on the shell |
| `saanich.timePeriodFilter.timers` | `restTimer: {$transient: null, dispose: "window.clearTimeout"}` |
| `bioreportr.traces.states` | `playback: {$transient: null}`, set when the timeline is created |
| `bioreportr.lostPlants.searches` | `search: {$transient: {...}}` |
| `bioreportr.lostPlants.runs` | `run: {$transient: null}` |
| `bioreportr.storyPage.keepRecord` | `keepRecord: {$transient: null}`, though see alternative 5 below |
| `bioreportr.storyPage.keepTaxon` | `keepTaxon: {$transient: false}`, likewise |

The two element-keyed maps become plain component members, keyed by the owning component rather than by an element.

## Implementation sketch

About 60–80 lines, plus documentation, in `FluidIL.js`:

1. **A record type.** `$transient` becomes an element type that `fluid.expandElement` recognises. Its handler produces
   a **holder**, `{value, dispose}`, mounted through `fluid.mountSignalRecord`. That reuses the old product when the
   record is the same, so the holder survives turnover with no new mechanism.
2. **The proxy's get handler.** If the member's `shadowMap` record marks it as a holder, return `holder.value`
   untracked, without going through `getForComponent` or `$sitedRef`. The same applies to reference resolution
   (`fetchContextReference`), which should also warn when the read happens inside a computation.
3. **The proxy's set handler and `fluid.setForComponent`.** Check for a holder before `fluid.pathToLive`. If there is
   one, call `dispose` on the outgoing value and store the new one. Writes to deeper paths (`that.x.y = v`) never
   reach here, because the value is raw.
4. **Disposal.** When the component is destroyed, call `dispose` on each holder's value. `fluid.disposeLayerEffects` or
   the destroy path in `computeInstance` would do this.
5. **Merging.** Treat `{$transient: …}` like other element records in `mergeLayerRecords`: replaced whole, never merged
   member by member.
6. **Tests:**
   - a value survives turnover;
   - a write doesn't notify or re-merge;
   - `dispose` runs on overwrite and on destruction;
   - a read inside `$compute` warns;
   - a nested mutation works;
   - layer redefinition keeps the value.

## Alternatives

**1. A per-component scratch context, `{$scratch}`.**

- A context name resolving to one plain object per component, held on the shadow and passed as an argument:
  `"$method:hortis.resizeBar.start({self}, {$scratch}, {0})"`.
- *For:* no new member type, and tiny to implement (about 20 lines in `fluid.resolveContext`).
- *Against:* the state is undeclared, so editors and diagnostics can't see what a component holds. Every layer shares
  one namespace, so two mixins can collide. There's no `dispose`.

**2. A framework-owned registry with no configuration, `fluid.transientState(that, key)`.**

- It returns a per-component `Map`, dropped on destruction, with optional `fluid.onDestroy(that, fn)` for cleanup.
- *For:* the smallest change to the sites. It's essentially today's `WeakMap`s moved into Infusion and tied to the
  component's lifecycle.
- *Against:* still invisible in configuration. It removes the smell only nominally: the state is still kept off to the
  side.

**3. State local to an effect.**

- An `$effect` record option such as `state: {}` gives the effect function a persistent object, like a ref that
  survives the effect's re-runs.
- *Good for* state used by a single effect: `traces.states` (the playback is driven by one effect) and the debounce
  timer.
- *Not for* state shared between several DOM handlers, such as the resize drag's start, move and end, or the search
  box's focus and caret.

**4. Purpose-built options instead of general state.**

- `debounce: 400` on an `$effect` (or `$method`) covers `timePeriodFilter.timers` outright, and the timer disappears
  from user code.
- A cancellable "latest run" helper for asynchronous loads would cover `lostPlants.runs`: each new run aborts or
  ignores earlier ones. It could be `fluid.latest(...)`, or an `AbortController` held by the framework.
- *For:* each one says what is meant.
- *Against:* it covers only those patterns, and the drag, press, search and playback state still need somewhere to
  live.

**5. Intent carried with the action (`keepRecord`, `keepTaxon`).**

- These are one-shot flags left by one action for another effect to find. The cleaner design passes the intent with
  the navigation itself, e.g. `storyPage.showPane(key, {keepRecord: id, keepTaxon: true})`. The clearing effect then
  reads it from the transition rather than from a side table.
- *For:* no state at all, and the cause and its effect sit together.
- *Against:* it's an application-level change to the navigation API.

**6. Reactive state with care, i.e. a `$reactiveRoot` member written untracked.**

- *Against:* every write still notifies readers and may upgrade a path to live and re-merge. That's exactly what these
  sites avoid ("so that typing doesn't draw the gallery afresh"). Not viable for high-frequency interaction state.

## Recommendation

**`$transient` as the general mechanism, plus two targeted pieces.**

- **`$transient`** covers drags, presses, playback, search and runs. It's declared, visible to tooling, has a
  lifecycle and survives turnover.
- **`debounce` on `$effect`** removes the timer pattern, which is common enough to name.
- **Intent carried with navigation** for `keepRecord` and `keepTaxon`, done in bioReportR rather than in Infusion.

`{$scratch}` is the cheapest option, but it reproduces the current lack of declaration. Effect-local state is a good
companion to `$transient` rather than a substitute: it is worth adding only if `$transient` turns out to be awkward
for single-effect state.
