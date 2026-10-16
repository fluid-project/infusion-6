/* global QUnit */

"use strict";

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests.ptf");

QUnit.module("Fluid PTF Tests");

QUnit.config.reorder = false;

const qs = (sel, parent) => (parent || document).querySelector(sel);

/**
 * Poll until a predicate holds, stabilising the signal graph between polls.
 * @param {Function} predicate - A function returning `true` once the awaited condition holds.
 * @param {Number} [timeout=5000] - The maximum time in milliseconds to wait.
 * @return {Promise<Boolean>} Resolves to `true` once the predicate holds, or `false` on timeout.
 */
fluid.tests.ptf.waitFor = function (predicate, timeout = 5000) {
    const start = Date.now();
    return new Promise(resolve => {
        const poll = () => {
            fluid.cell.stabilize();
            if (predicate()) {
                resolve(true);
            } else if (Date.now() - start > timeout) {
                resolve(false);
            } else {
                setTimeout(poll, 10);
            }
        };
        poll();
    });
};

/**
 * Await the result of a promise, stabilising the signal graph while it is pending.
 * @param {Promise} promise - The promise to be awaited
 * @return {Promise} A promise for the same result
 */
fluid.tests.ptf.settle = function (promise) {
    let settled = false;
    const togo = promise.finally(() => {
        settled = true;
    });
    fluid.tests.ptf.waitFor(() => settled);
    return togo;
};

/**
 * Load an SFC from text and await the definition of its layer.
 * @param {String} layerName - The name of the layer defined by the SFC
 * @param {String} text - The text of the SFC
 * @return {Promise<Boolean>} Resolves to `true` once the layer is defined
 */
fluid.tests.ptf.loadSFCText = function (layerName, text) {
    fluid.loadSFCText(layerName, text);
    const injDone = fluid.subscribeDocToInjections(layerName, document);
    return fluid.tests.ptf.waitFor(() => injDone.get() === true && !fluid.isUnavailable(fluid.def(layerName)));
};

fluid.tests.ptf.counterSFC = `<script>
fluid.def("fluid.tests.ptf.counter", {
    text: "Initial text",
    count: 0,
    increment: {
        $method: {
            args: "{self}",
            func: self => self.count++
        }
    }
});
</script>
<template><div class="ptf-counter"><span class="ptf-text">@{text}</span><span class="ptf-count">@{count}</span></div></template>
`;

QUnit.test("Encode and decode round trip", function (assert) {
    const parts = [{
        kind: "layer",
        contentType: "text/javascript",
        filename: "fluid.tests.layer",
        body: "fluid.def(\"fluid.tests.layer\", {});\n"
    }, {
        kind: "potentia",
        contentType: "application/json",
        filename: "/",
        body: "{\"value\": \"--ptf-boundary-\"}\n"
    }];
    const text = fluid.ptf.encode(parts);
    assert.ok(fluid.ptf.isPTF(text), "Encoded text is recognised as PTF");
    assert.ok(text.startsWith("MIME-Version: 1.0\nContent-Type: multipart/mixed; boundary=\"ptf-boundary-"), "Encoded text begins with MIME headers");
    const decoded = fluid.ptf.decode(text);
    assert.deepEqual(decoded.map(({kind, contentType, filename, body}) => ({kind, contentType, filename, body})), parts, "Parts decoded");

    const crlf = fluid.ptf.decode(text.replace(/\n/g, "\r\n"));
    assert.deepEqual(crlf.map(part => part.body), parts.map(part => part.body), "CRLF document decoded to same bodies");
});

QUnit.test("Nested multipart round trip", function (assert) {
    const inner = [{kind: "potentia", contentType: "application/json", filename: "/", body: "{}"}];
    const text = fluid.ptf.encode([
        {kind: "tldraw", contentType: "application/json", filename: "content", body: "[1]"},
        {kind: "component", filename: "shape:a", parts: inner},
        {kind: "component", filename: "shape:b", parts: inner}
    ]);
    const decoded = fluid.ptf.decode(text);
    assert.equal(decoded.length, 3, "Three outer parts decoded");
    assert.equal(decoded[0].body, "[1]", "Plain part decoded");
    assert.equal(decoded[1].contentType, "multipart/mixed", "Nested part has multipart content type");
    assert.deepEqual(decoded.slice(1).map(part => part.filename), ["shape:a", "shape:b"], "Nested part filenames decoded");
    decoded.slice(1).forEach(part => {
        assert.deepEqual(part.parts.map(({kind, contentType, filename, body}) => ({kind, contentType, filename, body})), inner,
            "Nested parts decoded");
    });
});

