# Signing in to GitHub from Edit in Infusion: GitHub App or OAuth App

Written 2026-11-22. This compares the two ways the Edit in Infusion extension
(`infusion-6/extension/edit-in-infusion/`) could get a GitHub token without a server of its own. Today it does
neither: the user pastes a fine-grained personal access token into its options page.

Both options use GitHub's **device flow**. The flow needs only a public client id, so the extension holds no secret
and needs no Cloudflare Worker. The extension's service worker calls `github.com/login/device/code` and
`github.com/login/oauth/access_token`, which needs `https://github.com/*` among its `host_permissions`.

Points marked **(verify)** are from memory of GitHub's behaviour and docs, not checked against them. Check them before
building on them.

## The cases which matter

1. **Edit a site the user can already write to.** The user owns the repository, or is a collaborator on it.
2. **Copy a site and edit the copy:** "make my own copy of this site" from within the extension, with as little
   formality as possible at that moment. This comes in three forms:
   - a **fork** of the site's repository;
   - a **fresh repository from a template**, holding a starter site;
   - a **bare new repository** which the extension fills with templated contents.

   In every form the copy must then be published, e.g. by GitHub Pages, and opened for editing.

## Option A: an OAuth App

A token carries **scopes**, and acts on **every repository the user can act on**. No repository is enrolled.

### Registering it (once, by the maintainer)

In GitHub: Settings → Developer settings → OAuth Apps → New OAuth App.
- Enter a name, a homepage and an authorization callback URL. The URL is required but never used by the device
  flow, so any URL you control will do.
- Tick **Enable Device Flow**.
- Note the client id. There's no secret to keep, and none is generated until asked for.

### What the user sees and does, once

1. They click "Sign in with GitHub" in the extension. It shows an 8-character code and opens
   `github.com/login/device`.
2. They enter the code. They sign in to GitHub first if they need to.
3. GitHub shows an **"Authorize Edit in Infusion"** page, listing the scopes requested. For `public_repo` this reads
   roughly "Full control of public repositories" (verify the wording).
4. They click **Authorize**. The extension, which has been polling, receives the token and stores it.

That's the only formality. The token doesn't expire, though GitHub revokes an OAuth token which goes unused for a year
(verify). The user can revoke it at any time under Settings → Applications.

### Scopes

| Scope | Gives |
|-------|-------|
| `public_repo` | Writing contents, forking, generating from a template, and creating repositories, all for public repositories |
| `repo` | The same, for private repositories as well. It's much broader, so ask for it only when it's needed |
| `workflow` | Writing files under `.github/workflows/`. The Contents API refuses those without this scope |

`public_repo` alone covers the ponder pattern: a built site committed to `docs/` and published by Pages from a
branch. Ask for `workflow` only if a template publishes through GitHub Actions. Scopes can be widened later, by a
fresh authorization asking for more.

### Copying a site

The extension, using the token:
- **Fork:** `POST /repos/{owner}/{repo}/forks`.
- **From a template:** `POST /repos/{template_owner}/{template_repo}/generate`, with a name, an owner and `private`.
- **Bare repository:** `POST /user/repos`, then write the templated files. Writing them as one commit through the Git
  Data API (blobs → tree → commit → ref) beats one Contents API commit per file.
- **Publishing:** `POST /repos/{owner}/{repo}/pages`, with `{"source": {"branch": "...", "path": "/docs"}}`. Then poll
  until the Pages build is done, and open the new site. See "Turning on GitHub Pages" below for the scope this needs.

**What the user sees at that point: nothing on GitHub.** They name the copy in the extension, and wait for it to be
published.

### Where it falls short

- **Organisations.** An organisation with OAuth App access restrictions turned on, which may now be the default for
  new organisations (verify), hides its repositories from the token until an owner approves the app. The approval is
  once per organisation, and covers all its repositories. A member can request it on the Authorize page.
- **Breadth.** The token can write to *every* public repository the user can write to, including ones unrelated to
  any site. That's what a leaked token would expose. It's held in `chrome.storage.local`, away from pages.
- **Collaborators.** It works for a collaborator on someone else's site, which Option B doesn't, unless the owner has
  installed the app.

## Option B: a GitHub App

A GitHub App has **permissions** rather than scopes. Its user token acts only on repositories where the app is
**installed** *and* which the user can reach.

### Registering it (once, by the maintainer)

In GitHub: Settings → Developer settings → GitHub Apps → New GitHub App.
- The callback/redirect URI is required. Any URL you control will do, since the device flow never uses it.
- Tick **Enable Device Flow**.
- Untick the webhook's *Active*.
- Untick **Expire user authorization tokens**, since renewing an expiring token needs the client secret.
- Choose *Any account* under "Where can this GitHub App be installed?".
- Grant these repository permissions:

| Permission | For |
|------------|-----|
| Contents: read and write | Editing |
| Administration: read and write | Creating, forking and generating repositories (verify that each needs it) |
| Pages: read and write | Turning on and watching GitHub Pages |
| Workflows: read and write | Only if a template publishes through Actions |
| Metadata: read | Added automatically |

### What the user sees and does, once

There are two steps, in either order:
1. **Install.** The user installs the app on their own account themselves, in GitHub's web pages. Nobody can do this
   for them: neither the extension nor the app's maintainer. The extension can only open the page,
   `github.com/apps/<slug>/installations/new`. There the user chooses **All repositories** or **Only select
   repositories**, reviews the permissions, and clicks **Install**. This is a visit to GitHub's own UI, with its
   choices and its list of permissions, on top of the Authorize page.
