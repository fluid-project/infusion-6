/* global signal, computed, effect, untracked */

"use strict";

const fluidViewScope = function (fluid) {

    const $m = fluid.metadataSymbol;
    const $t = fluid.proxySymbol;

    /**
     * @typedef {Object} VNode
     * @property {String} [tag] - The tag name of the element (e.g., 'div', 'span').
     * @property {Object<String, String>} [attrs] - A key-value map of the element's attributes.
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
     * Parses an HTML string into a DOM element.
     *
     * @param {String} template - The HTML string to parse.
     * @return {HTMLElement|null} The first element in the parsed DOM fragment, or null if none exists.
     */
    fluid.parseDOM = function (template) {
        const fragment = document.createRange().createContextualFragment(template);
        return fragment.firstElementChild || fluid.unavailable("Unable to parse template as HTML");
    };

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
     * @param {VNode} vnode - The virtual node to convert into a DOM node.
     * @return {Node} - A newly created DOM node corresponding to the VNode.
     */
    fluid.nodeFromVNode = function (vnode) {
        if (typeof(vnode) === "string") {
            return document.createTextNode(vnode);
        } else if (vnode.text !== undefined) {
            return document.createTextNode(fluid.isSignal(vnode.text) ? "" : vnode.text);
        } else {
            return fluid.svgTags.has(vnode.tag)
                ? document.createElementNS("http://www.w3.org/2000/svg", vnode.tag)
                : document.createElement(vnode.tag);
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
            return node.nodeType === Node.TEXT_NODE;
        } else {
            return node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === vnode.tag;
        }
    };

    /**
     * Finds all child nodes of a given virtual node that match a specified tag name.
     * This implementation only supports exact matches by tag name.
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
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.nodeValue;
            return text === "" ? null : {text};
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
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
     * @param {VNode} vnode - The virtual DOM node to convert into a real DOM node.
     * @return {Node} The root DOM node corresponding to the VNode.
     */
    fluid.vNodeToDom = function (vnode) {
        const root = fluid.nodeFromVNode(vnode);
        fluid.patchChildren(vnode, root);
        return root;
    };

    fluid.cssInjectionStyles = {
        literal: {
            construct: () => ({
                tag: "style",
                attrs: {type: "text/css"},
                children: [{text: ""}]
            }),
            update: (node, rec) => {
                node.firstChild.nodeValue = rec;
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
            update: (node, rec) => {
                // It must be a fluid.importUrlResource
                node.setAttribute("href", rec.url);
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
            update: (node, rec) => {
                node.firstChild.nodeValue = rec;
            }
        },
        link: {
            construct: () => ({
                tag: "script",
                attrs: {
                    async: "false",
                    type: "text/javascript"
                }
            }),
            update: (node, rec) => {
                // It must be a fluid.importUrlResource
                node.setAttribute("src", rec.url);
            }
        }
    };

    fluid.injectCSS = function (css, layerCssId, url) {
        const injStyle = typeof(css) === "string" ? "literal" : "link";
        const injRec = fluid.cssInjectionStyles[injStyle];
        let existing = document.getElementById(layerCssId);
        if (!existing) {
            existing = fluid.vNodeToDom(injRec.construct());
            existing.id = layerCssId;
            document.head.appendChild(existing);
        }
        if (injStyle === "literal") {
            css += `\n/*# sourceURL=${url}*/`;
        }
        injRec.update(existing, css);
    };

    fluid.injectScript = function (script, scriptNodeId, url) {
        const injStyle = typeof(script) === "string" ? "literal" : "link";
        const injRec = fluid.scriptInjectionStyles[injStyle];
        let existing = document.getElementById(scriptNodeId);
        if (existing) {
            existing.remove();
        }
        const fresh = fluid.vNodeToDom(injRec.construct());
        fresh.id = scriptNodeId;
        fresh.async = false;
        injRec.update(fresh, script);
        try {
            document.head.appendChild(fresh);
        } catch (e) {
            fluid.fail(`Syntax error in script at url ${url}: ${e.message}`, e);
        }
    };

    fluid.urlBaseRegistry = {};

    /**
     * Resolves a raw template string into a fully qualified URL using the `fluid.urlBaseRegistry`.
     *
     * @param {String} raw - The raw template string containing placeholders.
     * @return {String} The resolved URL.
     */
    fluid.templateBaseUrl = function (raw) {
        const tidy = raw.replace(/}\//g, "}"); // ensure no leading / in suffix URL
        return fluid.stringTemplate(tidy, fluid.urlBaseRegistry);
    };

    /**
     * Acquires all `<fluid-url-base>` elements within the given DOM root and populates the `fluid.urlBaseRegistry`.
     * Each `<fluid-url-base>` element must have an `id` and a `src` attribute. The `src` is normalized to ensure it ends with a "/".
     *
     * @param {VNode|Element} root - The root DOM element to search for `<fluid-url-base>` elements.
     * @return {Array<Object>} An array of objects representing the acquired `<fluid-url-base>` nodes.
     */
    fluid.acquireUrlBases = function (root) {
        const urlBaseNodes = fluid.querySelectorAll(root, "fluid-url-base");
        urlBaseNodes.forEach(node => {
            const id = node.attrs.id;
            const src = node.attrs.src;
            fluid.urlBaseRegistry[id] = src.endsWith("/") ? src : src + "/";
        });
        return urlBaseNodes.map(node => ({node}));
    };

    /**
     * Acquires all `<fluid-import>` elements within the given DOM root and registers them in the `fluid.importMap`.
     * Each `<fluid-import>` element must have a `layer` and a `src` attribute. The `src` is resolved to an absolute URL.
     * The function also initiates the loading of the Single File Component (SFC) for each import.
     *
     * @param {VNode|Element} root - The root element to search for `<fluid-import>` elements.
     * @return {Array<Object>} An array of objects representing the acquired `<fluid-import>` nodes, including their layer names and URLs.
     */
    fluid.acquireImports = function (root) {
        const togo = [];
        const importNodes = fluid.querySelectorAll(root, "fluid-import");
        importNodes.forEach(node => {
            const layerName = node.attrs.layer;
            const url = fluid.templateBaseUrl(node.attrs.src);
            fluid.importMap[layerName] = {
                loadStyle: "sfc",
                url
            };
            togo.push({layerName, url, node});
            fluid.loadSFC(layerName, url);
        });
        return togo;
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

    /**
     * Processes and removes all `<fluid-url-base>` and `<fluid-import>` directive nodes from the given root.
     * This function ensures that these directive nodes are not rendered in the final DOM output, if the root was a template
     *
     * @param {VNode} root - The template element to process.
     */
    fluid.acquireLoadDirectives = function (root) {
        // Remove directive nodes from template since no use in them rendering
        const removeAll = recs => recs.forEach(rec => fluid.removeArrayElement(rec.node.parentNode, rec.node));
        removeAll(fluid.acquireUrlBases(root));
        removeAll(fluid.acquireImports(root));
    };

    fluid.loadSFCScript = function (src, layerName, index, usedKeys) {
        const nodeId = `fl-script-${layerName}-${index}`;
        const url = fluid.templateBaseUrl(src);
        fluid.injectScript({url}, layerName);
        usedKeys.push(nodeId);
    };

    /**
     * Represents the result of parsing a single `<script>` node in an SFC.
     *
     * - If the script node has a `src` attribute, only the `src` string is recorded.
     * - Otherwise, the inline script is parsed to extract a `DefMap` and its original text.
     *
     * @typedef {Object} ScriptNodeInfo
     * @property {String} [src] - The source URL if the script uses `src`.
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
                return src;
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

    fluid.applySFCStyles = function (styleNodes, layerName, usedKeys, url) {
        styleNodes.forEach((scriptNode, index) => {
            let script = scriptNode.children[0]?.text;
            const src = scriptNode.attrs.src;
            if (src) {
                script = {
                    url: fluid.templateBaseUrl(src)
                };
            }
            const nodeId = `fl-style-${layerName}-${index}`;
            fluid.injectCSS(script, nodeId, url);
            usedKeys.push(nodeId);
        });
    };

    /**
     * Resolves a given URL to an absolute URL. If the URL already has a protocol, it is returned as is.
     * Otherwise, it is resolved relative to the current document's location, taking into account relative paths.
     *
     * @param {String} url - The URL to resolve.
     * @return {String} The absolute URL.
     */
    fluid.toAbsoluteUrl = url => /^\w+:\/\//.test(url) ? url : new URL(url, document.location.href).href;

    // A convenient global to receive the parsed definition
    // noinspection ES6ConvertVarToLetConst
    fluid.$fluidParsedDef = null;
    /**
     * Parses a Single File Component (SFC) from a given text signal and processes its content.
     * This function extracts the template, scripts, and styles from the SFC, evaluates the script
     * definitions, and constructs a component definition object. It also handles any trailing scripts
     * and injects them into the DOM with a source URL for debugging.
     *
     * @param {Object} rec - Record holding the SFC definition
     * @param {String} layerName - The name of the layer associated with the SFC.
     * @param {String} url - The URL of the SFC, used for debugging and source mapping.
     * @return {effect<Object>} An effect that applies the parsed definition, including the template, CSS, and scripts.
     */
    fluid.parseSFC = function (rec, layerName, url) {
        const usedKeys = [];
        let oldText;
        return fluid.effect(text => {
            if (text === oldText) {
                console.log("Culling SFC injection effect since text has not changed");
                return;
            }
            console.log("**** Beginning to parse SFC for layer ", layerName);
            oldText = text;
            const vTree = rec.vTree = fluid.parseHTMLToTree(text);

            usedKeys.forEach(key => document.getElementById(key)?.remove());
            usedKeys.length = 0;
            // For some reason we don't get this parsed into nodes but actually we don't want them anyway, they will parse fine the next time round
            const scriptNodes = fluid.querySelectorAll(vTree, "script");
            if (scriptNodes.length === 0) {
                const unavailable = fluid.unavailable("Error in SFC: Expected definition for layer " + layerName +
                    " but no script node was found");
                fluid.def(layerName, unavailable);
            } else {
                /** @type {ScriptNodeInfo[]} */
                const defMapList = fluid.parseSFCScripts(scriptNodes);
                /** @type {LayerDefIndex} */
                const layerDefIndex = fluid.indexLayerDefs(defMapList);
                if (!layerDefIndex[layerName]) {
                    const unavailable = fluid.unavailable("Error in SFC: Expected definition for layer " + layerName +
                        " but found " + Object.keys(layerDefIndex).join(", ") + " instead");
                    fluid.def(layerName, unavailable);
                } else {
                    /** @type {LayerDefLocation} */
                    const ourDef = layerDefIndex[layerName];
                    /** @type {ScriptNodeInfo} */
                    const ourSNI = defMapList[ourDef.scriptIndex];
                    const oldLayers = fluid.defFromMap(ourSNI.text, ourSNI.defMaps, layerName, "$layers");

                    let patchedText = ourSNI.text;

                    const docTemplate = fluid.querySelectorAll(vTree, "template")[0];

                    let addLayers = ["fluid.templateViewComponent"];

                    // If a <template> block is present, store it in the template registry and add a definition to resolve it
                    if (docTemplate) {
                        addLayers = ["fluid.sfcTemplateViewComponent"];
                        patchedText = fluid.patchDefMap(patchedText, ourDef, "layerForTemplate", layerName, "last");
                        fluid.templateStore[layerName] = docTemplate;
                    }

                    // If no $layers was written in the definition, add one that will correctly resolve its template
                    if (!oldLayers) {
                        patchedText = fluid.patchDefMap(patchedText, ourDef, "$layers", addLayers, "first");
                    }
                    ourSNI.text = patchedText;

                    const absUrl = fluid.toAbsoluteUrl(url);
                    defMapList.forEach((sni, index) => {
                        if (typeof(sni) === "string") {
                            // TODO: Should clear out any old ones if the SFC reloads
                            fluid.loadSFCScript(sni, layerName, index, usedKeys);
                        } else {
                            const nodeId = `fl-script-${layerName}`;
                            fluid.injectScript(sni.text + `\n//# sourceURL=${absUrl}`, nodeId, absUrl);
                            usedKeys.push(nodeId);
                        }
                    });
                    const styleNodes = fluid.querySelectorAll(vTree, "style");
                    fluid.applySFCStyles(styleNodes, layerName, usedKeys, absUrl);
                }

            }
        }, [rec.textSignal]);
    };


    fluid.sfcStore = {};

    fluid.templateStore = {};

    fluid.fetchParsedTemplate = function (layerName) {
        return fluid.templateStore[layerName];
    };

    /**
     * Retrieve a layer by its name from the layer store.
     * If the layer does not exist, returns an "unavailable" marker with an appropriate message and path.
     *
     * @param {String} layerName - The name of the layer to retrieve.
     * @return {Object} Record for the SFC layer
     */
    fluid.readSFC = function (layerName) {
        const rec = fluid.sfcStore[layerName];
        if (rec) {
            return rec;
        } else {
            return fluid.sfcStore[layerName] = {
                textSignal: signal(fluid.unavailable(`SFC for ${layerName} is not available`))
            };
        }
    };

    /**
     * Loads a Single File Component (SFC) from a given URL and sets up watchers to manage its state.
     * This function creates a watcher object that tracks the SFC's text content, fetches the SFC from the URL,
     * and registers its definition when the fetch completes.
     *
     * @param {String} layerName - The name of the layer associated with the SFC.
     * @param {String} url - The URL from which to fetch the SFC content.
     * @return {Object} A watcher object containing signals and effects for managing the SFC's state.
     * @property {Signal<String>} text - A signal containing the SFC's text content or an "unavailable" placeholder.
     * @property {Effect} defEffect - An effect that registers the SFC's definition when the text signal updates.
     * @property {Signal<String>} fetchSignal - A signal containing the fetched SFC content from the URL.
     * @property {Effect} fetchEffect - An effect that updates the text signal with the fetched content.
     */
    fluid.loadSFC = function (layerName, url) {
        const rec = fluid.readSFC(layerName);
        rec.parseEffect = fluid.parseSFC(rec, layerName, url);
        rec.fetchSignal = fluid.fetchText(url);
        rec.fetchEffect = effect( () => rec.textSignal.value = rec.fetchSignal.value);
        return rec;
    };

    fluid.applyOnLoad = function (func) {
        if (document.readyState === "complete") {
            func();
        } else {
            document.addEventListener("DOMContentLoaded", func);
        }
    };

    /**
     * Create a live `Signal` that tracks elements matching a CSS selector within a DOM subtree.
     * The signal updates whenever matching elements are added or removed.
     * @param {String} selector - The CSS selector to match elements.
     * @param {Element|null} [root=null] - The root element to observe; defaults to `document` if `null`.
     * @return {Signal<Array<Element>>} A signal containing the current list of matching elements.
     */
    fluid.liveQuery = function (selector, root = null) {
        const togo = signal([]);
        const context = root || document;

        const updateMatches = () => {
            const upcoming = Array.from(context.querySelectorAll(selector));
            if (!fluid.arrayEqual(togo.value, upcoming)) {
                togo.value = upcoming;
            }
        };

        const observer = new MutationObserver(() => {
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
        togo._dispose = () => observer.disconnect();
        return togo;
    };

    /**
     * Create a computed `Signal` that tracks the first element matching a CSS selector within a DOM subtree.
     * If no element matches, the signal yields an "unavailable" placeholder.
     * @param {String} selector - The CSS selector to match a single element.
     * @param {Element|null} [root=null] - The root element to observe; defaults to `document` if `null`.
     * @return {Signal<Element|Object>} A signal containing the first matching element or an "unavailable" placeholder.
     */
    fluid.liveQueryOne = function (selector, root = null) {
        const noElement = fluid.unavailable({cause: "No element matches selector " + selector, variety: "I/O"});
        const query = fluid.liveQuery(selector, root);
        const togo = computed( () => query.value.length === 0 ? noElement : query.value[0]);
        togo._dispose = query._dispose();
        return togo;
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

        const newNode = document.createElement(tagName);
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


    // event "on" handling logic lithified with thanks from https://github.com/vuejs/petite-vue/blob/main/src/directives/on.ts (Licencs: MIT)

    const systemModifiers = ["ctrl", "shift", "alt", "meta"];


    const modifierGuards = {
        stop: (e) => e.stopPropagation(),
        prevent: (e) => e.preventDefault(),
        self: (e) => e.target !== e.currentTarget,
        ctrl: (e) => !e.ctrlKey,
        shift: (e) => !e.shiftKey,
        alt: (e) => !e.altKey,
        meta: (e) => !e.metaKey,
        left: (e) => "button" in e && e.button !== 0,
        middle: (e) => "button" in e && e.button !== 1,
        right: (e) => "button" in e && e.button !== 2,
        exact: (e, modifiers) =>
            systemModifiers.some((m) => e[`${m}Key`] && !modifiers[m])
    };

    const hyphenateRE = /\B([A-Z])/g;
    const modifierRE = /\.([\w-]+)/g;

    fluid.parseModifiers = (raw) => {
        let modifiers;
        raw = raw.replace(modifierRE, (_, m) => {
            (modifiers || (modifiers = {}))[m] = true;
            return "";
        });
        return {event: raw, modifiers};
    };

    fluid.hyphenate = str => str.replace(hyphenateRE, "-$1").toLowerCase();

    fluid.applyOns = function (vnode, shadow, el, on, vTreeRec) {
        if (on) {
            on.forEach(({onKey, onValue}) => fluid.applyOn(vnode, shadow, el, onKey, onValue, vTreeRec));
        }
    };

    /**
     * Binds a DOM event to a handler function defined in the component context.
     * Parses event modifiers and applies the appropriate event and behavior based on the directive key.
     *
     * @param {VNode} vnode - The virtual DOM node associated with the event.
     * @param {Shadow} shadow - The shadow record of the component, used to resolve context references.
     * @param {HTMLElement} el - The DOM element to which the event handler is to be attached.
     * @param {String} onKey - The directive key specifying the event name and any modifiers (e.g., 'click.ctrl.enter').
     * @param {String} onValue - The key in the component context that resolves to the event handler function.
     * @param {Array} vTreeRec - Array of registered event handler records for later deregistration
     */
    fluid.applyOn = (vnode, shadow, el, onKey, onValue, vTreeRec) => {
        let {event, modifiers} = fluid.parseModifiers(onKey);

        let handler;

        // TODO: Should implement some recognisable kind of parser here to ensure that = is at some kind of syntactic top level
        if (onValue.includes("=")) {
            const parts = onValue.split("=").map(part => part.trim());
            if (parts.length !== 2) {
                fluid.fail("Unrecognised event assignment binding without lefthand and righthand " + onValue);
            }
            const [lh, rh] = parts;
            const parsedLH = fluid.parseContextReference(lh);
            const target = fluid.resolveContext(parsedLH.context, shadow);
            let rvalue, rvalueSignal;
            let negate = rh.startsWith("!");
            const useRH = negate ? rh.substring(1) : rh;
            if (fluid.isILReference(useRH)) {
                const parsedRH = fluid.parseContextReference(useRH);
                rvalueSignal = fluid.fetchContextReference(parsedRH, shadow);
            } else {
                rvalue = fluid.coerceToPrimitive(rh);
            }
            handler = () => {
                if (rvalueSignal) {
                    rvalue = fluid.deSignal(rvalueSignal);
                }
                if (negate) {
                    rvalue = !rvalue;
                }
                fluid.setForComponent(target.value, parsedLH.path, rvalue);
            };
        } else {
            const parsed = fluid.compactStringToRec(onValue, "DOMEventBind");
            handler = fluid.expandMethodRecord(parsed, shadow, null, fluid.vnodeToSegs(vnode));
        }

        // map modifiers
        if (event === "click") {
            if (modifiers?.right) {
                event = "contextmenu";
            }
            if (modifiers?.middle) {
                event = "mouseup";
            }
        }

        const rawHandler = e => {
            if (modifiers) {
                if ("key" in e && !(fluid.hyphenate(e.key) in modifiers)) {
                    return;
                }
                for (const key in modifiers) {
                    const guard = modifierGuards[key];
                    if (guard && guard(e, modifiers)) {
                        return;
                    }
                }
            }
            return handler(e);
        };

        // console.log(`Bound handler to ${event} for vnode ${vnode._id} for DOM element ${el.flDomId} `, el);
        el.addEventListener(event, rawHandler, modifiers);
        vTreeRec.push({el, event, rawHandler, modifiers, vnodeId: vnode._id});
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
                fluid.viewContainerRegistry.set(element, self[$m]);
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
     * @param {Function} fun - The transformation function to apply to the signal's value.
     * @return {Signal<any>} A computed signal reflecting the transformed value.
     */
    fluid.mapSignal = (sig, fun) => fun === fluid.identity ? sig : fluid.computed( value => fun(value), [sig]);

    /**
     * Processes an attribute directive found on a virtual node.
     *
     * @param {VNode} vnode - The virtual node to which the attribute belongs.
     * @param {String} value - The attribute value, holding a directive through beginning with "v-"
     * @param {String} key - The name of the attribute.
     * @param {Shadow} shadow - The shadow for the component in whose context the attribute is processed.
     */
    fluid.processAttributeDirective = function (vnode, value, key, shadow) {
        if (key === "@id") {
            // This effect binds to the DOM node, when it is disposed, will empty the component's template record.
            // We likely don't want to use this in practice since a template update is going to update this live and
            // we'd prefer to reuse whatever is in the DOM without tearing it down.
            fluid.allocateVNodeEffect(vnode, vnode => {
                const disposable = function () {
                    fluid.pushPotentia(shadow, value, [{mergeRecordType: "template"}]);
                };
                disposable.$variety = "$component";
                // Cheapest way to signal to fluid.patchChildren that it should not attempt to recurse on child nodes
                // by itself:
                delete vnode.children;
                const templateRecord = {
                    mergeRecordType: "template",
                    layer: {
                        $layers: "fluid.viewComponent",
                        container: vnode.elementSignal
                    }
                };

                fluid.pushPotentia(shadow, value, [templateRecord]);
                return disposable;
            });
        } else if (key === "@class") {
            const parts = value.split(",").map(part => part.trim());
            const clazz = Object.fromEntries(parts.map(part => {
                const [key, ref] = part.split(":");
                const negate = ref.startsWith("!");
                const effRef = negate ? ref.substring(1) : ref;
                const tokens = fluid.parseStringTemplate(effRef);
                const rendered = fluid.renderComputedStringTemplate(tokens, shadow);
                const negMap = fluid.liftNegate(negate);
                // Unwrap the primitive token so it is more principled to check for falsy during parseTemplate
                const renderedPrim = fluid.isSignal(rendered) ? fluid.mapSignal(rendered.$tokens[0], negMap) : negMap(rendered);
                return [key, renderedPrim];
            }));
            vnode["class"] = clazz;
        }
    };

    // Simple utility to allow us to layer live signals on top of signal sources in a VTree
    fluid.getSignalSource = function (ref) {
        return fluid.isSignal(ref) ? ref.$source : ref;
    };

    /**
     * Parses a DOM element and processes its virtual node tree to replace template strings with rendered content.
     * It processes both text and attribute templates, binding the rendered values to the corresponding DOM elements.
     * The function recursively processes the virtual node tree, rendering and binding content as needed.
     *
     * @param {VNode} vtemplate - The VNode representing the template which will be parsed
     * @param {ComponentComputer} self - The component in the context of which template references are to be parsed
     * @return {VNode} The processed VNode with rendered text and attributes.
     */
    fluid.parseTemplate = function (vtemplate, self) {
        return untracked( () => {
            const shadow = self[$m];
            const templateEffects = shadow.frameworkEffects.templateEffects = shadow.frameworkEffects.templateEffects || [];
            /**
             * Recursively processes a VNode by rendering any template strings found in its text or attributes
             * @param {VNode} vnode - The virtual node (vNode) to be processed.
             * @param {VNode} [parentNode] - The parent of this node
             * @return {VNode} The processed VNode with rendered content in text and attributes.
             */
            function processVNode(vnode, parentNode = null) {
                vnode.shadow = shadow;
                vnode.parentNode = parentNode;
                vnode._id = vnode._id || vnode_id++;
                if (vnode.text !== undefined) {
                    const tokens = fluid.parseStringTemplate(vnode.text);
                    const rendered = fluid.renderComputedStringTemplate(tokens, shadow);
                    fluid.bindDomTokens(templateEffects, vnode, rendered, (node, text) => node.nodeValue = text);
                    return Object.assign(vnode, {text: rendered});
                } else {
                    fluid.each(vnode.attrs, (value, key) => {
                        const firstChar = key.charCodeAt(0);
                        if (firstChar === 64) { // @
                            if (key.startsWith("@on")) {
                                fluid.pushArray(vnode, "on", {onKey: key.slice(3).toLowerCase(), onValue: value});
                                fluid.allocateEventBindingEffect(templateEffects, vnode);
                            } else {
                                fluid.processAttributeDirective(vnode, value, key, shadow);
                            }
                            delete vnode.attrs[key];
                        } else if (key !== "class") {
                            const tokens = fluid.parseStringTemplate(value);
                            const rendered = fluid.renderComputedStringTemplate(tokens, shadow);
                            if (fluid.isSignal(rendered)) {
                                rendered.$source = value;
                                fluid.bindDomTokens(templateEffects, vnode, rendered, (node, text) => node.setAttribute(key, text));
                                vnode.attrs[key] = rendered; // Mark to reconciler that it is a signal so it should ignore it
                            }
                        }
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
                        vnode.children = vnode.children.map(processVNode, vnode);
                    }
                }
                return vnode;
            }

            function parseTemplate(tree) {
                fluid.disposeEffects(templateEffects);
                const togo = processVNode(tree);
                fluid.acquireLoadDirectives(vtemplate);
                templateEffects.forEach(effect => effect.$site = self);
                return togo;
            }

            const tree = fluid.copy(vtemplate);
            const useTree = self.elideParent ? tree.children[0] : tree;
            const togo = parseTemplate(useTree);

            fluid.bindContainer(templateEffects, useTree, self);
            return togo;

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
     * @param {Boolean} isRoot - `true` if this rendering is of a container root - if so, this will skip deleting mismatching attributes
     */
    fluid.patchChildren = function (vnode, element, isRoot) {
        fluid.bindDom(vnode, element); // Will assign to elementSignal and allocate binding effects
        if (vnode.text !== undefined && !fluid.isSignal(vnode.text)) {
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
                    const fresh = fluid.nodeFromVNode(vchild);
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
     * A registry that maps container elements to their associated component instances.
     * This is used to track which component is responsible for rendering a specific container.
     */
    fluid.viewContainerRegistry = new WeakMap();

    /**
     * Traverses the list of DOM elements lying at a point until it finds the first parent
     * that exists within `fluid.viewContainerRegistry`. Returns an object containing the container
     * and its associated shadow, or `null` if no such parent is found.
     *
     * @param {MouseEvent} mouseEvent - The mouse event at the point to be queried
     * @return {Shadow|null} The shadow, or `null` if not found.
     */
    fluid.findViewComponentContainer = function (mouseEvent) {
        const elements = document.elementsFromPoint(mouseEvent.clientX, mouseEvent.clientY);
        const container = elements.find(element => {
            const shadow = fluid.viewContainerRegistry.get(element);
            return shadow && !/^fullPageEditor-\d+\.inspectOverlay$/.test(shadow.path) ? shadow : null;
        });
        return container ? fluid.viewContainerRegistry.get(container) : null;
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
     * @param {Boolean} [elideParent=false] - If true, renders `vTree` directly into the container.
     */
    fluid.renderView = function (self, container, vTree, elideParent) {
        console.log(`renderView beginning for ${self[$m].memberName} with vTree ${vTree._id} container `, container.flDomId);
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
        vTree: "$compute:fluid.parseTemplate({self}.templateTree, {self})",
        renderView: "$effect:fluid.renderView({self}, {self}.container, {self}.vTree, {self}.elideParent)",
        css: fluid.unavailable({cause: "No CSS is configured", variety: "config"}),
        renderCSS: "$effect:fluid.renderCSS({self})",
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
        } else if (fluid.isErrorUnavailable(shadow.flatMerged)) {
            const container = shadow.mergeRecords.reduce((acc, record) => record.container || acc, null);
            if (container) {
                fluid.renderError(container, shadow.flatMerged);
            }
        }
    };

    fluid.registerCoOccurrence("fluid.viewComponentList", {
        inputNames: ["fluid.viewComponent", "fluid.componentList"],
        outputNames: ["fluid.viewComponentList"]
    });

    fluid.def("fluid.viewComponentList", {
        $layers: "fluid.viewComponent",
        elideParent: false,
        templateTree: "$compute:fluid.listViewTree({self}.list)",
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

    // Shared structure to store watchers of per-layer CSS
    const layerWatchers = {};

    fluid.applyLayerWatcher = function (layerName, nodeId, shadow, segs, material, injectFunc) {
        if (!layerWatchers[nodeId]) {
            const layerSig = fluid.readLayer(layerName);
            if (layerSig) {
                // Create just one watcher per layer, using our own css signal as an exemplar
                const materialSignal = fluid.getForComponent(shadow, segs);
                const watcher = fluid.effect((material) => injectFunc(material, nodeId), [materialSignal]);
                layerWatchers[nodeId] = watcher;
                // In theory we would clear these up if the layer is destroyed and/or the last component referencing it is destroyed
            } else { // It is not from a layer, simply watch this individual component's CSS
                injectFunc(material, nodeId);
            }
        }
    };

    fluid.getValueAndLayer = function (shadow, segs) {
        const value = fluid.getForComponent(shadow, segs).value;
        // Look into our layer map to find the provenance of the css value
        const layerName = fluid.get(shadow.layerMap, [...segs, $m, "source"]);
        return {value, layerName};
    };

    // Note: this system of watching CSS value in components is disused since CSS is all currently loaded from SFCs

    /**
     * An effect which renders CSS for a component by injecting it into the DOM and associating it with a specific layer.
     * This function ensures that each layer's CSS is only injected once by maintaining a registry of watchers.
     * If the CSS is associated with a layer, it creates a watcher to monitor changes and updates the DOM accordingly.
     * If the CSS is not associated with a layer, it directly injects the CSS into the DOM.
     *
     * @param {Object} self - The component instance whose CSS is being rendered.
     */
    fluid.renderCSS = function (self) {
        const shadow = self[$t].shadow;
        const cssSegs = ["css"];
        const {value: css, layerName} = fluid.getValueAndLayer(shadow, cssSegs);
        const nodeId = "fl-css-" + layerName;
        fluid.applyLayerWatcher(layerName, nodeId, shadow, cssSegs, css, fluid.injectCSS);
    };

    fluid.def("fluid.templateViewComponent", {
        $layers: "fluid.viewComponent",
        templateTree: "$compute:fluid.parseHTMLToTree({self}.template)",
        $variety: "framework"
    });

    fluid.def("fluid.sfcTemplateViewComponent", {
        $layers: "fluid.templateViewComponent",
        templateTree: "$compute:fluid.fetchParsedTemplate({self}.layerForTemplate)",
        $variety: "framework"
    });

    fluid.applyOnLoad(() => {
        fluid.acquireUrlBases(document.documentElement);
        fluid.acquireImports(document.documentElement);
    });

    // Many thanks to Hugo Daniel https://hugodaniel.com/pages/boredom/ for inspiration for this concept
    fluid.selfBootQuery = fluid.liveQuery("*[fluid-layers]");

    fluid.selfBootEffect = effect( () => {
        const elements = fluid.selfBootQuery.value;
        elements.forEach(element => {
            const existing = fluid.viewContainerRegistry.get(element);
            if (!existing) {
                const layers = element.getAttribute("fluid-layers").split(" ").map(layer => layer.trim());
                const [firstLayer, ...restLayers] = layers;
                const instance = fluid.initFreeComponent(firstLayer, {
                    $layers: restLayers,
                    container: element
                });
                // Put this in early in case instantiation fails
                fluid.viewContainerRegistry.set(element, instance);
            }
        });
    });

    fluid.globalDismissalSignal = signal(0);

    fluid.def("fluid.globalDismissal", {
        $layers: ["fluid.resolveRoot", "fluid.viewComponent"],
        container: document,
        clicked: 0,
        register: {
            $effect: {
                func: (self) => {
                    self.container.addEventListener("click", (e) => {
                        const noDismiss = e.target.closest(".fl-no-dismiss");
                        if (!noDismiss) {
                            ++fluid.globalDismissalSignal.value;
                        }
                    });
                },
                args: "{self}"
            }
        },
        $variety: "frameworkAux"
    });

    fluid.globalDismissalInstance = fluid.globalDismissal();
};

if (typeof(fluid) !== "undefined") {
    fluidViewScope(fluid);
}