QUnit.test("Decode hand-written document", function (assert) {
    const text = `MIME-Version: 1.0
Content-Type: multipart/mixed;
    boundary=simple

--simple
Content-Type: application/json
Content-Disposition: attachment; filename="/child"
Content-Description: Live

{"a": 1}
--simple--
Trailing epilogue
`;
    const decoded = fluid.ptf.decode(text);
    assert.equal(decoded.length, 1, "One part decoded across folded header and unquoted boundary");
    assert.equal(decoded[0].kind, "live", "Kind decoded from Content-Description");
    assert.equal(decoded[0].filename, "/child", "Filename decoded");
    assert.deepEqual(JSON.parse(decoded[0].body), {a: 1}, "Body decoded");
    assert.ok(!fluid.ptf.isPTF("<b>Some html</b>"), "Arbitrary text not recognised as PTF");
    assert.ok(fluid.isUnavailable(fluid.ptf.decode("Some text")), "Decoding arbitrary text produces unavailable value");
});

fluid.tests.ptf.globalFunc = function (a) {
    return a + 1;
};

QUnit.test("Layer rendering as JavaScript", function (assert) {
    const def = {
        $layers: "fluid.component",
        "quoted-key": [1, "two", null, {nested: true}],
        empty: {},
        arrow: x => x * 2,
        classic: function (x) {
            return x * 3;
        },
        shorthand(x) {
            return x * 4;
        }
    };
    const text = fluid.layerToJavaScript("fluid.tests.ptf.rendered", def);
    const captured = {};
    new Function("fluid", text)({
        def: (layerName, layer) => {
            captured[layerName] = layer;
        }
    });
    const rendered = captured["fluid.tests.ptf.rendered"];
    assert.deepEqual(rendered["quoted-key"], def["quoted-key"], "Array and quoted key rendered");
    assert.deepEqual(rendered.empty, {}, "Empty object rendered");
    assert.equal(rendered.$layers, "fluid.component", "String rendered");
    assert.equal(rendered.arrow(1), 2, "Arrow function rendered");
    assert.equal(rendered.classic(1), 3, "Function expression rendered");
    assert.equal(rendered.shorthand(1), 4, "Method shorthand rendered");
});

QUnit.test("Layer MIME types and SFC tag layer", async function (assert) {
    fluid.def("fluid.tests.ptf.jsLayer", {
        $layers: "fluid.component",
        value: 1
    });
    assert.equal(fluid.layerMimeType("fluid.tests.ptf.jsLayer"), "text/javascript", "JavaScript layer");
    assert.equal(fluid.layerMimeType("{fluid-tests-component-1}.value"), "application/json", "Live layer");

    // An SFC without template whose $layers is written explicitly, and after another member
    const plainSFC = `<script>
fluid.def("fluid.tests.ptf.plain", {
    value: 2,
    $layers: "fluid.component"
});
</script>`;
    const loaded = await fluid.tests.ptf.loadSFCText("fluid.tests.ptf.plain", plainSFC);
    assert.ok(loaded, "Plain SFC loaded");
    assert.deepEqual(fluid.def("fluid.tests.ptf.plain").$layers, ["fluid.component", "fluid.sfcViewComponent"], "Tag layer added to explicit $layers");
    assert.equal(fluid.def("fluid.tests.ptf.plain").value, 2, "Remainder of definition intact");
    assert.equal(fluid.layerMimeType("fluid.tests.ptf.plain"), "text/x-vue", "SFC layer without template");

    // An SFC whose layer derives from another SFC's layer - the tag layer must follow it to give a consistent C3 linearization
    const derivedSFC = `<script>
fluid.def("fluid.tests.ptf.derived", {
    $layers: "fluid.tests.ptf.plain",
    extra: 3
});
</script>`;
    const derivedLoaded = await fluid.tests.ptf.loadSFCText("fluid.tests.ptf.derived", derivedSFC);
    assert.ok(derivedLoaded, "Derived SFC loaded");
    assert.deepEqual(fluid.def("fluid.tests.ptf.derived").$layers, ["fluid.tests.ptf.plain", "fluid.sfcViewComponent"],
        "Tag layer follows SFC-derived parent layer");
    const derived = fluid.tests.ptf.derived();
    assert.notOk(fluid.isUnavailable(derived), "Component derived from SFC layer instantiates");
    assert.equal(derived.value, 2, "Member inherited from SFC parent layer");
    assert.equal(derived.extra, 3, "Own member of derived SFC layer");
    derived.destroy();

    // An empty definition with a template requires both $layers and templateLayer to be patched in
    const emptySFC = `<script>
fluid.def("fluid.tests.ptf.empty", {});
</script>
<template><div class="ptf-empty">Empty</div></template>`;
    const emptyLoaded = await fluid.tests.ptf.loadSFCText("fluid.tests.ptf.empty", emptySFC);
    assert.ok(emptyLoaded, "SFC with empty definition loaded");
    assert.deepEqual(fluid.def("fluid.tests.ptf.empty"), {
        $layers: ["fluid.sfcTemplateViewComponent", "fluid.sfcViewComponent"],
        templateLayer: "fluid.tests.ptf.empty"
    }, "Empty definition patched with $layers and templateLayer");

    const counterLoaded = await fluid.tests.ptf.loadSFCText("fluid.tests.ptf.counter", fluid.tests.ptf.counterSFC);
    assert.ok(counterLoaded, "Counter SFC loaded");
    assert.deepEqual(fluid.def("fluid.tests.ptf.counter").$layers, ["fluid.sfcTemplateViewComponent", "fluid.sfcViewComponent"],
        "Tag layer added alongside template layer");
    assert.equal(fluid.layerMimeType("fluid.tests.ptf.counter"), "text/x-vue", "SFC layer with template");
});

