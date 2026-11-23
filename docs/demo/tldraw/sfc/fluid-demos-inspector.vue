<script>
// The inspector - a widget showing the structure and source of the Infusion widget nearest it on the canvas, following
// whichever widget is nearest as it is dragged about. Its upper left pane, "Containment", shows the tree of components
// within the widget, each labelled by its member name in its parent, and its upper right pane, "Hierarchy", the
// inheritance of the user layers of the component selected in the containment view. Views are shown in the
// containment view too, ringed with a dashed line. Below, a tab for each layer of
// the widget's PTF encoding holds the layer's source in a CodeMirror 6 editor - an edit is applied live, redefining the
// layer, and so every component bearing it, as soon as the user pauses in typing. Selecting a component selects
// the tab of its most derived layer, and selecting a layer in the hierarchy selects its tab. Tabs and nodes are coloured
// for their layers by fluid.layerColourManager, as are the tabs of the substrate-oriented editor, fluid.editorRoot.
// Selecting a component with no user layers - grey, made from framework layers and configured where it is declared -
// selects the tab of the layer declaring it, scrolled to its declaration, as found by the defMaps of fluid.editor. An
// anchor line, drawn on the canvas, joins the closest pair of the corners and edge midpoints of the inspector and the
// widget it inspects. A widget which is not available, e.g. since an edit has broken one of its layers, is shown by its
// layers alone, so that they may be repaired. Besides fluid-lint's own diagnostics, each editor's gutter marks the
// problems diagnosed in the widget where the layer's text names what they concern. The wheel scrolls whichever editor
// lies beneath the pointer, as on Unix desktops, rather than panning the canvas. The inspected widget's shape is
// outlined as it would be if it were hovered.

fluid.def("fluid.demos.inspector", {
    $layers: "fluid.topLevelWidget",
    $importMap: {
        "fluid.resizeBar": "%infusion-6/src/components/sfc/fluid-resizeBar.vue"
    },
    preferredSize: {
        w: 760,
        h: 640
    },
    // The path within the inspected widget of the component selected in the containment view, or `null` for its root
    selectedPath: null,
    // The layer selected in the hierarchy view or by its tab, or `null` for the most derived of the selected component
    selectedLayer: null,
    colourManager: {
        $component: {
            $layers: "fluid.layerColourManager"
        }
    },
    // The id of the shape hosting the widget nearest us - which may be another inspector
    targetShapeId: "$compute:fluid.demos.inspector.nearestWidget({tldrawHost}.widgetShapes, {self}.hostBounds, {self}.view.shapeId)",
    // The structure of the inspected widget - its components and the layers of its PTF encoding
    // The layer of the shape hosting the inspected widget, which is described by it whilst the widget is not available
    targetLayer: "$compute:fluid.demos.inspector.targetLayer({tldrawHost}.widgetShapes, {self}.targetShapeId)",
    model: "$compute:fluid.demos.inspector.describe({self}.targetShapeId, {self}.targetLayer, {tldrawHost}.widgetsVersion, {colourManager})",
    parts: "{self}.model.parts",
    title: "{self}.model.title",
    effectivePath: "$compute:fluid.demos.inspector.effectivePath({self}.model, {self}.selectedPath)",
    hierarchy: "$compute:fluid.demos.inspector.hierarchy({self}.model, {self}.effectivePath, {colourManager})",
    // Where the selected component is declared, if it has no user layers of its own
    defSite: "$compute:fluid.demos.inspector.defSite({self}.model, {self}.effectivePath)",
    effectiveLayer: "$compute:fluid.demos.inspector.effectiveLayer({self}.model, {self}.hierarchy, {self}.selectedLayer, {self}.defSite)",
    renderGraphs: "$effect:fluid.demos.inspector.renderGraphs({self}, {self}.view.renderedContainer, {self}.model, {self}.effectivePath, {self}.hierarchy, {self}.effectiveLayer, {self}.defSite)",
    // The anchor line joining the inspector to the widget it inspects, drawn on the canvas beyond the inspector's shape
    anchor: "$compute:fluid.demos.inspector.anchor({self}.hostBounds, {tldrawHost}.widgetShapes, {self}.targetShapeId)",
    anchorLine: {
        $bindable: {
            bind: "fluid.demos.inspector.bindAnchorLine({tldrawHost}.canvasLayer)",
            unbind: "fluid.demos.inspector.unbindAnchorLine({boundValue})"
        }
    },
    drawAnchor: "$effect:fluid.demos.inspector.drawAnchor({self}.anchorLine, {self}.anchor)",
    // The inspected widget's shape is indicated as it would be if it were hovered
    markTarget: {
        $bindable: {
            bind: "fluid.tldraw.markShape({self}.targetShapeId)",
            unbind: "fluid.tldraw.unmarkShape({boundValue})"
        }
    },
    // The problems diagnosed in the inspected widget, as reported by its badge, shown in the gutters of the editors of
    // the layers in whose text they are found
    problems: "$compute:fluid.demos.inspector.problems({self}.targetShapeId, {tldrawHost}.widgetsVersion)",
    // Divides the graphs above from the editors below
    resizeBar: {
        $component: {
            $layers: "fluid.resizeBar",
            axis: "vertical",
            before: "$compute:fluid.demos.inspector.pane({inspector}.view.renderedContainer, upper)",
            after: "$compute:fluid.demos.inspector.pane({inspector}.view.renderedContainer, lower)",
            minBefore: 80,
            minAfter: 120,
            view: {
                $component: {
                    container: "$compute:fluid.demos.inspector.pane({inspector}.view.renderedContainer, resize-bar)",
                    elideParent: true
                }
            }
        }
    },
    tabs: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{inspector}.parts",
                valueAs: "part"
            },
            isActive: "$compute:fluid.demos.inspector.isActive({self}.part, {inspector}.effectiveLayer)",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<div class="fl-inspector-tab" @class="active:@{isActive}" style="background-color: @{part.colour}"
    @onclick="{inspector}.selectedLayer = {self}.part.layerName">@{part.layerName}</div>`
                }
            }
        }
    },
    editors: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{inspector}.parts",
                valueAs: "part"
            },
            isActive: "$compute:fluid.demos.inspector.isActive({self}.part, {inspector}.effectiveLayer)",
            // Bound by the layer's name and kind alone, so that the editor survives the renewal of the part's text which
            // its own edits cause - a change of text from elsewhere is brought in by syncEditor
            layerName: "{self}.part.layerName",
            kind: "{self}.part.kind",
            editor: {
                $bindable: {
                    bind: "fluid.demos.inspector.bindEditor({self}.view.renderedContainer, {self}.layerName, {self}.kind)",
                    unbind: "fluid.demos.inspector.unbindEditor({boundValue})"
                }
            },
            syncEditor: "$effect:fluid.demos.inspector.syncEditor({self}.editor, {self}.part.text)",
            showProblems: "$effect:fluid.demos.inspector.showProblems({self}.editor, {inspector}.problems, {inspector}.parts)",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<div class="fl-inspector-editor" @class="active:@{isActive}"></div>`
                }
            }
        }
    }
});

