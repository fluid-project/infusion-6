import React from "react";
import {createRoot} from "react-dom/client";
import {Tldraw, BaseBoxShapeUtil, HTMLContainer, T, createShapeId, useEditor} from "tldraw";
import {infusionInstances, lookupPendingParts, makeClipboardOptions} from "./tldraw-clipboard.js";

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

/**
 * A root-scoped component holding the tldraw editor, through which any Infusion component may reach it as
 * `{tldrawHost}.editor` - the Infusion counterpart of React's `useEditor()`.
 */
fluid.def("fluid.demos.tldrawHost", {
    $layers: ["fluid.resolveRoot", "fluid.component"],
    editor: null,
    // DRAFT, untested: bridges the tldraw store into Infusion's reactive world, as `{tldrawHost}.shapes`. $bindable
    // (documented as experimental) is the only directive pairing an acquisition with a release tied to the component's
    // lifetime - $effect offers no cleanup. Whether consumers see through the bound cell to its value is unverified.
    shapes: {
        $bindable: {
            bind: {
                func: "fluid.demos.tldrawHost.bindShapes",
                args: ["{self}.editor"]
            },
            unbind: {
                func: "fluid.demos.tldrawHost.unbindShapes",
                args: ["{boundValue}"]
            }
        }
    }
});

/**
 * Subscribe to the tldraw store, producing a cell holding all shapes on the current page which is updated whenever
 * the document changes
 * @param {Editor} editor - The tldraw editor
 * @return {fluid.cell} A cell holding the current page's shapes, with an `unsubscribe` member
 */
fluid.demos.tldrawHost.bindShapes = function (editor) {
    const shapesCell = fluid.cell(editor.getCurrentPageShapes(), {name: "tldraw current page shapes"});
    shapesCell.unsubscribe = editor.store.listen(() => {
        // Coarse-grained: every document change, e.g. every frame of a drag, replaces the whole array
        shapesCell.set(editor.getCurrentPageShapes());
    }, {scope: "document"});
    return shapesCell;
};

/**
 * Release the subscription made by bindShapes
 * @param {fluid.cell} shapesCell - The cell returned from bindShapes
 */
fluid.demos.tldrawHost.unbindShapes = function (shapesCell) {
    shapesCell.unsubscribe();
};

/**
 * Returns a promise which resolves once the named layer has been registered. Since SFCs are loaded asynchronously,
 * a layer's creator function will not exist until its SFC has been fetched and its script evaluated.
 * @param {String} layerName - The name of the layer to wait for
 * @return {Promise} A promise resolving once the layer is available
 */
const awaitLayer = function (layerName) {
    const layerSignal = fluid.readLayer(layerName);
    return new Promise(resolve => {
        if (fluid.isUnavailable(layerSignal.get())) {
            const effect = fluid.cell.effect(() => {
                resolve();
                // Dispose asynchronously since we are currently executing within the effect
                queueMicrotask(() => effect.dispose());
            }, [layerSignal], {name: `awaitLayer for ${layerName}`});
        } else {
            // A freshly created effect would not be run until the next stabilization, so resolve directly
            resolve();
        }
    });
};

/**
 * A React component hosting an Infusion component. The Infusion component is constructed once React has mounted the
 * container, and destroyed when React unmounts it. A shape which was pasted from a PTF document is reconstructed from
 * the document's parts, and otherwise the component is constructed afresh via its layer's creator function.
 * @param {Object} props - The React props
 * @param {String} props.layerName - The name of the Infusion layer to be instantiated
 * @param {String} props.shapeId - The id of the tldraw shape hosting the component
 * @param {String} [props.ptfToken] - A token resolving to the PTF parts from which the component should be reconstructed
 * @return {ReactElement} The rendered container
 */
