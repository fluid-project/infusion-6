"use strict";

// What the "Ask me anything" panel converses about in this demo: the widgets hosted in the shapes of a tldraw canvas.
// The protocol itself - encoding the workspace as PTF, the system prompt, planning, checking and diagnosing the changes
// the AI sends - is Infusion's own, for any arena (src/components/askAnything/fluid-ai-arena.js). This demo is a *host*
// of an arena, contributing:
//  - the `shape` part placing each widget on the canvas, and the `canvas` part listing the native shapes beside them,
//    to the workspace's document, and the planning of the shape parts the AI sends (fluid.tldraw.ai.host);
//  - its own stanzas of the system prompt, merged into Infusion's by the layer fluid.tldraw.ai.systemPrompt - its
//    introduction, the rules for placing widgets on the canvas, and a hint on reaching the editor;
//  - the panel as it hosts it, with the attribution of its service shown as a banner beneath the canvas.
// Nothing here touches tldraw itself, so that it can be tested without it - the bridge applying changes to the canvas
// is in tldraw-ai.js. Nothing here reads fluid.ai as it loads, since the panel's SFC may bring it later.
// See FLUID-7022

fluid.registerNamespace("fluid.tldraw.ai");

// The "Ask me anything" panel as this demo hosts it - conversing through the assistant made once the canvas has
// mounted (see tldraw-driver.js), and showing the attribution of the service whose model is chosen as a banner at the
// bottom of the arena rather than in the panel
fluid.def("fluid.tldraw.askAnything", {
    $layers: "fluid.askAnything",
    assistant: "fluid.tldraw.ai.assistant",
    showAttribution: false,
    arenaAttribution: "$effect:fluid.tldraw.ai.showArenaAttribution({self}.attribution)"
});

/**
 * Show the attribution of the service whose model is chosen in the panel, as a banner at the bottom of the arena, or
 * hide the banner if it asks for none
 * @param {Object|null} attribution - The attribution, `{text, linkText, url}`, or null
 * @param {Document} [dokkument] - The document holding the banner, `#arena-attribution`
 */
fluid.tldraw.ai.showArenaAttribution = function (attribution, dokkument = document) {
    const banner = dokkument.getElementById("arena-attribution");
    if (banner) {
        banner.hidden = !attribution;
        banner.textContent = "";
        if (attribution) {
            banner.append(attribution.text + " ");
            const link = banner.appendChild(dokkument.createElement("a"));
            link.href = attribution.url;
            link.target = "_blank";
            link.rel = "noopener";
            link.textContent = attribution.linkText;
        }
    }
};


/**
 * @typedef {Object} ShapeBounds
 * @property {Number} x - The x coordinate of the shape in page space
 * @property {Number} y - The y coordinate of the shape in page space
 * @property {Number} w - The width of the shape
 * @property {Number} h - The height of the shape
 */

/**
 * @typedef {Object} CanvasShapeRec
 * @property {String} id - The shape's id
 * @property {String} type - The shape's tldraw type, e.g. "note" or "geo"
 * @property {Number} x - The x coordinate of the shape's top left corner in page space
 * @property {Number} y - The y coordinate of the shape's top left corner in page space
 * @property {Number} w - The shape's width
 * @property {Number} h - The shape's height
 * @property {String} [text] - The shape's plain text, if it has any
 */

/**
 * Round the coordinates of a bounds record to whole numbers, for legibility
 * @param {ShapeBounds} [bounds] - The bounds to be rounded
 * @return {Object} A record holding whichever of `x`, `y`, `w` and `h` were present, rounded
 */
fluid.tldraw.ai.roundBounds = function (bounds) {
    const togo = {};
    ["x", "y", "w", "h"].forEach(key => {
        if (typeof(bounds?.[key]) === "number") {
            togo[key] = Math.round(bounds[key]);
        }
    });
    return togo;
};


/*** The system prompt - Infusion's, with the stanzas of a canvas merged in ***/

fluid.tldraw.ai.introduction = `You are an assistant embedded in a shared canvas, built with tldraw, on which a user arranges \
widgets. Each widget is a live component of Fluid Infusion 6, a framework in which an application is made of \
named layers of declarative configuration which any party may add to or override. Besides answering the user's \
questions, you can reflect on the widgets in the workspace and alter them - adapting them, composing them and \
creating new ones - by replying with a document in Infusion's Potentia Transmission Format (PTF), which is applied \
directly to the canvas. The documentation of the framework follows, then the rules for your response and some \
strategy hints, and finally the current state of the workspace and the user's selection.`;

