# wend

Building, and editing in place, a static site of Infusion 6 components - the parts any such site shares. Published
to npm from Infusion 6's repository, independently of Infusion itself.

- `js/buildSite.js` - the build: renders every page of the site as one component tree, writes each page with its
  provenance record, and the trace by which an editing client tells when an edit is published. Run in the site's
  directory, or with `WEND_SITE_DIR` naming it.
- `js/site.js` - reads the site's `wend.site.json`, which names its modules (wend's, its theme's and its own), its host
  document, its editing configuration, its static directories, and the directory of its forks of its modules' files.
- `js/siteModel.js`, `js/markdown.js`, `js/feeds.js` - the site's model, its markdown pipeline (shared with the editing
  client), and its feeds.
- `js/trace.js` - the trace, provenance records, and what is published for an editing client: each module's SFCs, under
  `js/wend-<module>-<hash>/`, Infusion's files, the markdown pipeline, and the widgets of `static/sfc`.
- `js/pageBoot.js` - boots a page's whole component tree in the browser.
- Live examples - a fence whose info string is a language followed by `live` or `syntax`, e.g. `js live` or
  `html syntax`, renders as an island of Infusion's `fluid.liveExample`. Statically, the island shows the code. In the
  browser it becomes an editor linted by fluid-lint. A `live` example - complete and self-contained - is editable, and
  run once clean, with its console below it, and any view it defines, or the Single File Component it is, beside it.
  A `syntax` example, indicative of syntax alone, is read-only and not run. A site imports the widget in its host
  document, and lists it among its `bootLayers`.
- `sfc/` - the layers of content (`wend.content`), of the tags written into a page, and of alias pages.

wend's layers are named `wend.*`, and each SFC's file for its layer, e.g. `sfc/wend-content.vue`. wend assumes nothing of
its theme's names: the layer of the root of a site's tree, e.g. `beautifulWend.site`, is the `root` of its descriptor,
`wend.site.json`, and reaches the browser in each page's provenance as `migration.root`.
