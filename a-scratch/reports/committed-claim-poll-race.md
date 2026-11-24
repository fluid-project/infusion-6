# A race between pages polling a committed claim

Context: `extension/test/framing-scenario.js` began failing about half of its runs once puppeteer was upgraded from
19.4.0 to 25.18.1 - under 19 its Chromium never launched on this machine, so it may have failed this way before unseen.
It timed out at its step 4, waiting up to 30s for the list page to reload to the published footer:

```
not ok - scenario threw: TimeoutError: Waiting failed: 30000ms exceeded
    at .../extension/test/framing-scenario.js:93:16
```

It failed so against both a build with the Infusion checkout and one with Infusion, wend and wend-theme-beautiful
installed from tarballs made by `npm pack`, and so wasn't a matter of packaging. The fault was in the page's editing,
`src/components/staticEditing/js/fluid-staticEditing.js`, and would be met by any user with two tabs open on one site.

## What the scenario does

The footer is part of the framing of every page, so a claim on its SFC is shown by every page of the site which is open.
The scenario holds two:

1. A post, from which the footer is edited and committed.
2. A list page, which shows the same claim, since the site is enlisted, without being edited from.

Once the claim is committed, the mock's Action rebuilds the site, and both pages are expected to reload to the published
footer, unmarked.

## Mechanism

While any claim is held, `fluid.staticEditing.poll` runs on each page every `pollInterval` - 15s by default, 1s as
`framing-scenario.js` sets it. Each poll did two things in turn:

1. **Reads each claim afresh** from the service worker (`claim-get`), since another page may have committed or
   discarded it. A claim found changed, or missing, was shown as it now stands - `showClaimOf(edit, path, fresh || null)`.
2. **Reconciles each committed claim with the published trace.** `fluid.staticEditing.reconcile` drops a claim whose
   hash the trace records (`claim-remove`) and reports it published; the page then marks its blocks "published -
   reloading the page", and reloads 1.5s later.

Both pages poll independently, and nothing orders them. Once the site is rebuilt:

- **The first page to poll** finds its claim in the trace, removes it from the service worker's store, and reloads -
  correctly.
- **The second page**, at its next poll, reads the claim afresh in step 1 and finds it gone. It showed it as missing,
  i.e. with `showClaimOf(..., null)`, which for framing restores the blocks *as the page was loaded* - from before the
  edit. Its claims were then empty, so step 2 found nothing committed to reconcile, and `poll` stopped scheduling
  itself, since it only polls while claims are held.

The second page was left showing the old footer, unmarked, and never reloaded. The scenario waits on the list page, and
so failed whenever the post page happened to poll first - about half the time, as their timers were started a few
seconds apart and drift.

## Who meets it

Not only the test: a user editing the framing - the footer, the navbar, the site's configuration - with several tabs of
the site open, as is likely, since the framing's claim is shown on every page. Every tab but the first to poll would
quietly revert to the content from before the edit, though the edit had been published, and stay so until reloaded by
hand. The same holds for a claim on a post's own source shown in two tabs of that post.

## Fix

In `fluid.staticEditing.poll`, a claim which this page holds as **committed** and which has vanished from the service
worker's store is taken to be published - removed by another page which reconciled it first - and the page reloads, as
it does for a claim it reconciles itself:

```js
if (!fresh && claim.state === "committed") {
    published = true;
} else if (!fresh || fresh.state !== claim.state || fresh.hash !== claim.hash) {
    await fluid.staticEditing.showClaimOf(edit, claim.path, fresh || null);
}
```

A claim which vanishes while **uncommitted** - discarded from another page - is still shown as missing, without a
reload, as before: the page as loaded is then the right thing to show.

### Why reloading is safe in every case

A committed claim can leave the store in three ways:

1. **Reconciled by another page** - the case above. The rebuilt site holds the edit, and reloading shows it.
2. **Found published by a page newly opened** - `fluid.staticEditing.current` drops a claim whose hash is that the page
   was built from. Again the site holds the edit.
3. **Discarded after committing** - *Discard edits* is enabled in any state of a claim (`discardDisabled: !state`).
   Discarding a committed claim only stops tracking it: the commit stands. Reloading shows whatever is published now,
   with or without the edit according to whether the rebuild has finished - which is the truth, where the page as
   loaded is stale.

