# Widgets in content, and splitting wend from ponder

A design, 2026-11-21, for "Edit in Infusion" (`extension/edit-in-infusion`) and ponder.

## Status - items 1-6 of the order of work built, 2026-11-21

One change from the design below: a widget's potentia is held in an **attribute**, `fluid-potentia`, rather than a
child `<script>`. Building it showed that an island's own rendering replaces its element's children, but keeps its
attributes, so a script would be lost from statically rendered markup and on any re-render. The format is
`<div fluid-layers="fluid.demos.counter" fluid-id="counter-1" fluid-potentia='{"label": "x", "$live": {"/": {"state": {"count": 3}}}}'></div>`:
the potentia as in a layer, nested components as `$component` records, and PTF's live parts at `$live`, keyed by
component path. The live values are written once, when the island is first made.

1. **Core** (FluidView.js): `fluid.potentiaAttribute`, `fluid.parsePotentiaText`, `fluid.attrsToPotentia`,
   `fluid.attrsToLive`, `fluid.writeElementLive` and `fluid.elementAttrs`. Islands and self-booting elements share
   them (holes 1, 2 and 3). Tests are in FluidViewTests: "An island configured by its potentia attribute" and "An
   element booting itself is configured by its dataset and potentia attribute, as an island is". Hole 8 is fixed in
   `edit.fillIslands` (edit.js), whose signature now includes `fluid-id` and `fluid-potentia`.
2. **ponder's build**: imports `static/sfc/*.vue` as the module `ponderWidgets`, in the node build and in pages; every
   such layer is a boot layer, alongside linkage.json's `bootLayers` (hole 5); the linkage has `widgets: {dir, layers}`,
   listing those reaching `fluid.topLevelWidget`; widget SFCs are part of the template hash. Hole 6 (JS layer parts) is
   only half done: a pasted JS part is written as `static/sfc/<layer>.js`, but the build imports only `.vue`.
3. **Codec** (FluidPTF.js): `fluid.ptf.islandFromParts`, `fluid.ptf.islandMarkup`, `fluid.ptf.islandPotentia` and
   `fluid.ptf.islandToParts`. The block editor writes a widget's state back into its element when the user leaves it
   (hole 4). Tested in FluidPTFTests: "An island's state is written back into its markup, and restored from it".
4. **Toolbar**: a widget menu and "+" in the block editor, inserting after the block in hand with a fresh `fluid-id`.
5. **Copy and paste**:
   - Copying a widget puts PTF and its element on the clipboard.
   - Pasting PTF into a block or the source view registers its layers at once and inserts the widget.
   - The layers become `Claim.files` at `static/sfc/<layer>.vue`. One the site holds identically is skipped; one it
     holds differently is replaced only if the user confirms.
   - A claim's pasted layers are defined again when the page reloads, before it is published.
   - Tested end to end by extension/test/widget-scenario.js.
6. **Split** (ponder):
   - `packages/wend` holds the build, model, markdown pipeline, trace and page boot, plus the content, tag and alias
     SFCs. `packages/beautiful-wend` holds the theme SFCs, its adaptations and its static files.
   - ponder keeps content, `wend.json`, `infusion/linkage.json`, `infusion/site.html` and its shortcodes, and gains
     `wend.site.json`, the descriptor read by `packages/wend/js/site.js`.
   - Each module is published as `js/wend-<module>-<hash>/`.
   - **Fork-on-write**: a framing source names `{module, file}`, and its path is the site's fork at
     `infusion/override/<module>/<file>`. Until the fork exists the client reads the published `origin`, and the first
     commit creates it. The build defines forks in place of the module's files, in node and in what it publishes.
   - Checked by building before and after: every page renders identically, apart from module declarations and hashed
     paths. The framing scenario commits a fork of the footer and finds it published.
  7. **Namespaces.** wend's layers are renamed `wend.*` and beautiful-wend's `beautifulWend.*`, with their files and
     function namespaces - ponder's own, its shortcodes, stay `ponder.*`. No aliases are kept, since none was released.
     The root layer is the descriptor's `root`, carried to the browser as the linkage's `migration.root`. A fork of a
     file no module holds, e.g. one since renamed, is reported and ignored. The rename exposed an Infusion bug: a page
     declaring `<fluid-module id="beautifulWend">` made `window.beautifulWend` that element, by the browser's named
     access, and layers' namespaces were written onto it and lost - `fluid.getGlobalValue` and `setGlobalValue` now
     root a path only at a global of the global object's own (`fluid.isOwnGlobal`), tested in FluidViewTests.

Not yet done:
- npm workspaces. They would change ponder's lockfile and CI install, so the packages resolve their dependencies from
  ponder's own node_modules.
- Moving the extension's tests onto a small fixture site.
- `.js` widget layers in the build.
 It follows
step 1 of `images-in-place.md`, *changesets*, which is built: a claim may carry further files (`Claim.files`), and is then
committed as one commit through the Git Data API. That is what lets a widget's SFCs travel with the post that uses
it.

