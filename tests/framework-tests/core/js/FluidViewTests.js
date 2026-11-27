/* global QUnit, fluidTestsNamedAccess */

"use strict";

fluid.setLogging(true);

fluid.registerNamespace("fluid.tests");

QUnit.module("Fluid View Tests");

QUnit.config.reorder = false;

QUnit.test("Layer name extraction test", function (assert) {
    const layerName = fluid.pathToLayerName("%todoApp/sfc/fluid-demos-todoApp.vue");
    assert.equal("fluid.demos.todoApp", layerName, "Layer name extracted");
});

QUnit.test("A namespace is not rooted at an element sharing its name", function (assert) {
    // As when a page declares <fluid-module id="x"> for a module whose layers are named x.* - the browser's named
    // access makes window.x the element until a global x is defined
    const element = document.createElement("fluid-module");
    element.id = "fluidTestsNamedAccess";
    document.body.appendChild(element);
    fluid.def("fluidTestsNamedAccess.widget", {$layers: "fluid.component"});
    fluidTestsNamedAccess.widget.helper = () => 42;
    fluid.def("fluidTestsNamedAccess.other", {$layers: "fluid.component"});
    assert.notEqual(fluid.global.fluidTestsNamedAccess, element, "The namespace is a global of its own, not the element");
    assert.equal(fluid.invokeGlobalFunction("fluidTestsNamedAccess.widget.helper", []), 42,
        "A function of one layer's namespace survives the definition of another layer of the same root");
    element.remove();
});

fluid.def("fluid.tests.basicRender", {
    $layers: "fluid.component",
    text: "Initial value",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: "<div>@{text}</div>"
        }
    }
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


QUnit.test("Rendering machinery is hosted by a view subcomponent - FLUID-7019", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.basicRender({container});
    fluid.cell.stabilize();
    const shadow = that[fluid.metadataSymbol];

    assert.notOk(that.$layers.some(layerName => layerName !== "fluid.component" && layerName !== "fluid.tests.basicRender"),
        "Principal component has no view layers");
    assert.ok(fluid.hasLayer(that.view, "fluid.viewComponent"), "Principal component has a view subcomponent");
    ["container", "template", "templateTree", "elideParent", "vTree", "renderView", "renderedContainer"].forEach(member => {
        assert.equal(that[member], undefined, `View member ${member} is not a member of the principal component`);
    });
    assert.equal(that.view.template, "<div>@{text}</div>", "Template is configured on the view");
    assert.equal(that.view.vTree.children[0].text.get(), "Initial value", "Rendered tree is a member of the view, with references resolved against the principal");
    assert.equal(that.view.container, container, "Container supplied to the free creator function is forwarded to the view");
    assert.equal(that.view.renderedContainer, container, "View exposes its rendered container");
    assert.equal(fluid.renderedContainerFor(shadow), container, "Rendered container is retrievable from principal's shadow");
    assert.equal(fluid.shadowForElement(container), shadow, "Container is registered against the principal component");
    that.destroy();
});

fluid.def("fluid.tests.nestedNodeRender", {
    $layers: "fluid.component",
    text: "Initial value",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div><div class="inner">@{text}</div></div>`
        }
    }
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
    $layers: "fluid.component",
    text: "Initial value",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div><input value="@{text}"/></div>`
        }
    }
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
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="outer"><div class="outerInner" @id="inner"></div>`
        }
    },
    inner: {
        $component: {
            $layers: "fluid.tests.nestedInner"
        }
    }
});

fluid.def("fluid.tests.nestedInner", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            elideParent: false,
            template: `<div class="inner">Text from inner</div>`
        }
    }
});

// The container's own class is kept, after that of the template's root, which is elided onto it
fluid.tests.nestedExpect = {
    $tagName: "div",
    "class": "outer container",
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
        $layers: "fluid.component",
        view: {
            $component: {
                $layers: "fluid.templateViewComponent",
                elideParent: false,
                template: `<div class="inner">New brush</div>`
            }
        }
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
        $layers: "fluid.component",
        view: {
            $component: {
                $layers: "fluid.templateViewComponent",
                template: `<div class="outer"><div class="newHandle" @id="inner"></div>`
            }
        }
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
    $layers: "fluid.component",
    value: 0,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div><button @onclick="{self}.increment()"/></div>`
        }
    },
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

fluid.def("fluid.tests.bindSeveral", {
    $layers: "fluid.component",
    clicks: 0,
    hovers: 0,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div><button @onclick="{self}.click()" @onmouseover="{self}.hover()" @onmouseout="{self}.hover()"/></div>`
        }
    },
    click: "$method:fluid.tests.bindSeveral.increment({self}, clicks)",
    hover: "$method:fluid.tests.bindSeveral.increment({self}, hovers)"
});

fluid.tests.bindSeveral.increment = function (self, member) {
    self[member]++;
};

QUnit.test("Each of several handlers on one element is bound once", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.bindSeveral({container});
    fluid.cell.stabilize();

    const button = qs("button", container);
    button.dispatchEvent(new MouseEvent("click"));
    assert.equal(that.clicks, 1, "A single click is handled once");
    button.dispatchEvent(new MouseEvent("mouseover"));
    assert.equal(that.hovers, 1, "A single mouseover is handled once");
    assert.deepEqual(Object.values(button.flEventsBound).flat(), ["click", "mouseover", "mouseout"],
        "Each handler is noted as bound exactly once");
    that.destroy();
});

fluid.def("fluid.tests.multiClass", {
    $layers: "fluid.component",
    a: true,
    b: true,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div><span class="base" @class="one:@{a},two:@{b},three:!@{a}">Text</span></div>`
        }
    }
});

fluid.tests.checkMultiClass = function (assert, container, expected, message) {
    fluid.cell.stabilize();
    const span = qs("span", container);
    const classAttr = span.getAttribute("class");
    assert.deepEqual([...span.classList].sort(), expected.sort(), `Correct classes: ${message}`);
    assert.equal(classAttr, classAttr.trim(), `No surrounding whitespace in class attribute: ${message}`);
    assert.notOk(classAttr.includes(","), `No comma in class attribute: ${message}`);
};

QUnit.test("Multiple simultaneous dynamic classes - FLUID-7011", function (assert) {
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
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template:
            `<span class="todo tag is-large" @class="completed:@{completed},is-info:!@{completed}" @onclick="{todoList}.toggleItem({self}.itemIndex)">
            @{text}<button class="delete is-small" @onclick.stop="{todoList}.deleteItem({self}.itemIndex)"></button>
        </span>`
        }
    }
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
    $layers: "fluid.component",
    todos: {
        $reactiveRoot: fluid.tests.todos
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
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
    </div>`
        }
    },
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
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.viewComponent"
        }
    },
    editButton: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<button style="position: fixed; top: 1em; right: 1em;">Edit</button>`,
                    container: "$compute:fluid.insertChildContainer(before, editButton, {self}.templateTree, {fullPageEditor}.view.renderedContainer)"
                }
            }
        }
    }
});

QUnit.test("Reference up through rendering effect", function (assert) {
    const container = qs(".container");
    fluid.tests.fullPageEditor({container, view: {$component: {$layers: "fluid.selfTemplateRootViewComponent"}}});
    fluid.cell.stabilize();

    const button = qs("button", container);
    assert.ok(button, "Button has been rendered through effect");
});

fluid.def("fluid.tests.dynamicChild", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="dynamic">Dynamic template</div>`
        }
    }
});

fluid.def("fluid.tests.dynamicLayerName", {
    $layers: "fluid.component",
    dynamicLayerName: "fluid.tests.dynamicChild",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div @id="child"></div>`,
            elideParent: false
        }
    },
    child: {
        $component: {
            $layers: ["fluid.component", "{self}.dynamicLayerName"],
            dynamicLayerName: "{dynamicLayerName}.dynamicLayerName",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<div>Static template</div>`
                }
            }
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
    $layers: "fluid.component",
    enabled: false,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div @id="assignee"></div>`,
            elideParent: false
        }
    },
    assignee: {
        $component: {
            $layers: "fluid.component",
            $if: "{assigneeIf}.enabled",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<div class="assignee">Assigned</div>`
                }
            }
        }
    }
});


// The conditional component's content must be removed along with it - FLUID-7024
QUnit.test("Conditional rendering", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.assigneeIf({container});
    fluid.cell.stabilize();
    // The conditional component's container remains whilst the component renders nothing, since the record of a
    // conditional subcomponent does not govern its element in the template, as an element bearing @if does
    const emptyMarkup = "<div></div>";
    assert.equal(container.innerHTML, emptyMarkup, "Initial render correct");

    that.enabled = true;
    fluid.cell.stabilize();
    assert.assertNode(container, {$children: [{$tagName: "div", class: "assignee", $innerHTML: "Assigned"}]}, "Conditional render correct");

    that.enabled = false;
    fluid.cell.stabilize();
    assert.equal(container.innerHTML, emptyMarkup, "Restored initial render");

    that.enabled = true;
    fluid.cell.stabilize();
    assert.assertNode(container, {$children: [{$tagName: "div", class: "assignee", $innerHTML: "Assigned"}]}, "Conditional render correct 2");

    that.enabled = false;
    fluid.cell.stabilize();
    assert.equal(container.innerHTML, emptyMarkup, "Restored initial render");
});

fluid.def("fluid.tests.longFormIf", {
    $layers: "fluid.component",
    distance: null,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div @id="distanceLine"></div>`,
            elideParent: false
        }
    },
    distanceLine: {
        $component: {
            $layers: "fluid.component",
            $if: {
                func: x => x !== null,
                args: "{longFormIf}.distance"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<div class="distance">@{{longFormIf}.distance}</div>`
                }
            }
        }
    }
});

QUnit.test("Conditional rendering with long-form $if record - FLUID-7013", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.longFormIf({container});
    fluid.cell.stabilize();
    const emptyMarkup = "<div></div>";
    assert.equal(container.innerHTML, emptyMarkup, "Initial render correct");

    that.distance = 0;
    fluid.cell.stabilize();
    assert.assertNode(container, {$children: [{$tagName: "div", class: "distance", $innerHTML: "0"}]}, "Falsy value accepted by condition renders");

    that.distance = 5;
    fluid.cell.stabilize();
    assert.assertNode(container, {$children: [{$tagName: "div", class: "distance", $innerHTML: "5"}]}, "Updated value renders");

    that.distance = null;
    fluid.cell.stabilize();
    assert.equal(container.innerHTML, emptyMarkup, "Restored initial render");
});

fluid.def("fluid.tests.containerIds", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="outer"><div @id="plain"></div><div @id="identified"></div></div>`
        }
    },
    plain: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<div class="plain">Plain</div>`
                }
            }
        }
    },
    identified: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<div id="own-id" class="identified">Own</div>`
                }
            }
        }
    }
});

QUnit.test("Rendered containers acquire no ids from the framework", function (assert) {
    const container = qs(".container");
    const presetId = container.id;
    const that = fluid.tests.containerIds({container});
    fluid.cell.stabilize();
    assert.ok(presetId, "Fixture container has an id of its own");
    assert.equal(container.id, presetId, "Existing id of container is preserved");
    assert.notOk(qs(".plain", container).hasAttribute("id"), "Child container acquires no id");
    assert.equal(qs(".identified", container).id, "own-id", "Id specified in template is rendered");
    that.destroy();

    container.removeAttribute("id");
    const that2 = fluid.tests.containerIds({container});
    fluid.cell.stabilize();
    assert.notOk(container.hasAttribute("id"), "Root container without id acquires none");
    that2.destroy();
    container.id = presetId;
});

