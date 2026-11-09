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
    const symbolsId = `fl-symbols-${layerName}-0`;
    assert.deepEqual(Object.keys(injRecs).sort(), [scriptId, styleId, symbolsId].sort(), "One script, one style and one symbols injection record");
    assert.equal(injRecs[symbolsId].variety, "symbols", "Symbols record has symbols variety");
    assert.ok(injRecs[symbolsId].text.startsWith("<symbol id=\"fluid-tests-sfc-chevron\""), "Symbols record holds the block's markup verbatim");
    assert.equal(injRecs[scriptId].variety, "script", "Script record has script variety");
    assert.equal(injRecs[styleId].variety, "style", "Style record has style variety");
    assert.ok(injRecs[scriptId].text.includes("sfcLayer"), "Script text patched with reference to its template");
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

QUnit.test("SFC symbols are injected into the shared SVG host", async function (assert) {
    const {rec} = await fluid.tests.sfc.load();
    const layerName = fluid.tests.sfc.layerName;
    const symbolsId = `fl-symbols-${layerName}-0`;

    const host = document.getElementById(fluid.symbolsHostId);
    assert.ok(host, "Symbols host created");
    assert.equal(host.localName, "svg", "Symbols host is an svg element");
    assert.equal(host.namespaceURI, fluid.svgNamespace, "Symbols host is in the SVG namespace");
    assert.equal(host.parentNode, document.body, "Symbols host is held in the body");
    assert.ok(fluid.isInjectedNode(host), "Symbols host is recognised as an injected node");

    const defs = document.getElementById(symbolsId);
    assert.equal(defs.parentNode, host, "Symbols of the SFC held in the host");
    assert.equal(defs.localName, "defs", "Symbols held in a defs element");
    const symbol = document.getElementById("fluid-tests-sfc-chevron");
    assert.ok(symbol, "Symbol is addressable by its id");
    assert.equal(symbol.localName, "symbol", "Symbol element injected");
    assert.equal(symbol.getAttribute("viewBox"), "0 0 16 16", "Symbol attributes preserved");
    assert.equal(symbol.querySelector("path").getAttribute("d"), "M6 3l5 5-5 5", "Symbol content preserved");

    // linkedom performs no layout, so only a real browser can show that a reference to the symbol draws it
    if (typeof(window.getComputedStyle) === "function") {
        const fixture = qs("#qunit-fixture");
        fixture.insertAdjacentHTML("beforeend", "<svg class=\"sfc-use\" width=\"16\" height=\"16\"><use href=\"#fluid-tests-sfc-chevron\"/></svg>");
        const bbox = qs(".sfc-use use", fixture).getBBox();
        assert.ok(bbox.width > 0 && bbox.height > 0, "Symbol drawn by a <use> referring to it");
    }

    // Editing the block alone updates the symbols in place, without re-executing the script
    const oldText = rec.textSignal.get();
    rec.textSignal.set(oldText.replace("M6 3l5 5-5 5", "M3 6l5 5 5-5"));
    await fluid.cell.settle();
    assert.equal(document.getElementById(symbolsId), defs, "Symbols node updated in place");
    assert.equal(document.querySelector("#fluid-tests-sfc-chevron path").getAttribute("d"), "M3 6l5 5 5-5", "Symbol content updated");
    assert.equal(document.querySelectorAll("#" + fluid.symbolsHostId).length, 1, "Still a single symbols host");
    assert.equal(fluid.tests.sfc.executions, 1, "Script not re-executed by edit to symbols");
    rec.textSignal.set(oldText);
    await fluid.cell.settle();
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

QUnit.test("SFC paths are resolved relative to the SFC", function (assert) {
    const sfcUrl = "http://example.org/app/sfc/my-component.vue";
    assert.equal(fluid.resolveSFCPath(sfcUrl, "my.css"), "http://example.org/app/sfc/my.css", "Sibling path resolved");
    assert.equal(fluid.resolveSFCPath(sfcUrl, "../lib/x.js"), "http://example.org/app/lib/x.js", "Parent-relative path resolved");
    assert.equal(fluid.resolveSFCPath(sfcUrl, "%infusion-6/x.js"), "%infusion-6/x.js", "Module-relative path unchanged");
    assert.equal(fluid.resolveSFCPath(sfcUrl, "https://cdn.org/x.js"), "https://cdn.org/x.js", "Absolute URL unchanged");
    assert.equal(fluid.resolveSFCPath(undefined, "my.css"), "my.css", "Path unchanged without SFC URL");
});

QUnit.test("SFC imports another SFC by a path relative to itself", async function (assert) {
    const parentUrl = new URL("../testData/sfc-import/fluid-tests-sfcImport-parent.vue", document.location.href).href;
    fluid.loadImportMap({"fluid.tests.sfcImport.parent": {path: parentUrl}});
    const container = qs(".container");
    container.innerHTML = "";
    // The parent's creator is defined only once its script has been injected
    await fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.tests.sfcImport.parent", document));
    const that = fluid.tests.sfcImport.parent({container});
    const childUrl = new URL("../testData/sfc-import/child/fluid-tests-sfcImport-child.vue", document.location.href).href;
    assert.equal(fluid.importMap["fluid.tests.sfcImport.child"]?.url, childUrl, "Child imported from path relative to parent");
    await fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.tests.sfcImport.child", document));
    await fluid.cell.settle();

    const childNode = qs(".sfc-import-parent .sfc-import-child", container);
    assert.ok(childNode, "Child SFC rendered within parent");
    assert.equal(childNode?.textContent, "Child text shared", "Child template bound, using a value from the shared script");
    assert.equal(fluid.tests.sfcImport.sharedRuns, 1, "Script shared by parent and child executed once");
    const clientScript = document.getElementById("fl-script-fluid.tests.sfcImport.parent-1");
    assert.ok(clientScript.hasAttribute("fluid-client"), "Script for the browser alone is recorded as such");
    assert.equal(window.fluidTestsClientLibRuns, fluid.hostEvaluatesClientScripts() ? 1 : undefined,
        "Script for the browser alone is evaluated only by a host which evaluates such scripts");
    const link = document.getElementById("fl-style-fluid.tests.sfcImport.child-0");
    assert.equal(link?.getAttribute("href"), new URL("child.css", childUrl).href, "Child's stylesheet resolved relative to the child");
    if (typeof(window.getComputedStyle) === "function") {
        assert.equal(window.getComputedStyle(childNode).color, "rgb(0, 128, 0)", "Child's stylesheet applied");
    }
    that.destroy();
});

QUnit.test("SFC defining its template twice is rejected", function (assert) {
    const layerName = "fluid.tests.sfc.twoTemplates";
    const script = "<script>\nfluid.def(\"" + layerName + "\", {\n    $layers: \"fluid.component\",\n    view: {\n        $component: {\n"
        + "            $layers: \"fluid.templateViewComponent\",\n            template: \"$compute:fluid.identity(<div>Computed</div>)\"\n"
        + "        }\n    }\n});\n</script>\n";
    const conflicting = fluid.parseHTMLToTree(script + "<template><div class=\"placeholder\"></div></template>");
    const sniFor = vTree => fluid.parseSFCScripts(fluid.querySelectorAll(vTree, "script"))[0];
    assert.ok(fluid.hasSFCTemplateConflict(conflicting, sniFor(conflicting), layerName), "Conflict detected");
    const withoutBlock = fluid.parseHTMLToTree(script);
    assert.notOk(fluid.hasSFCTemplateConflict(withoutBlock, sniFor(withoutBlock), layerName), "No conflict without <template> block");
    const injRecs = fluid.sfcToInjRecs(conflicting, layerName);
    assert.deepEqual(injRecs, {}, "Nothing injected from conflicting SFC");
    const unavailable = fluid.layerRecToUnavailable(fluid.readLayer(layerName).get());
    assert.ok(fluid.isUnavailable(unavailable) && unavailable.message === fluid.sfcTemplateConflictMessage(layerName),
        "Layer defined as unavailable, with the conflict described");
});
