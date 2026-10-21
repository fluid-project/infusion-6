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

// The arena's histories, as stepped through by the history buttons and keyboard shortcuts - see tldraw-arena.js

/**
 * @typedef {Object} HistoryCommand
 * @property {String} stack - The member of `fluid` holding the history stack acted on - "liveHistory" or "definitionHistory"
 * @property {Boolean} back - `true` to step back through the stack, `false` to step forward
 * @property {String} key - The key which, with the platform's command modifier, issues the command
 * @property {Boolean} shift - `true` if the Shift key must also be held
 * @property {String} label - A description of the command
 * @property {String} icon - The text of the command's button
 */

/** @type {HistoryCommand[]} */
fluid.tldraw.historyCommands = [
    {stack: "liveHistory", back: true, key: "z", shift: false, label: "Undo widget change", icon: "↶"},
    {stack: "liveHistory", back: false, key: "y", shift: false, label: "Redo widget change", icon: "↷"},
    {stack: "definitionHistory", back: true, key: "z", shift: true, label: "Undo layer change", icon: "↶"},
    {stack: "definitionHistory", back: false, key: "y", shift: true, label: "Redo layer change", icon: "↷"}
];

/**
 * Determine whether the browser is running on an Apple platform, whose command modifier is Cmd rather than Ctrl
 * @param {Navigator} [nav] - The browser's navigator, by default the current one
 * @return {Boolean} `true` on macOS or iOS
 */
fluid.tldraw.isApple = function (nav = navigator) {
    return /mac|iphone|ipad/i.test(nav.userAgentData?.platform || nav.platform || "");
};

/**
 * Render the keyboard shortcut of a command as it is conventionally written on the platform, e.g. "⇧⌘Z" on macOS
 * and "Ctrl+Shift+Z" elsewhere
 * @param {HistoryCommand} command - The command
 * @param {Boolean} isApple - `true` on an Apple platform
 * @return {String} The rendered shortcut
 */
fluid.tldraw.shortcutLabel = function (command, isApple) {
    const key = command.key.toUpperCase();
    return isApple ? (command.shift ? "⇧" : "") + "⌘" + key : "Ctrl+" + (command.shift ? "Shift+" : "") + key;
};

/**
 * Render the tooltip of a command's button, advertising its keyboard shortcut
 * @param {HistoryCommand} command - The command
 * @param {Boolean} isApple - `true` on an Apple platform
 * @return {String} The tooltip
 */
fluid.tldraw.commandTooltip = (command, isApple) => `${command.label} (${fluid.tldraw.shortcutLabel(command, isApple)})`;

/**
 * Determine whether an element captures keystrokes for editing text, in which case its own undo is left alone
 * @param {Element|null} element - The element, e.g. the document's active element
 * @return {Boolean} `true` if the element edits text
 */
