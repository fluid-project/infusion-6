/* eslint-env browser */
"use strict";

/**
 * Counter used to mint unique global keys for per-run console shims so that
 * the user's source can resolve `console` to a local shim without us ever
 * touching the real global console.
 */
let shimCounter = 0;

/**
 * Format a single console argument into a String for display.
 * @param {*} value   The value passed to a console method - may be a string, an Error, or any other JS value.
 * @return {String}   A human-readable representation of the value, suitable for insertion as DOM text.
 */
function formatArg(value) {
    if (typeof value === "string") {
        return value;
    } else if (value instanceof Error) {
        return value.stack || String(value);
    } else {
        try {
            return JSON.stringify(value, null, 2);
        } catch (e) {
            return String(value);
        }
    }
}

/**
 * Count the number of lines in a String (minimum 1).
 * @param {String} text   The textarea source whose newline count determines its rendered height.
 * @return {Number}       Line count, clamped to a minimum of 1 so empty content still occupies a row.
 */
function countLines(text) {
    const lines = text.split("\n").length;
    if (lines < 1) {
        return 1;
    } else {
        return lines;
    }
}

/**
 * Append a line of output to the given results panel.
 * @param {HTMLElement} panel   The results panel element that will receive the new output line as a child.
 * @param {String} line         The pre-formatted text to display on a single output row.
 * @param {String} kind         Output category, either "log" or "error" - used as a CSS modifier class for styling.
 */
function appendOutput(panel, line, kind) {
    const entry = document.createElement("div");
    entry.className = "fluid-code-box-output-line fluid-code-box-output-" + kind;
    entry.textContent = line;
    panel.appendChild(entry);
}

/**
 * Build a console-shaped Object whose log/error/warn/info methods append to
 * the supplied panel and also forward to the real console for visibility in
 * the dev tools.
 * @param {HTMLElement} panel   The results panel that intercepted console calls should write into.
 * @return {Object}             A console-shaped object exposing log, info, warn and error methods.
 */
function makeConsoleShim(panel) {
    /**
     * @param {String} kind        Output category written to the panel - either "log" or "error".
     * @param {String} forward     Method name on the real console to forward the call to (e.g. "log", "warn").
     * @return {Function}          A console method implementation that writes to the panel and forwards to the real console.
     */
    function method(kind, forward) {
        return function () {
            const parts = Array.prototype.map.call(arguments, formatArg);
            appendOutput(panel, parts.join(" "), kind);
            console[forward].apply(console, arguments);
        };
    }
    return {
        log: method("log", "log"),
        info: method("log", "info"),
        warn: method("log", "warn"),
        error: method("error", "error")
    };
}

/**
 * Rewrite relative module specifiers (those starting with `./` or `../`) in
 * the supplied source so that they become absolute URLs resolved against the
 * page's base URI. This is needed because the source is loaded from a
 * `blob:` URL whose scheme isn't hierarchical, so the browser can't resolve
 * relative specifiers against it. Bare specifiers (e.g. `"fluid"`) and
 * already-absolute specifiers (e.g. `"/x.mjs"`, `"https://..."`) are left
 * alone.
 * @param {String} source   The module source whose import/export specifiers may need rewriting.
 * @param {String} baseUrl  The URL to resolve relative specifiers against - typically `document.baseURI`.
 * @return {String}         The source with relative specifiers rewritten to absolute URLs.
 */