fluid.def("fluid.tests.attrBinding", {
    $layers: "fluid.component",
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
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div>
        <input class="prompt" value="@{state.prompt}"/>
        <button disabled="@{busy}" aria-pressed="@{busy}" title="Busy: @{busy}">Go</button>
        <input class="text" value="@{text}"/>
        <input class="shout" value="@{shout}"/>
        <input class="done" type="checkbox" checked="@{done}"/>
        <textarea value="@{notes}"></textarea>
        <select value="@{choice}"><option value="a">A</option><option value="b">B</option></select>
    </div>`
        }
    }
});

fluid.tests.attrBinding.shout = text => text.toUpperCase();

QUnit.test("Binding attributes and live state properties - FLUID-7014", function (assert) {
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

// A control bound to a path within a computed value - the case of a form whose controls show a model computed from
// the component's state, e.g. bioreportr.curationForm in the bioReportR projects. User input into such a control has
// nowhere legitimate to go: the value is derived, and a write into it should be refused, as it is for a control bound to
// a computed member itself (see FLUID-7014 above). Were the write accepted at the path, it would replace the computed
// member with a writable value holding only the path written. The member would then no longer follow its inputs, and
// every other binding to it would be left showing whatever it last computed.
fluid.def("fluid.tests.computedPathBinding", {
    $layers: "fluid.component",
    source: "first",
    model: "$compute:fluid.tests.computedPathBinding.model({self}.source)",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div>
        <input class="label" value="@{model.label}"/>
        <span class="echo">@{model.echo}</span>
    </div>`
        }
    }
});

fluid.tests.computedPathBinding.model = source => ({label: "Label of " + source, echo: "Echo of " + source});

QUnit.test("User input into a control bound within a computed value does not detach it from its inputs", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.computedPathBinding({container});
    fluid.cell.stabilize();
    const input = qs(".label", container);
    const echo = qs(".echo", container);
    assert.equal(input.value, "Label of first", "Initial label rendered from computed value");
    assert.equal(echo.textContent, "Echo of first", "Initial echo rendered from computed value");

    input.value = "Typed";
    input.dispatchEvent(new Event("input"));
    fluid.cell.stabilize();
    assert.equal(that.model.echo, "Echo of first", "Sibling of the path written is intact after user input");

    that.source = "second";
    fluid.cell.stabilize();
    assert.equal(that.model.echo, "Echo of second", "Computed value follows its input after user input into a bound control");
    assert.equal(echo.textContent, "Echo of second", "Other binding to the computed value is updated");
    assert.equal(input.value, "Label of second", "Bound control is updated from the recomputed value");
    that.destroy();
});

fluid.def("fluid.tests.rangeHolder", {
    $layers: "fluid.component",
    ranges: {
        $reactiveRoot: [{label: "Jan"}, {label: "Feb"}]
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div @id="rows"></div>`
        }
    },
    rows: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{rangeHolder}.ranges",
                valueAs: "range"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    elideParent: false,
                    template: `<input class="range" value="@{range.label}"/>`
                }
            }
        }
    }
});

QUnit.test("Live state written back beneath a $for variable reaches the source", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.rangeHolder({container});
    fluid.cell.stabilize();
    const inputs = qsa(".range", container);
    assert.deepEqual(inputs.map(input => input.value), ["Jan", "Feb"], "Rows rendered from source");

    inputs[1].value = "February";
    inputs[1].dispatchEvent(new Event("input"));
    fluid.cell.stabilize();
    assert.deepEqual([...that.ranges].map(range => range.label), ["Jan", "February"], "User input written back to source element");
    assert.equal(that.rows.list[1].range.label, "February", "Member sees written value");
    assert.equal(qsa(".range", container)[1].value, "February", "Input holds written value");

    that.ranges[0].label = "January";
    fluid.cell.stabilize();
    assert.equal(qsa(".range", container)[0].value, "January", "Change in source still reaches the row");
});

// A reactive root holding a primitive, including a falsy one, renders correctly on the first render

fluid.def("fluid.tests.primitiveRoots", {
    $layers: "fluid.component",
    flag: {
        $reactiveRoot: false
    },
    count: {
        $reactiveRoot: 0
    },
    label: {
        $reactiveRoot: "x"
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div><span class="flag">@{flag}</span><span class="count">@{count}</span><span class="label">@{label}</span><b @if="flag" class="on">on</b></div>`
        }
    }
});

QUnit.test("Reactive roots holding primitives render on the first render", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.primitiveRoots({container});
    fluid.cell.stabilize();
    assert.equal(qs(".flag", container).textContent, "false", "Root holding false renders");
    assert.equal(qs(".count", container).textContent, "0", "Root holding 0 renders");
    assert.equal(qs(".label", container).textContent, "x", "Root holding a String renders");
    assert.notOk(qs(".on", container), "@if over root holding false omits its element");

    that.flag = true;
    that.label = "y";
    fluid.cell.stabilize();
    assert.equal(qs(".flag", container).textContent, "true", "Root updated by write");
    assert.ok(qs(".on", container), "@if over root holding true renders its element");
    assert.equal(qs(".label", container).textContent, "y", "String root updated by write");
    that.destroy();
});

// Reconciliation of keyed list members and of nodes the rendering does not own, as in a document's head

fluid.def("fluid.tests.headLike", {
    $layers: "fluid.component",
    sheets: {
        $reactiveRoot: {
            a: {href: "/a.css"},
            c: {href: "/c.css"}
        }
    },
    scripts: {
        $reactiveRoot: {
            one: {src: "/one.js"},
            two: {src: "/two.js"}
        }
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div><meta class="first"><fluid-fragment @id="sheetTags"></fluid-fragment><fluid-fragment @id="scriptTags"></fluid-fragment><meta class="last"></div>`
        }
    },
    sheetTags: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{headLike}.sheets",
                valueAs: "sheet"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    elideParent: false,
                    template: `<link rel="stylesheet" href="@{sheet.href}">`
                }
            }
        }
    },
    scriptTags: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{headLike}.scripts",
                valueAs: "script"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    elideParent: false,
                    template: `<script src="@{script.src}"></script>`
                }
            }
        }
    }
});

/**
 * Summarise the children of an element, as the tag of each element together with its href or src, or its class, or
 * nothing if it has none of these
 * @param {Element} element - The element
 * @return {String[]} A summary of each of its element children
 */
fluid.tests.headSummary = function (element) {
    // A browser reports a missing attribute as null, whereas linkedom reports a missing class as ""
    return [...element.children].map(child => child.localName + ":" +
        (child.getAttribute("href") ?? child.getAttribute("src") ?? child.getAttribute("class") ?? ""));
};

QUnit.test("Keyed list members keep their nodes, and nodes not rendered are left alone", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.headLike({container});
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.headSummary(container),
        ["meta:first", "link:/a.css", "link:/c.css", "script:/one.js", "script:/two.js", "meta:last"], "Initial render");
    const [, linkA, linkC, scriptOne, scriptTwo, metaLast] = [...container.children];

    // Nodes appended by others, e.g. a widget loader, and by injection for a Single File Component
    const foreign = document.createElement("style");
    foreign.className = "foreign";
    container.appendChild(foreign);
    const injected = document.createElement("style");
    injected.id = "fl-style-test";
    container.appendChild(injected);

    that.sheets.b = {priority: "after:a", href: "/b.css"};
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.headSummary(container),
        ["meta:first", "link:/a.css", "link:/b.css", "link:/c.css", "script:/one.js", "script:/two.js", "meta:last", "style:foreign", "style:"],
        "Inserted member's node placed after its predecessor, with nodes not rendered left after all rendered nodes");
    const children = [...container.children];
    assert.equal(children[1], linkA, "Node of member before insertion kept");
    assert.equal(children[3], linkC, "Node of member after insertion kept, rather than rewritten");
    assert.equal(children[4], scriptOne, "Script node of other list kept");
    assert.equal(children[5], scriptTwo, "Script node of other list kept");
    assert.equal(children[6], metaLast, "Following node kept");
    assert.equal(children[7], foreign, "Node added by others survives rerendering");
    assert.equal(children[8], injected, "Injected node survives rerendering");

    that.scripts = {two: {src: "/two.js"}, one: {src: "/one.js"}};
    fluid.cell.stabilize();
    const reordered = [...container.children];
    assert.deepEqual(fluid.tests.headSummary(container).slice(4, 6), ["script:/two.js", "script:/one.js"], "Members reordered");
    assert.equal(reordered[4], scriptTwo, "Reordered member's node moved rather than rewritten");
    assert.equal(reordered[5], scriptOne, "Reordered member's node moved rather than rewritten");

    that.sheets = {};
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.headSummary(container),
        ["meta:first", "script:/two.js", "script:/one.js", "meta:last", "style:foreign", "style:"], "Members of emptied list removed");

    that.sheets = {z: {href: "/z.css"}};
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.headSummary(container),
        ["meta:first", "link:/z.css", "script:/two.js", "script:/one.js", "meta:last", "style:foreign", "style:"],
        "First member of an empty list placed after the node preceding its slot");
    assert.notOk([...container.querySelectorAll("*")].some(element => element.hasAttribute("id") && element !== injected),
        "No ids written by the framework");
    that.destroy();
});

QUnit.test("Rendering against markup from an earlier rendering claims its nodes", function (assert) {
    const container = qs(".container");
    const first = fluid.tests.headLike({container});
    fluid.cell.stabilize();
    const markup = container.innerHTML;
    first.destroy();

    // As for a static page rendered by a build, with a script booting the framework added to it
    const host = document.createElement("div");
    host.innerHTML = markup + "<script fluid-hydrated=\"%infusion-6\" src=\"/boot.js\"></script>";
    qs(".container").appendChild(host);
    const staticNodes = [...host.children];
    const that = fluid.tests.headLike({container: host});
    fluid.cell.stabilize();
    assert.equal(host.innerHTML, markup + "<script fluid-hydrated=\"%infusion-6\" src=\"/boot.js\"></script>", "Markup unchanged by rendering");
    assert.deepEqual([...host.children], staticNodes, "Every node of the static markup claimed rather than rewritten");

    that.sheets.b = {priority: "after:a", href: "/b.css"};
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.headSummary(host),
        ["meta:first", "link:/a.css", "link:/b.css", "link:/c.css", "script:/one.js", "script:/two.js", "meta:last", "script:/boot.js"],
        "Claimed list members are keyed thereafter");
    assert.equal(host.children[3], staticNodes[2], "Claimed node of member after insertion kept");
    that.destroy();
    host.remove();
});

QUnit.test("Markup claimed in order despite a node inserted before its first rendering", function (assert) {
    const container = qs(".container");
    const first = fluid.tests.headLike({container});
    fluid.cell.stabilize();
    const markup = container.innerHTML;
    first.destroy();

    // As for a static page whose widget's script prepends its stylesheet to <head> before the page's tree boots
    const host = document.createElement("div");
    host.innerHTML = markup;
    qs(".container").appendChild(host);
    const staticNodes = [...host.children];
    const prepended = document.createElement("link");
    prepended.setAttribute("rel", "stylesheet");
    prepended.setAttribute("href", "/widget.css");
    host.prepend(prepended);
    // and an extension's style, appended
    const appended = document.createElement("style");
    appended.className = "extension";
    host.appendChild(appended);
    const that = fluid.tests.headLike({container: host});
    fluid.cell.stabilize();
    assert.deepEqual([...host.children], [prepended, ...staticNodes, appended],
        "Every node of the static markup claimed by the vnode which rendered it, and nodes inserted by others left in place");
    assert.deepEqual(fluid.tests.headSummary(host),
        ["link:/widget.css", "meta:first", "link:/a.css", "link:/c.css", "script:/one.js", "script:/two.js", "meta:last", "style:extension"],
        "No node rewritten");

    that.sheets.b = {priority: "after:a", href: "/b.css"};
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.headSummary(host),
        ["link:/widget.css", "meta:first", "link:/a.css", "link:/b.css", "link:/c.css", "script:/one.js", "script:/two.js", "meta:last", "style:extension"],
        "Nodes inserted by others are left alone as the rendering changes");
    that.destroy();
    host.remove();
});

// Cross-injection of views - FLUID-7020

fluid.def("fluid.tests.crossInject.first", {
    $layers: "fluid.component",
    text: "First",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="first">@{text}</div>`
        }
    }
});

