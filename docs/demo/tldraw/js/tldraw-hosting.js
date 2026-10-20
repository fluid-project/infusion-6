"use strict";

// Machinery for hosting Infusion widgets in tldraw shapes which does not depend on tldraw itself, held in a plain
// script so that it can be tested without it

fluid.registerNamespace("fluid.tldraw");

// Matches a reference by which a component's view is cross-injected from one of its subcomponents, e.g. "{first}.view"
// or "{self}.first.view", capturing the subcomponent's member name
fluid.tldraw.injectedViewREs = [/^\{([\w$]+)\}\.view$/, /^\{self\}\.([\w$]+)\.view$/];

/**
 * Construct the potentia through which a host supplies a widget with its container and the id of its shape. These are
 * ordinarily directed at the widget's own view. However, a widget whose view is cross-injected from one of its
 * subcomponents, e.g. by `view: "{first}.view"` as described in fluid-project/infusion-6#20, has no view of its own,
 * and potentia directed at its view would override the injection. In this case, they are directed at the view of that
 * subcomponent instead, following any further such injection made by the subcomponent's own layer.
 * @param {String} layerName - The name of the widget's layer, which must already be registered
 * @param {Element} container - The container into which the widget is to render
 * @param {String} shapeId - The id of the tldraw shape hosting the widget
 * @return {Object} The potentia to be supplied to the widget's creator function
 */
fluid.tldraw.hostPotentiaFor = function (layerName, container, shapeId) {
    const merged = fluid.avatarMerged(layerName);
    const viewRef = fluid.isUnavailable(merged) ? null : merged.view;
    const match = typeof(viewRef) === "string" && fluid.tldraw.injectedViewREs.map(re => re.exec(viewRef)).find(oneMatch => oneMatch);
    const memberName = match && match[1];
    const contributions = memberName && merged[memberName]?.$component?.contributions;
    let togo;
    if (contributions) {
        const memberLayers = contributions.flatMap(contribution => fluid.makeArray(contribution.record.$layers));
        const memberLayer = fluid.peek(memberLayers);
        // A container is only forwarded to the view when supplied to a free component, so for a subcomponent it is
        // supplied to its view directly
        const memberPotentia = memberLayer && fluid.layerRecToUnavailable(fluid.readLayer(memberLayer).get()) === null ?
            fluid.tldraw.hostPotentiaFor(memberLayer, container, shapeId) : {view: {$component: {container, shapeId}}};
        togo = {[memberName]: {$component: memberPotentia}};
    } else {
        togo = {view: {$component: {container, shapeId}}};
    }
    return togo;
};
