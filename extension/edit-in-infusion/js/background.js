"use strict";

// The service worker of "Edit in Infusion" - see a-scratch/reports/0-live-static-editing.md in Infusion 6. It holds
// what the pages edited must not reach: the claims, in IndexedDB on the extension's origin (claims.js), and the GitHub
// token, with which it reads and commits sources (github.js). The content script, edit.js, which shares its DOM with
// the page, asks it for these by message.

importScripts("claims.js", "github.js");

/**
 * Commit claims together, as one commit, moving each to "committed" - or, should any file of them have changed since
 * its base, committing none, and moving those claims holding such a file to "conflict". A single claim of one file is
 * written by the Contents API, and any more as a changeset
 * @param {String[]} ids - The claims' keys - those not uncommitted, or gone, are passed over
 * @return {Promise<Claim[]>} The claims as they now stand, in the order of `ids`, null for any gone
 */
const commitClaims = async function (ids) {
    const found = await Promise.all(ids.map(id => fluidClaims.get(id)));
    const claims = found.filter(claim => claim && claim.state === "uncommitted");
    if (claims.length > 0) {
        const first = claims[0];
        const extraOf = claim => claim.files ? Object.entries(claim.files) : [];
        const messageOf = claim => (claim.baseSha ? "Edit " + claim.path + " in place, from " : "Create " + claim.path + ", from ") + claim.page;
        let message;
        if (claims.length === 1) {
            const extra = extraOf(first);
            message = messageOf(first) + (extra.length ? ", with " + extra.map(([path]) => path).join(", ") : "");
        } else {
            message = "Edit " + claims.length + " sources in place\n\n" + claims.map(claim => " - " + messageOf(claim) +
                (extraOf(claim).length ? ", with " + extraOf(claim).map(([path]) => path).join(", ") : "")).join("\n");
        }
        // Each path once - a further file shared by two claims, e.g. a widget's SFC, is written as the later holds it
        const byPath = {};
        claims.forEach(claim => {
            byPath[claim.path] = {path: claim.path, content: fluidGitHub.encode(claim.text), baseSha: claim.baseSha};
            extraOf(claim).forEach(([path, file]) => {
                byPath[path] = {path, content: file.content, baseSha: file.baseSha};
            });
        });
        const files = Object.values(byPath);
        const result = claims.length === 1 && files.length === 1 ? await fluidGitHub.write({
            repo: first.repo,
            branch: first.branch,
            path: first.path,
            text: first.text,
            baseSha: first.baseSha,
            message
        }) : await fluidGitHub.commitChangeset({repo: first.repo, branch: first.branch, message, files});
        for (const claim of claims) {
            const paths = [claim.path, ...extraOf(claim).map(([path]) => path)];
            if (result.ok) {
                await fluidClaims.put({...claim, state: "committed", commitSha: result.commitSha, message: undefined});
            } else if (result.conflict && (!result.paths || result.paths.length === 0 || result.paths.some(path => paths.includes(path)))) {
                await fluidClaims.put({...claim, state: "conflict", message: result.message, conflicts: result.paths});
            } else if (result.conflict) {
                await fluidClaims.put({...claim, message: "Not committed, since another edit committed with it is in conflict - " + result.message});
            } else {
                await fluidClaims.put({...claim, message: result.message});
            }
        }
    }
    return Promise.all(ids.map(id => fluidClaims.get(id)));
};

/**
 * Commit a claim, moving it to "committed", or to "conflict" if the file has changed since the claim's base
 * @param {String} id - The claim's key
 * @return {Promise<Claim>} The claim as it now stands
 */
const commitClaim = async id => (await commitClaims([id]))[0];

// The commits awaiting the user's confirmation, each in a window of the extension's own, confirm.html, which no script
// of the page edited can reach - the panel which asks for a commit runs in the page's own world, as any of the page's
// scripts do, so that any of them could ask for one. Keyed by the id of the request, in the window's URL
const fluidConfirm = {pending: {}, requestCount: 0};

