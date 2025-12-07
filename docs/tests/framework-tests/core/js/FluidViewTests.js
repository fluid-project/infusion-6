/* global QUnit */

"use strict";

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests");

QUnit.module("Fluid View Tests");

QUnit.test("Layer name extraction test", function (assert) {
    const layerName = fluid.pathToLayerName("%todoApp/sfc/fluid-demos-todoApp.vue");
    assert.equal("fluid.demos.todoApp", layerName, "Layer name extracted");
});

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
        $nodeValue: "Initial value"
    };

    assert.assertNode(container, expected, "Initial render correct");
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
            $nodeValue: "Initial value"
        }
    };
    const root = container;
    const inner = root.firstElementChild;
    assert.assertNode(root, expected, "Initial render correct");
    that.text = "Updated value";

    assert.equal(inner.childNodes[0].nodeValue, "Updated value", "Updated text content rendered");
    assert.equal(container, root, "Rendered root undisturbed");
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
    const root = container;
    const inner = root.firstElementChild;
    assert.assertNode(root, expected, "Initial render correct");
    that.text = "Updated value";

    assert.equal(inner.getAttribute("value"), "Updated value", "Updated text content rendered");
    assert.equal(container, root, "Rendered root undisturbed");
    assert.equal(root.firstElementChild, inner, "Inner node undisturbed");
    that.destroy();
    assert.equal(inner.getAttribute("value"), "Updated value", "Updated text content rendered");
});

// Nested render test, one component within another

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
    elideParent: false,
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
            $nodeValue: "Text from inner"
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

    const root = container;
    assert.assertNode(root, fluid.tests.nestedExpect, "Initial render correct");

    const nodes1 = fluid.tests.getNodeParents(container, ".inner");

    // Update the inner layer definition to include a new template
    const restoreDef = fluid.tests.updateRestoreDef("fluid.tests.nestedInner", {
        $layers: "fluid.templateViewComponent",
        elideParent: false,
        template: `<div class="inner">New brush</div>`
    });

    const newExpected = fluid.copy(fluid.tests.nestedExpect);
    newExpected.$children.$children.$nodeValue = "New brush";
    assert.assertNode(root, newExpected, "Updated render correct");

    const nodes2 = fluid.tests.getNodeParents(container, ".inner");

    assert.ok(nodes1.every((e, i) => e === nodes2[i]), "DOM nodes undisturbed");

    restoreDef();
    that.destroy();
});

QUnit.test("Nested render test - adapt outer", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.nestedOuter({container});

    const root = container;
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
    template: `<div><button @onclick="{self}.increment()"/></div>`,
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
        `<span class="todo tag is-large" @class="completed:@{completed},is-info:!@{completed}" @onclick="{todoList}.toggleItem({itemIndex})">
            @{text}<button class="delete is-small" @onclick.stop="{todoList}.deleteItem({itemIndex})"></button>
        </span>`
});

fluid.tests.todoKeyUp = function (e, todos) {
    if (e.key === "Enter") {
        const input = e.target;
        const newTodo = {text: input.value, completed: false};
        todos.push(newTodo);
        input.value = "";
    }
};

