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

fluid.tests.nestedExpect = {
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

fluid.tests.getNodeParents = function (container, selector) {
    let el = container.querySelector(selector);
    const parents = [];
    while (el !== container) {
        parents.push(el);
        el = el.parentNode;
    }
    return parents;
};

/**
 * Updates the definition of a given layer and returns a function to restore the previous definition.
 *
 * @param {String} layerName - The name of the layer whose definition is to be updated.
 * @param {Object} def - The new definition to be assigned to the layer.
 * @return {Function} A function that, when called, restores the previous definition of the layer.
 */
fluid.tests.updateRestoreDef = function (layerName, def) {
    const oldDef = fluid.def(layerName);
    fluid.def(layerName, def);
    return () => {
        fluid.def(layerName, oldDef);
    };
};


QUnit.test("Nested render test - adapt inner", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.nestedOuter({container});

    const root = container.firstElementChild;
    assert.assertNode(root, fluid.tests.nestedExpect, "Initial render correct");

    const nodes1 = fluid.tests.getNodeParents(container, ".inner");

    // Update the inner layer definition to include a new template
    const restoreDef = fluid.tests.updateRestoreDef("fluid.tests.nestedInner", {
        $layers: "fluid.templateViewComponent",
        template: `<div class="inner">New brush</div>`
    });

    const newExpected = fluid.copy(fluid.tests.nestedExpect);
    newExpected.$children.$children.$textContent = "New brush";
    assert.assertNode(root, newExpected, "Updated render correct");

    const nodes2 = fluid.tests.getNodeParents(container, ".inner");

    assert.ok(nodes1.every((e, i) => e === nodes2[i]), "DOM nodes undisturbed");

    restoreDef();
    that.destroy();
});

QUnit.test("Nested render test - adapt outer", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.nestedOuter({container});

    const root = container.firstElementChild;
    assert.assertNode(root, fluid.tests.nestedExpect, "Initial render correct");

    const nodes1 = fluid.tests.getNodeParents(container, ".inner");

    const restoreDef = fluid.tests.updateRestoreDef("fluid.tests.nestedOuter", {
        $layers: "fluid.templateViewComponent",
        template: `<div class="outer"><div class="newHandle" v-id="inner"></div>`
    });

    const newExpected = fluid.copy(fluid.tests.nestedExpect);
    newExpected.$children["class"] = "newHandle";
    assert.assertNode(root, newExpected, "Updated render correct");

    const nodes2 = fluid.tests.getNodeParents(container, ".inner");

    assert.ok(nodes1.every((e, i) => e === nodes2[i]), "DOM nodes undisturbed");

    restoreDef();
    that.destroy();
});