const InfusionHost = function ({layerName, shapeId, ptfToken}) {
    const containerRef = React.useRef(null);
    React.useEffect(() => {
        let that = null;
        let unmounted = false;
        const adopt = function (constructed, how) {
            if (unmounted) {
                constructed.destroy();
            } else {
                that = constructed;
                infusionInstances.set(shapeId, that);
                console.log(`${how} Infusion component ${layerName} with id ${that.$id}`);
            }
        };
        const parts = lookupPendingParts(ptfToken);
        if (parts) {
            fluid.ptf.instantiateParts(parts, {potentia: {container: containerRef.current, shapeId}}).then(
                ({that: constructed, unresolved}) => {
                    if (unresolved.length > 0) {
                        console.warn(`Could not apply PTF parts ${unresolved.join(", ")} for shape ${shapeId}`);
                    }
                    adopt(constructed, "Reconstructed");
                },
                error => console.error(`Failed to reconstruct Infusion component for shape ${shapeId} from PTF: `, error)
            );
        } else {
            awaitLayer(layerName).then(() => {
                if (!unmounted) {
                    const creator = fluid.getGlobalValue(layerName);
                    adopt(creator({container: containerRef.current, shapeId}), "Constructed");
                }
            });
        }
        return () => {
            unmounted = true;
            if (that) {
                console.log(`Destroying Infusion component ${layerName} with id ${that.$id}`);
                if (infusionInstances.get(shapeId) === that) {
                    infusionInstances.delete(shapeId);
                }
                that.destroy();
            }
        };
    }, [layerName, shapeId, ptfToken]);
    return h("div", {
        ref: containerRef,
        onPointerDown: e => {
            // Let interactive elements within the component receive their events rather than tldraw selecting the shape
            if (e.target.closest("button, input, select, textarea, a")) {
                e.stopPropagation();
            }
        }
    });
};

const defaultShapeWidth = 260;
const defaultShapeHeight = 80;

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
            ptfToken: shape.meta.ptfToken
        }));
    }

    /**
     * Compute the shape's selection indicator, which tldraw strokes onto its canvas overlay layer
     * @param {Object} shape - The shape whose indicator is required
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
 * List the layers registered in Infusion's SFC registry. fluid.readSFC also allocates placeholder records for layers
 * which have merely been asked about, so only those for which a load has actually begun, and hence have a URL,
 * are returned.
 * @return {String[]} The sorted names of all layers loaded from SFCs
 */
const listSFCLayers = function () {
    return Object.keys(fluid.sfcStore).filter(layerName => fluid.sfcStore[layerName].url).sort();
};

/**
 * A panel allowing a fresh Infusion widget to be constructed on the canvas from any layer found in the SFC registry.
 * Since the registry is not reactive, it is reread whenever the user approaches the panel.
 * @return {ReactElement} The rendered panel
 */
const NewShapePanel = function () {
    const editor = useEditor();
    const [layers, setLayers] = React.useState(listSFCLayers);
    const [selected, setSelected] = React.useState("");
    const choice = layers.includes(selected) ? selected : layers[0] || "";
    const refresh = () => setLayers(listSFCLayers());
    const create = () => {
        const center = editor.getViewportPageBounds().center;
        const id = createShapeId();
        // A layer may advertise the size it would like to be hosted at
        const preferredSize = fluid.def(choice)?.preferredSize;
        const w = preferredSize?.w || defaultShapeWidth;
        const hh = preferredSize?.h || defaultShapeHeight;
        editor.createShape({
            id,
            type: "infusion",
            x: center.x - w / 2,
            y: center.y - hh / 2,
            props: {
                layerName: choice,
                w,
                h: hh
            }
        });
        editor.select(id);
        editor.setCurrentTool("select");
    };
    return h("div", {className: "new-shape-panel", onPointerEnter: refresh},
        h("select", {
            value: choice,
            title: "Layers found in the SFC registry",
            onFocus: refresh,
            onChange: e => setSelected(e.target.value)
        }, layers.map(layerName => h("option", {key: layerName, value: layerName}, layerName))),
        h("button", {
            disabled: !choice,
            onClick: create
        }, "New shape")
    );
};

const components = {
    SharePanel: NewShapePanel
};

// Copying or cutting Infusion shapes writes a PTF document to the clipboard, and pasting one reconstructs them
const options = makeClipboardOptions({w: defaultShapeWidth, h: defaultShapeHeight});

/**
 * Construct the tldrawHost component exposing the editor to Infusion, populate an empty canvas with a single Infusion
 * widget, and expose the editor for debugging
 * @param {Editor} editor - The tldraw editor which has just mounted
 * @return {Function} A function which tldraw will call on unmount, destroying the tldrawHost component
 */
const onMount = function (editor) {
    const tldraw = fluid.registerNamespace("fluid.tldraw");
    tldraw.editorInstance = editor;
    tldraw.instances = infusionInstances;
    const tldrawHost = fluid.demos.tldrawHost({editor});
    if (editor.getCurrentPageShapes().length === 0) {
        editor.createShape({
            type: "infusion",
            x: 200,
            y: 200
        });
    }
    return () => tldrawHost.destroy();
};

createRoot(document.getElementById("tldraw-root")).render(
    h(Tldraw, {shapeUtils, components, options, onMount, licenseKey})
);