/**
 * Ask the user to review the claims which may be committed, in a window showing what each would commit, and to choose
 * which to commit - the one asked for first, and with it every other uncommitted claim on the same branch, e.g. one of
 * the framing, or of another page, edited in the same session
 * @param {Claim[]} claims - The claims, the one asked for first
 * @return {Promise<String[]>} Resolves the keys of the claims the user chose to commit - none, should they decline,
 * or close the window
 */
fluidConfirm.ask = function (claims) {
    const request = String(++fluidConfirm.requestCount) + "-" + Date.now();
    return new Promise(resolve => {
        fluidConfirm.pending[request] = {claims, resolve, windowId: null};
        chrome.windows.create({url: chrome.runtime.getURL("confirm.html?request=" + request), type: "popup", width: 680, height: 860},
            window => {
                if (fluidConfirm.pending[request]) {
                    fluidConfirm.pending[request].windowId = window ? window.id : null;
                }
            });
    });
};

/**
 * Settle a request for confirmation, closing its window
 * @param {String} request - The request's id
 * @param {String[]} chosen - The keys of the claims the user chose to commit, none if they declined
 */
fluidConfirm.settle = function (request, chosen) {
    const pending = fluidConfirm.pending[request];
    if (pending) {
        delete fluidConfirm.pending[request];
        // Only claims offered may be chosen
        pending.resolve(chosen.filter(id => pending.claims.some(claim => claim.id === id)));
        if (pending.windowId !== null) {
            chrome.windows.remove(pending.windowId, () => chrome.runtime.lastError);
        }
    }
};

// A window closed before the user decides declines the commit
chrome.windows.onRemoved.addListener(windowId => {
    Object.entries(fluidConfirm.pending).filter(([, pending]) => pending.windowId === windowId)
        .forEach(([request]) => fluidConfirm.settle(request, []));
});

/**
 * Determine whether a message was sent by one of the extension's own pages, e.g. confirm.html, rather than by a content
 * script in a page of a site
 * @param {Object} sender - The message's sender
 * @return {Boolean} `true` if it was
 */
const fromExtensionPage = sender => sender.id === chrome.runtime.id && typeof(sender.url) === "string" && sender.url.startsWith(chrome.runtime.getURL(""));

/**
 * Commit a claim on the request of a page being edited, once the user has reviewed it - with every other uncommitted
 * claim on the same branch, which the user may choose to commit with it, as one commit
 * @param {String} id - The claim's key
 * @return {Promise<Claim>} The claim as it now stands
 */
const confirmAndCommit = async function (id) {
    const claim = await fluidClaims.get(id);
    let togo = claim;
    if (claim && claim.state === "uncommitted") {
        const others = (await fluidClaims.list()).filter(one => one.id !== id && one.state === "uncommitted" &&
            one.repo === claim.repo && one.branch === claim.branch).sort((a, b) => (b.updated || 0) - (a.updated || 0));
        const chosen = await fluidConfirm.ask([claim, ...others]);
        if (chosen.length > 0) {
            await commitClaims(chosen);
            togo = await fluidClaims.get(id);
        }
        if (!chosen.includes(id) && togo) {
            togo = await fluidClaims.put({...togo, message: chosen.length > 0 ? "not chosen for the commit" : "the commit was not confirmed"});
        }
    }
    return togo;
};