fluid.def("fluid.tests.todoList", {
    $layers: "fluid.templateViewComponent",
    todos: {
        $reactiveRoot: fluid.tests.todos
    },
    template:
    `<div id="main">
        <section class="hero is-dark">
            <h1 class="title">Todo List</h1>
            <h2 class="subtitle">Get in charge of your life</h2>
        </section>
        <section class="section">
            <input class="input is-rounded" @onkeyup="fluid.tests.todoKeyUp({0}, {todoList}.todos)" type="text" placeholder="New todo">
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

fluid.tests.checkTodoRendering = function (assert, that, container, model) {
    const items = that.todoItems.list;
    assert.equal(items.length, model.length, "Correct component count");

    const modelTexts = items.map(todo => todo.text);

    const treeTexts = items.map(item => item.text);
    assert.deepEqual(treeTexts, modelTexts, "Correct texts for component tree items");

    const renderedTexts = qsa(".todo", container).map(element => element.childNodes[0].nodeValue.trim());
    assert.deepEqual(renderedTexts, modelTexts, "Correct texts for markup rendered items");

    const modelCompleted = model.map(todo => todo.completed);
    const treeCompleted = items.map(item => item.completed);

    assert.deepEqual(treeCompleted, modelCompleted, "Correct states for component tree items");

    const renderedCompleted = qsa(".todo", container).map(element => element.classList.contains("completed"));
    assert.deepEqual(renderedCompleted, modelCompleted, "Correct completed states for markup tree items");

    const negCompleted = modelCompleted.map(state => !state);
    const renderedInfo = qsa(".todo", container).map(element => element.classList.contains("is-info"));
    assert.deepEqual(renderedInfo, negCompleted, "Correct is-info states for markup tree items");
};

QUnit.test("For rendering test", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.todoList({container});

    fluid.tests.checkTodoRendering(assert, that, container, fluid.tests.todos);

    const newTodos = fluid.tests.todos.concat([{
        text: "Think about something",
        completed: false
    }]);

    that.todos = newTodos;
    fluid.tests.checkTodoRendering(assert, that, container, newTodos);

    const twoDos = newTodos.slice(2, 4);

    that.todos = twoDos;
    fluid.tests.checkTodoRendering(assert, that, container, twoDos);

    that.todos = [];
    fluid.tests.checkTodoRendering(assert, that, container, []);

    const oneDo = [twoDos[1]];

    that.todos = oneDo;
    fluid.tests.checkTodoRendering(assert, that, container, oneDo);
});

QUnit.test("Event triggering and user reactivity test - delete array element", function (assert) {
    const origTodos = fluid.copy(fluid.tests.todos);
    const container = qs(".container");
    const that = fluid.tests.todoList({container});

    const buttons = qsa("button", container);
    buttons[0].dispatchEvent(new MouseEvent("click"));

    assert.deepEqual(fluid.tests.todos, origTodos, "Original data uncorrupted");

    const twoDos = fluid.tests.todos.slice(1);

    fluid.tests.checkTodoRendering(assert, that, container, twoDos);
});

fluid.tests.checkDeepMutate = function (assert, index) {
    const origTodos = fluid.copy(fluid.tests.todos);
    const container = qs(".container");
    const that = fluid.tests.todoList({container});

    const rows = qsa("span", container);
    rows[index].dispatchEvent(new MouseEvent("click"));

    assert.deepEqual(fluid.tests.todos, origTodos, "Original data uncorrupted");

    const toggled = fluid.copy(fluid.tests.todos);
    toggled[index].completed = !toggled[index].completed;

    fluid.tests.checkTodoRendering(assert, that, container, toggled);

    rows[index].dispatchEvent(new MouseEvent("click"));

    fluid.tests.checkTodoRendering(assert, that, container, fluid.tests.todos);

    rows[index].dispatchEvent(new MouseEvent("click"));

    fluid.tests.checkTodoRendering(assert, that, container, toggled);
};

QUnit.test("Event triggering and user reactivity test - deep mutate array element 0", function (assert) {
    fluid.tests.checkDeepMutate(assert, 0);
});

QUnit.test("Event triggering and user reactivity test - deep mutate array element 1", function (assert) {
    fluid.tests.checkDeepMutate(assert, 1);
});

QUnit.test("Event triggering and user reactivity test - deep mutate different", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.todoList({container});
    const toggled = fluid.copy(fluid.tests.todos);
    toggled[0].completed = !toggled[0].completed;
    toggled[1].completed = !toggled[1].completed;

    const rows = qsa("span", container);
    rows[0].dispatchEvent(new MouseEvent("click"));
    rows[1].dispatchEvent(new MouseEvent("click"));

    fluid.tests.checkTodoRendering(assert, that, container, toggled);
});

QUnit.test("Event triggering and user reactivity test - insert array element", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.todoList({container});
    const input = qs("input", container);
    input.value = "New item";
    input.dispatchEvent(new KeyboardEvent("keyup", {
        key: "Enter"
    }));
    const updated = fluid.tests.todos.concat([{
        text: "New item",
        completed: false
    }]);

    fluid.tests.checkTodoRendering(assert, that, container, updated);
});

fluid.def("fluid.tests.fullPageEditor", {
    $layers: "fluid.viewComponent",
    editButton: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<button style="position: fixed; top: 1em; right: 1em;">Edit</button>`,
            container: "$compute:fluid.insertChildContainer(before, editButton, {self}.template, {fullPageEditor}.renderedContainer)"
        }
    }
});

QUnit.test("Reference up through rendering effect", function (assert) {
    const container = qs(".container");
    fluid.tests.fullPageEditor({container});
    const button = qs("button", container);
    assert.ok(button, "Button has been rendered through effect");
});

fluid.def("fluid.tests.dynamicChild", {
    $layers: "fluid.templateViewComponent",
    template: `<div class="dynamic">Dynamic template</div>`
});

fluid.def("fluid.tests.dynamicLayerName", {
    $layers: "fluid.templateViewComponent",
    dynamicLayerName: "fluid.tests.dynamicChild",
    template: `<div @id="child"></div>`,
    elideParent: false,
    child: {
        $component: {
            $layers: ["fluid.templateViewComponent", "{self}.dynamicLayerName"],
            dynamicLayerName: "{dynamicLayerName}.dynamicLayerName",
            template: `<div>Static template</div>`
        }
    }
});

QUnit.test("Rendering content from dynamic layer", function (assert) {
    const container = qs(".container");
    fluid.tests.dynamicLayerName({container});
    const dynamic = qs(".dynamic", container);
    assert.ok(dynamic, "Dynamic content has been rendered");
});

fluid.def("fluid.tests.assigneeIf", {
    $layers: "fluid.templateViewComponent",
    enabled: false,
    template: `<div @id="assignee"></div>`,
    elideParent: false,
    assignee: {
        $component: {
            $layers: "fluid.templateViewComponent",
            $if: "{assigneeIf}.enabled",
            template: `<div class="assignee"></div>`
        }
    }
});

QUnit.test("Conditional rendering", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.assigneeIf({container});
    // Unfortunately we can't prevent allocation of the "outer container", even if there is no component
    assert.equal(container.innerHTML, "<div></div>", "Initial render correct");

    that.enabled = true;
    assert.equal(container.innerHTML, `<div class="assignee"></div>`, "Conditional render correct");

    that.enabled = false;
    assert.equal(container.innerHTML, "<div></div>", "Restored initial render");
});
