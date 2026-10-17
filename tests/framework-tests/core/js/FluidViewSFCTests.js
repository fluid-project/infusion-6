/* global QUnit */

"use strict";

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests.sfc");

QUnit.module("Fluid View SFC Tests");

QUnit.config.reorder = false;

// Incremented by the SFC's script block each time it is evaluated
fluid.tests.sfc.executions = 0;

fluid.tests.sfc.layerName = "fluid.tests.sfc.component";

// The SFC's template is kept on a single line so that its first child is the root element rather than a whitespace text node
fluid.tests.sfc.url = new URL("../testData/fluid-tests-sfc-component.vue", document.location.href).href;

const qs = (sel, parent) => (parent || document).querySelector(sel);

/**
 * Fetch and load the test SFC via `fluid.loadSFC`, and subscribe the current document to its injections. Loading
 * happens only once across all tests.
 * @return {Promise<Object>} A promise, resolving once injections are complete, for a record holding the SFC record `rec`
 * and the injection signal `injDone`.
 */
fluid.tests.sfc.load = function () {
    if (!fluid.tests.sfc.loadPromise) {
        const layerName = fluid.tests.sfc.layerName;
        const rec = fluid.loadSFC(layerName, fluid.tests.sfc.url);
        const injDone = fluid.subscribeDocToInjections(layerName, document);
        fluid.tests.sfc.loadPromise = fluid.cell.waitFor(injDone).then(() => ({rec, injDone}));
    }
    return fluid.tests.sfc.loadPromise;
};

QUnit.test("SFC parse produces injection records", async function (assert) {
    const {rec, injDone} = await fluid.tests.sfc.load();
    assert.equal(injDone.get(), true, "Injections completed");
    assert.equal(rec.loadCompletion.get(), true, "Load completion signalled");
    assert.equal(fluid.pathToLayerName(fluid.tests.sfc.url), fluid.tests.sfc.layerName, "Layer name agrees with SFC file name");
    assert.equal(typeof(rec.textSignal.get()), "string", "SFC text fetched");

    const layerName = fluid.tests.sfc.layerName;
    const injRecs = rec.injRecsSignal.get();
    const scriptId = `fl-script-${layerName}-0`;
    const styleId = `fl-style-${layerName}-0`;
    assert.deepEqual(Object.keys(injRecs).sort(), [scriptId, styleId].sort(), "One script and one style injection record");
    assert.equal(injRecs[scriptId].variety, "script", "Script record has script variety");
    assert.equal(injRecs[styleId].variety, "style", "Style record has style variety");
    assert.ok(injRecs[scriptId].text.includes("templateLayer"), "Script text patched with templateLayer");
    assert.ok(injRecs[scriptId].text.includes("fluid.sfcTemplateViewComponent"), "Script text patched with template layer");
    assert.ok(fluid.templateStore[layerName], "Parsed template written to template store");
});

QUnit.test("SFC injections are applied to the document", async function (assert) {
    await fluid.tests.sfc.load();
    const layerName = fluid.tests.sfc.layerName;

    const scriptNode = document.getElementById(`fl-script-${layerName}-0`);
    assert.ok(scriptNode, "Script node injected");
    assert.equal(scriptNode.localName, "script", "Injected script node is a script element");

    const styleNode = document.getElementById(`fl-style-${layerName}-0`);
    assert.ok(styleNode, "Style node injected");
    assert.equal(styleNode.localName, "style", "Injected style node is a style element");
    assert.ok(styleNode.textContent.includes(".fluid-tests-sfc .sfc-text"), "Style node holds the SFC's CSS");

    assert.equal(fluid.tests.sfc.executions, 1, "SFC script executed exactly once");
    assert.ok(fluid.def(layerName), "Layer defined by the SFC script");
});

QUnit.test("SFC script is not re-executed on repeated parse or subscription", async function (assert) {
    const {rec, injDone} = await fluid.tests.sfc.load();

    // Same text again - the parse effect should cull this
    rec.textSignal.set(rec.textSignal.get());
    await fluid.cell.settle();

    // Subscribing again should return the existing injection signal rather than allocating a fresh effect
    const injDone2 = fluid.subscribeDocToInjections(fluid.tests.sfc.layerName, document);
    assert.equal(injDone2, injDone, "Existing injection signal returned on resubscription");

    // Identical injection records - no element differs from those previously injected so nothing should be committed
    rec.injRecsSignal.set({...rec.injRecsSignal.get()});
    await fluid.cell.settle();

    assert.equal(fluid.tests.sfc.executions, 1, "SFC script still executed exactly once");
});

QUnit.test("Component instantiated from SFC layer renders and responds", async function (assert) {
    await fluid.tests.sfc.load();
    const container = qs(".container");
    const that = fluid.tests.sfc.component({container});
    fluid.cell.stabilize();

    const textNode = qs(".sfc-text", container);
    assert.ok(textNode, "Template from SFC rendered");
    assert.equal(textNode.textContent, "Initial SFC text", "Initial text rendered");
    assert.equal(qs(".sfc-count", container).textContent, "0", "Initial count rendered");

    // The linkedom mockup used to run this fixture under node implements no CSS cascade
    if (typeof(window.getComputedStyle) === "function") {
        const color = window.getComputedStyle(textNode).color;
        assert.equal(color, "rgb(255, 0, 0)", "CSS from SFC applied to rendered markup");
    }

    that.text = "Updated SFC text";
    fluid.cell.stabilize();
    assert.equal(textNode.textContent, "Updated SFC text", "Updated text rendered");
    assert.equal(qs(".sfc-text", container), textNode, "Text node undisturbed by update");

    qs(".sfc-button", container).dispatchEvent(new MouseEvent("click"));
    fluid.cell.stabilize();
    assert.equal(that.count, 1, "Click handler from SFC template invoked method");
    assert.equal(qs(".sfc-count", container).textContent, "1", "Updated count rendered");

    assert.equal(fluid.tests.sfc.executions, 1, "Instantiation did not re-execute SFC script");
    that.destroy();
});
