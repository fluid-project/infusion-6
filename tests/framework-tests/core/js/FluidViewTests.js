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


fluid.def("fluid.tests.nestedNodeRender", {
    $layers: "fluid.templateViewComponent",
    text: "Initial value",
    template: `<div><div class="inner">{{text}}</div></div>`
});


QUnit.test("Basic dynamic rendering test", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.nestedNodeRender({container});
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

// Dynamic attribute test, attribute value drawn from signal

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

// Nested render test, one componenht within another

fluid.def("fluid.tests.nestedOuter", {
    $layers: "fluid.templateViewComponent",
    template: `<div class="outer"><div class="outerInner" v-id="inner"></div>`,
    inner: {
        $component: {
            $layers: "fluid.tests.nestedInner"
        }
    }
});

fluid.def("fluid.tests.nestedInner", {
    $layers: "fluid.templateViewComponent",
    template: `<div class="inner">Text from inner</div>`
});

QUnit.test("Nested render test", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.nestedOuter({container});
    const expected = {
        $tagName: "div",
        "class": "outer",
        $children: {
            $tagName: "div",
            "class": "outerInner",
            $children: {
                $tagName: "div",
                "class": "inner",
                $textContent: "Text from inner"
            }
        }
    };
    const root = container.firstElementChild;
    assert.assertNode(root, expected, "Initial render correct");

    const getParents = el => {
        const parents = [];
        while (el !== container) {
            parents.push(el);
            el = el.parentNode;
        }
        return parents;
    };
    const nodes1 = getParents(container.querySelector(".inner"));

    // Update the inner layer definition to include a new template
    fluid.def("fluid.tests.nestedInner", {
        $layers: "fluid.templateViewComponent",
        template: `<div class="inner">New brush</div>`
    });

    const newExpected = fluid.copy(expected);
    newExpected.$children.$children.$textContent = "New brush";
    assert.assertNode(root, newExpected, "Updated render correct");

    const nodes2 = getParents(container.querySelector(".inner"));

    assert.ok(nodes1.every((e, i) => e === nodes2[i]), "DOM nodes undisturbed");

    that.destroy();
});