The only other removal, of a new post's claim as it is retitled (`fluid.staticEditing.retitleNewPost`), happens only
before it is committed, and so is untouched by the fix.

In no case does a reload lose anything held only by the page: claims live in the service worker's storage, not in the
page.

### Consequences

- The vanished claim stays in this page's own set for the rest of that poll, so `reconcile` may run on it too, and ask
  for a second `claim-remove`, of a claim already gone, which is harmless.
- By polling alone, the page reloads up to one `pollInterval` after the first page did, not at once - closed by the
  service worker's notice, below.

## The service worker's notice of removal

The poll's fix relies on a page having seen the claim as committed before it vanishes. A page which still held it as
uncommitted - having not polled between the commit and the publication, e.g. a tab throttled in the background - would
take its disappearance for a discard, and show the page as loaded, without reloading. Polling can't tell the two
apart; only the page which removed the claim knows why. So each removal now says why, and every other page is told:

1. **A reason on each `claim-remove`** sent by the page's editing: `"published"` from `fluid.staticEditing.reconcile`
   and `fluid.staticEditing.current`, `"discarded"` from `fluid.staticEditing.discard`, `"moved"` from
   `fluid.staticEditing.retitleNewPost`.
2. **The service worker tells every other tab** (`fluidEditBackground.tellRemoved` in `background.js`), once it has
   removed the claim: `{type: "fluid-edit-claim-removed", id, reason}`, by `chrome.tabs.sendMessage` to each tab but the
   sender's. A tab with no content script refuses it, and that is ignored. No permission is added -
   `chrome.tabs.query` gives tabs' ids without the `tabs` permission, and only tabs running the extension's content
   script can receive the message anyway.
3. **The content script passes it on** (`edit.js`) to its page as the DOM event `fluid-edit-claim-removed` - only if
   the claim is of the page's own repository, by the same test as the requests it relays (`edit.isOwnRepo`), and only
   once the page's editing has booted, since until then it shows no claim.
4. **The page responds** (`fluid.staticEditing.claimRemoved`): a claim it shows, removed as published, has the page
   reload, whatever state the page last knew it in; one removed as discarded or moved is shown gone, as before.

Reloading is done once however many times asked, by `fluid.staticEditing.reloadPublished`, since a page may be told
by a notice and find the claim published by its own poll alike; it also stops the page's polling.

The poll's rule for a vanished committed claim is kept as a fallback, for a notice which never arrives - e.g. a tab
whose content script was injected after the removal, or a service worker stopped before telling every tab.

A page script can send `claim-remove` with any reason for a claim of its own repository, and so could have other pages
of that repository reload. It could already remove the claim itself, which is worse; a reload loses nothing, since
claims are kept by the service worker, not the page.

## Tests

- `framing-scenario.js` now passes in every run: 9 of 9, six against the Infusion checkout and three against the
  tarballs, with the six other scenarios passing alongside.
- `extension/test/harness.js` now also sets a `pollInterval` of 2s in `harness.launch`, honoured only by a build bearing
  `fluid_testing`. This spares the other scenarios the default 15s per poll; it played no part in this fix, since
  `framing-scenario.js` sets 1s of its own.
- `extension/test/publish-race-scenario.js`, run by `npm run test:extension`, exercises the race deliberately rather
  than by chance. A post and a list page both show a claim on the footer. The list page is opened with a `pollInterval`
  of an hour - read as its editing boots - so that it never polls during the scenario, while the post polls every
  second. The post commits; the list page still holds the claim as uncommitted, which the scenario checks. The site is
  rebuilt, the post reconciles the claim and reloads, and the list page must then reload to the published footer.
  Only the service worker's notice can bring that about, since the list page never polls, and holds the claim as
  uncommitted besides. With the notice disabled (the call of `fluidEditBackground.tellRemoved`) it fails at that last
  step, timing out; with it, it passes every run.
- An earlier version froze the list page through the DevTools protocol (`Page.setWebLifecycleState`) after it had seen
  the claim committed, and so tested the poll's rule for a vanished committed claim. With the notice in place either
  would reload that page, so it no longer told them apart, and was replaced. The poll's rule has no scenario of its own;
  one would need the notice withheld, e.g. by a hook in the test build.