// Each handler receives the message and the sender, and returns a promise for the reply
const handlers = {
    "claim-get": message => fluidClaims.get(fluidClaims.idOf(message.repo, message.path)),
    "claim-put": message => fluidClaims.put({...message.claim, id: fluidClaims.idOf(message.claim.repo, message.claim.path)}),
    "claim-remove": async (message, sender) => {
        await fluidClaims.remove(message.id);
        fluidEditBackground.tellRemoved(message, sender);
        return true;
    },
    "claim-commit": (message, sender) => fromExtensionPage(sender) ? commitClaim(message.id) : confirmAndCommit(message.id),
    // What a request for confirmation may commit, for confirm.html - each claim, the one asked for first, with the text
    // it replaces
    "confirm-review": async function (message, sender) {
        const pending = fromExtensionPage(sender) ? fluidConfirm.pending[message.request] : undefined;
        let togo = null;
        if (pending) {
            togo = {claims: await Promise.all(pending.claims.map(async claim => {
                let baseText = claim.baseText;
                if (baseText === undefined && claim.baseSha) {
                    baseText = (await fluidGitHub.read(claim.repo, claim.branch, claim.path)).text;
                }
                return {claim, baseText: baseText ?? ""};
            }))};
        }
        return togo;
    },
    // The user's decision - `true` if it was awaited, and so acted on
    "confirm-decide": (message, sender) => {
        const awaited = fromExtensionPage(sender) && !!fluidConfirm.pending[message.request];
        if (awaited) {
            fluidConfirm.settle(message.request, message.confirmed && Array.isArray(message.ids) ? message.ids.map(String) : []);
        }
        return awaited;
    },
    // A window reviewing a commit is still open - the message itself keeps the service worker running while the user
    // reviews, since an idle one is stopped after 30s, losing the request it awaits. `true` if it is still awaited
    "confirm-alive": (message, sender) => fromExtensionPage(sender) && !!fluidConfirm.pending[message.request],
    // The claims held on the sources of a repository beneath a path, e.g. the new posts of a section
    "claim-list": async message => (await fluidClaims.list()).filter(claim => claim.repo === message.repo && claim.path.startsWith(message.prefix)),
    "source-read": message => fluidGitHub.read(message.repo, message.branch, message.path),
    // Where a source is shown on GitHub, and who last changed it, for the panel's header
    "source-history": message => fluidGitHub.history(message.repo, message.ref, message.path, message.anonymous !== false),
    // A source a site inherits from one of its bases, and the heads of its bases' branches - each read without
    // credentials, since the page names the repository
    "base-read": message => fluidGitHub.readPublic(message.repo, message.ref, message.path),
    "base-heads": message => fluidGitHub.baseHeads(message.bases || []),
    "bases-rebuild": message => fluidGitHub.rebuildFromBases(message),
    "signin-status": () => fluidGitHub.signInStatus(),
    // A page's report of what it is showing - marking the icon with a pencil while its editor is open, or while an edit
    // is held on it - see fluidEditBackground.markPage
    "fluid-provenance-found": async function (message, sender) {
        if (sender.tab) {
            const meaning = fluidEditBackground.markMeaning(message.claimState, message.open);
            chrome.action.setTitle({tabId: sender.tab.id, title: "Edit in Infusion - edit " + message.sourcePath + (meaning ? "\n" + meaning : "")});
            // A failure to mark the icon, e.g. of a tab since closed, is no concern of the page
            await fluidEditBackground.markPage(sender.tab.id, message.claimState ? "held" : message.open ? "editing" : null).catch(() => null);
        }
        return true;
    }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = handlers[message.type];
    let async = false;
    if (handler) {
        async = true;
        Promise.resolve(handler(message, sender)).then(
            result => sendResponse({ok: true, result}),
            error => sendResponse({ok: false, error: String(error && error.message || error)}));
    }
    // Returning true keeps the channel open for the asynchronous reply
    return async;
});

// The extension does nothing on a site until the user asks to edit a page of it, by *Edit this page* in the panel its
// action opens. That asks for access to the site, and, given it, *enlists* the site: the content scripts are
// registered for its pages, so that every page of it then shows the claims held on its sources without a click.
// Without access, e.g. if the user declines, the temporary access which opening the panel grants (activeTab) serves
// the page in hand alone. Enlisted sites are listed, and may be forgotten, in the
// options page.
const fluidEditBackground = {
    // The content scripts, injected into a page in hand or registered for an enlisted site's pages
    scripts: ["js/edit.js"]
};

/**
 * Tell every other tab that a claim has been removed, and why - so that a page showing it learns at once that it was
 * published, and reloads, rather than at its next poll, or not at all if it never saw the claim committed. Each tab's
 * content script passes it on only to a page of the claim's repository - see edit.js. A tab with no content script
 * refuses the message, which is ignored
 * @param {Object} message - The "claim-remove" request - `{id, reason}`
 * @param {Object} sender - Its sender, whose own tab is not told
 */
