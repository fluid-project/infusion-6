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

    // fluid-project/infusion-6#24 - material preceding the document, e.g. a covering message, is tolerated
    const covered = "Here is my component, please paste it into your canvas:\r\n\r\n" + text.replace(/\n/g, "\r\n");
    assert.ok(fluid.ptf.isPTF(covered), "Document preceded by other material is recognised as PTF");
    assert.deepEqual(fluid.ptf.decode(covered).map(part => [part.kind, part.filename, part.body]),
        decoded.map(part => [part.kind, part.filename, part.body]), "Document preceded by other material decoded as before");
    assert.ok(!fluid.ptf.isPTF("MIME-Version: 1.0\nContent-Type: text/plain\n\nHello"), "Document which is not multipart not recognised");
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

    // An empty definition with a template requires $layers, and its view's $layers and template, to be patched in
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
                template: {sfcLayer: "fluid.tests.ptf.empty"}
            }
        }
    }, "Empty definition patched with $layers and its view's $layers and template");

    // A definition which already configures its view has its template patched in alongside its own members
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
        template: {sfcLayer: "fluid.tests.ptf.ownView"}
    }, "Existing view configuration patched with its $layers and template");

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

// fluid-project/infusion-6#24 - a host, e.g. the tldraw demo, may await the definition of a transmitted layer before
// constructing anything from it, so registering its part must define it without any component demanding it
QUnit.test("Transmitted SFC layer defined on registration", async function (assert) {
    const layerName = "fluid.tests.ptf.undemanded";
    const body = fluid.tests.ptf.counterSFC.replaceAll("fluid.tests.ptf.counter", layerName);
    fluid.ptf.registerLayerParts([{kind: "layer", contentType: "text/x-vue", filename: layerName, body}]);
    const docEffect = fluid.readSFC(layerName).docInjectEffects.get(document);
    assert.ok(docEffect, "SFC bound into the default document on registration");
    await fluid.cell.waitFor(docEffect.injDone);
    await fluid.cell.settle();
    assert.equal(fluid.layerRecToUnavailable(fluid.readLayer(layerName).get()), null, "Layer defined without being demanded");
});

QUnit.test("Text of a JavaScript layer part, including its free functions, transmitted verbatim", function (assert) {
    const layerName = "fluid.tests.ptf.jsWithFunctions";
    const plain = `fluid.def("${layerName}", {
    $layers: "fluid.component",
    total: "$compute:fluid.tests.ptf.jsWithFunctions.sum({self}.values)",
    values: [1, 2, 3]
});

// A free function referred to by name, which a rendering of the definition would lose
fluid.tests.ptf.jsWithFunctions.sum = values => values.reduce((a, b) => a + b, 0);
`;
    const provenance = {model: "test-model", prompt: "Sum\n  the values", datestamp: "2026-10-23T12:00:00.000Z"};
    const body = fluid.writeJSProvenance(plain, provenance);
    assert.ok(body.endsWith("// <provenance>\n//     <model>test-model</model>\n//     <prompt>Sum\n//   the values</prompt>\n"
        + "//     <datestamp>2026-10-23T12:00:00.000Z</datestamp>\n// </provenance>\n"), "Provenance written in line comments");
    assert.deepEqual(fluid.readJSProvenance(body), provenance, "Provenance read back from comments");
    const rewritten = fluid.writeJSProvenance(body, {model: "other-model"});
    assert.deepEqual(fluid.readJSProvenance(rewritten), {model: "other-model"}, "Provenance in comments replaced");
    assert.equal(rewritten.match(/<provenance>/g).length, 1, "Existing comments replaced rather than added to");
    assert.equal(fluid.readJSProvenance(plain), null, "No provenance read from layer without it");

    const part = {kind: "layer", contentType: "text/javascript", filename: layerName, body};
    assert.deepEqual(fluid.ptf.readLayerProvenance(part), provenance, "Provenance read from layer part by its type");
    fluid.ptf.registerLayerPart(part);
    const that = fluid.tests.ptf.jsWithFunctions();
    assert.equal(that.total, 6, "Layer registered with its free function");
    assert.deepEqual(fluid.ptf.layerToPart(layerName), part, "Layer transmitted as the text it was registered from");
    assert.equal(fluid.ptf.componentToParts(that)[0].body, body, "Text transmitted with component");
    assert.equal(fluid.ptf.layerSource(layerName).body, body, "Text recorded as the layer's source for its history");
    that.destroy();

    // Redefining the layer by other means renders it afresh from its definition
    fluid.def(layerName, {$layers: "fluid.component", values: [4]});
    const rendered = fluid.ptf.layerToPart(layerName).body;
    assert.ok(rendered.includes("values: [") && !rendered.includes(".sum ="), "Layer redefined directly rendered from its definition");
    fluid.deleteLayer(layerName);
});