QUnit.test("SFC component transmitted and reconstructed", async function (assert) {
    const container = qs(".container");
    const that = fluid.tests.ptf.counter({container, text: "User text"});
    fluid.cell.stabilize();
    that.increment();
    fluid.cell.stabilize();
    assert.equal(qs(".ptf-count", container).textContent, "1", "Source component rendered updated count");

    const parts = fluid.ptf.componentToParts(that);
    assert.deepEqual(parts.map(part => [part.kind, part.filename, part.contentType]), [
        ["layer", "fluid.tests.ptf.counter", "text/x-vue"],
        ["potentia", "/", "application/json"],
        ["live", "/", "application/json"]
    ], "Expected parts assembled");
    assert.equal(parts[0].body, fluid.tests.ptf.counterSFC, "SFC text transmitted verbatim");
    assert.deepEqual(JSON.parse(parts[1].body), {$layers: ["fluid.tests.ptf.counter"], text: "User text"}, "User potentia transmitted without container");
    assert.deepEqual(JSON.parse(parts[2].body), {count: 1}, "Live layer transmitted");

    // Rename the layer throughout the document so that reconstruction must register it afresh
    const text = fluid.ptf.componentToPTF(that).replaceAll("fluid.tests.ptf.counter", "fluid.tests.ptf.counterCopy");
    const target = qs(".target-container");
    const {that: copy, unresolved} = await fluid.tests.ptf.settle(fluid.ptf.instantiate(text, {potentia: {container: target}}));
    assert.deepEqual(unresolved, [], "All parts applied");
    assert.equal(fluid.layerMimeType("fluid.tests.ptf.counterCopy"), "text/x-vue", "Transmitted layer registered as SFC");
    assert.equal(copy.text, "User text", "User potentia reconstructed");
    assert.equal(copy.count, 1, "Live state reconstructed");
    assert.equal(qs(".ptf-text", target).textContent, "User text", "Reconstructed component rendered text");
    assert.equal(qs(".ptf-count", target).textContent, "1", "Reconstructed component rendered count");
    copy.increment();
    fluid.cell.stabilize();
    assert.equal(qs(".ptf-count", target).textContent, "2", "Reconstructed component responds");
    assert.equal(that.count, 1, "Source component unaffected");
    that.destroy();
    copy.destroy();
});

QUnit.test("JavaScript component with subcomponent transmitted and reconstructed", async function (assert) {
    fluid.def("fluid.tests.ptf.jsChild", {
        $layers: "fluid.component",
        doubled: {
            $compute: {
                func: x => x * 2,
                args: "{self}.value"
            }
        }
    });
    fluid.def("fluid.tests.ptf.jsParent", {
        $layers: "fluid.component",
        child: {
            $component: {
                $layers: "fluid.tests.ptf.jsChild",
                value: 1
            }
        }
    });
    const that = fluid.tests.ptf.jsParent({extra: {deep: [1, 2]}});
    fluid.cell.stabilize();
    fluid.setForComponent(that.child, "value", 5);
    fluid.cell.stabilize();
    assert.equal(that.child.doubled, 10, "Source subcomponent updated");

    const parts = fluid.ptf.componentToParts(that);
    assert.deepEqual(parts.map(part => [part.kind, part.filename, part.contentType]), [
        ["layer", "fluid.tests.ptf.jsParent", "text/javascript"],
        ["layer", "fluid.tests.ptf.jsChild", "text/javascript"],
        ["potentia", "/", "application/json"],
        ["live", "/child", "application/json"]
    ], "Expected parts assembled for parent and subcomponent");

    const text = fluid.ptf.componentToPTF(that).replaceAll("fluid.tests.ptf.js", "fluid.tests.ptf.copied");
    const {that: copy, unresolved} = await fluid.tests.ptf.settle(fluid.ptf.instantiate(text));
    assert.deepEqual(unresolved, [], "All parts applied");
    assert.deepEqual(copy.extra, {deep: [1, 2]}, "User potentia reconstructed");
    assert.equal(copy.child.value, 5, "Subcomponent live state reconstructed");
    assert.equal(copy.child.doubled, 10, "Transmitted function in JavaScript layer operates");
    that.destroy();
    copy.destroy();
});
