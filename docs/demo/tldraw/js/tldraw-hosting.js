"use strict";

// Machinery for hosting Infusion widgets in tldraw shapes which does not depend on tldraw itself, held in a plain
// script so that it can be tested without it

fluid.registerNamespace("fluid.tldraw");

// The widgets constructed on the canvas, by the id of the shape hosting each - written by the driver as it constructs
// and destroys them. This is plain, so that no component is held within a cell, and is accompanied by a cell counting
// its changes, which a reactive context reading it may track - see fluid.tldraw.widgetForShape
fluid.tldraw.widgetsByShape = new Map();
fluid.tldraw.widgetsVersion = fluid.cell(0, {name: "version of the widgets constructed on the canvas"});

/**
 * Note that the widget hosted by a shape has been constructed or destroyed
 * @param {String} shapeId - The id of the shape
 * @param {fluid.component|null} that - The widget, or `null` if it has been destroyed
 */
fluid.tldraw.noteWidget = function (shapeId, that) {
    if (that) {
        fluid.tldraw.widgetsByShape.set(shapeId, that);
    } else {
        fluid.tldraw.widgetsByShape.delete(shapeId);
    }
    fluid.tldraw.widgetsVersion.set(fluid.tldraw.widgetsVersion.get() + 1);
};

/**
 * Bind to the version of the widgets constructed on the canvas - suitable as the binder of a $bindable, so that a
 * computation taking it as an argument is reevaluated as widgets are constructed and destroyed
 * @return {fluid.cell<Number>} The cell counting changes to the widgets
 */
fluid.tldraw.bindWidgetsVersion = function () {
    return fluid.tldraw.widgetsVersion;
};

// The element drawn on tldraw's canvas in page space, beneath the camera's transform, onto which widgets may draw what
// lies beyond their own shapes, e.g. the inspector's anchor line. Written by the driver as tldraw mounts and unmounts
// it, and `null` whilst there is none - see fluid.tldraw.bindCanvasLayer
fluid.tldraw.canvasLayer = fluid.cell(null, {name: "tldraw canvas layer"});

/**
 * Bind to the element drawn on tldraw's canvas in page space - suitable as the binder of a $bindable
 * @return {fluid.cell<Element|null>} The cell holding the element, or `null` whilst tldraw has not mounted it
 */
fluid.tldraw.bindCanvasLayer = function () {
    return fluid.tldraw.canvasLayer;
};

/**
 * Find the widget hosted by a shape
 * @param {String} shapeId - The id of the shape
 * @return {fluid.component|undefined} The widget, if one has been constructed in it
 */
fluid.tldraw.widgetForShape = function (shapeId) {
    return fluid.tldraw.widgetsByShape.get(shapeId);
};

/**
 * Compose the direction offered to the "Ask me anything" panel asking the AI to fix the problems diagnosed in a widget
 * @param {String} shapeId - The id of the shape hosting the widget
 * @param {String} layerName - The name of the widget's layer
 * @param {String[]} problems - The problems diagnosed in the widget
 * @return {String} The direction
 */
fluid.tldraw.fixDirection = function (shapeId, layerName, problems) {
    return `Please fix the widget ${shapeId} (layer ${layerName}), in which these problems were found:\n`
        + problems.map(problem => "* " + problem).join("\n");
};

/**
 * @typedef {Object} BadgeOptions
 * @property {Boolean} expand - `true` if the problems should be listed when the badge is first shown, e.g. since the
 * widget shows nothing else
 * @property {Function|null} onFix - Called when the user asks for the problems to be fixed, or `null` if there is no
 * means of fixing them
 */

/**
 * Render a badge reporting the problems diagnosed in a widget into an element overlaying it. The badge shows the
 * number of problems with an arrow disclosing whether they are listed, and is clicked to list or hide them, together with a button asking the AI to fix them. Whether they are
 * listed is retained as the badge is rendered afresh with fresh problems. If there are no problems, the badge is removed.
 * @param {Element} holder - The element into which the badge is rendered
 * @param {String[]} problems - The problems diagnosed in the widget
 * @param {BadgeOptions} options - Options governing the badge
 */
