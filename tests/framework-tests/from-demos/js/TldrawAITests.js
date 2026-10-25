/* global QUnit */

"use strict";

fluid.registerNamespace("fluid.tests.tldrawAI");

QUnit.module("tldraw \"Ask me anything\" Demo Tests");

QUnit.config.reorder = false;

const qs = (sel, parent) => (parent || document).querySelector(sel);
const qsa = (sel, parent) => [...(parent || document).querySelectorAll(sel)];

/**
 * Wait until the injections of all SFCs imported into the document via `<fluid-import>` have completed.
 * @return {Promise} Resolves once all injections are complete.
 */
fluid.tests.tldrawAI.loadImports = function () {
    if (!fluid.tests.tldrawAI.loadPromise) {
        const layerNames = [...document.querySelectorAll("fluid-import")]
            .map(node => fluid.pathToLayerName(node.getAttribute("src")));
        const injDones = layerNames.map(layerName => fluid.subscribeDocToInjections(layerName, document));
        fluid.tests.tldrawAI.loadPromise = Promise.all(injDones.map(injDone => fluid.cell.waitFor(injDone)));
    }
    return fluid.tests.tldrawAI.loadPromise;
};

/**
 * Construct a counter widget as hosted in a shape, with its count advanced
 * @param {Element} container - The container into which the counter renders
 * @param {String} shapeId - The id of the shape notionally hosting the counter
 * @param {Number} clicks - The number of times the counter is incremented
 * @return {fluid.component} The counter
 */
fluid.tests.tldrawAI.makeCounter = function (container, shapeId, clicks) {
    const that = fluid.demos.counter(fluid.tldraw.hostPotentiaFor("fluid.demos.counter", container, shapeId));
    fluid.cell.stabilize();
    for (let i = 0; i < clicks; ++i) {
        that.increment();
    }
    fluid.cell.stabilize();
    return that;
};

/**
 * Construct a workspace as gathered by the AI bridge from the supplied widgets
 * @param {WidgetRec[]} widgets - The widgets in the workspace
 * @param {String[]} [selectedIds] - The ids of the selected shapes
 * @return {Workspace} The workspace
 */
fluid.tests.tldrawAI.makeWorkspace = function (widgets, selectedIds = []) {
    return {
        widgets,
        canvasShapes: [{id: "shape:note1", type: "note", x: 10.4, y: 20.6, w: 200, h: 200, text: "Buy milk"}],
        selectedIds,
        availableLayers: ["fluid.demos.counter", "fluid.demos.helloWorld"]
    };
};

QUnit.test("Workspace encoded as PTF document", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const first = fluid.tests.tldrawAI.makeCounter(qs(".container"), "shape:a", 2);
    const second = fluid.tests.tldrawAI.makeCounter(qs(".container2"), "shape:b", 5);
    const workspace = fluid.tests.tldrawAI.makeWorkspace([
        {shapeId: "shape:a", layerName: "fluid.demos.counter", bounds: {x: 100.2, y: 50, w: 260, h: 80}, component: first},
        {shapeId: "shape:b", layerName: "fluid.demos.counter", bounds: {x: 400, y: 50, w: 260, h: 80}, component: second}
    ], ["shape:b", "shape:note1"]);
    const text = fluid.tldraw.ai.workspaceToPTF(workspace);
    const parts = fluid.ptf.decode(text);
    assert.deepEqual(parts.map(part => [part.kind, part.filename]), [
        ["layer", "fluid.demos.counter"],
        ["component", "shape:a"],
        ["component", "shape:b"],
        ["canvas", "canvas"]
    ], "Shared layer held once, followed by a component part for each widget and the canvas");
    assert.equal(parts[0].contentType, "text/x-vue", "Layer transmitted as its SFC");
    const nested = parts[2].parts;
    assert.deepEqual(nested.map(part => [part.kind, part.filename]), [["shape", "shape"], ["potentia", "/"], ["live", "/"]],
        "Component part holds shape, potentia and live parts");
    assert.deepEqual(JSON.parse(nested[0].body), {layerName: "fluid.demos.counter", x: 400, y: 50, w: 260, h: 80}, "Shape part records hosting");
    assert.deepEqual(JSON.parse(nested[2].body), {state: {count: 5}}, "Live part records widget's state");
    assert.deepEqual(JSON.parse(parts[3].body), [{id: "shape:note1", type: "note", x: 10, y: 21, w: 200, h: 200, text: "Buy milk"}],
        "Canvas part lists native shapes with rounded bounds");

    const selection = fluid.tldraw.ai.describeSelection(workspace);
    assert.ok(selection.includes("shape:b - an Infusion widget constructed from layer fluid.demos.counter"), "Selected widget described");
    assert.ok(selection.includes("shape:note1 - a native tldraw note shape with text \"Buy milk\""), "Selected note described");
    assert.equal(fluid.tldraw.ai.describeSelection(fluid.tests.tldrawAI.makeWorkspace([])), "The user has no shapes selected.",
        "Empty selection described");

    const prompt = fluid.tldraw.ai.systemPrompt(["DOC ONE", "DOC TWO"], workspace);
    // All the invariant material precedes the workspace and selection, so that it may be cached as a common prefix
    const order = ["You are an assistant", "DOC ONE", "DOC TWO", "## How to respond", "## Strategy hints", fluid.tldraw.ai.workspaceHeading,
        "filename=\"shape:a\"", "filename=\"fluid.demos.helloWorld\"", "shape:b - an Infusion widget"].map(fragment => prompt.indexOf(fragment));
    assert.notOk(order.includes(-1), "System prompt holds all its sections");
    assert.deepEqual([...order].sort((a, b) => a - b), order, "System prompt sections in order");
    assert.ok(prompt.includes("filename=\"fluid.demos.helloWorld\""), "Library layer not in workspace is included");

    const messages = fluid.tldraw.ai.buildMessages(prompt, [[{role: "user", content: "Earlier"}, {role: "assistant", content: "Reply"}]], "Do it");
    assert.deepEqual(messages.map(message => message.role), ["system", "user", "assistant", "user"], "Messages assembled with history");
    assert.ok(messages[3].content.endsWith("\n\nDo it"), "Direction is the final message, following its announcement");

    // A live part setting a single path within a widget's state, as the AI is advised to send, applies in place
    const unresolved = await fluid.ptf.applyParts(first, [fluid.tests.tldrawAI.jsonPart("live", "/", {"state.count": 9})]);
    assert.deepEqual(unresolved, [], "Live part applied");
    assert.equal(first.count, 9, "Path within widget's state written");
    assert.equal(qs(".counter span", qs(".container")).textContent, "Clicked 9 times", "Widget rerendered");
    first.destroy();
    second.destroy();
});

QUnit.test("Responses interpreted", function (assert) {
    assert.deepEqual(fluid.tldraw.ai.parseResponse("<think>Hmm, ptf?</think>\n\nHello there"), {type: "text", text: "Hello there"},
        "Text response with reasoning removed");
    assert.equal(fluid.tldraw.ai.parseResponse("reasoning without opening tag</think>Answer").text, "Answer",
        "Reasoning without opening tag removed");
    const ptf = fluid.ptf.encode([{kind: "delete", contentType: "text/plain", filename: "shape:a", body: ""}]);
    const fenced = "Here is the change:\n```\n" + ptf + "```\nHope this helps!";
    const parsed = fluid.tldraw.ai.parseResponse(fenced);
    assert.equal(parsed.type, "ptf", "PTF document found despite surrounding commentary and fences");
    assert.deepEqual(parsed.parts.map(part => [part.kind, part.filename]), [["delete", "shape:a"]], "Document decoded");
    const invalid = fluid.tldraw.ai.parseResponse("MIME-Version: 1.0\nContent-Type: text/plain\n\nNot multipart");
    assert.equal(invalid.type, "invalid", "MIME document which is not PTF is invalid");
    const empty = fluid.tldraw.ai.parseResponse("MIME-Version: 1.0\nContent-Type: multipart/mixed; boundary=\"b\"\n\n--wrong\n");
    assert.equal(empty.type, "invalid", "PTF document without parts is invalid");
});

/**
 * Encode a JSON part
 * @param {String} kind - The part's kind
 * @param {String} filename - The part's filename
 * @param {any} value - The value to be encoded as the part's body
 * @return {PTFPart} The part
 */
fluid.tests.tldrawAI.jsonPart = (kind, filename, value) => ({kind, contentType: "application/json", filename, body: JSON.stringify(value)});

QUnit.test("Changes planned from PTF document", function (assert) {
    const jsonPart = fluid.tests.tldrawAI.jsonPart;
    const text = fluid.ptf.encode([
        {kind: "layer", contentType: "text/javascript", filename: "fluid.demos.ai.good", body: "fluid.def(\"fluid.demos.ai.good\", {$layers: \"fluid.topLevelWidget\"});"},
        {kind: "layer", contentType: "text/javascript", filename: "fluid.demos.ai.bad", body: "fluid.def(\"fluid.demos.ai.bad\", {"},
        {kind: "component", filename: "shape:a", parts: [jsonPart("live", "/", {"state.count": 5}), jsonPart("shape", "shape", {x: 10.2, w: 300})]},
        {kind: "component", filename: "shape:b", parts: [jsonPart("potentia", "/", {$layers: ["fluid.demos.ai.good"]})]},
        {kind: "component", filename: "new-1", parts: [jsonPart("potentia", "/", {$layers: "fluid.demos.helloWorld"})]},
        {kind: "component", filename: "new-2", parts: [jsonPart("live", "/", {count: 1})]},
        {kind: "component", filename: "shape:note1", parts: [jsonPart("potentia", "/", {$layers: ["fluid.demos.helloWorld"]})]},
        {kind: "component", filename: "new-3", parts: [{kind: "live", contentType: "application/json", filename: "/", body: "{oops"}]},
        {kind: "component", filename: "new-4", contentType: "application/json", body: "{}"},
        {kind: "delete", contentType: "text/plain", filename: "shape:note1", body: ""},
        {kind: "delete", contentType: "text/plain", filename: "shape:gone", body: ""},
        {kind: "mystery", contentType: "text/plain", filename: "x", body: ""}
    ]);
    const plan = fluid.tldraw.ai.planChanges(fluid.ptf.decode(text), ["shape:a", "shape:b"], ["shape:a", "shape:b", "shape:note1"]);
    assert.deepEqual(plan.layers.map(part => part.filename), ["fluid.demos.ai.good"], "Valid layer planned");
    assert.deepEqual(plan.updates.map(change => [change.key, change.rebuild, change.layerName, change.shape]), [
        ["shape:a", false, undefined, {x: 10, w: 300}],
        ["shape:b", true, "fluid.demos.ai.good", {}]
    ], "Existing widgets updated in place or rebuilt");
    assert.deepEqual(plan.updates[0].parts.map(part => part.kind), ["live"], "Shape part separated from parts to be applied");
    assert.deepEqual(plan.creations.map(change => [change.key, change.layerName]), [["new-1", "fluid.demos.helloWorld"]], "Fresh widget planned");
    assert.deepEqual(plan.deletions, ["shape:note1"], "Deletion of existing shape planned");
    const expectedProblems = [
        "fluid.demos.ai.bad\" at the top level has a syntax error",
        "\"new-2\" does not name an existing widget",
        "\"shape:note1\" names a native tldraw shape",
        "within the component part \"new-3\" is not valid JSON",
        "\"new-3\" does not name an existing widget",
        "\"new-4\" is not a nested multipart/mixed document",
        "\"shape:gone\" does not name a shape",
        "unrecognised kind \"mystery\""
    ];
    assert.equal(plan.problems.length, expectedProblems.length, "One problem reported for each rejected part");
    expectedProblems.forEach((fragment, i) => assert.ok(plan.problems[i].includes(fragment), "Problem reported: " + fragment));
});

