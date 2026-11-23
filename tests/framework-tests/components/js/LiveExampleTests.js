/* global QUnit */

"use strict";

fluid.registerNamespace("fluid.tests.liveExample");

QUnit.module("fluid.liveExample Tests");

QUnit.config.reorder = false;

fluid.tests.liveExample.url = new URL("../../../../src/components/sfc/fluid-liveExample.vue", document.location.href).href;

// The example's editor is CodeMirror 6, which runs in a browser - not in node's linkedom, where these tests are skipped
fluid.tests.liveExample.inBrowser = typeof navigator !== "undefined" && /Chrome|Firefox|Safari/.test(navigator.userAgent || "");

/**
 * Load the live example's SFC once, subscribing the document to its injections
 * @return {Promise} Resolves once its injections are complete
 */
fluid.tests.liveExample.load = function () {
    if (!fluid.tests.liveExample.loadPromise) {
        fluid.loadSFC("fluid.liveExample", fluid.tests.liveExample.url);
        fluid.tests.liveExample.loadPromise = fluid.cell.waitFor(fluid.subscribeDocToInjections("fluid.liveExample", document));
    }
    return fluid.tests.liveExample.loadPromise;
};

/**
 * Wait until a condition holds
 * @param {Function} test - Returns a truthy value once the condition holds
 * @param {Number} [timeout] - How long to wait, in ms
 * @return {Promise<Any>} Resolves to the test's value once it is truthy, or rejects on timeout
 */
fluid.tests.liveExample.until = function (test, timeout = 10000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const poll = () => {
            const value = test();
            if (value) {
                resolve(value);
            } else if (Date.now() - start > timeout) {
                reject(new Error("Timed out waiting for " + test));
            } else {
                setTimeout(poll, 50);
            }
        };
        poll();
    });
};

/**
 * Make a live example of some code, in a fresh element
 * @param {String} code - The code
 * @param {Object} [options] - Further members of the example, e.g. its `kind` or `mode`
 * @return {Promise<Object>} Resolves to `{example, element}` once its editor has appeared
 */
fluid.tests.liveExample.make = async function (code, options) {
    await fluid.tests.liveExample.load();
    const element = document.createElement("div");
    document.querySelector(".examples").appendChild(element);
    const example = fluid.liveExample({container: element, code, ...options});
    await fluid.tests.liveExample.until(() => element.querySelector(".cm-editor"));
    return {example, element};
};

/**
 * Replace the text of an example's editor, as a user's edit
 * @param {Element} element - The example's element
 * @param {String} from - The text to replace
 * @param {String} to - Its replacement
 */
fluid.tests.liveExample.edit = function (element, from, to) {
    const view = fluid.codemirror6.EditorView.findFromDOM(element.querySelector(".cm-editor"));
    const at = view.state.doc.toString().indexOf(from);
    view.dispatch({changes: {from: at, to: at + from.length, insert: to}});
};

const consoleText = element => element.querySelector(".fl-live-example-console-lines").textContent;
const instanceText = element => element.querySelector(".fl-live-example-instance").textContent;

const greeting = `fluid.def("fluid.tests.greeting", {
    $layers: "fluid.component",
    name: "World",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: "<p>Hello, @{name}!</p>"
        }
    }
});
console.log("Defined the greeting");`;

