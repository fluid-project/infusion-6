/* global QUnit */

"use strict";

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests");

QUnit.module("Fluid View Tests");

fluid.def("fluid.tests.basicRender", {
    $layers: "fluid.templateViewComponent",
    text: "Initial value",
    template: "<div>@{text}</div>"
});

const qs = (sel, parent) => (parent || document).querySelector(sel);
const qsa = (sel, parent) => [...(parent || document).querySelectorAll(sel)];

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
    template: `<div><div class="inner">@{text}</div></div>`
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
    template: `<div><input value="@{text}"/></div>`
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
    template: `<div class="outer"><div class="outerInner" @id="inner"></div>`,
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
        template: `<div class="outer"><div class="newHandle" @id="inner"></div>`
    });

    const newExpected = fluid.copy(fluid.tests.nestedExpect);
    newExpected.$children["class"] = "newHandle";
    assert.assertNode(root, newExpected, "Updated render correct");

    const nodes2 = fluid.tests.getNodeParents(container, ".inner");

    assert.ok(nodes1.every((e, i) => e === nodes2[i]), "DOM nodes undisturbed");

    restoreDef();
    that.destroy();
});

fluid.def("fluid.tests.bindClick", {
    $layers: "fluid.templateViewComponent",
    value: 0,
    template: `<div><button @onclick="{self}.increment"/></div>`,
    increment: {
        $method: {
            args: "{self}",
            func: self => self.value++
        }
    }
});

QUnit.test("Basic click test", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.bindClick({container});

    assert.equal(that.value, 0, "Initial count 0");

    const button = qs("button", container);
    button.dispatchEvent(new MouseEvent("click"));

    assert.equal(that.value, 1, "Updated count 1");
});

fluid.tests.todos = [
    {
        "text": "Write some code",
        "completed": false
    },
    {
        "text": "Eat some food",
        "completed": true
    },
    {
        "text": "Sleep",
        "completed": false
    }
];

fluid.def("fluid.tests.todoItem", {
    $layers: "fluid.templateViewComponent",
    template:
        `<span class="todo tag is-large" @class="completed:@{completed}" @onclick="{todoList}.toggleItem({itemIndex})">
            @{text}<button class="delete is-small" @onclick="{todoList}.deleteItem({itemIndex})"></button>
        </span>`
});

fluid.def("fluid.tests.todoList", {
    $layers: "fluid.templateViewComponent",
    todos: fluid.tests.todos,
    template:
    `<div id="main">
        <section class="hero is-dark">
            <h1 class="title">Todo List</h1>
            <h2 class="subtitle">Get in charge of your life</h2>
        </section>
        <section class="section">
            <div @id="todoItems" class="section"></div>
        </section>
    </div>`,
    todoItems: {
        $component: {
            $layers: "fluid.tests.todoItem",
            $for: {
                source: "{todoList}.todos",
                value: "todo",
                key: "itemIndex"
            },
            text: "{todo}.text",
            completed: "{todo}.completed"
        }
    },
    toggleItem: {
        $method: {
            func: (todos, itemIndex) => {
                todos[itemIndex].completed = !todos[itemIndex].completed;
            },
            args: ["{self}.todos", "{0}:itemIndex"]
        }
    },
    deleteItem: {
        $method: {
            func: (todos, itemIndex) => {
                todos = todos.splice(itemIndex, 1);
            },
            args: ["{self}.todos", "{0}:itemIndex"]
        }
    }

});

QUnit.test("For rendering test", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.todoList({container});

    const items = that.todoItems.list;

    assert.equal(items.length, 3, "Component constructed for each todo");
    const modelTexts = fluid.tests.todos.map(todo => todo.text);
    const treeTexts = items.map(item => item.text);
    assert.deepEqual(treeTexts, modelTexts, "Correct texts for component tree items");
    const renderedTexts = qsa(".todo", container).map(element => element.innerText);
    assert.deepEqual(renderedTexts, modelTexts, "Correct texts for markup rendered items");

    const modelCompleted = fluid.tests.todos.map(todo => todo.completed);
    const treeCompleted = items.map(item => item.completed);

    assert.deepEqual(treeCompleted, modelCompleted, "Correct states for component tree items");

    const renderedCompleted = qsa(".todo", container).map(element => element.classList.contains("completed"));
    assert.deepEqual(renderedCompleted, modelCompleted, "Correct states for markup tree items");

});