QUnit.test("Provenance recorded in layers sent by the AI", async function (assert) {
    const jsonPart = fluid.tests.tldrawAI.jsonPart;
    const sfc = (layerName, extra = "") => `<script>\nfluid.def("${layerName}", {$layers: "fluid.topLevelWidget"});\n</script>\n`
        + `<template><div>${layerName}</div></template>\n${extra}`;
    const forged = "<provenance>\n    <model>forged</model>\n</provenance>\n";
    const existingProvenance = {model: "earlier-model", prompt: "Make the old widget", datestamp: "2026-01-01T00:00:00.000Z"};
    // A layer already defined with provenance, which is retained
    fluid.ptf.registerLayerPart({kind: "layer", contentType: "text/x-vue", filename: "fluid.tests.tldrawAI.old",
        body: fluid.writeSFCProvenance(sfc("fluid.tests.tldrawAI.old"), existingProvenance)});
    await fluid.cell.waitFor(fluid.readSFC("fluid.tests.tldrawAI.old").docInjectEffects.get(document).injDone);
    await fluid.cell.settle();
    const parts = [
        {kind: "layer", contentType: "text/x-vue", filename: "fluid.tests.tldrawAI.fresh", body: sfc("fluid.tests.tldrawAI.fresh", forged)},
        {kind: "layer", contentType: "text/x-vue", filename: "fluid.tests.tldrawAI.old", body: sfc("fluid.tests.tldrawAI.old", forged)},
        {kind: "layer", contentType: "text/x-vue", filename: "fluid.tests.tldrawAI.handWritten", body: sfc("fluid.tests.tldrawAI.handWritten")},
        {kind: "layer", contentType: "text/javascript", filename: "fluid.tests.tldrawAI.js", body: "fluid.def(\"fluid.tests.tldrawAI.js\", {});"},
        {kind: "component", filename: "new-1", parts: [
            {kind: "layer", contentType: "text/x-vue", filename: "fluid.tests.tldrawAI.nested", body: sfc("fluid.tests.tldrawAI.nested")},
            jsonPart("potentia", "/", {$layers: ["fluid.tests.tldrawAI.nested"]})
        ]}
    ];
    const plan = fluid.tldraw.ai.planChanges(parts, [], []);
    assert.deepEqual(plan.problems, [], "Document planned without problems");
    const provenance = {model: "test-model", prompt: "Make <widgets>", datestamp: "2026-10-23T12:00:00.000Z"};
    const defined = new Set(["fluid.tests.tldrawAI.old", "fluid.tests.tldrawAI.handWritten"]);
    fluid.tldraw.ai.stampProvenance(plan, provenance, layerName => defined.has(layerName));
    const [fresh, old, handWritten, js] = plan.layers;
    assert.deepEqual(fluid.readSFCProvenance(fresh.body), provenance, "Fresh layer stamped, replacing the AI's own block");
    assert.equal(fresh.body.match(/<provenance>/g).length, 1, "Single provenance block in fresh layer");
    assert.ok(fresh.body.includes("<prompt>Make &lt;widgets&gt;</prompt>"), "Prompt escaped within the block");
    assert.deepEqual(fluid.readSFCProvenance(old.body), existingProvenance, "Defined layer keeps the provenance of its current SFC");
    assert.equal(handWritten, parts[2], "Defined layer without provenance unchanged");
    assert.deepEqual(fluid.readJSProvenance(js.body), provenance, "Fresh JavaScript layer stamped");
    assert.ok(js.body.startsWith(parts[3].body) && js.body.endsWith("// </provenance>\n"), "Provenance held in comments at the end of JavaScript layer");
    assert.deepEqual(fluid.readSFCProvenance(plan.creations[0].parts[0].body), provenance, "Layer nested within component part stamped");

    // An exchange stamps the layers of the plan it applies with the model and the user's direction
    const workspace = fluid.tests.tldrawAI.makeWorkspace([]);
    const bridge = fluid.tests.tldrawAI.makeFakeBridge(workspace, []);
    await fluid.tldraw.ai.converse({
        direction: "Make a fresh widget",
        history: [],
        model: "conversing-model",
        bridge,
        call: () => Promise.resolve(fluid.ptf.encode([parts[0]])),
        report: () => {},
        getDocs: () => Promise.resolve([])
    });
    const stamped = fluid.readSFCProvenance(bridge.plans[0].layers[0].body);
    assert.equal(stamped.model, "conversing-model", "Model recorded");
    assert.equal(stamped.prompt, "Make a fresh widget", "User's direction recorded as prompt");
    assert.equal(new Date(stamped.datestamp).toISOString(), stamped.datestamp, "ISO datestamp recorded");
});

// Widgets synthesized by the AI must name fluid.topLevelWidget, which is checked by a search of the layers it sends
QUnit.test("Synthesized widgets must name fluid.topLevelWidget", async function (assert) {
    const jsonPart = fluid.tests.tldrawAI.jsonPart;
    const layerPart = (layerName, layers) => ({kind: "layer", contentType: "text/javascript", filename: layerName,
        body: `fluid.def(${JSON.stringify(layerName)}, {$layers: ${JSON.stringify(layers)}, extra: 1});`});
    const plan = parts => fluid.tldraw.ai.planChanges(fluid.ptf.decode(fluid.ptf.encode(parts)), ["shape:a"], ["shape:a", "shape:note1"]);
    const create = (key, layerName, extra = []) => ({kind: "component", filename: key, parts: [jsonPart("potentia", "/", {$layers: [layerName]}), ...extra]});
    const deletion = {kind: "delete", contentType: "text/plain", filename: "shape:note1", body: ""};

    const missing = plan([layerPart("fluid.demos.ai.adapted", "fluid.demos.counter"), create("new-1", "fluid.demos.ai.adapted"), deletion]);
    assert.deepEqual([missing.layers, missing.creations, missing.updates, missing.deletions], [[], [], [], []],
        "Document synthesizing a widget without fluid.topLevelWidget rejected in its entirety");
    assert.equal(missing.problems.length, 1, "One problem reported");
    assert.ok(missing.problems[0].includes("synthesizes widgets from the layers fluid.demos.ai.adapted") &&
        missing.problems[0].includes("fluid.topLevelWidget"), "Missing layer described");

    const rebuilt = plan([layerPart("fluid.demos.ai.adapted", "fluid.demos.counter"),
        {kind: "component", filename: "shape:a", parts: [jsonPart("potentia", "/", {$layers: ["fluid.demos.ai.adapted"]})]}]);
    assert.equal(rebuilt.problems.length, 1, "Replacement of widget from synthesized layer is checked too");

    const nested = plan([create("new-1", "fluid.demos.ai.nested", [layerPart("fluid.demos.ai.nested", "fluid.demos.counter")])]);
    assert.equal(nested.problems.length, 1, "Layer defined within component part is checked");

    const named = plan([layerPart("fluid.demos.ai.adapted", ["fluid.demos.counter", "fluid.topLevelWidget"]), create("new-1", "fluid.demos.ai.adapted"), deletion]);
    assert.deepEqual([named.problems, named.layers.length, named.creations.length, named.deletions], [[], 1, 1, ["shape:note1"]],
        "Document naming fluid.topLevelWidget accepted");

    assert.deepEqual(plan([create("new-1", "fluid.demos.counter")]).problems, [], "Widget created from an existing layer need not name it");
    assert.deepEqual(plan([layerPart("fluid.demos.ai.helper", "fluid.component")]).problems, [], "Layer defined without synthesizing a widget need not name it");

    // The rejection is reported to the AI for correction, and nothing is applied
    const bridge = fluid.tests.tldrawAI.makeFakeBridge(fluid.tests.tldrawAI.makeWorkspace([]), []);
    const sent = [];
    const responses = [
        fluid.ptf.encode([layerPart("fluid.demos.ai.adapted", "fluid.demos.counter"), create("new-1", "fluid.demos.ai.adapted")]),
        fluid.ptf.encode([layerPart("fluid.demos.ai.adapted", ["fluid.demos.counter", "fluid.topLevelWidget"]), create("new-1", "fluid.demos.ai.adapted")])
    ];
    await fluid.tldraw.ai.converse({
        direction: "Adapt the counter",
        history: [],
        bridge,
        call: messages => {
            sent.push(fluid.peek(messages).content);
            return Promise.resolve(responses[sent.length - 1]);
        },
        report: () => {},
        getDocs: () => Promise.resolve([])
    });
    assert.equal(sent.length, 2, "AI asked to correct its response");
    assert.ok(sent[1].includes("does not name fluid.topLevelWidget"), "Correction requested names the missing layer");
    assert.deepEqual(bridge.plans.map(oneplan => oneplan.creations.length), [0, 1], "Nothing applied from rejected response, and corrected one applied");
    assert.ok(fluid.tldraw.ai.responseRules.includes("must apply `fluid.topLevelWidget` at its top level"), "AI instructed to apply fluid.topLevelWidget");
});

QUnit.test("Worked examples in the response rules are valid", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const examples = fluid.tldraw.ai.responseRules.split("\nMIME-Version: 1.0\n").slice(1)
        .map(text => fluid.tldraw.ai.trimDocument("MIME-Version: 1.0\n" + text));
    assert.equal(examples.length, 2, "Two worked examples found");
    const updating = fluid.tldraw.ai.planChanges(fluid.ptf.decode(examples[0]), ["shape:abc"], ["shape:abc"]);
    assert.deepEqual(updating.problems, [], "Updating example planned without problems");
    assert.deepEqual(updating.updates.map(change => [change.key, change.rebuild]), [["shape:abc", false]], "Widget updated in place");
    assert.deepEqual(updating.creations.map(change => change.layerName), ["fluid.demos.helloWorld"], "Fresh widget created");

    const creating = fluid.tldraw.ai.planChanges(fluid.ptf.decode(examples[1]), [], []);
    assert.deepEqual(creating.problems, [], "Creating example planned without problems");
    assert.deepEqual(creating.layers.map(part => part.filename), ["fluid.demos.ai.greeter"], "Fresh layer defined");
    assert.deepEqual(creating.creations.map(change => [change.key, change.layerName, change.shape]),
        [["new-1", "fluid.demos.ai.greeter", {x: 500, y: 300}]], "Widget of the fresh layer created");

    // The template syntax described in the rules behaves as described
    creating.layers.forEach(part => fluid.ptf.registerLayerPart(part));
    // The layer's SFC is injected asynchronously
    await fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.demos.ai.greeter", document));
    const container = qs(".container");
    const host = fluid.tests.tldrawAI.host();
    const that = fluid.demos.ai.greeter(fluid.tldraw.hostPotentiaFor("fluid.demos.ai.greeter", container, "shape:greeter"));
    fluid.cell.stabilize();
    const text = qs(".ai-greeter-text", container);
    const [wave, blush] = qsa(".ai-greeter button", container);
    assert.equal(text.textContent, "Hello", "Greeting rendered");
    assert.equal(text.getAttribute("style"), "color: teal", "Style attribute interpolated");
    wave.dispatchEvent(new window.Event("click"));
    fluid.cell.stabilize();
    assert.equal(text.textContent, "Goodbye", "Unquoted literal argument passed to method");
    blush.dispatchEvent(new window.Event("click"));
    fluid.cell.stabilize();
    assert.equal(text.getAttribute("style"), "color: crimson", "Unquoted literal value assigned");
    that.destroy();
    host.destroy();
});

/**
 * Construct a fake AI bridge over a fixed workspace, which records the plans applied to it and reports a scripted
 * sequence of problems
 * @param {Workspace} workspace - The workspace
 * @param {String[][]} problemScript - The problems to be reported by each successive application of a plan
 * @return {Object} The bridge, with a member `plans` recording each plan applied
 */
fluid.tests.tldrawAI.makeFakeBridge = function (workspace, problemScript) {
    const plans = [];
    return {
        plans,
        gatherWorkspace: () => workspace,
        applyPlan: async plan => {
            plans.push(plan);
            return {summary: [`Applied plan ${plans.length}`], problems: problemScript[plans.length - 1] || []};
        }
    };
};

