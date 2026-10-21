/* global QUnit, my */

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

    const messages = fluid.tldraw.ai.buildMessages(prompt, [{role: "user", content: "Earlier"}, {role: "assistant", content: "Reply"}], "Do it");
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
    assert.deepEqual(textHistory.map(message => message.role), ["user", "assistant"], "History records exchange");

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
    assert.deepEqual(calls[0].slice(1, 3), textHistory, "Earlier history sent");
    assert.ok(calls[1][calls[1].length - 1].content.includes("is not a valid PTF document"), "Decoding failure reported back to AI");
    assert.ok(calls[2][calls[2].length - 1].content.includes("The widget shape:a failed"), "Application problem reported back to AI");
    assert.deepEqual(entries.map(entry => entry.kind), ["problem", "change", "problem", "change"], "Repairs and changes reported to user");
    assert.equal(bridge.plans.length, 2, "Each decoded document applied");
    assert.deepEqual(bridge.plans[0].deletions, ["shape:note1"], "Plan derived from AI's document");
    assert.equal(history.length, textHistory.length + 6, "History records all messages of the exchange");

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
    assert.deepEqual(truncatedHistory[1], {role: "assistant", content: "I am still thinking about"},
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
    assert.deepEqual(reasonedHistory[1], {role: "assistant", content: "\nA counter", reasoning: "I see a counter"},
        "Reply and its reasoning retained for the history");
});

fluid.def("fluid.tests.tldrawAI.doubler", {
    $layers: "fluid.component",
    input: 0,
    doubled: "$compute:fluid.tests.tldrawAI.double({self}.input)"
});

fluid.tests.tldrawAI.double = x => x * 2;

// An umbrella composing the counter with a doubler, taking the counter's view as its own - fluid-project/infusion-6#20
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
    assert.equal(errors.length, 1, "One problem diagnosed");
    assert.ok(errors[0].includes(".child failed: Layer fluid.tests.tldrawAI.neverDefined is not defined"), "Undefined layer of subcomponent described");
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

QUnit.test("Markdown rendered safely - fluid-project/infusion-6#24", function (assert) {
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
    const calls = [];
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
        assert.ok(isHidden(".ask-anything-composer"), "No composer shown without token");

        that.state.token = "abc123";
        fluid.cell.stabilize();
        assert.ok(isHidden(".ask-anything-login"), "Password no longer requested once token is held");
        assert.notOk(isHidden(".ask-anything-composer"), "Composer shown once token is held");
        assert.ok(qs(".ask-anything-composer .ask-anything-button", container).hasAttribute("disabled"), "Send disabled without direction");

        that.state.direction = "What is on the *canvas*?";
        fluid.cell.stabilize();
        await that.send();
        fluid.cell.stabilize();
        assert.equal(calls.length, 1, "Endpoint called once");
        assert.equal(calls[0].token, "abc123", "Token presented to endpoint");
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
        assert.equal(qs(".ask-anything-model input", container).getAttribute("readonly"), "", "Model is read-only");
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
        fluid.tldraw.ai.bridge = undefined;
        fluid.demos.askAnything.history = [];
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

// Slop-free composition of the closest note finder with the image generator - fluid-project/infusion-6#25

// Stands in for fluid.demos.tldrawHost, bridging the notes on the canvas and the bounds of each widget's shape
fluid.def("fluid.tests.tldrawAI.tldrawHost", {
    $layers: ["fluid.resolveRoot", "fluid.component"],
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

QUnit.test("Further compositions chosen by the AI - fluid-project/infusion-6#25", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const container = qs(".container");
    const host = fluid.tests.tldrawAI.tldrawHost({notes: [{id: "shape:near", x: 120, y: 90, text: "A red fox"}]});

    const umbrella = fluid.tests.tldrawAI.visibleUmbrella(fluid.tldraw.hostPotentiaFor("fluid.tests.tldrawAI.visibleUmbrella", container, "shape:visible"));
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tldraw.ai.diagnose(umbrella, true), [], "No problems diagnosed in umbrella with a template of its own");
    assert.deepEqual({...umbrella.finder.hostBounds}, {x: 100, y: 100, w: 360, h: 460}, "Nested note finder takes the umbrella's bounds");
    assert.equal(qs(".notefinder-text", container).textContent, "A red fox", "Nested note finder shows the closest note");
    assert.equal(qs(".imagegen-input", container).value, "A red fox", "Nested image generator's prompt follows it");
    umbrella.destroy();

    const retemplated = fluid.tests.tldrawAI.retemplatedFinder(fluid.tldraw.hostPotentiaFor("fluid.tests.tldrawAI.retemplatedFinder", container, "shape:retemplated"));
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
    const that = my.ai.showsFoundResult(fluid.tldraw.hostPotentiaFor("my.ai.showsFoundResult", container, "shape:example"));
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tldraw.ai.diagnose(that, true), [], "No problems diagnosed in the example");
    assert.equal(qs(".shower input", container).value, "Found at 100", "Dominant widget's input drawn from supplier's output, which follows the widget's bounds");
    assert.equal(qsa(".finder, .finder-detail", container).length, 0, "Neither the supplier nor its subcomponents render");
    that.destroy();
    host.destroy();
});

QUnit.test("Closest note composed with image generator - fluid-project/infusion-6#25", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const originalFetch = fluid.demos.pixabay.fetch;
    const requests = fluid.tests.tldrawAI.fakePixabay(() => [fluid.tests.tldrawAI.pixabayHit(1, "https://pixabay.com/get/one.jpg")]);
    const container = qs(".container");
    try {
        const host = fluid.tests.tldrawAI.tldrawHost({
            notes: [{id: "shape:far", x: 900, y: 900, text: "A lighthouse"}, {id: "shape:near", x: 120, y: 90, text: "A red fox"}]
        });
        const potentia = fluid.tldraw.hostPotentiaFor("fluid.demos.ai.closestNoteImageGenerator", container, "shape:combined");
        const that = fluid.demos.ai.closestNoteImageGenerator(potentia);
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
        const {that: copy, unresolved} = await fluid.ptf.instantiate(text, {potentia: potentia});
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
        const umbrella = fluid.tests.tldrawAI.noteImageUmbrella(umbrellaPotentia);
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