fluid.tldraw.isTextEditing = function (element) {
    return !!element && (["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable === true);
};

/**
 * Determine which history command, if any, a keystroke issues
 * @param {KeyboardEvent} event - The keystroke
 * @param {Boolean} isApple - `true` on an Apple platform, where the command modifier is Cmd rather than Ctrl
 * @return {HistoryCommand|undefined} The command issued, if any
 */
fluid.tldraw.commandForKey = function (event, isApple) {
    const modified = isApple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    const key = event.key.toLowerCase();
    return modified && !event.altKey ? fluid.tldraw.historyCommands.find(command => command.key === key && command.shift === event.shiftKey) : undefined;
};

/**
 * Issue a history command
 * @param {HistoryCommand} command - The command
 * @return {Boolean} `true` if a record was undone or redone
 */
fluid.tldraw.runHistoryCommand = function (command) {
    const stack = fluid[command.stack];
    return command.back ? fluid.ptf.historyBack(stack) : fluid.ptf.historyForward(stack);
};

/**
 * @typedef {Object} ArenaSiteRef
 * @property {String} shapeId - The id of the shape hosting the widget holding the site
 * @property {String} component - The path of the site's component within the widget, as rendered by `fluid.ptf.segsToFilename`
 * @property {String} path - The path of the site within its component
 */

/**
 * Find the widget holding a component, together with the component's path within it
 * @param {Shadow} shadow - The shadow of the component
 * @param {Map<String, fluid.component>} instances - The widget hosted by each shape, keyed by shape id
 * @return {Object|null} `{shapeId, segs}` for the widget holding the component, or `null` if it is in none
 */
fluid.tldraw.findWidget = function (shadow, instances) {
    const roots = new Map([...instances].map(([shapeId, that]) => [fluid.ptf.componentToShadow(that), shapeId]));
    const segs = [];
    let current = shadow;
    while (current && !roots.has(current)) {
        segs.unshift(current.memberName);
        current = current.parentShadow;
    }
    return current ? {shapeId: roots.get(current), segs} : null;
};

/**
 * Render a site as a reference relative to the widget holding it, which remains valid once the canvas has been
 * restored with fresh components - suitable for `fluid.ptf.encodeLiveRecord`
 * @param {String} site - The site, as rendered by `fluid.renderSite`
 * @param {Map<String, fluid.component>} instances - The widget hosted by each shape, keyed by shape id
 * @return {ArenaSiteRef|null} The reference, or `null` if the site is not in any widget
 */
fluid.tldraw.siteToRef = function (site, instances) {
    const parsed = fluid.parseSite(site);
    const widget = parsed.shadow ? fluid.tldraw.findWidget(parsed.shadow, instances) : null;
    return widget ? {shapeId: widget.shapeId, component: fluid.ptf.segsToFilename(widget.segs), path: parsed.path} : null;
};

/**
 * Resolve a reference produced by `fluid.tldraw.siteToRef` to the site it now refers to - suitable for
 * `fluid.ptf.decodeLiveRecord`
 * @param {ArenaSiteRef} ref - The reference
 * @param {Map<String, fluid.component>} instances - The widget hosted by each shape, keyed by shape id
 * @return {String|null} The site, as rendered by `fluid.renderSite`, or `null` if it no longer exists
 */
fluid.tldraw.refToSite = function (ref, instances) {
    const that = instances.get(ref.shapeId);
    const shadow = that && fluid.ptf.resolveShadow(fluid.ptf.componentToShadow(that), fluid.ptf.filenameToSegs(ref.component));
    return shadow ? fluid.renderSite({shadow, segs: fluid.pathToSegs(ref.path)}) : null;
};

// The widget layers offered by the "New shape" menu, and their deletion

/**
 * Read the definition of a layer, tracking it so that a reactive context reading it is reevaluated as it is defined,
 * redefined or deleted
 * @param {String} layerName - The name of the layer
 * @return {LayerDef|null} The layer's definition, or `null` if it is not currently defined
 */
fluid.tldraw.readLayerDef = function (layerName) {
    const layerRec = fluid.readLayer(layerName).get();
    return fluid.layerRecToUnavailable(layerRec) === null ? fluid.deSignal(layerRec.raw) : null;
};

/**
 * Determine whether a layer reaches another through its `$layers`, directly or through any of its parent layers. Each
 * definition traversed is tracked, as for `fluid.tldraw.readLayerDef`.
 * @param {String} layerName - The name of the layer
 * @param {String} target - The name of the layer sought amongst its ancestors
 * @param {Set<String>} [visited] - The layers already traversed, which guards against a circular hierarchy
 * @return {Boolean} `true` if the layer reaches the target
 */
fluid.tldraw.layerReaches = function (layerName, target, visited = new Set()) {
    let togo = false;
    if (!visited.has(layerName)) {
        visited.add(layerName);
        const def = fluid.tldraw.readLayerDef(layerName);
        const parents = def ? fluid.makeArray(def.$layers).filter(parent => typeof(parent) === "string" && !fluid.isReferenceOrExpander(parent)) : [];
        togo = parents.includes(target) || parents.some(parent => fluid.tldraw.layerReaches(parent, target, visited));
    }
    return togo;
};

/**
 * Determine whether a layer is a currently defined user layer, as opposed to a framework layer
 * @param {String} layerName - The name of the layer
 * @return {Boolean} `true` if the layer is a defined user layer
 */
fluid.tldraw.isDefinedUserLayer = function (layerName) {
    const def = fluid.tldraw.readLayerDef(layerName);
    return fluid.isPlainObject(def, true) && fluid.layerFrameworkStatus(def) === 0;
};

/**
 * List the user layers in the layer store which are top-level widgets - that is, which reach `fluid.topLevelWidget`
 * through their `$layers`. Whether loaded from an SFC imported by the page, or registered from a PTF document, e.g.
 * one sent by the AI or pasted, as an SFC or as JavaScript, every such layer is listed. Read within a reactive
 * context, this is reevaluated as layers are defined, redefined or deleted.
 * @return {String[]} The sorted names of all top-level widget layers
 */
fluid.tldraw.listWidgetLayers = function () {
    return Object.keys(fluid.layerStore.get())
        .filter(layerName => fluid.tldraw.isDefinedUserLayer(layerName) && fluid.tldraw.layerReaches(layerName, "fluid.topLevelWidget"))
        .sort();
};

/**
 * A cell listing the top-level widget layers offered by the "New shape" menu, as listed by `fluid.tldraw.listWidgetLayers`
 * @type {fluid.cell<String[]>}
 */
// Note that dependencies are tracked dynamically, since the definitions traversed are only discovered by reading them
fluid.tldraw.widgetLayers = fluid.cell(undefined, {name: "tldraw top-level widget layers"}).computed(() => fluid.tldraw.listWidgetLayers());

/**
 * List the user layers which are built on a layer - that is, which reach it through their `$layers` - and so would no
 * longer work were it deleted
 * @param {String} layerName - The name of the layer
 * @return {String[]} The sorted names of the layers built on it
 */
fluid.tldraw.dependentLayers = function (layerName) {
    return Object.keys(fluid.layerStore.get())
        .filter(other => other !== layerName && fluid.tldraw.isDefinedUserLayer(other) && fluid.tldraw.layerReaches(other, layerName))
        .sort();
};

/**
 * Compose the question confirming the deletion of a widget layer
 * @param {String} layerName - The name of the layer
 * @param {Number} widgetCount - The number of widgets on the canvas made from the layer, which will be deleted with it
 * @param {String[]} dependents - The layers built on it, as listed by `fluid.tldraw.dependentLayers`
 * @param {Boolean} isApple - `true` on an Apple platform, for rendering the shortcut undoing the deletion
 * @return {String} The question
 */
fluid.tldraw.deletionQuestion = function (layerName, widgetCount, dependents, isApple) {
    const undo = fluid.tldraw.historyCommands.find(command => command.stack === "definitionHistory" && command.back);
    return [
        `Delete the layer ${layerName}?`,
        ...(widgetCount > 0 ? [`The ${widgetCount === 1 ? "widget" : widgetCount + " widgets"} on the canvas made from it will be deleted too.`] : []),
        ...(dependents.length > 0 ? [`These layers are built on it, and will no longer work: ${dependents.join(", ")}`] : []),
        `The deletion of the layer can be undone with ${fluid.tldraw.shortcutLabel(undo, isApple)}.`
    ].join("\n\n");
};
