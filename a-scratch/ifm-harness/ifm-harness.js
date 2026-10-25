/* global QUnit, harnessIO */

"use strict";

// A harness sending a direction to the IFM model as the tldraw demo's "Ask me anything" panel would, from a mocked-up
// workspace holding the closest note finder and image generator widgets, both selected, beside two sticky notes. Its
// responses are applied by a mock of the bridge in demo/tldraw/js/tldraw-ai.js, with problems reported back to the
// model for repair as by fluid.tldraw.ai.converse, and the widgets they produce are assessed. See run-harness.js and
// FLUID-7025

fluid.registerNamespace("fluid.harness");

QUnit.module("IFM widget composition harness");

QUnit.config.testTimeout = 40 * 60 * 1000;

fluid.harness.direction = "Combine the functionality of the two selected widgets so I can move it close to a sticky "
    + "note and press a button to generate an image";

// The sticky notes on the canvas, and the widgets selected by the user, in page coordinates
fluid.harness.notes = [
    {id: "shape:note-fox", x: 120, y: 420, text: "A red fox in the snow"},
    {id: "shape:note-lighthouse", x: 960, y: 140, text: "A lighthouse at dusk"}
];

fluid.harness.initialWidgets = [
    {shapeId: "shape:finder", layerName: "fluid.demos.closestNoteFinder", bounds: {x: 100, y: 100, w: 260, h: 200}},
    {shapeId: "shape:imagegen", layerName: "fluid.demos.imageGenerator", bounds: {x: 420, y: 100, w: 360, h: 460}}
];

// As for tldraw-ai.js and tldraw-clipboard.js
fluid.harness.placementGap = 40;
fluid.harness.instantiationTimeout = 5000;
fluid.harness.settleDelay = 500;

// The ideal response, as worked out in FLUID-7025, against which responses are compared
fluid.harness.idealLayer = `fluid.def("fluid.demos.ai.closestNoteImageGenerator", {
    $layers: ["fluid.demos.imageGenerator", "fluid.topLevelWidget"],
    noteFinder: {
        $component: {
            $layers: "fluid.demos.closestNoteFinder",
            view: "{closestNoteImageGenerator}.view"
        }
    },
    state: {
        prompt: "{noteFinder}.noteText"
    }
});`;

/**
 * Encode the ideal response as a PTF document, as the model would send it - used in a dry run to check the harness
 * @return {String} The text of the PTF document
 */
fluid.harness.idealResponse = function () {
    return fluid.ptf.encode([{
        kind: "layer",
        contentType: fluid.layerMimeTypes.javascript,
        filename: "fluid.demos.ai.closestNoteImageGenerator",
        body: fluid.harness.idealLayer
    }, {
        kind: "component",
        filename: "new-1",
        parts: [{
            kind: "potentia",
            contentType: fluid.layerMimeTypes.json,
            filename: "/",
            body: JSON.stringify({$layers: ["fluid.demos.ai.closestNoteImageGenerator"]})
        }]
    }]);
};

/**
 * Stands in for fluid.demos.tldrawHost in tldraw-driver.js, under the same name - holding the notes on the canvas and
 * the bounds of each widget's shape, which its linkage reports to the view of every top-level widget
 */
fluid.def("fluid.demos.tldrawHost", {
    $layers: ["fluid.resolveRoot", "fluid.component"],
    notes: [],
    shapes: {
        $reactiveRoot: {}
    },
    viewLinkage: {
        $linkage: {
            inputLayers: ["fluid.topLevelWidgetView"],
            outputLayers: ["fluid.tldrawViewComponent"]
        }
    }
});

// Stands in for fluid.tldrawViewComponent in tldraw-driver.js, under the same name, so that it is omitted from the
// workspace document as it is there - see fluid.tldraw.ai.hostLayers
fluid.def("fluid.tldrawViewComponent", {
    $layers: "fluid.topLevelWidgetView",
    shapeId: null,
    hostBounds: "$compute:fluid.harness.boundsFor({tldrawHost}.shapes, {self}.shapeId)"
});