fluidEditBackground.tellRemoved = async function (message, sender) {
    const notice = {type: "fluid-edit-claim-removed", id: message.id, reason: message.reason || "discarded"};
    const tabs = await chrome.tabs.query({});
    tabs.filter(tab => !sender.tab || tab.id !== sender.tab.id)
        .forEach(tab => chrome.tabs.sendMessage(tab.id, notice).catch(() => null));
};

/**
 * Make the match pattern of a site - its scheme and host, of any port
 * @param {String} url - A URL of the site
 * @return {String|null} The pattern, e.g. "https://ponder.org.uk/*", or null for a URL which is no web page
 */
fluidEditBackground.patternOf = function (url) {
    const parsed = url ? new URL(url) : null;
    return parsed && (parsed.protocol === "http:" || parsed.protocol === "https:") ? parsed.protocol + "//" + parsed.hostname + "/*" : null;
};

/**
 * Make the id of the registration of an enlisted site's content scripts
 * @param {String} pattern - The site's match pattern
 * @return {String} The id
 */
fluidEditBackground.registrationId = pattern => "site:" + pattern;

/**
 * Enlist a site, to which access has been granted - register the content scripts for its pages, once
 * @param {String} pattern - The site's match pattern
 * @return {Promise} Resolves once enlisted
 */
fluidEditBackground.enlist = async function (pattern) {
    const id = fluidEditBackground.registrationId(pattern);
    const existing = await chrome.scripting.getRegisteredContentScripts({ids: [id]});
    if (existing.length === 0) {
        await chrome.scripting.registerContentScripts([{
            id, matches: [pattern], js: fluidEditBackground.scripts,
            runAt: "document_idle", persistAcrossSessions: true
        }]);
    }
};

/**
 * Forget an enlisted site - unregister its content scripts, and give up access to it
 * @param {String} pattern - The site's match pattern
 * @return {Promise} Resolves once forgotten
 */
fluidEditBackground.forget = async function (pattern) {
    await chrome.scripting.unregisterContentScripts({ids: [fluidEditBackground.registrationId(pattern)]}).catch(() => null);
    await chrome.permissions.remove({origins: [pattern]}).catch(() => null);
};

/**
 * List the enlisted sites
 * @return {Promise<String[]>} Their match patterns
 */
fluidEditBackground.enlisted = async function () {
    const registered = await chrome.scripting.getRegisteredContentScripts();
    return registered.filter(script => script.id.startsWith("site:")).map(script => script.id.substring("site:".length));
};

/**
 * Inject the content scripts into a tab, unless they are there already, e.g. registered for an enlisted site
 * @param {Number} tabId - The tab
 * @return {Promise} Resolves once they are there
 */
fluidEditBackground.inject = async function (tabId) {
    const [probe] = await chrome.scripting.executeScript({target: {tabId}, func: () => !!window.fluidEditInjected});
    if (!probe.result) {
        await chrome.scripting.executeScript({target: {tabId}, files: fluidEditBackground.scripts});
    }
};

/**
 * Activate the editor in a tab - enlisting its site if access is granted, injecting the content scripts, and opening
 * the editor. The request for access is made first, while the click which provoked it still counts as the user's
 * @param {Object} tab - The tab
 * @param {Boolean} [alreadyGranted] - Whether access was granted already, by a request made elsewhere, e.g. in the
 * welcome panel - if absent, it is requested here
 * @return {Promise<Boolean>} Resolves once activated - `true` if the page had anything to edit
 */
