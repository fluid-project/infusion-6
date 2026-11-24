# Edit in Infusion

A Chrome extension (Manifest V3) which edits a statically published site in place, where its pages bear a Fluid
provenance record - the record, written by the site's build, of what each page was built from. The editing itself is
Infusion's: the extension boots the page's own component tree over it, from the site's own copy of Infusion, and
makes Infusion's editing panel, `fluid.staticEditor`, beside it. The extension holds what a page must not reach - the
user's GitHub sign-in and their edits not yet committed (claims, in IndexedDB) - and commits an edit once the user has
confirmed it in a window of its own. The published trace, `fluid-trace.json`, tells when the site has published it.

To try it: open `chrome://extensions`, enable *Developer mode*, *Load unpacked* this directory, pin it from the
puzzle-piece menu, and click its button on a page of the site. A click opens a panel (`popup.html`). Until the user has connected their GitHub account, it shows a code and opens
GitHub's page for devices, where the user enters it and authorizes the extension. The service worker signs in by
itself, and returns the user to their page. Signed in, the panel shows their account, offers to edit the page, and
to sign out. Right-clicking the button also offers to sign out. The extension's options offer the same sign-in. This is
GitHub's device flow, of an OAuth App asking for `public_repo`, which needs no secret and so no server - see
`fluidGitHub.startSignIn` in `js/github.js`, and `packages/wend/notes/github-sign-in.md` of this repository. The options also take a
fine-grained GitHub token with *Contents: read and write* on the site's repository, instead of signing in.

The extension does nothing until its action is clicked: on a page built by ponder's `npm run build`,
clicking it asks for access to the site, and opens the editor. Granted access *enlists* the site - the content
scripts are registered for its pages, which then show the edits held for them without a click. Enlisted sites are
listed, and may be forgotten, in the options. Declining access edits the page in hand alone, by the click's own
temporary access.

The scenario tests (`extension/test/`, `npm run test:extension`) run a build for testing - a copy whose manifest bears
`fluid_testing`, which alone honours a mock GitHub's API and a faster poll set in storage, and is granted the mock's
host up front. See [STORE.md](STORE.md) for publishing to the Chrome Web Store.

| File | Role |
|---|---|
| `js/edit.js` | Content script, injected on a click or registered for an enlisted site: loads the bridge, has it make the page live and make the panel - on a click, or at once where a claim is held on the page's sources - and relays the panel's requests to the service worker, only on the repository the page names |
| `js/bridge.js` | Loaded into the page's own world: loads the site's markdown pipeline and its Infusion, as the provenance names them, boots the page's component tree over it, adapting its blocks for editing, and makes the panel |
| `js/background.js` | Service worker: enlists sites and injects the content scripts on a click; holds claims and the token, away from the page; answers the content script; asks the user to confirm each commit |
| `confirm.html`, `js/confirm.js` | The window in which the user confirms a commit asked for by a page - its repository, files and change |
| `js/claims.js` | Claims in IndexedDB, on the extension's origin |
| `popup.html`, `js/popup.js` | The panel opened by a click on the extension's button: connecting a GitHub account, its status, editing the page, and signing out |
| `js/github.js` | Signing in by GitHub's device flow; reading and compare-and-swap writing of files through GitHub's API |
| `icons/` | The extension's icons, from Infusion's logo |

What runs in the page's world beside the bridge is Infusion's, from `src/components/staticEditing/`, which the site's
build publishes with its copy of Infusion (see `editingFiles` in wend's `js/trace.js`), so that a page is edited by the
Infusion it was built with:
- `sfc/fluid-staticEditor.vue` - the panel, `fluid.staticEditor`, with the styles of the claims it marks on the page.
  Its logic is `js/fluid-staticEditing.js`, `fluid.staticEditing`, and its source view `sfc/fluid-sourceView.vue`, a
  CodeMirror 6 editor using Infusion's one copy of CodeMirror 6, `fluid.codemirror6`, the bundle of fluid-lint in
  `src/lib/fluid-lint/`;
- `js/fluid-withEditing.js` - the mixin layer `fluid.withEditing` and `fluid.editRoot`, whose `$linkage` broadcasts it
  onto the layers of the page's blocks;
- `sfc/fluid-blockEditor.vue` - the block editor, editing blocks in place, with `js/fluid-markdownSerializer.js`,
  serialising an edited block back to markdown;
- `js/fluid-zip.js` - reading a widget dropped as a ZIP file.

The panel runs with the page's privileges, as the page's own scripts do, so that any script of the page could ask what
the panel asks. It therefore asks the content script, by the DOM events `fluid-edit-relay-request` and
`fluid-edit-relay-reply`, only for what the extension permits - claims and reads on the repository the page names -
and a commit is made only once the user confirms it in `confirm.html`, which no script of the page can reach. The
content script must be the extension's own: Manifest V3 runs no code in an extension's own contexts but what it
packages.

The extension holds no markdown renderer of its own. Each page's provenance record names the scripts of the site's
pipeline - in a wend site, wend's `js/markdown.js` and the markdown-it builds it uses, which the build publishes beneath
`js/fluid-markdown/` - and the bridge loads them, so that a preview is rendered by the code the build renders with.
Under Manifest V3 the content script can't load them itself: a script element it inserts is held to the extension's
Content Security Policy, which admits only the extension's files, whereas one the bridge inserts is held to the page's.
