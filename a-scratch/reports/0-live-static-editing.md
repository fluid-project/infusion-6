# Live editing of statically published sites - "Edit in Infusion"

Status: plan and work list, 2026-11-18. Phase 0 begun - see [Progress](#progress).

Reading: Mokhov, Mitchell and Peyton Jones, *Build Systems à la Carte* (ICFP 2018, text in
`Build Systems à la Carte.txt` at the root of this checkout), and the commentaries
[reconciling-build-systems.md](reconciling-build-systems.md), [static-site-live-preview.md](static-site-live-preview.md)
and [visual-layout-static-site.md](visual-layout-static-site.md).

## 1. Goal

Close the gap between the static generation which ponder's `ponder-infusion` branch performs
(`infusion/js/buildSite.js`, one component tree rendering every page into output documents of its own) and fully live
visual editing of the same site, backed by optimistic concurrency and isomorphic rendering:

1. A visitor with the **"Edit in Infusion"** Chrome extension activates it on a page of a suitable statically rendered
   site, e.g. ponder.org.uk.
2. The extension injects code which finds the page's **linkage record** - what the build published about which sources,
   layers and build traces produced this page - and broadcasts it as a `$linkage`. A mixin layer, `fluid.withEditing`,
   contributed against it, makes the page **migrate in place** into a live, editable version of itself: the inert
   layer records it already holds are revived, the layer structure is booted over the existing markup, and the editing
   affordances arrive as further layers.
3. Content blocks upgrade according to their kind - a block backed by markdown becomes a rich text editor which
   still synchronises bidirectionally with markdown. `demo/compose-edit` shows a primitive version of this over CodeMirror 5.
4. A block palette, in the manner of Divi or TinaCMS's blocks field, adds new blocks to the document. Unlike Tina's,
   the palette is not fixed by a compiled schema, but is the set of layers the site's layer registry offers - see
   [static-site-live-preview.md](static-site-live-preview.md) - each with its JSON Schema-like description as the
   runtime check on what it writes.
5. A **collection** of the site, e.g. its posts, offers to allocate a new member, choosing its name. The new page is
   reached at a **shadow URL** - the static URL it will have once published, patched with a `#` variant naming the
   as yet unpublished file, e.g. `/post/#fluid-shadow=post/2026-11-18-new-thing.md` - which the client renders itself
   until the static page exists.
6. As in bioReportR's community curation (`saanich-peninsula-flora/src/curation`, designed in
   `bioReportR/notes/community-curation-design.md`), edits appear to take effect at once: they are held in IndexedDB as
   **claims**, rendered over the published site, and dropped once publication has caught up with them. Until then the
   blocks they touch are styled distinctly as **uncommitted** (held only in the browser) or **committed, unpublished**
   (in the repository, but the Action republishing the site has not yet finished).

The MVP sought now has *some* working component at each architectural point: the GitHub Action and a Cloudflare
Worker, the Chrome extension, injection, the client laying hands on the page's layer structure, advertising the linkage,
the UI adapting, accepting a simple edit, posting it back, and showing each visual state while the Action runs.

## 2. Where we are on the build systems map

### 2.1 The taxonomy

The paper splits a build system into a **scheduler**, which orders the tasks, and a **rebuilder**, which decides
whether a task must run - Table 2:

| Rebuilder \ Scheduler | Topological | Restarting | Suspending |
|---|---|---|---|
| Dirty bit | Make | Excel | - |
| Verifying traces | Ninja | - | Shake |
| Constructive traces | CloudBuild | Bazel | *Cloud Shake* (unoccupied) |
| Deep constructive traces | Buck | - | Nix |

With the properties at stake: **minimality** (Def. 2.1: each task at most once, and only if it transitively depends on
a changed input); **early cutoff** (stop when a rebuilt value is unchanged); **dynamic dependencies** (monadic tasks,
whose dependencies are discovered by running them - `track`); **self-tracking** (§6.5: a change to a task description
counts as a change, achieved by making the description itself an input, `fetch "B1-formula"`); **cloud builds** and
**shallow builds** (§6.4: reuse of results built elsewhere, from a shared store keyed by hashes of dependencies, without
materialising intermediates).

### 2.2 Infusion's reactive graph today

Within one process, Infusion's cell graph is a **suspending scheduler with dynamic dependencies over in-memory verifying
traces** - Shake's cell of the table, held in memory:

* *Suspending.* A `$compute` reads its sources through cells, which bring themselves up to date on demand
  (pull), and effects are run once the graph settles - `fluid.cell.settle()` in `writeOutputDocumentsWhenSettled`.
* *Dynamic dependencies.* A cell's sources are those it actually read on its last run, re-collected on each run - the
  paper's `track`. Topology changes through the API (new components, remerged layers - `fluid.pathToLive`) are
  constructions of new cells, so they are dirty by construction.
* *Verifying traces, in memory.* A cell's recorded sources with the values (versions) it saw are a verifying trace;
  the push of dirtiness followed by a pull which stops on an equal value is early cutoff - see
  [reconciling-build-systems.md](reconciling-build-systems.md). `fluid.cell.explain` / `findCause` already walk this
  trace backwards for diagnostics.