if (fluid.tests.liveExample.inBrowser) {
    QUnit.test("An example's code runs, and what it logs is shown in its console", async function (assert) {
        const {element} = await fluid.tests.liveExample.make(`fluid.def("fluid.tests.rect", {
    $layers: "fluid.component",
    width: 3,
    height: 4,
    area: "$compute:fluid.tests.multiply({self}.width, {self}.height)"
});
fluid.tests.multiply = (a, b) => a * b;
const r = fluid.tests.rect();
console.log("Area", r.area);`);
        await fluid.tests.liveExample.until(() => consoleText(element).includes("Area 12"));
        assert.ok(true, "The console shows the area computed");
        assert.notOk(element.classList.contains("fl-live-example-has-instance"), "Code defining no view shows no instance");
    });

    QUnit.test("A view the code defines is instantiated at the left, and re-run as the code is edited", async function (assert) {
        const {element} = await fluid.tests.liveExample.make(greeting);
        await fluid.tests.liveExample.until(() => instanceText(element).includes("Hello, World!"));
        assert.ok(element.classList.contains("fl-live-example-has-instance"), "The instance is shown beside the code");
        assert.ok(consoleText(element).includes("Defined the greeting"), "The console shows what the code logged");
        fluid.tests.liveExample.edit(element, "\"World\"", "\"Infusion\"");
        await fluid.tests.liveExample.until(() => instanceText(element).includes("Hello, Infusion!"));
        assert.ok(true, "Once edited, the code is run again, and its instance shows the edit");
        assert.equal(instanceText(element).split("Hello,").length, 2, "The instance of the previous run is destroyed");
    });

    QUnit.test("Code which lints with errors is marked and not run", async function (assert) {
        const {element} = await fluid.tests.liveExample.make(greeting.replace("fluid.tests.greeting", "fluid.tests.greeting2"));
        await fluid.tests.liveExample.until(() => instanceText(element).includes("Hello, World!"));
        fluid.tests.liveExample.edit(element, "\"World\"", "\"$comptue:fluid.tests.name()\"");
        await fluid.tests.liveExample.until(() => element.querySelector(".cm-lint-marker-error"));
        assert.ok(true, "The error is marked in the editor's gutter");
        await new Promise(resolve => setTimeout(resolve, 600));
        assert.ok(instanceText(element).includes("Hello, World!"), "The code is not run while it has errors");
    });

    QUnit.test("Rerunning code which redefines a layer identically does not re-render other views bearing it", async function (assert) {
        fluid.tests.liveExample.renders = 0;
        fluid.tests.liveExample.runs = 0;
        fluid.tests.liveExample.countRender = name => {
            ++fluid.tests.liveExample.renders;
            return name;
        };
        const {element} = await fluid.tests.liveExample.make(`fluid.def("fluid.tests.shared", {
    $layers: "fluid.component",
    name: "Shared",
    label: "$compute:fluid.tests.liveExample.countRender({self}.name)",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: "<p class=\\"shared\\">Hello, @{label}!</p>"
        }
    }
});
console.log("Run", ++fluid.tests.liveExample.runs);`);
        await fluid.tests.liveExample.until(() => instanceText(element).includes("Hello, Shared!"));
        // A view bearing the layer elsewhere on the page, as another example's might
        const other = document.createElement("div");
        document.querySelector(".examples").appendChild(other);
        const otherInstance = fluid.initFreeComponent("fluid.tests.shared", {container: other});
        await fluid.tests.liveExample.until(() => other.textContent.includes("Hello, Shared!"));
        const otherNode = other.querySelector(".shared");
        const rendersBefore = fluid.tests.liveExample.renders;

        // An edit leaving the record as it was - the code is rerun, and the layer redefined with an identical record
        fluid.tests.liveExample.edit(element, "console.log", "// Unchanged record\nconsole.log");
        await fluid.tests.liveExample.until(() => consoleText(element).includes("Run 2"));
        await fluid.tests.liveExample.until(() => instanceText(element).includes("Hello, Shared!"));
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(fluid.tests.liveExample.renders, rendersBefore + 1, "Only the example's own fresh instance computes its label");
        assert.equal(other.querySelector(".shared"), otherNode, "The other view's markup is not re-rendered");

        // A real change to the record reaches the other view - showing that the check above could fail
        fluid.tests.liveExample.edit(element, "\"Shared\"", "\"Changed\"");
        await fluid.tests.liveExample.until(() => other.textContent.includes("Hello, Changed!"));
        assert.ok(true, "A changed record re-renders the other view");
        otherInstance.destroy();
    });

    QUnit.test("A live example's console is shown beneath it, even before anything is logged", async function (assert) {
        const {element} = await fluid.tests.liveExample.make(`fluid.def("fluid.tests.quiet", {$layers: "fluid.component"});`);
        await new Promise(resolve => setTimeout(resolve, 400));
        const consolePane = element.querySelector(".fl-live-example-console");
        assert.notEqual(getComputedStyle(consolePane).display, "none", "The console is shown");
        assert.equal(element.querySelector(".fl-live-example-console-lines").textContent, "", "It holds no output");
        assert.ok(element.querySelector(".cm-content").getAttribute("contenteditable") === "true", "A live example is editable");
        assert.ok(getComputedStyle(element.querySelector(".cm-scroller")).fontFamily.startsWith("ui-monospace"), "The editor bears the example's font");
    });

    QUnit.test("An example of syntax alone is read-only, linted, and neither run nor given a console", async function (assert) {
        const {element} = await fluid.tests.liveExample.make(`fluid.def("fluid.tests.syntaxOnly", {
    $layers: "fluid.component",
    price: "$5"
});
console.log("Should not run");`, {mode: "syntax"});
        await fluid.tests.liveExample.until(() => element.querySelector(".cm-lint-marker-error"));
        assert.ok(true, "Its error is marked");
        assert.ok(element.classList.contains("fl-live-example-syntax"), "It is marked as syntax");
        assert.equal(element.querySelector(".cm-content").getAttribute("contenteditable"), "false", "It is not editable");
        assert.equal(getComputedStyle(element.querySelector(".fl-live-example-console")).display, "none", "It has no console");
        assert.notOk(fluid.def("fluid.tests.syntaxOnly"), "Its code is not run");
    });

    QUnit.test("A Single File Component is previewed at the left, and re-previewed as it is edited", async function (assert) {
        const {element} = await fluid.tests.liveExample.make(`<script>
fluid.def("fluid.tests.sfcCounter", {
    count: 0,
    increment: {
        $method: {
            func: self => self.count++,
            args: "{self}"
        }
    }
});
</script>

<template>
    <div class="sfc-counter"><span>Clicked @{count} times</span><button @onclick="{self}.increment()">+1</button></div>
</template>`, {kind: "vue"});
        await fluid.tests.liveExample.until(() => instanceText(element).includes("Clicked 0 times"));
        assert.ok(element.classList.contains("fl-live-example-has-instance"), "The preview is shown beside the code");
        assert.notOk(element.querySelector(".sfc-counter").classList.contains("fl-live-example-instance"),
            "The preview renders into its own container, not onto the pane holding it");
        element.querySelector(".sfc-counter button").click();
        await fluid.tests.liveExample.until(() => instanceText(element).includes("Clicked 1 times"));
        assert.ok(true, "The preview is live");
        fluid.tests.liveExample.edit(element, "Clicked", "Pressed");
        await fluid.tests.liveExample.until(() => instanceText(element).includes("Pressed 1 times"));
        assert.ok(true, "Once edited, the SFC is previewed afresh, retaining the state set on it");
    });

    QUnit.test("A layer inheriting its view is the one instantiated, rather than a later layer only refining a view", async function (assert) {
        const {element} = await fluid.tests.liveExample.make(`fluid.def("fluid.tests.titled", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: ["fluid.templateViewComponent", "fluid.partialViewComponent"],
            template: "<header><h1 class=\\"title\\">@{title}</h1></header>"
        }
    }
});
fluid.def("fluid.tests.titled.dated", {
    view: {
        $component: {
            relativeContainer: "after: h1.title",
            partialTemplate: "<span class=\\"date\\">@{date}</span>"
        }
    }
});
fluid.def("fluid.tests.datedTitle", {
    $layers: ["fluid.tests.titled", "fluid.tests.titled.dated"],
    title: "Title",
    date: "Date"
});`);
        await fluid.tests.liveExample.until(() => element.querySelector(".fl-live-example-instance .date"));
        assert.ok(instanceText(element).includes("Title"), "The layer bearing the inherited view is instantiated, with its partial");
    });

    QUnit.test("A rerun starts without the layers its previous run introduced", async function (assert) {
        const {element} = await fluid.tests.liveExample.make(`fluid.def("fluid.tests.typed.default", {$layers: "fluid.component", heading: "Page"});
fluid.def("fluid.tests.typed", {
    $layers: ["fluid.component", "{self}.typeLayers"],
    typeLayers: "$compute:fluid.firstDefinedLayer({self}.candidates)",
    candidates: ["fluid.tests.typed.post", "fluid.tests.typed.default"]
});
const doc = fluid.tests.typed();
fluid.cell.stabilize();
console.log("Before:", doc.heading);
fluid.def("fluid.tests.typed.post", {$layers: "fluid.component", heading: "Blog post"});
fluid.cell.stabilize();
console.log("After:", doc.heading);`);
        await fluid.tests.liveExample.until(() => consoleText(element).includes("After: Blog post"));
        assert.ok(consoleText(element).includes("Before: Page"), "The first run shows the component before the layer is defined");
        fluid.tests.liveExample.edit(element, "\"Page\"", "\"Article\"");
        // The previous run's output is shown until the rerun, which logs either heading first
        await fluid.tests.liveExample.until(() => /Before: (Article|Blog post)/.test(consoleText(element)));
        assert.ok(consoleText(element).includes("Before: Article"), "A rerun again shows it before the layer is defined");
        await fluid.tests.liveExample.until(() => consoleText(element).includes("After: Blog post"));
        assert.ok(true, "And then once it is defined");
    });

    QUnit.test("A fragment of a layer record is linted but not run", async function (assert) {
        const {element} = await fluid.tests.liveExample.make(`view: {
    $component: {
        $layers: "fluid.templateViewComponent",
        template: "<p>@{name}</p>"
    }
}`);
        await new Promise(resolve => setTimeout(resolve, 600));
        assert.equal(consoleText(element), "", "Nothing is logged");
        assert.notOk(element.querySelector(".cm-lint-marker-error"), "The fragment lints clean");
    });
} else {
    QUnit.test("A live example's editor runs only in a browser", function (assert) {
        assert.ok(true, "Skipped outside a browser");
    });
}
