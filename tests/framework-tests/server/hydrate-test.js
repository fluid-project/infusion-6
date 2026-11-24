"use strict";

// Smoke test for server-side hydration: runs src/framework/server/hydrate.js on the todo-list-sfc demo and checks
// that the hydrated document it writes holds the rendered markup for the demo's todo items, and that it names the
// sources of its Single File Components' styles relative to itself, revealing nothing of where it was built - FLUID-7037

// hydrate.js writes the document once all injections are complete and the reactive graph has settled, as determined
// by fluid.cell.settle() - see FLUID-7017

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
    // The demo boots within the editor, fluid.edit, so the todo app's root is not marked by its own layer
    const items = [...document.querySelectorAll(".todo")];
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

/**
 * Check that a hydrated document names the sources of its styles relative to itself - not by `file:` URL, nor by any
 * path of the machine which hydrated it - FLUID-7037
 * @param {String} text - The text of the hydrated document
 * @return {String[]} A list of failure messages, empty if the document is as expected
 */
const checkSourceUrls = function (text) {
    const failures = [];
    const {document} = linkedom.parseHTML(text);
    const styleUrls = [...document.querySelectorAll("style")].map(style => /\/\*# sourceURL=(.*?)\*\//.exec(style.textContent)?.[1])
        .filter(url => url);
    if (styleUrls.length === 0) {
        failures.push("Expected the styles of the demo's Single File Components to name their sources");
    }
    styleUrls.filter(url => !/^\.\.?\//.test(url) && !/^[\w-]+\//.test(url)).forEach(url => {
        failures.push("Style names its source by a URL which is not relative to the document: " + url);
    });
    if (text.includes("file:")) {
        failures.push("Hydrated document holds a file: URL");
    }
    if (text.includes(moduleBaseDir)) {
        failures.push("Hydrated document holds the path of the directory it was built in, " + moduleBaseDir);
    }
    return failures;
};

const hydrated = hydrate(inputFile);
const failures = [...checkTodos(hydrated), ...checkSourceUrls(hydrated)];

if (failures.length === 0) {
    console.log("hydrate-test PASS: " + expectedTodos.length + " todo items rendered in hydrated " +
        path.relative(moduleBaseDir, inputFile));
} else {
    console.log("hydrate-test FAIL:\n  " + failures.join("\n  "));
    process.exitCode = 1;
}