fluid.tldraw.renderProblemBadge = function (holder, problems, {expand, onFix}) {
    if (problems.length > 0) {
        const dokkument = holder.ownerDocument;
        const make = (tag, className, text) => {
            const element = dokkument.createElement(tag);
            element.className = className;
            if (text !== undefined) {
                element.textContent = text;
            }
            return element;
        };
        // Retain the user's choice of whether the problems are listed, once the badge has been shown
        const expanded = holder.dataset.expanded === undefined ? expand : holder.dataset.expanded === "true";
        holder.dataset.expanded = String(expanded);
        const badge = make("div", "infusion-problem-badge" + (expanded ? " infusion-problem-badge-expanded" : ""));
        const count = problems.length === 1 ? "1 problem" : `${problems.length} problems`;
        const toggle = make("button", "infusion-problem-toggle");
        toggle.append(make("span", "infusion-problem-count", "\u26A0 " + count),
            // Points down to the list it would open, and up to close the list beneath it
            make("span", "infusion-problem-arrow", expanded ? "\u25B4" : "\u25BE"));
        toggle.title = expanded ? "Hide the problems found in this widget" : "Show the problems found in this widget";
        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.addEventListener("click", () => {
            holder.dataset.expanded = String(holder.dataset.expanded !== "true");
            fluid.tldraw.renderProblemBadge(holder, problems, {expand, onFix});
        });
        badge.appendChild(toggle);
        if (expanded) {
            const details = make("div", "infusion-problem-details");
            const list = make("ul", "infusion-problem-list");
            problems.forEach(problem => list.appendChild(make("li", "infusion-problem", problem)));
            details.appendChild(list);
            if (onFix) {
                const fix = make("button", "infusion-problem-fix", "Ask the AI to fix this");
                fix.addEventListener("click", () => onFix(problems));
                details.appendChild(fix);
            }
            badge.appendChild(details);
        }
        holder.replaceChildren(badge);
    } else {
        delete holder.dataset.expanded;
        holder.replaceChildren();
    }
};

// The reporter of the problems found in each widget hosted on the canvas, keyed by the element hosting it - see
// InfusionHost in tldraw-driver.js
fluid.tldraw.problemReporters = new WeakMap();

/**
 * The error policy of the tldrawHost, an error boundary for every widget hosted on the canvas. An error in rendering
 * a widget is not rendered in place, within the widget, but is reported on its problem badge, alongside any other
 * problems diagnosed in it - see `fluid.tldraw.renderProblemBadge`. An error arising in any other component within the
 * boundary is rendered in place, as the framework would.
 * @param {RenderErrorReport} report - The report of the error
 */
fluid.tldraw.reportWidgetError = function (report) {
    const host = report.container.closest(".infusion-host");
    const reporter = host && fluid.tldraw.problemReporters.get(host);
    if (reporter) {
        reporter(report);
    } else {
        fluid.renderErrorReport(report);
    }
};

/**
 * Construct the potentia through which a host supplies a widget with its container, the id of its shape and the
 * configuration of its shape - directed at the widget's view, as at any view component. A widget whose view is borrowed
 * from one of its subcomponents, e.g. by `view: "{first}.view"`, receives them just the same, since options naming no
 * `$layers` at a member injecting a component refine that component - see "Refining an injected component" in
 * ponder's docs/fluid-integration-language.md
 * @param {Element} container - The container into which the widget is to render
 * @param {String} shapeId - The id of the tldraw shape hosting the widget
 * @param {ShapeConfig} [shapeConfig] - The configuration of the shape, as determined by `fluid.tldraw.shapeToConfig`
 * @return {Object} The potentia to be supplied to the widget's creator function
 */
fluid.tldraw.hostPotentia = function (container, shapeId, shapeConfig) {
    return {view: {$component: {container, shapeId, ...(shapeConfig ? {shape: shapeConfig} : {})}}};
};

/**
 * The configuration of the tldraw shape hosting a widget, which is held as the `shape` member of the widget's view,
 * a `fluid.tldrawViewComponent`, and through which the widget's shape is transmitted in PTF. Any member holding its
 * default in that layer is omitted.
 * @typedef {Object} ShapeConfig
 * @property {Number} [x] - The x coordinate of the shape, relative to its parent
 * @property {Number} [y] - The y coordinate of the shape, relative to its parent
 * @property {Number} [w] - The shape's width - by default, the preferred width of the widget's layer
 * @property {Number} [h] - The shape's height - by default, the preferred height of the widget's layer
 * @property {Number} [rotation] - The shape's rotation in radians
 * @property {Boolean} [isLocked] - Whether the shape is locked
 * @property {Number} [opacity] - The shape's opacity
 * @property {String} [parentId] - The id of a shape, e.g. a frame, which is the shape's parent - by default it is a
 * child of the page
 * @property {String} [index] - The shape's fractional index, ordering it amongst others transmitted with it
 */