QUnit.test("Provenance of an SFC written, read, and carried through its loading and transmission", async function (assert) {
    const layerName = "fluid.tests.ptf.provenanced";
    const plain = fluid.tests.ptf.counterSFC.replaceAll("fluid.tests.ptf.counter", layerName);
    assert.equal(fluid.readSFCProvenance(plain), null, "No provenance read from an SFC without a block");
    const provenance = {model: "test-model", prompt: "Make a <counter> & \"show\" it\nplease", datestamp: "2026-10-23T12:00:00.000Z"};
    const body = fluid.writeSFCProvenance(plain, provenance);
    assert.ok(body.startsWith(plain.trimEnd()), "Provenance block appended to the SFC's existing text");
    assert.ok(body.includes("<prompt>Make a &lt;counter&gt; &amp; \"show\" it\nplease</prompt>"), "Prompt escaped as text");
    assert.deepEqual(fluid.readSFCProvenance(body), provenance, "Provenance read back");
    const rewritten = fluid.writeSFCProvenance(body, {model: "other-model"});
    assert.deepEqual(fluid.readSFCProvenance(rewritten), {model: "other-model"}, "Provenance replaced, omitting absent fields");
    assert.equal(rewritten.match(/<provenance>/g).length, 1, "Existing block replaced rather than added to");

    const loaded = await fluid.tests.ptf.loadSFCText(layerName, body);
    assert.ok(loaded, "SFC holding a provenance block loaded");
    const container = qs(".container");
    const that = fluid.tests.ptf.provenanced({container, text: "Provenanced"});
    fluid.cell.stabilize();
    assert.equal(qs(".ptf-text", container).textContent, "Provenanced", "Component rendered from SFC holding a provenance block");
    assert.equal(container.querySelectorAll("provenance").length, 0, "Provenance block not rendered");
    const parts = fluid.ptf.componentToParts(that);
    assert.equal(parts[0].body, body, "SFC text including its provenance block transmitted verbatim");
    that.destroy();
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

QUnit.test("Layers transmitted with the most derived first", function (assert) {
    fluid.def("fluid.tests.ptf.base", {
        $layers: "fluid.component",
        value: 1
    });
    fluid.def("fluid.tests.ptf.middle", {
        $layers: "fluid.tests.ptf.base",
        middleValue: 2
    });
    fluid.def("fluid.tests.ptf.mixin", {
        $layers: "fluid.component",
        mixinValue: 3
    });
    fluid.def("fluid.tests.ptf.derived", {
        $layers: ["fluid.tests.ptf.middle", "fluid.tests.ptf.mixin"],
        child: {
            $component: {
                $layers: "fluid.tests.ptf.base"
            }
        },
        other: {
            $component: {
                $layers: "fluid.tests.ptf.unrelated"
            }
        }
    });
    fluid.def("fluid.tests.ptf.unrelated", {
        $layers: "fluid.component"
    });
    assert.deepEqual(fluid.ptf.sortLayerNames(["fluid.tests.ptf.base", "fluid.tests.ptf.unrelated", "fluid.tests.ptf.mixin",
        "fluid.tests.ptf.middle", "fluid.tests.ptf.derived"]),
    ["fluid.tests.ptf.unrelated", "fluid.tests.ptf.derived", "fluid.tests.ptf.mixin", "fluid.tests.ptf.middle", "fluid.tests.ptf.base"],
    "Each layer follows all those derived from it, those of equal rank in supplied order");

    const that = fluid.tests.ptf.derived();
    fluid.cell.stabilize();
    const layerNames = fluid.ptf.componentToParts(that).filter(part => part.kind === "layer").map(part => part.filename);
    assert.equal(layerNames[0], "fluid.tests.ptf.derived", "Layer of the transmitted component comes first");
    assert.equal(fluid.peek(layerNames), "fluid.tests.ptf.base", "Base layer, also used by a subcomponent, comes last");
    assert.ok(layerNames.indexOf("fluid.tests.ptf.middle") < layerNames.indexOf("fluid.tests.ptf.base"), "Intermediate layer precedes its base");
    assert.deepEqual([...layerNames].sort(), ["fluid.tests.ptf.base", "fluid.tests.ptf.derived", "fluid.tests.ptf.middle",
        "fluid.tests.ptf.mixin", "fluid.tests.ptf.unrelated"], "All user layers transmitted");
    that.destroy();
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

// Undoable histories of an arena, and their persistence

/**
 * Empty both of the arena's history stacks
 */
fluid.tests.ptf.clearHistories = function () {
    fluid.ptf.historyFromJSON(fluid.liveHistory, {records: [], index: 0});
    fluid.ptf.historyFromJSON(fluid.definitionHistory, {records: [], index: 0});
};

fluid.def("fluid.tests.ptf.historical", {
    $layers: "fluid.component",
    state: {
        $reactiveRoot: {
            count: 0
        }
    },
    notes: {
        $reactiveRoot: {
            label: "Initial"
        }
    },
    // A plain member, writes to which are not recorded
    label: "Initial"
});

QUnit.test("Live history of the arena stepped back and forward", function (assert) {
    fluid.tests.ptf.clearHistories();
    // Each write is a step of its own - coalescing of bursts of writes is tested below
    const originalWindow = fluid.ptf.burstWindow;
    fluid.ptf.burstWindow = -1;
    const that = fluid.tests.ptf.historical();
    fluid.cell.stabilize();
    assert.equal(fluid.liveHistory.canBack.get(), false, "Nothing to undo initially");
    that.state.count = 1;
    that.state.count = 2;
    that.notes.label = "Changed";
    that.label = "Plain";
    fluid.cell.stabilize();
    const records = fluid.liveHistory.records.get();
    assert.deepEqual(records.map(record => [record.type, record.records.length]), [["group", 1], ["group", 1], ["group", 1]], "Each write a step of its own");
    assert.deepEqual(records.map(({records: [record]}) => [record.oldValue, record.newValue]), [[{count: 0}, {count: 1}], [{count: 1}, {count: 2}], [{label: "Initial"}, {label: "Changed"}]],
        "Writes beneath reactive roots recorded, at the whole of each root, but not the write to a plain member");
    assert.ok(fluid.ptf.historyBack(fluid.liveHistory), "Stepped back");
    fluid.cell.stabilize();
    assert.equal(that.notes.label, "Initial", "Write beneath second reactive root undone");
    fluid.ptf.historyBack(fluid.liveHistory);
    fluid.cell.stabilize();
    assert.equal(that.state.count, 1, "Write beneath reactive root undone");
    assert.equal(fluid.liveHistory.records.get().length, 3, "Undoing records nothing further");
    fluid.ptf.historyForward(fluid.liveHistory);
    fluid.cell.stabilize();
    assert.equal(that.state.count, 2, "Write redone");
    assert.equal(fluid.liveHistory.canForward.get(), true, "Further write may be redone");

    that.state.count = 5;
    fluid.cell.stabilize();
    assert.equal(fluid.liveHistory.records.get().length, 3, "Fresh write discards the records stepped back through");
    assert.equal(fluid.liveHistory.canForward.get(), false, "Nothing to redo after fresh write");

    // Live parts applied from a PTF document are restored state, not fresh changes
    return fluid.ptf.applyParts(that, [{kind: "live", contentType: "application/json", filename: "/", body: JSON.stringify({label: "Applied"})}]).then(() => {
        assert.equal(that.label, "Applied", "Live part applied");
        assert.equal(fluid.liveHistory.records.get().length, 3, "Applied live part not recorded");

        // A component outside the arena is not recorded
        const originalContains = fluid.arenaContains;
        fluid.arenaContains = shadow => shadow !== fluid.ptf.componentToShadow(that);
        that.state.count = 6;
        fluid.arenaContains = originalContains;
        assert.equal(fluid.liveHistory.records.get().length, 3, "Write to component outside arena not recorded");

        that.destroy();
        fluid.cell.stabilize();
        assert.notOk(fluid.ptf.historyBack(fluid.liveHistory), "Records of destroyed component are stepped over");
        assert.equal(fluid.liveHistory.index.get(), 0, "Stepped back to beginning");
        fluid.tests.ptf.clearHistories();
        fluid.ptf.burstWindow = originalWindow;
    });
});

QUnit.test("Bursts of writes coalesced into single steps", async function (assert) {
    fluid.tests.ptf.clearHistories();
    const originalNow = fluid.ptf.now;
    let time = 1000;
    fluid.ptf.now = () => time;
    const that = fluid.tests.ptf.historical();
    const other = fluid.tests.ptf.historical();
    fluid.cell.stabilize();
    const steps = () => fluid.liveHistory.records.get().map(step => step.records.map(record => [record.oldValue, record.newValue]));
    try {
        // Writes in quick succession, e.g. keystrokes, form one step, with successive writes to one site folded together
        that.state.count = 1;
        time += 500;
        that.state.count = 2;
        time += 500;
        that.notes.label = "Typed";
        assert.deepEqual(steps(), [[[{count: 0}, {count: 2}], [{label: "Initial"}, {label: "Typed"}]]], "Burst of writes coalesced into one step");
        // A write to another component begins a step of its own
        other.state.count = 7;
        // As does a write after a pause
        time += 1000;
        that.state.count = 3;
        assert.equal(steps().length, 3, "Write to other component and write after pause begin fresh steps");

        // A gesture is a step of its own, extending until its promise settles, however long that takes
        let finish;
        const gestureResult = fluid.ptf.withinGesture(fluid.ptf.componentToShadow(that), () => {
            that.state.count = 4;
            return new Promise(resolve => finish = resolve);
        });
        time += 5000;
        that.notes.label = "During gesture";
        time += 5000;
        that.state.count = 5;
        finish("done");
        assert.equal(await gestureResult, "done", "Gesture's promise passed on");
        assert.deepEqual(fluid.peek(steps()), [[{count: 3}, {count: 4}], [{label: "Typed"}, {label: "During gesture"}], [{count: 4}, {count: 5}]],
            "Writes throughout gesture coalesced into one step");
        assert.equal(steps().length, 4, "Gesture began a step of its own, despite following within the window");
        that.notes.label = "After gesture";
        assert.equal(steps().length, 5, "Write after gesture has settled begins a fresh step");

        // Stepping back through a coalesced step undoes all of it
        fluid.ptf.historyBack(fluid.liveHistory);
        fluid.ptf.historyBack(fluid.liveHistory);
        fluid.cell.stabilize();
        assert.deepEqual([that.state.count, that.notes.label], [3, "Typed"], "Whole of gesture's step undone");
        fluid.ptf.historyForward(fluid.liveHistory);
        fluid.cell.stabilize();
        assert.deepEqual([that.state.count, that.notes.label], [5, "During gesture"], "Whole of gesture's step redone");
        // A write after stepping back does not extend the step before it
        that.state.count = 9;
        assert.deepEqual(fluid.peek(steps()), [[{count: 5}, {count: 9}]], "Write after stepping back begins a fresh step");
        assert.equal(steps().length, 5, "Step stepped back through discarded");

        // A gesture which does not return a promise ends at once
        fluid.ptf.withinGesture(fluid.ptf.componentToShadow(that), () => {
            that.state.count = 10;
        });
        assert.deepEqual(fluid.ptf.openGestures.size, 0, "Synchronous gesture ended");
    } finally {
        fluid.ptf.now = originalNow;
        that.destroy();
        other.destroy();
        fluid.tests.ptf.clearHistories();
    }
});

QUnit.test("Definition history of the arena stepped back and forward", async function (assert) {
    fluid.tests.ptf.clearHistories();
    fluid.def("fluid.tests.ptf.redefined", {$layers: "fluid.component", value: 1});
    assert.equal(fluid.definitionHistory.records.get().length, 0, "Initial definition is not a redefinition");
    fluid.def("fluid.tests.ptf.redefined", {$layers: "fluid.component", value: 2});
    const records = fluid.definitionHistory.records.get();
    assert.equal(records.length, 1, "Redefinition recorded");
    assert.equal(records[0].layerName, "fluid.tests.ptf.redefined", "Redefined layer recorded");
    assert.ok(records[0].oldSource.body.includes("value: 1") && records[0].newSource.body.includes("value: 2"), "Old and new sources recorded");
    fluid.ptf.historyBack(fluid.definitionHistory);
    assert.equal(fluid.def("fluid.tests.ptf.redefined").value, 1, "Redefinition undone");
    fluid.ptf.historyForward(fluid.definitionHistory);
    assert.equal(fluid.def("fluid.tests.ptf.redefined").value, 2, "Redefinition redone");
    assert.equal(fluid.definitionHistory.records.get().length, 1, "Stepping records nothing further");

    // An SFC is redefined asynchronously, and its source is its text, including its template
    const layerName = "fluid.tests.ptf.historicalSFC";
    const sfc = template => `<script>
fluid.def("${layerName}", {$layers: "fluid.component"});
</script>
<template><div class="historical">${template}</div></template>
`;
    await fluid.tests.ptf.loadSFCText(layerName, sfc("First"));
    assert.equal(fluid.definitionHistory.records.get().length, 1, "Loading SFC is not a redefinition");
    await fluid.tests.ptf.loadSFCText(layerName, sfc("Second"));
    const sfcRecord = fluid.peek(fluid.definitionHistory.records.get());
    assert.deepEqual([sfcRecord.layerName, sfcRecord.oldSource.body, sfcRecord.newSource.body], [layerName, sfc("First"), sfc("Second")],
        "Edit of SFC template recorded with its text");
    fluid.ptf.historyBack(fluid.definitionHistory);
    await fluid.cell.settle();
    assert.equal(fluid.readSFC(layerName).textSignal.get(), sfc("First"), "SFC edit undone");
    assert.equal(fluid.definitionHistory.records.get().length, 2, "Undoing SFC edit records nothing further");
    assert.equal(fluid.definitionHistory.index.get(), 1, "Positioned before undone edit");
    fluid.tests.ptf.clearHistories();
});

QUnit.test("Deletion of a layer recorded in the definition history - fluid-project/infusion-6#24", function (assert) {
    fluid.tests.ptf.clearHistories();
    fluid.def("fluid.tests.ptf.deleted", {$layers: "fluid.component", value: 3});
    fluid.deleteLayer("fluid.tests.ptf.deleted");
    const records = fluid.definitionHistory.records.get();
    assert.equal(records.length, 1, "Deletion recorded");
    assert.deepEqual([records[0].layerName, records[0].newSource], ["fluid.tests.ptf.deleted", null], "Deletion recorded with no new source");
    const isDefined = () => fluid.layerRecToUnavailable(fluid.readLayer("fluid.tests.ptf.deleted").get()) === null;
    assert.notOk(isDefined(), "Layer deleted");
    fluid.ptf.historyBack(fluid.definitionHistory);
    assert.equal(fluid.def("fluid.tests.ptf.deleted").value, 3, "Deletion undone");
    fluid.ptf.historyForward(fluid.definitionHistory);
    assert.notOk(isDefined(), "Deletion redone");
    assert.equal(fluid.definitionHistory.records.get().length, 1, "Stepping records nothing further");
    fluid.tests.ptf.clearHistories();
});

QUnit.test("Histories persisted and restored", function (assert) {
    const stack = fluid.ptf.makeHistoryStack("test", () => true);
    ["{a}.state", "{gone}.state", "{b}.state"].forEach((site, i) => fluid.ptf.pushToStack(stack, {type: "live", site, oldValue: i, newValue: {n: i + 1, f: () => {}}}));
    stack.index.set(2);
    const siteToRef = site => site === "{gone}.state" ? null : {name: site.substring(1, 2)};
    const persisted = fluid.ptf.historyToJSON(stack, record => fluid.ptf.encodeLiveRecord(record, siteToRef));
    assert.deepEqual(persisted, {
        records: [
            {type: "live", ref: {name: "a"}, oldValue: 0, newValue: {n: 1}},
            {type: "live", ref: {name: "b"}, oldValue: 2, newValue: {n: 3}}
        ],
        index: 1
    }, "Unpersistable record omitted, values made JSON-amenable and index adjusted");
    const restored = fluid.ptf.makeHistoryStack("restored", () => true);
    fluid.ptf.historyFromJSON(restored, JSON.parse(JSON.stringify(persisted)), record =>
        fluid.ptf.decodeLiveRecord(record, ref => ref.name === "a" ? "{a2}.state" : null));
    assert.deepEqual(restored.records.get(), [
        {type: "live", site: "{a2}.state", ref: {name: "a"}, oldValue: 0, newValue: {n: 1}},
        {type: "live", site: null, ref: {name: "b"}, oldValue: 2, newValue: {n: 3}}
    ], "Records restored at fresh sites, retaining their references even where these do not currently resolve");
    assert.equal(restored.index.get(), 1, "Index restored");
    // A record already holding a reference is persisted through it
    assert.deepEqual(fluid.ptf.encodeLiveRecord({type: "live", site: "{gone}.state", ref: {name: "kept"}, oldValue: 1, newValue: 2}, siteToRef).ref,
        {name: "kept"}, "Record persisted through its own reference");
});

QUnit.test("Persistence adapters", function (assert) {
    assert.equal(fluid.persistenceAdapter, fluid.emptyPersistenceAdapter, "Nothing is persisted by default");
    assert.equal(fluid.emptyPersistenceAdapter.load(), null, "Empty adapter loads nothing");
    const items = {};
    const storage = {
        getItem: key => items[key] ?? null,
        setItem: (key, value) => items[key] = value
    };
    const plain = fluid.makeLocalStoragePersistenceAdapter(storage, new URL("https://example.com/demo/tldraw/?other=1#frag"));
    assert.equal(plain.key, "infusion-arena:https://example.com/demo/tldraw/#0", "Arena id defaults to 0");
    assert.equal(plain.load(), null, "Nothing loaded initially");
    plain.save("Arena 0");
    const other = fluid.makeLocalStoragePersistenceAdapter(storage, new URL("https://example.com/demo/tldraw/?infusionArenaId=xyz"));
    assert.equal(other.key, "infusion-arena:https://example.com/demo/tldraw/#xyz", "Arena id read from URL parameter");
    assert.equal(other.load(), null, "Arenas are persisted separately");
    other.save("Arena xyz");
    assert.equal(plain.load(), "Arena 0", "Arena loaded");
    assert.equal(other.load(), "Arena xyz", "Other arena loaded");
    const broken = fluid.makeLocalStoragePersistenceAdapter({getItem: () => {
        throw new Error("Denied");
    }, setItem: () => {
        throw new Error("Full");
    }}, new URL("https://example.com/"));
    assert.equal(broken.load(), null, "Unavailable storage loads nothing");
    broken.save("Lost");
    assert.ok(true, "Failure to save does not throw");
});
