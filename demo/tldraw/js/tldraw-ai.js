// The bridge through which the "Ask me anything" panel acts on the canvas - gathering the state of the workspace for the
// AI's prompt, and applying the changes planned from a PTF document it sends back. The steps common to every arena -
// registering layers, applying changes to a widget in place, and diagnosing the widgets before and after - are
// Infusion's (src/components/askAnything/fluid-ai-arena.js), whose arena the canvas's widgets form, as children of the
// tldrawHost; what is the canvas's own is the geometry of the shapes hosting them, and their creation and deletion
// through the editor. The canvas's contributions to the protocol itself are in ai-protocol.js.
// See FLUID-7022

import {createShapeId} from "tldraw";
import {infusionInstances, registerPendingParts, awaitInstantiation, snapshotForUndo, awaitReport, describeInstantiation,
    isWidgetAvailable} from "./tldraw-clipboard.js";

// The gap left between the user's selection and a fresh widget placed beside it
const placementGap = 40;


/**
 * Construct the bridge through which the "Ask me anything" panel reflects on and alters the canvas
 * @param {Editor} editor - The tldraw editor
 * @return {ArenaBridge} The bridge - see fluid-ai-arena.js
 */
export const makeAIBridge = function (editor) {
    /**
     * Gather the current state of the workspace on the current page
     * @return {Workspace} The workspace
     */
    const gatherWorkspace = function () {
        const shapes = editor.getCurrentPageShapes();
        const widgets = shapes.filter(shape => shape.type === "infusion").map(shape => ({
            // Its id in the arena is the id of its shape
            id: shape.id,
            shapeId: shape.id,
            layerName: shape.props.layerName,
            bounds: editor.getShapePageBounds(shape),
            component: infusionInstances.get(shape.id)
        }));
        const canvasShapes = shapes.filter(shape => shape.type !== "infusion").map(shape => {
            const bounds = editor.getShapePageBounds(shape);
            const text = fluid.tldraw.extractText(shape);
            return {id: shape.id, type: shape.type, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, ...(text ? {text} : {})};
        });
        return {
            widgets,
            canvasShapes,
            selectedIds: editor.getSelectedShapeIds(),
            availableLayers: fluid.tldraw.widgetLayers.get()
        };
    };

    /**
     * Choose a site for a fresh widget without an explicit position - beside the user's selection if there is one,
     * otherwise in the centre of the viewport, avoiding any widget already there
     * @param {Object} size - The size of the fresh widget as `{w, h}`
     * @param {Object} [previous] - The site of the widget created just before this one by the same response, if any
     * @return {Object} The site as `{x, y}`
     */
    const chooseSite = function (size, previous) {
        const selection = editor.getSelectionPageBounds();
        let site;
        if (previous) {
            site = {x: previous.x, y: previous.y + previous.h + placementGap};
        } else if (selection) {
            site = {x: selection.x + selection.w + placementGap, y: selection.y};
        } else {
            const center = editor.getViewportPageBounds().center;
            site = {x: center.x - size.w / 2, y: center.y - size.h / 2};
        }
        return fluid.tldraw.findFreeSite(editor, site);
    };

    /**
     * Await the construction of a widget from parts registered under a token, and diagnose it. A fresh widget which
     * could not be constructed or did not become available is removed, so that a corrected response can create it afresh.
     * @param {Promise<InstantiationReport>} instantiation - The promise from `awaitInstantiation` for the widget's token
     * @param {String} shapeId - The id of the shape hosting the widget
     * @param {WidgetChange} change - The change which led to the widget's construction
     * @return {Promise<String[]>} A promise for descriptions of any problems found
     */
    const checkInstantiation = async function (instantiation, shapeId, change) {
        const problems = await diagnoseInstantiation(instantiation, shapeId, change);
        let togo;
        if (shapeId !== change.key && problems.length > 0 && !isWidgetAvailable(shapeId)) {
            editor.deleteShapes([shapeId]);
            togo = problems.map(problem => problem + " - its shape has been removed");
        } else {
            togo = problems;
        }
        return togo;
    };

    /**
     * Await the construction of a widget from parts registered under a token, and describe any problems with it
     * @param {Promise<InstantiationReport>} instantiation - The promise from `awaitInstantiation` for the widget's token
     * @param {String} shapeId - The id of the shape hosting the widget
     * @param {WidgetChange} change - The change which led to the widget's construction
     * @return {Promise<String[]>} A promise for descriptions of any problems found
     */
    const diagnoseInstantiation = async function (instantiation, shapeId, change) {
        const report = await awaitReport(instantiation);
        const what = `The widget ${JSON.stringify(change.key)}` + (shapeId === change.key ? "" : ` (now shape ${shapeId})`);
        return describeInstantiation(report, shapeId, change.layerName, what);
    };


    /**
     * Apply changes planned from a PTF document sent by the AI to the workspace. The changes are preceded by a history
     * stopping point so that they can be undone together, as far as tldraw's history extends - redefinitions of layers
     * and changes applied to a widget in place are not undone. The layers are registered, and those of fresh widgets
     * awaited until they report their sizes, before the stopping point is marked and the canvas is changed, so that
     * nothing the user does whilst they load is undone along with the AI's changes.
     * @param {ChangePlan} plan - The planned changes
     * @return {Promise<AppliedChanges>} A promise for the changes made, resolving once any fresh or replaced
     * widgets have been constructed or have timed out
     */
    const applyPlan = async function (plan) {
        const summary = [];
        const problems = [];
        const instantiations = [];
        const createdIds = [];
        const constructedIds = new Set();
        // Problems which predate the changes are not reported, since the AI is not responsible for them
        const existingProblems = new Set(fluid.ai.arena.diagnoseAll(infusionInstances));
        fluid.ai.arena.registerLayers(plan, summary, problems);
        // The nested layers of each fresh widget are registered first so that its preferred size can be read from its
        // layer, once its SFC, e.g. one sent in these parts, has been injected - all are awaited together
        const preferredSizes = await Promise.all(plan.creations.map(change => {
            fluid.ptf.registerLayerParts(change.parts, true);
            return fluid.tldraw.awaitShapeSize(change.layerName);
        }));
        editor.markHistoryStoppingPoint("ai-change");
        if (plan.deletions.length > 0) {
            snapshotForUndo(editor, plan.deletions.map(id => editor.getShape(id)));
            editor.deleteShapes(plan.deletions);
            plan.deletions.forEach(id => summary.push(`Deleted shape ${id}`));
        }
        for (const change of plan.updates) {
            const shape = editor.getShape(change.key);
            if (Object.keys(change.shape).length > 0) {
                const props = fluid.filterObjKeys(change.shape, key => key === "w" || key === "h");
                const position = fluid.filterObjKeys(change.shape, key => key === "x" || key === "y");
                editor.updateShape({id: shape.id, type: shape.type, ...position, props});
            }
            if (change.rebuild) {
                snapshotForUndo(editor, [shape]);
                const ptfToken = registerPendingParts(change.parts);
                const instantiation = awaitInstantiation(ptfToken);
                editor.updateShape({
                    id: shape.id,
                    type: shape.type,
                    props: {layerName: change.layerName},
                    meta: {...editor.getShape(shape.id).meta, ptfToken}
                });
                instantiations.push(checkInstantiation(instantiation, shape.id, change));
                constructedIds.add(shape.id);
                summary.push(`Replaced widget ${shape.id} with one constructed from layer ${change.layerName}`);
            } else {
                const that = infusionInstances.get(shape.id);
                if (that) {
                    await fluid.ai.arena.applyInPlace(that, shape.id, change, problems, () => isWidgetAvailable(shape.id));
                } else {
                    problems.push(`The widget ${shape.id} has not yet been constructed, so your parts could not be applied to it`);
                }
                summary.push(`Updated widget ${shape.id}`);
            }
        }
        let previous = null;
        for (const [i, change] of plan.creations.entries()) {
            const preferred = preferredSizes[i];
            const size = {w: change.shape.w || preferred.w, h: change.shape.h || preferred.h};
            const chosen = typeof(change.shape.x) === "number" && typeof(change.shape.y) === "number" ? null : chooseSite(size, previous);
            const site = {x: change.shape.x ?? chosen.x, y: change.shape.y ?? chosen.y};
            const id = createShapeId();
            const ptfToken = registerPendingParts(change.parts);
            const instantiation = awaitInstantiation(ptfToken);
            editor.createShape({id, type: "infusion", ...site, props: {layerName: change.layerName, ...size}, meta: {ptfToken}});
            createdIds.push(id);
            constructedIds.add(id);
            previous = {...site, ...size};
            instantiations.push(checkInstantiation(instantiation, id, change));
            summary.push(`Created widget ${JSON.stringify(change.key)} as shape ${id} from layer ${change.layerName}`);
        }
        if (createdIds.length > 0) {
            editor.select(...createdIds);
        }
        (await Promise.all(instantiations)).forEach(found => problems.push(...found));
        // The widgets are diagnosed once the workspace has settled, when their state is final
        problems.push(...await fluid.ai.arena.diagnoseSettled(infusionInstances, constructedIds, existingProblems, isWidgetAvailable));
        return {summary, problems: [...new Set(problems)]};
    };

    return {gatherWorkspace, applyPlan};
};
