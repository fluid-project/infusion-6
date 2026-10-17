/* global QUnit */

"use strict";

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests");

QUnit.module("Fluid View Tests");

QUnit.config.reorder = false;

QUnit.test("Layer name extraction test", function (assert) {
    const layerName = fluid.pathToLayerName("%todoApp/sfc/fluid-demos-todoApp.vue");
    assert.equal("fluid.demos.todoApp", layerName, "Layer name extracted");
});

fluid.def("fluid.tests.basicRender", {
    $layers: "fluid.templateViewComponent",
    text: "Initial value",
    template: "<div>@{text}</div>"
});

const qs =  (sel, parent) => (parent || document).querySelector(sel);
const qsa = (sel, parent) => [...(parent || document).querySelectorAll(sel)];


QUnit.test("Basic static rendering test", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.basicRender({container});
    fluid.cell.stabilize();

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
    fluid.cell.stabilize();

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
    fluid.cell.stabilize();

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
    fluid.cell.stabilize();

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
    fluid.cell.stabilize();

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
    fluid.cell.stabilize();

    const root = container;
    assert.assertNode(root, fluid.tests.nestedExpect, "Initial render correct");

    const nodes1 = fluid.tests.getNodeParents(container, ".inner");

    // Update the inner layer definition to include a new template
    const restoreDef = fluid.tests.updateRestoreDef("fluid.tests.nestedInner", {
        $layers: "fluid.templateViewComponent",
        elideParent: false,
        template: `<div class="inner">New brush</div>`
    });
    fluid.cell.stabilize();

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
    fluid.cell.stabilize();

    const root = container;
    assert.assertNode(root, fluid.tests.nestedExpect, "Initial render correct");

    const nodes1 = fluid.tests.getNodeParents(container, ".inner");

    const restoreDef = fluid.tests.updateRestoreDef("fluid.tests.nestedOuter", {
        $layers: "fluid.templateViewComponent",
        template: `<div class="outer"><div class="newHandle" @id="inner"></div>`
    });

    fluid.cell.stabilize();

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
    fluid.cell.stabilize();

    assert.equal(that.value, 0, "Initial count 0");

    const button = qs("button", container);
    button.dispatchEvent(new MouseEvent("click"));

    assert.equal(that.value, 1, "Updated count 1");
});

fluid.def("fluid.tests.multiClass", {
    $layers: "fluid.templateViewComponent",
    a: true,
    b: true,
    template: `<div><span class="base" @class="one:@{a},two:@{b},three:!@{a}">Text</span></div>`
});

fluid.tests.checkMultiClass = function (assert, container, expected, message) {
    fluid.cell.stabilize();
    const span = qs("span", container);
    const classAttr = span.getAttribute("class");
    assert.deepEqual([...span.classList].sort(), expected.sort(), `Correct classes: ${message}`);
    assert.equal(classAttr, classAttr.trim(), `No surrounding whitespace in class attribute: ${message}`);
    assert.notOk(classAttr.includes(","), `No comma in class attribute: ${message}`);
};

