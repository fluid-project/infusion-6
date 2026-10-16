/* global QUnit */

"use strict";

QUnit.module("Todo List Demo Tests");

QUnit.config.reorder = false;

const {qsa, click} = fluid.tests.todo;

QUnit.test("Demo SFCs load and render initial todos", async function (assert) {
    const {that, container} = await fluid.tests.todo.makeApp();
    assert.ok(fluid.def("fluid.demos.todoItem"), "Item layer loaded from demo SFC");
    fluid.tests.todo.checkRendering(assert, that, container, fluid.tests.todo.initialTodos, "Initial");

    const items = that.todoList.todoItems.list;
    assert.equal(items[1].itemIndex, 1, "Iteration key exposed as member of item");
    assert.deepEqual(fluid.unwrapProxy(items[1].todo), fluid.tests.todo.initialTodos[1], "Iteration value exposed as member of item");
    that.destroy();
});

QUnit.test("Toggle through local method writes upstream to source todos", async function (assert) {
    const {that, container} = await fluid.tests.todo.makeApp();
    const initialSource = fluid.unwrapProxy(that.todoList.todos);
    const initialCopy = fluid.copy(initialSource);

    const rows = qsa(".todo", container);
    click(rows[0]);

    const toggled = fluid.copy(fluid.tests.todo.initialTodos);
    toggled[0].completed = true;
    assert.deepEqual(fluid.tests.todo.sourceTodos(that), toggled, "Source todos in list updated");
    assert.deepEqual(initialSource, initialCopy, "Original source data not mutated in place");
    fluid.tests.todo.checkRendering(assert, that, container, toggled, "Toggled index 0");

    const item = that.todoList.todoItems.list[0];
    const itemShadow = item[fluid.proxySymbol].shadow;
    assert.deepEqual(Object.keys(itemShadow.liveLayer), [], "No write was made into the item's own live layer");

    click(rows[0]);
    fluid.tests.todo.checkRendering(assert, that, container, fluid.tests.todo.initialTodos, "Toggled index 0 back");

    click(rows[1]);
    click(rows[2]);
    const toggledTwo = fluid.copy(fluid.tests.todo.initialTodos);
    toggledTwo[1].completed = false;
    toggledTwo[2].completed = true;
    fluid.tests.todo.checkRendering(assert, that, container, toggledTwo, "Toggled indices 1 and 2");
    that.destroy();
});

QUnit.test("Direct writes through iteration variable proxy hit source", async function (assert) {
    const {that, container} = await fluid.tests.todo.makeApp();
    const item = that.todoList.todoItems.list[2];
    item.todo.text = "Sleep soundly";
    fluid.cell.stabilize();

    const expected = fluid.copy(fluid.tests.todo.initialTodos);
    expected[2].text = "Sleep soundly";
    assert.deepEqual(fluid.tests.todo.sourceTodos(that), expected, "Source todos in list updated");
    fluid.tests.todo.checkRendering(assert, that, container, expected, "Text written via item");
    that.destroy();
});

QUnit.test("Delete of iteration variable splices source todos", async function (assert) {
    const {that, container} = await fluid.tests.todo.makeApp();
    const buttons = qsa("button.delete", container);
    click(buttons[1]);

    const expected = fluid.tests.todo.initialTodos.filter((todo, index) => index !== 1);
    assert.deepEqual(fluid.tests.todo.sourceTodos(that), expected, "Element removed from source todos");
    fluid.tests.todo.checkRendering(assert, that, container, expected, "Deleted index 1");

    // The item at index 1 is now drawn from what was previously index 2 - toggling it should target the right element
    click(qsa(".todo", container)[1]);
    const toggled = fluid.copy(expected);
    toggled[1].completed = true;
    fluid.tests.todo.checkRendering(assert, that, container, toggled, "Toggled slid item");

    delete that.todoList.todoItems.list[0].todo;
    fluid.cell.stabilize();
    fluid.tests.todo.checkRendering(assert, that, container, toggled.slice(1), "Deleted index 0 via proxy");

    click(qsa("button.delete", container)[0]);
    fluid.tests.todo.checkRendering(assert, that, container, [], "Deleted last item");
    that.destroy();
});

QUnit.test("Insert new todo and operate on it", async function (assert) {
    const {that, container} = await fluid.tests.todo.makeApp();
    fluid.tests.todo.enterTodo(container, "Think about something");

    const expected = fluid.tests.todo.initialTodos.concat([{text: "Think about something", completed: false}]);
    fluid.tests.todo.checkRendering(assert, that, container, expected, "Inserted item");

    click(qsa(".todo", container)[3]);
    const toggled = fluid.copy(expected);
    toggled[3].completed = true;
    fluid.tests.todo.checkRendering(assert, that, container, toggled, "Toggled inserted item");

    click(qsa("button.delete", container)[0]);
    fluid.tests.todo.checkRendering(assert, that, container, toggled.slice(1), "Deleted first item after insert");
    that.destroy();
});