## 1. Inserting a widget from the block editor's toolbar

The block editor (sfc/fluid-blockEditor.vue) gains, at the end of its toolbar, a layer selector with "+", as in the
tldraw demo (`fluid.tldraw.listWidgetLayers` in demo/tldraw/js/tldraw-hosting.js):

- The selector lists every layer which reaches `fluid.topLevelWidget` and is defined by an SFC in `static/sfc/`. The
  build publishes the list in the linkage (`widgets: [{layer, src, label}]`, with the label from the SFC's `<!-- -->`
  description or the layer name), so the client needn't load every SFC to build the menu.
- "+" inserts an island block after the block in hand, rendered live at once. Its edit UI is whatever the widget's
  layers give it; the island is a child of the block's component, as shortcode islands already are.

## 2. How a widget is written in markdown

There is already one representation, which this extends rather than replaces: an HTML block holding an element bearing
`fluid-layers`. Shortcodes become one (`ponderMarkdown.expandShortcodes`), and the segmenter already reports an
html_block bearing `fluid-layers` as kind "island" (`ponderMarkdown.segment`). A widget block is:

    <div fluid-layers="fluid.demos.counter" fluid-id="counter-1">
    <script type="application/fluid-potentia+json">{"count": 3}</script>
    </div>

- `fluid-layers` names its layers, as now. Islands receive `$layers` from it already.
- `fluid-id` names its member in the block's component, so that it keeps its identity, and PTF paths, across
  re-renders. `allocateIsland` already honours `fluid-id`.
- The `<script>` holds its **potentia**: the PTF root potentia, less `$layers`, plus a `"<path>": {...}` member for
  each nested component with user potentia and each live value. This is the JSON that PTF's potentia and live parts
  hold today, in one object.
- It must be one HTML block: CommonMark ends an HTML block at a blank line, so the serialiser writes the JSON on one
  line, or with no blank lines.

## 3. The holes - what PTF can carry that an island cannot today

Checked against FluidPTF.js (`componentToParts`, `applyParts`) and FluidView.js (`allocateIsland`,
`makeSelfBootEffect`):

1. **Potentia beyond strings.** An island receives only `dataset`, from its `data-` attributes - strings, flat.
   *Fix:* `allocateIsland` reads the child `script[type="application/fluid-potentia+json"]` and merges it into the
   island's `template` merge record. It must not be retemplatised as a child.
2. **Self-boot ignores both.** `makeSelfBootEffect` (a page with no page boot) passes neither `dataset` nor potentia,
   unlike islands. *Fix:* share one function, `fluid.elementPotentia(element)`, between the two.
3. **Nested and live state.** PTF transmits user potentia per component path and the live layer flattened by path
   (`fluid.ptf.flattenLiveLayer`). Neither has a place on an island. *Fix:* the paths within the potentia JSON, as
   above. `fluid.ptf.applyParts` already applies by path, so the island applies them with the same code once it has
   been constructed. Live values are written at `live` priority, as PTF writes them.
4. **Writing state back.** Today nothing serialises a live island back into its source - an edited counter is lost
   on save. *Fix:* the block editor's serialiser asks each island for `fluid.ptf.componentToParts` and rewrites the
   script from its potentia and live parts. This is the only place where the markdown is written from the live tree,
   so it should be the same code as copying to the clipboard (section 4).
5. **Layers not yet loaded.** PTF carries its layers' text, but an island in a page only names them. The page must
   import them. `linkage.json`'s `bootLayers` is a hand-kept list, so a new widget would silently fail to boot.
   *Fix:* the build imports every SFC in `static/sfc/` as a site import (`migration.siteImports`), and derives
   `bootLayers` from the islands it finds in content.
6. **JS layer parts.** PTF layer parts may be `fluid.def` JavaScript (`fluid.ptf.jsLayerSources`) rather than SFCs.
   *Fix:* written to `static/sfc/<layer>.js`, and imported alike. Imports already accept .js.
7. **Unavailable values.** Functions and DOM nodes are dropped by `fluid.ptf.toJSONAmenable`, as PTF drops them. The
   `container` comes from the element, as it should. Functions in user potentia are refused when pasted, with the
   diagnostic PTF gives, rather than lost silently.
8. **Static rendering.** The static build renders islands from their attributes alone. Once potentia is in the
   script, `edit.fillIslands` (edit.js), which matches islands by attribute signature, must include the script's text
   in the signature, or two differently configured counters would be swapped.

## 4. Copy and paste of widgets - the same mechanism

- **Copy** a selected island block. The clipboard gets `text/plain` holding its PTF document
  (`fluid.ptf.componentToPTF`), and `text/html` holding the island markup of section 2, so that it pastes sensibly
  elsewhere.
