# Absence of LCS alignment causes a massive FOUC

## Symptom

As a page holding an uncommitted edit finishes upgrading from its static form to its editable form, with the orange
dashed outline, part of the outlined material is shown for about one frame at a huge scale. On
https://ponder.org.uk/communities/ the small IMERSS image briefly fills the whole browser pane.

## Investigation

### 1. What sizes the image

`content/communities.md` lays each community out as a `.community-row` flex row, holding a `.community-picture` and a
`.community-desc`. Two rules size the image, and both are needed:

 - The theme's `main.css` sets `img {max-width: 100%}`.
 - Ponder's `ponder.css` sets `.community-picture {width: 30%}`.

Without the 30% width, the flex item shrinks to fit its content. The image's `max-width: 100%` then resolves against the
image itself, so the image shows at its natural size. The source is a large "scaled" JPEG, so it fills the pane. A
frame painted without `ponder.css` would therefore produce exactly what was seen.

### 2. Measuring per frame on the test site: no reproduction

I wrote a trial using the extension's puppeteer harness:
`scratchpad/trial/fouc-trial.js`. It does the following:

 - It edits a post of `packages/wend-test-site` to add a row of the same shape, holding a 3000×2000 SVG image.
 - It samples the image's width in a `requestAnimationFrame` loop, which runs just before each paint.
 - It covers both paths: the live edit, and a reload of the page holding the claim.

No frame showed the image wider than its constrained 446px, whether the row was styled inline or through classes.

The trial also recorded additions and removals of `<link>` and `<style>` elements. In an early version I prepended a
`<style>` to `<head>`. When the page's tree booted, it then removed that style, and also the *last* stylesheet link,
`beautifulWend.css`. Once the trial stopped touching the head, nothing was removed. So a node inserted into the head
before boot disturbs it.

### 3. Measuring per frame against ponder: the mechanism appears

The harness can build any site through `EDIT_TEST_SITE`, working on a scratch copy of it. I wrote a ponder variant,
`scratchpad/trial/ponder-fouc-trial.js`, which works on the communities page with ponder's real CSS. The trial's own
foreign `<style>` turned out to be unnecessary. Ponder's own giscus comments script inserts
`https://giscus.app/default.css` into `<head>` at run time, before the editor migrates the page.

At boot, the tree removed the giscus link, the foreign style, and `../css/ponder.css`. By the end `ponder.css` was back,
so it had been removed and then recreated as a new element. A recreated `<link>` loads its stylesheet again. Chrome
does not hold rendering for a stylesheet inserted by script, so any frame painted in the meantime lacks `ponder.css`.
Locally the reload is too quick for the sampler to catch a bad frame. Over the network, on the live site, it accounts
for the flash.

### 4. Where the removal comes from

Wrapping `Element.prototype.remove` in the page gave the stack for each removal. Every one came from
`fluid.assignChildNodes` (FluidView.js), called from `fluid.patchChildren` during `fluid.renderView`.

One hypothesis was ruled out. `fluid.expandFragmentSlot` lets a `<fluid-fragment>` slot whose subcomponent's tree is
unavailable contribute nothing, which would drop the slot's existing nodes. Wrapping it showed that all three head
slots were available when the head rendered:

 - `stylesheetTags`: 6 nodes
 - `customStylesheetTags`, holding `ponder.css`: 1 node
 - `scriptTags`: 0 nodes

Wrapping `fluid.assignChildNodes` and logging the head's assignment then showed the cause:

```
BEFORE link https://giscus.app/default.css | meta | meta viewport | title | meta description | meta author | ...
       | link ../css/beautifulWend.css | link ../css/ponder.css | script fluid-provenance | ...
0: meta -> NONE
1: meta -> meta            (the charset meta, claimed for viewport)
2: title -> NONE
3: meta -> NONE
4: meta -> meta description (claimed for author)
...
14: link -> link https://ponder.org.uk/index.xml   (claimed for all.min.css)
15: link -> link ../fontawesome/css/all.min.css    (claimed for bootstrap.min.css)
...
20: link -> link ../css/beautifulWend.css          (claimed for ponder.css)
```

