"use strict";

// The content script of "Edit in Infusion". On a page bearing a Fluid provenance record, written by the site's build
// (wend's js/trace.js), it makes the page editable in place by Infusion's own editing, loaded from the site's copy of
// Infusion: it loads the bridge into the page's own world (bridge.js), which boots the page's component tree over it
// and makes the editing panel, Infusion's fluid.staticEditor, whose logic is fluid-staticEditing.js. This it does on
// activation from the extension's action, or at once if a claim is held on a source the page renders, or if the panel
// was open as the user navigated to the page.
//
// The panel runs in the page's world, as any of the page's scripts do, and so holds nothing privileged. This script is
// its relay to the service worker, which holds the claims and the GitHub token: it answers the panel's requests, the
// DOM event "fluid-edit-relay-request", with "fluid-edit-relay-reply" - only those of the kinds listed in
// `edit.relayed`, and only on the repository the page names. A commit is confirmed by the user in a window of the
// extension's own, which no script of the page can reach - see "claim-commit" in background.js.

(function () {
    const provenanceNode = document.querySelector("script[type=\"application/fluid-provenance+json\"]");
    // The content scripts are in the page - see `inject` in background.js
    const injectedBefore = !!window.fluidEditInjected;
    window.fluidEditInjected = true;

    const edit = {
        provenance: null,
        bridgePromise: null,
        bootPromise: null,
        requestCount: 0,
        // How often the panel polls the published trace, in ms - a test against a mock GitHub may poll faster
        pollInterval: 15000,
        // The key, in the extension's storage, of the user's preferences for the panel
        prefsKey: "fluidEditPrefs",
        // The key, in the page's sessionStorage, by which the panel remembers that it is open - see fluid.staticEditing.rememberSession
        sessionKey: "fluid-edit-open",
        // The kinds of request the panel may relay to the service worker
        relayed: ["claim-get", "claim-put", "claim-remove", "claim-list", "claim-commit", "source-read", "source-history", "base-read", "base-heads", "bases-rebuild", "fluid-provenance-found", "prefs-set"]
    };

    /**
     * Send a message to the service worker, unwrapping its reply
     * @param {Object} message - The message
     * @return {Promise<Any>} The result of handling it
     */
    edit.send = async function (message) {
        const reply = await chrome.runtime.sendMessage(message);
        if (!reply || !reply.ok) {
            throw new Error(reply ? reply.error : "No reply from the extension");
        }
        return reply.result;
    };

    /**
     * Load the bridge into the page's own world - see bridge.js. It is the extension's own file, so this content
     * script may insert it
     * @return {Promise} Resolves once it has run
     */
    edit.loadBridge = function () {
        if (!edit.bridgePromise) {
            edit.bridgePromise = new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = chrome.runtime.getURL("js/bridge.js");
                script.onload = () => resolve();
                script.onerror = () => reject(new Error("Can't load the extension's bridge into the page"));
                document.head.appendChild(script);
            });
        }
        return edit.bridgePromise;
    };

    /**
     * Ask the bridge, in the page's own world, to do something - see bridge.js
     * @param {Object} request - The request, with its `op` and arguments
     * @return {Promise<Any>} The result
     */
    edit.ask = async function (request) {
        await edit.loadBridge();
        const id = String(++edit.requestCount);
        return new Promise((resolve, reject) => {
            const listener = event => {
                const reply = JSON.parse(event.detail);
                if (reply.id === id) {
                    document.removeEventListener("fluid-edit-bridge-reply", listener);
                    if (reply.error === undefined) {
                        resolve(reply.result);
                    } else {
                        reject(new Error(reply.error));
                    }
                }
            };
            document.addEventListener("fluid-edit-bridge-reply", listener);
            document.dispatchEvent(new CustomEvent("fluid-edit-bridge-request", {detail: JSON.stringify({...request, id})}));
        });
    };

    /**
     * Check that a request relayed from the page concerns only the repository and branch the page names
     * @param {Object} message - The request
     * @return {Boolean} `true` if it does
     */
    edit.isOwnRepo = function (message) {
        const {repo, branch} = edit.provenance;
        const ownId = id => typeof(id) === "string" && id.startsWith(repo + ":");
        let togo;
        if (message.type === "claim-put") {
            togo = !!message.claim && message.claim.repo === repo && message.claim.branch === branch;
        } else if (message.type === "claim-remove" || message.type === "claim-commit") {
            togo = ownId(message.id);
        } else if (message.type === "source-read" || message.type === "bases-rebuild") {
            togo = message.repo === repo && message.branch === branch;
        } else if (message.type === "claim-get" || message.type === "claim-list") {
            togo = message.repo === repo;
        } else {
            togo = true;
        }
        return togo;
    };

    /**
     * Answer a request of the panel, relaying it to the service worker - see `edit.relayed`
     * @param {Object} message - The request, with its `requestId` and `type`
     * @return {Promise<Any>} The result
     */
    edit.relay = async function (message) {
        let togo;
        if (!chrome.runtime || !chrome.runtime.id) {
            // Orphaned by the extension's reload or update, and not superseded by a fresh content script
            togo = Promise.reject(new Error("Edit in Infusion has been reloaded or updated since this page was opened - "
                + "copy any edit not yet held, then reload the page to go on editing"));
        } else if (!edit.relayed.includes(message.type) || !edit.isOwnRepo(message)) {
            togo = Promise.reject(new Error("The extension does not answer a request " + message.type + " of this page"));
        } else if (message.type === "prefs-set") {
            togo = chrome.storage.local.set({[edit.prefsKey]: message.prefs}).then(() => true);
        } else {
            const forwarded = {...message};
            delete forwarded.requestId;
            if (message.type === "source-history") {
                // Another repository's history, e.g. that of a base a source is inherited from, is read without the
                // token, since the page names the repository
                forwarded.anonymous = message.repo !== edit.provenance.repo;
            }
            togo = edit.send(forwarded);
        }
        return togo;
    };

    /**
     * Load the renderer of markdown which the page's provenance names - the site's own pipeline, published by its build
     * @return {Promise<Object>} The renderer's record from the provenance, `{scripts, global}`, or `{global: null}`
     */
    edit.loadRenderer = function () {
        const renderer = edit.provenance.renderers && edit.provenance.renderers.markdown;
        return renderer ? edit.ask({op: "load", scripts: renderer.scripts.map(script => new URL(script, location.href).href)}).then(() => renderer) :
            Promise.resolve({global: null});
    };

    /**
     * Make the page editable, once: boot its component tree over it, adapting the components rendering its blocks for
     * editing - see bridge.migrate - and make the editing panel, whose controller then shows any claim held
     * @return {Promise} Resolves once the panel is made
     */
    edit.boot = function () {
        if (!edit.bootPromise) {
            const absolute = url => new URL(url, location.href).href;
            const migration = edit.provenance.migration;
            edit.bootPromise = (async function () {
                if (!migration) {
                    throw new Error("the page was published by a build which offers no means of making it live");
                }
                // Infusion boots the page's tree over its markup once the page has loaded - as a page booting itself does
                if (document.readyState !== "complete") {
                    await new Promise(resolve => window.addEventListener("load", resolve, {once: true}));
                }
                const renderer = await edit.loadRenderer();
                await edit.ask({
                    op: "migrate",
                    migration: {
                        framework: {root: absolute(migration.framework.root), files: migration.framework.files},
                        modules: Object.fromEntries(Object.entries(migration.modules).map(([id, src]) => [id, absolute(src)])),
                        siteImports: migration.siteImports,
                        pageBoot: absolute(migration.pageBoot),
                        root: migration.root
                    },
                    model: absolute(edit.provenance.model),
                    blocks: (edit.provenance.blocks || []).map(block => ({selector: block.selector, layers: block.layers})),
                    // The block editor, for a page with blocks of its own - see Infusion's fluid-blockEditor.vue
                    blockEditor: (edit.provenance.blocks || []).length > 0,
                    renderer: renderer.global,
                    widgets: edit.provenance.widgets || null
                });
                const stored = await chrome.storage.local.get(["pollInterval", edit.prefsKey]);
                await edit.ask({op: "bootEditor", provenance: edit.provenance, config: {
                    prefs: stored[edit.prefsKey] || {},
                    // Only a build for testing, against a mock GitHub, may poll faster - see extension/test/harness.js
                    pollInterval: chrome.runtime.getManifest().fluid_testing && stored.pollInterval || edit.pollInterval
                }});
            })().catch(error => {
                console.error("Edit in Infusion can't make this page editable, since " + (error.message || error));
                throw error;
            });
        }
        return edit.bootPromise;
    };

    /**
     * Determine whether the page must be made editable at once - whether a claim is held on a source it renders, or
     * the panel was open as the user navigated to the page
     * @return {Promise<Boolean>} `true` if it must
     */
    edit.wanted = async function () {
        let open = false;
        try {
            open = !!sessionStorage.getItem(edit.sessionKey);
        } catch (error) {
            open = false;
        }
        const provenance = edit.provenance;
        const paths = new Set([provenance.source && provenance.source.path, ...(provenance.framing || []).map(framing => framing.path)]);
        const section = provenance.section || (!provenance.source && /^\/[^/]+\//.test(provenance.page) ? {contentDir: "content/" + provenance.page.split("/")[1]} : null);
        const claims = open ? [] : await edit.send({type: "claim-list", repo: provenance.repo, prefix: ""});
        return open || claims.some(claim => paths.has(claim.path) || !!section && claim.path.startsWith(section.contentDir + "/") && !claim.baseSha);
    };

    /**
     * Start on a page bearing a provenance record: relay the panel's requests, listen for activation, and make the
     * page editable at once if need be
     * @return {Promise} Resolves once started
     */
    edit.start = async function () {
        edit.provenance = JSON.parse(provenanceNode.textContent);
        const relayListener = event => {
            const message = JSON.parse(event.detail);
            edit.relay(message).then(result => ({requestId: message.requestId, ok: true, result}),
                error => ({requestId: message.requestId, ok: false, error: String(error.message || error)}))
                .then(reply => document.dispatchEvent(new CustomEvent("fluid-edit-relay-reply", {detail: JSON.stringify(reply)})));
        };
        // A content script left in the page by an earlier instance of the extension - orphaned by its reload or update,
        // which leaves its listeners in place but its chrome APIs dead - is told to stand aside, since its replies, all
        // failures, would otherwise reach the panel before this one's. The orphan's flag, window.fluidEditInjected, is
        // in an isolated world of its own, so `inject` in background.js does not find it, and injects this one
        document.dispatchEvent(new CustomEvent("fluid-edit-relay-superseded"));
        document.addEventListener("fluid-edit-relay-superseded", () => document.removeEventListener("fluid-edit-relay-request", relayListener), {once: true});
        document.addEventListener("fluid-edit-relay-request", relayListener);
        // Listened for at once, so that the user may activate the editor before any claim is shown
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === "fluid-edit-activate") {
                edit.boot().then(() => document.dispatchEvent(new CustomEvent("fluid-edit-activate")), () => null);
                // Answered, so that the service worker knows the page had something to edit
                sendResponse(true);
            } else if (message.type === "fluid-edit-claim-removed" && edit.isOwnRepo({type: "claim-remove", id: message.id})) {
                // A claim removed from another page - passed on to this page only if of its own repository, and only
                // once its editing is booted, since until then it shows no claim - see fluid.staticEditing.claimRemoved
                if (edit.bootPromise) {
                    edit.bootPromise.then(() => document.dispatchEvent(new CustomEvent("fluid-edit-claim-removed",
                        {detail: JSON.stringify({id: message.id, reason: message.reason})})), () => null);
                }
            }
        });
        edit.send({type: "fluid-provenance-found", sourcePath: edit.provenance.source ? edit.provenance.source.path : edit.provenance.page,
            claimState: null});
        if (await edit.wanted()) {
            await edit.boot();
        }
    };

    // Every page of a site has a provenance record - one with a source of its own, or framing, has something to edit. The
    // script is injected on a click, or registered for an enlisted site's pages - see background.js - and starts once
    const provenanceOf = () => JSON.parse(provenanceNode.textContent);
    if (!injectedBefore && provenanceNode && (provenanceOf().source || (provenanceOf().framing || []).length > 0)) {
        edit.started = edit.start().catch(error => console.error("Edit in Infusion could not start on this page:", error));
    }
})();
