"use strict";
/* global fluidSourceView, fluidZip */

// The content script of "Edit in Infusion" - see a-scratch/reports/0-live-static-editing.md in Infusion 6. On a page
// bearing a Fluid linkage record, written by the site's build (ponder's infusion/js/trace.js), it:
//  - shows any claim held on the page's source over the published block, styled by its state, so that an edit
//    appears to have been made at once;
//  - on activation from the extension's action, opens an editor of the source, rendering it live into the block;
//  - commits the claim on request, through the service worker;
//  - polls the published trace, dropping the claim once the trace records its hash - the Action has published it.
// Phase 1 of the plan: the block is re-rendered with the site's own markdown pipeline, which its build publishes and its
// linkage names (item 12), rather than by Infusion booted over the page - that is item 13.

(function () {
    const linkageNode = document.querySelector("script[type=\"application/fluid-linkage+json\"]");
    // The content scripts are in the page - see `inject` in background.js
    const injectedBefore = !!window.fluidEditInjected;
    window.fluidEditInjected = true;
    const pollInterval = 15000;
    // A test against a mock GitHub may poll faster - see extension/test

    const edit = {
        linkage: null,
        blocks: [],
        originals: [],
        claim: null,
        // The claims held on the sources of the page's framing, by path - see `framing` in the linkage record
        framingClaims: {},
        // The path of the source the panel edits - the page's own, or one of its framing's
        targetPath: null,
        // For each source opened in the panel without a claim, what it was read as from the repository, by path
        bases: {},
        // The claims held on new posts, not yet in the repository, of the section a list page lists, by path
        newClaims: {},
        // The files a pasted widget brings, held until the next edit of the source claims them - see edit.addFiles
        pendingFiles: {},
        filesPromise: null,
        // The new post being written, `{path}`, if any
        creating: null,
        framingMode: false,
        blockEditing: false,
        // Whether the user would edit the page's blocks in place - the "Edit in the page" control
        inPageWanted: true,
        // The user's preferences for the panel - see edit.setPref
        prefs: {sourceOpen: false},
        panel: null,
        pollTimer: null,
        bridgePromise: null,
        migratePromise: null,
        migrated: false,
        rewritten: false,
        rendererPromise: null,
        requestCount: 0,
        pollInterval
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
     * Hash text as the site's build hashes its sources - see ponder's siteModel.hashText
     * @param {String} text - The text
     * @return {Promise<String>} "sha256-" followed by the hex digest of its UTF-8 encoding
     */
    edit.hashText = text => edit.hashBytes(new TextEncoder().encode(text));

    /**
     * Hash bytes as the site's build hashes its static files - see ponder's trace.staticHashes
     * @param {Uint8Array} bytes - The bytes
     * @return {Promise<String>} "sha256-" followed by the hex digest of the bytes
     */
    edit.hashBytes = async function (bytes) {
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return "sha256-" + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
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
     * Load the renderer of markdown which the page's linkage names - the site's own pipeline, published by its build.
     * Loaded once, on first use
     * @return {Promise<Object>} The renderer's record from the linkage, `{scripts, global}`
     */
    edit.loadRenderer = function () {
        if (!edit.rendererPromise) {
            const renderer = edit.linkage.renderers && edit.linkage.renderers.markdown;
            edit.rendererPromise = renderer ?
                edit.ask({op: "load", scripts: renderer.scripts.map(script => new URL(script, location.href).href)}).then(() => renderer) :
                Promise.reject(new Error("This page's linkage names no renderer of markdown, so edits can't be previewed"));
        }
        return edit.rendererPromise;
    };

    /**
     * Render the text of a content file into the HTML of its markdown block, with the site's own pipeline
     * @param {String} text - The text of the file
     * @return {Promise<String>} The rendered HTML
     */
    edit.render = async function (text) {
        const renderer = await edit.loadRenderer();
        return edit.ask({op: "render", global: renderer.global, text});
    };

    /**
     * Fill the component islands of a block rendered from a claim - the elements bearing `fluid-layers` which
     * shortcodes become, rendered empty by the markdown pipeline - from the islands of the block as published, where
     * the published block has an island with the same attributes. Until Infusion boots the page (plan item 13), this is
     * the only way they can be shown, and it is sound since an island's rendering depends on its attributes alone -
     * the published fragment is a value from the cache whose inputs are unchanged
     * @param {Element} block - The block, holding the claim's rendering
     * @param {String} published - The HTML of the block as published
     */
    edit.fillIslands = function (block, published) {
        const holder = document.createElement("div");
        holder.innerHTML = published;
        // The attributes the source gives an island - its layers, its member name, a shortcode's parameters and a
        // widget's potentia, so that two counters configured differently are not swapped. Its component adds others to
        // its container when rendered, e.g. `class` and `style`
        const given = new Set(["fluid-layers", "fluid-id", "fluid-potentia"]);
        const signature = island => [...island.attributes].filter(attr => given.has(attr.name) || attr.name.startsWith("data-"))
            .map(attr => attr.name + "=" + attr.value).sort().join(" ");
        const available = {};
        holder.querySelectorAll("[fluid-layers]").forEach(island => {
            (available[signature(island)] = available[signature(island)] || []).push(island);
        });
        block.querySelectorAll("[fluid-layers]").forEach(island => {
            const candidates = available[signature(island)];
            if (candidates && candidates.length > 0) {
                island.replaceWith(candidates.shift());
            }
        });
    };

    /**
     * Fetch the site's published trace, bypassing caches
     * @return {Promise<Object|null>} The trace, or null if it can't be fetched
     */
    edit.fetchTrace = async function () {
        let togo = null;
        try {
            // Relative to the page's own location, not to any <base> it declares
            const url = new URL(edit.linkage.trace, location.href);
            url.searchParams.set("t", String(Date.now()));
            const response = await fetch(url, {cache: "no-store"});
            togo = response.ok ? await response.json() : null;
        } catch (error) {
            togo = null;
        }
        return togo;
    };

    /**
     * Mark each block with the claim's state, and label it
     * @param {String|null} state - The state, or null to clear the marking
     * @param {String} [text] - The label's text
     */
    edit.markBlocks = function (state, text) {
        edit.blocks.forEach(block => {
            const label = block.previousElementSibling && block.previousElementSibling.classList.contains("fluid-edit-label") ?
                block.previousElementSibling : null;
            if (state) {
                block.setAttribute("data-fluid-claim-state", state);
                const labelNode = label || block.parentNode.insertBefore(document.createElement("div"), block);
                labelNode.className = "fluid-edit-label fluid-edit-label-" + state;
                labelNode.setAttribute("data-fluid-edit-ui", "");
                labelNode.textContent = text;
            } else {
                block.removeAttribute("data-fluid-claim-state");
                if (label) {
                    label.remove();
                }
            }
        });
    };

    // The label shown on blocks in each state
    edit.stateLabels = {
        uncommitted: "Edited in this browser - not yet committed",
        committed: "Committed - waiting for the site to be rebuilt and published",
        conflict: "Conflict - the source has changed since this edit was begun",
        published: "Published"
    };

    /**
     * Show a claim over the page's blocks - rendering its text into them, and marking them with its state - or, with
     * no claim, restore the published blocks
     * @param {Claim|null} claim - The claim
     * @return {Promise} Resolves once the claim is shown
     */
    edit.showClaim = async function (claim) {
        edit.claim = claim;
        let message = claim ? claim.message : null;
        try {
            await edit.showText(claim ? claim.text : null, claim);
        } catch (error) {
            message = String(error.message || error);
        }
        if (claim) {
            edit.markBlocks(claim.state, edit.stateLabels[claim.state] + (message ? " - " + message : ""));
        } else {
            edit.markBlocks(null);
        }
        edit.updatePanel();
        edit.updateBadge();
    };

    /**
     * Show the extension's badge for the page - marked if any claim is held on a source it renders
     */
    edit.updateBadge = function () {
        const claims = edit.allClaims();
        edit.send({type: "fluid-linkage-found", sourcePath: edit.linkage.source ? edit.linkage.source.path : edit.linkage.page,
            claimState: claims.length > 0 ? claims[0].state : null});
    };

    /**
     * Find the record of a source of the page's framing
     * @param {String} path - The source's path
     * @return {Object|undefined} Its record from the linkage, `{path, layer, label, hash}`
     */
    edit.framingOf = path => (edit.linkage.framing || []).find(framing => framing.path === path);

    /**
     * Find the claim held on a source the page renders
     * @param {String} path - The source's path
     * @return {Claim|null} The claim, or null
     */
    edit.claimOf = path => edit.framingOf(path) ? edit.framingClaims[path] || null :
        edit.isNewPost(path) ? edit.newClaims[path] || null : edit.claim;

    /**
     * Whether a source is a new post, not yet in the repository, of the section a list page lists
     * @param {String} path - The source's path
     * @return {Boolean} `true` if it is
     */
    edit.isNewPost = path => !edit.linkage.source && !edit.framingOf(path) && !!path;

    /**
     * List every claim held on a source the page renders
     * @return {Claim[]} The claims
     */
    edit.allClaims = () => [edit.claim, ...Object.values(edit.framingClaims), ...Object.values(edit.newClaims)].filter(claim => claim);

    /**
     * Mark the elements rendering a source of the page's framing with its claim's state - or, while the framing is
     * being edited, as editable
     * @param {Object} framing - The source's record from the linkage
     * @return {Promise} Resolves once marked
     */
    edit.markFraming = function (framing) {
        const claim = edit.framingClaims[framing.path];
        const state = claim ? claim.state : !edit.framingMode ? null : edit.targetPath === framing.path ? "editing" : "editable";
        const label = claim ? framing.label + ": " + edit.stateLabels[claim.state] + (claim.message ? " - " + claim.message : "") :
            framing.label + (state === "editing" ? " - editing, shared by every page" : " - shared by every page, click to edit");
        // The configuration renders nowhere of its own - its claim is shown in the panel, and on the elements it changes
        // only as they change
        return framing.layer && (edit.migrated || state) ? edit.ask({op: "markLayer", layer: framing.layer, path: framing.path, state, label}) : Promise.resolve(0);
    };

    /**
     * Show a claim on a source of the page's framing - the page is migrated, and the claim's text given to the live
     * tree as the SFC defining the framing's layer, so that every component of the layer renders from it - or, with no
     * claim, restore the framing as published
     * @param {Object} framing - The source's record from the linkage
     * @param {Claim|null} claim - The claim
     * @return {Promise} Resolves once the claim is shown
     */
    edit.showFraming = async function (framing, claim) {
        const had = edit.framingClaims[framing.path];
        if (claim) {
            edit.framingClaims[framing.path] = claim;
        } else {
            delete edit.framingClaims[framing.path];
        }
        try {
            if (claim) {
                await edit.migrate();
                await edit.applyFraming(framing, claim.text);
            } else if (had && edit.migrated) {
                await edit.applyFraming(framing, edit.bases[framing.path] ? edit.bases[framing.path].text : had.baseText);
            }
            await edit.markFraming(framing);
        } catch (error) {
            edit.setStatus(String(error.message || error));
        }
        edit.updatePanel();
        edit.updateBadge();
    };

    /**
     * Give the text of a source of the framing to the page's live tree - an SFC's as the definition of its layer, the
     * site's configuration as a patch of the root of the tree
     * @param {Object} framing - The source's record from the linkage
     * @param {String} text - Its text
     * @return {Promise} Resolves once the tree has rendered it
     */
    edit.applyFraming = function (framing, text) {
        return framing.kind === "patch" ? edit.ask({op: "setPatch", text}) : edit.ask({op: "setLayerSource", layer: framing.layer, text});
    };

    /**
     * Show a claim on whichever source of the page it is held on
     * @param {String} path - The source's path
     * @param {Claim|null} claim - The claim, or null to show the source as published
     * @return {Promise} Resolves once shown
     */
    edit.showClaimOf = function (path, claim) {
        const framing = edit.framingOf(path);
        let togo;
        if (framing) {
            togo = edit.showFraming(framing, claim);
        } else if (edit.isNewPost(path)) {
            if (claim) {
                edit.newClaims[path] = claim;
            } else {
                delete edit.newClaims[path];
            }
            edit.updatePanel();
            edit.updateBadge();
            togo = Promise.resolve();
        } else {
            togo = edit.showClaim(claim);
        }
        return togo;
    };

    /**
     * Show the text of a source in the page's blocks, or with null the blocks as published. Where the linkage offers
     * migration, the blocks are first migrated in place into live components, and the text is given to them, so that
     * Infusion renders them as the build did (plan item 13). Otherwise the text is rendered by the site's pipeline
     * and written into the blocks here, with their islands filled from the published blocks
     * @param {String|null} text - The text of the source, front matter and all, or null
     * @param {Claim|null} claim - The claim whose text it is, so that a rendering overtaken by another is dropped
     * @return {Promise} Resolves once the text is shown
     */
    edit.showText = async function (text, claim) {
        // A page is migrated only once there is a source to boot its blocks from - a claim's, or the one fetched on
        // opening the editor
        const migrated = edit.linkage.migration && text !== null ? await edit.migrate().then(() => true, () => false) : !!edit.migrated;
        if (migrated && text !== null) {
            // The layers of widgets pasted into the claim, not yet published, are defined first
            await edit.registerClaimLayers(claim);
            await edit.ask({op: "setSource", text});
        } else if (migrated) {
            // The blocks' components were booted from a claim's text - the page as published is restored by reloading
            location.reload();
        } else if (text !== null) {
            const html = await edit.render(text);
            if (edit.claim === claim) {
                edit.blocks.forEach((block, i) => {
                    block.innerHTML = html;
                    edit.fillIslands(block, edit.originals[i]);
                });
                edit.rewritten = true;
            }
        } else if (edit.rewritten) {
            // Only blocks this script rewrote are restored - writing a block's markup afresh would replace its elements,
            // e.g. those of islands which the page itself has booted
            edit.blocks.forEach((block, i) => {
                block.innerHTML = edit.originals[i];
            });
            edit.rewritten = false;
        }
    };

    /**
     * Define in the page the layers a claim's further files hold - the SFCs of widgets pasted into it, which the site
     * does not publish until the claim is committed
     * @param {Claim|null} claim - The claim
     * @return {Promise} Resolves once defined
     */
    edit.registerClaimLayers = async function (claim) {
        const dir = edit.linkage.widgets ? edit.linkage.widgets.dir + "/" : null;
        const decode = content => new TextDecoder().decode(edit.decodeBase64(content));
        const layers = dir && claim && claim.files ? Object.entries(claim.files).filter(([path, file]) => path.startsWith(dir) &&
            file.content !== null && /\.(vue|js)$/.test(path)).map(([path, file]) => ({
            layer: path.substring(path.lastIndexOf("/") + 1).replace(/\.(vue|js)$/, "").replace(/-/g, "."),
            kind: path.endsWith(".vue") ? "sfc" : "js",
            // The claim's layers replace the page's, which are those it was published with
            text: decode(file.content)
        })) : [];
        // Images the claim brings, e.g. dropped, are shown before they are published
        await edit.previewImages(claim && claim.files || {});
        return layers.length > 0 ? edit.ask({op: "registerLayers", layers, override: true}) : 0;
    };

    /**
     * Migrate the page's blocks in place into live components, once - see bridge.migrate
     * @return {Promise<Number>} The number of blocks migrated
     */
    edit.migrate = function () {
        if (!edit.migratePromise) {
            const absolute = url => new URL(url, location.href).href;
            const migration = edit.linkage.migration;
            const renderer = edit.linkage.renderers ? edit.loadRenderer() : Promise.resolve({global: null});
            edit.migratePromise = renderer.then(renderer => edit.ask({
                op: "migrate",
                migration: {
                    framework: {root: absolute(migration.framework.root), files: migration.framework.files},
                    modules: Object.fromEntries(Object.entries(migration.modules).map(([id, src]) => [id, absolute(src)])),
                    siteImports: migration.siteImports,
                    pageBoot: absolute(migration.pageBoot),
                    root: migration.root
                },
                model: absolute(edit.linkage.model),
                blocks: (edit.linkage.blocks || []).map(block => ({selector: block.selector, layers: block.layers})),
                extensionScript: chrome.runtime.getURL("js/fluid-withEditing.js"),
                // The block editor, for a page with blocks of its own - see sfc/fluid-blockEditor.vue
                serializerScript: chrome.runtime.getURL("js/fluid-markdownSerializer.js"),
                blockEditor: (edit.linkage.blocks || []).length > 0 ? chrome.runtime.getURL("sfc/fluid-blockEditor.vue") : null,
                renderer: renderer.global,
                widgets: edit.linkage.widgets || null
            })).then(count => {
                edit.migrated = true;
                if (edit.panel && !edit.panel.hidden) {
                    edit.dock(true);
                }
                return count;
            });
        }
        return edit.migratePromise;
    };

    /**
     * Store a claim, and show it
     * @param {Claim} claim - The claim
     * @return {Promise<Claim>} The claim as stored
     */
    edit.putClaim = async function (claim) {
        const stored = await edit.send({type: "claim-put", claim});
        await edit.showClaimOf(stored.path, stored);
        return stored;
    };

    /**
     * Compare the claim with the published trace: drop it if the trace records its hash, and those of its further files,
     * and mark it as in conflict if the trace records neither its hash nor that of its base, i.e. the source was changed
     * by another
     * @param {Object} trace - The published trace
     * @param {Claim} claim - The claim
     * @return {Promise<Boolean>} `true` if the claim has been published
     */
    edit.reconcile = async function (trace, claim) {
        // The hash the trace records of a file - a content file's, or a static file's, e.g. an image's
        const publishedOf = path => trace ? (trace.sources || {})[path] ?? (trace.staticFiles || {})[path] : undefined;
        const published = publishedOf(claim.path);
        // A claim with further files is published once every one of them is - each written as edited, or removed
        const filesPublished = Object.entries(claim.files || {}).every(([path, file]) => file.hash === null ?
            publishedOf(path) === undefined : publishedOf(path) === file.hash);
        let togo = false;
        if (published === claim.hash && filesPublished) {
            await edit.send({type: "claim-remove", id: claim.id});
            togo = true;
        } else if (published !== undefined && published !== claim.baseHash && claim.state !== "conflict") {
            await edit.putClaim({...claim, state: "conflict", message: "the published source is neither the one edited nor this edit"});
        }
        return togo;
    };

    /**
     * Poll the published trace while a claim is committed, until the trace records it
     */
    edit.poll = function () {
        clearTimeout(edit.pollTimer);
        // Any claim held is polled - one shown here may have been committed from another page, e.g. one of the framing
        if (edit.allClaims().length > 0) {
            edit.pollTimer = setTimeout(async function () {
                // Each claim is read afresh, since another page may have committed, or discarded, it
                for (const claim of edit.allClaims()) {
                    const fresh = await edit.send({type: "claim-get", repo: claim.repo, path: claim.path});
                    if (!fresh || fresh.state !== claim.state || fresh.hash !== claim.hash) {
                        await edit.showClaimOf(claim.path, fresh || null);
                    }
                }
                const trace = await edit.fetchTrace();
                let published = false;
                for (const claim of trace ? edit.allClaims().filter(one => one.state === "committed") : []) {
                    published = await edit.reconcile(trace, claim) || published;
                }
                if (published) {
                    edit.markBlocks("published", edit.stateLabels.published + " - reloading the page");
                    setTimeout(() => location.reload(), 1500);
                } else {
                    edit.poll();
                }
            }, edit.pollInterval);
        }
    };

    /**
     * The record of the source the panel edits
     * @return {Object|null} `{path, hash, label, framing, creating}` - its path, the hash this page was published from,
     * its label, its framing record if it is a source of the framing, and whether it is a new post, not yet in the
     * repository - or null, on a page with no source of its own, e.g. a list, while nothing is chosen to edit
     */
    edit.target = function () {
        const framing = edit.framingOf(edit.targetPath);
        let togo = null;
        if (framing) {
            togo = {path: framing.path, hash: framing.hash, label: framing.label, framing, creating: false};
        } else if (edit.creating && edit.targetPath === edit.creating.path) {
            togo = {path: edit.creating.path, hash: null, label: "A new post", framing: null, creating: true};
        } else if (edit.linkage.source && edit.targetPath === edit.linkage.source.path) {
            togo = {path: edit.linkage.source.path, hash: edit.linkage.source.hash, label: "This page's content", framing: null, creating: false};
        }
        return togo;
    };

    // The key, in the page's sessionStorage, of whether the editor is open - so that it stays open as the user
    // navigates the site in the tab, e.g. from a list to a post
    edit.sessionKey = "fluid-edit-open";

    /**
     * Remember, for this tab, whether the editor is open, and whether the framing is being edited
     */
    edit.rememberSession = function () {
        try {
            if (edit.panel && !edit.panel.hidden) {
                sessionStorage.setItem(edit.sessionKey, JSON.stringify({framing: edit.framingMode}));
            } else {
                sessionStorage.removeItem(edit.sessionKey);
            }
        } catch (error) {
            // A page denying storage forgets the editor on navigating
        }
    };

    /**
     * Read what was remembered for this tab by rememberSession
     * @return {Object|null} `{framing}` if the editor was open, or null
     */
    edit.recallSession = function () {
        let togo = null;
        try {
            togo = JSON.parse(sessionStorage.getItem(edit.sessionKey) || "null");
        } catch (error) {
            togo = null;
        }
        return togo;
    };

    /**
     * The user's preferences for the panel, kept in the extension's own storage (chrome.storage.local) rather than with
     * the claims in IndexedDB - they are settings of the extension, read by every panel on every site, not data
     * edited - and saved as they change
     */
    edit.prefsKey = "fluidEditPrefs";

    /**
     * Save a preference
     * @param {String} key - The preference, e.g. "sourceOpen"
     * @param {Any} value - Its value
     */
    edit.setPref = function (key, value) {
        edit.prefs[key] = value;
        chrome.storage.local.set({[edit.prefsKey]: edit.prefs});
    };

    /**
     * Fold or unfold the source, as the user last chose - unless the target can only be edited as source: framing, a
     * new post, or content whose blocks can't be, or aren't, edited in the page
     */
    edit.updateSourceOpen = function () {
        if (edit.panel) {
            const target = edit.target();
            const needed = !!target && (!!target.framing || target.creating || !edit.inPageWanted || edit.inPageUnavailable);
            const details = edit.panel.querySelector(".fluid-edit-source");
            details.hidden = !target;
            details.open = needed || edit.prefs.sourceOpen;
        }
    };

    /**
     * Begin editing: open the panel, showing the source it edits. The page is first made live, before the panel is
     * shown, so that it appears once, settled, rather than being withdrawn and restored as the page's tree boots
     * @return {Promise} Resolves once the panel shows its source
     */
    edit.activate = function () {
        edit.activating = (edit.activating || Promise.resolve()).catch(() => null).then(async function () {
            if (!edit.panel) {
                edit.makePanel();
            }
            if (edit.panel.hidden && edit.linkage.migration) {
                await edit.migrate().catch(error => {
                    edit.migrateError = error;
                });
            }
            edit.updateSourceOpen();
            edit.dock(true);
            await edit.showTarget();
        });
        return edit.activating;
    };

    /**
     * Show the source the panel edits - the claim's text on it, or else the source as it stands in the repository
     * @return {Promise} Resolves once shown
     */
    edit.showTarget = async function () {
        const target = edit.target();
        edit.panel.removeAttribute("data-fluid-edit-ready");
        edit.panel.querySelector(".fluid-edit-path").textContent = target ? target.path : edit.linkage.page;
        edit.panel.querySelector(".fluid-edit-new").hidden = !(target && target.creating);
        edit.updateSourceOpen();
        await Promise.all((edit.linkage.framing || []).map(edit.markFraming));
        if (!target) {
            edit.setStatus(edit.migrateError ? "Can't make the page live, since it " + (edit.migrateError.message || edit.migrateError) :
                (edit.section() ? "Choose + at the head of the list to write a new post, or click a post to edit it. " : "") +
                ((edit.linkage.framing || []).length ? "Tick \"Also edit framing\" to edit what every page shares." : ""));
        } else {
            const claim = edit.claimOf(target.path);
            edit.source.setLanguage(target.path);
            if (claim) {
                edit.source.setText(claim.text);
            } else if (edit.bases[target.path]) {
                edit.source.setText(edit.bases[target.path].text);
            } else {
                await edit.readTarget(target);
            }
            // The blocks are edited in place once the page is live, unless the repository's source differs from the
            // one the page was published from, which would change the page before any edit
            if (!target.framing && !target.creating && !edit.blockEditing && edit.inPageWanted) {
                const base = edit.bases[target.path];
                if (claim || base && base.hash === target.hash) {
                    await edit.setBlockEditing(true);
                } else {
                    edit.inPageUnavailable = true;
                    edit.updateSourceOpen();
                }
            }
        }
        edit.updatePanel();
        edit.panel.setAttribute("data-fluid-edit-ready", "");
        if (target && !target.framing) {
            edit.learnSite().then(() => edit.learnHeadings(edit.source.getText()));
        }
    };

    /**
     * Read the source the panel edits from the repository, as the base of any edit of it
     * @param {Object} target - The target, as given by edit.target
     * @return {Promise} Resolves once read, or its failure shown
     */
    edit.readTarget = async function (target) {
        edit.source.setText("");
        edit.setStatus("Reading " + target.path + " from " + edit.linkage.repo + " ...");
        try {
            // A source of the framing which the site forks from one of its modules - e.g. its theme's footer - and has
            // not yet forked is read as published, and its first commit creates the fork - see `origin` in the linkage
            const origin = target.framing && target.framing.origin;
            const source = origin ? {text: await (await fetch(new URL(origin, location.href), {cache: "no-store"})).text(), sha: undefined} :
                await edit.send({type: "source-read", repo: edit.linkage.repo, branch: edit.linkage.branch, path: target.path});
            const hash = await edit.hashText(source.text);
            edit.bases[target.path] = {text: source.text, sha: source.sha, hash};
            if (edit.targetPath === target.path) {
                edit.source.setText(source.text);
            }
            edit.setStatus(hash !== target.hash ? "The repository's source differs from the one this page was published from - edits are based on the repository's" :
                target.framing ? "Editing " + target.label + ", shared by every page of the site" +
                    (origin ? " - the site's own copy of it, " + target.path + ", is made on committing" : "") : "Editing the source of this page");
        } catch (error) {
            edit.setStatus(String(error.message || error));
        }
    };

    /**
     * Edit the page's own blocks in place, or cease to - its source is given to them first, so that they know the lines
     * each was rendered from
     * @param {Boolean} on - Whether to edit in place
     * @return {Promise} Resolves once the blocks are edited in place, or not
     */
    edit.setBlockEditing = async function (on) {
        const text = edit.claim ? edit.claim.text : edit.bases[edit.linkage.source.path]?.text;
        let togo = false;
        if (edit.migrated && edit.blocks.length > 0 && text !== undefined) {
            if (on && !edit.claim) {
                await edit.ask({op: "setSource", text});
            }
            await edit.ask({op: "setBlockEditing", on});
            togo = on;
        }
        edit.blockEditing = togo;
        // The page's blocks can't be edited in place, e.g. since it couldn't be made live - the source is shown instead
        edit.inPageUnavailable = on && !togo;
        if (edit.panel) {
            edit.panel.querySelector(".fluid-edit-inpage").checked = togo;
            edit.updateSourceOpen();
        }
        return togo;
    };

    /**
     * Receive an edit made in place in one of the page's blocks - the whole source, with the block's lines replaced
     * @param {String} text - The edited source
     */
    edit.onBlockEdit = function (text) {
        if (edit.linkage.source) {
            edit.targetPath = edit.linkage.source.path;
            if (edit.panel) {
                edit.source.setText(text);
            }
            edit.onInput(text);
        }
    };

    /**
     * Learn the site's pages and images from its published trace, once, so that links typed in the source view may be
     * completed - see sourceView.js. Lists' further pages, e.g. "/post/page/2/", are left out
     * @return {Promise} Resolves once learned, or the trace could not be had
     */
    edit.learnSite = function () {
        edit.sitePromise = edit.sitePromise || edit.fetchTrace().then(trace => {
            if (trace && trace.pages) {
                edit.site = {
                    page: edit.linkage.page,
                    pages: Object.entries(trace.pages).filter(([path]) => !/\/page\/\d+\/$/.test(path))
                        .map(([path, record]) => ({path, title: record.title, kind: record.kind, headings: record.headings || []})),
                    // The headings of the page's own source as edited, once learned - see learnHeadings
                    ownHeadings: null,
                    assets: trace.assets || [],
                    // The hashes of the site's static files, so that a pasted widget's layers already held are not written
                    staticFiles: trace.staticFiles || {},
                    // The site's sources, so that a new post is given a path no other source holds
                    sources: Object.keys(trace.sources || {})
                };
            }
        });
        return edit.sitePromise;
    };

    /**
     * Learn the headings of the page's own source as it now stands, by the site's own pipeline, so that a link to one
     * typed in the source view may be completed before it is published - a little after the source last changed
     * @param {String} text - The source
     */
    edit.learnHeadings = function (text) {
        clearTimeout(edit.headingsTimer);
        edit.headingsTimer = setTimeout(async function () {
            const renderer = edit.linkage.renderers && edit.linkage.renderers.markdown;
            if (renderer && edit.site) {
                try {
                    await edit.loadRenderer();
                    edit.site.ownHeadings = await edit.ask({op: "headings", global: renderer.global, text});
                } catch (error) {
                    // The headings as published, from the trace, are offered instead
                }
            }
        }, 500);
    };

    /**
     * Switch the panel to editing another source of the page - its own, one of its framing's, or a new post
     * @param {String|null} path - The source's path, or null for none
     * @return {Promise} Resolves once shown
     */
    edit.switchTarget = function (path) {
        edit.targetPath = path;
        return edit.activate();
    };

    /**
     * Begin, or end, editing the page's framing. Its elements are marked as editable, and an edit of any source of it
     * is projected into the page where that source renders - clicking a marked element, e.g. the footer, edits its
     * source, and clicking a block of the page's own content returns to it
     * @param {Boolean} on - Whether to edit the framing
     */
    edit.setFramingMode = async function (on) {
        edit.framingMode = on;
        edit.panel.querySelector(".fluid-edit-framing").checked = on;
        edit.panel.querySelector(".fluid-edit-config").hidden = !on || !(edit.linkage.framing || []).some(framing => framing.kind === "patch");
        edit.rememberSession();
        if (on) {
            await edit.migrate().catch(error => edit.setStatus("Can't make the page live to edit its framing, since it " + (error.message || error)));
            await Promise.all((edit.linkage.framing || []).map(edit.markFraming));
        } else if (edit.target() && edit.target().framing) {
            await edit.switchTarget(edit.linkage.source ? edit.linkage.source.path : null);
        } else {
            await Promise.all((edit.linkage.framing || []).map(edit.markFraming));
        }
    };

    /**
     * Respond to a click in the page while the framing is edited - one on a marked element of the framing not yet
     * edited switches the panel to its source, rather than following a link it holds
     * @param {Event} event - The click
     */
    edit.onFramingClick = function (event) {
        const framed = edit.framingMode && edit.panel && !edit.panel.hidden && event.target.closest ? event.target.closest("[data-fluid-framing]") : null;
        if (framed && framed.getAttribute("data-fluid-framing") !== edit.targetPath) {
            event.preventDefault();
            event.stopPropagation();
            edit.switchTarget(framed.getAttribute("data-fluid-framing"));
        }
    };

    /**
     * The section a list page lists, into which a new post is written - from the linkage, or for a page published
     * before the linkage recorded it, from the page's path
     * @return {Object|null} `{contentDir, itemSelector}`, or null for a page listing no section
     */
    edit.section = function () {
        const linkage = edit.linkage;
        return linkage.section || (!linkage.source && /^\/[^/]+\//.test(linkage.page) && document.querySelector("article.post-preview") ?
            {contentDir: "content/" + linkage.page.split("/")[1], itemSelector: "article.post-preview"} : null);
    };

    /**
     * Make the path of a new post from its title - the date and a slug of the title, as the site's own are named,
     * e.g. content/post/2025-03-20-ui-as-code.md, and distinct from every other source
     * @param {String} title - The title
     * @return {String} The path
     */
    edit.newPostPath = function (title) {
        const now = new Date();
        const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(part => String(part).padStart(2, "0")).join("-");
        const slug = title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "untitled";
        const taken = new Set([...(edit.site ? edit.site.sources : []), ...Object.keys(edit.newClaims)
            .filter(path => path !== edit.targetPath)]);
        const stem = edit.section().contentDir + "/" + date + "-" + slug;
        let path = stem + ".md";
        for (let i = 2; taken.has(path); ++i) {
            path = stem + "-" + i + ".md";
        }
        return path;
    };

    /**
     * Begin writing a new post in the section the page lists, or resume one held as a claim
     * @param {Claim} [claim] - The claim on a new post to resume
     * @return {Promise} Resolves once the panel shows it
     */
    edit.beginNewPost = async function (claim) {
        await edit.learnSite();
        const title = claim ? (/^title:\s*(.*)$/m.exec(claim.text) || [])[1] || "" : "";
        const path = claim ? claim.path : edit.newPostPath("");
        edit.creating = {path};
        edit.bases[path] = edit.bases[path] || {text: "", sha: undefined, hash: null};
        if (!claim) {
            const date = path.substring(path.lastIndexOf("/") + 1, path.lastIndexOf("/") + 11);
            edit.bases[path].text = "---\ntitle: \"\"\ndate: " + date + "\n---\n\n";
        }
        await edit.switchTarget(path);
        const input = edit.panel.querySelector(".fluid-edit-new-title");
        input.value = title.replace(/^"(.*)"$/, "$1");
        input.focus();
    };

    /**
     * Retitle the new post being written - its front matter, and its path, which follows its title until it is
     * committed. A claim held at its former path is moved to the new one
     * @param {String} title - The title
     * @return {Promise} Resolves once the claim is stored
     */
    edit.retitleNewPost = async function (title) {
        const text = edit.source.getText().replace(/^title:.*$/m, "title: " + JSON.stringify(title));
        const path = edit.newPostPath(title);
        if (path !== edit.targetPath) {
            const old = edit.newClaims[edit.targetPath];
            if (old) {
                await edit.send({type: "claim-remove", id: old.id});
                delete edit.newClaims[edit.targetPath];
            }
            edit.bases[path] = edit.bases[edit.targetPath];
            delete edit.bases[edit.targetPath];
            edit.creating.path = path;
            edit.targetPath = path;
            edit.panel.querySelector(".fluid-edit-path").textContent = path;
        }
        edit.source.setText(text);
        await edit.onInput(text);
    };

    /**
     * Show the controls at the head of the list a section page renders - while the editor is open, "+" to write a
     * new post, and always the new posts held as claims, not yet published, each resuming its editing when chosen.
     * They are the extension's own, outside the page's tree
     */
    edit.showListHead = function () {
        const section = edit.section();
        const first = section ? document.querySelector(section.itemSelector) : null;
        if (first) {
            let head = document.querySelector(".fluid-edit-list-head");
            if (!head) {
                head = document.createElement("div");
                head.className = "fluid-edit-list-head";
                head.setAttribute("data-fluid-edit-ui", "");
            }
            if (head.nextSibling !== first) {
                first.parentNode.insertBefore(head, first);
            }
            head.innerHTML = "";
            if (edit.panel && !edit.panel.hidden) {
                const add = head.appendChild(document.createElement("button"));
                add.className = "fluid-edit-new-post";
                add.title = "Write a new post";
                add.textContent = "+";
                add.addEventListener("click", () => edit.beginNewPost());
            }
            Object.values(edit.newClaims).forEach(claim => {
                const item = head.appendChild(document.createElement("a"));
                item.className = "fluid-edit-pending";
                item.href = "#";
                item.setAttribute("data-fluid-claim-state", claim.state);
                const title = (/^title:\s*"?(.*?)"?\s*$/m.exec(claim.text) || [])[1] || "Untitled";
                item.textContent = title + " - a new post, " + edit.stateLabels[claim.state].toLowerCase();
                item.addEventListener("click", event => {
                    event.preventDefault();
                    edit.activate().then(() => edit.beginNewPost(edit.newClaims[claim.path]));
                });
            });
        }
    };

    /**
     * Encode text as base64 of its UTF-8 encoding, as a claim holds a further file's content
     * @param {String} text - The text
     * @return {String} The encoding
     */
    edit.encode = text => edit.encodeBytes(new TextEncoder().encode(text));

    /**
     * Encode bytes as base64
     * @param {Uint8Array} bytes - The bytes
     * @return {String} Their base64
     */
    edit.encodeBytes = function (bytes) {
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return btoa(binary);
    };

    /**
     * Decode base64 as bytes
     * @param {String} content - The base64
     * @return {Uint8Array} The bytes
     */
    edit.decodeBase64 = content => Uint8Array.from(atob(content), char => char.charCodeAt(0));

    /**
     * @typedef {Object} BroughtFile
     * @property {String} path - Its path in the repository, e.g. "static/sfc/fluid-demos-counter.vue"
     * @property {String} [text] - Its text, for a layer's SFC
     * @property {String} [content] - Otherwise its bytes as base64, e.g. for an image
     * @property {String} [layer] - The layer it defines, if it is a layer's
     * @property {String} [kind] - "sfc" or "js", for a layer's
     * @property {Boolean} [pageDiffers] - `true` if the page already defines its layer otherwise
     */

    /**
     * Take the files a pasted or dropped widget brings - the SFCs of its layers, and any images - to be committed with
     * the page's source as further files of its claim. One held already alike - by the site, or by the claim - is
     * passed over; one held otherwise, or a layer the page already defines otherwise, is replaced only if the user
     * agrees, since other content may use it. A layer so replaced is defined afresh in the page
     * @param {BroughtFile[]} files - The files
     * @return {Promise} Resolves once they are held, ready for the next edit of the source to claim them
     */
    edit.addFiles = function (files) {
        edit.filesPromise = (edit.filesPromise || Promise.resolve()).then(async function () {
            await edit.learnSite();
            const held = edit.site ? edit.site.staticFiles : {};
            const claim = edit.targetPath ? edit.claimOf(edit.targetPath) : null;
            const redefined = [];
            for (const file of files) {
                const content = file.content ?? edit.encode(file.text);
                const hash = await edit.hashBytes(edit.decodeBase64(content));
                // What the page shows of the file is the claim's, if it holds one, otherwise the site's
                const claimed = edit.pendingFiles[file.path] || (claim && claim.files ? claim.files[file.path] : undefined);
                const existing = claimed && claimed.hash !== null ? claimed.hash : claimed ? undefined : held[file.path];
                const what = file.layer ? "defines " + file.layer + ", in " + file.path + "," : "holds " + file.path;
                const brought = file.layer ? "the pasted widget does" : "the one the widget brings";
                let ask;
                let take;
                if (existing === hash) {
                    ask = false;
                    take = false;
                } else if (existing === undefined) {
                    ask = !!file.pageDiffers;
                    take = true;
                } else {
                    ask = true;
                    take = true;
                }
                if (ask) {
                    take = window.confirm((existing === undefined ? "This page already defines " + file.layer :
                        "The site already " + what) + " otherwise than " + brought + ". Replace it with " +
                        (file.layer ? "the pasted definition" : "the widget's") + "? Other content using it will change too.");
                }
                if (take) {
                    let baseSha = claimed ? claimed.baseSha : undefined;
                    if (!claimed && held[file.path] !== undefined) {
                        baseSha = (await edit.send({type: "source-read", repo: edit.linkage.repo, branch: edit.linkage.branch, path: file.path})).sha;
                    }
                    edit.pendingFiles[file.path] = {content, baseSha, hash};
                    if (file.layer && file.pageDiffers) {
                        redefined.push({layer: file.layer, kind: file.kind, text: file.text});
                    }
                }
            }
            if (redefined.length > 0) {
                await edit.ask({op: "registerLayers", layers: redefined, override: true});
            }
        }).catch(error => edit.setStatus("The pasted widget's files can't be held, since " + (error.message || error)));
        return edit.filesPromise;
    };

    /**
     * Take a paste into the source view of a widget held on the clipboard as PTF - its element is inserted at the
     * cursor, as a block of its own, and its layers held to be committed with the source
     * @param {String} text - The pasted text
     * @return {Boolean} `true` if it was taken
     */
    edit.onSourcePaste = function (text) {
        const target = edit.target();
        const taken = /MIME-Version:[ \t]*1\.0/i.test(text) && !!target && !target.framing && edit.migrated;
        if (taken) {
            edit.ask({op: "widgetFromPTF", text, source: edit.source.getText()}).then(async ({markup, files}) => {
                await edit.addFiles(files);
                edit.source.insertBlock(markup);
            }).catch(error => edit.setStatus(String(error.message || error)));
        }
        return taken;
    };

    /**
     * Take a drop into the source view of files - a widget as a ZIP file, or an image - which are inserted at the
     * cursor, set where they were dropped, and their files held to be committed with the source
     * @param {File[]} files - The files dropped
     * @return {Boolean} `true` if they were taken
     */
    edit.onSourceDrop = function (files) {
        const target = edit.target();
        const taken = files.length > 0 && !!target && !target.framing && edit.migrated;
        if (taken) {
            Promise.all(files.map(async file => ({name: file.name, type: file.type, content: edit.encodeBytes(new Uint8Array(await file.arrayBuffer()))})))
                .then(edit.takeDroppedFiles)
                .then(markdown => edit.source.insertBlock(markdown))
                .catch(error => edit.setStatus(String(error.message || error)));
        }
        return taken;
    };

    /**
     * Take files dropped onto the page's blocks - see "fluid-block-edit-drop" in sfc/fluid-blockEditor.vue - and fill
     * the slot they were dropped into with what is made of them
     * @param {Object} drop - The drop
     * @param {String} drop.slot - The id of the slot the files were dropped into
     * @param {Object[]} drop.files - `{name, type, content}` for each, `content` its bytes as base64
     * @return {Promise} Resolves once the slot is filled
     */
    edit.onBlockDrop = function ({slot, files}) {
        return edit.takeDroppedFiles(files).then(markdown => edit.ask({op: "fillSlot", slot, markdown}), error => {
            edit.setStatus(String(error.message || error));
            return edit.ask({op: "fillSlot", slot, markdown: ""});
        });
    };

    // The directory of the repository in which dropped images are written, unless the page's linkage names another
    edit.defaultImageDir = "static/img";

    /**
     * The directory of the repository in which dropped images are written
     * @return {String} The directory, e.g. "static/img"
     */
    edit.imageDir = () => edit.linkage.images && edit.linkage.images.dir || edit.defaultImageDir;

    /**
     * The path from the root of the site at which a static file of the repository is published
     * @param {String} path - Its path in the repository, e.g. "static/img/x.png"
     * @return {String} Its path in the site, e.g. "/img/x.png"
     */
    edit.sitePathOf = path => "/" + path.replace(/^static\//, "");

    // The signatures by which the kind of an image is known from its bytes, not from the name or type it is dropped with
    edit.imageSignatures = [
        {ext: "png", type: "image/png", test: bytes => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47},
        {ext: "jpg", type: "image/jpeg", test: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff},
        {ext: "gif", type: "image/gif", test: bytes => String.fromCharCode(...bytes.subarray(0, 4)) === "GIF8"},
        {ext: "webp", type: "image/webp", test: bytes => String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"},
        {ext: "avif", type: "image/avif", test: bytes => String.fromCharCode(...bytes.subarray(4, 12)) === "ftypavif"},
        {ext: "svg", type: "image/svg+xml", test: bytes => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i
            .test(new TextDecoder().decode(bytes.subarray(0, 2048)))}
    ];

    /**
     * Know the kind of an image from its bytes
     * @param {Uint8Array} bytes - The bytes
     * @return {Object|null} `{ext, type}` - its extension and MIME type - or null if they are no image's
     */
    edit.sniffImage = bytes => edit.imageSignatures.find(signature => signature.test(bytes)) || null;

    /**
     * Make a slug of a name, for the file of an image
     * @param {String} name - The name
     * @return {String} The slug, of lower-case letters, digits and hyphens
     */
    edit.slugOf = name => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    /**
     * Name the file of a dropped image, unused by the site and by the files held to be committed - by the dropped file's
     * own name if it is a meaningful one, e.g. not a screenshot's "image.png", otherwise by the page's source, e.g.
     * "ui-as-code-1.png" for content/post/2025-03-20-ui-as-code.md
     * @param {String} fileName - The name the file was dropped with
     * @param {String} ext - The extension its bytes call for
     * @return {String} The path in the repository, e.g. "static/img/ui-as-code-1.png"
     */
    edit.allocateImagePath = function (fileName, ext) {
        const own = edit.slugOf((fileName || "").replace(/\.[^.]*$/, ""));
        const meaningful = own !== "" && !/^(image|screenshot|clipboard|untitled)(-\d+)?$/.test(own);
        const sourceName = (edit.targetPath || "image").replace(/^.*\//, "").replace(/\.[^.]*$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
        const stem = meaningful ? own : edit.slugOf(sourceName) || "image";
        const assets = new Set(edit.site ? edit.site.assets : []);
        const claim = edit.targetPath ? edit.claimOf(edit.targetPath) : null;
        const used = path => assets.has(edit.sitePathOf(path)) || edit.site && edit.site.staticFiles[path] !== undefined ||
            !!edit.pendingFiles[path] || !!(claim && claim.files && claim.files[path]);
        const pathOf = suffix => edit.imageDir() + "/" + stem + suffix + "." + ext;
        let n = 1;
        let path = meaningful ? pathOf("") : pathOf("-1");
        while (used(path)) {
            ++n;
            path = pathOf("-" + n);
        }
        return path;
    };

    /**
     * Show in the page the images held to be committed which it does not yet publish - those of a claim's further
     * files, and those pending
     * @param {Object<String, ClaimFile>} files - Further files, by path, beside those pending
     * @return {Promise<Number>} The number of images previewed
     */
    edit.previewImages = function (files) {
        const dir = edit.imageDir() + "/";
        const images = Object.entries({...files, ...edit.pendingFiles}).filter(([path, file]) => path.startsWith(dir) && file && file.content)
            .map(([path, file]) => {
                const kind = edit.sniffImage(edit.decodeBase64(file.content));
                return kind ? {url: new URL(fluidSourceView.relativePath(edit.linkage.page, edit.sitePathOf(path)), location.href).href,
                    type: kind.type, content: file.content} : null;
            }).filter(image => image);
        return images.length > 0 ? edit.ask({op: "previewImages", images}) : Promise.resolve(0);
    };

    /**
     * Make what is to be inserted into the page's source of files dropped into it - a widget's element for one held as
     * a ZIP file, or as a PTF document, and an image's markdown for an image - and hold the files they bring, to be
     * committed with the source
     * @param {Object[]} files - `{name, type, content}` for each, `content` its bytes as base64
     * @return {Promise<String>} The markdown, a block for each file, set off by blank lines
     */
    edit.takeDroppedFiles = async function (files) {
        await edit.learnSite();
        const blocks = [];
        for (const file of files) {
            const bytes = edit.decodeBase64(file.content);
            const image = edit.sniffImage(bytes);
            const text = image || fluidZip.isZip(bytes) ? "" : new TextDecoder().decode(bytes);
            const source = edit.source.getText() + "\n" + blocks.join("\n");
            if (fluidZip.isZip(bytes)) {
                const widget = fluidZip.toWidget(await fluidZip.read(bytes));
                const made = widget.ptf !== undefined ? await edit.ask({op: "widgetFromPTF", text: widget.ptf, source}) :
                    await edit.ask({op: "widgetFromParts", parts: widget.parts, source});
                const images = widget.images.map(one => ({path: edit.imageDir() + "/" + one.name, content: edit.encodeBytes(one.bytes)}));
                await edit.addFiles([...made.files, ...images]);
                blocks.push(made.markup);
            } else if (image) {
                const path = edit.allocateImagePath(file.name, image.ext);
                await edit.addFiles([{path, content: file.content}]);
                const alt = (file.name || "").replace(/\.[^.]*$/, "").replace(/[[\]]/g, "");
                blocks.push("![" + alt + "](" + fluidSourceView.relativePath(edit.linkage.page, edit.sitePathOf(path)) + ")");
            } else if (/MIME-Version:[ \t]*1\.0/i.test(text)) {
                const made = await edit.ask({op: "widgetFromPTF", text, source});
                await edit.addFiles(made.files);
                blocks.push(made.markup);
            } else {
                throw new Error(file.name + " is neither a widget, as a ZIP file or a PTF document, nor an image");
            }
        }
        await edit.filesPromise;
        await edit.previewImages({});
        return blocks.join("\n\n");
    };

    /**
     * Record an edit of the text in the panel as the claim, uncommitted
     * @param {String} text - The edited text of the source
     */
    edit.onInput = async function (text) {
        if (edit.linkage.source && edit.targetPath === edit.linkage.source.path) {
            edit.learnHeadings(text);
        }
        // Any files a pasted widget brings are held first
        await edit.filesPromise;
        const path = edit.targetPath;
        const claim = path ? edit.claimOf(path) : null;
        const base = claim ? {sha: claim.baseSha, hash: claim.baseHash, text: claim.baseText} : edit.bases[path];
        if (path && base) {
            const hash = await edit.hashText(text);
            const pending = edit.pendingFiles;
            edit.pendingFiles = {};
            const files = {...claim && claim.files, ...pending};
            await edit.putClaim({
                repo: edit.linkage.repo,
                branch: edit.linkage.branch,
                path,
                // The text edited, so that a source of framing, shown live on every page, may be restored on discarding
                baseText: edit.framingOf(path) ? base.text : undefined,
                page: edit.linkage.page,
                baseHash: base.hash,
                baseSha: base.sha,
                text,
                hash,
                state: "uncommitted",
                message: undefined,
                files: Object.keys(files).length > 0 ? files : undefined
            });
        }
    };

    /**
     * Show a line of status in the panel
     * @param {String} text - The status
     */
    edit.setStatus = function (text) {
        if (edit.panel) {
            edit.panel.querySelector(".fluid-edit-status").textContent = text;
        }
    };

    /**
     * Bring the panel's controls into line with the claim's state
     */
    edit.updatePanel = function () {
        if (edit.panel) {
            const claim = edit.targetPath ? edit.claimOf(edit.targetPath) : null;
            const state = claim ? claim.state : null;
            edit.panel.setAttribute("data-fluid-claim-state", state || "none");
            edit.panel.querySelector(".fluid-edit-commit").disabled = state !== "uncommitted";
            edit.panel.querySelector(".fluid-edit-discard").disabled = !state;
            edit.panel.querySelector(".fluid-edit-buttons").hidden = !edit.targetPath;
            edit.panel.querySelector(".fluid-edit-state").textContent = !edit.targetPath ? "" : state ? edit.stateLabels[state] : "No edits";
            const target = edit.target();
            edit.panel.querySelector(".fluid-edit-mode").hidden = !(target && !target.framing && !target.creating);
            if (claim && claim.message) {
                edit.setStatus(claim.message);
            }
        }
        edit.showListHead();
    };

    /**
     * Dock the panel beside the page's <body>, or withdraw it - as Infusion's full-page editor docks its own, by the
     * `fl-docking-area-mode` of the root element, so that the page keeps its layout and its scrollbar beside its content.
     * The body then scrolls within its share, so the page's scroll is carried across. Once the page is live, the bar
     * setting the panel off is bound as Infusion's fluid.resizeBar - see bridge.js
     * @param {Boolean} on - Whether the panel is shown
     */
    edit.dock = function (on) {
        const root = document.documentElement;
        const wasDocked = (root.getAttribute("fl-docking-area-mode") || "").includes("edge");
        const top = wasDocked ? document.body.scrollTop : window.scrollY;
        root.setAttribute("fl-docking-area-mode", on ? "right edge" : "minimized");
        edit.panel.hidden = !on;
        if (on) {
            document.body.scrollTop = top;
        } else {
            window.scrollTo(0, top);
        }
        if (on && edit.migrated && !edit.resizeBarBound) {
            edit.resizeBarBound = true;
            edit.ask({op: "bindResizeBar", bar: ".fluid-edit-resize-bar", panel: ".fluid-edit-panel"})
                .catch(error => edit.setStatus("The panel cannot be resized, since " + (error.message || error)));
        }
        edit.rememberSession();
        edit.showListHead();
    };

    // The fold control of the source, as in the filter panels of imerss-bioinfo - a chevron turned down when unfolded
    edit.chevron = "<svg class=\"fluid-edit-chev\" width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" aria-hidden=\"true\">" +
        "<path d=\"M6 3l5 5-5 5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path></svg>";

    /**
     * Make the editing panel - a text editor of the whole source file, with controls to commit and discard. It is made
     * hidden, and shown by edit.dock
     */
    edit.makePanel = function () {
        const panel = document.createElement("div");
        panel.className = "fluid-edit-panel";
        panel.hidden = true;
        // The extension's own, which the bridge keeps out of the page while its component tree is first booted
        panel.setAttribute("data-fluid-edit-ui", "");
        panel.innerHTML = `
            <header><strong>Edit in Infusion</strong> <span class="fluid-edit-path"></span>
                <button class="fluid-edit-close" title="Close the editor">×</button></header>
            <div class="fluid-edit-framing-row">
                <label><input type="checkbox" class="fluid-edit-framing"> Also edit framing</label>
                <button class="fluid-edit-config" hidden title="Edit the site's configuration">Site configuration</button>
            </div>
            <div class="fluid-edit-new" hidden>
                <label>Title <input type="text" class="fluid-edit-new-title" placeholder="The title of the new post"></label>
            </div>
            <div class="fluid-edit-state"></div>
            <div class="fluid-edit-mode">
                <label><input type="checkbox" class="fluid-edit-inpage" checked> Edit in the page</label>
            </div>
            <details class="fluid-edit-source">
                <summary>${edit.chevron} Edit as source</summary>
                <div class="fluid-edit-source-view"></div>
            </details>
            <div class="fluid-edit-buttons">
                <button class="fluid-edit-commit">Commit</button>
                <button class="fluid-edit-discard">Discard edits</button>
            </div>
            <div class="fluid-edit-status"></div>`;
        panel.querySelector(".fluid-edit-framing").addEventListener("change", event => edit.setFramingMode(event.target.checked));
        panel.querySelector(".fluid-edit-framing-row").hidden = !(edit.linkage.framing || []).length;
        panel.querySelector(".fluid-edit-config").addEventListener("click", () => {
            edit.switchTarget(edit.linkage.framing.find(framing => framing.kind === "patch").path);
        });
        panel.querySelector(".fluid-edit-inpage").addEventListener("change", event => {
            edit.inPageWanted = event.target.checked;
            edit.setBlockEditing(event.target.checked);
        });
        let titleTimer = null;
        panel.querySelector(".fluid-edit-new-title").addEventListener("input", event => {
            clearTimeout(titleTimer);
            titleTimer = setTimeout(() => edit.retitleNewPost(event.target.value), 300);
        });
        let inputTimer = null;
        // The source, in CodeMirror - see sourceView.js. The line of its cursor marks the block holding it in the page
        edit.source = fluidSourceView.create(panel.querySelector(".fluid-edit-source-view"), {
            onChange: text => {
                clearTimeout(inputTimer);
                inputTimer = setTimeout(() => edit.onInput(text), 300);
            },
            getSite: () => edit.site,
            onPaste: text => edit.onSourcePaste(text),
            onDrop: files => edit.onSourceDrop(files),
            onCursorLine: line => document.dispatchEvent(new CustomEvent("fluid-source-cursor", {detail: JSON.stringify({line})}))
        });
        const details = panel.querySelector(".fluid-edit-source");
        // The user's own folding is remembered for every panel - see edit.prefs
        details.querySelector("summary").addEventListener("click", () => edit.setPref("sourceOpen", !details.open));
        // The view was made folded, at no size - it measures itself again once shown. The page makes room for it
        details.addEventListener("toggle", () => {
            if (details.open) {
                edit.source.view.requestMeasure();
            }
        });
        panel.querySelector(".fluid-edit-commit").addEventListener("click", async function () {
            edit.setStatus("Committing ...");
            const claim = await edit.send({type: "claim-commit", id: edit.claimOf(edit.targetPath).id});
            await edit.showClaimOf(claim.path, claim);
            edit.setStatus(claim.state === "committed" ? "Committed as " + claim.commitSha.substring(0, 7) : claim.message || "");
            edit.poll();
        });
        panel.querySelector(".fluid-edit-discard").addEventListener("click", async function () {
            const path = edit.targetPath;
            const creating = edit.target() && edit.target().creating;
            await edit.send({type: "claim-remove", id: edit.claimOf(path).id});
            delete edit.bases[path];
            await edit.showClaimOf(path, null);
            edit.source.setText("");
            if (creating) {
                edit.creating = null;
                edit.switchTarget(null);
            } else {
                edit.activate();
            }
        });
        panel.querySelector(".fluid-edit-close").addEventListener("click", () => {
            edit.dock(false);
        });
        // Docked outside the <body>, after it, beside a bar setting it off - see edit.dock
        const bar = document.createElement("div");
        bar.className = "fluid-edit-resize-bar";
        bar.setAttribute("data-fluid-edit-ui", "");
        document.documentElement.appendChild(bar);
        document.documentElement.appendChild(panel);
        edit.resizeBar = bar;
        edit.panel = panel;
        edit.keepAttached();
    };

    /**
     * Keep the panel and its bar in the page - a page booting its own tree as it loads, e.g. for a live island, claims
     * the markup of its root element, and removes what it did not render, as it may when the editor reopens at once on
     * navigating. They are put back, unless the bridge has itself withdrawn them while it boots the page's tree
     */
    edit.keepAttached = function () {
        const root = document.documentElement;
        new MutationObserver(() => {
            if (!edit.panel.isConnected && !root.hasAttribute("data-fluid-edit-booting")) {
                root.appendChild(edit.resizeBar);
                root.appendChild(edit.panel);
            }
        }).observe(root, {childList: true});
    };

    /**
     * Start on a page bearing a linkage record: show any claim held on its source, and listen for activation
     */
    edit.start = async function () {
        edit.linkage = JSON.parse(linkageNode.textContent);
        document.addEventListener("fluid-block-edit-source", event => edit.onBlockEdit(JSON.parse(event.detail).text));
        // The layers of a widget pasted into a block - see sfc/fluid-blockEditor.vue
        document.addEventListener("fluid-block-edit-files", event => edit.addFiles(JSON.parse(event.detail).files));
        // Files dropped onto a block - see sfc/fluid-blockEditor.vue
        document.addEventListener("fluid-block-edit-drop", event => edit.onBlockDrop(JSON.parse(event.detail)));
        // The block in hand in the page - its lines are shown in the source view, which returns to the page's own
        // source if it shows another, e.g. the footer's
        document.addEventListener("fluid-block-edit-focus", event => {
            if (edit.source && edit.linkage.source) {
                const range = JSON.parse(event.detail);
                if (edit.targetPath === edit.linkage.source.path) {
                    edit.source.showBlock(range);
                } else {
                    edit.switchTarget(edit.linkage.source.path).then(() => edit.source.showBlock(range));
                }
            }
        });
        document.addEventListener("click", edit.onFramingClick, true);
        // Listened for at once, so that the user may activate the editor before any claim is shown
        chrome.runtime.onMessage.addListener(message => {
            if (message.type === "fluid-edit-activate") {
                edit.started.then(() => edit.activate());
            }
        });
        const stored = await chrome.storage.local.get(["pollInterval", edit.prefsKey]);
        edit.prefs = {...edit.prefs, ...stored[edit.prefsKey]};
        // Only a build for testing, against a mock GitHub, may poll faster - see extension/test/harness.js
        edit.pollInterval = chrome.runtime.getManifest().fluid_testing && stored.pollInterval || pollInterval;
        edit.blocks = (edit.linkage.blocks || []).flatMap(block => [...document.querySelectorAll(block.selector)]);
        edit.originals = edit.blocks.map(block => block.innerHTML);
        // A page with no source of its own, e.g. a list, edits nothing until something is chosen - its framing, or a new post
        edit.targetPath = edit.linkage.source ? edit.linkage.source.path : null;
        /**
         * Fetch the claim held on a source, dropping it if the page itself was built from its text - it has been
         * published since the claim was last seen
         * @param {String} path - The source's path
         * @param {String} hash - The hash of the source this page was built from
         * @return {Promise<Claim|null>} The claim, or null
         */
        const current = async function (path, hash) {
            const claim = await edit.send({type: "claim-get", repo: edit.linkage.repo, path});
            let togo = claim || null;
            if (claim && claim.hash === hash) {
                await edit.send({type: "claim-remove", id: claim.id});
                togo = null;
            }
            return togo;
        };
        if (edit.linkage.source) {
            await edit.showClaim(await current(edit.linkage.source.path, edit.linkage.source.hash));
        }
        // A claim on a source of the framing, made on any page, is shown on every page rendering it
        for (const framing of edit.linkage.framing || []) {
            const claim = await current(framing.path, framing.hash);
            if (claim) {
                await edit.showFraming(framing, claim);
            }
        }
        // The new posts of a list page's section, held as claims, not yet published
        const section = edit.section();
        if (section) {
            const claims = await edit.send({type: "claim-list", repo: edit.linkage.repo, prefix: section.contentDir + "/"});
            claims.filter(claim => !claim.baseSha).forEach(claim => {
                edit.newClaims[claim.path] = claim;
            });
            edit.showListHead();
        }
        edit.updateBadge();
        edit.poll();
        // The editor stays open as the user navigates the site in the tab
        const session = edit.recallSession();
        if (session) {
            await edit.activate();
            if (session.framing) {
                await edit.setFramingMode(true);
            }
        }
    };

    // Every page of a site has a linkage record - one with a source of its own, or framing, has something to edit. The
    // script is injected on a click, or registered for an enlisted site's pages - see background.js - and starts once
    const linkageOf = () => JSON.parse(linkageNode.textContent);
    if (!injectedBefore && linkageNode && (linkageOf().source || (linkageOf().framing || []).length > 0)) {
        edit.started = edit.start().catch(error => console.error("Edit in Infusion could not start on this page:", error));
    }
})();
