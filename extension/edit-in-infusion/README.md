# Edit in Infusion

A Chrome extension (Manifest V3) which edits a statically published site in place, where its pages bear a Fluid
linkage record - see [a-scratch/reports/0-live-static-editing.md](../../a-scratch/reports/0-live-static-editing.md).
An editor of a page's markdown source, previewed live by migrating the page's content block in place into the
site's own Infusion component, with the mixin layer `fluid.withEditing` broadcast onto it (plan item 13), claims held in IndexedDB and
styled by state, commit through the GitHub Contents API, and recognition of publication from the site's
`fluid-trace.json`.

To try it: open `chrome://extensions`, enable *Developer mode*, *Load unpacked* this directory, and in its *Details*
open *Extension options* to save a fine-grained GitHub token with *Contents: read and write* on the site's
repository. The extension does nothing until its action is clicked: on a page built by ponder's `npm run build`,
clicking it asks for access to the site, and opens the editor. Granted access *enlists* the site - the content
scripts are registered for its pages, which then show the edits held for them without a click. Enlisted sites are
listed, and may be forgotten, in the options. Declining access edits the page in hand alone, by the click's own
temporary access.

The scenario tests (`extension/test/`, `npm run test:extension`) run a build for testing - a copy whose manifest bears
`fluid_testing`, which alone honours a mock GitHub's API and a faster poll set in storage, and is granted the mock's
host up front. See [STORE.md](STORE.md) for publishing to the Chrome Web Store.

| File | Role |
|---|---|
| `js/edit.js` | Content script, injected on a click or registered for an enlisted site: finds the linkage, shows claims over blocks, the editor panel, polls the trace |
| `js/background.js` | Service worker: enlists sites and injects the content scripts on a click; holds claims and the token, away from the page; answers the content script |
| `js/claims.js` | Claims in IndexedDB, on the extension's origin |
| `js/github.js` | Reading and compare-and-swap writing of files through the Contents API |
| `js/bridge.js` | Loaded into the page's own world: loads the site's markdown pipeline and its Infusion, as the linkage names them, and migrates the page's blocks in place |
| `js/fluid-withEditing.js` | Loaded into the page's world once Infusion is: the mixin layer `fluid.withEditing`, and `fluid.editRoot`, whose `$linkage` broadcasts it onto the layers of the page's blocks |
| `js/sourceView.js` | Content script: the CodeMirror 6 source view, following the block in hand, completing links |
| `js/fluid-zip.js` | Content script: reads a widget dropped as a ZIP file - the files of its PTF document (`layers/`, `components/.../potentia.json` and `live.json`, or a `.ptf` file) and any images (`img/`) |
| `lib/codemirror6.js` | CodeMirror 6, vendored - built by `../codemirror/build.js` |
| `js/fluid-markdownSerializer.js` | Loaded into the page's world: serialises an edited block's DOM back to markdown |
| `sfc/fluid-blockEditor.vue` | Loaded into the page's world: the block editor, editing blocks in place |
| `css/edit.css` | Styling of claim states on blocks, and of the panel |
| `icons/` | The extension's icons, from Infusion's logo |

The extension holds no markdown renderer of its own. Each page's linkage record names the scripts of the site's
pipeline - in ponder, `infusion/js/markdown.js` and the markdown-it builds it uses, which the build publishes beneath
`js/fluid-markdown/` - and the bridge loads them, so that a preview is rendered by the code the build renders with.
Under Manifest V3 the content script can't load them itself: a script element it inserts is held to the extension's
Content Security Policy, which admits only the extension's files, whereas one the bridge inserts is held to the page's.
