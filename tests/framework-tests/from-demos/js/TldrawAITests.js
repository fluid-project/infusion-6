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
    const order = ["You are an assistant", "DOC ONE", "DOC TWO", text.substring(0, 40), "fluid.demos.helloWorld", "shape:b - an Infusion widget",
        "## How to respond", "## Strategy hints"].map(fragment => prompt.indexOf(fragment));
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
    assert.equal(fluid.tldraw.ai.describeError(new Error("Thrown")), "Thrown", "Error described");
    that.destroy();
});

QUnit.test("Ask me anything panel converses through the bridge", async function (assert) {
    await fluid.tests.tldrawAI.loadImports();
    const container = qs(".container");
    const originalCall = fluid.tldraw.ai.callEndpoint;
    const originalFetch = fluid.tldraw.ai.fetchDocs;
    const calls = [];
    fluid.tldraw.ai.callEndpoint = options => {
        calls.push(options);
        return Promise.resolve("<think>Easy</think>There is nothing here yet");
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

        that.state.direction = "What is on the canvas?";
        fluid.cell.stabilize();
        await that.send();
        fluid.cell.stabilize();
        assert.equal(calls.length, 1, "Endpoint called once");
        assert.equal(calls[0].token, "abc123", "Token presented to endpoint");
        assert.equal(calls[0].model, fluid.tldraw.ai.defaultModel, "Default model requested");
        const rendered = qsa(".ask-anything-entry", container);
        assert.deepEqual(rendered.map(entry => qs(".ask-anything-entry-text", entry).textContent),
            ["What is on the canvas?", "There is nothing here yet"], "User's direction and AI's reply rendered");
        assert.ok(rendered[1].classList.contains("ask-anything-assistant"), "Reply rendered as assistant entry");
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
        that.destroy();
    } finally {
        fluid.tldraw.ai.callEndpoint = originalCall;
        fluid.tldraw.ai.fetchDocs = originalFetch;
        fluid.tldraw.ai.bridge = undefined;
        fluid.demos.askAnything.history = [];
    }
});
