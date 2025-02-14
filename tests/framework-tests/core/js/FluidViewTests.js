/* global QUnit */

"use strict";

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests");

QUnit.module("Fluid View Tests");

fluid.def("fluid.tests.basicRenderTest", {
    $layers: "fluid.templateViewComponent",
    text: "Initial value",
    template: "<div>{{text}}</div>"
});

const qs = sel => document.querySelector(sel);

QUnit.test("Basic dynamic rendering test", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.basicRenderTest({container});
    const expected = {
        $tagName: "div",
        $innerText: "Initial value"
    };

    assert.assertNode(container, expected, "Initial render correct");
    that.destroy();
});