function resolveImports(source, baseUrl) {
    // Matches the specifier slot in:
    //   import ... from "X"
    //   import "X"
    //   export ... from "X"
    //   import("X")
    // The specifier itself is captured in group 2 (with its surrounding quote
    // type in group 1) so we can rebuild the literal with the same quoting.
    const pattern = /(?:\b(?:import|export)\b[^"'`;]*?\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'`\n]+)\1/g;
    return source.replace(pattern, function (match, quote, specifier) {
        if (specifier.startsWith("./") || specifier.startsWith("../")) {
            const absolute = new URL(specifier, baseUrl).href;
            const replacement = quote + absolute + quote;
            // Preserve the prefix of the match (everything before the quoted
            // specifier) by splicing the rebuilt literal onto its end.
            const prefixLength = match.length - (specifier.length + 2);
            return match.substring(0, prefixLength) + replacement;
        } else {
            return match;
        }
    });
}

/**
 * Execute the source as an ES module via a Blob URL, with a local `console`
 * binding prepended so that any `console.x(...)` in the source resolves to
 * our shim instead of the global. Relative module specifiers in the source
 * are first rewritten to absolute URLs so they continue to work despite the
 * non-hierarchical `blob:` scheme. Returns a Promise that resolves when the
 * module finishes evaluating.
 * @param {String} source       The JavaScript module source from the textarea, to be evaluated as an ES module.
 * @param {HTMLElement} panel   The results panel that will receive console output and any thrown error from the run.
 * @return {Promise}            A promise that resolves once the module has finished evaluating, or after a thrown error has been reported.
 */
function runSource(source, panel) {
    panel.textContent = "";
    shimCounter = shimCounter + 1;
    const key = "__fluidCodeBoxConsole_" + shimCounter;
    globalThis[key] = makeConsoleShim(panel);
    // Prepend a const binding so identifier resolution for `console` inside
    // the module hits our shim rather than the real global. String literals
    // and comments mentioning "console" are untouched because we are not
    // doing textual substitution on the source.
    const resolved = resolveImports(source, document.baseURI);
    const wrapped = "const console = globalThis[\"" + key + "\"];\n" + resolved;
    const blob = new Blob([wrapped], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const done = import(/* webpackIgnore: true */ url).catch(function (err) {
        appendOutput(panel, formatArg(err), "error");
    }).finally(function () {
        URL.revokeObjectURL(url);
        delete globalThis[key];
    });
    return done;
}

/**
 * Replace the textarea's parent layout with a wrapper that places the editor
 * (textarea + Run button) on the left and a results panel on the right.
 * Returns the results panel and the button so the caller can wire them up.
 * @param {HTMLTextAreaElement} textarea   The fluid-code-box textarea to be hoisted into the new two-column layout.
 * @return {Object}                        An object with `button` (the Run button element) and `resultsPanel` (the right-hand output panel) for wiring up event handlers.
 */
function buildLayout(textarea) {
    const wrapper = document.createElement("div");
    wrapper.className = "fluid-code-box-wrapper";

    const editorSide = document.createElement("div");
    editorSide.className = "fluid-code-box-editor";

    const resultsSide = document.createElement("div");
    resultsSide.className = "fluid-code-box-results";

    const resultsHeader = document.createElement("div");
    resultsHeader.className = "fluid-code-box-results-header";
    resultsHeader.textContent = "Results";

    const resultsPanel = document.createElement("div");
    resultsPanel.className = "fluid-code-box-results-panel";

    resultsSide.appendChild(resultsHeader);
    resultsSide.appendChild(resultsPanel);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "fluid-code-box-run";
    button.textContent = "Run it";

    // Insert the wrapper where the textarea sits, then move the textarea
    // into the editor side. This is the "hoist one level deeper" step.
    const parent = textarea.parentNode;
    parent.insertBefore(wrapper, textarea);
    editorSide.appendChild(textarea);
    editorSide.appendChild(button);
    wrapper.appendChild(editorSide);
    wrapper.appendChild(resultsSide);

    return {
        button: button,
        resultsPanel: resultsPanel
    };
}

/**
 * Initialise a single fluid-code-box textarea: size it, wrap it, and wire
 * up its Run button.
 * @param {HTMLTextAreaElement} textarea   A textarea with class `fluid-code-box` that should be turned into a runnable code panel.
 */
function initBox(textarea) {
    // Trim a single leading/trailing newline that often comes from authoring
    // the textarea content on its own lines in the source HTML.
    const raw = textarea.value.replace(/^\n/, "").replace(/\n$/, "");
    textarea.value = raw;
    textarea.setAttribute("rows", String(countLines(raw)));
    textarea.setAttribute("cols", "80");

    const parts = buildLayout(textarea);
    parts.button.addEventListener("click", function () {
        runSource(textarea.value, parts.resultsPanel);
    });
}

/**
 * Find every textarea.fluid-code-box in the document and initialise it.
 */
function initAll() {
    const boxes = document.querySelectorAll("textarea.fluid-code-box");
    Array.prototype.forEach.call(boxes, initBox);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
} else {
    initAll();
}
