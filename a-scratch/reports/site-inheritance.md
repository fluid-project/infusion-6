# Sites built on other sites, and the browser's held files as the most specific layer

Status as of 2026-11-24: a plan for wend sites inheriting from other sites ("soft forks"), and for previewing files held
in the browser, with what has been implemented and what remains.

## 1. Where we started: how files not yet published were previewed

An image dropped into a post, or carried by a widget dropped as a ZIP file, is held as a further file of the page's
**claim**. The claim lives in the extension's IndexedDB (`extension/edit-in-infusion/js/claims.js`), which pages can't
reach. The file sits at its path in the repository: `static/img/<name>` (or the image directory the page names), and
widget SFCs at `static/sfc/<layer>.vue`. It is committed with the page's source as one changeset.

The preview worked as follows:

- `fluid.staticEditing.previewImages` worked out the URL each held image would have once published. It handed the
  image's bytes to `bridge.previewImages` in the page.
- The bridge made a `blob:` URL of each image. A `MutationObserver` swapped it into any `<img>` whose `src` matched,
  keeping the original in `data-fluid-preview-of` so that the markdown serialiser writes the real path.
- Widget SFCs were registered directly with `fluid.loadSFCText`, rather than fetched.

How faithful it was: only for `<img src>`, only for images, only beneath the image directory, and only on the page
holding the claim. Nothing loaded the files any other way: `srcset`, CSS `url()`, SVG `<image>`, links, a widget's
`fetch`, or a non-image file a widget brings.

Correction to an earlier claim: site-absolute URLs such as `/img/cat.png` are **not** broken on a project site served
beneath `/<repo>/`. Infusion resolves a site-absolute URL in a rendered attribute against the site's root, recorded in
the `fluid-site-root` attribute, as it renders (`fluid.sitePathOf` and its neighbours in `FluidView.js`). The advice in
the ZIP docs to write `/img/<name>` stands.

## 2. The model

A site is a stack of layers of files, merged as Infusion merges layers, from the most general to the most specific:

```
module static files (theme) → base site(s) → this site → files held in the browser (claims, IndexedDB)
```

- **One mechanism.** Each site is defined as an Infusion layer: `fluid.def("wend.siteLayer.siteN", {$layers: [its
  bases], files: <tree>})`. The tree holds its `content/`, `static/` and module forks (as `override/<module>/...`), each
  file a leaf `{file, layer}`. `fluid.avatarMerged` of the site's layer then gives:
  - the order of several bases, by C3 linearisation;
  - the site's complement of files: directories merge member by member, so a site adds posts to a base's collection,
    and a file at the same path in a more specific layer takes the place of the more general one.
- **Exclusion** is a `null` leaf, which Infusion's merge keeps. A site names the paths in `exclude`.
- **`wend.json`** is configuration, so it merges member by member beneath the site's. Every other file is replaced
  whole.
- **The descriptor is inherited.** A site that leaves out `modules`, `root`, `host`, `staticDirs` or `overrides` takes
  the most specific base's. It never inherits `editing`, which names the repository edits are committed to. So a soft
  fork's `wend.site.json` can be as small as `{"bases": ["owner/site"], "editing": "wend/editing.json"}`.
- **Paths beneath `node_modules/`** in a base's descriptor resolve against the site being built, since a base's clone
  has nothing installed. The build passes every module's directory to `fluid.loadAndBootDocument` as `moduleSources`,
  so that an inherited host document finds its modules.
- **The theme's static files** are the most general layers. The rest of the theme's role, its SFC modules, is
  still configured by `modules`, not yet as a layer (see section 4).

## 3. What is implemented

Infusion 6.6.3, wend 1.1.0 and edit-in-infusion 1.0.2 are bumped, none yet released.

### wend

- `js/site.js`:
  - `bases` and `exclude`; base descriptors read recursively, with cycles refused; descriptor members inherited.
  - `wendSite.merge(fluid)` builds the merged complement through `fluid.avatarMerged`.
  - `wendSite.resolve`, `list`, `inheritedFrom`, `gitBases`, `readPatch` and `mergeData`.
  - `shadowed`: the site's files which hide a base's at the same path, which the build reports.