fluid.tldraw.ai.placingRules = `## Placing widgets on the canvas

The workspace is a tldraw canvas, on which each widget is hosted in a shape whose id is the widget's id. Any nested \
document of a \`component\` part may hold a \`shape\` part with a JSON body \`{"x": ..., "y": ..., "w": ..., "h": ...}\`, \
any of whose members may be omitted, to place or resize the widget's shape in page coordinates - e.g. \`{"x": 200, \
"y": 400}\` beneath its \`potentia\` part for "/". A fresh widget without one is placed beside the user's selection, at \
its layer's \`preferredSize\`. The workspace document ends with a \`canvas\` part listing the native tldraw shapes \
beside the widgets: these may be removed by a \`delete\` part naming their ids, but cannot otherwise be altered, and \
never send a \`canvas\` part yourself.`;

fluid.tldraw.ai.canvasHints = `* A widget may reach the tldraw editor as \`{tldrawHost}.editor\`, and the bounds of its own shape as \
\`{self}.hostBounds\`. A subcomponent built from another widget's layer takes both from the widget enclosing it - never \
write either as a reference to itself such as \`hostBounds: "{self}.hostBounds"\`.`;

// The system prompt of an assistant conversing about the canvas - Infusion's, with this demo's stanzas merged in
fluid.def("fluid.tldraw.ai.systemPrompt", {
    $layers: "fluid.ai.arena.systemPrompt",
    stanzas: {
        introduction: {text: fluid.tldraw.ai.introduction},
        placingRules: {order: 35, text: fluid.tldraw.ai.placingRules},
        canvasHints: {order: 45, text: fluid.tldraw.ai.canvasHints}
    },
    workspaceCaption: "The following PTF document holds every Infusion widget in the workspace, with the definitions of the "
        + "layers they use, where each is hosted on the canvas, and the native tldraw shapes alongside them:",
    docUrls: [
        "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-integration-language.md",
        "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-view.md",
        "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-ptf.md",
        "https://raw.githubusercontent.com/amb26/ponder/refs/heads/main/content/docs/fluid-tldraw.md"
    ]
});

/*** The canvas as the host of an arena ***/

/**
 * Give each widget of a workspace gathered from the canvas, whose widgets are known by the ids of their shapes, its id
 * in the arena - the two are the same
 * @param {Workspace} workspace - The workspace, whose widgets may bear `shapeId` alone
 * @return {Workspace} The workspace, each of whose widgets bears `id`
 */
fluid.tldraw.ai.asArena = function (workspace) {
    return {...workspace, widgets: workspace.widgets.map(widget => ({...widget, id: widget.id ?? widget.shapeId}))};
};

// The canvas as the host of an arena - see ArenaHost in fluid-ai-arena.js
fluid.tldraw.ai.host = {
    itemNoun: "shape",
    // What the host supplied to the widget's view is described by its shape part instead
    componentParts: widget => fluid.tldraw.writeShapeConfig(fluid.ptf.componentToParts(widget.component), widget.layerName, null),
    widgetParts: widget => [{
        kind: "shape",
        contentType: fluid.layerMimeTypes.json,
        filename: "shape",
        body: JSON.stringify({layerName: widget.layerName, ...fluid.tldraw.ai.roundBounds(widget.bounds)})
    }],
    workspaceParts: workspace => [{
        kind: "canvas",
        contentType: fluid.layerMimeTypes.json,
        filename: "canvas",
        body: JSON.stringify((workspace.canvasShapes || []).map(shape => ({...shape, ...fluid.tldraw.ai.roundBounds(shape)})), null, 4)
    }],
    otherIds: workspace => (workspace.canvasShapes || []).map(shape => shape.id),
    describeOther: (id, workspace) => {
        const shape = (workspace.canvasShapes || []).find(oneShape => oneShape.id === id);
        return shape && `* ${id} - a native tldraw ${shape.type} shape` + (shape.text ? ` with text ${JSON.stringify(shape.text)}` : "");
    },
    initChange: change => {
        change.shape = {};
    },
    nestedParts: {
        shape: (part, change, where, problems) => {
            Object.assign(change.shape, fluid.tldraw.ai.roundBounds(fluid.ai.arena.parseJSONPart(part, where, problems)));
        }
    },
    planWorkspacePart: (part, plan) => {
        const handled = part.kind === "canvas";
        if (handled) {
            plan.problems.push("The canvas part cannot be sent - native tldraw shapes cannot be altered");
        }
        return handled;
    },
    notWidget: name => `The component part ${name} names a native tldraw shape, which cannot hold a widget`
};

/*** The protocol as the canvas uses it - Infusion's, with the canvas as host ***/