/**
 * Read the defaults of the configuration of a shape hosting a widget from `fluid.tldrawViewComponent`
 * @return {ShapeConfig} The defaults, or an empty record if the layer is not defined
 */
fluid.tldraw.shapeConfigDefaults = function () {
    return fluid.tldraw.readLayerDef("fluid.tldrawViewComponent")?.shape || {};
};

/**
 * Determine the configuration of a shape hosting a widget. Members holding their default are omitted, as is the
 * shape's parent unless it is another shape, and its index unless it is transmitted with other shapes, since its
 * index only orders it amongst them.
 * @param {TLShape} shape - The shape
 * @param {Boolean} withIndex - `true` if the shape's index is to be included
 * @param {ShapeConfig} [defaults] - The defaults, as read by `fluid.tldraw.shapeConfigDefaults`
 * @return {ShapeConfig} The configuration
 */
fluid.tldraw.shapeToConfig = function (shape, withIndex, defaults = fluid.tldraw.shapeConfigDefaults()) {
    const config = {
        x: shape.x,
        y: shape.y,
        w: shape.props.w,
        h: shape.props.h,
        rotation: shape.rotation,
        isLocked: shape.isLocked,
        opacity: shape.opacity,
        parentId: shape.parentId?.startsWith("shape:") ? shape.parentId : null,
        index: withIndex ? shape.index : null
    };
    return fluid.filterObjKeys(config, key => config[key] !== undefined && config[key] !== null && config[key] !== defaults[key]);
};

// The digits of a fractional index, in order
fluid.tldraw.indexDigits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Allocate a fractional index for a shape transmitted without one, ordering it after those transmitted before it
 * @param {Number} position - The position of the shape amongst those transmitted
 * @return {String} The index
 */
fluid.tldraw.defaultIndex = function (position) {
    const last = fluid.tldraw.indexDigits.length - 1;
    // "a1" to "az", followed by "az1", "az2" ...
    return position < last ? "a" + fluid.tldraw.indexDigits[position + 1] :
        "a" + "z".repeat(Math.floor(position / last)) + fluid.tldraw.indexDigits[position % last + 1];
};

/**
 * Construct the record of a shape hosting a widget from the configuration with which it was transmitted
 * @param {ShapeConfig} config - The configuration
 * @param {Object} site - Where the shape is to be placed, where its configuration does not say
 * @param {String} site.id - The id of the shape
 * @param {String} site.layerName - The name of the widget's layer
 * @param {String} site.parentId - The id of the shape's parent, e.g. the current page, if it has no shape as parent
 * @param {String} site.index - The shape's index, if its configuration has none
 * @param {ShapeConfig} [defaults] - The defaults, as read by `fluid.tldraw.shapeConfigDefaults`
 * @return {TLShape} The record of the shape
 */
fluid.tldraw.configToShape = function (config, {id, layerName, parentId, index}, defaults = fluid.tldraw.shapeConfigDefaults()) {
    const full = {...defaults, ...config};
    const size = typeof(full.w) === "number" && typeof(full.h) === "number" ? full : fluid.tldraw.shapeSizeFor(layerName);
    return {
        id,
        typeName: "shape",
        type: "infusion",
        x: full.x ?? 0,
        y: full.y ?? 0,
        rotation: full.rotation ?? 0,
        isLocked: full.isLocked ?? false,
        opacity: full.opacity ?? 1,
        parentId: full.parentId ?? parentId,
        index: full.index ?? index,
        props: {layerName, w: full.w ?? size.w, h: full.h ?? size.h},
        meta: {}
    };
};

/**
 * Find the potentia supplied by a host to a widget's view, as constructed by `fluid.tldraw.hostPotentia` - the
 * `$component` record of the view at the root of the widget's potentia. An arena persisted before a borrowed view could
 * be refined at the root held them within the potentia of the subcomponent lending the view, where they are found too,
 * so that `fluid.tldraw.writeShapeConfig` moves them to the root. It is recognised by holding `shapeId` or `shape`.
 * @param {Object} potentia - The widget's potentia
 * @return {Object|null} The record of the view's potentia, or `null` if there is none
 */
