Here are all the Infusion limitations found across the three draft ports (storyTime, imageGenerator and closestNoteFinder), most serious first. Only the first item has been confirmed by running code; everything after it comes from reading the framework source and from writing the untested drafts.

1. @class bug (confirmed). When two dynamic classes are true at once, they're joined with a comma, giving class="base one,two", so neither class applies. The cause is clazzSource + " " + classes in FluidView.js, where classes is an array. It needs a one-line .join(" ") fix. DONE
    * Resolved as https://github.com/fluid-project/infusion-6/issues/11
2. No way to set DOM properties. Templates can only set attributes through setAttribute. So disabled can't be switched off (any value at all disables), an input can't be cleared by setting its value, and checked can't be bound. All three widgets fall back on classes plus guards inside methods. DONE
    * Resolved by binding absence for boolean attributes and live state properties with write-back - fluid-project/infusion-6#14
3. No two-way input binding. Every input needs its own $method that copies e.target.value into state. DONE
    * Resolved - a bound value, checked, selected or open attribute writes the user's change back to a writeable model site - fluid-project/infusion-6#14
4. Changes from outside Infusion don't render by themselves. Auto-stabilization is off by default, so writes after an await, from a timer, or from a store listener have to call fluid.cell.stabilize() or deferredStabilize() by hand. Turning fluid.cell.autoStabilize() on by default would remove this class of bug. DONE
    * Resolved by making stabilize() a cancellable flush with deferred auto-stabilization on by default, plus fluid.cell.settle() and fluid.cell.waitFor() for async code - fluid-project/infusion-6#17
5. No first-class way to subscribe to an outside data source. $effect has no cleanup, and $bindable is experimental and never rebinds when its arguments change. It's also unverified whether a bindable that returns a cell lets readers see the cell's value.
    * This is something we want to do with $bindable and so should firm it up. Should clarify that $bindable is only notified on changes from available to unavailable, but it can
    bind to a signal which can stream updates for the lifetime of the $bindable. DONE
    * Resolved - verified that readers see through a bound signal and receive its updates without rebinding, and fixed the unbinder, which
    was never actually invoked - a bare `{boundValue}` argument now receives the bound signal itself so that it can be released - fluid-project/infusion-6#21
6. No adapter for tldraw's signals. tldraw's store is made of fine-grained signals, but the only available bridge copies the whole page-shapes array on every document change, including every frame of a drag. That makes every reader recompute. DONE
    * Resolved - tldraw doesn't advertise its signals individually, but any function reading them can be run in tldraw's `react`, which tracks exactly the atoms
    it read. fluid.tldraw.reactiveCell runs such a function and copies its result into an Infusion cell when it differs, held by a $bindable. A widget's own bounds
    are read from editor.getShapePageBounds and the notes from the incrementally maintained store.query.ids, so dragging an unrelated shape recomputes nothing,
    dragging a note recomputes only the note finders, and dragging one finder recomputes only that one - fluid-project/infusion-6#21
7. No standard way to inject host objects. Nothing like React's useEditor() exists. The draft adds a root-scoped {tldrawHost} component with fluid.resolveRoot, which goes against the docs' advice to avoid live JavaScript objects in configuration.
    * Misunderstanding in docs, clarified - approach in driver is the expected one
8. A component can't see its own host shape change. It receives a fixed shapeId and has to search the shared shape list for its own position. The alternative is for InfusionHost to write the shape record into the component on each React render. Either way, it should be a settled pattern.
    * See notes on $bindable, same issue as 6 and 5. DONE
    * Resolved - the shape id is supplied to the widget's view, onto which fluid.tldrawViewComponent is broadcast by a $linkage held by tldrawHost, keyed on the
    fluid.topLevelWidgetView layer which the portable fluid.topLevelWidget layer contributes. This reports the shape's bounds, which the widget receives as
    {self}.hostBounds - fluid-project/infusion-6#21
9. Conditionals exist only at the component level. Each conditionally shown block must become a $if subcomponent, and an empty outer container stays in the DOM when it's hidden.
    * Annoyance in DOM but conditionals at component level is core design principle
10. $if only tests truthiness. Conditions like x !== null need their own boolean computed member, or a value of 0 or "" hides the block. DONE
    * Resolved by long-form $if record {func, args} by analogy with $compute - fluid-project/infusion-6#13
11. No expressions in @{}. Values like total - long or a || !b have to become named $compute members backed by global functions. This is idiomatic, but verbose.
    * Is somewhat more verbose, but as designed - intermediate values should be named and exposed for integration purposes. Functions can be local arrows, as per 7.
12. SFC styles are global and unscoped, so every class name needs a manual prefix.
    * This is ok given a general policy of trying to minimally change semantics of user's expressions. We also don't want
    a heavyweight dependency on something like PostCSS to operate something like Vue's "scoped" model for SFC CSS: https://vuejs.org/api/sfc-css-features.html
13. $for reconciles the list by index on every change. For the story-time highlighting, that happens on every keystroke over a computed array; how fast this is with long text is untested.
    * Long-term architectural issues with reactive efficiency - but we should at least verify that nothing goes through $for when there is merely a data change in a component.

The ones that matter most for a working tldraw integration are 2, 4 and 5–6. The rest have straightforward, if verbose, workarounds.
