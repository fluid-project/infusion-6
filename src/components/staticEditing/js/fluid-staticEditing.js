"use strict";

// The editing of a statically published page in place - the logic of the editing panel, fluid.staticEditor, which
// holds a controller of it made by `fluid.staticEditing.bind`. On a page bearing a Fluid provenance record, written by
// the site's build (wend's js/trace.js), whose component tree has been booted over it from the site's own copy of
// Infusion, it:
//  - shows any claim held on the page's sources over the page, styled by its state, so that an edit appears to have
//    been made at once - the claim's text is given to the page's live components, which render it as the build did;
//  - on activation, opens the panel, editing the source in place in the page's blocks, and as source;
//  - commits a claim on request;
//  - polls the published trace, dropping a claim once the trace records its hash - the site has published it.
// It runs in the page's own world, and holds nothing privileged. What only an editing client may do - hold claims,
// read the repository and commit to it - it asks of the client through the relay: a DOM event
// `fluid.staticEditing.relayRequest` {requestId, type, ...} on the document, answered by
// `fluid.staticEditing.relayReply` {requestId, ok, result | error} - e.g. by the content script of the "Edit in Infusion" extension, which confirms every
// commit with the user itself. The page's migration and rendering are asked of the extension's bridge, which shares
// this world, as `window.fluidEditBridge`.

