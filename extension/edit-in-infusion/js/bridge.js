"use strict";

// Loaded by edit.js into the page's own world, so that a claim is rendered by the site's own pipeline - the code its
// build renders with, published with the site and named by the page's provenance record - rather than by a copy held by
// the extension. See item 12 of a-scratch/reports/0-live-static-editing.md in Infusion 6.
//
// The content script runs in an isolated world, sharing the DOM but not the page's globals. It can't load the site's
// scripts itself, since under Manifest V3 a script element it inserts is held to the extension's own Content Security
// Policy, which admits only the extension's files; one inserted by this bridge, which runs in the page's world, is held
// to the page's policy, as the page's own scripts are. So the two talk by events on the document, whose details are
// JSON strings:
//   fluid-edit-bridge-request  {id, op: "load", scripts}      - load these scripts, in order, into the page
//                              {id, op: "render", global, text} - render `text` with the pipeline at window[global]
//                              {id, op: "headings", global, text} - list the headings of `text`, with the ids the
//                                                               pipeline gives them, for completing links to them
//                              {id, op: "migrate", migration, blocks, blockEditor, renderer}
//                                                              - boot Infusion and the page's blocks as live components
//                              {id, op: "setSource", text}    - show `text`, or with null the published block, in
//                                                               each migrated block
//                              {id, op: "setLayerSource", layer, text} - show `text` as the SFC defining `layer`, e.g.
//                                                               the page's footer, in place of the published one
//                              {id, op: "setBlockEditing", on} - edit the migrated blocks in place, or cease to - see
//                                                               Infusion's fluid-blockEditor.vue, which announces each edit
//                                                               as the event fluid-block-edit-source {text}
//                              {id, op: "bindResizeBar", bar, panel} - bind the bar setting off the extension's panel
//                                                               as fluid.resizeBar
//                              {id, op: "setPatch", text}     - show `text` as the site's configuration, a patch of
//                                                               the members of the root of its tree
//                              {id, op: "markLayer", layer, path, state, label} - mark the elements `layer` renders
//                                                               with a claim's state
//                              {id, op: "registerLayers", layers, override} - define layers from their text,
//                                                               `{layer, kind, text}` each, e.g. those of a widget
//                                                               pasted into a claim - with `override`, replacing any
//                                                               definition the page holds
//                              {id, op: "widgetFromPTF", text, source} - read a widget pasted as PTF: register its
//                                                               layers, and return its element, to be written into
//                                                               `source`, and the files of its layers
//                              {id, op: "widgetFromParts", parts, source} - the same, for a widget as PTF parts
//                              {id, op: "widgetFromZip", content, source} - the same, for a widget dropped as a ZIP
//                                                               file, its base64, read by Infusion's fluid-zip.js, and
//                                                               the images it holds
//                              {id, op: "fillSlot", slot, markdown} - fill the slot into which files were dropped
//                                                               onto the blocks, announced by the block editor as the
//                                                               event fluid-block-edit-drop {slot, files}
//                              {id, op: "previewImages", images, worker} - show files the site does not yet publish,
//                                                               e.g. dropped images, `{url, type, content}` each,
//                                                               `content` their base64: images wherever the page shows
//                                                               `url`, and, given the site's service worker, every file
//                                                               to whatever loads it
//   fluid-edit-bridge-reply    {id, result} or {id, error}
// The bridge holds nothing of the extension's - no token, no claims - so that the page gains nothing by speaking to it.

