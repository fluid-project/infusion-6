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
        $textContent: "Initial value"
    };

    assert.assertNode(container.firstElementChild, expected, "Initial render correct");
    that.destroy();
});


fluid.def("fluid.tests.nestedRenderTest", {
    $layers: "fluid.templateViewComponent",
    text: "Initial value",
    template: `<div><div class="inner">{{text}}</div></div>`
});


QUnit.test("Basic dynamic rendering test", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.nestedRenderTest({container});
    const expected = {
        $tagName: "div",
        $children: {
            $tagName: "div",
            "class": "inner",
            $textContent: "Initial value"
        }
    };
    const root = container.firstElementChild;
    const inner = root.firstElementChild;
    assert.assertNode(root, expected, "Initial render correct");
    that.text = "Updated value";
    assert.equal(inner.textContent, "Updated value", "Updated text content rendered");
    assert.equal(container.firstElementChild, root, "Rendered root undisturbed");
    assert.equal(root.firstElementChild, inner, "Inner node undisturbed");
    that.destroy();
});
