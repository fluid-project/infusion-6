import React from "react";
import {createRoot} from "react-dom/client";
import {Tldraw, BaseBoxShapeUtil, HTMLContainer, T} from "tldraw";

const h = React.createElement;

/**
 * A tldraw shape which hosts an Infusion component. The shape renders a container bearing a `fluid-layers`
 * attribute, which Infusion's self-boot effect (see fluid.makeSelfBootEffect) detects via its live query and
 * instantiates a component into.
 */
class InfusionShapeUtil extends BaseBoxShapeUtil {
    static type = "infusion";

    static props = {
        w: T.number,
        h: T.number,
        layers: T.string
    };

    /**
     * Default props for a freshly created Infusion shape
     * @return {Object} The default shape props
     */
    getDefaultProps() {
        return {
            w: 260,
            h: 80,
            layers: "fluid.demos.helloWorld"
        };
    }

    /**
     * Render the shape's body - an HTML container holding the Infusion component's container
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
        }, h("div", {
            "fluid-layers": shape.props.layers
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
 * Populate an empty canvas with a single Infusion widget
 * @param {Editor} editor - The tldraw editor which has just mounted
 */
const onMount = function (editor) {
    if (editor.getCurrentPageShapes().length === 0) {
        editor.createShape({
            type: "infusion",
            x: 200,
            y: 200
        });
    }
};

createRoot(document.getElementById("tldraw-root")).render(
    h(Tldraw, {shapeUtils, onMount})
);