- `js/siteModel.js`, `js/trace.js`, `js/buildSite.js` read only the merged complement: content, static files and their
  hashes, widgets, module forks, the template hash and Infusion references. Static files are copied file by file from
  the complement.
  - The template hash includes each git base's commit.
  - The trace records `bases: [{repo, branch, sha}]`.
  - An inherited page's provenance carries `source.inherited: {repo, sha, path}`.
- `js/fetchBases.js`, the `wend-fetch-bases` command:
  - fetches each git base at the commit `wend.bases.lock.json` records, with a shallow fetch by sha into
    `.wend/bases/<owner>/<name>`, without credentials;
  - records the branch head for a base not yet locked;
  - `--update` moves every base on to its branch head;
  - ends its output with `changed` or `unchanged`;
  - `WEND_GIT_URL` redirects fetches, for testing.
- `workflows/build-site.yml` is a template workflow, also applied to edit-in-infusion-review. It:
  - fetches bases before building, only when `wend.site.json` names any, so that sites on wend 1.0.x are unaffected;
  - rebuilds on any commit of `wend.bases.lock.json`;
  - runs on a schedule twice an hour, moving bases on and building only if one moved. A site with no lock file stops
    at the first step;
  - commits the lock file with `docs/`.

  edit-in-infusion-review's `.gitignore` now ignores `.wend/`.
- **Preview worker.** `js/previewWorker.js` is published as `wend-preview-sw.js` at the site's root, and named in every
  page's provenance as `previewWorker`.
  - It answers any non-navigation GET in its scope from the Cache `"wend-preview " + scope`, if that holds the URL, and
    from the network otherwise.
  - It ignores entries older than a day, and takes control of open pages at once.
- The README documents bases and the preview worker.

### Extension and Infusion's editing client

- **Inherited sources.** The panel reads an inherited source from its base, at the commit built, through the new
  `base-read` relay. The status says the source is inherited. Its first commit creates the site's own copy, as forking
  the theme's footer already did.
- **Moved bases.** On first opening the panel, `checkBases` reads the trace's `bases` and asks the background, through
  `base-heads`, for each branch head. If any has moved, a notice offers "Rebuild from it".
  - The button commits a new `wend.bases.lock.json` (`bases-rebuild`, own repository and branch only).
  - The page then polls the trace until it records the new commits, and reloads.
- **Security.** `base-read` and `base-heads` are made **without credentials**: a page names its bases itself, and must
  never be able to direct the editor's token to a repository of its choosing. Bases must therefore be public
  repositories.
- **Held files.** `previewImages` now hands every held file beneath `static/` to the bridge, with its MIME type, not
  only images. Given the provenance's `previewWorker`, the bridge registers the worker and makes the Cache hold exactly
  the held files. It does this even when none are held, so that published or discarded files stop being answered.
  `<img>` swapping is kept, since it works where service workers aren't available.

### Tests

- `extension/test/inherit-scenario.js` (in `test:extension`) passes 13 of 13. A site overlays the wend test site as git
  base `test/base`, adds a post and excludes one. The scenario checks that:
  - an inherited post's provenance names the base;
  - the panel reads the post from the base, and its commit creates the site's own copy;
  - with the base unchanged, no rebuild is offered;
  - when the base's head moves, the panel offers a rebuild;
  - the rebuild commits the lock file, the Action rebuilds, and the base's new post is published.

  The mock GitHub serves public bases (`bases` option: anonymous contents at a commit, and the branch head). The
  harness "fetches" each base at the locked commit before each build.
- `drop-scenario.js` now also checks that the service worker serves a held image to `fetch` and to a stylesheet's
  `url()` before publishing. It passes 21 of 21.
- A by-hand run in a scratch directory checked `wend-fetch-bases` end to end against a real local git repository: lock,
  fetch by sha, `--update`, and an incremental rebuild publishing a base's new post.
