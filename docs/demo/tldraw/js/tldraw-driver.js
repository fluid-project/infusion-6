import React from "react";
import {createRoot} from "react-dom/client";
import {Tldraw, BaseBoxShapeUtil, HTMLContainer, T, createShapeId, useEditor, react} from "tldraw";
import {infusionInstances, lookupPendingParts, notifyInstantiation, makeClipboardOptions, guardClipboardEvents,
    isWidgetAvailable} from "./tldraw-clipboard.js";
import {makeAIBridge} from "./tldraw-ai.js";
import {containsWidget, restoreArena, persistArena, bindHistoryKeys, bindWidgetHistory, recordWidgetCreation,
    widgetBurstKey} from "./tldraw-arena.js";

const h = React.createElement;

/**
 * Load the tldraw licence key from the gitignored credentials file, if present - see tldraw-credentials.example.js
 * @return {Promise<String|undefined>} A promise for the licence key, or `undefined` if none is configured
 */
const loadLicenseKey = async function () {
    let licenseKey;
    try {
        licenseKey = (await import("./tldraw-credentials.js")).tldrawLicenseKey || undefined;
    } catch (e) {
        console.warn("No tldraw credentials file found - running without a licence key");
    }
    return licenseKey;
};

const licenseKey = await loadLicenseKey();

// The canvas is persisted in this browser's local storage, separately for each value of any ?infusionArenaId URL parameter
fluid.persistenceAdapter = fluid.makeLocalStoragePersistenceAdapter();
// The arena whose state is undoable and persisted consists of the widgets on the canvas, excluding e.g. the AI panel
fluid.arenaContains = containsWidget;
// Records of widget state refer to their widget through its shape, so that they apply once more to a widget which has
// been reconstructed, e.g. on undoing its deletion or restoring the arena
fluid.arenaSiteToRef = site => fluid.tldraw.siteToRef(site, infusionInstances);
fluid.arenaRefToSite = ref => fluid.tldraw.refToSite(ref, infusionInstances);
// Bursts of writes to a widget, e.g. typing or everything caused by a click, are coalesced into single undoable steps
fluid.arenaBurstKey = widgetBurstKey;

fluid.registerNamespace("fluid.tldraw");

// Bridging tldraw's signals into Infusion's.
// tldraw's store is made of fine-grained signals - each record is its own atom, and editor methods such as
// getShapePageBounds are computeds over them - but these are not individually advertised. Instead, any function which
// reads them can be run within tldraw's `react`, which tracks exactly the atoms it read and runs the function again
// only when one of them changes. We run such a function within `react`, and copy its result into an Infusion cell
// whenever it differs, giving a cell which updates as precisely as the tldraw state it was computed from.

/**
 * Create an Infusion cell holding the result of a function which reads tldraw's signals, which is kept up to date by
 * a tldraw reaction tracking exactly the signals that the function read. The cell is only updated if the result differs
 * from its current value, as judged by its JSON form - results are expected to be small plain records.
 * @param {String} name - A name for the reaction and the cell, for debugging
 * @param {Function} compute - A function reading tldraw's signals and returning a JSON-amenable value
 * @return {fluid.cell} A cell holding the function's current result, with a member `stop` which ends the reaction
 */
fluid.tldraw.reactiveCell = function (name, compute) {
    let cell = null;
    let lastJSON;
    const stop = react(name, () => {
        const value = compute();
        const json = JSON.stringify(value);
        if (cell === null) {
            // The reaction executes immediately on creation, typically within Infusion's evaluation of a $bindable,
            // so the cell is created with its initial value rather than being written to
            cell = fluid.cell(value, {name});
        } else if (json !== lastJSON) {
            cell.set(value);
        }
        lastJSON = json;
    });
    cell.stop = stop;
    return cell;
};

/**
 * End the reaction maintaining a cell created by `fluid.tldraw.reactiveCell` - suitable as the unbinder of a $bindable
 * @param {fluid.cell} cell - The cell whose reaction is to be ended
 */
fluid.tldraw.stopReactiveCell = function (cell) {
    cell.stop();
};

/**
 * @typedef {Object} ShapeBounds
 * @property {Number} x - The x coordinate of the shape's top left corner in page space
 * @property {Number} y - The y coordinate of the shape's top left corner in page space
 * @property {Number} w - The shape's width
 * @property {Number} h - The shape's height
 */