// The module path of the bundle of fluid-lint and CodeMirror 6 which the editors use, as for fluid.liveExample
fluid.demos.inspector.editorBundle = "%infusion-6/src/lib/fluid-lint/fluid-lint.js";

// The geometry of the node and edge views
fluid.demos.inspector.geometry = {
    xSpacing: 96,
    ySpacing: 74,
    margin: 44,
    radius: 15,
    minWidth: 420,
    minHeight: 260
};

/**
 * Load the bundle of fluid-lint and CodeMirror 6, once for the whole document
 * @return {Promise<Object>} Resolves to `fluid.codemirror6` once it is loaded
 */
fluid.demos.inspector.loadEditorBundle = function () {
    if (!fluid.demos.inspector.bundlePromise) {
        fluid.demos.inspector.bundlePromise = fluid.codemirror6 ? Promise.resolve(fluid.codemirror6) : new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = fluid.module.resolvePath(fluid.demos.inspector.editorBundle);
            script.onload = () => resolve(fluid.codemirror6);
            script.onerror = () => reject(new Error("Couldn't load " + script.src));
            document.head.appendChild(script);
        });
    }
    return fluid.demos.inspector.bundlePromise;
};

// How long the user may pause in typing before their edit of a layer is applied, in milliseconds
fluid.demos.inspector.applyDelay = 400;

/**
 * Find one of the panes of the inspector's markup
 * @param {Element} container - The inspector's rendered container
 * @param {String} name - The name of the pane, as the suffix of its class "fl-inspector-<name>"
 * @return {Element} The pane
 */
fluid.demos.inspector.pane = function (container, name) {
    return container.querySelector(".fl-inspector-" + name);
};

/**
 * Find the shape hosting the widget nearest the inspector, measuring between the centres of shapes
 * @param {WidgetShapeRec[]} shapes - The shapes hosting widgets on the current page
 * @param {ShapeBounds|null} bounds - The bounds of the inspector's own shape, or `null` if it is not hosted on a canvas
 * @param {String|null} ownShapeId - The id of the inspector's own shape
 * @return {String|null} The id of the nearest shape, or `null` if there is none
 */
fluid.demos.inspector.nearestWidget = function (shapes, bounds, ownShapeId) {
    let togo = null;
    if (bounds) {
        const centre = rec => ({x: rec.x + rec.w / 2, y: rec.y + rec.h / 2});
        const own = centre(bounds);
        let best = Infinity;
        shapes.filter(shape => shape.id !== ownShapeId).forEach(shape => {
            const other = centre(shape);
            const distance = Math.hypot(other.x - own.x, other.y - own.y);
            if (distance < best) {
                best = distance;
                togo = shape.id;
            }
        });
    }
    return togo;
};

/**
 * Find the layer of the shape hosting the inspected widget
 * @param {WidgetShapeRec[]} shapes - The shapes hosting widgets on the current page
 * @param {String|null} targetShapeId - The id of the shape
 * @return {String|null} The name of its layer, or `null` if there is no such shape
 */
fluid.demos.inspector.targetLayer = function (shapes, targetShapeId) {
    const shape = shapes.find(candidate => candidate.id === targetShapeId);
    return shape ? shape.layerName : null;
};

/**
 * @typedef {Object} AnchorRec
 * @property {Number} x1 - The x coordinate in page space of the end of the anchor line on the inspector's shape
 * @property {Number} y1 - Its y coordinate
 * @property {Number} x2 - The x coordinate in page space of its end on the inspected widget's shape
 * @property {Number} y2 - Its y coordinate
 */

/**
 * The points of a rectangle at which an anchor line may end - its corners and the midpoints of its edges
 * @param {ShapeBounds} rect - The rectangle
 * @return {Object[]} The points, each as `{x, y}`
 */
fluid.demos.inspector.anchorPoints = function (rect) {
    const fractions = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
    return fractions.map(([fx, fy]) => ({x: rect.x + fx * rect.w, y: rect.y + fy * rect.h}));
};

/**
 * Compute the anchor line joining the inspector to the widget it inspects - between the closest pair of the points
 * of the two shapes given by `fluid.demos.inspector.anchorPoints`, treating both alike
 * @param {ShapeBounds|null} bounds - The bounds of the inspector's own shape, or `null` if it is not hosted on a canvas
 * @param {WidgetShapeRec[]} shapes - The shapes hosting widgets on the current page
 * @param {String|null} targetShapeId - The id of the shape of the inspected widget
 * @return {AnchorRec|null} The line, or `null` if there is none - since nothing is inspected, or the shapes overlap
 */
fluid.demos.inspector.anchor = function (bounds, shapes, targetShapeId) {
    const target = bounds ? shapes.find(shape => shape.id === targetShapeId) : null;
    const overlap = target && bounds.x < target.x + target.w && target.x < bounds.x + bounds.w
        && bounds.y < target.y + target.h && target.y < bounds.y + bounds.h;
    let togo = null;
    if (target && !overlap) {
        let best = Infinity;
        fluid.demos.inspector.anchorPoints(bounds).forEach(from => {
            fluid.demos.inspector.anchorPoints(target).forEach(to => {
                const distance = Math.hypot(to.x - from.x, to.y - from.y);
                if (distance < best) {
                    best = distance;
                    togo = {x1: from.x, y1: from.y, x2: to.x, y2: to.y};
                }
            });
        });
    }
    return togo;
};

// The margin about the anchor line within the element drawing it, holding its connectors
fluid.demos.inspector.anchorMargin = 8;

/**
 * Construct the elements drawing the anchor line on the canvas - a line ending in a small circular connector at each
 * end
 * @param {Element|null} canvasLayer - The element on the canvas in page space, or `null` if there is none
 * @return {Object} A record of the elements, to be drawn by `fluid.demos.inspector.drawAnchor` and removed by
 * `fluid.demos.inspector.unbindAnchorLine`
 */
fluid.demos.inspector.bindAnchorLine = function (canvasLayer) {
    const svg = fluid.demos.inspector.svg;
    const togo = {root: null, line: null, ends: []};
    if (canvasLayer) {
        // Placed and sized by its own style to span the line, rather than drawing beyond its bounds, which some
        // browsers, e.g. Chrome 109, place wrongly within a transformed layer
        togo.root = svg("svg", {class: "fl-inspector-anchor", style: "position: absolute; pointer-events: none"}, canvasLayer);
        togo.line = svg("line", {class: "fl-inspector-anchor-line"}, togo.root);
        togo.ends = [0, 1].map(() => svg("circle", {class: "fl-inspector-anchor-end", r: 4}, togo.root));
    }
    return togo;
};

/**
 * Remove the elements drawing the anchor line
 * @param {Object} anchorLine - The record made by `fluid.demos.inspector.bindAnchorLine`
 */
