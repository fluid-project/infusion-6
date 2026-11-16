## Code style

 - Plain JavaScript with JSDocs
 - All strings double-quoted
 - No one-line if or else blocks - e.g. always use
```
   if (condition) {
   ...
   } else {
   ...
   }
```
  - Do not return early from functions, use long if instead.
  - If possible, first branch of if statement condition should not be negated.
  - JSDocs using @return, with capitalised built-ins, e.g. String, Number, Any, with [] for array syntax
  - Do not use Void return type
  - Assume an eslint environment, and begin all node.js files with
```
   /* eslint-env node */
   "use strict";
```

## Testing instructions
 - Run npm test in node to run virtually all view tests
 - A couple of view-specific tests (e.g. verifying that CSS rules have applied) require running in a real browser - run
npm run test:browser-qunit to run the same test pages in headless Chromium, or pass it particular pages, e.g.
tests/framework-tests/core/html/FluidViewTests.html
 - Run npm run test:browser to run the demo scripts listed in infusion.tests.browser of package.json
 - Run, e.g. node tests/test-core/qunit/js/fqunit-cli.js tests/framework-tests/core/html/FluidILTests.html to run a single test file

## Debugging the cell graph
When something updates, re-renders or turns over unexpectedly, ask the graph why before instrumenting it:
 - `fluid.cell.explain(cell)` returns the names of the cells along the whole chain of cause of the cell's last change,
   e.g. `["flatMergedComputer for path story-6.lostPlants", "potentia for path story-6.lostPlants (set: first write to
   cards of component at path story-6.lostPlants, ...)", "during $effect at path load of ...", ...]`. It follows each
   cell's `_dirtyFrom` back to the cell whose change began the reaction, reports why that cell was `set` (its
   `_setCause` - the `cause` and source markers supplied to `cell.set`), and continues from the update during which it
   was set (`_setDuring`), so that the chain reaches past each write to what provoked it. With no argument it explains
   the update in progress, so it may be called from within a `$compute` or `$effect`
 - `fluid.cell.findCause(cell)` returns the same chain as cells, stopping at the first write; `fluid.cell.findAllCauses()`
   gathers the causes of each source of the reaction in progress
 - `fluid.cell.pendingEffects()` lists the effects holding the graph unsettled - `hydrate.js` reports each with what it
   awaits
 - Pass `{cause: "..."}` to `cell.set` to record why a write was made, for diagnostics alone - unlike a `source`, it
   takes no part in propagation
 - Cells are named on construction, by convention `<role> for path <component path>` - e.g. `potentia for path ...`,
   `flatMergedComputer for path ...`, `computeInstance for path ...`, `$sitedRef for site ...`, `Layer store signal for
   layer ...`, `$effect at path <member> of component at path ...`. To profile, or to find when events happen, wrap
   `fluid.cell.update` in the page and filter on `cell.name`, masking instance numbers (`/\d+/g`) to aggregate
 - With logging on (`fluid.setLogging(true)`), the first write to a member of a component which is not yet live is
   logged with its writer, since it remerges the whole component and turns over everything beneath it - see
   `fluid.pathToLive`

## Code workflow
 - Agents do not commit code, all updates reviewed by humans
 - Don't issue commands changing git state
 - Don't change state in GitHub (issues, comments, pull requests, labels, releases, etc.) or in any other stateful
   system outside this machine (other hosted services, APIs, databases, package registries, deployments, messaging) without
   an explicit instruction to do so. An ambiguous request is not an instruction - ask first

## Commit messages
 - Mention issue closed in form FLUID-7003 (fluid-project/infusion-6#3) - this will be passed on as reminder. The FLUID ID is 7000 plus the GitHub issue number, and the parenthesised reference lets GitHub close the issue

## Issue references
 - Issues are titled with a prefix FLUID-7xxx, where xxx is the GitHub issue number, e.g. FLUID-7026: Improve error feedback cycle to AI
 - In code, refer to an issue by its bare ID, e.g. FLUID-7026
 - In Markdown, link the ID to the issue, e.g. [FLUID-7026](https://github.com/fluid-project/infusion-6/issues/26)
 - In other text, follow the ID with the issue URL, e.g. FLUID-7026 (https://github.com/fluid-project/infusion-6/issues/26)