fluid.harness.boundsFor = (shapes, shapeId) => shapes[shapeId] || null;

const qs = (sel, parent) => (parent || document).querySelector(sel);
const qsa = (sel, parent) => [...(parent || document).querySelectorAll(sel)];
const wait = delay => new Promise(resolve => setTimeout(resolve, delay));

/**
 * Wait until the injections of all SFCs imported into the document via `<fluid-import>` have completed.
 * @return {Promise} Resolves once all injections are complete.
 */
fluid.harness.loadImports = function () {
    const layerNames = qsa("fluid-import").map(node => fluid.pathToLayerName(node.getAttribute("src")));
    return Promise.all(layerNames.map(layerName => fluid.cell.waitFor(fluid.subscribeDocToInjections(layerName, document))));
};

/**
 * Determine the size at which a fresh widget's shape is created - as for fluid.tldraw.shapeSizeFor in tldraw-driver.js
 * @param {String} layerName - The name of the widget's layer
 * @return {Object} The size as `{w, h}`
 */
fluid.harness.shapeSizeFor = function (layerName) {
    const value = fluid.avatar(layerName).preferredSize;
    const preferredSize = fluid.isUnavailable(value) ? null : value;
    return {w: preferredSize?.w || 260, h: preferredSize?.h || 80};
};

/**
 * Construct the mocked-up canvas - its host, sticky notes and initial widgets
 * @return {Object} The canvas, holding `host`, `widgets` (a Map of shape id to {layerName, component, container}),
 * `selectedIds`, the shape ids of `constructed` widgets and `nextId` for allocating fresh shape ids
 */
fluid.harness.makeCanvas = function () {
    const host = fluid.demos.tldrawHost({notes: fluid.harness.notes});
    const canvas = {host, widgets: new Map(), selectedIds: [], constructed: new Set(), nextId: 1};
    host.shapes = Object.fromEntries(fluid.harness.initialWidgets.map(widget => [widget.shapeId, widget.bounds]));
    fluid.harness.initialWidgets.forEach(widget => {
        const container = fluid.harness.makeContainer(widget.shapeId);
        const creator = fluid.getGlobalValue(widget.layerName);
        const component = creator(fluid.tldraw.hostPotentiaFor(widget.layerName, container, widget.shapeId));
        canvas.widgets.set(widget.shapeId, {layerName: widget.layerName, component, container});
    });
    canvas.selectedIds = fluid.harness.initialWidgets.map(widget => widget.shapeId);
    fluid.cell.stabilize();
    return canvas;
};

/**
 * Create a container standing in for a shape's
 * @param {String} shapeId - The id of the shape
 * @return {Element} The container
 */
fluid.harness.makeContainer = function (shapeId) {
    const container = document.createElement("div");
    container.setAttribute("data-shape", shapeId);
    document.body.appendChild(container);
    return container;
};

/**
 * Read the bounds of a shape on the canvas as a plain object
 * @param {Object} canvas - The canvas
 * @param {String} shapeId - The id of the shape
 * @return {ShapeBounds} The shape's bounds
 */
fluid.harness.boundsOf = (canvas, shapeId) => ({...fluid.unwrapProxy(canvas.host.shapes)[shapeId]});

/**
 * Move or resize a shape on the canvas
 * @param {Object} canvas - The canvas
 * @param {String} shapeId - The id of the shape
 * @param {Object} bounds - Any of `{x, y, w, h}` to be changed
 */
fluid.harness.updateShape = function (canvas, shapeId, bounds) {
    const shapes = fluid.unwrapProxy(canvas.host.shapes);
    canvas.host.shapes = {...shapes, [shapeId]: {...shapes[shapeId], ...bounds}};
    fluid.cell.stabilize();
};

/**
 * Gather the workspace as tldraw-ai.js's gatherWorkspace does
 * @param {Object} canvas - The canvas
 * @return {Workspace} The workspace
 */