fluid.demos.inspector.unbindAnchorLine = function (anchorLine) {
    if (anchorLine.root) {
        anchorLine.root.remove();
    }
};

/**
 * Draw the anchor line, or hide it if there is none
 * @param {Object} anchorLine - The record made by `fluid.demos.inspector.bindAnchorLine`
 * @param {AnchorRec|null} anchor - The line to be drawn
 */
fluid.demos.inspector.drawAnchor = function (anchorLine, anchor) {
    if (anchorLine.root) {
        const root = anchorLine.root;
        root.style.display = anchor ? "" : "none";
        if (anchor) {
            const margin = fluid.demos.inspector.anchorMargin;
            const left = Math.min(anchor.x1, anchor.x2) - margin, top = Math.min(anchor.y1, anchor.y2) - margin;
            const width = Math.abs(anchor.x2 - anchor.x1) + 2 * margin, height = Math.abs(anchor.y2 - anchor.y1) + 2 * margin;
            Object.assign(root.style, {left: left + "px", top: top + "px", width: width + "px", height: height + "px"});
            root.setAttribute("viewBox", `0 0 ${width} ${height}`);
            const ends = [[anchor.x1 - left, anchor.y1 - top], [anchor.x2 - left, anchor.y2 - top]];
            fluid.each({x1: ends[0][0], y1: ends[0][1], x2: ends[1][0], y2: ends[1][1]}, (value, key) => anchorLine.line.setAttribute(key, value));
            ends.forEach(([x, y], i) => {
                anchorLine.ends[i].setAttribute("cx", x);
                anchorLine.ends[i].setAttribute("cy", y);
            });
        }
    }
};

/**
 * Allocate the colour of a layer, as the substrate-oriented editor does, without the allocation becoming a dependency
 * of the computation asking for it
 * @param {fluid.layerColourManager} colourManager - The colour manager
 * @param {String} layerName - The name of the layer
 * @return {String} The layer's colour
 */
fluid.demos.inspector.colourOf = function (colourManager, layerName) {
    return fluid.cell.untracked(() => colourManager.allocateColour(layerName, fluid.def(layerName) || {}));
};

// The layers marking a component as a view - fluid.topLevelWidgetView is a mixin which the view of every top-level
// widget bears, whether or not its other layers make it a view proper
fluid.demos.inspector.viewLayers = ["fluid.viewComponent", "fluid.topLevelWidgetView"];

/**
 * Determine whether a component is a view
 * @param {fluid.component} that - The component
 * @return {Boolean} `true` if any of its layers is, or reaches, one of `fluid.demos.inspector.viewLayers`
 */
fluid.demos.inspector.isView = function (that) {
    const viewLayers = fluid.demos.inspector.viewLayers;
    return fluid.makeArray(fluid.deSignal(that.$layers)).some(layerName => typeof(layerName) === "string"
        && !fluid.isReferenceOrExpander(layerName) && (viewLayers.includes(layerName)
            || viewLayers.some(viewLayer => fluid.ptf.layerAncestors(layerName).has(viewLayer))));
};

/**
 * The user layers from which a layer derives, as named in its own `$layers`
 * @param {String} layerName - The name of the layer
 * @return {String[]} The names of its parent user layers
 */
fluid.demos.inspector.parentLayers = function (layerName) {
    const def = fluid.def(layerName);
    return fluid.makeArray(def && def.$layers).filter(parent => typeof(parent) === "string"
        && !fluid.isReferenceOrExpander(parent) && fluid.isUserLayer(parent));
};

/**
 * The user layers of a component, in the order of its `$layers`
 * @param {fluid.component} that - The component
 * @return {String[]} The names of its user layers
 */
fluid.demos.inspector.userLayersOf = function (that) {
    return fluid.makeArray(fluid.deSignal(that.$layers)).filter(layerName => typeof(layerName) === "string"
        && !fluid.isReferenceOrExpander(layerName) && fluid.isUserLayer(layerName));
};

/**
 * @typedef {Object} InspectorNode
 * @property {String} path - The path of the component within the inspected widget, as the filename of its PTF parts
 * @property {String[]} segs - The member names leading to it from the inspected widget
 * @property {String|null} parentPath - The path of the component enclosing it, or `null` for the root
 * @property {String} label - Its member name in its parent, or for the root, the nickname of its most derived layer
 * @property {Boolean} isView - `true` if it is a view
 * @property {String[]} layers - Its user layers
 * @property {String} colour - The colour of its most derived user layer
 */

/**
 * @typedef {Object} InspectorPart
 * @property {String} layerName - The name of the layer
 * @property {String} kind - "vue" for a Single File Component, otherwise "js"
 * @property {String} contentType - The MIME type of its PTF part
 * @property {String} text - The layer's source, as encoded in the widget's PTF
 * @property {String} colour - The layer's colour
 */

/**
 * @typedef {Object} InspectorModel
 * @property {String} title - A description of what is inspected
 * @property {InspectorNode[]} nodes - The components of the widget, its views amongst them, its root first
 * @property {InspectorPart[]} parts - The layers of the widget's PTF encoding
 */

// The layers of the encoding of each widget inspected, by the id of its shape, as last found whilst the widget was
// available - so that they can still be edited whilst it is not, e.g. since an edit has broken one of them
fluid.demos.inspector.lastLayers = new Map();

/**
 * Label the root of the inspected widget by the nickname of its most derived layer
 * @param {String[]} layers - The user layers of the root
 * @return {String} The label, or "/" if it has no user layers
 */
fluid.demos.inspector.rootLabel = function (layers) {
    return layers.length > 0 ? fluid.computeNickName(fluid.peek(layers)) : "/";
};

/**
 * Encode the layers of a widget as parts, omitting any which cannot be encoded, e.g. since they are not defined
 * @param {String[]} layerNames - The names of the layers
 * @param {Function} colourOf - Allocates the colour of a layer
 * @return {InspectorPart[]} The parts
 */
fluid.demos.inspector.layersToParts = function (layerNames, colourOf) {
    return layerNames.map(layerName => {
        let part = null;
        try {
            part = fluid.ptf.layerToPart(layerName);
        } catch (e) {
            // A layer which is not defined has no text to be edited
        }
        return part;
    }).filter(part => part).map(part => ({
        layerName: part.filename,
        kind: part.contentType === fluid.layerMimeTypes.sfc ? "vue" : "js",
        contentType: part.contentType,
        text: part.body,
        colour: colourOf(part.filename)
    }));
};

/**
 * Describe a widget which is not available, e.g. since an edit has broken one of its layers, so that its layers may
 * still be edited, and so repaired - those found whilst it was last available, together with the layer of its shape
 * and the user layers from which that derives. Only its root is shown.
 * @param {String} shapeId - The id of the shape hosting the widget
 * @param {String|null} layerName - The layer of the shape, or `null` if it is not known
 * @param {String} why - Why the widget is not available
 * @param {Function} colourOf - Allocates the colour of a layer
 * @return {InspectorModel} The description
 */
