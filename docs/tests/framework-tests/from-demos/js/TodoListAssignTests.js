/* global QUnit */

"use strict";

QUnit.module("Todo List With Assignees Demo Tests");

QUnit.config.reorder = false;

const {qs, qsa, click, choose, check} = fluid.tests.todo;

/**
 * Determine whether the "Filter Completed" control has rendered - its UISelect layer is loaded lazily via an $importMap.
 * @param {HTMLElement} container - The container into which the app is rendered
 * @return {Boolean} `true` if the filter control has rendered
 */
fluid.tests.todo.filterReady = container => qsa("select.fl-control option", container).length === 3;

/**
 * Find the select element of the filter control with the supplied label.
 * @param {HTMLElement} container - The container into which the app is rendered
 * @param {String} label - The text of the filter control's label
 * @return {HTMLSelectElement} The select element of the filter control
 */
fluid.tests.todo.filterSelect = function (container, label) {
    const holder = qsa(".fl-control-holder", container).find(element => qs("label", element).textContent.includes(label));
    return qs("select", holder);
};

/**
 * Assert that the iteration variables of the rendered todo items are sited at the expected elements of the source todos.
 * @param {Object} assert - The QUnit assert object
 * @param {Object} that - The todo app component
 * @param {Integer[]} sourceIndices - The indices in the source todos expected for each rendered item, in order
 * @param {String} message - A message qualifying the assertion
 */
fluid.tests.todo.checkProvenance = function (assert, that, sourceIndices, message) {
    const listPath = that.todoList[fluid.proxySymbol].shadow.path;
    const sites = that.todoList.todoItems.list.map(item => item[fluid.proxySymbol].shadow.variablesLayer.todo);
    assert.deepEqual(sites, sourceIndices.map(index => `{/${listPath}}.todos.${index}`), `Items sited at source todos: ${message}`);
};

QUnit.test("Demo SFCs load and render unfiltered todos", async function (assert) {
    const {that, container} = await fluid.tests.todo.makeApp(fluid.tests.todo.filterReady);
    const initial = fluid.tests.todo.initialTodos;
    fluid.tests.todo.checkRendering(assert, that, container, initial, "Initial");
    fluid.tests.todo.checkProvenance(assert, that, [0, 1, 2], "Initial");
    that.destroy();
});

QUnit.test("Filtered items project through filter() onto source todos", async function (assert) {
    const {that, container} = await fluid.tests.todo.makeApp(fluid.tests.todo.filterReady);
    const initial = fluid.tests.todo.initialTodos;
    const completedSelect = fluid.tests.todo.filterSelect(container, "Filter Completed");

    choose(completedSelect, "false");
    fluid.tests.todo.checkRendering(assert, that, container, [initial[0], initial[2]], "Filtered to incomplete");
    fluid.tests.todo.checkProvenance(assert, that, [0, 2], "Filtered to incomplete");

    choose(completedSelect, "true");
    fluid.tests.todo.checkRendering(assert, that, container, [initial[1]], "Filtered to complete");
    fluid.tests.todo.checkProvenance(assert, that, [1], "Filtered to complete");

    choose(completedSelect, "all");
    fluid.tests.todo.checkRendering(assert, that, container, initial, "Filter removed");
    that.destroy();
});

QUnit.test("Toggle of filtered item writes to its source element", async function (assert) {
    const {that, container} = await fluid.tests.todo.makeApp(fluid.tests.todo.filterReady);
    const initial = fluid.tests.todo.initialTodos;
    choose(fluid.tests.todo.filterSelect(container, "Filter Completed"), "false");

    // Filtered item 1 is drawn from source index 2
    click(qsa(".todo .item-text", container)[1]);
    const expected = fluid.copy(initial);
    expected[2].completed = true;
    assert.deepEqual(fluid.tests.todo.sourceTodos(that), expected, "Source element at index 2 toggled");
    fluid.tests.todo.checkRendering(assert, that, container, [expected[0]], "Toggled item filtered out");
    fluid.tests.todo.checkProvenance(assert, that, [0], "Toggled item filtered out");
    that.destroy();
});

