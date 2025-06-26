"use strict";

const fluidSubstrateScope = function (fluid) {

    // DeferredDef allows us to make references into the component's namespace function without them trying to resolve
    // on the point of definition
    fluid.deferredDef("fluid.substrateTree", {
        $layers: "fluid.templateViewComponent",
        defaultState: "$compute:fluid.substrateTree.defaultState({self}.rootEntries)",
        userState: {
            $reactiveRoot: {}
        },
        idToState: {
            $compute: {
                func: (defaultState, userState) => {
                    console.log("Recomputing with userState of ", userState);
                    return fluid.transform(defaultState, (value, key) => userState[key] || value);
                },
                args: ["{self}.defaultState", "{self}.userState"]
            }
        },
        renderOptions: {
            unfoldable: true
        },
        userLayersOnly: "{editorRoot}.showUserLayersOnly",
        rootEntries: "$compute:fluid.substrateTree.rootEntries({self})",
        componentToEntry: "$method:fluid.substrateTree.componentToEntry({self}, {0}:shadow, {1}:layer)",
        valueToEntry: {
            $method: {
                func: "fluid.substrateTree.valueToEntry",
                args: ["{self}", "{0}:shadow", "{1}:segs", "{2}:valueSignal", "{3}:inLayer"]
            }
        },
        colourForLayer: {
            $method: {
                func: (layer, layerColours) => layerColours[layer] || "transparent",
                args: ["{0}:layer", "{colourManager}.layerColours"]
            }
        },
        template: "$compute:fluid.substrateTree.renderTemplate({self}, {self}.rootEntries, {self}.idToState)",
        domListeners: {
            // Ad hoc event binding syntax to deal with the fact that we synthesize our template afresh on every render
            // rather than via a template or vDOM generator
            // - selector / event / method - work up a better syntax in time
            mouseover: "/ : mouseover : fluid.substrateTree.mouseover({0}:event, {editorRoot})",
            mouseleave: "/ : mouseleave : fluid.substrateTree.mouseleave({editorRoot})",
            foldClick: "/ : click : fluid.substrateTree.foldClick({0}:event, {self})"
        },
        inspectingHighlightEffect: "$effect:fluid.substrateTree.highlight({self}, {editorRoot}.inspectingSite)",
        $variety: "frameworkAux"
    });

    fluid.substrateTree.acceptComponent = function (shadow) {
        return fluid.deSignal(shadow.that.$layers).some(layer => fluid.isUserLayer(layer));
    };

    fluid.substrateTree.rootEntries = function (self) {
        const rootShadow = fluid.globalInstantiator.rootShadow;
        const children = Object.values(rootShadow.childComponents);
        const useChildren = self.userLayersOnly ? children.filter(fluid.shadowHasUserLayer) : children;
        return fluid.map(useChildren, shadow => self.valueToEntry(shadow, [shadow.path], shadow.that, fluid.peek(shadow.that.$layers) ));
    };

    fluid.substrateTree.defaultState = function (rootEntries) {
        const togo = {};
        const processEntries = entries => {
            entries.forEach(entry => {
                const hasChildren = entry.children && entry.children.length > 0;
                const hasComponentChildren = hasChildren && entry.children.some(child => child.variety === "$component");
                const state = {folded: hasChildren ? (
                    entry.variety === "$component" && hasComponentChildren ? "unfolded" : "folded")
                    : "none"};
                togo[entry.id] = state;
                if (hasChildren) {
                    processEntries(entry.children);
                }
            });
        };
        processEntries(rootEntries);
        return togo;
    };

    const $m = fluid.metadataSymbol;

    fluid.deSignalLight = ref => {
        while (fluid.isSignal(ref)) {
            ref = ref.peek();
        }
        return ref;
    };

    const displayLayers = ["fluid.viewComponentList", "fluid.componentList", "fluid.viewComponent", "fluid.component"];

    fluid.substrateTree.componentToEntry = function (self, shadow, layer, parent) {
        const id = fluid.renderSite({shadow});
        if (fluid.isUnavailable(shadow.flatMerged)) {
            return {id, value: shadow.flatMerged};
        } else {
            const that = shadow.that;
            const layers = fluid.deSignalLight(that.$layers);

            const displayLayer = displayLayers.find(layer => layers.includes(layer)).slice("fluid.".length);
            const filteredLayers = [...layers].filter(layer => self.userLayersOnly ? fluid.isUserLayer(layer) : true).reverse()
                .map(layer => `<span class="fl-layer-link" data-fl-layer-name="${layer}">${layer}</span>`).join(", ;");

            let togo = {
                id: `{${shadow.path}}`,
                parent,
                value: `<span class="fl-substrate-hover">${displayLayer}</span> (${filteredLayers})`,
                layer: layer || fluid.peek(layers),
                shadow
            };

            if (self[$m] === shadow) {
                togo.value += `<svg class="fl-recursion-marker" width="40" height="20"><use href="#fl-recursion"/></svg>`;
            } else if (layers.includes("fluid.componentList")) {
                if (fluid.isUserLayer(togo.layer)) {
                    togo.children = fluid.map(that.list.value, (proxy, key) => self.valueToEntry(proxy[$m], ["list", key], proxy, layer, togo));
                } else {
                    return fluid.NoValue;
                }
            } else {
                const keys = Object.keys(shadow.layerMap || {});
                keys.sort((a, b) => (a === "$layers" ? -1 : b === "$layers" ? 1 : 0));
                togo.children = fluid.map(keys, key => self.valueToEntry(shadow, [key], shadow.that[key], null, parent));
            }
            return togo;
        }
    };

    const funcRecords = ["$compute", "$eagerCompute", "$effect", "$method"];
    const renderRecordName = function (input) {
        return input.charAt(1).toUpperCase() + input.slice(2) + " ";
    };

    fluid.escapeHTML = function (string) {
        return string.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };

    const renderString = function (string) {
        const truncated = string.length > 50 ? string.slice(0, 50) + "..." : string;
        return fluid.escapeHTML(truncated);
    };

    const renderRef = function (ref) {
        if (fluid.isILReference(ref)) {
            return `<span class="fl-substrate-ref">${ref}</span>`;
        } else if (typeof(ref) === "function") {
            return "func";
        } else if (typeof(ref) === "string") {
            return `<span class="fl-substrate-string">"${renderString(ref)}"</span>`;
        } else if (fluid.isPrimitive(ref)) {
            return `<span class="fl-substrate-primitive">${ref}</span>`;
        } else {
            return `<span class="fl-substrate-composite">${ref.constructor.name}</span>`;
        }
    };

    fluid.substrateTree.renderShadowRec = function (rec) {
        // e.g. a "$for" entry is in the shadow map but has no handler, pretty weird, it probably shouldn't be
        const key = rec.handlerRecord?.key;
        let value;
        if (key && funcRecords.includes(key)) {
            const srec = rec.signalRecord;
            value = renderRecordName(key) + renderRef(srec.func) + "(" +
                fluid.makeArray(srec.args).map(renderRef).join(", ") + ")";
            return value;
        } else {
            return null;
        }
    };

    const styleForCol = colour => `style="background-color: ${colour}"`;

    fluid.substrateTree.valueToEntry = function (self, shadow, segs, valueSignal, inLayer, parent) {
        if (segs.length > 3) {
            return fluid.NoValue;
        }
        const id = fluid.renderSite({shadow, segs});

        let layer = inLayer || fluid.get(shadow.layerMap, segs)?.[$m].source;
        const rec = fluid.get(shadow.shadowMap, segs)?.[$m];

        const key = fluid.peek(segs);
        const value = fluid.deSignalLight(valueSignal); // TODO: More refined processing of signals and computed

        if (layer && layer.startsWith("subcomponent:")) {
            layer = layer.substring("subcomponent:".length);
        }
        // if (key === "$layers") {
        //    layer = fluid.peek(value);
        //}

        const entry = {id, layer, shadow, parent};
        let entryValue;
        const reactiveRoot = fluid.findReactiveRoot(shadow.shadowMap, segs);
        if (reactiveRoot) {
            layer = fluid.get(shadow.layerMap, reactiveRoot)?.[$m].source;
        }
        let effLayer = layer,
            valuePrefix = "";
        if (reactiveRoot) {
            effLayer = layer === "live" ? "$live" : "$reactive";
            if (fluid.arrayEqual(reactiveRoot, segs)) {
                const displayLayer = layer === "live" ? "Live" : "Live Unmodified";
                valuePrefix = `<span class="fl-layer-link" data-fl-layer-name="${id}">${displayLayer}</span> `;
            }
        }

        const pushChild = function (key, subValue) {
            const newSegs = [...segs, key];
            return self.valueToEntry(shadow, newSegs, subValue, null, entry);
        };

        if (fluid.isComponent(value)) {
            const compEntry = self.componentToEntry(value[$m], layer);
            entryValue = compEntry.value;
            entry.children = compEntry.children;
            entry.id = compEntry.id;
            entry.variety = "$component";
        } else if ((!layer || ("" + key).startsWith("$") || /* self.userLayersOnly && */ !fluid.isUserLayer(layer)) && !reactiveRoot) {
            return fluid.NoValue; // Bottom out display once we are off the end of our mat or layer should not be shown
        } else if (rec && !reactiveRoot) {
            entryValue = fluid.substrateTree.renderShadowRec(rec);
        }
        if (!entryValue) {
            if (fluid.isUnavailable(value)) {
                entryValue = value;
            } else if (fluid.isPrimitive(value) || !fluid.isPlainObject(value)) {
                entryValue = renderRef(value);
            } else if (key === "$layers") {
                const filtered = self.userLayersOnly ? value.filter(fluid.isUserLayer) : value;
                // TODO: should really colour based on where specification came from rather than in their own colour
                const colLayers = filtered.map(layer => ({layer, colour: self.colourForLayer(layer)})).map(
                    ({layer, colour}) => `<span ${styleForCol(colour)}>${layer}</span>`);
                entryValue = `(${colLayers.join(", ")})`;
            } else if (Array.isArray(value)) {
                entryValue = `Array(${value.length})`;
                entry.children = fluid.map(value, (subValue, key) => pushChild(key, subValue));
            } else if (fluid.isPlainObject(value)) {
                entryValue = "Object";
                const entries = Object.entries(value).map(([key, subValue]) => ({key, subValue}));
                entry.children = fluid.map(entries, ({key, subValue}) => pushChild(key, subValue));
                // Could improve preview here by going back up tree
            }
        }

        const col = styleForCol(self.colourForLayer(effLayer)); // For Memphis

        let layerElemClass = "", layerElemRef = "";
        if (layer && !reactiveRoot) {
            layerElemClass = " fl-layer-link";
            const layerRef = fluid.renderLayerRef(layer, segs);
            layerElemRef = `data-fl-layer-element="${layerRef}"`;
        }

        entry.value = `<span class="fl-substrate-key${layerElemClass}" ${layerElemRef} ${col}>${key}</span><span ${col}>: </span>` +
             `<span class="fl-substrate-value" ${col}>${valuePrefix}${entryValue}</span>`;
        return entry;
    };

    fluid.substrateTree.rowFold = function (rowid, folded) {
        const foldChar = folded === "folded" ? "chevron-right" : folded === "unfolded" ? "chevron-down" : "none";
        const active = foldChar === "none" ? "inactive" : " active";
        return `
    <span class="pretty p-icon fl-fold-control ${active}">
        <span class="state">
            <i class="fl-icon mdi mdi-${foldChar}"></i>
            <label></label>
        </span>
    </span>`;
    };

    /**
     * Represents a tree entry in the substrate tree.
     * Each entry contains a value, a unique identifier, and optionally, child entries.
     *
     * @typedef {Object} Entry
     * @property {Object} value - The value associated with the tree entry.
     * @property {String} id - A unique identifier for the tree entry.
     * @property {Entry[]} [children] - An optional array of child entries.
     */

    /**
     * Generates an HTML list item representing a tree entry in the substrate tree.
     * This function recursively processes the tree entry and its children to construct
     * a nested HTML structure. It also applies decorations and folding controls based
     * on the provided options and state.
     * @param {fluid.substrateTree} self - The substrateTree component
     * @param {Entry} entry - The tree entry to render.
     * @param {Object} options - Configuration options for rendering the tree item.
     * @param {Object} idToState - A mapping of entry IDs to their corresponding state.
     * @param {String} [idToState.folded] - The folding state of the entry ("folded", "unfolded", or undefined).
     * @return {String} The generated HTML string for the tree item.
     */
    fluid.substrateTree.treeItem = function (self, entry, options, idToState) {
        const {value, id} = entry;
        const rowid = `data-row-id="${id}"`;

        const header = `<li class="fl-substrate-row" ${rowid}>`;

        const rowState = idToState[id] || {};
        const pLayer = fluid.peek(entry.shadow.that.$layers);
        const subList = entry.children && entry.children.length > 0 ?
            fluid.substrateTree.treeList(self, pLayer, rowState.folded === "folded" ? [] : entry.children, options, idToState) : "";
        const footer = "</li>";
        const fold = options.unfoldable ? fluid.substrateTree.rowFold(rowid, rowState.folded) : "";
        const decoration = options.decoration ? options.decoration(value) : "";
        return header + fold + decoration + entry.value + subList + footer;
    };

    fluid.substrateTree.treeList = function (self, pLayer, entries, options, idToState) {
        const col = self.colourForLayer(pLayer);
        const grad = `style="background-image: linear-gradient(to right, ${col}, ${col} 50px, 50px, transparent 100%"`;
        return entries.length ?
            `<ul ${grad}>` + entries.map(function (entry) {
                return fluid.substrateTree.treeItem(self, entry, options, idToState);
            }).join("") + "</ul>" : "";
    };

    fluid.substrateTree.renderTemplate = function (self, rootEntries, idToState) {
        const domListeners = self.domListeners;
        const bindSpec = Object.values(domListeners).map(lrec => {
            const [selector, event, listener] = lrec.split(" : ");
            if (selector !== "/") {
                fluid.fail("Only binding events to template root is currently supported");
            }
            return `@on${event}="${listener}"`;
        }).join(" ");
        return `<div class="fl-substrate-pane" ${bindSpec}>${fluid.substrateTree.treeList(self, null, rootEntries, self.renderOptions, idToState)}</div>`;
    };

    fluid.substrateTree.highlight = function (self, inspectingSite) {
        const overlay = document.getElementById("fl-editor-inspect-overlay");
        const id = inspectingSite && fluid.renderSite(inspectingSite);
        const target = id && self.container.querySelector(`[data-row-id="${id}"]`);
        fluid.applyOverlay({selfOverlay: overlay}, target, "hsl(0 0% 70%)");
    };

    fluid.substrateTree.mouseover = function (e, editorRoot) {
        const closestHover = e.target.closest(".fl-substrate-hover");
        const closestRow = e.target.closest("[data-row-id]");
        if (closestHover && closestRow) {
            const id = closestRow.getAttribute("data-row-id");
            const site = fluid.parseSite(id, editorRoot);
            editorRoot.inspectingSite = site;
        } else {
            editorRoot.inspectingSite = null;
        }
    };

    fluid.substrateTree.mouseleave = function (editorRoot) {
        editorRoot.inspectingSite = null;
    };

    fluid.substrateTree.foldClick = function (e, self) {
        console.log("Click handler on ", e.target);
        const fold = e.target.closest(".fl-fold-control.active");

        if (fold) {
            const closestRow = e.target.closest("[data-row-id]");
            const id = closestRow.getAttribute("data-row-id");
            const oldState = self.idToState[id].folded;
            const newState = oldState === "folded" ? "unfolded" : "folded";
            self.userState[id] = {folded: newState};
        }
    };

};


if (typeof(fluid) !== "undefined") {
    fluidSubstrateScope(fluid);
}