fluidEditBackground.activateTab = async function (tab, alreadyGranted) {
    let activated = false;
    const pattern = fluidEditBackground.patternOf(tab.url);
    if (pattern) {
        const asked = alreadyGranted === undefined ? chrome.permissions.request({origins: [pattern]}).catch(() => false) : alreadyGranted;
        const granted = await asked || await chrome.permissions.contains({origins: [pattern]});
        if (granted) {
            await fluidEditBackground.enlist(pattern);
        }
        await fluidEditBackground.inject(tab.id);
        activated = await chrome.tabs.sendMessage(tab.id, {type: "fluid-edit-activate"}).then(() => true, () => {
            // A page with no provenance record, whose content script listens for nothing
            chrome.action.setTitle({tabId: tab.id, title: "Edit in Infusion - this page has nothing to edit"});
            return false;
        });
    } else {
        chrome.action.setTitle({tabId: tab.id, title: "Edit in Infusion - not available on this page"});
    }
    return activated;
};

// Signing in, by GitHub's device flow - see fluidGitHub.startSignIn in github.js. The sign-in is begun from the welcome
// panel (popup.html), or the options page, either of which shows the user their code. The service worker polls GitHub
// itself, since the panel closes as soon as the user turns to GitHub's page. Each poll touches the extension's
// storage, which keeps the service worker running between polls. Until the user is signed in, a click of the
// extension's action opens the panel (popup.html), which talks them through connecting their account. Signed in, the
// panel shows the account, offers to edit the page if it is editable, and to sign out. Every click opens the panel.
const fluidSignIn = {
    timer: null
};

/**
 * Bring the menu of the extension's button up to date with whether the user is signed in
 * @return {Promise} Resolves once brought up to date
 */
fluidSignIn.refreshPopup = async function () {
    await fluidSignIn.refreshMenu(await fluidGitHub.signInStatus());
};

// The item of the menu of the extension's action - opened by right-clicking its button - which signs out
fluidSignIn.menuId = "fluid-signout";

/**
 * Show the item signing out in the menu of the extension's action while the user is signed in, naming their account
 * @param {Object} status - The status of signing in, as fluidGitHub.signInStatus gives it
 * @return {Promise} Resolves once shown
 */
fluidSignIn.refreshMenu = async function (status) {
    const title = "Sign out of GitHub" + (status.login ? " (" + status.login + ")" : "");
    // In the callback's form, which every version of Chrome supports - the item may not exist yet, before onInstalled
    await new Promise(resolve => chrome.contextMenus.update(fluidSignIn.menuId, {title, visible: status.signedIn}, () => {
        resolve(chrome.runtime.lastError);
    }));
};

/**
 * Tell any open page of the extension, e.g. the welcome panel or the options, that a sign-in has ended
 * @param {SignInPoll} result - How it ended
 */
fluidSignIn.broadcast = function (result) {
    chrome.runtime.sendMessage({type: "signin-ended", result}).catch(() => {
        // No page of the extension is open to hear it
    });
};

/**
 * Poll GitHub after an interval
 * @param {Number} interval - The interval, in seconds
 */
fluidSignIn.schedule = function (interval) {
    clearTimeout(fluidSignIn.timer);
    fluidSignIn.timer = setTimeout(fluidSignIn.poll, interval * 1000);
};

/**
 * Poll GitHub once for the outcome of the sign-in in progress, and again later while it is pending. Once signed in,
 * return the user to the tab they began from, and open the welcome panel there, where the browser allows it
 * @return {Promise} Resolves once polled
 */
fluidSignIn.poll = async function () {
    fluidSignIn.timer = null;
    let result;
    try {
        result = await fluidGitHub.pollSignIn();
    } catch (error) {
        await chrome.storage.session.remove("githubSignIn");
        result = {state: "error", message: String(error && error.message || error)};
    }
    if (result.state === "pending") {
        fluidSignIn.schedule(result.interval);
    } else {
        const {githubSignInView: view} = await chrome.storage.session.get("githubSignInView");
        await chrome.storage.session.remove("githubSignInView");
        await fluidSignIn.refreshPopup();
        fluidSignIn.broadcast(result);
        if (result.state === "signed-in" && view && view.tabId) {
            await chrome.tabs.update(view.tabId, {active: true}).catch(() => null);
            // Opening the panel unbidden is allowed from Chrome 127 - before then, the ticked icon invites a click. It is not
            // awaited, since it may never settle, e.g. in a window without focus
            await fluidSignIn.markTab(view.tabId, true).catch(() => null);
            if (chrome.action.openPopup) {
                chrome.action.openPopup().catch(() => null);
            }
        }
    }
};

