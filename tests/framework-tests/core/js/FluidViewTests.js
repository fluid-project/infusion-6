/* global QUnit */

"use strict";

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests");

QUnit.module("Fluid View Tests");

fluid.def("fluid.tests.basicRender", {
    $layers: "fluid.templateViewComponent",
    text: "Initial value",
    template: "<div>{{text}}</div>"
});

const qs = sel => document.querySelector(sel);

QUnit.test("Basic static rendering test", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.basicRender({container});
    const expected = {
        $tagName: "div",
        $textContent: "Initial value"
    };

    assert.assertNode(container.firstElementChild, expected, "Initial render correct");
    that.destroy();
});


fluid.def("fluid.tests.nestedRender", {
    $layers: "fluid.templateViewComponent",
    text: "Initial value",
    template: `<div><div class="inner">{{text}}</div></div>`
});


QUnit.test("Basic dynamic rendering test", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.nestedRender({container});
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

fluid.def("fluid.tests.dynamicAttribute", {
    $layers: "fluid.templateViewComponent",
    text: "Initial value",
    template: `<div><input value="{{text}}"/></div>`
});

QUnit.test("Dynamic attribute test", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.dynamicAttribute({container});
    const expected = {
        $tagName: "div",
        $children: {
            $tagName: "input",
            "value": "Initial value"
        }
    };
    const root = container.firstElementChild;
    const inner = root.firstElementChild;
    assert.assertNode(root, expected, "Initial render correct");
    that.text = "Updated value";

    assert.equal(inner.getAttribute("value"), "Updated value", "Updated text content rendered");
    assert.equal(container.firstElementChild, root, "Rendered root undisturbed");
    assert.equal(root.firstElementChild, inner, "Inner node undisturbed");
    that.destroy();
    assert.equal(inner.getAttribute("value"), "Updated value", "Updated text content rendered");
});