fluid.demos.inspector.describeUnavailable = function (shapeId, layerName, why, colourOf) {
    const own = layerName ? [layerName, ...[...fluid.ptf.layerAncestors(layerName)].filter(fluid.isUserLayer)] : [];
    const layerNames = [...new Set([...own, ...fluid.demos.inspector.lastLayers.get(shapeId) || []])];
    const parts = fluid.demos.inspector.layersToParts(layerNames, colourOf);
    // Its user layers, the most derived last, as for an available component
    const layers = own.filter(fluid.isUserLayer).reverse();
    const nodes = layerName ? [{
        path: fluid.ptf.segsToFilename([]),
        segs: [],
        parentPath: null,
        label: fluid.computeNickName(layerName),
        isView: false,
        layers,
        colour: layers.length > 0 ? colourOf(fluid.peek(layers)) : "#c8c8c8"
    }] : [];
    return {
        title: `${layerName || "The widget"} in shape ${shapeId} is not available - ${why}${parts.length > 0 ? " - its layers may still be edited below" : ""}`,
        nodes,
        parts
    };
};

/**
 * Describe the structure of the widget hosted by a shape. The description follows the widget's components as they
 * are created, destroyed and change their layers - e.g. a member of a `$for` created as its source grows, or a
 * subcomponent acquiring its layers once its `$if` holds. A widget which is not available is described by its layers
 * alone - see `fluid.demos.inspector.describeUnavailable`.
 * @param {String|null} shapeId - The id of the shape, or `null` if there is none
 * @param {String|null} layerName - The layer of the shape, or `null` if it is not known
 * @param {Number} widgetsVersion - The count of changes to the widgets on the canvas, so that the description is
 * renewed as the widget is constructed
 * @param {fluid.layerColourManager} colourManager - Allocates the colours of layers
 * @return {InspectorModel} The description
 */
fluid.demos.inspector.describe = function (shapeId, layerName, widgetsVersion, colourManager) {
    const that = shapeId ? fluid.tldraw.widgetForShape(shapeId) : null;
    const colourOf = name => fluid.demos.inspector.colourOf(colourManager, name);
    let togo;
    if (!shapeId) {
        togo = {title: "No widget to inspect - drag the inspector near one", nodes: [], parts: []};
    } else if (!that) {
        togo = fluid.demos.inspector.describeUnavailable(shapeId, layerName, "it has not been constructed", colourOf);
    } else if (fluid.isUnavailable(that)) {
        const unavailable = fluid.deproxyUnavailable(that);
        togo = fluid.demos.inspector.describeUnavailable(shapeId, layerName, unavailable.message || "it is incomplete", colourOf);
    } else {
        try {
            // Read so as to be reevaluated as the widget's components are created, destroyed or change their layers
            fluid.liveQueryILSelector(that, "fluid.component").get();
            const nodes = [];
            const rootShadow = fluid.ptf.componentToShadow(that);
            const visit = function (shadow, segs, parentPath) {
                if (shadow.that) {
                    const layers = fluid.demos.inspector.userLayersOf(shadow.that);
                    const path = fluid.ptf.segsToFilename(segs);
                    nodes.push({
                        path,
                        segs,
                        parentPath,
                        // The root's member name, within the tldrawHost, is that of its shape, and tells nothing
                        label: segs.length === 0 ? fluid.demos.inspector.rootLabel(layers) : fluid.peek(segs),
                        isView: segs.length > 0 && fluid.demos.inspector.isView(shadow.that),
                        layers,
                        // A component made from framework layers alone, e.g. a list or a view, or configured inline, is grey
                        colour: layers.length > 0 ? colourOf(fluid.peek(layers)) : "#c8c8c8"
                    });
                    fluid.each(shadow.childComponents, (childShadow, memberName) => {
                        // Only components created in place - one injected from elsewhere is shown where it was created
                        if (childShadow.path === fluid.composeSegment(shadow.path, memberName)) {
                            visit(childShadow, [...segs, memberName], path);
                        }
                    });
                } else {
                    // A component still being constructed, e.g. a view whilst its template loads, is shown once it is
                    // available - read so that the description is renewed then
                    shadow.availableInstance?.get();
                }
            };
            visit(rootShadow, [], null);
            const layerNames = fluid.ptf.componentToParts(that).filter(part => part.kind === "layer").map(part => part.filename);
            fluid.demos.inspector.lastLayers.set(shapeId, layerNames);
            const parts = fluid.demos.inspector.layersToParts(layerNames, colourOf);
            togo = {title: `${fluid.peek(nodes[0].layers) || "Widget"} in shape ${shapeId}`, nodes, parts};
        } catch (e) {
            togo = fluid.demos.inspector.describeUnavailable(shapeId, layerName, `it could not be inspected: ${e.message}`, colourOf);
        }
    }
    return togo;
};

/**
 * Determine the path of the component whose hierarchy is shown - the one selected, if the inspected widget still holds
 * it, and otherwise the widget's root
 * @param {InspectorModel} model - The description of the inspected widget
 * @param {String|null} selectedPath - The path selected in the containment view
 * @return {String|null} The path, or `null` if there is no widget
 */
fluid.demos.inspector.effectivePath = function (model, selectedPath) {
    const selected = model.nodes.find(node => node.path === selectedPath);
    return selected ? selected.path : model.nodes[0]?.path ?? null;
};

/**
 * @typedef {Object} InspectorHierarchy
 * @property {Object[]} nodes - Each user layer reached, as `{layerName, depth, colour}`, depth 0 holding the layers from
 * which the component was made directly, and each layer lying below every layer deriving from it
 * @property {Array[]} edges - Each derivation as `[derived, parent]`
 * @property {String|null} mostDerived - The layer of greatest precedence from which the component was made directly
 */

/**
 * Trace the inheritance of the user layers of a component of the inspected widget
 * @param {InspectorModel} model - The description of the inspected widget
 * @param {String|null} path - The path of the component
 * @param {fluid.layerColourManager} colourManager - Allocates the colours of layers
 * @return {InspectorHierarchy} The hierarchy
 */
fluid.demos.inspector.hierarchy = function (model, path, colourManager) {
    const node = model.nodes.find(candidate => candidate.path === path);
    const depths = new Map();
    const edges = [];
    const visit = function (layerName, depth, trail) {
        if (!trail.has(layerName)) {
            depths.set(layerName, Math.max(depths.get(layerName) ?? 0, depth));
            fluid.demos.inspector.parentLayers(layerName).forEach(parent => {
                if (!edges.some(([from, to]) => from === layerName && to === parent)) {
                    edges.push([layerName, parent]);
                }
                visit(parent, depth + 1, new Set([...trail, layerName]));
            });
        }
    };
    // The component's $layers are linearised, holding every layer from which it derives - those it was made from
    // directly are those from which none of the others derives
    const all = node ? node.layers : [];
    const ancestors = new Set();
    const collect = layerName => fluid.demos.inspector.parentLayers(layerName).forEach(parent => {
        if (!ancestors.has(parent)) {
            ancestors.add(parent);
            collect(parent);
        }
    });
    all.forEach(collect);
    const direct = all.filter(layerName => !ancestors.has(layerName));
    direct.forEach(layerName => visit(layerName, 0, new Set()));
    return {
        nodes: [...depths].map(([layerName, depth]) => ({layerName, depth, colour: fluid.demos.inspector.colourOf(colourManager, layerName)})),
        edges,
        // The last in linearised order takes precedence
        mostDerived: fluid.peek(direct) ?? null
    };
};