const fluidStaticEditingScope = function (fluid) {
    fluid.registerNamespace("fluid.staticEditing");

    // The DOM events of the relay to the editing client
    fluid.staticEditing.relayRequest = "fluid-edit-relay-request";
    fluid.staticEditing.relayReply = "fluid-edit-relay-reply";

    // The DOM event, on the document, by which the editing client asks for the panel to be opened
    fluid.staticEditing.activateEvent = "fluid-edit-activate";
    // Dispatched on the document when a claim is removed from another page - see fluid.staticEditing.claimRemoved
    fluid.staticEditing.claimRemovedEvent = "fluid-edit-claim-removed";

    /**
     * Ask the editing client for something only it may do, through the relay, unwrapping its reply
     * @param {Object} edit - The controller
     * @param {Object} message - The message, with its `type`, e.g. "claim-get"
     * @return {Promise<Any>} The result of handling it
     */
    fluid.staticEditing.send = function (edit, message) {
        const requestId = String(++edit.requestCount);
        return new Promise((resolve, reject) => {
            const listener = event => {
                const reply = JSON.parse(event.detail);
                if (reply.requestId === requestId) {
                    document.removeEventListener(fluid.staticEditing.relayReply, listener);
                    if (reply.ok) {
                        resolve(reply.result);
                    } else {
                        reject(new Error(reply.error || "No reply from the editing client"));
                    }
                }
            };
            document.addEventListener(fluid.staticEditing.relayReply, listener);
            document.dispatchEvent(new CustomEvent(fluid.staticEditing.relayRequest, {detail: JSON.stringify({...message, requestId})}));
        });
    };

    /**
     * Hash text as the site's build hashes its sources - see wend's siteModel.hashText
     * @param {Object} edit - The controller
     * @param {String} text - The text
     * @return {Promise<String>} "sha256-" followed by the hex digest of its UTF-8 encoding
     */
    fluid.staticEditing.hashText = (edit, text) => fluid.staticEditing.hashBytes(edit, new TextEncoder().encode(text));

    /**
     * Hash bytes as the site's build hashes its static files - see wend's trace.staticHashes
     * @param {Object} edit - The controller
     * @param {Uint8Array} bytes - The bytes
     * @return {Promise<String>} "sha256-" followed by the hex digest of the bytes
     */
    fluid.staticEditing.hashBytes = async function (edit, bytes) {
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return "sha256-" + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    };

    /**
     * Ask the bridge, in this world, to do something to the page - see the extension's bridge.js
     * @param {Object} edit - The controller
     * @param {Object} request - The request, with its `op` and arguments
     * @return {Promise<Any>} The result
     */
    fluid.staticEditing.ask = async function (edit, request) {
        const op = window.fluidEditBridge.ops[request.op];
        if (!op) {
            throw new Error("Unknown request " + request.op);
        }
        return op(request);
    };

    /**
     * The renderer of markdown which the page's provenance names - the site's own pipeline, published by its build,
     * which the page's migration has loaded
     * @param {Object} edit - The controller
     * @return {Promise<Object>} The renderer's record from the provenance, `{scripts, global}`
     */
    fluid.staticEditing.loadRenderer = function (edit) {
        const renderer = edit.provenance.renderers && edit.provenance.renderers.markdown;
        return renderer ? Promise.resolve(renderer) :
            Promise.reject(new Error("This page's provenance names no renderer of markdown"));
    };

    /**
     * Fetch the site's published trace, bypassing caches
     * @param {Object} edit - The controller
     * @return {Promise<Object|null>} The trace, or null if it can't be fetched
     */
    fluid.staticEditing.fetchTrace = async function (edit) {
        let togo = null;
        try {
            // Relative to the page's own location, not to any <base> it declares
            const url = new URL(edit.provenance.trace, location.href);
            url.searchParams.set("t", String(Date.now()));
            const response = await fetch(url, {cache: "no-store"});
            togo = response.ok ? await response.json() : null;
        } catch (error) {
            togo = null;
        }
        return togo;
    };

    /**
     * Mark each block with the claim's state, and label it. Beside the label of an edit not yet committed are its
     * Commit and Discard edits buttons, as in the panel, so that it may be committed or discarded from the page itself
     * @param {Object} edit - The controller
     * @param {String|null} state - The state, or null to clear the marking
     * @param {String} [text] - The label's text
     */
    fluid.staticEditing.markBlocks = function (edit, state, text) {
        edit.blocks.forEach(block => {
            const row = block.previousElementSibling && block.previousElementSibling.classList.contains("fluid-edit-label-row") ?
                block.previousElementSibling : null;
            if (state) {
                block.setAttribute("data-fluid-claim-state", state);
                const rowNode = row || fluid.staticEditing.makeLabelRow(edit, block);
                const labelNode = rowNode.querySelector(".fluid-edit-label");
                labelNode.className = "fluid-edit-label fluid-edit-label-" + state;
                labelNode.textContent = text;
                rowNode.querySelector(".fluid-edit-label-commit").hidden = state !== "uncommitted";
                rowNode.querySelector(".fluid-edit-label-discard").hidden = state !== "uncommitted" && state !== "conflict";
            } else {
                block.removeAttribute("data-fluid-claim-state");
                if (row) {
                    row.remove();
                }
            }
        });
    };

    /**
     * Make the row labelling a block with its claim's state, before the block - the label, and the buttons committing
     * and discarding the edit, which act as the panel's do
     * @param {Object} edit - The controller
     * @param {Element} block - The block
     * @return {Element} The row
     */
    fluid.staticEditing.makeLabelRow = function (edit, block) {
        const row = document.createElement("div");
        row.className = "fluid-edit-label-row";
        row.setAttribute("data-fluid-edit-ui", "");
        const label = document.createElement("span");
        label.className = "fluid-edit-label";
        row.appendChild(label);
        const button = (className, text, action) => {
            const node = document.createElement("button");
            node.type = "button";
            node.className = "fluid-edit-label-button " + className;
            node.textContent = text;
            node.addEventListener("click", () => action(edit));
            row.appendChild(node);
        };
        button("fluid-edit-label-commit", "Commit", edit => fluid.staticEditing.actOnPageClaim(edit, fluid.staticEditing.commit));
        button("fluid-edit-label-discard", "Discard edits", edit => fluid.staticEditing.actOnPageClaim(edit, fluid.staticEditing.discard));
        return block.parentNode.insertBefore(row, block);
    };

    /**
     * Commit or discard the edit of the page's own content, from the buttons beside its label - the panel is turned to
     * that content first, should it be editing another source, e.g. the page's footer
     * @param {Object} edit - The controller
     * @param {Function} action - `fluid.staticEditing.commit` or `fluid.staticEditing.discard`, acting on the source the
     * panel edits
     * @return {Promise} Resolves once it has acted
     */
    fluid.staticEditing.actOnPageClaim = async function (edit, action) {
        const path = edit.claim && edit.claim.path;
        if (path && path !== edit.targetPath) {
            await fluid.staticEditing.switchTarget(edit, path);
        }
        if (path) {
            await action(edit);
        }
    };

    // The label shown on blocks in each state
    fluid.staticEditing.stateLabels = {
        uncommitted: "Edited in this browser - not yet committed",
        committed: "Committed - waiting for the site to be rebuilt and published",
        conflict: "Conflict - the source has changed since this edit was begun",
        published: "Published"
    };

    /**
     * Show a claim over the page's blocks - rendering its text into them, and marking them with its state - or, with
     * no claim, restore the published blocks
     * @param {Object} edit - The controller
     * @param {Claim|null} claim - The claim
     * @return {Promise} Resolves once the claim is shown
     */
    fluid.staticEditing.showClaim = async function (edit, claim) {
        edit.claim = claim;
        let message = claim ? claim.message : null;
        try {
            await fluid.staticEditing.showText(edit, claim ? claim.text : null, claim);
        } catch (error) {
            message = String(error.message || error);
        }
        if (claim) {
            fluid.staticEditing.markBlocks(edit, claim.state, fluid.staticEditing.stateLabels[claim.state] + (message ? " - " + message : ""));
        } else {
            fluid.staticEditing.markBlocks(edit, null);
        }
        fluid.staticEditing.updatePanel(edit);
        fluid.staticEditing.updateBadge(edit);
    };

    /**
     * Tell the extension what the page is showing, for the mark on its icon - whether any claim is held on a source it
     * renders, and whether the editor is open
     * @param {Object} edit - The controller
     */
    fluid.staticEditing.updateBadge = function (edit) {
        const claims = fluid.staticEditing.allClaims(edit);
        fluid.staticEditing.send(edit, {type: "fluid-provenance-found", sourcePath: edit.provenance.source ? edit.provenance.source.path : edit.provenance.page,
            claimState: claims.length > 0 ? claims[0].state : null, open: !edit.state.hidden}).catch(() => null);
    };

    /**
     * Find the record of a source of the page's framing
     * @param {Object} edit - The controller
     * @param {String} path - The source's path
     * @return {Object|undefined} Its record from the provenance, `{path, layer, label, hash}`
     */
    fluid.staticEditing.framingOf = (edit, path) => (edit.provenance.framing || []).find(framing => framing.path === path);

    /**
     * Find the claim held on a source the page renders
     * @param {Object} edit - The controller
     * @param {String} path - The source's path
     * @return {Claim|null} The claim, or null
     */
    fluid.staticEditing.claimOf = (edit, path) => fluid.staticEditing.framingOf(edit, path) ? edit.framingClaims[path] || null :
        fluid.staticEditing.isNewPost(edit, path) ? edit.newClaims[path] || null : edit.claim;

    /**
     * Whether a source is a new post, not yet in the repository, of the section a list page lists
     * @param {Object} edit - The controller
     * @param {String} path - The source's path
     * @return {Boolean} `true` if it is
     */
    fluid.staticEditing.isNewPost = (edit, path) => !edit.provenance.source && !fluid.staticEditing.framingOf(edit, path) && !!path;

    /**
     * List every claim held on a source the page renders
     * @param {Object} edit - The controller
     * @return {Claim[]} The claims
     */
    fluid.staticEditing.allClaims = (edit) => [edit.claim, ...Object.values(edit.framingClaims), ...Object.values(edit.newClaims)].filter(claim => claim);

    /**
     * Mark the elements rendering a source of the page's framing with its claim's state - or, while the framing is
     * being edited, as editable
     * @param {Object} edit - The controller
     * @param {Object} framing - The source's record from the provenance
     * @return {Promise} Resolves once marked
     */
    fluid.staticEditing.markFraming = function (edit, framing) {
        const claim = edit.framingClaims[framing.path];
        const state = claim ? claim.state : !edit.framingMode ? null : edit.targetPath === framing.path ? "editing" : "editable";
        const label = claim ? framing.label + ": " + fluid.staticEditing.stateLabels[claim.state] + (claim.message ? " - " + claim.message : "") :
            framing.label + (state === "editing" ? " - editing, shared by every page" : " - shared by every page, click to edit");
        // The configuration renders nowhere of its own - its claim is shown in the panel, and on the elements it changes
        // only as they change
        return framing.layer ? fluid.staticEditing.ask(edit, {op: "markLayer", layer: framing.layer, path: framing.path, state, label}).then(count => {
            // The framing edited is edited in place too, its literal text, beside its source
            fluid.staticEditing.framingInPlace(edit, framing, edit.framingMode && edit.targetPath === framing.path);
            return count;
        }) : Promise.resolve(0);
    };

    // The tooltip of text of the framing which its template interpolates, rather than writes, and so is not edited in place
    fluid.staticEditing.templatedTitle = "This material is templated, try using \"Ask Anything\" to modify it if you are not happy editing the source template";

    /**
     * Make the elements rendering a source of the framing editable in place, or cease to. The text its template writes
     * literally may be typed into, and is written back into the template - see commitFramingText. Text the template
     * interpolates, e.g. "@{author.name}", is shown as such, highlighted and not editable: an element holding any is
     * marked as templated. Each text node records the text it was rendered with, by which its edit is found in the
     * template. Done afresh each time the framing renders, since its rendering may replace what is marked
     * @param {Object} edit - The controller
     * @param {Object} framing - The source's record from the provenance
     * @param {Boolean} on - Whether it is edited in place
     */
    fluid.staticEditing.framingInPlace = function (edit, framing, on) {
        document.querySelectorAll("[data-fluid-framing-editable]").forEach(root => {
            if (!on || root.getAttribute("data-fluid-framing") !== framing.path) {
                root.removeAttribute("contenteditable");
                root.removeAttribute("data-fluid-framing-editable");
                root.querySelectorAll("[data-fluid-templated]").forEach(element => {
                    ["contenteditable", "data-fluid-templated", "title"].forEach(name => element.removeAttribute(name));
                });
            }
        });
        if (on) {
            document.querySelectorAll(`[data-fluid-framing="${CSS.escape(framing.path)}"]`).forEach(root => {
                // Nodes not of the rendering, e.g. typed before the template was written, are not shown - see sweepUnrendered
                if (fluid.blockEditor && fluid.blockEditor.sweepUnrendered) {
                    fluid.blockEditor.sweepUnrendered(root, {kind: "island"});
                }
                root.setAttribute("contenteditable", "true");
                root.setAttribute("data-fluid-framing-editable", "");
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                    node.flRenderedText = node.nodeValue;
                    delete node.flSourceRange;
                    if (node.flBound && node.parentElement !== root) {
                        node.parentElement.setAttribute("contenteditable", "false");
                        node.parentElement.setAttribute("data-fluid-templated", "");
                        node.parentElement.setAttribute("title", fluid.staticEditing.templatedTitle);
                    }
                }
            });
        }
    };

    /**
     * The template of an SFC - the text between its <template> and </template>
     * @param {String} source - The SFC's text
     * @return {Object|null} `{from, text}` - where it begins in the source, and its text - or null if it has none
     */
    fluid.staticEditing.templateOf = function (source) {
        const open = source.indexOf("<template>");
        const close = source.lastIndexOf("</template>");
        return open >= 0 && close > open ? {from: open, text: source.substring(open, close)} : null;
    };

    /**
     * Find the range of the source from which a text node was parsed, as Infusion's renderer records it on the node (see
     * `flTemplateRange` in FluidView.js) - valid only while the source still holds, there, the node's template text,
     * since the range indexes the text as it was last parsed, which typing in the source or the page runs ahead of
     * until the page next renders. A template held other than in an SFC's <template>, e.g. as a string of its layer's
     * definition, is parsed from text other than the source, and its ranges are not found valid
     * @param {Text} node - The text node
     * @param {String} source - The SFC's text, as it now stands
     * @return {Object|null} `{from, to}` - the range of the source holding the node's template text, less any whitespace
     * about it - or null if the node bears no range, or it is no longer valid
     */
    fluid.staticEditing.carriedRange = function (node, source) {
        const range = node.flTemplateRange;
        const template = fluid.staticEditing.templateOf(source);
        let togo = null;
        if (range && template && range.start >= template.from && range.end <= template.from + template.text.length &&
            node.flTemplateText !== undefined) {
            const raw = source.substring(range.start, range.end);
            if (fluid.decodeHtmlEntity(raw) === node.flTemplateText && raw.trim() !== "") {
                togo = {from: range.start + raw.length - raw.trimStart().length, to: range.end - (raw.length - raw.trimEnd().length)};
            }
        }
        return togo;
    };

    /**
     * Find, by search, where in the source of the framing a text node of it is rendered from - the one place in the
     * SFC's template outside its tags at which the node's template text is written, entities and runs of whitespace as
     * the template writes them. A node whose text is found nowhere, or more than once, has no range
     * @param {Text} node - The text node
     * @param {String} source - The SFC's text
     * @param {String} [text] - The text to be found - by default the node's template text, or else its text
     * @return {Object|null} `{from, to}` - the range of its template text in the source - or null
     */
    fluid.staticEditing.searchedRange = function (node, source, text) {
        const template = fluid.staticEditing.templateOf(source);
        const sought = (text ?? node.flTemplateText ?? node.nodeValue ?? "").trim();
        let togo = null;
        if (template && sought !== "") {
            const pattern = new RegExp(fluid.staticEditing.templateTextPattern(sought), "g");
            const matches = [...template.text.matchAll(pattern)].filter(match => !/^[^<]*>/.test(template.text.substring(match.index + match[0].length)));
            if (matches.length === 1) {
                togo = {from: template.from + matches[0].index, to: template.from + matches[0].index + matches[0][0].length};
            }
        }
        return togo;
    };

    /**
     * Find where in the source of the framing a text node of it is rendered from - by the range the renderer recorded
     * on it, while that is valid, or else by searching the template for its text
     * @param {Text} node - The text node
     * @param {String} source - The SFC's text
     * @return {Object|null} `{from, to}` - the range of its template text in the source, less any whitespace about it -
     * or null if it can't be found
     */
    fluid.staticEditing.framingRange = (node, source) => fluid.staticEditing.carriedRange(node, source) || fluid.staticEditing.searchedRange(node, source);

    /**
     * Find where in the source of the framing a position within one of its text nodes is rendered from - within text
     * written literally, the position matching the characters before it, and within text interpolated from a value,
     * the start of the reference
     * @param {Text} node - The text node
     * @param {Number} offset - The position within its text
     * @param {String} source - The SFC's text
     * @return {Number|null} The position in the source, or null if the node's range can't be found
     */
    fluid.staticEditing.framingSourcePosition = function (node, offset, source) {
        const range = fluid.staticEditing.framingRange(node, source);
        let togo = null;
        if (range && node.flBound) {
            togo = range.from;
        } else if (range) {
            const text = node.nodeValue;
            const lead = text.length - text.trimStart().length;
            const before = text.substring(lead, Math.max(lead, offset));
            const sticky = new RegExp(fluid.staticEditing.templateTextPattern(before), "y");
            sticky.lastIndex = range.from;
            const match = before === "" ? null : sticky.exec(source);
            togo = Math.min(range.to, range.from + (match ? match[0].length : 0));
        }
        return togo;
    };

    /**
     * Show, in the framing edited in place, the text rendered from where the source view's cursor stands - the text
     * node whose template text holds it is highlighted, by the CSS Custom Highlight API, and scrolled into view
     * @param {Object} edit - The controller
     * @param {Number} pos - The cursor's position in the source
     */
    fluid.staticEditing.showFramingPosition = function (edit, pos) {
        const root = document.querySelector(`[data-fluid-framing="${CSS.escape(edit.targetPath || "")}"]`);
        let found = null;
        if (root && edit.source && typeof(pos) === "number") {
            const source = edit.source.getText();
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const range = fluid.staticEditing.framingRange(node, source);
                if (range && pos >= range.from && pos <= range.to && (!found || range.to - range.from < found.range.to - found.range.from)) {
                    found = {node, range};
                }
            }
        }
        if (typeof(CSS) !== "undefined" && CSS.highlights) {
            if (found) {
                const range = document.createRange();
                const text = found.node.nodeValue;
                range.setStart(found.node, text.length - text.trimStart().length);
                range.setEnd(found.node, text.trimEnd().length);
                CSS.highlights.set("fluid-framing-cursor", new Highlight(range));
                const bounds = range.getBoundingClientRect();
                if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
                    found.node.parentElement.scrollIntoView({block: "center", behavior: "smooth"});
                }
            } else {
                CSS.highlights.delete("fluid-framing-cursor");
            }
        }
        edit.framingCursorNode = found ? found.node : null;
    };

    /**
     * Respond to the selection of the page moving - one within the framing edited in place moves the source view's
     * cursor to where the text selected is rendered from. A selection within templated text, which can't be typed into,
     * stands at the start of its reference
     * @param {Object} edit - The controller
     */
    fluid.staticEditing.onFramingSelection = function (edit) {
        const selection = document.getSelection();
        const anchor = selection && selection.rangeCount > 0 ? selection.anchorNode : null;
        const root = anchor ? (anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor).closest("[data-fluid-framing-editable]") : null;
        if (root && root.getAttribute("data-fluid-framing") === edit.targetPath && edit.source) {
            let node = anchor;
            let offset = selection.anchorOffset;
            if (node.nodeType !== Node.TEXT_NODE) {
                const walker = document.createTreeWalker(node.childNodes[offset] || node, NodeFilter.SHOW_TEXT);
                node = walker.nextNode();
                offset = 0;
            }
            const pos = node ? fluid.staticEditing.framingSourcePosition(node, offset, edit.source.getText()) : null;
            if (pos !== null) {
                edit.source.showPosition(pos);
                fluid.staticEditing.showFramingPosition(edit, pos);
            }
        }
    };

    /**
     * What a template reference written in the source the panel edits may name - the contexts in scope of the component
     * rendering it, and the members of each - for completing them as they are typed - see fluid.sourceView's
     * `templateCompletions`. Known only of a source of the framing, whose component the page renders
     * @param {Object} edit - The controller
     * @return {Object|null} `{contexts(), members(context)}` - the names of the contexts in scope, and the members, as
     * `{name, detail}`, of a context, or of the component itself for null - or null if no component renders the source
     */
    fluid.staticEditing.templateScope = function (edit) {
        const target = fluid.staticEditing.target(edit);
        const framing = target && target.framing;
        const root = fluid.globalInstantiator && fluid.globalInstantiator.rootComponent;
        const component = framing && framing.layer && root ? fluid.queryILSelector(root, framing.layer).find(one => !fluid.isUnavailable(one)) : null;
        const shadow = component ? component[fluid.metadataSymbol] : null;
        return shadow ? {
            contexts: () => fluid.staticEditing.scopeContexts(shadow),
            members: context => {
                const rec = context === null ? null : shadow.ownScope[context];
                const scoped = context === null || context === "self" ? shadow : rec ? rec.value : null;
                return scoped ? fluid.staticEditing.scopeMembers(scoped) : [];
            }
        } : null;
    };

    /**
     * The names of the contexts in scope of a component, as its template's references `@{{context}.path}` resolve them
     * @param {Shadow} shadow - The component's shadow
     * @return {String[]} The names, sorted, "self" amongst them
     */
    fluid.staticEditing.scopeContexts = function (shadow) {
        const names = new Set(["self"]);
        // A scope holds its parent's as its prototype - each name in any is in scope
        for (const name in shadow.ownScope) {
            if (typeof(name) === "string" && !name.startsWith("$")) {
                names.add(name);
            }
        }
        return [...names].sort();
    };

    // How deep the members of a component are offered for completing a template's references, e.g. "author.name"
    fluid.staticEditing.scopeDepth = 2;

    /**
     * Describe a value for completing a reference to it - its text, or what kind of value it is
     * @param {any} value - The value
     * @return {String} The description
     */
    fluid.staticEditing.describeValue = function (value) {
        const text = typeof(value) === "string" ? JSON.stringify(value) : typeof(value) === "number" || typeof(value) === "boolean" ? String(value) :
            Array.isArray(value) ? "array of " + value.length : value === null ? "null" : typeof(value) === "object" ? "object" : typeof(value);
        return text.length > 40 ? text.substring(0, 39) + "…" : text;
    };

    /**
     * The members of a component which its template, or another's, may refer to - each top-level member its layers
     * define, other than the framework's own, and the members of those holding plain objects, to `scopeDepth`
     * @param {Shadow} shadow - The component's shadow
     * @return {Object[]} `{name, detail}` for each - its path, e.g. "author.name", and a description of its value
     */
    fluid.staticEditing.scopeMembers = function (shadow) {
        const togo = [];
        const visit = (path, value, depth) => {
            const plain = value !== null && typeof(value) === "object" && !Array.isArray(value) && !fluid.isComponent(value) && !fluid.isSignal(value) &&
                Object.getPrototypeOf(value) === Object.prototype;
            togo.push({name: path, detail: fluid.staticEditing.describeValue(value)});
            if (plain && depth < fluid.staticEditing.scopeDepth) {
                Object.keys(value).filter(key => !key.startsWith("$")).forEach(key => visit(path + "." + key, value[key], depth + 1));
            }
        };
        Object.keys(shadow.layerMap || {}).filter(key => !key.startsWith("$") && !fluid.staticEditing.frameworkMembers.has(key)).sort().forEach(key => {
            let value;
            try {
                value = fluid.deSignal(fluid.getForComponent(shadow, key));
            } catch (error) {
                value = undefined;
            }
            if (typeof(value) !== "function") {
                visit(key, value, 1);
            }
        });
        return togo;
    };

    // Members which every component has of the framework, not offered for completing a template's references
    fluid.staticEditing.frameworkMembers = new Set(["view", "template", "container", "elideParent", "events", "renderedContainer"]);

    /**
     * Respond to text typed into the framing edited in place - it is written back into the template a moment after the
     * typing stops, as text typed into the page's blocks is
     * @param {Object} edit - The controller
     * @param {InputEvent} event - The input
     */
    fluid.staticEditing.onFramingInput = function (edit, event) {
        const root = event.target && event.target.closest ? event.target.closest("[data-fluid-framing-editable]") : null;
        if (root) {
            clearTimeout(edit.framingInputTimer);
            edit.framingInputTimer = setTimeout(() => fluid.staticEditing.commitFramingText(edit, root)
                .catch(error => fluid.staticEditing.setError(edit, error)), 400);
        }
    };

    // The entities by which a template may write characters, beside their numeric forms
    fluid.staticEditing.namedEntities = {"\u00a0": "nbsp", "\u00a9": "copy", "\u2022": "bull", "&": "amp", "<": "lt", ">": "gt",
        "\"": "quot", "'": "apos", "\u2014": "mdash", "\u2013": "ndash", "\u00ae": "reg", "\u2122": "trade", "\u2026": "hellip"};

    /**
     * Make the pattern of the regular expression matching text as a template may write it - each character as itself or
     * as an entity, and each run of whitespace as any run of whitespace, as the template's markup may break its lines
     * @param {String} text - The text, as rendered
     * @return {String} The pattern
     */
    fluid.staticEditing.templateTextPattern = function (text) {
        return [...text.replace(/[ \t\r\n]+/g, " ")].map(char => {
            let togo;
            if (char === " ") {
                togo = "\\s+";
            } else {
                const code = char.codePointAt(0);
                const named = fluid.staticEditing.namedEntities[char];
                const forms = [char.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"), "&#" + code + ";", "&#x" + code.toString(16) + ";", ...(named ? ["&" + named + ";"] : [])];
                togo = "(?:" + forms.join("|") + ")";
            }
            return togo;
        }).join("");
    };

    /**
     * Write text as a template's markup holds it - its markup characters, and non-breaking spaces, as entities
     * @param {String} text - The text
     * @return {String} The markup
     */
    fluid.staticEditing.templateText = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\u00a0/g, "&nbsp;");

    /**
     * Write the text typed into the framing edited in place back into its template - each text node whose text differs
     * from that it was rendered with is found in the template's markup by the range the renderer recorded on it, while
     * the source still holds its text there, or else by searching for what it was rendered with, and the part of it
     * which changed is replaced. The source as rewritten is then the edit of the source, as one typed into its view. A
     * text which can't be found exactly once in the template is not written, and the user told to edit the source
     * @param {Object} edit - The controller
     * @param {Element} root - The element rendering the framing
     * @return {Promise} Resolves once the template is written
     */
    fluid.staticEditing.commitFramingText = async function (edit, root) {
        const path = root.getAttribute("data-fluid-framing");
        if (path === edit.targetPath && edit.source) {
            root.normalize();
            const source = edit.source.getText();
            const template = fluid.staticEditing.templateOf(source);
            const problems = [];
            // Each node's change, as an edit of the source as it now stands - applied once all are found, from the last
            const edits = [];
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node && template !== null; node = walker.nextNode()) {
                // Compared less the whitespace about them, which is the template's layout - the page collapses, or drops,
                // it as it is typed into, and the template keeps its own
                const was = node.flRenderedText === undefined ? undefined : node.flRenderedText.trim();
                const now = node.nodeValue.trim();
                if (was !== undefined && was !== now && !node.flBound) {
                    // The part which changed, between what is common to the start and the end of the text
                    let prefix = 0;
                    while (prefix < was.length && prefix < now.length && was[prefix] === now[prefix]) {
                        ++prefix;
                    }
                    let suffix = 0;
                    while (suffix < was.length - prefix && suffix < now.length - prefix && was[was.length - 1 - suffix] === now[now.length - 1 - suffix]) {
                        ++suffix;
                    }
                    // Matched against the range of the template's text less the whitespace about it, which is the
                    // range found
                    const parts = "^(" + fluid.staticEditing.templateTextPattern(was.substring(0, prefix)) + ")(" +
                        fluid.staticEditing.templateTextPattern(was.substring(prefix, was.length - suffix)) + ")(" +
                        fluid.staticEditing.templateTextPattern(was.substring(was.length - suffix)) + ")$";
                    // Where the node's text was rendered from - the range the renderer recorded, should the source still
                    // hold the node's text there, within which the change is placed exactly; or else the one place the
                    // template holds the text, outside its tags
                    const carried = fluid.staticEditing.carriedRange(node, source);
                    const searched = carried ? null : fluid.staticEditing.searchedRange(node, source, was);
                    const range = carried || searched;
                    const match = range ? new RegExp(parts).exec(source.substring(range.from, range.to)) : null;
                    if (was === "" || !match) {
                        problems.push(JSON.stringify(was.trim().substring(0, 40)));
                    } else {
                        const at = range.from + match[1].length;
                        edits.push({from: at, to: at + match[2].length, insert: fluid.staticEditing.templateText(now.substring(prefix, now.length - suffix))});
                        node.flRenderedText = node.nodeValue;
                    }
                }
            }
            if (template === null) {
                fluid.staticEditing.setError(edit, "The source has no <template> into which what is typed could be written - edit the source instead");
            } else if (problems.length > 0) {
                fluid.staticEditing.setError(edit, "What was typed into " + problems.join(", ") + " can't be found once in the template - edit the source instead");
            } else {
                const text = edits.sort((a, b) => b.from - a.from).reduce((text, one) => text.substring(0, one.from) + one.insert + text.substring(one.to), source);
                if (text !== source) {
                    edit.source.setText(text);
                    await fluid.staticEditing.onInput(edit, text);
                }
            }
        }
    };

    /**
     * Show a claim on a source of the page's framing - the page is migrated, and the claim's text given to the live
     * tree as the SFC defining the framing's layer, so that every component of the layer renders from it - or, with no
     * claim, restore the framing as published
     * @param {Object} edit - The controller
     * @param {Object} framing - The source's record from the provenance
     * @param {Claim|null} claim - The claim
     * @return {Promise} Resolves once the claim is shown
     */
    fluid.staticEditing.showFraming = async function (edit, framing, claim) {
        const had = edit.framingClaims[framing.path];
        if (claim) {
            edit.framingClaims[framing.path] = claim;
        } else {
            delete edit.framingClaims[framing.path];
        }
        try {
            if (claim) {
                await fluid.staticEditing.applyFraming(edit, framing, claim.text);
            } else if (had) {
                await fluid.staticEditing.applyFraming(edit, framing, edit.bases[framing.path] ? edit.bases[framing.path].text : had.baseText);
            }
            await fluid.staticEditing.markFraming(edit, framing);
        } catch (error) {
            fluid.staticEditing.setError(edit, error);
        }
        fluid.staticEditing.updatePanel(edit);
        fluid.staticEditing.updateBadge(edit);
    };

    /**
     * Give the text of a source of the framing to the page's live tree - an SFC's as the definition of its layer, the
     * site's configuration as a patch of the root of the tree
     * @param {Object} edit - The controller
     * @param {Object} framing - The source's record from the provenance
     * @param {String} text - Its text
     * @return {Promise} Resolves once the tree has rendered it
     */
    fluid.staticEditing.applyFraming = function (edit, framing, text) {
        return framing.kind === "patch" ? fluid.staticEditing.ask(edit, {op: "setPatch", text}) : fluid.staticEditing.ask(edit, {op: "setLayerSource", layer: framing.layer, text});
    };

    /**
     * Show a claim on whichever source of the page it is held on
     * @param {Object} edit - The controller
     * @param {String} path - The source's path
     * @param {Claim|null} claim - The claim, or null to show the source as published
     * @return {Promise} Resolves once shown
     */
    fluid.staticEditing.showClaimOf = function (edit, path, claim) {
        const framing = fluid.staticEditing.framingOf(edit, path);
        let togo;
        if (framing) {
            togo = fluid.staticEditing.showFraming(edit, framing, claim);
        } else if (fluid.staticEditing.isNewPost(edit, path)) {
            if (claim) {
                edit.newClaims[path] = claim;
            } else {
                delete edit.newClaims[path];
            }
            fluid.staticEditing.updatePanel(edit);
            fluid.staticEditing.updateBadge(edit);
            togo = Promise.resolve();
        } else {
            togo = fluid.staticEditing.showClaim(edit, claim);
        }
        return togo;
    };

    /**
     * Show the text of a source in the page's blocks, or with null the blocks as published. The text is given to the
     * live components rendering the blocks, so that Infusion renders them as the build did
     * @param {Object} edit - The controller
     * @param {String|null} text - The text of the source, front matter and all, or null
     * @param {Claim|null} claim - The claim whose text it is
     * @return {Promise} Resolves once the text is shown
     */
    fluid.staticEditing.showText = async function (edit, text, claim) {
        if (text !== null && edit.blockEditText !== undefined && text !== edit.blockEditText) {
            // A claim held of an edit in the page which has since moved on - the page already shows the newer edit,
            // whose claim follows - see onBlockEdit
        } else if (text !== null) {
            if (text === edit.blockEditText) {
                edit.blockEditText = undefined;
            }
            // The layers of widgets pasted into the claim, not yet published, are defined first
            await fluid.staticEditing.registerClaimLayers(edit, claim);
            await fluid.staticEditing.ask(edit, {op: "setSource", text});
        } else {
            edit.blockEditText = undefined;
            if (edit.shownText) {
                // The blocks' components were booted from a claim's text - the page as published is restored by reloading
                location.reload();
            }
        }
        edit.shownText = text !== null;
    };

    /**
     * Define in the page the layers a claim's further files hold - the SFCs of widgets pasted into it, which the site
     * does not publish until the claim is committed
     * @param {Object} edit - The controller
     * @param {Claim|null} claim - The claim
     * @return {Promise} Resolves once defined
     */
    fluid.staticEditing.registerClaimLayers = async function (edit, claim) {
        const dir = edit.provenance.widgets ? edit.provenance.widgets.dir + "/" : null;
        const decode = content => new TextDecoder().decode(fluid.staticEditing.decodeBase64(edit, content));
        const layers = dir && claim && claim.files ? Object.entries(claim.files).filter(([path, file]) => path.startsWith(dir) &&
            file.content !== null && /\.(vue|js)$/.test(path)).map(([path, file]) => ({
            layer: path.substring(path.lastIndexOf("/") + 1).replace(/\.(vue|js)$/, "").replace(/-/g, "."),
            kind: path.endsWith(".vue") ? "sfc" : "js",
            // The claim's layers replace the page's, which are those it was published with
            text: decode(file.content)
        })) : [];
        // Images the claim brings, e.g. dropped, are shown before they are published
        await fluid.staticEditing.previewImages(edit, claim && claim.files || {});
        return layers.length > 0 ? fluid.staticEditing.ask(edit, {op: "registerLayers", layers, override: true}) : 0;
    };

    /**
     * Store a claim, and show it
     * @param {Object} edit - The controller
     * @param {Claim} claim - The claim
     * @return {Promise<Claim>} The claim as stored
     */
    fluid.staticEditing.putClaim = async function (edit, claim) {
        const stored = await fluid.staticEditing.send(edit, {type: "claim-put", claim});
        await fluid.staticEditing.showClaimOf(edit, stored.path, stored);
        return stored;
    };

    /**
     * Compare the claim with the published trace: drop it if the trace records its hash, and those of its further files,
     * and mark it as in conflict if the trace records neither its hash nor that of its base, i.e. the source was changed
     * by another
     * @param {Object} edit - The controller
     * @param {Object} trace - The published trace
     * @param {Claim} claim - The claim
     * @return {Promise<Boolean>} `true` if the claim has been published
     */
    fluid.staticEditing.reconcile = async function (edit, trace, claim) {
        // The hash the trace records of a file - a content file's, or a static file's, e.g. an image's
        const publishedOf = path => trace ? (trace.sources || {})[path] ?? (trace.staticFiles || {})[path] : undefined;
        const published = publishedOf(claim.path);
        // A claim with further files is published once every one of them is - each written as edited, or removed
        const filesPublished = Object.entries(claim.files || {}).every(([path, file]) => file.hash === null ?
            publishedOf(path) === undefined : publishedOf(path) === file.hash);
        let togo = false;
        if (published === claim.hash && filesPublished) {
            await fluid.staticEditing.send(edit, {type: "claim-remove", id: claim.id, reason: "published"});
            togo = true;
        } else if (published !== undefined && published !== claim.baseHash && claim.state !== "conflict") {
            await fluid.staticEditing.putClaim(edit, {...claim, state: "conflict", message: "the published source is neither the one edited nor this edit"});
        }
        return togo;
    };

    /**
     * Poll the published trace while a claim is committed, until the trace records it
     * @param {Object} edit - The controller
     */
    fluid.staticEditing.poll = function (edit) {
        clearTimeout(edit.pollTimer);
        // Any claim held is polled - one shown here may have been committed from another page, e.g. one of the framing
        if (fluid.staticEditing.allClaims(edit).length > 0) {
            edit.pollTimer = setTimeout(async function () {
                let published = false;
                // Each claim is read afresh, since another page may have committed, or discarded, it
                for (const claim of fluid.staticEditing.allClaims(edit)) {
                    const fresh = await fluid.staticEditing.send(edit, {type: "claim-get", repo: claim.repo, path: claim.path});
                    if (!fresh && claim.state === "committed") {
                        // Gone once committed - another page showing it found it published first, and dropped it. This
                        // page is reloaded too, since shown without its claim it would revert to the page as it loaded,
                        // from before the edit
                        published = true;
                    } else if (!fresh || fresh.state !== claim.state || fresh.hash !== claim.hash) {
                        await fluid.staticEditing.showClaimOf(edit, claim.path, fresh || null);
                    }
                }
                const trace = await fluid.staticEditing.fetchTrace(edit);
                for (const claim of trace ? fluid.staticEditing.allClaims(edit).filter(one => one.state === "committed") : []) {
                    published = await fluid.staticEditing.reconcile(edit, trace, claim) || published;
                }
                if (published) {
                    fluid.staticEditing.reloadPublished(edit);
                } else if (!edit.reloading) {
                    fluid.staticEditing.poll(edit);
                }
            }, edit.pollInterval);
        }
    };

    /**
     * Show the page's claims as published, and reload it to show the site as rebuilt - once, however many times asked,
     * since both a poll and a notice from another page may find a claim published
     * @param {Object} edit - The controller
     */
    fluid.staticEditing.reloadPublished = function (edit) {
        if (!edit.reloading) {
            edit.reloading = true;
            clearTimeout(edit.pollTimer);
            fluid.staticEditing.markBlocks(edit, "published", fluid.staticEditing.stateLabels.published + " - reloading the page");
            setTimeout(() => location.reload(), 1500);
        }
    };

    /**
     * Respond to the removal of a claim by another page, of which the service worker tells every other page - see
     * "claim-remove" in the extension's background.js. A claim this page shows which was removed as published is
     * published here too, and the page reloads, whatever this page last knew of it - committed or not, since another
     * page may have committed it since this one last polled. One removed as discarded, or moved, is shown gone
     * @param {Object} edit - The controller
     * @param {Object} removal - `{id, reason}` - the claim's key, and why it was removed: "published", "discarded" or "moved"
     * @return {Promise} Resolves once shown
     */
    fluid.staticEditing.claimRemoved = async function (edit, removal) {
        const claim = fluid.staticEditing.allClaims(edit).find(one => one.id === removal.id);
        if (claim && removal.reason === "published") {
            fluid.staticEditing.reloadPublished(edit);
        } else if (claim) {
            await fluid.staticEditing.showClaimOf(edit, claim.path, null);
        }
    };

    /**
     * The record of the source the panel edits
     * @param {Object} edit - The controller
     * @return {Object|null} `{path, hash, label, framing, creating}` - its path, the hash this page was published from,
     * its label, its framing record if it is a source of the framing, and whether it is a new post, not yet in the
     * repository - or null, on a page with no source of its own, e.g. a list, while nothing is chosen to edit
     */
    fluid.staticEditing.target = function (edit) {
        const framing = fluid.staticEditing.framingOf(edit, edit.targetPath);
        let togo = null;
        if (framing) {
            togo = {path: framing.path, hash: framing.hash, label: framing.label, framing, creating: false};
        } else if (edit.creating && edit.targetPath === edit.creating.path) {
            togo = {path: edit.creating.path, hash: null, label: "A new post", framing: null, creating: true};
        } else if (edit.provenance.source && edit.targetPath === edit.provenance.source.path) {
            togo = {path: edit.provenance.source.path, hash: edit.provenance.source.hash, label: "This page's content", framing: null, creating: false,
                // A source the site inherits from one of its bases, not yet its own - see `inherited` in the provenance
                inherited: edit.provenance.source.inherited || null};
        }
        return togo;
    };

    // The key, in the page's sessionStorage, of whether the editor is open - so that it stays open as the user
    // navigates the site in the tab, e.g. from a list to a post
    fluid.staticEditing.sessionKey = "fluid-edit-open";

    /**
     * Remember, for this tab, whether the editor is open, and whether the framing is being edited
     * @param {Object} edit - The controller
     */
    fluid.staticEditing.rememberSession = function (edit) {
        try {
            if (!edit.state.hidden) {
                sessionStorage.setItem(fluid.staticEditing.sessionKey, JSON.stringify({framing: edit.framingMode}));
            } else {
                sessionStorage.removeItem(fluid.staticEditing.sessionKey);
            }
        } catch (error) {
            // A page denying storage forgets the editor on navigating
        }
    };

    /**
     * Read what was remembered for this tab by rememberSession
     * @return {Object|null} `{framing}` if the editor was open, or null
     */
    fluid.staticEditing.recallSession = function () {
        let togo = null;
        try {
            togo = JSON.parse(sessionStorage.getItem(fluid.staticEditing.sessionKey) || "null");
        } catch (error) {
            togo = null;
        }
        return togo;
    };

    /**
     * Save one of the user's preferences for the panel - kept by the editing client, e.g. in the extension's own
     * storage, since they are its settings, read by every panel on every site, rather than data edited
     * @param {Object} edit - The controller
     * @param {String} key - The preference, e.g. "sourceOpen"
     * @param {Any} value - Its value
     */
    fluid.staticEditing.setPref = function (edit, key, value) {
        edit.prefs[key] = value;
        fluid.staticEditing.send(edit, {type: "prefs-set", prefs: edit.prefs}).catch(() => null);
    };

    /**
     * Fold or unfold the source, as the user last chose - unless the target can only be edited as source: framing, a
     * new post, or content whose blocks can't be, or aren't, edited in the page
     * @param {Object} edit - The controller
     */
    fluid.staticEditing.updateSourceOpen = function (edit) {
        const target = fluid.staticEditing.target(edit);
        const needed = !!target && (!!target.framing || target.creating || edit.inPageUnavailable);
        edit.state.sourceHidden = !target;
        edit.state.sourceOpen = needed || !!edit.prefs.sourceOpen;
    };

    /**
     * Begin editing: open the panel, showing the source it edits. The page is first made live, before the panel is
     * shown, so that it appears once, settled, rather than being withdrawn and restored as the page's tree boots
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once the panel shows its source
     */
    fluid.staticEditing.activate = function (edit) {
        edit.activating = (edit.activating || Promise.resolve()).catch(() => null).then(async function () {
            fluid.staticEditing.updateSourceOpen(edit);
            fluid.staticEditing.dock(edit, true);
            await fluid.staticEditing.showTarget(edit);
        });
        return edit.activating;
    };

    // The months, as the panel's header writes a date
    fluid.staticEditing.months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    /**
     * Write a date as the panel's header shows it, in the user's own time - e.g. "25th Nov 2026 14:45"
     * @param {Date} date - The date
     * @return {String} The date written
     */
    fluid.staticEditing.formatDate = function (date) {
        const day = date.getDate();
        const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
        const pad = number => String(number).padStart(2, "0");
        return day + suffix + " " + fluid.staticEditing.months[date.getMonth()] + " " + date.getFullYear() + " " +
            pad(date.getHours()) + ":" + pad(date.getMinutes());
    };

    /**
     * Find where the source the panel edits lies in a repository - for one inherited from a base, in the base
     * @param {Object} edit - The controller
     * @param {Object} target - The target, as by fluid.staticEditing.target
     * @return {Object} `{repo, ref, path}`
     */
    fluid.staticEditing.sourceLocation = function (edit, target) {
        return target.inherited ? {repo: target.inherited.repo, ref: target.inherited.sha, path: target.inherited.path} :
            {repo: edit.provenance.repo, ref: edit.provenance.branch, path: target.path};
    };

    /**
     * Show, in the panel's header, a link to the source edited on GitHub, and who last changed it and when - the last
     * commit a person made to it, passing over any a bot made, e.g. the site's rebuild. Nothing is shown of a new post,
     * which has no history
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once shown
     */
    fluid.staticEditing.showHistory = async function (edit) {
        const target = fluid.staticEditing.target(edit);
        const shown = edit.historyCount = (edit.historyCount || 0) + 1;
        edit.state.updatedHidden = true;
        if (target && !target.creating) {
            const location = fluid.staticEditing.sourceLocation(edit, target);
            edit.state.pathHref = "https://github.com/" + location.repo + "/blob/" + encodeURIComponent(location.ref) + "/" +
                location.path.split("/").map(encodeURIComponent).join("/");
            try {
                const history = await fluid.staticEditing.send(edit, {type: "source-history", ...location});
                // Shown only if the panel still edits the source asked about
                if (shown === edit.historyCount) {
                    edit.state.pathHref = history.fileUrl;
                    const commit = history.commit;
                    if (commit) {
                        const date = new Date(commit.date);
                        Object.assign(edit.state, {
                            updatedBy: commit.login || commit.name,
                            // An author GitHub knows no account of is linked to the commit itself
                            updatedByHref: commit.profileUrl || commit.url,
                            updatedDate: fluid.staticEditing.formatDate(date),
                            updatedHref: commit.url,
                            updatedTitle: commit.sha.substring(0, 7) + " - " + date.toString(),
                            updatedHidden: false
                        });
                    }
                }
            } catch (error) {
                // The history can't be read, e.g. offline - the header shows the source's link alone
            }
        } else {
            edit.state.pathHref = "";
        }
    };

    /**
     * Show the source the panel edits - the claim's text on it, or else the source as it stands in the repository
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once shown
     */
    fluid.staticEditing.showTarget = async function (edit) {
        const target = fluid.staticEditing.target(edit);
        edit.state.ready = false;
        edit.state.path = target ? target.path : edit.provenance.page;
        fluid.staticEditing.showHistory(edit);
        edit.state.newHidden = !(target && target.creating);
        fluid.staticEditing.updateSourceOpen(edit);
        await Promise.all((edit.provenance.framing || []).map(framing => fluid.staticEditing.markFraming(edit, framing)));
        if (!target) {
            fluid.staticEditing.setStatus(edit, (fluid.staticEditing.section(edit) ? "Choose + at the head of the list to write a new post, or click a post to edit it. " : "") +
                ((edit.provenance.framing || []).length ? "Tick \"Also edit framing\" to edit what every page shares." : ""));
        } else {
            const claim = fluid.staticEditing.claimOf(edit, target.path);
            edit.source.setLanguage(target.path);
            if (claim) {
                edit.source.setText(claim.text);
                fluid.staticEditing.setStatus(edit, claim.message || "");
            } else if (edit.bases[target.path]) {
                edit.source.setText(edit.bases[target.path].text);
                fluid.staticEditing.setStatus(edit, "");
            } else {
                await fluid.staticEditing.readTarget(edit, target);
            }
            // The blocks are edited in place once the page is live, unless the repository's source differs from the
            // one the page was published from, which would change the page before any edit
            if (!target.framing && !target.creating && !edit.blockEditing) {
                const base = edit.bases[target.path];
                if (claim || base && base.hash === target.hash) {
                    await fluid.staticEditing.setBlockEditing(edit, true);
                } else {
                    edit.inPageUnavailable = true;
                    fluid.staticEditing.updateSourceOpen(edit);
                }
            }
        }
        fluid.staticEditing.updatePanel(edit);
        // Marked ready once rendered, so that what drives the panel finds it showing what it edits
        await fluid.cell.settle();
        edit.state.ready = true;
        await fluid.cell.settle();
        if (target && !target.framing) {
            fluid.staticEditing.learnSite(edit).then(() => fluid.staticEditing.learnHeadings(edit, edit.source.getText()));
        }
        if (!edit.basesChecked) {
            edit.basesChecked = true;
            fluid.staticEditing.checkBases(edit);
        }
    };

    /**
     * Read the source the panel edits from the repository, as the base of any edit of it
     * @param {Object} edit - The controller
     * @param {Object} target - The target, as given by fluid.staticEditing.target
     * @return {Promise} Resolves once read, or its failure shown
     */
    fluid.staticEditing.readTarget = async function (edit, target) {
        edit.source.setText("");
        fluid.staticEditing.setStatus(edit, "Reading " + target.path + " from " + edit.provenance.repo + " ...");
        try {
            // A source of the framing which the site forks from one of its modules - e.g. its theme's footer - and has
            // not yet forked is read as published, and its first commit creates the fork - see `origin` in the provenance
            const origin = target.framing && target.framing.origin;
            // A source inherited from one of the site's bases is read from the base, at the commit the site was built from,
            // and its first commit likewise creates the site's own copy of it
            const inherited = target.inherited;
            const source = origin ? {text: await (await fetch(new URL(origin, location.href), {cache: "no-store"})).text(), sha: undefined} :
                inherited ? {text: (await fluid.staticEditing.send(edit, {type: "base-read", repo: inherited.repo, ref: inherited.sha, path: inherited.path})).text, sha: undefined} :
                    await fluid.staticEditing.send(edit, {type: "source-read", repo: edit.provenance.repo, branch: edit.provenance.branch, path: target.path});
            const hash = await fluid.staticEditing.hashText(edit, source.text);
            edit.bases[target.path] = {text: source.text, sha: source.sha, hash};
            if (edit.targetPath === target.path) {
                edit.source.setText(source.text);
            }
            fluid.staticEditing.setStatus(edit, hash !== target.hash ? "The repository's source differs from the one this page was published from - edits are based on the repository's" :
                target.framing ? "Shared by every page of the site" +
                    (origin ? " - the site's own copy of it, " + target.path + ", is made on committing" : "") :
                    inherited ? "This page's source is one this site inherits from " + inherited.repo + " - the site's own copy of it is made on committing" : "");
        } catch (error) {
            fluid.staticEditing.setError(edit, error);
        }
    };

    /**
     * Edit the page's own blocks in place, or cease to - its source is given to them first, so that they know the lines
     * each was rendered from
     * @param {Object} edit - The controller
     * @param {Boolean} on - Whether to edit in place
     * @return {Promise} Resolves once the blocks are edited in place, or not
     */
    fluid.staticEditing.setBlockEditing = async function (edit, on) {
        const text = edit.claim ? edit.claim.text : edit.bases[edit.provenance.source.path]?.text;
        let togo = false;
        if (edit.blocks.length > 0 && text !== undefined) {
            if (on && !edit.claim) {
                await fluid.staticEditing.ask(edit, {op: "setSource", text});
            }
            await fluid.staticEditing.ask(edit, {op: "setBlockEditing", on});
            togo = on;
        }
        edit.blockEditing = togo;
        // The page's blocks can't be edited in place, e.g. since it couldn't be made live - the source is shown instead
        edit.inPageUnavailable = on && !togo;
        fluid.staticEditing.updateSourceOpen(edit);
        return togo;
    };

    /**
     * Receive an edit made in place in one of the page's blocks - the whole source, with the block's lines replaced
     * @param {Object} edit - The controller
     * @param {String} text - The edited source
     */
    fluid.staticEditing.onBlockEdit = function (edit, text) {
        if (edit.provenance.source) {
            edit.targetPath = edit.provenance.source.path;
            // The newest edit in the page, which the page already shows - see showText
            edit.blockEditText = text;
            edit.source.setText(text);
            fluid.staticEditing.onInput(edit, text);
        }
    };

    /**
     * Learn the site's pages and images from its published trace, once, so that links typed in the source view may be
     * completed - see fluid-sourceView.vue. Lists' further pages, e.g. "/post/page/2/", are left out
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once learned, or the trace could not be had
     */
    fluid.staticEditing.learnSite = function (edit) {
        edit.sitePromise = edit.sitePromise || fluid.staticEditing.fetchTrace(edit).then(trace => {
            if (trace && trace.pages) {
                edit.site = {
                    page: edit.provenance.page,
                    pages: Object.entries(trace.pages).filter(([path]) => !/\/page\/\d+\/$/.test(path))
                        .map(([path, record]) => ({path, title: record.title, kind: record.kind, headings: record.headings || []})),
                    // The headings of the page's own source as edited, once learned - see learnHeadings
                    ownHeadings: null,
                    assets: trace.assets || [],
                    // The hashes of the site's static files, so that a pasted widget's layers already held are not written
                    staticFiles: trace.staticFiles || {},
                    // The site's sources, so that a new post is given a path no other source holds
                    sources: Object.keys(trace.sources || {}),
                    // The site's widgets, `{path, inherited, uses}` by layer, and the layers its pages hold, for telling
                    // which are unused - see unusedLayers. A site built before they were traced records neither
                    widgets: trace.widgets || null,
                    pageLayers: [...new Set(Object.values(trace.pages).flatMap(record => record.layers || []))]
                };
            }
        });
        return edit.sitePromise;
    };

    /**
     * @typedef {Object} WidgetLayer
     * @property {String} layer - The name of its layer
     * @property {String} path - The path of its SFC in the repository, e.g. "static/sfc/fluid-demos-counter.vue"
     * @property {Boolean} held - `true` if it is held in this browser, by a claim, rather than published by the site
     * @property {Boolean} inherited - `true` if a base of the site holds it, so that it is not the site's own to delete
     * @property {String[]} uses - The layers of the other widgets it names, which it may make or build on
     * @property {Claim} [claim] - For one held, the claim holding it
     */

    /**
     * Find the path of a widget's SFC in the repository from its layer, as wend names them
     * @param {Object} edit - The controller
     * @param {String} layer - The layer, e.g. "fluid.demos.counter"
     * @return {String|null} The path, e.g. "static/sfc/fluid-demos-counter.vue", or null if the site holds no widgets
     */
    fluid.staticEditing.widgetPath = (edit, layer) => edit.provenance.widgets ? edit.provenance.widgets.dir + "/" + layer.replace(/\./g, "-") + ".vue" : null;

    /**
     * List the layers of the widgets which markup or source holds, as their elements' `fluid-layers` attributes name them
     * @param {String} text - The markup or source
     * @return {String[]} The layers, each once
     */
    fluid.staticEditing.layersOf = function (text) {
        const found = new Set();
        [...(text || "").matchAll(/\sfluid-layers\s*=\s*"([^"]*)"/g)].forEach(match => match[1].split(/\s+/).filter(layer => layer).forEach(layer => found.add(layer)));
        return [...found];
    };

    /**
     * List the widgets of the site as this browser sees it - those it publishes, less any whose deletion is held, and
     * those held in claims, not yet committed - from the site's trace, and every claim held on its repository
     * @param {Object} edit - The controller
     * @param {Claim[]} claims - Every claim held on the site's repository
     * @return {WidgetLayer[]} The widgets, sorted by layer
     */
    fluid.staticEditing.siteWidgets = function (edit, claims) {
        const dir = edit.provenance.widgets ? edit.provenance.widgets.dir + "/" : null;
        const published = edit.site && edit.site.widgets ? edit.site.widgets :
            Object.fromEntries(((edit.provenance.widgets || {}).layers || []).map(widget => [widget.layer, {path: fluid.staticEditing.widgetPath(edit, widget.layer), inherited: false, uses: []}]));
        const files = {};
        // What is pending, not yet in a claim, is the newest of all
        [...claims, {files: edit.pendingFiles, pending: true}].forEach(claim => Object.entries(claim.files || {}).forEach(([path, file]) => {
            if (dir && path.startsWith(dir) && path.endsWith(".vue")) {
                files[path] = {file, claim};
            }
        }));
        const widgets = new Map(Object.entries(published).map(([layer, record]) => [layer, {layer, path: record.path, held: false, inherited: !!record.inherited, uses: record.uses || []}]));
        Object.entries(files).forEach(([path, {file, claim}]) => {
            const layer = path.substring(dir.length).replace(/\.vue$/, "").replace(/-/g, ".");
            if (file.content === null) {
                widgets.delete(layer);
            } else {
                widgets.set(layer, {layer, path, held: true, inherited: false, uses: [], claim: claim.pending ? null : claim,
                    text: new TextDecoder().decode(fluid.staticEditing.decodeBase64(edit, file.content))});
            }
        });
        // What those held name is read from their text, against every layer known
        const layers = [...widgets.keys()];
        widgets.forEach(widget => {
            if (widget.text !== undefined) {
                widget.uses = layers.filter(layer => layer !== widget.layer && widget.text.includes("\"" + layer + "\""));
            }
        });
        return [...widgets.values()].sort((a, b) => a.layer.localeCompare(b.layer));
    };

    /**
     * Determine which of the site's widgets are used nowhere - neither on any page the site publishes, nor in any edit
     * held in this browser, nor by any widget which is used, which may make or build on it - and so may be deleted.
     * One held by a base of the site is not the site's own to delete, and is never listed
     * @param {Object} edit - The controller
     * @param {WidgetLayer[]} widgets - The site's widgets, as by `siteWidgets`
     * @param {Claim[]} claims - Every claim held on the site's repository
     * @return {WidgetLayer[]} Those unused
     */
    fluid.staticEditing.unusedLayers = function (edit, widgets, claims) {
        const byLayer = new Map(widgets.map(widget => [widget.layer, widget]));
        const roots = [...(edit.site ? edit.site.pageLayers : []), ...claims.flatMap(claim => fluid.staticEditing.layersOf(claim.text)),
            ...fluid.staticEditing.layersOf(edit.source ? edit.source.getText() : "")];
        const used = new Set();
        const reach = layer => {
            if (!used.has(layer)) {
                used.add(layer);
                (byLayer.get(layer) ? byLayer.get(layer).uses : []).forEach(reach);
            }
        };
        roots.forEach(reach);
        return widgets.filter(widget => !used.has(widget.layer) && !widget.inherited);
    };

    /**
     * Bring the panel's list of widget layers up to date - those of the site's widgets which are top-level, and so may
     * be inserted, whether published or held in this browser
     * @param {Object} edit - The controller
     * @return {Promise<WidgetLayer[]>} The site's widgets, as by `siteWidgets`
     */
    fluid.staticEditing.refreshWidgets = async function (edit) {
        await fluid.staticEditing.learnSite(edit);
        const claims = await fluid.staticEditing.send(edit, {type: "claim-list", repo: edit.provenance.repo, prefix: ""}).catch(() => []);
        const widgets = fluid.staticEditing.siteWidgets(edit, claims || []);
        const topLevel = widgets.filter(widget => {
            const ancestors = fluid.ptf && fluid.ptf.layerAncestors ? fluid.ptf.layerAncestors(widget.layer) : null;
            return !ancestors || ancestors.size === 0 || ancestors.has("fluid.topLevelWidget");
        });
        edit.widgets = widgets;
        edit.widgetClaims = claims || [];
        edit.state.commitDisabled = !fluid.staticEditing.commitCandidate(edit);
        edit.state.widgetLayers = topLevel.map(widget => ({layer: widget.layer, note: widget.held ? "held in this browser" : widget.inherited ? "from a base" : ""}));
        // Offered too in completing the `fluid-layers` of a widget's element typed into the source - see fluid-sourceView.vue
        if (edit.site) {
            edit.site.widgetLayers = edit.state.widgetLayers;
        }
        // None is chosen until the user chooses one, and Insert is offered only then
        if (!topLevel.some(widget => widget.layer === edit.state.widgetChoice)) {
            edit.state.widgetChoice = "";
        }
        fluid.staticEditing.renderTabs(edit);
        edit.state.widgetsHidden = !edit.provenance.widgets;
        const unused = fluid.staticEditing.unusedLayers(edit, widgets, edit.widgetClaims);
        edit.state.cleanupDisabled = unused.length === 0;
        edit.state.cleanupTitle = fluid.staticEditing.cleanupTitle(unused);
        return widgets;
    };

    /**
     * The tooltip of "Clean up unused layers" - naming each layer it would delete, with its file
     * @param {WidgetLayer[]} unused - The layers used nowhere, as by `unusedLayers`
     * @return {String} The tooltip's text
     */
    fluid.staticEditing.cleanupTitle = function (unused) {
        return "Clean up unused layers - " + (unused.length === 0 ? "every widget of the site is used, so there is none to delete" :
            "delete these, used nowhere on the site, nor in any edit held in this browser:\n" +
            unused.map(widget => "  " + widget.layer + (widget.path ? " (" + widget.path + ")" : "")).join("\n"));
    };

    /**
     * Respond to a layer chosen in the panel's list of widgets
     * @param {Object} edit - The controller
     * @param {CustomEvent} event - The picker's "fluidlayerchoose", whose `detail` holds the `layer`
     */
    fluid.staticEditing.widgetChosen = function (edit, event) {
        edit.state.widgetChoice = event.detail.layer;
        fluid.staticEditing.renderTabs(edit);
    };

    /**
     * Insert a widget of the layer chosen in the panel's list into the source the panel edits, at its cursor, as a block
     * of its own - as one pasted there is
     * @param {Object} edit - The controller
     */
    fluid.staticEditing.insertWidget = function (edit) {
        const layer = edit.state.widgetChoice;
        const target = fluid.staticEditing.target(edit);
        if (layer && target && !target.framing) {
            const source = edit.source.getText();
            const id = fluid.blockEditor && fluid.blockEditor.allocateId ? fluid.blockEditor.allocateId(source, layer) : layer.substring(layer.lastIndexOf(".") + 1) + "-1";
            edit.source.insertBlock(fluid.ptf.islandMarkup({layers: [layer], id}));
        }
    };

    /**
     * Remove widgets' SFCs from the site, or from this browser - one held in a claim, not yet committed, is dropped from
     * it; one the site publishes is deleted from the repository with the next commit of the source the panel edits,
     * its deletion held as a further file of its claim. Their layers cease to be defined in the page
     * @param {Object} edit - The controller
     * @param {WidgetLayer[]} doomed - The widgets
     * @return {Promise} Resolves once they are removed
     */
    fluid.staticEditing.removeWidgets = async function (edit, doomed) {
        for (const widget of doomed) {
            if (widget.held && widget.claim) {
                const files = {...widget.claim.files};
                delete files[widget.path];
                await fluid.staticEditing.putClaim(edit, {...widget.claim, files: Object.keys(files).length > 0 ? files : undefined});
            } else if (widget.held) {
                delete edit.pendingFiles[widget.path];
            } else {
                const read = await fluid.staticEditing.send(edit, {type: "source-read", repo: edit.provenance.repo, branch: edit.provenance.branch, path: widget.path});
                edit.pendingFiles[widget.path] = {content: null, baseSha: read.sha, hash: null};
            }
            if (fluid.deleteLayer) {
                fluid.deleteLayer(widget.layer);
            }
        }
        if (doomed.some(widget => !widget.held)) {
            // The deletions are held in the claim on the source the panel edits, as its next edit would hold them
            await fluid.staticEditing.onInput(edit, edit.source.getText());
        }
        await fluid.staticEditing.refreshWidgets(edit);
    };

    /**
     * Respond to the deletion of a layer asked for in the panel's list of widgets - after the user confirms it, naming
     * where it is used, since what uses it will no longer work
     * @param {Object} edit - The controller
     * @param {CustomEvent} event - The picker's "fluidlayerdelete", whose `detail` holds the `layer`
     * @return {Promise} Resolves once it is deleted, or not
     */
    fluid.staticEditing.widgetDelete = async function (edit, event) {
        const widgets = await fluid.staticEditing.refreshWidgets(edit);
        const widget = widgets.find(one => one.layer === event.detail.layer);
        const target = fluid.staticEditing.target(edit);
        if (!widget) {
            fluid.staticEditing.setError(edit, "The site holds no widget " + event.detail.layer);
        } else if (widget.inherited) {
            fluid.staticEditing.setError(edit, widget.layer + " is held by a base of the site, and can't be deleted from it");
        } else if (!widget.held && (!target || target.framing)) {
            fluid.staticEditing.setError(edit, "A widget is deleted from the site with the page's own content - choose it to edit first");
        } else {
            const unused = fluid.staticEditing.unusedLayers(edit, widgets, edit.widgetClaims).some(one => one.layer === widget.layer);
            // eslint-disable-next-line no-alert
            const confirmed = window.confirm("Delete the widget " + widget.layer + (widget.held ? ", held in this browser" : " from the site, with your next commit") +
                "?" + (unused ? "" : " It is still used - where it is used, it will no longer work."));
            if (confirmed) {
                await fluid.staticEditing.removeWidgets(edit, [widget]);
                fluid.staticEditing.setStatus(edit, "Deleted the widget " + widget.layer + (widget.held ? "" : " - commit to delete it from the site"));
            }
        }
    };

    /**
     * Delete every widget of the site which is used nowhere - on no page it publishes, in no edit held in this browser,
     * and by no widget which is used - after the user confirms it
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once they are deleted, or not
     */
    fluid.staticEditing.cleanUpLayers = async function (edit) {
        const widgets = await fluid.staticEditing.refreshWidgets(edit);
        const target = fluid.staticEditing.target(edit);
        const committable = !!target && !target.framing;
        const unused = fluid.staticEditing.unusedLayers(edit, widgets, edit.widgetClaims).filter(widget => widget.held || committable);
        if (unused.length === 0) {
            fluid.staticEditing.setStatus(edit, "Every widget of the site is used" + (committable ? "" : " - or is deleted only with the page's own content"));
        } else {
            // eslint-disable-next-line no-alert
            const confirmed = window.confirm("Delete these widgets, used nowhere on the site nor in any edit held in this browser?\n\n" +
                unused.map(widget => widget.layer + (widget.held ? " (held in this browser)" : "")).join("\n"));
            if (confirmed) {
                await fluid.staticEditing.removeWidgets(edit, unused);
                fluid.staticEditing.setStatus(edit, "Deleted " + unused.length + " unused widget" + (unused.length === 1 ? "" : "s") +
                    (unused.some(widget => !widget.held) ? " - commit to delete them from the site" : ""));
            }
        }
    };

    /**
     * Slide "Ask me anything" open from the sparkles at the panel's foot, or closed into them. It is made once, the
     * first time it is shown, and thereafter only shown and hidden, keeping its conversation. The share of the panel's
     * height its bar last gave it is remembered, in the user's preferences, and it slides open to that share each time
     * it is shown - whilst it is hidden, what edits the page takes the whole of the panel
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once it is shown, or hidden
     */
    fluid.staticEditing.toggleAI = async function (edit) {
        const open = !edit.state.aiOpen;
        const panel = document.querySelector(".fluid-edit-panel");
        const main = panel.querySelector(".fluid-edit-main");
        const ai = panel.querySelector(".fluid-edit-ai");
        edit.state.aiOpen = open;
        if (open) {
            const split = edit.prefs.aiSplit;
            const basis = split && split.ai ? split.ai : fluid.staticEditing.aiBasis;
            // What edits the page takes whatever the panel leaves - its own share, as the bar last wrote it, is not needed
            main.style.removeProperty("flex-basis");
            main.style.removeProperty("flex-grow");
            edit.state.aiHidden = false;
            await fluid.staticEditing.slideAI(edit, ai, "0px", basis);
            if (!edit.ai) {
                edit.ai = fluid.staticEditing.makeAI(edit, panel, main, ai);
            }
            try {
                await edit.ai;
            } catch (error) {
                edit.ai = null;
                edit.state.aiOpen = false;
                edit.state.aiHidden = true;
                fluid.staticEditing.setError(edit, error, "Ask me anything can't be opened, since ");
            }
        } else {
            fluid.staticEditing.rememberAISplit(edit, main, ai);
            await fluid.staticEditing.slideAI(edit, ai, ai.style.flexBasis || fluid.staticEditing.aiBasis, "0px");
            // Unless opened again as it slid
            if (!edit.state.aiOpen) {
                edit.state.aiHidden = true;
                main.style.removeProperty("flex-basis");
                main.style.removeProperty("flex-grow");
            }
        }
    };

    // The share of the panel's height "Ask me anything" is first given
    fluid.staticEditing.aiBasis = "40%";

    // How long "Ask me anything" takes to slide open or closed, in ms - as its styles' transition
    fluid.staticEditing.aiSlideTime = 200;

    /**
     * Slide "Ask me anything" from one share of the panel's height to another, by a transition of its basis - its
     * least height is waived as it slides, so that it closes all the way
     * @param {Object} edit - The controller
     * @param {Element} ai - Its container
     * @param {String} from - Its basis to begin, e.g. "0px"
     * @param {String} to - Its basis to end, e.g. "40%"
     * @return {Promise} Resolves once it has slid
     */
    fluid.staticEditing.slideAI = async function (edit, ai, from, to) {
        const slide = edit.aiSlide = (edit.aiSlide || 0) + 1;
        ai.classList.add("fluid-edit-ai-sliding");
        ai.style.flexGrow = "0";
        ai.style.flexBasis = from;
        // Laid out at its first basis, measuring it, so that the transition runs from it
        await fluid.cell.settle();
        ai.getBoundingClientRect();
        ai.style.flexBasis = to;
        await new Promise(resolve => setTimeout(resolve, fluid.staticEditing.aiSlideTime + 20));
        if (slide === edit.aiSlide) {
            ai.classList.remove("fluid-edit-ai-sliding");
        }
    };

    /**
     * Remember the share of the panel's height which the bar last gave "Ask me anything", for every panel
     * @param {Object} edit - The controller
     * @param {Element} main - What edits the page, above the bar
     * @param {Element} ai - The container of "Ask me anything", beneath it
     */
    fluid.staticEditing.rememberAISplit = function (edit, main, ai) {
        const basis = ai.style.flexBasis;
        const known = edit.prefs.aiSplit || {};
        if (basis && basis !== "0px" && basis !== known.ai) {
            fluid.staticEditing.setPref(edit, "aiSplit", {ai: basis});
        }
    };

    /**
     * Make "Ask me anything" and the bar setting it off, once - loading its SFCs, and its assistant, conversing about
     * the page - see fluid-editAskAnything.vue
     * @param {Object} edit - The controller
     * @param {Element} panel - The editing panel
     * @param {Element} main - What edits the page, above the bar
     * @param {Element} ai - The container of "Ask me anything", beneath it
     * @return {Promise<Object>} Resolves `{component, bar}` once made
     */
    fluid.staticEditing.makeAI = async function (edit, panel, main, ai) {
        const sfcDir = fluid.staticEditing.sfcDir;
        fluid.loadImportMap({
            "fluid.staticEditing.askAnything": {path: sfcDir + "fluid-editAskAnything.vue"},
            "fluid.resizeBar": {path: new URL("../../sfc/fluid-resizeBar.vue", sfcDir).href}
        }, document);
        await fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.staticEditing.askAnything", document));
        // The panel itself, which it imports, brings the machinery of conversing - fluid-ai.js and fluid-ai-arena.js
        await fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.askAnything", document));
        await fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.resizeBar", document));
        // A published site holds no key of a local service beside its pages, which is not looked for
        fluid.ai.localService.keyUrl = null;
        fluid.staticEditing.ai.assistant = fluid.staticEditing.ai.makeAssistant(edit);
        const component = fluid.initFreeComponent("fluid.staticEditing.askAnything", {container: ai});
        const bar = fluid.resizeBar({
            before: main,
            after: ai,
            axis: "vertical",
            // What edits the page keeps room for its controls and its buttons, its editor shrinking first
            minBefore: 200,
            minAfter: 160,
            view: {$component: {container: panel.querySelector(".fluid-edit-ai-bar"), elideParent: true}}
        });
        // Each drag, or nudge, of the bar is remembered as it ends
        const barElement = panel.querySelector(".fluid-edit-ai-bar");
        ["pointerup", "keyup"].forEach(type => barElement.addEventListener(type, () => fluid.staticEditing.rememberAISplit(edit, main, ai)));
        await fluid.cell.settle();
        return {component, bar};
    };

    /**
     * Learn the headings of the page's own source as it now stands, by the site's own pipeline, so that a link to one
     * typed in the source view may be completed before it is published - a little after the source last changed
     * @param {Object} edit - The controller
     * @param {String} text - The source
     */
    fluid.staticEditing.learnHeadings = function (edit, text) {
        clearTimeout(edit.headingsTimer);
        edit.headingsTimer = setTimeout(async function () {
            const renderer = edit.provenance.renderers && edit.provenance.renderers.markdown;
            if (renderer && edit.site) {
                try {
                    await fluid.staticEditing.loadRenderer(edit);
                    edit.site.ownHeadings = await fluid.staticEditing.ask(edit, {op: "headings", global: renderer.global, text});
                } catch (error) {
                    // The headings as published, from the trace, are offered instead
                }
            }
        }, 500);
    };

    /**
     * Switch the panel to editing another source of the page - its own, one of its framing's, or a new post
     * @param {Object} edit - The controller
     * @param {String|null} path - The source's path, or null for none
     * @return {Promise} Resolves once shown
     */
    fluid.staticEditing.switchTarget = function (edit, path) {
        edit.targetPath = path;
        fluid.staticEditing.openTab(edit, path);
        return fluid.staticEditing.activate(edit);
    };

    /**
     * The kind of a source opened in a tab, by which its tab is coloured
     * @param {Object} edit - The controller
     * @param {String} path - The source's path
     * @return {String} "content", the page's own, "framing", "config", the site's configuration, or "new", a new post
     */
    fluid.staticEditing.tabKind = function (edit, path) {
        const framing = fluid.staticEditing.framingOf(edit, path);
        return framing ? (framing.kind === "patch" ? "config" : "framing") : fluid.staticEditing.isNewPost(edit, path) ? "new" : "content";
    };

    /**
     * The label of the tab of a source
     * @param {Object} edit - The controller
     * @param {String} path - The source's path
     * @return {String} Its label
     */
    fluid.staticEditing.tabLabel = function (edit, path) {
        const kind = fluid.staticEditing.tabKind(edit, path);
        const framing = fluid.staticEditing.framingOf(edit, path);
        return kind === "config" ? "Site configuration" : kind === "framing" ? framing.label || path.split("/").pop() :
            kind === "new" ? "New post" : "This page";
    };

    /**
     * Open a tab on a source, should none be open on it - the page's own is always first
     * @param {Object} edit - The controller
     * @param {String|null} path - The source's path, or null for none
     */
    fluid.staticEditing.openTab = function (edit, path) {
        const own = edit.provenance.source ? edit.provenance.source.path : null;
        edit.tabPaths = edit.tabPaths || [];
        if (own && !edit.tabPaths.includes(own)) {
            edit.tabPaths.unshift(own);
        }
        if (path && !edit.tabPaths.includes(path)) {
            edit.tabPaths.push(path);
        }
        fluid.staticEditing.renderTabs(edit);
    };

    /**
     * Close the tab of a source - any edit held on it is kept, and shown in the page, until committed or discarded.
     * Closing the tab shown shows the page's own source, or the last tab left
     * @param {Object} edit - The controller
     * @param {String} path - The source's path
     * @return {Promise} Resolves once the panel shows what is left
     */
    fluid.staticEditing.closeTab = function (edit, path) {
        edit.tabPaths = (edit.tabPaths || []).filter(one => one !== path);
        let togo;
        if (edit.targetPath === path) {
            togo = fluid.staticEditing.switchTarget(edit, edit.tabPaths.length > 0 ? edit.tabPaths[edit.tabPaths.length - 1] : null);
        } else {
            fluid.staticEditing.renderTabs(edit);
            togo = Promise.resolve();
        }
        return togo;
    };

    /**
     * Close every tab but the page's own - as once their edits are committed
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once the panel shows the page's own source, or nothing, on a page with none
     */
    fluid.staticEditing.closeOtherTabs = function (edit) {
        const own = edit.provenance.source ? edit.provenance.source.path : null;
        edit.tabPaths = own ? [own] : [];
        if (edit.creating && edit.targetPath === edit.creating.path) {
            edit.creating = null;
        }
        return edit.targetPath === own ? Promise.resolve(fluid.staticEditing.renderTabs(edit)) : fluid.staticEditing.switchTarget(edit, own);
    };

    /**
     * Write the tabs of the sources opened - each coloured by its kind, the one shown selected, and spotted while its
     * source holds an edit not yet committed, or in conflict
     * @param {Object} edit - The controller
     */
    fluid.staticEditing.renderTabs = function (edit) {
        const holder = edit.panel && edit.panel.querySelector(".fluid-edit-tabs");
        const paths = edit.tabPaths || [];
        const own = edit.provenance.source ? edit.provenance.source.path : null;
        if (holder) {
            holder.replaceChildren(...paths.map(path => {
                const kind = fluid.staticEditing.tabKind(edit, path);
                const claim = fluid.staticEditing.claimOf(edit, path);
                const tab = document.createElement("div");
                tab.className = "fluid-edit-tab";
                tab.setAttribute("role", "tab");
                tab.setAttribute("tabindex", "0");
                tab.setAttribute("aria-selected", String(path === edit.targetPath));
                tab.setAttribute("data-fluid-tab-kind", kind);
                tab.setAttribute("data-fluid-tab-path", path);
                tab.title = path;
                const label = tab.appendChild(document.createElement("span"));
                label.className = "fluid-edit-tab-label";
                label.textContent = fluid.staticEditing.tabLabel(edit, path);
                if (claim && (claim.state === "uncommitted" || claim.state === "conflict")) {
                    const spot = tab.appendChild(document.createElement("span"));
                    spot.className = "fluid-edit-tab-dirty";
                    spot.setAttribute("data-fluid-claim-state", claim.state);
                    spot.title = claim.state === "conflict" ? "In conflict" : "Edited in this browser - not yet committed";
                }
                if (path !== own) {
                    const close = tab.appendChild(document.createElement("button"));
                    close.type = "button";
                    close.className = "fluid-edit-tab-close";
                    close.title = "Close this tab - any edit held is kept";
                    close.textContent = "×";
                    close.addEventListener("click", event => {
                        event.stopPropagation();
                        fluid.staticEditing.closeTab(edit, path);
                    });
                }
                const choose = () => {
                    if (path !== edit.targetPath) {
                        fluid.staticEditing.switchTarget(edit, path);
                    }
                };
                tab.addEventListener("click", choose);
                tab.addEventListener("keydown", event => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        choose();
                    }
                });
                return tab;
            }));
        }
        edit.state.tabsHidden = paths.length === 0;
        edit.state.tabKind = edit.targetPath ? fluid.staticEditing.tabKind(edit, edit.targetPath) : "";
        const config = (edit.provenance.framing || []).find(framing => framing.kind === "patch");
        edit.state.configHidden = !edit.framingMode || !config;
        edit.state.insertDisabled = !edit.state.widgetChoice || !fluid.staticEditing.target(edit) || !!fluid.staticEditing.target(edit).framing;
    };

    /**
     * Begin, or end, editing the page's framing. Its elements are marked as editable, and an edit of any source of it
     * is projected into the page where that source renders - clicking a marked element, e.g. the footer, edits its
     * source, and clicking a block of the page's own content returns to it
     * @param {Object} edit - The controller
     * @param {Boolean} on - Whether to edit the framing
     */
    fluid.staticEditing.setFramingMode = async function (edit, on) {
        edit.framingMode = on;
        edit.state.framing = on;
        // Ceasing to edit the framing closes the tabs of its sources - any edits held on them are kept
        if (!on) {
            edit.tabPaths = (edit.tabPaths || []).filter(path => !fluid.staticEditing.framingOf(edit, path) || path === edit.targetPath);
        }
        fluid.staticEditing.renderTabs(edit);
        fluid.staticEditing.rememberSession(edit);
        if (on) {
            await Promise.all((edit.provenance.framing || []).map(framing => fluid.staticEditing.markFraming(edit, framing)));
        } else if (fluid.staticEditing.target(edit) && fluid.staticEditing.target(edit).framing) {
            await fluid.staticEditing.switchTarget(edit, edit.provenance.source ? edit.provenance.source.path : null);
        } else {
            await Promise.all((edit.provenance.framing || []).map(framing => fluid.staticEditing.markFraming(edit, framing)));
        }
    };

    /**
     * Respond to a click in the page while the framing is edited - one on a marked element of the framing not yet
     * edited switches the panel to its source, rather than following a link it holds
     * @param {Object} edit - The controller
     * @param {Event} event - The click
     */
    fluid.staticEditing.onFramingClick = function (edit, event) {
        const framed = edit.framingMode && !edit.state.hidden && event.target.closest ? event.target.closest("[data-fluid-framing]") : null;
        if (framed && framed.getAttribute("data-fluid-framing") !== edit.targetPath) {
            event.preventDefault();
            event.stopPropagation();
            fluid.staticEditing.switchTarget(edit, framed.getAttribute("data-fluid-framing"));
        }
    };

    /**
     * The section a list page lists, into which a new post is written - from the provenance, or for a page published
     * before the provenance recorded it, from the page's path
     * @param {Object} edit - The controller
     * @return {Object|null} `{contentDir, itemSelector}`, or null for a page listing no section
     */
    fluid.staticEditing.section = function (edit) {
        const provenance = edit.provenance;
        return provenance.section || (!provenance.source && /^\/[^/]+\//.test(provenance.page) && document.querySelector("article.post-preview") ?
            {contentDir: "content/" + provenance.page.split("/")[1], itemSelector: "article.post-preview"} : null);
    };

    /**
     * Make the path of a new post from its title - the date and a slug of the title, as the site's own are named,
     * e.g. content/post/2025-03-20-ui-as-code.md, and distinct from every other source
     * @param {Object} edit - The controller
     * @param {String} title - The title
     * @return {String} The path
     */
    fluid.staticEditing.newPostPath = function (edit, title) {
        const now = new Date();
        const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(part => String(part).padStart(2, "0")).join("-");
        const slug = title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "untitled";
        const taken = new Set([...(edit.site ? edit.site.sources : []), ...Object.keys(edit.newClaims)
            .filter(path => path !== edit.targetPath)]);
        const stem = fluid.staticEditing.section(edit).contentDir + "/" + date + "-" + slug;
        let path = stem + ".md";
        for (let i = 2; taken.has(path); ++i) {
            path = stem + "-" + i + ".md";
        }
        return path;
    };

    /**
     * Begin writing a new post in the section the page lists, or resume one held as a claim
     * @param {Object} edit - The controller
     * @param {Claim} [claim] - The claim on a new post to resume
     * @return {Promise} Resolves once the panel shows it
     */
    fluid.staticEditing.beginNewPost = async function (edit, claim) {
        await fluid.staticEditing.learnSite(edit);
        const title = claim ? (/^title:\s*(.*)$/m.exec(claim.text) || [])[1] || "" : "";
        const path = claim ? claim.path : fluid.staticEditing.newPostPath(edit, "");
        edit.creating = {path};
        edit.bases[path] = edit.bases[path] || {text: "", sha: undefined, hash: null};
        if (!claim) {
            const date = path.substring(path.lastIndexOf("/") + 1, path.lastIndexOf("/") + 11);
            edit.bases[path].text = "---\ntitle: \"\"\ndate: " + date + "\n---\n\n";
        }
        await fluid.staticEditing.switchTarget(edit, path);
        await fluid.cell.settle();
        const input = edit.panel.querySelector(".fluid-edit-new-title");
        input.value = title.replace(/^"(.*)"$/, "$1");
        input.focus();
    };

    /**
     * Retitle the new post being written - its front matter, and its path, which follows its title until it is
     * committed. A claim held at its former path is moved to the new one
     * @param {Object} edit - The controller
     * @param {String} title - The title
     * @return {Promise} Resolves once the claim is stored
     */
    fluid.staticEditing.retitleNewPost = async function (edit, title) {
        const text = edit.source.getText().replace(/^title:.*$/m, "title: " + JSON.stringify(title));
        const path = fluid.staticEditing.newPostPath(edit, title);
        if (path !== edit.targetPath) {
            const old = edit.newClaims[edit.targetPath];
            if (old) {
                await fluid.staticEditing.send(edit, {type: "claim-remove", id: old.id, reason: "moved"});
                delete edit.newClaims[edit.targetPath];
            }
            edit.bases[path] = edit.bases[edit.targetPath];
            delete edit.bases[edit.targetPath];
            edit.creating.path = path;
            edit.targetPath = path;
            edit.state.path = path;
        }
        edit.source.setText(text);
        await fluid.staticEditing.onInput(edit, text);
    };

    /**
     * Show the controls at the head of the list a section page renders - while the editor is open, "+" to write a
     * new post, and always the new posts held as claims, not yet published, each resuming its editing when chosen.
     * They are the extension's own, outside the page's tree
     * @param {Object} edit - The controller
     */
    fluid.staticEditing.showListHead = function (edit) {
        const section = fluid.staticEditing.section(edit);
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
            if (!edit.state.hidden) {
                const add = head.appendChild(document.createElement("button"));
                add.className = "fluid-edit-new-post";
                add.title = "Write a new post";
                add.textContent = "+";
                add.addEventListener("click", () => fluid.staticEditing.beginNewPost(edit));
            }
            Object.values(edit.newClaims).forEach(claim => {
                const item = head.appendChild(document.createElement("a"));
                item.className = "fluid-edit-pending";
                item.href = "#";
                item.setAttribute("data-fluid-claim-state", claim.state);
                const title = (/^title:\s*"?(.*?)"?\s*$/m.exec(claim.text) || [])[1] || "Untitled";
                item.textContent = title + " - a new post, " + fluid.staticEditing.stateLabels[claim.state].toLowerCase();
                item.addEventListener("click", event => {
                    event.preventDefault();
                    fluid.staticEditing.activate(edit).then(() => fluid.staticEditing.beginNewPost(edit, edit.newClaims[claim.path]));
                });
            });
        }
    };

    /**
     * Encode text as base64 of its UTF-8 encoding, as a claim holds a further file's content
     * @param {Object} edit - The controller
     * @param {String} text - The text
     * @return {String} The encoding
     */
    fluid.staticEditing.encode = (edit, text) => fluid.staticEditing.encodeBytes(edit, new TextEncoder().encode(text));

    /**
     * Encode bytes as base64
     * @param {Object} edit - The controller
     * @param {Uint8Array} bytes - The bytes
     * @return {String} Their base64
     */
    fluid.staticEditing.encodeBytes = function (edit, bytes) {
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return btoa(binary);
    };

    /**
     * Decode base64 as bytes
     * @param {Object} edit - The controller
     * @param {String} content - The base64
     * @return {Uint8Array} The bytes
     */
    fluid.staticEditing.decodeBase64 = (edit, content) => Uint8Array.from(atob(content), char => char.charCodeAt(0));

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
     * @param {Object} edit - The controller
     * @param {BroughtFile[]} files - The files
     * @return {Promise} Resolves once they are held, ready for the next edit of the source to claim them
     */
    fluid.staticEditing.addFiles = function (edit, files) {
        edit.filesPromise = (edit.filesPromise || Promise.resolve()).then(async function () {
            await fluid.staticEditing.learnSite(edit);
            const held = edit.site ? edit.site.staticFiles : {};
            const claim = edit.targetPath ? fluid.staticEditing.claimOf(edit, edit.targetPath) : null;
            const redefined = [];
            for (const file of files) {
                const content = file.content ?? fluid.staticEditing.encode(edit, file.text);
                const hash = await fluid.staticEditing.hashBytes(edit, fluid.staticEditing.decodeBase64(edit, content));
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
                        baseSha = (await fluid.staticEditing.send(edit, {type: "source-read", repo: edit.provenance.repo, branch: edit.provenance.branch, path: file.path})).sha;
                    }
                    edit.pendingFiles[file.path] = {content, baseSha, hash};
                    if (file.layer && file.pageDiffers) {
                        redefined.push({layer: file.layer, kind: file.kind, text: file.text});
                    }
                }
            }
            if (redefined.length > 0) {
                await fluid.staticEditing.ask(edit, {op: "registerLayers", layers: redefined, override: true});
            }
        }).catch(error => fluid.staticEditing.setError(edit, error, "The pasted widget's files can't be held, since "));
        return edit.filesPromise;
    };

    /**
     * Take a paste into the source view of a widget held on the clipboard as PTF - its element is inserted at the
     * cursor, as a block of its own, and its layers held to be committed with the source
     * @param {Object} edit - The controller
     * @param {String} text - The pasted text
     * @return {Boolean} `true` if it was taken
     */
    fluid.staticEditing.onSourcePaste = function (edit, text) {
        const target = fluid.staticEditing.target(edit);
        const taken = /MIME-Version:[ \t]*1\.0/i.test(text) && !!target && !target.framing;
        if (taken) {
            fluid.staticEditing.ask(edit, {op: "widgetFromPTF", text, source: edit.source.getText()}).then(async ({markup, files}) => {
                await fluid.staticEditing.addFiles(edit, files);
                edit.source.insertBlock(markup);
            }).catch(error => fluid.staticEditing.setError(edit, error));
        }
        return taken;
    };

    /**
     * Take a drop into the source view of files - a widget as a ZIP file, or an image - which are inserted at the
     * cursor, set where they were dropped, and their files held to be committed with the source
     * @param {Object} edit - The controller
     * @param {File[]} files - The files dropped
     * @return {Boolean} `true` if they were taken
     */
    fluid.staticEditing.onSourceDrop = function (edit, files) {
        const target = fluid.staticEditing.target(edit);
        const taken = files.length > 0 && !!target && !target.framing;
        if (taken) {
            Promise.all(files.map(async file => ({name: file.name, type: file.type, content: fluid.staticEditing.encodeBytes(edit, new Uint8Array(await file.arrayBuffer()))})))
                .then(files => fluid.staticEditing.takeDroppedFiles(edit, files))
                .then(markdown => edit.source.insertBlock(markdown))
                .catch(error => fluid.staticEditing.setError(edit, error));
        }
        return taken;
    };

    /**
     * Take files dropped onto the page's blocks - see "fluid-block-edit-drop" in Infusion's fluid-blockEditor.vue - and fill
     * the slot they were dropped into with what is made of them
     * @param {Object} edit - The controller
     * @param {Object} drop - The drop
     * @param {String} drop.slot - The id of the slot the files were dropped into
     * @param {Object[]} drop.files - `{name, type, content}` for each, `content` its bytes as base64
     * @return {Promise} Resolves once the slot is filled
     */
    fluid.staticEditing.onBlockDrop = function (edit, {slot, files}) {
        return fluid.staticEditing.takeDroppedFiles(edit, files).then(markdown => fluid.staticEditing.ask(edit, {op: "fillSlot", slot, markdown}), error => {
            fluid.staticEditing.setError(edit, error);
            return fluid.staticEditing.ask(edit, {op: "fillSlot", slot, markdown: ""});
        });
    };

    // The directory of the repository in which dropped images are written, unless the page's provenance names another
    fluid.staticEditing.defaultImageDir = "static/img";

    /**
     * The directory of the repository in which dropped images are written
     * @param {Object} edit - The controller
     * @return {String} The directory, e.g. "static/img"
     */
    fluid.staticEditing.imageDir = (edit) => edit.provenance.images && edit.provenance.images.dir || fluid.staticEditing.defaultImageDir;

    /**
     * The path from the root of the site at which a static file of the repository is published
     * @param {Object} edit - The controller
     * @param {String} path - Its path in the repository, e.g. "static/img/x.png"
     * @return {String} Its path in the site, e.g. "/img/x.png"
     */
    fluid.staticEditing.sitePathOf = (edit, path) => "/" + path.replace(/^static\//, "");

    // The signatures by which the kind of an image is known from its bytes, not from the name or type it is dropped with
    fluid.staticEditing.imageSignatures = [
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
     * @param {Object} edit - The controller
     * @param {Uint8Array} bytes - The bytes
     * @return {Object|null} `{ext, type}` - its extension and MIME type - or null if they are no image's
     */
    fluid.staticEditing.sniffImage = (edit, bytes) => fluid.staticEditing.imageSignatures.find(signature => signature.test(bytes)) || null;

    /**
     * Make a slug of a name, for the file of an image
     * @param {Object} edit - The controller
     * @param {String} name - The name
     * @return {String} The slug, of lower-case letters, digits and hyphens
     */
    fluid.staticEditing.slugOf = (edit, name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    /**
     * Name the file of a dropped image, unused by the site and by the files held to be committed - by the dropped file's
     * own name if it is a meaningful one, e.g. not a screenshot's "image.png", otherwise by the page's source, e.g.
     * "ui-as-code-1.png" for content/post/2025-03-20-ui-as-code.md
     * @param {Object} edit - The controller
     * @param {String} fileName - The name the file was dropped with
     * @param {String} ext - The extension its bytes call for
     * @return {String} The path in the repository, e.g. "static/img/ui-as-code-1.png"
     */
    fluid.staticEditing.allocateImagePath = function (edit, fileName, ext) {
        const own = fluid.staticEditing.slugOf(edit, (fileName || "").replace(/\.[^.]*$/, ""));
        const meaningful = own !== "" && !/^(image|screenshot|clipboard|untitled)(-\d+)?$/.test(own);
        const sourceName = (edit.targetPath || "image").replace(/^.*\//, "").replace(/\.[^.]*$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
        const stem = meaningful ? own : fluid.staticEditing.slugOf(edit, sourceName) || "image";
        const assets = new Set(edit.site ? edit.site.assets : []);
        const claim = edit.targetPath ? fluid.staticEditing.claimOf(edit, edit.targetPath) : null;
        const used = path => assets.has(fluid.staticEditing.sitePathOf(edit, path)) || edit.site && edit.site.staticFiles[path] !== undefined ||
            !!edit.pendingFiles[path] || !!(claim && claim.files && claim.files[path]);
        const pathOf = suffix => fluid.staticEditing.imageDir(edit) + "/" + stem + suffix + "." + ext;
        let n = 1;
        let path = meaningful ? pathOf("") : pathOf("-1");
        while (used(path)) {
            ++n;
            path = pathOf("-" + n);
        }
        return path;
    };

    // The MIME types of files held which are not images, by extension, as the site will serve them
    fluid.staticEditing.fileTypes = {css: "text/css", js: "text/javascript", json: "application/json", vue: "text/plain",
        txt: "text/plain", csv: "text/csv", pdf: "application/pdf", html: "text/html"};

    /**
     * Show in the page the files held to be committed which the site does not yet publish - those of a claim's further
     * files, and those pending, beneath static/: images wherever the page shows them, and, by the site's service worker
     * if it publishes one, every file to whatever loads it, e.g. a stylesheet's `url()` or a widget's `fetch` - see
     * previewWorker.js of wend
     * @param {Object} edit - The controller
     * @param {Object<String, ClaimFile>} files - Further files, by path, beside those pending
     * @return {Promise<Number>} The number of images previewed
     */
    fluid.staticEditing.previewImages = function (edit, files) {
        const held = Object.entries({...files, ...edit.pendingFiles}).filter(([path, file]) => path.startsWith("static/") && file && file.content)
            .map(([path, file]) => {
                const kind = fluid.staticEditing.sniffImage(edit, fluid.staticEditing.decodeBase64(edit, file.content));
                const extension = path.substring(path.lastIndexOf(".") + 1).toLowerCase();
                return {url: new URL(fluid.sourceView.relativePath(edit.provenance.page, fluid.staticEditing.sitePathOf(edit, path)), location.href).href,
                    type: kind ? kind.type : fluid.staticEditing.fileTypes[extension] || "application/octet-stream", content: file.content};
            });
        const worker = edit.provenance.previewWorker ? new URL(edit.provenance.previewWorker, location.href).href : null;
        // With a worker, the files held are given even when there are none, so that it ceases to answer for any since published
        return held.length > 0 || worker ? fluid.staticEditing.ask(edit, {op: "previewImages", images: held, worker}) : Promise.resolve(0);
    };

    /**
     * Determine whether bytes are those of a ZIP file, by its local file header's signature
     * @param {Object} edit - The controller
     * @param {Uint8Array} bytes - The bytes
     * @return {Boolean} `true` if they begin as a ZIP file does
     */
    fluid.staticEditing.isZip = (edit, bytes) => bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

    /**
     * Make what is to be inserted into the page's source of files dropped into it - a widget's element for one held as
     * a ZIP file, or as a PTF document, and an image's markdown for an image - and hold the files they bring, to be
     * committed with the source
     * @param {Object} edit - The controller
     * @param {Object[]} files - `{name, type, content}` for each, `content` its bytes as base64
     * @return {Promise<String>} The markdown, a block for each file, set off by blank lines
     */
    fluid.staticEditing.takeDroppedFiles = async function (edit, files) {
        await fluid.staticEditing.learnSite(edit);
        const blocks = [];
        for (const file of files) {
            const bytes = fluid.staticEditing.decodeBase64(edit, file.content);
            const image = fluid.staticEditing.sniffImage(edit, bytes);
            const zip = fluid.staticEditing.isZip(edit, bytes);
            const text = image || zip ? "" : new TextDecoder().decode(bytes);
            const source = edit.source.getText() + "\n" + blocks.join("\n");
            if (zip) {
                // Read in the page's world, by Infusion's fluid-zip.js from the site's copy of Infusion - see bridge.js
                const made = await fluid.staticEditing.ask(edit, {op: "widgetFromZip", content: file.content, source});
                const images = made.images.map(one => ({path: fluid.staticEditing.imageDir(edit) + "/" + one.name, content: one.content}));
                await fluid.staticEditing.addFiles(edit, [...made.files, ...images]);
                blocks.push(made.markup);
            } else if (image) {
                const path = fluid.staticEditing.allocateImagePath(edit, file.name, image.ext);
                await fluid.staticEditing.addFiles(edit, [{path, content: file.content}]);
                const alt = (file.name || "").replace(/\.[^.]*$/, "").replace(/[[\]]/g, "");
                blocks.push("![" + alt + "](" + fluid.sourceView.relativePath(edit.provenance.page, fluid.staticEditing.sitePathOf(edit, path)) + ")");
            } else if (/MIME-Version:[ \t]*1\.0/i.test(text)) {
                const made = await fluid.staticEditing.ask(edit, {op: "widgetFromPTF", text, source});
                await fluid.staticEditing.addFiles(edit, made.files);
                blocks.push(made.markup);
            } else {
                throw new Error(file.name + " is neither a widget, as a ZIP file or a PTF document, nor an image");
            }
        }
        await edit.filesPromise;
        await fluid.staticEditing.previewImages(edit, {});
        return blocks.join("\n\n");
    };

    /**
     * Record an edit of the text in the panel as the claim, uncommitted
     * @param {Object} edit - The controller
     * @param {String} text - The edited text of the source
     */
    fluid.staticEditing.onInput = async function (edit, text) {
        // An edit other than one in the page, e.g. in the source view, is shown in the page once held
        if (text !== edit.blockEditText) {
            edit.blockEditText = undefined;
        }
        if (edit.provenance.source && edit.targetPath === edit.provenance.source.path) {
            fluid.staticEditing.learnHeadings(edit, text);
        }
        // Any files a pasted widget brings are held first
        await edit.filesPromise;
        const path = edit.targetPath;
        const claim = path ? fluid.staticEditing.claimOf(edit, path) : null;
        const base = claim ? {sha: claim.baseSha, hash: claim.baseHash, text: claim.baseText} : edit.bases[path];
        if (path && base) {
            const hash = await fluid.staticEditing.hashText(edit, text);
            const pending = edit.pendingFiles;
            edit.pendingFiles = {};
            const files = {...claim && claim.files, ...pending};
            await fluid.staticEditing.putClaim(edit, {
                repo: edit.provenance.repo,
                branch: edit.provenance.branch,
                path,
                // The text edited, so that a source of framing, shown live on every page, may be restored on discarding
                baseText: fluid.staticEditing.framingOf(edit, path) ? base.text : undefined,
                page: edit.provenance.page,
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
     * Check whether any base of the site, held as a git repository, has moved on since the site was built, and if so
     * offer to rebuild the site from it - see `bases` in wend.site.json, and the site's trace
     * @param {Object} edit - The controller
     * @return {Promise<Object[]>} `{repo, branch, sha, head}` for each base which has moved on
     */
    fluid.staticEditing.checkBases = async function (edit) {
        const trace = await fluid.staticEditing.fetchTrace(edit);
        const bases = trace && trace.bases || [];
        let stale = [];
        if (bases.length > 0) {
            try {
                const heads = await fluid.staticEditing.send(edit, {type: "base-heads", bases});
                stale = heads.filter(base => base.head && base.head !== base.sha);
            } catch (error) {
                stale = [];
            }
        }
        edit.staleBases = stale;
        edit.state.basesHidden = stale.length === 0;
        edit.state.basesText = stale.length === 0 ? "" : (stale.length === 1 ? "This site's base " + stale[0].repo + " has" :
            "This site's bases " + stale.map(base => base.repo).join(", ") + " have") + " changed since the site was last built.";
        edit.state.basesDisabled = false;
        return stale;
    };

    /**
     * Rebuild the site from the latest commits of its bases which have moved on, by committing its record of the
     * commits it builds them at, and reload the page once the site is published afresh
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once the rebuild is asked for
     */
    fluid.staticEditing.rebuildBases = async function (edit) {
        const stale = edit.staleBases || [];
        edit.state.basesDisabled = true;
        try {
            const result = await fluid.staticEditing.send(edit, {type: "bases-rebuild", repo: edit.provenance.repo, branch: edit.provenance.branch,
                bases: stale.map(base => ({repo: base.repo, sha: base.head}))});
            if (result.ok) {
                edit.state.basesText = "Rebuilding the site from the latest of " + stale.map(base => base.repo).join(", ") +
                    " - the page reloads once it is published.";
                fluid.staticEditing.awaitBases(edit, stale);
            } else {
                edit.state.basesDisabled = false;
                fluid.staticEditing.setError(edit, result.message);
            }
        } catch (error) {
            edit.state.basesDisabled = false;
            fluid.staticEditing.setError(edit, error);
        }
    };

    /**
     * Poll the published trace until it records the site built from the given commits of its bases, then reload the page
     * @param {Object} edit - The controller
     * @param {Object[]} bases - `{repo, head}` for each base rebuilt from
     */
    fluid.staticEditing.awaitBases = function (edit, bases) {
        clearTimeout(edit.basesTimer);
        edit.basesTimer = setTimeout(async function () {
            const trace = await fluid.staticEditing.fetchTrace(edit);
            const built = trace && bases.every(base => (trace.bases || []).some(one => one.repo === base.repo && one.sha === base.head));
            if (built) {
                location.reload();
            } else {
                fluid.staticEditing.awaitBases(edit, bases);
            }
        }, edit.pollInterval);
    };

    /**
     * Show a line of status in the panel
     * @param {Object} edit - The controller
     * @param {String} text - The status
     */
    fluid.staticEditing.setStatus = function (edit, text) {
        edit.state.status = text;
        edit.state.statusKind = "";
    };

    /**
     * Show an error in the panel's line of status, marked as one, so that it stands out from the panel's notes of progress
     * @param {Object} edit - The controller
     * @param {Error|String} error - The error
     * @param {String} [prefix] - Text to precede the error's message
     */
    fluid.staticEditing.setError = function (edit, error, prefix) {
        edit.state.status = (prefix || "") + String(error.message || error);
        edit.state.statusKind = "error";
    };

    /**
     * Bring the panel's controls into line with the claim's state
     * @param {Object} edit - The controller
     */
    fluid.staticEditing.updatePanel = function (edit) {
        const claim = edit.targetPath ? fluid.staticEditing.claimOf(edit, edit.targetPath) : null;
        const state = claim ? claim.state : null;
        Object.assign(edit.state, {
            claimState: state || "none",
            // Any Commit reviews every uncommitted edit of the repository, so is offered while any is held
            commitDisabled: !fluid.staticEditing.commitCandidate(edit),
            discardDisabled: !state,
            buttonsHidden: !edit.targetPath,
            stateText: !edit.targetPath ? "" : state ? fluid.staticEditing.stateLabels[state] : "No edits"
        });
        if (claim && claim.message) {
            fluid.staticEditing.setStatus(edit, claim.message);
        }
        fluid.staticEditing.showListHead(edit);
        fluid.staticEditing.openTab(edit, edit.targetPath);
        // What claims hold may have changed, and with it the site's widgets
        clearTimeout(edit.widgetsTimer);
        edit.widgetsTimer = setTimeout(() => fluid.staticEditing.refreshWidgets(edit).catch(error => console.error("Edit in Infusion: the site's widgets can't be listed", error)), 200);
    };

    /**
     * Dock the panel beside the page's <body>, or withdraw it - as Infusion's full-page editor docks its own, by the
     * `fl-docking-area-mode` of the root element, so that the page keeps its layout and its scrollbar beside its content.
     * The body then scrolls within its share, so the page's scroll is carried across. The bar setting the panel off is
     * bound as Infusion's fluid.resizeBar - see the extension's bridge.js
     * @param {Object} edit - The controller
     * @param {Boolean} on - Whether the panel is shown
     */
    fluid.staticEditing.dock = function (edit, on) {
        const root = document.documentElement;
        const wasDocked = (root.getAttribute("fl-docking-area-mode") || "").includes("edge");
        const top = wasDocked ? document.body.scrollTop : window.scrollY;
        root.setAttribute("fl-docking-area-mode", on ? "right edge" : "minimized");
        edit.state.hidden = !on;
        fluid.staticEditing.updateBadge(edit);
        if (on) {
            document.body.scrollTop = top;
        } else {
            window.scrollTo(0, top);
        }
        if (on && !edit.resizeBarBound) {
            edit.resizeBarBound = true;
            fluid.staticEditing.ask(edit, {op: "bindResizeBar", bar: ".fluid-edit-resize-bar", panel: ".fluid-edit-panel"})
                .catch(error => fluid.staticEditing.setError(edit, error, "The panel cannot be resized, since "));
        }
        fluid.staticEditing.rememberSession(edit);
        fluid.staticEditing.showListHead(edit);
    };

    /**
     * The uncommitted claim a Commit asks for - that of the source the panel edits, should it hold one, or else any
     * other held on the repository, e.g. one of another page, edited in the same session
     * @param {Object} edit - The controller
     * @return {Claim|null} The claim, or null if none is uncommitted
     */
    fluid.staticEditing.commitCandidate = function (edit) {
        const own = edit.targetPath ? fluid.staticEditing.claimOf(edit, edit.targetPath) : null;
        const held = [...fluid.staticEditing.allClaims(edit), ...(edit.widgetClaims || [])];
        return own && own.state === "uncommitted" ? own : held.find(claim => claim.state === "uncommitted") || null;
    };

    /**
     * Commit the claim on the source the panel edits, or any other uncommitted - the extension opens a window reviewing
     * every uncommitted claim of the repository, of which the user chooses those to commit together
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once committed, or not
     */
    fluid.staticEditing.commit = async function (edit) {
        fluid.staticEditing.setStatus(edit, "Committing - review the edits to commit in the window the extension opens ...");
        try {
            await fluid.staticEditing.flushInput(edit);
            const candidate = fluid.staticEditing.commitCandidate(edit);
            const claim = await fluid.staticEditing.send(edit, {type: "claim-commit", id: candidate.id});
            // A claim of another page is shown there, not here
            if (fluid.staticEditing.allClaims(edit).some(one => one.id === claim.id)) {
                await fluid.staticEditing.showClaimOf(edit, claim.path, claim);
            }
            // Others of this page may have been committed with it, e.g. the framing's
            for (const other of fluid.staticEditing.allClaims(edit).filter(one => one.id !== claim.id)) {
                const fresh = await fluid.staticEditing.send(edit, {type: "claim-get", repo: other.repo, path: other.path});
                await fluid.staticEditing.showClaimOf(edit, other.path, fresh || null);
            }
            if (claim.state === "committed") {
                // Their edits committed, the tabs opened to make them are closed
                await fluid.staticEditing.closeOtherTabs(edit);
                fluid.staticEditing.showHistory(edit);
            }
            fluid.staticEditing.setStatus(edit, claim.state === "committed" ? "Committed as " + claim.commitSha.substring(0, 7) : claim.message || "");
        } catch (error) {
            fluid.staticEditing.setError(edit, error);
        }
        fluid.staticEditing.poll(edit);
    };

    /**
     * Discard the claim on the source the panel edits
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once discarded
     */
    fluid.staticEditing.discard = async function (edit) {
        const path = edit.targetPath;
        const creating = fluid.staticEditing.target(edit) && fluid.staticEditing.target(edit).creating;
        await fluid.staticEditing.send(edit, {type: "claim-remove", id: fluid.staticEditing.claimOf(edit, path).id, reason: "discarded"});
        delete edit.bases[path];
        await fluid.staticEditing.showClaimOf(edit, path, null);
        edit.source.setText("");
        if (creating) {
            edit.creating = null;
            await fluid.staticEditing.switchTarget(edit, null);
        } else {
            await fluid.staticEditing.activate(edit);
        }
    };

    /**
     * Respond to the "Also edit framing" control
     * @param {Object} edit - The controller
     * @param {Event} event - Its change
     */
    fluid.staticEditing.framingChanged = function (edit, event) {
        fluid.staticEditing.setFramingMode(edit, event.target.checked);
    };

    /**
     * Respond to the "Site configuration" control, editing the site's configuration in its tab - opened, should it not
     * be open, and given the focus
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once its tab is shown
     */
    fluid.staticEditing.editConfig = async function (edit) {
        const path = edit.provenance.framing.find(framing => framing.kind === "patch").path;
        if (path !== edit.targetPath) {
            await fluid.staticEditing.switchTarget(edit, path);
        }
        // Its tab is given the focus, whether opened now or already open
        const tab = edit.panel.querySelector(`.fluid-edit-tab[data-fluid-tab-path="${CSS.escape(path)}"]`);
        if (tab) {
            tab.focus();
        }
    };

    /**
     * Respond to typing of the title of a new post, retitling it a little after the typing stops
     * @param {Object} edit - The controller
     * @param {Event} event - The input
     */
    fluid.staticEditing.titleInput = function (edit, event) {
        clearTimeout(edit.titleTimer);
        edit.titleTimer = setTimeout(() => fluid.staticEditing.retitleNewPost(edit, event.target.value), 300);
    };

    /**
     * Respond to an edit of the source in the source view, claiming it a little after the editing stops - see
     * fluid.sourceView
     * @param {Object} edit - The controller
     * @param {Event} event - The view's change, whose `detail` holds its `text`
     */
    fluid.staticEditing.sourceChanged = function (edit, event) {
        clearTimeout(edit.inputTimer);
        edit.pendingInput = event.detail.text;
        edit.inputTimer = setTimeout(() => fluid.staticEditing.flushInput(edit), 300);
    };

    /**
     * Record at once any edit of the source view still awaiting its pause - see `sourceChanged` - e.g. before
     * committing, so that what was typed or dropped a moment before is committed with the rest
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once it is recorded, or at once if none awaits
     */
    fluid.staticEditing.flushInput = function (edit) {
        clearTimeout(edit.inputTimer);
        const text = edit.pendingInput;
        edit.pendingInput = undefined;
        return text === undefined ? Promise.resolve() : fluid.staticEditing.onInput(edit, text);
    };

    /**
     * Respond to the source view's cursor moving - while the page's own source is edited, the block holding its line is
     * marked in the page (see fluid-blockEditor.vue), and while a source of its framing is, the text of the framing
     * rendered from where it stands - see `showFramingPosition`
     * @param {Object} edit - The controller
     * @param {Event} event - The move, whose `detail` holds its `line` and `pos`
     */
    fluid.staticEditing.sourceCursor = function (edit, event) {
        const target = fluid.staticEditing.target(edit);
        if (target && target.framing) {
            // The framing's text, rather than the page's blocks, shows where the cursor stands
            fluid.staticEditing.showFramingPosition(edit, event.detail.pos);
        } else if (event.detail.line !== edit.cursorLine) {
            edit.cursorLine = event.detail.line;
            document.dispatchEvent(new CustomEvent("fluid-source-cursor", {detail: JSON.stringify({line: event.detail.line})}));
        }
    };

    /**
     * Respond to a paste into the source view - one taken is marked by preventing the event's default
     * @param {Object} edit - The controller
     * @param {Event} event - The paste, whose `detail` holds its `text`
     */
    fluid.staticEditing.sourcePaste = function (edit, event) {
        if (fluid.staticEditing.onSourcePaste(edit, event.detail.text)) {
            event.preventDefault();
        }
    };

    /**
     * Respond to a drop of files into the source view - one taken is marked by preventing the event's default
     * @param {Object} edit - The controller
     * @param {Event} event - The drop, whose `detail` holds its `files`
     */
    fluid.staticEditing.sourceDrop = function (edit, event) {
        if (fluid.staticEditing.onSourceDrop(edit, event.detail.files)) {
            event.preventDefault();
        }
    };

    /**
     * Supply the source view with what is known of the site, for completing links, and of the component rendering the
     * source it edits, for completing the references of its template - see fluid.sourceView
     * @param {Object} edit - The controller
     * @param {Event} event - The request, whose `detail` receives the `site`
     */
    fluid.staticEditing.sourceSite = function (edit, event) {
        event.detail.site = edit.site || null;
        event.detail.templateScope = fluid.staticEditing.templateScope(edit);
    };

    /**
     * Respond to the source's fold being toggled by the user - their folding is remembered for every panel
     * @param {Object} edit - The controller
     * @param {Event} event - The toggle of the <details>
     */
    fluid.staticEditing.sourceToggled = function (edit, event) {
        const open = event.target.open;
        if (open !== edit.state.sourceOpen) {
            edit.state.sourceOpen = open;
            fluid.staticEditing.setPref(edit, "sourceOpen", open);
        }
        // The view was made folded, at no size - it measures itself again once shown
        if (open) {
            edit.source.view.requestMeasure();
        }
    };

    /**
     * Keep the panel and its bar in the page - a page booting its own tree as it loads, e.g. for a live island, claims
     * the markup of its root element, and removes what it did not render, as it may when the editor reopens at once on
     * navigating. They are put back, unless the bridge has itself withdrawn them while it boots the page's tree
     * @param {Object} edit - The controller
     */
    fluid.staticEditing.keepAttached = function (edit) {
        const root = document.documentElement;
        edit.attachObserver = new MutationObserver(() => {
            if (!edit.panel.isConnected && !root.hasAttribute("data-fluid-edit-booting")) {
                root.appendChild(edit.resizeBar);
                root.appendChild(edit.panel);
            }
        });
        edit.attachObserver.observe(root, {childList: true});
    };

    /**
     * Fetch the claim held on a source, dropping it if the page itself was built from its text - it has been published
     * since the claim was last seen
     * @param {Object} edit - The controller
     * @param {String} path - The source's path
     * @param {String} hash - The hash of the source this page was built from
     * @return {Promise<Claim|null>} The claim, or null
     */
    fluid.staticEditing.current = async function (edit, path, hash) {
        const claim = await fluid.staticEditing.send(edit, {type: "claim-get", repo: edit.provenance.repo, path});
        let togo = claim || null;
        if (claim && claim.hash === hash) {
            await fluid.staticEditing.send(edit, {type: "claim-remove", id: claim.id, reason: "published"});
            togo = null;
        }
        return togo;
    };

    /**
     * Start on the page: show any claim held on its sources, and listen for activation
     * @param {Object} edit - The controller
     * @return {Promise} Resolves once started
     */
    fluid.staticEditing.start = async function (edit) {
        edit.listeners = {
            // Text typed into the framing edited in place - see fluid.staticEditing.framingInPlace
            "input": event => fluid.staticEditing.onFramingInput(edit, event),
            // The selection moved within the framing edited in place moves the source view's cursor with it
            "selectionchange": () => fluid.staticEditing.onFramingSelection(edit),
            "fluid-block-edit-source": event => fluid.staticEditing.onBlockEdit(edit, JSON.parse(event.detail).text),
            // The layers of a widget pasted into a block - see fluid-blockEditor.vue
            "fluid-block-edit-files": event => fluid.staticEditing.addFiles(edit, JSON.parse(event.detail).files),
            // Files dropped onto a block - see fluid-blockEditor.vue
            "fluid-block-edit-drop": event => fluid.staticEditing.onBlockDrop(edit, JSON.parse(event.detail)),
            // The block in hand in the page - its lines are shown in the source view, which returns to the page's own
            // source if it shows another, e.g. the footer's
            "fluid-block-edit-focus": event => {
                if (edit.provenance.source) {
                    const range = JSON.parse(event.detail);
                    if (edit.targetPath === edit.provenance.source.path) {
                        edit.source.showBlock(range);
                    } else {
                        fluid.staticEditing.switchTarget(edit, edit.provenance.source.path).then(() => edit.source.showBlock(range));
                    }
                }
            },
            [fluid.staticEditing.activateEvent]: () => edit.started.then(() => fluid.staticEditing.activate(edit)),
            [fluid.staticEditing.claimRemovedEvent]: event => edit.started.then(() => fluid.staticEditing.claimRemoved(edit, JSON.parse(event.detail)))
        };
        Object.entries(edit.listeners).forEach(([type, listener]) => document.addEventListener(type, listener));
        // The titles of the panel's controls, and of the marks it makes in the page, are shown as tooltips placed by
        // Popper - once loaded, from the site's copy of Infusion - see the foot of this file
        fluid.staticEditing.tooltipsLoaded.then(() => {
            if (fluid.titleTooltips && !edit.unbound) {
                edit.titleTooltips = fluid.titleTooltips.bind(document, fluid.staticEditing.tooltipScope, {className: "fluid-edit-tooltip", global: window});
                // Kept, as the panel is, while the page's tree boots - see bridge.js
                edit.titleTooltips.tooltip.node.setAttribute("data-fluid-edit-ui", "");
            }
        });
        edit.onFramingClick = event => fluid.staticEditing.onFramingClick(edit, event);
        document.addEventListener("click", edit.onFramingClick, true);
        edit.blocks = (edit.provenance.blocks || []).flatMap(block => [...document.querySelectorAll(block.selector)]);
        // A page with no source of its own, e.g. a list, edits nothing until something is chosen - its framing, or a new post
        edit.targetPath = edit.provenance.source ? edit.provenance.source.path : null;
        if (edit.provenance.source) {
            await fluid.staticEditing.showClaim(edit, await fluid.staticEditing.current(edit, edit.provenance.source.path, edit.provenance.source.hash));
        }
        // A claim on a source of the framing, made on any page, is shown on every page rendering it
        for (const framing of edit.provenance.framing || []) {
            const claim = await fluid.staticEditing.current(edit, framing.path, framing.hash);
            if (claim) {
                await fluid.staticEditing.showFraming(edit, framing, claim);
            }
        }
        // The new posts of a list page's section, held as claims, not yet published
        const section = fluid.staticEditing.section(edit);
        if (section) {
            const claims = await fluid.staticEditing.send(edit, {type: "claim-list", repo: edit.provenance.repo, prefix: section.contentDir + "/"});
            claims.filter(claim => !claim.baseSha).forEach(claim => {
                edit.newClaims[claim.path] = claim;
            });
            fluid.staticEditing.showListHead(edit);
        }
        fluid.staticEditing.updateBadge(edit);
        fluid.staticEditing.poll(edit);
        // The editor stays open as the user navigates the site in the tab
        const session = fluid.staticEditing.recallSession();
        if (session) {
            await fluid.staticEditing.activate(edit);
            if (session.framing) {
                await fluid.staticEditing.setFramingMode(edit, true);
            }
        }
    };

    /**
     * Make the controller of a page's editing panel - bound by fluid.staticEditor once its panel is rendered. The page
     * has been made live already - its component tree booted over it, and its blocks' components adapted for editing
     * @param {Object} state - The panel's reactive state, rendered by its template
     * @param {Object} source - The panel's source view - see fluid.sourceView
     * @param {Element} panel - The panel's rendered container
     * @param {Object} provenance - The page's provenance record
     * @param {Object} config - The editing client's configuration - `prefs`, the user's preferences, and
     * `pollInterval`, how often the published trace is polled, in ms
     * @return {Object} The controller
     */
    fluid.staticEditing.bind = function (state, source, panel, provenance, config) {
        const edit = {
            state, source, panel, provenance,
            blocks: [],
            claim: null,
            // The claims held on the sources of the page's framing, by path - see `framing` in the provenance record
            framingClaims: {},
            // The path of the source the panel edits - the page's own, or one of its framing's
            targetPath: null,
            // For each source opened in the panel without a claim, what it was read as from the repository, by path
            bases: {},
            // The claims held on new posts, not yet in the repository, of the section a list page lists, by path
            newClaims: {},
            // The files a pasted widget brings, held until the next edit of the source claims them - see addFiles
            pendingFiles: {},
            filesPromise: null,
            // The new post being written, `{path}`, if any
            creating: null,
            framingMode: false,
            blockEditing: false,
            // The user's preferences for the panel - see setPref
            prefs: {sourceOpen: false, ...config.prefs},
            pollTimer: null,
            requestCount: 0,
            pollInterval: config.pollInterval || 15000
        };
        state.framingRowHidden = !(provenance.framing || []).length;
        edit.onSourceToggle = event => fluid.staticEditing.sourceToggled(edit, event);
        panel.querySelector(".fluid-edit-source").addEventListener("toggle", edit.onSourceToggle);
        // Docked outside the <body>, after it, beside a bar setting it off - see fluid.staticEditing.dock
        edit.resizeBar = document.createElement("div");
        edit.resizeBar.className = "fluid-edit-resize-bar";
        edit.resizeBar.setAttribute("data-fluid-edit-ui", "");
        document.documentElement.insertBefore(edit.resizeBar, panel);
        fluid.staticEditing.keepAttached(edit);
        edit.started = fluid.staticEditing.start(edit).catch(error => console.error("The page's editing could not start:", error));
        return edit;
    };

    /**
     * Unbind the controller of an editing panel - its listeners, poll and bar
     * @param {Object} edit - The controller
     */
    fluid.staticEditing.unbind = function (edit) {
        edit.unbound = true;
        clearTimeout(edit.pollTimer);
        if (edit.titleTooltips) {
            fluid.titleTooltips.unbind(edit.titleTooltips);
        }
        clearTimeout(edit.widgetsTimer);
        Object.entries(edit.listeners || {}).forEach(([type, listener]) => document.removeEventListener(type, listener));
        document.removeEventListener("click", edit.onFramingClick, true);
        edit.attachObserver.disconnect();
        edit.resizeBar.remove();
    };
};

if (typeof(fluid) !== "undefined") {
    fluidStaticEditingScope(fluid);
    // The panel's shared components, which an editing client need not know of, are found beside this script, as the
    // site publishes Infusion - see wend's trace.js
    const script = typeof(document) !== "undefined" && document.currentScript;
    // Where the titles of the panel's controls and of its marks in the page are shown as tooltips
    fluid.staticEditing.tooltipScope = "[data-fluid-edit-ui], [data-fluid-framing-editable], .fluid-edit-list-head";
    /**
     * Load a script of the site's copy of Infusion into the page
     * @param {String} src - Its URL
     * @return {Promise} Resolves once it has run, or rejects should it fail to load
     */
    const loadScript = src => new Promise((resolve, reject) => {
        const element = document.createElement("script");
        element.src = src;
        element.setAttribute("data-fluid-edit-ui", "");
        element.onload = resolve;
        element.onerror = () => reject(new Error("Failed to load " + src));
        document.head.appendChild(element);
    });
    // The tooltips, and Popper placing them - a site whose Infusion holds neither shows the browser's own
    fluid.staticEditing.tooltipsLoaded = script && script.src && !fluid.titleTooltips ? (async function () {
        await loadScript(new URL("../../../lib/popper/popper-lite.min.js", script.src).href).catch(() => null);
        await loadScript(new URL("../../tooltip/fluid-tooltip.js", script.src).href);
    })().catch(error => console.warn("Edit in Infusion: tooltips are shown by the browser, since " + error.message)) : Promise.resolve();
    if (script && script.src && fluid.loadImportMap) {
        // The directory of the static editor's own SFCs, e.g. the host of "Ask me anything" - see toggleAI
        fluid.staticEditing.sfcDir = new URL("../sfc/", script.src).href;
        fluid.loadImportMap({"fluid.layerPicker": {path: new URL("../../sfc/fluid-layerPicker.vue", script.src).href}}, document);
        fluid.subscribeDocToInjections("fluid.layerPicker", document);
    }
}