/**
 * Bind a cell to the page bounds of a single shape. Since this reads only the computed bounds of that shape, the
 * cell is updated only when that shape, or an ancestor, moves or is resized - and not, for example, on every frame of
 * a drag of some other shape.
 * @param {Editor} editor - The tldraw editor
 * @param {String|null} shapeId - The id of the shape whose bounds are required, or `null` for a widget not hosted in
 * a shape of its own, e.g. one nested within another widget
 * @return {fluid.cell<ShapeBounds|null>} A cell holding the shape's page bounds, or `null` if it is not in the document
 * or there is no shape
 */
fluid.tldraw.bindShapeBounds = function (editor, shapeId) {
    let togo;
    if (shapeId) {
        togo = fluid.tldraw.reactiveCell(`tldraw bounds of shape ${shapeId}`, () => {
            const bounds = editor.getShapePageBounds(shapeId);
            return bounds ? {x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h} : null;
        });
    } else {
        togo = fluid.cell(null, {name: "tldraw bounds of no shape"});
        togo.stop = () => {};
    }
    return togo;
};

/**
 * Extract the plain text from a tldraw shape's rich text, held as nested paragraph/text blocks
 * @param {Object} shape - The shape, e.g. a note
 * @return {String} The concatenated text of the shape
 */
fluid.tldraw.extractText = function (shape) {
    const blocks = shape.props?.richText?.content || [];
    return blocks.flatMap(block => block.content || []).map(inline => inline.text || "").join("");
};

/**
 * @typedef {Object} NoteRec
 * @property {String} id - The note's shape id
 * @property {Number} x - The x coordinate of the note's top left corner in page space
 * @property {Number} y - The y coordinate of the note's top left corner in page space
 * @property {String} text - The note's plain text
 */

/**
 * Bind a cell to the sticky notes on the current page. The set of note ids is drawn from a store query, which is
 * maintained incrementally and changes only when a note is created or deleted, and each note's position and text are
 * then read from that note's own signals. The cell is therefore updated only when a note changes - not when any
 * other shape does, as it would be by a listener to the whole store.
 * @param {Editor} editor - The tldraw editor
 * @return {fluid.cell<NoteRec[]>} A cell holding a record of each note on the current page
 */
fluid.tldraw.bindNotes = function (editor) {
    const noteIds = editor.store.query.ids("shape", () => ({type: {eq: "note"}}));
    return fluid.tldraw.reactiveCell("tldraw notes on current page", () => {
        const pageId = editor.getCurrentPageId();
        return [...noteIds.get()].filter(id => editor.getAncestorPageId(id) === pageId).map(id => {
            const bounds = editor.getShapePageBounds(id);
            return {id, x: bounds.x, y: bounds.y, text: fluid.tldraw.extractText(editor.getShape(id))};
        });
    });
};

/**
 * The component holding the tldraw editor, of which every widget on the canvas is constructed as a child by
 * InfusionHost. Within it, the editor may be reached as `{tldrawHost}.editor` - the Infusion counterpart of React's
 * `useEditor()`. It broadcasts tldraw's machinery onto the view of every top-level widget, and bridges any tldraw state
 * of interest to several widgets into Infusion. It is the {errorBoundary} of each widget, whose errors are reported on
 * the widget's problem badge. Components operating the integration itself, e.g. the "Ask me anything" panel, are
 * constructed elsewhere, and so do not fall within its scope.
 */
fluid.def("fluid.demos.tldrawHost", {
    $layers: "fluid.errorBoundary",
    reportError: "$method:fluid.tldraw.reportWidgetError({0})",
    editor: fluid.unavailable({cause: "No tldraw editor supplied", variety: "config"}),
    // Every top-level widget's view, wherever it is instantiated, becomes a tldraw view for as long as we exist
    viewLinkage: {
        $linkage: {
            inputLayers: ["fluid.topLevelWidgetView"],
            outputLayers: ["fluid.tldrawViewComponent"]
        }
    },
    notes: {
        $bindable: {
            bind: "fluid.tldraw.bindNotes({self}.editor)",
            unbind: "fluid.tldraw.stopReactiveCell({boundValue})"
        }
    }
});