QUnit.test("Exchanges with the AI, including repair of failed responses", async function (assert) {
    const workspace = fluid.tests.tldrawAI.makeWorkspace([{shapeId: "shape:a", layerName: "fluid.demos.counter", bounds: {x: 0, y: 0, w: 1, h: 1}}]);
    const getDocs = () => Promise.resolve(["DOCS"]);
    const deleteDoc = fluid.ptf.encode([{kind: "delete", contentType: "text/plain", filename: "shape:note1", body: ""}]);

    // A text response is reported directly
    const textEntries = [];
    const textHistory = await fluid.tldraw.ai.converse({
        direction: "What is here?",
        history: [],
        bridge: fluid.tests.tldrawAI.makeFakeBridge(workspace, []),
        call: () => Promise.resolve("A counter and a note"),
        report: entry => textEntries.push(entry),
        getDocs
    });
    assert.deepEqual(textEntries, [{kind: "assistant", text: "A counter and a note"}], "Text response reported");
    assert.deepEqual(textHistory.map(exchange => exchange.map(message => message.role)), [["user", "assistant"]], "History records exchange");

    // A response which cannot be decoded, and then one which can be decoded but not fully applied, are reported back
    const responses = ["MIME-Version: 1.0\nContent-Type: text/plain\n\nbroken", deleteDoc, deleteDoc];
    const calls = [];
    const entries = [];
    const bridge = fluid.tests.tldrawAI.makeFakeBridge(workspace, [["The widget shape:a failed"]]);
    const history = await fluid.tldraw.ai.converse({
        direction: "Remove the note",
        history: textHistory,
        bridge,
        call: messages => {
            calls.push(fluid.copy(messages));
            return Promise.resolve(responses[calls.length - 1]);
        },
        report: entry => entries.push(entry),
        getDocs
    });
    assert.equal(calls.length, 3, "AI called again for each repair");
    assert.ok(calls[0][0].content.includes("DOCS"), "System prompt includes documentation");
    assert.deepEqual(calls[0].slice(1, 3), textHistory[0], "Earlier history sent");
    assert.ok(calls[1][calls[1].length - 1].content.includes("is not a valid PTF document"), "Decoding failure reported back to AI");
    assert.ok(calls[2][calls[2].length - 1].content.includes("The widget shape:a failed"), "Application problem reported back to AI");
    assert.deepEqual(entries.map(entry => entry.kind), ["problem", "change", "problem", "change"], "Repairs and changes reported to user");
    assert.equal(bridge.plans.length, 2, "Each decoded document applied");
    assert.deepEqual(bridge.plans[0].deletions, ["shape:note1"], "Plan derived from AI's document");
    assert.deepEqual(history.map(exchange => exchange.length), [2, 6], "History records all messages of the exchange as one");
    assert.deepEqual(history[1][0], calls[0][3], "Exchange begins with its direction");

    // Problems persisting beyond the permitted repairs end the exchange with an error
    const failingEntries = [];
    const failingBridge = fluid.tests.tldrawAI.makeFakeBridge(workspace, [["Still broken"], ["Still broken"], ["Still broken"]]);
    await fluid.tldraw.ai.converse({
        direction: "Remove the note",
        history: [],
        bridge: failingBridge,
        call: () => Promise.resolve(deleteDoc),
        report: entry => failingEntries.push(entry),
        getDocs
    });
    assert.equal(failingBridge.plans.length, fluid.tldraw.ai.maxRepairs + 1, "Repairs limited");
    assert.equal(fluid.peek(failingEntries).kind, "error", "Exchange ends with error");
    assert.equal(fluid.peek(failingEntries).text, "The AI's response could not be fully applied:\n\u2022 Still broken",
        "Final problems listed to user");

    // A reply cut off on reaching the limit of output tokens, which may hold nothing but reasoning, is not shown to the
    // user as an answer but reported back to the AI
    const truncatedEntries = [];
    const truncatedCalls = [];
    const truncatedReplies = [{content: "I am still thinking about", truncated: true, usage: {inputTokens: 10, outputTokens: 8192}}, {content: "Done"}];
    const truncatedHistory = await fluid.tldraw.ai.converse({
        direction: "Think hard",
        history: [],
        bridge: fluid.tests.tldrawAI.makeFakeBridge(workspace, []),
        call: messages => {
            truncatedCalls.push(fluid.copy(messages));
            return Promise.resolve(truncatedReplies[truncatedCalls.length - 1]);
        },
        report: entry => truncatedEntries.push(entry),
        getDocs
    });
    assert.deepEqual(truncatedEntries.map(entry => entry.kind), ["problem", "assistant"], "Truncated reply reported as a problem");
    assert.ok(fluid.peek(truncatedCalls[1]).content.includes(fluid.tldraw.ai.truncationProblem), "Truncation reported back to AI");
    assert.deepEqual(truncatedHistory[0][1], {role: "assistant", content: "I am still thinking about"},
        "Truncated reply retained in history without its usage or truncation");
    assert.ok(failingEntries.find(entry => entry.kind === "problem").text.endsWith(":\n\u2022 Still broken"), "Problems being repaired listed to user");

    // Any reasoning reported separately by the model is retained verbatim in the history
    const reasonedHistory = await fluid.tldraw.ai.converse({
        direction: "What is here?",
        history: [],
        bridge: fluid.tests.tldrawAI.makeFakeBridge(workspace, []),
        call: () => Promise.resolve({content: "\nA counter", reasoning: "I see a counter"}),
        report: () => {},
        getDocs
    });
    assert.deepEqual(reasonedHistory[0][1], {role: "assistant", content: "\nA counter", reasoning: "I see a counter"},
        "Reply and its reasoning retained for the history");

    // Only whole exchanges are sent, as many of the most recent as fit
    const exchange = (name, length) => fluid.iota(length).map(i => ({role: i % 2 ? "assistant" : "user", content: name + i}));
    const exchanges = [exchange("a", 2), exchange("b", 6), exchange("c", 2), exchange("d", 2)];
    assert.deepEqual(fluid.tldraw.ai.recentExchanges(exchanges, 8).map(message => message.content), ["c0", "c1", "d0", "d1"],
        "Exchange which would exceed the limit is not sent in part, nor any before it");
    assert.deepEqual(fluid.tldraw.ai.recentExchanges(exchanges, 10).map(message => message.content), ["b0", "b1", "b2", "b3", "b4", "b5", "c0", "c1", "d0", "d1"],
        "Exchanges sent whole up to the limit");
    assert.deepEqual(fluid.tldraw.ai.recentExchanges([exchange("e", 6)], 4), [], "Nothing sent if the latest exchange alone exceeds the limit");
    assert.deepEqual(fluid.tldraw.ai.buildMessages("", exchanges, "Next").slice(1, -1), fluid.tldraw.ai.recentExchanges(exchanges),
        "Messages assembled from recent exchanges");
});

fluid.def("fluid.tests.tldrawAI.doubler", {
    $layers: "fluid.component",
    input: 0,
    doubled: "$compute:fluid.tests.tldrawAI.double({self}.input)"
});

fluid.tests.tldrawAI.double = x => x * 2;

// An umbrella composing the counter with a doubler, taking the counter's view as its own - FLUID-7020
fluid.def("fluid.tests.tldrawAI.umbrella", {
    $layers: "fluid.topLevelWidget",
    counter: {
        $component: {
            $layers: "fluid.demos.counter"
        }
    },
    doubler: {
        $component: {
            $layers: "fluid.tests.tldrawAI.doubler",
            input: "{counter}.count"
        }
    },
    view: "{counter}.view"
});

fluid.def("fluid.tests.tldrawAI.hostView", {
    $layers: "fluid.topLevelWidgetView",
    shapeId: null,
    hostBounds: "$compute:fluid.tests.tldrawAI.hostBounds({self}.shapeId)"
});

fluid.tests.tldrawAI.hostBounds = shapeId => ({x: shapeId.length, y: 0, w: 1, h: 1});

fluid.def("fluid.tests.tldrawAI.host", {
    $layers: "fluid.component",
    viewLinkage: {
        $linkage: {
            inputLayers: ["fluid.topLevelWidgetView"],
            outputLayers: ["fluid.tests.tldrawAI.hostView"]
        }
    }
});

QUnit.test("Host potentia routed to a cross-injected view", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const container = qs(".container");
    assert.deepEqual(fluid.tldraw.hostPotentiaFor("fluid.demos.counter", container, "shape:a"),
        {view: {$component: {container, shapeId: "shape:a"}}}, "Host potentia directed at a widget's own view");
    const potentia = fluid.tldraw.hostPotentiaFor("fluid.tests.tldrawAI.umbrella", container, "shape:abc");
    assert.deepEqual(potentia, {counter: {$component: {view: {$component: {container, shapeId: "shape:abc"}}}}},
        "Host potentia directed at the view of the subcomponent whose view is injected");

    const host = fluid.tests.tldrawAI.host();
    const that = fluid.tests.tldrawAI.umbrella(potentia);
    fluid.cell.stabilize();
    assert.equal(qs(".counter span", container).textContent, "Clicked 0 times", "Umbrella rendered through the counter's view");
    that.counter.increment();
    fluid.cell.stabilize();
    assert.equal(qs(".counter span", container).textContent, "Clicked 1 times", "Shared view rerenders");
    assert.equal(that.doubler.doubled, 2, "Cross-injected doubler follows the counter");
    assert.deepEqual({...that.hostBounds}, {x: 9, y: 0, w: 1, h: 1}, "Umbrella receives the bounds reported for its shape");
    assert.deepEqual(fluid.tldraw.ai.diagnose(that), [], "No problems diagnosed in a working widget");
    that.destroy();
    host.destroy();
});

QUnit.test("Configuration of a widget's shape transmitted through the potentia of its view", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const defaults = {x: null, y: null, w: null, h: null, rotation: 0, isLocked: false, opacity: 1, parentId: null, index: null};
    const shape = {id: "shape:a", type: "infusion", x: 10, y: 20, rotation: 0, isLocked: false, opacity: 1, parentId: "page:page",
        index: "a1V", props: {w: 100, h: 50, layerName: "fluid.demos.counter"}, meta: {ptfToken: "ptf-1"}};
    assert.deepEqual(fluid.tldraw.shapeToConfig(shape, false, defaults), {x: 10, y: 20, w: 100, h: 50},
        "Defaults, the page as parent and the index of a shape transmitted alone are omitted");
    const framed = {...shape, rotation: 0.5, parentId: "shape:frame"};
    const config = fluid.tldraw.shapeToConfig(framed, true, defaults);
    assert.deepEqual(config, {x: 10, y: 20, w: 100, h: 50, rotation: 0.5, parentId: "shape:frame", index: "a1V"},
        "A shape's parent shape, index and any value differing from its default are transmitted");
    assert.deepEqual(fluid.tldraw.configToShape(config, {id: "shape:b", layerName: "fluid.demos.counter", parentId: "page:p", index: "a1"}, defaults), {
        id: "shape:b", typeName: "shape", type: "infusion", x: 10, y: 20, rotation: 0.5, isLocked: false, opacity: 1,
        parentId: "shape:frame", index: "a1V", props: {layerName: "fluid.demos.counter", w: 100, h: 50}, meta: {}
    }, "Shape reconstructed from its configuration");
    const placed = fluid.tldraw.configToShape({w: 100, h: 50}, {id: "shape:c", layerName: "fluid.demos.counter", parentId: "page:p", index: "a2"}, defaults);
    assert.deepEqual([placed.x, placed.y, placed.parentId, placed.index], [0, 0, "page:p", "a2"], "Shape without position, parent or index takes those of its site");
    const indices = fluid.iota(130).map(fluid.tldraw.defaultIndex);
    assert.ok(indices.every((index, i) => i === 0 || indices[i - 1] < index), "Allocated indices ascend");

    const toParts = potentia => [{kind: "layer", filename: "fluid.demos.counter", body: ""},
        {kind: "potentia", filename: "/", body: JSON.stringify(potentia)}, {kind: "live", filename: "/", body: "{}"}];
    const container = qs(".container");
    const hosted = toParts({$layers: ["fluid.tests.tldrawAI.umbrella"],
        ...fluid.tldraw.hostPotentiaFor("fluid.tests.tldrawAI.umbrella", container, "shape:abc", {x: 1})});
    const written = fluid.tldraw.writeShapeConfig(hosted, "fluid.tests.tldrawAI.umbrella", {x: 5, y: 6});
    assert.deepEqual(JSON.parse(written[1].body), {$layers: ["fluid.tests.tldrawAI.umbrella"], counter: {$component: {view: {$component: {shape: {x: 5, y: 6}}}}}},
        "Configuration written in place of what the host supplied to a cross-injected view");
    assert.deepEqual(written[2], hosted[2], "Other parts untouched");
    assert.deepEqual(fluid.tldraw.readShapeConfig(written), {x: 5, y: 6}, "Configuration read back");
    const stripped = fluid.tldraw.writeShapeConfig(written, "fluid.tests.tldrawAI.umbrella", null);
    assert.deepEqual(JSON.parse(stripped[1].body), {$layers: ["fluid.tests.tldrawAI.umbrella"]}, "Host's material removed entirely");
    const bare = fluid.tldraw.writeShapeConfig(toParts({$layers: ["fluid.demos.counter"], state: {count: 2}}), "fluid.demos.counter", {x: 5});
    assert.deepEqual(JSON.parse(bare[1].body), {$layers: ["fluid.demos.counter"], state: {count: 2}, view: {$component: {shape: {x: 5}}}},
        "Configuration written to the view of a widget whose potentia held none");
    assert.deepEqual(fluid.tldraw.readShapeConfig([]), {}, "No configuration read without a root potentia");
});

fluid.tests.tldrawAI.widthOf = bounds => bounds?.w;

QUnit.test("Problems diagnosed in widgets", async function (assert) {
    fluid.def("fluid.tests.tldrawAI.broken", {
        $layers: "fluid.topLevelWidget",
        view: {
            $component: {
                $layers: "fluid.templateViewComponent",
                template: "<div>@{nonexistent.member}</div>"
            }
        },
        child: {
            $component: {
                $layers: "fluid.tests.tldrawAI.neverDefined"
            }
        }
    });
    const that = fluid.tests.tldrawAI.broken({container: qs(".container")});
    fluid.cell.stabilize();
    const errors = fluid.tldraw.ai.diagnose(that);
    const withPending = fluid.tldraw.ai.diagnose(that, true);
    assert.equal(errors.length, 2, "Two problems diagnosed");
    assert.ok(errors.some(error => error.includes("Component at path /child failed: Layer fluid.tests.tldrawAI.neverDefined is not defined")),
        "Undefined layer of subcomponent described, at its path relative to the widget");
    assert.ok(errors.some(error => error.startsWith("The text \"@{nonexistent.member}\" in the template of view at path")),
        "Unresolved reference in template text described");
    assert.deepEqual(withPending, errors, "No further pending problems");

    // A subcomponent rendering without a container
    fluid.def("fluid.tests.tldrawAI.uncontained", {
        $layers: "fluid.component",
        inner: {
            $component: {
                $layers: "fluid.component",
                view: {
                    $component: {
                        $layers: "fluid.templateViewComponent",
                        template: "<div>Inner</div>"
                    }
                }
            }
        }
    });
    const uncontained = fluid.tests.tldrawAI.uncontained();
    fluid.cell.stabilize();
    const uncontainedProblems = fluid.tldraw.ai.diagnose(uncontained);
    assert.equal(uncontainedProblems.length, 1, "Problem diagnosed in uncontained view");
    assert.ok(uncontainedProblems[0].includes("Container of view at path"), "Missing container described");
    uncontained.destroy();
    assert.equal(fluid.tldraw.ai.describeError(fluid.unavailable("Gone wrong")), "Gone wrong", "Unavailable described");

    // A layer whose definitions cannot be merged, as the AI wrote in trying to suppress a subcomponent of a parent layer
    await fluid.tests.tldrawAI.loadImports();
    fluid.def("fluid.tests.tldrawAI.unmergeable", {
        $layers: ["fluid.demos.closestNoteFinder", "fluid.topLevelWidget"],
        distanceLine: false
    });
    const unmergeable = fluid.tests.tldrawAI.unmergeable();
    fluid.cell.stabilize();
    const mergeProblems = fluid.tldraw.ai.diagnose(unmergeable, true);
    assert.equal(mergeProblems.length, 1, "Failure to merge diagnosed rather than throwing");
    assert.ok(mergeProblems[0].includes("Cannot merge value false at path distanceLine"), "Merge failure described");

    // A subcomponent's member referring to its own value, as the AI wrote intending the umbrella's member - reported
    // once, at the member, rather than at every value it propagates to
    fluid.def("fluid.tests.tldrawAI.boundsUser", {
        $layers: "fluid.component",
        hostBounds: null,
        width: "$compute:fluid.tests.tldrawAI.widthOf({self}.hostBounds)"
    });
    fluid.def("fluid.tests.tldrawAI.selfReferring", {
        $layers: "fluid.component",
        hostBounds: {x: 0, y: 0, w: 100, h: 100},
        finder: {
            $component: {
                $layers: "fluid.tests.tldrawAI.boundsUser",
                hostBounds: "{self}.hostBounds"
            }
        }
    });
    const selfReferring = fluid.tests.tldrawAI.selfReferring();
    fluid.cell.stabilize();
    const selfProblems = fluid.tldraw.ai.diagnose(selfReferring);
    assert.equal(selfProblems.length, 1, "Self-reference diagnosed once");
    assert.ok(selfProblems[0].includes("Member hostBounds of component at path") && selfProblems[0].includes("refers to its own value"),
        "Self-reference described");
    selfReferring.destroy();
    assert.equal(fluid.tldraw.ai.describeError(new Error("Thrown")), "Thrown", "Error described");
    that.destroy();
});

