/* eslint-env node */
"use strict";

// Smoke test for server-side hydration: runs src/framework/server/hydrate.js on the todo-list-sfc demo and checks
// that the hydrated document it writes holds the rendered markup for the demo's todo items.

// hydrate.js writes the document once all injections are complete and the reactive graph has settled, as determined
// by fluid.cell.settle() - see fluid-project/infusion-6#17

const childProcess = require("child_process"),
    fs = require("fs"),
    os = require("os"),
    path = require("path"),
    linkedom = require("linkedom");

const moduleBaseDir = path.resolve(__dirname, "../../..");
const hydrateScript = path.join(moduleBaseDir, "src/framework/server/hydrate.js");
const inputFile = path.join(moduleBaseDir, "demo/todo-list-sfc/index.html");

// The demo's initial todos, as held in demo/todo-list-sfc/sfc/fluid-demos-todoApp.vue
const expectedTodos = ["Write some code", "Eat some food", "Sleep"];

/**
 * Run hydrate.js on an input file in a child process, writing its output to a fresh temporary file
 * @param {String} input - The path of the HTML file to be hydrated
 * @return {String} The text of the hydrated document
 */
const hydrate = function (input) {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "fluid-hydrate-test-"));
    const outputFile = path.join(outDir, "index-hydrated.html");
    try {
        const result = childProcess.spawnSync(process.execPath, [hydrateScript, input, "-o", outputFile], {
            cwd: moduleBaseDir,
            encoding: "utf8",
            timeout: 60000
        });
        if (result.status !== 0) {
            throw new Error("hydrate.js exited with status " + result.status + "\n" + result.stdout + result.stderr);
        }
        return fs.readFileSync(outputFile, "utf8");
    } finally {
        fs.rmSync(outDir, {recursive: true, force: true});
    }
};

/**
 * Check a hydrated todo-list-sfc document for its rendered todo items
 * @param {String} text - The text of the hydrated document
 * @return {String[]} A list of failure messages, empty if the document is as expected
 */
const checkTodos = function (text) {
    const {document} = linkedom.parseHTML(text);
    const failures = [];
    const items = [...document.querySelectorAll("[fluid-layers=\"fluid.demos.todoApp\"] .todo")];
    const texts = items.map(item => item.textContent.trim());
    if (items.length !== expectedTodos.length) {
        failures.push("Expected " + expectedTodos.length + " rendered .todo items but found " + items.length);
    }
    expectedTodos.forEach(expected => {
        if (!texts.includes(expected)) {
            failures.push("No rendered .todo item with text \"" + expected + "\"");
        }
    });
    return failures;
};

const failures = checkTodos(hydrate(inputFile));

if (failures.length === 0) {
    console.log("hydrate-test PASS: " + expectedTodos.length + " todo items rendered in hydrated " +
        path.relative(moduleBaseDir, inputFile));
} else {
    console.log("hydrate-test FAIL:\n  " + failures.join("\n  "));
    process.exitCode = 1;
}