/**
 * Find the source positions of the definitions which a layer's encoded text writes, as fluid.editor finds them - see
 * `fluid.parseDefMaps` in defMaps.js. Those of a Single File Component are found within each of its inline scripts.
 * @param {InspectorPart} part - The layer's part
 * @return {DefMap} The positions of the definitions, within the part's text - empty if they could not be found
 */
fluid.demos.inspector.partDefMap = function (part) {
    const togo = {};
    try {
        if (part.kind === "vue") {
            for (const match of part.text.matchAll(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/g)) {
                Object.assign(togo, fluid.parseDefMaps(match[1], match.index + match[0].indexOf(">") + 1));
            }
        } else {
            Object.assign(togo, fluid.parseDefMaps(part.text, 0));
        }
    } catch (e) {
        // Text which does not parse as defMaps expects, e.g. whilst it is being edited, locates nothing
    }
    return togo;
};

/**
 * Follow member names through the positions of a layer's definition, passing into the record of each `$component`
 * reached. A member of a `$for`, named by its index, is declared by the record of its list, and its index is passed
 * over.
 * @param {DefMapNode} defMapNode - The positions of the layer's definition
 * @param {String[]} segs - The member names
 * @return {SourceRange|null} The range of the value of the last member found, or `null` if the first is not found
 */
fluid.demos.inspector.followDefMap = function (defMapNode, segs) {
    let node = defMapNode, range = null;
    segs.forEach(seg => {
        if (node && node[seg]) {
            range = node[seg][fluid.metadataSymbol] || range;
            node = node[seg].$component || node[seg];
        } else if (!/^\d+$/.test(seg)) {
            node = null;
            range = null;
        }
    });
    return range;
};

/**
 * @typedef {Object} DefSite
 * @property {String} layerName - The layer whose text declares the component
 * @property {Number} from - The start of the declaration within the layer's text
 * @property {Number} to - Its end
 */

/**
 * Find where a component with no user layers - grey in the containment view - is declared: within the text of a user
 * layer of the nearest component enclosing it whose layers declare it, the most derived of them first. A view which
 * its component's Single File Component supplies through its `<template>` block is declared there.
 * @param {InspectorModel} model - The description of the inspected widget
 * @param {String|null} path - The path of the component
 * @return {DefSite|null} Where it is declared, or `null` if it has user layers, or its declaration is not found
 */
fluid.demos.inspector.defSite = function (model, path) {
    const node = model.nodes.find(candidate => candidate.path === path);
    let togo = null;
    if (node && node.layers.length === 0 && node.segs.length > 0) {
        const partOf = layerName => model.parts.find(part => part.layerName === layerName);
        for (let depth = node.segs.length - 1; depth >= 0 && !togo; --depth) {
            const ancestorPath = fluid.ptf.segsToFilename(node.segs.slice(0, depth));
            const ancestor = model.nodes.find(candidate => candidate.path === ancestorPath);
            const rest = node.segs.slice(depth);
            const layers = ancestor ? [...ancestor.layers].reverse().filter(partOf) : [];
            layers.forEach(layerName => {
                if (!togo) {
                    const part = partOf(layerName);
                    const range = fluid.demos.inspector.followDefMap(fluid.demos.inspector.partDefMap(part)[layerName], rest);
                    const templateAt = part.kind === "vue" && rest.length === 1 && rest[0] === "view" ? part.text.indexOf("<template>") : -1;
                    if (range) {
                        togo = {layerName, from: range.from, to: range.to};
                    } else if (templateAt !== -1) {
                        togo = {layerName, from: templateAt, to: templateAt + "<template>".length};
                    }
                }
            });
        }
    }
    return togo;
};

/**
 * Determine the layer whose tab is shown - the one selected, if the widget's encoding holds it, otherwise the most
 * derived layer of the selected component, otherwise that declaring it if it has no user layers, otherwise the first
 * @param {InspectorModel} model - The description of the inspected widget
 * @param {InspectorHierarchy} hierarchy - The hierarchy of the selected component
 * @param {String|null} selectedLayer - The layer selected in the hierarchy view or by its tab
 * @param {DefSite|null} defSite - Where the selected component is declared, if it has no user layers
 * @return {String|null} The name of the layer, or `null` if there is none
 */
fluid.demos.inspector.effectiveLayer = function (model, hierarchy, selectedLayer, defSite) {
    const has = layerName => model.parts.some(part => part.layerName === layerName);
    return has(selectedLayer) ? selectedLayer : has(hierarchy.mostDerived) ? hierarchy.mostDerived
        : defSite && has(defSite.layerName) ? defSite.layerName : model.parts[0]?.layerName ?? null;
};

/**
 * Scroll the editor of the layer declaring the selected component to its declaration, selecting it - once the
 * selection has been rendered, so that the editor's tab is shown. An editor not yet constructed is scrolled once it is.
 * @param {fluid.demos.inspector} self - The inspector
 */
fluid.demos.inspector.revealDefSite = function (self) {
    fluid.cell.stabilize();
    requestAnimationFrame(() => {
        const site = self.defSite;
        const editor = site ? self.editors.list.find(candidate => candidate.layerName === site.layerName) : null;
        if (editor) {
            fluid.demos.inspector.reveal(editor.editor, site);
        }
    });
};

/**
 * Scroll an editor to a range of its text, selecting it, or note the range to be revealed once the editor is
 * constructed
 * @param {Object} holder - The record of the editor, as made by `fluid.demos.inspector.bindEditor`
 * @param {DefSite} site - The range
 */
fluid.demos.inspector.reveal = function (holder, site) {
    const view = holder.view;
    if (view) {
        const length = view.state.doc.length;
        const from = Math.min(site.from, length), to = Math.min(site.to, length);
        view.dispatch({
            selection: {anchor: from, head: to},
            effects: fluid.codemirror6.EditorView.scrollIntoView(from, {y: "start", yMargin: 24})
        });
        holder.pendingReveal = null;
    } else {
        holder.pendingReveal = site;
    }
};

/**
 * Determine whether a part's tab is the one shown
 * @param {InspectorPart} part - The part
 * @param {String|null} effectiveLayer - The layer whose tab is shown
 * @return {Boolean} `true` if it is the part's
 */
fluid.demos.inspector.isActive = function (part, effectiveLayer) {
    return part.layerName === effectiveLayer;
};

