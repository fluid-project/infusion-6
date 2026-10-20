/* global QUnit */

"use strict";

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests.ptf");

QUnit.module("Fluid PTF Tests");

QUnit.config.reorder = false;

const qs = (sel, parent) => (parent || document).querySelector(sel);

/**
 * Load an SFC from text and await the definition of its layer.
 * @param {String} layerName - The name of the layer defined by the SFC
 * @param {String} text - The text of the SFC
 * @return {Promise<Boolean>} Resolves to `true` once the layer is defined
 */
fluid.tests.ptf.loadSFCText = function (layerName, text) {
    fluid.loadSFCText(layerName, text);
    const injDone = fluid.subscribeDocToInjections(layerName, document);
    return fluid.cell.waitFor(injDone).then(() => fluid.cell.settle()).then(() => !fluid.isUnavailable(fluid.def(layerName)));
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
    assert.deepEqual(fluid.def("fluid.tests.ptf.plain").$layers, ["fluid.component", "fluid.sfcLayer"], "Tag layer added to explicit $layers");
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
    assert.deepEqual(fluid.def("fluid.tests.ptf.derived").$layers, ["fluid.tests.ptf.plain", "fluid.sfcLayer"],
        "Tag layer follows SFC-derived parent layer");
    const derived = fluid.tests.ptf.derived();
    assert.notOk(fluid.isUnavailable(derived), "Component derived from SFC layer instantiates");
    assert.equal(derived.value, 2, "Member inherited from SFC parent layer");
    assert.equal(derived.extra, 3, "Own member of derived SFC layer");
    derived.destroy();

    // An empty definition with a template requires $layers, and its view's $layers and templateLayer, to be patched in
    const emptySFC = `<script>
fluid.def("fluid.tests.ptf.empty", {});
</script>
<template><div class="ptf-empty">Empty</div></template>`;
    const emptyLoaded = await fluid.tests.ptf.loadSFCText("fluid.tests.ptf.empty", emptySFC);
    assert.ok(emptyLoaded, "SFC with empty definition loaded");
    assert.deepEqual(fluid.def("fluid.tests.ptf.empty"), {
        $layers: ["fluid.component", "fluid.sfcLayer"],
        view: {
            $component: {
                $layers: ["fluid.sfcTemplateViewComponent"],
                templateLayer: "fluid.tests.ptf.empty"
            }
        }
    }, "Empty definition patched with $layers and its view's $layers and templateLayer");

    // A definition which already configures its view has its templateLayer patched in alongside its own members
    const viewSFC = `<script>
fluid.def("fluid.tests.ptf.ownView", {
    view: {
        $component: {
            elideParent: false
        }
    }
});
</script>
<template><div class="ptf-own-view">Own view</div></template>`;
    const viewLoaded = await fluid.tests.ptf.loadSFCText("fluid.tests.ptf.ownView", viewSFC);
    assert.ok(viewLoaded, "SFC with view configuration loaded");
    assert.deepEqual(fluid.def("fluid.tests.ptf.ownView").view.$component, {
        $layers: ["fluid.sfcTemplateViewComponent"],
        elideParent: false,
        templateLayer: "fluid.tests.ptf.ownView"
    }, "Existing view configuration patched with its $layers and templateLayer");

    const counterLoaded = await fluid.tests.ptf.loadSFCText("fluid.tests.ptf.counter", fluid.tests.ptf.counterSFC);
    assert.ok(counterLoaded, "Counter SFC loaded");
    assert.deepEqual(fluid.def("fluid.tests.ptf.counter").$layers, ["fluid.component", "fluid.sfcLayer"],
        "Tag layer added to component");
    assert.deepEqual(fluid.def("fluid.tests.ptf.counter").view.$component.$layers, ["fluid.sfcTemplateViewComponent"],
        "Template layer added to component's view");
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
    const {that: copy, unresolved} = await fluid.ptf.instantiate(text, {potentia: {container: target}});
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
    const {that: copy, unresolved} = await fluid.ptf.instantiate(text);
    assert.deepEqual(unresolved, [], "All parts applied");
    assert.deepEqual(copy.extra, {deep: [1, 2]}, "User potentia reconstructed");
    assert.equal(copy.child.value, 5, "Subcomponent live state reconstructed");
    assert.equal(copy.child.doubled, 10, "Transmitted function in JavaScript layer operates");
    that.destroy();
    copy.destroy();
});