QUnit.test("Markdown rendered safely - FLUID-7024", function (assert) {
    const element = document.createElement("div");
    fluid.demos.markdownBlock.renderInto(element, "# Title\n\n* One <script>alert(1)</script>\n* [Two](https://example.com) [Three](javascript:alert)\n\n`a<b`", true);
    assert.equal(qs("h1", element).textContent, "Title", "Heading rendered");
    assert.deepEqual(qsa("li", element).map(li => li.textContent), ["One <script>alert(1)</script>", "Two Three"], "List rendered");
    assert.notOk(qs("script", element), "Markup in text escaped");
    const links = qsa("a", element);
    assert.equal(links[0].getAttribute("href"), "https://example.com", "http(s) link retained");
    assert.equal(links[0].getAttribute("target"), "_blank", "Link opens in a fresh tab");
    assert.notOk(links[1].hasAttribute("href"), "Link to javascript URL neutralised");
    assert.equal(qs("code", element).textContent, "a<b", "Inline code rendered");
    fluid.demos.markdownBlock.renderInto(element, "Plain **text** <b>here</b>", false);
    assert.equal(element.textContent, "Plain **text** <b>here</b>", "Plain text rendered as it stands");
    assert.notOk(qs("b", element), "Plain text holds no markup");
});

QUnit.test("Tokens in common prompt prefix assumed cached", function (assert) {
    const workspace = fluid.tests.tldrawAI.makeWorkspace([]);
    const system = fluid.tldraw.ai.systemPrompt(["DOCS"], workspace);
    const prefixLength = system.indexOf(fluid.tldraw.ai.workspaceHeading);
    const prefix = system.substring(0, prefixLength);
    assert.ok(prefixLength > 0 && ["DOCS", "## How to respond", "## Strategy hints"].every(fragment => prefix.includes(fragment)),
        "Prefix holds the introduction, documentation, response rules and strategy hints");
    assert.deepEqual(fluid.tldraw.ai.usageFromPayload({usage: {prompt_tokens: 100, completion_tokens: 20,
        prompt_tokens_details: {cached_tokens: 80}, completion_tokens_details: {reasoning_tokens: 5}}}),
    {inputTokens: 100, outputTokens: 20, reasoningTokens: 5, cachedTokens: 80}, "Cached tokens read where reported");
    const messages = fluid.tldraw.ai.buildMessages(system, [], "Do something");
    const totalLength = messages.reduce((total, message) => total + message.content.length, 0);
    assert.equal(fluid.tldraw.ai.cachedTokens(messages), Math.floor(prefixLength / 4), "Cached tokens estimated from prefix");
    assert.equal(fluid.tldraw.ai.cachedTokens(messages, 10000), Math.round(10000 * prefixLength / totalLength),
        "Reported tokens apportioned by prefix's share of request");
    assert.equal(fluid.tldraw.ai.cachedTokens([{role: "user", content: "Hello"}], 50), 0, "Nothing cached without system prompt");
    const entry = {inputTokens: 10234, cachedTokens: 8000, estimated: false};
    assert.equal(fluid.demos.askAnythingEntry.formatSent(entry), "2,234 tokens (8,000 cached)", "Uncached tokens are headline figure");
    assert.equal(fluid.demos.askAnythingEntry.formatSent({...entry, estimated: true}), "~2,234 tokens (~8,000 cached)", "Estimates marked");
});

QUnit.test("Ask me anything panel converses through the bridge", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const container = qs(".container");
    const originalCall = fluid.tldraw.ai.callEndpoint;
    const originalFetch = fluid.tldraw.ai.fetchDocs;
    const originalFind = fluid.tldraw.ai.findLocalService;
    const calls = [];
    fluid.tldraw.ai.findLocalService = () => Promise.resolve(null);
    fluid.tldraw.ai.callEndpoint = options => {
        // The messages are copied, since the conversation goes on to append the reply to them
        calls.push({...options, messages: [...options.messages]});
        return Promise.resolve({content: "<think>Easy</think>There is **nothing** here yet", usage: {inputTokens: 12345, outputTokens: 67, reasoningTokens: 5}});
    };
    fluid.tldraw.ai.fetchDocs = () => Promise.resolve(["DOCS"]);
    fluid.tldraw.ai.bridge = fluid.tests.tldrawAI.makeFakeBridge(fluid.tests.tldrawAI.makeWorkspace([]), []);
    try {
        const that = fluid.demos.askAnything({container});
        fluid.cell.stabilize();
        const isHidden = selector => qs(selector, container).classList.contains("ask-anything-hidden");
        assert.notOk(isHidden(".ask-anything-login"), "Password requested when no token is held");
        assert.ok(isHidden(".ask-anything-direction"), "No direction box shown without token");
        assert.notOk(isHidden(".ask-anything-model"), "Model dropdown shown without token");
        assert.ok(isHidden(".ask-anything-composer .ask-anything-link"), "No log out without token");

        that.state.token = "abc123";
        fluid.cell.stabilize();
        assert.ok(isHidden(".ask-anything-login"), "Password no longer requested once token is held");
        assert.notOk(isHidden(".ask-anything-direction"), "Direction box shown once token is held");
        assert.notOk(isHidden(".ask-anything-composer .ask-anything-link"), "Log out offered once token is held");
        assert.ok(qs(".ask-anything-composer .ask-anything-button", container).hasAttribute("disabled"), "Send disabled without direction");

        that.state.direction = "What is on the *canvas*?";
        fluid.cell.stabilize();
        await that.send();
        fluid.cell.stabilize();
        assert.equal(calls.length, 1, "Endpoint called once");
        assert.equal(calls[0].token, "abc123", "Token presented to endpoint");
        assert.equal(calls[0].endpoint, fluid.tldraw.ai.endpoint, "IFM proxy called");
        assert.equal(calls[0].model, fluid.tldraw.ai.defaultModel, "Default model requested");
        assert.notOk("usage" in calls[0].messages[0], "Usage is not sent to the AI");
        const allRendered = qsa(".ask-anything-entry", container);
        const metrics = allRendered.filter(entry => entry.classList.contains("ask-anything-metrics-entry"));
        assert.equal(metrics.length, 1, "One metrics entry for the one request");
        const cached = fluid.tldraw.ai.cachedTokens(calls[0].messages, 12345);
        assert.ok(cached > 0 && cached < 12345, "Part of the request's tokens assumed cached");
        const metricsText = qs(".ask-anything-metrics", metrics[0]).textContent;
        assert.ok(/^Received text in \d+\.\d s - sent /.test(metricsText), "Metrics report elapsed time");
        assert.ok(metricsText.endsWith(`sent ${(12345 - cached).toLocaleString("en-US")} tokens (${cached.toLocaleString("en-US")} cached), `
            + "received 67 tokens, of which 5 tokens reasoning"), "Metrics report uncached tokens as headline, followed by cached tokens");
        assert.equal(that.state.entries[1].finishedAt !== null, true, "Metrics entry completed");
        const rendered = allRendered.filter(entry => !metrics.includes(entry));
        assert.deepEqual(rendered.map(entry => qs(".ask-anything-entry-text", entry).textContent),
            ["What is on the *canvas*?", "There is nothing here yet"], "User's direction and AI's reply rendered");
        assert.ok(rendered[1].classList.contains("ask-anything-assistant"), "Reply rendered as assistant entry");
        assert.equal(qs(".ask-anything-entry-text strong", rendered[1])?.textContent, "nothing", "Reply rendered as markdown");
        assert.notOk(qs(".ask-anything-entry-text em", rendered[0]), "User's direction rendered as plain text");
        const onlyOptions = qsa(".ask-anything-model select option", container);
        assert.deepEqual(onlyOptions.map(option => [option.getAttribute("value"), option.textContent]), [["ifm", fluid.tldraw.ai.defaultModel]],
            "Dropdown offers just the IFM proxy's model without local service");
        assert.ok(onlyOptions[0].hasAttribute("selected"), "IFM proxy's model selected");
        assert.ok(qs(".ask-anything-entry-detail", rendered[1]).classList.contains("ask-anything-hidden"), "Empty detail hidden");
        assert.equal(that.state.direction, "", "Direction cleared once sent");
        assert.equal(that.state.busy, false, "Panel no longer busy");

        // A rejected token returns the panel to requesting the password
        fluid.tldraw.ai.callEndpoint = () => {
            const error = new Error("Unauthorised");
            error.unauthorised = true;
            return Promise.reject(error);
        };
        that.state.direction = "Again";
        fluid.cell.stabilize();
        await that.send();
        fluid.cell.stabilize();
        assert.equal(that.state.token, "", "Token forgotten on rejection");
        assert.notOk(isHidden(".ask-anything-login"), "Password requested again");
        assert.equal(qs(".ask-anything-login-error", container).textContent, "The password was not accepted - please enter it again.",
            "Rejection explained");
        assert.ok(fluid.peek(qsa(".ask-anything-entry", container)).classList.contains("ask-anything-error"), "Rejection reported");
        assert.ok(/^Request failed after \d+\.\d s - sent ~[\d,]+ tokens \(~[\d,]+ cached\)$/.test(fluid.peek(qsa(".ask-anything-metrics", container)).textContent),
            "Failed request reported in metrics");

        // A pending request whose reply, holding a PTF document, reports no usage
        let resolveReply;
        const pending = fluid.demos.askAnything.measureCall(that.state, [{role: "user", content: "x".repeat(400)}],
            () => new Promise(resolve => resolveReply = resolve));
        fluid.cell.stabilize();
        const lastMetrics = () => fluid.peek(qsa(".ask-anything-metrics", container)).textContent;
        assert.ok(/^Waiting for the AI: \d+\.\d s - sent ~100 tokens \(~0 cached\)$/.test(lastMetrics()), "Pending request reported with estimated input");
        resolveReply("MIME-Version: 1.0\nContent-Type: multipart/mixed; boundary=\"b\"\n\n--b\nContent-Description: layer\n\nx\n--b--\n");
        await pending;
        fluid.cell.stabilize();
        assert.ok(/^Received a PTF document in \d+\.\d s - sent ~100 tokens \(~0 cached\), received ~\d+ tokens \(estimated\)$/.test(lastMetrics()),
            "PTF reply reported with estimated token counts");

        // Text and problems offered by the canvas on paste
        assert.ok(fluid.demos.askAnything.offer({text: "Pasted text"}), "Panel found to receive offer");
        fluid.cell.stabilize();
        assert.equal(that.state.direction, "Pasted text", "Offered text placed in direction");
        fluid.demos.askAnything.offer({text: "More text"});
        fluid.cell.stabilize();
        assert.equal(that.state.direction, "Pasted text\nMore text", "Further offered text appended to direction");
        fluid.demos.askAnything.offer({problem: "The paste failed", detail: "Junk"});
        fluid.cell.stabilize();
        const problem = fluid.peek(qsa(".ask-anything-entry", container));
        assert.ok(problem.classList.contains("ask-anything-error"), "Offered problem reported as error");
        assert.equal(qs(".ask-anything-entry-text", problem).textContent, "The paste failed", "Offered problem described");
        assert.equal(qs(".ask-anything-entry-detail pre", problem).textContent, "Junk", "Offered problem detail held");
        that.destroy();
    } finally {
        fluid.tldraw.ai.callEndpoint = originalCall;
        fluid.tldraw.ai.fetchDocs = originalFetch;
        fluid.tldraw.ai.findLocalService = originalFind;
        fluid.tldraw.ai.bridge = undefined;
        fluid.demos.askAnything.history = [];
    }
});