QUnit.test("Multiple simultaneous dynamic classes - fluid-project/infusion-6#11", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.multiClass({container});

    fluid.tests.checkMultiClass(assert, container, ["base", "one", "two"], "Both true");

    that.a = false;
    fluid.tests.checkMultiClass(assert, container, ["base", "two", "three"], "Only b true");

    that.b = false;
    fluid.tests.checkMultiClass(assert, container, ["base", "three"], "Both false");

    that.a = true;
    that.b = true;
    fluid.tests.checkMultiClass(assert, container, ["base", "one", "two"], "Both true again");

    that.destroy();
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
        `<span class="todo tag is-large" @class="completed:@{completed},is-info:!@{completed}" @onclick="{todoList}.toggleItem({self}.itemIndex)">
            @{text}<button class="delete is-small" @onclick.stop="{todoList}.deleteItem({self}.itemIndex)"></button>
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
                valueAs: "todo",
                keyAs: "itemIndex"
            },
            text: "{self}.todo.text",
            completed: "{self}.todo.completed"
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

fluid.tests.checkTodoRendering = function (assert, that, container, model, message) {
    fluid.cell.stabilize();

    const items = that.todoItems.list;
    assert.equal(items.length, model.length, `Correct component count: ${message}`);

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

    fluid.tests.checkTodoRendering(assert, that, container, fluid.tests.todos, "Initial");

    const newTodos = fluid.tests.todos.concat([{
        text: "Think about something",
        completed: false
    }]);

    that.todos = newTodos;
    fluid.tests.checkTodoRendering(assert, that, container, newTodos, "Add item");

    const twoDos = newTodos.slice(2, 4);

    that.todos = twoDos;
    fluid.tests.checkTodoRendering(assert, that, container, twoDos, "Update to 2 items");

    that.todos = [];
    fluid.tests.checkTodoRendering(assert, that, container, [], "Remove all items");

    const oneDo = [twoDos[1]];

    that.todos = oneDo;
    fluid.tests.checkTodoRendering(assert, that, container, oneDo, "Update to 1 item");
});

QUnit.test("Event triggering and user reactivity test - delete array element", function (assert) {
    const origTodos = fluid.copy(fluid.tests.todos);
    const container = qs(".container");
    const that = fluid.tests.todoList({container});
    fluid.cell.stabilize();

    const buttons = qsa("button", container);
    buttons[0].dispatchEvent(new MouseEvent("click"));

    assert.deepEqual(fluid.tests.todos, origTodos, "Original data uncorrupted");

    const twoDos = fluid.tests.todos.slice(1);

    fluid.tests.checkTodoRendering(assert, that, container, twoDos, "delete array element");
});

fluid.tests.checkDeepMutate = function (assert, index) {
    const origTodos = fluid.copy(fluid.tests.todos);
    const container = qs(".container");
    const that = fluid.tests.todoList({container});
    fluid.cell.stabilize();

    const rows = qsa("span", container);
    rows[index].dispatchEvent(new MouseEvent("click"));

    assert.deepEqual(fluid.tests.todos, origTodos, "Original data uncorrupted");

    const toggled = fluid.copy(fluid.tests.todos);
    toggled[index].completed = !toggled[index].completed;

    fluid.tests.checkTodoRendering(assert, that, container, toggled, `toggled index ${index}`);

    rows[index].dispatchEvent(new MouseEvent("click"));

    fluid.tests.checkTodoRendering(assert, that, container, fluid.tests.todos, `clicked index ${index}`);

    rows[index].dispatchEvent(new MouseEvent("click"));

    fluid.tests.checkTodoRendering(assert, that, container, toggled, `clicked index ${index} again`);
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
    fluid.cell.stabilize();
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
    fluid.cell.stabilize();

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
            container: "$compute:fluid.insertChildContainer(before, editButton, {self}.templateTree, {fullPageEditor}.renderedContainer)"
        }
    }
});

QUnit.test("Reference up through rendering effect", function (assert) {
    const container = qs(".container");
    fluid.tests.fullPageEditor({container, $layers: "fluid.selfTemplateRoot"});
    fluid.cell.stabilize();

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
    fluid.cell.stabilize();
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
    fluid.cell.stabilize();
    // Unfortunately we can't prevent allocation of the "outer container", even if there is no component
    assert.equal(container.innerHTML, "<div></div>", "Initial render correct");
    // The conditional component's container acquires a default id derived from its path whilst it is rendered
    const assigneeId = `fl-id-${that[fluid.metadataSymbol].path}.assignee`;

    that.enabled = true;
    fluid.cell.stabilize();
    assert.equal(container.innerHTML, `<div id="${assigneeId}" class="assignee"></div>`, "Conditional render correct");

    that.enabled = false;
    fluid.cell.stabilize();
    assert.equal(container.innerHTML, "<div></div>", "Restored initial render");

    that.enabled = true;
    fluid.cell.stabilize();
    assert.equal(container.innerHTML, `<div id="${assigneeId}" class="assignee"></div>`, "Conditional render correct 2");

    that.enabled = false;
    fluid.cell.stabilize();
    assert.equal(container.innerHTML, "<div></div>", "Restored initial render");
});

fluid.def("fluid.tests.longFormIf", {
    $layers: "fluid.templateViewComponent",
    distance: null,
    template: `<div @id="distanceLine"></div>`,
    elideParent: false,
    distanceLine: {
        $component: {
            $layers: "fluid.templateViewComponent",
            $if: {
                func: x => x !== null,
                args: "{longFormIf}.distance"
            },
            template: `<div class="distance">@{{longFormIf}.distance}</div>`
        }
    }
});

QUnit.test("Conditional rendering with long-form $if record - fluid-project/infusion-6#13", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.longFormIf({container});
    fluid.cell.stabilize();
    assert.equal(container.innerHTML, "<div></div>", "Initial render correct");
    const distanceId = `fl-id-${that[fluid.metadataSymbol].path}.distanceLine`;

    that.distance = 0;
    fluid.cell.stabilize();
    assert.equal(container.innerHTML, `<div id="${distanceId}" class="distance">0</div>`, "Falsy value accepted by condition renders");

    that.distance = 5;
    fluid.cell.stabilize();
    assert.equal(container.innerHTML, `<div id="${distanceId}" class="distance">5</div>`, "Updated value renders");

    that.distance = null;
    fluid.cell.stabilize();
    assert.equal(container.innerHTML, "<div></div>", "Restored initial render");
});

fluid.def("fluid.tests.containerIds", {
    $layers: "fluid.templateViewComponent",
    template: `<div class="outer"><div @id="plain"></div><div @id="identified"></div></div>`,
    plain: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="plain">Plain</div>`
        }
    },
    identified: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div id="own-id" class="identified">Own</div>`
        }
    }
});

QUnit.test("Rendered containers acquire default ids derived from component paths", function (assert) {
    const container = qs(".container");
    const presetId = container.id;
    const that = fluid.tests.containerIds({container});
    fluid.cell.stabilize();
    assert.ok(presetId, "Fixture container has an id of its own");
    assert.equal(container.id, presetId, "Existing id of container is preserved");
    assert.equal(qs(".plain", container).id, `fl-id-${that[fluid.metadataSymbol].path}.plain`, "Child container acquires id from component path");
    assert.equal(qs(".identified", container).id, "own-id", "Id specified in template takes precedence");
    that.destroy();

    container.removeAttribute("id");
    const that2 = fluid.tests.containerIds({container});
    fluid.cell.stabilize();
    assert.equal(container.id, `fl-id-${that2[fluid.metadataSymbol].path}`, "Root container without id acquires id from component path");
    that2.destroy();
    container.id = presetId;
});

fluid.def("fluid.tests.attrBinding", {
    $layers: "fluid.templateViewComponent",
    busy: false,
    text: "Initial",
    shout: "$compute:fluid.tests.attrBinding.shout({self}.text)",
    choice: "b",
    notes: "Some notes",
    done: false,
    state: {
        $reactiveRoot: {
            prompt: "Initial prompt"
        }
    },
    template: `<div>
        <input class="prompt" value="@{state.prompt}"/>
        <button disabled="@{busy}" aria-pressed="@{busy}" title="Busy: @{busy}">Go</button>
        <input class="text" value="@{text}"/>
        <input class="shout" value="@{shout}"/>
        <input class="done" type="checkbox" checked="@{done}"/>
        <textarea value="@{notes}"></textarea>
        <select value="@{choice}"><option value="a">A</option><option value="b">B</option></select>
    </div>`
});

fluid.tests.attrBinding.shout = text => text.toUpperCase();

QUnit.test("Binding attributes and live state properties - fluid-project/infusion-6#14", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.attrBinding({container});
    fluid.cell.stabilize();
    const button = qs("button", container);
    assert.notOk(button.hasAttribute("disabled"), "Boolean attribute bound to false is absent");
    assert.equal(button.getAttribute("aria-pressed"), "false", "aria- attribute bound to false holds \"false\"");
    assert.equal(button.getAttribute("title"), "Busy: false", "Composite template renders as string");

    that.busy = true;
    fluid.cell.stabilize();
    assert.equal(button.getAttribute("disabled"), "", "Boolean attribute bound to true is present");
    assert.equal(button.getAttribute("aria-pressed"), "true", "aria- attribute bound to true holds \"true\"");

    that.busy = "false";
    fluid.cell.stabilize();
    assert.notOk(button.hasAttribute("disabled"), "Boolean attribute bound to \"false\" is absent");

    that.busy = null;
    fluid.cell.stabilize();
    assert.notOk(button.hasAttribute("aria-pressed"), "Attribute bound to null is absent");

    const input = qs(".text", container);
    assert.equal(input.getAttribute("value"), "Initial", "Initial value attribute rendered");
    assert.equal(input.value, "Initial", "Initial value property rendered");

    input.value = "Typed";
    input.dispatchEvent(new Event("input"));
    fluid.cell.stabilize();
    assert.equal(that.text, "Typed", "User input written back to model");
    assert.equal(input.getAttribute("value"), "Typed", "Value attribute materialises user input");

    const shout = qs(".shout", container);
    assert.equal(shout.value, "TYPED", "Computed value rendered into dependent input");
    shout.value = "Other";
    shout.dispatchEvent(new Event("input"));
    fluid.cell.stabilize();
    assert.equal(that.shout, "TYPED", "User input is not written back to a computed value");
    assert.equal(shout.getAttribute("value"), "Other", "Attribute bound to computed value rematerialised from user input");

    that.text = "";
    fluid.cell.stabilize();
    assert.equal(input.value, "", "Input cleared by setting model to empty string");
    assert.equal(input.getAttribute("value"), "", "Value attribute cleared");

    const done = qs(".done", container);
    assert.notOk(done.hasAttribute("checked"), "Unchecked checkbox has no checked attribute");
    that.done = true;
    fluid.cell.stabilize();
    assert.equal(done.getAttribute("checked"), "", "Checked checkbox has checked attribute");
    if ("checked" in done) { // linkedom does not implement the checked property
        assert.equal(done.checked, true, "Checked property set");
        done.checked = false;
        done.dispatchEvent(new Event("change"));
        fluid.cell.stabilize();
        assert.equal(that.done, false, "User unchecking written back to model");
        assert.notOk(done.hasAttribute("checked"), "Checked attribute removed following user unchecking");
    }

    const prompt = qs(".prompt", container);
    assert.equal(prompt.value, "Initial prompt", "Value rendered from reactive root");
    prompt.value = "Typed prompt";
    prompt.dispatchEvent(new Event("input"));
    fluid.cell.stabilize();
    assert.equal(that.state.prompt, "Typed prompt", "User input written back into reactive root");
    that.state.prompt = "";
    fluid.cell.stabilize();
    assert.equal(prompt.value, "", "Input bound into reactive root cleared from model");

    const textarea = qs("textarea", container);
    assert.equal(textarea.textContent, "Some notes", "Textarea value materialised as content");
    that.notes = "Other notes";
    fluid.cell.stabilize();
    assert.equal(textarea.value, "Other notes", "Textarea value updated");

    const options = qsa("option", container);
    assert.deepEqual(options.map(option => option.hasAttribute("selected")), [false, true], "Select value materialised onto options");
    that.choice = "a";
    fluid.cell.stabilize();
    assert.deepEqual(options.map(option => option.hasAttribute("selected")), [true, false], "Select value updated");
    assert.equal(qs("select", container).value, "a", "Select value property agrees");
});