/**
 * Encode the canvas's workspace as a PTF document - see `fluid.ai.arena.workspaceToPTF`
 * @param {Workspace} workspace - The workspace, as gathered from the canvas
 * @return {String} The text of the PTF document
 */
fluid.tldraw.ai.workspaceToPTF = workspace => fluid.ai.arena.workspaceToPTF(fluid.tldraw.ai.asArena(workspace), fluid.tldraw.ai.host);

/**
 * Describe the user's selection on the canvas - see `fluid.ai.arena.describeSelection`
 * @param {Workspace} workspace - The workspace, as gathered from the canvas
 * @return {String} A description of the selection
 */
fluid.tldraw.ai.describeSelection = workspace => fluid.ai.arena.describeSelection(fluid.tldraw.ai.asArena(workspace), fluid.tldraw.ai.host);

/**
 * Plan the changes to the canvas described by a PTF document sent by the AI - see `fluid.ai.arena.planChanges`
 * @param {PTFPart[]} parts - The decoded parts of the document
 * @param {String[]} widgetIds - The ids of the shapes hosting widgets
 * @param {String[]} shapeIds - The ids of all shapes on the canvas, including widgets
 * @return {ChangePlan} The planned changes, each of whose changes to a widget bears `shape`, read from its shape part
 */
fluid.tldraw.ai.planChanges = (parts, widgetIds, shapeIds) =>
    fluid.ai.arena.planChanges(parts, widgetIds, shapeIds.filter(id => !widgetIds.includes(id)), fluid.tldraw.ai.host);

/**
 * Read the system prompt of the canvas - its stanzas, as fluid.tldraw.ai.systemPrompt merges them - once
 * @return {Object} The prompt, as read by `fluid.ai.arena.systemPrompt.read`
 */
fluid.tldraw.ai.prompt = function () {
    if (!fluid.tldraw.ai.readPrompt) {
        const component = fluid.tldraw.ai.systemPrompt();
        fluid.tldraw.ai.readPrompt = fluid.ai.arena.systemPrompt.read(component);
        component.destroy();
    }
    return fluid.tldraw.ai.readPrompt;
};

/**
 * Assemble the system prompt describing the canvas - see `fluid.ai.arena.systemPrompt.compose`
 * @param {String[]} docs - The text of each document of the framework's documentation
 * @param {Workspace} workspace - The workspace, as gathered from the canvas
 * @return {String} The system prompt
 */
fluid.tldraw.ai.systemPrompt.compose = (docs, workspace) =>
    fluid.ai.arena.systemPrompt.compose(fluid.tldraw.ai.prompt(), docs, fluid.tldraw.ai.asArena(workspace), fluid.tldraw.ai.host);

/**
 * Make the assistant through which the panel reflects on and alters the canvas - see `fluid.ai.arena.makeAssistant`
 * @param {ArenaBridge} bridge - The bridge to the canvas, as made by `makeAIBridge` in tldraw-ai.js
 * @param {Function} [getDocs] - Returns a {Promise<String[]>} for the documentation, as for `fluid.ai.arena.makeAssistant`
 * @return {AIAssistant} The assistant
 */
fluid.tldraw.ai.makeAssistant = function (bridge, getDocs) {
    const arenaBridge = {...bridge, gatherWorkspace: () => fluid.tldraw.ai.asArena(bridge.gatherWorkspace())};
    return fluid.ai.arena.makeAssistant(arenaBridge, {promptLayer: "fluid.tldraw.ai.systemPrompt", host: fluid.tldraw.ai.host,
        ...(getDocs ? {getDocs} : {})});
};

// The assistant offered to the "Ask me anything" panel, once the canvas has mounted - see tldraw-driver.js, and the
// `assistant` option of fluid.askAnything
fluid.tldraw.ai.assistant = null;

/**
 * Carry out one exchange with the AI on the user's direction, about the canvas - `fluid.ai.converse` with the
 * assistant of `fluid.tldraw.ai.makeAssistant`
 * @param {Object} options - The exchange's options, as for `fluid.ai.converse`, with these in place of `assistant`
 * @param {ArenaBridge} options.bridge - The bridge to the canvas
 * @param {Function} [options.getDocs] - Returns the documentation, as for `fluid.ai.arena.makeAssistant`
 * @return {Promise<ChatExchange[]>} A promise for the conversation's history including this exchange
 */
fluid.tldraw.ai.converse = function ({bridge, getDocs, ...options}) {
    return fluid.ai.converse({...options, assistant: fluid.tldraw.ai.makeAssistant(bridge, getDocs)});
};