- **Paste** into the block editor or the source view. If the clipboard text passes `fluid.ptf.isPTF`, it is decoded
  (`fluid.ptf.decode`):
  - its layer parts, except the widget's own, become further files of the claim (`Claim.files`), at
    `static/sfc/<layer>.vue` or `.js` - unless the site already has that layer with the same text (compared by hash
    with `trace.staticFiles`). A layer the site holds with *different* text is a conflict of definitions: the paste
    asks whether to keep the site's or take the pasted one;
  - the widget's own layer becomes `static/sfc/<layer>.vue` too, unless it is one the arena synthesised for this
    instance alone. Its root potentia and live parts are what section 2 writes in the script;
  - the layers are registered at once (`fluid.ptf.registerLayerParts`), so the widget renders live before commit;
  - the block written is section 2's.
- One codec, `fluid.wend.islandFromParts(parts)` and its inverse `fluid.wend.partsFromIsland(element)`, serves the
  toolbar, the serialiser (hole 4), copy and paste. It belongs in Infusion core beside FluidPTF.js, since the
  representation is Infusion's, not ponder's.

## 5. Which widgets are instantiable

As in tldraw: a layer defined by a file in `static/sfc/` which reaches `fluid.topLevelWidget`. Its dependencies, also
pushed to `static/sfc/`, are not offered unless they reach it themselves. The widgets in ponder's
`infusion/sfc/shortcodes/` are written by their shortcodes and stay where they are. Moving one to `static/sfc/` with
`fluid.topLevelWidget` offers it on the toolbar too.

## 6. Splitting the repository: wend, beautiful-wend, ponder

What ponder holds today, and where it would go:

| Layer | What | Today |
|---|---|---|
| **wend** - any static site edited in place | the build (siteModel, markdown pipeline, feeds, trace, linkage, pageBoot), the content-block and island layers, the editing contracts (linkage record, trace format, `wend.json` as a patch of the root), the widget codec of section 4, `static/sfc` import and `bootLayers` derivation | `infusion/js/*.js` (buildSite, siteModel, markdown, trace, feeds, pageBoot), `ponder-content.vue`, `ponder-document.vue`, `ponder-site.vue`, `ponder-scriptTag.vue`, `ponder-stylesheetTag.vue`, `ponder-alias.vue`, `kinds/` |
| **beautiful-wend** - the theme | the page furniture inherited from Beautiful Hugo: header variants, navbar, footer, post preview and meta, pagers, tags, share links, related posts, comments, i18n, its CSS | `ponder-header*.vue`, `ponder-navbar.vue`, `ponder-navItem*.vue`, `ponder-footer.vue`, `ponder-postPreview.vue`, `ponder-postMeta.vue`, `ponder-pageMeta.vue`, `ponder-pager.vue`, `ponder-listPager.vue`, `ponder-tags.vue`, `ponder-termPanel.vue`, `ponder-shareLinks.vue`, `ponder-relatedPosts.vue`, `ponder-comments-giscus.vue`, `ponder-mediaIcons.vue`, `ponder-main*.vue`, `ponder-head.vue`, `i18n/`, `static/css/main.css` etc. |
| **ponder** - this site | content, `wend.json`, `infusion/linkage.json` (repo, branch, framing), its own shortcodes and widgets, `static/` assets, `ponder.css` | `content/`, `wend.json`, `infusion/linkage.json`, `infusion/sfc/shortcodes/`, `static/` |

Points to settle:

- **Namespaces.** Layers are now all `ponder.*`. Rename them to `wend.*` and `beautifulWend.*` (or `bwend.*`), keeping
  `ponder.*` aliases for a release, so that saved PTF and content islands (`ponder.shortcode.figure`) keep resolving.
  The shortcode layers are the ones content names, so they keep `ponder.shortcode.*`, or become `wend.shortcode.*`
  with aliases.
- **Packaging.** wend and beautiful-wend as npm packages, or as git submodules beside Infusion, resolved through the
  module map as `%wend/` and `%beautifulWend/`, as `%ponderSite/` is now (`migration.modules`). The editing extension
  then depends on wend's contracts alone, and its tests on a small fixture site rather than ponder.
- **Framing.** `linkage.json`'s `framing` names theme SFCs by path. If the theme lives in a package, editing the footer
  should not edit the package. Instead, the site overrides the theme layer with an SFC of its own, created on first
  edit - the same "everything but the top layer goes to static/sfc" rule as pasting, and the same changeset mechanism.
- **The seam to cut first** is `buildSite.js`. It mixes the generic build with ponder's paths (`content/`, `static/`,
  `infusion/sfc`). Give it a site descriptor (dirs, theme module, site module) and the rest follows.

## Order of work

1. The island potentia script, and holes 1, 2 and 8, in Infusion core, with tests in FluidViewTests.
2. `static/sfc` imports and derived `bootLayers` in ponder's build (hole 5), and `widgets` in the linkage.
3. The codec (section 4) and the serialiser writing state back (hole 4).
4. The toolbar's layer selector and "+".
5. Copy and paste, with layer parts as `Claim.files`.
6. The wend / beautiful-wend / ponder split, starting at `buildSite.js`'s site descriptor.
