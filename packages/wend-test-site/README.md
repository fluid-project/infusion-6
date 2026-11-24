# wend-test-site

The site which the scenario tests of the "Edit in Infusion" extension edit, in `extension/test` - see
[harness.js](../../extension/test/harness.js). It replaces the checkout of ponder which the scenarios once edited,
so that they depend only on what is in this repository, and on content kept for them.

- **What it holds:** a post with blocks and headings to edit, `content/post/2025-03-20-ui-as-code.md`; a list of
  posts; a page of documentation for links to offer, `content/docs/fluid-view.md`; images in `static/img`; and the
  theme's footer and the site's configuration as its framing - see `wend/editing.json`.
- **How it is built:** the mock GitHub copies it into a scratch repository, linking Infusion's root `node_modules`, in
  which npm has linked the workspaces `wend` and `wend-theme-beautiful`, and builds it with this checkout of Infusion.
  It needs no install of its own.
- **Before a release:** `npm run test:packed` installs a copy of it from the tarballs of Infusion, wend and
  wend-theme-beautiful made by `npm pack`, and runs the scenarios against that - see `scripts/testPacked.js`.

Its repository and branch, `fluid-project/wend-test-site` and `main`, are names for the mock alone - no such
repository is needed.