/**
 * Draw the extension's icon at a size, marked with a tick, centred on a disc at its lower right, to show that the user
 * is signed in. Drawn rather than given as a badge, whose glyph Chrome places itself
 * @param {Number} size - The icon's size, in pixels
 * @return {Promise<ImageData>} The icon
 */
fluidSignIn.drawTickedIcon = async function (size) {
    // The logo keeps its full size, level with other extensions' icons - the disc, unlike Chrome's own badge, can't
    // extend beyond the icon's square
    const blob = await (await fetch(chrome.runtime.getURL("icons/icon-" + size + ".png"))).blob();
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d");
    context.drawImage(await createImageBitmap(blob), 0, 0, size, size);
    // A whole diameter, so that the disc lies on the pixel grid, and its tick is drawn crisply - 11 pixels across at 16
    const radius = Math.round(size * 0.6875) / 2, cx = size - radius, cy = size - radius;
    context.fillStyle = "#2b6cb0";
    context.beginPath();
    context.arc(cx, cy, radius, 0, 2 * Math.PI);
    context.fill();
    // The tick spans the disc's centre, its bounding box from -0.5 to 0.5 of the radius across, and -0.38 to 0.38 down
    context.strokeStyle = "#fff";
    context.lineWidth = Math.max(1.5, size / 10);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(cx - radius * 0.5, cy + radius * 0.02);
    context.lineTo(cx - radius * 0.14, cy + radius * 0.38);
    context.lineTo(cx + radius * 0.5, cy - radius * 0.38);
    context.stroke();
    return context.getImageData(0, 0, size, size);
};

/**
 * Draw the extension's icon at a size, overlaid with a pencil across its lower right - blue while the page's editor is
 * open, amber while an edit is held on the page. Drawn rather than given as a badge, whose glyph Chrome places itself,
 * and on no disc, so that it reads at the icon's small size
 * @param {Number} size - The icon's size, in pixels
 * @param {String} colour - The pencil's colour
 * @return {Promise<ImageData>} The icon
 */
fluidEditBackground.drawPencilIcon = async function (size, colour) {
    const blob = await (await fetch(chrome.runtime.getURL("icons/icon-" + size + ".png"))).blob();
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d");
    context.drawImage(await createImageBitmap(blob), 0, 0, size, size);
    // The pencil is drawn along the diagonal rising from its tip at the lower left of its quadrant - in units of the
    // icon's size, its length and width, and the length of its sharpened tip
    const length = 0.62, width = 0.24, tipLength = 0.2;
    context.save();
    context.translate(size * 0.34, size * 0.9);
    context.rotate(-Math.PI / 4);
    context.scale(size, size);
    const outline = function () {
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(tipLength, -width / 2);
        context.lineTo(length, -width / 2);
        context.lineTo(length, width / 2);
        context.lineTo(tipLength, width / 2);
        context.closePath();
    };
    // A white rim, so that the pencil stands out from the icon beneath it, then the pencil itself
    context.lineJoin = "round";
    context.lineWidth = Math.max(2, size / 8) / size;
    context.strokeStyle = "#fff";
    outline();
    context.stroke();
    context.fillStyle = colour;
    outline();
    context.fill();
    // Its tip, bared of paint
    context.fillStyle = "#f3d9a4";
    context.beginPath();
    context.moveTo(tipLength * 0.45, -width * 0.225);
    context.lineTo(tipLength, -width / 2);
    context.lineTo(tipLength, width / 2);
    context.lineTo(tipLength * 0.45, width * 0.225);
    context.closePath();
    context.fill();
    context.restore();
    return context.getImageData(0, 0, size, size);
};

// The colours of the pencil overlaid on the icon, for each mark a page may bear - see fluidEditBackground.markPage
fluidEditBackground.pencilColours = {
    editing: "#2b6cb0",
    held: "#c77800"
};