QUnit.test("Models which can converse are listed", function (assert) {
    const listed = [{id: "a/chat", mode: "chat"}, {id: "a/unmoded"}, {id: "a/speech", mode: "audio_speech"},
        {id: "a/nomic-embed-text", mode: "chat"}, {id: "a/whisper", mode: "audio_transcription"}];
    assert.deepEqual(listed.filter(fluid.tldraw.ai.isChatModel).map(model => model.id), ["a/chat", "a/unmoded"],
        "Speech, transcription and embedding models excluded");
});

QUnit.test("Ask me anything panel converses through local service when its key is found", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const container = qs(".container");
    const originalCall = fluid.tldraw.ai.callEndpoint;
    const originalFetch = fluid.tldraw.ai.fetchDocs;
    const originalFind = fluid.tldraw.ai.findLocalService;
    const originalStored = fluid.demos.askAnything.readStored("modelChoice");
    const calls = [];
    const service = {
        name: "Local",
        endpoint: "https://local.example/v1/chat/completions",
        key: "sk-local",
        models: ["local/big", "local/small"],
        defaultModel: "local/small"
    };
    let resolveService;
    fluid.tldraw.ai.findLocalService = () => new Promise(resolve => resolveService = resolve);
    fluid.tldraw.ai.callEndpoint = options => {
        calls.push(options);
        return Promise.resolve({content: "Hello"});
    };
    fluid.tldraw.ai.fetchDocs = () => Promise.resolve(["DOCS"]);
    fluid.tldraw.ai.bridge = fluid.tests.tldrawAI.makeFakeBridge(fluid.tests.tldrawAI.makeWorkspace([]), []);
    fluid.demos.askAnything.writeStored("modelChoice", "");
    try {
        const that = fluid.demos.askAnything({container});
        that.state.token = "";
        fluid.cell.stabilize();
        const isHidden = selector => qs(selector, container).classList.contains("ask-anything-hidden");
        assert.notOk(isHidden(".ask-anything-login"), "Password requested until local service is found");

        resolveService(service);
        await Promise.resolve();
        fluid.cell.stabilize();
        const select = qs(".ask-anything-model select", container);
        assert.deepEqual(qsa("optgroup", select).map(group => group.getAttribute("label")), ["IFM proxy", "Local"],
            "Dropdown groups the IFM proxy's model first, followed by the service's");
        assert.deepEqual(qsa("option", select).map(option => option.getAttribute("value")), ["ifm", "local:local/big", "local:local/small"],
            "Dropdown lists the IFM proxy's model followed by the service's models");
        assert.deepEqual(qsa("option[selected]", select).map(option => option.getAttribute("value")), ["ifm"], "IFM proxy's model selected by default");
        assert.notOk(isHidden(".ask-anything-login"), "Password still requested for the IFM proxy once local service is found");
        assert.notOk(isHidden(".ask-anything-model"), "Dropdown shown whilst password requested");
        assert.ok(isHidden(".ask-anything-direction"), "No direction box whilst password requested");

        // linkedom's select has no setter for its value, so the choice is made as its options' selection
        const choose = value => {
            qsa("option", select).forEach(option => option.removeAttribute("selected"));
            qs(`option[value="${value}"]`, select).setAttribute("selected", "selected");
            select.dispatchEvent(new Event("change"));
            fluid.cell.stabilize();
        };
        choose("local:local/big");
        assert.equal(that.state.modelChoice, "local:local/big", "Chosen model held");
        assert.equal(qs("option[selected]", select).getAttribute("value"), "local:local/big", "Chosen model selected");
        assert.ok(isHidden(".ask-anything-login"), "No password requested for a model of the local service");
        assert.notOk(isHidden(".ask-anything-direction"), "Direction box shown with local service");
        assert.ok(qs(".ask-anything-direction", container).nextElementSibling.contains(select), "Dropdown held in the row beneath the direction box");
        assert.ok(isHidden(".ask-anything-composer .ask-anything-link"), "No log out from local service");

        choose("ifm");
        assert.notOk(isHidden(".ask-anything-login"), "Password requested again on choosing the IFM proxy's model");
        choose("local:local/big");

        that.state.direction = "Hello?";
        fluid.cell.stabilize();
        await that.send();
        fluid.cell.stabilize();
        assert.deepEqual([calls[0].endpoint, calls[0].token, calls[0].model], [service.endpoint, service.key, "local/big"],
            "Local service called with its key and chosen model");

        // A rejected key is reported without requesting the password for the IFM proxy
        fluid.tldraw.ai.callEndpoint = () => {
            const error = new Error("Unauthorised");
            error.unauthorised = true;
            return Promise.reject(error);
        };
        that.state.direction = "Again";
        fluid.cell.stabilize();
        await that.send();
        fluid.cell.stabilize();
        assert.ok(isHidden(".ask-anything-login"), "Password not requested on rejection of local key");
        assert.ok(fluid.peek(qsa(".ask-anything-entry", container)).classList.contains("ask-anything-error"), "Rejection reported");
        that.destroy();
    } finally {
        fluid.tldraw.ai.callEndpoint = originalCall;
        fluid.tldraw.ai.fetchDocs = originalFetch;
        fluid.tldraw.ai.findLocalService = originalFind;
        fluid.tldraw.ai.bridge = undefined;
        fluid.demos.askAnything.history = [];
        fluid.demos.askAnything.writeStored("modelChoice", originalStored);
    }
});

/**
 * Construct a fake Pixabay hit
 * @param {Number} id - The image's id
 * @param {String} url - The image's URL
 * @return {Object} The hit, as found in a Pixabay API response
 */
fluid.tests.tldrawAI.pixabayHit = (id, url) => ({
    id,
    webformatURL: url,
    webformatWidth: 640,
    webformatHeight: 427,
    tags: "red fox, snow",
    pageURL: `https://pixabay.com/photos/fox-${id}/`,
    user: "Some User",
    user_id: 42
});

/**
 * Replace the fetching of the Pixabay API by a fake, recording the API requests made
 * @param {Function} respond - Accepts the parameters of an API request and returns the hits to be returned for it
 * @return {Object[]} The parameters of each API request made, to which the fake will append
 */
fluid.tests.tldrawAI.fakePixabay = function (respond) {
    const requests = [];
    fluid.demos.pixabay.cache.clear();
    fluid.demos.pixabay.fetch = url => {
        const params = Object.fromEntries(new URL(url).searchParams);
        requests.push(params);
        return Promise.resolve({ok: true, json: () => Promise.resolve({totalHits: 1, hits: respond(params)})});
    };
    return requests;
};

QUnit.test("Image widget finds and credits images from Pixabay", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const originalFetch = fluid.demos.pixabay.fetch;
    const requests = fluid.tests.tldrawAI.fakePixabay(params => params.id === "1" ? [fluid.tests.tldrawAI.pixabayHit(1, "https://pixabay.com/get/fresh.jpg")] :
        params.q === "nothing" ? [] : [fluid.tests.tldrawAI.pixabayHit(1, "https://pixabay.com/get/one.jpg"), fluid.tests.tldrawAI.pixabayHit(2, "https://pixabay.com/get/two.jpg")]);
    const container = qs(".container");
    try {
        const that = fluid.demos.imageGenerator({container});
        fluid.cell.stabilize();
        assert.notOk(qs("img", container), "No image initially");
        that.state.prompt = "  A red fox in the snow  ";
        fluid.cell.stabilize();
        await that.generate();
        fluid.cell.stabilize();
        assert.deepEqual(requests, [{key: fluid.demos.pixabay.apiKey, q: "A red fox in the snow", safesearch: "true", per_page: "20"}],
            "Pixabay searched for the trimmed prompt with the embedded key");
        assert.equal(qs("img", container).getAttribute("src"), "https://pixabay.com/get/one.jpg", "First image shown");
        assert.equal(qs("img", container).getAttribute("alt"), "red fox, snow", "Image described by its tags");
        const links = qsa(".imagegen-credit a", container);
        assert.equal(qs(".imagegen-credit", container).textContent.replace(/\s+/g, " ").trim(), "Image by Some User from Pixabay", "Image credited");
        assert.deepEqual(links.map(link => link.getAttribute("href")), ["https://pixabay.com/users/Some%20User-42/", "https://pixabay.com/photos/fox-1/"],
            "Credit links to contributor and image page");

        that.showAnother();
        fluid.cell.stabilize();
        assert.equal(qs("img", container).getAttribute("src"), "https://pixabay.com/get/two.jpg", "Another image shown");
        that.showAnother();
        fluid.cell.stabilize();
        assert.equal(qs("img", container).getAttribute("src"), "https://pixabay.com/get/one.jpg", "First image shown again after the last");

        await that.generate();
        assert.equal(requests.length, 1, "Repeated search answered from cache");

        // An expired URL is refreshed once by looking the image up by its id
        await that.refresh();
        fluid.cell.stabilize();
        assert.equal(qs("img", container).getAttribute("src"), "https://pixabay.com/get/fresh.jpg", "Expired image refreshed");
        await that.refresh();
        assert.equal(requests.length, 2, "Image refreshed only once");

        that.state.prompt = "nothing";
        fluid.cell.stabilize();
        await that.generate();
        fluid.cell.stabilize();
        assert.equal(qs(".imagegen-error", container).textContent, "No images on Pixabay match \"nothing\" - try describing it differently",
            "Absence of results reported");
        that.destroy();
    } finally {
        fluid.demos.pixabay.fetch = originalFetch;
        fluid.demos.pixabay.cache.clear();
    }
});

QUnit.test("History commands and their keyboard shortcuts", function (assert) {
    const [liveBack, liveForward, layerBack, layerForward] = fluid.tldraw.historyCommands;
    assert.deepEqual(fluid.tldraw.historyCommands.map(command => fluid.tldraw.commandTooltip(command, false)), [
        "Undo widget change (Ctrl+Z)", "Redo widget change (Ctrl+Y)", "Undo layer change (Ctrl+Shift+Z)", "Redo layer change (Ctrl+Shift+Y)"
    ], "Shortcuts advertised for Windows and Linux");
    assert.deepEqual(fluid.tldraw.historyCommands.map(command => fluid.tldraw.shortcutLabel(command, true)), ["⌘Z", "⌘Y", "⇧⌘Z", "⇧⌘Y"],
        "Shortcuts advertised for macOS");
    assert.ok(fluid.tldraw.isApple({platform: "MacIntel"}), "macOS detected");
    assert.ok(fluid.tldraw.isApple({userAgentData: {platform: "macOS"}}), "macOS detected from user agent data");
    assert.notOk(fluid.tldraw.isApple({platform: "Win32"}), "Windows is not Apple");
    const key = (key, modifiers) => ({key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers});
    assert.equal(fluid.tldraw.commandForKey(key("z", {ctrlKey: true}), false), liveBack, "Ctrl+Z undoes state");
    assert.equal(fluid.tldraw.commandForKey(key("y", {ctrlKey: true}), false), liveForward, "Ctrl+Y redoes state");
    assert.equal(fluid.tldraw.commandForKey(key("Z", {ctrlKey: true, shiftKey: true}), false), layerBack, "Ctrl+Shift+Z undoes layers");
    assert.equal(fluid.tldraw.commandForKey(key("Y", {ctrlKey: true, shiftKey: true}), false), layerForward, "Ctrl+Shift+Y redoes layers");
    assert.equal(fluid.tldraw.commandForKey(key("z", {metaKey: true}), true), liveBack, "Cmd+Z undoes state on macOS");
    assert.equal(fluid.tldraw.commandForKey(key("z", {ctrlKey: true}), true), undefined, "Ctrl+Z does nothing on macOS");
    assert.equal(fluid.tldraw.commandForKey(key("z", {metaKey: true}), false), undefined, "Meta+Z does nothing elsewhere");
    assert.equal(fluid.tldraw.commandForKey(key("z", {ctrlKey: true, altKey: true}), false), undefined, "Alt modifies the shortcut away");
    assert.equal(fluid.tldraw.commandForKey(key("z"), false), undefined, "Plain key does nothing");
    assert.ok(fluid.tldraw.isTextEditing(document.createElement("textarea")), "Text area edits text");
    assert.notOk(fluid.tldraw.isTextEditing(document.createElement("button")), "Button does not edit text");
    assert.notOk(fluid.tldraw.isTextEditing(null), "Nothing focused does not edit text");
});