- A build of the wend test site with the old and new wend was identical, apart from the trace's new `bases: []` and the
  template hash, which covers wend's own changed files.

## 4. What remains

1. **Creating a soft fork from the extension.** To keep users out of GitHub's UI, the extension should offer "Make my
   own copy of this site" on any wend page. It would, through the API:
   - create a repository;
   - commit `wend.site.json` naming the current repo as its base, its own `editing.json` and `wend.json` (title,
     `baseURL`), `package.json`, `.gitignore` and the template workflow;
   - set the workflow's token to write (`PUT /repos/{o}/{r}/actions/permissions/workflow`), since new repositories may
     default to read-only;
   - enable Pages from `docs/` on `main` (`POST /repos/{o}/{r}/pages`);
   - then watch the first build, as it watches publishing.

   **Settled by the test in section 6 (results there): the template route works with `public_repo`.** Previously: committing a file beneath `.github/workflows/` needs the OAuth `workflow`
   scope, and the extension asks only for `public_repo`. Options:
   - ask for `workflow` as well, everyone at sign-in, or only when a fork is made, by signing in again;
   - create the repository from a template repository holding the workflow (`POST /repos/{template}/generate`). This
     is the better route, if a template repository, e.g. `fluid-project/wend-site-template`, is acceptable.

   What is documented and what is not:
   - The generate endpoint asks OAuth tokens for `public_repo` (a public repository) or `repo` (a private one).
   - It is widely relied on, but not stated in GitHub's docs, that the template's workflow files are copied without the
     `workflow` scope. GitHub copies them itself, so the user's token never writes them. This is unverified here.
   - Enabling Pages (`POST /repos/{o}/{r}/pages`) is documented as asking OAuth tokens for `repo`. Whether
     `public_repo` suffices for a public repository is unknown.
   - Setting the workflow token's permissions (`PUT .../actions/permissions/workflow`) is repository administration,
     and may also want `repo`.

   If either of the last two needs `repo`, that is a worse request than `workflow`, since `repo` reaches the user's
   private repositories. Section 5 gives the mechanism, and section 6 the test which settles these questions.
2. **The theme as a true base layer.** Its SFCs would become layers of files as well, so that `modules` and `overrides`
   reduce to paths in one tree. For now the theme's static files are layers, and module forks are inherited from bases
   through `override/`.
3. **Collections in preview.** A held new post appears in its section's list (the existing list head), but not on the
   home page or tag pages until rebuilt. Faithful preview would re-render list pages in the browser from each page's
   published model slice plus the claims. Deferred.
4. **Responsiveness of base updates.** The schedule (twice an hour) plus the panel's check on opening are the only
   triggers. A base could notify its forks directly with `repository_dispatch`, but that needs a token held by the
   base, and a registry of forks: exactly the infrastructure to avoid. GitHub suspends schedules in repositories
   inactive for 60 days, and the panel's check covers that case.
5. **The preview worker's lifetime.** It stays registered once an editor has used it. It is inert (cache misses go to
   the network) and its entries expire after a day. A sign-out could also unregister it.