(function () {
    if (!window.fluidEditBridge) {
        const bridge = {renderers: {}, loaded: {}};
        window.fluidEditBridge = bridge;

        /**
         * Load a script into the page, once
         * @param {String} src - Its absolute URL
         * @return {Promise} Resolves once it has run
         */
        // The directory within Infusion of what the extension loads into a page from the site's copy of Infusion, which
        // the site's build publishes for it - see wend's trace.editingFiles
        bridge.editingDir = "src/components/staticEditing/";

        /**
         * Make the URL of a file of Infusion's static editing, in the site's copy of Infusion
         * @param {String} file - Its path within bridge.editingDir, e.g. "js/fluid-zip.js"
         * @return {String} Its URL
         */
        bridge.editingFile = file => bridge.frameworkRoot + bridge.editingDir + file;

        /**
         * Decode base64 into bytes
         * @param {String} text - The base64
         * @return {Uint8Array} The bytes
         */
        bridge.decodeBase64 = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));

        /**
         * Encode bytes as base64
         * @param {Uint8Array} bytes - The bytes
         * @return {String} The base64
         */
        bridge.encodeBase64 = function (bytes) {
            let binary = "";
            for (let i = 0; i < bytes.length; i += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            }
            return btoa(binary);
        };

        /**
         * Make a widget of a ZIP file dropped onto a block, read by Infusion's fluid-zip.js, loaded once from the site's
         * copy of Infusion
         * @param {String} content - The ZIP file's bytes, as base64
         * @param {String} source - The source the widget is to be inserted into
         * @return {Promise<Object>} As for fluid.blockEditor.widgetFromParts, with `images`, `{name, content}` for each
         * image the ZIP file holds, `content` its base64
         */
        bridge.widgetFromZip = async function (content, source) {
            if (!fluid.zip) {
                await bridge.loadScript(bridge.editingFile("js/fluid-zip.js"));
            }
            const widget = fluid.zip.toWidget(await fluid.zip.read(bridge.decodeBase64(content)));
            let parts;
            if (widget.ptf === undefined) {
                parts = widget.parts;
            } else {
                parts = fluid.ptf.decode(widget.ptf);
                if (fluid.isUnavailable(parts)) {
                    throw new Error("The text holds no PTF document which can be read");
                }
            }
            const made = await fluid.blockEditor.widgetFromParts(parts, source);
            return {...made, images: widget.images.map(image => ({name: image.name, content: bridge.encodeBase64(image.bytes)}))};
        };

        /**
         * Make the editing panel, Infusion's fluid.staticEditor, from the site's copy of Infusion, in a container of its
         * own beside the page's <body> - with its source view, which uses Infusion's bundle of CodeMirror 6, and its
         * controller, fluid-staticEditing.js. The page must be migrated first. Made once
         * @param {Object} request - The request
         * @param {Object} request.provenance - The page's provenance record
         * @param {Object} request.config - The extension's configuration of the panel - `prefs` and `pollInterval`
         * @return {Promise<Boolean>} Resolves `true` once the panel is made, and its controller started
         */
        bridge.bootEditor = function ({provenance, config}) {
            if (!bridge.editorBooted) {
                bridge.editorBooted = (async function () {
                    await bridge.loadScript(bridge.frameworkRoot + "src/lib/fluid-lint/fluid-lint.js");
                    await bridge.loadScript(bridge.editingFile("js/fluid-staticEditing.js"));
                    fluid.loadImportMap({
                        "fluid.sourceView": {path: bridge.editingFile("sfc/fluid-sourceView.vue")},
                        "fluid.staticEditor": {path: bridge.editingFile("sfc/fluid-staticEditor.vue")}
                    }, document);
                    await fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.sourceView", document));
                    await fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.staticEditor", document));
                    const container = document.createElement("div");
                    container.setAttribute("data-fluid-edit-ui", "");
                    document.documentElement.appendChild(container);
                    bridge.editor = fluid.initFreeComponent("fluid.staticEditor", {container, provenance, config});
                    await fluid.cell.settle();
                    return true;
                })();
            }
            return bridge.editorBooted;
        };

        bridge.loadScript = function (src) {
            if (!bridge.loaded[src]) {
                bridge.loaded[src] = new Promise((resolve, reject) => {
                    const script = document.createElement("script");
                    script.src = src;
                    script.setAttribute("data-fluid-edit", "renderer");
                    script.onload = () => resolve();
                    script.onerror = () => reject(new Error("Can't load the renderer script " + src));
                    document.head.appendChild(script);
                });
            }
            return bridge.loaded[src];
        };

        bridge.ops = {
            load: async function (request) {
                // In order, since each plugin and the pipeline expect markdown-it to be loaded already
                for (const src of request.scripts) {
                    await bridge.loadScript(src);
                }
                return true;
            },
            render: async function (request) {
                const pipeline = window[request.global];
                if (pipeline) {
                    bridge.renderers[request.global] = bridge.renderers[request.global] || pipeline.make(pipeline.browserLibs(window));
                    return pipeline.renderSource(bridge.renderers[request.global], request.text);
                } else {
                    throw new Error("The page's renderer " + request.global + " is not loaded");
                }
            },
            headings: async function (request) {
                const pipeline = window[request.global];
                bridge.renderers[request.global] = bridge.renderers[request.global] || pipeline.make(pipeline.browserLibs(window));
                return pipeline.headings(bridge.renderers[request.global], pipeline.splitFrontMatter(request.text).body);
            },
            migrate: async function (request) {
                return bridge.migrate(request);
            },
            setSource: async function (request) {
                bridge.blockShadows.forEach(shadow => fluid.setForComponent(shadow.that, ["editSource"], request.text));
                return bridge.blockShadows.length;
            },
            setLayerSource: async function (request) {
                return bridge.setLayerSource(request);
            },
            setBlockEditing: async function (request) {
                bridge.blockShadows.forEach(shadow => fluid.setForComponent(shadow.that, ["blockEditing"], request.on));
                await fluid.cell.settle();
                return bridge.blockShadows.length;
            },
            bindResizeBar: async function (request) {
                return bridge.bindResizeBar(request);
            },
            setPatch: async function (request) {
                return bridge.setPatch(request);
            },
            registerLayers: async function ({layers, override}) {
                const parts = layers.map(({layer, kind, text}) => ({kind: "layer", filename: layer,
                    contentType: kind === "sfc" ? fluid.layerMimeTypes.sfc : fluid.layerMimeTypes.javascript, body: text}));
                // A layer the page already defines as given is not defined again, so that what renders it does not renew
                const defined = part => {
                    const existing = fluid.readLayer(part.filename).get();
                    return !fluid.isUnavailable(existing) && !fluid.isUnavailable(fluid.deSignal(existing.raw));
                };
                fluid.ptf.registerLayerParts(override ? parts.filter(part => !defined(part) ||
                    fluid.ptf.layerToPart(part.filename).body !== part.body) : parts, !!override);
                await fluid.cell.settle();
                return layers.length;
            },
            widgetFromPTF: async function ({text, source}) {
                const parts = fluid.ptf.decode(text);
                if (fluid.isUnavailable(parts)) {
                    throw new Error("The text holds no PTF document which can be read");
                }
                return fluid.blockEditor.widgetFromParts(parts, source);
            },
            bootEditor: async function (request) {
                return bridge.bootEditor(request);
            },
            widgetFromZip: async function ({content, source}) {
                return bridge.widgetFromZip(content, source);
            },
            widgetFromParts: async function ({parts, source}) {
                return fluid.blockEditor.widgetFromParts(parts, source);
            },
            fillSlot: async function ({slot, markdown}) {
                return fluid.blockEditor.fillSlotById(slot, markdown);
            },
            previewImages: async function ({images, worker}) {
                const count = bridge.previewImages(images);
                if (worker) {
                    await bridge.syncPreviewWorker(worker, images);
                }
                return count;
            },
            markLayer: async function (request) {
                return bridge.markLayer(request);
            }
        };

        // The `blob:` URLs standing for images the site does not yet publish, by the absolute URL of each
        bridge.previews = new Map();

        /**
         * Show images the site does not yet publish, e.g. dropped into the page, wherever an <img> of the page shows
         * one - as it renders, and as it renders afresh - from a `blob:` URL of its bytes
         * @param {Object[]} images - `{url, type, content}` for each - its absolute URL once published, its MIME type,
         * and its bytes as base64
         * @return {Number} The number of images now previewed
         */
        bridge.previewImages = function (images) {
            images.forEach(({url, type, content}) => {
                const previous = bridge.previews.get(url);
                // An image previewed already as given keeps its URL, which the page may be showing
                if (!previous || previous.content !== content) {
                    if (previous) {
                        URL.revokeObjectURL(previous.blobUrl);
                    }
                    const bytes = Uint8Array.from(atob(content), char => char.charCodeAt(0));
                    bridge.previews.set(url, {content, blobUrl: URL.createObjectURL(new Blob([bytes], {type: type || "application/octet-stream"}))});
                }
            });
            const substitute = root => (root.querySelectorAll ? [...root.querySelectorAll("img[src]"), ...root.matches?.("img[src]") ? [root] : []] : [])
                .forEach(img => {
                    const preview = bridge.previews.get(img.src);
                    if (preview) {
                        // The URL the source gives is kept, so that a serialiser reading the element writes it, not the preview
                        img.setAttribute("data-fluid-preview-of", img.getAttribute("src"));
                        img.src = preview.blobUrl;
                    }
                });
            if (!bridge.previewObserver) {
                bridge.previewObserver = new MutationObserver(mutations => mutations.forEach(mutation => {
                    if (mutation.type === "attributes") {
                        substitute(mutation.target);
                    } else {
                        mutation.addedNodes.forEach(substitute);
                    }
                }));
                bridge.previewObserver.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ["src"]});
            }
            substitute(document.body);
            return bridge.previews.size;
        };

        /**
         * Show the files held in the browser as if the site published them, to whatever loads them - a stylesheet's
         * `url()`, a `srcset`, a widget's `fetch` - by the site's service worker, wend's previewWorker.js, which answers
         * requests from the Cache written here. The Cache is made to hold exactly the files given, so that a file since
         * published, or discarded, is no longer answered from it
         * @param {String} worker - The absolute URL of the site's service worker, at the root of the site
         * @param {Object[]} files - `{url, type, content}` for each, as for `previewImages`
         * @return {Promise<Boolean>} `true` once the Cache holds the files and the worker controls the page, `false` if
         * the browser offers no service workers to the page
         */
        bridge.syncPreviewWorker = async function (worker, files) {
            let togo = false;
            if (navigator.serviceWorker && window.caches) {
                const scope = new URL("./", worker).href;
                await navigator.serviceWorker.register(worker, {scope});
                // Named as the worker names it - see cacheName in previewWorker.js
                const cache = await caches.open("wend-preview " + scope);
                const keep = new Set(files.map(file => file.url));
                for (const request of await cache.keys()) {
                    if (!keep.has(request.url)) {
                        await cache.delete(request);
                    }
                }
                for (const {url, type, content} of files) {
                    const bytes = Uint8Array.from(atob(content), char => char.charCodeAt(0));
                    await cache.put(url, new Response(bytes, {headers: {"Content-Type": type || "application/octet-stream",
                        "X-Wend-Held": String(Date.now())}}));
                }
                await navigator.serviceWorker.ready;
                togo = true;
            }
            return togo;
        };

        /**
         * Show the text of an SFC defining a layer of the page's framing, e.g. its footer, in place of the one
         * published - every component of the layer renders afresh from it. The page must be migrated first
         * @param {Object} request - The request
         * @param {String} request.layer - The layer the SFC defines, e.g. "beautifulWend.footer"
         * @param {String} request.text - The SFC's text
         * @return {Promise<Number>} The number of elements rendered by components of the layer
         */
        bridge.setLayerSource = async function ({layer, text}) {
            fluid.loadSFCText(layer, text);
            await fluid.cell.settle();
            return bridge.layerElements(layer).length;
        };

        /**
         * Bind the bar setting off the extension's panel, docked beside the page's <body>, as Infusion's fluid.resizeBar -
         * loaded from the site's own copy of Infusion, which publishes it for editing clients. The page must be migrated
         * @param {Object} request - The request
         * @param {String} request.bar - A selector for the bar's element
         * @param {String} request.panel - A selector for the panel's element
         * @return {Promise<Boolean>} Resolves `true` once the bar is bound
         */
        bridge.bindResizeBar = async function ({bar, panel}) {
            if (!bridge.resizeBar) {
                fluid.loadImportMap({"fluid.resizeBar": {path: bridge.frameworkRoot + "src/components/sfc/fluid-resizeBar.vue"}}, document);
                await fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.resizeBar", document));
                bridge.resizeBar = fluid.resizeBar({
                    before: document.body,
                    after: document.querySelector(panel),
                    minBefore: 320,
                    minAfter: 280,
                    view: {$component: {container: document.querySelector(bar), elideParent: true}}
                });
                await fluid.cell.settle();
            }
            return true;
        };

        /**
         * Show the text of the site's configuration, a patch of the members of the root of its component tree - each
         * member holding plain data is set on the root, so that whatever reads it renders afresh. The page must be
         * migrated first
         * @param {Object} request - The request
         * @param {String} request.text - The patch's text, as JSON
         * @return {Promise<String[]>} The members set
         */
        bridge.setPatch = async function ({text}) {
            const patch = JSON.parse(text);
            const site = await window.wendPageBoot.booted;
            const members = Object.keys(patch).filter(member => !Object.keys(patch[member] || {}).some(key => key.startsWith("$")));
            members.forEach(member => fluid.setForComponent(site, [member], patch[member]));
            await fluid.cell.settle();
            return members;
        };

        /**
         * Find the outermost elements rendered by components of a layer - those whose view's component, or whose own
         * component, bears it
         * @param {String} layer - The layer
         * @return {Element[]} The elements, in document order
         */
        bridge.layerElements = function (layer) {
            const ofLayer = element => {
                const shadow = fluid.viewContainerRegistry.get(element);
                return !!shadow && [shadow, shadow.parentShadow].some(one => one && one.that && fluid.hasLayer(one.that, layer));
            };
            const found = [...document.body.querySelectorAll("*")].filter(ofLayer);
            return found.filter(element => !found.some(other => other !== element && other.contains(element)));
        };

        /**
         * Mark the elements rendered by components of a layer with a claim's state and its label, or clear the mark -
         * as attributes alone, styled by the extension's CSS, so that no node is added amongst those the tree renders
         * @param {Object} request - The request
         * @param {String} request.layer - The layer
         * @param {String} request.path - The path of the source the claim edits
         * @param {String|null} request.state - The claim's state, or null to clear the mark
         * @param {String} [request.label] - The label to show
         * @return {Number} The number of elements marked
         */
        bridge.markLayer = function ({layer, path, state, label}) {
            document.querySelectorAll(`[data-fluid-framing="${CSS.escape(path)}"]`).forEach(element => {
                ["data-fluid-framing", "data-fluid-claim-state", "data-fluid-claim-label"].forEach(name => element.removeAttribute(name));
            });
            const elements = state ? bridge.layerElements(layer) : [];
            elements.forEach(element => {
                element.setAttribute("data-fluid-framing", path);
                element.setAttribute("data-fluid-claim-state", state);
                element.setAttribute("data-fluid-claim-label", label || state);
            });
            return elements.length;
        };

        // The shadows of the components rendering the page's blocks, once migrated
        bridge.blockShadows = [];

        /**
         * Make an element declaring modules or imports to Infusion
         * @param {Element} holder - The element to hold it
         * @param {String} tag - The element's tag, e.g. "fluid-module"
         * @param {Object<String, String>} attrs - Its attributes
         */
        bridge.declare = function (holder, tag, attrs) {
            const element = document.createElement(tag);
            Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
            holder.appendChild(element);
        };

        /**
         * Migrate the page's blocks in place into live components - item 13 of the plan. The page's whole component
         * tree is booted over it from its slice of the site's model, by the site's own pageBoot.js, unless the page
         * booted it itself, e.g. for a live island. The components rendering its blocks are then adapted, rather than
         * replaced: the editing root broadcasts fluid.withEditing onto their layers, so that their islands, e.g. a
         * shortcode's widget, which are their children, are left as they are
         * @param {Object} request - The request
         * @param {Object} request.migration - The provenance record's `migration` record, its URLs made absolute
         * @param {String} request.model - The absolute URL of the page's slice of the model
         * @param {Object[]} request.blocks - For each block, its `selector` and `layers`
         * @param {Boolean} request.blockEditor - Whether to load the block editor, for a page with blocks of its own
         * @param {String} request.renderer - The name of the global holding the site's markdown pipeline
         * @param {Object} [request.widgets] - The `widgets` of the page's provenance - `{dir, layers}`
         * @return {Promise<Number>} The number of blocks migrated
         */
        bridge.migrate = async function ({migration, model, blocks, blockEditor, renderer, widgets}) {
            if (!bridge.migrated) {
                bridge.frameworkRoot = migration.framework.root;
                bridge.migrated = (async function () {
                    if (!window.wendPageBoot || !window.wendPageBoot.booted) {
                        // A page holding an Infusion other than the one the site publishes can't host a second -
                        // Infusion's files may be evaluated only once in a page - and replacing it would break what the
                        // page does with it. Such a page is edited without migration - see edit.js
                        const present = new Set([...document.querySelectorAll("script[src]")].map(script => script.src));
                        if (typeof window.fluid !== "undefined" && !present.has(migration.framework.root + "src/framework/core/js/FluidCore.js")) {
                            throw new Error("hosts a copy of Infusion other than the one the site publishes");
                        }
                        // The page's own component tree renders the whole of it, so Infusion boots none of its elements
                        // alone - and the modules and imports it needs are declared before it loads, so that it acquires
                        // them as it boots, which it does once all of its files have loaded
                        document.documentElement.setAttribute("fluid-page-boot", "");
                        const holder = document.createElement("div");
                        holder.hidden = true;
                        holder.setAttribute("data-fluid-edit", "migration");
                        bridge.declare(holder, "fluid-module", {id: "infusion-6", src: migration.framework.root});
                        Object.entries(migration.modules).forEach(([id, src]) => bridge.declare(holder, "fluid-module", {id, src}));
                        migration.siteImports.forEach(src => bridge.declare(holder, "fluid-import", {src}));
                        document.body.appendChild(holder);
                        for (const file of migration.framework.files) {
                            const src = migration.framework.root + file;
                            if (!present.has(src)) {
                                await bridge.loadScript(src);
                            }
                        }
                        await bridge.loadScript(migration.pageBoot);
                        // The page's tree claims the whole of the page's markup by position as it first renders it, and
                        // would remove whatever else the page then holds - the extension's own, e.g. its editing panel,
                        // is taken out of the page meanwhile, and put back, where the tree will leave it alone
                        const ui = [...document.querySelectorAll("[data-fluid-edit-ui]")].map(node => ({node, parent: node.parentNode, next: node.nextSibling}));
                        // Marked meanwhile, so that edit.js does not restore them itself - see edit.keepAttached
                        document.documentElement.setAttribute("data-fluid-edit-booting", "");
                        ui.forEach(({node}) => node.remove());
                        await window.wendPageBoot.boot({model, migration});
                        document.documentElement.removeAttribute("data-fluid-edit-booting");
                        ui.forEach(({node, parent, next}) => parent.insertBefore(node, next && next.parentNode === parent ? next : null));
                    } else {
                        // The page is booting its own tree, e.g. for a live island, and may claim the markup the
                        // extension has inserted meanwhile, as when the editor reopens as the page loads - whatever of
                        // the extension's it removes is put back
                        const ui = [...document.querySelectorAll("[data-fluid-edit-ui]")].map(node => ({node, parent: node.parentNode, next: node.nextSibling}));
                        await window.wendPageBoot.booted;
                        ui.filter(({node}) => !node.isConnected).forEach(({node, parent, next}) =>
                            parent.insertBefore(node, next && next.parentNode === parent ? next : null));
                    }
                    await bridge.loadScript(bridge.editingFile("js/fluid-withEditing.js"));
                    // The block editor, with the serialiser it uses, from the site's copy of Infusion
                    if (blockEditor) {
                        await bridge.loadScript(bridge.editingFile("js/fluid-markdownSerializer.js"));
                        const text = await (await fetch(bridge.editingFile("sfc/fluid-blockEditor.vue"))).text();
                        // The widgets which may be inserted, from the page's provenance, read by the block editor as it loads
                        bridge.widgets = widgets || null;
                        fluid.loadSFCText("fluid.blockEditor", text);
                        await fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.blockEditor", document));
                    }
                    // A page with no source of its own, e.g. a list, has no blocks - only its framing may be edited
                    if (blocks.length > 0) {
                        const layers = [...new Set(blocks.flatMap(block => block.layers))];
                        bridge.renderer = renderer;
                        const outputLayers = blockEditor ? ["fluid.withEditing", "fluid.blockEditor"] : "fluid.withEditing";
                        bridge.editRoot = fluid.editRoot({withEditing: {$linkage: {inputLayers: layers, outputLayers}}});
                        await fluid.cell.settle();
                        // The components rendering the blocks - those registered as rendering the blocks' elements
                        bridge.blockShadows = blocks.flatMap(block => [...document.querySelectorAll(block.selector)])
                            .map(element => fluid.viewContainerRegistry.get(element)).filter(shadow => shadow);
                        if (bridge.blockShadows.length === 0) {
                            throw new Error("renders none of its blocks from its components");
                        }
                    }
                    return bridge.blockShadows.length;
                })();
            }
            return bridge.migrated;
        };

        document.addEventListener("fluid-edit-bridge-request", event => {
            const request = JSON.parse(event.detail);
            const op = bridge.ops[request.op];
            Promise.resolve().then(() => op ? op(request) : Promise.reject(new Error("Unknown request " + request.op))).then(
                result => ({id: request.id, result}),
                error => ({id: request.id, error: String(error && error.message || error)})
            ).then(reply => {
                document.dispatchEvent(new CustomEvent("fluid-edit-bridge-reply", {detail: JSON.stringify(reply)}));
            });
        });
    }
})();