QUnit.test("Delete of filtered item removes its source element", async function (assert) {
    const {that, container} = await fluid.tests.todo.makeApp(fluid.tests.todo.filterReady);
    const initial = fluid.tests.todo.initialTodos;
    choose(fluid.tests.todo.filterSelect(container, "Filter Completed"), "false");

    // Filtered item 1 is drawn from source index 2 - deleting via its filtered index would wrongly remove index 1
    click(qsa("button.delete", container)[1]);
    const expected = [initial[0], initial[1]];
    assert.deepEqual(fluid.tests.todo.sourceTodos(that), expected, "Source element at index 2 removed");
    fluid.tests.todo.checkRendering(assert, that, container, [initial[0]], "Deleted filtered item");

    choose(fluid.tests.todo.filterSelect(container, "Filter Completed"), "all");
    fluid.tests.todo.checkRendering(assert, that, container, expected, "Filter removed after delete");
    that.destroy();
});

QUnit.test("Assignee facet - assignment through filtered item and filtering by assignee", async function (assert) {
    const {that, container} = await fluid.tests.todo.makeApp(fluid.tests.todo.filterReady);
    const initial = fluid.tests.todo.initialTodos;

    check(qs("input[type=checkbox]", container), true);
    await fluid.cell.settle();
    const facetReady = qsa(".item-assignee-select", container).length === 3
        && fluid.tests.todo.filterSelect(container, "Filter Assignee");
    assert.ok(facetReady, "Assignee controls rendered on enabling facet");

    const renderedAssignees = () => qsa(".item-assignee-select", container).map(select => select.value);
    assert.deepEqual(renderedAssignees(), initial.map(todo => todo.assignee), "Initial assignees rendered");

    choose(fluid.tests.todo.filterSelect(container, "Filter Completed"), "false");
    fluid.tests.todo.checkProvenance(assert, that, [0, 2], "Filtered to incomplete");

    // Filtered item 1 is drawn from source index 2
    choose(qsa(".item-assignee-select", container)[1], "Ashiata Shiemash");
    const expected = fluid.copy(initial);
    expected[2].assignee = "Ashiata Shiemash";
    assert.deepEqual(fluid.tests.todo.sourceTodos(that), expected, "Assignee written to source element at index 2");
    assert.deepEqual(renderedAssignees(), [expected[0].assignee, expected[2].assignee], "Assignment rendered");

    choose(qsa(".item-assignee-select", container)[1], "<none>");
    expected[2].assignee = null;
    assert.deepEqual(fluid.tests.todo.sourceTodos(that), expected, "Assignee <none> written as null");
    assert.deepEqual(renderedAssignees(), [expected[0].assignee, "<none>"], "Unassignment rendered");

    choose(fluid.tests.todo.filterSelect(container, "Filter Completed"), "all");
    choose(fluid.tests.todo.filterSelect(container, "Filter Assignee"), "Makary Kronbernkzion");
    fluid.tests.todo.checkRendering(assert, that, container, [expected[0], expected[1]], "Filtered by assignee");
    fluid.tests.todo.checkProvenance(assert, that, [0, 1], "Filtered by assignee");

    choose(qsa(".item-assignee-select", container)[0], "Gornahoor Harharkh");
    expected[0].assignee = "Gornahoor Harharkh";
    assert.deepEqual(fluid.tests.todo.sourceTodos(that), expected, "Reassignment written to source element at index 0");
    fluid.tests.todo.checkRendering(assert, that, container, [expected[1]], "Reassigned item filtered out");
    fluid.tests.todo.checkProvenance(assert, that, [1], "Reassigned item filtered out");
    that.destroy();
});

QUnit.test("Insert new todo whilst filtered", async function (assert) {
    const {that, container} = await fluid.tests.todo.makeApp(fluid.tests.todo.filterReady);
    const initial = fluid.tests.todo.initialTodos;
    choose(fluid.tests.todo.filterSelect(container, "Filter Completed"), "true");
    fluid.tests.todo.enterTodo(container, "Think about something");

    const newTodo = {text: "Think about something", completed: false};
    const expected = initial.concat([newTodo]);
    assert.deepEqual(fluid.tests.todo.sourceTodos(that), expected, "New todo added to source");
    fluid.tests.todo.checkRendering(assert, that, container, [initial[1]], "Incomplete new todo filtered out");

    choose(fluid.tests.todo.filterSelect(container, "Filter Completed"), "false");
    fluid.tests.todo.checkRendering(assert, that, container, [initial[0], initial[2], newTodo], "New todo shown");
    fluid.tests.todo.checkProvenance(assert, that, [0, 2, 3], "New todo shown");

    click(qsa(".todo .item-text", container)[2]);
    fluid.tests.todo.checkRendering(assert, that, container, [initial[0], initial[2]], "New todo toggled and filtered out");
    assert.equal(fluid.tests.todo.sourceTodos(that)[3].completed, true, "New todo toggled in source");
    that.destroy();
});