fluid.def("fluid.tests.crossInject.second", {
    $layers: "fluid.component",
    text: "Second",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="second">@{text}</div>`
        }
    }
});

fluid.def("fluid.tests.crossInjectView", {
    $layers: "fluid.component",
    view1: {
        $component: {
            $layers: "fluid.tests.crossInject.first"
        }
    },
    view2: {
        $component: {
            $layers: "fluid.tests.crossInject.second",
            // cross-link to view1's view, sharing its view and defeating our own rendering
            view: "{view1}.view"
        }
    },
    // Produce what from the outside appears to be a regular view component built out of view1's view
    view: "{view1}.view" // Note that "proleptic scoping" works - {view1} resolves before view1 is created
});

QUnit.test("Cross-injected views - FLUID-7020", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.crossInjectView({
        view1: {
            $component: {
                view: {
                    $component: {container}
                }
            }
        }
    });
    fluid.cell.stabilize();
    const shadow = that[fluid.metadataSymbol];
    const viewShadow = that.view1.view[fluid.metadataSymbol];
    const view2Shadow = that.view2[fluid.metadataSymbol];

    assert.assertNode(container, {$tagName: "div", "class": "first container", $nodeValue: "First"}, "First component's view rendered into its container");
    assert.equal(qsa(".second", container).length, 0, "Second component's own template is not rendered");

    assert.equal(that.view, that.view1.view, "Outer component's view is the first component's view");
    assert.ok(fluid.hasLayer(that.view, "fluid.viewComponent"), "Outer component's view is a view component");
    assert.equal(fluid.viewShadowFor(shadow), viewShadow, "Outer component's view is found as its view subcomponent");
    assert.equal(fluid.renderedContainerFor(shadow), container, "Outer component exposes the first component's rendered container");

    assert.equal(that.view2.view, that.view1.view, "Second component's view is the first component's view");
    assert.equal(fluid.viewShadowFor(view2Shadow), viewShadow, "Second component's view is found as its view subcomponent");
    const view2ViewPath = fluid.composeSegment(view2Shadow.path, "view");
    assert.equal(fluid.globalInstantiator.pathToComponent[view2ViewPath], viewShadow, "Second component's view path holds the injected view");
    assert.notOk(Object.values(fluid.globalInstantiator.pathToComponent).some(oneShadow => oneShadow.path === view2ViewPath),
        "No view was created for the second component");

    that.view1.text = "Updated";
    fluid.cell.stabilize();
    assert.assertNode(container, {$tagName: "div", "class": "first container", $nodeValue: "Updated"}, "Shared view rerenders on update");

    that.view1.destroy();
    fluid.cell.stabilize();
    assert.ok(fluid.isUnavailable(that.view), "Outer component's view is unavailable once the first component is destroyed");
    assert.ok(fluid.isUnavailable(that.view2.view), "Second component's view is unavailable once the first component is destroyed");
    assert.undefined(fluid.viewShadowFor(shadow), "Outer component no longer has a view subcomponent");
    assert.undefined(fluid.viewShadowFor(view2Shadow), "Second component no longer has a view subcomponent");
    that.destroy();
});

// Top-level widgets, receiving host machinery broadcast onto their views - FLUID-7021

fluid.def("fluid.tests.widget", {
    $layers: "fluid.topLevelWidget",
    preferredSize: {w: 200, h: 100},
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: "<div>Widget</div>"
        }
    }
});

fluid.def("fluid.tests.hostView", {
    $layers: "fluid.topLevelWidgetView",
    hostId: null,
    hostBounds: "$compute:fluid.tests.hostBounds({self}.hostId)"
});

fluid.tests.hostBounds = hostId => ({x: hostId * 10, y: 0, w: 1, h: 1});

fluid.def("fluid.tests.widgetHost", {
    $layers: "fluid.component",
    hostLinkage: {
        $linkage: {
            inputLayers: ["fluid.topLevelWidgetView"],
            outputLayers: ["fluid.tests.hostView"]
        }
    }
});

QUnit.test("Host machinery is broadcast onto the views of top-level widgets - FLUID-7021", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.widget({container, view: {$component: {hostId: 3}}});
    fluid.cell.stabilize();
    assert.assertNode(container, {$tagName: "div", $nodeValue: "Widget"}, "Widget rendered");
    assert.ok(fluid.hasLayer(that.view, "fluid.topLevelWidgetView"), "Widget's view bears the top-level widget view layer");
    assert.equal(that.hostBounds, null, "Widget receives placeholder bounds when unhosted");

    const host = fluid.tests.widgetHost();
    fluid.cell.stabilize();
    assert.ok(fluid.hasLayer(that.view, "fluid.tests.hostView"), "Host's view layer is broadcast onto the widget's view");
    assert.notOk(fluid.hasLayer(that, "fluid.tests.hostView"), "Host's view layer is not applied to the widget itself");
    assert.deepEqual({...that.hostBounds}, {x: 30, y: 0, w: 1, h: 1}, "Widget receives bounds reported by its host's view");
    assert.assertNode(container, {$tagName: "div", $nodeValue: "Widget"}, "Widget still rendered");

    const merged = fluid.avatarMerged("fluid.tests.widget");
    assert.ok(merged.$layers.includes("fluid.topLevelWidget"), "Widget's avatar reveals it to be a top-level widget");
    assert.deepEqual({...merged.preferredSize}, {w: 200, h: 100}, "Widget's avatar reveals its preferred size");

    host.destroy();
    fluid.cell.stabilize();
    assert.notOk(fluid.hasLayer(that.view, "fluid.tests.hostView"), "Host's view layer is withdrawn with the host");
    assert.equal(that.hostBounds, null, "Widget's bounds revert to the placeholder");
    that.destroy();
});

// A host which, as it should, reports no bounds for a view which it does not itself host
fluid.def("fluid.tests.nestingHostView", {
    $layers: "fluid.topLevelWidgetView",
    hostId: null,
    hostBounds: "$compute:fluid.tests.nestingHostBounds({self}.hostId)"
});

fluid.tests.nestingHostBounds = hostId => hostId === null ? null : {x: hostId * 10, y: 0, w: 1, h: 1};

fluid.def("fluid.tests.nestingHost", {
    $layers: "fluid.component",
    hostLinkage: {
        $linkage: {
            inputLayers: ["fluid.topLevelWidgetView"],
            outputLayers: ["fluid.tests.nestingHostView"]
        }
    }
});

// An umbrella widget rendering another top-level widget into its own template, via an intermediate component
fluid.def("fluid.tests.umbrellaWidget", {
    $layers: "fluid.topLevelWidget",
    group: {
        $component: {
            $layers: "fluid.component",
            inner: {
                $component: {
                    $layers: "fluid.tests.widget"
                }
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<div class="group"><div @id="inner"></div></div>`
                }
            }
        }
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="umbrella"><div @id="group"></div></div>`
        }
    }
});

QUnit.test("Widget nested within another takes the bounds of the widget enclosing it - FLUID-7025", function (assert) {
    const container = qs(".container");
    const host = fluid.tests.nestingHost();
    const that = fluid.tests.umbrellaWidget({container, view: {$component: {hostId: 4}}});
    fluid.cell.stabilize();
    const inner = that.group.inner;
    assert.equal(container.textContent, "Widget", "Nested widget rendered within the umbrella's template");
    assert.equal(fluid.unwrapProxy(inner.view.hostBounds), null, "Host reports no bounds for the nested widget's own view");
    assert.deepEqual({...that.hostBounds}, {x: 40, y: 0, w: 1, h: 1}, "Umbrella receives bounds reported by its host");
    assert.deepEqual({...inner.hostBounds}, {x: 40, y: 0, w: 1, h: 1}, "Nested widget takes the bounds of the umbrella enclosing it");
    host.destroy();
    fluid.cell.stabilize();
    assert.equal(inner.hostBounds, null, "Nested widget's bounds revert to the placeholder once its enclosing widget is unhosted");
    that.destroy();
});

QUnit.test("Problems with the markup of a template are recorded as warnings", function (assert) {
    const sound = fluid.parseTemplateMarkup("<div class=\"a\"><span>Text</span></div>");
    assert.equal(sound.warnings, undefined, "Sound markup bears no warnings");
    const unclosed = fluid.parseTemplateMarkup("<div class=\"a\"><span>Text</div>");
    assert.equal(unclosed.warnings.length, 1, "One warning for unclosed tag");
    assert.ok(unclosed.warnings[0].startsWith("tag <span> has no matching end tag") && unclosed.warnings[0].includes("at character 15"),
        "Unclosed tag and its location described");
    const twoRoots = fluid.parseTemplateMarkup("<div>One</div><div>Two</div>");
    assert.deepEqual(twoRoots.warnings, ["The template has 2 top-level nodes, but only the first is rendered - wrap them in a single element"],
        "Surplus top-level nodes described");
    const notMarkup = fluid.templateToTree(undefined);
    assert.ok(fluid.isUnavailable(notMarkup), "Template which is not markup is unavailable");
    assert.ok(notMarkup.message.includes("must be markup held as a String") && notMarkup.message.includes("but it was undefined"),
        "Template which is not markup described");
    assert.ok(fluid.templateToTree({tag: "div"}).message.includes("but it was {\"tag\":\"div\"}"), "Template which is an object described");
});

// Error boundaries - a component taking responsibility for the presentation of errors in rendering its descendants

fluid.tests.throwTemplate = function () {
    throw new Error("Template could not be computed");
};

fluid.def("fluid.tests.failingRender", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: "$compute:fluid.tests.throwTemplate()"
        }
    }
});

fluid.def("fluid.tests.rejectedLayer", fluid.unavailable("Layer rejected for testing"));

fluid.def("fluid.tests.errorBoundary", {
    $layers: "fluid.errorBoundary",
    reportError: "$method:fluid.tests.recordErrorReport({0})"
});

fluid.tests.errorReports = [];

// An unavailable value with a single cause holds it directly
fluid.tests.causesOf = unavailable => unavailable.causes || [unavailable];

fluid.tests.recordErrorReport = function (report) {
    fluid.tests.errorReports.push(report);
};

QUnit.test("Errors in rendering are reported to the nearest error boundary, or rendered in place", function (assert) {
    const container = qs(".container");
    const unbounded = fluid.initFreeComponent("fluid.tests.failingRender", {container});
    fluid.cell.stabilize();
    assert.ok(qs(".fl-error", container)?.textContent.includes("Template could not be computed"),
        "Error rendered in place where there is no boundary");
    unbounded.destroy();
    container.replaceChildren();

    const boundary = fluid.tests.errorBoundary();
    const bounded = fluid.initChildComponent(boundary, "fluid.tests.failingRender", {container});
    fluid.cell.stabilize();
    const boundedShadow = bounded[fluid.metadataSymbol];
    assert.equal(boundedShadow.parentShadow, boundary[fluid.metadataSymbol], "Child component constructed within its parent");
    assert.equal(container.childNodes.length, 0, "Error not rendered in place within a boundary");
    assert.equal(fluid.tests.errorReports.length, 1, "Error reported to the boundary");
    const [report] = fluid.tests.errorReports;
    assert.equal(report.container, container, "Report holds the container in which the error would have been rendered");
    assert.ok(report.shadow.path.startsWith(boundedShadow.path) && fluid.tests.causesOf(report.unavailable).some(cause =>
        cause.message.includes("Template could not be computed")), "Report holds the failed component and the error");
    bounded.destroy();
    fluid.tests.errorReports.length = 0;

    const rejected = fluid.initChildComponent(boundary, "fluid.tests.rejectedLayer", {view: {$component: {container}}});
    fluid.cell.stabilize();
    assert.equal(fluid.tests.errorReports.length, 1, "Failure of component's own layer reported to the boundary");
    assert.ok(fluid.tests.errorReports[0].container === container && fluid.tests.causesOf(fluid.tests.errorReports[0].unavailable).some(cause =>
        cause.message.includes("Layer rejected for testing")), "Report holds the container supplied to its view, and the failure");
    fluid.destroyComponent(rejected);
    boundary.destroy();
    fluid.tests.errorReports.length = 0;

    const rejectedFree = fluid.initFreeComponent("fluid.tests.rejectedLayer", {view: {$component: {container}}});
    fluid.cell.stabilize();
    assert.ok(qs(".fl-error", container)?.textContent.includes("Layer rejected for testing"),
        "Failure of component's own layer rendered in place where there is no boundary");
    fluid.destroyComponent(rejectedFree);
    container.replaceChildren();
});

/**
 * Summarise the element children of a node as their tag names, each followed by its classes
 * @param {Element} element - The node whose children are summarised
 * @return {String[]} A summary of each child, e.g. "h2.sub"
 */
fluid.tests.childSummary = element => [...element.children].map(child =>
    child.localName + [...child.classList].map(clazz => "." + clazz).join(""));

fluid.tests.urlize = text => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

fluid.tests.joinWith = (a, separator, b) => a + separator + b;

fluid.def("fluid.tests.templateCall", {
    $layers: "fluid.component",
    tag: "Hello World",
    other: "there",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div>
                <a href="/tags/@{fluid.tests.urlize({self}.tag)}/" title="@{fluid.tests.urlize({self}.tag)}">@{tag}</a>
                <span class="joined">@{fluid.tests.joinWith({self}.tag, -, {templateCall}.other)}</span>
                <span class="literal" title="@@{tag}">count is @@{count} and @{other}</span>
            </div>`
        }
    }
});

