# Images dropped or pasted into a page being edited

A sketch, 2026-11-21, for "Edit in Infusion" - the extension in `extension/edit-in-infusion`.

**Step 1 is built** (2026-11-21): `Claim.files` (claims.js), `fluidGitHub.commitChangeset` through the Git Data API
(github.js), committed by `commitClaim` (background.js) when a claim has further files; the mock's Git Data endpoints
(extension/test/mock-github.js); `staticFiles` in ponder's trace, a hash of each static file by repository path, by
which `edit.reconcile` drops a changeset once every file of it is published; tested by
extension/test/changeset-scenario.js. Widgets pasted as PTF use the same changesets for their layers - see
widgets-in-content.md. Steps 2-4 are not yet built.

## What the user does

- **Drop or paste** an image (a file from the desktop, a screenshot on the clipboard, an image dragged from another page)
  into either
  - the page itself, while its blocks are edited in place (sfc/fluid-blockEditor.vue) - the image lands as a block of its
    own after the block under the drop point, or at the caret on paste; or
  - the source view (js/sourceView.js) - a markdown image `![](/img/<name>)` is inserted at the drop or caret position.
- The image shows at once, from a `blob:` URL, marked uncommitted as any claim's edit is, though the site does not yet
  hold it.
- **Rename** and **Delete** are offered on a context menu of any image the site holds, in the page or (as a CodeMirror
  tooltip action) on an image link in the source view.

## Where the image goes, and its name

`static/img/<page-slug>-<n>.<ext>`, published at `/img/...` - ponder's existing images live in `static/img`, and
`trace.assets` already lists them (it feeds link completion). The slug is the source's file name less its date, e.g.
`ui-as-code-1.png` for `content/post/2025-03-20-ui-as-code.md`; for a pasted file which carries a meaningful name
(`File.name` other than "image.png") a slug of that name is used instead. `<n>` is the least making the path unused by
`trace.assets` and by pending claims. The extension is the type sniffed from the bytes (PNG/JPEG/GIF/WebP/SVG), not the
MIME type the drop claims.

## Claims become changesets

Today a claim is one text file. An image adds a second, binary, file to the same edit, and rename and delete touch many
files at once. So:

- A claim gains `files: {path: {base64 | text, baseSha} | null}` beside its text - a **changeset**, committed as one
  commit. Single-file commits use the Contents API as now; a changeset uses the Git Data API (create blobs, a tree on
  the branch head's tree, a commit, then update the ref with `force: false`) - its compare-and-swap is the ref update,
  failing if the branch moved, and each file's `baseSha` is checked against the head's tree first, so that a conflict
  is still reported per file.
- Bytes are held in IndexedDB as Blobs (claims.js already lives there; IndexedDB stores Blobs natively), never in
  `chrome.storage`.
- `mock-github.js` gains the Git Data endpoints, so that scenarios cover it.
- Reconciliation: the trace records the hash of each asset as it does each source (`trace.assets`, now a list of
  paths, becomes `{path: hash}`), so a changeset is dropped once every file in it is published.

## Showing the image before it is published

The rendered `<img src="/img/x.png">` 404s until the Action publishes it. The content script maps each pending image's
site path to a `blob:` URL, and after each render rewrites matching `src` attributes in the blocks - via the bridge, as
a hook in the markdown pipeline's image rule, so that a live re-render does not flash the broken image.

## Rename

A context action on an image the site holds. The client needs every reference to it:

- the build's trace knows which pages read which sources but not which assets each source links. ponder's markdown
  pipeline already resolves every image link as it renders; trace.js would record per source `assetRefs: [path]`
  (images in markdown, and `/img/...` URLs in SFCs and wend.json, e.g. the site's logo and header images).
- The rename is then a changeset: the image moved (`null` at the old path, the bytes at the new, reusing its blob sha so
  nothing is uploaded), and each referencing source rewritten. A reference is rewritten by its exact URL text in the
  source, as resolved relative to the page, so `../img/x.png` and `/img/x.png` both match.
- Sources referencing it which are not on the page in hand are read through the service worker, as framing sources are.
- The dialog lists the files to be changed before committing.

## Delete

A context action removing the image's link from the source in hand *and* the backing file, as a changeset. If
`assetRefs` shows other sources still linking the image, the dialog says so, and offers to delete only the link here,
or to remove every link too.

## Order of work

1. Changesets in claims, the Git Data API commit, and the mock's endpoints - the one change of model the rest depends on.
2. Drop and paste into the source view; the `blob:` substitution in renders.
3. Drop and paste into the block editor (a new block kind, "image", serialising as `![alt](src)`).
4. `assetRefs` in ponder's trace; rename and delete.