/**
 * The view of a top-level widget hosted in a tldraw shape, broadcast onto it by the tldrawHost's linkage. This reports
 * the shape's bounds as the widget's hostBounds. It is part of the canvas rather than of any widget, and so is not a
 * user layer, and is not transmitted with a widget's PTF.
 */
fluid.def("fluid.tldrawViewComponent", {
    $layers: "fluid.topLevelWidgetView",
    // Supplied by InfusionHost - absent, for a widget nested within another, no bounds are reported, so that the widget
    // takes those of the widget enclosing it - see fluid.topLevelWidget
    shapeId: null,
    // The configuration of the shape, as supplied by InfusionHost when the widget is constructed. This is how the shape
    // is transmitted in the widget's PTF, written afresh from the shape as it is transmitted - see
    // fluid.tldraw.shapeToConfig. A member holding its default here is not transmitted, and a shape transmitted without
    // a position or size takes those chosen by the host.
    shape: {
        x: null,
        y: null,
        w: null,
        h: null,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        parentId: null,
        index: null
    },
    editor: "{tldrawHost}.editor",
    hostBounds: {
        $bindable: {
            bind: "fluid.tldraw.bindShapeBounds({self}.editor, {self}.shapeId)",
            unbind: "fluid.tldraw.stopReactiveCell({boundValue})"
        }
    },
    $variety: "frameworkAux"
});

/**
 * The tldrawHost component, once tldraw has mounted and it has been constructed - see `onMount`
 * @type {Promise<fluid.component>}
 */
let hostReady = null;
let resolveHost = null;

/**
 * Begin awaiting a fresh tldrawHost component, as tldraw mounts afresh
 */
const awaitHost = function () {
    hostReady = new Promise(resolve => {
        resolveHost = resolve;
    });
};
awaitHost();

/**
 * A React component hosting an Infusion component. The Infusion component is constructed as a child of the tldrawHost
 * component once React has mounted the container, and destroyed when React unmounts it. A shape which was pasted from
 * a PTF document is reconstructed from the document's parts, and otherwise the component is constructed afresh from
 * its layer. In either case the shape's id and configuration are supplied to the component's view, where
 * fluid.tldrawViewComponent will find them. The component is kept diagnosed, and any problems found in it, including the errors in rendering it
 * reported by the tldrawHost as its error boundary, are reported by a badge overlaying the shape once the reactive
 * graph has settled - see `fluid.tldraw.renderProblemBadge`.
 * @param {Object} props - The React props
 * @param {String} props.layerName - The name of the Infusion layer to be instantiated
 * @param {String} props.shapeId - The id of the tldraw shape hosting the component
 * @param {TLShape} props.shape - The shape hosting the component, as it was when the component was constructed
 * @param {String} [props.ptfToken] - A token resolving to the PTF parts from which the component should be reconstructed
 * @return {ReactElement} The rendered container
 */