QUnit.test("Function calls and escaped references in template bindings", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.templateCall({container});
    fluid.cell.stabilize();
    const link = qs("a", container);
    assert.equal(link.getAttribute("href"), "/tags/hello-world/", "Call interpolated into attribute");
    assert.equal(link.getAttribute("title"), "hello-world", "Call alone bound as attribute value");
    assert.equal(qs(".joined", container).textContent, "Hello World-there", "Call with several arguments interpolated into text");
    assert.equal(qs(".literal", container).textContent, "count is @{count} and there", "@@{ renders a literal @{ in text");
    assert.equal(qs(".literal", container).getAttribute("title"), "@{tag}", "@@{ renders a literal @{ in an attribute");

    that.tag = "Other Tag";
    fluid.cell.stabilize();
    assert.equal(link.getAttribute("href"), "/tags/other-tag/", "Call recomputed when its argument changes");
    assert.equal(qs(".joined", container).textContent, "Other Tag-there", "Text call recomputed when its argument changes");
    assert.equal(qs("a", container), link, "Element undisturbed by update");
    that.destroy();
});

QUnit.test("Parsing of interpolated expressions", function (assert) {
    const tokens = fluid.parseAtStringTemplate("a @{x.y} @{{ctx}.p.q} @{f.g({self}.h, 3)} @@{lit} @{unclosed");
    assert.deepEqual(tokens.map(token => typeof(token) === "string" ? token : token.call ? {call: token.call} : {parsed: token.parsed}), [
        "a ", {parsed: {context: "self", path: "x.y"}}, " ",
        {parsed: {context: "ctx", path: "p.q", name: undefined, selector: undefined}}, " ",
        {call: {func: "f.g", args: ["{self}.h", 3]}}, " @{lit} @{unclosed"
    ], "Paths, references, calls, escapes and unclosed expressions parsed");
});

fluid.def("fluid.tests.island", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<figure class="island"><img src="@{dataset.src}"/><figcaption>@{dataset.caption}</figcaption></figure>`
        }
    }
});

fluid.def("fluid.tests.verbatimContent", {
    $layers: "fluid.component",
    html: `<p class="first">count is @{count} <em>a</em> <em>b</em></p><pre>x  y

z</pre><div fluid-layers="fluid.tests.island" data-src="a.png" data-image-caption="A caption"></div><p class="last">after</p>`,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            verbatim: true,
            template: "{$parent}.html"
        }
    }
});

fluid.def("fluid.tests.islandCaption", {
    $layers: "fluid.tests.island",
    view: {
        $component: {
            template: `<figure class="island"><img src="@{dataset.src}"/><figcaption>@{dataset.imageCaption}</figcaption></figure>`
        }
    }
});

QUnit.test("Verbatim markup with component islands", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.verbatimContent({container});
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.childSummary(container), ["p.first", "pre", "div.island", "p.last"],
        "All top-level nodes of verbatim markup rendered within the container");
    assert.equal(qs(".first", container).textContent, "count is @{count} a b", "Text not interpolated, and whitespace kept");
    assert.equal(qs("pre", container).textContent, "x  y\n\nz", "Whitespace within pre kept");
    assert.equal(qs(".island img", container).getAttribute("src"), "a.png", "Island rendered by its layers, reading its dataset");
    const islandShadow = that[fluid.metadataSymbol].childComponents["island-1"];
    assert.ok(islandShadow && fluid.hasLayer(islandShadow.that, "fluid.tests.island"), "Island is a child component bearing its layers");
    assert.equal(qs(".island", container).getAttribute("fluid-layers"), "fluid.tests.island", "Island element keeps its attributes");

    that.html = `<p class="changed">Changed</p><span fluid-layers="fluid.tests.islandCaption" data-src="b.png" data-image-caption="B"></span>`;
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.childSummary(container), ["p.changed", "span.island"], "Changed markup rendered");
    assert.equal(qs(".island figcaption", container).textContent, "B", "Island with different layers rendered");
    assert.ok(fluid.hasLayer(that[fluid.metadataSymbol].childComponents["island-1"].that, "fluid.tests.islandCaption"),
        "Island component bears the layers of its new element");

    that.html = `<p>No islands</p>`;
    fluid.cell.stabilize();
    assert.notOk(that[fluid.metadataSymbol].childComponents["island-1"], "Island component destroyed once its element is gone");
    that.destroy();
});

fluid.def("fluid.tests.templateIslands", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="host"><div class="first" fluid-layers="fluid.tests.island" data-src="a.png" data-caption="A"></div>` +
                `<span class="second" fluid-layers="fluid.tests.islandCaption" fluid-id="named" data-src="b.png" data-image-caption="B"></span></div>`
        }
    }
});

QUnit.test("Elements of a template bearing fluid-layers rendered as named child components", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.templateIslands({container});
    fluid.cell.stabilize();
    const children = that[fluid.metadataSymbol].childComponents;
    assert.ok(children.island && fluid.hasLayer(children.island.that, "fluid.tests.island"),
        "An element with no fluid-id is the child named for its first layer's last segment");
    assert.equal(qs(".first img", container).getAttribute("src"), "a.png", "It renders by its layers, reading its dataset");
    assert.ok(children.named && fluid.hasLayer(children.named.that, "fluid.tests.islandCaption"), "An element's fluid-id names its child");
    assert.equal(qs(".second figcaption", container).textContent, "B", "It renders by its own layers");
    assert.equal(children["island-1"], undefined, "No child is named in order, as one in verbatim markup is");

    that.destroy();
});

fluid.def("fluid.tests.faultyTemplateIslands", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="host"><div class="one" fluid-layers="fluid.tests.island" data-src="a.png"></div>` +
                `<div class="two" fluid-layers="fluid.tests.island" data-src="b.png"></div>` +
                `<div class="both" @id="both" fluid-layers="fluid.tests.island" data-src="c.png"></div></div>`
        }
    }
});

QUnit.test("Elements of a template bearing fluid-layers which can't be named are errors, rendered as plain markup", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.faultyTemplateIslands({container});
    fluid.cell.stabilize();
    const childNames = Object.keys(that[fluid.metadataSymbol].childComponents).filter(name => name !== "view");
    assert.deepEqual(childNames, ["island"], "Only the first of two elements naming the same member has a child");
    assert.equal(qs(".one img", container).getAttribute("src"), "a.png", "The first renders");
    assert.equal(qs(".two img", container), null, "The second is rendered as plain markup");
    assert.equal(qs(".both img", container), null, "An element bearing both @id and fluid-layers is rendered as plain markup");
    that.destroy();
});

fluid.def("fluid.tests.siteUrls", {
    $layers: "fluid.component",
    stylesheet: "/css/main.css",
    html: `<p><a class="content" href="/post/x/">x</a><img class="content" src="/img/a.png"></p>` +
        `<a class="cdn" href="//cdn.example.org/lib.js">cdn</a><a class="absolute" href="https://example.org/y">y</a>` +
        `<a class="relative" href="z/">z</a><a class="fragment" href="#top">top</a>` +
        `<div fluid-layers="fluid.tests.island" data-src="/img/b.png" data-caption="B"></div>`,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div><link class="bound" rel="stylesheet" href="@{stylesheet}"><div @id="content"></div></div>`
        }
    },
    content: {
        $component: {
            $layers: "fluid.component",
            html: "{fluid.tests.siteUrls}.html",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    verbatim: true,
                    template: "{$parent}.html"
                }
            }
        }
    }
});

QUnit.test("Site-absolute URLs resolved against the site's root as they are rendered", function (assert) {
    const html = document.documentElement;
    const container = qs(".container");
    html.setAttribute(fluid.siteRootAttribute, "../../");
    const that = fluid.tests.siteUrls({container});
    fluid.cell.stabilize();
    assert.equal(qs(".bound", container).getAttribute("href"), "../../css/main.css", "URL bound in a template resolved");
    assert.deepEqual([...container.querySelectorAll(".content")].map(node => node.getAttribute(node.localName === "img" ? "src" : "href")),
        ["../../post/x/", "../../img/a.png"], "URLs within verbatim markup resolved");
    assert.equal(qs(".island img", container).getAttribute("src"), "../../img/b.png", "URL rendered by an island from its dataset resolved");
    assert.equal(qs(".island", container).getAttribute("data-src"), "/img/b.png", "Other attributes left as written");
    assert.deepEqual(["cdn", "absolute", "relative", "fragment"].map(name => qs("." + name, container).getAttribute("href")),
        ["//cdn.example.org/lib.js", "https://example.org/y", "z/", "#top"], "Protocol-relative, absolute and relative URLs left as written");
    that.stylesheet = "/css/other.css";
    fluid.cell.stabilize();
    assert.equal(qs(".bound", container).getAttribute("href"), "../../css/other.css", "URL resolved again as it is rerendered");
    that.destroy();
    html.removeAttribute(fluid.siteRootAttribute);

    const unrooted = fluid.tests.siteUrls({container});
    fluid.cell.stabilize();
    assert.equal(qs(".bound", container).getAttribute("href"), "/css/main.css", "In a page recording no site root, URLs are left as written");
    unrooted.destroy();
});

fluid.def("fluid.tests.ifElse", {
    $layers: "fluid.component",
    subtitle: null,
    showRule: true,
    showMeta: false,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div>
                <h1>Title</h1>
                <hr @if="showRule" class="rule"/>
                <h2 @if="{self}.subtitle" class="sub">@{subtitle}</h2>
                <p @else class="nosub">No subtitle</p>
                <div @if="!@{showRule}" class="norule"><span @id="meta"></span></div>
                <span class="end">end</span>
            </div>`
        }
    },
    meta: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<span class="meta">@{{ifElse}.subtitle}</span>`
                }
            }
        }
    }
});

QUnit.test("Element-level conditionals with @if and @else", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.ifElse({container});
    fluid.cell.stabilize();
    const end = qs(".end", container);
    assert.deepEqual(fluid.tests.childSummary(container), ["h1", "hr.rule", "p.nosub", "span.end"], "Initial render");
    assert.notOk(qs(".rule", container).hasAttribute("id"), "Anonymous block acquires no default id");

    that.subtitle = "Sub";
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.childSummary(container), ["h1", "hr.rule", "h2.sub", "span.end"], "@else replaced by @if");
    assert.equal(qs(".sub", container).textContent, "Sub", "Reference within block resolved against the template's component");

    that.showRule = false;
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.childSummary(container), ["h1", "h2.sub", "div.norule", "span.end"], "Elements omitted and inserted");
    assert.equal(qs(".norule .meta", container)?.textContent, "Sub", "Subcomponent designated by @id within block rendered");

    that.subtitle = null;
    that.showRule = true;
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.childSummary(container), ["h1", "hr.rule", "p.nosub", "span.end"], "Initial render restored");
    assert.equal(qs(".end", container), end, "Unconditional element undisturbed throughout");
    const childNames = Object.keys(that[fluid.metadataSymbol].childComponents).filter(name => name !== "view" && name !== "meta");
    assert.deepEqual(childNames.sort(), ["else-1", "if-1"], "Only blocks whose conditions hold exist");
    that.destroy();
});