fluid.harness.gatherWorkspace = function (canvas) {
    const widgets = [...canvas.widgets].map(([shapeId, rec]) => ({
        shapeId,
        layerName: rec.layerName,
        bounds: fluid.harness.boundsOf(canvas, shapeId),
        component: rec.component
    }));
    const canvasShapes = fluid.harness.notes.map(note => ({id: note.id, type: "note", x: note.x, y: note.y, w: 200, h: 200, text: note.text}));
    return {
        widgets,
        canvasShapes,
        selectedIds: canvas.selectedIds,
        availableLayers: fluid.tldraw.listWidgetLayers()
    };
};

/**
 * Choose a site for a fresh widget beside the user's selection, as tldraw-ai.js's chooseSite does, without avoiding
 * other widgets
 * @param {Object} canvas - The canvas
 * @param {Object} [previous] - The site of the widget created just before this one by the same response, if any
 * @return {Object} The site as `{x, y}`
 */
fluid.harness.chooseSite = function (canvas, previous) {
    let site;
    if (previous) {
        site = {x: previous.x, y: previous.y + previous.h + fluid.harness.placementGap};
    } else {
        const selected = canvas.selectedIds.map(id => fluid.harness.boundsOf(canvas, id)).filter(bounds => bounds.w !== undefined);
        const right = Math.max(...selected.map(bounds => bounds.x + bounds.w));
        const top = Math.min(...selected.map(bounds => bounds.y));
        site = {x: right + fluid.harness.placementGap, y: top};
    }
    return site;
};

/**
 * Diagnose every widget on the canvas, other than those listed
 * @param {Object} canvas - The canvas
 * @param {Set<String>} [exclude] - The shape ids of any widgets which are not to be diagnosed
 * @return {String[]} Descriptions of any problems found
 */
fluid.harness.diagnoseAll = function (canvas, exclude = new Set()) {
    const problems = [];
    canvas.widgets.forEach((rec, shapeId) => {
        if (!exclude.has(shapeId)) {
            fluid.tldraw.ai.diagnose(rec.component).forEach(problem => problems.push(`The widget ${shapeId}: ${problem}`));
        }
    });
    return problems;
};

/**
 * Construct a widget from the parts of a component part of a response, hosted in a shape, as InfusionHost in
 * tldraw-driver.js does, and describe any problems with it as tldraw-ai.js's checkInstantiation does. A fresh widget
 * which could not be constructed or did not become available is removed.
 * @param {Object} canvas - The canvas
 * @param {ShapeChange} change - The change from which the widget is constructed
 * @param {String} shapeId - The id of the shape hosting it
 * @return {Promise<String[]>} A promise for descriptions of any problems found
 */
fluid.harness.construct = async function (canvas, change, shapeId) {
    const what = `The widget ${JSON.stringify(change.key)}` + (shapeId === change.key ? "" : ` (now shape ${shapeId})`);
    const container = fluid.harness.makeContainer(shapeId);
    let problems;
    let that = null;
    try {
        fluid.ptf.registerLayerParts(change.parts, true);
        that = fluid.ptf.constructParts(change.parts, {potentia: fluid.tldraw.hostPotentiaFor(change.layerName, container, shapeId)});
        canvas.widgets.set(shapeId, {layerName: change.layerName, component: that, container});
        canvas.constructed.add(shapeId);
        const unresolved = await Promise.race([fluid.ptf.applyParts(that, change.parts), wait(fluid.harness.instantiationTimeout).then(() => null)]);
        fluid.cell.stabilize();
        if (unresolved === null) {
            const diagnosis = fluid.tldraw.ai.diagnose(that, true);
            problems = [`${what} did not become available: ` + (diagnosis.length > 0 ? diagnosis.join("; ") : "no cause could be found")];
        } else {
            problems = unresolved.map(filename => `${what} has no subcomponent at path ${filename} to which its parts could be applied`);
        }
    } catch (error) {
        problems = [`${what} could not be constructed: ${fluid.tldraw.ai.describeError(error)}`];
    }
    if (shapeId !== change.key && problems.length > 0 && (that === null || fluid.isUnavailable(that))) {
        fluid.harness.removeWidget(canvas, shapeId);
        problems = problems.map(problem => problem + " - its shape has been removed");
    }
    return problems;
};