const InfusionHost = function ({layerName, shapeId, shape, ptfToken}) {
    const hostRef = React.useRef(null);
    const containerRef = React.useRef(null);
    const badgeRef = React.useRef(null);
    React.useEffect(() => {
        let that = null;
        let unmounted = false;
        let diagnosis = null;
        const hostElement = hostRef.current;
        const container = containerRef.current;
        const onFix = problems => fluid.demos.askAnything.offer({text: fluid.tldraw.fixDirection(shapeId, layerName, problems)});
        const showProblems = function (problems) {
            fluid.tldraw.renderProblemBadge(badgeRef.current, problems, {
                // A widget which shows nothing else has its problems listed straight away
                expand: container.textContent.trim() === "",
                // The panel's SFC may not have loaded
                onFix: fluid.demos?.askAnything?.offer ? onFix : null
            });
        };
        // An error reported by the tldrawHost may arise whilst the widget is being constructed, before it is diagnosed,
        // in which case it is found by the first diagnosis
        fluid.tldraw.problemReporters.set(hostElement, () => diagnosis?.refresh());
        const adopt = function (constructed, how) {
            that = constructed;
            infusionInstances.set(shapeId, that);
            console.log(`${how} Infusion component ${layerName} with id ${that.$id}`);
            diagnosis = fluid.tldraw.ai.bindDiagnosis(that, showProblems);
        };
        const parts = lookupPendingParts(ptfToken);
        /**
         * Construct the widget within the tldrawHost, reconstructing it from its PTF parts if it has any. A widget
         * whose layer has failed is constructed nonetheless, so that its failure is reported as for any other.
         * @param {fluid.component} host - The tldrawHost component
         * @param {Unavailable|null} layerUnavailable - Why the widget's layer is not available, or `null` if it is
         */
        const construct = function (host, layerUnavailable) {
            const shapeConfig = fluid.tldraw.shapeToConfig(shape, true);
            // The host potentia can only be determined once the widget's own layer is available
            const potentia = layerUnavailable === null ? fluid.tldraw.hostPotentiaFor(layerName, container, shapeId, shapeConfig) :
                {view: {$component: {container, shapeId, shape: shapeConfig}}};
            try {
                if (parts) {
                    // The component is adopted as soon as it is constructed, before it is available, so that it can be
                    // diagnosed whilst it is incomplete and is destroyed if the shape unmounts in the meantime
                    adopt(fluid.ptf.constructParts(parts, {potentia, parent: host}), "Reconstructed");
                    const constructed = that;
                    fluid.ptf.applyParts(constructed, parts).then(unresolved => {
                        if (unresolved.length > 0) {
                            console.warn(`Could not apply PTF parts ${unresolved.join(", ")} for shape ${shapeId}`);
                        }
                        notifyInstantiation(ptfToken, {that: constructed, unresolved});
                    }, error => {
                        console.error(`Failed to apply PTF parts for shape ${shapeId}: `, error);
                        notifyInstantiation(ptfToken, {that: constructed, error});
                    });
                    fluid.tldraw.ai.awaitSettled().then(() => {
                        // A widget which is not available once the graph has settled will never be, and its parts will
                        // never be applied, so this is reported without waiting further
                        if (!isWidgetAvailable(shapeId)) {
                            notifyInstantiation(ptfToken, {that: constructed, unavailable: true});
                        }
                    });
                } else {
                    adopt(fluid.initChildComponent(host, layerName, potentia), "Constructed");
                }
            } catch (error) {
                console.error(`Failed to construct Infusion component for shape ${shapeId}: `, error);
                showProblems([`This widget could not be constructed: ${fluid.tldraw.ai.describeError(error)}`]);
                if (parts) {
                    notifyInstantiation(ptfToken, {error});
                }
            }
        };
        if (parts) {
            // Layers are registered first, since the widget's own layer may be an SFC which is parsed asynchronously
            fluid.ptf.registerLayerParts(parts);
        }
        // A layer which is not available once the graph has settled never will be, e.g. since its SFC was rejected
        Promise.all([hostReady, fluid.tldraw.ai.awaitLayer(layerName)]).then(([host, layerUnavailable]) => {
            if (!unmounted) {
                construct(host, layerUnavailable);
            }
        });
        return () => {
            unmounted = true;
            fluid.tldraw.problemReporters.delete(hostElement);
            diagnosis?.dispose();
            if (that) {
                console.log(`Destroying Infusion component ${layerName} with id ${that.$id}`);
                if (infusionInstances.get(shapeId) === that) {
                    infusionInstances.delete(shapeId);
                }
                // A component whose layers failed has no destroy method of its own
                fluid.destroyComponent(that);
            }
        };
    }, [layerName, shapeId, ptfToken]);
    // The badge is held beside the component's container rather than within it, since the component renders onto its
    // container, replacing its content
    return h("div", {
        ref: hostRef,
        className: "infusion-host",
        onPointerDown: e => {
            // Let interactive elements within the component, including any bound to pointer events by its template, and
            // the badge's buttons, receive their events rather than tldraw selecting the shape - the rest of the badge,
            // e.g. its list of problems, drags the shape as the component itself does
            if (fluid.tldraw.isInteractiveTarget(e.target, e.currentTarget)) {
                e.stopPropagation();
            }
        }
    }, h("div", {ref: containerRef}), h("div", {ref: badgeRef, className: "infusion-problem-holder"}));
};

const defaultShapeWidth = 260;
const defaultShapeHeight = 80;

