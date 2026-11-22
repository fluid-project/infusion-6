"use strict";

// The service worker of "Edit in Infusion" - see a-scratch/reports/0-live-static-editing.md in Infusion 6. It holds
// what the pages edited must not reach: the claims, in IndexedDB on the extension's origin (claims.js), and the GitHub
// token, with which it reads and commits sources (github.js). The content script, edit.js, which shares its DOM with
// the page, asks it for these by message.

importScripts("claims.js", "github.js");

/**
 * Commit a claim, moving it to "committed", or to "conflict" if the file has changed since the claim's base
 * @param {String} id - The claim's key
 * @return {Promise<Claim>} The claim as it now stands
 */
const commitClaim = async function (id) {
    const claim = await fluidClaims.get(id);
    let togo = claim;
    const extra = claim && claim.files ? Object.entries(claim.files) : [];
    if (claim && claim.state === "uncommitted") {
        const message = (claim.baseSha ? "Edit " + claim.path + " in place, from " : "Create " + claim.path + ", from ") + claim.page;
        // A claim of one file is written by the Contents API, and one with further files as a changeset, in one commit
        const result = extra.length > 0 ? await fluidGitHub.commitChangeset({
            repo: claim.repo,
            branch: claim.branch,
            message: message + (extra.length ? ", with " + extra.map(([path]) => path).join(", ") : ""),
            files: [{path: claim.path, content: fluidGitHub.encode(claim.text), baseSha: claim.baseSha},
                ...extra.map(([path, file]) => ({path, content: file.content, baseSha: file.baseSha}))]
        }) : await fluidGitHub.write({
            repo: claim.repo,
            branch: claim.branch,
            path: claim.path,
            text: claim.text,
            baseSha: claim.baseSha,
            message
        });
        if (result.ok) {
            togo = await fluidClaims.put({...claim, state: "committed", commitSha: result.commitSha, message: undefined});
        } else if (result.conflict) {
            togo = await fluidClaims.put({...claim, state: "conflict", message: result.message, conflicts: result.paths});
        } else {
            togo = await fluidClaims.put({...claim, message: result.message});
        }
    }
    return togo;
};

// Each handler receives the message and the sender, and returns a promise for the reply
const handlers = {
    "claim-get": message => fluidClaims.get(fluidClaims.idOf(message.repo, message.path)),
    "claim-put": message => fluidClaims.put({...message.claim, id: fluidClaims.idOf(message.claim.repo, message.claim.path)}),
    "claim-remove": message => fluidClaims.remove(message.id),
    "claim-commit": message => commitClaim(message.id),
    // The claims held on the sources of a repository beneath a path, e.g. the new posts of a section
    "claim-list": async message => (await fluidClaims.list()).filter(claim => claim.repo === message.repo && claim.path.startsWith(message.prefix)),
    "source-read": message => fluidGitHub.read(message.repo, message.branch, message.path),
    "fluid-linkage-found": async function (message, sender) {
        if (sender.tab) {
            chrome.action.setBadgeText({tabId: sender.tab.id, text: message.claimState ? "●" : "✎"});
            chrome.action.setBadgeBackgroundColor({tabId: sender.tab.id, color: message.claimState ? "#c77800" : "#2b6cb0"});
            chrome.action.setTitle({tabId: sender.tab.id, title: "Edit in Infusion - edit " + message.sourcePath});
        }
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

// The extension does nothing on a site until its action is clicked there. A click asks for access to the site, and,
// given it, *enlists* the site: the content scripts are registered for its pages, so that every page of it then shows
// the claims held on its sources without a click. Without access, e.g. if the user declines, the click's own
// temporary access (activeTab) serves the page in hand alone. Enlisted sites are listed, and may be forgotten, in the
// options page.
const fluidEditBackground = {
    // The content scripts, injected into a page in hand or registered for an enlisted site's pages
    scripts: ["lib/codemirror6.js", "js/sourceView.js", "js/fluid-zip.js", "js/edit.js"],
    styles: ["css/edit.css"]
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
            id, matches: [pattern], js: fluidEditBackground.scripts, css: fluidEditBackground.styles,
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
        await chrome.scripting.insertCSS({target: {tabId}, files: fluidEditBackground.styles});
        await chrome.scripting.executeScript({target: {tabId}, files: fluidEditBackground.scripts});
    }
};

/**
 * Activate the editor in a tab - enlisting its site if access is granted, injecting the content scripts, and opening
 * the editor. The request for access is made first, while the click which provoked it still counts as the user's
 * @param {Object} tab - The tab
 * @return {Promise} Resolves once activated
 */
fluidEditBackground.activateTab = async function (tab) {
    const pattern = fluidEditBackground.patternOf(tab.url);
    if (pattern) {
        const asked = chrome.permissions.request({origins: [pattern]}).catch(() => false);
        const granted = await asked || await chrome.permissions.contains({origins: [pattern]});
        if (granted) {
            await fluidEditBackground.enlist(pattern);
        }
        await fluidEditBackground.inject(tab.id);
        await chrome.tabs.sendMessage(tab.id, {type: "fluid-edit-activate"}).catch(() => {
            // A page with no linkage record, whose content script listens for nothing
            chrome.action.setTitle({tabId: tab.id, title: "Edit in Infusion - this page has nothing to edit"});
        });
    } else {
        chrome.action.setTitle({tabId: tab.id, title: "Edit in Infusion - not available on this page"});
    }
};

handlers["sites-list"] = () => fluidEditBackground.enlisted();
handlers["site-forget"] = message => fluidEditBackground.forget(message.pattern);

chrome.action.onClicked.addListener(tab => {
    fluidEditBackground.activateTab(tab).catch(error => {
        chrome.action.setTitle({tabId: tab.id, title: "Edit in Infusion - " + String(error && error.message || error)});
    });
});