/**
 * Explain the pencil marking the extension's icon, as the second line of its tooltip - see fluidEditBackground.markPage
 * @param {String|null} claimState - The state of the first claim held on a source the page renders, e.g. "uncommitted"
 * or "committed", or `null` if none is held
 * @param {Boolean} open - `true` if the page's editor is open
 * @return {String} The explanation, or "" if the icon bears no pencil
 */
fluidEditBackground.markMeaning = function (claimState, open) {
    const panel = open ? " - the edit panel is open" : "";
    return claimState === "committed" ? "Amber pencil: your edits are committed, and wait for the site to be rebuilt" + panel :
        claimState === "conflict" ? "Amber pencil: your edits conflict with a change made meanwhile in the repository" + panel :
            claimState ? "Amber pencil: you have edits held in this browser, not yet committed" + panel :
                open ? "Blue pencil: the edit panel is open, with no edits held" : "";
};

/**
 * Mark the extension's icon in a tab for its page - a blue pencil while its editor is open, an amber one while an edit
 * is held on a source it renders, whether or not the editor is open, and none otherwise
 * @param {Number} tabId - The tab
 * @param {String|null} mark - "editing", "held", or `null` for none
 * @return {Promise} Resolves once marked
 */
fluidEditBackground.markPage = async function (tabId, mark) {
    if (mark) {
        const colour = fluidEditBackground.pencilColours[mark];
        const imageData = {16: await fluidEditBackground.drawPencilIcon(16, colour), 32: await fluidEditBackground.drawPencilIcon(32, colour)};
        await chrome.action.setIcon({tabId, imageData});
    } else {
        await chrome.action.setIcon({tabId, path: {16: "/icons/icon-16.png", 32: "/icons/icon-32.png"}});
    }
};

/**
 * Mark, or unmark, the extension's icon in a tab with a tick, showing that the user is signed in there
 * @param {Number} tabId - The tab
 * @param {Boolean} ticked - Whether to mark it
 * @return {Promise} Resolves once marked
 */
fluidSignIn.markTab = async function (tabId, ticked) {
    if (ticked) {
        const imageData = {16: await fluidSignIn.drawTickedIcon(16), 32: await fluidSignIn.drawTickedIcon(32)};
        await chrome.action.setIcon({tabId, imageData});
    } else {
        await chrome.action.setIcon({tabId, path: {16: "/icons/icon-16.png", 32: "/icons/icon-32.png"}});
    }
};

/**
 * Begin signing in, and poll for its outcome
 * @param {Object} message - The message asking, holding the `tabId` of the tab the user began from, if any
 * @return {Promise<SignInStart>} What the user is to be shown
 */
fluidSignIn.start = async function (message) {
    const started = await fluidGitHub.startSignIn();
    await chrome.storage.session.set({githubSignInView: {...started, tabId: message.tabId}});
    fluidSignIn.schedule(started.interval);
    return started;
};

/**
 * Give up a sign-in in progress
 * @return {Promise} Resolves once given up
 */
fluidSignIn.cancel = async function () {
    clearTimeout(fluidSignIn.timer);
    fluidSignIn.timer = null;
    await chrome.storage.session.remove(["githubSignIn", "githubSignInView"]);
};

handlers["signin-start"] = message => fluidSignIn.start(message);
// The sign-in in progress, as shown to the user, so that the panel shows its code again when reopened
handlers["signin-view"] = async () => (await chrome.storage.session.get("githubSignInView")).githubSignInView || null;
handlers["signin-cancel"] = () => fluidSignIn.cancel();
handlers["signin-refresh"] = () => fluidSignIn.refreshPopup();
handlers.signout = async function () {
    await fluidSignIn.cancel();
    await fluidGitHub.signOut();
    await fluidSignIn.refreshPopup();
};
// The user starts editing from the panel. The panel first declares its intent, then asks for access to the site, then
// asks for the editor - but Chrome may close the panel while it asks for access, so that the editor is also opened
// when access is granted to the site of the tab intended. Whichever comes first opens it, once
fluidEditBackground.pendingEdit = null;