/**
 * Create an SVG element
 * @param {String} tag - The element's tag
 * @param {Object} attrs - Its attributes
 * @param {Element} [parent] - An element to which it is appended
 * @return {SVGElement} The element
 */
fluid.demos.inspector.svg = function (tag, attrs, parent) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    fluid.each(attrs, (value, key) => element.setAttribute(key, value));
    if (parent) {
        parent.appendChild(element);
    }
    return element;
};

/**
 * @typedef {Object} GraphNode
 * @property {String} key - Identifies the node
 * @property {String} label - Its label
 * @property {String} colour - Its colour
 * @property {Number} x - Its x coordinate
 * @property {Number} y - Its y coordinate
 * @property {Boolean} [isView] - `true` if the node is a view, drawn within a dashed ring
 */

/**
 * Draw a graph of circular nodes, each a translucent disc within a more opaque ring of its colour, joined by edges
 * @param {Element} pane - The element into which the graph is drawn, replacing its content
 * @param {GraphNode[]} nodes - The nodes
 * @param {Array[]} edges - The edges, each as `[key, key]`
 * @param {String|null} selectedKey - The key of the node marked as selected
 * @param {Function} onSelect - Called with the key of a node when it is clicked
 * @param {String} [message] - Shown in place of the graph if there are no nodes
 */
fluid.demos.inspector.drawGraph = function (pane, nodes, edges, selectedKey, onSelect, message) {
    const {margin, radius} = fluid.demos.inspector.geometry;
    const svg = fluid.demos.inspector.svg;
    pane.innerHTML = "";
    if (nodes.length === 0) {
        const note = document.createElement("div");
        note.className = "fl-inspector-message";
        note.textContent = message || "";
        pane.appendChild(note);
    } else {
        const xs = nodes.map(node => node.x), ys = nodes.map(node => node.y);
        // The view spans at least a minimum extent, so that a graph of few nodes is not drawn huge
        const {minWidth, minHeight} = fluid.demos.inspector.geometry;
        const spanX = Math.max(Math.max(...xs) - Math.min(...xs) + 2 * margin, minWidth);
        const spanY = Math.max(Math.max(...ys) - Math.min(...ys) + 2 * margin + 14, minHeight);
        const minX = (Math.min(...xs) + Math.max(...xs)) / 2 - spanX / 2;
        const minY = (Math.min(...ys) + Math.max(...ys) + 14) / 2 - spanY / 2;
        const width = spanX, height = spanY;
        const root = svg("svg", {viewBox: `${minX} ${minY} ${width} ${height}`, preserveAspectRatio: "xMidYMid meet"}, pane);
        const byKey = new Map(nodes.map(node => [node.key, node]));
        edges.forEach(([fromKey, toKey]) => {
            const from = byKey.get(fromKey), to = byKey.get(toKey);
            const length = from && to ? Math.hypot(to.x - from.x, to.y - from.y) : 0;
            // Each edge runs between the rims of its nodes, rather than through their translucent interiors
            if (length > 2 * radius) {
                const dx = (to.x - from.x) / length * (radius + 3), dy = (to.y - from.y) / length * (radius + 3);
                svg("line", {x1: from.x + dx, y1: from.y + dy, x2: to.x - dx, y2: to.y - dy, class: "fl-inspector-edge"}, root);
            }
        });
        nodes.forEach(node => {
            const group = svg("g", {class: "fl-inspector-node" + (node.key === selectedKey ? " fl-inspector-selected" : "")}, root);
            if (node.key === selectedKey) {
                svg("circle", {cx: node.x, cy: node.y, r: radius + 7, class: "fl-inspector-halo"}, group);
            }
            if (node.isView) {
                svg("circle", {cx: node.x, cy: node.y, r: radius + 4, class: "fl-inspector-view-ring"}, group);
            }
            svg("circle", {class: "fl-inspector-disc", cx: node.x, cy: node.y, r: radius, fill: node.colour, "fill-opacity": 0.55,
                stroke: node.colour, "stroke-opacity": 0.95, "stroke-width": 5}, group);
            const label = svg("text", {x: node.x, y: node.y + radius + 17, class: "fl-inspector-label"}, group);
            label.textContent = node.label;
            svg("title", {}, group).textContent = node.title || node.label;
            group.addEventListener("click", event => {
                event.stopPropagation();
                onSelect(node.key);
            });
        });
    }
};

/**
 * Lay out the components of the inspected widget as a tree - leaves side by side, each parent centred over its
 * children, and each level of nesting on a row of its own
 * @param {InspectorNode[]} inspectorNodes - The components, their root first
 * @return {GraphNode[]} The nodes, placed
 */
fluid.demos.inspector.layoutTree = function (inspectorNodes) {
    const {xSpacing, ySpacing} = fluid.demos.inspector.geometry;
    const children = new Map(inspectorNodes.map(node => [node.path, []]));
    inspectorNodes.forEach(node => {
        if (node.parentPath !== null) {
            children.get(node.parentPath).push(node);
        }
    });
    const placed = [];
    let nextLeaf = 0;
    const place = function (node, depth) {
        const kids = children.get(node.path);
        let x;
        if (kids.length === 0) {
            x = nextLeaf++ * xSpacing;
        } else {
            const xs = kids.map(kid => place(kid, depth + 1));
            x = (xs[0] + fluid.peek(xs)) / 2;
        }
        placed.push({key: node.path, label: node.label, isView: node.isView,
            title: `${node.label}${node.isView ? " (view)" : ""}: ${node.layers.join(", ") || "no user layers"}`,
            colour: node.colour, x, y: depth * ySpacing});
        return x;
    };
    if (inspectorNodes.length > 0) {
        place(inspectorNodes[0], 0);
    }
    return placed;
};

/**
 * Lay out the hierarchy of layers in rows by depth, each row centred
 * @param {InspectorHierarchy} hierarchy - The hierarchy
 * @return {GraphNode[]} The nodes, placed
 */
fluid.demos.inspector.layoutHierarchy = function (hierarchy) {
    const {xSpacing, ySpacing} = fluid.demos.inspector.geometry;
    const rows = new Map();
    hierarchy.nodes.forEach(node => {
        rows.set(node.depth, [...rows.get(node.depth) || [], node]);
    });
    const widest = Math.max(0, ...[...rows.values()].map(row => row.length));
    return hierarchy.nodes.map(node => {
        const row = rows.get(node.depth);
        const offset = (widest - row.length) / 2;
        return {key: node.layerName, label: node.layerName, colour: node.colour,
            x: (row.indexOf(node) + offset) * xSpacing * 1.6, y: node.depth * ySpacing};
    });
};

/**
 * Draw the containment and hierarchy views of the inspected widget
 * @param {fluid.demos.inspector} self - The inspector
 * @param {Element} container - The inspector's rendered container
 * @param {InspectorModel} model - The description of the inspected widget
 * @param {String|null} effectivePath - The path of the selected component
 * @param {InspectorHierarchy} hierarchy - The hierarchy of the selected component
 * @param {String|null} effectiveLayer - The layer whose tab is shown
 * @param {DefSite|null} defSite - Where the selected component is declared, if it has no user layers
 */