2. **Authorize** it by the device flow, as in Option A: code → `github.com/login/device` → an "Authorize" page listing
   the permissions → **Authorize**.

The extension can drive both. It knows the site's repository from the page's provenance record. It can open the
install page with the account and repository preselected (`suggested_target_id`, `repository_ids[]`, verify) and
poll `GET /user/installations` until the app appears.

### Copying a site: the case which decides it

- If the user installed the app on **All repositories**, a new repository is covered at once. A fork, a repository
  from a template and a bare one all behave as in Option A, with nothing to see on GitHub.
- If they chose **Only select repositories**, the new repository is **outside the installation**. The token creates
  it, then can't write to it.
  - The user must add it at Settings → Applications → Installed GitHub Apps → Configure → add the repository →
    Save. That's a visit to GitHub at exactly the moment we want none.
  - The extension can send them there, but can't do it for them.
  - Whether a user token may add a repository to its own installation through the API, `PUT
    /user/installations/{id}/repositories/{repo_id}`, needs checking (verify). If it may, this gap closes.
- An organisation account works the same way, with an organisation owner installing.

## Turning on GitHub Pages

The aim is that a non-technical user never touches GitHub's UI after signing in, and turning on Pages needs no visit
to it. The extension does it through the REST API:
- `POST /repos/{owner}/{repo}/pages`, with `{"source": {"branch": "main", "path": "/docs"}}`, publishes from a branch,
  as ponder does. Alternatively `{"build_type": "workflow"}` publishes through Actions.
- `GET /repos/{owner}/{repo}/pages` gives the site's URL and status, and `GET .../pages/builds/latest` gives the
  build's progress.
- The user must be an administrator of the repository. They are, of one they have just made.

What the token needs:
- **OAuth App: (verify) the Pages endpoints may demand the full `repo` scope, even for a public repository, not
  `public_repo`.** If so, Option A must ask for `repo` from the start. Asking at the moment of copying instead means a
  second Authorize page then. `repo` covers private repositories too, which makes the token broader still.
- **GitHub App:** the *Pages: write* permission, together with *Administration: write*.

Two further routes, neither better:
- A repository named `<user>.github.io` may be published from its default branch without being asked (verify). It
  only serves the user's one root site, though.
- A workflow in the template can't turn Pages on for itself, since its built-in `GITHUB_TOKEN` can't administer the
  repository (verify `actions/configure-pages` with `enablement: true`, which needs a stronger token).

The API call is the route to take. It removes every visit to GitHub's UI after sign-in, in either option.

## Side by side

| | OAuth App | GitHub App |
|-|-----------|------------|
| Registration by the maintainer | One form | One longer form |
| First use by a user | Authorize: one page, one click | Install (choose repositories, one click) and authorize (one click) |
| Edit a repository the user can write to | Works at once | Only if the app is installed on it, by its owner |
| A collaborator editing someone else's site | Works | Needs the owner to have installed the app |
| Fork, generate from template, create bare | Silent: nothing seen on GitHub | Silent with *All repositories*; otherwise a trip to the installation's settings each time |
| Breadth of a token | Every public repository the user can write to (`public_repo`), with full control | Only installed repositories, and only the permissions granted |
| Turning on Pages | By the API, nothing seen; perhaps needs the full `repo` scope (verify) | By the API, nothing seen |
| Visits to GitHub's UI by the user | One: the Authorize page | Two: install, then authorize. With *Only select repositories*, one more per new repository |
| Organisations | An owner may have to approve the app once | An owner installs the app |
| Token lifetime | Doesn't expire; revoked after a year unused (verify) | Doesn't expire, with expiry turned off |
| Rate limit | 5,000 requests an hour per user | Similar for user tokens (verify) |

## Things which hold for either

- **Forks of Pages sites.** A fork has GitHub Actions disabled until its owner turns them on (verify, including
  whether `PUT /repos/{owner}/{repo}/actions/permissions` may do so). A site published from a branch, as ponder is
  from `docs/`, doesn't depend on Actions, and avoids the question.
- **Fork or template.**
  - Each user may hold **one fork** of a repository, always public if the original is, and tied to it in GitHub's
    network.
  - A repository **generated from a template** takes any name, may be private, and carries no tie to the original.
  - For "start my own site from this one", a template is the better fit. For "propose a change to this site", a fork.
- **Timing.** A generated or forked repository may take some seconds before its contents can be read (verify). The
  extension should poll before writing to it, or before turning on Pages.
- **Publishing.** A Pages site appears a minute or so after it's turned on, at `<owner>.github.io/<repo>/`. The
  extension already knows when an edit is published, from the site's `fluid-trace.json`, and can apply the same check
  to a new site.

## Recommendation

For the least formality when a copy is made, **Option A, an OAuth App with `public_repo`**. After one Authorize
click on first use, forking, generating, creating and publishing need nothing on GitHub. It also covers collaborators.
Its cost is the breadth of the token, more so if the Pages API turns out to need the full `repo` scope. That breadth
should be stated plainly on the sign-in screen and in the store listing
(`STORE.md`).

Option B is narrower, but it is equally silent only if users choose *All repositories* at install. Its narrowness
then reduces to its finer permissions, while it costs a second step on first use. It's worth keeping in mind if
GitHub lets a user token add a repository to its own installation (above), or for organisations which forbid broad
OAuth tokens.

Don't reuse the `bioreportr-curation` app in either case: its permission is to Discussions alone, and should stay so.
