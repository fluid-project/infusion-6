/* global QUnit */

"use strict";

// Tests of the "Ask me anything" panel as any host imports it, with no host's code loaded - its machinery of conversing
// with a model, in fluid-ai.js, the assistant through which it converses, the marking of models served from renewable
// energy, and the attribution of the Inference Co-op whilst one of its models is chosen. Its use in Infusion's tldraw
// demo, whose assistant reflects on and alters the canvas, is tested in from-demos/TldrawAITests.js

fluid.registerNamespace("fluid.tests.askAnything");

QUnit.module("fluid.askAnything");

/**
 * Wait until a condition holds, settling the reactive graph meanwhile - e.g. whilst the panel's SFCs load
 * @param {Function} condition - Returns `true` once the condition holds
 * @param {Number} [timeout] - How long to wait, in ms
 * @return {Promise<Boolean>} Whether it came to hold
 */
fluid.tests.askAnything.waitUntil = async function (condition, timeout = 5000) {
    const deadline = Date.now() + timeout;
    fluid.cell.stabilize();
    while (!condition() && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
        fluid.cell.stabilize();
    }
    return condition();
};

/**
 * Load the panel's SFC, and construct a panel in the fixture with the endpoint and the search for a local service stubbed
 * @param {Object} [options] - Options for the panel
 * @return {Promise<Object>} `{that, container, calls, restore}` - the panel, its container, the calls made of the
 * endpoint, and a function restoring what was stubbed and destroying the panel
 */
fluid.tests.askAnything.makePanel = async function (options = {}) {
    await fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.askAnything", document));
    const originalCall = fluid.ai.callEndpoint;
    const originalFind = fluid.ai.findLocalService;
    const calls = [];
    fluid.ai.findLocalService = () => Promise.resolve(null);
    fluid.ai.callEndpoint = request => {
        calls.push({...request, messages: [...request.messages]});
        return Promise.resolve({content: "A **plain** reply", usage: {inputTokens: 20, outputTokens: 4}});
    };
    const container = document.querySelector(".container");
    const that = fluid.askAnything({container, ...options});
    fluid.cell.stabilize();
    const restore = function () {
        that.destroy();
        fluid.ai.callEndpoint = originalCall;
        fluid.ai.findLocalService = originalFind;
        fluid.askAnything.history = [];
        fluid.askAnything.writeStored("modelChoice", "");
    };
    return {that, container, calls, restore};
};

// The value of the dropdown's option choosing a model of the Inference Co-op
fluid.tests.askAnything.coopChoice = model => fluid.askAnything.coopPrefix + model;

QUnit.test("The panel is hosted with no host's code, and converses plainly with a model of the co-op", async function (assert) {
    const {that, container, calls, restore} = await fluid.tests.askAnything.makePanel();
    try {
        assert.equal(typeof(fluid.tldraw), "undefined", "Nothing of the tldraw demo is loaded");
        assert.equal(that.attribution, null, "No attribution whilst the IFM proxy's model is chosen");
        const attributionNode = container.querySelector(".ask-anything-attribution");
        assert.ok(attributionNode.classList.contains("ask-anything-hidden"), "No attribution shown");

        that.state.modelChoice = fluid.tests.askAnything.coopChoice("greenpt/glm-5.3-flash");
        fluid.cell.stabilize();
        assert.ok(that.hasToken, "A model of the co-op needs no token");
        // Only a real browser applies the panel's stylesheet - which must hide its elements before any entry is loaded
        if (typeof(window.getComputedStyle) === "function") {
            const login = container.querySelector(".ask-anything-login");
            assert.ok(login.classList.contains("ask-anything-hidden"), "The password is not asked for");
            assert.equal(window.getComputedStyle(login).display, "none", "And its form is hidden by the panel's own stylesheet");
        }
        assert.deepEqual(that.attribution, fluid.ai.coopService.attribution, "The co-op is attributed whilst its model is chosen");
        assert.notOk(attributionNode.classList.contains("ask-anything-hidden"), "Its attribution is shown in the panel");
        const link = attributionNode.querySelector("a");
        assert.equal(link.getAttribute("href"), "https://git.inference.coop/co-op/docs/src/branch/main/governance/terms-of-service.md#4-acceptable-use", "Linked to the co-op's Terms of Service");
        assert.equal(link.textContent, fluid.ai.coopService.attribution.linkText, "With the link's text");

        that.state.direction = "Hello";
        await that.send();
        assert.equal(calls.length, 1, "The endpoint is called once");
        assert.equal(calls[0].endpoint, fluid.ai.coopService.endpoint, "The co-op's endpoint is called");
        assert.equal(calls[0].model, "greenpt/glm-5.3-flash", "With the chosen model");
        assert.equal(calls[0].messages[0].content, fluid.askAnything.plainAssistant.systemPrompt(), "The plain assistant's prompt is sent");
        assert.equal(calls[0].messages[1].content, "Hello", "The direction follows it, as typed");
        const rendered = await fluid.tests.askAnything.waitUntil(() => !!container.querySelector(".ask-anything-entry strong"));
        assert.ok(rendered, "The reply is rendered as markdown");
        assert.equal(that.state.entries.find(entry => entry.kind === "metrics").outcome, "text", "Its outcome is measured as text");

        that.state.modelChoice = fluid.askAnything.ifmChoice;
        fluid.cell.stabilize();
        assert.ok(attributionNode.classList.contains("ask-anything-hidden"), "The attribution is withdrawn with the co-op's model");
    } finally {
        restore();
    }
});

