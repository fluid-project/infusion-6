"use strict";

const editorRootScope = function (fluid) {

    const $m = fluid.metadataSymbol;

    fluid.shadowHasUserLayer = function (shadow) {
        return shadow.that && fluid.deSignal(shadow.that.$layers).some(layer => fluid.isUserLayer(layer));
    };

    /**
     * Calculates the clipped bounds of a target element by traversing all its ancestors
     * up to the document root and ensuring the bounds lie within each ancestor's bounds.
     * Only the top, left, width, and height properties are returned.
     *
     * @param {HTMLElement} target - The target element whose bounds are to be clipped.
     * @return {Object} The clipped bounds containing top, left, width, and height.
     */
    fluid.getClippedBounds = function (target) {
        let { top, left, right, bottom } = target.getBoundingClientRect();
        let current = target.parentNode;

        while (current && current !== document) {
            if (current instanceof HTMLElement) {
                const parentRect = current.getBoundingClientRect();
                top = Math.max(top, parentRect.top);
                left = Math.max(left, parentRect.left);
                right = Math.min(right, parentRect.right);
                bottom = Math.min(bottom, parentRect.bottom);
            }
            current = current.parentNode;
        }
        return {top, left,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top)
        };
    };

    /**
     * Finds a context reference token if there is just a single one in the supplied array and
     * all the others consist of ignorable whitespace.
     *
     * @param {Array<Object>} tokens - An array of tokens to search through.
     * @return {Object|null} The single `$contextRef` token if found, `null` if no valid token is found
     */
    fluid.findSingleTextRef = function (tokens) {
        let nonIgnorable = false,
            contextRef = null;
        tokens.forEach(token => {
            if (fluid.isSignal(token) && token.$variety === "$contextRef") {
                if (!contextRef) {
                    contextRef = token;
                } else {
                    console.log("Found more than one contextRef");
                    contextRef = fluid.NoValue;
                }
            } else if (!/^\s*$/.test(token)) {
                nonIgnorable = true;
            }
        });
        return !nonIgnorable && contextRef && contextRef !== fluid.NoValue ? contextRef: null;
    };

    fluid.isEditableRoot = Object.fromEntries("h1,h2,h3,h4,h5,h6,p,ul,ol,div".split(",").map(key => [key, true]));

    fluid.findEditableRoots = function (vNode, results) {
        if (vNode.text) {
            if (fluid.isSignal(vNode.text)) {
                console.log("Found computed text");
                const contextRef = fluid.findSingleTextRef(vNode.text.$tokens);
                if (contextRef) {
                    console.log("Got single context ref as ", contextRef.parsed);
                    return contextRef;
                }
            } else {
                return /^\s*$/.test(vNode.text) ? null : "plain";
            }
        }
        if (vNode.children) {
            const childStatus = vNode.children.map(child => fluid.findEditableRoots(child, results));
            const hasCovered = childStatus.find(child => child === "covered");
            const hasPlain = childStatus.find(child => child === "plain");
            if (hasCovered) {
                if (hasPlain) {
                    vNode.children.forEach( (child, i) => {
                        const status = childStatus[i];
                        if (status === "plain") {
                            results.push({vNode: child, form: "plain"});
                        }
                    });
                }
                return "covered";
            }
            if (hasPlain) {
                if (fluid.isEditableRoot[vNode.tag]) {
                    results.push({vNode, form: "plain"});
                    return "covered";
                } else {
                    return "plain";
                }
            }
            const hasRef = childStatus.find(child => fluid.isSignal(child));
            if (hasRef) {
                results.push({vNode, form: hasRef});
                return "covered";
            }
        }
    };

    fluid.addToAttrs = function (attrs, attrName, extra, delimiter) {
        const existing = attrs[attrName];
        if (existing) {
            attrs[attrName] = existing + delimiter + extra;
        } else {
            attrs[attrName] = extra;
        }
    };

    fluid.filterForSelfEditing = function (vTree, component, editorRoot, layerColours) {
        const shadow = component[$m];
        console.log("Filtering for selfEditing at path ", shadow.path);
        const templateLayer = fluid.hasLayer(component, "fluid.sfcTemplateViewComponent") ? component.templateLayer : shadow.layerMap.template?.[$m]?.source;
        if (templateLayer && fluid.isUserLayer(templateLayer)) {
            const layerColour = layerColours[templateLayer];
            const liveColour = layerColours.$live;
            const results = [];
            fluid.findEditableRoots(vTree, results);
            if (results.length > 0) {
                console.log("*** Got textMap for layer ", templateLayer, " for component at path ", shadow.path);
                results.forEach(({vNode, form}) => {
                    if (form === "plain") {
                        vNode.attrs = vNode.attrs || {};
                        vNode.attrs.contenteditable = true;
                        fluid.addToAttrs(vNode.attrs, "class", "fl-edit-root", " ");
                        vNode.attrs["fl-template-layer"] = templateLayer;
                        fluid.addToAttrs(vNode.attrs, "style", `--fl-layer-colour: ${layerColour};`, " ");
                    }
                });
            }
        }
        return vTree;
    };

    /**
     * Compute a path of child indices from a given DOM element up to a specified container.
     * Each index represents the position of the element within its parent's `children` collection.
     * @param {Node} element - The starting DOM node.
     * @param {Element} container - The container element to stop traversal at (exclusive).
     * @return {Array<Number>} An array of child indices representing the path from `container` to `element`.
     */
    fluid.pathToNode = function (element, container) {
        const path = [];
        let current = element;

        while (current && current !== container) {
            const parent = current.parentNode;
            if (!parent) {
                break;
            }
            const index = Array.prototype.indexOf.call(parent.childNodes, current);
            path.unshift(index);
            current = parent;
        }

        return path;
    };

    /**
     * Navigate through a nested structure using a path of property names or indices.
     * @param {VNode} vNode - The root object or array to traverse.
     * @param {Number[]} path - The path to follow through the structure.
     * @return {VNode} The value at the end of the path, or `undefined` if any part of the path is invalid.
     */
    fluid.navigatePath = function (vNode, path) {
        return path.reduce((current, seg) => current.children[seg], vNode);
    };

    /**
     * Compares a virtual DOM node (VNode) with a real DOM node to determine if they are equivalent as regards
     * recursive text content
     * @param {VNode} vNode - The virtual DOM node to compare.
     * @param {Node} node - The real DOM node to compare against.
     * @return {Boolean} `true` if the VNode and the DOM node are equivalent, `false` otherwise.
     */
    fluid.textDiff = function (vNode, node) {
        if (vNode.text) {
            return vNode.text === node.nodeValue;
        } else if (vNode.children) {
            if (!node.childNodes || vNode.children.length !== node.childNodes.length) {
                return false;
            }
            return vNode.children.every((child, index) => fluid.textDiff(child, node.childNodes[index]));
        }
        return false;
    };

    fluid.applyOverlay = function (overlays, target, colour) {
        if (target && !fluid.isUnavailable(target)) {
            const bounds = fluid.getClippedBounds(target);

            const targetInBody = target.closest("body");
            const overlay = targetInBody ? overlays.overlay : overlays.selfOverlay;

            let relLeft = 0;
            if (!targetInBody) {
                const relative = document.querySelector(".fl-editor-root");
                const relBounds = relative.getBoundingClientRect();
                relLeft = relBounds.left + 2; // Somehow we are off by a little ....
            }

            overlay.style.top = `${bounds.top + window.scrollY}px`;
            overlay.style.left = `${bounds.left + window.scrollX - relLeft}px`;
            overlay.style.width = `${bounds.width}px`;
            overlay.style.height = `${bounds.height}px`;

            // Set the overlay's background color and border
            overlay.style.backgroundColor = colour;
            overlay.style.border = `1px solid ${fluid.darkenColour(colour)}`;
            overlay.style.display = "block";
        } else {
            Object.values(overlays).map(overlay => overlay.style.display = "none");
        }
    };

    // Hack this using pseudo-globals for now - in time we perhaps want some kind of auto-mount using live query?
    // TODO: Is this currently used for much other than adding/removing classes?
    fluid.activeLayerLink = null;

    fluid.editorRoot.mouseOver = function () {
        const layerElem = event.target.closest(".fl-layer-link");
        if (layerElem) {
            fluid.activeLayerLink = layerElem;
            layerElem.classList.add("active");
        }
    };

    fluid.editorRoot.mouseOut = function () {
        const layerElem = event.target.closest(".fl-layer-link");
        if (layerElem && fluid.activeLayerLink) {
            fluid.activeLayerLink.classList.remove("active");
            fluid.activeLayerLink = null;
        }
    };

    fluid.editorRoot.click = function (editorRoot) {
        const layerElem = event.target.closest(".fl-layer-link");
        if (layerElem) {
            const layerName = layerElem.getAttribute("data-fl-layer-name");
            const layerRef = layerElem.getAttribute("data-fl-layer-element");
            const parsedLayerRef = layerRef && fluid.parseContextReference(layerRef);

            const openLayer = layerName || parsedLayerRef.context;
            editorRoot.openLayerTab(openLayer);
            if (parsedLayerRef) {
                editorRoot.goToLayerRef(parsedLayerRef);
            }
        }
    };

    document.addEventListener("keydown", function (evt) {
        evt.stopImmediatePropagation();
        if (evt.key === "z" && (evt.ctrlKey || evt.metaKey)) {
            console.log("Undo");
            fluid.historyBack();
        } else if (evt.key === "y" && (evt.ctrlKey || evt.metaKey)) {
            fluid.historyForward();
        }
    });

};


if (typeof(fluid) !== "undefined") {
    editorRootScope(fluid);
}