Giscus inserts its link at the *start* of `<head>`. On an element's first rendering, `fluid.assignChildNodes` claims
the existing children strictly by position: vnode `i` takes child `i` if their tags match. One extra node at the front
moves every claim one place along:

 - A node whose tag differs from its vnode's is created afresh, as were the charset meta, the title, the favicon link
   and the generator meta.
 - A node whose tag matches is reused for the wrong vnode, and its attributes are rewritten. Every stylesheet link was
   given its predecessor's `href`, so every stylesheet loaded again.
 - The node left unassigned at the end, `ponder.css`, is removed. It is then created again for its own vnode.

So for a short while the whole page's CSS is reloading. The community rows depend on `ponder.css` alone, which is the
last to be restored, so they fail most visibly.

## Solution

### Alignment by longest common subsequence on first render

In `src/framework/core/js/FluidView.js`:

 - The first-render branch of `fluid.assignChildNodes` still tries the positional claim first. If every vnode is
   matched that way, the result is used as before. Pages without inserted nodes therefore take exactly the old path,
   at the old cost.
 - Otherwise, the children are aligned by a new function, `fluid.alignChildNodes(children, vchildren)`. It finds the
   longest common subsequence of children and vnodes under `fluid.matchNodeToVNode`, so the order of both is kept. It
   uses an O(n·m) table of lengths and then walks back through it. When the walk could skip either a node or a vnode
   equally well, it skips the node. So an inserted node is passed over, rather than taking a vnode's place.
 - The JSDoc of `fluid.assignChildNodes` now describes the fallback.

With the fix, the ponder trial shows each of the 21 head vnodes claiming its own node, from the charset meta through to
`ponder.css`. No stylesheet link is rewritten or recreated.

### Regression test

`tests/framework-tests/core/js/FluidViewTests.js` has a new test: "Markup claimed in order despite a node inserted
before its first rendering". It renders `fluid.tests.headLike`, then copies the markup into a fresh host and prepends a
`<link rel="stylesheet" href="/widget.css">`, as giscus does. After rendering into that host, the test checks two
things:

 - every node of the static markup is the one claimed by the vnode that rendered it;
 - no node is rewritten.

I did not run the test against the old code to confirm that it fails there. By the trace above, the old positional
claim would fail both assertions.

### Verification

 - Lint is clean.
 - All 498 tests in `FluidViewTests.html` pass under the node runner.
 - The browser QUnit suite passes, 440 tests.
 - All 13 extension scenarios pass: signin, framing, publish-race, block-editor, list, changeset, drop, widget,
   inherit, ai, commit-review, panel and home.
 - The ponder trial shows every node of the head claimed in place.

The flash itself depends on the live site's network timing, so the remaining check is on ponder.org.uk once ponder has
been updated to a release carrying the fix.

## Remaining issue

The node that was inserted, giscus's `default.css`, is still claimed on first render, left unassigned, and removed.
That happened before the fix too. It probably leaves the giscus comments unstyled while the page is being edited.

One remedy would be to leave alone any node the alignment skips over, on the grounds that it was inserted by another
party and does not belong to the static rendering. Those nodes would then be treated like the ones the renderer leaves
in place on later renderings. However, it would also keep stale static markup that the template no longer renders. It
is a change of behaviour, and needs a decision.

## Trial scripts

Both trials are in the session scratchpad, at
`/tmp/claude-1000/-home-amb26-Source-gits-bagatelle/d052b978-01cc-45f8-b04f-3af7aae8918e/scratchpad/trial/`:

 - `fouc-trial.js`: the per-frame sampler on the test site.
 - `ponder-fouc-trial.js`: runs on ponder, with `EDIT_TEST_SITE=/home/amb26/Source/gits/ponder`. It works on a scratch
   copy of the site, and writes nothing to the ponder checkout.