* *Self-tracking.* Infusion is better placed than Shake here. Its task descriptions - layers - are **data**, held in
  the layer registry and merged as JSON, not opaque functions. A layer's definition is already a cell (`Layer store
  signal for layer ...`), so editing a layer is an input change like any other, as a formula change is in Excel. What
  is not self-tracked is the *JavaScript* a layer calls (`$compute:ponder.main.single.showShare(...)`), which is opaque
  as Shake's rules are - for this the coarse fallback of §6.5 applies, hashing the files holding it.

But **across processes nothing persists**: each run of `buildSite.js` starts with an empty graph, rebuilds every page
(the paper's `busy` with respect to traces), and achieves cutoff only at the very end, by comparing each serialised
document with the file on disk (`unchanged` in `writeDocumentsWhenSettled`) - Make's trick of not touching the output.
And the client, booting a page, has no idea which work was done, from which inputs, to produce what it is looking at.

### 2.3 What we need to become

Two moves, the second being the one the user names - an externalised build system which records which work was done
from what data, so that `hydrate.js`/`buildSite.js` and their avatar on the client can cooperate:

1. **Persistent verifying traces, published** (Shake / Ninja, across builds). Each build records, per output document
   (and later per finer key), the hashes of the inputs it read: its content file, the SFC and JS files of the layers it
   used, the site configuration, the version of Infusion. The trace is persisted beside the site - `docs/fluid-trace.json`
   - so that (a) the next build can skip documents whose inputs are unchanged, and (b) **the client can verify what it
   is looking at**. This is the minimum, and phase 0 below begins it.

2. **Constructive traces, shared between server and client - Cloud Shake.** The published site *is* a cloud cache: each
   published page is the value of a key, retrievable by URL, and the trace says from which input hashes it was made.
   The client is a second builder over the same tasks (isomorphism is exactly the guarantee that the tasks are the same
   on both sides). Holding a claim - an input whose hash differs from the published one - the client consults the
   trace: a key all of whose recorded inputs match is fetched from the cache (the published page or fragment); a key
   one of whose inputs it has changed is rebuilt locally. Since Infusion's scheduler is suspending and its tasks monadic,
   the combination is the paper's unoccupied **suspending × constructive traces** - which we are entitled to occupy,
   because our tasks are deterministic (the same layers, the same markdown pipeline, both ends).

   We do **not** want deep constructive traces (Buck, Nix): they key on terminal inputs only, lose early cutoff, and
   invite the Frankenbuild of §6.4 - here, a client showing a list page from a cache keyed on stale inputs.

The **consolidation of a claim falls out of the trace**. bioReportR knows a curation claim is consolidated when its id
appears in `claimStatus.json`. With a published trace the signal is intrinsic: a claim is published when the trace of
the deployed site records, for the source it edits, the hash of the claim's text. No list of claim ids is kept, and an
edit made outside the editor, e.g. directly in git, which happens to produce the same text, consolidates the claim too,
correctly. A claim whose base hash no longer matches the trace, while its own hash does not appear either, has been
overtaken - a **conflict**.

The client's claims are themselves the paper's out-of-band input mutations, which is why the client needs the trace
rather than its in-memory graph alone: the in-memory graph knows what *it* changed, but only the published trace knows
what the *server* last built from.

### 2.4 Granularity, and how traces are formed

* **Phase 0** - one key per output document, with coarse dependencies: the page's own content file, plus a single
  "template" input hashing every SFC, JS file and configuration file of the site, plus Infusion's version. List
  pages (home, sections, terms, pagination) depend on every content file. Coarse but sound - it over-approximates, as
  Excel's dirty marking does.
* **Phase 2** - **trace forming from the cell graph.** Each output document is rendered under its own root effect
  (`fluid.outputDocumentView`). Wrapping `fluid.cell` reads during each document's render (as `fluid.cell.update` is
  wrapped for profiling - see AGENTS.md) collects the set of model paths (`pages[3].content`, `config.params.x`) and
  layer store signals each document consumed, i.e. the paper's `track`, but from the existing graph rather than a
  `WriterT`. The model paths are mapped back to the input files which supplied them by `siteModel`, which knows which
  file each page record came from. Layer store signals map to SFC files via the layer registry's records of where
  each layer was loaded from.
* **Phase 3** - per-fragment keys: a page decomposes into the fragments rendered by its components (header, content,
  related posts, pager), each with its own trace, so that the client can fetch the published fragment for those its
  claims do not touch and render only the rest. This is where hydration's inert layer records and the trace converge:
  each fragment is identified by its component path, which the trace and the DOM both carry.

## 3. Architecture of the MVP

```
                  ┌────────────── GitHub: repo amb26/ponder ──────────────┐
  editor commits  │ content/post/x.md ──push──▶ Action "Build site":       │
  (Contents API,  │                             npm run build ─▶ docs/     │
  sha = expected  │                             docs/fluid-trace.json      │
  base: optimistic│                             commit docs ─▶ Pages       │
  concurrency)    └───────────────────────────────────────┬────────────────┘
        ▲                                                 │ publishes
        │ token via Worker (OAuth exchange,               ▼
        │ as bioreportr-curation)            ponder.org.uk/post/x/
  ┌─────┴─────────────────────────┐            <script type="application/fluid-linkage+json">
  │ Chrome extension               │◀── reads ──  inert layer records (text/x-fluid-layer)
  │  content script: finds linkage │            [data-fluid-block="markdown"] on content containers
  │  action: "Edit in Infusion"    │
  │  injects editor ─▶ blocks      │── polls fluid-trace.json: claim hash published? ─▶ drop claim
  │  IndexedDB: claims             │
  └────────────────────────────────┘
```

### 3.1 Linkage record

Each page published with editing enabled carries, in its head:

```html
<script type="application/fluid-linkage+json" id="fluid-linkage">
{"version": 1, "repo": "amb26/ponder", "branch": "main", "trace": "../../fluid-trace.json",
 "page": "/post/x/", "source": {"path": "content/post/x.md", "hash": "sha256-..."},
 "blocks": [{"selector": "[data-fluid-block=markdown]", "kind": "markdown", "key": "content/post/x.md#body"}]}