QUnit.test("Sites in the arena referred to relative to their widget", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const first = fluid.tests.tldrawAI.makeCounter(qs(".container"), "shape:a", 1);
    const instances = new Map([["shape:a", first]]);
    const site = fluid.renderSite({shadow: fluid.ptf.componentToShadow(first), segs: ["state"]});
    const ref = fluid.tldraw.siteToRef(site, instances);
    assert.deepEqual(ref, {shapeId: "shape:a", component: "/", path: "state"}, "Site in widget referred to by shape");
    const viewSite = fluid.renderSite({shadow: fluid.ptf.componentToShadow(first.view), segs: ["hostBounds"]});
    assert.deepEqual(fluid.tldraw.siteToRef(viewSite, instances), {shapeId: "shape:a", component: "/view", path: "hostBounds"},
        "Site in widget's subcomponent referred to by its path");
    assert.ok(fluid.tldraw.findWidget(fluid.ptf.componentToShadow(first.view), instances), "Subcomponent belongs to widget");
    assert.equal(fluid.tldraw.siteToRef(site, new Map()), null, "Site outside any widget cannot be referred to");

    // Reconstruct the widget, as on restoring the arena
    const second = fluid.tests.tldrawAI.makeCounter(qs(".container2"), "shape:a", 0);
    const restored = new Map([["shape:a", second]]);
    assert.equal(fluid.tldraw.refToSite(ref, restored), fluid.renderSite({shadow: fluid.ptf.componentToShadow(second), segs: ["state"]}),
        "Reference resolved to reconstructed widget");
    assert.equal(fluid.tldraw.refToSite({...ref, shapeId: "shape:gone"}, restored), null, "Reference to missing widget resolves to nothing");
    assert.equal(fluid.tldraw.refToSite({...ref, component: "/missing"}, restored), null, "Reference to missing component resolves to nothing");
    first.destroy();
    second.destroy();
});

QUnit.test("Sent directions recalled with the arrow keys", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const that = fluid.demos.askAnything({container: qs(".container")});
    fluid.cell.stabilize();
    const state = that.state;
    state.entries = ["First", "Second", "Second", "Third\nwith two lines"].map(text => ({kind: "user", text, detail: ""}))
        .concat([{kind: "assistant", text: "A reply", detail: ""}]);
    assert.deepEqual(fluid.demos.askAnything.sentDirections(state.entries), ["First", "Second", "Third\nwith two lines"],
        "Sent directions listed, with repetitions once");
    // A stand-in for the textarea, whose value follows the direction and whose caret is placed as given
    const textarea = caret => ({value: state.direction, selectionStart: caret ?? state.direction.length, selectionEnd: caret ?? state.direction.length});
    const press = (key, caret) => {
        let prevented = false;
        const target = {...textarea(caret), setSelectionRange: () => {}};
        fluid.demos.askAnything.directionKeyDown(that, {key, target, preventDefault: () => prevented = true});
        fluid.cell.stabilize();
        return prevented;
    };
    state.direction = "Half typed";
    assert.ok(press("ArrowUp"), "Up recalls from a single line");
    assert.equal(state.direction, "Third\nwith two lines", "Most recent direction recalled first");
    assert.ok(press("ArrowUp"), "Up recalls again from an unedited recalled direction, wherever its caret");
    assert.equal(state.direction, "Second", "Earlier direction recalled");
    press("ArrowUp");
    assert.equal(state.direction, "First", "Earliest direction recalled");
    assert.notOk(press("ArrowUp"), "Nothing earlier to recall, so the arrow moves the caret as usual");
    assert.equal(state.direction, "First", "Earliest direction retained");
    press("ArrowDown");
    press("ArrowDown");
    assert.equal(state.direction, "Third\nwith two lines", "Down recalls later directions");
    assert.ok(press("ArrowDown"), "Down beyond the latest direction");
    assert.equal(state.direction, "Half typed", "Direction typed before recall restored");
    assert.notOk(press("ArrowDown"), "Down without recall moves the caret as usual");

    // A recalled direction which has been edited is only left when the caret is on its first or last line
    press("ArrowUp");
    state.direction = "Third\nwith two lines, edited";
    assert.notOk(press("ArrowUp", 10), "Up within the last line of an edited direction moves the caret");
    assert.notOk(press("ArrowDown", 2), "Down within the first line of an edited direction moves the caret");
    assert.ok(press("ArrowUp", 2), "Up from the first line recalls");
    assert.equal(state.direction, "Second", "Edited direction left for an earlier one");
    let prevented = false;
    fluid.demos.askAnything.directionKeyDown(that, {key: "ArrowUp", shiftKey: true, target: {...textarea(0), setSelectionRange: () => {}},
        preventDefault: () => prevented = true});
    assert.notOk(prevented, "Shift+Up extends the selection as usual");
    that.destroy();
});

QUnit.test("Widget layers listed from the layer store, and deleted", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const listed = () => {
        fluid.cell.stabilize();
        return fluid.tldraw.widgetLayers.get();
    };
    assert.ok(listed().includes("fluid.demos.counter"), "Widget layer loaded by the page listed");
    assert.notOk(listed().includes("fluid.demos.askAnything"), "Layer which is not a widget not listed");
    assert.notOk(listed().includes("fluid.topLevelWidget"), "Framework layer not listed");

    // A JavaScript layer, as sent by the AI, and one built on it
    fluid.ptf.registerLayerPart({kind: "layer", contentType: "text/javascript", filename: "fluid.demos.ai.colourChanger",
        body: "fluid.def(\"fluid.demos.ai.colourChanger\", {$layers: \"fluid.topLevelWidget\", colour: \"red\"});"});
    assert.ok(listed().includes("fluid.demos.ai.colourChanger"), "JavaScript widget layer sent by the AI listed at once");
    fluid.def("fluid.demos.ai.colourChangerPlus", {$layers: ["fluid.demos.ai.colourChanger"], extra: 1});
    assert.ok(listed().includes("fluid.demos.ai.colourChangerPlus"), "Layer acquiring fluid.topLevelWidget from its parent listed");
    // An SFC layer registered from its text, as from a PTF document
    fluid.ptf.registerLayerPart({kind: "layer", contentType: "text/x-vue", filename: "fluid.demos.ai.sfcWidget",
        body: "<script>\nfluid.def(\"fluid.demos.ai.sfcWidget\", {$layers: \"fluid.topLevelWidget\"});\n</script>\n<template><div>SFC</div></template>"});
    await fluid.cell.waitFor(fluid.readSFC("fluid.demos.ai.sfcWidget").docInjectEffects.get(document).injDone);
    await fluid.cell.settle();
    assert.ok(listed().includes("fluid.demos.ai.sfcWidget"), "SFC widget layer registered from text listed");

    assert.deepEqual(fluid.tldraw.dependentLayers("fluid.demos.ai.colourChanger"), ["fluid.demos.ai.colourChangerPlus"], "Dependent layer found");
    assert.equal(fluid.tldraw.deletionQuestion("fluid.demos.ai.colourChanger", 2, ["fluid.demos.ai.colourChangerPlus"], false),
        "Delete the layer fluid.demos.ai.colourChanger?\n\nThe 2 widgets on the canvas made from it will be deleted too.\n\n"
        + "These layers are built on it, and will no longer work: fluid.demos.ai.colourChangerPlus\n\n"
        + "The deletion of the layer can be undone with Ctrl+Shift+Z.", "Deletion question describes its consequences");
    assert.equal(fluid.tldraw.deletionQuestion("x.y", 0, [], true), "Delete the layer x.y?\n\nThe deletion of the layer can be undone with ⇧⌘Z.",
        "Deletion question for unused layer on macOS");

    fluid.deleteLayer("fluid.demos.ai.colourChangerPlus");
    fluid.deleteLayer("fluid.demos.ai.colourChanger");
    assert.notOk(listed().includes("fluid.demos.ai.colourChanger"), "Deleted layer no longer listed");
    fluid.deleteLayer("fluid.demos.ai.sfcWidget");
    assert.notOk(listed().includes("fluid.demos.ai.sfcWidget"), "Deleted SFC layer no longer listed");
});

// Slop-free composition of the closest note finder with the image generator - FLUID-7025

// Stands in for fluid.demos.tldrawHost, bridging the notes on the canvas and the bounds of each widget's shape. As
// there, widgets are constructed as its children, within whose scope it may be resolved
fluid.def("fluid.tests.tldrawAI.tldrawHost", {
    $layers: "fluid.component",
    notes: [],
    viewLinkage: {
        $linkage: {
            inputLayers: ["fluid.topLevelWidgetView"],
            outputLayers: ["fluid.tests.tldrawAI.boundsView"]
        }
    }
});

// As for fluid.tldrawViewComponent, no bounds are reported for a view which is not hosted in a shape of its own
fluid.def("fluid.tests.tldrawAI.boundsView", {
    $layers: "fluid.topLevelWidgetView",
    shapeId: null,
    hostBounds: "$compute:fluid.tests.tldrawAI.boundsForShape({self}.shapeId)"
});

fluid.tests.tldrawAI.boundsForShape = shapeId => shapeId === null ? null : {x: 100, y: 100, w: 360, h: 460};

// The layer which the AI is expected to synthesize: the image generator is dominant, and the note finder is mixed in
// as a subcomponent sharing its view, so that only the image generator renders. The prompt held in the image
// generator's reactive state is linked to the closest note's text
fluid.def("fluid.demos.ai.closestNoteImageGenerator", {
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
});

fluid.def("fluid.tests.tldrawAI.noteImageUmbrella", {
    $layers: "fluid.topLevelWidget",
    imageGenerator: {
        $component: {
            $layers: "fluid.demos.imageGenerator",
            state: {
                prompt: "{noteFinder}.noteText"
            }
        }
    },
    noteFinder: {
        $component: {
            $layers: "fluid.demos.closestNoteFinder",
            view: "{imageGenerator}.view"
        }
    },
    view: "{imageGenerator}.view"
});

// An umbrella with a template of its own rendering both widgets, as the AI chose in the absence of the strategy hint
// describing a dominant widget composed with a supplier - the nested note finder takes the umbrella's bounds
fluid.def("fluid.tests.tldrawAI.visibleUmbrella", {
    $layers: "fluid.topLevelWidget",
    finder: {
        $component: {
            $layers: ["fluid.demos.closestNoteFinder", "fluid.component"]
        }
    },
    imageGen: {
        $component: {
            $layers: ["fluid.demos.imageGenerator", "fluid.component"],
            state: {
                prompt: "{finder}.closest.text"
            }
        }
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="visible-umbrella"><div @id="finder"></div><div @id="imageGen"></div></div>`
        }
    }
});

// A layer derived from an SFC layer supplying a template of its own, which overrides the SFC's
fluid.def("fluid.tests.tldrawAI.retemplatedFinder", {
    $layers: ["fluid.demos.closestNoteFinder", "fluid.topLevelWidget"],
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="retemplated">Nearest: @{noteText}</div>`
        }
    }
});

QUnit.test("Further compositions chosen by the AI - FLUID-7025", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const container = qs(".container");
    const host = fluid.tests.tldrawAI.tldrawHost({notes: [{id: "shape:near", x: 120, y: 90, text: "A red fox"}]});

    const umbrella = fluid.initChildComponent(host, "fluid.tests.tldrawAI.visibleUmbrella", fluid.tldraw.hostPotentiaFor("fluid.tests.tldrawAI.visibleUmbrella", container, "shape:visible"));
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tldraw.ai.diagnose(umbrella, true), [], "No problems diagnosed in umbrella with a template of its own");
    assert.deepEqual({...umbrella.finder.hostBounds}, {x: 100, y: 100, w: 360, h: 460}, "Nested note finder takes the umbrella's bounds");
    assert.equal(qs(".notefinder-text", container).textContent, "A red fox", "Nested note finder shows the closest note");
    assert.equal(qs(".imagegen-input", container).value, "A red fox", "Nested image generator's prompt follows it");
    umbrella.destroy();

    const retemplated = fluid.initChildComponent(host, "fluid.tests.tldrawAI.retemplatedFinder", fluid.tldraw.hostPotentiaFor("fluid.tests.tldrawAI.retemplatedFinder", container, "shape:retemplated"));
    fluid.cell.stabilize();
    assert.equal(container.textContent, "Nearest: A red fox", "Template of derived layer overrides that of its SFC parent layer");
    assert.equal(qsa(".notefinder", container).length, 0, "SFC parent layer's template not rendered");
    retemplated.destroy();
    host.destroy();
});