/**
 * Determine the size at which a fresh shape hosting a widget should be created. This is read from the layer's avatar,
 * so that a preferred size advertised by any of its parent layers is honoured, as is one which is computed.
 * @param {String} layerName - The name of the widget's layer
 * @return {Object} The size as `{w, h}`
 */
fluid.tldraw.shapeSizeFor = function (layerName) {
    // An avatar which is unavailable as a whole, e.g. since its layer is still loading, yields no preference
    const value = fluid.avatar(layerName).preferredSize;
    const preferredSize = fluid.isUnavailable(value) ? null : value;
    return {
        w: preferredSize?.w || defaultShapeWidth,
        h: preferredSize?.h || defaultShapeHeight
    };
};

/**
 * A tldraw shape which hosts an Infusion component via InfusionHost.
 */
class InfusionShapeUtil extends BaseBoxShapeUtil {
    static type = "infusion";

    static props = {
        w: T.number,
        h: T.number,
        layerName: T.string
    };

    /**
     * Default props for a freshly created Infusion shape
     * @return {Object} The default shape props
     */
    getDefaultProps() {
        return {
            w: defaultShapeWidth,
            h: defaultShapeHeight,
            layerName: "fluid.demos.helloWorld"
        };
    }

    /**
     * Render the shape's body - an HTML container holding the Infusion host
     * @param {Object} shape - The shape to be rendered
     * @return {ReactElement} The rendered shape
     */
    component(shape) {
        return h(HTMLContainer, {
            style: {
                pointerEvents: "all",
                background: "white",
                border: "1px solid #ccc",
                overflow: "hidden"
            }
        }, h(InfusionHost, {
            layerName: shape.props.layerName,
            shapeId: shape.id,
            shape,
            ptfToken: shape.meta.ptfToken
        }));
    }

    /**
     * Compute the shape's selection indicator, which tldraw strokes onto its canvas overlay layer
     * @param {Object} shape - The shape to be rendered
     * @return {Path2D} The indicator path
     */
    getIndicatorPath(shape) {
        const path = new Path2D();
        path.rect(0, 0, shape.props.w, shape.props.h);
        return path;
    }
}

const shapeUtils = [InfusionShapeUtil];

/**
 * A React hook rendering the current value of an Infusion cell, rerendering whenever it changes
 * @param {fluid.cell} cell - The cell whose value is required
 * @return {any} The cell's current value
 */
const useCellValue = function (cell) {
    const subscribe = React.useCallback(onChange => {
        const effect = fluid.cell.effect(() => {
            cell.get();
            onChange();
        }, [], {name: `React subscription to ${cell.name}`});
        return () => effect.dispose();
    }, [cell]);
    return React.useSyncExternalStore(subscribe, () => cell.get());
};

// The distance by which a fresh shape is nudged away from an existing widget at its creation site
const nudgeDistance = 40;
const maxNudges = 8;

/**
 * Find a site at which to create a fresh widget's shape. If an existing widget is already at the desired site, the
 * site is nudged in a few random directions until a free one is found.
 * @param {Editor} editor - The tldraw editor
 * @param {Object} site - The desired top left corner of the shape in page space, as `{x, y}`
 * @return {Object} The site at which to create the shape, as `{x, y}`
 */
fluid.tldraw.findFreeSite = function (editor, site) {
    const widgetSites = editor.getCurrentPageShapes().filter(shape => shape.type === "infusion")
        .map(shape => editor.getShapePageBounds(shape));
    const isOccupied = candidate => widgetSites.some(bounds => Math.hypot(bounds.x - candidate.x, bounds.y - candidate.y) < nudgeDistance / 2);
    let candidate = site;
    for (let nudges = 0; nudges < maxNudges && isOccupied(candidate); ++nudges) {
        const angle = Math.random() * 2 * Math.PI;
        candidate = {x: candidate.x + nudgeDistance * Math.cos(angle), y: candidate.y + nudgeDistance * Math.sin(angle)};
    }
    return candidate;
};

/**
 * Delete a widget layer, after asking the user to confirm. The widgets on the canvas made from the layer, directly or
 * through a layer built on it, are deleted with it, since they could no longer work. Both deletions are recorded in
 * the arena's histories, so that each may be undone.
 * @param {Editor} editor - The tldraw editor
 * @param {String} layerName - The name of the layer
 * @return {Boolean} `true` if the layer was deleted
 */