fluid.def("fluid.tests.removableSlot", {
    $layers: ["fluid.component", "{self}.extraLayers"],
    extraLayers: [],
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div><header @id="header"></header><main class="main">Main</main><fluid-fragment @id="links"></fluid-fragment><span class="end">end</span></div>`
        }
    },
    header: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<header class="header">Header</header>`
                }
            }
        }
    },
    links: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<link class="link"/>`
                }
            }
        }
    }
});

fluid.def("fluid.tests.removeSlots", {
    header: null,
    links: null
});

QUnit.test("Element bearing @id omitted whilst its member is removed with null", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.removableSlot({container});
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.childSummary(container), ["header.header", "main.main", "link.link", "span.end"], "Initial render");
    const main = qs(".main", container);

    that.extraLayers = ["fluid.tests.removeSlots"];
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.childSummary(container), ["main.main", "span.end"], "Elements of removed members omitted");
    assert.equal(that.header, null, "Member removed");
    const childNames = Object.keys(that[fluid.metadataSymbol].childComponents).filter(name => name !== "view");
    assert.deepEqual(childNames, [], "Template slots allocate no components for removed members");

    that.extraLayers = [];
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.childSummary(container), ["header.header", "main.main", "link.link", "span.end"],
        "Elements rendered again once removal withdrawn");
    assert.equal(qs(".main", container), main, "Unaffected element undisturbed throughout");
    that.destroy();
});

fluid.def("fluid.tests.separatedList", {
    $layers: "fluid.component",
    tags: {
        beta: {name: "Beta"},
        alpha: {priority: "first", name: "Alpha"},
        gamma: {name: "Gamma"}
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<p @id="tagLinks"></p>`
        }
    },
    tagLinks: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{separatedList}.tags",
                valueAs: "tag",
                positionAs: "position"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    elideParent: false,
                    template: `<span @if="!position.first" class="sep">, </span><a>@{tag.name}</a>`
                }
            }
        }
    }
});

QUnit.test("Separators between members of a keyed $for rendered using positionAs", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.separatedList({container});
    fluid.cell.stabilize();
    assert.equal(container.textContent, "Alpha, Beta, Gamma", "Separator precedes all members but the first");

    that.tags = {gamma: {name: "Gamma"}, beta: {name: "Beta"}};
    fluid.cell.stabilize();
    assert.equal(container.textContent, "Gamma, Beta", "Separators follow change in membership");
    that.destroy();
});

fluid.def("fluid.tests.partialBase", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: ["fluid.templateViewComponent", "fluid.partialViewComponent"],
            template: `<header><h1 class="title">Title</h1><nav @id="navbar"></nav><p class="doomed">Doomed</p><div class="old">Old</div></header>`
        }
    },
    navbar: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: "<nav>Nav</nav>"
                }
            }
        }
    }
});

fluid.def("fluid.tests.partialMeta", {
    view: {
        $component: {
            relativeContainer: "last: h1.title",
            partialTemplate: `<span class="meta">Meta</span>`
        }
    }
});

fluid.def("fluid.tests.partialMeta2", {
    view: {
        $component: {
            relativeContainer: "last: h1.title",
            partialTemplate: `<span class="meta2">Meta2</span>`
        }
    }
});

fluid.def("fluid.tests.partialTwoPlaces", {
    view: {
        $component: {
            relativeContainer: "after: @navbar",
            partialTemplate: `<div class="modal">Modal</div><div class="modal2">Modal2</div><b @relative="first: header" class="first">First</b>`
        }
    }
});

fluid.def("fluid.tests.partialRemove", {
    view: {
        $component: {
            relativeContainer: "remove: .doomed"
        }
    }
});

fluid.def("fluid.tests.partialReplace", {
    view: {
        $component: {
            relativeContainer: "replace: header > .old",
            partialTemplate: `<div class="new">New</div>`
        }
    }
});

fluid.def("fluid.tests.partialAll", {
    $layers: ["fluid.tests.partialBase", "fluid.tests.partialMeta", "fluid.tests.partialMeta2", "fluid.tests.partialTwoPlaces",
        "fluid.tests.partialRemove", "fluid.tests.partialReplace"]
});

fluid.def("fluid.tests.partialRedirect", {
    $layers: "fluid.tests.partialAll",
    view: {
        $component: {
            partialTemplateLayers: {
                "fluid.tests.partialMeta2": {
                    relativeContainer: "before: @navbar"
                }
            }
        }
    }
});

QUnit.test("Partial templates composited by selector, in order of layer precedence", function (assert) {
    const container = qs(".container");
    const that = fluid.initFreeComponent("fluid.tests.partialAll", {container});
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.childSummary(container), ["b.first", "h1.title", "nav", "div.modal", "div.modal2", "div.new"],
        "Partials composited first, after, by member, replacing and removing");
    // Of the layers listed as parents of fluid.tests.partialAll, those listed later are stronger
    assert.deepEqual(fluid.tests.childSummary(qs("h1", container)), ["span.meta", "span.meta2"],
        "Partials at the same cutpoint follow in order of layer precedence, weakest first");
    assert.notOk(qs("nav", container).hasAttribute("id"), "Element of subcomponent bears no id from the framework");
    assert.notOk(qs(".first", container).hasAttribute("@relative"), "Own cutpoint of partial node not rendered");
    that.destroy();

    const redirected = fluid.initFreeComponent("fluid.tests.partialRedirect", {container});
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.childSummary(container), ["b.first", "h1.title", "span.meta2", "nav", "div.modal", "div.modal2", "div.new"],
        "Cutpoint of a partial overridden by another layer");
    redirected.destroy();
});

fluid.def("fluid.tests.hostedOutputPage", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: ["fluid.templateViewComponent", "fluid.outputDocumentView"],
            documentLocation: "elsewhere/index.html",
            template: `<html><body><h1>Elsewhere</h1></body></html>`
        }
    }
});

QUnit.test("An output document view on the client renders only into its own document", function (assert) {
    const here = document.location.href;
    assert.equal(fluid.hostDocumentElement(here), document.documentElement, "Output document at this location is this document");
    assert.equal(fluid.pageUrlOf("dir/index.html?q=1#top", "http://example.org/site/"), fluid.pageUrlOf("dir/", "http://example.org/site/"),
        "Final index.html, query and fragment do not distinguish a page");
    assert.ok(fluid.isUnavailable(fluid.hostDocumentElement("elsewhere/index.html")), "Output document elsewhere is not this document");
    assert.notOk(fluid.isOutputDocument(document), "The client's own document is not an output document");

    // A site whose base URL is on another origin, but whose path is that of this document's directory - as when a site
    // published at https://example.org/... is served locally
    const dirPath = new URL("./", here).pathname;
    const fileName = new URL(here).pathname.substring(dirPath.length);
    const baseURL = "https://example.org" + dirPath.replace(/\/$/, "");
    assert.equal(fluid.sitePathOf("https://example.org/blog/post/x/index.html", undefined, "https://example.org/blog"), "post/x/",
        "Path of page relative to site");
    assert.equal(fluid.sitePathOf("https://example.org/other/", undefined, "https://example.org/blog"), undefined,
        "Page outside the site's path has no path within it");
    assert.equal(fluid.hostDocumentElement(baseURL + "/" + fileName, baseURL), document.documentElement,
        "Output document at this path relative to the site's base is this document, whatever its origin");
    assert.equal(fluid.hostDocumentElement(fileName, baseURL), document.documentElement,
        "Relative location resolved against the site's base URL");
    assert.ok(fluid.isUnavailable(fluid.hostDocumentElement(baseURL + "/", baseURL)),
        "The site's home page is not this document");
    assert.ok(fluid.isUnavailable(fluid.hostDocumentElement(baseURL + "/elsewhere/" + fileName, baseURL)),
        "Output document at another path of the site is not this document");

    // A page recording the site's root as its parent directory, as when a site published at https://example.org/blog/
    // is previewed from files in some other directory
    const dirName = dirPath.split("/").filter(segment => segment).pop();
    const html = document.documentElement;
    html.setAttribute(fluid.siteRootAttribute, "../");
    assert.equal(fluid.hostDocumentElement("https://example.org/blog/" + dirName + "/" + fileName, "https://example.org/blog"),
        html, "Output document at this path relative to the site's root recorded in this document is this document");
    assert.ok(fluid.isUnavailable(fluid.hostDocumentElement("https://example.org/blog/" + fileName, "https://example.org/blog")),
        "Output document at another path relative to the recorded root is not this document");
    html.removeAttribute(fluid.siteRootAttribute);
    assert.deepEqual(["post/x/", "404.html", ""].map(fluid.relativeSiteRoot), ["../../", "./", "./"],
        "Relative URL of the site's root from pages of the site");

    const that = fluid.tests.hostedOutputPage();
    fluid.cell.stabilize();
    assert.ok(fluid.isUnavailable(that.view.container), "View of output document elsewhere has no container");
    assert.notOk(document.querySelector("h1")?.textContent === "Elsewhere", "Nothing rendered into this document");
    that.destroy();
});

QUnit.test("Scripts classified by their role", function (assert) {
    const holder = document.createElement("div");
    holder.innerHTML = `<script src="FluidCore.js" fluid-hydrated="%infusion-6"></script>
        <script id="fl-script-some.layer-0">fluid.def("some.layer", {});</script>
        <script type="${fluid.inertScriptType}">fluid.def("other.layer", {});</script>
        <script src="katex.js" fluid-client defer></script>
        <script>console.log("page");</script>`;
    assert.deepEqual([...holder.querySelectorAll("script")].map(fluid.classifyScriptNode),
        ["framework", "injection", "injection", "client", "page"], "Each script classified");
});

fluid.def("fluid.tests.fragmentSlots", {
    $layers: "fluid.component",
    links: ["a.css", "b.css"],
    tags: ["x", "y"],
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div><span class="first">First</span><fluid-fragment @id="linkTags"></fluid-fragment><fluid-fragment @id="single"></fluid-fragment><p @id="tagLinks" class="tags"></p><span class="last">Last</span></div>`
        }
    },
    linkTags: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{fragmentSlots}.links",
                valueAs: "link"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<link rel="stylesheet" href="@{link}">`
                }
            }
        }
    },
    single: {
        $component: {
            $layers: "fluid.component",
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    elideParent: false,
                    template: `<em>one</em><em>two</em>`
                }
            }
        }
    },
    tagLinks: {
        $component: {
            $layers: "fluid.component",
            $for: {
                source: "{fragmentSlots}.tags",
                valueAs: "tag"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    elideParent: false,
                    template: `<a href="/tags/@{tag}/">@{tag}</a>&nbsp;`
                }
            }
        }
    }
});

QUnit.test("Fragment slots and list members with several top-level nodes render no wrapping elements", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.fragmentSlots({container});
    fluid.cell.stabilize();
    const first = qs(".first", container);
    assert.deepEqual(fluid.tests.childSummary(container), ["span.first", "link", "link", "em", "em", "p.tags", "span.last"],
        "Members of a list and nodes of a child rendered in place of their fragment slots");
    assert.deepEqual(qsa("link", container).map(link => link.getAttribute("href")), ["a.css", "b.css"], "List members rendered");
    assert.deepEqual([fluid.tests.childSummary(qs(".tags", container)), qs(".tags", container).textContent], [["a", "a"], "x\u00a0y\u00a0"],
        "Both top-level nodes of each list member rendered, without wrapping elements");

    that.links = ["c.css"];
    fluid.cell.stabilize();
    assert.deepEqual(fluid.tests.childSummary(container), ["span.first", "link", "em", "em", "p.tags", "span.last"],
        "Fragment slot updated when its list changes");
    assert.equal(qs("link", container).getAttribute("href"), "c.css", "Updated member rendered");
    assert.equal(qs(".first", container), first, "Other nodes undisturbed");
    that.destroy();
});

QUnit.test("Only top-level blocks of an SFC define it", function (assert) {
    const vTree = fluid.parseHTMLToTree(`<script>fluid.def("x", {});</script><template><div><script src="client.js"></script><style>.a {}</style></div></template>`);
    assert.equal(fluid.sfcBlocks(vTree, "script").length, 1, "Script within the template is not a block of the SFC");
    assert.equal(fluid.sfcBlocks(vTree, "style").length, 0, "Style within the template is not a block of the SFC");
});