</script>
```

It is inert data, under a type the browser does not run, kept by the static build just as the inert layer records are
kept by `--live`. In phase 1 it becomes the material of a `$linkage` component, and `fluid.withEditing` is a layer
contributed to every component the linkage names, so that the migration is ordinary layer merging - Infusion's
"reach in and add a layer" rather than an editor bolted on beside the page.

### 3.2 Claims and visual states

A claim, in IndexedDB database `fluid-edit-claims`, store `claims`, keyed by `<repo>:<path>`:

```
{repo, path, page, baseHash, baseSha, text, hash, state, commitSha, updated}
```

States and styling, applied to every block a claim touches (outline and a corner badge):

| State | Meaning | Leaves it when |
|---|---|---|
| `uncommitted` | held only in this browser | committed - the Contents API accepts the write |
| `committed` | in the repository; the Action has not yet published | the trace records `hash` for `path` |
| `conflict` | the repository moved on under the claim - the API refused `baseSha`, or the trace records neither `baseHash` nor `hash` | the user rebases or discards |
| *(published)* | the trace records `hash` | - the claim is deleted and the page reloaded |

The client renders the claim's text over the published block on every visit until it is published, so the edit
appears to have been made instantly.

### 3.3 Optimistic concurrency

Writes go through the GitHub Contents API, `PUT /repos/{repo}/contents/{path}` with `sha` = the blob sha the edit was
based on. GitHub refuses (409) if the file has changed since, which is the compare-and-swap. The Action's own commits
only touch `docs/`, so they never conflict with edits to `content/`; the Action's push uses the same retry-by-rebase
loop as `curation.yml`, and a `concurrency` group so that runs never overlap.

### 3.4 Authentication

MVP: a fine-grained personal access token with contents read/write on the one repository, entered in the extension's
options and kept in `chrome.storage.local`, never in the page. Next: the `bioreportr-curation` Worker's token exchange,
reached by `chrome.identity.launchWebAuthFlow`. This needs the extension's redirect origin
(`https://<extension-id>.chromiumapp.org`) added to the Worker's `ALLOWED_ORIGINS`, and the GitHub App installed on
the site's repository. Both are changes to `imerss-cloudflare/curation.tf` and GitHub settings, to be made by a human
(`./tofu.sh apply`).

### 3.5 Pages which can't be migrated

Migration in place boots a page's whole component tree over it from what its build published - its linkage record,
naming the copy of Infusion and the SFCs the site publishes, and its slice of the model (`<page>.model.json`). Pages of
these kinds can't be migrated, or migrate imperfectly. Where a page can't, the extension falls back to its preview path,
rendering a claim into the page's blocks with the site's markdown pipeline and filling their islands from the page as
published.

* **Pages without the build's metadata** - pages of another site, pages built before linkage records existed, and
  pages with no slice of the model, e.g. a site's alias redirect pages. Nothing names what to boot.
* **Pages holding a different Infusion** - e.g. a third-party embed, or a vendored copy of an older release, as the
  reactivity post held before R8. Infusion's files may be evaluated only once in a page, and replacing the copy would
  break what the page does with it. A page holding the copy the site publishes, e.g. one which booted itself for a live
  island, is reused instead.
* **Pages whose Content-Security-Policy forbids inline scripts** - an SFC's script is injected as an inline script,
  which needs `'unsafe-inline'` or an equivalent. GitHub Pages sets no such policy; many hosts do (R6).
* **Pages served from `file://`** - fetching the slice and the SFCs fails in most browsers.
* **Pages whose markup is not what their tree renders** - a stale publication, built from older content or SFCs than
  the slice now holds, or HTML edited after the build. These migrate, but the tree's first rendering replaces whatever
  differs rather than claiming it, and edits are based on the repository's current source, which may differ from the
  page's.
* **Pages whose content holds DOM filled by a script of their own** - e.g. the 404 page's emoji, chosen and written by
  an inline script once the page has loaded. These migrate, but booting clears what the script wrote, as the tree
  renders the content as its template gives it (R9). Such material should be a component, as the stabilization and
  reactivity widgets now are.

## 4. Work list

Legend: **[MVP]** needed for the minimum viable product; **[R]** research or experiment; later items unmarked.

### Phase 0 - the static site advertises what made it