6. **Discarding an edit of an inherited source** restores the base's version, since nothing was committed. Once
   committed, the site's copy can only be removed by deleting the file, which the panel doesn't offer yet ("revert to
   the base's").
7. **ponder** hasn't been given the new workflow. It has no bases, so it has no need of it yet.

## 5. Creating a soft fork from the extension: the mechanism

The extension's background worker makes every call itself, with the user's token, as `js/github.js` already does to
commit edits: one more function beside `rebuildFromBases`, reached by one more relay message. The only setup on
GitHub's side is one public template repository, which we maintain.

1. **Generate the repository:**

   ```
   POST https://api.github.com/repos/fluid-project/wend-site-template/generate
   Authorization: Bearer <the user's token>
   {"owner": "<user's login>", "name": "<chosen name>", "private": false, "include_all_branches": false}
   ```

   GitHub copies the template's files, `.github/workflows/build-site.yml` among them, into a new repository in one
   commit. `owner` may be an organisation in which the user may create repositories.
2. **Wait until it's ready.** Generation is slightly asynchronous, and the repository may briefly be empty. Poll
   `GET /repos/{owner}/{name}/branches/main` until the branch exists.
3. **Make it a fork of the site being viewed.** One commit through the panel's changeset path writes the files that
   differ per fork:
   - `wend.site.json`, naming the current site's repository as its base;
   - `wend.json`, with its title and `baseURL`;
   - its editing configuration;
   - `wend.bases.lock.json`, if the fork is to be pinned from the start.

   None of these is beneath `.github/workflows/`, so `public_repo` covers the commit.
4. **Turn on Pages, and the workflow token's write permission.** The two calls whose scopes are unknown. The
   template's own settings may make one or both unnecessary, which is also unverified.
5. **Watch the first build**, as the panel watches publishing, then take the user to the new site.

## 6. Test plan: settling the scopes

Give a token exactly the extension's permissions, try each step of section 5 with it, and record what GitHub accepts.
GitHub reports what each endpoint wanted, so the results are unambiguous. Every step changes state on GitHub, so a
human runs it, or explicitly authorises it.

### Setup

1. **A token with `public_repo` only.** A classic personal access token (Settings → Developer settings → Tokens
   (classic)), with only `public_repo` ticked, expiring in 7 days. GitHub checks a classic token's scopes as it checks
   the extension's OAuth token's. Load it without echoing it:

   ```
   read -s GH_TEST_TOKEN; export GH_TEST_TOKEN
   ```

   For the most faithful version, use the extension's own token from its sign-in instead.
2. **A throwaway template repository**, e.g. `<you>/wend-template-test`, made with normal credentials and ticked
   "Template repository" in its settings. Using a personal account leaves `fluid-project` untouched. It holds:
   - `.github/workflows/probe.yml`: `on: [push, workflow_dispatch]`, one job which runs `echo ok` and prints its
     token's permissions;
   - `docs/index.html`, for Pages to serve;
   - `README.md`.

### The tests, all with `GH_TEST_TOKEN`

Each request is `curl -i` to `https://api.github.com` with `Authorization: Bearer $GH_TEST_TOKEN`. For each, record
the status, the body, and the headers `X-OAuth-Scopes` (what the token has) and `X-Accepted-OAuth-Scopes` (what the
endpoint accepts).

| # | Call | What it tells us |
|---|------|------------------|
| 0 | `GET /user` | The token has `public_repo` and nothing else. |
| 1 | `POST /repos/<you>/wend-template-test/generate`, `{"owner":"<you>","name":"wend-fork-test","private":false}` | **The main question:** can a `public_repo` token create a repository from a template? Expect 201. |
| 2 | Poll `GET /repos/<you>/wend-fork-test/branches/main` until 200 | How long generation takes, so the extension knows how long to wait. |
| 3 | `GET /repos/.../contents/.github/workflows/probe.yml` | **Was the workflow copied** without the `workflow` scope? Expect 200. |
| 4 | `PUT /repos/.../contents/.github/workflows/other.yml`, any content | **Control:** must fail with "refusing to allow ... without `workflow` scope". If so, test 3 proves something; if not, the token wasn't as limited as thought. |
| 5 | `PUT /repos/.../contents/wend.site.json` | The per-fork commit works with `public_repo`. Expect 201. |
| 6 | `GET /repos/.../actions/runs` | Did the template's workflow run, on the generated commit or test 5's? Its log shows its token's permissions. |
| 7 | `GET`, then `PUT /repos/.../actions/permissions/workflow`, `{"default_workflow_permissions":"write"}` | The GET shows what a new repository defaults to: if already write, the extension skips this step. The PUT says whether `public_repo` may change it. |
| 8 | `POST /repos/.../pages`, `{"source":{"branch":"main","path":"/docs"}}`, then `GET /repos/.../pages` | Can `public_repo` turn on Pages? Check the site then serves `docs/index.html`. |

### Reading the results

- **Tests 1, 3, 5 and 8 pass, and 7 passes or isn't needed:** the template route works with the scopes already asked
  for. Create `fluid-project/wend-site-template` and build the feature.
- **Test 7 or 8 fails, asking for `repo`:** `repo` is a worse request than `workflow`. Look at whether the generated
  repository inherits the setting from the template, or whether the build workflow can enable Pages itself with its own
  token's `pages: write`, or else ask for `workflow` after all.
- **Test 3 shows the workflow wasn't copied:** the template route is dead. Ask for the `workflow` scope.

### Cleanup

Deleting a repository needs the `delete_repo` scope, which the test token lacks. Delete `wend-fork-test` and the
template with normal credentials or in GitHub's UI, then revoke the test token.

### Results, 2026-11-24

Run by hand with `edit-in-infusion-review/probe-template-scopes.sh`, against a throwaway template under a personal
account, with a classic token holding only `public_repo`. **The template route works entirely within `public_repo`.**

| # | Result |
|---|--------|
| 0 | Token scopes exactly `public_repo`. |
| 1 | 201. Accepted scopes `public_repo, repo`. A first attempt gave 404 because the template repository wasn't yet ticked "Template repository": GitHub reports that as 404, with `X-Accepted-OAuth-Scopes: repo`, which is misleading. |
| 2 | `main` existed after 3s. |
| 3 | The template's workflow file was copied into the generated repository. |
| 4 | Control refused, as 404 rather than the "refusing to allow ... without `workflow` scope" message. The same endpoint accepted test 5, so the refusal is the missing `workflow` scope. |
| 5 | 201: the per-fork commit works. |
| 6 | Two workflow runs: the copied workflow ran on the generated commit and on test 5's. |
| 7 | New repositories default to `read`. Setting `write` succeeded (204). |
| 8 | Enabling Pages from `main` `/docs` succeeded (201), and the site served. |

So section 4, item 1 is unblocked, given a template repository such as `fluid-project/wend-site-template`. Points
which follow for the implementation:
- Tick "Template repository" on the template, and check `is_template` in tests, since its absence shows only as 404.
- The extension must set the workflow permissions to `write` (step 4 of section 5), since the default is `read`, and
  the build commits `docs/`.
- The first workflow run starts on the generated commit, before the per-fork commit and before the permission is set.
  The template's workflow should do nothing useful on that commit, e.g. skip the build when `wend.site.json` names no
  `editing`, or the extension should not count that run as the first build.

The script and every response's headers and body are archived in `site-inheritance-scope-probe/`. The responses hold
no token: the only matches for "Authorization" are GitHub's `Vary` headers.

## 7. Enabling Pages without the user

Test 8 answers this: the extension enables Pages itself, with the user's `public_repo` token, as one more call in
section 5. It needs no visit to GitHub's settings, and no action from the user beyond asking for the copy. The response
was `build_type: "legacy"`, publishing from `main` `/docs`, and the site was served at once.

Nothing else can do it, so the extension's call is the way:
- A repository generated from a template starts without Pages: test 8a's 201 shows it wasn't yet enabled, since
  enabling it again gives 409. (The template had no Pages site either, so this doesn't show whether one would be
  copied. GitHub documents that only files, and optionally branches, are copied.)
- The workflow's own `GITHUB_TOKEN` can't create a Pages site. `actions/configure-pages` with `enablement: true`
  needs a token with administration rights, i.e. a stored personal token: the infrastructure to avoid.

An alternative for the future: `POST .../pages` with `{"build_type": "workflow"}` makes Pages publish what the workflow
uploads (`actions/upload-pages-artifact`, `actions/deploy-pages`), so the build need not commit `docs/` and the
workflow token need not write contents. It would need `pages: write` and `id-token: write` in the workflow, and wend's
trace check would follow the deployment rather than a commit. Untested.

If the call fails, e.g. because GitHub changes what it asks of the token, the extension should say so and give the one
link to the repository's Pages settings: the "emergency/exception" case.