// Stand-ins for the layers named in the strategy hints' example of a dominant widget with a supplier mixed in
fluid.def("my.resultShower", {
    $layers: "fluid.topLevelWidget",
    state: {
        $reactiveRoot: {
            query: "",
            result: ""
        }
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="shower"><input value="@{state.query}"><span>@{state.result}</span></div>`
        }
    }
});

fluid.def("my.textFinder", {
    $layers: "fluid.topLevelWidget",
    foundText: "$compute:fluid.tests.tldrawAI.findText({self}.hostBounds)",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="finder">@{foundText}<div @id="detail"></div></div>`
        }
    },
    detail: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<span class="finder-detail">Detail</span>`
                }
            }
        }
    }
});

fluid.tests.tldrawAI.findText = bounds => `Found at ${bounds.x}`;

QUnit.test("Worked example of composition in the strategy hints is valid", function (assert) {
    const match = /\n( +)(fluid\.def\("my\.ai\.showsFoundResult"[\s\S]*?\n\1\}\);)/.exec(fluid.tldraw.ai.strategyHints);
    assert.ok(match, "Example layer found in the hints");
    // eslint-disable-next-line no-new-func
    new Function(match[2])();
    const container = qs(".container");
    const host = fluid.tests.tldrawAI.tldrawHost();
    const that = fluid.initChildComponent(host, "my.ai.showsFoundResult", fluid.tldraw.hostPotentiaFor("my.ai.showsFoundResult", container, "shape:example"));
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tldraw.ai.diagnose(that, true), [], "No problems diagnosed in the example");
    assert.equal(qs(".shower input", container).value, "Found at 100", "Dominant widget's input drawn from supplier's output, which follows the widget's bounds");
    assert.equal(qsa(".finder, .finder-detail", container).length, 0, "Neither the supplier nor its subcomponents render");
    that.destroy();
    host.destroy();
});

QUnit.test("Closest note composed with image generator - FLUID-7025", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const originalFetch = fluid.demos.pixabay.fetch;
    const requests = fluid.tests.tldrawAI.fakePixabay(() => [fluid.tests.tldrawAI.pixabayHit(1, "https://pixabay.com/get/one.jpg")]);
    const container = qs(".container");
    try {
        const host = fluid.tests.tldrawAI.tldrawHost({
            notes: [{id: "shape:far", x: 900, y: 900, text: "A lighthouse"}, {id: "shape:near", x: 120, y: 90, text: "A red fox"}]
        });
        const potentia = fluid.tldraw.hostPotentiaFor("fluid.demos.ai.closestNoteImageGenerator", container, "shape:combined");
        const that = fluid.initChildComponent(host, "fluid.demos.ai.closestNoteImageGenerator", potentia);
        fluid.cell.stabilize();
        assert.deepEqual(fluid.tldraw.ai.diagnose(that, true), [], "No problems diagnosed in composed widget");
        assert.equal(that.noteFinder.view, that.view, "Note finder shares the image generator's view");
        assert.deepEqual({...that.noteFinder.hostBounds}, {x: 100, y: 100, w: 360, h: 460}, "Note finder receives the composed widget's bounds");
        assert.equal(that.noteFinder.noteText, "A red fox", "Closest note found");
        assert.equal(qsa(".notefinder", container).length, 0, "Note finder's template not rendered");
        assert.equal(qs(".imagegen-input", container).value, "A red fox", "Prompt follows the closest note");
        await that.generate();
        fluid.cell.stabilize();
        assert.equal(requests[0].q, "A red fox", "Image searched for the closest note's text");
        assert.equal(qs("img", container).getAttribute("src"), "https://pixabay.com/get/one.jpg", "Image shown");
        host.notes = [{id: "shape:near", x: 120, y: 90, text: "A grey wolf"}];
        fluid.cell.stabilize();
        assert.equal(qs(".imagegen-input", container).value, "A grey wolf", "Prompt follows edit to the closest note");
        const input = qs(".imagegen-input", container);
        input.value = "A grey wolf howling";
        input.dispatchEvent(new Event("input"));
        fluid.cell.stabilize();
        assert.equal(that.state.prompt, "A grey wolf howling", "Prompt linked to the closest note may still be typed into");

        // The composed widget is transmitted, e.g. to the AI or the arena's persistence, and reconstructed
        const text = fluid.ptf.componentToPTF(that);
        that.destroy();
        const {that: copy, unresolved} = await fluid.ptf.instantiate(text, {potentia, parent: host});
        fluid.cell.stabilize();
        assert.deepEqual(unresolved, [], "Composed widget reconstructed from its PTF document");
        assert.deepEqual(fluid.tldraw.ai.diagnose(copy, true), [], "No problems diagnosed in reconstructed widget");
        assert.equal(qs("img", container).getAttribute("src"), "https://pixabay.com/get/one.jpg", "Reconstructed widget shows its image");
        assert.equal(qs(".imagegen-input", container).value, "A grey wolf howling", "Reconstructed widget's typed prompt restored");
        host.notes = [{id: "shape:near", x: 120, y: 90, text: "A white owl"}];
        fluid.cell.stabilize();
        assert.equal(qs(".imagegen-input", container).value, "A white owl", "Reconstructed widget's prompt follows the closest note");
        copy.destroy();

        // The same composition as an umbrella holding both widgets, as the strategy hints describe
        const umbrellaPotentia = fluid.tldraw.hostPotentiaFor("fluid.tests.tldrawAI.noteImageUmbrella", container, "shape:umbrella");
        const umbrella = fluid.initChildComponent(host, "fluid.tests.tldrawAI.noteImageUmbrella", umbrellaPotentia);
        fluid.cell.stabilize();
        assert.deepEqual(fluid.tldraw.ai.diagnose(umbrella, true), [], "No problems diagnosed in umbrella");
        assert.equal(qs(".imagegen-input", container).value, "A white owl", "Umbrella's prompt follows the closest note");
        assert.equal(qsa(".notefinder", container).length, 0, "Note finder's template not rendered in umbrella");
        umbrella.destroy();
        host.destroy();
    } finally {
        fluid.demos.pixabay.fetch = originalFetch;
        fluid.demos.pixabay.cache.clear();
    }
});

// A board rendered from a template computed as a string of markup, as the AI wrote for a game of Othello, in which
// the template was silently replaced by the SFC's <template> block and its references designated the view

fluid.tests.tldrawAI.playCell = function (state, i) {
    state.cells = state.cells.map((cell, j) => j === i ? 1 : cell);
};

fluid.tests.tldrawAI.renderBoard = cells => "<div class=\"board\">" + cells.map((cell, i) => cell ?
    `<span class="board-disc">${cell}</span>` : `<button class="board-cell" @onclick="{self}.play(${i})">+</button>`).join("") + "</div>";

/**
 * Compose the text of an SFC defining a board layer
 * @param {String} layerName - The name of the layer
 * @param {String} context - The context through which the view's template refers to the board's state
 * @param {Boolean} withTemplateBlock - `true` if the SFC should also hold a `<template>` block
 * @return {String} The text of the SFC
 */
fluid.tests.tldrawAI.boardSFC = (layerName, context, withTemplateBlock) => `<script>
fluid.def("${layerName}", {
    $layers: "fluid.topLevelWidget",
    state: {
        $reactiveRoot: {
            cells: [0, 1, 0]
        }
    },
    play: {
        $method: {
            func: "fluid.tests.tldrawAI.playCell",
            args: ["{self}.state", "{0}:i"]
        }
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: "$compute:fluid.tests.tldrawAI.renderBoard(${context}.state.cells)"
        }
    }
});
</script>
${withTemplateBlock ? "<template><div class=\"board-placeholder\"></div></template>" : ""}`;

/**
 * Register a board layer from the text of its SFC, as from a PTF document, and construct a board from it
 * @param {String} layerName - The name of the layer
 * @param {String} text - The text of the SFC
 * @param {Element} container - The container into which the board renders
 * @return {Promise<fluid.component>} A promise for the board
 */
fluid.tests.tldrawAI.makeBoard = async function (layerName, text, container) {
    fluid.ptf.registerLayerPart({kind: "layer", contentType: "text/x-vue", filename: layerName, body: text});
    await fluid.cell.waitFor(fluid.readSFC(layerName).docInjectEffects.get(document).injDone);
    await fluid.cell.settle();
    const that = fluid.getGlobalValue(layerName)(fluid.tldraw.hostPotentiaFor(layerName, container, "shape:board"));
    fluid.cell.stabilize();
    return that;
};

QUnit.test("Board rendered from computed template diagnosed - Othello", async function (assert) {
    const container = qs(".container");

    // A layer which can never be defined is reported as soon as the graph settles, with the reason it was rejected
    const started = Date.now();
    fluid.ptf.registerLayerPart({kind: "layer", contentType: "text/x-vue", filename: "fluid.tests.tldrawAI.board0",
        body: fluid.tests.tldrawAI.boardSFC("fluid.tests.tldrawAI.board0", "{board0}", true)});
    const rejected = await fluid.tldraw.ai.awaitLayer("fluid.tests.tldrawAI.board0");
    assert.ok(fluid.isUnavailable(rejected) && fluid.tldraw.ai.describeError(rejected).includes(
        fluid.sfcTemplateConflictMessage("fluid.tests.tldrawAI.board0")), "Rejected layer reported with its reason");
    assert.ok(Date.now() - started < fluid.tldraw.ai.settleTimeout, "Rejected layer reported without waiting for timeout");
    fluid.ptf.registerLayerPart({kind: "layer", contentType: "text/x-vue", filename: "fluid.tests.tldrawAI.board4",
        body: fluid.tests.tldrawAI.boardSFC("fluid.tests.tldrawAI.board4", "{board4}", false)});
    assert.strictEqual(await fluid.tldraw.ai.awaitLayer("fluid.tests.tldrawAI.board4"), null, "Sound layer awaited until defined");
    assert.equal(typeof(fluid.getGlobalValue("fluid.tests.tldrawAI.board4")), "function", "Sound layer's creator defined");
    ["fluid.tests.tldrawAI.board0", "fluid.tests.tldrawAI.board4"].forEach(fluid.deleteLayer);

    // An SFC defining its template both as a computed template and as a <template> block
    const conflicting = fluid.tests.tldrawAI.boardSFC("fluid.tests.tldrawAI.board1", "{board1}", true);
    const plan = fluid.tldraw.ai.planChanges([{kind: "layer", contentType: "text/x-vue", filename: "fluid.tests.tldrawAI.board1", body: conflicting}], [], []);
    assert.equal(plan.problems.length, 1, "Layer part defining its template twice reported at once");
    assert.ok(plan.problems[0].includes(fluid.sfcTemplateConflictMessage("fluid.tests.tldrawAI.board1")), "Conflict described");
    const board1 = await fluid.tests.tldrawAI.makeBoard("fluid.tests.tldrawAI.board1", conflicting, container);
    const conflictProblems = fluid.tldraw.ai.diagnose(board1, true);
    assert.ok(conflictProblems.some(problem => problem.includes(fluid.sfcTemplateConflictMessage("fluid.tests.tldrawAI.board1"))),
        "Conflict diagnosed in widget constructed from the layer");
    // A component whose layers failed has no destroy method of its own
    fluid.destroyComponent(board1);

    // The computed template refers to the board's state through {self}, which designates the view
    const board2 = await fluid.tests.tldrawAI.makeBoard("fluid.tests.tldrawAI.board2",
        fluid.tests.tldrawAI.boardSFC("fluid.tests.tldrawAI.board2", "{self}", false), container);
    const selfProblems = fluid.tldraw.ai.diagnose(board2, true);
    assert.equal(selfProblems.length, 2, "One problem and one hint diagnosed");
    assert.ok(selfProblems[0].startsWith("Member template of component at path") && selfProblems[0].includes("/view has no member state, "
        + "although its parent component at path / does"), "Reference to state of the view reported at the view's template, noting its parent");
    assert.equal(selfProblems[1], "Hint: " + fluid.parentMemberHintText, "Meaning of {self} explained");
    board2.destroy();

    // The board corrected, which renders, plays, and is diagnosed sound
    const board3 = await fluid.tests.tldrawAI.makeBoard("fluid.tests.tldrawAI.board3",
        fluid.tests.tldrawAI.boardSFC("fluid.tests.tldrawAI.board3", "{board3}", false), container);
    assert.equal(qsa(".board-cell", container).length, 2, "Computed template rendered");
    assert.deepEqual(fluid.tldraw.ai.diagnose(board3, true), [], "No problems diagnosed in corrected board");
    qsa(".board-cell", container)[1].dispatchEvent(new Event("click"));
    fluid.cell.stabilize();
    assert.deepEqual(board3.state.cells, [0, 1, 1], "Handler written in computed template invoked with its argument");
    assert.deepEqual(qsa(".board-disc", container).map(disc => disc.textContent), ["1", "1"], "Computed template rerendered");
    assert.deepEqual(fluid.tldraw.ai.diagnose(board3, true), [], "No problems diagnosed after play");
    board3.destroy();
    ["fluid.tests.tldrawAI.board1", "fluid.tests.tldrawAI.board2", "fluid.tests.tldrawAI.board3"].forEach(fluid.deleteLayer);
});

fluid.tests.tldrawAI.templates = {
    danglingText: () => "<div><span>@{missing.thing}</span></div>",
    danglingHandler: () => "<div><button @onclick=\"{self}.nothere(1)\">Go</button></div>",
    notMethod: () => "<div><button @onclick=\"{self}.count(1)\">Go</button></div>",
    malformed: () => "<div><span>Text</div><p>Lost",
    notMarkup: () => undefined,
    empty: () => "<div class=\"empty\"></div>",
    toggled: broken => broken ? "<div>@{nothing.here}</div>" : "<div>Fine</div>",
    interactive: moved => `<div class="frame"><div class="${moved ? "moved" : "cell"}" @onclick="{self}.count(1)"><span class="inner">x</span></div>`
        + "<div class=\"plain\">p</div><a class=\"link\">l</a></div>"
};

/**
 * Construct a widget whose template is computed by one of `fluid.tests.tldrawAI.templates`
 * @param {String} key - The key of the function computing the template
 * @param {Element} container - The container into which the widget renders
 * @return {fluid.component} The widget
 */
fluid.tests.tldrawAI.makeTemplated = function (key, container) {
    const layerName = "fluid.tests.tldrawAI.templated." + key;
    fluid.def(layerName, {
        $layers: "fluid.topLevelWidget",
        count: 0,
        state: {
            $reactiveRoot: {
                broken: false
            }
        },
        view: {
            $component: {
                $layers: "fluid.templateViewComponent",
                template: `$compute:fluid.tests.tldrawAI.templates.${key}({templated}.state.broken)`
            }
        }
    });
    // The context name of the layer is the last segment of its name, so it is supplied as a further layer
    fluid.def("fluid.tests.tldrawAI.templated", {$layers: layerName});
    const that = fluid.getGlobalValue("fluid.tests.tldrawAI.templated")({container});
    fluid.cell.stabilize();
    return that;
};

QUnit.test("Problems in templates which render nonetheless are diagnosed", function (assert) {
    const container = qs(".container");
    const diagnosed = key => {
        const that = fluid.tests.tldrawAI.makeTemplated(key, container);
        const problems = fluid.tldraw.ai.diagnose(that, true);
        that.destroy();
        return problems;
    };
    const danglingText = diagnosed("danglingText");
    assert.equal(danglingText.length, 1, "One problem in template text");
    assert.ok(danglingText[0].startsWith("The text \"@{missing.thing}\" in the template of view at path") &&
        danglingText[0].includes("has no member missing"), "Unresolved reference in text described");
    const danglingHandler = diagnosed("danglingHandler");
    assert.equal(danglingHandler.length, 1, "One problem in handler");
    assert.ok(danglingHandler[0].startsWith("The handler @onclick=\"{self}.nothere(1)\" in the template of view at path") &&
        danglingHandler[0].includes("has no member nothere"), "Handler designating missing method described before it is triggered");
    const notMethod = diagnosed("notMethod");
    assert.ok(notMethod.length === 1 && notMethod[0].endsWith("failed: {self}.count is not a method, but 0"), "Handler designating a value described");
    const malformed = diagnosed("malformed");
    assert.ok(malformed.some(problem => problem.includes("tag <span> has no matching end tag")), "Unclosed tag reported");
    assert.ok(malformed.some(problem => problem.includes("The template has 2 top-level nodes, but only the first is rendered")),
        "Unrendered top-level node reported");
    const notMarkup = diagnosed("notMarkup");
    assert.ok(notMarkup.length === 1 && notMarkup[0].includes("must be markup held as a String"), "Template which is not markup reported");
    const empty = diagnosed("empty");
    assert.equal(empty.length, 1, "One problem in widget rendering nothing");
    assert.ok(empty[0].includes("rendered without failure, but shows nothing") && empty[0].includes("class=\"empty\""),
        "Widget rendering nothing described, quoting its markup");
    fluid.deleteLayer("fluid.tests.tldrawAI.templated");
    Object.keys(fluid.tests.tldrawAI.templates).forEach(key => fluid.deleteLayer("fluid.tests.tldrawAI.templated." + key));
});

// A widget's own elements bound to pointer events by its template, e.g. the cells of a board, receive the gestures
// over them rather than tldraw, which would otherwise capture the pointer and suppress their clicks
QUnit.test("Pointer gestures over elements bound by a template received by the widget", function (assert) {
    const host = qs(".container");
    const container = document.createElement("div");
    host.appendChild(container);
    const that = fluid.tests.tldrawAI.makeTemplated("interactive", container);
    const isInteractive = selector => fluid.tldraw.isInteractiveTarget(qs(selector, host), host);
    assert.ok(fluid.hasBoundEvent(qs(".cell", host), ["click"]), "Handler bound by @onclick noted on its element");
    assert.notOk(fluid.hasBoundEvent(qs(".cell", host), ["keydown"]), "Other events not reported as bound");
    assert.ok(isInteractive(".cell"), "Element bound by @onclick receives gestures");
    assert.ok(isInteractive(".inner"), "Element within one bound by @onclick receives gestures");
    assert.ok(isInteractive(".link"), "Natively interactive element receives gestures");
    assert.notOk(isInteractive(".plain"), "Plain element leaves gestures to tldraw");
    assert.notOk(isInteractive(".frame"), "Widget's enclosing element leaves gestures to tldraw");
    that.state.broken = true;
    fluid.cell.stabilize();
    assert.ok(isInteractive(".moved"), "Element of rerendered template bound by @onclick receives gestures");
    that.destroy();
    fluid.deleteLayer("fluid.tests.tldrawAI.templated");
    fluid.deleteLayer("fluid.tests.tldrawAI.templated.interactive");
});

QUnit.test("Diagnosis of a widget kept up to date, and reported on a badge", async function (assert) {
    const container = qs(".container");
    const that = fluid.tests.tldrawAI.makeTemplated("toggled", container);
    const reports = [];
    const diagnosis = fluid.tldraw.ai.bindDiagnosis(that, problems => reports.push(problems));
    // The diagnosis is reported once the graph has settled, which is awaited here too, together with a further task
    const settled = () => fluid.tldraw.ai.awaitSettled().then(() => new Promise(resolve => setTimeout(resolve, 0)));
    fluid.cell.stabilize();
    await settled();
    assert.deepEqual(reports, [[]], "Sound widget's first diagnosis reported");
    that.state.broken = true;
    fluid.cell.stabilize();
    await settled();
    assert.equal(reports.length, 2, "Fresh diagnosis reported once widget broke");
    assert.ok(reports[1].length === 1 && reports[1][0].includes("@{nothing.here}"), "Problem in broken widget reported");
    that.state.broken = false;
    fluid.cell.stabilize();
    await settled();
    assert.deepEqual(reports[2], [], "Recovery reported");
    diagnosis.dispose();
    that.destroy();
    fluid.deleteLayer("fluid.tests.tldrawAI.templated");
    fluid.deleteLayer("fluid.tests.tldrawAI.templated.toggled");

    const holder = qs(".container2");
    const fixed = [];
    const options = {expand: false, onFix: problems => fixed.push(problems)};
    fluid.tldraw.renderProblemBadge(holder, ["First", "Second"], options);
    assert.equal(qs(".infusion-problem-count", holder).textContent, "⚠ 2 problems", "Badge counts problems");
    assert.notOk(qs(".infusion-problem-details", holder), "Problems not listed until badge clicked");
    assert.deepEqual([qs(".infusion-problem-arrow", holder).textContent, qs(".infusion-problem-toggle", holder).getAttribute("aria-expanded")],
        ["▾", "false"], "Badge discloses that its problems are hidden");
    qs(".infusion-problem-toggle", holder).dispatchEvent(new Event("click"));
    assert.deepEqual([qs(".infusion-problem-arrow", holder).textContent, qs(".infusion-problem-toggle", holder).getAttribute("aria-expanded")],
        ["▴", "true"], "Badge discloses that its problems are listed");
    assert.deepEqual(qsa(".infusion-problem", holder).map(li => li.textContent), ["First", "Second"], "Problems listed once badge clicked");
    qs(".infusion-problem-fix", holder).dispatchEvent(new Event("click"));
    assert.deepEqual(fixed, [["First", "Second"]], "Problems offered for fixing");
    fluid.tldraw.renderProblemBadge(holder, ["Second"], options);
    assert.equal(qs(".infusion-problem-count", holder).textContent, "⚠ 1 problem", "Badge counts fresh problems");
    assert.ok(qs(".infusion-problem-details", holder), "Problems still listed once rendered afresh");
    fluid.tldraw.renderProblemBadge(holder, [], options);
    assert.equal(holder.childNodes.length, 0, "Badge removed once there are no problems");
    fluid.tldraw.renderProblemBadge(holder, ["Third"], {expand: true, onFix: null});
    assert.ok(qs(".infusion-problem-details", holder) && !qs(".infusion-problem-fix", holder),
        "Problems listed at once when requested, without fixing where it is not possible");
    fluid.tldraw.renderProblemBadge(holder, [], options);
    assert.equal(fluid.tldraw.fixDirection("shape:a", "my.widget", ["First", "Second"]),
        "Please fix the widget shape:a (layer my.widget), in which these problems were found:\n* First\n* Second", "Direction to fix composed");
});

QUnit.test("Problems diagnosed in widgets transmitted with the workspace", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.tldrawAI.makeTemplated("danglingText", container);
    const workspace = fluid.tests.tldrawAI.makeWorkspace([{shapeId: "shape:broken", layerName: "fluid.tests.tldrawAI.templated",
        bounds: {x: 0, y: 0, w: 100, h: 100}, component: that}]);
    const parts = fluid.ptf.decode(fluid.tldraw.ai.workspaceToPTF(workspace));
    const component = parts.find(part => part.kind === "component");
    const problemsPart = component.parts.find(part => part.kind === "problems");
    assert.ok(problemsPart && problemsPart.body.startsWith("* The text \"@{missing.thing}\""), "Problems part transmitted for broken widget");
    const plan = fluid.tldraw.ai.planChanges([{kind: "component", filename: "shape:broken",
        parts: [fluid.tests.tldrawAI.jsonPart("live", "/", {count: 1}), problemsPart]}], ["shape:broken"], ["shape:broken"]);
    assert.deepEqual([plan.problems, plan.updates[0].parts.map(part => part.kind)], [[], ["live"]], "Problems part echoed back is ignored");
    that.destroy();
    fluid.deleteLayer("fluid.tests.tldrawAI.templated");
    fluid.deleteLayer("fluid.tests.tldrawAI.templated.danglingText");
    assert.ok(fluid.tldraw.ai.responseRules.includes("Never send a `problems` part yourself"), "AI told of problems parts");
});

QUnit.test("Widgets hosted within an error boundary report their errors on their badge", async function (assert) {
    fluid.def("fluid.tests.tldrawAI.canvasHost", {
        $layers: "fluid.errorBoundary",
        reportError: "$method:fluid.tldraw.reportWidgetError({0})"
    });
    const canvasHost = fluid.tests.tldrawAI.canvasHost();
    // Hosting elements as rendered by InfusionHost, holding a widget's container beside its badge
    const makeHostElement = function () {
        const hostElement = document.createElement("div");
        hostElement.className = "infusion-host";
        const container = document.createElement("div");
        const holder = document.createElement("div");
        hostElement.append(container, holder);
        qs(".container").appendChild(hostElement);
        return {hostElement, container, holder};
    };

    // A widget whose SFC was rejected for defining its template twice, which is constructed nonetheless
    const layerName = "fluid.tests.tldrawAI.board5";
    fluid.ptf.registerLayerPart({kind: "layer", contentType: "text/x-vue", filename: layerName,
        body: fluid.tests.tldrawAI.boardSFC(layerName, "{board5}", true)});
    const layerUnavailable = await fluid.tldraw.ai.awaitLayer(layerName);
    assert.ok(fluid.isUnavailable(layerUnavailable), "Layer rejected");
    const {hostElement, container, holder} = makeHostElement();
    const reports = [];
    fluid.tldraw.problemReporters.set(hostElement, report => reports.push(report));
    const widget = fluid.initChildComponent(canvasHost, layerName, {view: {$component: {container, shapeId: "shape:board5"}}});
    fluid.cell.stabilize();
    assert.equal(fluid.ptf.componentToShadow(widget).parentShadow, fluid.ptf.componentToShadow(canvasHost), "Widget constructed within its host");
    assert.equal(reports.length, 1, "Failure of widget's layer reported to its host's reporter");
    assert.equal(container.childNodes.length, 0, "Failure not rendered in place within the widget");
    const diagnosed = [];
    const diagnosis = fluid.tldraw.ai.bindDiagnosis(widget, problems => diagnosed.push(problems));
    await fluid.tldraw.ai.awaitSettled();
    await new Promise(resolve => setTimeout(resolve, 0));
    fluid.tldraw.renderProblemBadge(holder, diagnosed[0], {expand: container.textContent.trim() === "", onFix: () => {}});
    assert.ok(qs(".infusion-problem", holder).textContent.startsWith("Component at path / failed: Error in SFC for " + layerName),
        "Failure listed on badge at once, at the widget's path relative to itself");
    assert.ok(qs(".infusion-problem-fix", holder), "Widget offered for fixing");
    diagnosis.refresh();
    await fluid.tldraw.ai.awaitSettled();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(diagnosed.length, 2, "Diagnosis reported once more on refreshing it, although it has not changed");
    diagnosis.dispose();
    fluid.destroyComponent(widget);
    fluid.tldraw.problemReporters.delete(hostElement);

    // An error arising outside any hosted widget is rendered in place
    const outside = document.createElement("div");
    qs(".container").appendChild(outside);
    fluid.tldraw.reportWidgetError({shadow: fluid.ptf.componentToShadow(canvasHost), container: outside, unavailable: fluid.unavailable("Outside")});
    assert.ok(qs(".fl-error", outside)?.textContent.includes("Outside"), "Error outside any widget rendered in place");

    canvasHost.destroy();
    fluid.deleteLayer(layerName);
    fluid.deleteLayer("fluid.tests.tldrawAI.canvasHost");
    qs(".container").replaceChildren();
});

QUnit.test("Paths within a widget are described relative to it", function (assert) {
    const relativise = text => fluid.tldraw.ai.relativisePaths(text, "tldrawHost-3.othello-12");
    assert.equal(relativise("Component at path tldrawHost-3.othello-12 failed"), "Component at path / failed", "Widget's own path");
    assert.equal(relativise("Component at path tldrawHost-3.othello-12.view.cell has no member state (at {tldrawHost-3.othello-12.view}.state.board)."),
        "Component at path /view/cell has no member state (at {/view}.state.board).", "Paths of subcomponents and sites");
    assert.equal(relativise("Component at path tldrawHost-3.othello-123 failed"), "Component at path tldrawHost-3.othello-123 failed",
        "Path of another widget sharing a prefix left alone");
});