1. **[MVP]** `siteModel.readPage` records each page's `sourcePath` (relative to the site root) and `sourceHash`
   (sha256 of the file's text, as `sha256-<hex>`).
2. **[MVP]** `buildSite.js` writes `docs/fluid-trace.json` - the phase 0 verifying trace: per output document its
   inputs and their hashes, plus a `sources` index of every content file's hash, the template hash, Infusion's version,
   and the commit built (`GITHUB_SHA` when run by the Action).
3. **[MVP]** `buildSite.js` writes the linkage record into each page with a content source, in static as well as
   live builds, configured from `infusion/linkage.json` (repository, branch).
4. **[MVP]** Content containers carry `data-fluid-block="markdown"` - in `ponder-main-single.vue` first.
5. **[MVP]** Action `ponder/.github/workflows/build-site.yml`: on push touching `content/`, `infusion/`, `static/`,
   `themes/`, `hugo.toml`, `package*.json`, run `npm ci && npm run build`, and commit `docs/` with the retry loop of
   `curation.yml`. Needs `package-lock.json` regenerated by `npm install` now that `infusion-6` is a dependency.
6. Incremental rebuild from the trace: read the previous `docs/fluid-trace.json`, and skip documents whose inputs are
   unchanged - this needs per-document booting, i.e. not rendering the whole site tree, so it depends on 13.

### Phase 1 - the extension, injection and a first editor

7. **[MVP]** Extension skeleton, MV3, at `infusion-6/extension/edit-in-infusion/`: a content script detecting the
   linkage record and marking the action as available; the action injecting the editor; an options page for the token.
8. **[MVP]** Editor for markdown blocks: fetch the source (Contents API, which also gives `baseSha`), split front
   matter, a side panel holding a text editor of the body, live preview into the block with markdown-it.
9. **[MVP]** Claims in IndexedDB, re-applied on every visit; the state styling of 3.2.
10. **[MVP]** Commit via Contents API with `sha`; on 409, state `conflict`.
11. **[MVP]** Poll the published trace (cache-busted), moving claims through `committed` to published or `conflict`.
12. **[MVP]** Isomorphic markdown - one module, `infusion/js/markdown.js`, configuring markdown-it with the same
    plugins (attrs, footnote, deflist, heading ids, fence options, shortcode islands), loadable under node by
    `siteModel.js` and in the browser by the editor, so that the client's preview is the build's rendering.
13. Real migration in place - **done for content blocks**, see Progress. The site publishes its own Infusion and SFCs,
    named by the linkage; the extension boots them in the page's world, and `fluid.editRoot`'s `$linkage` broadcasts
    `fluid.withEditing` onto the blocks' layers, so the edited block is rendered by Infusion, islands and all. Still to
    come: booting the whole page's component tree, which needs per-page models (R2), and leaving client-script DOM alone
    (R9).
14. Bidirectional rich text over markdown - replacing the textarea: candidates ProseMirror with
    `prosemirror-markdown`, Milkdown, TipTap's markdown extension, or CodeMirror 6 with live-preview decorations. See R4.

### Phase 2 - traces from the graph, and the client as builder

15. Trace forming from cell reads per output document (§2.4), mapping model paths to source files and layers to SFC
    files. **[R]** R1 below.
16. Publish fragment-level traces keyed by component path; client fetches unaffected fragments, rebuilds affected
    ones - Cloud Shake.
17. Self-tracking of layers: a layer edited in the client (`fluid.edit`'s editors) is a claim on its SFC file, handled
    as content claims are.

### Phase 3 - collections, shadow URLs, blocks

18. Collections: a `collection` record in the linkage for list pages (e.g. `post`, its directory and file name pattern
    `YYYY-MM-DD-slug.md`, its front matter defaults). "New post" asks for title and slug, creates a claim for a new file
    (no `baseSha`; the API's create fails if the file exists - the concurrency check for creation).
19. Shadow URLs: `/post/2026-11-18-new-thing/` predicted from the name by the same path sanitisation as
    `siteModel.readPage`; until published, reached as the list page's URL with `#fluid-shadow=<path>`, which the client
    renders from the claim. Once the trace lists the source, the claim's page exists and the shadow redirects to it.
20. Block palette: insertion points between blocks of a page, offering the layers of the registry tagged as blocks
    (shortcodes first: `ponder.shortcode.figure`), each written back into markdown as its shortcode or as a
    `fluid-layers` island with attributes.

### Phase 4 - hardening

21. OAuth via the Worker (3.4); sign-out; token expiry.
22. Multi-file claims committed atomically through the Git Data API (tree + commit + non-forced ref update).
23. The Action reporting progress: the client reads the run's status (Actions API) for the commit, to show "building"
    distinctly from "queued".
24. Tests: a node test of the trace and linkage; a puppeteer test loading the extension against `docs/` served
    locally, with a stub GitHub API.

## 5. Research and experiments

* **R1 - forming traces from the cell graph.** Instrument one build: wrap cell reads beneath each output document's
  root, and see whether the set of model paths read is (a) small, (b) stable across builds, (c) attributable to
  input files. Risk: shared computations (`ponder.relatedPosts.find(pages, ...)`) read everything, making every post
  depend on every post. Expect to need per-member reads of `pages` rather than whole-array reads.
* **R2 - booting over a static page whose data model is absent.** Hydration so far boots pages whose models are
  reconstructible on the client (fetched data). Here the model is the site model. Measure the size of a page's
  share of it (its record plus what list fragments need), and whether `ponder.site` can be booted with only one
  document's records.
* **R3 - MAIN world vs isolated world.** An MV3 content script runs in an isolated world, sharing the DOM but not the
  page's globals. Infusion booted by the extension must run in the MAIN world (`chrome.scripting.executeScript({world:
  "MAIN"})`) to adopt the page's inert layer records and globals, while the token must stay in the isolated world.
  Design the message bridge (CustomEvents on `document`, or `window.postMessage` with a nonce), so that the page can
  never read the token.
* **R4 - markdown round trip.** Which rich editor preserves arbitrary markdown (attributes `{.class}`, footnotes,
  definition lists, raw HTML, shortcodes) through a round trip unchanged when the user edits only one paragraph?
  Experiment: round-trip every file of `ponder/content` through each candidate's parse/serialise and diff.
  Fallback: edit at block granularity, re-serialising only the edited block's source span (markdown-it's token `map`
  gives line ranges), keeping all others byte for byte.
* **R5 - Pages latency.** Measure time from commit to the trace showing it on ponder.org.uk (Action + Pages deploy +
  CDN). If long, publish the trace also to a faster channel (the Worker, or the Actions API's run status - item 23).
* **R6 - Content-Security-Policy.** Pages may forbid injected scripts or fetches to api.github.com; GitHub Pages sets
  none, but other sites will. Extension-injected scripts via `chrome.scripting` bypass the page's CSP for the file
  itself, but not for what that script fetches in the MAIN world.
* **R7 - which hash.** sha256 of the text is used now. Git's blob sha1 would let the client relate the trace directly
  to the Contents API's `sha` and spare one fetch; consider recording both.

## Progress

* 2026-11-18 - this plan, and a first pass at the MVP items of phases 0 and 1:
  * **ponder** (working tree, uncommitted):
    * `infusion/js/siteModel.js` - `sourcePath` on each regular page; `hashText`, `hashSources` (item 1).
    * `infusion/js/trace.js` (new) - the phase 0 trace, written to `docs/fluid-trace.json` by full builds, and the
      linkage record written into the head of each page with a source of its own (items 2, 3).
    * `infusion/linkage.json` (new) - the repository and branch edited: `amb26/ponder`, `ponder-infusion`.
    * `infusion/sfc/ponder-main-single.vue` - `data-fluid-block="markdown"` on the content container (item 4).
    * `.github/workflows/build-site.yml` (new) - the Action (item 5). It runs `npm ci`, so `package-lock.json` must
      first be regenerated by `npm install` now that `infusion-6` is a dependency.
    * Verified: a full build writes 67 pages, the trace, and linkage records whose hashes match the content files; a
      second build is byte-identical apart from pages changed.
  * **infusion-6** `extension/edit-in-infusion/` (new) - items 7-11. Claims and the token live in the service worker,
    on the extension's origin, since a content script's IndexedDB is the page's. All scripts pass `node --check`.
    * Verified end to end in headless Chromium (puppeteer 19.4, run from the infusion-6 checkout so that its
      `.puppeteerrc.cjs` finds the captive browser), against the build served locally: the linkage is found and its
      hash matches the source; activation reads the source from GitHub; an edit re-renders the block and is held as an
      uncommitted claim, which survives a reload; committing without a token reports why; a committed claim (the
      commit simulated in the service worker) is shown as such; once the trace records its hash, the poll marks it
      published, reloads, and the claim is gone. Not yet exercised: a real commit and a 409 conflict.
* 2026-11-18 - item 12, the shared markdown pipeline:
  * ponder `infusion/js/markdown.js` (new, UMD, global `ponderMarkdown`) - the pipeline formerly inside `siteModel.js`
    (markdown-it with attrs, footnote, deflist, goldmark's heading ids, Hugo fence options stripped, shortcode islands),
    made from libraries passed in, so that node passes modules and the browser their globals. `siteModel.js` now makes
    its renderer from it; the build's output is byte-identical to before.
  * `trace.js` publishes the pipeline beneath `docs/js/fluid-markdown/` - the browser builds of the same package
    versions, named by version, and `markdown.js` named by content hash - and each linkage record names them under
    `renderers.markdown`. Since `markdown.js` lies in `infusion/`, it is one of the inputs of the trace's `#template`.
  * The extension holds no markdown renderer of its own. `js/bridge.js`, loaded into the page's own world, loads the
    scripts the linkage names and renders with them. Found on the way: under MV3 a script element inserted by a content
    script is held to the extension's CSP (`script-src 'self'`), so only the bridge, an extension file, may be inserted
    from the isolated world; the site's scripts must be inserted by the bridge, under the page's own CSP (R6).
  * Shortcode islands, which the pipeline renders empty, are filled from the published block: an island whose
    `fluid-layers` and `data-*` attributes match one published is replaced by it. This is a fragment-level
    constructive trace in miniature - an island's rendering is a function of those attributes alone, so the published
    one is a cached value with unchanged inputs.
  * Verified in headless Chromium: all 49 content files render identically under node and with the published scripts
    in the browser; the extension's end-to-end check passes on a post with four figure shortcodes, all four filled,
    with the 21 heading ids the old bundled copy lacked.
  * Remaining differences between a preview and the page as built: URLs are not relativised (the build relativises
    `href` and `src` afterwards - REQUIREMENTS.md R11 would move this into rendering), and code blocks are not yet
    highlighted, since highlight.js runs once at page load. Old versions of the published scripts are not pruned.
* 2026-11-18 - relative URLs at render time (REQUIREMENTS.md R11), and item 13, migration in place:
  * **URLs.** `fluid.materialiseAttr` resolves every site-absolute `href`/`src` against the `fluid-site-root` the page
    records, as it writes it - templates, verbatim content and islands alike (`fluid.siteRelativeAttrValue`, tested in
    FluidViewTests). ponder's `relativiseURLs` post-pass is gone, the static build keeps `fluid-site-root`, and the
    output is byte-identical. Documented in `content/docs/fluid-view.md`.
  * **Build.** `trace.publishMigration` publishes, under content-hashed directories beneath `docs/js/`, Infusion's
    browser files as `FluidBoot.js` lists them (`fluid.bootRecord.files`) and the site's SFCs. The linkage gains
    `migration` - framework root and files, the module `ponderSite`, the SFCs to import - and each block names its
    `layers` (`["ponder.content"]`).
  * **Client.** `js/fluid-withEditing.js` (page world) defines `fluid.withEditing`, whose `html` is the rendering of
    `editSource` by the site's pipeline, and `fluid.editRoot`, created with
    `{withEditing: {$linkage: {inputLayers: <the blocks' layers>, outputLayers: "fluid.withEditing"}}}` - so the
    editing affordance is a layer broadcast onto the site's own components. The bridge's `migrate` loads Infusion,
    declares the modules and imports, creates the edit root, and instantiates each block's layers over the block,
    booted from the source text; `setSource` writes `editSource`. The content script no longer writes blocks itself
    when the page migrates. Migration waits for a source - the claim's, or the one fetched on opening the editor when
    its hash matches the page's - so a visit costs nothing until then. Discarding a claim on a migrated page reloads it.
  * **Verified** in headless Chromium: on a post with two figure shortcodes, the migrated block is byte-identical to
    what the build wrote - islands are children of the block's component, with their bindings, and site-relative URLs.
    On a post whose shortcode carries a client-script widget, the only difference from the build is `fluid-client` on
    the island's script, which the static build strips. Edits, reloads, state labels and publication pass on all three
    test pages. Infusion: `npm test` 2416/2419 (the 3 failures are tldraw "Ask me anything" tests which fail identically
    on the committed code), and FluidViewTests 59/59 in Chromium.
  * **Infusion fixes found on the way:**
    * A booted page's self-boot effect instantiated a second, free component over each island of verbatim markup
      whenever it saw the island's `fluid-layers` before the island's own view had registered the element, e.g. while
      the island's SFC loaded - the free component, having no `dataset`, blanked the island's bindings. Islands'
      elements are now recorded in `fluid.islandElements`, which self-boot skips. Seen only in the browser: no unit test
      reproduces the race.
    * An island's element was not marked as a slot (`isTemplateSlot`), so the verbatim markup's patch removed what the
      island's root had written into markup claimed from a build, e.g. a figure's `style`, while its template loaded.
      Tested in FluidViewTests ("An island within verbatim markup claimed from earlier markup keeps what its root
      writes"), which fails without the fix.
  * **Found, not fixed** - new research items:
    * **R8 - a page holding its own Infusion.** A post embedding live demos loads an older vendored Infusion; Infusion's
      files can be evaluated only once per page, and replacing it would break the demos. Such a page is edited without
      migration (the phase 1 path, with islands filled from the published block). Options: an Infusion able to adopt
      a compatible instance already present, or pages loading Infusion as a module the site publishes (`migration`),
      not a vendored copy.
    * **R9 - DOM owned by client scripts.** Migration takes ownership of a block's markup, so it removes what the page's
      own scripts added after load: heading anchors added by ponder's `ponder.js`, and the panels the stabilization
      widget's `fluid-client` script builds inside its island. Infusion needs a way for a template to mark an element
      whose children (or added attributes) belong to client code, and such scripts may need re-running on a
      migrated island.
    * **Late boot.** `FluidView-browser.js` boots the document as soon as it runs, which in an already loaded page is
      before the files after it, `template-parser.js` and `sfc-parser.js`, load - so imports declared in advance were
      parsed without a parser, cached the failure, and never recovered. The bridge declares them after loading and
      calls `fluid.acquireModules` / `fluid.docToImportMap` itself; Infusion could defer its boot to a task, or retry.
* 2026-11-18 - R8 and R9: no page holds a second Infusion, and no page's own scripts rewrite its content.
  * **One Infusion per site.** The reactivity post loaded an older vendored Infusion (`static/infusion-6/`, now
    deleted, as is the obsolete `FluidDebugging.js`). The build publishes a single copy of the Infusion which built
    the site at `docs/js/infusion-6/`, mirroring the checkout - the files `FluidBoot.js` loads, `FluidBoot.js` itself,
    and every file content or SFCs refer to as `/js/infusion-6/<path>` or `%infusion-6/<path>`
    (`trace.publishInfusion`, `trace.infusionReferences`; a reference to a missing file fails the build). The
    migration linkage names the same copy, so a page which booted it is running exactly what migration would load.
    Pages holding any other Infusion are not supported - migration stands down on them.
  * **Live widgets as self-booting components** rather than scripts which find and fill elements of the content:
    * `ponder.shortcode.vizreactive` (new SFC; the post writes `{{< vizreactive >}}`) - infusion-6's visualiser, as
      `tests/manual-tests/framework/html/visual-signal-test.html` loads it, with its libraries as `fluid-client`
      global scripts of the SFC and a `$bindable` booting it into the island's target.
    * `ponder.shortcode.stabilization` - `stabilization-regimes.js` moved beside its SFC and made a library exporting
      `ponderStabilization.boot(stage)`, booted by a `$bindable` and stopped by its `unbind`.
    * Under node the `fluid-client` libraries are never evaluated, so the `{global}` references are unavailable and
      nothing binds. A page whose content holds such an island (`bootLayers` in `infusion/linkage.json`) boots Infusion:
      the build appends the site's SFC module, imports of just the SFCs of the islands the page holds, and
      `FluidBoot.js` to its body (`trace.insertBoot`). Other pages load no Infusion.
  * **What pages' scripts did is now rendered by the pipeline** (`infusion/js/markdown.js`), so it is part of the
    content as built, previewed and rendered live alike:
    * heading anchors (formerly `static/js/ponder.js`, deleted) - `h2`-`h4` of content begin with their anchor;
    * code highlighting (formerly `hljs.initHighlightingOnLoad()`) - by highlight.js's own `highlightBlock` applied to
      each fence's element (linkedom under node, loading the theme's `highlight.min.js` in a vm context as a browser
      would). All 147 code blocks of the 24 pages with code are identical to what the browser formerly produced.
  * **Migration on a booted page:** the bridge loads none of the framework the page already loaded from the copy, and
    destroys the free components the page booted over the blocks' islands, so that the fresh islands of the blocks'
    components bind their widgets afresh. A component's destruction takes effect only as the graph stabilises, which
    nothing prompted, so the bridge calls `fluid.cell.stabilize()`.
  * **Bug fixed in `edit.js`:** on starting with no claim it restored each block's original `innerHTML`, replacing the
    elements of islands the page had booted - so the page booted a second free component over each.
  * **Verified** in headless Chromium, with the end-to-end check on four pages (plain post; two figures; the
    stabilization widget; the reactivity post with its visualiser and four figures): migration reuses the page's
    Infusion (`FluidCore.js` loaded once), leaves no free island components, re-boots each widget (visualiser 375
    elements and its CodeMirror; 3 stabilization panels), keeps anchors and highlighting; edit, reload, commit state and
    publication pass. On plain and figure pages the migrated block is identical to the build's and the visitor's; on
    widget pages it differs only within the widget's own live DOM. Pipeline isomorphism: 49/49 files. Without the
    extension both widget posts run on current Infusion with no errors. The pruning of earlier hashed directories and
    pipeline scripts in `docs/js/` was added too.
  * Not done: the renderer patch for `fluid-client`-owned DOM begun earlier was withdrawn in favour of the above.
    Hugo's own layouts (`layouts/_shortcodes/stabilization.html`) still refer to the moved script, and Hugo has no
    `vizreactive` shortcode - the Hugo build of this branch is superseded by Infusion's.
  * Next: a real commit against a test branch; booting whole pages (R2), so that list pages and summaries can migrate;
    R1, trace forming from the cell graph; and the late-boot race (`FluidView-browser.js` booting before
    `sfc-parser.js` has loaded), for which the bridge has a workaround.
* 2026-11-18 - R1 traces from the cell graph, and R2 whole-page boot (in progress):
  * Signal primitives `fluid.cell.recordUpdates`, `fluid.cell.upstream`, `fluid.cell.sourcesOf` (FluidSignalsTests).
    `fluid.traceOutputDocuments` in server-support.js forms per-document verifying traces: model reads by path (shape
    only for `$for` sources; reads through `valueAs` aliases and sited arguments resolved), shared site computations by
    value, layers and templates. Test: `npm run document-trace-test`.
  * ponder: `docs/fluid-build-trace.json` (keys by permalink, SFC-text hashes for layers); builds report changed
    documents. Verified sound on body and title edits (body exact: 3/3; title 49 flagged for 5 written, via
    `relatedIndex`). Per-page model slices `*.model.json`; every page has a linkage with `migration`/`model`.
  * Whole-page boot from a slice in Chromium (canonical comparison, injected SFC nodes excluded): single posts, a
    figure post, the home page, the `/post/` list and a term page boot identical to the static page; the
    stabilization post differs only within its widget's live DOM. Fixed on the way: the linkage and `FluidBoot.js`
    script marked `fluid-hydrated`, so the head's template leaves them; `fluid-client` kept in static output;
    `plainText` decodes entities and `summary` escapes them (an isomorphism bug only booting showed); content which
    each parser repaired differently (`_index.md`'s `<a><h2>` lines wrapped in `<div>`, `<Programming 2026>`
    escaped); a page's listed pages supplied as `shared.pagesByPermalink` rather than amongst `pages`, so the client
    boots no sibling documents; `fluid.destroyComponentShadow`, which destroys a component not yet available.
  * Open: the 404 page's random emoji is filled by an inline script, which booting clears; the reactivity post, whose
    visualiser loads d3 from a CDN, settles only once it has (the experiment blocks external requests); the
    extension does not yet boot whole pages; the title-edit imprecision of `relatedIndex` (early cutoff at the
    per-page `related` computation); skipping unchanged documents in the build (needs per-document booting).
* 2026-11-19 - widget state preserved, late boot fixed, whole pages booted:
  * Experiment (page subtree): an island which is a child of a block component survives the block's gaining layers
    dynamically, and a change of its view's template, with its `$bindable` bound once - whereas a free island replaced
    by a block's own is unbound and bound again. So the takeover is an adaptation of the components the page's own
    tree already holds, not a regraft.
  * Late boot: `FluidView-browser.js` now loads last (`FluidBoot.js`, and the client bundle list); a browser test loads
    Infusion into an already loaded frame and boots an SFC declared beforehand - it fails with the old order. The
    QUnit browser runner's page agent now reports only from the top-level page.
  * Infusion: `fluid-page-boot` on a page's root element (`fluid.pageBootAttribute`) stops self-boot booting any of
    its elements alone - tested.
  * ponder: `infusion/js/pageBoot.js`, published with the SFCs and named as `migration.pageBoot`, boots `ponder.site`
    from the page's slice. A page with live islands is marked `fluid-page-boot` and loads it after `FluidBoot.js`, so
    that its widgets run as children of its content's components.
  * Extension: `migrate` reuses a page which booted itself, or boots it whole - marking it `fluid-page-boot`, declaring
    the modules and all the site's imports before loading Infusion (the late-boot workaround is gone), and keeping its
    own nodes (`data-fluid-edit-ui`) out of the page while the tree first claims it. It then broadcasts
    `fluid.withEditing` onto the components rendering the blocks, which now renders `editedHtml` in place of their
    own `html`, leaving it intact. Writes go through `fluid.setForComponent` on the blocks' shadows.
  * Verified on four pages: the stabilization widget's DOM is the same nodes after migration; the visualiser is live;
    plain and figure blocks are identical to the build's; edit, commit state and publication pass.

## 3.6 Editing through abstractions - framing, and the mock GitHub (2026-11-19)

A page's linkage record now names its **framing** - the sources rendering what every page shares, declared in ponder's
`infusion/linkage.json` (`framing`: the footer and navbar SFCs, each with its layer) and hashed into the published
trace's `sources` like content. In the extension's panel, "Also edit framing" migrates the page, marks the framing's
elements as editable, and offers its sources beside the page's own. An edit of one is a claim like any other, keyed by
repo and path; it is applied to the live tree as the SFC's text (`fluid.loadSFCText`), so every component of the layer
renders afresh, and marked by attributes alone (`data-fluid-framing`, labelled by CSS), since a label node amongst the
tree's own would be removed as it renders. Every page, including those with no source of their own, shows any framing
claim on start, and polls each claim it holds - re-reading it from the service worker, since another page may commit it.

Not yet: config (`hugo.toml`) as framing - editing it needs a TOML reader in the client and a path from the parsed config
into the page's `config` reactive root; WYSIWYG editing of framing (the compose-edit demo's `contenteditable` over
template text) - the panel edits the SFC's source.