/**
 * Remove a widget from the canvas, together with its shape unless it is to be retained for a replacement widget
 * @param {Object} canvas - The canvas
 * @param {String} shapeId - The id of the shape
 * @param {Boolean} [keepShape] - If `true`, the shape is retained
 */
fluid.harness.removeWidget = function (canvas, shapeId, keepShape) {
    const rec = canvas.widgets.get(shapeId);
    if (rec) {
        // A widget which is still unavailable, e.g. awaiting the injection of its layer's SFC, is destroyed through its shadow
        const shadow = fluid.ptf.componentToShadow(rec.component);
        if (!fluid.isDestroyedShadow(shadow)) {
            shadow.computer.dispose();
        }
        rec.container.remove();
        canvas.widgets.delete(shapeId);
    }
    if (!keepShape) {
        const shapes = {...fluid.unwrapProxy(canvas.host.shapes)};
        delete shapes[shapeId];
        canvas.host.shapes = shapes;
    }
    fluid.cell.stabilize();
};

/**
 * Construct a mock of the bridge constructed by makeAIBridge in tldraw-ai.js, applying changes to the canvas
 * @param {Object} canvas - The canvas
 * @param {Object} record - Accumulates a record of every layer part applied as `layers`, a Map of layer name to text
 * @return {AIBridge} The bridge
 */
fluid.harness.makeBridge = function (canvas, record) {
    const applyPlan = async function (plan) {
        const summary = [];
        const problems = [];
        const constructedIds = new Set();
        const existingProblems = new Set(fluid.harness.diagnoseAll(canvas));
        plan.layers.forEach(part => {
            record.layers.set(part.filename, part.body);
            try {
                fluid.ptf.registerLayerPart(part);
                summary.push(`Defined layer ${part.filename}`);
            } catch (error) {
                problems.push(`The layer ${part.filename} could not be registered: ${fluid.tldraw.ai.describeError(error)}`);
            }
        });
        plan.deletions.forEach(id => {
            record.deletions.push(id);
            fluid.harness.removeWidget(canvas, id);
            summary.push(`Deleted shape ${id}`);
        });
        for (const change of plan.updates) {
            change.parts.filter(part => part.kind === "layer").forEach(part => record.layers.set(part.filename, part.body));
            if (Object.keys(change.shape).length > 0) {
                fluid.harness.updateShape(canvas, change.key, change.shape);
            }
            const rec = canvas.widgets.get(change.key);
            if (change.rebuild) {
                record.replaced.push(change.key);
                fluid.harness.removeWidget(canvas, change.key, true);
                problems.push(...await fluid.harness.construct(canvas, change, change.key));
                constructedIds.add(change.key);
                summary.push(`Replaced widget ${change.key} with one constructed from layer ${change.layerName}`);
            } else {
                try {
                    fluid.ptf.registerLayerParts(change.parts, true);
                    const unresolved = await Promise.race([fluid.ptf.applyParts(rec.component, change.parts),
                        wait(fluid.harness.instantiationTimeout).then(() => null)]);
                    if (unresolved === null) {
                        problems.push(`The widget ${change.key} did not become available to apply your parts to: `
                            + fluid.tldraw.ai.diagnose(rec.component, true).join("; "));
                    } else {
                        unresolved.forEach(filename => problems.push(`The widget ${change.key} has no subcomponent at path ${filename} to which your parts could be applied`));
                    }
                } catch (error) {
                    problems.push(`Your parts could not be applied to the widget ${change.key}: ${fluid.tldraw.ai.describeError(error)}`);
                }
                summary.push(`Updated widget ${change.key}`);
            }
        }
        let previous = null;
        const createdIds = [];
        for (const change of plan.creations) {
            change.parts.filter(part => part.kind === "layer").forEach(part => record.layers.set(part.filename, part.body));
            fluid.ptf.registerLayerParts(change.parts, true);
            const preferred = fluid.harness.shapeSizeFor(change.layerName);
            const size = {w: change.shape.w || preferred.w, h: change.shape.h || preferred.h};
            const chosen = typeof(change.shape.x) === "number" && typeof(change.shape.y) === "number" ? null : fluid.harness.chooseSite(canvas, previous);
            const site = {x: change.shape.x ?? chosen.x, y: change.shape.y ?? chosen.y};
            const id = "shape:created-" + canvas.nextId++;
            fluid.harness.updateShape(canvas, id, {...site, ...size});
            createdIds.push(id);
            constructedIds.add(id);
            previous = {...site, ...size};
            problems.push(...await fluid.harness.construct(canvas, change, id));
            summary.push(`Created widget ${JSON.stringify(change.key)} as shape ${id} from layer ${change.layerName}`);
        }
        if (createdIds.length > 0) {
            canvas.selectedIds = createdIds;
        }
        await wait(fluid.harness.settleDelay);
        fluid.cell.stabilize();
        fluid.harness.diagnoseAll(canvas, constructedIds).filter(problem => !existingProblems.has(problem)).forEach(problem => problems.push(problem));
        // As for tldraw-ai.js, a fresh widget may become available whilst some of its members have failed
        constructedIds.forEach(shapeId => {
            const rec = canvas.widgets.get(shapeId);
            if (rec && !fluid.isUnavailable(rec.component)) {
                fluid.tldraw.ai.diagnose(rec.component).forEach(problem => problems.push(`The widget ${shapeId}: ${problem}`));
            }
        });
        return {summary, problems: [...new Set(problems)]};
    };
    return {
        gatherWorkspace: () => fluid.harness.gatherWorkspace(canvas),
        applyPlan
    };
};