fluid.tldraw.findViewPotentia = function (potentia) {
    let togo = null;
    if (fluid.isPlainObject(potentia, true)) {
        const view = potentia.view?.$component;
        if (fluid.isPlainObject(view, true) && ("shapeId" in view || "shape" in view)) {
            togo = view;
        } else {
            for (const member of Object.values(potentia)) {
                if (togo === null && fluid.isPlainObject(member?.$component, true)) {
                    togo = fluid.tldraw.findViewPotentia(member.$component);
                }
            }
        }
    }
    return togo;
};

/**
 * Remove any members of a potentia record which hold nothing but empty records, e.g. `{view: {$component: {}}}`
 * @param {Object} potentia - The potentia record, which is modified
 * @return {Boolean} `true` if the record is itself empty, once pruned
 */
fluid.tldraw.pruneEmpty = function (potentia) {
    fluid.each(potentia, (value, key) => {
        if (fluid.isPlainObject(value, true) && fluid.tldraw.pruneEmpty(value)) {
            delete potentia[key];
        }
    });
    return Object.keys(potentia).length === 0;
};

/**
 * Write the configuration of the shape hosting a widget into the potentia of its view, held in the root potentia part
 * of the parts transmitting the widget, in place of whatever the host supplied to it when the widget was constructed.
 * The shape's id is not transmitted, since the receiving host supplies its own.
 * @param {PTFPart[]} parts - The parts transmitting the widget
 * @param {String} layerName - The name of the widget's layer
 * @param {ShapeConfig|null} config - The configuration, or `null` if only what the host supplied is to be removed
 * @return {PTFPart[]} The parts, with the root potentia part rewritten
 */
fluid.tldraw.writeShapeConfig = function (parts, layerName, config) {
    return parts.map(part => {
        let togo = part;
        if (fluid.ptf.isRootPotentiaPart(part)) {
            const potentia = JSON.parse(part.body);
            // What the host supplied is removed, wherever it was written
            const supplied = fluid.tldraw.findViewPotentia(potentia);
            if (supplied) {
                delete supplied.container;
                delete supplied.shapeId;
                delete supplied.shape;
            }
            // The shape is written at the widget's view, at its root, whether its view is its own or borrowed
            if (config && Object.keys(config).length > 0) {
                const view = fluid.isPlainObject(potentia.view, true) ? potentia.view : {};
                potentia.view = {...view, $component: {...view.$component, shape: config}};
            }
            const $layers = potentia.$layers;
            fluid.tldraw.pruneEmpty(potentia);
            togo = {...part, body: JSON.stringify({$layers, ...potentia}, null, 4)};
        }
        return togo;
    });
};

/**
 * Read the configuration of the shape hosting a widget from the root potentia of the parts transmitting it
 * @param {PTFPart[]} parts - The parts transmitting the widget
 * @return {ShapeConfig} The configuration, which is empty if none was transmitted
 */
fluid.tldraw.readShapeConfig = function (parts) {
    const rootPart = parts.find(fluid.ptf.isRootPotentiaPart);
    return (rootPart && fluid.tldraw.findViewPotentia(JSON.parse(rootPart.body))?.shape) || {};
};

// The arena's histories, as stepped through by the history buttons and keyboard shortcuts - see tldraw-arena.js

/**
 * @typedef {Object} HistoryCommand
 * @property {String} stack - The member of `fluid.history` holding the history stack acted on - "live" or "definitions"
 * @property {Boolean} back - `true` to step back through the stack, `false` to step forward
 * @property {String} key - The key which, with the platform's command modifier, issues the command
 * @property {Boolean} shift - `true` if the Shift key must also be held
 * @property {String} label - A description of the command
 * @property {String} icon - The text of the command's button
 */