fluid.demos.inspector.renderGraphs = function (self, container, model, effectivePath, hierarchy, effectiveLayer, defSite) {
    const containment = container.querySelector(".fl-inspector-containment");
    const inheritance = container.querySelector(".fl-inspector-hierarchy");
    if (containment && inheritance) {
        fluid.demos.inspector.drawGraph(containment, fluid.demos.inspector.layoutTree(model.nodes),
            model.nodes.filter(node => node.parentPath !== null).map(node => [node.parentPath, node.path]), effectivePath,
            path => {
                self.selectedPath = path;
                self.selectedLayer = null;
                fluid.demos.inspector.revealDefSite(self);
            }, model.title);
        fluid.demos.inspector.drawGraph(inheritance, fluid.demos.inspector.layoutHierarchy(hierarchy), hierarchy.edges,
            effectiveLayer, layerName => {
                self.selectedLayer = layerName;
            }, model.nodes.length > 0 ? "This component has no user layers - it is made from framework layers, configured where it is declared"
                + (defSite ? `, in ${defSite.layerName}` : "") : "");
    }
};

/**
 * Diagnose the problems of the inspected widget, as its badge reports them - see `fluid.ai.arena.diagnoseHosted`
 * @param {String|null} shapeId - The id of the shape hosting the widget
 * @param {Number} widgetsVersion - The count of changes to the widgets on the canvas
 * @return {String[]} The problems
 */
fluid.demos.inspector.problems = function (shapeId, widgetsVersion) {
    const that = shapeId ? fluid.tldraw.widgetForShape(shapeId) : null;
    let togo = [];
    if (that) {
        try {
            togo = fluid.ai.arena.diagnoseHosted(that);
        } catch (e) {
            togo = [`The widget could not be diagnosed: ${e.message}`];
        }
    }
    return togo;
};

/**
 * The names which a problem's description mentions, by which it may be found in the text of a layer - those quoted,
 * and dotted names such as layer names, in the order they appear
 * @param {String} problem - The description of the problem
 * @return {String[]} The names
 */
fluid.demos.inspector.problemNames = function (problem) {
    const togo = [];
    for (const match of problem.matchAll(/"([^"\n]+)"|'([^'\n]+)'|`([^`\n]+)`|([A-Za-z_$][\w$]*(?:\.[\w$]+)+)/g)) {
        togo.push(match[1] || match[2] || match[3] || match[4]);
    }
    return togo;
};

/**
 * Locate the problems of the inspected widget within the text of one of its layers, as diagnostics for its editor. A
 * problem is placed at the first name it mentions which is found in the text, other than the layer's own name, which
 * every problem of a component bearing it may mention. A problem found in no layer's text is placed on the first line
 * of the widget's own layer, whose editor is marked `isFirst`.
 * @param {String} text - The text of the layer
 * @param {Object} holder - The record of the editor, holding `layerName`, and `problems` as `{list, located, isFirst}`
 * @return {Object[]} The diagnostics, as accepted by CodeMirror's linter
 */
fluid.demos.inspector.problemDiagnostics = function (text, holder) {
    const togo = [];
    const {list, located, isFirst} = holder.problems;
    list.forEach(problem => {
        const names = fluid.demos.inspector.problemNames(problem).filter(name => name !== holder.layerName);
        const name = names.find(candidate => text.includes(candidate));
        if (name) {
            const from = text.indexOf(name);
            togo.push({from, to: from + name.length, severity: "error", message: problem, source: "widget"});
        } else if (isFirst && !located.has(problem)) {
            const lineEnd = text.indexOf("\n");
            togo.push({from: 0, to: lineEnd === -1 ? text.length : lineEnd, severity: "error", message: problem, source: "widget"});
        }
    });
    return togo;
};

/**
 * Show the problems of the inspected widget in an editor's gutter, by linting it afresh
 * @param {Object} holder - The record of the editor, as made by `fluid.demos.inspector.bindEditor`
 * @param {String[]} problems - The problems
 * @param {InspectorPart[]} parts - The layers of the widget, its own first
 */
fluid.demos.inspector.showProblems = function (holder, problems, parts) {
    // Those problems found in the text of some layer, which are not placed on the first line of the widget's own
    const located = new Set(problems.filter(problem => parts.some(part => {
        const names = fluid.demos.inspector.problemNames(problem).filter(name => name !== part.layerName);
        return names.some(name => part.text.includes(name));
    })));
    holder.problems = {list: problems, located, isFirst: parts.length > 0 && parts[0].layerName === holder.layerName};
    if (holder.view) {
        fluid.codemirror6.relint(holder.view);
    }
};

/**
 * Redefine a layer from text edited in its tab, reporting any failure beneath the editor
 * @param {Object} holder - The record of the editor, as made by `fluid.demos.inspector.bindEditor`
 * @param {String} text - The edited text of the layer
 */
fluid.demos.inspector.applyEdit = function (holder, text) {
    const contentType = holder.kind === "vue" ? fluid.layerMimeTypes.sfc : fluid.layerMimeTypes.javascript;
    let message = "";
    try {
        fluid.ptf.registerLayerPart({kind: "layer", contentType, filename: holder.layerName, body: text});
        fluid.cell.stabilize();
    } catch (e) {
        message = `Not applied: ${e.message}`;
    }
    holder.status.textContent = message;
    holder.status.classList.toggle("fl-inspector-failed", message !== "");
};

/**
 * Construct an editor of the source of a layer, once the editor's bundle has loaded. Its edits are applied, redefining
 * the layer, once the user pauses in typing.
 * @param {Element} container - The element to hold the editor
 * @param {String} layerName - The name of the layer
 * @param {String} kind - "vue" for a Single File Component, otherwise "js"
 * @return {Object} A record of the editor, to be unbound by `fluid.demos.inspector.unbindEditor`
 */
fluid.demos.inspector.bindEditor = function (container, layerName, kind) {
    const holder = {destroyed: false, view: null, timer: null, syncing: false, layerName, kind, status: null, pendingReveal: null,
        problems: {list: [], located: new Set(), isFirst: false}};
    fluid.demos.inspector.loadEditorBundle().then(codemirror6 => {
        if (!holder.destroyed) {
            container.innerHTML = "";
            const host = document.createElement("div");
            host.className = "fl-inspector-editor-host";
            holder.status = document.createElement("div");
            holder.status.className = "fl-inspector-status";
            container.append(host, holder.status);
            host.addEventListener("wheel", event => fluid.demos.inspector.routeWheel(host, event), {passive: true});
            // Read afresh rather than from the part, so that the editor is not bound to the part's text
            const doc = fluid.cell.untracked(() => fluid.ptf.layerToPart(layerName).body);
            holder.view = codemirror6.fluidEditor({parent: host, doc, kind,
                extraDiagnostics: text => fluid.demos.inspector.problemDiagnostics(text, holder), onChange: text => {
                if (!holder.syncing) {
                    clearTimeout(holder.timer);
                    holder.timer = setTimeout(() => {
                        holder.timer = null;
                        fluid.demos.inspector.applyEdit(holder, text);
                    }, fluid.demos.inspector.applyDelay);
                }
            }});
            if (holder.pendingReveal) {
                fluid.demos.inspector.reveal(holder, holder.pendingReveal);
            }
        }
    }, error => {
        container.textContent = error.message;
    });
    return holder;
};