QUnit.module("Global dismissal");

/**
 * Press the pointer on an element, as a bubbling pointerdown event
 * @param {Element} element - The element to be pressed
 */
fluid.tests.press = function (element) {
    element.dispatchEvent(new Event("pointerdown", {bubbles: true}));
};

// A popup in the style of fluid.editor.menu, dismissed by a press outside its rendered container
fluid.def("fluid.tests.dismissablePopup", {
    $layers: "fluid.component",
    open: false,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="popup"><button class="inside"></button></div>`
        }
    },
    pressDismiss: {
        $effect: {
            func: "fluid.tests.dismissablePopup.pressDismiss",
            args: ["{self}", fluid.globalDismissalSignal, "{self}.view.renderedContainer"]
        }
    }
});

fluid.tests.dismissablePopup.pressDismiss = function (self, press, container) {
    // Whether the popup is open is consulted rather than depended upon - opening it is no reason to look again at a press
    // made before it was opened
    if (press && fluid.cell.untracked(() => self.open) && !container.contains(press.target)) {
        self.open = false;
    }
};

QUnit.test("A press anywhere in the document is recorded with its target", function (assert) {
    const container = qs(".container");
    container.innerHTML = `<button class="pressed"></button>`;
    const button = qs(".pressed", container);
    fluid.tests.press(button);
    assert.equal(fluid.globalDismissalSignal.get().target, button, "Pressed element recorded as the target");
    fluid.tests.press(container);
    assert.equal(fluid.globalDismissalSignal.get().target, container, "A press elsewhere replaces the record");
    container.innerHTML = "";
});

QUnit.test("Each press is recorded afresh, so that successive presses on one element notify", function (assert) {
    const container = qs(".container");
    container.innerHTML = `<button class="pressed"></button>`;
    const button = qs(".pressed", container);
    const notified = [];
    const effect = fluid.cell.effect(press => notified.push(press), [fluid.globalDismissalSignal]);
    fluid.cell.stabilize();
    notified.length = 0; // Disregard the run with the most recent press made before the effect was created
    fluid.tests.press(button);
    fluid.cell.stabilize();
    const first = fluid.globalDismissalSignal.get();
    fluid.tests.press(button);
    fluid.cell.stabilize();
    assert.notEqual(fluid.globalDismissalSignal.get(), first, "A fresh record for a second press on the same element");
    assert.equal(notified.length, 2, "Subscriber notified of both presses");
    assert.ok(notified.every(press => press.target === button), "Both presses recorded on the element");
    effect.dispose();
    container.innerHTML = "";
});

QUnit.test("A popup is dismissed by a press outside it, but not by one inside it", function (assert) {
    const container = qs(".container");
    const outside = document.createElement("div");
    container.appendChild(outside);
    // A press made before the popup is constructed, outside it, which its effect sees when it first runs
    fluid.tests.press(outside);
    const popupContainer = document.createElement("div");
    container.appendChild(popupContainer);
    const that = fluid.tests.dismissablePopup({container: popupContainer});
    fluid.cell.stabilize();
    that.open = true;
    fluid.cell.stabilize();
    assert.equal(that.open, true, "Opening the popup is not undone by the press made before it was opened");

    fluid.tests.press(qs(".inside", popupContainer));
    fluid.cell.stabilize();
    assert.equal(that.open, true, "Press inside the popup leaves it open");

    fluid.tests.press(outside);
    fluid.cell.stabilize();
    assert.equal(that.open, false, "Press outside the popup dismisses it");

    that.open = true;
    fluid.cell.stabilize();
    fluid.tests.press(outside);
    fluid.cell.stabilize();
    assert.equal(that.open, false, "Popup reopened is dismissed by a further press on the same outside element");

    that.destroy();
    container.innerHTML = "";
});

QUnit.test("A press whose propagation is stopped is still recorded", function (assert) {
    const container = qs(".container");
    container.innerHTML = `<div class="host"><button class="pressed"></button></div>`;
    const button = qs(".pressed", container);
    // A host such as a canvas, which takes presses within it as its own gestures
    qs(".host", container).addEventListener("pointerdown", e => e.stopPropagation());
    // The press is seen during capture, which a DOM such as linkedom's does not implement - check whether this one does
    const order = [];
    const captureProbe = () => order.push("capture");
    document.addEventListener("pointerdown", captureProbe, true);
    button.addEventListener("pointerdown", () => order.push("target"), {once: true});
    fluid.tests.press(button);
    document.removeEventListener("pointerdown", captureProbe, true);
    if (order[0] === "capture") {
        assert.equal(fluid.globalDismissalSignal.get().target, button, "Press recorded despite its propagation being stopped");
    } else {
        assert.ok(true, "This DOM has no capture phase, so recording a press whose propagation is stopped cannot be tested - run in a browser");
    }
    container.innerHTML = "";
});

// A dismissal listener bound to a supplied root rather than to the document
fluid.def("fluid.tests.localDismissal", {
    $layers: "fluid.globalDismissal",
    root: null,
    view: {
        $component: {
            container: "{fluid.tests.localDismissal}.root"
        }
    }
});

QUnit.test("Destroying a dismissal component removes its listener", function (assert) {
    // A detached root, from which presses do not reach the document's own listener
    const root = document.createElement("div");
    root.innerHTML = `<button class="pressed"></button>`;
    const button = qs(".pressed", root);
    const that = fluid.tests.localDismissal({root});
    fluid.cell.stabilize();
    fluid.tests.press(button);
    const record = fluid.globalDismissalSignal.get();
    assert.equal(record.target, button, "Press within the root recorded");

    that.destroy();
    fluid.cell.stabilize();
    fluid.tests.press(button);
    assert.equal(fluid.globalDismissalSignal.get(), record, "Press after destruction not recorded");
});

QUnit.module("Source tracking");

/** Each mirroring of shared state by an instance of fluid.tests.selfWidget, as [tag, member, value] */
fluid.tests.mirrored = [];

fluid.def("fluid.tests.selfWidget", {
    $layers: "fluid.component",
    tag: "",
    container: null,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            container: "{fluid.tests.selfWidget}.container",
            template: `<div><button @onclick="{fluid.tests.selfWidget}.bump()"/><input value="@{{fluid.tests.selfSourced}.text}"/></div>`
        }
    },
    bump: {
        $method: {
            args: "{fluid.tests.selfSourced}",
            func: owner => owner.level++
        }
    },
    // As for a third-party widget, which needs to be told of each change it did not originate itself
    mirrorLevel: {
        $effect: {
            func: (tag, level) => fluid.tests.mirrored.push([tag, "level", level]),
            args: ["{self}.tag", "{fluid.tests.selfSourced}.level"],
            excludeSource: "self"
        }
    },
    mirrorText: {
        $effect: {
            func: (tag, text) => fluid.tests.mirrored.push([tag, "text", text]),
            args: ["{self}.tag", "{fluid.tests.selfSourced}.text"],
            excludeSource: "self"
        }
    }
});

fluid.def("fluid.tests.selfSourced", {
    $layers: "fluid.component",
    level: 0,
    text: "",
    // Derived from level by an effect, whose write carries the source of the change which triggered it - FLUID-5498
    doubled: 0,
    doubleLevel: {
        $effect: {
            func: (self, level) => self.doubled = 2 * level,
            args: ["{self}", "{self}.level"]
        }
    },
    containerA: null,
    containerB: null,
    widgetA: {
        $component: {
            $layers: "fluid.tests.selfWidget",
            tag: "A",
            container: "{fluid.tests.selfSourced}.containerA",
            mirrorDoubled: {
                $effect: {
                    func: doubled => fluid.tests.mirrored.push(["A", "doubled", doubled]),
                    args: "{fluid.tests.selfSourced}.doubled",
                    excludeSource: "self"
                }
            }
        }
    },
    widgetB: {
        $component: {
            $layers: "fluid.tests.selfWidget",
            tag: "B",
            container: "{fluid.tests.selfSourced}.containerB"
        }
    }
});

QUnit.test("An effect excluding \"self\" is not notified of changes its own component's view originated", function (assert) {
    const container = qs(".container");
    container.innerHTML = `<div class="a"></div><div class="b"></div>`;
    const that = fluid.tests.selfSourced({containerA: qs(".a", container), containerB: qs(".b", container)});
    fluid.cell.stabilize();
    const takeMirrored = function () {
        fluid.cell.stabilize();
        const togo = fluid.tests.mirrored.slice();
        fluid.tests.mirrored.length = 0;
        return togo;
    };
    assert.deepEqual(takeMirrored(), [["A", "level", 0], ["A", "text", ""], ["A", "doubled", 0], ["B", "level", 0], ["B", "text", ""]],
        "Each widget mirrors the initial state");

    qs(".a button", container).dispatchEvent(new MouseEvent("click"));
    assert.equal(that.level, 1, "Click in widget A updated the shared state");
    assert.deepEqual(takeMirrored(), [["B", "level", 1]],
        "Only widget B mirrors a change originated by widget A - A does not, nor the change it caused via an effect");

    qs(".b button", container).dispatchEvent(new MouseEvent("click"));
    assert.deepEqual(takeMirrored(), [["A", "level", 2], ["A", "doubled", 4]],
        "Only widget A mirrors a change originated by widget B, including the change it caused via an effect");

    const inputA = qs(".a input", container);
    inputA.value = "Typed";
    inputA.dispatchEvent(new Event("input"));
    assert.equal(that.text, "Typed", "Input in widget A updated the shared state");
    assert.deepEqual(takeMirrored(), [["B", "text", "Typed"]], "Only widget B mirrors input to widget A");

    that.level = 5;
    assert.deepEqual(takeMirrored(), [["A", "level", 5], ["B", "level", 5], ["A", "doubled", 10]],
        "Both widgets mirror a change originated elsewhere");
    that.destroy();
});

fluid.def("fluid.tests.assignThroughSubcomponent", {
    $layers: "fluid.component",
    open: false,
    state: {
        $reactiveRoot: {colour: "white"}
    },
    panel: {
        $component: {
            $layers: "fluid.component",
            shown: false
        }
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div>
                <button class="show" @onclick="{self}.panel.shown = true">Show</button>
                <button class="toggle" @onclick="{self}.panel.shown = !{self}.panel.shown">Toggle</button>
                <button class="own" @onclick="{self}.open = true">Open</button>
                <button class="colour" @onclick="{self}.state.colour = crimson">Colour</button>
                <span class="shown">@{panel.shown}</span>
            </div>`
        }
    }
});

QUnit.test("Event assignment to a path passing through a subcomponent writes into the subcomponent", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.assignThroughSubcomponent({container});
    fluid.cell.stabilize();
    const click = selector => {
        qs(selector, container).dispatchEvent(new MouseEvent("click", {bubbles: true}));
        fluid.cell.stabilize();
    };
    click(".show");
    assert.equal(that.panel.shown, true, "Assignment written into the subcomponent");
    assert.equal(qs(".shown", container).textContent, "true", "Binding to the subcomponent's member updated");
    click(".toggle");
    assert.equal(that.panel.shown, false, "Negated assignment through the subcomponent toggles its member");
    click(".own");
    assert.equal(that.open, true, "Assignment to a member of the component itself is unaffected");
    click(".colour");
    assert.equal(that.state.colour, "crimson", "Assignment beneath a reactive root is unaffected");
    that.destroy();
});

// Merging of the classes of a container written both by the element bearing @id in its parent's template, and by the
// root of its own template elided onto it - either may re-render without the other, in either order

fluid.tests.classMerge = {
    // A bound class of the element bearing @id is written by interpolation - a @class on it belongs to the child's
    // placeholder template
    parentTemplate: variant => `<div class="wrap"><span @id="child" class="slot slot-${variant} @{pClass}"></span><i>${variant}</i></div>`,
    pClass: pOn => pOn ? "p-on" : "",
    childTemplate: variant => `<span class="kid kid-${variant}" @class="c-on:@{cOn}">${variant}</span>`
};