QUnit.test("Models served from renewable energy are marked with a leaf", async function (assert) {
    const {that, container, restore} = await fluid.tests.askAnything.makePanel();
    try {
        const options = [...container.querySelectorAll(".ask-anything-model option")];
        const option = model => options.find(node => node.getAttribute("value") === fluid.tests.askAnything.coopChoice(model));
        [["greenpt/glm-5.3-flash", "GreenPT"], ["greenpt/deepseek-v4.1-flash", "GreenPT"], ["regolo/gemma4-31b", "Regolo"],
            ["regolo/mistral-small-4-119b", "Regolo"]].forEach(([model, provider]) => {
            assert.equal(option(model).textContent, model + " " + fluid.askAnything.leaf, model + " is marked with a leaf");
            assert.equal(option(model).getAttribute("title"), "Served from renewable energy by " + provider, "Which names its provider");
        });
        const leaf = container.querySelector(".ask-anything-leaf");
        assert.ok(leaf.classList.contains("ask-anything-hidden"), "No leaf beside the dropdown whilst the IFM proxy's model is chosen");
        that.state.modelChoice = fluid.tests.askAnything.coopChoice("greenpt/deepseek-v4.1-flash");
        fluid.cell.stabilize();
        assert.notOk(leaf.classList.contains("ask-anything-hidden"), "A leaf is shown beside the dropdown whilst a renewable model is chosen");
        assert.equal(leaf.querySelector("title").textContent, "Served from renewable energy by GreenPT", "Naming its provider");
        that.state.modelChoice = fluid.tests.askAnything.coopChoice("regolo/gemma4-31b");
        fluid.cell.stabilize();
        assert.notOk(leaf.classList.contains("ask-anything-hidden"), "And whilst one of Regolo's is chosen");
        assert.equal(leaf.querySelector("title").textContent, "Served from renewable energy by Regolo", "Naming Regolo");
        that.state.modelChoice = fluid.askAnything.ifmChoice;
        fluid.cell.stabilize();
        assert.ok(leaf.classList.contains("ask-anything-hidden"), "But not whilst the IFM proxy's is chosen again");
        assert.equal(options.find(node => node.getAttribute("value") === fluid.askAnything.ifmChoice).textContent, fluid.ai.defaultModel,
            "The IFM proxy's model is not marked");
    } finally {
        restore();
    }
});

QUnit.test("A host may show the attribution itself", async function (assert) {
    const {that, container, restore} = await fluid.tests.askAnything.makePanel({showAttribution: false});
    try {
        that.state.modelChoice = fluid.tests.askAnything.coopChoice("regolo/gemma4-31b");
        fluid.cell.stabilize();
        assert.deepEqual(that.attribution, fluid.ai.coopService.attribution, "The attribution is offered to the host");
        assert.ok(container.querySelector(".ask-anything-attribution").classList.contains("ask-anything-hidden"),
            "But not shown in the panel");
    } finally {
        restore();
    }
});

QUnit.test("An assistant named by the host is read as each direction is sent", async function (assert) {
    fluid.tests.askAnything.assistant = null;
    const {that, container, calls, restore} = await fluid.tests.askAnything.makePanel({assistant: "fluid.tests.askAnything.assistant"});
    try {
        that.state.modelChoice = fluid.tests.askAnything.coopChoice("greenpt/glm-5.3-flash");
        that.state.direction = "Too soon";
        await that.send();
        assert.equal(calls.length, 0, "Nothing is sent whilst the named assistant is not available");

        const interpreted = [];
        fluid.tests.askAnything.assistant = {
            systemPrompt: () => "THE HOST'S PROMPT",
            directionPreamble: "THE HOST'S PREAMBLE",
            interpret: async (content, context) => {
                interpreted.push({content, context});
                return {entries: [{kind: "assistant", text: "Interpreted by the host"}], problems: []};
            },
            describeOutcome: () => "host's outcome"
        };
        await that.send();
        assert.equal(calls.length, 1, "Sent once the assistant is available");
        assert.equal(calls[0].messages[0].content, "THE HOST'S PROMPT", "With the host's prompt");
        assert.equal(calls[0].messages[1].content, "THE HOST'S PREAMBLE\n\nToo soon", "And its preamble to the direction");
        assert.deepEqual(interpreted, [{content: "A **plain** reply", context: {model: "greenpt/glm-5.3-flash", direction: "Too soon"}}],
            "The host interprets the reply");
        const shown = await fluid.tests.askAnything.waitUntil(() => container.textContent.includes("Interpreted by the host"));
        assert.ok(shown, "And what it makes of it is shown");
        assert.equal(that.state.entries.find(entry => entry.kind === "metrics").outcome, "host's outcome", "As the host describes it");
    } finally {
        restore();
        fluid.tests.askAnything.assistant = null;
    }
});