const deleteWidgetLayer = function (editor, layerName) {
    const doomed = editor.getCurrentPageShapes().filter(shape => shape.type === "infusion" &&
        (shape.props.layerName === layerName || fluid.tldraw.layerReaches(shape.props.layerName, layerName)));
    const question = fluid.tldraw.deletionQuestion(layerName, doomed.length, fluid.tldraw.dependentLayers(layerName), fluid.tldraw.isApple());
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(question);
    if (confirmed) {
        editor.deleteShapes(doomed.map(shape => shape.id));
        fluid.deleteLayer(layerName);
    }
    return confirmed;
};

// A small trash can, drawn in the current colour
const trashIcon = h("svg", {width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2,
    strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true},
h("path", {d: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"}));

/**
 * A dropdown listing widget layers, each of which may be chosen, or deleted through a trash can at its right, which
 * appears as the pointer passes over it. This stands in for a native select, whose options cannot hold buttons.
 * @param {Object} props - The React props
 * @param {String[]} props.layers - The names of the layers listed
 * @param {String} props.choice - The name of the chosen layer
 * @param {Function} props.onChoose - Accepts the name of a layer which the user chooses
 * @param {Function} props.onDelete - Accepts the name of a layer which the user asks to delete
 * @return {ReactElement} The rendered dropdown
 */
const LayerPicker = function ({layers, choice, onChoose, onDelete}) {
    const [open, setOpen] = React.useState(false);
    const rootRef = React.useRef(null);
    // The list is closed by a press anywhere outside it
    React.useEffect(() => {
        let togo;
        if (open) {
            const close = e => {
                if (!rootRef.current?.contains(e.target)) {
                    setOpen(false);
                }
            };
            document.addEventListener("pointerdown", close, true);
            togo = () => document.removeEventListener("pointerdown", close, true);
        }
        return togo;
    }, [open]);
    return h("div", {className: "layer-picker", ref: rootRef},
        h("button", {
            className: "layer-picker-button",
            disabled: layers.length === 0,
            title: "Top-level widget layers",
            "aria-haspopup": "listbox",
            "aria-expanded": open,
            onClick: () => setOpen(!open)
        }, h("span", {className: "layer-picker-choice"}, choice || "No widget layers"), h("span", {"aria-hidden": true}, "\u25be")),
        open && h("ul", {className: "layer-picker-list", role: "listbox"}, layers.map(layerName =>
            h("li", {key: layerName, className: "layer-picker-option" + (layerName === choice ? " layer-picker-chosen" : ""),
                role: "option", "aria-selected": layerName === choice},
            h("button", {
                className: "layer-picker-name",
                onClick: () => {
                    onChoose(layerName);
                    setOpen(false);
                }
            }, layerName),
            h("button", {
                className: "layer-picker-delete",
                title: `Delete the layer ${layerName}`,
                "aria-label": `Delete the layer ${layerName}`,
                onClick: () => onDelete(layerName)
            }, trashIcon)
            )))
    );
};

/**
 * A panel allowing a fresh Infusion widget to be constructed on the canvas from any top-level widget layer in the
 * layer store, which is listed live as layers are defined, redefined and deleted - including those sent by the AI or
 * pasted - and allowing such layers to be deleted.
 * @return {ReactElement} The rendered panel
 */
const NewShapePanel = function () {
    const editor = useEditor();
    const layers = useCellValue(fluid.tldraw.widgetLayers);
    const [selected, setSelected] = React.useState("");
    const choice = layers.includes(selected) ? selected : layers[0] || "";
    const create = () => {
        const center = editor.getViewportPageBounds().center;
        const id = createShapeId();
        const {w, h: hh} = fluid.tldraw.shapeSizeFor(choice);
        const site = fluid.tldraw.findFreeSite(editor, {x: center.x - w / 2, y: center.y - hh / 2});
        editor.createShape({
            id,
            type: "infusion",
            x: site.x,
            y: site.y,
            props: {
                layerName: choice,
                w,
                h: hh
            }
        });
        // Undoable through the arena's history of widget state, which tracks the creation of widgets as well as their state
        recordWidgetCreation(editor, [id]);
        editor.select(id);
        editor.setCurrentTool("select");
    };
    return h("div", {className: "new-shape-panel"},
        h(LayerPicker, {
            layers,
            choice,
            onChoose: setSelected,
            onDelete: layerName => deleteWidgetLayer(editor, layerName)
        }),
        h("button", {
            disabled: !choice,
            onClick: create
        }, "New shape")
    );
};

/**
 * A pair of buttons stepping back and forward through one of the arena's history stacks, which advertise their
 * keyboard shortcuts in their tooltips
 * @param {Object} props - The React props
 * @param {String} props.caption - The caption of the pair
 * @param {HistoryCommand} props.back - The command stepping back
 * @param {HistoryCommand} props.forward - The command stepping forward
 * @return {ReactElement} The rendered buttons
 */
const HistoryButtons = function ({caption, back, forward}) {
    const isApple = fluid.tldraw.isApple();
    const stack = fluid[back.stack];
    const enabled = {
        back: useCellValue(stack.canBack),
        forward: useCellValue(stack.canForward)
    };
    const button = (command, which) => h("button", {
        className: "history-button",
        disabled: !enabled[which],
        title: fluid.tldraw.commandTooltip(command, isApple),
        "aria-label": command.label,
        onClick: () => fluid.tldraw.runHistoryCommand(command)
    }, command.icon);
    return h("div", {className: "history-buttons"},
        button(back, "back"),
        h("span", {className: "history-caption"}, caption),
        button(forward, "forward")
    );
};

/**
 * The panel at the top right of the canvas, holding the history buttons and the panel creating fresh widgets
 * @return {ReactElement} The rendered panel
 */
const TopPanel = function () {
    const [liveBack, liveForward, layerBack, layerForward] = fluid.tldraw.historyCommands;
    return h("div", {className: "top-panel"},
        h(HistoryButtons, {caption: "Widgets", back: liveBack, forward: liveForward}),
        h(HistoryButtons, {caption: "Layers", back: layerBack, forward: layerForward}),
        h(NewShapePanel)
    );
};

const components = {
    SharePanel: TopPanel
};

// Copying or cutting Infusion shapes writes a PTF document to the clipboard, and pasting one reconstructs them
const options = makeClipboardOptions();

/**
 * Construct the tldrawHost component exposing the editor to Infusion, and expose the editor for debugging. Restore
 * any arena persisted for the page, or else populate the canvas with a single Infusion widget, and then persist the
 * arena as it changes.
 * @param {Editor} editor - The tldraw editor which has just mounted
 * @return {Function} A function which tldraw will call on unmount, destroying the tldrawHost component
 */
const onMount = function (editor) {
    fluid.tldraw.editorInstance = editor;
    fluid.tldraw.instances = infusionInstances;
    const tldrawHost = fluid.demos.tldrawHost({editor});
    // Widgets awaiting the host are constructed within it
    resolveHost(tldrawHost);
    // Lets the "Ask me anything" panel reflect on and alter the canvas
    fluid.tldraw.ai.bridge = makeAIBridge(editor);
    // Lets the user copy text from the panel, rather than the canvas's selection
    const unguard = guardClipboardEvents(document.getElementById("ai-root"));
    const unbindKeys = bindHistoryKeys();
    const unbindWidgetHistory = bindWidgetHistory(editor);
    let unmounted = false;
    let stopPersisting = null;
    restoreArena(editor, fluid.persistenceAdapter.load()).catch(error => {
        console.error("Failed to restore the persisted arena: ", error);
        return false;
    }).then(restored => {
        if (!unmounted) {
            if (!restored && editor.getCurrentPageShapes().length === 0) {
                editor.createShape({
                    type: "infusion",
                    x: 200,
                    y: 200
                });
            }
            // Begun only once restored, so that a partly restored arena is never saved over the persisted one
            stopPersisting = persistArena(editor);
        }
    });
    return () => {
        unmounted = true;
        stopPersisting?.();
        unbindWidgetHistory();
        unbindKeys();
        unguard();
        awaitHost();
        tldrawHost.destroy();
    };
};

createRoot(document.getElementById("tldraw-root")).render(
    h(Tldraw, {shapeUtils, components, options, onMount, licenseKey})
);