/**
 * Bring a change of a layer's text made elsewhere, e.g. by the AI or by another inspector, into its editor - unless the
 * user's own edit is waiting to be applied, or already matches it
 * @param {Object} holder - The record of the editor
 * @param {String} text - The layer's text as now encoded
 */
fluid.demos.inspector.syncEditor = function (holder, text) {
    const view = holder && holder.view;
    if (view && holder.timer === null && view.state.doc.toString() !== text) {
        // The change is the layer's own, and need not be applied again
        holder.syncing = true;
        try {
            view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}});
        } finally {
            holder.syncing = false;
        }
    }
};

/**
 * Route a wheel gesture over an editor to the editor, as on Unix desktops, where the wheel scrolls whatever lies beneath
 * the pointer whether or not it has the focus - rather than letting tldraw pan the canvas. The gesture passes to tldraw
 * if it zooms, with Ctrl or Cmd held, or if the editor has no further to scroll in its direction, e.g. since its text
 * fits it, unless the editor has the focus, when its edge stops the gesture as any scrolled element's would.
 * @param {Element} host - The element holding the editor, which scrolls it
 * @param {WheelEvent} event - The gesture
 */
fluid.demos.inspector.routeWheel = function (host, event) {
    const zooming = event.ctrlKey || event.metaKey;
    const vertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
    const delta = vertical ? event.deltaY : event.deltaX;
    const position = vertical ? host.scrollTop : host.scrollLeft;
    const extent = vertical ? host.scrollHeight - host.clientHeight : host.scrollWidth - host.clientWidth;
    const canScroll = delta < 0 ? position > 0 : position < extent - 1;
    if (!zooming && (canScroll || host.contains(host.ownerDocument.activeElement))) {
        event.stopPropagation();
    }
};

/**
 * Destroy an editor constructed by `fluid.demos.inspector.bindEditor`
 * @param {Object} holder - The record of the editor
 */
fluid.demos.inspector.unbindEditor = function (holder) {
    holder.destroyed = true;
    clearTimeout(holder.timer);
    if (holder.view) {
        holder.view.destroy();
    }
};
</script>

<!-- The source positions of the definitions written by layers, by which a component declared inline is located in its
     layer's text, as fluid.editor's goToRef locates a reference -->
<script src="%infusion-6/src/lib/lezer/lezer-javascript-browser.js" data-fl-scope="global"></script>
<script src="%infusion-6/src/framework/edit/js/defMaps.js"></script>

<template>
    <div class="fl-inspector">
        <div class="fl-inspector-upper">
            <div class="fl-inspector-pane">
                <div class="fl-inspector-pane-title">Containment</div>
                <div class="fl-inspector-graph fl-inspector-containment fl-tldraw-interactive"></div>
            </div>
            <div class="fl-inspector-pane">
                <div class="fl-inspector-pane-title">Hierarchy</div>
                <div class="fl-inspector-graph fl-inspector-hierarchy fl-tldraw-interactive"></div>
            </div>
        </div>
        <div class="fl-inspector-resize-bar"></div>
        <div class="fl-inspector-title">@{title}</div>
        <div class="fl-inspector-lower">
            <div @id="tabs" class="fl-inspector-tabs"></div>
            <div @id="editors" class="fl-inspector-editors"></div>
        </div>
    </div>
</template>

<style>
.fl-inspector {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    background: #f4f4f4;
    font-family: Inter, sans-serif;
    font-size: 13px;
    border: 1px solid #bbb;
}

.fl-inspector-upper {
    display: flex;
    flex: 0 1 42%;
    min-height: 0;
    gap: 2px;
    background: #333;
}

.fl-inspector-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: #000;
}

.fl-inspector-pane-title {
    padding: 3px 8px;
    color: #aaa;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid #222;
}

.fl-inspector-graph {
    flex: 1;
    min-height: 0;
    position: relative;
}

.fl-inspector-graph svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.fl-inspector-message {
    padding: 12px;
    color: #888;
    font-style: italic;
}

.fl-inspector-edge {
    stroke: #555;
    stroke-width: 1.5;
}

.fl-inspector-node {
    cursor: pointer;
}

.fl-inspector-node:hover circle {
    stroke-width: 6;
}

.fl-inspector-view-ring {
    fill: none;
    stroke: #999;
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
}

.fl-inspector-halo {
    fill: none;
    stroke: #fff;
    stroke-width: 1.5;
}

.fl-inspector-label {
    fill: #e8e8e8;
    font-size: 11px;
    text-anchor: middle;
}

.fl-inspector-selected .fl-inspector-label {
    font-weight: 600;
    fill: #fff;
}

.fl-inspector-title {
    padding: 4px 8px;
    color: #555;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-bottom: 1px solid #ddd;
}

.fl-inspector .fl-resize-bar {
    --fl-resize-bar-ridge-width: 2px;
}

.fl-inspector-lower {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fff;
}

.fl-inspector-tabs {
    display: flex;
    flex: 0 0 auto;
    overflow-x: auto;
}

.fl-inspector-tab {
    padding: 4px 6px 3px;
    font-size: 13px;
    white-space: nowrap;
    height: 28px;
    box-sizing: border-box;
    cursor: pointer;
    color: #222;
}

.fl-inspector-tab.active {
    border-bottom: #747a80 solid 3px;
}

.fl-inspector-editors {
    flex: 1;
    min-height: 0;
    position: relative;
}

.fl-inspector-editor {
    display: none;
    position: absolute;
    inset: 0;
    overflow: hidden;
}

.fl-inspector-editor.active {
    display: flex;
    flex-direction: column;
}

.fl-inspector-editor-host {
    flex: 1;
    min-height: 0;
    overflow: auto;
}

.fl-inspector-status:empty {
    display: none;
}

.fl-inspector-status {
    flex: 0 0 auto;
    padding: 3px 8px;
    font-size: 12px;
    background: #fdecea;
    color: #8a1c12;
}

.fl-inspector-editor .cm-editor {
    min-height: 100%;
    font-size: 12px;
}

.fl-inspector-editor .cm-editor .cm-scroller {
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
}

/* The anchor line is drawn on the canvas in page space, beyond the inspector's shape - see fluid.tldraw.canvasLayer */
.fl-inspector-anchor-line {
    stroke: #4a7fd4;
    stroke-width: 2;
}

.fl-inspector-anchor-end {
    fill: #fff;
    stroke: #4a7fd4;
    stroke-width: 2;
}
</style>