/*** The protocol of an arena, with no host of its own - see fluid-ai-arena.js ***/

fluid.def("fluid.tests.askAnything.arenaCounter", {
    $layers: "fluid.component",
    state: {$reactiveRoot: {count: 0}}
});

fluid.def("fluid.tests.askAnything.arena", {
    $layers: "fluid.component",
    counter: {
        $component: {
            $layers: "fluid.tests.askAnything.arenaCounter"
        }
    }
});

// A prompt derived from Infusion's, merging a stanza of its own amongst Infusion's
fluid.def("fluid.tests.askAnything.prompt", {
    $layers: "fluid.ai.arena.systemPrompt",
    stanzas: {
        house: {order: 35, text: "## House rules\n\nCount carefully."}
    },
    docUrls: []
});

/**
 * Encode a PTF document of component parts, as the AI would send one
 * @param {Object<String, PTFPart[]>} components - The parts of each component part, by its filename
 * @return {String} The document
 */
fluid.tests.askAnything.ptfDocument = components => fluid.ptf.encode(Object.entries(components).map(([filename, parts]) =>
    ({kind: "component", filename, parts})), "A response");

fluid.tests.askAnything.jsonPart = (kind, filename, value) => ({kind, contentType: fluid.layerMimeTypes.json, filename, body: JSON.stringify(value)});

QUnit.test("An assistant alters an arena with no host of its own, through a prompt merging stanzas of its layers", async function (assert) {
    await fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.askAnything", document));
    const root = fluid.tests.askAnything.arena();
    fluid.cell.stabilize();
    const bridge = fluid.ai.arena.makeBridge(() => root, {availableLayers: () => ["fluid.tests.askAnything.arenaCounter"]});
    const assistant = fluid.ai.arena.makeAssistant(bridge, {promptLayer: "fluid.tests.askAnything.prompt", getDocs: () => Promise.resolve([])});
    try {
        const workspace = bridge.gatherWorkspace();
        assert.deepEqual(workspace.widgets.map(widget => [widget.id, widget.layerName]), [["counter", "fluid.tests.askAnything.arenaCounter"]],
            "The arena's widgets are the children of its root, by their member names");
        const prompt = await assistant.systemPrompt();
        const order = ["embedded in a page whose content is made of widgets", "## How to respond", "## House rules", "## Strategy hints",
            fluid.ai.arena.workspaceHeading, "filename=\"counter\""].map(fragment => prompt.indexOf(fragment));
        assert.notOk(order.includes(-1), "The prompt holds Infusion's stanzas, the derived layer's, and the workspace");
        assert.deepEqual([...order].sort((a, b) => a - b), order, "The derived layer's stanza is merged in its order");
        assert.notOk(/shape|canvas|tldraw/.test(prompt.substring(prompt.indexOf(fluid.ai.arena.workspaceHeading))),
            "The workspace is described with nothing of any host's");

        const response = fluid.tests.askAnything.ptfDocument({
            counter: [fluid.tests.askAnything.jsonPart("live", "/", {"state.count": 5})],
            "second-counter": [fluid.tests.askAnything.jsonPart("potentia", "/", {$layers: ["fluid.tests.askAnything.arenaCounter"]})]
        });
        const {entries, problems} = await assistant.interpret(response, {model: "m", direction: "Count"});
        assert.deepEqual(problems, [], "The response is applied without problems");
        assert.equal(root.counter.state.count, 5, "The existing widget is altered in place");
        assert.ok(fluid.ai.arena.widgetsOf(root).has("second-counter"), "A fresh widget is constructed as a child of the arena's root");
        assert.ok(entries[0].kind === "change" && entries[0].text.includes("Created widget"), "The change is reported to the user");

        const deleting = fluid.ptf.encode([{kind: "delete", filename: "counter", body: ""}], "A response");
        await assistant.interpret(deleting, {model: "m", direction: "Remove"});
        assert.deepEqual([...fluid.ai.arena.widgetsOf(root).keys()], ["second-counter"], "A widget is deleted by destroying it");
    } finally {
        root.destroy();
    }
});