/**
 * Replace the Pixabay API by a fake recording the searches made, which returns a single image for each
 * @return {String[]} The text searched for by each request made, to which the fake will append
 */
fluid.harness.fakePixabay = function () {
    const queries = [];
    fluid.demos.pixabay.cache.clear();
    fluid.demos.pixabay.fetch = url => {
        const params = Object.fromEntries(new URL(url).searchParams);
        queries.push(params.q);
        const hit = {id: queries.length, webformatURL: `https://pixabay.com/get/${queries.length}.jpg`, webformatWidth: 640,
            webformatHeight: 427, tags: params.q, pageURL: "https://pixabay.com/photos/1/", user: "Some User", user_id: 42};
        return Promise.resolve({ok: true, json: () => Promise.resolve({totalHits: 1, hits: [hit]})});
    };
    return queries;
};

/**
 * Try out a widget as the user described - move it close to each sticky note in turn, and press the button which
 * seems most likely to generate an image
 * @param {Object} canvas - The canvas
 * @param {String} shapeId - The id of the widget's shape
 * @param {String[]} queries - The searches recorded by the fake Pixabay API
 * @return {Promise<Object[]>} A promise for a record of each trial
 */
fluid.harness.tryOut = async function (canvas, shapeId, queries) {
    const trials = [];
    for (const note of fluid.harness.notes) {
        fluid.harness.updateShape(canvas, shapeId, {x: note.x + 20, y: note.y + 230});
        await wait(50);
        fluid.cell.stabilize();
        const container = canvas.widgets.get(shapeId).container;
        const buttons = qsa("button", container);
        const button = buttons.find(oneButton => /find|generat|image|search|create/i.test(oneButton.textContent)) || buttons[0];
        const before = queries.length;
        const trial = {
            note: note.text,
            inputs: qsa("input, textarea", container).map(input => input.value),
            buttons: buttons.map(oneButton => oneButton.textContent.trim()),
            pressed: button ? button.textContent.trim() : null,
            disabled: button ? button.hasAttribute("disabled") : null
        };
        if (button) {
            button.dispatchEvent(new MouseEvent("click"));
            await wait(300);
            fluid.cell.stabilize();
            await wait(100);
            fluid.cell.stabilize();
        }
        trial.queries = queries.slice(before);
        trial.imageShown = !!qs("img", container);
        trial.succeeded = trial.queries.includes(note.text) && trial.imageShown;
        trials.push(trial);
    }
    return trials;
};