/**
 * Open the editor in the tab the panel intended, if it is still intended
 * @param {Number} tabId - The tab
 * @param {Boolean} granted - Whether access to its site was granted
 * @return {Promise<Boolean>} `true` if the page had anything to edit, or was opened already
 */
fluidEditBackground.editIntended = async function (tabId, granted) {
    let togo = true;
    if (fluidEditBackground.pendingEdit && fluidEditBackground.pendingEdit.tabId === tabId) {
        fluidEditBackground.pendingEdit = null;
        await fluidSignIn.markTab(tabId, false).catch(() => null);
        togo = await fluidEditBackground.activateTab(await chrome.tabs.get(tabId), granted);
    }
    return togo;
};

handlers["panel-edit-intent"] = async function (message) {
    fluidEditBackground.pendingEdit = {tabId: message.tabId, pattern: message.pattern};
};
handlers["panel-edit"] = message => fluidEditBackground.editIntended(message.tabId, message.granted);

chrome.permissions.onAdded.addListener(permissions => {
    // Access granted to a site enlists it, however late the grant comes - the panel does not wait for it
    (permissions.origins || []).forEach(pattern => fluidEditBackground.enlist(pattern).catch(() => null));
    const pending = fluidEditBackground.pendingEdit;
    if (pending && (permissions.origins || []).includes(pending.pattern)) {
        fluidEditBackground.editIntended(pending.tabId, true).catch(() => null);
    }
});

/**
 * Determine whether the page in a tab can be edited - whether it bears a Fluid provenance record. Read through the
 * access which opening the panel grants to the tab in hand (activeTab)
 * @param {Object} message - The message asking, holding the `tabId` of the tab
 * @return {Promise<Object>} `{editable, reason}` - `reason` saying why not, if it is not
 */
handlers["tab-editable"] = async function (message) {
    const tab = await chrome.tabs.get(message.tabId);
    const pattern = fluidEditBackground.patternOf(tab.url);
    let togo;
    if (pattern) {
        const [probe] = await chrome.scripting.executeScript({target: {tabId: tab.id},
            func: () => !!document.querySelector("script[type=\"application/fluid-provenance+json\"]")}).catch(() => [{result: false}]);
        togo = probe.result ? {editable: true} : {editable: false, reason: "This page isn't editable - it wasn't built by a site which can be edited in place"};
    } else {
        togo = {editable: false, reason: "This page isn't editable - open a page of a site which can be edited in place"};
    }
    return togo;
};

handlers["sites-list"] = () => fluidEditBackground.enlisted();
handlers["site-forget"] = message => fluidEditBackground.forget(message.pattern);

// The menu item is created once, when the extension is installed or updated, and persists thereafter
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({id: fluidSignIn.menuId, title: "Sign out of GitHub", contexts: ["action"], visible: false},
        () => fluidSignIn.refreshPopup().catch(() => null));
    // The registrations of sites enlisted by an earlier version are brought into line with this one's content scripts -
    // e.g. since the panel's styles became those of Infusion's fluid.staticEditor, there is no stylesheet to inject
    chrome.scripting.getRegisteredContentScripts().then(scripts => scripts.length > 0 ? chrome.scripting.updateContentScripts(
        scripts.map(script => ({id: script.id, js: fluidEditBackground.scripts, css: []}))) : null).catch(() => null);
});

chrome.contextMenus.onClicked.addListener(info => {
    if (info.menuItemId === fluidSignIn.menuId) {
        handlers.signout().catch(() => null);
    }
});

// Whenever the service worker starts: bring the menu up to date, and resume polling a sign-in in progress
fluidSignIn.refreshPopup().catch(() => null);
// A token saved or forgotten by any means, e.g. given in the options, changes the menu
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.githubToken) {
        fluidSignIn.refreshPopup().catch(() => null);
    }
});
chrome.storage.session.get("githubSignIn").then(stored => {
    if (stored.githubSignIn) {
        fluidSignIn.schedule(1);
    }
});