QUnit.test("Component injecting its grandparent transmitted and reconstructed - fluid-project/infusion-6#20", async function (assert) {
    fluid.def("fluid.tests.ptf.loader", {
        $layers: "fluid.component",
        value: "loader",
        panel: {
            $component: {
                $layers: "fluid.component",
                filter: {
                    $component: {
                        $layers: "fluid.component",
                        filterRoot: "{loader}",
                        loaderValue: "{filterRoot}.value"
                    }
                }
            }
        }
    });
    const that = fluid.tests.ptf.loader();
    fluid.cell.stabilize();
    assert.ok(that.panel.filter.filterRoot === that, "Grandparent injected into source component");

    const parts = fluid.ptf.componentToParts(that);
    assert.deepEqual(parts.map(part => [part.kind, part.filename]), [
        ["layer", "fluid.tests.ptf.loader"],
        ["potentia", "/"]
    ], "Injected grandparent is not traversed again when assembling parts");

    // Destroy the source and erase its definition so that reconstruction must register it afresh from the document
    const text = fluid.ptf.componentToPTF(that);
    that.destroy();
    fluid.deleteLayer("fluid.tests.ptf.loader");
    assert.ok(fluid.isUnavailable(fluid.readLayer("fluid.tests.ptf.loader").get()), "Definition erased from the registry");

    const {that: copy, unresolved} = await fluid.ptf.instantiate(text);
    assert.deepEqual(unresolved, [], "All parts applied");
    assert.notOk(fluid.isUnavailable(fluid.readLayer("fluid.tests.ptf.loader").get()), "Transmitted definition registered");
    assert.ok(copy.panel.filter.filterRoot === copy, "Grandparent injected into reconstructed component");
    assert.equal(copy.panel.filter.loaderValue, "loader", "Injected grandparent resolves by its injected name");
    copy.destroy();
});

QUnit.test("Parts applied in place to an existing component, and construction deferring availability", async function (assert) {
    fluid.def("fluid.tests.ptf.inPlaceChild", {
        $layers: "fluid.component",
        value: 1
    });
    fluid.def("fluid.tests.ptf.inPlace", {
        $layers: "fluid.component",
        count: 0,
        text: "Original",
        child: {
            $component: {
                $layers: "fluid.tests.ptf.inPlaceChild"
            }
        }
    });
    const that = fluid.tests.ptf.inPlace();
    fluid.cell.stabilize();
    const parts = fluid.ptf.decode(fluid.ptf.encode([
        {kind: "potentia", contentType: "application/json", filename: "/", body: JSON.stringify({$layers: ["fluid.tests.ptf.other"]})},
        {kind: "potentia", contentType: "application/json", filename: "/extra", body: JSON.stringify({$layers: ["fluid.tests.ptf.inPlaceChild"], value: 7})},
        {kind: "live", contentType: "application/json", filename: "/", body: JSON.stringify({count: 3})},
        {kind: "live", contentType: "application/json", filename: "/child", body: JSON.stringify({value: 5})},
        {kind: "live", contentType: "application/json", filename: "/missing", body: JSON.stringify({value: 9})}
    ]));
    assert.ok(fluid.ptf.isRootPotentiaPart(parts[0]), "Potentia for / recognised as root potentia");
    assert.notOk(fluid.ptf.isRootPotentiaPart(parts[1]), "Potentia for subcomponent not recognised as root potentia");
    const unresolved = await fluid.ptf.applyParts(that, parts);
    assert.deepEqual(unresolved, ["/missing"], "Part for absent subcomponent reported as unresolved");
    assert.equal(that.count, 3, "Live part applied to existing component");
    assert.equal(that.text, "Original", "Unmentioned state of existing component retained");
    assert.equal(that.child.value, 5, "Live part applied to existing subcomponent");
    const extraShadow = fluid.ptf.resolveShadow(fluid.ptf.componentToShadow(that), ["extra"]);
    assert.equal(extraShadow.that.value, 7, "Fresh subcomponent created from potentia part");
    assert.deepEqual(fluid.deSignal(that.$layers), fluid.deSignal(fluid.tests.ptf.inPlace().$layers), "Root potentia ignored");

    // A component whose layer is not yet defined is returned by constructParts, unavailable
    const pendingParts = [
        {kind: "potentia", contentType: "application/json", filename: "/", body: JSON.stringify({$layers: ["fluid.tests.ptf.later"]})},
        {kind: "live", contentType: "application/json", filename: "/", body: JSON.stringify({count: 4})}
    ];
    const pending = fluid.ptf.constructParts(pendingParts);
    fluid.cell.stabilize();
    assert.ok(fluid.isUnavailable(fluid.ptf.componentToShadow(pending).availableInstance.get()), "Component of undefined layer constructed unavailable");
    const applied = fluid.ptf.applyParts(pending, pendingParts);
    fluid.def("fluid.tests.ptf.later", {
        $layers: "fluid.component",
        count: 0
    });
    assert.deepEqual(await applied, [], "Parts applied once layer defined");
    assert.equal(pending.count, 4, "Live part applied to component once available");

    assert.throws(() => fluid.ptf.constructParts([pendingParts[1]]), "Construction without root potentia throws");
    that.destroy();
    pending.destroy();
});