`extension/test/` holds a **mock GitHub** (`mock-github.js`): a scratch copy of the site as repository, the Contents API
with blob shas and 409 on a stale sha, Actions which rebuild with the site's own build after a delay, serially, and Pages
serving the built site. `harness.js` launches Chromium with the extension pointed at it (`githubApi` in storage), and
`framing-scenario.js` (`npm run test:extension`) runs the story: edit the footer on a post, see it marked uncommitted on
a list page, commit, watch the rebuild publish it and the list page drop the claim and reload; then a content edit
committed over someone else's change lands in conflict.

## 3.7 wend.json, and the block editor (2026-11-19)

**wend.json** replaces ponder's hugo.toml. It is a *patch* of the members of the root of the site's tree, `ponder.site`,
applied when it is constructed (`siteModel.patchOptions`; pageBoot.js alike, from the page's model slice, which now
carries the whole `patch`): `config` - title, baseURL, mainSections, author, menu, params - and `features`, the switches
of the site's optional features (`selfHosted`, `hljs`), which `ponder.site`'s `$if`s now read. Each member of plain data
becomes a reactive root, so reads of it are traced; a member holding Infusion syntax, e.g. a `$component` record, would
pass as it is - the place for a component's own options, e.g. a highlighter's, rather than amongst the site's params.
Dropped as Hugo's alone or unused: theme, publishDir, relativeURLs, pygments*, goldmark, Services (Disqus, Google
Analytics), delayDisqus, readingTime, wordCount, rss, commit, cusdis, and the author's placeholder social handles (the
media icons are written out in their SFC). Every page and feed builds identically, hashes aside. wend.json is framing of
kind "patch": the extension applies an edit of it by setting the root's members (`setPatch`), so e.g. the footer's
author re-renders live (tested in framing-scenario.js).

