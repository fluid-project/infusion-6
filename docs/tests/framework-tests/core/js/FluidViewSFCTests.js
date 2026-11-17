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

QUnit.test("Self-closing elements of injected symbols are closed, leaving those following them as their siblings", function (assert) {
    // As an icon whose dot follows its stroke, e.g. an exclamation mark - a parser reading the markup as HTML rather
    // than SVG leaves each self-closing element open, nesting what follows within it, where it doesn't render
    const symbolText = text => `<symbol id="fluid-tests-sfc-mark" viewBox="0 0 24 24"><path d="${text}"/><circle cx="12" cy="19" r="1"/></symbol>`;
    const nodeId = "fl-symbols-fluid.tests.sfcMark-0";
    const apply = text => fluid.symbolsInjectionStyles.literal.apply({dokkument: document, injRec: {text: symbolText(text), nodeId}},
        document.getElementById(nodeId));
    const check = function (d, message) {
        const symbol = document.getElementById("fluid-tests-sfc-mark");
        assert.deepEqual([...symbol.children].map(child => child.localName), ["path", "circle"], message + ": each element a child of the symbol");
        assert.equal(symbol.querySelector("path").children.length, 0, message + ": nothing nested within the self-closing path");
        assert.equal(symbol.querySelector("path").getAttribute("d"), d, message + ": content preserved");
        assert.ok([symbol, ...symbol.children].every(node => node.namespaceURI === fluid.svgNamespace), message + ": elements in the SVG namespace");
    };
    apply("M12 4v10");
    check("M12 4v10", "Fresh injection");
    const defs = document.getElementById(nodeId);
    apply("M12 3v11");
    assert.equal(document.getElementById(nodeId), defs, "Symbols node updated in place");
    check("M12 3v11", "Injection updated in place");
    defs.remove();
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

QUnit.test("Placeholders declared by an SFC, or registered, are resolved - FLUID-7032", async function (assert) {
    const layerName = "fluid.tests.sfc.placeholders";
    // The bytes 0, 1, 254 and 255, encoded as base64 and wrapped over lines
    const text = "<script>\nfluid.def(\"" + layerName + "\", {$layers: \"fluid.component\"});\n</script>\n"
        + "<placeholder name=\"binary\" type=\"application/octet-stream\" encoding=\"base64\">\n    AAH+\n    /w==\n</placeholder>\n"
        + "<placeholder name=\"inline\" type=\"application/json\">[{\"name\": \"Inline\"}]</placeholder>\n"
        + "<placeholder name=\"file\" src=\"data/records.json\"></placeholder>\n";
    fluid.registerSFCPlaceholders(fluid.parseHTMLToTree(text), layerName, text);
    assert.notOk(fluid.placeholderStore[layerName + "/file"], "Placeholder referring to a file rather than held inline is rejected");
    const bytes = new Uint8Array(await (await fetch(fluid.resolveUrl("placeholder://" + layerName + "/binary"))).arrayBuffer());
    assert.equal([...bytes].join(), "0,1,254,255", "Binary placeholder decoded from base64");
    const blobUrl = fluid.resolveUrl("placeholder://" + layerName + "/inline");
    assert.ok(blobUrl.startsWith("blob:"), "Placeholder held inline resolved to a Blob URL");
    assert.equal(fluid.resolveUrl("placeholder://" + layerName + "/inline"), blobUrl, "Blob URL allocated once");
    fluid.def("fluid.tests.sfc.placeholderReader", {
        $layers: ["fluid.jsonReader", "fluid.withPlaceholder"],
        url: "placeholder://" + layerName + "/inline"
    });
    const that = fluid.tests.sfc.placeholderReader();
    assert.ok(that.isPlaceholder, "Reader of a placeholder knows itself as such");
    // Compared as JSON, since under node the data is parsed in another realm than the test's
    assert.equal(JSON.stringify(await fluid.siteToPromise(that, "data")), "[{\"name\":\"Inline\"}]", "Inline placeholder fetched");
    that.destroy();

    fluid.registerPlaceholder(layerName, "inline", {text: "[{\"name\": \"Replaced\"}]"});
    assert.notEqual(fluid.resolveUrl("placeholder://" + layerName + "/inline"), blobUrl, "Replaced material is allocated a fresh Blob URL");

    assert.equal(fluid.resolveUrl("data/real.json"), "data/real.json", "URL of real data unchanged");
    assert.notOk(fluid.isPlaceholderUrl("data/real.json"), "URL of real data is not a placeholder's");

    // The SFC of a layer which is still loading may yet declare a placeholder - one parsed without declaring it may not
    const pendingLayer = "fluid.tests.sfc.placeholdersPending";
    const pending = fluid.resolveUrl("placeholder://" + pendingLayer + "/later");
    assert.ok(pending instanceof Promise, "Placeholder of a layer whose SFC is not yet parsed is awaited");
    fluid.registerPlaceholder(pendingLayer, "later", {text: "[]"});
    assert.ok((await pending).startsWith("blob:"), "Awaited placeholder resolved once declared");
    const rejected = fluid.resolveUrl("placeholder://" + pendingLayer + "/never");
    fluid.rejectPlaceholderWaiters(pendingLayer);
    await rejected.then(() => assert.ok(false, "Undeclared placeholder must not resolve"),
        error => assert.ok(/No material has been declared for placeholder placeholder:\/\/fluid\.tests\.sfc\.placeholdersPending\/never/.test(error.message),
            "Awaited placeholder which is never declared is rejected, with the declaration expected described"));
});
