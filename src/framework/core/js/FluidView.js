/* global signal, computed, effect, untracked */

"use strict";

const fluidViewScope = function (fluid) {
    const $m = fluid.metadataSymbol;
    const $t = fluid.proxySymbol;

    /**
     * @typedef {Object} VNode
     * @property {String} [tag] - The tag name of the element (e.g., 'div', 'span').
     * @property {Object<String, String>} [attrs] - A key-value map of the element's attributes.
     * @property {Object<String, Boolean>} [class] - A map of strings to `true` determining whether a CSS class name is present on the node
     * @property {VNode[]} [children] - An array of child virtual nodes.
     * @property {String} [text] - The text content in the case this VNode represents a DOM TextNode.
     * @property {Shadow} [shadow] - The shadow for a component for which this vnode is the template root
     * @property {Number} [_id] - The id of this vnode
     *
     * @property {VNode|null} [parentNode] - For an active vTree (not a template) stores its parent node
     *
     * @property {signal<HTMLElement>|undefined} [elementSignal] - A signal that resolves to the corresponding DOM element.
     * @property {Function[]} [renderEffects] - An array of effects that manage updates to the corresponding DOM element
     */

    /**
     * Converts a single DOM Element node to a VNode
     *
     * @param {HTMLElement} element - The DOM element to convert.
     * @return {VNode} The virtual node representation of the element.
     */
    fluid.elementToVNode = function (element) {
        const tag = element.tagName.toLowerCase();
        const attrs = {};

        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            attrs[attr.name] = attr.value;
        }
        // Could also have members:
        // elementSignal/renderEffects
        return {tag, attrs};
    };

    fluid.svgTags = new Set([
        "svg", "circle", "ellipse", "line", "path", "polygon", "polyline",
        "rect", "g", "defs", "marker", "mask", "pattern", "symbol", "use",
        "view", "text", "tspan", "textPath", "filter", "feGaussianBlur",
        "feOffset", "feBlend", "feColorMatrix", "feComponentTransfer",
        "feComposite", "feFlood", "feImage", "feMerge", "feMorphology",
        "feTile", "feTurbulence", "clipPath", "foreignObject", "linearGradient",
        "radialGradient", "stop"
    ]);

    /**
     * Creates a DOM node from a virtual node (VNode), either a text node or an element node.
     *
     * @param {Document} dokkument - The document object used to create DOM nodes.
     * @param {VNode} vnode - The virtual node to convert into a DOM node.
     * @return {Node} - A newly created DOM node corresponding to the VNode.
     */
    fluid.nodeFromVNode = function (dokkument, vnode) {
        if (typeof(vnode) === "string") {
            return dokkument.createTextNode(vnode);
        } else if (vnode.text !== undefined) {
            return dokkument.createTextNode(fluid.isSignal(vnode.text) ? "" : vnode.text);
        } else {
            return fluid.svgTags.has(vnode.tag)
                ? dokkument.createElementNS("http://www.w3.org/2000/svg", vnode.tag)
                : dokkument.createElement(vnode.tag);
        }
    };

    /**
     * Checks whether a DOM node matches a given virtual node (VNode).
     *
     * @param {Node} node - The actual DOM node to compare.
     * @param {VNode} vnode - The virtual node to match against.
     * @return {Boolean} - `true` if the node matches the vnode, otherwise `false`.
     */
    fluid.matchNodeToVNode = function (node, vnode) {
        if (typeof(vnode) === "string" || vnode.text) {
            return node.nodeType === 3 /* Node.TEXT_NODE */;
        } else {
            return node.nodeType === 1 /* Node.ELEMENT_NODE */ && node.tagName.toLowerCase() === vnode.tag;
        }
    };

    /**
     * Create a live `Signal` that tracks elements matching a CSS selector within a DOM subtree.
     * The signal updates whenever matching elements are added or removed.
     * @param {String} selector - The CSS selector to match elements.
     * @param {Element|Document|null} [root=null] - The root element to observe; defaults to `document` if `null`.
     * @param {Document} [dokkument=document] - The document object to use for querying and observing.
     * @return {Signal<Array<Element>>} A signal containing the current list of matching elements.
     */
    fluid.liveQuerySelectorAll = function (selector, root = null, dokkument = document) {
        const togo = signal([]);
        const context = root || dokkument;

        const updateMatches = () => {
            const upcoming = Array.from(context.querySelectorAll(selector));
            if (!fluid.arrayEqual(togo.value, upcoming)) {
                togo.value = upcoming;
            }
        };
        const window = dokkument.defaultView;

        const observer = new window.MutationObserver(() => {
            // TODO: Could do better, I guess, by observing updates in a finegrained way but this is just fine for now
            updateMatches();
        });

        const init = () => {
            observer.observe(context, {
                childList: true,
                subtree: true
            });
            updateMatches();
        };
        // Despite widespread explanations to the contrary, MutationObserver will not register correctly before document is loaded
        fluid.applyOnLoad(init);

        // TODO: Go with our wierd "Effect" contract for now, need to make a general "disposable" contract
        togo.dispose = () => observer.disconnect();
        return togo;
    };

    /**
     * Create a computed `Signal` that tracks the first element matching a CSS selector within a DOM subtree.
     * If no element matches, the signal yields an "unavailable" placeholder.
     * @param {String} selector - The CSS selector to match a single element.
     * @param {Element|null} [root=null] - The root element to observe; defaults to `document` if `null`.
     * @param {Document} [dokkument=document] - The document object to use for querying and observing.
     * @return {Signal<Element|Object>} A signal containing the first matching element or an "unavailable" placeholder.
     */
    fluid.liveQuerySelector = function (selector, root = null, dokkument = document) {
        const noElement = fluid.unavailable({cause: "No element matches selector " + selector, variety: "I/O"});
        const query = fluid.liveQuerySelectorAll(selector, root, dokkument);
        const togo = computed( () => query.value.length === 0 ? noElement : query.value[0]);
        togo.dispose = query.dispose;
        return togo;
    };

    /**
     * Finds all child nodes of a given virtual or physical node that match a specified tag name.
     * For virtual nodes, this implementation only supports exact matches by tag name.
     *
     * @param {VNode|Element} node - The virtual or DOM node whose children are to be searched.
     * @param {String} selector - The tag name to match (case-insensitive).
     * @return {VNode[]} An array of child VNodes that match the specified tag name.
     */
    fluid.querySelectorAll = function (node, selector) {
        if (fluid.isDOMNode(node)) {
            const nodes = [...node.querySelectorAll(selector)];
            return nodes.map(node => fluid.domToVDom(node));
        } else {
            const results = [];
            if (node.children) {
                node.children.forEach(child => {
                    if (child.tag === selector) {
                        results.push(child);
                    }
                    results.push(...fluid.querySelectorAll(child, selector));
                });
            }
            return results;
        }
    };

    // Now unused - we use templateParser to parse
    /**
     * Converts a DOM tree into a virtual DOM representation.
     *
     * @param {Node} node - The root node of the DOM to convert.
     * @return {VNode|null} A virtual DOM representation of the tree, or null if the node type is not supported.
     */
    fluid.domToVDom = function (node) {
        if (node.nodeType === 3 /* Node.TEXT_NODE */) {
            const text = node.nodeValue;
            return text === "" ? null : {text};
        }
        if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
            const togo = fluid.elementToVNode(node);

            const children = [];
            for (let i = 0; i < node.childNodes.length; ++i) {
                const child = fluid.domToVDom(node.childNodes[i]);
                if (child !== null) {
                    children.push(child);
                }
            }
            togo.children = children;
            return togo;
        }
        return null; // Ignore other node types (comments, etc.)
    };

    fluid.importOneUrlResource = function (layerName, relPath) {
        return {
            url: fluid.importMap[layerName].urlBase + relPath,
            variety: "importUrlResource"
        };
    };

    fluid.importUrlResource = function (layerName, relPath) {
        return typeof(relPath) === "string" ? fluid.importOneUrlResource(layerName, relPath) :
            fluid.isArrayable(relPath) ? relPath.map(oneRelPath => fluid.importOneUrlResource(layerName, oneRelPath)) : null;
    };

    /**
     * Converts a virtual DOM node (VNode) into a real DOM node and applies its children.
     * This function creates the root DOM node from the given VNode and then recursively
     * patches its children to ensure the DOM structure matches the virtual DOM tree.
     * @param {Document} dokkument - The document object used to create DOM nodes.
     * @param {VNode} vnode - The virtual DOM node to convert into a real DOM node.
     * @return {Node} The root DOM node corresponding to the VNode.
     */
    fluid.vNodeToDom = function (dokkument, vnode) {
        const root = fluid.nodeFromVNode(dokkument, vnode);
        fluid.patchChildren(vnode, root);
        return root;
    };

    // TODO: see if we can make this read-only
    fluid.trueSignal = signal(true);

    /**
     * @typedef {Object} InjectionStyle
     * @property {Function} construct - A function that returns a virtual DOM node (VNode) representing the script element.
     * @property {Function} update - A function that updates the script element with the provided record.
     */

    fluid.cssInjectionStyles = {
        literal: {
            construct: () => ({
                tag: "style",
                attrs: {type: "text/css"},
                children: [{text: ""}]
            }),
            update: (node, rec, dokkument, absUrl) => {
                node.firstChild.nodeValue = rec.text + `\n/*# sourceURL=${absUrl}*/`;
                return fluid.trueSignal;
            }
        },
        link: {
            construct: () => ({
                tag: "link",
                attrs: {
                    rel: "stylesheet",
                    type: "text/css"
                }
            }),
            update: (node, rec, dokkument) => {
                const resolved = fluid.module.resolveRelativePath(dokkument.location, rec.url);
                node.setAttribute("href", resolved);
                return fluid.trueSignal;
            }
        }
    };

    fluid.scriptInjectionStyles = {
        literal: {
            construct: () => ({
                tag: "script",
                attrs: {type: "text/javascript"},
                children: [{text: ""}]
            }),
            update: (node, rec, dokkument, absUrl) => {
                node.firstChild.nodeValue = rec.text + `\n//# sourceURL=${absUrl}`;
                return fluid.trueSignal;
            },
            defer: true // A literal script block likely contains the layer definition so should be injected after dependents
        },
        link: {
            construct: () => ({
                tag: "script",
                attrs: {
                    async: "false",
                    type: "text/javascript"
                }
            }),
            update: (node, rec, dokkument) => {
                const resolved = fluid.module.resolveRelativePath(dokkument.location, rec.url);
                const togo = signal(fluid.unavailable(`Script at url ${resolved} is loading`, "I/O"));
                node.setAttribute("src", resolved);
                node.onload = () => togo.value = true;
                node.async = false;
                return togo;
            }
        }
    };

    fluid.diffFields = function (rec1, rec2, fields) {
        return fields.every(field => rec1[field] === rec2[field]);
    };

    /**
     * @typedef {Object} InjectRecord
     * @property {String} nodeId - The unique identifier for the DOM node to be injected.
     * @property {String} [url] - A resolved URL for the script or style source.
     * @property {String} [text] - The inline script or style content with a source map comment.
     * @property {String} variety - The type of injection, either "script" or "style".
     */

    fluid.clearInjRec = function (dokkument, nodeId) {
        dokkument.getElementById(nodeId)?.remove();
    };

    /**
     * Injects a SFC element (either a script or a style node) into the document's head.
     *
     * @param {Object}         params - The parameters for the injection.
     * @param {Document}       params.dokkument - The document object used to create and append the DOM node.
     * @param {InjectionStyle} params.injStyle - The injection style object containing methods to construct and update the DOM node.
     * @param {InjectRecord}   params.injRec - The record containing either the URL or inline content for the SFC.
     * @param {String}         params.url - The URL of the SFC, used for debugging and error reporting.
     * @return {Signal<Boolean>} - A signal which resolves to `true` once the injection has completed
     */
    fluid.doInjectSFCElement = function ({dokkument, injStyle, injRec, url}) {
        const absUrl = url; // fluid.toAbsoluteUrl(dokkument, url);
        const fresh = fluid.vNodeToDom(dokkument, injStyle.construct());
        fresh.id = injRec.nodeId;
        const togo = injStyle.update(fresh, injRec, dokkument, absUrl);
        try {
            dokkument.head.appendChild(fresh);
        } catch (e) {
            fluid.fail(`Syntax error in SFC injection at url ${url}: ${e.message}`, e);
        }
        return togo;
    };

    /**
     * Resolves a given URL to an absolute URL. If the URL already has a protocol, it is returned as is.
     * Otherwise, it is resolved relative to the current document's location, taking into account relative paths.
     *
     * @param {Document} dokkument - The document relative to which to compute paths.
     * @param {String} url - The URL to resolve.
     * @return {String} The absolute URL.
     */
    fluid.toAbsoluteUrl = (dokkument, url) => /^\w+:\/\//.test(url) ? url : new URL(url, dokkument.location.href).href;

    /**
     * @typedef {Object} DocInjectionRecord
     * @property {Document} dokkument - The document object used for injection.
     * @property {InjectionStyle} injStyle - The injection style object - a member of fluid.xxxxInjectionStyles
     * @property {InjectRecord} injRec - The injection record for the SFC element.
     * @property {String} url - The URL of the SFC, used for debugging and error reporting.
     */

    /**
     * Decode injection records for injecting a Single File Component (SFC) element into the document's head or updates an existing one.
     * Returns a payload suitable for sending to fluid.doInjectSFCElement.
     *
     * This function determines whether an SFC element should be injected or updated based on the provided
     * injection record (`injRec`). If the element already exists and its content matches the new record,
     * no action is taken. Otherwise, the existing element is cleared, and a new one is created and injected.
     *
     * @param {Document} dokkument - The document object used to create and append the DOM node.
     * @param {InjectRecord} injRec - The record containing either the URL or inline content for the SFC.
     * @param {String} url - The URL of the overall SFC, used for debugging and error reporting.
     * @param {Object<String, InjectRecord>} oldInjRecs - A map of existing injection records, keyed by node ID.
     * @param {Object<String, InjectionStyle>} injStyles - A map of injection styles, keyed by "literal" or "link".
     * @return {DocInjectionRecord|null} - A DocInjectionRecord payload for injection, or `null` if no update is needed.
     */
    fluid.decodeInjectSFCElement = function (dokkument, injRec, url, oldInjRecs, injStyles) {
        const nodeId = injRec.nodeId;
        const diffFields = ["url", "text"];

        const existing = oldInjRecs[nodeId];
        const shouldInject = !existing || !fluid.diffFields(existing, injRec, diffFields);

        if (shouldInject) {
            if (existing) {
                fluid.clearInjRec(nodeId);
            }
            const injStyleKey = injRec.text ? "literal" : "link";
            const injStyle = injStyles[injStyleKey];
            return {dokkument, injStyle, injRec, url};
        } else {
            return null;
        }
    };

    /**
     * Determines whether a given path is absolute.
     *
     * Strategy: Matches paths that either start with a forward slash (Unix-style absolute paths)
     * or begin with a lowercase URI scheme followed by "://".
     *
     * @param {String} path - The path to evaluate.
     * @return {Boolean} True if the path begins with "/" or matches a URI scheme, otherwise false.
     */
    fluid.isAbsolutePath = function (path) {
        return /^(?:\/|[a-z]+:\/\/)/.test(path);
    };

    /**
     * Removes a trailing slash from the end of a path string, if present.
     *
     * @param {String} path - The input path string to process.
     * @return {String} The path string without a trailing slash, or the original path if no trailing slash is present.
     */
    fluid.deSlash = function (path) {
        return path.endsWith("/") ? path.slice(0, -1) : path;
    };

    // TODO: Destroying the nodes should also deregister the module - global Giladism
    /**
     * Acquires all `<fluid-module>` elements within the given DOM root and populates the fluid module registry.
     * Each `<fluid-module>` element must have an `id` and a `src` attribute. The `src` is normalized to ensure it does not end with a "/".
     *
     * @param {Document} dokkument - The document for/from which the module should be registered
     * @param {VNode|Element} root - The root DOM element to search for `<fluid-module>` elements.
     * @return {Object<String, Object>} An array of objects representing the acquired `<fluid-module>` nodes.
     */
    fluid.acquireModules = function (dokkument, root) {
        const moduleNodes = fluid.querySelectorAll(root, "fluid-module");
        const entries = moduleNodes.map(node => {
            const id = node.attrs.id;
            const rawSrc = node.attrs.src;
            const origSrc = fluid.deSlash(rawSrc);
            const abs = fluid.isAbsolutePath(origSrc);
            const src = abs ? origSrc : fluid.deSlash(new URL(origSrc, dokkument.location.href).href);
            fluid.module.register(id, src, origSrc, abs);
            return [id, {node, path: src}];
        });
        return Object.fromEntries(entries);
    };

    /**
     * Extracts the layer name from a given file path.
     *
     * This function matches the last segment of the file path (excluding the file extension),
     * replaces any hyphens (`-`) with dots (`.`), and returns the resulting string.
     *
     * @param {String} path - The file path to extract the layer name from.
     * @return {String} The extracted layer name with hyphens replaced by dots, or an empty string if no match is found.
     */
    fluid.pathToLayerName = function (path) {
        const match = path.match(/\/([^/]+)\.[^/.]+$/);
        return match ? match[1].replace(/-/g, ".") : "";
    };

    /**
     * Acquires all `<fluid-import>` elements within the given DOM root and registers them in the `fluid.importMap`.
     * Each `<fluid-import>` element must have a `layer` and a `src` attribute. The `src` is resolved to an absolute URL.
     * The function also initiates the loading of the Single File Component (SFC) for each import.
     *
     * @param {Document} dokkument - The document object into which any injection directives will be injected
     * @param {VNode|Element} root - The root element to search for `<fluid-import>` elements.
     * @return {Array<Object>} An array of objects representing the acquired `<fluid-import>` nodes, including their layer names and URLs.
     */
    fluid.docToImportMap = function (dokkument, root) {
        const importMap = {};
        const importNodes = fluid.querySelectorAll(root, "fluid-import");
        importNodes.forEach(node => {
            const path = node.attrs.src;
            const layerName = node.attrs.layer || fluid.pathToLayerName(path);
            if (!layerName) {
                // TODO: Feed this back to any UI editing the document
                fluid.log(fluid.logLevel.FAIL, "Error in document structure: couldn't determine layer name from import ", node);
            } else {
                importMap[layerName] = {path, node};
            }
        });
        fluid.loadImportMap(importMap);

        // We can do this early in case the imports are found in a doc, otherwise it will happen when the layer
        // is demanded - in time this should be removed
        Object.keys(importMap).forEach(layerName => fluid.subscribeDocToInjections(layerName, dokkument));

        return importMap;
    };

    /**
     * Removes a specific element from an array, if it exists.
     * This function searches for the element in the array, and if found,
     * removes it by modifying the array in place.
     *
     * @param {Array} [array] - The array from which the element should be removed.
     * @param {any} element - The element to remove from the array.
     */
    fluid.removeArrayElement = function (array, element) {
        if (array) {
            const index = array.indexOf(element);
            if (index !== -1) {
                array.splice(index, 1);
            }
        }
    };

    // Currently only called from activateTemplate
    // acquireModules and acquireImports called separately from root document onload
    /**
     * Processes and removes all `<fluid-url-base>` and `<fluid-import>` directive nodes from the given root.
     * This function ensures that these directive nodes are not rendered in the final DOM output, if the root was a template
     * @param {Document} dokkument - The document object into which any injection directives will be injected
     * @param {VNode} root - The template element to process.
     */
    fluid.acquireLoadDirectives = function (dokkument, root) {
        // Remove directive nodes from template since no use in them rendering
        const removeAll = recs => fluid.each(recs, rec => fluid.removeArrayElement(rec.node.parentNode, rec.node));
        removeAll(fluid.acquireModules(dokkument, root));
        removeAll(fluid.docToImportMap(dokkument, root));
    };

    /**
     * Represents the result of parsing a single `<script>` node in an SFC.
     *
     * - If the script node has a `src` attribute, only the `src` string is recorded.
     * - Otherwise, the inline script is parsed to extract a `DefMap` and its original text.
     *
     * @typedef {Object} ScriptNodeInfo
     * @property {String} [url] - The source URL if the script uses `src`.
     * @property {DefMap} [defMaps] - The parsed defMap for inline script content.
     * @property {String} [text] - The original text of the inline script.
     */

    /**
     * Parses a list of SFC `<script>` nodes (`VNode[]`) and returns structural metadata for each script.
     *
     * Each node is analyzed as follows:
     * - If it contains a `src` attribute, a record is returned with only the `src`.
     * - Otherwise, the inline text is parsed using `fluid.parseDefMaps`, producing a `DefMap` and returning
     *   both the map and the original text.
     *
     * @param {VNode[]} scriptNodes - An array of virtual DOM nodes representing `<script>` elements.
     * @return {ScriptNodeInfo[]} - A list of metadata records for each script node.
     */
    fluid.parseSFCScripts = function (scriptNodes) {
        const defMapList = scriptNodes.map((scriptNode) => {
            const src = scriptNode.attrs?.src;
            if (src) {
                return {url: src};
            } else {
                const text = scriptNode.children[0]?.text;
                const defMaps = fluid.parseDefMaps(text, 0);
                return {defMaps, text};
            }
        });
        return defMapList;
    };

    /**
     * Metadata describing where a given layer definition appears within a script.
     *
     * @typedef {Object} LayerDefLocation
     * @property {Integer} scriptIndex - Index of the script in the original `defMapList`.
     * @property {Integer} from - Start offset of the definition in the source text.
     * @property {Integer} to - End offset of the definition in the source text.
     */

    /**
     * An index mapping layer (definition) names to their source locations across multiple scripts.
     *
     * @typedef {Object.<String, LayerDefLocation>} LayerDefIndex
     */

    /**
     * Builds an index of all top-level layer (definition) names from a list of parsed script records.
     *
     * This function iterates through each entry in the `defMapList` (typically the result of `fluid.parseSFCScripts`),
     * skipping any entries that are external `src` strings. For inline scripts, it extracts the top-level
     * keys in each `defMaps` object and records their character range along with the index of the script.
     *
     * The resulting index allows efficient lookup of where a given layer is defined within the full set of scripts.
     *
     * @param {ScriptNodeInfo[]} defMapList - A list of parsed script records (inline or external).
     * @return {LayerDefIndex} - A map from layer names to their locations within the source scripts.
     */
    fluid.indexLayerDefs = function (defMapList) {
        const layerDefIndex = {};
        defMapList.forEach( (rec, index) => {
            if (typeof(rec) !== "string") {
                const {defMaps} = rec;
                fluid.each(defMaps, (range, layerName) => {
                    layerDefIndex[layerName] = {scriptIndex: index, ...range};
                });
            }
        });
        return layerDefIndex;
    };

    /**
     * Processes a virtual DOM tree (vTree) to extract and prepare injection records for scripts and styles.
     * This function validates the presence of required script nodes, parses their definitions, and updates
     * the layer definition with appropriate metadata. It also handles template blocks and style nodes.
     *
     * @param {VNode} vTree - The virtual DOM tree representing the Single File Component (SFC).
     * @param {String} layerName - The name of the layer associated with the SFC.
     * @return {Object<String, InjectRecord>} A map of injection records keyed by node ID, or `undefined` if an error occurs.
     */
    fluid.sfcToInjRecs = function (vTree, layerName) {
        const reject = message => {
            const unavailable = fluid.unavailable(message);
            fluid.def(layerName, unavailable);
        };

        const injRecs = {};
        const scriptNodes = fluid.querySelectorAll(vTree, "script");
        if (scriptNodes.length === 0) {
            reject(`Error in SFC: Expected definition for layer ${layerName} but no script node was found`);
        } else {
            /** @type {ScriptNodeInfo[]} */
            const defMapList = fluid.parseSFCScripts(scriptNodes);
            /** @type {LayerDefIndex} */
            const layerDefIndex = fluid.indexLayerDefs(defMapList);
            if (!layerDefIndex[layerName]) {
                reject(`Error in SFC: Expected definition for layer ${layerName} but found ${Object.keys(layerDefIndex).join(", ")} instead`);
            } else {
                /** @type {LayerDefLocation} */
                const ourDef = layerDefIndex[layerName];
                /** @type {ScriptNodeInfo} */
                const ourSNI = defMapList[ourDef.scriptIndex];
                const oldLayers = fluid.defFromMap(ourSNI.text, ourSNI.defMaps, layerName, "$layers");

                const partial = oldLayers && oldLayers.includes("fluid.partialViewComponent");

                let patchedText = ourSNI.text;

                /** @type {VNode} */
                const docTemplate = fluid.querySelectorAll(vTree, "template")[0];

                let addLayers = ["fluid.templateViewComponent"];

                // If a <template> block is present, store it in the template registry and add a definition to resolve it
                if (docTemplate) {
                    addLayers = ["fluid.sfcTemplateViewComponent"];
                    if (partial) {
                        const relativeContainer = fluid.defFromMap(ourSNI.text, ourSNI.defMaps, layerName, "relativeContainer");
                        if (!relativeContainer) {
                            reject(`Error in SFC for ${layerName}: Didn't find relativeContainer property for partial component`);
                        }
                        const ptl = {
                            [layerName]: {
                                relativeContainer
                            }
                        };
                        patchedText = fluid.patchDefMap(patchedText, ourDef, "partialTemplateLayers", ptl, "last");
                    } else {
                        patchedText = fluid.patchDefMap(patchedText, ourDef, "templateLayer", layerName, "last");
                    }
                    fluid.writeParsedTemplate(layerName, docTemplate);
                }

                // If no $layers was written in the definition, add one that will correctly resolve its template
                if (!oldLayers) {
                    patchedText = fluid.patchDefMap(patchedText, ourDef, "$layers", addLayers, "first");
                }
                ourSNI.text = patchedText;


                defMapList.forEach((sni, index) => {
                    const nodeId = `fl-script-${layerName}-${index}`;
                    const injRec = sni.url ?
                        {url: sni.url} :
                        // TODO: Should wrap script in closure so it doesn't pollute global namespace
                        {text: sni.text};
                    injRec.defMaps = sni.defMaps;
                    injRec.nodeId = nodeId;
                    injRec.variety = "script";
                    injRecs[nodeId] = injRec;
                });

                const styleNodes = fluid.querySelectorAll(vTree, "style");
                styleNodes.forEach((styleNode, index) => {
                    const nodeId = `fl-style-${layerName}-${index}`;
                    const src = styleNode.attrs?.src;
                    const injRec = src ?
                        {url: src} :
                        {text: styleNode.children[0]?.text};
                    injRec.nodeId = nodeId;
                    injRec.variety = "style";
                    injRecs[nodeId] = injRec;
                });
            }
        }
        return injRecs;
    };

    /**
     * Parses a Single File Component (SFC) from a given text signal and processes its content.
     * This function extracts the template, scripts, and styles from the SFC, evaluates the script
     * definitions, and constructs a component definition object. It also handles any trailing scripts
     * and injects them into the DOM with a source URL for debugging.
     *
     * @param {Object} rec - Record holding the SFC definition
     * @param {String} layerName - The name of the layer associated with the SFC.
     * @return {Effect<Object>} An effect that applies the parsed definition, including the template, CSS, and scripts.
     */
    fluid.parseSFC = function (rec, layerName) {
        let oldText;

        return fluid.effect(text => {
            if (text === oldText) {
                console.log("Culling SFC injection effect since text has not changed");
                return;
            }
            console.log("**** Beginning to parse SFC for layer ", layerName);
            oldText = text;
            const vTree = fluid.parseHTMLToTree(text);
            rec.injRecsSignal.value = fluid.sfcToInjRecs(vTree, layerName);
            rec.loadCompletion.value = true;

        }, [rec.textSignal]);
    };

    /**
     * @typedef {Object} SFCRecord
     * @property {Signal} textSignal - A signal containing the SFC's text content or an "unavailable" placeholder.
     * @property {Signal} injRecsSignal - A signal containing the injection records for the SFC.
     * @property {Map<Document, Effect>} docInjectEffects - A map of document-specific injection effects.
     */

    /** @type {Object<String, SFCRecord>} */
    fluid.sfcStore = Object.create(null);

    /** @type {Object<String, Signal<VNode>>} */
    fluid.templateStore = Object.create(null);

    /**
     * @typedef {Object} DocLayerInjectionRec
     * @property {Signal<Boolean>} injectionsComplete - A signal with an available value if no injections are pending
     * @property {Signal<Array>} injRecsSignal - A signal holding an array of all pending injection actions
     */

    /** @type {Map<Document, DocLayerInjectionRec>} */
    fluid.documentInjections = new Map();

    fluid.noteLayerInjectionInProgress = function (injDone) {
        const existing = fluid.documentInjections.get(injDone.dokkument);
        if (existing) {
            const existingRecs = [...existing.injRecsSignal.peek()];
            const existingLayerIndex = existingRecs.findIndex(rec => rec.layerName === injDone.layerName);
            if (existingLayerIndex !== -1) {
                existingRecs[existingLayerIndex] = injDone;
            } else {
                existingRecs.push(injDone);
            }
            existing.injRecsSignal.value = existingRecs;
        } else {
            /** @type {DocLayerInjectionRec} **/
            const rec = {
                injRecsSignal: signal([])
            };
            rec.injectionsComplete = computed( () => fluid.signalsToAvailable(rec.injRecsSignal.value).value);
            fluid.documentInjections.set(injDone.dokkument, rec);
        }
    };

    fluid.fetchParsedTemplate = function (layerName) {
        // TODO: fall back to the layer's templateTree if it is not in the store
        return fluid.templateStore[layerName].value;
    };

    /**
     * Stores a parsed template in the template store for a given layer name.
     * @param {String} layerName - The name of the layer to associate with the template.
     * @param {VNode} template - The parsed template to store.
     */
    fluid.writeParsedTemplate = function (layerName, template) {
        const existing = fluid.templateStore[layerName];
        if (existing) {
            existing.value = template;
        } else {
            fluid.templateStore[layerName] = signal(template);
        }
    };

    /**
     * Retrieve a layer by its name from the layer store.
     * If the layer does not exist, returns an "unavailable" marker with an appropriate message and path.
     *
     * @param {String} layerName - The name of the layer to retrieve.
     * @return {SFCRecord} Record for the SFC layer
     */
    fluid.readSFC = function (layerName) {
        const rec = fluid.sfcStore[layerName];
        if (rec) {
            return rec;
        } else {
            const unavailable = fluid.unavailable(`SFC for ${layerName} is not available`);
            return fluid.sfcStore[layerName] = {
                textSignal: signal(unavailable),
                injRecsSignal: signal(unavailable),
                /** @type {Map<Document, Effect>} **/
                docInjectEffects: new Map()
            };
        }
    };

    /**
     * @typedef {SFCRecord} LoadingSFCRecord
     * @property {String} url - The URL from which the SFC is loading
     * @property {Signal<String>} fetchSignal - A signal containing the fetched SFC content from the URL.
     * @property {Effect} parseEffect - An effect that registers the SFC's definition when the text signal updates.
     * @property {Effect} fetchEffect - An effect that updates the text signal with the fetched content.
     */

    /**
     * Ensure that a Single File Component (SFC) is loaded from a given URL. If it is not already loading, the load
     * effect will be initialised
     *
     * @param {String} layerName - The name of the layer associated with the SFC.
     * @param {String} url - The URL from which to fetch the SFC content.
     * @return {LoadingSFCRecord} The record tracking the SFC's load effects
     */
    fluid.loadSFC = function (layerName, url) {
        console.log("loadSFC for ", layerName);
        const rec = fluid.readSFC(layerName);
        if (!rec.parseEffect) {
            rec.loadCompletion = signal(fluid.unavailable(`SFC for ${layerName} is loading`, "I/O"));
            rec.url = url;
            // TODO: Currently starts fetch immediately but in future will be initiated by fluid.ensureImportsLoaded
            rec.fetchSignal = fluid.fetchText(url);
            rec.fetchEffect = effect(() => rec.textSignal.value = rec.fetchSignal.value);
            rec.parseEffect = fluid.parseSFC(rec, layerName);
        }
        return rec;
    };

    /**
     * Bind injections from the specified SFC layer to the supplied document.
     * @param {String} layerName - The name of the layer for which injections are to be bound
     * @param {Document} dokkument - The document object into which any injection directives will be injected
     * @return {Signal<Boolean>} - A signal which resolves to `true` when injections are resolved
     */
    /**
     * Bind injections from the specified SFC layer to the supplied document.
     * @param {String} layerName - The name of the layer for which injections are to be bound
     * @param {Document} dokkument - The document object into which any injection directives will be injected
     * @return {Signal<Boolean>} - A signal which resolves to `true` when injections are resolved
     */
    fluid.subscribeDocToInjections = function (layerName, dokkument) {
        const rec = fluid.readSFC(layerName);
        // TODO: One day clear these out
        let docEffect = rec.docInjectEffects.get(dokkument);
        if (!docEffect) {
            /** @type {Object<String, InjectRecord>} **/
            let oldInjRecs = {};
            const injDone = signal(fluid.unavailable("Injection in progress"));
            injDone.layerName = layerName;
            injDone.dokkument = dokkument;
            const newDocEffect = fluid.effect(async function docInjectEffect(injRecs) {
                const defBuffer = Object.create(null);
                fluid.startCaptureBufferDefs(defBuffer);
                try {
                    /** @type {DocInjectionRecord[]} */
                    const docInjRecs = Object.values(injRecs).map(injRec =>
                        fluid.decodeInjectSFCElement(dokkument, injRec, rec.url, oldInjRecs,
                            injRec.variety === "script" ? fluid.scriptInjectionStyles : fluid.cssInjectionStyles)
                    ).filter(injRec => injRec);
                    const injsDone = docInjRecs.map(docInjRec => fluid.doInjectSFCElement(docInjRec));
                    // Do this now because the await is going to pitch us onto a different one of our stack frames.
                    fluid.endCaptureBufferDefs();
                    const injsDoneSignal = fluid.signalsToAvailable(injsDone);
                    const res = fluid.signalToPromise(injsDoneSignal);
                    await res;
                    console.log(`Await for ${layerName} is done`);
                } finally {
                    console.log(`Finally for ${layerName} is starting`);
                    // Don't actually register layers until all the rest of the code has executed
                    fluid.writeBufferDefs(defBuffer);
                    injDone.value = true;
                }

                Object.keys(oldInjRecs).forEach(nodeId => {
                    const newRec = injRecs[nodeId];
                    if (!newRec) {
                        fluid.clearInjRec(nodeId);
                    }
                });
                oldInjRecs = injRecs;
            }, [rec.injRecsSignal]);
            newDocEffect.injDone = injDone;
            rec.docInjectEffects.set(dokkument, newDocEffect);
            fluid.noteLayerInjectionInProgress(injDone);
            docEffect = newDocEffect;
        }
        return docEffect.injDone;
    };

    // TODO: need equivalent for server-style injections where there is no document - this would use "require" or "import".
    // Also: In future this will be the point that fluid.layerLoaders is actually triggered
    /**
     * Ensures that the specified layers are loaded and their imports are bound to the document.
     * @param {Shadow} shadow - The shadow object representing the component context.
     * @param {String[]} layerNames - An array of layer names to check and load imports for.
     * @return {Signal<true>} A signal which resolves when imports are done
     */
    fluid.ensureImportsLoaded = function (shadow, layerNames) {
        const theOne = layerNames.includes("fluid.fullPageEditor") || layerNames.includes("fluid.editor");
        const dokkument = fluid.findDocument(shadow, theOne);
        const injections = layerNames.map(layerName => {
            const importRec = fluid.importMap[layerName];
            if (importRec) {
                return fluid.subscribeDocToInjections(layerName, dokkument);
            }
        });
        // TODO: Return currently ignored - we react to injections through effects on layer store
        return fluid.signalsToAvailable(injections);

    };

    /**
     * Inserts a new element into the DOM based on the provided template, ensuring no duplicate
     * element with the same `data-fl-key` exists within the parent node. If a duplicate is found,
     * the existing element is returned instead of inserting a new one. It's assumed that reconciliation of the
     * remainder of the template will be done later via fluid.patchChildren or similar.
     *
     * The function supports four strategies for insertion:
     * - `first`: Inserts the new element as the first child of the parent node.
     * - `last`: Appends the new element as the last child of the parent node.
     * - `before`: Inserts the new element before the reference node.
     * - `after`: Inserts the new element after the reference node.
     *
     * @param {String} strategy - The insertion strategy, either "first", "last", "before", or "after".
     * @param {String} key - A unique key to identify the element. If a child with the same key exists, it will be reused.
     * @param {VNode} templateTree - A template string of HTML from which the root tag will be extracted.
     * @param {Element} parentNode - The parent DOM node in which to insert the new node.
     * @param {Element} [referenceNode] - The node relative to which the new node will be inserted (used with "before" and "after").
     * @return {Element} The newly created or existing DOM element.
     */
    fluid.insertChildContainer = function (strategy, key, templateTree, parentNode, referenceNode) {
        const tagName = templateTree.children[0].tag;

        if (!tagName) {
            return fluid.unavailable({cause: `Invalid template: Unable to determine tag name from ${templateTree.children[0]}`});
        }

        if (key) {
            const child = [...parentNode.children].find(child => child.getAttribute("data-fl-transient-key") === key);
            if (child) {
                return child;
            }
        }
        const dokkument = parentNode.ownerDocument;
        const newNode = dokkument.createElement(tagName);
        if (strategy === "first") {
            parentNode.insertBefore(newNode, parentNode.firstChild);
        } else if (strategy === "last") {
            parentNode.appendChild(newNode);
        } else if (strategy === "before") {
            parentNode.insertBefore(newNode, referenceNode);
        } else if (strategy === "after") {
            parentNode.insertBefore(newNode, referenceNode.nextSibling);
        }
        newNode.setAttribute("data-fl-transient-key", key);
        return newNode;
    };

    /**
     * A registry that maps container elements to their associated component instances.
     * This is used to track which component is responsible for rendering a specific container.
     *
     * @type {WeakMap<Element, Shadow>}
     */
    fluid.viewContainerRegistry = new WeakMap();

    fluid.noteViewContainerRegistry = function (element, shadow) {
        const existing = fluid.viewContainerRegistry.get(element);
        if (!existing || existing.path.length < shadow.path.length) {
            fluid.viewContainerRegistry.set(element, shadow);
        }
    };

    fluid.shadowForElement = element => {
        const shadow = fluid.viewContainerRegistry.get(element);
        return shadow && !/^fullPageEditor-\d+\.inspectOverlay$/.test(shadow.path) ? shadow : null;
    };

    fluid.shadowForElementParent = element => {
        while (element) {
            const shadow = fluid.shadowForElement(element);
            if (shadow) {
                return {shadow, container: element};
            }
            element = element.parentElement;
        }
    };


    fluid.unavailableElement = fluid.unavailable("DOM element not available");

    fluid.allocateVNodeEffect = function (vnode, effectMaker) {
        vnode.elementSignal ||= signal(fluid.unavailableElement);
        const renderEffect = effectMaker(vnode);

        fluid.pushArray(vnode, "renderEffects", renderEffect);
        return renderEffect;
    };

    /**
     * @callback DomApplyFunction
     * @param {HTMLElement} element - The DOM element to which the function applies changes.
     * @param {String|Number|Boolean} value - The rendered content to be applied.
     */

    /**
     * Binds a rendered signal or static value to a virtual DOM node and applies a function when the DOM element is available.
     *
     * @param {Effect[]} templateEffects - An array of effects to contribute any allocated effects to
     * @param {VNode} vnode - The virtual DOM node to bind to.
     * @param {Signal|String|Number|Boolean} rendered - A signal or static value representing the rendered content.
     * @param {DomApplyFunction} applyFunc - A function that applies the rendered content to the actual DOM element.
     */
    fluid.bindDomTokens = function (templateEffects, vnode, rendered, applyFunc) {
        if (fluid.isSignal(rendered)) {
            const bindEffect = fluid.allocateVNodeEffect(vnode, vnode => {
                const togo = fluid.effect( function (element, text) {
                    if (!fluid.isUnavailable(element)) {
                        if (fluid.isUnavailable(text)) {
                            fluid.renderError(element, text);
                        } else {
                            applyFunc(element, text);
                        }
                    }
                }, [vnode.elementSignal, rendered], {free: true});
                togo.$variety = "bindDomTokens";
                togo.$vnode = vnode;
                return togo;
            });
            templateEffects.push(bindEffect);
        }
    };

    fluid.bindContainer = function (templateEffects, vnode, self) {
        const bindEffect = fluid.allocateVNodeEffect(vnode, vnode => {
            const togo = fluid.effect(function (element) {
                fluid.noteViewContainerRegistry(element, self[$m]);
            }, [vnode.elementSignal]);
            togo.$variety = "bindContainer";
            togo.$vnode = vnode;
            return togo;
        });
        templateEffects.push(bindEffect);
        self.renderedContainer = vnode.elementSignal;
        self[$m].layerMap.renderedContainer.source = "fluid.viewComponent";
    };

    fluid.removeDomListeners = function (vTreeRec) {
        vTreeRec.forEach(({el, event, rawHandler, modifiers, vnodeId}) => {
            el.removeEventListener(event, rawHandler, modifiers);
            // console.log(`Removed handler to ${event} for vnode ${vnodeId} for DOM element ${el.flDomId} `, el);
            if (vnodeId && el.flEventsBound) {
                delete el.flEventsBound[vnodeId];
            }
        });
    };

    fluid.allocateEventBindingEffect = function (templateEffects, vnode) {
        const bindEffect = fluid.allocateVNodeEffect(vnode, vnode => {
            const vTreeRec = [];
            const togo = fluid.effect(function (element) {
                fluid.applyOns(vnode, vnode.shadow, element, vnode.on, vTreeRec);
                return () => fluid.removeDomListeners(vTreeRec);
            }, [vnode.elementSignal]);
            togo.$variety = "bindEvents";
            togo.$vnode = vnode;
            togo.vTreeRec = vTreeRec;
            return togo;
        });
        templateEffects.push(bindEffect);
    };

    /**
     * Return a function that conditionally negates its input based on the given flag.
     * @param {Boolean} negate - If `true`, returns a function that negates its input; otherwise, returns fluid.identity
     * @return {Function} A function that optionally negates its input.
     */
    fluid.liftNegate = negate => negate ? x => !x : fluid.identity;

    /**
     * Apply a transformation function to the value of a `Signal`, producing a new computed `Signal`. If the function is
     * `fluid.identity` the original signal is returned.
     * @param {Signal<any>} sig - The input signal to transform.
     * @param {Function} func - The transformation function to apply to the signal's value.
     * @return {Signal<any>} A computed signal reflecting the transformed value.
     */
    fluid.mapSignal = (sig, func) => func === fluid.identity ? sig : fluid.computed( value => func(value), [sig]);

    fluid.filterObjKeys = (obj, func) => Object.fromEntries(Object.entries(obj).filter(([key]) => func(key)));

    /**
     * Processes an attribute directive found on a virtual node.
     *
     * @param {VNode} vnode - The virtual node to which the attribute belongs.
     * @param {String} value - The attribute value, holding a directive through beginning with "v-"
     * @param {String} key - The name of the attribute.
     * @param {Shadow} shadow - The shadow for the component in whose context the attribute is processed.
     * @param {Effect[]} templateEffects - An array of effects to contribute any allocated effects to
     */
    fluid.processVNodeAttribute = function (vnode, value, key, shadow, templateEffects) {
        const firstChar = key.charCodeAt(0);
        if (firstChar === 64) { // @
            if (key.startsWith("@on")) {
                fluid.pushArray(vnode, "on", {onKey: key.slice(3).toLowerCase(), onValue: value});
                fluid.allocateEventBindingEffect(templateEffects, vnode);
            } else if (key === "@class") {
                const parts = value.split(",").map(part => part.trim());
                const clazz = Object.fromEntries(parts.map(part => {
                    const [key, ref] = part.split(":");
                    const negate = ref.startsWith("!");
                    const effRef = negate ? ref.substring(1) : ref;
                    const tokens = fluid.parseAtStringTemplate(effRef);
                    const rendered = fluid.renderComputedStringTemplate(tokens, shadow);
                    const negMap = fluid.liftNegate(negate);
                    // Unwrap the primitive token so it is more principled to check for falsy during compositeTemplate
                    const renderedPrim = fluid.isSignal(rendered) ? fluid.mapSignal(rendered.$tokens[0], negMap) : negMap(rendered);
                    return [key, renderedPrim];
                }));
                vnode["class"] = clazz;
            }
            delete vnode.attrs[key];
        } else if (key !== "class") {
            const tokens = fluid.parseAtStringTemplate(value);
            const rendered = fluid.renderComputedStringTemplate(tokens, shadow);
            if (fluid.isSignal(rendered)) {
                rendered.$source = value;
                fluid.bindDomTokens(templateEffects, vnode, rendered, (node, text) => node.setAttribute(key, text));
                vnode.attrs[key] = rendered; // Mark to reconciler that it is a signal so it should ignore it
            }
        }
    };

    // Simple utility to allow us to layer live signals on top of signal sources in a VTree
    fluid.getSignalSource = function (ref) {
        return fluid.isSignal(ref) ? ref.$source : ref;
    };

    fluid.editorRootRef = null;

    fluid.effVTree = function (vTree, elideParent) {
        return elideParent ? (vTree.children[0] || vTree) : vTree;
    };

    fluid.isSimpleClassSelectorCutpoint = function (tree) { // Glorified utility from 2010
        return tree.length === 1 && tree[0].predList.length === 1 && tree[0].predList[0].clazz;
    };

    /**
     * Matches virtual DOM nodes with a specific class and collects them into a results array.
     * This function recursively traverses the virtual DOM tree to find nodes with the specified class.
     *
     * @param {VNode} tree - The root virtual DOM node to start the search from.
     * @param {String} clazz - The class name to match.
     * @param {VNode[]} [results=[]] - An array to collect matching nodes.
     * @return {VNode[]} The array of matching virtual DOM nodes.
     */
    fluid.matchSimpleClass = function (tree, clazz, results = []) {
        const thisClazz = tree.attrs?.["class"];
        if (thisClazz && thisClazz.split(" ").includes(clazz)) {
            results.push(tree);
        }
        if (tree.children) {
            tree.children.forEach(child => fluid.matchSimpleClass(child, clazz, results));
        }
        return results;
    };

    const relDispositions = {
        before: 0,
        after: 1
    };

    fluid.compositeVTree = function (compositedTree, rec, layerName) {
        const [disposition, selector] = rec.relativeContainer.split(":");
        const parsedSelector = fluid.parseSelector(selector, fluid.simpleCSSMatcher);
        const clazz = fluid.isSimpleClassSelectorCutpoint(parsedSelector);
        if (!clazz) {
            return fluid.unavailable(`Error in partial template for ${layerName}: Support for complex selector ${selector} is not implemented`);
        } else {
            const nodes = fluid.matchSimpleClass(compositedTree, clazz);
            if (nodes.length !== 1) {
                return fluid.unavailable(`Error in partial template for ${layerName}: No exact match (${nodes.length}) for class selector .${clazz}`);
            } else {
                const target = nodes[0];
                const relDisposition = relDispositions[disposition];
                if (relDisposition === undefined) {
                    return fluid.unavailable(`Error in partial template for ${layerName}: Unrecognised disposition ${disposition} which should be "after" or "before"`);
                }
                const templateTree = fluid.copy(fluid.fetchParsedTemplate(layerName));
                const parentNode = target.parentNode;
                const index = parentNode.children.indexOf(target);
                parentNode.children.splice(index + relDisposition, 0, fluid.effVTree(templateTree, true));
            }
        }
        return compositedTree;

    };

    // Sort of hack to allow unprocessed part of vtree to form a template for a selfTemplated child component by removing
    // parentNode properties so it can be cloned.
    fluid.retemplatise = function (vnode) {
        delete vnode.parentNode;
        if (vnode.children) {
            vnode.children.forEach(fluid.retemplatise);
        }
        return vnode;
    };

    fluid.shadowsToRoot = function (shadow) {
        const togo = [];
        while (shadow) {
            togo.push(shadow);
            shadow = shadow.parentShadow;
        }
        return togo;
    };

    /**
     * Retrieves the `ownerDocument` associated with a given shadow component.
     *
     * @param {Shadow} shadow - The shadow object representing the component context.
     * @return {Document|undefined} The document object associated with the shadow's container, or `undefined` if no valid container is found.
     */
    fluid.findDocument = function (shadow) {
        // Search them from root downwards to increase chance of finding a concrete one first - we can't evaluate $compute records
        // by this route. In future components can start to evaluate (at least $computeds can) before layer is defined.
        const shadows = fluid.shadowsToRoot(shadow).reverse();
        const container = fluid.find(shadows, oneShadow => {
            if (oneShadow.that) {
                return oneShadow.that.container;
            } else {
                const layers = oneShadow.mergeRecords.map(mergeRecord => mergeRecord.layer).reverse();
                return fluid.find(layers, layer => {
                    const container = layer.container;
                    return fluid.isSignal(container) || fluid.isDOMNode(container) ? container : undefined;
                });
            }
        });
        return container ? fluid.deSignal(container).ownerDocument : undefined;
    };

    /**
     * Process a vTree to parse text and attribute templates, creating effects to bind to markup during the later renderView stage.
     *
     * @param {VNode} vtemplate - The vTree representing the template which will be parsed
     * @param {ComponentComputer} self - The component in the context of which template references are to be parsed
     * @return {VNode} The processed vTree with rendered text and attributes.
     */
    fluid.activateTemplate = function (vtemplate, self) {
        const shadow = self[$m];
        // Awful hack to get around surplus notification problem for now
        const selfEditingRef = fluid.editorRootRef || (fluid.editorRootRef = fluid.fetchContextReferenceSoft("fluid.editorRoot", ["selfEditing"], shadow));
        const selfEditing = selfEditingRef.value;

        return untracked( () => {

            const templateEffects = shadow.frameworkEffects.templateEffects = shadow.frameworkEffects.templateEffects || [];
            /**
             * Recursively processes a VNode by rendering any template strings found in its text or attributes
             * @param {VNode} vnode - The VNode to be processed.
             * @return {VNode} The processed VNode with rendered content in text and attributes.
             */
            function processVNode(vnode) {
                vnode.shadow = shadow;
                vnode._id = vnode._id || vnode_id++;
                if (vnode.text !== undefined) {
                    const tokens = fluid.parseAtStringTemplate(vnode.text);
                    const rendered = fluid.renderComputedStringTemplate(tokens, shadow);
                    fluid.bindDomTokens(templateEffects, vnode, rendered, (node, text) => node.nodeValue = text);
                    return Object.assign(vnode, {text: rendered});
                } else {
                    // Process id attribute first since it may cause others to be slung to another component
                    const idValue = vnode.attrs?.["@id"];
                    if (idValue) {
                        // This effect binds to the DOM node, when it is disposed, will empty the component's template record.
                        // We likely don't want to use this in practice since a template update is going to update this live and
                        // we'd prefer to reuse whatever is in the DOM without tearing it down.
                        fluid.allocateVNodeEffect(vnode, vnode => {
                            const disposable = function () {
                                fluid.pushPotentia(shadow, idValue, [{mergeRecordType: "template"}]);
                            };
                            disposable.$variety = "$component";
                            const parentTemplate = signal({
                                tag: vnode.tag,
                                attrs: fluid.filterObjKeys(vnode.attrs, key => key !== "@id"),
                                children: vnode.children.map(fluid.retemplatise)
                            });
                            delete vnode.children;
                            vnode.attrs = fluid.filterObjKeys(vnode.attrs, key => !key.startsWith("@"));

                            const templateRecord = {
                                mergeRecordType: "template",
                                layer: {
                                    $layers: "fluid.viewComponent",
                                    container: vnode.elementSignal,
                                    parentTemplate
                                }
                            };

                            fluid.pushPotentia(shadow, idValue, [templateRecord]);
                            return disposable;
                        });
                    }
                    fluid.each(vnode.attrs, (value, key) => {
                        fluid.processVNodeAttribute(vnode, value, key, shadow, templateEffects);
                    });
                    if (vnode["class"]) {
                        // Grab a reference to any static source of classes before this node was signalised
                        const clazzSource = fluid.getSignalSource(vnode.attrs["class"]) || "";
                        const allClass = computed( () => {
                            const classes = Object.entries(vnode["class"]).map( ([key, value]) => [key, fluid.deSignal(value)])
                                .filter(([, value]) => value)
                                .map(([key]) => key);
                            return clazzSource + " " + classes;
                        });
                        allClass.$variety = "$allClass";
                        allClass.$source = clazzSource;
                        fluid.bindDomTokens(templateEffects, vnode, allClass, (node, text) => node.setAttribute("class", text));
                        vnode.attrs["class"] = allClass;
                    }
                    if (vnode.children !== undefined) {
                        vnode.children = vnode.children.map(processVNode);
                    }
                }
                return vnode;
            }

            const activateTemplate = tree => {
                fluid.disposeEffects(templateEffects);
                const togo = processVNode(tree);
                // TODO: In the end this will be done on parse of the SFC and folding its provenance onto the $imports layer property
                // TODO: This path is now broken - fluid.findDocument returns a signal and this function accepts a Document.
                // We can't actually asynchronise this here and this whole process of acquiring imports from template documents is broken
                // Use layer imports for now until we can have a big reform - either do this processing on parse, or attach machinery to templates directly etc.
                fluid.acquireLoadDirectives(fluid.findDocument(shadow), vtemplate);
                templateEffects.forEach(effect => effect.$site = self);
                return togo;
            };

            const assignParents = (vnode, parentNode = null) => {
                vnode.parentNode = parentNode;
                if (vnode.children) {
                    vnode.children.forEach(child => assignParents(child, vnode));
                }
                return vnode;
            };
            if (!vtemplate) {
                // TODO: looks like this can only occur through reference like {self}.parentTemplate which should produce unavailable by itself
                return fluid.unavailable("Template not configured");
            }

            const tree = fluid.copy(vtemplate);
            const useTree = fluid.effVTree(tree, self.elideParent);
            let compositedTree = assignParents(useTree);

            if (fluid.hasLayer(self, "fluid.partialViewComponent")) {
                fluid.each(self.partialTemplateLayers, (rec, layerName) => {
                    compositedTree = fluid.compositeVTree(compositedTree, rec, layerName);
                });
            }

            // Currently returns its argument, but historical "tag-singularity" branch did funky stuff folding "virtual virtual DOM nodes" together
            const activatedTree = activateTemplate(compositedTree);

            const filteredTree = selfEditing ? selfEditingRef.$component.filterForSelfEditing(activatedTree, self) : activatedTree;

            fluid.bindContainer(templateEffects, filteredTree, self);
            return filteredTree;

        });
    };

    fluid.unbindDom = function (/*vnode, element*/) {
        // Try to remove event listeners and the like?
    };

    /**
     * Binds a DOM element to a virtual node (VNode), setting up necessary bindings or effect handling.
     * If the VNode contains a signal, it will update its value with the provided element.
     * If it contains a set of binding functions, those functions will be invoked with the element.
     *
     * @param {VNode} vnode - The virtual node to bind the element to.
     * @param {HTMLElement} element - The DOM element to bind to the virtual node.
     */
    fluid.bindDom = function (vnode, element) {
        if (vnode.elementSignal) {
            fluid.unbindDom(vnode, vnode.elementSignal.peek());
            vnode.elementSignal.value = element;
        }
    };

    /**
     * Cause the attributes of the supplied DOM node to agree with the `attrs` member of the supplied VNode
     *
     * @param {VNode} vnode - The VNode whose attributes are to be applied
     * @param {HTMLElement} element - The DOM node whose attributes are to be patched
     * @param {Boolean} isRoot - `true` if this rendering is of a container root - if so, this will skip deleting mismatching attributes
     */
    fluid.patchAttrs = function (vnode, element, isRoot) {
        if (!isRoot) {
            for (let i = element.attributes.length - 1; i >= 0; i--) {
                const attrName = element.attributes[i].name;
                if (!(attrName in vnode.attrs) && !attrName.startsWith("data-fl-transient")) {
                    element.removeAttribute(attrName);
                }
            }
        }
        for (const [key, value] of Object.entries(vnode.attrs)) {
            if (!fluid.isSignal(value) && element.getAttribute(key) !== value) {
                element.setAttribute(key, value);
            }
        }
    };

    fluid.vnodeToSegs = function (vnode) {
        // TODO: Extract path to root of template
        return ["$template", vnode.tag];
    };


    // Hack to assign ids to vnodes to ensure that their events get bound to container DOM nodes exactly once
    let vnode_id = 1;

    // Helpful comparison: https://lazamar.github.io/virtual-dom/#applying-a-diff
    /**
     * Updates the DOM to match the given virtual node (VNode) structure.
     *
     * This function ensures that the provided `element` correctly reflects the structure
     * of `vnode.children`, updating, replacing, or removing child elements as necessary.
     *
     * @param {VNode} vnode - The virtual node representing the desired DOM structure.
     * @param {Node} element - The actual DOM element to be patched.
     * @param {Boolean} [isRoot] - `true` if this rendering is of a container root - if so, this will skip deleting mismatching attributes
     */
    fluid.patchChildren = function (vnode, element, isRoot = false) {
        fluid.bindDom(vnode, element); // Will assign to elementSignal and allocate binding effects
        if (vnode.text !== undefined && !fluid.isSignal(vnode.text) && vnode.text !== element.nodeValue) {
            element.nodeValue = vnode.text;
        }
        if (vnode.attrs !== undefined) {
            fluid.patchAttrs(vnode, element, isRoot);
        }

        // It may be undefined because this is a joint to a subcomponent as applied in fluid.processAttributeDirective
        if (vnode.children !== undefined) {
            const vcount = vnode.children.length;
            for (let i = 0; i < vcount; ++i) {
                const vchild = vnode.children[i];
                let other = element.childNodes[i];
                if (!other || !fluid.matchNodeToVNode(other, vchild)) {
                    const fresh = fluid.nodeFromVNode(element.ownerDocument, vchild);
                    if (other) {
                        other.replaceWith(fresh);
                    } else {
                        element.appendChild(fresh);
                    }
                    other = fresh;
                }
                fluid.patchChildren(vchild, other);
            }
            for (let i = element.childNodes.length - 1; i >= vcount; --i) {
                element.childNodes[i].remove();
            }
        }
    };

    /**
     * Renders a virtual DOM tree (VNode) into a container element.
     *
     * This function updates the container's contents to match the provided virtual tree.
     * If `elideParent` is true, the `vTree`'s children are grafted as children of the current container.
     *
     * @param {ComponentComputer} self - The component in the context of which template references are to be parsed
     * @param {HTMLElement} container - The target DOM element where the virtual tree should be rendered.
     * @param {VNode} vTree - The virtual node representing the desired DOM structure.
     */
    fluid.renderView = function (self, container, vTree) {
        console.log(`renderView beginning for ${self[$m].path} with vTree ${vTree._id} container `, container.flDomId);
        fluid.patchChildren(vTree, container, true);
    };

    fluid.disableRendering = function (self) {
        self.vTree = fluid.unavailable({cause: "Rendering is disabled", variety: "config"});
    };

    fluid.def("fluid.viewComponent", {
        $layers: "fluid.component",
        elideParent: true,
        container: "$compute:fluid.unavailable(Container not specified)",
        renderedContainer: fluid.unavailable({cause: "Component not rendered", variety: "config"}),
        templateTree: fluid.unavailable({cause: "No virtual DOM tree is configured", variety: "config"}),
        vTree: "$compute:fluid.activateTemplate({self}.templateTree, {self})",
        renderView: "$effect:fluid.renderView({self}, {self}.container, {self}.vTree)",
        $variety: "framework"
    });

    fluid.def("fluid.selfTemplate", {
        $layers: "fluid.viewComponent",
        templateTree: "{self}.parentTemplate",
        elideParent: false,
        $variety: "framework"
    });

    fluid.def("fluid.partialViewComponent", {
        relativeContainer: fluid.unavailable({cause: "Relative container not configured", variety: "config"}),
        $variety: "framework"
    });

    fluid.renderSourceUrl = sourceUrl => ` written in <a class="fl-source-link" href="{sourceUrl}">${sourceUrl.split("/").pop()}</a>`;

    fluid.renderFullSite = site => {
        const path = site ? ` at <a href="#" class="fl-path-link">${fluid.renderSite(site)}</a>` : "";
        const layer = site && fluid.layerForSite(site);
        const layerText = layer ? ` in layer ${layer}` : "";
        const sourceUrl = layer && fluid.importMap[layer]?.url;
        const urlText = sourceUrl ? fluid.renderSourceUrl(sourceUrl) : "";
        return path + layerText + urlText;
    };

    fluid.renderOneCause = cause => {
        const siteText = Array.isArray(cause.site) ? cause.site.map(fluid.renderFullSite).join("<br/>") :
            fluid.renderFullSite(cause.site);
        return `<li>${cause.message}${siteText}</li>`;
    };

    fluid.renderError = function (container, unavailable) {
        const errors = unavailable.causes.map(fluid.renderOneCause).join("\n");
        const markup = `<ul class="fl-error">${errors}</ul>`;
        // OK to flash this in since it will be replaced when proper rendering happens and has no browser state
        container.innerHTML = markup;
    };

    fluid.possiblyRenderError = function (shadow) {
        if (shadow.that) {
            const that = shadow.that;
            if (that.$layers.includes("fluid.viewComponent")) {
                const vTree = fluid.deSignal(that.vTree);
                if (fluid.isErrorUnavailable(vTree)) {
                    fluid.renderError(fluid.deSignal(that.container), vTree);
                }
            }
        } else if (fluid.isErrorUnavailable(shadow.that)) {
            const container = shadow.mergeRecords.reduce((acc, record) => record.container || acc, null);
            if (container) {
                fluid.renderError(container, shadow.that);
            }
        }
    };

    fluid.registerCoOccurrence("fluid.viewComponentList", {
        inputLayers: ["fluid.viewComponent", "fluid.componentList"],
        outputLayers: ["fluid.viewComponentList"]
    });

    fluid.def("fluid.viewComponentList", {
        $layers: "fluid.viewComponent",
        elideParent: false,
        vTree: "$compute:fluid.listViewTree({self}.list)",
        $variety: "framework"
    });

    fluid.listViewTree = function (list) {
        return fluid.computed(componentList => {
            const {designalArgs: components, unavailable: compUnavailable} = fluid.processSignalArgs(componentList);
            if (compUnavailable) {
                return compUnavailable;
            } else {
                const {
                    designalArgs: childTrees,
                    unavailable: treesUnavailable
                } = fluid.processSignalArgs(components.map(component => component.vTree));
                return treesUnavailable || {
                    tag: "template",
                    children: childTrees
                };
            }
        }, [list]);
    };

    fluid.def("fluid.templateViewComponent", {
        $layers: "fluid.viewComponent",
        templateTree: "$compute:fluid.parseHTMLToTree({self}.template)",
        $variety: "framework"
    });

    fluid.def("fluid.sfcTemplateViewComponent", {
        $layers: "fluid.templateViewComponent",
        templateTree: "$compute:fluid.fetchParsedTemplate({self}.templateLayer)",
        $variety: "framework"
    });



    /**
     * Creates an effect that automatically instantiates self-booting Fluid components for elements
     * in the document that have the `fluid-layers` attribute.
     *
     * This function performs a live query for all elements with the `fluid-layers` attribute.
     * For each such element, if it is not already registered in the `viewContainerRegistry`,
     * it splits the attribute value into layer names, instantiates a new component with those layers,
     * and registers the component's shadow in the registry.
     *
     * @param {Document} dokkument - The document in which to search for self-booting components.
     * @return {Effect} An effect that manages the instantiation and registration of self-booting components.
     */
    fluid.makeSelfBootEffect = function (dokkument) {
        // Many thanks to Hugo Daniel https://hugodaniel.com/pages/boredom/ for inspiration for this concept
        const selfBootQuery = fluid.liveQuerySelectorAll("*[fluid-layers]", dokkument, dokkument);
        return effect( () => {
            const elements = selfBootQuery.value;
            elements.forEach(element => {
                const existing = fluid.viewContainerRegistry.get(element);
                if (!existing) {
                    const layers = element.getAttribute("fluid-layers").split(" ").map(layer => layer.trim());
                    const [firstLayer, ...restLayers] = layers;
                    const instance = fluid.initFreeComponent(firstLayer, {
                        $layers: restLayers,
                        container: element
                    });
                    // Put this in early in case instantiation fails - TODO standardise access to shadow
                    fluid.viewContainerRegistry.set(element, instance[$t].shadow);
                }
            });
        });
    };

    /**
     * Boots the Infusion framework for a given document by acquiring modules and import maps,
     * and initializing self-booting components.
     *
     * This function performs the following steps:
     * - On document load, it acquires all `<fluid-module>` elements and registers them.
     * - It processes all `<fluid-import>` elements to build the import map and initiate SFC loading.
     * - It returns an effect that tracks and instantiates self-booting components found in the document.
     *
     * @param {Document} dokkument - The document to boot the Fluid framework within.
     * @return {Effect} An effect that manages self-booting component instantiation.
     */
    fluid.bootDocument = function (dokkument) {
        fluid.applyOnLoad(() => {
            fluid.acquireModules(dokkument, dokkument.documentElement);
            fluid.docToImportMap(dokkument, dokkument.documentElement);
        });
        return fluid.makeSelfBootEffect(dokkument);
    };

};

if (typeof(fluid) !== "undefined") {
    fluidViewScope(fluid);
}