**The block editor** (`extension/edit-in-infusion/sfc/fluid-blockEditor.vue`, layer `fluid.blockEditor`, broadcast with
fluid.withEditing onto the content block's component) - a successor of the pell-edit demo, without execCommand:
 - the source is segmented by the site's own pipeline (`ponderMarkdown.segment`); each block whose rendering the
   serialiser (`js/fluid-markdownSerializer.js`) reproduces - checked per block, as DOM, by rendering its serialisation
   (`roundTrips`) - is contenteditable in place; the rest (fences, tables, islands, raw HTML, footnote references) are
   marked as edited through the source. Over ponder's corpus 1301 of 1332 such blocks round-trip
 - leaving an edited block serialises it, and splices it into the source in place of its own lines alone - re-wrapped
   at the width its source was wrapped at - and the source is announced to the extension, which holds it as the claim
   and renders it as any edit, so what is shown is always the site's own rendering of the markdown
 - a floating toolbar (kind of block: text, headings, quotation, lists; bold, italic, code, link) and keys (Ctrl+B/I/E);
   Enter splits a paragraph in the source, Backspace at a block's start joins it to the one before, paste is plain text
 - the panel folds the markdown source away while editing in place, as a narrow card, and unfolds it beside the page
Tested in `extension/test/block-editor-scenario.js`.

Next: a source view better than a textarea (CodeMirror 6, with the block in hand highlighted), inserting new blocks
(a palette, incl. islands), lists' items as blocks of their own for Enter/Backspace, footnotes in place, and edits of
inline marks the serialiser can't yet write (e.g. `{.class}`) shown as such rather than refused.

## 3.8 The source view - CodeMirror 6 (2026-11-19)

The panel's textarea is replaced by CodeMirror 6 (`extension/edit-in-infusion/js/sourceView.js`), with markdown, Vue
(for framing SFCs) and JSON (wend.json) by the source's path, line numbers, history, search and wrapping. A Manifest V3
extension may load no remote code, so CodeMirror is vendored as one bundle, `lib/codemirror6.js` (global
`fluidCodeMirror`, ~550KB, mostly lang-vue's HTML/CSS/JS grammars), built by `extension/codemirror/build.js` (esbuild,
with its own package.json - `npm install && npm run build` there) and loaded as a content script before edit.js.
 - it follows the block in hand: focusing a block in the page highlights its lines and scrolls them into view
   ("fluid-block-edit-focus"), and the line of the view's cursor marks its block in the page and scrolls it into view
   ("fluid-source-cursor")
 - unfolding the source makes the page room beside the panel, so markdown and rendering are read side by side
 - edits keep the cursor and history: a source arriving from an edit in place is applied as its minimal change
 - its text is mirrored in a hidden <textarea>, which takes text written into it as an edit, for drivers outside the
   extension's world, e.g. the scenario tests
 - CodeMirror writes its styles into a <style> in the head, which the page's tree would remove as it claims the head
   on booting - it is marked as the extension's own (`data-fluid-edit-ui`), which the bridge keeps aside meanwhile
Tested in block-editor-scenario.js (steps 6 and 7).

## 3.9 Completing links in the source view (2026-11-19)

Typing a link's destination in the source view - after `[text](` - offers the site's pages, shown by title, and after
`![alt](` its images (`fluidSourceView.linkCompletions`, CodeMirror's autocomplete, now in the bundle). A destination
begun "/" or nothing completes from the root of the site (`/docs/fluid-view/`), as the build makes site-relative URLs
right for each page; one begun "./" or "../" completes relative to the page edited (`../../img/x.jpg`). Destinations
holding spaces are bracketed. What is offered is learned once, on activating, from the published trace, which now
records each page's `title` and `kind`, and `assets`, the site's own static files which may be linked to
(`trace.assetPaths`); lists' further pages are left out. Tested in block-editor-scenario.js (step 8).

Headings complete too: after a "#" - `[text](#` for the page edited, `[text](/docs/x/#` or `(../y/#` for another - the
headings are offered by title, indented by level, in the page's order, inserting the whole destination. Another page's
are those the trace records as published (`headings`, `{id, text, level}`, from each page's rendered content -
`trace.headingsOf`); the page edited's are of its source as it now stands, listed by the site's own pipeline in the page
(`ponderMarkdown.headings`, the bridge's `headings` op) a little after each change, so that a heading just written may
be linked to before it is published. Tested in block-editor-scenario.js (step 9).

Next: completing within `<a href="` of raw HTML, and in the block editor's link input.

## 3.10 Ready for the Chrome Web Store (2026-11-20)

The extension does nothing until its action is clicked (`activeTab`, `scripting`; no content scripts in the manifest).
A click requests access to the site (`optional_host_permissions`, one site at a time) and, given it, *enlists* the
site: the content scripts are registered for its pages (`chrome.scripting.registerContentScripts`, persisted), so
that each then shows the claims held for it without a click. Enlisted sites are listed and forgotten in the options.
The test hooks (`githubApi`, `pollInterval`) are honoured only by a build whose manifest bears `fluid_testing` - the
scenario tests' copy, which is also granted the mock's host up front. Icons are cut from infusion-logo.png. The
privacy policy is at ponder's `/edit-in-infusion-privacy/`, linked from no navigation; `extension/edit-in-infusion/
STORE.md` holds the listing, permission justifications and data disclosures.

**Signing in.** Curation needs a Cloudflare Worker because a web page can hold no client secret, and GitHub's web flow
needs one. The extension need not use the web flow: GitHub's *device flow* needs only the client id - the extension
shows a code, the user enters it at github.com/login/device, and the service worker polls for the token, with no
secret and no Worker (the service worker, given `https://github.com/*` as a host permission, is not held to CORS).
So: one GitHub App, with device flow enabled, *Contents: read and write*, installed on each repository edited - not
the curation App, whose permission is to Discussions alone, and which should not gain write access to contents - and
its user tokens set not to expire, since refreshing a GitHub App's user token needs the secret. No Worker.

## 3.11 The panel docked beside the page; the arena protocol in core (2026-11-20)

**The panel** is no longer an `<aside>` overlaid on the page: like Infusion's full-page editor (fluid.fullPageEditor, and
FluidEdit.css), it is a child of `<html>`, after `<body>`, which the root element's `fl-docking-area-mode="right edge"`
lays out beside the body, set off by a bar - bound, once the page is live, as Infusion's `fluid.resizeBar`, loaded from
the site's own copy of Infusion (ponder now publishes `src/components/sfc/fluid-resizeBar.vue` for editing clients,
`ponder.trace.editingFiles`). The body scrolls within its share, so the page's scrollbar is beside its own content, and
contains the paint of its fixed elements. Two consequences: a fixed element of the page, e.g. ponder's navbar, now
scrolls with the body; and a layout sized by media queries on the viewport, e.g. Bootstrap's `.container`, may overflow
the narrower body - as for the full-page editor.

**The arena protocol** (`src/components/askAnything/fluid-ai-arena.js`, `fluid.ai.arena`), bundled with the panel's SFC:
encoding an arena's widgets as PTF, the system prompt, parsing, planning, checking and provenance of the AI's changes,
diagnosis of widgets, and the steps of applying changes common to every bridge. An arena is the widgets beneath one root
- `fluid.history.arenaRoot` - each a child named by its id, as tldraw's widgets are children of its tldrawHost and a page's
components of its document. `fluid.ai.arena.makeBridge` is the bridge of an arena with no host of its own, constructing
and destroying the root's children; a host contributes through an `ArenaHost` - tldraw's (`fluid.tldraw.ai.host`) adds
the shape and canvas parts, plans shape parts, and its bridge (tldraw-ai.js) applies geometry and creates shapes through
the editor. The system prompt is the component `fluid.ai.arena.systemPrompt`, whose `stanzas` - `{order, text}` by name -
a derived layer merges into or replaces: `fluid.tldraw.ai.systemPrompt` replaces the introduction and adds the rules for
placing widgets on a canvas and a hint on reaching the editor.
