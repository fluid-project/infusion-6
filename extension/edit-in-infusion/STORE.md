# Publishing "Edit in Infusion" to the Chrome Web Store

What the submission needs beyond the extension itself. The account, fee and submission are made by a human.

## Package

Zip the *contents* of this directory (`manifest.json` at the root of the zip). Before each submission bump `version`
in `manifest.json`. The release manifest must not bear `fluid_testing` - only the scenario tests' copy does (see
`extension/test/harness.js`).

## Listing

- **Name**: Edit in Infusion
- **Summary** (132 characters at most): Edit a statically published site in place - in the page, or as markdown -
  and commit your edits to its GitHub repository.
- **Category**: Developer Tools (or Productivity)
- **Icon**: `icons/icon-128.png`
- **Screenshots**: 1280×800 - e.g. a post edited in place with the toolbar showing; the markdown source unfolded
  beside the page; the footer, edited as framing, marked on another page
- **Privacy policy**: https://ponder.org.uk/edit-in-infusion-privacy/
- **Visibility**: unlisted at first

## Single purpose

Editing, in place, the pages of statically published websites which advertise their sources, and committing the
edits to the sites' GitHub repositories.

## Permission justifications

- **activeTab**: when the user clicks the extension's action, it reads the page's provenance record - the description of
  the files the page was built from - and opens its editor in that page. It does nothing on a page until clicked.
- **scripting**: on a click, injects the extension's editor into the page in hand; for a site the user has granted
  access to, registers the same scripts for the site's pages, so that they show the user's unpublished edits.
- **contextMenus**: adds *Sign out of GitHub* to the menu of the extension's button, shown while the user is signed
  in.
- **storage**: keeps the user's GitHub sign-in (its token), and their settings, in the extension's own storage.
- **Host permission https://api.github.com/***: reads the site's source files, and commits the user's edits once they
  have pressed Commit and confirmed the commit in the extension's own window, through GitHub's API with the user's
  token.
- **Host permission https://github.com/***: signs the user in to GitHub when they press *Sign in with GitHub* in the
  options, by GitHub's device flow - asking GitHub for the code shown to the user, then for the token once they have
  authorized the extension at GitHub. These endpoints of GitHub's don't serve web pages' cross-origin requests.
- **Optional host permissions http://\*/\*, https://\*/\***: requested for one site at a time, only when the user
  clicks the extension's action on it, so that the site's pages show the edits the user holds for them. Withdrawn
  from the extension's options.

## Remote code

The extension runs none in its own contexts - its service worker, its content script and its pages are all in the
package. To edit a page exactly as the site's build renders it, it asks the page to load *the site's own* published
scripts - its markdown renderer and its copy of Infusion, which the page's provenance record names, and which holds
the editing panel itself, Infusion's `src/components/staticEditing/` - into the page's own context, as the site's
pages themselves load them. These run with the page's privileges, not the extension's, and never see the user's token
or the extension's storage: they ask the content script, by DOM events, for what only the extension may do, which it
answers only on the repository the page names, and every commit is shown to the user, with its change, in a window of
the extension's own (`confirm.html`) which no script of the page can reach. Reviewers may read this as remotely hosted
code, since the editor's interface is the site's own published code - say so plainly in the submission.

## Data disclosures

Handles **authentication information** (the user's GitHub token) and **website content** (the pages and source
files of sites the user edits). Neither is sold, transferred to third parties beyond GitHub for the purpose of
committing the user's edits, nor used for anything unrelated to the extension's single purpose.

## Before going public

The OAuth App "Edit in Infusion" is registered, with *Enable Device Flow* ticked, and its client id is set as
`fluidGitHub.clientId` in `js/github.js`. See ponder's `packages/wend/notes/github-sign-in.md` for the choice of an OAuth App over a GitHub App. The
scope asked for is `public_repo`, which lets the extension write to every public repository the user can write to.
State this plainly in the listing's description.
