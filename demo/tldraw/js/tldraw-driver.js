import React from "react";
import {createRoot} from "react-dom/client";
import {Tldraw, BaseBoxShapeUtil, HTMLContainer, T, createShapeId, useEditor} from "tldraw";

const h = React.createElement;

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
 * A React component hosting an Infusion component. The Infusion component is constructed via its creator function
 * once React has mounted the container, and destroyed when React unmounts it.
 * @param {Object} props - The React props
 * @param {String} props.layerName - The name of the Infusion layer to be instantiated
 * @return {ReactElement} The rendered container
 */
const InfusionHost = function ({layerName}) {
    const containerRef = React.useRef(null);
    React.useEffect(() => {
        let that = null;
        let unmounted = false;
        awaitLayer(layerName).then(() => {
            if (!unmounted) {
                const creator = fluid.getGlobalValue(layerName);
                that = creator({container: containerRef.current});
                // Flush the component's rendering effects
                fluid.cell.stabilize();
                console.log(`Constructed Infusion component ${layerName} with id ${that.$id}`);
            }
        });
        return () => {
            unmounted = true;
            if (that) {
                console.log(`Destroying Infusion component ${layerName} with id ${that.$id}`);
                that.destroy();
            }
        };
    }, [layerName]);
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
            layerName: shape.props.layerName
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
        editor.createShape({
            id,
            type: "infusion",
            x: center.x - defaultShapeWidth / 2,
            y: center.y - defaultShapeHeight / 2,
            props: {
                layerName: choice
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

/**
 * Populate an empty canvas with a single Infusion widget, and expose the editor for debugging
 * @param {Editor} editor - The tldraw editor which has just mounted
 */
const onMount = function (editor) {
    window.tldrawEditor = editor;
    if (editor.getCurrentPageShapes().length === 0) {
        editor.createShape({
            type: "infusion",
            x: 200,
            y: 200
        });
    }
};

createRoot(document.getElementById("tldraw-root")).render(
    h(Tldraw, {shapeUtils, components, onMount})
);