/**
 * Compare the layers sent by the model with the ideal response
 * @param {String} layerName - The name of the layer from which the widget was constructed
 * @param {Object} record - The record of what the model sent, as accumulated by the bridge
 * @return {Object} A map of criterion to whether it is met
 */
fluid.harness.assessFit = function (layerName, record) {
    const sent = [...record.layers.values()].join("\n");
    const source = record.layers.get(layerName) || "";
    const existingRedefined = [...record.layers.keys()].filter(name => record.existingLayers.has(name));
    return {
        extendsImageGenerator: fluid.tldraw.layerReaches(layerName, "fluid.demos.imageGenerator"),
        reusesNoteFinderLayer: sent.includes("fluid.demos.closestNoteFinder"),
        crossInjectsView: /view:\s*["']\{[\w.$]+\}\.view["']/.test(source),
        wiresByReference: /["']\{[\w.$]+\}\.(noteText|closest\.text)["']/.test(source),
        noTemplateOfItsOwn: !/<template>/.test(source),
        noCopiedLogic: !/Math\.hypot|Math\.sqrt|pixabay|fetch\(|\.reduce\(/.test(sent),
        noEffectOrMethod: !/\$effect|\$method/.test(source),
        noExistingLayerRedefined: existingRedefined.length === 0,
        originalsKept: record.deletions.length === 0 && record.replaced.length === 0
    };
};

// Failures in reaching the endpoint which are worth retrying - intermittent DNS lookups, and the proxy's rate limit
fluid.harness.transientError = /EAI_AGAIN|ENOTFOUND|ECONNRESET|ETIMEDOUT|429/;
fluid.harness.maxAttempts = 5;

/**
 * Call the AI endpoint as fluid.tldraw.ai.callEndpoint does, retrying with increasing delays on transient failures
 * @param {Object} options - The options to fluid.tldraw.ai.callEndpoint
 * @return {Promise<AIReply>} A promise for the AI's reply
 */
fluid.harness.callWithRetries = async function (options) {
    let reply = null;
    for (let attempt = 1; reply === null; ++attempt) {
        try {
            reply = await fluid.tldraw.ai.callEndpoint(options);
        } catch (error) {
            if (attempt < fluid.harness.maxAttempts && fluid.harness.transientError.test(error.message)) {
                console.log(`Retrying after transient failure on attempt ${attempt}: ${error.message}`);
                await wait(5000 * attempt);
            } else {
                throw error;
            }
        }
    }
    return reply;
};

QUnit.test("Compose the selected widgets via the IFM - FLUID-7025", async function (assert) {
    const io = harnessIO;
    if (io.variant === "nohint") {
        // Withdraw the hint describing the geometry of a dominant widget composed with a supplier, to judge its effect
        fluid.tldraw.ai.strategyHints = fluid.tldraw.ai.strategyHints.replace(/\n\* Often one widget[\s\S]*?(?=\n\* A widget may reach)/, "");
    }
    if (io.order === "old") {
        // Restore the earlier order of the system prompt, in which the workspace and selection preceded the response
        // rules and strategy hints, as a control for the effect of placing all the invariant material first
        fluid.tldraw.ai.systemPrompt = function (docs, workspace) {
            const usedLayers = new Set(workspace.widgets.map(widget => widget.layerName));
            const libraryLayers = workspace.availableLayers.filter(layerName => !usedLayers.has(layerName));
            const library = libraryLayers.length === 0 ? "" :
                "\n\nThe following further widget layers are available to be instantiated, but are not currently in the workspace:\n\n"
                    + fluid.tldraw.ai.layersToPTF(libraryLayers);
            return [
                fluid.tldraw.ai.introduction.replace(/ The documentation of the framework follows[\s\S]*$/,
                    " The documentation of the framework follows, and after it the current state of the workspace."),
                "# Documentation\n\n" + docs.join("\n\n"),
                fluid.tldraw.ai.workspaceHeading + "\n\nThe following PTF document holds every Infusion widget in the workspace, with the definitions of "
                    + "the layers they use, where each is hosted on the canvas, and the native tldraw shapes alongside them:\n\n"
                    + fluid.tldraw.ai.workspaceToPTF(workspace) + library,
                "# The user's selection\n\n" + fluid.tldraw.ai.describeSelection(workspace),
                fluid.tldraw.ai.responseRules.replace("the workspace document at the end of this prompt", "the workspace document above"),
                fluid.tldraw.ai.strategyHints
            ].join("\n\n");
        };
    }
    io.writeFile("variant.txt", (io.variant || "standard") + ", " + (io.order || "new") + " order");
    await fluid.harness.loadImports();
    const canvas = fluid.harness.makeCanvas();
    const record = {layers: new Map(), deletions: [], replaced: [], exchanges: [], existingLayers: new Set(Object.keys(fluid.layerStore.get()))};
    const bridge = fluid.harness.makeBridge(canvas, record);
    const entries = [];
    const token = io.dryRun ? null : await fluid.tldraw.ai.deriveToken(io.readPassword());
    const model = fluid.tldraw.ai.defaultModel;
    let failure = null;
    try {
        await fluid.tldraw.ai.converse({
            direction: fluid.harness.direction,
            history: [],
            model,
            bridge,
            report: entry => entries.push(entry),
            call: async messages => {
                const index = record.exchanges.length + 1;
                if (index === 1) {
                    io.writeFile("request-payload.json", JSON.stringify({model, messages, stream: false}, null, 2));
                }
                io.writeFile(`system-prompt-${index}.txt`, messages[0].content);
                io.writeFile(`messages-${index}.json`, JSON.stringify(messages.slice(1), null, 2));
                const start = Date.now();
                const reply = io.dryRun ? {content: io.replay || fluid.harness.idealResponse()} : await fluid.harness.callWithRetries({token, model, messages});
                const seconds = (Date.now() - start) / 1000;
                io.writeFile(`response-${index}.txt`, reply.content);
                if (reply.reasoning) {
                    io.writeFile(`reasoning-${index}.txt`, reply.reasoning);
                }
                record.exchanges.push({index, seconds, usage: reply.usage || null, truncated: !!reply.truncated});
                return reply;
            }
        });
    } catch (error) {
        failure = fluid.tldraw.ai.describeError(error);
    }
    io.writeFile("transcript.json", JSON.stringify(entries, null, 2));

    const queries = fluid.harness.fakePixabay();
    const widgets = [];
    for (const shapeId of [...canvas.constructed].filter(id => canvas.widgets.has(id))) {
        const rec = canvas.widgets.get(shapeId);
        const available = !fluid.isUnavailable(rec.component);
        const widget = {
            shapeId,
            layerName: rec.layerName,
            available,
            problems: fluid.tldraw.ai.diagnose(rec.component, true),
            fit: fluid.harness.assessFit(rec.layerName, record)
        };
        if (available) {
            widget.trials = await fluid.harness.tryOut(canvas, shapeId, queries);
            widget.markup = rec.container.innerHTML.substring(0, 4000);
        }
        widgets.push(widget);
    }
    const working = widgets.filter(widget => widget.trials && widget.trials.every(trial => trial.succeeded));
    const best = working[0] || widgets[0];
    const fitScore = best ? Object.values(best.fit).filter(met => met).length + "/" + Object.keys(best.fit).length : "0";
    const finalProblems = fluid.peek(entries)?.kind === "error" ? fluid.peek(entries).text : null;
    const verdict = failure ? "call failed: " + failure :
        (working.length > 0 ? "WORKS" : widgets.length > 0 ? "DOES NOT WORK" : "NO WIDGET CONSTRUCTED")
        + ` - fit ${fitScore}, ${record.exchanges.length} exchange(s)` + (finalProblems ? ", ended with unrepaired problems" : "");
    io.writeFile("assessment.json", JSON.stringify({
        verdict,
        failure,
        exchanges: record.exchanges,
        layersSent: Object.fromEntries(record.layers),
        deletions: record.deletions,
        replaced: record.replaced,
        redefinedExisting: [...record.layers.keys()].filter(name => record.existingLayers.has(name)),
        widgets,
        idealLayer: fluid.harness.idealLayer
    }, null, 2));
    assert.ok(true, verdict);
});