fluid.def("fluid.tests.classMerge", {
    $layers: "fluid.component",
    variant: "a",
    pOn: false,
    pClass: "$compute:fluid.tests.classMerge.pClass({self}.pOn)",
    child: {
        $component: {
            $layers: "fluid.component",
            variant: "a",
            cOn: false,
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: "$compute:fluid.tests.classMerge.childTemplate({$parent}.variant)"
                }
            }
        }
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: "$compute:fluid.tests.classMerge.parentTemplate({$parent}.variant)"
        }
    }
});

/**
 * Render a fresh instance in a given state, and report the class attributes of its elements
 * @param {Object} state - Members `variant`, `pOn`, and `child`, holding `variant` and `cOn`
 * @return {Object} Members `slot` and `wrap`, the class attributes of the container of the child and of the root
 */
fluid.tests.classMerge.freshClasses = function (state) {
    const container = document.createElement("div");
    qs(".container").appendChild(container);
    const that = fluid.tests.classMerge({container, variant: state.variant, pOn: state.pOn,
        child: {$component: {variant: state.child.variant, cOn: state.child.cOn}}});
    fluid.cell.stabilize();
    const togo = {slot: qs(".slot", container).getAttribute("class"), wrap: container.getAttribute("class")};
    that.destroy();
    container.remove();
    return togo;
};

QUnit.test("Classes of a container are merged from its parent's template and its own, in any order of rendering", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.classMerge({container});
    fluid.cell.stabilize();
    const slot = () => qs(".slot", container);
    const slotClass = () => slot().getAttribute("class");
    assert.equal(slotClass(), "slot slot-a kid kid-a", "Classes of the parent's template and the child's root merged");
    assert.equal(container.getAttribute("class"), "wrap container", "Container's own class kept beside its template root's");
    const element = slot();

    that.variant = "b";
    fluid.cell.stabilize();
    assert.equal(slotClass(), "slot slot-b kid kid-a", "Parent re-rendering alone keeps the child's classes");
    assert.equal(slot(), element, "Container element kept");

    that.child.variant = "b";
    fluid.cell.stabilize();
    assert.equal(slotClass(), "slot slot-b kid kid-b", "Child re-rendering alone keeps the parent's classes");

    that.pOn = true;
    fluid.cell.stabilize();
    assert.equal(slotClass(), "slot slot-b p-on kid kid-b", "Bound class of the parent's template merged");
    that.child.cOn = true;
    fluid.cell.stabilize();
    assert.equal(slotClass(), "slot slot-b p-on kid kid-b c-on", "Bound class of the child's root merged");

    slot().classList.add("widget");
    that.variant = "c";
    that.child.variant = "c";
    fluid.cell.stabilize();
    assert.equal(slotClass(), "slot slot-c p-on kid kid-c c-on widget", "Class added by another agent kept through re-rendering of both, after those of the templates");

    that.pOn = false;
    fluid.cell.stabilize();
    that.child.cOn = false;
    that.variant = "d";
    fluid.cell.stabilize();
    assert.equal(slotClass(), "slot slot-d kid kid-c widget", "Classes no longer written are removed, and others kept");
    assert.equal(slot(), element, "Container element kept throughout");

    // The same final state reached by the opposite order of changes
    const other = document.createElement("div");
    container.appendChild(other);
    const reversed = fluid.tests.classMerge({container: other});
    fluid.cell.stabilize();
    reversed.child.cOn = true;
    reversed.child.variant = "c";
    fluid.cell.stabilize();
    reversed.pOn = true;
    reversed.variant = "d";
    fluid.cell.stabilize();
    reversed.child.cOn = false;
    fluid.cell.stabilize();
    reversed.pOn = false;
    fluid.cell.stabilize();
    assert.equal(qs(".slot", other).getAttribute("class"), "slot slot-d kid kid-c", "Opposite order of re-rendering gives the same classes");
    reversed.destroy();
    other.remove();

    const fresh = fluid.tests.classMerge.freshClasses({variant: "d", pOn: false, child: {variant: "c", cOn: false}});
    assert.equal(fresh.slot, "slot slot-d kid kid-c", "A fresh rendering in the same state gives the same classes");
    that.destroy();
});

QUnit.test("Classes of claimed markup from an earlier rendering are rewritten, dropping any no longer written", function (assert) {
    const container = qs(".container");
    const first = fluid.tests.classMerge({container, pOn: true, child: {$component: {cOn: true}}});
    fluid.cell.stabilize();
    const markup = container.innerHTML;
    first.destroy();
    assert.ok(markup.includes("class=\"slot slot-a p-on kid kid-a c-on\""), "Earlier rendering holds the bound classes");

    // A host with a class of its own, rendered into as by a static build, which records the class as the host's own
    const builtHost = document.createElement("div");
    builtHost.setAttribute("class", "host");
    container.appendChild(builtHost);
    const built = fluid.tests.classMerge({container: builtHost, pOn: true, child: {$component: {cOn: true}}});
    fluid.cell.stabilize();
    assert.equal(builtHost.getAttribute("fluid-own-class"), "host", "Own class of a fresh container recorded");
    const hostMarkup = builtHost.outerHTML;
    built.destroy();
    builtHost.remove();

    // As for a page written by a static build, then booted in a state in which the bound classes are off
    const holder = document.createElement("div");
    holder.innerHTML = hostMarkup;
    const host = holder.firstElementChild;
    container.appendChild(host);
    const staticSlot = qs(".slot", host);
    const that = fluid.tests.classMerge({container: host});
    fluid.cell.stabilize();
    assert.equal(qs(".slot", host), staticSlot, "Container of the child claimed from the markup");
    assert.equal(staticSlot.getAttribute("class"), "slot slot-a kid kid-a", "Classes no longer written dropped from claimed markup");
    assert.equal(host.getAttribute("class"), "wrap host", "Own class of a claimed container kept");
    that.child.variant = "b";
    fluid.cell.stabilize();
    assert.equal(staticSlot.getAttribute("class"), "slot slot-a kid kid-b", "Claimed container merges thereafter");
    that.destroy();
    host.remove();
});

// A child rendered onto the slot of its parent, whose template may be pending, as one loaded from elsewhere is until it
// arrives - so that the parent renders the slot long before the child's root writes it
fluid.def("fluid.tests.slotClaim", {
    $layers: "fluid.component",
    child: {
        $component: {
            $layers: "fluid.component",
            template: fluid.unavailable({message: "Pending I/O", variety: "pending"}),
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: "{$parent}.template"
                }
            }
        }
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="wrap"><div class="slot" title="slot" @id="child"></div></div>`
        }
    }
});

fluid.tests.slotClaim.childTemplates = {
    a: `<div class="kid kid-a" role="separator" tabindex="0"></div>`,
    b: `<div class="kid kid-b" role="separator"></div>`
};

QUnit.test("The slot of a child claimed from earlier markup keeps what the child rendered until the child renders afresh", function (assert) {
    const container = qs(".container");
    // As a static build renders the page, once the child's template has arrived
    const builtHost = document.createElement("div");
    container.appendChild(builtHost);
    const built = fluid.tests.slotClaim({container: builtHost, child: {$component: {template: fluid.tests.slotClaim.childTemplates.a}}});
    fluid.cell.stabilize();
    const hostMarkup = builtHost.outerHTML;
    built.destroy();
    builtHost.remove();
    assert.ok(hostMarkup.includes("class=\"slot kid kid-a\""), "Earlier rendering holds the classes of both templates on the slot");

    // As the page boots over that markup, before the child's template has arrived
    const holder = document.createElement("div");
    holder.innerHTML = hostMarkup;
    const host = holder.firstElementChild;
    container.appendChild(host);
    const staticSlot = qs(".slot", host);
    const that = fluid.tests.slotClaim({container: host});
    fluid.cell.stabilize();
    assert.equal(qs(".slot", host), staticSlot, "Container of the child claimed from the markup");
    assert.equal(staticSlot.getAttribute("class"), "slot kid kid-a", "Classes of the child's root kept whilst its template is pending");
    assert.equal(staticSlot.getAttribute("role"), "separator", "Attribute of the child's root kept whilst its template is pending");
    assert.equal(staticSlot.getAttribute("tabindex"), "0", "Every attribute of the child's root kept whilst its template is pending");
    assert.equal(staticSlot.getAttribute("title"), "slot", "Attribute of the parent's template written");

    // The child's template arrives, no longer writing some of what the earlier markup holds
    that.child.template = fluid.tests.slotClaim.childTemplates.b;
    fluid.cell.stabilize();
    assert.equal(qs(".slot", host), staticSlot, "Container of the child kept as the child renders");
    assert.equal(staticSlot.getAttribute("class"), "slot kid kid-b", "Classes the child's root no longer writes dropped once it renders");
    assert.equal(staticSlot.getAttribute("role"), "separator", "Attribute the child's root writes kept");
    assert.notOk(staticSlot.hasAttribute("tabindex"), "Attribute the child's root no longer writes removed once it renders");
    assert.equal(staticSlot.getAttribute("title"), "slot", "Attribute of the parent's template kept");
    that.destroy();
    host.remove();
});

// An island within verbatim markup whose root binds attributes onto the island's element, as ponder's figure shortcode
// writes its `style` from its parameters. Its template may be pending, as an SFC's is until it has loaded, so that the
// verbatim markup renders the island's element long before the island's root writes it
fluid.def("fluid.tests.styledIsland", {
    $layers: "fluid.component",
    alt: "$compute:fluid.tests.styledIsland.alt({self}.dataset)",
    template: "{fluid.tests.styledIslandContent}.islandTemplate",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: "{$parent}.template"
        }
    }
});

fluid.tests.styledIsland.template = `<div class="box" style="@{fluid.tests.styledIsland.maxWidth({self}.dataset.width)}"><img class="inner" alt="@{alt}" src="@{dataset.src}"/></div>`;

fluid.tests.styledIsland.alt = function (dataset) {
    return dataset.caption;
};

fluid.tests.styledIsland.maxWidth = function (width) {
    return width ? "max-width:" + width : null;
};

fluid.def("fluid.tests.styledIslandContent", {
    $layers: "fluid.component",
    islandTemplate: fluid.tests.styledIsland.template,
    html: `<p>Before</p><div fluid-layers="fluid.tests.styledIsland" data-width="800px" data-caption="A caption" data-src="a.png"></div><p>After</p>`,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            verbatim: true,
            template: "{$parent}.html"
        }
    }
});

QUnit.test("An island within verbatim markup claimed from earlier markup keeps what its root writes", function (assert) {
    const container = qs(".container");
    // As a static build renders the content
    const builtHost = document.createElement("div");
    container.appendChild(builtHost);
    const built = fluid.tests.styledIslandContent({container: builtHost});
    fluid.cell.stabilize();
    const builtMarkup = builtHost.innerHTML;
    built.destroy();
    builtHost.remove();
    assert.ok(builtMarkup.includes("style=\"max-width:800px\""), "Earlier rendering holds the attribute the island's root binds");

    // As a client boots the content over that markup
    const host = document.createElement("div");
    host.innerHTML = builtMarkup;
    container.appendChild(host);
    const staticIsland = qs(".box", host);
    const that = fluid.tests.styledIslandContent({container: host, islandTemplate: fluid.unavailable({message: "Pending I/O", variety: "pending"})});
    fluid.cell.stabilize();
    assert.equal(qs(".box", host), staticIsland, "Island's element claimed from the markup");
    assert.equal(staticIsland.getAttribute("style"), "max-width:800px", "Attribute of the island's root kept whilst its template is pending");
    that.islandTemplate = fluid.tests.styledIsland.template;
    fluid.cell.stabilize();
    assert.equal(staticIsland.getAttribute("style"), "max-width:800px", "Attribute bound by the island's root written once its template arrives");
    assert.equal(qs(".inner", host).getAttribute("alt"), "A caption", "Attribute bound to a computed member of the island written");
    assert.equal(staticIsland.getAttribute("data-width"), "800px", "Attribute of the verbatim markup kept");
    assert.equal(host.innerHTML, builtMarkup, "Content renders as it was built");
    that.destroy();
    host.remove();
});

fluid.def("fluid.tests.lateIslandContent", {
    $layers: "fluid.component",
    html: `<p>Before</p><div fluid-layers="fluid.tests.lateIsland" data-caption="A caption" data-src="a.png"></div>`,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            verbatim: true,
            template: "{$parent}.html"
        }
    }
});

QUnit.test("An island whose layer is defined after the markup holding it has rendered renders its bindings", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.lateIslandContent({container});
    fluid.cell.stabilize();
    // As an island's SFC arrives after the content holding it has rendered - its layer defined, and then the functions
    // its layer uses, by the remainder of the SFC's script
    fluid.def("fluid.tests.lateIsland", {
        $layers: "fluid.component",
        alt: "$compute:fluid.tests.lateIsland.alt({self}.dataset)",
        view: {
            $component: {
                $layers: "fluid.templateViewComponent",
                template: `<figure class="late"><img alt="@{alt}" src="@{dataset.src}"/><figcaption>@{dataset.caption}</figcaption></figure>`
            }
        }
    });
    fluid.tests.lateIsland.alt = dataset => dataset.caption;
    fluid.cell.stabilize();
    const img = qs(".late img", container);
    assert.ok(img, "Island rendered once its layer is defined");
    assert.equal(img?.getAttribute("src"), "a.png", "Attribute bound to the island's dataset written");
    assert.equal(img?.getAttribute("alt"), "A caption", "Attribute bound to a computed member of the island written");
    assert.equal(qs(".late figcaption", container)?.textContent, "A caption", "Text bound to the island's dataset written");
    that.destroy();
});

fluid.def("fluid.tests.potentiaIsland", {
    $layers: "fluid.component",
    count: 0,
    label: "unlabelled",
    inner: {
        $component: {
            $layers: "fluid.component",
            note: "default note"
        }
    },
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="counter"><span class="count">@{count}</span> <span class="label">@{label}</span> <span class="note">@{inner.note}</span> <span class="src">@{dataset.src}</span></div>`
        }
    }
});

