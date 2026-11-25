# wend

Building, and editing in place, a static site of Infusion 6 components - the parts any such site shares. Published
to npm as `@fluid-project/wend`, from Infusion 6's repository, independently of Infusion itself - npm refuses the bare
name `wend`. A site depends on it, and on Infusion 6.6.0 or later, and builds with its command `wend-build`.

- `js/buildSite.js` - the build: renders every page of the site as one component tree, writes each page with its
  provenance record, and the trace by which an editing client tells when an edit is published. Run in the site's
  directory, or with `WEND_SITE_DIR` naming it.
- `js/site.js` - reads the site's `wend.site.json`, and merges the site with its bases. The descriptor names its
  modules (wend's, its theme's and its own), its host document, its editing configuration, its static directories, the
  directory of its forks of its modules' files, and the bases it overlays - see below.
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

## Sites built on other sites

A site may be an overlay of one or more other sites, its *bases*: e.g. a "soft fork", which names an existing site's
repository as its base and then changes what it likes. It names them in `wend.site.json`:

```json
{
    "bases": ["owner/site"],
    "exclude": ["content/post/one-i-do-without.md"],
    "editing": "wend/editing.json"
}
```

- A base is a public git repository, `"owner/name"` or `{"repo": "owner/name", "branch": "main"}`, or a directory,
  `{"path": "../other-site"}`. Its own bases are inherited in turn.
- The site and its bases are each defined as an Infusion layer, whose `$layers` are its bases and whose `files` are its
  content, static files and forks of its modules' files, and are merged just as Infusion merges layers. A file of the
  site takes the place of a base's at the same path. Directories merge, so a site adds posts to a base's. The build
  reports each of the site's files which takes the place of a base's. `exclude` drops a base's files or directories.
- A base's `wend.json` is merged beneath the site's, member by member. Any member of the descriptor the site leaves
  out, e.g. `modules`, `host` or `root`, is the base's, except `editing`, which must be the site's own, since it names
  the repository edits are committed to. A base's paths beneath `node_modules/` are resolved against the site.
- `wend-fetch-bases` fetches each base held as a git repository into `.wend/bases/`, which is never committed, at the
  commit `wend.bases.lock.json` records, recording the head of its branch for one not yet recorded.
  `wend-fetch-bases --update` moves each on to the head of its branch. The template workflow, `workflows/build-site.yml`,
  fetches the bases before building. Its scheduled run moves them on, and rebuilds if any moved. It rebuilds whenever
  `wend.bases.lock.json` is committed, e.g. by the "Edit in Infusion" extension, which offers to rebuild once it finds a
  base has moved on.
- A page inherited from a base names the base's repository and commit in its provenance. An editing client reads its
  source from there, and its first commit makes the site's own copy.

## Previewing files held in the browser

wend publishes `wend-preview-sw.js`, `js/previewWorker.js`, at the root of the site. An editing client registers it
while it holds files not yet published, e.g. an image dropped into a post. The worker answers for those files, from the
Cache the client writes, to whatever loads them, so that the site shows as it will once rebuilt. A visitor never has it.
