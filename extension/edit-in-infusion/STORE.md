# Publishing "Edit in Infusion" to the Chrome Web Store

What the submission needs beyond the extension itself. The account, fee and submission are made by a human.

## Package

Zip the *contents* of this directory (`manifest.json` at the root of the zip). Before each submission bump `version`
in `manifest.json`. The release manifest must not bear `fluid_testing` - only the scenario tests' copy does (see
`extension/test/harness.js`). `lib/codemirror6.js` is a minified, not obfuscated, bundle of CodeMirror 6, built
reproducibly by `extension/codemirror/build.js` from the versions pinned in `extension/codemirror/package.json`.

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

- **activeTab**: when the user clicks the extension's action, it reads the page's linkage record - the description of
  the files the page was built from - and opens its editor in that page. It does nothing on a page until clicked.
- **scripting**: on a click, injects the extension's editor into the page in hand; for a site the user has granted
  access to, registers the same scripts for the site's pages, so that they show the user's unpublished edits.
- **storage**: keeps the user's GitHub token, and their settings, in the extension's own storage.
- **Host permission https://api.github.com/***: reads the site's source files, and commits the user's edits when they
  press Commit, through GitHub's Contents API with the user's token.
- **Optional host permissions http://\*/\*, https://\*/\***: requested for one site at a time, only when the user
  clicks the extension's action on it, so that the site's pages show the edits the user holds for them. Withdrawn
  from the extension's options.

## Remote code

The extension runs none. Its own code is all in the package. To render a preview exactly as the site's build does, it
asks the page to load *the site's own* published scripts - its markdown renderer and its copy of Infusion, which the
page's linkage record names - into the page's own context, as the site's pages themselves load them. These run with
the page's privileges, not the extension's, and never see the user's token or the extension's storage.

## Data disclosures

Handles **authentication information** (the user's GitHub token) and **website content** (the pages and source
files of sites the user edits). Neither is sold, transferred to third parties beyond GitHub for the purpose of
committing the user's edits, nor used for anything unrelated to the extension's single purpose.

## Before going public

Replace the pasted token with GitHub's device flow, from a GitHub App given *Contents: read and write* and installed
on the repositories edited - see a-scratch/reports/0-live-static-editing.md, section 3.10.