fluid.def("fluid.tests.potentiaContent", {
    $layers: "fluid.component",
    html: `<p>Before</p><div fluid-layers="fluid.tests.potentiaIsland" fluid-id="counter" data-src="a.png" ` +
        `fluid-potentia='{"$layers": "ignored", "count": 3, "label": "Three", "inner": {"$component": {"note": "nested"}}}'></div>`,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            verbatim: true,
            template: "{$parent}.html"
        }
    }
});

QUnit.test("An island configured by its potentia attribute", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.potentiaContent({container});
    fluid.cell.stabilize();
    const island = that[fluid.metadataSymbol].childComponents.counter;
    assert.ok(island, "The island is the member its fluid-id names");
    assert.equal(island.that.count, 3, "The island's member is configured by its potentia");
    assert.equal(qs(".counter .count", container).textContent, "3", "The island renders the configured value");
    assert.equal(qs(".counter .label", container).textContent, "Three", "A second member configured");
    assert.equal(qs(".counter .note", container).textContent, "nested", "A nested component configured by a $component record");
    assert.equal(qs(".counter .src", container).textContent, "a.png", "The island's dataset is given beside its potentia");
    assert.ok(qs("[fluid-id=\"counter\"]", container).hasAttribute("fluid-potentia"), "The element keeps its potentia once rendered");
    assert.ok(fluid.hasLayer(island.that, "fluid.tests.potentiaIsland") && !fluid.hasLayer(island.that, "ignored"),
        "The island's layers are those its element names, not any in its potentia");

    that.html = `<div fluid-layers="fluid.tests.potentiaIsland" fluid-id="counter" fluid-potentia='{"count": '></div>`;
    fluid.cell.stabilize();
    const broken = that[fluid.metadataSymbol].childComponents.counter;
    assert.ok(fluid.isUnavailable(broken.that.potentiaError), "Potentia which is not JSON is reported as an unavailable value");
    assert.ok(/not valid JSON/.test(JSON.stringify(broken.that.potentiaError)), "Saying what is wrong with it: " + JSON.stringify(broken.that.potentiaError));
    assert.equal(qs(".counter .count", container).textContent, "0", "The island renders from its layers' defaults");
    that.destroy();
});

QUnit.test("An element booting itself is configured by its dataset and potentia attribute, as an island is", async function (assert) {
    const container = qs(".container");
    container.innerHTML = `<div class="booted" fluid-layers="fluid.tests.potentiaIsland" data-src="b.png" ` +
        `fluid-potentia='{"count": 7, "inner": {"$component": {"note": "booted"}}}'></div>`;
    const element = qs(".booted", container);
    // The document's self-boot effect observes the document for such elements, and reports asynchronously
    const deadline = Date.now() + 2000;
    while (!fluid.viewContainerRegistry.get(element) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    fluid.cell.stabilize();
    const shadow = fluid.viewContainerRegistry.get(element);
    assert.ok(shadow, "The element is booted");
    assert.equal(shadow.that.count, 7, "Configured by its potentia");
    assert.equal(shadow.that.dataset.src, "b.png", "Given its dataset");
    assert.equal(qs(".count", element)?.textContent, "7", "Rendered from its potentia");
    assert.equal(qs(".note", element)?.textContent, "booted", "A nested component configured");
    shadow.that.destroy();
    container.innerHTML = "";
});

QUnit.test("A page whose own component tree renders it boots none of its elements alone", async function (assert) {
    const html = document.documentElement;
    const container = qs(".container");
    html.setAttribute(fluid.pageBootAttribute, "");
    container.innerHTML = `<div class="unbooted" fluid-layers="fluid.tests.island" data-src="a.png"></div>`;
    // The document's self-boot effect observes the document for such elements, and reports asynchronously
    await new Promise(resolve => setTimeout(resolve, 50));
    fluid.cell.stabilize();
    const island = qs(".unbooted", container);
    assert.notOk(fluid.viewContainerRegistry.get(island), "The element bearing fluid-layers is not booted as a free component");
    assert.equal(island.children.length, 0, "Nothing is rendered into it");
    html.removeAttribute(fluid.pageBootAttribute);
    container.innerHTML = "";
});

fluid.def("fluid.tests.pendingClass", {
    $layers: "fluid.component",
    extra: fluid.unavailable({message: "Pending I/O", variety: "pending"}),
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="box @{extra}"><span class="inner">Text</span></div>`
        }
    }
});

QUnit.test("An interpolated class whose value is pending contributes no classes, rather than an error", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.pendingClass({container});
    fluid.cell.stabilize();
    assert.ok(qs(".inner", container), "Element rendered whilst its class is pending");
    assert.equal(qsa(".fl-error", container).length, 0, "No error rendered");
    assert.equal(container.getAttribute("class"), "container", "Pending binding contributes no classes");
    that.extra = "ready";
    fluid.cell.stabilize();
    assert.equal(container.getAttribute("class"), "box ready container", "Classes contributed once available");
    that.destroy();
});

fluid.def("fluid.tests.foreignAttrs", {
    $layers: "fluid.component",
    variant: "a",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: "$compute:fluid.tests.foreignAttrs.template({$parent}.variant)"
        }
    }
});

fluid.tests.foreignAttrs.template = variant => variant === "a" ?
    `<div><input class="field" title="first" data-variant="a"/><span>a</span></div>` :
    `<div><input class="field" data-variant="b"/><span>b</span></div>`;

QUnit.test("Attributes written by other agents survive re-rendering, whilst those a template ceases to write are removed", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.foreignAttrs({container});
    fluid.cell.stabilize();
    const input = qs(".field", container);
    // As a widget might mark an element of the template
    input.setAttribute("data-ready", "true");
    that.variant = "b";
    fluid.cell.stabilize();
    assert.equal(qs(".field", container), input, "Element reused on re-rendering");
    assert.equal(input.getAttribute("data-ready"), "true", "Attribute written by another agent survives re-rendering");
    assert.notOk(input.hasAttribute("title"), "Attribute the template no longer writes is removed");
    assert.equal(input.getAttribute("data-variant"), "b", "Attribute the template writes is updated");
    that.destroy();
});

// A component whose template designates a child with @id, and which turns over on its first write to a member - see
// fluid.pathToLive and fluid.templateSlotRecord

fluid.def("fluid.tests.stableSlotOuter", {
    $layers: "fluid.component",
    flag: false,
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: `<div class="outer"><div class="outerInner" @id="inner"></div><div class="slotted" @id="slotted"><span class="markup">Slot markup</span></div></div>`
        }
    },
    inner: {
        $component: {
            $layers: "fluid.tests.nestedInner"
        }
    },
    // A child with no template of its own, which renders the markup found at its slot
    slotted: {
        $component: {
            $layers: "fluid.component"
        }
    }
});

QUnit.test("Children designated by @id do not turn over when their parent rerenders its template - FLUID-7032 follow-up", function (assert) {
    const container = qs(".container");
    const that = fluid.tests.stableSlotOuter({container});
    fluid.cell.stabilize();
    const shadow = that[fluid.metadataSymbol];
    const innerShadow = shadow.childComponents.inner, slottedShadow = shadow.childComponents.slotted;
    const before = {
        outer: shadow.computer._value,
        inner: innerShadow.computer._value,
        innerView: innerShadow.childComponents.view.computer._value,
        slottedView: slottedShadow.childComponents.view.computer._value,
        innerNode: container.querySelector(".inner"),
        markupNode: container.querySelector(".markup")
    };
    assert.equal(before.innerNode.textContent, "Text from inner", "Inner child rendered");
    assert.equal(before.markupNode?.textContent, "Slot markup", "Slotted child renders the markup at its slot");

    // The first write to a member which is not yet live remerges the parent, which turns over and rerenders its template
    that.flag = true;
    fluid.cell.stabilize();
    assert.notEqual(shadow.computer._value, before.outer, "The parent turned over");
    assert.equal(innerShadow.computer._value, before.inner, "The inner child did not turn over");
    assert.equal(innerShadow.childComponents.view.computer._value, before.innerView, "Nor did its view");
    assert.equal(slottedShadow.childComponents.view.computer._value, before.slottedView, "Nor did the slotted child's view");
    assert.equal(container.querySelector(".inner"), before.innerNode, "The inner child's markup is undisturbed");
    assert.equal(container.querySelector(".markup"), before.markupNode, "The slotted child's markup is undisturbed");

    // A change to the markup at a slot still reaches the child which renders it, through its slot's cell
    const restoreDef = fluid.tests.updateRestoreDef("fluid.tests.stableSlotOuter", {
        ...fluid.def("fluid.tests.stableSlotOuter"),
        view: {
            $component: {
                $layers: "fluid.templateViewComponent",
                template: `<div class="outer"><div class="outerInner" @id="inner"></div><div class="slotted" @id="slotted"><span class="markup">New markup</span></div></div>`
            }
        }
    });
    fluid.cell.stabilize();
    assert.equal(container.querySelector(".markup")?.textContent, "New markup", "Changed markup at the slot rendered by the slotted child");
    assert.equal(innerShadow.computer._value, before.inner, "The inner child, whose slot is unchanged, still did not turn over");
    assert.equal(container.querySelector(".inner"), before.innerNode, "Its markup is still undisturbed");
    restoreDef();
    that.destroy();
});

QUnit.test("A container given to a component borrowing its subcomponent's view refines that view", function (assert) {
    fluid.def("fluid.tests.view.borrowed", {
        $layers: "fluid.component",
        label: "Borrowed",
        view: {
            $component: {
                $layers: "fluid.templateViewComponent",
                template: "<div class=\"borrowed\">@{label}</div>"
            }
        }
    });
    fluid.def("fluid.tests.view.borrowingUmbrella", {
        $layers: "fluid.component",
        first: {
            $component: {
                $layers: "fluid.tests.view.borrowed"
            }
        },
        view: "{first}.view"
    });
    const container = qs(".container");
    // The creator function forwards its container to view.$component.container, which refines the borrowed view
    const that = fluid.tests.view.borrowingUmbrella({container});
    fluid.cell.stabilize();
    assert.equal(that.view, that.first.view, "The view is still borrowed");
    // The view's template elides its root onto the container
    assert.ok(container.classList.contains("borrowed") && container.textContent === "Borrowed",
        "The borrowed view renders into the container given");
    that.destroy();
});