/** @type {HistoryCommand[]} */
fluid.tldraw.historyCommands = [
    {stack: "live", back: true, key: "z", shift: false, label: "Undo widget change", icon: "↶"},
    {stack: "live", back: false, key: "y", shift: false, label: "Redo widget change", icon: "↷"},
    {stack: "definitions", back: true, key: "z", shift: true, label: "Undo layer change", icon: "↶"},
    {stack: "definitions", back: false, key: "y", shift: true, label: "Redo layer change", icon: "↷"}
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

// Elements which handle pointer gestures natively, resize bars, and those whose widget handles them with listeners of
// its own rather than through its template, which marks them with the class fl-tldraw-interactive
fluid.tldraw.interactiveSelector = "button, input, select, textarea, a, .fl-resize-bar, .fl-tldraw-interactive";

// The events whose handlers, bound by a template onto any element of a widget, make it receive the pointer gestures
// over it rather than tldraw - a click is only delivered to the element which saw the pointer pressed and released
fluid.tldraw.pointerEvents = ["click", "dblclick", "contextmenu", "mousedown", "mouseup", "pointerdown", "pointerup"];

/**
 * Determine whether a pointer gesture beginning at an element within a widget's host should be received by the widget
 * rather than taken by tldraw to select or drag its shape - since the element, or one enclosing it within the host, is
 * natively interactive, or has a handler bound to it for a pointer event, e.g. a cell of a board bound by
 * `@onclick`. Gestures over the remainder of the widget drag its shape.
 * @param {Element} target - The element at which the gesture began
 * @param {Element} host - The element hosting the widget, at which the search ends
 * @return {Boolean} `true` if the gesture belongs to the widget
 */
fluid.tldraw.isInteractiveTarget = function (target, host) {
    let interactive = !!target.closest(fluid.tldraw.interactiveSelector);
    for (let element = target; !interactive && element && element !== host; element = element.parentElement) {
        interactive = fluid.hasBoundEvent(element, fluid.tldraw.pointerEvents);
    }
    return interactive;
};

/**
 * Determine which history command, if any, a keystroke issues
 * @param {KeyboardEvent} event - The keystroke
 * @param {Boolean} isApple - `true` on an Apple platform, where the command modifier is Cmd rather than Ctrl
 * @return {HistoryCommand|undefined} The command issued, if any
 */
fluid.tldraw.commandForKey = function (event, isApple) {
    const modified = isApple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    // A keydown synthesised by the browser, e.g. by Chrome on autofilling a form such as the AI panel's password,
    // may have no key
    const key = typeof(event.key) === "string" ? event.key.toLowerCase() : null;
    return key && modified && !event.altKey ? fluid.tldraw.historyCommands.find(command => command.key === key && command.shift === event.shiftKey) : undefined;
};

/**
 * Issue a history command
 * @param {HistoryCommand} command - The command
 * @return {Boolean} `true` if a record was undone or redone
 */
fluid.tldraw.runHistoryCommand = function (command) {
    const stack = fluid.history[command.stack];
    return command.back ? fluid.history.stepBack(stack) : fluid.history.stepForward(stack);
};

/**
 * Determine the member name under which the widget hosted by a shape is constructed within the tldrawHost, which is
 * the root of the arena. Since this is derived from the shape's id, a widget reconstructed in the same shape, e.g. on
 * undoing its deletion or restoring the arena, keeps its path within the arena, and the records of its state in
 * `fluid.history.live` apply to it once more - see `fluid.history.arenaRoot`.
 * @param {String} shapeId - The id of the shape hosting the widget
 * @return {String} The widget's member name
 */
fluid.tldraw.widgetMemberName = function (shapeId) {
    return shapeId.replace(/[^\w-]/g, "-");
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
    const undo = fluid.tldraw.historyCommands.find(command => command.stack === "definitions" && command.back);
    return [
        `Delete the layer ${layerName}?`,
        ...(widgetCount > 0 ? [`The ${widgetCount === 1 ? "widget" : widgetCount + " widgets"} on the canvas made from it will be deleted too.`] : []),
        ...(dependents.length > 0 ? [`These layers are built on it, and will no longer work: ${dependents.join(", ")}`] : []),
        `The deletion of the layer can be undone with ${fluid.tldraw.shortcutLabel(undo, isApple)}.`
    ].join("\n\n");
};

// The least widths in pixels of the canvas and of the "Ask me anything" panel, as the bar dividing them is dragged
fluid.tldraw.minCanvasWidth = 400;
fluid.tldraw.minPanelWidth = 280;

/**
 * Construct the standard resize bar dividing the canvas from the "Ask me anything" panel, once its layer is loaded
 * @param {Document} dokkument - The document holding `#canvas-pane`, `#ai-resize-bar` and `#ai-root`
 * @return {Promise<fluid.resizeBar>} A promise for the bar
 */
fluid.tldraw.bindResizeBar = function (dokkument) {
    return fluid.ai.arena.awaitLayer("fluid.resizeBar").then(() => {
        const bar = fluid.resizeBar({
            before: dokkument.getElementById("canvas-pane"),
            after: dokkument.getElementById("ai-root"),
            minBefore: fluid.tldraw.minCanvasWidth,
            minAfter: fluid.tldraw.minPanelWidth,
            view: {
                $component: {
                    container: dokkument.getElementById("ai-resize-bar"),
                    elideParent: true
                }
            }
        });
        fluid.cell.stabilize();
        return bar;
    });
};
