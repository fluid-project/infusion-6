"use strict";

fluid.registerNamespace("fluid.tests.todo");

/**
 * Poll until a predicate holds, stabilising the signal graph between polls.
 * @param {Function} predicate - A function returning `true` once the awaited condition holds.
 * @param {Number} [timeout=5000] - The maximum time in milliseconds to wait.
 * @return {Promise<Boolean>} Resolves to `true` once the predicate holds, or `false` on timeout.
 */
fluid.tests.todo.waitFor = function (predicate, timeout = 5000) {
    const start = Date.now();
    return new Promise(resolve => {
        const poll = () => {
            fluid.cell.stabilize();
            if (predicate()) {
                resolve(true);
            } else if (Date.now() - start > timeout) {
                resolve(false);
            } else {
                setTimeout(poll, 10);
            }
        };
        poll();
    });
};

/**
 * Wait until the injections of all SFCs imported into the document via `<fluid-import>` have completed.
 * @return {Promise<Boolean>} Resolves to `true` once all injections are complete, or `false` on timeout.
 */
fluid.tests.todo.loadImports = function () {
    if (!fluid.tests.todo.loadPromise) {
        const layerNames = [...document.querySelectorAll("fluid-import")]
            .map(node => fluid.pathToLayerName(node.getAttribute("src")));
        const injDones = layerNames.map(layerName => fluid.subscribeDocToInjections(layerName, document));
        fluid.tests.todo.loadPromise = fluid.tests.todo.waitFor(() => injDones.every(injDone => injDone.get() === true));
    }
    return fluid.tests.todo.loadPromise;
};

fluid.tests.todo.qs = (sel, parent) => (parent || document).querySelector(sel);
fluid.tests.todo.qsa = (sel, parent) => [...(parent || document).querySelectorAll(sel)];

/**
 * Instantiate a fresh todo app from the demo's `fluid.demos.todoApp` layer into the test container, once its imports
 * have loaded, and wait until its todo items have rendered - layers imported lazily through an `$importMap` may
 * still be loading on instantiation. The demo's initial todos are recorded in `fluid.tests.todo.initialTodos`.
 * @param {Function} [ready] - An optional further predicate, accepting the container, which must hold before the app
 * is considered ready
 * @return {Promise<Object>} A promise for a record holding the app component `that` and its `container`
 */
fluid.tests.todo.makeApp = async function (ready) {
    await fluid.tests.todo.loadImports();
    fluid.tests.todo.initialTodos = fluid.demos.fetchTodos();
    const container = fluid.tests.todo.qs(".container");
    const that = fluid.demos.todoApp({container});
    const rendered = await fluid.tests.todo.waitFor(() =>
        fluid.tests.todo.qsa(".todo", container).length === fluid.tests.todo.initialTodos.length && (!ready || ready(container)));
    if (!rendered) {
        fluid.fail("Todo app did not render within timeout");
    }
    return {that, container};
};

/**
 * Read the current value of the source todos held in the todo list component, without any proxy wrapping.
 * @param {Object} that - The todo app component
 * @return {Object[]} The current source todos
 */
fluid.tests.todo.sourceTodos = function (that) {
    return fluid.copy(fluid.unwrapProxy(that.todoList.todos));
};

/**
 * Assert that the todo items in the component tree and the rendered markup agree with the expected todos.
 * @param {Object} assert - The QUnit assert object
 * @param {Object} that - The todo app component
 * @param {HTMLElement} container - The container into which the app is rendered
 * @param {Object[]} expected - The todos which are expected to be rendered, in order
 * @param {String} message - A message qualifying the assertions
 */
fluid.tests.todo.checkRendering = function (assert, that, container, expected, message) {
    fluid.cell.stabilize();
    const items = that.todoList.todoItems.list;
    assert.equal(items.length, expected.length, `Correct component count: ${message}`);

    const treeTodos = items.map(item => fluid.copy(fluid.unwrapProxy(item.todo)));
    assert.deepEqual(treeTodos, expected, `Correct todos for component tree items: ${message}`);

    const elements = fluid.tests.todo.qsa(".todo", container);
    const renderedTexts = elements.map(element => element.querySelector("span").textContent.trim());
    assert.deepEqual(renderedTexts, expected.map(todo => todo.text), `Correct texts for rendered items: ${message}`);

    const completed = expected.map(todo => todo.completed);
    const renderedCompleted = elements.map(element => element.classList.contains("completed"));
    assert.deepEqual(renderedCompleted, completed, `Correct completed states for rendered items: ${message}`);

    const renderedInfo = elements.map(element => element.classList.contains("is-info"));
    assert.deepEqual(renderedInfo, completed.map(state => !state), `Correct is-info states for rendered items: ${message}`);
};

/**
 * Dispatch a click to an element and stabilise the signal graph.
 * @param {HTMLElement} element - The element to be clicked
 */
fluid.tests.todo.click = function (element) {
    element.dispatchEvent(new MouseEvent("click"));
    fluid.cell.stabilize();
};

/**
 * Enter a new todo by typing into the app's text input and pressing Enter.
 * @param {HTMLElement} container - The container into which the app is rendered
 * @param {String} text - The text of the new todo
 */
fluid.tests.todo.enterTodo = function (container, text) {
    const input = fluid.tests.todo.qs("input.input", container);
    input.value = text;
    input.dispatchEvent(new KeyboardEvent("keyup", {key: "Enter"}));
    fluid.cell.stabilize();
};

/**
 * Choose an option of a select element as a user would, dispatching a change event and stabilising the signal graph.
 * The option is selected via its `selected` attribute since the linkedom mockup used under node does not support
 * writing a select element's value.
 * @param {HTMLSelectElement} select - The select element
 * @param {String} value - The value of the option to be chosen
 */
fluid.tests.todo.choose = function (select, value) {
    fluid.tests.todo.qsa("option", select).forEach(option => option.toggleAttribute("selected", option.value === value));
    select.dispatchEvent(new Event("change"));
    fluid.cell.stabilize();
};

/**
 * Check or uncheck a checkbox as a user would, dispatching a change event and stabilising the signal graph.
 * @param {HTMLInputElement} checkbox - The checkbox element
 * @param {Boolean} checked - Whether the checkbox should be checked
 */
fluid.tests.todo.check = function (checkbox, checked) {
    checkbox.checked = checked;
    checkbox.dispatchEvent(new Event("change"));
    fluid.cell.stabilize();
};
